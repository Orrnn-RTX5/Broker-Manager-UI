import React, { useState, useMemo, useRef, useEffect } from 'react';
import { ChevronRight, ChevronDown, Check, Search, X, Layers } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import useSymbolStore from '../../../store/symbolStore';

const SymbolSelector = ({ label, value = '', onChange }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [expandedGroups, setExpandedGroups] = useState({});
  const containerRef = useRef(null);

  // Get symbol metadata (names and categories) from store without price info
  const symbolMetadata = useSymbolStore(state => state.symbolMetadata);
  
  // Selected symbols as an array
  const selectedList = useMemo(() => {
    return value ? value.split(',').map(s => s.trim()).filter(Boolean) : [];
  }, [value]);

  const toggleSymbol = (symbol) => {
    let newList;
    if (selectedList.includes(symbol)) {
      newList = selectedList.filter(s => s !== symbol);
    } else {
      newList = [...selectedList, symbol];
    }
    onChange(newList.join(', '));
  };

  const toggleGroup = (groupName) => {
    setExpandedGroups(prev => ({ ...prev, [groupName]: !prev[groupName] }));
  };

  const selectAllInGroup = (groupSymbols, isAlreadyFull) => {
    const symbolNames = groupSymbols.map(s => s.symbol);
    let newList;
    if (isAlreadyFull) {
      newList = selectedList.filter(s => !symbolNames.includes(s));
    } else {
      newList = Array.from(new Set([...selectedList, ...symbolNames]));
    }
    onChange(newList.join(', '));
  };

  // Group symbols for the dropdown
  const groupedData = useMemo(() => {
    const groups = {};
    symbolMetadata.forEach(s => {
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
  }, [symbolMetadata, search]);

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

  return (
    <div className="flex flex-col gap-1 w-full relative" ref={containerRef}>
      <label className="text-[11px] text-gray-500 dark:text-gray-400 font-medium">{label}</label>
      
      <div 
        onClick={() => setIsOpen(!isOpen)}
        className="min-h-[30px] w-full bg-white dark:bg-[#1a1b1f] border border-gray-300 dark:border-gray-700 rounded-sm px-2 py-1 flex flex-wrap gap-1 cursor-pointer hover:border-blue-500 transition-colors"
      >
        {selectedList.length === 0 ? (
          <span className="text-[12px] text-gray-400">Select symbols...</span>
        ) : (
          selectedList.map(s => (
            <span key={s} className="bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 px-1.5 py-0.5 rounded-sm text-[10px] font-medium flex items-center gap-1 border border-blue-200 dark:border-blue-800">
              {s}
              <X 
                size={10} 
                className="hover:text-red-500 cursor-pointer" 
                onClick={(e) => { e.stopPropagation(); toggleSymbol(s); }} 
              />
            </span>
          ))
        )}
      </div>

      {isOpen && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-[#1e1e1e] border border-gray-300 dark:border-[#333] shadow-xl z-[100] rounded-md flex flex-col max-h-[300px] overflow-hidden">
          
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

          {/* Groups List */}
          <div className="overflow-y-auto flex-1 p-1">
            {Object.keys(groupedData).length === 0 ? (
              <div className="p-4 text-center text-gray-400 text-[11px]">No symbols found</div>
            ) : (
              Object.entries(groupedData).map(([groupName, syms]) => {
                const isExpanded = expandedGroups[groupName] || search;
                const selectedInGroup = syms.filter(s => selectedList.includes(s.symbol)).length;
                const isFull = selectedInGroup === syms.length && syms.length > 0;

                return (
                  <div key={groupName} className="flex flex-col mb-1 last:mb-0">
                    <div 
                      className="flex items-center gap-2 px-2 py-1.5 hover:bg-gray-100 dark:hover:bg-[#2d2d30] cursor-pointer rounded transition-colors group"
                      onClick={() => toggleGroup(groupName)}
                    >
                      {isExpanded ? <ChevronDown size={14} className="text-gray-400" /> : <ChevronRight size={14} className="text-gray-400" />}
                      <div className="flex-1 flex items-center justify-between">
                        <span className="text-[12px] font-bold text-gray-700 dark:text-gray-300">{groupName}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-gray-400">{selectedInGroup}/{syms.length}</span>
                          <div 
                            className={`w-3.5 h-3.5 border rounded flex items-center justify-center transition-colors ${isFull ? 'bg-blue-600 border-blue-600' : 'border-gray-400 dark:border-[#444] group-hover:border-blue-500'}`}
                            onClick={(e) => { e.stopPropagation(); selectAllInGroup(syms, isFull); }}
                          >
                             {isFull && <Check size={10} className="text-white" />}
                          </div>
                        </div>
                      </div>
                    </div>

                    {isExpanded && (
                      <div className="flex flex-col ml-6 pr-1 mt-1 gap-0.5 border-l dark:border-[#333]">
                        {syms.map(s => {
                          const isSelected = selectedList.includes(s.symbol);
                          return (
                            <div 
                              key={s.symbol}
                              onClick={() => toggleSymbol(s.symbol)}
                              className={`flex items-center justify-between px-2 py-1 rounded cursor-pointer transition-colors ${isSelected ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400' : 'hover:bg-gray-100 dark:hover:bg-[#252526] text-gray-600 dark:text-gray-300'}`}
                            >
                              <span className="text-[11px] font-medium">{s.symbol}</span>
                              <div className={`w-3.5 h-3.5 border rounded flex items-center justify-center transition-colors ${isSelected ? 'bg-blue-600 border-blue-600' : 'border-gray-400 dark:border-[#444]'}`}>
                                {isSelected && <Check size={10} className="text-white" />}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
          
          {/* Footer */}
          <div className="p-2 border-t dark:border-[#333] flex justify-between items-center bg-gray-50 dark:bg-[#1a1b1f]">
            <span className="text-[10px] text-gray-400 uppercase font-bold tracking-wider">{selectedList.length} Selected</span>
            <button 
              onClick={() => onChange('')}
              className="text-[10px] text-red-500 hover:text-red-600 font-bold uppercase transition-colors"
            >
              Clear All
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default SymbolSelector;
