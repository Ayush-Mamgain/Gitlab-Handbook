"""
main.py
───────
FastAPI application entry point.

Endpoints:
  POST /update  — Incremental re-index: only processes changed/new files.
  POST /search  — Semantic search with reranking.
  GET  /status  — Current state of the background indexing task.
  GET  /health  — Liveness probe for load balancers / orchestrators.

Run with:
    uvicorn main:app --host 0.0.0.0 --port 8000

On startup the service pre-loads both ML models so the first /search request
is fast.  Expect ~60 seconds of startup time on CPU.

Change-detection strategy
─────────────────────────
Every successfully indexed file gets a "sentinel" vector stored in Pinecone:

    id       : "file_hash::<file_path>"   (deterministic, never collides with
                                           content chunks whose IDs are SHA-256
                                           digests of content)
    values   : zero vector                (never queried; exists only as a record)
    metadata : {
        type       : "file_sentinel",
        file_path  : "<file_path>",
        md5        : "<md5 of raw markdown>",
        indexed_at : "<ISO-8601 UTC timestamp>",
    }

On each /update run the pipeline:
  1. Computes MD5 of the downloaded markdown.
  2. Fetches the stored sentinel (if any) by its deterministic ID.
  3. Skips the file when the MD5 matches.
  4. For changed/new files: deletes old chunks via metadata filter, then
     re-chunks → re-embeds → upserts fresh vectors + new sentinel.
  5. After all files are processed, deletes sentinels (and their chunks) for
     files that no longer exist in the GitLab repository.
"""

import hashlib
import logging
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone

from fastapi import BackgroundTasks, FastAPI, HTTPException
from pydantic import BaseModel

from chunker import chunk_sections
from config import EMBEDDING_DIMENSION
# from config import RERANKER_TOP_N, VECTOR_SEARCH_TOP_K
from embedder import embed_query, embed_texts, get_embedding_model
from fetcher import download_markdown_file, generate_handbook_url, get_handbook_file_paths
from parser import parse_markdown
# from reranker import get_reranker, rerank
from store import (
    delete_namespace,
    delete_vectors_by_filter,
    fetch_vectors_by_ids,
    get_pinecone_index,
    upsert_vectors,
    vector_search,
)

# ─── Logging ─────────────────────────────────────────────────────────────────

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(name)s — %(message)s",
)
logger = logging.getLogger(__name__)

# ─── Application ─────────────────────────────────────────────────────────────

app = FastAPI(
    title="GitLab Handbook RAG Microservice",
    description=(
        "Query the GitLab Handbook using semantic search (BAAI/bge-base-en-v1.5) "
        "with cross-encoder reranking (BAAI/bge-reranker-v2-m3)."
    ),
    version="1.0.0",
)

# ─── In-memory indexing state ─────────────────────────────────────────────────
# A simple dict that the background task writes to and /status reads from.
# For a multi-process deployment, replace this with Redis or a database.

_indexing_state: dict = {
    "status":   "idle",                    # idle | running | completed | failed
    "message":  "No indexing run yet.",
    "progress": {
        "files_processed":  0,
        "files_skipped":    0,             # unchanged files (hash match)
        "files_updated":    0,             # changed or new files
        "files_deleted":    0,             # files removed from GitLab
        "total_files":      0,
        "chunks_indexed":   0,
    },
}


# ─── Request / Response schemas ───────────────────────────────────────────────

class SearchRequest(BaseModel):
    """Body for POST /search."""
    query: str
    top_k: int = 5     # Number of final results to return (max RERANKER_TOP_N)


class ChunkMetadata(BaseModel):
    url:          str
    title:        str
    section_path: list[str]
    file_path:    str


class RetrievedChunk(BaseModel):
    """A single result returned by POST /search."""
    chunk_id: str
    score:    float
    content:  str
    metadata: ChunkMetadata


# ─── Startup hook ─────────────────────────────────────────────────────────────

@app.on_event("startup")
async def preload_models() -> None:
    """
    Load both ML models and connect to Pinecone when the server starts.

    Pre-loading prevents the first real request from timing out while the
    ~2.5 GB of model weights are being read from disk.
    """
    logger.info("⏳ Pre-loading embedding model...")
    get_embedding_model()

    # logger.info("⏳ Pre-loading reranker model...")
    # get_reranker()

    logger.info("⏳ Connecting to Pinecone...")
    get_pinecone_index()

    logger.info("✅ Service is ready.")


