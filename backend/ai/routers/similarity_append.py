
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
        query_vec = pipeline.embedder.embed_texts([text])[0]
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
        embedding = pipeline.embedder.embed_texts([text])[0]

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
