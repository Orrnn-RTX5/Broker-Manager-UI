import { useState, useMemo, useRef, useEffect } from 'react';
import { ChevronRight, ChevronDown, Check, Search, X } from 'lucide-react';
import FeedStatusNotice from '../../../components/FeedStatusNotice';
import useSymbolStore from '../../../store/symbolStore';
import { getSymbolFeedStatus } from '../../../utils/feedStatus';
import {
  NOT_CONFIGURED_HINT,
  ALLOW_ALL_SYMBOLS,
  categoryCounts,
  fetchSelectableSymbols,
  isSymbolSelectable,
  mergeSymbolOptions,
  symbolKey,
  toggleCategorySelection,
} from '../groupSymbolAvailability.js';

// restrictToConfigured: offer only symbols a group save accepts (an enabled
// instrument of the broker); other feed symbols are shown disabled. Selected
// symbols that are not saveable stay visible, marked, with a remove action.
// refusedSymbols: symbols the last save refused; always marked not saveable.
const SymbolSelector = ({ label, value = '', onChange, restrictToConfigured = false, refusedSymbols = [], disabled = false }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedSearch, setSelectedSearch] = useState('');
  const [expandedGroups, setExpandedGroups] = useState({});
  const containerRef = useRef(null);

  // Get symbol metadata (names and categories) from store without price info
  const symbolMetadata = useSymbolStore(state => state.symbolMetadata);
  const feedError = useSymbolStore(state => state.feedError);
  const isConnected = useSymbolStore(state => state.isConnected);
  // { rows, keys } from the backend, null when unavailable (then unrestricted).
  // State: idle (never opened) | loading | ready | failed. While loading nothing
  // can be added, so a category tick never picks up an unchecked symbol.
  const [selectable, setSelectable] = useState(null);
  const [selectableState, setSelectableState] = useState('idle');
  
  // Selected symbols as an array
  const selectedList = useMemo(() => {
    return value ? value.split(',').map(s => s.trim()).filter(Boolean) : [];
  }, [value]);

  const filteredSelectedList = useMemo(() => {
    const query = selectedSearch.trim().toLowerCase();
    return query ? selectedList.filter((symbol) => symbol.toLowerCase().includes(query)) : selectedList;
  }, [selectedList, selectedSearch]);

  const refusedKeys = useMemo(() => new Set(refusedSymbols.map(symbolKey)), [refusedSymbols]);
  const listPending = restrictToConfigured && selectableState === 'loading';
  const selectableKeys = restrictToConfigured && selectableState === 'ready' ? selectable?.keys ?? null : null;
  const canSelect = (symbol) => !restrictToConfigured || (!listPending && isSymbolSelectable(symbol, selectableKeys, refusedKeys));
  const options = useMemo(
    () => (restrictToConfigured ? mergeSymbolOptions(symbolMetadata, selectable?.rows) : symbolMetadata),
    [restrictToConfigured, symbolMetadata, selectable],
  );
  const unsaveableSelected = restrictToConfigured && !listPending
    ? selectedList.filter((symbol) => symbol !== ALLOW_ALL_SYMBOLS && !canSelect(symbol))
    : [];
  const allowsAll = restrictToConfigured && selectedList.length === 1 && selectedList[0] === ALLOW_ALL_SYMBOLS;

  const toggleSymbol = (symbol) => {
    let newList;
    if (selectedList.includes(symbol)) {
      newList = selectedList.filter(s => s !== symbol);
    } else {
      if (!canSelect(symbol)) return;
      newList = [...selectedList, symbol];
    }
    onChange(newList.join(', '));
  };

  const toggleGroup = (groupName) => {
    setExpandedGroups(prev => ({ ...prev, [groupName]: !prev[groupName] }));
  };

  // The category control acts on the complete category, rather than only the
  // currently visible search results.
  // Only saveable symbols are added or cleared; see toggleCategorySelection.
  const symbolsInGroup = (groupName) => options
    .filter((symbol) => (symbol.category || 'Others') === groupName)
    .map((symbol) => symbol.symbol);

  const toggleAllInGroup = (groupName) => {
    const newList = toggleCategorySelection(selectedList, symbolsInGroup(groupName), canSelect);
    if (newList !== selectedList) onChange(newList.join(', '));
  };

  const removeUnsaveable = () => {
    const remove = new Set(unsaveableSelected.map(symbolKey));
    onChange(selectedList.filter((symbol) => !remove.has(symbolKey(symbol))).join(', '));
  };

  // Group symbols for the dropdown
  const groupedData = useMemo(() => {
    const groups = {};
    options.forEach(s => {
      const cat = s.category || 'Others';
      if (!groups[cat]) groups[cat] = [];
      if (!search || s.symbol.toLowerCase().includes(search.toLowerCase())) {
        groups[cat].push(s);
      }
    });

    // Remove empty groups if searching
    if (search) {
      Object.keys(groups).forEach(key => {
        if (groups[key].length === 0) delete groups[key];
      });
    }

    return groups;
  }, [options, search]);

  // Close when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    useSymbolStore.getState().syncMetadata();
  }, []);

  // Re-read the instrument list each time the picker opens, so a symbol
  // enabled in Admin meanwhile becomes selectable without a reload.
  useEffect(() => {
    if (!restrictToConfigured || !isOpen) return undefined;
    let cancelled = false;
    fetchSelectableSymbols().then((result) => {
      if (cancelled) return;
      setSelectable(result);
      setSelectableState(result ? 'ready' : 'failed');
    });
    return () => {
      cancelled = true;
      // Closed before the list arrived: not loading any more (the next open refetches).
      setSelectableState((state) => (state === 'loading' ? 'idle' : state));
    };
  }, [restrictToConfigured, isOpen]);

  return (
    <div className="group-create-symbol" ref={containerRef}>
      <label>{label}</label>
      <button
        type="button"
        onClick={() => {
          if (!isOpen && restrictToConfigured) setSelectableState('loading');
          setIsOpen((open) => !open);
        }}
        aria-expanded={isOpen && !disabled}
        disabled={disabled}
      >
        {allowsAll ? (
          <span className="is-set">All enabled symbols</span>
        ) : selectedList.length === 0 ? (
          <span className="is-empty">Select symbols</span>
        ) : (
          <span className="is-set">
            {selectedList.length} selected
            {unsaveableSelected.length > 0 && (
              <span className="ml-1 text-red-600 dark:text-red-400">({unsaveableSelected.length} not configured)</span>
            )}
          </span>
        )}
        {isOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
      </button>

      {isOpen && !disabled && (
        <div className="absolute top-full right-0 mt-1 w-[560px] max-w-[calc(100vw-2rem)] bg-white dark:bg-[#1e1e1e] border border-gray-300 dark:border-[#333] shadow-xl z-[100] rounded-md flex flex-col h-[360px] overflow-hidden">
          
          {/* Search */}
          <div className="p-2 border-b dark:border-[#333] sticky top-0 bg-white dark:bg-[#1e1e1e] z-10">
            <div className="relative">
              <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
              <input 
                autoFocus
                type="text"
                placeholder="Search symbols..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full h-8 bg-gray-50 dark:bg-[#252526] border dark:border-[#444] rounded px-8 text-[12px] focus:outline-none focus:border-blue-500"
              />
              {search && (
                <X 
                  size={12} 
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 cursor-pointer" 
                  onClick={() => setSearch('')}
                />
              )}
            </div>
          </div>

          {listPending && (
            <div className="p-2 border-b dark:border-[#333] text-[11px] text-gray-500 dark:text-gray-400" role="status">
              Loading configured instruments…
            </div>
          )}

          {restrictToConfigured && selectableState === 'failed' && (
            <div className="p-2 border-b dark:border-[#333] text-[11px] text-amber-700 dark:text-amber-400" role="status">
              Configured instruments could not be loaded, so every quoted symbol is shown. The server still checks each symbol on save.
            </div>
          )}

          {feedError && symbolMetadata.length > 0 && (
            <div className="p-2 border-b dark:border-[#333] bg-white dark:bg-[#1e1e1e]">
              <FeedStatusNotice feedError={feedError} cachedCount={symbolMetadata.length} compact />
            </div>
          )}

          <div className="flex min-h-0 flex-1">
            {/* Main symbol browser: categories first, then their expandable trades. */}
            <div className="w-[58%] min-w-0 overflow-y-auto p-1 border-r dark:border-[#333]">
              {Object.keys(groupedData).length === 0 ? (
                feedError && symbolMetadata.length === 0 ? (
                  <div className="p-2"><FeedStatusNotice feedError={feedError} compact /></div>
                ) : (
                  <div className="p-4 text-center text-gray-400 text-[11px]">No symbols found</div>
                )
              ) : (
                Object.entries(groupedData).map(([groupName, syms]) => {
                  const isExpanded = expandedGroups[groupName] || search;
                  const counts = categoryCounts(selectedList, symbolsInGroup(groupName), canSelect);
                  const isGroupSelected = counts.selectable > 0 && counts.selected === counts.selectable;

                  return (
                    <div key={groupName} className="flex flex-col mb-1 last:mb-0">
                      <div className="flex items-center gap-1 px-1">
                        <button
                          type="button"
                          className="min-w-0 flex-1 flex items-center gap-2 px-1 py-1.5 hover:bg-gray-100 dark:hover:bg-[#2d2d30] text-left rounded transition-colors"
                          onClick={() => toggleGroup(groupName)}
                        >
                          {isExpanded ? <ChevronDown size={14} className="text-gray-400" /> : <ChevronRight size={14} className="text-gray-400" />}
                          <span className="flex-1 text-[12px] font-bold text-gray-700 dark:text-gray-300">{groupName}</span>
                          <span className="text-[10px] text-gray-400">
                            {counts.selected}/{counts.selectable}
                            {counts.notConfigured > 0 && ` (${counts.notConfigured} not configured)`}
                          </span>
                        </button>
                        <button
                          type="button"
                          disabled={listPending || counts.selectable === 0}
                          aria-checked={isGroupSelected}
                          aria-label={`Select all ${groupName} trades`}
                          onClick={() => toggleAllInGroup(groupName)}
                          className={`w-3.5 h-3.5 border rounded-sm flex items-center justify-center shrink-0 transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${isGroupSelected ? 'bg-blue-600 border-blue-600' : 'border-gray-400 dark:border-[#555] hover:border-blue-500'}`}
                          title={!restrictToConfigured
                            ? (isGroupSelected ? `Clear all ${groupName} trades` : `Select all ${groupName} trades`)
                            : listPending ? 'Loading configured instruments…'
                            : counts.selectable === 0 ? `No ${groupName} trade is configured`
                            : isGroupSelected ? `Clear all ${groupName} trades` : `Select all configured ${groupName} trades`}
                        >
                          {isGroupSelected && <Check size={10} className="text-white" aria-hidden="true" />}
                        </button>
                      </div>

                      {isExpanded && (
                        <div className="flex flex-col ml-6 pr-1 mt-1 gap-0.5 border-l dark:border-[#333]">
                          <div className="px-2 py-1 text-[9px] uppercase font-semibold tracking-wide text-gray-400">All {groupName} trades</div>
                          {syms.map(s => {
                            const isSelected = selectedList.includes(s.symbol);
                            const saveable = canSelect(s.symbol);
                            const status = getSymbolFeedStatus({ feedError, isConnected, symbol: s });
                            const rowClass = listPending
                              ? isSelected ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400' : 'text-gray-500 dark:text-gray-400 cursor-wait'
                              : !saveable
                              ? isSelected
                                ? 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400'
                                : 'text-gray-400 dark:text-gray-500 opacity-60 cursor-not-allowed'
                              : isSelected
                                ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400'
                                : 'hover:bg-gray-100 dark:hover:bg-[#252526] text-gray-600 dark:text-gray-300';
                            return (
                              <button
                                type="button"
                                key={s.symbol}
                                disabled={!saveable && !isSelected}
                                onClick={() => toggleSymbol(s.symbol)}
                                className={`flex items-center justify-between px-2 py-1 rounded text-left transition-colors ${rowClass}`}
                                title={listPending ? 'Loading configured instruments…' : saveable ? status.title : isSelected ? `${NOT_CONFIGURED_HINT}. Click to remove it from this group.` : NOT_CONFIGURED_HINT}
                              >
                                <span className="text-[11px] font-medium">{s.symbol}</span>
                                <div className="flex items-center gap-1.5">
                                  {!saveable && !listPending && (
                                    <span className={`text-[9px] uppercase font-bold ${isSelected ? 'px-1 rounded-sm bg-red-600 text-white' : 'text-gray-400'}`}>Not configured</span>
                                  )}
                                  {saveable && !status.isLive && <span className="text-[9px] uppercase font-bold text-gray-400">{status.label}</span>}
                                  <span className={`w-3.5 h-3.5 border rounded flex items-center justify-center transition-colors ${isSelected ? (saveable || listPending ? 'bg-blue-600 border-blue-600' : 'bg-red-600 border-red-600') : 'border-gray-400 dark:border-[#444]'}`}>
                                    {isSelected && <Check size={10} className="text-white" />}
                                  </span>
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            {/* Separate selection workspace: it never pushes the categories down. */}
            <aside className="w-[42%] min-w-0 flex flex-col bg-gray-50 dark:bg-[#1a1b1f]">
              <div className="px-3 py-2 border-b dark:border-[#333] flex items-center justify-between gap-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">Selected trades</span>
                <span className="text-[10px] text-blue-600 dark:text-blue-400 font-semibold">{selectedList.length}</span>
              </div>
              <div className="px-2 py-2 border-b dark:border-[#333]">
                <div className="relative">
                  <Search size={11} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" aria-hidden="true" />
                  <input
                    type="search"
                    value={selectedSearch}
                    onChange={(event) => setSelectedSearch(event.target.value)}
                    placeholder="Search selected trades..."
                    aria-label="Search selected trades"
                    className="w-full h-7 bg-white dark:bg-[#252526] border border-gray-300 dark:border-[#444] rounded px-7 pr-6 text-[11px] focus:outline-none focus:border-blue-500"
                  />
                  {selectedSearch && (
                    <button
                      type="button"
                      onClick={() => setSelectedSearch('')}
                      aria-label="Clear selected trades search"
                      className="absolute right-1.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                    >
                      <X size={11} aria-hidden="true" />
                    </button>
                  )}
                </div>
              </div>
              {unsaveableSelected.length > 0 && (
                <div className="px-2 py-2 border-b dark:border-[#333] text-[10px] text-red-700 dark:text-red-400 flex items-center justify-between gap-2" role="alert">
                  <span>{unsaveableSelected.length} selected {unsaveableSelected.length === 1 ? 'symbol is' : 'symbols are'} not configured. Remove {unsaveableSelected.length === 1 ? 'it' : 'them'} to save.</span>
                  <button type="button" onClick={removeUnsaveable} className="shrink-0 font-bold uppercase hover:text-red-600">Remove</button>
                </div>
              )}
              <div className="flex-1 min-h-0 overflow-y-auto p-2 flex flex-wrap content-start gap-1">
                {selectedList.length === 0 ? (
                  <p className="w-full pt-4 text-center text-[11px] text-gray-400">Select individual trades from a category.</p>
                ) : filteredSelectedList.length === 0 ? (
                  <p className="w-full pt-4 text-center text-[11px] text-gray-400">No selected trades match “{selectedSearch}”.</p>
                ) : (
                  filteredSelectedList.map((symbol) => {
                    const saveable = listPending || canSelect(symbol);
                    return (
                      <button
                        key={symbol}
                        type="button"
                        title={saveable ? `Remove ${symbol}` : `${symbol}: ${NOT_CONFIGURED_HINT}. Click to remove it.`}
                        onClick={() => toggleSymbol(symbol)}
                        className={saveable
                          ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 px-1.5 py-0.5 rounded-sm text-[10px] font-medium flex items-center gap-1 border border-blue-200 dark:border-blue-800 hover:border-red-400 hover:text-red-600 transition-colors'
                          : 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 px-1.5 py-0.5 rounded-sm text-[10px] font-medium flex items-center gap-1 border border-red-400 dark:border-red-700 hover:border-red-600 transition-colors'}
                      >
                        {symbol}
                        {!saveable && <span className="text-[8px] uppercase font-bold">not configured</span>}
                        <X size={10} aria-hidden="true" />
                      </button>
                    );
                  })
                )}
              </div>
              <div className="px-3 py-2 border-t dark:border-[#333] flex justify-between items-center">
                <span className="text-[9px] text-gray-400 uppercase font-semibold">Individual selection</span>
                <button onClick={() => onChange('')} disabled={selectedList.length === 0} className="text-[10px] text-red-500 hover:text-red-600 disabled:opacity-40 font-bold uppercase transition-colors">Clear all</button>
              </div>
            </aside>
          </div>
        </div>
      )}
    </div>
  );
};

export default SymbolSelector;
