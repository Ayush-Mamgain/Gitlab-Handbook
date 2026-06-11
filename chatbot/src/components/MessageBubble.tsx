'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import type { Message } from '@/types';
import 'highlight.js/styles/github-dark.css';

interface MessageBubbleProps {
  message: Message;
  isStreaming?: boolean;
}

function AssistantIcon() {
  return (
    <div className="w-7 h-7 rounded-full bg-[#E24329] flex items-center justify-center flex-shrink-0 mt-0.5">
      <svg width="14" height="14" viewBox="0 0 32 32" fill="none">
        <path
          d="M16 3L29 11.5V20.5L16 29L3 20.5V11.5L16 3Z"
          stroke="white"
          strokeWidth="2"
          fill="none"
        />
        <circle cx="16" cy="16" r="3" fill="white" />
      </svg>
    </div>
  );
}

function UserIcon({ initial }: { initial: string }) {
  return (
    <div className="w-7 h-7 rounded-full bg-slate-600 flex items-center justify-center flex-shrink-0 mt-0.5 text-xs font-semibold text-white uppercase">
      {initial}
    </div>
  );
}

export default function MessageBubble({ message, isStreaming }: MessageBubbleProps) {
  const isUser = message.role === 'user';

  return (
    <div className={`flex items-start gap-3 px-4 py-3 group ${isUser ? 'flex-row-reverse' : ''}`}>
      {isUser ? (
        <UserIcon initial="U" />
      ) : (
        <AssistantIcon />
      )}

      <div
        className={`rounded-2xl px-4 py-3 text-sm leading-relaxed ${
          isUser
            ? 'bg-[#E24329] text-white rounded-tr-sm'
            : 'bg-[#1e1e2e] border border-white/5 text-slate-200 rounded-tl-sm'
        }`}
      >
        {isUser ? (
          <p className="whitespace-pre-wrap">{message.content}</p>
        ) : (
          <div className="prose prose-invert prose-sm max-w-none markdown-body">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              rehypePlugins={[rehypeHighlight]}
              components={{
                // Code blocks
                code({ node, className, children, ...props }) {
                  const match = /language-(\w+)/.exec(className || '');
                  const isBlock = !!(node?.position?.start.line !== node?.position?.end.line || match);
                  return isBlock ? (
                    <div className="not-prose my-3">
                      {match && (
                        <div className="flex items-center justify-between px-3 py-1.5 bg-[#141420] rounded-t-lg border border-white/8 border-b-0">
                          <span className="text-xs text-slate-500 font-mono">{match[1]}</span>
                        </div>
                      )}
                      <code
                        className={`block overflow-x-auto p-3 text-xs rounded-b-lg ${match ? '' : 'rounded-lg'} bg-[#141420] border border-white/8 ${className || ''}`}
                        {...props}
                      >
                        {children}
                      </code>
                    </div>
                  ) : (
                    <code
                      className="px-1.5 py-0.5 rounded bg-white/8 text-[#FC9D65] text-xs font-mono"
                      {...props}
                    >
                      {children}
                    </code>
                  );
                },
                // Tables
                table({ children }) {
                  return (
                    <div className="overflow-x-auto my-3">
                      <table className="w-full border-collapse text-xs">{children}</table>
                    </div>
                  );
                },
                th({ children }) {
                  return (
                    <th className="px-3 py-2 bg-white/5 border border-white/10 text-left font-medium text-slate-300">
                      {children}
                    </th>
                  );
                },
                td({ children }) {
                  return (
                    <td className="px-3 py-2 border border-white/8 text-slate-400">{children}</td>
                  );
                },
                // Blockquotes
                blockquote({ children }) {
                  return (
                    <blockquote className="border-l-2 border-[#E24329]/60 pl-3 my-2 text-slate-400 italic">
                      {children}
                    </blockquote>
                  );
                },
                // Headings
                h1({ children }) {
                  return <h1 className="text-base font-bold text-white mt-4 mb-2">{children}</h1>;
                },
                h2({ children }) {
                  return <h2 className="text-sm font-bold text-white mt-3 mb-1.5">{children}</h2>;
                },
                h3({ children }) {
                  return <h3 className="text-sm font-semibold text-slate-200 mt-3 mb-1">{children}</h3>;
                },
                // Links
                a({ href, children }) {
                  return (
                    <a
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[#E24329] hover:underline"
                    >
                      {children}
                    </a>
                  );
                },
                // Lists
                ul({ children }) {
                  return <ul className="list-disc list-outside pl-4 my-2 space-y-1">{children}</ul>;
                },
                ol({ children }) {
                  return <ol className="list-decimal list-outside pl-4 my-2 space-y-1">{children}</ol>;
                },
                li({ children }) {
                  return <li className="text-slate-300">{children}</li>;
                },
                // Horizontal rule
                hr() {
                  return <hr className="border-white/10 my-4" />;
                },
                p({ children }) {
                  return <p className="mb-2 last:mb-0 text-slate-200">{children}</p>;
                },
              }}
            >
              {message.content}
            </ReactMarkdown>
            {isStreaming && (
              <span className="inline-block w-0.5 h-3.5 bg-[#E24329] ml-0.5 animate-pulse align-middle" />
            )}
          </div>
        )}
      </div>
    </div>
  );
}