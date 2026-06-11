export const API_BASE = '/api';

export const ROUTES = {
  HOME: '/',
  LOGIN: '/login',
  REGISTER: '/register',
  CHAT: '/chat',
} as const;

export const API_ROUTES = {
  LOGIN: `${API_BASE}/user/login`,
  REGISTER: `${API_BASE}/user/register`,
  USER: `${API_BASE}/user`,
  CHAT: `${API_BASE}/chat`,
  COMPLETIONS: `${API_BASE}/chat/completions`,
} as const;