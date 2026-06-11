// ─────────────────────────────────────────────────────────────────────────────
//  app/api/user/route.ts  →  GET /api/user
//
//  Returns the authenticated user's profile and their list of chats
//  (id + title only – no messages).
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest } from "next/server";
import { connectDB } from "@/lib/db";
import { requireAuth } from "@/middleware/auth";
import { successResponse, errorResponse } from "@/lib/response";
import { findUserById } from "@/services/userService";
import { ChatModel } from "@/models/Chat";
import type { GetUserRes } from "@/types";

export async function GET(request: NextRequest) {
  try {
    // ── Auth check ────────────────────────────────────────────────────────────
    const auth = await requireAuth(request);
    if (!auth.authenticated) return auth.response;

    const { userId } = auth.user;

    // ── Connect to DB ─────────────────────────────────────────────────────────
    await connectDB();

    // ── Load user ─────────────────────────────────────────────────────────────
    const user = await findUserById(userId);

    if (!user) {
      return errorResponse("User not found", 404);
    }

    // ── Load chat summaries (id + title only) ─────────────────────────────────
    // We fetch only the fields we need to keep the payload small.
    const chatSummaries = await ChatModel.find(
      { _id: { $in: user.chats } },
      { _id: 1, title: 1, updatedAt: 1 }   // also project updatedAt
    )
      .sort({ updatedAt: -1 })              // -1 = descending (most recent first)
      .lean();                       // .lean() returns plain JS objects, faster

    const chats = chatSummaries.map((chat) => ({
      _id: chat._id.toString(),
      title: chat.title,
    }));

    const responseBody: GetUserRes = {
      username: user.username,
      chats,
    };

    return successResponse(responseBody);
  } catch (err) {
    console.error("[GET /api/user]", err);
    return errorResponse("Internal server error", 500);
  }
}