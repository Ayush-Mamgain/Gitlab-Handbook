// ─────────────────────────────────────────────────────────────────────────────
//  lib/response.ts
//
//  Tiny helpers for returning consistent JSON responses and error shapes
//  from every Route Handler.  Centralising this means a single change fixes
//  the format everywhere.
// ─────────────────────────────────────────────────────────────────────────────

import { NextResponse } from "next/server";

/**
 * Returns a JSON success response.
 *
 * @param data   - The payload to serialise.
 * @param status - HTTP status code (default 200).
 */
export function successResponse<T>(data: T, status = 200): NextResponse {
  return NextResponse.json(data, { status });
}

/**
 * Returns a JSON error response with a consistent `{ error: string }` shape.
 *
 * @param message - Human-readable error description.
 * @param status  - HTTP status code (default 500).
 */
export function errorResponse(message: string, status = 500): NextResponse {
  return NextResponse.json({ error: message }, { status });
}