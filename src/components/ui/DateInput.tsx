import React, { useEffect, useRef, useState } from 'react';
import { normalizeDateInputValue } from '../../lib/dateInput';

type DateInputProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type' | 'value' | 'onChange' | 'min'> & {
  value?: string | null;
  onChange: (value: string) => void;
  min?: string;
};

export const DateInput: React.FC<DateInputProps> = ({
  value,
  onChange,
  min,
  id,
  name,
  className,
  placeholder = 'YYYYMMDD，例如 20260827',
  ...inputProps
}) => {
  const [draft, setDraft] = useState(value || '');
  const [showError, setShowError] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const focusedRef = useRef(false);
  const result = normalizeDateInputValue(draft, min);
  const errorId = `${id || name || 'date-input'}-error`;

  useEffect(() => {
    if (!focusedRef.current) {
      setDraft(value || '');
      setShowError(false);
    }
  }, [value]);

  useEffect(() => {
    inputRef.current?.setCustomValidity(result.error || '');
  }, [result.error]);

  const handleInput = (nextDraft: string) => {
    const nextResult = normalizeDateInputValue(nextDraft, min);
    setDraft(nextResult.error ? nextDraft : nextResult.value);
    setShowError(false);
    // Keep incomplete/invalid drafts local. Saving an empty value for every
    // intermediate keystroke can race a valid edit and clear a previously
    // saved date before the user finishes typing.
    if (!nextResult.error) onChange(nextResult.value);
  };

  const validateOnBlur = () => {
    focusedRef.current = false;
    const nextResult = normalizeDateInputValue(draft, min);
    if (nextResult.error) {
      setShowError(true);
      return;
    }
    setDraft(nextResult.value);
    onChange(nextResult.value);
  };

  return (
    <>
      <input
        {...inputProps}
        ref={inputRef}
        id={id}
        name={name}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        maxLength={10}
        value={draft}
        placeholder={placeholder}
        aria-invalid={Boolean(result.error)}
        aria-describedby={result.error && showError ? errorId : undefined}
        onFocus={() => {
          focusedRef.current = true;
          setShowError(false);
        }}
        onChange={(event) => handleInput(event.currentTarget.value)}
        onBlur={validateOnBlur}
        onInvalid={() => setShowError(true)}
        className={[
          'placeholder:text-stone-400/60 dark:placeholder:text-stone-500/60',
          className,
        ].filter(Boolean).join(' ')}
      />
      {showError && result.error && (
        <p id={errorId} role="alert" aria-live="polite" className="mt-1 text-xs font-medium text-red-600 dark:text-red-400">
          {result.error}
        </p>
      )}
    </>
  );
};
