"""
fetcher.py
──────────
Everything related to downloading data from the GitLab API.

Responsibilities:
  1. Retrieve all markdown file paths from the handbook repository tree.
  2. Download the raw markdown text for a single file.
  3. Convert a repository path into its public handbook.gitlab.com URL.

All functions are intentionally stateless (no global side-effects) so
they are easy to test in isolation.
"""

import logging
import time
from urllib.parse import quote

import requests

from config import (
    DOWNLOAD_DELAY,
    GITLAB_API_BASE,
    GITLAB_API_TOKEN,
    GITLAB_PROJECT_ID,
    HANDBOOK_CONTENT_PATH,
    REQUEST_TIMEOUT,
)

logger = logging.getLogger(__name__)

# Reuse HTTP connections across requests for better performance.
_session = requests.Session()


# ─── Helpers ─────────────────────────────────────────────────────────────────

def _build_headers() -> dict:
    """Return request headers, including an auth token when configured."""
    headers = {"Accept": "application/json"}
    if GITLAB_API_TOKEN:
        headers["PRIVATE-TOKEN"] = GITLAB_API_TOKEN
    return headers


# ─── Public API ──────────────────────────────────────────────────────────────

def get_handbook_file_paths() -> list[str]:
    """
    Return a list of all markdown file paths inside content/handbook.

    The GitLab repository tree API is queried once using a large
    per_page value that returns the entire handbook tree in a single
    response.

    Returns:
        A list of repository-relative paths ending in ".md".
        Example: ["content/handbook/about/_index.md", ...]
    """
    url = f"{GITLAB_API_BASE}/projects/{GITLAB_PROJECT_ID}/repository/tree"

    params = {
        "path": HANDBOOK_CONTENT_PATH,
        "per_page": 50000,
        "recursive": "true",
    }

    logger.debug("Fetching handbook repository tree...")

    response = _session.get(
        url,
        headers=_build_headers(),
        params=params,
        timeout=REQUEST_TIMEOUT,
    )
    response.raise_for_status()

    items = response.json()

    # Keep only files (blobs) that are markdown documents.
    md_files = [
        item["path"]
        for item in items
        if item["type"] == "blob" and item["path"].endswith(".md")
    ]

    logger.info(
        f"Found {len(md_files)} markdown files in the handbook "
        f"from {len(items)} repository entries."
    )

    return md_files


def download_markdown_file(file_path: str) -> str:
    """
    Download and return the raw markdown text for a single handbook file.

    The file path must be URL-encoded because it can contain slashes and
    other special characters.

    Args:
        file_path: Repository-relative path, e.g.
                   "content/handbook/about/_index.md"

    Returns:
        The raw markdown text as a Python string.

    Raises:
        requests.HTTPError: If the GitLab API returns a non-2xx response.
    """
    encoded_path = quote(file_path, safe="")  # Encode '/' as '%2F', etc.
    url = (
        f"{GITLAB_API_BASE}/projects/{GITLAB_PROJECT_ID}"
        f"/repository/files/{encoded_path}/raw"
    )

    response = _session.get(
        url,
        headers=_build_headers(),
        timeout=REQUEST_TIMEOUT,
    )
    response.raise_for_status()

    # Respect the configured rate-limit delay between downloads.
    if DOWNLOAD_DELAY > 0:
        time.sleep(DOWNLOAD_DELAY)

    return response.text


def generate_handbook_url(file_path: str) -> str:
    """
    Convert a repository file path to its public handbook.gitlab.com URL.

    The GitLab handbook is a Hugo site. Hugo has two conventions:
      - _index.md  → the directory's index page
      - <name>.md  → a leaf page at <name>/

    Examples:
        "content/handbook/engineering/_index.md"
        → "https://handbook.gitlab.com/handbook/engineering/"

        "content/handbook/engineering/releases.md"
        → "https://handbook.gitlab.com/handbook/engineering/releases/"

    Args:
        file_path: Repository-relative path.

    Returns:
        A fully-qualified https URL ending with a trailing slash.
    """
    # 1. Drop the leading "content/" prefix.
    path = file_path.removeprefix("content/")

    # 2. Split into directory segments and the filename.
    parts = path.split("/")
    filename = parts[-1]
    dir_parts = parts[:-1]

    if filename == "_index.md":
        # _index.md represents the directory itself → no extra path segment.
        url_path = "/".join(dir_parts) + "/"
    else:
        # A regular page → add the filename (without extension) as a segment.
        page_name = filename.removesuffix(".md")
        url_path = "/".join(dir_parts) + "/" + page_name + "/"

    return f"https://handbook.gitlab.com/{url_path}"