# ─── Indexing helpers ─────────────────────────────────────────────────────────

def _make_chunk_id(file_path: str, section_path: list[str], content: str) -> str:
    """
    Produce a stable, deterministic SHA-256 ID for a chunk.

    The same inputs always produce the same ID, so re-running /update will
    overwrite existing vectors rather than creating duplicates.

    Args:
        file_path:    Repository-relative path of the source file.
        section_path: Breadcrumb list, e.g. ["Promotion Process", "Timeline"].
        content:      The chunk's body text.

    Returns:
        64-character hex digest string.
    """
    raw = file_path + str(section_path) + content
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def _make_sentinel_id(file_path: str) -> str:
    """
    Return the deterministic Pinecone vector ID for a file's sentinel record.

    The "file_hash::" prefix ensures sentinel IDs never collide with content
    chunk IDs (which are plain SHA-256 hex digests).

    Args:
        file_path: Repository-relative path of the source file.

    Returns:
        String of the form "file_hash::<file_path>".
    """
    return f"file_hash::{file_path}"


def _compute_md5(text: str) -> str:
    """
    Return the MD5 hex digest of a UTF-8 string.

    MD5 is chosen for speed and compactness — collision resistance is not a
    security requirement here, only change detection.

    Args:
        text: Raw markdown content of a file.

    Returns:
        32-character lowercase hex string.
    """
    return hashlib.md5(text.encode("utf-8")).hexdigest()


def _fetch_file_sentinel(file_path: str) -> dict | None:
    """
    Look up the sentinel vector for a given file in Pinecone.

    Args:
        file_path: Repository-relative path of the source file.

    Returns:
        The metadata dict of the sentinel vector, or None if it doesn't exist.
    """
    sentinel_id = _make_sentinel_id(file_path)
    try:
        response = fetch_vectors_by_ids([sentinel_id])
        # Pinecone fetch returns a FetchResponse; vectors is a dict keyed by ID.
        vector = response.vectors.get(sentinel_id)
        if vector is None:
            return None
        return vector.metadata
    except Exception as exc:
        logger.warning(f"Could not fetch sentinel for {file_path}: {exc}")
        return None


def _upsert_file_sentinel(file_path: str, md5: str, embedding_dim: int) -> None:
    """
    Write (or overwrite) the sentinel vector for a file after successful indexing.

    The sentinel uses a zero vector so it is never returned by similarity search.

    Args:
        file_path:     Repository-relative path of the source file.
        md5:           MD5 hash of the file's raw markdown content.
        embedding_dim: Dimensionality of the index (must match the index config).
    """
    sentinel_id = _make_sentinel_id(file_path)
    sentinel_vector = {
        "id": sentinel_id,
        "values": [0.0] * embedding_dim,
        "metadata": {
            "type":        "file_sentinel",
            "file_path":   file_path,
            "md5":         md5,
            "indexed_at":  datetime.now(timezone.utc).isoformat(),
        },
    }
    upsert_vectors([sentinel_vector])


def _delete_file_data(file_path: str) -> None:
    """
    Remove all Pinecone vectors (chunks + sentinel) associated with a file.

    Two separate filter calls are used because the sentinel and content chunks
    share only the ``file_path`` metadata field, making a single filter safe.

    Args:
        file_path: Repository-relative path of the source file.
    """
    try:
        # Delete all content chunks for this file.
        delete_vectors_by_filter({"file_path": {"$eq": file_path}})
        # Delete the sentinel itself (also carries file_path in its metadata).
        delete_vectors_by_filter({
            "type":      {"$eq": "file_sentinel"},
            "file_path": {"$eq": file_path},
        })
        logger.info(f"Deleted all vectors for {file_path}")
    except Exception as exc:
        logger.warning(f"Could not delete vectors for {file_path}: {exc}")


