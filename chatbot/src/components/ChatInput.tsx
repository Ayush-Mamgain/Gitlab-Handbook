'use client';

import { useState, useRef, useCallback, KeyboardEvent } from 'react';
import { Send, Square } from 'lucide-react';

interface ChatInputProps {
  onSend: (message: string) => void;
  onAbort?: () => void;
  isStreaming: boolean;
  disabled?: boolean;
}

export default function ChatInput({ onSend, onAbort, isStreaming, disabled }: ChatInputProps) {
  const [value, setValue] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleInput = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setValue(e.target.value);
    // Auto-resize
    const el = e.target;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, []);

  const handleSubmit = useCallback(() => {
    const trimmed = value.trim();
    if (!trimmed || disabled || isStreaming) return;
    onSend(trimmed);
    setValue('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  }, [value, disabled, isStreaming, onSend]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit]
  );

  const canSend = value.trim().length > 0 && !disabled;

  return (
    <div className="border-t border-white/5 bg-[#12121c] px-4 py-3">
      <div className="max-w-3xl mx-auto">
        <div className="relative flex items-end gap-2 bg-[#1e1e2e] border border-white/8 rounded-2xl px-4 py-3 focus-within:border-[#E24329]/40 transition-colors duration-150">
          <textarea
            ref={textareaRef}
            value={value}
            onChange={handleInput}
            onKeyDown={handleKeyDown}
            placeholder="Ask about the GitLab Handbook…"
            disabled={disabled || isStreaming}
            rows={1}
            className="flex-1 bg-transparent text-sm text-slate-200 placeholder-slate-500 resize-none outline-none leading-relaxed disabled:opacity-50 min-h-[24px] max-h-[200px]"
          />

          {isStreaming ? (
            <button
              onClick={onAbort}
              title="Stop generating"
              className="flex-shrink-0 w-8 h-8 rounded-lg bg-white/10 hover:bg-white/15 flex items-center justify-center transition-colors duration-150 text-slate-300 hover:text-white"
            >
              <Square size={14} />
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              disabled={!canSend}
              title="Send message"
              className="flex-shrink-0 w-8 h-8 rounded-lg bg-[#E24329] hover:bg-[#c93820] flex items-center justify-center transition-colors duration-150 disabled:opacity-30 disabled:cursor-not-allowed text-white"
            >
              <Send size={14} />
            </button>
          )}
        </div>
        <p className="text-center text-[11px] text-slate-600 mt-2">
          Powered by GitLab Handbook RAG · Shift+Enter for new line
        </p>
      </div>
    </div>
  );
}