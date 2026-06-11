// ─────────────────────────────────────────────────────────────────────────────
//  lib/jwt.ts
//
//  Thin wrappers around the `jsonwebtoken` library so the rest of the app
//  never has to import or configure `jsonwebtoken` directly.
// ─────────────────────────────────────────────────────────────────────────────

import jwt from "jsonwebtoken";
import type { JwtPayload } from "@/types";

const JWT_SECRET = process.env.JWT_SECRET as string;
const JWT_EXPIRES_IN = "7d"; // tokens live for 7 days

if (!JWT_SECRET) {
  throw new Error(
    "Please define the JWT_SECRET environment variable in .env.local"
  );
}

/**
 * Creates a signed JWT token containing the user's id and username.
 *
 * @param payload - The data to embed in the token.
 * @returns A signed JWT string.
 */
export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

/**
 * Verifies a JWT token and returns the decoded payload.
 * Throws a `JsonWebTokenError` if the token is invalid or expired.
 *
 * @param token - The JWT string to verify.
 * @returns The decoded payload.
 */
export function verifyToken(token: string): JwtPayload {
  const decoded = jwt.verify(token, JWT_SECRET);
  return decoded as JwtPayload;
}