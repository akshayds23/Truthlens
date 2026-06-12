"""Evidence retrieval service with hybrid search
Uses: vector similarity + BM25 keyword search + source credibility scoring
"""

import logging
import re
from typing import List, Optional, Dict, Any
from dataclasses import dataclass
from rank_bm25 import BM25Okapi
from ai.services.embedding import get_embedding_pipeline, DEFAULT_EMBEDDING_MODEL

logger = logging.getLogger(__name__)


@dataclass
class RetrievedEvidence:
    """Retrieved evidence chunk with relevance scores."""
    chunk_id: str
    text: str
    source_id: str
    relevance_score: float  # Combined score 0-1
    vector_similarity: float  # 0-1
    bm25_score: float  # 0-1
    credibility: float  # 0-1
    rank: int


class BM25Ranker:
    """Proper BM25 keyword ranker using rank_bm25 library."""

    @staticmethod
    def _tokenize(text: str) -> List[str]:
        """Tokenize text for BM25."""
        text = text.lower()
        text = re.sub(r"[^a-z0-9\s]", " ", text)
        tokens = text.split()
        # Remove very short tokens
        return [t for t in tokens if len(t) > 2]

    def rank_by_keywords(
        self, query: str, documents: List[Dict[str, str]]
    ) -> Dict[str, float]:
        """
        Rank documents by BM25 relevance to query.

        Uses the rank_bm25 library for proper IDF-weighted scoring.

        Args:
            query: Search query
            documents: List of dicts with 'id' and 'text' keys

        Returns:
            Dict mapping document IDs to normalized scores (0-1)
        """
        if not documents:
            return {}

        # Tokenize all documents
        tokenized_docs = [self._tokenize(d.get("text", "")) for d in documents]

        # Handle edge case: all empty docs
        if all(len(td) == 0 for td in tokenized_docs):
            return {d.get("id", ""): 0.0 for d in documents}

        # Build BM25 index
        bm25 = BM25Okapi(tokenized_docs)

        # Score query against all documents
        query_tokens = self._tokenize(query)
        if not query_tokens:
            return {d.get("id", ""): 0.0 for d in documents}

        scores = bm25.get_scores(query_tokens)

        # Normalize to 0-1 range
        max_score = max(scores) if len(scores) > 0 and max(scores) > 0 else 1.0

        return {
            d.get("id", ""): float(s / max_score)
            for d, s in zip(documents, scores)
        }


