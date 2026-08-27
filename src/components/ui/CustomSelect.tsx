import React, { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
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

interface PopoverPosition {
  left: number;
  minWidth: number;
  width?: number;
  maxHeight: number;
  placement: 'top' | 'bottom';
  offset: number;
}

interface CustomSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  ariaLabel?: string;
  ariaLabelledBy?: string;
  disabled?: boolean;
  className?: string;
  buttonClassName?: string;
  popoverClassName?: string;
  /** Use content width for rich options; the default keeps the popover aligned to the trigger. */
  popoverWidth?: 'trigger' | 'content';
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
  ariaLabel,
  ariaLabelledBy,
  disabled = false,
  className = '',
  buttonClassName = '',
  popoverClassName = '',
  popoverWidth = 'trigger',
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
  const [popoverPosition, setPopoverPosition] = useState<PopoverPosition | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const listboxId = useId();
  const searchboxId = `${listboxId}-search`;

  const selectedOption = options.find((option) => option.value === value);
  const currentSearchValue = searchValue ?? internalSearchValue;

  const updatePopoverPosition = useCallback(() => {
    const trigger = buttonRef.current;
    if (!trigger || typeof window === 'undefined') return;

    const rect = trigger.getBoundingClientRect();
    const viewportWidth = window.visualViewport?.width ?? window.innerWidth;
    const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
    const gutter = 8;
    const gap = 6;
    const maxWidth = Math.max(0, viewportWidth - gutter * 2);
    const minWidth = Math.min(Math.max(rect.width, 160), maxWidth);
    const measuredWidth = popoverRef.current?.getBoundingClientRect().width;
    const width = popoverWidth === 'content'
      ? Math.min(Math.max(measuredWidth || minWidth, minWidth), maxWidth)
      : minWidth;
    const availableBelow = Math.max(0, viewportHeight - rect.bottom - gap - gutter);
    const availableAbove = Math.max(0, rect.top - gap - gutter);
    const estimatedHeight = popoverRef.current?.getBoundingClientRect().height || 288;
    const placeAbove = availableBelow < Math.min(estimatedHeight, 220) && availableAbove > availableBelow;
    const availableHeight = placeAbove ? availableAbove : availableBelow;
    const maxHeight = Math.max(48, Math.min(288, availableHeight));
    const preferredLeft = align === 'right' ? rect.right - width : rect.left;
    const left = Math.min(Math.max(preferredLeft, gutter), Math.max(gutter, viewportWidth - width - gutter));

    setPopoverPosition({
      left,
      minWidth,
      width: popoverWidth === 'content' && measuredWidth ? width : undefined,
      maxHeight,
      placement: placeAbove ? 'top' : 'bottom',
      offset: placeAbove ? viewportHeight - rect.top + gap : rect.bottom + gap,
    });
  }, [align, popoverWidth]);

  useLayoutEffect(() => {
    if (!isOpen) {
      setPopoverPosition(null);
      return;
    }

    updatePopoverPosition();
    const frame = requestAnimationFrame(updatePopoverPosition);
    let scheduledFrame: number | null = null;
    const schedulePositionUpdate = () => {
      if (scheduledFrame !== null) return;
      scheduledFrame = requestAnimationFrame(() => {
        scheduledFrame = null;
        updatePopoverPosition();
      });
    };

    window.addEventListener('resize', schedulePositionUpdate);
    window.addEventListener('scroll', schedulePositionUpdate, true);
    window.visualViewport?.addEventListener('resize', schedulePositionUpdate);
    window.visualViewport?.addEventListener('scroll', schedulePositionUpdate);

    return () => {
      cancelAnimationFrame(frame);
      if (scheduledFrame !== null) cancelAnimationFrame(scheduledFrame);
      window.removeEventListener('resize', schedulePositionUpdate);
      window.removeEventListener('scroll', schedulePositionUpdate, true);
      window.visualViewport?.removeEventListener('resize', schedulePositionUpdate);
      window.visualViewport?.removeEventListener('scroll', schedulePositionUpdate);
    };
  }, [isOpen, options.length, currentSearchValue, updatePopoverPosition]);

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
      const target = event.target as Node | null;
      if (target && (containerRef.current?.contains(target) || popoverRef.current?.contains(target))) return;
      setIsOpen(false);
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
    <div className={`relative inline-block min-w-0 ${className}`} ref={containerRef}>
      <button
        ref={buttonRef}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-controls={isOpen ? listboxId : undefined}
        aria-label={ariaLabel || selectedOption?.label || placeholder}
        aria-labelledby={ariaLabelledBy}
        disabled={disabled}
        onClick={() => !disabled && (isOpen ? close() : setIsOpen(true))}
        onKeyDown={handleButtonKeyDown}
        className={`flex items-center justify-between font-medium transition-all cursor-pointer ${sizeClasses[size]} ${
          disabled
            ? 'opacity-50 cursor-not-allowed bg-stone-100 dark:bg-stone-800 text-stone-400 border border-stone-200/60 dark:border-stone-700/60'
            : 'bg-white dark:bg-stone-800 hover:bg-stone-50 dark:hover:bg-stone-700 text-stone-800 dark:text-stone-200 border border-stone-200/70 dark:border-stone-700/60 shadow-2xs hover:shadow-xs focus:outline-none focus:ring-2 focus:ring-rose-500/20'
        } ${buttonClassName}`}
      >
        <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden">
          {renderValue ? renderValue(selectedOption) : (
            <>
              {selectedOption?.dot && <span className={`w-2 h-2 rounded-full shrink-0 ${selectedOption.dot}`} />}
              {selectedOption?.icon && <span className="shrink-0 text-stone-500 dark:text-stone-400">{selectedOption.icon}</span>}
              <span className="min-w-0 truncate">{selectedOption ? selectedOption.label : placeholder}</span>
            </>
          )}
        </div>
        <ChevronDown className={`${iconSizes[size]} text-stone-400 dark:text-stone-500 transition-transform duration-200 ease-editorial-out shrink-0 ${isOpen ? 'rotate-180 text-stone-700 dark:text-stone-300' : ''}`} />
      </button>

      {isOpen && popoverPosition && typeof document !== 'undefined' && createPortal(
        <div
          ref={popoverRef}
          className={`fixed z-[100] min-w-0 max-w-[calc(100vw-1rem)] overflow-hidden bg-white/95 dark:bg-stone-900/95 backdrop-blur-md border border-stone-200/80 dark:border-stone-800 rounded-2xl shadow-modal animate-in fade-in zoom-in-95 duration-150 ease-editorial-out ${popoverClassName}`}
          style={{
            left: `${popoverPosition.left}px`,
            ...(popoverPosition.placement === 'top'
              ? { bottom: `${popoverPosition.offset}px` }
              : { top: `${popoverPosition.offset}px` }),
            minWidth: `${popoverPosition.minWidth}px`,
            ...(popoverPosition.width ? { width: `${popoverPosition.width}px` } : {}),
            maxWidth: 'calc(100vw - 1rem)',
            maxHeight: `${popoverPosition.maxHeight}px`,
          }}
        >
          {searchable && (
            <div className="p-2 border-b border-stone-100 dark:border-stone-800 bg-stone-50/70 dark:bg-stone-800/80 flex items-center gap-2">
              <Search className="w-3.5 h-3.5 text-stone-400 dark:text-stone-500 ml-1 shrink-0" aria-hidden="true" />
              <input
                ref={searchRef}
                id={searchboxId}
                type="search"
                enterKeyHint="search"
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
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

          <div id={listboxId} role="listbox" aria-label={ariaLabel || selectedOption?.label || placeholder} className="min-w-0 max-h-60 overflow-y-auto overscroll-contain p-1.5 space-y-0.5">
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
                  className={`flex w-full min-w-0 max-w-full items-start justify-between gap-2 overflow-hidden rounded-xl px-2.5 py-1.5 text-left text-xs font-medium transition-colors cursor-pointer ${isSelected ? 'bg-rose-50 dark:bg-rose-950/40 text-rose-900 dark:text-rose-200 font-semibold' : 'text-stone-700 dark:text-stone-300 hover:bg-stone-100/80 dark:hover:bg-stone-800'} ${isFocused ? 'ring-1 ring-rose-500/30' : ''}`}
                >
                  {renderOption ? (
                    <div className="min-w-0 max-w-full flex-1 overflow-hidden">
                      {renderOption(option, { selected: isSelected, focused: isFocused })}
                    </div>
                  ) : (
                    <div className="flex min-w-0 max-w-full flex-1 items-start gap-2">
                      {option.dot && <span className={`w-2 h-2 rounded-full shrink-0 ${option.dot}`} />}
                      {option.icon && <span className="shrink-0 text-stone-500 dark:text-stone-400">{option.icon}</span>}
                      <div className="min-w-0 max-w-full break-words [overflow-wrap:anywhere]">
                        <div className="line-clamp-2 whitespace-normal break-words">{option.label}</div>
                        {option.description && <div className="line-clamp-2 text-[10px] text-stone-400 dark:text-stone-500 font-normal whitespace-normal break-words">{option.description}</div>}
                      </div>
                    </div>
                  )}
                  {!renderOption && isSelected && <Check className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400 shrink-0 ml-2" aria-hidden="true" />}
                </button>
              );
            })}
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
};
