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