class SourceCredibilityEstimator:
    """Estimates source credibility based on domain reputation."""

    # Comprehensive domain reputation list (~100 sources)
    DOMAIN_SCORES = {
        # ── Fact-checkers (highest trust for fact-checking) ──
        "snopes.com": 0.95,
        "factcheck.org": 0.95,
        "politifact.com": 0.94,
        "fullfact.org": 0.93,
        "checkyourfact.com": 0.88,
        "truthorfiction.com": 0.88,

        # ── Wire services ──
        "apnews.com": 0.95,
        "reuters.com": 0.95,
        "afp.com": 0.93,

        # ── Major newspapers ──
        "nytimes.com": 0.92,
        "washingtonpost.com": 0.91,
        "theguardian.com": 0.90,
        "wsj.com": 0.91,
        "bbc.com": 0.94,
        "bbc.co.uk": 0.94,
        "economist.com": 0.90,
        "ft.com": 0.90,
        "latimes.com": 0.88,
        "usatoday.com": 0.85,
        "independent.co.uk": 0.87,
        "telegraph.co.uk": 0.86,

        # ── Broadcast news ──
        "cnn.com": 0.85,
        "nbcnews.com": 0.86,
        "cbsnews.com": 0.86,
        "abcnews.go.com": 0.86,
        "pbs.org": 0.90,
        "npr.org": 0.90,

        # ── Science & academic ──
        "nature.com": 0.96,
        "science.org": 0.96,
        "sciencedirect.com": 0.94,
        "thelancet.com": 0.95,
        "nejm.org": 0.96,
        "bmj.com": 0.95,
        "pnas.org": 0.94,
        "cell.com": 0.94,
        "pubmed.ncbi.nlm.nih.gov": 0.95,
        "scholar.google.com": 0.88,
        "arxiv.org": 0.85,
        "researchgate.net": 0.80,
        "sciencedaily.com": 0.85,
        "newscientist.com": 0.85,
        "scientificamerican.com": 0.88,
        "livescience.com": 0.82,

        # ── Reference ──
        "wikipedia.org": 0.82,
        "britannica.com": 0.90,
        "merriam-webster.com": 0.88,

        # ── Government & international orgs ──
        "who.int": 0.93,
        "cdc.gov": 0.93,
        "nih.gov": 0.93,
        "fda.gov": 0.92,
        "epa.gov": 0.90,
        "nasa.gov": 0.95,
        "noaa.gov": 0.92,
        "un.org": 0.90,
        "worldbank.org": 0.90,
        "imf.org": 0.90,
        "europa.eu": 0.88,
        "whitehouse.gov": 0.85,
        "congress.gov": 0.88,
        "supremecourt.gov": 0.90,
        "data.gov": 0.90,
        "census.gov": 0.92,
        "bls.gov": 0.92,
        "nhs.uk": 0.92,

        # ── Economics / Finance ──
        "bloomberg.com": 0.88,
        "cnbc.com": 0.84,
        "marketwatch.com": 0.83,
        "investopedia.com": 0.82,

        # ── Technology ──
        "wired.com": 0.84,
        "arstechnica.com": 0.85,
        "techcrunch.com": 0.82,
        "theverge.com": 0.82,

        # ── Known lower-credibility (opinion-heavy, tabloid) ──
        "dailymail.co.uk": 0.45,
        "nypost.com": 0.50,
        "thesun.co.uk": 0.40,
        "buzzfeed.com": 0.55,
        "infowars.com": 0.15,
        "naturalnews.com": 0.15,
        "breitbart.com": 0.35,
    }

    @staticmethod
    def estimate_credibility(source_id: str) -> float:
        """
        Estimate source credibility based on domain.
        Returns 0-1 credibility score.
        """
        try:
            if source_id.startswith(("http://", "https://")):
                domain = source_id.split("//")[1].split("/")[0]
                domain = domain.replace("www.", "")
            else:
                domain = source_id

            # Check exact domain match
            if domain in SourceCredibilityEstimator.DOMAIN_SCORES:
                return SourceCredibilityEstimator.DOMAIN_SCORES[domain]

            # Check if domain ends with any known domain
            for known_domain, score in SourceCredibilityEstimator.DOMAIN_SCORES.items():
                if domain.endswith(known_domain):
                    return score

            # Academic domains
            if domain.endswith((".edu", ".ac.uk", ".edu.au")):
                return 0.85

            # Government domains
            if domain.endswith((".gov", ".gov.uk", ".gov.au", ".mil")):
                return 0.88

            # Organization domains
            if domain.endswith(".org"):
                return 0.65

            # Default for unknown domains
            return 0.50

        except Exception as e:
            logger.warning(f"Error estimating credibility for {source_id}: {e}")
            return 0.50


