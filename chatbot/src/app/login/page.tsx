'use client';

import { useState, useEffect, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAppDispatch } from '@/hooks/useAuth';
import { loginUser, fetchUser, clearAuthError } from '@/store/authSlice';
import { useSelector } from 'react-redux';
import type { RootState } from '@/store/store';
import toast from 'react-hot-toast';

export default function LoginPage() {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const { isAuthenticated, isLoading, error } = useSelector((s: RootState) => s.auth);

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  // Redirect if already authenticated
  useEffect(() => {
    if (isAuthenticated) router.replace('/chat');
  }, [isAuthenticated, router]);

  // Show error toast
  useEffect(() => {
    if (error) {
      toast.error(error);
      dispatch(clearAuthError());
    }
  }, [error, dispatch]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!username.trim() || !password.trim()) return;

    const result = await dispatch(loginUser({ username: username.trim(), password }));
    if (loginUser.fulfilled.match(result)) {
      await dispatch(fetchUser());
      router.replace('/chat');
    }
  }

  return (
    <div className="min-h-full flex items-center justify-center bg-[#0f0f1a] px-4 py-12">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-12 h-12 rounded-2xl bg-[#E24329]/10 border border-[#E24329]/20 flex items-center justify-center mb-4">
            <svg width="24" height="24" viewBox="0 0 32 32" fill="none">
              <path d="M16 3L29 11.5V20.5L16 29L3 20.5V11.5L16 3Z" stroke="#E24329" strokeWidth="2" fill="none" />
              <path d="M16 9L22 13V19L16 23L10 19V13L16 9Z" fill="#E24329" opacity="0.25" />
              <circle cx="16" cy="16" r="2.5" fill="#E24329" />
            </svg>
          </div>
          <h1 className="text-xl font-semibold text-white">Sign in</h1>
          <p className="text-sm text-slate-500 mt-1">GitLab Handbook Assistant</p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">Username</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="your-username"
              required
              autoFocus
              autoComplete="username"
              className="w-full px-3.5 py-2.5 rounded-xl bg-[#1e1e2e] border border-white/8 text-sm text-white placeholder-slate-600 outline-none focus:border-[#E24329]/50 focus:ring-1 focus:ring-[#E24329]/20 transition-all duration-150"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              autoComplete="current-password"
              className="w-full px-3.5 py-2.5 rounded-xl bg-[#1e1e2e] border border-white/8 text-sm text-white placeholder-slate-600 outline-none focus:border-[#E24329]/50 focus:ring-1 focus:ring-[#E24329]/20 transition-all duration-150"
            />
          </div>

          <button
            type="submit"
            disabled={isLoading || !username.trim() || !password.trim()}
            className="w-full py-2.5 rounded-xl bg-[#E24329] hover:bg-[#c93820] text-white text-sm font-medium transition-colors duration-150 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 mt-1"
          >
            {isLoading ? (
              <>
                <span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                Signing in…
              </>
            ) : (
              'Sign in'
            )}
          </button>
        </form>

        <p className="text-center text-xs text-slate-600 mt-6">
          Don't have an account?{' '}
          <Link href="/register" className="text-[#E24329] hover:underline">
            Create one
          </Link>
        </p>
      </div>
    </div>
  );
}
