import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Search } from 'lucide-react';

const FilterDropdown = ({
  value,
  options = [],
  onChange,
  className = '',
  style,
  disabled = false,
  loading = false,
  loadingLabel = 'Loading options…',
  emptyLabel = 'No options available',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const rootRef = useRef(null);
  const buttonId = useId();

  const availableOptions = useMemo(
    () => [...new Set(options.filter(Boolean).map((option) => String(option)))],
    [options]
  );
  const hasSearch = availableOptions.length > 10;
  const filteredOptions = useMemo(() => {
    const query = searchQuery.trim().toLocaleLowerCase();
    if (!query) return availableOptions;
    return availableOptions.filter((option) => option.toLocaleLowerCase().includes(query));
  }, [availableOptions, searchQuery]);

  const closeMenu = () => {
    setIsOpen(false);
    setSearchQuery('');
  };

  useEffect(() => {
    if (!isOpen) return undefined;

    const handlePointerDown = (event) => {
      if (!rootRef.current?.contains(event.target)) closeMenu();
    };
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') closeMenu();
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const selectOption = (option) => {
    onChange?.(option);
    closeMenu();
  };

  return (
    <div ref={rootRef} className={`relative shrink-0 ${className}`} style={style}>
      <button
        id={buttonId}
        type="button"
        disabled={disabled || loading}
        onClick={() => {
          if (isOpen) closeMenu();
          else setIsOpen(true);
        }}
        className="ui-input ui-input-sm h-7 w-full text-left text-xs cursor-pointer disabled:cursor-not-allowed disabled:opacity-70"
        style={{ display: 'flex', alignItems: 'center', padding: '0 28px 0 10px' }}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
      >
        <span className="block min-w-0 flex-1 truncate" style={{ color: 'var(--text-2)' }}>
          {loading ? loadingLabel : value}
        </span>
        <ChevronDown
          size={12}
          className={`absolute right-2 top-1/2 -translate-y-1/2 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          style={{ color: 'var(--muted)' }}
          aria-hidden="true"
        />
      </button>

      {isOpen && (
        <div
          role="listbox"
          aria-labelledby={buttonId}
          className="absolute left-0 right-0 top-[calc(100%+4px)] z-50 overflow-hidden rounded-md shadow-lg"
          style={{ background: 'var(--surface)', border: '1px solid var(--border-3)' }}
        >
          {hasSearch && (
            <div className="relative border-b p-1.5" style={{ borderColor: 'var(--border)' }}>
              <Search
                size={12}
                className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
                style={{ color: 'var(--muted)' }}
                aria-hidden="true"
              />
              <input
                autoFocus
                type="search"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search options…"
                aria-label="Search filter options"
                className="ui-input ui-input-sm h-7 w-full text-xs"
                style={{ paddingLeft: 28 }}
              />
            </div>
          )}

          <div className="max-h-64 overflow-y-auto py-1">
            {filteredOptions.length === 0 ? (
              <div className="px-3 py-2 text-xs" style={{ color: 'var(--muted)' }}>
                {emptyLabel}
              </div>
            ) : filteredOptions.map((option) => {
              const isSelected = option === value;
              return (
                <button
                  key={option}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => selectOption(option)}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs transition-colors hover:bg-[var(--surface-2)]"
                  style={{ background: isSelected ? 'var(--accent-soft)' : 'transparent', color: 'var(--text)' }}
                >
                  <span className="min-w-0 flex-1 truncate">{option}</span>
                  {isSelected && <Check size={14} style={{ color: 'var(--accent-text)' }} aria-hidden="true" />}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default FilterDropdown;
