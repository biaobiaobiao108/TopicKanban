import React, { useEffect, useId, useRef, useState } from 'react';
import { Check, ChevronDown, Search } from 'lucide-react';

export interface SelectOption {
  value: string;
  label: string;
  dot?: string;
  icon?: React.ReactNode;
  description?: string;
}

export interface SelectRenderState {
  selected: boolean;
  focused: boolean;
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
  searchable?: boolean;
  searchPlaceholder?: string;
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  renderOption?: (option: SelectOption, state: SelectRenderState) => React.ReactNode;
  renderValue?: (option: SelectOption | undefined) => React.ReactNode;
  emptyState?: React.ReactNode;
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
  searchable = false,
  searchPlaceholder = '搜索...',
  searchValue,
  onSearchChange,
  renderOption,
  renderValue,
  emptyState = '暂无可选项',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(() => Math.max(0, options.findIndex((opt) => opt.value === value)));
  const [internalSearchValue, setInternalSearchValue] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const listboxId = useId();
  const searchboxId = `${listboxId}-search`;

  const selectedOption = options.find((option) => option.value === value);
  const currentSearchValue = searchValue ?? internalSearchValue;

  useEffect(() => {
    if (!isOpen) return;
    const selectedIndex = options.findIndex((option) => option.value === value);
    const nextIndex = selectedIndex >= 0 ? selectedIndex : 0;
    setFocusedIndex(nextIndex);
    requestAnimationFrame(() => {
      if (searchable) searchRef.current?.focus();
      else optionRefs.current[nextIndex]?.focus();
    });
  }, [isOpen, searchable, value, options]);

  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) setIsOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setIsOpen(false);
        requestAnimationFrame(() => buttonRef.current?.focus());
      }
    };
    document.addEventListener('pointerdown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const close = () => {
    setIsOpen(false);
    requestAnimationFrame(() => buttonRef.current?.focus());
  };

  const selectOption = (index: number) => {
    const option = options[index];
    if (!option) return;
    onChange(option.value);
    close();
  };

  const moveFocus = (delta: number) => {
    if (options.length === 0) return;
    const nextIndex = (focusedIndex + delta + options.length) % options.length;
    setFocusedIndex(nextIndex);
    requestAnimationFrame(() => optionRefs.current[nextIndex]?.focus());
  };

  const handleButtonKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (disabled) return;
    if (event.key === 'Escape' && isOpen) {
      event.preventDefault();
      event.stopPropagation();
      close();
      return;
    }
    if (!isOpen && (event.key === 'Enter' || event.key === ' ' || event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
      event.preventDefault();
      setIsOpen(true);
      return;
    }
    if (isOpen && event.key === 'ArrowDown') {
      event.preventDefault();
      moveFocus(1);
    } else if (isOpen && event.key === 'ArrowUp') {
      event.preventDefault();
      moveFocus(-1);
    } else if (isOpen && (event.key === 'Enter' || event.key === ' ')) {
      event.preventDefault();
      selectOption(focusedIndex);
    }
  };

  const handleSearchKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      moveFocus(1);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      moveFocus(-1);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      selectOption(focusedIndex);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      close();
    }
  };

  const handleOptionKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      moveFocus(1);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      moveFocus(-1);
    } else if (event.key === 'Home') {
      event.preventDefault();
      setFocusedIndex(0);
      optionRefs.current[0]?.focus();
    } else if (event.key === 'End') {
      event.preventDefault();
      const lastIndex = options.length - 1;
      setFocusedIndex(lastIndex);
      optionRefs.current[lastIndex]?.focus();
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      selectOption(focusedIndex);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      close();
    }
  };

  const setSearch = (nextValue: string) => {
    if (searchValue === undefined) setInternalSearchValue(nextValue);
    onSearchChange?.(nextValue);
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
        aria-label={placeholder}
        disabled={disabled}
        onClick={() => !disabled && (isOpen ? close() : setIsOpen(true))}
        onKeyDown={handleButtonKeyDown}
        className={`flex items-center justify-between font-medium transition-all cursor-pointer ${sizeClasses[size]} ${
          disabled
            ? 'opacity-50 cursor-not-allowed bg-stone-100 dark:bg-stone-800 text-stone-400 border border-stone-200/60 dark:border-stone-700/60'
            : 'bg-white dark:bg-stone-850 hover:bg-stone-50 dark:hover:bg-stone-800 text-stone-800 dark:text-stone-200 border border-stone-200/70 dark:border-stone-700/60 shadow-2xs hover:shadow-xs focus:outline-none focus:ring-2 focus:ring-rose-500/20'
        } ${buttonClassName}`}
      >
        <div className="flex items-center gap-1.5 min-w-0 truncate">
          {renderValue ? renderValue(selectedOption) : (
            <>
              {selectedOption?.dot && <span className={`w-2 h-2 rounded-full shrink-0 ${selectedOption.dot}`} />}
              {selectedOption?.icon && <span className="shrink-0 text-stone-500 dark:text-stone-400">{selectedOption.icon}</span>}
              <span className="truncate">{selectedOption ? selectedOption.label : placeholder}</span>
            </>
          )}
        </div>
        <ChevronDown className={`${iconSizes[size]} text-stone-400 dark:text-stone-500 transition-transform duration-200 ease-editorial-out shrink-0 ${isOpen ? 'rotate-180 text-stone-700 dark:text-stone-300' : ''}`} />
      </button>

      {isOpen && (
        <div className={`absolute z-50 mt-1.5 min-w-[160px] max-h-72 overflow-hidden bg-white/95 dark:bg-stone-900/95 backdrop-blur-md border border-stone-200/80 dark:border-stone-800 rounded-2xl shadow-modal animate-in fade-in zoom-in-95 duration-150 ease-editorial-out ${align === 'right' ? 'right-0' : 'left-0'} ${popoverClassName}`}>
          {searchable && (
            <div className="p-2 border-b border-stone-100 dark:border-stone-800 bg-stone-50/70 dark:bg-stone-800/80 flex items-center gap-2">
              <Search className="w-3.5 h-3.5 text-stone-400 dark:text-stone-500 ml-1 shrink-0" aria-hidden="true" />
              <input
                ref={searchRef}
                id={searchboxId}
                type="search"
                role="searchbox"
                aria-controls={listboxId}
                placeholder={searchPlaceholder}
                value={currentSearchValue}
                onChange={(event) => setSearch(event.target.value)}
                onKeyDown={handleSearchKeyDown}
                className="w-full text-xs bg-transparent outline-none placeholder:text-stone-400 dark:placeholder:text-stone-500 text-stone-900 dark:text-stone-100 font-medium"
              />
            </div>
          )}

          <div id={listboxId} role="listbox" aria-label={placeholder} className="max-h-60 overflow-y-auto p-1.5 space-y-0.5">
            {options.length === 0 ? emptyState : options.map((option, index) => {
              const isSelected = option.value === value;
              const isFocused = focusedIndex === index;
              return (
                <button
                  ref={(element) => { optionRefs.current[index] = element; }}
                  key={option.value}
                  id={`${listboxId}-option-${index}`}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  tabIndex={isFocused ? 0 : -1}
                  onFocus={() => setFocusedIndex(index)}
                  onKeyDown={handleOptionKeyDown}
                  onClick={() => selectOption(index)}
                  className={`w-full text-left px-2.5 py-1.5 rounded-xl text-xs font-medium flex items-center justify-between transition-colors cursor-pointer ${isSelected ? 'bg-rose-50 dark:bg-rose-950/40 text-rose-900 dark:text-rose-200 font-semibold' : 'text-stone-700 dark:text-stone-300 hover:bg-stone-100/80 dark:hover:bg-stone-800'} ${isFocused ? 'ring-1 ring-rose-500/30' : ''}`}
                >
                  {renderOption ? renderOption(option, { selected: isSelected, focused: isFocused }) : (
                    <div className="flex items-center gap-2 min-w-0 truncate">
                      {option.dot && <span className={`w-2 h-2 rounded-full shrink-0 ${option.dot}`} />}
                      {option.icon && <span className="shrink-0 text-stone-500 dark:text-stone-400">{option.icon}</span>}
                      <div className="truncate">
                        <div className="truncate">{option.label}</div>
                        {option.description && <div className="text-[10px] text-stone-400 dark:text-stone-500 font-normal truncate">{option.description}</div>}
                      </div>
                    </div>
                  )}
                  {!renderOption && isSelected && <Check className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400 shrink-0 ml-2" aria-hidden="true" />}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
