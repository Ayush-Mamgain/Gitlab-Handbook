// ─────────────────────────────────────────────────────────────────────────────
//  services/ragService.ts
//
//  Client for the external Python RAG microservice.
//  Keeps all HTTP communication in one place so it is easy to swap later.
// ─────────────────────────────────────────────────────────────────────────────

import type { RagChunk } from "@/types";

const RAG_SERVICE_URL = process.env.RAG_SERVICE_URL as string;

if (!RAG_SERVICE_URL) {
  throw new Error(
    "Please define the RAG_SERVICE_URL environment variable in .env.local"
  );
}

// ── Search ────────────────────────────────────────────────────────────────────

/**
 * Calls the RAG microservice to retrieve the most relevant handbook chunks
 * for a given query.
 *
 * @param query - The user's search query.
 * @param topK  - How many chunks to retrieve (default 10).
 * @returns An array of ranked `RagChunk` objects.
 */
export async function searchRag(
  query: string,
  topK = 10
): Promise<RagChunk[]> {
  const url = `${RAG_SERVICE_URL}/search`;

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, top_k: topK }),
    // Disable Next.js fetch caching so every request hits the RAG service.
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(
      `RAG service responded with status ${response.status}: ${await response.text()}`
    );
  }

  const chunks: RagChunk[] = await response.json();
  return chunks;
}

// ── Context builder ───────────────────────────────────────────────────────────

/**
 * Converts an array of RAG chunks into a plain-text context block that can be
 * injected into the LLM prompt.
 *
 * Format per chunk:
 * ```
 * Chunk N
 *
 * Title: <title>
 * URL: <url>
 * Section: <section_path joined with " > ">
 * File: <file_path>
 *
 * Content:
 * <content>
 * ```
 *
 * @param chunks - The chunks returned by `searchRag`.
 * @returns A formatted multi-line string.
 */
export function buildContextString(chunks: RagChunk[]): string {
  if (chunks.length === 0) {
    return "No relevant context was found in the GitLab Handbook.";
  }

  return chunks
    .map((chunk, index) => {
      const sectionPath = chunk.metadata.section_path.join(" > ");
      return [
        `Chunk ${index + 1}`,
        "",
        `Title: ${chunk.metadata.title}`,
        `URL: ${chunk.metadata.url}`,
        `Section: ${sectionPath}`,
        `File: ${chunk.metadata.file_path}`,
        "",
        "Content:",
        chunk.content,
      ].join("\n");
    })
    .join("\n\n---\n\n");
}