def _run_indexing_pipeline() -> None:
    """
    Incremental indexing pipeline: only re-indexes files whose content has changed.

    Pipeline per file:
      1. Download markdown.
      2. Compute MD5 of raw content.
      3. Fetch stored sentinel from Pinecone.
      4a. MD5 matches  → skip (file is unchanged).
      4b. MD5 differs  → delete old vectors, re-chunk, re-embed, upsert, update sentinel.

    After all files are processed, any file that existed in a previous run but
    is no longer returned by the GitLab API has its vectors and sentinel deleted.

    This function is called as a FastAPI background task. It updates
    `_indexing_state` throughout so callers can poll GET /status.

    Error handling strategy:
      - Individual file failures are logged and skipped (not fatal).
      - Any unhandled exception sets status to "failed" and stops the run.
    """
    global _indexing_state

    try:
        # ── Step 1: Collect file list ─────────────────────────────────────────
        _indexing_state = {
            "status":  "running",
            "message": "Fetching handbook file list from GitLab…",
            "progress": {
                "files_processed": 0,
                "files_skipped":   0,
                "files_updated":   0,
                "files_deleted":   0,
                "total_files":     0,
                "chunks_indexed":  0,
            },
        }
        logger.info("=== Incremental indexing pipeline started ===")

        file_paths = get_handbook_file_paths()
        total_files = len(file_paths)
        file_paths_set = set(file_paths)
        logger.info(f"Total markdown files in GitLab: {total_files}")

        _indexing_state["progress"]["total_files"] = total_files
        _indexing_state["message"] = (
            f"Comparing {total_files} files against stored index…"
        )

        # ── Step 2: Detect and clean up deleted files ─────────────────────────
        # Fetch all sentinel IDs currently in Pinecone, then remove any whose
        # file_path is no longer present in the GitLab file list.
        # NOTE: This requires a metadata-filtered query; a vector_search with
        # filter={"type": "file_sentinel"} and a large top_k is one approach.
        # If your index is very large, paginate or use Pinecone's list() API.
        try:
            sentinel_results = vector_search(
                query_embedding=[0.0] * EMBEDDING_DIMENSION,
                top_k=10_000,
                filter={"type": {"$eq": "file_sentinel"}},
            )
            stale_file_paths = [
                match.metadata["file_path"]
                for match in sentinel_results
                if match.metadata.get("file_path") not in file_paths_set
            ]
        except Exception as exc:
            logger.warning(f"Could not fetch existing sentinels: {exc}. Skipping deletion check.")
            stale_file_paths = []

        files_deleted = 0
        for stale_path in stale_file_paths:
            logger.info(f"Deleting removed file: {stale_path}")
            _delete_file_data(stale_path)
            files_deleted += 1

        _indexing_state["progress"]["files_deleted"] = files_deleted
        if files_deleted:
            logger.info(f"Cleaned up {files_deleted} deleted file(s).")

        # ── Steps 3–7: Process files in batches ───────────────────────────────
        vectors_buffer:    list[dict] = []
        sentinels_buffer:  list[tuple[str, str]] = []  # (file_path, md5) pairs

        FLUSH_SIZE          = 1000
        DOWNLOAD_BATCH_SIZE = 20
        DOWNLOAD_WORKERS    = 10

        # Read the embedding dimension from the first real embedding so the
        # sentinel zero-vector is always the correct length.
        embedding_dim: int | None = None

        total_chunks_indexed = 0
        files_processed      = 0
        files_skipped        = 0
        files_updated        = 0

        for batch_start in range(0, total_files, DOWNLOAD_BATCH_SIZE):
            batch_paths = file_paths[batch_start : batch_start + DOWNLOAD_BATCH_SIZE]

            # Download files concurrently.
            with ThreadPoolExecutor(max_workers=DOWNLOAD_WORKERS) as executor:
                markdown_texts = list(
                    executor.map(download_markdown_file, batch_paths)
                )

            for file_path, markdown_text in zip(batch_paths, markdown_texts):
                try:
                    files_processed += 1

                    if not markdown_text.strip():
                        files_skipped += 1
                        continue

                    # ── 3. Compute MD5 and compare against stored sentinel ────
                    current_md5 = _compute_md5(markdown_text)
                    sentinel    = _fetch_file_sentinel(file_path)

                    if sentinel is not None and sentinel.get("md5") == current_md5:
                        # File is unchanged — nothing to do.
                        files_skipped += 1
                        logger.debug(f"[{files_processed}/{total_files}] SKIP {file_path}")
                        _indexing_state["progress"]["files_processed"] = files_processed
                        _indexing_state["progress"]["files_skipped"]   = files_skipped
                        continue

                    # ── 4. File is new or changed — delete old vectors ────────
                    if sentinel is not None:
                        # Changed file: remove stale chunks so we don't
                        # accumulate orphaned vectors after re-chunking.
                        delete_vectors_by_filter({"file_path": {"$eq": file_path}})
                        logger.info(f"Deleted old chunks for changed file: {file_path}")

                    # ── 5. Parse → chunk ─────────────────────────────────────
                    url      = generate_handbook_url(file_path)
                    sections = parse_markdown(markdown_text)
                    if not sections:
                        files_skipped += 1
                        continue

                    chunks = chunk_sections(sections, file_path, url)
                    if not chunks:
                        files_skipped += 1
                        continue

                    # ── 6. Embed ─────────────────────────────────────────────
                    texts      = [c.content for c in chunks]
                    embeddings = embed_texts(texts)

                    if embedding_dim is None and embeddings:
                        embedding_dim = len(embeddings[0])

                    # ── 7. Build Pinecone vector records ──────────────────────
                    for chunk, embedding in zip(chunks, embeddings):
                        chunk_id = _make_chunk_id(
                            file_path,
                            chunk.section_path,
                            chunk.content,
                        )
                        vectors_buffer.append(
                            {
                                "id":     chunk_id,
                                "values": embedding,
                                "metadata": {
                                    "chunk_id":     chunk_id,
                                    "file_path":    file_path,
                                    "url":          url,
                                    "title":        chunk.title,
                                    "section_path": chunk.section_path,
                                    "content":      chunk.content,
                                    # Exclude sentinel type marker so content
                                    # chunks are never confused with sentinels.
                                },
                            }
                        )

                    # Track the sentinel to write after the chunk flush.
                    sentinels_buffer.append((file_path, current_md5))
                    files_updated += 1

                    # ── 8. Flush chunks buffer ────────────────────────────────
                    if len(vectors_buffer) >= FLUSH_SIZE:
                        upsert_vectors(vectors_buffer)
                        total_chunks_indexed += len(vectors_buffer)
                        vectors_buffer = []

                        # Write sentinels for the batch we just flushed.
                        for fp, md5 in sentinels_buffer:
                            _upsert_file_sentinel(fp, md5, embedding_dim)
                        sentinels_buffer = []

                    _indexing_state["progress"].update({
                        "files_processed": files_processed,
                        "files_skipped":   files_skipped,
                        "files_updated":   files_updated,
                        "chunks_indexed":  total_chunks_indexed,
                    })

                    logger.info(
                        f"[{files_processed}/{total_files}] UPDATE "
                        f"{file_path} — {len(chunks)} chunks"
                    )

                except Exception as exc:
                    logger.error(f"Skipping {file_path}: {exc}", exc_info=True)

        # ── Final flush ───────────────────────────────────────────────────────
        if vectors_buffer:
            upsert_vectors(vectors_buffer)
            total_chunks_indexed += len(vectors_buffer)

        if sentinels_buffer and embedding_dim is not None:
            for fp, md5 in sentinels_buffer:
                _upsert_file_sentinel(fp, md5, embedding_dim)

        _indexing_state = {
            "status":  "completed",
            "message": (
                f"Incremental sync complete — "
                f"{files_updated} updated, "
                f"{files_skipped} unchanged, "
                f"{files_deleted} deleted, "
                f"{total_chunks_indexed} chunks indexed."
            ),
            "progress": {
                "files_processed": total_files,
                "files_skipped":   files_skipped,
                "files_updated":   files_updated,
                "files_deleted":   files_deleted,
                "total_files":     total_files,
                "chunks_indexed":  total_chunks_indexed,
            },
        }

        logger.info(
            f"=== Incremental indexing complete: "
            f"{files_updated} updated / {files_skipped} skipped / "
            f"{files_deleted} deleted / {total_chunks_indexed} chunks ==="
        )

    except Exception as exc:
        logger.error(f"Indexing pipeline failed: {exc}", exc_info=True)
        _indexing_state = {
            "status":  "failed",
            "message": str(exc),
            "progress": _indexing_state.get("progress", {}),
        }


