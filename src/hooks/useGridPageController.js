import { showResult } from '../store/resultDialogStore.js';
import { useState, useRef, useCallback } from 'react';
import useGridController from './useGridController';
import { rowsToCSV, rowsToTSV, rowsToJSON, copyToClipboard, downloadBlob, stampedFilename } from '../utils/gridUtils';

/**
 * Bundles everything a grid page needs to wire up the ClientsContextMenu:
 *   - useGridController (selection, columns, gridlines, clear-filter hook)
 *   - rowsRef holding the grid's filtered rows
 *   - contextMenu state + open handlers (for page-bg and row right-click)
 *   - copy-as / export handlers acting on selection-or-visible
 *
 * Returns ready-to-spread props for both the <DataGrid> and the <ClientsContextMenu>.
 */
export default function useGridPageController({
  columns,
  rowKey = 'id',
  exportName = 'rows',
  onClearFilter,
  entityLabel = 'row',
  singleSelect = false,
}) {
  const grid = useGridController({ columns, rowKey, onClearFilter, singleSelect });
  const [contextMenu, setContextMenu] = useState(null);
  const rowsRef = useRef([]);

  const handleRowsChange = useCallback((rows) => {
    rowsRef.current = rows;
    // Rows belong to the grid. Mirroring each live-price frame into parent
    // state renders the entire page again and feeds back into row effects.
    // Menu actions read this ref; opening the menu already renders the parent.
  }, []);

  const handlePageContext = useCallback((e) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, row: null, rows: rowsRef.current });
  }, []);

  const handleRowContext = useCallback((e, row) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, row, rows: rowsRef.current });
  }, []);

  const closeMenu = useCallback(() => setContextMenu(null), []);

  const targetRows = useCallback(() => {
    if (grid.selectedIds.size === 0) return rowsRef.current;
    return rowsRef.current.filter(r => grid.selectedIds.has(r[rowKey]));
  }, [grid.selectedIds, rowKey]);

  const handleCopyAs = useCallback((format) => {
    const rows = targetRows();
    if (rows.length === 0) { showResult.info('No rows to copy.'); return; }
    const cols = grid.visibleColumns;
    const text =
      format === 'json' ? rowsToJSON(rows, cols) :
      format === 'tsv'  ? rowsToTSV(rows, cols)  :
                          rowsToCSV(rows, cols);
    copyToClipboard(text)
      .then(() => showResult.success(`Copied ${rows.length} row(s) as ${format.toUpperCase()}.`))
      .catch(err => showResult.error(`Copy failed: ${err.message}`));
  }, [grid.visibleColumns, targetRows]);

  const handleExport = useCallback(() => {
    const rows = targetRows();
    if (rows.length === 0) { showResult.info('No rows to export.'); return; }
    const csv = rowsToCSV(rows, grid.visibleColumns);
    downloadBlob(csv, stampedFilename(exportName, 'csv'));
  }, [grid.visibleColumns, targetRows, exportName]);

  return {
    grid,
    rowsRef,
    gridProps: { onRowsChange: handleRowsChange, onRowContext: handleRowContext },
    contextMenuProps: {
      ...(contextMenu || {}),
      isOpen: !!contextMenu,
      grid,
      rows: contextMenu?.rows || [],
      selectedRow: contextMenu?.row || null,
      entityLabel,
      onCopyAs: handleCopyAs,
      onExport: handleExport,
      onClose: closeMenu,
    },
    pageProps: { onContextMenu: handlePageContext },
  };
}
