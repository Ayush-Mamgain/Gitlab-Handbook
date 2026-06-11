'use client';

import Link from 'next/link';

export default function Navbar() {
  return (
    <nav className="fixed top-0 inset-x-0 z-10 flex items-center gap-3 px-6 py-3 border-b border-white/5 bg-[#0f0f1a]/80 backdrop-blur-md">
      <Link href="/" className="flex items-center gap-2.5 group">
        <div className="w-7 h-7 rounded-lg bg-[#E24329]/10 border border-[#E24329]/20 flex items-center justify-center group-hover:bg-[#E24329]/15 transition-colors">
          <svg width="13" height="13" viewBox="0 0 32 32" fill="none">
            <path
              d="M16 3L29 11.5V20.5L16 29L3 20.5V11.5L16 3Z"
              stroke="#E24329"
              strokeWidth="2.5"
              fill="none"
            />
            <circle cx="16" cy="16" r="3" fill="#E24329" />
          </svg>
        </div>
        <span className="text-sm font-semibold text-white">Handbook Chat</span>
      </Link>
    </nav>
  );
}
