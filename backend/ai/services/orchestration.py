"""Full orchestration pipeline for fact-checking
Orchestrates: decomposition → search → extraction → embedding → retrieval → verdict
"""

import logging
import asyncio
import uuid
import re
from typing import Optional, List, Dict, Any
from datetime import datetime
from ai.services.decompose import DecompositionService
from ai.services.search import get_search_service
from ai.services.extract import get_extractor
from ai.services.embedding import get_embedding_pipeline_async
from ai.services.retrieval import get_retriever
from ai.services.verdict import get_verdict_generator
from ai.services.vector_store import get_vector_store

logger = logging.getLogger(__name__)


class FactCheckOrchestrator:
    """Orchestrates the full fact-checking pipeline."""

    STOPWORDS = {
        "the", "and", "that", "with", "from", "this", "have", "into", "they",
        "their", "would", "could", "should", "about", "there", "which", "what",
        "when", "where", "who", "will", "been", "being", "does", "did", "were",
        "them", "then", "than", "because", "explicitly", "officially", "most",
        "many", "much", "such", "some", "your", "after", "before", "within",
        "regardless", "amount",
    }

    DEPTH_SETTINGS = {
        "quick": {
            "num_searches": 3,
            "top_k_evidence": 3,
            "max_urls": 5,
            "batch_size": 3,
            "target_sources": 3,
            "sub_claim_limit": 2,
            "evidence_per_subclaim": 2,
        },
        "standard": {
            "num_searches": 5,
            "top_k_evidence": 5,
            "max_urls": 10,
            "batch_size": 4,
            "target_sources": 5,
            "sub_claim_limit": 3,
            "evidence_per_subclaim": 3,
        },
        "deep": {
            "num_searches": 8,
            "top_k_evidence": 8,
            "max_urls": 18,
            "batch_size": 5,
            "target_sources": 8,
            "sub_claim_limit": 4,
            "evidence_per_subclaim": 4,
        },
    }

    def __init__(self):
        self.decompose_service = DecompositionService()
        self.search_service = get_search_service()
        self.extractor = get_extractor()
        self._embedding_pipeline = None  # lazy-loaded via async-safe getter
        self.retriever = get_retriever()
        self.verdict_gen = get_verdict_generator()
        self.vector_store = get_vector_store("chroma")

    async def _get_embedding_pipeline(self):
        if self._embedding_pipeline is None:
            self._embedding_pipeline = await get_embedding_pipeline_async()
        return self._embedding_pipeline

    async def orchestrate(
        self,
        claim: str,
        claim_id: Optional[str] = None,
        model: str = "openai/gpt-oss-20b",
        api_key: str = "",
        depth: str = "standard",
        research_sources: Optional[List[str]] = None
    ) -> Dict[str, Any]:
        """
        Execute the complete fact-checking pipeline.

        Pipeline:
        1. Decompose claim into sub-claims
        2. Search for evidence (multiple sources)
        3. Extract content from found URLs (trafilatura → Playwright → BS4)
        4. Chunk and embed content
        5. Store embeddings in vector DB
        6. Retrieve relevant evidence
        7. Generate verdict using LLM (chain-of-thought)
        8. Assemble final report
        """
        claim_id = claim_id or str(uuid.uuid4())
        logger.info(f"Starting pipeline for claim {claim_id}: {claim[:80]}...")

        try:
            # Step 1: Decompose claim
            logger.info("Step 1/7: Decomposing claim...")
            decompose_result = await self._decompose_claim(claim, model, api_key)
            sub_claims = decompose_result['sub_claims']
            claim_type = decompose_result.get('claim_type', 'general')
            logger.info(f"Generated {len(sub_claims)} sub-claims (type: {claim_type})")

            depth_settings = self.DEPTH_SETTINGS.get(depth, self.DEPTH_SETTINGS["standard"])
            num_searches = depth_settings["num_searches"]
            top_k_evidence = depth_settings["top_k_evidence"]

            # Step 2: Search for evidence
            logger.info(f"Step 2/7: Searching for evidence ({num_searches} queries)...")
            all_urls = await self._search_for_evidence(
                claim, sub_claims, num_searches, research_sources
            )
            logger.info(f"Found {len(all_urls)} unique URLs")

            # Step 3: Extract content from URLs (3-tier: trafilatura → Playwright → BS4)
            logger.info("Step 3/7: Extracting content from sources...")
            extracted_content = await self._extract_content(all_urls, depth_settings)
            logger.info(f"Extracted content from {len(extracted_content)} sources")

            # Step 4 & 5: Chunk, embed, and store
            logger.info("Step 4/7: Chunking and embedding content...")
            sources_with_chunks = await self._chunk_and_embed(extracted_content, claim_id)

            logger.info("Step 5/7: Storing embeddings in vector database...")
            await self._store_embeddings(sources_with_chunks)

            # Step 6: Retrieve evidence for each sub-claim
            logger.info("Step 6/7: Retrieving relevant evidence...")
            evidence_by_subclaim = await self._retrieve_evidence(
                sub_claims, sources_with_chunks, top_k_evidence,
                depth_settings["sub_claim_limit"]
            )

            # Step 7: Generate verdict — pass ALL evidence, let LLM classify stance
            logger.info("Step 7/7: Generating verdict (chain-of-thought)...")
            verdict = await self._generate_verdict(
                claim, sub_claims, evidence_by_subclaim,
                model, api_key, depth_settings["evidence_per_subclaim"],
            )

            # Assemble final report
            report = self._assemble_report(
                claim_id, claim, sub_claims, evidence_by_subclaim, verdict, depth
            )

            logger.info(f"Pipeline complete. Verdict: {report['verdict']}")

            # Cache the claim embedding for semantic similarity (non-blocking)
            asyncio.create_task(self._cache_claim_embedding(claim, claim_id, report['verdict']))

            return report

        except Exception as e:
            logger.error(f"Pipeline failed: {str(e)}")
            return self._error_report(claim_id, claim, str(e))

    async def _cache_claim_embedding(self, claim: str, claim_id: str, verdict: str) -> None:
        """Cache the claim embedding for semantic similarity after pipeline completion."""
        try:
            ep = await self._get_embedding_pipeline()
            embedding = ep.embedder.embed_text(claim)
            from ai.routers.fact_check import _claim_cache
            for cached in _claim_cache:
                if cached["claim_id"] == claim_id:
                    return
            _claim_cache.append({
                "text": claim,
                "embedding": embedding,
                "claim_id": claim_id,
                "verdict": verdict,
            })
            if len(_claim_cache) > 500:
                _claim_cache.pop(0)
            logger.info(f"Similarity cache updated: {claim_id} (size={len(_claim_cache)})")
        except Exception as e:
            logger.warning(f"Could not cache claim embedding: {e}")

    async def _decompose_claim(self, claim: str, model: str, api_key: str) -> Dict:
        """Step 1: Decompose claim into sub-claims."""
        try:
            result = await DecompositionService.decompose(claim, model, api_key)
            return result
        except Exception as e:
            logger.warning(f"Decomposition failed: {str(e)}")
            return {
                'original_claim': claim,
                'sub_claims': [
                    {
                        'id': 'sc_1',
                        'text': claim,
                        'type': 'factual',
                        'importance': 10
                    }
                ],
                'complexity': 'complex',
                'claim_type': 'general'
            }

    async def _search_for_evidence(
        self,
        claim: str,
        sub_claims: List[Dict],
        num_searches: int,
        research_sources: Optional[List[str]]
    ) -> List[str]:
        """Step 2: Search for evidence with diversified queries."""
        search_queries = self._build_search_queries(claim, sub_claims, num_searches)

        ordered_urls: List[str] = []
        seen_urls = set()

        # Execute searches in parallel
        tasks = [
            self.search_service.search(query=query, num_results=num_searches)
            for query in search_queries[:num_searches]
        ]

        results = await asyncio.gather(*tasks, return_exceptions=True)

        for result in results:
            if isinstance(result, Exception):
                logger.warning(f"Search error: {str(result)}")
                continue

            if hasattr(result, 'results'):
                for item in result.results:
                    if item.url and item.url not in seen_urls:
                        seen_urls.add(item.url)
                        ordered_urls.append(item.url)

        return ordered_urls

    def _build_search_queries(
        self,
        claim: str,
        sub_claims: List[Dict],
        num_searches: int,
    ) -> List[str]:
        """
        Build diversified search queries:
        - Original claim
        - Each sub-claim
        - Fact-check queries
        - Counter-evidence queries
        """
        raw_queries = []

        # Original claim and variations
        normalized_claim = self._normalize_search_query(claim)
        if normalized_claim:
            raw_queries.append(normalized_claim)
            raw_queries.append(f"{normalized_claim} fact check")
            raw_queries.append(f"is it true that {normalized_claim}")

        # Sub-claim specific queries
        for sc in sub_claims[:5]:
            sc_text = self._normalize_search_query(sc.get('text', ''))
            if not sc_text:
                continue
            raw_queries.append(sc_text)
            raw_queries.append(f"{sc_text} evidence research")

        # Dedup
        seen = set()
        deduped = []
        for query in raw_queries:
            key = query.lower().strip()
            if key not in seen:
                seen.add(key)
                deduped.append(query)

        return deduped[:max(num_searches, 5)]

    def _normalize_search_query(self, query: str) -> str:
        """Expand abbreviations and clean up query for web search."""
        normalized = query.strip()
        replacements = {
            "U.S.": "United States",
            "U.S": "United States",
            "Fed": "Federal Reserve",
            "SCOTUS": "Supreme Court of the United States",
            "WHO": "World Health Organization",
            "CDC": "Centers for Disease Control",
            "FDA": "Food and Drug Administration",
        }
        for source, target in replacements.items():
            normalized = normalized.replace(source, target)

        normalized = re.sub(r"[\"'`]", "", normalized)
        normalized = re.sub(r"[^A-Za-z0-9\s:/-]", " ", normalized)
        normalized = re.sub(r"\s+", " ", normalized).strip()
        return normalized

    async def _extract_content(self, urls: List[str], depth_settings: Dict[str, int]) -> List[Dict]:
        """Step 3: Extract content from URLs (3-tier: trafilatura → Playwright → BS4)."""
        extracted: List[Dict] = []
        batch_size = depth_settings["batch_size"]
        target_sources = depth_settings["target_sources"]
        max_urls = depth_settings["max_urls"]

        for start in range(0, min(len(urls), max_urls), batch_size):
            batch = urls[start:start + batch_size]
            batch_results = await self.extractor.extract_from_urls(batch)
            extracted.extend(batch_results)
            if len(extracted) >= target_sources:
                break

        return extracted

    async def _chunk_and_embed(self, sources: List[Dict], claim_id: str) -> List[Dict]:
        """Steps 4&5: Chunk content and generate embeddings."""
        sources_with_chunks = []

        ep = await self._get_embedding_pipeline()
        tasks = [
            ep.process(
                text=source['text'],
                source_id=source['source'],
                claim_id=claim_id
            )
            for source in sources
        ]

        # Process sequentially to prevent OOM on small instances (1GB RAM)
        # Concurrent ONNX inference spikes memory too much
        all_chunks = []
        for task in tasks:
            try:
                result = await task
                all_chunks.append(result)
            except Exception as e:
                all_chunks.append(e)

        for source, chunks in zip(sources, all_chunks):
            if isinstance(chunks, Exception):
                logger.warning(f"Embedding error for {source['source']}: {str(chunks)}")
                continue

            sources_with_chunks.append({
                'source': source,
                'chunks': chunks
            })

        return sources_with_chunks

    async def _store_embeddings(self, sources_with_chunks: List[Dict]) -> None:
        """Store embeddings in vector database."""
        all_chunks = []

        for item in sources_with_chunks:
            for chunk in item['chunks']:
                chunk_dict = {
                    'id': chunk.id,
                    'text': chunk.text,
                    'embedding': chunk.embedding,
                    'source_id': chunk.source_id,
                    'claim_id': chunk.claim_id,
                    'metadata': {
                        'source_url': item['source'].get('source', ''),
                        'source_title': item['source'].get('title', '')
                    }
                }
                all_chunks.append(chunk_dict)

        if all_chunks:
            await self.vector_store.add_chunks(all_chunks)

    async def _retrieve_evidence(
        self,
        sub_claims: List[Dict],
        sources_with_chunks: List[Dict],
        top_k: int,
        sub_claim_limit: int,
    ) -> Dict[str, List]:
        """Step 6: Retrieve evidence for each sub-claim."""
        evidence_by_subclaim = {}

        # Flatten all chunks
        all_chunks = []
        for item in sources_with_chunks:
            all_chunks.extend(item['chunks'])

        for sub_claim in sub_claims[:sub_claim_limit]:
            query = sub_claim.get('text', '')

            try:
                evidence = await self.retriever.retrieve(
                    query=query,
                    chunks=[{
                        'id': c.id,
                        'text': c.text,
                        'source_id': c.source_id,
                        'embedding': c.embedding
                    } for c in all_chunks],
                    top_k=top_k
                )

                evidence_by_subclaim[sub_claim['id']] = evidence
            except Exception as e:
                logger.warning(f"Retrieval failed for sub-claim: {str(e)}")
                evidence_by_subclaim[sub_claim['id']] = []

        return evidence_by_subclaim

    async def _generate_verdict(
        self,
        claim: str,
        sub_claims: List[Dict],
        evidence_by_subclaim: Dict[str, List],
        model: str,
        api_key: str,
        evidence_per_subclaim: int,
    ) -> Dict:
        """
        Step 7: Generate verdict.

        IMPORTANT: Pass ALL evidence to the LLM. Do NOT pre-classify stance.
        The LLM determines what supports vs contradicts the claim.
        """
        all_evidence = []
        seen_texts = set()
        sub_claim_map = {sc["id"]: sc.get("text", "") for sc in sub_claims}

        for sc_id, evidence_list in evidence_by_subclaim.items():
            query_text = sub_claim_map.get(sc_id, claim)
            for evidence in evidence_list[:evidence_per_subclaim]:
                # Check basic relevance
                if not self._evidence_matches_query(query_text, evidence):
                    continue

                # Dedup by text content
                text_key = evidence.text[:100].lower().strip()
                if text_key in seen_texts:
                    continue
                seen_texts.add(text_key)

                all_evidence.append({
                    'text': evidence.text,
                    'source': evidence.source_id,
                    'relevance': evidence.relevance_score
                })

        # Generate verdict — LLM classifies stance, not us
        try:
            verdict = await self.verdict_gen.generate_verdict(
                claim=claim,
                sub_claims=[sc['text'] for sc in sub_claims],
                supporting_evidence=all_evidence,  # All evidence passed together
                contradicting_evidence=[],  # LLM does stance classification
                missing_context=[],
                model=model,
                api_key=api_key
            )
            return verdict
        except Exception as e:
            logger.error(f"Verdict generation failed: {str(e)}")
            return {
                'verdict': 'UNVERIFIABLE',
                'confidence': 0.0,
                'explanation': str(e),
                'key_points': [],
                'citations': []
            }

    def _evidence_matches_query(self, query: str, evidence: Any) -> bool:
        """Require minimal lexical alignment before using evidence."""
        query_terms = self._extract_relevance_terms(query)
        if not query_terms:
            return True

        haystack = f"{getattr(evidence, 'text', '')} {getattr(evidence, 'source_id', '')}".lower()
        overlap = sum(1 for term in query_terms if term in haystack)
        return overlap >= min(2, len(query_terms))

    def _extract_relevance_terms(self, text: str) -> List[str]:
        terms = re.findall(r"[a-z0-9]+", text.lower())
        unique_terms = []
        for term in terms:
            if len(term) < 4 or term in self.STOPWORDS:
                continue
            if term not in unique_terms:
                unique_terms.append(term)
        return unique_terms[:8]

    def _assemble_report(
        self,
        claim_id: str,
        claim: str,
        sub_claims: List[Dict],
        evidence_by_subclaim: Dict[str, List],
        verdict: Dict,
        depth: str,
    ) -> Dict:
        """Assemble the final fact-check report."""
        sources = set()
        for evidence_list in evidence_by_subclaim.values():
            for evidence in evidence_list:
                sources.add(evidence.source_id)

        # Augment sub_claims with evidence and verdicts for the UI
        augmented_sub_claims = []
        overall_verdict = verdict.get('verdict', 'UNVERIFIABLE')
        overall_confidence = verdict.get('confidence', 0.0)

        for sc in sub_claims:
            sc_id = sc.get('id', '')
            sc_evidence_list = evidence_by_subclaim.get(sc_id, [])
            
            # Format evidence for the frontend UI
            formatted_evidence = []
            for ev in sc_evidence_list[:3]:  # Top 3 pieces of evidence per subclaim
                formatted_evidence.append({
                    'id': ev.chunk_id,
                    'excerpt': ev.text,
                    'source': ev.source_id,
                    'sourceUrl': ev.source_id,
                    'relevance': ev.relevance_score
                })
                
            augmented_sc = {
                **sc,
                'verdict': overall_verdict,
                'confidence': overall_confidence,
                'evidence': formatted_evidence
            }
            augmented_sub_claims.append(augmented_sc)

        report = {
            'claim_id': claim_id,
            'claim_text': claim,
            'verdict': verdict.get('verdict', 'UNVERIFIABLE'),
            'confidence': verdict.get('confidence', 0.0),
            'explanation': verdict.get('explanation', ''),
            'key_points': verdict.get('key_points', []),
            'citations': verdict.get('citations', []),
            'sub_claims': augmented_sub_claims,
            'evidence_summary': {
                'total_sources': len(sources),
                'sub_claims_analyzed': len(sub_claims),
                'evidence_count': sum(len(e) for e in evidence_by_subclaim.values())
            },
            'research_depth': depth,
            'generated_at': datetime.now().isoformat()
        }

        return report

    def _error_report(self, claim_id: str, claim: str, error: str) -> Dict:
        """Create error report."""
        return {
            'claim_id': claim_id,
            'claim_text': claim,
            'verdict': 'UNVERIFIABLE',
            'confidence': 0.0,
            'explanation': f'Error: {error}',
            'key_points': [],
            'citations': [],
            'sub_claims': [],
            'evidence_summary': {
                'total_sources': 0,
                'sub_claims_analyzed': 0,
                'evidence_count': 0
            },
            'generated_at': datetime.now().isoformat(),
            'error': error
        }


# Global orchestrator instance
_orchestrator = None


def get_orchestrator() -> FactCheckOrchestrator:
    """Get global orchestrator instance."""
    global _orchestrator
    if _orchestrator is None:
        _orchestrator = FactCheckOrchestrator()
    return _orchestrator
