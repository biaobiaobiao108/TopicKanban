import React, { useState, useRef, useEffect, useId } from 'react';
import { ChevronDown, Check } from 'lucide-react';

export interface SelectOption {
  value: string;
  label: string;
  dot?: string;
  icon?: React.ReactNode;
  description?: string;
}

interface CustomSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  buttonClassName?: string;
  popoverClassName?: string;
  size?: 'xs' | 'sm' | 'md';
  align?: 'left' | 'right';
}

export const CustomSelect: React.FC<CustomSelectProps> = ({
  value,
  onChange,
  options,
  placeholder = '请选择...',
  disabled = false,
  className = '',
  buttonClassName = '',
  popoverClassName = '',
  size = 'sm',
  align = 'left',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(() => Math.max(0, options.findIndex((opt) => opt.value === value)));
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const listboxId = useId();

  const selectedOption = options.find((opt) => opt.value === value);

  useEffect(() => {
    if (!isOpen) return;
    const selectedIndex = options.findIndex((option) => option.value === value);
    const nextIndex = selectedIndex >= 0 ? selectedIndex : 0;
    setFocusedIndex(nextIndex);
    requestAnimationFrame(() => optionRefs.current[nextIndex]?.focus());
  }, [isOpen, value]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const close = () => {
    setIsOpen(false);
    buttonRef.current?.focus();
  };

  const selectFocused = (index: number) => {
    const option = options[index];
    if (!option) return;
    onChange(option.value);
    close();
  };

  const handleButtonKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (disabled) return;
    if (event.key === 'Enter' || event.key === ' ' || event.key === 'ArrowDown') {
      event.preventDefault();
      setIsOpen(true);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setFocusedIndex(Math.max(0, options.findIndex((option) => option.value === value)));
      setIsOpen(true);
    } else if (event.key === 'Escape' && isOpen) {
      event.preventDefault();
      close();
    }
  };

  const handleOptionKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const delta = event.key === 'ArrowDown' ? 1 : -1;
      const nextIndex = (focusedIndex + delta + options.length) % options.length;
      setFocusedIndex(nextIndex);
      optionRefs.current[nextIndex]?.focus();
    } else if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      const nextIndex = event.key === 'Home' ? 0 : options.length - 1;
      setFocusedIndex(nextIndex);
      optionRefs.current[nextIndex]?.focus();
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      selectFocused(focusedIndex);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      close();
    }
  };

  const sizeClasses = {
    xs: 'px-2 py-1 text-[11px] rounded-lg gap-1.5',
    sm: 'px-2.5 py-1.5 text-xs rounded-xl gap-2',
    md: 'px-3 py-2 text-sm rounded-xl gap-2.5',
  };

  const iconSizes = {
    xs: 'w-3 h-3',
    sm: 'w-3.5 h-3.5',
    md: 'w-4 h-4',
  };

  return (
    <div className={`relative inline-block ${className}`} ref={containerRef}>
      <button
        ref={buttonRef}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-controls={isOpen ? listboxId : undefined}
        disabled={disabled}
        onClick={() => !disabled && (isOpen ? close() : setIsOpen(true))}
        onKeyDown={handleButtonKeyDown}
        className={`flex items-center justify-between font-medium transition-all cursor-pointer ${
          sizeClasses[size]
        } ${
          disabled
            ? 'opacity-50 cursor-not-allowed bg-stone-100 dark:bg-stone-800 text-stone-400 border border-stone-200 dark:border-stone-700'
            : 'bg-white dark:bg-stone-850 hover:bg-stone-50 dark:hover:bg-stone-800 text-stone-800 dark:text-stone-200 border border-stone-200 dark:border-stone-700/80 shadow-2xs focus:outline-none focus:ring-1 focus:ring-rose-500/40'
        } ${buttonClassName}`}
      >
        <div className="flex items-center gap-1.5 truncate">
          {selectedOption?.dot && (
            <span className={`w-2 h-2 rounded-full shrink-0 ${selectedOption.dot}`} />
          )}
          {selectedOption?.icon && (
            <span className="shrink-0 text-stone-500 dark:text-stone-400">{selectedOption.icon}</span>
          )}
          <span className="truncate">
            {selectedOption ? selectedOption.label : placeholder}
          </span>
        </div>
        <ChevronDown
          className={`${iconSizes[size]} text-stone-400 dark:text-stone-500 transition-transform shrink-0 ${
            isOpen ? 'rotate-180 text-stone-700 dark:text-stone-300' : ''
          }`}
        />
      </button>

      {isOpen && (
        <div
          id={listboxId}
          role="listbox"
          aria-label={placeholder}
          tabIndex={-1}
          onKeyDown={(event) => {
            if (event.target === event.currentTarget && event.key === 'Escape') close();
          }}
          className={`absolute z-50 mt-1 min-w-[160px] max-h-64 overflow-y-auto bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-xl shadow-modal p-1 space-y-0.5 animate-in fade-in zoom-in-95 duration-100 ${
            align === 'right' ? 'right-0' : 'left-0'
          } ${popoverClassName}`}
        >
          {options.map((option, index) => {
            const isSelected = option.value === value;
            return (
              <button
                ref={(element) => { optionRefs.current[index] = element; }}
                key={option.value}
                type="button"
                role="option"
                aria-selected={isSelected}
                tabIndex={focusedIndex === index ? 0 : -1}
                onFocus={() => setFocusedIndex(index)}
                onKeyDown={handleOptionKeyDown}
                onClick={() => {
                  onChange(option.value);
                  close();
                }}
                className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-medium flex items-center justify-between transition-colors cursor-pointer ${
                  isSelected
                    ? 'bg-rose-50 dark:bg-rose-950/40 text-rose-900 dark:text-rose-200 font-semibold'
                    : 'text-stone-700 dark:text-stone-300 hover:bg-stone-100/80 dark:hover:bg-stone-800'
                }`}
              >
                <div className="flex items-center gap-2 truncate">
                  {option.dot && <span className={`w-2 h-2 rounded-full shrink-0 ${option.dot}`} />}
                  {option.icon && (
                    <span className="shrink-0 text-stone-500 dark:text-stone-400">{option.icon}</span>
                  )}
                  <div className="truncate">
                    <div className="truncate">{option.label}</div>
                    {option.description && (
                      <div className="text-[10px] text-stone-400 dark:text-stone-500 font-normal truncate">
                        {option.description}
                      </div>
                    )}
                  </div>
                </div>
                {isSelected && (
                  <Check className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400 shrink-0 ml-2" />
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};
