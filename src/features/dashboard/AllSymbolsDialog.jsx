import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Search, X } from 'lucide-react';
import { peekSymbolsList, symbolsList } from '../../services/api';
import useSymbolStore from '../../store/symbolStore';
import { normalizeSymbolCatalog } from './symbolCatalog.js';
import './AllSymbolsDialog.css';

const PAGE_SIZE = 50;
const FRESH_CATALOG_MS = 60_000;
const isFreshCatalog = (catalog) => {
  const age = catalog ? Date.now() - catalog.savedAt : Infinity;
  return age >= 0 && age < FRESH_CATALOG_MS;
};

const SymbolRow = memo(function SymbolRow({ row }) {
  const quote = useSymbolStore(state => state.symbols[row.symbol]);
  return (
    <tr>
      <td title={row.symbol}>{row.symbol}</td>
      <td title={row.description || undefined}>{row.description || '—'}</td>
      <td>{quote?.bid ?? '—'}</td>
      <td>{quote?.ask ?? '—'}</td>
    </tr>
  );
});

const readInitialCatalog = () => {
  try {
    const snapshot = peekSymbolsList();
    if (!snapshot) return null;
    return {
      symbols: normalizeSymbolCatalog(snapshot.symbols),
      savedAt: Number(snapshot.savedAt) || 0,
    };
  } catch {
    return null;
  }
};

export default function AllSymbolsDialog({ onClose }) {
  const dialogRef = useRef(null);
  const searchRef = useRef(null);
  const [initialCatalog] = useState(readInitialCatalog);
  const [symbols, setSymbols] = useState(() => initialCatalog?.symbols || []);
  const [savedAt, setSavedAt] = useState(initialCatalog?.savedAt || 0);
  const [hasCatalog, setHasCatalog] = useState(Boolean(initialCatalog));
  const [cached, setCached] = useState(Boolean(initialCatalog));
  const [loading, setLoading] = useState(() => !isFreshCatalog(initialCatalog));
  const [error, setError] = useState('');
  const [refresh, setRefresh] = useState(0);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);

  useEffect(() => {
    const dialog = dialogRef.current;
    const previous = document.activeElement;
    dialog.showModal();
    searchRef.current?.focus();
    return () => { dialog.close(); if (previous?.isConnected) previous.focus({ preventScroll: true }); };
  }, []);

  useEffect(() => {
    const freshCatalog = isFreshCatalog(initialCatalog);
    if (refresh === 0 && freshCatalog) return undefined;
    let active = true;
    async function load() {
      setLoading(true);
      setError('');
      try {
        const rows = normalizeSymbolCatalog(await symbolsList({ force: refresh > 0 || (Boolean(initialCatalog) && !freshCatalog) }));
        if (active) {
          setSymbols(rows);
          setSavedAt(peekSymbolsList()?.savedAt || Date.now());
          setHasCatalog(true);
          setCached(false);
        }
      } catch (err) {
        if (active) setError(err.message || 'Could not load symbols. Please try again.');
      } finally {
        if (active) setLoading(false);
      }
    }
    load();
    return () => { active = false; };
  }, [initialCatalog, refresh]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return symbols.filter(row => `${row.symbol} ${row.description}`.toLowerCase().includes(term));
  }, [symbols, search]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount - 1);
  const visible = filtered.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);
  const updatedAt = useMemo(() => savedAt
    ? new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(new Date(savedAt))
    : '', [savedAt]);
  const catalogStatus = loading
    ? hasCatalog ? `Saved list from ${updatedAt || 'earlier'} · Refreshing…` : 'Loading catalog…'
    : error && !hasCatalog ? 'Catalog unavailable'
      : cached ? `Saved list from ${updatedAt || 'earlier'}` : `Updated ${updatedAt || 'just now'}`;

  return createPortal(
    <dialog
      ref={dialogRef}
      className="all-symbols-dialog"
      aria-labelledby="all-symbols-title"
      onCancel={event => { event.preventDefault(); onClose(); }}
    >
      <header>
        <h2 id="all-symbols-title">All Symbols</h2>
        <button type="button" className="ui-btn ui-btn-ghost" aria-label="Close symbols" onClick={onClose}>
          <X size={18} />
        </button>
      </header>
      <div className="all-symbols-controls">
        <label>
          <Search size={15} />
          <input
            ref={searchRef}
            aria-label="Search symbols"
            placeholder="Search symbols or descriptions…"
            value={search}
            onChange={event => { setSearch(event.target.value); setPage(0); }}
          />
        </label>
      </div>
      {error && (
        <div className="all-symbols-error" role="alert">
          {error}
          {hasCatalog && ' Showing the previously loaded list.'}
          <button
            type="button"
            className="ui-btn ui-btn-secondary ui-btn-sm"
            onClick={() => setRefresh(value => value + 1)}
            disabled={loading}
          >
            Retry
          </button>
        </div>
      )}
      <div className="all-symbols-table" aria-busy={loading && !hasCatalog}>
        <table>
          <colgroup>
            <col className="all-symbols-col" />
            <col className="all-symbols-col" />
            <col className="all-symbols-col" />
            <col className="all-symbols-col" />
          </colgroup>
          <thead>
            <tr>
              <th>Symbol</th>
              <th>Description</th>
              <th>Bid</th>
              <th>Ask</th>
            </tr>
          </thead>
          <tbody>
            {loading && !hasCatalog ? (
              <tr>
                <td colSpan={4} className="all-symbols-empty" role="status">
                  Loading symbols…
                </td>
              </tr>
            ) : visible.length ? (
              visible.map(row => <SymbolRow key={row.symbol} row={row} />)
            ) : (
              <tr>
                <td colSpan={4} className="all-symbols-empty">
                  {error && !hasCatalog
                    ? 'The symbol list is unavailable.'
                    : search
                      ? 'No symbols match your search.'
                      : 'No symbols are available from the server.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <footer>
        <span role="status">
          {filtered.length
            ? `${currentPage * PAGE_SIZE + 1}–${Math.min((currentPage + 1) * PAGE_SIZE, filtered.length)} of ${filtered.length} symbols`
            : '0 symbols'}{' '}
          · {catalogStatus}
        </span>
        <div>
          <button
            type="button"
            className="ui-btn ui-btn-secondary ui-btn-sm"
            disabled={currentPage === 0}
            onClick={() => setPage(currentPage - 1)}
          >
            Previous
          </button>
          <button
            type="button"
            className="ui-btn ui-btn-secondary ui-btn-sm"
            disabled={currentPage + 1 >= pageCount}
            onClick={() => setPage(currentPage + 1)}
          >
            Next
          </button>
        </div>
      </footer>
    </dialog>,
    document.body
  );
}