# ─── API endpoints ───────────────────────────────────────────────────────────

@app.post("/update", status_code=202)
async def update_index(background_tasks: BackgroundTasks) -> dict:
    """
    Incrementally synchronize the GitLab Handbook into Pinecone.

    Only files whose raw markdown content has changed since the last run are
    re-processed.  Unchanged files are skipped entirely.

    The pipeline runs in the background; this endpoint returns immediately
    with HTTP 202 Accepted.  Poll **GET /status** to track progress.

    The pipeline per changed/new file:
      1. Downloads the markdown file from GitLab.
      2. Computes an MD5 of the raw content and compares it against the stored
         sentinel in Pinecone.
      3. If unchanged → skips.
      4. If changed or new → deletes old chunks, re-chunks, re-embeds, upserts
         new vectors, and writes an updated sentinel.

    Additionally, any file that was indexed in a previous run but no longer
    exists in the GitLab repository has all its vectors removed.

    ⚠️  The first run (empty index) behaves identically to a full re-index.
    ⚠️  Expected duration on CPU for a full first run: 2–4 hours; subsequent
        runs are proportionally faster depending on the number of changed files.
    """
    if _indexing_state["status"] == "running":
        raise HTTPException(
            status_code=409,
            detail=(
                "An indexing run is already in progress. "
                "Check GET /status for updates."
            ),
        )

    background_tasks.add_task(_run_indexing_pipeline)
    return {
        "status":  "accepted",
        "message": (
            "Incremental indexing started in the background. "
            "Poll GET /status for progress."
        ),
    }


