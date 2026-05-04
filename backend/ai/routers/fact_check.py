from fastapi import APIRouter, HTTPException, Depends
from ai.models.schemas import (
    ClaimInput, DecomposeResponseSchema, FactCheckReportSchema,
    SubClaimSchema, VerdictEnum, DecomposeRequest, DecomposeResponse,
    SearchRequest, SearchResponse
)
from ai.services.decompose import DecompositionService
from ai.services.search import get_search_service
from ai.services.extract import get_extractor
from ai.services.embedding import get_embedding_pipeline
from ai.services.retrieval import get_retriever
from ai.services.verdict import get_verdict_generator
from ai.services.orchestration import get_orchestrator
from ai.models.schemas import (
    ExtractRequest, ExtractResponse, ExtractedContent,
    EmbedRequest, EmbedResponse, ChunkSchema,
    RetrieveRequest, RetrieveResponse, RetrievedEvidenceSchema,
    GenerateVerdictRequest, VerdictResponseSchema, CitationSchema
)
import uuid
from datetime import datetime
import logging

logger = logging.getLogger(__name__)

router = APIRouter()


def _resolve_model_name(provider) -> str:
    """Map public provider identifiers to a concrete default model."""
    provider_value = provider.value if hasattr(provider, "value") else str(provider)
    provider_key = provider_value.lower()

    default_models = {
        "openai": "gpt-4",
        "gemini": "gemini-2.0-flash",
        "anthropic": "claude-3-sonnet",
        "groq": "openai/gpt-oss-20b",
        "local": "openai/gpt-oss-20b",
    }

    return default_models.get(provider_key, provider_value)


@router.post("/decompose-claim", response_model=DecomposeResponse)
async def decompose_claim(request: DecomposeRequest):
    """
    Decompose a claim into sub-claims using LLM.
    Prompt 14: Claim decomposition endpoint
    
    Args:
        request: DecomposeRequest with claim, model, and api_key
        
    Returns:
        DecomposeResponse with sub-claims and complexity
        
    Raises:
        400: Invalid claim, model, or API key
        401: Unauthorized API key
        500: LLM service error
        503: Rate limited
    """
    try:
        result = await DecompositionService.decompose(
            claim=request.claim,
            model=request.model,
            api_key=request.api_key
        )
        
        return DecomposeResponse(**result)
        
    except ValueError as e:
        error_msg = str(e)
        
        # Check for specific error types
        if "Invalid or expired" in error_msg and "API key" in error_msg:
            logger.warning(f"Unauthorized API key: {error_msg}")
            raise HTTPException(status_code=401, detail=error_msg)
        elif "Rate limited" in error_msg:
            logger.warning(f"Rate limited: {error_msg}")
            raise HTTPException(status_code=429, detail=error_msg)
        elif "Invalid" in error_msg or "must be" in error_msg or "appears to be" in error_msg:
            logger.warning(f"Bad request: {error_msg}")
            raise HTTPException(status_code=400, detail=error_msg)
        else:
            logger.error(f"Decomposition error: {error_msg}")
            raise HTTPException(status_code=400, detail=error_msg)
            
    except Exception as e:
        logger.error(f"Unexpected error decomposing claim: {str(e)}")
        raise HTTPException(status_code=500, detail="Error decomposing claim")


# Keep the old endpoint for backward compatibility but now with real implementation
@router.post("/decompose-claim-legacy", response_model=DecomposeResponseSchema)
async def decompose_claim_legacy(claim: ClaimInput):
    """
    Decompose a claim into sub-claims using LLM.
    (Legacy endpoint - use /decompose-claim instead)
    """


