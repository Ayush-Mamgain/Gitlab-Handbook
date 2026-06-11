// ─────────────────────────────────────────────────────────────────────────────
//  models/User.ts
//
//  Mongoose schema and model for the User collection.
//
//  Notes:
//  - `chats` stores an array of ObjectId references to Chat documents.
//  - We guard against model re-registration during Next.js hot-reloads by
//    checking `mongoose.models` before calling `mongoose.model(...)`.
// ─────────────────────────────────────────────────────────────────────────────

import mongoose, { Document, Model, Schema } from "mongoose";

// ── Document interface ────────────────────────────────────────────────────────

/**
 * Represents a single User document as returned by Mongoose.
 * The `Document` generic gives us `.save()`, `.toObject()`, etc.
 */
export interface IUserDocument extends Document {
  username: string;
  password: string;              // always bcrypt-hashed, never plain-text
  chats: mongoose.Types.ObjectId[];
}

// ── Schema ────────────────────────────────────────────────────────────────────

const UserSchema = new Schema<IUserDocument>(
  {
    username: {
      type: String,
      required: [true, "Username is required"],
      unique: true,              // enforced at the database level
      trim: true,
      lowercase: true,           // store usernames as lowercase for consistency
      minlength: [3, "Username must be at least 3 characters"],
    },
    password: {
      type: String,
      required: [true, "Password is required"],
    },
    chats: [
      {
        type: Schema.Types.ObjectId,
        ref: "Chat",             // enables .populate("chats") if needed later
      },
    ],
  },
  {
    timestamps: true,            // adds createdAt / updatedAt automatically
  }
);

// ── Model ─────────────────────────────────────────────────────────────────────

// Guard against "Cannot overwrite model once compiled" error in dev mode.
export const UserModel: Model<IUserDocument> =
  mongoose.models.User ?? mongoose.model<IUserDocument>("User", UserSchema);