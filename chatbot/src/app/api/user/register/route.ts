// ─────────────────────────────────────────────────────────────────────────────
//  app/api/user/register/route.ts  →  POST /api/user/register
//
//  Behaviour:
//  - If the username does not exist  → create account + set JWT cookie.
//  - If the username already exists  → verify password + set JWT cookie.
//    This makes the register endpoint work as a combined register/login.
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest } from "next/server";
import { connectDB } from "@/lib/db";
import { signToken } from "@/lib/jwt";
import { setAuthCookie } from "@/lib/cookies";
import { successResponse, errorResponse } from "@/lib/response";
import {
  findUserByUsername,
  createUser,
  verifyPassword,
} from "@/services/userService";
import type { RegisterUserReq, AuthResponse } from "@/types";

export async function POST(request: NextRequest) {
  try {
    // ── Parse & validate body ─────────────────────────────────────────────────
    const body = (await request.json()) as Partial<RegisterUserReq>;

    const username = body.username?.trim();
    const password = body.password;

    if (!username || !password) {
      return errorResponse("username and password are required", 400);
    }

    if (username.length < 3) {
      return errorResponse("Username must be at least 3 characters", 400);
    }

    if (password.length < 6) {
      return errorResponse("Password must be at least 6 characters", 400);
    }

    // ── Connect to DB ─────────────────────────────────────────────────────────
    await connectDB();

    // ── Check if user exists ──────────────────────────────────────────────────
    const existingUser = await findUserByUsername(username);

    let userId: string;
    let responseUsername: string;

    if (!existingUser) {
      // ── New user: create account ──────────────────────────────────────────
      const newUser = await createUser(username, password);
      userId = newUser._id.toString();
      responseUsername = newUser.username;
    } else {
      // ── Existing user: verify password (act like login) ───────────────────
      const passwordMatch = await verifyPassword(password, existingUser.password);
      if (!passwordMatch) {
        return errorResponse("Invalid credentials", 401);
      }
      userId = existingUser._id.toString();
      responseUsername = existingUser.username;
    }

    // ── Issue JWT + set cookie ────────────────────────────────────────────────
    const token = signToken({ userId, username: responseUsername });
    await setAuthCookie(token);

    const responseBody: AuthResponse = { username: responseUsername };
    return successResponse(responseBody, existingUser ? 200 : 201);
  } catch (err) {
    console.error("[POST /api/user/register]", err);
    return errorResponse("Internal server error", 500);
  }
}