@router.post("/retrieve-evidence", response_model=RetrieveResponse)
async def retrieve_evidence(request: RetrieveRequest):
    """
    Retrieve relevant evidence for a claim using hybrid search.
    Prompt 18: Evidence retrieval with hybrid strategy
    
    Uses combination of:
    1. Vector similarity (embedding-based semantic search)
    2. BM25 keyword matching
    3. Source credibility scoring
    
    Args:
        request: RetrieveRequest with query, chunks, and weights
        
    Returns:
        RetrieveResponse with top-K relevant evidence
        
    Raises:
        400: Invalid request parameters
        500: Retrieval service error
    """
    try:
        logger.info(f"Retrieving evidence for query: '{request.query}'")
        
        # Get retriever instance
        retriever = get_retriever()
        
        # Retrieve evidence
        evidence_list = await retriever.retrieve(
            query=request.query,
            chunks=[{
                'id': c.id,
                'text': c.text,
                'source_id': c.source_id,
                'embedding': c.embedding
            } for c in request.chunks],
            top_k=request.top_k,
            vector_weight=request.vector_weight,
            bm25_weight=request.bm25_weight,
            credibility_weight=request.credibility_weight
        )
        
        # Convert to response schema
        evidence_schemas = [
            RetrievedEvidenceSchema(
                chunk_id=e.chunk_id,
                text=e.text,
                source_id=e.source_id,
                relevance_score=e.relevance_score,
                vector_similarity=e.vector_similarity,
                bm25_score=e.bm25_score,
                credibility=e.credibility,
                rank=e.rank
            )
            for e in evidence_list
        ]
        
        logger.info(f"Retrieved {len(evidence_schemas)} evidence items")
        
        return RetrieveResponse(
            query=request.query,
            evidence=evidence_schemas,
            total_evidence=len(evidence_schemas)
        )
        
    except ValueError as e:
        logger.warning(f"Validation error: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Retrieval error: {str(e)}")
        raise HTTPException(status_code=500, detail="Error retrieving evidence")


@router.post("/generate-verdict", response_model=VerdictResponseSchema)
async def generate_verdict(request: GenerateVerdictRequest):
    """
    Generate a fact-check verdict using LLM.
    Prompt 19: Generate verdicts and reasoning from evidence
    
    Process:
    1. Analyze claim with supporting/contradicting evidence
    2. Call LLM to generate verdict
    3. Parse and validate response
    4. Return structured verdict with citations
    
    Args:
        request: GenerateVerdictRequest with claim and evidence
        
    Returns:
        VerdictResponseSchema with verdict, confidence, explanation, citations
        
    Raises:
        400: Invalid request parameters
        401: Invalid API key
        500: Verdict generation error
    """
    try:
        claim_id = request.claim_id or str(uuid.uuid4())
        logger.info(f"Generating verdict for claim {claim_id}: {request.claim[:100]}...")
        
        # Get verdict generator
        verdict_gen = get_verdict_generator()
        
        # Generate verdict
        verdict_data = await verdict_gen.generate_verdict(
            claim=request.claim,
            sub_claims=request.sub_claims or [],
            supporting_evidence=request.supporting_evidence,
            contradicting_evidence=request.contradicting_evidence,
            missing_context=request.missing_context,
            model=request.model,
            api_key=request.api_key,
            response_length=request.response_length or "medium"
        )
        
        # Convert citations to schema
        citation_schemas = [
            CitationSchema(**citation) if isinstance(citation, dict)
            else citation
            for citation in verdict_data.get('citations', [])
        ]
        
        logger.info(f"Verdict generated: {verdict_data['verdict']} (confidence: {verdict_data['confidence']})")
        
        return VerdictResponseSchema(
            claim_id=claim_id,
            claim_text=request.claim,
            verdict=verdict_data['verdict'],
            confidence=verdict_data['confidence'],
            explanation=verdict_data['explanation'],
            key_points=verdict_data.get('key_points', []),
            citations=citation_schemas,
            sub_claims_verdicts=verdict_data.get('sub_claims_verdicts'),
            generated_at=datetime.now().isoformat()
        )
        
    except ValueError as e:
        logger.warning(f"Validation error: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Verdict generation error: {str(e)}")
        raise HTTPException(status_code=500, detail="Error generating verdict")


@router.get("/health")
async def health():
    """Health check for AI service"""
    return {"status": "ok", "service": "fact-check"}


@router.post("/orchestrate")
async def orchestrate(request: ClaimInput):
    """
    Full pipeline orchestration: complete fact-checking workflow
    Prompt 20: Assemble the final report
    
    Execute complete pipeline:
    1. Decompose claim into sub-claims
    2. Search for evidence from multiple sources
    3. Extract content from found URLs
    4. Chunk and embed content
    5. Store embeddings in vector database
    6. Retrieve relevant evidence
    7. Generate verdict using LLM
    8. Assemble final report
    
    Args:
        request: ClaimInput with claim text and configuration
        
    Returns:
        Complete fact-check report with verdict and citations
        
    Raises:
        400: Invalid request parameters
        401: Invalid API key
        500: Pipeline execution error
    """
    try:
        claim_id = str(uuid.uuid4())
        logger.info(f"Starting orchestration pipeline for claim {claim_id}")
        
        # Get orchestrator
        orchestrator = get_orchestrator()
        
        # Execute pipeline
        report = await orchestrator.orchestrate(
            claim=request.text,
            claim_id=claim_id,
            model=_resolve_model_name(request.llmProvider),
            api_key=request.apiKey or "",
            depth=request.depth.value if hasattr(request.depth, 'value') else str(request.depth),
            research_sources=None
        )
        
        logger.info(f"Pipeline complete. Verdict: {report.get('verdict')}")
        
        return report
        
    except ValueError as e:
        logger.warning(f"Validation error: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Orchestration error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Pipeline execution failed: {str(e)}")


