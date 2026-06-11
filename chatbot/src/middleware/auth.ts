// ─────────────────────────────────────────────────────────────────────────────
//  middleware/auth.ts
//
//  Authentication helper used inside Route Handlers.
//
//  Next.js 15 App Router does not support traditional Express-style middleware
//  that can short-circuit a request before the handler runs (the `middleware.ts`
//  file at the project root only handles edge-compatible logic and cannot
//  access cookies with full Node.js APIs in the same way).
//
//  Instead, we export a `requireAuth` helper that every protected Route Handler
//  calls at the top.  If the JWT is missing or invalid it returns an error
//  response immediately; otherwise it returns the decoded user info.
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest } from "next/server";
import { verifyToken } from "@/lib/jwt";
import { errorResponse } from "@/lib/response";
import { AUTH_COOKIE_NAME } from "@/lib/cookies";
import type { JwtPayload } from "@/types";

/** Discriminated union returned by `requireAuth`. */
type AuthResult =
  | { authenticated: true; user: JwtPayload }
  | { authenticated: false; response: ReturnType<typeof errorResponse> };

/**
 * Verifies the JWT cookie on an incoming request.
 *
 * Usage inside a Route Handler:
 * ```ts
 * const auth = await requireAuth(request);
 * if (!auth.authenticated) return auth.response;
 * const { userId } = auth.user;
 * ```
 *
 * @param request - The incoming Next.js request object.
 * @returns An `AuthResult` discriminated union.
 */
export async function requireAuth(request: NextRequest): Promise<AuthResult> {
  // Read the token directly from the request cookies (works in both
  // Edge and Node.js runtimes without awaiting `cookies()`).
  const token = request.cookies.get(AUTH_COOKIE_NAME)?.value;

  if (!token) {
    return {
      authenticated: false,
      response: errorResponse("Unauthorized", 401),
    };
  }

  try {
    const user = verifyToken(token);
    return { authenticated: true, user };
  } catch {
    // Token is expired, tampered with, or otherwise invalid.
    return {
      authenticated: false,
      response: errorResponse("Unauthorized", 401),
    };
  }
}