"""
embedder.py
───────────
Generate dense vector embeddings using BAAI/bge-base-en-v1.5.

Key points:
  • The model is loaded once (lazy singleton) and reused for all calls.
  • Document chunks and user queries are encoded differently:
      - Chunks  → encoded as-is (no prefix)
      - Queries → prefixed with QUERY_INSTRUCTION as recommended by BAAI
  • Embeddings are L2-normalised so cosine similarity equals dot product.
  • Batching is used for efficiency when encoding many chunks at once.

The model will be downloaded from HuggingFace Hub on first use (~1.4 GB).
Subsequent starts load it from the local cache (~3–5 seconds on CPU).
"""

import logging

from sentence_transformers import SentenceTransformer

from config import EMBEDDING_MODEL, QUERY_INSTRUCTION

logger = logging.getLogger(__name__)

# ─── Singleton ───────────────────────────────────────────────────────────────

# The model is stored here after first load.  Using a module-level variable
# means we never load it more than once per process.
_embedding_model: SentenceTransformer | None = None


def get_embedding_model() -> SentenceTransformer:
    """
    Return the embedding model, loading it on the first call.

    The model is approximately 400-500 MB and takes 20–60 seconds to load on CPU.
    If a CUDA-capable GPU is present, SentenceTransformer uses it automatically.

    Returns:
        A ready-to-use SentenceTransformer instance.
    """
    global _embedding_model

    if _embedding_model is None:
        logger.info(f"Loading embedding model: {EMBEDDING_MODEL}")
        _embedding_model = SentenceTransformer(EMBEDDING_MODEL)
        logger.info("Embedding model loaded successfully.")

    return _embedding_model


# ─── Public API ──────────────────────────────────────────────────────────────

def embed_texts(texts: list[str], batch_size: int = 64) -> list[list[float]]:
    """
    Generate normalised embeddings for a list of document chunks.

    Use this function when indexing handbook content (NOT for queries —
    see embed_query for that).

    Args:
        texts:      List of strings to embed.  Empty strings should be
                    filtered out before calling this function.
        batch_size: How many texts to encode in a single forward pass.
                    Reduce if you encounter out-of-memory errors.

    Returns:
        A list of float vectors, one per input text.
        Each vector has length EMBEDDING_DIMENSION (768).
    """
    model = get_embedding_model()

    # encode() returns a numpy array; .tolist() converts it to plain Python lists
    # so the values are JSON-serialisable and Pinecone-compatible.
    embeddings = model.encode(
        texts,
        batch_size=batch_size,
        normalize_embeddings=True,   # L2 normalisation → cosine ≡ dot product
        show_progress_bar=False,     # Suppress tqdm output in server logs
    )

    return embeddings.tolist()


def embed_query(query: str) -> list[float]:
    """
    Generate a normalised embedding for a single user query.

    BAAI recommends prepending an instruction sentence to queries (but NOT
    to documents) to improve retrieval quality.  This function applies that
    instruction automatically.

    Args:
        query: The raw user search string, e.g. "How does promotion work?"

    Returns:
        A single float vector of length EMBEDDING_DIMENSION (768).
    """
    model = get_embedding_model()

    # Prepend the instruction prefix as recommended in the BGE paper.
    query_with_instruction = QUERY_INSTRUCTION + query

    embedding = model.encode(
        [query_with_instruction],
        normalize_embeddings=True,
        show_progress_bar=False,
    )

    # encode() returns a 2-D array; we want the first (and only) row.
    return embedding[0].tolist()