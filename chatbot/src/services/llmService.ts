// ─────────────────────────────────────────────────────────────────────────────
//  services/llmService.ts
//
//  Thin wrapper around the OpenAI SDK configured to point at Google's
//  Gemini OpenAI-compatible endpoint.
//
//  Why OpenAI SDK + Gemini?
//  Google exposes Gemini models through an OpenAI-compatible REST API.
//  Using the OpenAI SDK means we get streaming helpers, type safety, and
//  retry logic for free, just by changing `baseURL` and `apiKey`.
// ─────────────────────────────────────────────────────────────────────────────

import OpenAI from "openai";
import type { IMessage } from "@/types";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY as string;

if (!GEMINI_API_KEY) {
  throw new Error(
    "Please define the GEMINI_API_KEY environment variable in .env.local"
  );
}

/** The Gemini model we are using. Lite = fastest and cheapest. */
const MODEL = "gemini-3.1-flash-lite";

/**
 * OpenAI SDK client pointed at Google's OpenAI-compatible Gemini endpoint.
 * Created once at module load time and reused for every request.
 */
const geminiClient = new OpenAI({
  apiKey: GEMINI_API_KEY,
  baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
});

// ── Streaming completion ──────────────────────────────────────────────────────

/**
 * Sends a list of messages to Gemini and returns a streaming response.
 *
 * The stream is a standard `ReadableStream<Uint8Array>` that the Route
 * Handler can return directly as an HTTP response body.
 *
 * @param messages - Full conversation history including system prompt.
 * @returns A `ReadableStream` that yields plain-text chunks.
 */
export async function streamCompletion(
  messages: IMessage[]
): Promise<ReadableStream<Uint8Array>> {
  // Cast to the type the OpenAI SDK expects.
  const openAIMessages = messages.map((m) => ({
    role: m.role,
    content: m.content,
  }));

  // Request a streaming completion from Gemini via the OpenAI-compatible API.
  const geminiStream = await geminiClient.chat.completions.create({
    model: MODEL,
    messages: openAIMessages,
    stream: true,
  });

  // Wrap the OpenAI async iterable in a standard Web API ReadableStream.
  // This lets Next.js return it directly as the response body.
  const encoder = new TextEncoder();

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const chunk of geminiStream) {
          const text = chunk.choices[0]?.delta?.content ?? "";
          if (text) {
            controller.enqueue(encoder.encode(text));
          }
        }
        controller.close();
      } catch (err) {
        controller.error(err);
      }
    },
  });
}

/**
 * Same as `streamCompletion` but also collects all chunks into a string.
 *
 * This is used in the completions Route Handler where we need to:
 *  1. Stream chunks to the client in real-time.
 *  2. Collect the full response to save to the database afterwards.
 *
 * @param messages  - Full conversation history.
 * @param onChunk   - Called for each text chunk as it arrives.
 * @returns The full assembled response string.
 */
export async function streamCompletionWithCollection(
  messages: IMessage[],
  onChunk: (chunk: string) => void
): Promise<string> {
  const openAIMessages = messages.map((m) => ({
    role: m.role,
    content: m.content,
  }));

  const geminiStream = await geminiClient.chat.completions.create({
    model: MODEL,
    messages: openAIMessages,
    stream: true,
  });

  let fullContent = "";

  for await (const chunk of geminiStream) {
    const text = chunk.choices[0]?.delta?.content ?? "";
    if (text) {
      fullContent += text;
      onChunk(text);
    }
  }

  return fullContent;
}

// ── Non-streaming completion ──────────────────────────────────────────────────

/**
 * Sends a list of messages to Gemini and returns the full response string
 * in one shot (no streaming).
 *
 * Used for lightweight internal tasks (e.g. query rewriting) where we need
 * the complete output before proceeding and don't need to stream to a client.
 *
 * @param messages - Full conversation history including system prompt.
 * @returns The complete response text.
 */
export async function generateCompletion(messages: IMessage[]): Promise<string> {
  const openAIMessages = messages.map((m) => ({
    role: m.role as "system" | "user" | "assistant",
    content: m.content,
  }));

  const response = await geminiClient.chat.completions.create({
    model: MODEL,
    messages: openAIMessages,
    stream: false,
  });

  return response.choices[0]?.message?.content ?? "";
}