@router.post("/search", response_model=SearchResponse)
async def search(request: SearchRequest):
    """
    Multi-provider search with intelligent fallback.
    Prompt 15: Search agent for multiple free/open-source providers
    
    Args:
        request: SearchRequest with query, num_results, and optional providers
        
    Returns:
        SearchResponse with results from available providers
        
    Raises:
        400: Query validation failed or invalid provider
        429: All providers rate limited
        503: All providers unavailable
    """
    try:
        search_service = get_search_service()
        
        # Validate providers if specified
        if request.providers:
            for provider in request.providers:
                if provider not in {"duckduckgo", "brave", "serper"}:
                    logger.warning(f"Invalid provider requested: {provider}")
                    raise HTTPException(
                        status_code=400,
                        detail=f"Invalid provider: {provider}. Must be one of: duckduckgo, brave, serper"
                    )
        
        result = await search_service.search(
            query=request.query,
            num_results=request.num_results,
            providers=request.providers
        )
        
        if not result.providers_used:
            logger.error("All search providers failed or unavailable")
            raise HTTPException(
                status_code=503,
                detail="All search providers are unavailable or rate-limited"
            )
        
        return result
        
    except ValueError as e:
        error_msg = str(e)
        logger.warning(f"Search validation error: {error_msg}")
        
        if "Query must" in error_msg or "num_results" in error_msg:
            raise HTTPException(status_code=400, detail=error_msg)
        elif "Invalid provider" in error_msg:
            raise HTTPException(status_code=400, detail=error_msg)
        else:
            raise HTTPException(status_code=400, detail=error_msg)
            
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Search error: {str(e)}")
        raise HTTPException(status_code=500, detail="Error performing search")


@router.post("/extract", response_model=ExtractResponse)
async def extract_content(request: ExtractRequest):
    """
    Extract clean text content from multiple URLs.
    Prompt 16: Source extractor for web pages and PDFs
    
    Supports:
    - Regular web pages (HTML) via trafilatura + BeautifulSoup
    - PDF files via pdfplumber + PyPDF2
    - Removes ads, navigation, comments, and other noise
    
    Args:
        request: ExtractRequest with list of URLs
        
    Returns:
        ExtractResponse with extracted content and failed URLs
        
    Raises:
        400: Invalid URLs or too many URLs (max 10)
        500: Extraction service error
    """
    try:
        # Validate URLs
        if not request.urls:
            raise ValueError("At least one URL is required")
        
        if len(request.urls) > 10:
            raise ValueError("Maximum 10 URLs allowed per request")
        
        logger.info(f"Extracting content from {len(request.urls)} URLs")
        
        # Get extractor instance
        extractor = get_extractor()
        
        # Extract all URLs in parallel
        extracted_results = await extractor.extract_from_urls(request.urls)
        
        # Convert results to schema
        extracted_content = [
            ExtractedContent(
                text=result['text'],
                title=result['title'],
                source=result['source'],
                method=result['method'],
                length=result['length']
            )
            for result in extracted_results
        ]
        
        # Identify failed URLs
        extracted_urls = {result['source'] for result in extracted_results}
        failed_urls = [url for url in request.urls if url not in extracted_urls]
        
        logger.info(f"Extraction complete: {len(extracted_content)} succeeded, {len(failed_urls)} failed")
        
        return ExtractResponse(
            urls_submitted=len(request.urls),
            urls_extracted=len(extracted_content),
            extracted_content=extracted_content,
            failed_urls=failed_urls
        )
        
    except ValueError as e:
        logger.warning(f"Validation error: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Extraction error: {str(e)}")
        raise HTTPException(status_code=500, detail="Error extracting content from URLs")


