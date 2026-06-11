"""
store.py
────────
All interactions with the Pinecone vector database.

Responsibilities:
  • Connect to (or create) the Pinecone index on first use.
  • Upsert vectors in safe batches to avoid API size limits.
  • Run similarity queries and return raw match objects.
  • Fetch vectors by ID (used for sentinel lookups).
  • Delete vectors by metadata filter (used for per-file cleanup).
  • Delete an entire namespace so the index can be rebuilt from scratch.

The Pinecone client is a lazy singleton — it is initialised once and
reused for the lifetime of the process.

This module uses the Pinecone Python SDK v3+ (package name: pinecone).
"""

import logging
import time

from pinecone import Pinecone, ServerlessSpec

from config import (
    EMBEDDING_DIMENSION,
    PINECONE_API_KEY,
    PINECONE_CLOUD,
    PINECONE_INDEX_NAME,
    PINECONE_NAMESPACE,
    PINECONE_REGION,
    SIMILARITY_METRIC,
)

logger = logging.getLogger(__name__)

# ─── Singleton ───────────────────────────────────────────────────────────────

_pinecone_client: Pinecone | None = None
_index = None                        # pinecone.Index object


def get_pinecone_index():
    """
    Return the Pinecone index object, creating the index if it does not exist.

    Index creation is idempotent — calling this function when the index
    already exists is safe and fast.

    Returns:
        A pinecone.Index object connected to PINECONE_INDEX_NAME.
    """
    global _pinecone_client, _index

    if _index is not None:
        return _index

    # 1. Initialise the client (validates the API key).
    _pinecone_client = Pinecone(api_key=PINECONE_API_KEY)

    # 2. Create the index if it doesn't exist yet.
    existing_names = [idx.name for idx in _pinecone_client.list_indexes()]

    if PINECONE_INDEX_NAME not in existing_names:
        logger.info(
            f"Creating Pinecone index '{PINECONE_INDEX_NAME}' "
            f"(dim={EMBEDDING_DIMENSION}, metric={SIMILARITY_METRIC})..."
        )
        _pinecone_client.create_index(
            name=PINECONE_INDEX_NAME,
            dimension=EMBEDDING_DIMENSION,
            metric=SIMILARITY_METRIC,
            spec=ServerlessSpec(cloud=PINECONE_CLOUD, region=PINECONE_REGION),
        )

        # Wait until the index is ready before returning.
        # Pinecone provisioning typically takes 10–30 seconds.
        logger.info("Waiting for index to become ready...")
        while True:
            status = _pinecone_client.describe_index(PINECONE_INDEX_NAME).status
            if status.get("ready"):
                break
            time.sleep(3)

        logger.info("Pinecone index is ready.")
    else:
        logger.info(f"Using existing Pinecone index: '{PINECONE_INDEX_NAME}'")

    _index = _pinecone_client.Index(PINECONE_INDEX_NAME)
    return _index


# ─── Public API ──────────────────────────────────────────────────────────────

def upsert_vectors(vectors: list[dict], batch_size: int = 100) -> None:
    """
    Upsert a list of vector records into Pinecone in batches.

    Pinecone recommends batches of 100 vectors.  Larger batches may be
    rejected due to payload size limits (~4 MB per request).

    Each vector dict must have the shape:
        {
            "id":     str,           # Unique chunk ID
            "values": list[float],   # Embedding vector
            "metadata": dict         # Arbitrary key-value pairs
        }

    Args:
        vectors:    List of vector records to upsert.
        batch_size: Number of vectors per Pinecone upsert call.
    """
    index = get_pinecone_index()
    total = len(vectors)

    for start in range(0, total, batch_size):
        batch = vectors[start : start + batch_size]
        index.upsert(vectors=batch, namespace=PINECONE_NAMESPACE)

        end = min(start + batch_size, total)
        logger.info(f"Upserted vectors {start + 1}–{end} of {total}.")


def vector_search(
    query_embedding: list[float],
    top_k: int,
    filter: dict | None = None,
) -> list:
    """
    Query Pinecone for the most similar vectors to query_embedding.

    Args:
        query_embedding: A normalised float vector of length EMBEDDING_DIMENSION.
        top_k:           Maximum number of results to return.
        filter:          Optional Pinecone metadata filter dict.
                         Example: {"type": {"$ne": "file_sentinel"}}
                         When None, no filter is applied.

    Returns:
        A list of ScoredVector objects (from the Pinecone SDK), each with:
          .id         – vector ID (= chunk_id)
          .score      – cosine similarity (0–1 for normalised vectors)
          .metadata   – dict with all fields stored at upsert time
    """
    index = get_pinecone_index()

    response = index.query(
        vector=query_embedding,
        top_k=top_k,
        namespace=PINECONE_NAMESPACE,
        include_metadata=True,   # Return stored metadata alongside scores
        filter=filter,           # None is ignored by the Pinecone SDK
    )

    return response.matches


def fetch_vectors_by_ids(ids: list[str]):
    """
    Fetch vectors from Pinecone by their exact IDs.

    Used by the incremental indexing pipeline to look up file sentinel
    vectors and check whether a file has changed since it was last indexed.

    Args:
        ids: List of vector IDs to fetch.

    Returns:
        A Pinecone FetchResponse object.  Access individual vectors via
        response.vectors[id] — missing IDs are simply absent from the dict.
    """
    index = get_pinecone_index()
    return index.fetch(ids=ids, namespace=PINECONE_NAMESPACE)


def delete_vectors_by_filter(filter: dict) -> None:
    """
    Delete all vectors in PINECONE_NAMESPACE whose metadata matches filter.

    Used by the incremental indexing pipeline to remove stale chunks when
    a file's content has changed, and to clean up vectors for files that
    no longer exist in the GitLab repository.

    Args:
        filter: Pinecone metadata filter dict.
                Example: {"file_path": {"$eq": "content/handbook/foo.md"}}

    Note:
        Metadata-filtered deletes require a Pinecone index with
        metadata filtering enabled (all paid plans and the free Starter
        plan support this for serverless indexes).
    """
    index = get_pinecone_index()
    index.delete(filter=filter, namespace=PINECONE_NAMESPACE)
    logger.info(f"Deleted vectors matching filter: {filter}")


def delete_namespace() -> None:
    """
    Delete every vector in PINECONE_NAMESPACE.

    This is called at the start of a full /update to ensure the rebuilt
    index contains only fresh data with no stale chunks.

    Note: The index itself (schema, dimension, metric) is preserved.
    """
    index = get_pinecone_index()
    logger.info(f"Deleting all vectors in namespace '{PINECONE_NAMESPACE}'...")
    index.delete(delete_all=True, namespace=PINECONE_NAMESPACE)
    logger.info("Namespace cleared.")