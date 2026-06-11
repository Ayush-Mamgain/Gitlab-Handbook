// ─────────────────────────────────────────────────────────────────────────────
//  app/api/chat/route.ts
//
//  POST   /api/chat  → create a new chat
//  GET    /api/chat  → get a single chat by ?chat_id=...
//  DELETE /api/chat  → delete a chat
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest } from "next/server";
import { connectDB } from "@/lib/db";
import { requireAuth } from "@/middleware/auth";
import { successResponse, errorResponse } from "@/lib/response";
import { createChat, findChatById, deleteChat } from "@/services/chatService";
import { addChatToUser, removeChatFromUser } from "@/services/userService";
import type {
  CreateChatReq,
  CreateChatRes,
  GetChatRes,
  DeleteChatReq,
} from "@/types";

// ── POST /api/chat ────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    // ── Auth ──────────────────────────────────────────────────────────────────
    const auth = await requireAuth(request);
    if (!auth.authenticated) return auth.response;

    const { userId } = auth.user;

    // ── Parse body ────────────────────────────────────────────────────────────
    const body = (await request.json()) as Partial<CreateChatReq>;
    const query = body.query?.trim();

    if (!query) {
      return errorResponse("query is required", 400);
    }

    // ── Connect to DB ─────────────────────────────────────────────────────────
    await connectDB();

    // ── Create chat ───────────────────────────────────────────────────────────
    const chat = await createChat(query);
    const chatId = chat._id.toString();

    // ── Link chat to user ─────────────────────────────────────────────────────
    await addChatToUser(userId, chatId);

    const responseBody: CreateChatRes = {
      chatId,
      title: chat.title,
    };

    return successResponse(responseBody, 201);
  } catch (err) {
    console.error("[POST /api/chat]", err);
    return errorResponse("Internal server error", 500);
  }
}

// ── GET /api/chat?chat_id=... ─────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  try {
    // ── Auth ──────────────────────────────────────────────────────────────────
    const auth = await requireAuth(request);
    if (!auth.authenticated) return auth.response;

    // ── Read query param ──────────────────────────────────────────────────────
    const { searchParams } = new URL(request.url);
    const chatId = searchParams.get("chat_id");

    if (!chatId) {
      return errorResponse("chat_id query parameter is required", 400);
    }

    // ── Connect to DB ─────────────────────────────────────────────────────────
    await connectDB();

    // ── Load chat ─────────────────────────────────────────────────────────────
    const chat = await findChatById(chatId);

    if (!chat) {
      return errorResponse("Chat not found", 404);
    }

    const responseBody: GetChatRes = {
      chatId: chat._id.toString(),
      title: chat.title,
      messages: chat.messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
    };

    return successResponse(responseBody);
  } catch (err) {
    console.error("[GET /api/chat]", err);
    return errorResponse("Internal server error", 500);
  }
}

// ── DELETE /api/chat ──────────────────────────────────────────────────────────

export async function DELETE(request: NextRequest) {
  try {
    // ── Auth ──────────────────────────────────────────────────────────────────
    const auth = await requireAuth(request);
    if (!auth.authenticated) return auth.response;

    const { userId } = auth.user;

    // ── Parse body ────────────────────────────────────────────────────────────
    const body = (await request.json()) as Partial<DeleteChatReq>;
    const chatId = body.chatId?.trim();

    if (!chatId) {
      return errorResponse("chatId is required", 400);
    }

    // ── Connect to DB ─────────────────────────────────────────────────────────
    await connectDB();

    // ── Delete chat document ──────────────────────────────────────────────────
    const deleted = await deleteChat(chatId);

    if (!deleted) {
      return successResponse({ success: false });
    }

    // ── Remove reference from user ────────────────────────────────────────────
    await removeChatFromUser(userId, chatId);

    return successResponse({ success: true });
  } catch (err) {
    console.error("[DELETE /api/chat]", err);
    return errorResponse("Internal server error", 500);
  }
}