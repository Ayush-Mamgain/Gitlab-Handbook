// ─────────────────────────────────────────────────────────────────────────────
//  services/userService.ts
//
//  All database operations related to users live here.
//  Route Handlers import these functions instead of touching Mongoose directly,
//  which keeps the handlers thin and the business logic testable.
// ─────────────────────────────────────────────────────────────────────────────

import bcrypt from "bcrypt";
import { UserModel } from "@/models/User";
import type { IUserDocument } from "@/models/User";

/** bcrypt cost factor – 10 is the recommended baseline. */
const SALT_ROUNDS = 10;

// ── Read ──────────────────────────────────────────────────────────────────────

/**
 * Finds a user by their username (case-insensitive because we lowercase on
 * save).
 *
 * @param username - The username to search for.
 * @returns The user document, or `null` if not found.
 */
export async function findUserByUsername(
  username: string
): Promise<IUserDocument | null> {
  return UserModel.findOne({ username: username.toLowerCase().trim() });
}

/**
 * Finds a user by their MongoDB ObjectId.
 *
 * @param userId - The string form of the ObjectId.
 * @returns The user document, or `null` if not found.
 */
export async function findUserById(
  userId: string
): Promise<IUserDocument | null> {
  return UserModel.findById(userId);
}

// ── Write ─────────────────────────────────────────────────────────────────────

/**
 * Creates a new user, hashing the password before saving.
 *
 * @param username - Plain-text username.
 * @param password - Plain-text password (will be hashed).
 * @returns The newly created user document.
 */
export async function createUser(
  username: string,
  password: string
): Promise<IUserDocument> {
  const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);

  const user = new UserModel({
    username: username.toLowerCase().trim(),
    password: hashedPassword,
    chats: [],
  });

  return user.save();
}

/**
 * Pushes a chat ObjectId into the user's `chats` array.
 *
 * @param userId - The user's string ObjectId.
 * @param chatId - The chat's string ObjectId.
 */
export async function addChatToUser(
  userId: string,
  chatId: string
): Promise<void> {
  await UserModel.findByIdAndUpdate(userId, { $push: { chats: chatId } });
}

/**
 * Removes a chat ObjectId from the user's `chats` array.
 *
 * @param userId - The user's string ObjectId.
 * @param chatId - The chat's string ObjectId.
 */
export async function removeChatFromUser(
  userId: string,
  chatId: string
): Promise<void> {
  await UserModel.findByIdAndUpdate(userId, { $pull: { chats: chatId } });
}

// ── Auth helpers ──────────────────────────────────────────────────────────────

/**
 * Compares a plain-text password against a bcrypt hash.
 *
 * @param plain  - The password the user typed.
 * @param hashed - The hash stored in the database.
 * @returns `true` if they match.
 */
export async function verifyPassword(
  plain: string,
  hashed: string
): Promise<boolean> {
  return bcrypt.compare(plain, hashed);
}