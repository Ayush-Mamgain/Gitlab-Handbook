// ─────────────────────────────────────────────────────────────────────────────
//  app/api/chat/completions/route.ts  →  POST /api/chat/completions
//
//  Full RAG + streaming completion flow:
//
//  1.  Authenticate the request.
//  2.  Save the user message to the database immediately.
//  3.  Rewrite the user query using the LLM (with full conversation history,
//      excluding the system prompt) to produce a query optimised for RAG
//      retrieval.
//  4.  Call the Python RAG service with the rewritten query to retrieve
//      relevant handbook chunks.
//  5.  Build a context string from the retrieved chunks.
//  6.  Load the stored conversation history from the database.
//  7.  Construct the final messages array:
//        [system prompt, ...history, context injection, user query]
//  8.  Stream the Gemini response back to the client.
//  9.  After the stream finishes, save the full assistant reply to the DB.
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest } from "next/server";
import { connectDB } from "@/lib/db";
import { requireAuth } from "@/middleware/auth";
import { errorResponse } from "@/lib/response";
import { findChatById, appendMessageToChat } from "@/services/chatService";
import { searchRag, buildContextString } from "@/services/ragService";
import {
  streamCompletionWithCollection,
  generateCompletion,
} from "@/services/llmService";
import type { ChatCompletionReq, IMessage } from "@/types";

// ── Query-rewriting prompt ────────────────────────────────────────────────────
//
//  This system prompt is used exclusively for the query-rewriting step.
//  It instructs the model to produce a single, self-contained search query
//  by resolving pronouns / references using the conversation history.
//  The rewritten query is never shown to the user.

const REWRITE_SYSTEM_PROMPT = `You are a search-query optimisation assistant.
Your sole job is to rewrite the user's latest message into a single, concise, self-contained search query that is optimised for semantic (vector) retrieval against a GitLab Handbook knowledge base.

Rules:
- Resolve any pronouns or references (e.g. "it", "that", "this approach") using the conversation history.
- Remove conversational filler (greetings, politeness phrases, etc.).
- Preserve all technical terms, proper nouns, and domain-specific vocabulary exactly.
- Fix grammatical errors.
- Output ONLY the rewritten query — no explanation, no preamble, no punctuation beyond what belongs in the query itself.`;

