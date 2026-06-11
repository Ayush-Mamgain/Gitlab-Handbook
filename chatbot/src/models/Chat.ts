// ─────────────────────────────────────────────────────────────────────────────
//  models/Chat.ts
//
//  Mongoose schema and model for the Chat collection.
//
//  Messages are embedded directly inside Chat (no separate collection).
//  This keeps related data together and avoids extra round-trips for the
//  common "load a chat with all its messages" query.
// ─────────────────────────────────────────────────────────────────────────────

import mongoose, { Document, Model, Schema } from "mongoose";
import type { MessageRole } from "@/types";

// ── Sub-document interface ────────────────────────────────────────────────────

/** A single message embedded inside a Chat document. */
export interface IMessageSubDoc {
  role: MessageRole;
  content: string;
}

// ── Document interface ────────────────────────────────────────────────────────

/** Represents a full Chat document as returned by Mongoose. */
export interface IChatDocument extends Document {
  title: string;
  messages: IMessageSubDoc[];
}

// ── Schemas ───────────────────────────────────────────────────────────────────

/**
 * Schema for an individual message.
 * `_id: false` prevents Mongoose from adding an `_id` to every message
 * sub-document, keeping the stored data lean.
 */
const MessageSchema = new Schema<IMessageSubDoc>(
  {
    role: {
      type: String,
      enum: ["system", "user", "assistant"] satisfies MessageRole[],
      required: [true, "Message role is required"],
    },
    content: {
      type: String,
      required: [true, "Message content is required"],
    },
  },
  { _id: false } // no separate _id for each message
);

const ChatSchema = new Schema<IChatDocument>(
  {
    title: {
      type: String,
      required: [true, "Chat title is required"],
      trim: true,
    },
    messages: {
      type: [MessageSchema],
      default: [],
    },
  },
  {
    timestamps: true, // adds createdAt / updatedAt
  }
);

// ── Model ─────────────────────────────────────────────────────────────────────

export const ChatModel: Model<IChatDocument> =
  mongoose.models.Chat ?? mongoose.model<IChatDocument>("Chat", ChatSchema);