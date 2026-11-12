import type { ReactNode } from 'react';

export function Panel({
  title,
  actions,
  children,
  className = '',
}: {
  title?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`flex min-h-0 flex-col ${className}`}>
      {(title || actions) && (
        <header className="flex shrink-0 items-center justify-between border-b border-white/10 px-5 py-3">
          {title && (
            <h2 className="text-xs font-medium uppercase tracking-[0.2em] text-white/50">{title}</h2>
          )}
          {actions && <div className="flex items-center gap-3">{actions}</div>}
        </header>
      )}
      <div className="min-h-0 flex-1">{children}</div>
    </section>
  );
}