class EvidenceRetriever:
    """Retrieves relevant evidence using hybrid search."""

    def __init__(self, embedding_model: Optional[str] = None):
        # Reuse the shared singleton embedder — do NOT create a new EmbeddingGenerator
        # (loading a second ONNX model on a 1GB machine causes OOM crashes)
        self.embedder = get_embedding_pipeline(embedding_model).embedder
        self.bm25_ranker = BM25Ranker()
        self.credibility_estimator = SourceCredibilityEstimator()

    async def retrieve(
        self,
        query: str,
        chunks: List[Dict[str, Any]],
        top_k: int = 5,
        vector_weight: float = 0.5,
        bm25_weight: float = 0.3,
        credibility_weight: float = 0.2
    ) -> List[RetrievedEvidence]:
        """
        Retrieve top evidence chunks using hybrid ranking.

        Combines:
        1. Vector similarity (semantic search)
        2. BM25 keyword matching (proper IDF-weighted)
        3. Source credibility scoring (100+ domains)
        """
        if not chunks:
            logger.warning("No chunks provided for retrieval")
            return []

        logger.info(f"Retrieving evidence for: '{query[:80]}' from {len(chunks)} chunks")

        # Normalize weights
        total_weight = vector_weight + bm25_weight + credibility_weight
        if total_weight == 0:
            vector_weight, bm25_weight, credibility_weight = 0.5, 0.3, 0.2
            total_weight = 1.0

        vector_weight /= total_weight
        bm25_weight /= total_weight
        credibility_weight /= total_weight

        # Step 1: Vector similarity
        query_embedding = self.embedder.embed_text(query)
        vector_scores = self._compute_vector_similarity(query_embedding, chunks)

        # Step 2: BM25 keyword search (proper implementation)
        bm25_scores = self.bm25_ranker.rank_by_keywords(
            query,
            [{"id": c.get("id", ""), "text": c.get("text", "")} for c in chunks],
        )

        # Step 3: Credibility scores
        credibility_scores = {
            c.get("id", ""): self.credibility_estimator.estimate_credibility(
                c.get("source_id", "")
            )
            for c in chunks
        }

        # Step 4: Combine scores
        combined_results = []
        for chunk in chunks:
            chunk_id = chunk.get("id", "")
            source_id = chunk.get("source_id", "")

            vector_sim = vector_scores.get(chunk_id, 0.0)
            bm25 = bm25_scores.get(chunk_id, 0.0)
            cred = credibility_scores.get(chunk_id, 0.5)

            combined_score = (
                vector_sim * vector_weight
                + bm25 * bm25_weight
                + cred * credibility_weight
            )

            combined_results.append({
                "chunk_id": chunk_id,
                "text": chunk.get("text", ""),
                "source_id": source_id,
                "combined_score": combined_score,
                "vector_sim": vector_sim,
                "bm25": bm25,
                "credibility": cred,
            })

        # Sort by combined score (descending)
        combined_results.sort(key=lambda x: x["combined_score"], reverse=True)

        # Take top K
        top_results = combined_results[:top_k]

        evidence_list = [
            RetrievedEvidence(
                chunk_id=result["chunk_id"],
                text=result["text"],
                source_id=result["source_id"],
                relevance_score=result["combined_score"],
                vector_similarity=result["vector_sim"],
                bm25_score=result["bm25"],
                credibility=result["credibility"],
                rank=i + 1,
            )
            for i, result in enumerate(top_results)
        ]

        logger.info(f"Retrieved {len(evidence_list)} evidence chunks")
        return evidence_list

    def _compute_vector_similarity(
        self,
        query_embedding: List[float],
        chunks: List[Dict[str, Any]],
    ) -> Dict[str, float]:
        """Compute cosine similarity between query and chunk embeddings."""
        scores = {}

        for chunk in chunks:
            chunk_id = chunk.get("id", "")
            chunk_embedding = chunk.get("embedding", None)

            if not chunk_embedding:
                scores[chunk_id] = 0.0
                continue

            similarity = self._cosine_similarity(query_embedding, chunk_embedding)
            scores[chunk_id] = max(0, similarity)

        return scores

    @staticmethod
    def _cosine_similarity(vec1: List[float], vec2: List[float]) -> float:
        """Compute cosine similarity between two vectors."""
        if not vec1 or not vec2 or len(vec1) != len(vec2):
            return 0.0

        dot_product = sum(a * b for a, b in zip(vec1, vec2))
        mag1 = sum(a * a for a in vec1) ** 0.5
        mag2 = sum(b * b for b in vec2) ** 0.5

        if mag1 == 0 or mag2 == 0:
            return 0.0

        return dot_product / (mag1 * mag2)


# Global instance
_retriever = None


def get_retriever(embedding_model: Optional[str] = None) -> EvidenceRetriever:
    """Get global evidence retriever instance."""
    global _retriever
    if _retriever is None:
        _retriever = EvidenceRetriever(embedding_model)
    return _retriever
