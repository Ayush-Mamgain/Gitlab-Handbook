// ─────────────────────────────────────────────────────────────────────────────
//  lib/db.ts
//
//  Manages a single Mongoose connection across all Next.js hot-reloads in
//  development, and across serverless function invocations in production.
//
//  Why the global cache?
//  Next.js in development mode re-imports modules on every request, which
//  would create a new MongoDB connection each time.  We stash the connection
//  promise on the Node.js `global` object so it survives module re-imports.
// ─────────────────────────────────────────────────────────────────────────────

import mongoose from "mongoose";

const MONGODB_URI = process.env.MONGODB_URI as string;

if (!MONGODB_URI) {
  throw new Error(
    "Please define the MONGODB_URI environment variable in .env.local"
  );
}

// Extend the global Node.js namespace so TypeScript knows about our cache.
declare global {
  // eslint-disable-next-line no-var
  var mongooseCache: {
    conn: typeof mongoose | null;
    promise: Promise<typeof mongoose> | null;
  };
}

// Initialise the cache on first load.
if (!global.mongooseCache) {
  global.mongooseCache = { conn: null, promise: null };
}

/**
 * Returns a resolved Mongoose instance.
 * Call this at the top of every Route Handler that touches the database.
 */
export async function connectDB(): Promise<typeof mongoose> {

  console.log("Mongo URI:", MONGODB_URI);
  // Already connected – return immediately.
  if (global.mongooseCache.conn) {
    return global.mongooseCache.conn;
  }

  // Connection in progress – wait for it.
  if (!global.mongooseCache.promise) {
    global.mongooseCache.promise = mongoose
      .connect(MONGODB_URI, {
        // Recommended options for serverless environments.
        bufferCommands: false,
      })
      .then((mongooseInstance) => {
        console.log("✅ MongoDB connected");
        return mongooseInstance;
      })
      .catch((err) => {
        // Reset the promise so the next call retries.
        global.mongooseCache.promise = null;
        throw err;
      });
  }

  global.mongooseCache.conn = await global.mongooseCache.promise;
  return global.mongooseCache.conn;
}