'use client';

const SUGGESTIONS = [
  'How does the promotion process work at GitLab?',
  "What are GitLab's core values?",
  'How does remote work culture function at GitLab?',
  'What is the engineering career ladder at GitLab?',
];

interface EmptyStateProps {
  onSuggestion: (text: string) => void;
}

export default function EmptyState({ onSuggestion }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center h-full px-6 py-12 text-center">
      {/* Logo mark */}
      <div className="w-16 h-16 rounded-2xl bg-[#E24329]/10 border border-[#E24329]/20 flex items-center justify-center mb-6">
        <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
          <path
            d="M16 3L29 11.5V20.5L16 29L3 20.5V11.5L16 3Z"
            stroke="#E24329"
            strokeWidth="1.5"
            fill="none"
          />
          <path d="M16 9L22 13V19L16 23L10 19V13L16 9Z" fill="#E24329" opacity="0.3" />
          <circle cx="16" cy="16" r="2.5" fill="#E24329" />
        </svg>
      </div>

      <h2 className="text-xl font-semibold text-white mb-2">GitLab Handbook Assistant</h2>
      <p className="text-sm text-slate-400 max-w-sm mb-10 leading-relaxed">
        Ask anything about how GitLab works — from engineering practices to company culture,
        hiring, and career growth.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 w-full max-w-lg">
        {SUGGESTIONS.map((s) => (
          <button
            key={s}
            onClick={() => onSuggestion(s)}
            className="text-left px-4 py-3 rounded-xl border border-white/8 bg-white/3 hover:bg-white/7 hover:border-[#E24329]/30 transition-all duration-150 text-sm text-slate-300 hover:text-white"
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}