@app.post("/search", response_model=list[RetrievedChunk])
async def search(request: SearchRequest) -> list[dict]:
    """
    Search the GitLab Handbook using semantic search only.

    Retrieval pipeline:
      1. Embed the query.
      2. Retrieve top-K chunks from Pinecone.
      3. Return results sorted by vector similarity score.

    Sentinel vectors (type == "file_sentinel") are automatically excluded from
    results via a metadata filter so they never surface to callers.

    Request body:
        query  (str): Natural-language question or search phrase.
        top_k  (int): Number of results to return (default 10, max 10).
    """
    if not request.query.strip():
        raise HTTPException(status_code=400, detail="Query must not be empty.")

    try:
        # Step 1 — Embed the query.
        query_embedding = embed_query(request.query)

        # Step 2 — Retrieve top-K from Pinecone, excluding sentinel vectors.
        matches = vector_search(
            query_embedding,
            top_k=request.top_k,
            filter={"type": {"$ne": "file_sentinel"}},
        )

        # Step 3 — Format response.
        return [
            {
                "chunk_id": match.metadata["chunk_id"],
                "score":    match.score,
                "content":  match.metadata["content"],
                "metadata": {
                    "url":          match.metadata["url"],
                    "title":        match.metadata["title"],
                    "section_path": match.metadata.get("section_path", []),
                    "file_path":    match.metadata["file_path"],
                },
            }
            for match in matches
        ]

    except Exception as exc:
        logger.error(f"/search failed: {exc}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(exc))


@app.get("/status")
async def get_status() -> dict:
    """
    Return the current state of the background indexing task.

    Possible statuses:
      idle       — No indexing run has been triggered.
      running    — The pipeline is actively processing files.
      completed  — The last run finished successfully.
      failed     — The last run encountered a fatal error.

    Progress fields (when running or completed):
      files_processed  — Files examined so far.
      files_skipped    — Files skipped because their content was unchanged.
      files_updated    — Files that were re-indexed (new or changed).
      files_deleted    — Files removed from GitLab and purged from the index.
      total_files      — Total files in the GitLab repository.
      chunks_indexed   — Total chunk vectors upserted in this run.
    """
    return _indexing_state


@app.get("/health")
async def health_check() -> dict:
    """
    Liveness probe for load balancers and container orchestrators.

    Returns HTTP 200 as long as the process is alive.
    """
    return {"status": "ok", "service": "gitlab-handbook-rag"}