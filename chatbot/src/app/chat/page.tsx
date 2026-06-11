'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useSelector } from 'react-redux';
import { Menu } from 'lucide-react';
import type { RootState } from '@/store/store'
import { useAppDispatch } from '@/hooks/useAuth';
import { fetchUser } from '@/store/authSlice';
import { logout } from '@/store/authSlice';
import { setChats } from '@/store/chatSlice';
import { useChat } from '@/hooks/useChat';
import { useStreaming } from '@/hooks/useStreaming';
import Sidebar from '@/components/Sidebar';
import ChatWindow from '@/components/ChatWindow';
import ChatInput from '@/components/ChatInput';

export default function ChatPage() {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const { abort } = useStreaming();

  const { isAuthenticated, isLoading: authLoading, user } = useSelector((s: RootState) => s.auth);
  const {
    chats,
    activeChatId,
    activeMessages,
    isLoading: chatLoading,
    isStreaming,
    streamingContent,
    selectChat,
    sendMessage,
    removeChat,
    startNewChat,
  } = useChat();

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);

  // Auth guard: try to fetch user on mount
  useEffect(() => {
    dispatch(fetchUser())
      .unwrap()
      .catch(() => {
        router.replace('/login');
      })
      .finally(() => setAuthChecked(true));
  }, [dispatch, router]);

  // Sync chat list from user profile
  useEffect(() => {
    if (user?.chats) {
      dispatch(setChats(user.chats));
    }
  }, [user, dispatch]);

  const handleLogout = useCallback(() => {
    dispatch(logout());
    router.replace('/login');
  }, [dispatch, router]);

  const handleSelectChat = useCallback(
    (id: string) => {
      selectChat(id);
      setSidebarOpen(false); // close drawer on mobile
    },
    [selectChat]
  );

  const handleSend = useCallback(
    (message: string) => {
      sendMessage(message);
    },
    [sendMessage]
  );

  const handleSuggestion = useCallback(
    (text: string) => {
      sendMessage(text);
    },
    [sendMessage]
  );

  // Show spinner while checking auth
  if (!authChecked || authLoading) {
    return (
      <div className="flex h-full items-center justify-center bg-[#0f0f1a]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 rounded-full border-2 border-[#E24329]/30 border-t-[#E24329] animate-spin" />
          <p className="text-xs text-slate-600">Loading…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full bg-[#0f0f1a] overflow-hidden">
      {/* Sidebar */}
      <Sidebar
        chats={chats}
        activeChatId={activeChatId}
        username={user?.username ?? null}
        onNewChat={startNewChat}
        onSelectChat={handleSelectChat}
        onDeleteChat={removeChat}
        onLogout={handleLogout}
        isOpen={sidebarOpen}
        onToggle={() => setSidebarOpen((v) => !v)}
      />

      {/* Main area */}
      <main className="flex flex-col flex-1 min-w-0 h-full overflow-hidden bg-[#12121c]">
        {/* Top bar */}
        <header className="flex items-center gap-3 px-4 py-3 border-b border-white/5 flex-shrink-0">
          {/* Mobile hamburger */}
          <button
            onClick={() => setSidebarOpen(true)}
            className="text-slate-500 hover:text-slate-300 transition-colors p-1 -ml-1"
          >
            <Menu size={18} />
          </button>

          {/* Chat title or brand */}
          <div className="flex-1 min-w-0">
            {activeChatId ? (
              <p className="text-sm font-medium text-slate-300 truncate">
                {chats.find((c) => c._id === activeChatId)?.title ?? 'Conversation'}
              </p>
            ) : (
              <p className="text-sm font-medium text-slate-500">GitLab Handbook Assistant</p>
            )}
          </div>

          {/* Status badge */}
          {isStreaming && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#E24329]/10 border border-[#E24329]/20">
              <span className="w-1.5 h-1.5 rounded-full bg-[#E24329] animate-pulse" />
              <span className="text-[11px] text-[#E24329] font-medium">Generating</span>
            </div>
          )}
        </header>

        {/* Messages */}
        <ChatWindow
          messages={activeMessages}
          streamingContent={streamingContent}
          isStreaming={isStreaming}
          isLoading={chatLoading}
          onSuggestion={handleSuggestion}
        />

        {/* Input */}
        <ChatInput
          onSend={handleSend}
          onAbort={abort}
          isStreaming={isStreaming}
          disabled={chatLoading}
        />
      </main>
    </div>
  );
}
