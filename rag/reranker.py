"""
reranker.py
───────────
Re-rank a list of candidate chunks using the BAAI/bge-reranker-v2-m3
cross-encoder model.

Why two-stage retrieval?
  Stage 1 (vector search) uses fast approximate nearest-neighbour search to
  shortlist ~20 candidates.  Cosine similarity is a good first filter but it
  can miss semantic nuances.

  Stage 2 (reranking) runs a cross-encoder that jointly encodes the *query*
  and each *candidate* together, producing a more accurate relevance score.
  Cross-encoders are slower but they see the full query-document pair.

The reranker returns a float score per pair.  Higher is better (no fixed
range — the raw logit is used directly).
"""

import logging

from sentence_transformers import CrossEncoder

from config import RERANKER_MODEL

logger = logging.getLogger(__name__)

# ─── Singleton ───────────────────────────────────────────────────────────────

_reranker: CrossEncoder | None = None


def get_reranker() -> CrossEncoder:
    """
    Return the cross-encoder reranker, loading it on the first call.

    The model is approximately 1.1 GB.  Loading takes 10–30 seconds on CPU.

    Returns:
        A ready-to-use CrossEncoder instance.
    """
    global _reranker

    if _reranker is None:
        logger.info(f"Loading reranker model: {RERANKER_MODEL}")
        _reranker = CrossEncoder(RERANKER_MODEL)
        logger.info("Reranker model loaded successfully.")

    return _reranker


# ─── Public API ──────────────────────────────────────────────────────────────

def rerank(
    query: str,
    candidates: list[dict],
    top_n: int,
) -> list[dict]:
    """
    Score every candidate against the query and return the top_n results.

    Each candidate dict must have at least a "content" key.  All other keys
    (chunk_id, metadata, etc.) are passed through unchanged.

    Args:
        query:      The user's original search string.
        candidates: List of candidate dicts, each with a "content" field.
        top_n:      How many top-scoring candidates to return.

    Returns:
        A new list of up to top_n dicts, sorted by score descending.
        Each dict gets a "score" key added (float, higher = more relevant).

    Example:
        >>> results = rerank("promotion eligibility", candidates, top_n=5)
        >>> results[0]["score"]   # Highest-scoring chunk
        4.812
    """
    if not candidates:
        return []

    reranker = get_reranker()

    # Build (query, passage) pairs — one pair per candidate.
    pairs = [(query, candidate["content"]) for candidate in candidates]

    # Cross-encoder returns one float score per pair.
    scores: list[float] = reranker.predict(pairs).tolist()

    # Attach the score to each candidate dict (modifying a copy is safer).
    scored_candidates = [
        {**candidate, "score": score}
        for candidate, score in zip(candidates, scores)
    ]

    # Sort descending by score and take the top_n.
    scored_candidates.sort(key=lambda c: c["score"], reverse=True)

    return scored_candidates[:top_n]