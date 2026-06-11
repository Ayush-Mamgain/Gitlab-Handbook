// ─────────────────────────────────────────────────────────────────────────────
//  lib/cookies.ts
//
//  Helper functions for reading and writing the JWT HttpOnly cookie.
//  Using Next.js built-in `cookies()` keeps everything server-side.
// ─────────────────────────────────────────────────────────────────────────────

import { cookies } from "next/headers";

/** The name of the cookie that holds the JWT. */
export const AUTH_COOKIE_NAME = "auth_token";

/** How long the cookie should live in the browser (7 days in seconds). */
const COOKIE_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;

/**
 * Writes the JWT into a secure, HttpOnly cookie.
 * Call this after a successful login or register.
 *
 * @param token - The signed JWT string.
 */
export async function setAuthCookie(token: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(AUTH_COOKIE_NAME, token, {
    httpOnly: true,           // JS cannot read this cookie
    secure: process.env.NODE_ENV === "production", // HTTPS only in prod
    sameSite: "lax",          // CSRF protection
    maxAge: COOKIE_MAX_AGE_SECONDS,
    path: "/",                // available on all routes
  });
}

/**
 * Reads the JWT from the cookie store.
 *
 * @returns The token string, or `null` if the cookie is not present.
 */
export async function getAuthCookie(): Promise<string | null> {
  const cookieStore = await cookies();
  const cookie = cookieStore.get(AUTH_COOKIE_NAME);
  return cookie?.value ?? null;
}

/**
 * Deletes the auth cookie (logout).
 */
export async function clearAuthCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(AUTH_COOKIE_NAME);
}