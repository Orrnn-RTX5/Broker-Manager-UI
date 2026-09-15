import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Search, RefreshCw, X } from 'lucide-react';
import { symbolsList } from '../../services/api';
import useSymbolStore from '../../store/symbolStore';
import { normalizeSymbolCatalog } from './symbolCatalog.js';
import './AllSymbolsDialog.css';

const PAGE_SIZE = 50;

export default function AllSymbolsDialog({ onClose }) {
  const dialogRef = useRef(null);
  const searchRef = useRef(null);
  const [symbols, setSymbols] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refresh, setRefresh] = useState(0);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const quotes = useSymbolStore(state => state.symbols);

  useEffect(() => {
    const dialog = dialogRef.current;
    const previous = document.activeElement;
    dialog.showModal();
    searchRef.current?.focus();
    return () => { dialog.close(); if (previous?.isConnected) previous.focus({ preventScroll: true }); };
  }, []);

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      setError('');
      try {
        const rows = normalizeSymbolCatalog(await symbolsList());
        if (active) { setSymbols(rows); setPage(0); }
      } catch (err) {
        if (active) setError(err.message || 'Could not load symbols. Please try again.');
      } finally {
        if (active) setLoading(false);
      }
    }
    load();
    return () => { active = false; };
  }, [refresh]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return symbols.filter(row => `${row.symbol} ${row.description}`.toLowerCase().includes(term));
  }, [symbols, search]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount - 1);
  const visible = filtered.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);

  return createPortal(<dialog ref={dialogRef} className="all-symbols-dialog" aria-labelledby="all-symbols-title" onCancel={event => { event.preventDefault(); onClose(); }}>
    <header><div><h2 id="all-symbols-title">All Symbols</h2><p>Browse available instruments. Quotes appear when available from the market feed.</p></div><button type="button" className="ui-btn ui-btn-ghost" aria-label="Close symbols" onClick={onClose}><X size={18} /></button></header>
    <div className="all-symbols-controls">
      <label><Search size={15} /><input ref={searchRef} aria-label="Search symbols" placeholder="Search symbols or descriptions…" value={search} onChange={event => { setSearch(event.target.value); setPage(0); }} /></label>
      <button type="button" className="ui-btn ui-btn-secondary ui-btn-sm" disabled={loading} onClick={() => setRefresh(value => value + 1)}><RefreshCw size={14} />Refresh</button>
    </div>
    {error && <div className="all-symbols-error" role="alert">{error}{symbols.length > 0 && ' Showing the previously loaded list.'}<button type="button" className="ui-btn ui-btn-secondary ui-btn-sm" onClick={() => setRefresh(value => value + 1)} disabled={loading}>Retry</button></div>}
    <div className="all-symbols-table" aria-busy={loading}>
      <table><thead><tr><th>Symbol</th><th>Description</th><th>Bid</th><th>Ask</th></tr></thead><tbody>
        {loading && !symbols.length ? <tr><td colSpan={4} className="all-symbols-empty" role="status">Loading symbols…</td></tr> : visible.length ? visible.map(row => {
          const quote = quotes[row.symbol];
          return <tr key={row.symbol}><td>{row.symbol}</td><td>{row.description || '—'}</td><td>{quote?.bid ?? '—'}</td><td>{quote?.ask ?? '—'}</td></tr>;
        }) : <tr><td colSpan={4} className="all-symbols-empty">{error ? 'The symbol list is unavailable.' : search ? 'No symbols match your search.' : 'No symbols are available from the server.'}</td></tr>}
      </tbody></table>
    </div>
    <footer><span role="status">{filtered.length ? `${currentPage * PAGE_SIZE + 1}–${Math.min((currentPage + 1) * PAGE_SIZE, filtered.length)} of ${filtered.length} symbols` : '0 symbols'}{loading && symbols.length > 0 ? ' · Refreshing…' : ''}</span><div><button type="button" className="ui-btn ui-btn-secondary ui-btn-sm" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>Previous</button><button type="button" className="ui-btn ui-btn-secondary ui-btn-sm" disabled={currentPage + 1 >= pageCount} onClick={() => setPage(currentPage + 1)}>Next</button></div></footer>
  </dialog>, document.body);
}