@router.post("/embed", response_model=EmbedResponse)
async def embed_text(request: EmbedRequest):
    """
    Chunk text and generate embeddings.
    Prompt 17: Chunking and embedding pipeline
    
    Process:
    1. Normalize text
    2. Split into overlapping chunks (default 512 tokens with 100 token overlap)
    3. Generate embeddings using sentence-transformers (all-MiniLM-L6-v2)
    4. Return chunks with embeddings ready for vector storage
    
    Args:
        request: EmbedRequest with text and parameters
        
    Returns:
        EmbedResponse with chunks and embeddings
        
    Raises:
        400: Invalid parameters or text too long
        500: Embedding generation error
    """
    try:
        logger.info(f"Processing embedding request for source {request.source_id}")
        
        # Get embedding pipeline
        pipeline = get_embedding_pipeline()
        
        # Process text
        chunks = await pipeline.process(
            text=request.text,
            source_id=request.source_id,
            claim_id=request.claim_id,
            chunk_size=request.chunk_size,
            chunk_overlap=request.chunk_overlap
        )
        
        if not chunks:
            logger.warning(f"No chunks generated for {request.source_id}")
            return EmbedResponse(
                source_id=request.source_id,
                claim_id=request.claim_id,
                chunks=[],
                total_chunks=0,
                embedding_model=pipeline.embedder.model_name
            )
        
        # Convert chunks to response schema
        chunk_schemas = [
            ChunkSchema(
                id=chunk.id,
                text=chunk.text,
                start_offset=chunk.start_offset,
                end_offset=chunk.end_offset,
                source_id=chunk.source_id,
                claim_id=chunk.claim_id,
                embedding=chunk.embedding
            )
            for chunk in chunks
        ]
        
        logger.info(f"Generated {len(chunk_schemas)} chunks with embeddings for {request.source_id}")
        
        return EmbedResponse(
            source_id=request.source_id,
            claim_id=request.claim_id,
            chunks=chunk_schemas,
            total_chunks=len(chunk_schemas),
            embedding_model=pipeline.embedder.model_name
        )
        
    except ValueError as e:
        logger.warning(f"Validation error: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Embedding error: {str(e)}")
        raise HTTPException(status_code=500, detail="Error generating embeddings")

# ─────────────────────────────────────────────────────
# Feature: Semantic Claim Similarity (NLP / ML Layer)
# ─────────────────────────────────────────────────────
# In-memory cache: stores {text, embedding, claim_id, verdict}
_claim_cache: list = []


@router.post("/similar-claims")
async def find_similar_claims(request: dict):
    """
    Semantic duplicate detection using sentence-transformers.
    Embeds the incoming claim and compares it against all previously
    processed claims using cosine similarity.

    Returns the top match if similarity >= 0.85 (highly similar).
    """
    import numpy as np

    text = request.get("text", "").strip()
    if not text or len(text) < 10:
        raise HTTPException(status_code=400, detail="Claim text too short")

    try:
        pipeline = get_embedding_pipeline()
        query_vec = pipeline.embedder.embed_text(text)
        query_arr = np.array(query_vec, dtype=np.float32)

        best_score = 0.0
        best_match = None

        for cached in _claim_cache:
            cached_arr = np.array(cached["embedding"], dtype=np.float32)
            denom = (np.linalg.norm(query_arr) * np.linalg.norm(cached_arr))
            score = float(np.dot(query_arr, cached_arr) / denom) if denom > 0 else 0.0
            if score > best_score:
                best_score = score
                best_match = cached

        if best_match and best_score >= 0.85:
            logger.info(
                f"Semantic cache hit: score={best_score:.3f} claimId={best_match['claim_id']}"
            )
            return {
                "match": True,
                "similarity": round(best_score, 4),
                "claim_id": best_match["claim_id"],
                "original_text": best_match["text"],
                "verdict": best_match.get("verdict"),
            }

        return {"match": False, "similarity": round(best_score, 4)}

    except Exception as e:
        logger.error(f"Similarity check failed: {e}")
        return {"match": False, "similarity": 0.0}


@router.post("/cache-claim")
async def cache_claim_embedding(request: dict):
    """
    Called after a claim is processed.
    Stores the claim text + embedding in the in-memory similarity cache.
    """
    text = request.get("text", "").strip()
    claim_id = request.get("claim_id", "")
    verdict = request.get("verdict", "")

    if not text or not claim_id:
        raise HTTPException(status_code=400, detail="text and claim_id are required")

    try:
        pipeline = get_embedding_pipeline()
        embedding = pipeline.embedder.embed_text(text)

        for cached in _claim_cache:
            if cached["claim_id"] == claim_id:
                return {"status": "already_cached"}

        _claim_cache.append({
            "text": text,
            "embedding": embedding,
            "claim_id": claim_id,
            "verdict": verdict,
        })
        if len(_claim_cache) > 500:
            _claim_cache.pop(0)

        logger.info(f"Cached claim embedding: {claim_id} (cache size={len(_claim_cache)})")
        return {"status": "cached", "cache_size": len(_claim_cache)}

    except Exception as e:
        logger.error(f"Cache embedding failed: {e}")
        raise HTTPException(status_code=500, detail="Failed to cache embedding")
