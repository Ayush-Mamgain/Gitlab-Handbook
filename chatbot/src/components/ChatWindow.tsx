'use client';

import { useEffect, useRef } from 'react';
import MessageBubble from './MessageBubble';
import TypingIndicator from './TypingIndicator';
import EmptyState from './EmptyState';
import type { Message } from '@/types';

interface ChatWindowProps {
  messages: Message[];
  streamingContent: string;
  isStreaming: boolean;
  isLoading: boolean;
  onSuggestion: (text: string) => void;
}

function SkeletonMessage({ isUser = false }: { isUser?: boolean }) {
  return (
    <div className={`flex items-start gap-3 px-4 py-3 ${isUser ? 'flex-row-reverse' : ''}`}>
      <div className="w-7 h-7 rounded-full bg-white/5 animate-pulse flex-shrink-0" />
      <div className={`space-y-2 max-w-[60%] ${isUser ? 'items-end flex flex-col' : ''}`}>
        <div className="h-3.5 bg-white/5 rounded-full animate-pulse w-48" />
        <div className="h-3.5 bg-white/5 rounded-full animate-pulse w-64" />
        <div className="h-3.5 bg-white/5 rounded-full animate-pulse w-40" />
      </div>
    </div>
  );
}

export default function ChatWindow({
  messages,
  streamingContent,
  isStreaming,
  isLoading,
  onSuggestion,
}: ChatWindowProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new messages / streaming
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingContent]);

  if (isLoading) {
    return (
      <div className="flex-1 overflow-y-auto py-2">
        <SkeletonMessage />
        <SkeletonMessage isUser />
        <SkeletonMessage />
        <SkeletonMessage isUser />
      </div>
    );
  }

  const displayMessages = messages.filter((m) => m.role !== 'system');
  const isEmpty = displayMessages.length === 0 && !isStreaming && !streamingContent;

  if (isEmpty) {
    return (
      <div className="flex-1 overflow-y-auto">
        <EmptyState onSuggestion={onSuggestion} />
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto py-2">
      <div className="max-w-3xl mx-auto">
        {displayMessages.map((msg, i) => (
          <MessageBubble key={i} message={msg} />
        ))}

        {/* Streaming in-progress message */}
        {isStreaming && streamingContent && (
          <MessageBubble
            message={{ role: 'assistant', content: streamingContent }}
            isStreaming={true}
          />
        )}

        {/* Typing indicator: streaming started but no content yet */}
        {isStreaming && !streamingContent && <TypingIndicator />}

        <div ref={bottomRef} className="h-4" />
      </div>
    </div>
  );
}