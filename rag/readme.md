# GitLab Handbook RAG Microservice

A Python microservice that lets you query the [GitLab Handbook](https://handbook.gitlab.com/) using semantic search. It retrieves the most relevant handbook sections for any question and returns them with source URLs for citation.

---

## How it works

```
User query
    │
    ▼
Embed query          ← BAAI/bge-base-en-v1.5  (with query instruction prefix)
    │
    ▼
Vector search        ← Pinecone cosine similarity  (top-10 results)
    │
    ▼
Return top-10 chunks with source URLs
```

> **Note — reranker removed:** An earlier version of this service used a
> `BAAI/bge-reranker-v2-m3` cross-encoder as a second-stage reranker.
> It was removed because it did not meaningfully improve result quality
> in practice, while adding ~1.1 GB of model weight to RAM, ~30–60 s to
> startup time, and significant per-request latency on CPU.
> The commented-out code is still present in `main.py`, `embedder.py`,
> and `reranker.py` for reference if you want to re-enable it.

The handbook is indexed once (or incrementally updated) via `POST /update`
and then queried any number of times via `POST /search`.

---

## Incremental indexing

`POST /update` no longer performs a full re-index on every call.
Instead it runs a **change-detection pipeline**:

1. Fetches the current list of markdown files from the GitLab API.
2. For each file, computes an MD5 hash of the raw content and compares it
   against a **sentinel vector** stored in Pinecone from the previous run.
3. **Unchanged files are skipped entirely** — no download, no parsing, no
   embedding.
4. **Changed or new files** have their old vectors deleted first, then are
   re-chunked, re-embedded, and re-upserted alongside an updated sentinel.
5. **Deleted files** (present in a previous run but no longer in GitLab)
   have all their vectors and sentinels purged from Pinecone automatically.

This means subsequent runs after the initial index are much faster —
proportional to how many files actually changed, not the total corpus size.

### Sentinel vectors

Each successfully indexed file gets a sentinel vector stored in Pinecone:

| Field | Value |
|---|---|
| `id` | `file_hash::<file_path>` |
| `values` | zero vector (never returned by similarity search) |
| `metadata.type` | `"file_sentinel"` |
| `metadata.md5` | MD5 of raw markdown content |
| `metadata.indexed_at` | ISO-8601 UTC timestamp |

Sentinels are excluded from `/search` results via a metadata filter so
they never surface to callers.

---

## Project structure

```
gitlab-handbook-rag/
├── main.py          ← FastAPI app (endpoints: /update, /search, /status, /health)
├── config.py        ← All configuration constants and environment variables
├── fetcher.py       ← Downloads markdown files from the GitLab API
├── parser.py        ← Parses markdown into heading-aware sections
├── chunker.py       ← Merges small / splits large sections into embeddable chunks
├── embedder.py      ← Generates BGE embeddings (document + query)
├── reranker.py      ← Cross-encoder reranker (disabled — kept for reference)
├── store.py         ← Pinecone operations (upsert, query, fetch, delete)
├── requirements.txt ← Python dependencies
└── env.example      ← Template for your .env file
```

---

## Prerequisites

| Requirement | Notes |
|---|---|
| Python 3.11+ | Uses `str.removeprefix`, `X \| Y` type hints |
| ~5 GB free RAM | ~1.4 GB embedding model + working memory (reranker removed) |
| ~1.5 GB free disk | Model files downloaded from HuggingFace on first run |
| Pinecone account | Free Starter plan is sufficient — create at [app.pinecone.io](https://app.pinecone.io) |
| Internet access | To download the handbook from GitLab |

> **GPU (optional):** If you have a CUDA GPU, `sentence-transformers` will use it automatically, making indexing 5–10× faster.

---

## Setup

### 1. Clone / download the project

```bash
# Copy the project folder to your machine, then:
cd gitlab-handbook-rag
```

### 2. Create a virtual environment

```bash
python -m venv venv

# Activate it:
source venv/bin/activate        # macOS / Linux
venv\Scripts\activate           # Windows
```

### 3. Install dependencies

```bash
pip install -r requirements.txt
```

> If you have a CUDA GPU, install the matching PyTorch wheel **first**, then run the command above:
> ```bash
> pip install torch --index-url https://download.pytorch.org/whl/cu121
> pip install -r requirements.txt
> ```

### 4. Configure environment variables

```bash
cp env.example .env
```

Open `.env` in a text editor and fill in:

```env
# Required
PINECONE_API_KEY=your-pinecone-api-key-here

# Strongly recommended (avoids GitLab rate-limiting during /update)
GITLAB_API_TOKEN=your-gitlab-token-here
```

**Get your Pinecone API key:**
1. Sign up / log in at [app.pinecone.io](https://app.pinecone.io)
2. Go to **API Keys** in the left sidebar
3. Copy the default key

**Get a GitLab API token (optional but recommended):**
1. Go to [gitlab.com/-/user_settings/personal_access_tokens](https://gitlab.com/-/user_settings/personal_access_tokens)
2. Create a token with **read_api** scope
3. Copy the token value

---

## Running the service

```bash
uvicorn main:app --host 0.0.0.0 --port 8000
```

You should see output like:

```
INFO  Loading embedding model: BAAI/bge-base-en-v1.5
INFO  Connecting to Pinecone...
INFO  ✅ Service is ready.
INFO  Uvicorn running on http://0.0.0.0:8000
```

> ⏳ First startup takes **30–90 seconds** on CPU while models are loaded from disk.  
> Subsequent starts are faster because models are cached locally.

---

## API reference

### `GET /health`
Liveness check. Returns `{"status": "ok"}` when the service is running.

### `GET /status`
Check the state of the background indexing task.

```json
{
  "status": "running",
  "message": "Comparing 6000 files against stored index…",
  "progress": {
    "files_processed": 1240,
    "files_skipped": 1100,
    "files_updated": 140,
    "files_deleted": 3,
    "total_files": 6000,
    "chunks_indexed": 2100
  }
}
```

Possible status values: `idle` | `running` | `completed` | `failed`

Progress fields:

| Field | Meaning |
|---|---|
| `files_processed` | Files examined so far in this run |
| `files_skipped` | Files skipped because content was unchanged |
| `files_updated` | Files that were re-indexed (new or changed content) |
| `files_deleted` | Files removed from GitLab and purged from the index |
| `total_files` | Total files found in the GitLab repository |
| `chunks_indexed` | Total chunk vectors upserted in this run |

### `POST /update`
Start an incremental sync of the handbook. Returns immediately (HTTP 202);
the pipeline runs in the background. Poll **GET /status** to track progress.

```bash
curl -X POST http://localhost:8000/update
```

> ⏳ **First run (empty index):** 2–4 hours on CPU, ~30 minutes on GPU.  
> **Subsequent runs:** Much faster — only changed files are re-processed.  
> Monitor progress with `GET /status`.

### `POST /search`
Search the handbook.

**Request:**
```json
{
  "query": "How does the promotion process work?",
  "top_k": 5
}
```

**Response:**
```json
[
  {
    "chunk_id": "a3f9c2d1...",
    "score": 0.91,
    "content": "Promotions at GitLab are initiated by the direct manager...",
    "metadata": {
      "url": "https://handbook.gitlab.com/handbook/people-group/promotions-transfers/",
      "title": "Promotion Process",
      "section_path": ["Promotions & Transfers", "Promotion Process"],
      "file_path": "content/handbook/people-group/promotions-transfers/_index.md"
    }
  }
]
```

---

## Testing the service

### Step 1 — Check the service is alive

```bash
curl http://localhost:8000/health
# Expected: {"status":"ok","service":"gitlab-handbook-rag"}
```

### Step 2 — Trigger indexing

```bash
curl -X POST http://localhost:8000/update
# Expected: {"status":"accepted","message":"Incremental indexing started..."}
```

### Step 3 — Monitor progress

```bash
# Run this every 30 seconds to watch progress
curl http://localhost:8000/status
```

### Step 4 — Search once indexing completes

```bash
curl -X POST http://localhost:8000/search \
  -H "Content-Type: application/json" \
  -d '{"query": "How does the promotion process work?", "top_k": 3}'
```

```bash
# More example queries:
curl -X POST http://localhost:8000/search \
  -H "Content-Type: application/json" \
  -d '{"query": "What are GitLab values?"}'

curl -X POST http://localhost:8000/search \
  -H "Content-Type: application/json" \
  -d '{"query": "How do I request time off?"}'

curl -X POST http://localhost:8000/search \
  -H "Content-Type: application/json" \
  -d '{"query": "What is the engineering hiring process?"}'
```

### Using the built-in docs UI

FastAPI includes an interactive API explorer. Open in your browser:

```
http://localhost:8000/docs
```

---

## Deployment notes

### Environment variables in production

Do not use a `.env` file in production. Set environment variables directly in your hosting platform:

- **Docker**: pass `-e PINECONE_API_KEY=...` or use an env file with `--env-file`
- **Kubernetes**: use a Secret object
- **Railway / Render / Fly.io**: use the platform's environment variable UI

### Docker (quick start)

```dockerfile
FROM python:3.11-slim

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8000
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
```

```bash
docker build -t handbook-rag .
docker run -p 8000:8000 \
  -e PINECONE_API_KEY=your-key \
  -e GITLAB_API_TOKEN=your-token \
  handbook-rag
```

### Scaling the /update endpoint

`/update` runs as a FastAPI background task, which works well for a single-instance deployment. For multi-instance deployments, move the indexing job to a dedicated worker (e.g. Celery + Redis) so only one worker runs the pipeline at a time.

### Scheduling incremental syncs

Because `/update` now only re-processes changed files, it is cheap to run frequently. A daily cron job is reasonable:

```bash
# Run every day at 02:00
0 2 * * * curl -X POST http://your-server:8000/update
```

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `KeyError: 'PINECONE_API_KEY'` | `.env` not loaded | Make sure `.env` exists and `python-dotenv` is installed |
| `429 Too Many Requests` during `/update` | GitLab rate limit | Set `GITLAB_API_TOKEN` in `.env` and/or increase `DOWNLOAD_DELAY` to `1.0` |
| Startup takes > 5 minutes | First-time model download | Wait — HuggingFace downloads ~1.5 GB of model weights |
| `/search` returns `[]` | Index is empty | Run `POST /update` and wait for it to complete |
| `pinecone.exceptions.PineconeException` | Wrong API key or region | Double-check `PINECONE_API_KEY`, `PINECONE_CLOUD`, `PINECONE_REGION` |
| Out-of-memory error | Not enough RAM | Reduce `batch_size` in `embedder.py → embed_texts()` from 64 to 16 |
| `/update` skips all files unexpectedly | Sentinels from a corrupt run | Clear the index with `delete_namespace()` and re-run to force a full rebuild |