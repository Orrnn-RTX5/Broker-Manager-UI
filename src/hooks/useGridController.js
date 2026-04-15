import { useState, useMemo, useCallback } from 'react';

/**
 * Reusable controller for data grids: multi-row selection, column visibility,
 * gridlines toggle, and filter reset plumbing. Grids and their context menus
 * consume the returned handlers via props so the menu can operate on real,
 * current grid state.
 *
 * Usage:
 *   const grid = useGridController({ columns: COLUMNS, rowKey: 'id' });
 *   ...
 *   <ClientsContextMenu grid={grid} rows={filteredRows} selectedRow={clickedRow} ... />
 *
 *   grid.selectedIds       : Set<rowId>
 *   grid.toggle(id)        : add/remove one row
 *   grid.selectAll(ids)    : replace selection
 *   grid.clear()           : clear selection
 *   grid.invert(allIds)    : flip selection across allIds
 *   grid.visibleColumns    : filtered COLUMNS array
 *   grid.toggleColumn(key) : show/hide one column
 *   grid.showGridlines     : boolean — drive CSS class on table
 *   grid.toggleGridlines() : flip
 */
export default function useGridController({ columns, rowKey = 'id', onClearFilter } = {}) {
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [hiddenColumns, setHiddenColumns] = useState(() => new Set());
  const [showGridlines, setShowGridlines] = useState(true);

  const toggle = useCallback((id) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const selectAll = useCallback((ids) => setSelectedIds(new Set(ids)), []);
  const clear = useCallback(() => setSelectedIds(new Set()), []);
  const invert = useCallback((allIds) => {
    setSelectedIds(prev => {
      const next = new Set();
      for (const id of allIds) if (!prev.has(id)) next.add(id);
      return next;
    });
  }, []);

  const toggleColumn = useCallback((key) => {
    setHiddenColumns(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }, []);

  const toggleGridlines = useCallback(() => setShowGridlines(v => !v), []);

  const visibleColumns = useMemo(
    () => (columns || []).filter(c => !hiddenColumns.has(c.key)),
    [columns, hiddenColumns]
  );

  const clearFilter = useCallback(() => {
    if (onClearFilter) onClearFilter();
  }, [onClearFilter]);

  return {
    rowKey,
    columns: columns || [],
    hiddenColumns,
    visibleColumns,
    toggleColumn,
    showGridlines,
    toggleGridlines,
    selectedIds,
    toggle,
    selectAll,
    clear,
    invert,
    clearFilter,
  };
}
