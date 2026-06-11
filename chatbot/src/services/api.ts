import { API_ROUTES } from '@/utils/constants';
import type {
  LoginPayload,
  RegisterPayload,
  User,
  CreateChatResponse,
  GetChatResponse,
} from '@/types';

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const body = await res.json();
      if (body?.error) message = body.error;
    } catch {}
    throw new Error(message);
  }
  return res.json();
}

export const api = {
  // ── Auth ─────────────────────────────────────────────────────────────────

  async login(payload: LoginPayload): Promise<{ username: string }> {
    const res = await fetch(API_ROUTES.LOGIN, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      credentials: 'include',
    });
    return handleResponse(res);
  },

  async register(payload: RegisterPayload): Promise<{ username: string }> {
    const res = await fetch(API_ROUTES.REGISTER, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      credentials: 'include',
    });
    return handleResponse(res);
  },

  // ── User ─────────────────────────────────────────────────────────────────

  async getUser(): Promise<User> {
    const res = await fetch(API_ROUTES.USER, { credentials: 'include' });
    return handleResponse(res);
  },

  // ── Chat ─────────────────────────────────────────────────────────────────

  async createChat(query: string): Promise<CreateChatResponse> {
    const res = await fetch(API_ROUTES.CHAT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }),
      credentials: 'include',
    });
    return handleResponse(res);
  },

  async getChat(chatId: string): Promise<GetChatResponse> {
    const res = await fetch(`${API_ROUTES.CHAT}?chat_id=${chatId}`, {
      credentials: 'include',
    });
    return handleResponse(res);
  },

  async deleteChat(chatId: string): Promise<{ success: boolean }> {
    const res = await fetch(API_ROUTES.CHAT, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chatId }),
      credentials: 'include',
    });
    return handleResponse(res);
  },

  // ── Streaming completion ─────────────────────────────────────────────────

  async streamCompletion(
    chatId: string,
    query: string,
    onChunk: (chunk: string) => void,
    onDone: () => void,
    onError: (err: Error) => void
  ): Promise<void> {
    try {
      const res = await fetch(API_ROUTES.COMPLETIONS, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chatId, query }),
        credentials: 'include',
      });

      if (!res.ok) {
        let message = `Stream failed (${res.status})`;
        try {
          const body = await res.json();
          if (body?.error) message = body.error;
        } catch {}
        throw new Error(message);
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error('No readable stream');

      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        onChunk(chunk);
      }

      onDone();
    } catch (err) {
      onError(err instanceof Error ? err : new Error('Streaming failed'));
    }
  },
};