// ─────────────────────────────────────────────────────────────────────────────
//  services/chatService.ts
//
//  All database operations related to chats live here.
// ─────────────────────────────────────────────────────────────────────────────

import { ChatModel } from "@/models/Chat";
import type { IChatDocument } from "@/models/Chat";
import type { IMessage } from "@/types";

// ── Constants ─────────────────────────────────────────────────────────────────

/**
 * The system prompt stored as the first message in every new chat.
 * This message teaches the AI how to behave and is persisted in the database
 * so it is automatically included in every subsequent completion request.
 */
export const SYSTEM_PROMPT: IMessage = {
  role: "system",
  content: `You are a GitLab Handbook assistant.

You have access to:
1. The current conversation history.
2. Retrieved GitLab Handbook content.

Rules:

- If the user asks about GitLab Handbook information, answer ONLY using the provided retrieved context.
- Do NOT use your own knowledge for GitLab Handbook answers.
- If the answer is not present in the retrieved context, then look for answers in the conversation history
- if you still can't find revelant context then say:
  "This information is not available in the GitLab Handbook content I have access to."

- If the user asks about the current conversation (for example: "What was my previous question?", "Summarize our chat", "What did you just tell me?"), answer using the conversation history instead of the retrieved context.

- Always cite source URLs (not all but the relevant ones) that appear in the retrieved context whenever you provide GitLab Handbook information.

- Never invent handbook information.`,
};

// ── Title generation ──────────────────────────────────────────────────────────

/**
 * Derives a chat title from the user's first query.
 * Truncates to 50 characters without calling any LLM.
 *
 * @param query - The first user message.
 * @returns A trimmed title string.
 */
export function generateChatTitle(query: string): string {
  return query.trim().slice(0, 50);
}

// ── Read ──────────────────────────────────────────────────────────────────────

/**
 * Fetches a chat by its ObjectId string.
 *
 * @param chatId - String form of the MongoDB ObjectId.
 * @returns The chat document or `null`.
 */
export async function findChatById(
  chatId: string
): Promise<IChatDocument | null> {
  return ChatModel.findById(chatId);
}

// ── Create ────────────────────────────────────────────────────────────────────

/**
 * Creates a new Chat document.
 *
 * The chat is initialised with:
 *  1. A title derived from the user's first query.
 *  2. The permanent system message as the first entry in `messages`.
 *
 * @param query - The user's first query (used for title + system prompt).
 * @returns The newly saved chat document.
 */
export async function createChat(query: string): Promise<IChatDocument> {
  const title = generateChatTitle(query);

  const chat = new ChatModel({
    title,
    messages: [SYSTEM_PROMPT], // system message is always first
  });

  return chat.save();
}

// ── Update ────────────────────────────────────────────────────────────────────

/**
 * Appends a single message to the chat's messages array and saves.
 *
 * @param chatId  - The chat's ObjectId string.
 * @param message - The message to append.
 * @returns The updated chat document, or `null` if not found.
 */
export async function appendMessageToChat(
  chatId: string,
  message: IMessage
): Promise<IChatDocument | null> {
  return ChatModel.findByIdAndUpdate(
    chatId,
    { $push: { messages: message } },
    { new: true } // return the updated document
  );
}

// ── Delete ────────────────────────────────────────────────────────────────────

/**
 * Deletes a chat document.
 *
 * @param chatId - The chat's ObjectId string.
 * @returns `true` if a document was deleted, `false` otherwise.
 */
export async function deleteChat(chatId: string): Promise<boolean> {
  const result = await ChatModel.findByIdAndDelete(chatId);
  return result !== null;
}