export async function POST(request: NextRequest) {
  try {
    // ── Auth ──────────────────────────────────────────────────────────────────
    const auth = await requireAuth(request);
    if (!auth.authenticated) return auth.response;

    // ── Parse body ────────────────────────────────────────────────────────────
    const body = (await request.json()) as Partial<ChatCompletionReq>;
    const chatId = body.chatId?.trim();
    const query = body.query?.trim();

    if (!chatId || !query) {
      return errorResponse("chatId and query are required", 400);
    }

    // ── Connect to DB ─────────────────────────────────────────────────────────
    await connectDB();

    // ── Load chat ─────────────────────────────────────────────────────────────
    const chat = await findChatById(chatId);

    if (!chat) {
      return errorResponse("Chat not found", 404);
    }

    // ── Step 2: Save user message immediately ─────────────────────────────────
    const userMessage: IMessage = { role: "user", content: query };
    await appendMessageToChat(chatId, userMessage);

    // ── Step 3: Rewrite the query for RAG retrieval ───────────────────────────
    //
    //  We send:
    //    [0]     the rewriting system prompt  (role: "system")
    //    [1..n]  the full conversation history excluding the system prompt
    //            (so the model can resolve any references / pronouns)
    //    [n+1]   the current user query       (role: "user")
    //
    //  chat.messages[0] is always the main system prompt, so we slice it off.

    const conversationHistory: IMessage[] = chat.messages
      .slice(1) // drop the main system prompt
      .map((m) => ({ role: m.role, content: m.content }));

    const rewriteMessages: IMessage[] = [
      { role: "system", content: REWRITE_SYSTEM_PROMPT },
      ...conversationHistory,
      { role: "user", content: query },
    ];

    let rewrittenQuery = query; // fallback: use original if rewrite fails
    try {
      const result = await generateCompletion(rewriteMessages);
      if (result.trim()) {
        rewrittenQuery = result.trim();
      }
      console.log("[Completions] Original query :", query);
      console.log("[Completions] Rewritten query:", rewrittenQuery);
    } catch (rewriteErr) {
      // Non-fatal — log and continue with the original query so the user
      // still gets a response.
      console.error(
        "[Completions] Query rewriting failed, falling back to original query:",
        rewriteErr
      );
    }

    // ── Step 4: Call RAG service with the rewritten query ─────────────────────
    let ragChunks;
    try {
      ragChunks = await searchRag(rewrittenQuery, 10);
    } catch (ragErr) {
      console.error("[Completions] RAG service error:", ragErr);
      return errorResponse("Failed to retrieve context from RAG service", 502);
    }

    // ── Step 5: Build context string ──────────────────────────────────────────
    const contextString = buildContextString(ragChunks);

    // ── Step 6: Build final messages array ────────────────────────────────────
    //
    //  Structure:
    //    [0]     system message (already stored in chat.messages[0])
    //    [1..n]  previous user/assistant messages (excluding system)
    //    [n+1]   context injection as a "user" turn
    //    [n+2]   current user query
    //
    //  The system prompt is already the first element of chat.messages, so we
    //  just include the full stored history plus the context + new query.

    // Grab all stored messages (includes system prompt + prior conversation).
    // We already appended the user message above so we re-load from the object
    // in memory (the chat we loaded before the append).
    const storedHistory: IMessage[] = chat.messages.map((m) => ({
      role: m.role,
      content: m.content,
    }));

    // Inject the retrieved context as a user turn so the model can reference it.
    const contextInjection: IMessage = {
      role: "user",
      content: `Here is the relevant context retrieved from the GitLab Handbook:\n\n${contextString}`,
    };

    // The final query repeats the user's question so the model stays focused.
    const finalQuery: IMessage = {
      role: "user",
      content: query,
    };

    const messagesToSend: IMessage[] = [
      ...storedHistory,
      contextInjection,
      finalQuery,
    ];

    // ── Steps 7-9: Stream response + collect + save ───────────────────────────
    //
    //  We use a TransformStream so we can:
    //    - Write chunks to the response as they arrive (client sees them live).
    //    - Collect the full text to save to the database after streaming ends.

    const encoder = new TextEncoder();
    let fullAssistantReply = "";

    const readableStream = new ReadableStream<Uint8Array>({
      async start(controller) {
        try {
          // Stream from Gemini, collecting the full response as we go.
          fullAssistantReply = await streamCompletionWithCollection(
            messagesToSend,
            (chunk) => {
              // Push each chunk to the client immediately.
              controller.enqueue(encoder.encode(chunk));
            }
          );

          controller.close();
        } catch (streamErr) {
          console.error("[Completions] Streaming error:", streamErr);
          controller.error(streamErr);
        } finally {
          // ── Step 9: Save assistant message after stream completes ───────────
          // We do this inside `finally` so it always runs even if the client
          // disconnects mid-stream (we still want to persist what we got).
          if (fullAssistantReply) {
            try {
              const assistantMessage: IMessage = {
                role: "assistant",
                content: fullAssistantReply,
              };
              await appendMessageToChat(chatId, assistantMessage);
            } catch (saveErr) {
              // Log but don't crash – the client already received the stream.
              console.error(
                "[Completions] Failed to save assistant message:",
                saveErr
              );
            }
          }
        }
      },
    });

    // Return the stream as a plain-text HTTP response.
    return new Response(readableStream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        // Disable buffering on Vercel/nginx so chunks reach the client ASAP.
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "no-cache",
        "Transfer-Encoding": "chunked",
      },
    });
  } catch (err) {
    console.error("[POST /api/chat/completions]", err);
    return errorResponse("Internal server error", 500);
  }
}