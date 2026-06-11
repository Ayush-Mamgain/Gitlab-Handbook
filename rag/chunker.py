"""
chunker.py
──────────
Turn a list of ParsedSection objects into a list of Chunk objects suitable
for embedding and storage in Pinecone.

The BGE-large model has a hard 512-token context window. This module
enforces two rules derived from the specification:

  1. MERGE  — If a section's body has fewer than MIN_CHUNK_TOKENS tokens,
              it is merged forward into the next section.  This prevents
              tiny, context-free chunks from polluting search results.

  2. SPLIT  — If a section is too long (> MAX_CHUNK_TOKENS), its body is
              split into overlapping word-windows.  Overlap preserves context
              at chunk boundaries.

Token counting uses a lightweight word-count heuristic (words × 1.3) which
closely approximates BPE tokenisation without requiring a tokeniser.
"""

from dataclasses import dataclass

from config import CHUNK_OVERLAP_TOKENS, MAX_CHUNK_TOKENS, MIN_CHUNK_TOKENS
from parser import ParsedSection


# ─── Data model ──────────────────────────────────────────────────────────────

@dataclass
class Chunk:
    """
    A single embeddable unit of text, ready for Pinecone storage.

    Attributes:
        content:      The text that will be embedded (body of the section,
                      or a sub-window of it for long sections).
        title:        Heading of the first section contributing to this chunk.
        section_path: Breadcrumb list from H1 → this heading.
        file_path:    Repository-relative path of the source file.
        url:          Public handbook URL for citation.
    """

    content: str
    title: str
    section_path: list[str]
    file_path: str
    url: str


# ─── Token counting ──────────────────────────────────────────────────────────

def _count_tokens(text: str) -> int:
    """
    Estimate the BPE token count of *text*.

    BPE tokenisers typically produce ≈1.3 tokens per whitespace-delimited
    word (sub-word splits add extra tokens for long / rare words).  This
    approximation is accurate enough for chunking decisions and avoids
    loading a separate tokeniser process.

    Args:
        text: Any string.

    Returns:
        Estimated number of tokens (always ≥ 0).
    """
    return int(len(text.split()) * 1.3)


# ─── Merge pass ──────────────────────────────────────────────────────────────

def _merge_small_sections(sections: list[ParsedSection]) -> list[ParsedSection]:
    """
    Merge sections that are too short into the following section.

    Algorithm:
        Walk the list forward.  If the current section's body has fewer than
        MIN_CHUNK_TOKENS tokens, append its content to the *next* section
        rather than emitting it on its own.  If it is the last section, keep
        it as-is (there is nothing to merge into).

    The merged text includes a heading line so the body remains human-readable
    and the model can pick up semantic cues from the original heading.

    Args:
        sections: Flat list from parser.parse_markdown().

    Returns:
        A new list where every section (except possibly the last) has at
        least MIN_CHUNK_TOKENS tokens in its body.
    """
    if not sections:
        return []

    result: list[ParsedSection] = []
    i = 0

    while i < len(sections):
        section = sections[i]
        token_count = _count_tokens(section.content)

        # If too small AND there is a next section to absorb, merge forward.
        if token_count < MIN_CHUNK_TOKENS and i + 1 < len(sections):
            next_sec = sections[i + 1]

            # Build a combined body: current content + heading + next content.
            heading_line = "#" * next_sec.level + " " + next_sec.title
            combined_content = (
                (section.content + "\n\n" + heading_line + "\n" + next_sec.content)
                .strip()
            )

            # Replace the next entry in-place with the merged version, then
            # reprocess from position i (effectively skipping the current one).
            merged = ParsedSection(
                title=section.title,             # Retain first heading's title
                level=section.level,
                content=combined_content,
                section_path=section.section_path,
            )
            # Substitute the merge result into the list and retry.
            sections = sections[:i] + [merged] + sections[i + 2:]
            # Don't advance i — re-evaluate the merged section.

        else:
            result.append(section)
            i += 1

    return result


# ─── Split pass ──────────────────────────────────────────────────────────────

def _split_large_section(
    section: ParsedSection,
    file_path: str,
    url: str,
) -> list[Chunk]:
    """
    Split a section whose body exceeds MAX_CHUNK_TOKENS into overlapping chunks.

    Splitting is done at the word level (not byte/character level) to keep
    chunks semantically coherent.  Each window advances by
    (max_words − overlap_words) words, so consecutive chunks share a small
    context tail.

    Args:
        section:   A ParsedSection whose token count > MAX_CHUNK_TOKENS.
        file_path: Source file path (forwarded to each Chunk).
        url:       Public handbook URL (forwarded to each Chunk).

    Returns:
        A list of Chunk objects, each within the MAX_CHUNK_TOKENS budget.
    """
    # Convert token budgets to approximate word counts.
    max_words     = int(MAX_CHUNK_TOKENS     / 1.3)
    overlap_words = int(CHUNK_OVERLAP_TOKENS / 1.3)
    step          = max(1, max_words - overlap_words)  # Words to advance each iteration

    words = section.content.split()
    chunks: list[Chunk] = []
    start = 0

    while start < len(words):
        end        = min(start + max_words, len(words))
        chunk_text = " ".join(words[start:end])

        chunks.append(
            Chunk(
                content=chunk_text,
                title=section.title,
                section_path=section.section_path,
                file_path=file_path,
                url=url,
            )
        )

        if end == len(words):
            break  # Reached the end

        start += step

    return chunks


# ─── Public API ──────────────────────────────────────────────────────────────

def chunk_sections(
    sections: list[ParsedSection],
    file_path: str,
    url: str,
) -> list[Chunk]:
    """
    Convert a list of ParsedSection objects into embeddable Chunk objects.

    Pipeline:
        1. Merge sections that are too small (< MIN_CHUNK_TOKENS).
        2. For each merged section:
           a. If within budget → emit one Chunk directly.
           b. If over budget   → split into overlapping word-windows.

    Args:
        sections:  Output of parser.parse_markdown().
        file_path: Repository-relative path of the source file.
        url:       Public handbook URL for this file.

    Returns:
        A list of Chunk objects.  May be empty if all sections are empty.
    """
    chunks: list[Chunk] = []

    # --- Pass 1: merge small sections ----------------------------------------
    merged_sections = _merge_small_sections(sections)

    # --- Pass 2: emit or split -----------------------------------------------
    for section in merged_sections:
        # Skip sections with no usable body text.
        if not section.content.strip():
            continue

        if _count_tokens(section.content) > MAX_CHUNK_TOKENS:
            # Section is too long → split into overlapping sub-chunks.
            sub_chunks = _split_large_section(section, file_path, url)
            chunks.extend(sub_chunks)
        else:
            # Section fits within the token budget → emit as a single chunk.
            chunks.append(
                Chunk(
                    content=section.content,
                    title=section.title,
                    section_path=section.section_path,
                    file_path=file_path,
                    url=url,
                )
            )

    return chunks