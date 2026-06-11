// ─────────────────────────────────────────────────────────────────────────────
//  Shared TypeScript types used across the entire application.
//  Keep all interfaces here so there is a single source of truth.
// ─────────────────────────────────────────────────────────────────────────────

// ── Message & Chat ────────────────────────────────────────────────────────────

/** The three roles that can appear in a chat message. */
export type MessageRole = "system" | "user" | "assistant";

/** A single message stored inside a Chat document. */
export interface IMessage {
  role: MessageRole;
  content: string;
}

/** A Chat document stored in MongoDB. */
export interface IChat {
  _id: string;
  title: string;
  messages: IMessage[];
}

/** A User document stored in MongoDB. */
export interface IUser {
  _id: string;
  username: string;
  password: string; // always bcrypt-hashed
  chats: string[];  // array of Chat _id strings
}

// ── Request / Response shapes ─────────────────────────────────────────────────

/** POST /user/register */
export interface RegisterUserReq {
  username: string;
  password: string;
}

/** POST /user/login */
export interface LoginUserReq {
  username: string;
  password: string;
}

/** Response returned after register or login. */
export interface AuthResponse {
  username: string;
}

/** GET /user response. */
export interface GetUserRes {
  username: string;
  chats: {
    _id: string;
    title: string;
  }[];
}

/** POST /chat request. */
export interface CreateChatReq {
  query: string;
}

/** POST /chat response. */
export interface CreateChatRes {
  chatId: string;
  title: string;
}

/** GET /chat response. */
export interface GetChatRes {
  chatId: string;
  title: string;
  messages: IMessage[];
}

/** DELETE /chat request. */
export interface DeleteChatReq {
  chatId: string;
}

/** POST /chat/completions request. */
export interface ChatCompletionReq {
  chatId: string;
  query: string;
}

// ── RAG Service ───────────────────────────────────────────────────────────────

/** Metadata attached to a RAG chunk. */
export interface RagChunkMetadata {
  url: string;
  title: string;
  section_path: string[];
  file_path: string;
}

/** A single result returned by the RAG microservice. */
export interface RagChunk {
  chunk_id: string;
  score: number;
  content: string;
  metadata: RagChunkMetadata;
}

// ── JWT Payload ───────────────────────────────────────────────────────────────

/** The data we embed inside every JWT token. */
export interface JwtPayload {
  userId: string;
  username: string;
}

// ── Middleware augmentation ───────────────────────────────────────────────────

/**
 * After the auth middleware runs it attaches the decoded JWT payload to the
 * request.  We expose it via a plain object so Route Handlers can receive it.
 */
export interface AuthenticatedRequest {
  userId: string;
  username: string;
}

export interface User {
  username: string;
  chats: ChatSummary[];
}
 
export interface ChatSummary {
  _id: string;
  title: string;
}
 
export interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
}
 
export interface Chat {
  chatId: string;
  title: string;
  messages: Message[];
}
 
export interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
}
 
export interface ChatState {
  chats: ChatSummary[];
  activeChatId: string | null;
  activeMessages: Message[];
  isLoading: boolean;
  isStreaming: boolean;
  error: string | null;
  streamingContent: string;
}
 
export interface LoginPayload {
  username: string;
  password: string;
}
 
export interface RegisterPayload {
  username: string;
  password: string;
}
 
export interface CreateChatResponse {
  chatId: string;
  title: string;
}
 
export interface GetChatResponse {
  chatId: string;
  title: string;
  messages: Message[];
}