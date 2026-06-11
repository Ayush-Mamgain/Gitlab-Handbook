"""
parser.py
─────────
Parse a markdown document into a flat list of structured sections.

Each section represents a single heading (H1, H2, or H3) together with
the body text that follows it. The full ancestor heading chain is preserved
in the `section_path` field so downstream components know where in the
document hierarchy each piece of text lives.

Only H1/H2/H3 are treated as section boundaries; H4–H6 are left in the
body text as-is (they are rarely used in the GitLab handbook).

Example input:
    # Promotion Process
    Intro text.

    ## Eligibility
    Employees must meet...

    ## Timeline
    Reviews occur quarterly.

Example output (as ParsedSection objects):
    ParsedSection(title="Promotion Process",  level=1,
                  content="Intro text.",
                  section_path=["Promotion Process"])

    ParsedSection(title="Eligibility", level=2,
                  content="Employees must meet...",
                  section_path=["Promotion Process", "Eligibility"])

    ParsedSection(title="Timeline", level=2,
                  content="Reviews occur quarterly.",
                  section_path=["Promotion Process", "Timeline"])
"""

import re
from dataclasses import dataclass


# ─── Data model ──────────────────────────────────────────────────────────────

@dataclass
class ParsedSection:
    """A single heading + its body text, with full ancestor context."""

    title: str          # Text of the heading (no # symbols)
    level: int          # Heading level: 1, 2, or 3
    content: str        # Body text that follows this heading
    section_path: list[str]  # Breadcrumb from H1 → this heading


# ─── Regex patterns ──────────────────────────────────────────────────────────

# Matches YAML / TOML frontmatter blocks at the very beginning of a file.
#   --- ... ---   (YAML, used by Hugo / Jekyll)
#   +++ ... +++   (TOML, used by Hugo)
_FRONTMATTER_RE = re.compile(
    r"^\s*(?:---|\+\+\+).*?(?:---|\+\+\+)\s*",
    re.DOTALL,
)

# Matches H1, H2, or H3 headings at the start of a line.
# Group 1 → the '#' characters (length == heading level).
# Group 2 → the heading text.
_HEADING_RE = re.compile(r"^(#{1,3})\s+(.+)$")


# ─── Public API ──────────────────────────────────────────────────────────────

def parse_markdown(markdown_text: str) -> list[ParsedSection]:
    """
    Parse markdown into a list of ParsedSection objects.

    Steps:
        1. Strip YAML/TOML frontmatter.
        2. Walk the document line by line.
        3. When a heading is encountered, save the previous section and
           start a new one.
        4. Maintain a heading stack to produce the section_path breadcrumb.

    Content that appears before the first heading is attached to a synthetic
    "Overview" section at level 1, so it is never silently discarded.

    Args:
        markdown_text: Raw markdown string (may include frontmatter).

    Returns:
        A list of ParsedSection objects in document order.
        Returns an empty list if the document has no content.
    """
    # --- 1. Strip frontmatter ------------------------------------------------
    text = _FRONTMATTER_RE.sub("", markdown_text, count=1).strip()
    if not text:
        return []

    lines = text.split("\n")

    # --- 2. Walk lines -------------------------------------------------------
    sections: list[ParsedSection] = []

    # heading_stack stores (level, title) tuples for all open ancestor headings.
    # Example after "# A > ## B": [(1, "A"), (2, "B")]
    heading_stack: list[tuple[int, str]] = []

    # Accumulator for the current section being built.
    current_title: str | None = None
    current_level: int = 0
    current_section_path: list[str] = []
    current_lines: list[str] = []

    def _flush_section() -> None:
        """Save the accumulated section (if any) to the output list."""
        nonlocal current_title, current_level, current_section_path, current_lines

        if current_title is None:
            return

        content = "\n".join(current_lines).strip()
        # Include the section even if content is empty — the heading itself
        # may be meaningful, and the chunker will handle empty sections.
        sections.append(
            ParsedSection(
                title=current_title,
                level=current_level,
                content=content,
                section_path=current_section_path.copy(),
            )
        )

    for line in lines:
        heading_match = _HEADING_RE.match(line)

        if heading_match:
            # Save whatever was accumulated before this heading.
            _flush_section()

            level = len(heading_match.group(1))   # Number of '#' characters
            title = heading_match.group(2).strip()

            # Pop all headings at the same or deeper level from the stack so
            # that the breadcrumb stays consistent.
            # Example: if we see an H2 while the stack has [(1,"A"),(2,"B")],
            # we pop (2,"B") before pushing the new H2.
            while heading_stack and heading_stack[-1][0] >= level:
                heading_stack.pop()

            heading_stack.append((level, title))

            # Start a new section.
            current_title = title
            current_level = level
            current_section_path = [t for _, t in heading_stack]
            current_lines = []

        else:
            if current_title is None:
                # Content before the first heading → synthetic "Overview".
                current_title = "Overview"
                current_level = 1
                current_section_path = ["Overview"]
                heading_stack = [(1, "Overview")]

            current_lines.append(line)

    # Don't forget the very last section.
    _flush_section()

    return sections