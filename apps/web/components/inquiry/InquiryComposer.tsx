'use client';

import { useId, useState } from 'react';

const MAX_LENGTH = 2000;

export function InquiryComposer({
  disabled,
  loading,
  placeholder,
  onSubmit,
}: {
  disabled?: boolean;
  loading?: boolean;
  placeholder?: string;
  onSubmit: (question: string) => void;
}) {
  const [value, setValue] = useState('');
  const [touched, setTouched] = useState(false);
  const fieldId = useId();

  const trimmed = value.trim();
  const isEmpty = trimmed.length === 0;
  const tooLong = value.length > MAX_LENGTH;
  const showError = touched && (isEmpty || tooLong);

  function submit() {
    setTouched(true);
    if (isEmpty || tooLong || disabled || loading) return;
    onSubmit(trimmed);
    setValue('');
    setTouched(false);
  }

  return (
    <form
      className="flex flex-col gap-1.5"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <label htmlFor={fieldId} className="sr-only">
        Ask a question
      </label>
      <div className="flex items-end gap-2">
        <textarea
          id={fieldId}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onBlur={() => setTouched(true)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              submit();
            }
          }}
          disabled={disabled || loading}
          rows={2}
          placeholder={placeholder ?? 'Ask a technical question about the source material…'}
          aria-invalid={showError}
          className={[
            'min-h-[2.5rem] flex-1 resize-none rounded-sm border bg-white/5 px-3 py-2 text-sm text-white/90',
            'placeholder:text-white/30 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50',
            showError ? 'border-red-400/50 focus:border-red-400/60' : 'border-white/15 focus:border-white/30',
          ].join(' ')}
        />
        <button
          type="submit"
          disabled={disabled || loading}
          className="h-10 shrink-0 rounded-sm border border-white/20 bg-white/10 px-4 text-xs font-medium uppercase tracking-wide text-white/90 hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {loading ? 'Thinking…' : 'Ask'}
        </button>
      </div>
      <div className="flex items-center justify-between text-[11px]">
        <span className={showError ? 'text-red-300' : 'text-white/35'}>
          {showError && isEmpty && 'Enter a question before submitting.'}
          {showError && tooLong && `Question exceeds ${MAX_LENGTH} characters.`}
          {!showError && 'Shift+Enter for a new line.'}
        </span>
        <span className={tooLong ? 'text-red-300' : 'text-white/30'}>
          {value.length}/{MAX_LENGTH}
        </span>
      </div>
    </form>
  );
}
