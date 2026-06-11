'use client';

import { useState, useCallback } from 'react';
import { Plus, Trash2, MessageSquare, LogOut, ChevronLeft, ChevronRight } from 'lucide-react';
import type { ChatSummary } from '@/types';

interface SidebarProps {
  chats: ChatSummary[];
  activeChatId: string | null;
  username: string | null;
  onNewChat: () => void;
  onSelectChat: (id: string) => void;
  onDeleteChat: (id: string) => void;
  onLogout: () => void;
  isOpen: boolean;
  onToggle: () => void;
}

export default function Sidebar({
  chats,
  activeChatId,
  username,
  onNewChat,
  onSelectChat,
  onDeleteChat,
  onLogout,
  isOpen,
  onToggle,
}: SidebarProps) {
  const [hoveringId, setHoveringId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleDelete = useCallback(
    async (e: React.MouseEvent, chatId: string) => {
      e.stopPropagation();
      setDeletingId(chatId);
      try {
        await onDeleteChat(chatId);
      } finally {
        setDeletingId(null);
      }
    },
    [onDeleteChat]
  );

  return (
    <>
      {/* Mobile overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-20 lg:hidden"
          onClick={onToggle}
        />
      )}

      {/* Sidebar panel */}
      <aside
        className={`
          fixed lg:relative inset-y-0 left-0 z-30 lg:z-auto
          flex flex-col bg-[#0d0d1a] border-r border-white/5
          transition-all duration-300 ease-in-out
          ${isOpen ? 'w-72 translate-x-0' : 'w-72 -translate-x-full lg:translate-x-0 lg:w-0 lg:overflow-hidden lg:border-0'}
        `}
      >
        <div className="flex flex-col h-full w-72">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-4 border-b border-white/5">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-[#E24329] flex items-center justify-center">
                <svg width="14" height="14" viewBox="0 0 32 32" fill="none">
                  <path d="M16 3L29 11.5V20.5L16 29L3 20.5V11.5L16 3Z" stroke="white" strokeWidth="2.5" fill="none" />
                  <circle cx="16" cy="16" r="3" fill="white" />
                </svg>
              </div>
              <span className="text-sm font-semibold text-white">Handbook Chat</span>
            </div>
            <button
              onClick={onToggle}
              className="text-slate-500 hover:text-slate-300 transition-colors p-1"
            >
              <ChevronLeft size={16} />
            </button>
          </div>

          {/* New Chat */}
          <div className="px-3 pt-3">
            <button
              onClick={onNewChat}
              className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-[#E24329]/10 hover:bg-[#E24329]/15 border border-[#E24329]/20 hover:border-[#E24329]/30 transition-all duration-150 text-[#E24329] text-sm font-medium"
            >
              <Plus size={15} />
              New conversation
            </button>
          </div>

          {/* Chats list */}
          <nav className="flex-1 overflow-y-auto px-3 py-3 space-y-0.5">
            {chats.length === 0 && (
              <p className="text-xs text-slate-600 text-center py-8 px-4">
                No conversations yet. Start one above.
              </p>
            )}

            {chats.map((chat) => (
              <div
                key={chat._id}
                onClick={() => onSelectChat(chat._id)}
                onMouseEnter={() => setHoveringId(chat._id)}
                onMouseLeave={() => setHoveringId(null)}
                className={`
                  w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-left
                  transition-all duration-100 group
                  ${
                    activeChatId === chat._id
                      ? 'bg-white/8 text-white'
                      : 'text-slate-400 hover:bg-white/4 hover:text-slate-200'
                  }
                `}
              >
                <MessageSquare
                  size={13}
                  className={`flex-shrink-0 ${activeChatId === chat._id ? 'text-[#E24329]' : 'text-slate-600 group-hover:text-slate-400'}`}
                />
                <span className="flex-1 text-xs truncate leading-relaxed">{chat.title}</span>

                {(hoveringId === chat._id || activeChatId === chat._id) && (
                  <button
                    onClick={(e) => handleDelete(e, chat._id)}
                    disabled={deletingId === chat._id}
                    className="flex-shrink-0 p-1 rounded-md hover:bg-white/10 text-slate-600 hover:text-red-400 transition-colors disabled:opacity-50"
                  >
                    <Trash2 size={12} />
                  </button>
                )}
              </div>
            ))}
          </nav>

          {/* User section */}
          <div className="border-t border-white/5 px-3 py-3">
            <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-white/4 transition-colors group">
              <div className="w-7 h-7 rounded-full bg-slate-700 flex items-center justify-center text-xs font-semibold text-white uppercase flex-shrink-0">
                {username?.[0] ?? 'U'}
              </div>
              <span className="flex-1 text-xs text-slate-400 truncate">{username ?? 'User'}</span>
              <button
                onClick={onLogout}
                title="Sign out"
                className="text-slate-600 hover:text-slate-300 transition-colors opacity-0 group-hover:opacity-100 p-1 rounded"
              >
                <LogOut size={13} />
              </button>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}