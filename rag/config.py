"""
config.py
─────────
Single source of truth for every tuneable parameter in the service.

All sensitive values (API keys) are read from environment variables so
that they are never hard-coded or committed to source control.

Usage:
    from config import PINECONE_API_KEY, EMBEDDING_MODEL, ...
"""

import os
from dotenv import load_dotenv

# Load variables from a .env file (if one exists in the working directory).
# On a real server you would set these variables in the OS environment instead.
load_dotenv()


# ─── Pinecone ────────────────────────────────────────────────────────────────

# Required: get yours at https://app.pinecone.io → API Keys
PINECONE_API_KEY: str = os.environ["PINECONE_API_KEY"]

# Name of the Pinecone index that will store the handbook embeddings.
PINECONE_INDEX_NAME: str = os.getenv("PINECONE_INDEX_NAME", "gitlab-handbook")

# Namespace inside the index (lets you share one index for multiple projects).
PINECONE_NAMESPACE: str = "gitlab-handbook"

# Serverless spec — change cloud/region to match your Pinecone plan.
PINECONE_CLOUD: str = os.getenv("PINECONE_CLOUD", "aws")
PINECONE_REGION: str = os.getenv("PINECONE_REGION", "us-east-1")


# ─── Embedding model ─────────────────────────────────────────────────────────

EMBEDDING_MODEL: str = "BAAI/bge-base-en-v1.5"

# Dimension of the vectors produced by bge-base-en-v1.5.
EMBEDDING_DIMENSION: int = 768

# Cosine is the metric recommended by BAAI for bge models.
SIMILARITY_METRIC: str = "cosine"

# BGE's recommended prefix when encoding *queries* (not documents).
# This prefix is NOT used when embedding handbook chunks.
QUERY_INSTRUCTION: str = "Represent this sentence for searching relevant passages: "


# ─── GitLab handbook source ──────────────────────────────────────────────────

GITLAB_PROJECT_ID: str = "42817607"
GITLAB_API_BASE: str = "https://gitlab.com/api/v4"
HANDBOOK_CONTENT_PATH: str = "content/handbook"

# Optional GitLab personal access token — increases rate limits significantly.
# Leave empty to use the unauthenticated API (60 req/min).
GITLAB_API_TOKEN: str = os.getenv("GITLAB_API_TOKEN", "")


# ─── Chunking ────────────────────────────────────────────────────────────────

# bge-base-en-v1.5 supports up to 512 tokens. We keep chunks at 450 to leave
# room for the instruction prefix and special tokens.
MAX_CHUNK_TOKENS: int = 450

# Sections smaller than this are merged with the next adjacent section.
MIN_CHUNK_TOKENS: int = 200

# Overlap between consecutive sub-chunks of the same section.
# Preserves context when a section is split into multiple chunks.
CHUNK_OVERLAP_TOKENS: int = 50


# ─── Retrieval ───────────────────────────────────────────────────────────────

# Number of chunks fetched from Pinecone.
VECTOR_SEARCH_TOP_K: int = 10


# ─── HTTP / networking ───────────────────────────────────────────────────────

# Seconds to wait for a GitLab API response before raising a timeout error.
REQUEST_TIMEOUT: int = 30

# Seconds to sleep between individual file downloads to avoid rate-limiting.
# Increase this if you hit 429 errors during /update.
DOWNLOAD_DELAY: float = float(os.getenv("DOWNLOAD_DELAY", "0.1"))