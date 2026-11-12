import type { ReactNode } from 'react';

const TONES = {
  neutral: 'border-white/15 bg-white/5 text-white/60',
  accent: 'border-amber-400/30 bg-amber-400/10 text-amber-300',
  danger: 'border-red-400/30 bg-red-400/10 text-red-300',
  success: 'border-emerald-400/30 bg-emerald-400/10 text-emerald-300',
} as const;

export function Badge({ tone = 'neutral', children }: { tone?: keyof typeof TONES; children: ReactNode }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-sm border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide ${TONES[tone]}`}
    >
      {children}
    </span>
  );
}
