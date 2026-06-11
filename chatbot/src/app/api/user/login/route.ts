// ─────────────────────────────────────────────────────────────────────────────
//  app/api/user/login/route.ts  →  POST /api/user/login
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest } from "next/server";
import { connectDB } from "@/lib/db";
import { signToken } from "@/lib/jwt";
import { setAuthCookie } from "@/lib/cookies";
import { successResponse, errorResponse } from "@/lib/response";
import { findUserByUsername, verifyPassword } from "@/services/userService";
import type { LoginUserReq, AuthResponse } from "@/types";

export async function POST(request: NextRequest) {
  try {
    // ── Parse & validate body ─────────────────────────────────────────────────
    const body = (await request.json()) as Partial<LoginUserReq>;

    const username = body.username?.trim();
    const password = body.password;

    if (!username || !password) {
      return errorResponse("username and password are required", 400);
    }

    // ── Connect to DB ─────────────────────────────────────────────────────────
    await connectDB();

    // ── Look up user ──────────────────────────────────────────────────────────
    const user = await findUserByUsername(username);

    if (!user) {
      // Return the same message for missing user and wrong password
      // so we don't leak which usernames exist.
      return errorResponse("Invalid credentials", 401);
    }

    // ── Verify password ───────────────────────────────────────────────────────
    const passwordMatch = await verifyPassword(password, user.password);

    if (!passwordMatch) {
      return errorResponse("Invalid credentials", 401);
    }

    // ── Issue JWT + set cookie ────────────────────────────────────────────────
    const token = signToken({
      userId: user._id.toString(),
      username: user.username,
    });
    await setAuthCookie(token);

    const responseBody: AuthResponse = { username: user.username };
    return successResponse(responseBody);
  } catch (err) {
    console.error("[POST /api/user/login]", err);
    return errorResponse("Internal server error", 500);
  }
}