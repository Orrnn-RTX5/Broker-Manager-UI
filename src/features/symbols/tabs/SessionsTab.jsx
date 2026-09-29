import { showResult } from '../../../store/resultDialogStore.js';
import { useState, useEffect } from 'react';
import { Plus, Trash2, Save, Loader2, X } from 'lucide-react';
import {
  symbolSessionGet, symbolSessionSet,
  sessionOverrideList, sessionOverrideSet, sessionOverrideDelete,
} from '../../../services/api';

import { useFeedSymbols } from '../../../hooks/useFeedSymbols';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DEFAULT_SESSION_TIMES = {
  quoteStart: '00:00',
  quoteEnd: '23:59',
  tradeStart: '00:00',
  tradeEnd: '23:59',
};

const normalizeTime = value => String(value || '').slice(0, 5);

const createSessionRow = (session = {}, dayOfWeek) => ({
  day_of_week: dayOfWeek,
  quoteStart: normalizeTime(session.quoteStart ?? session.quote_from) || DEFAULT_SESSION_TIMES.quoteStart,
  quoteEnd: normalizeTime(session.quoteEnd ?? session.quote_to) || DEFAULT_SESSION_TIMES.quoteEnd,
  tradeStart: normalizeTime(session.tradeStart ?? session.trade_from) || DEFAULT_SESSION_TIMES.tradeStart,
  tradeEnd: normalizeTime(session.tradeEnd ?? session.trade_to) || DEFAULT_SESSION_TIMES.tradeEnd,
});

const serializeSessions = sessions => sessions.map(session => ({
  day_of_week: session.day_of_week,
  quote_from: session.quoteStart,
  quote_to: session.quoteEnd,
  trade_from: session.tradeStart,
  trade_to: session.tradeEnd,
}));

const createDefaultBaseSessions = () => DAYS.map((_, i) => ({
  day_of_week: i,
  ...DEFAULT_SESSION_TIMES,
}));

// ─── Session Row Editor ────────────────────────────────────────────────────────
const SessionRow = ({ day, session, onChange }) => (
  <tr>
    <td style={{ color: 'var(--text-2)', fontWeight: 500, width: 110 }}>{day}</td>
    <td>
      <input
        type="time"
        className="ui-input ui-input-sm"
        value={session?.quoteStart || ''}
        onChange={e => onChange('quoteStart', e.target.value)}
      />
    </td>
    <td>
      <input
        type="time"
        className="ui-input ui-input-sm"
        value={session?.quoteEnd || ''}
        onChange={e => onChange('quoteEnd', e.target.value)}
      />
    </td>
    <td>
      <input
        type="time"
        className="ui-input ui-input-sm"
        value={session?.tradeStart || ''}
        onChange={e => onChange('tradeStart', e.target.value)}
      />
    </td>
    <td>
      <input
        type="time"
        className="ui-input ui-input-sm"
        value={session?.tradeEnd || ''}
        onChange={e => onChange('tradeEnd', e.target.value)}
      />
    </td>
  </tr>
);

// ─── Override Form Modal ───────────────────────────────────────────────────────
const OverrideModal = ({ symbol, onClose, onSuccess }) => {
  const [group, setGroup] = useState('');
  const [rows, setRows] = useState(DAYS.map((_, i) => ({ day_of_week: i, quoteStart: '', quoteEnd: '', tradeStart: '', tradeEnd: '' })));
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const updateRow = (dayIdx, field, val) => {
    setRows(prev => prev.map((r, i) => i === dayIdx ? { ...r, [field]: val } : r));
  };

  const handleSave = async () => {
    if (!group) { setErr('Group is required'); return; }
    setSaving(true);
    setErr('');
    try {
      await sessionOverrideSet({ symbol, group }, rows);
      onSuccess();
    } catch (e) {
      setErr(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.6)' }}>
      <div className="ui-card w-full max-w-2xl p-6 flex flex-col gap-4" style={{ background: 'var(--surface)' }}>
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold" style={{ color: 'var(--text)' }}>Add Session Override</h2>
          <button onClick={onClose} className="ui-btn ui-btn-ghost ui-btn-icon ui-btn-sm"><X size={14} /></button>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium" style={{ color: 'var(--text-2)' }}>Group *</label>
          <input className="ui-input ui-input-sm" value={group} onChange={e => setGroup(e.target.value)} placeholder="e.g. Real\\Standard" />
        </div>
        <div className="overflow-auto">
          <table className="ui-grid w-full text-xs">
            <thead>
              <tr>
                <th>Day</th>
                <th>Quote Start</th>
                <th>Quote End</th>
                <th>Trade Start</th>
                <th>Trade End</th>
              </tr>
            </thead>
            <tbody>
              {DAYS.map((day, i) => (
                <SessionRow key={day} day={day} session={rows[i]} onChange={(f, v) => updateRow(i, f, v)} />
              ))}
            </tbody>
          </table>
        </div>
        {err && <p className="text-xs" style={{ color: 'var(--danger)' }}>{err}</p>}
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="ui-btn ui-btn-secondary ui-btn-sm">Cancel</button>
          <button onClick={handleSave} disabled={saving} className="ui-btn ui-btn-primary ui-btn-sm">
            {saving ? <Loader2 size={13} className="animate-spin" /> : <><Save size={13} /> Save Override</>}
          </button>
        </div>
      </div>
    </div>
  );
};

// ─── Main Tab ──────────────────────────────────────────────────────────────────
const SessionsTab = () => {
  const { symbols: allSymbols, loading: loadingSymbols, error: symbolLoadError } = useFeedSymbols();
  const [selectedSymbol, setSelectedSymbol] = useState('');
  const [baseSessions, setBaseSessions] = useState(createDefaultBaseSessions);
  const [overrides, setOverrides] = useState([]);
  const [loading, setLoading] = useState(false);
  const [savingBase, setSavingBase] = useState(false);
  const [showOverrideModal, setShowOverrideModal] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  useEffect(() => {
    if (!selectedSymbol) return;
    setLoading(true);
    Promise.all([
      symbolSessionGet(selectedSymbol).catch(() => null),
      sessionOverrideList({ symbol: selectedSymbol }).catch(() => []),
    ]).then(([sessions, ovr]) => {
      if (Array.isArray(sessions) && sessions.length > 0) {
        const mapped = DAYS.map((_, i) => createSessionRow(
          sessions.find(session => Number(session.day_of_week) === i),
          i,
        ));
        setBaseSessions(mapped);
      } else {
        setBaseSessions(createDefaultBaseSessions());
      }
      setOverrides(Array.isArray(ovr) ? ovr : []);
    }).finally(() => setLoading(false));
  }, [selectedSymbol]);

  const updateBaseRow = (dayIdx, field, val) => {
    setBaseSessions(prev => prev.map((r, i) => i === dayIdx ? { ...r, [field]: val } : r));
  };

  const handleSaveBase = async () => {
    setSavingBase(true);
    try {
      await symbolSessionSet(selectedSymbol, serializeSessions(baseSessions));
    } catch (e) {
      showResult.error('Save failed: ' + e.message);
    } finally {
      setSavingBase(false);
    }
  };

  const handleDeleteOverride = async (id) => {
    if (!window.confirm('Delete this override?')) return;
    setDeletingId(id);
    try {
      await sessionOverrideDelete(id);
      setOverrides(prev => prev.filter(o => o.id !== id));
    } catch (e) {
      showResult.error('Delete failed: ' + e.message);
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="h-full flex flex-col gap-4 overflow-auto">
      {/* Symbol selector */}
      <div className="flex items-center gap-3 shrink-0">
        <label className="text-xs font-medium shrink-0" style={{ color: 'var(--text-2)' }}>Symbol:</label>
        {loadingSymbols ? (
          <div className="flex items-center gap-2 py-1 px-2 text-xs" style={{ color: 'var(--muted)' }}>
            <Loader2 size={12} className="animate-spin" /> Loading symbols…
          </div>
        ) : symbolLoadError ? (
          <div className="py-1 px-2 text-xs" style={{ color: 'var(--warning, var(--muted))' }}>
            {symbolLoadError}
          </div>
        ) : (
          <select
            className="ui-input ui-input-sm"
            style={{ width: 200 }}
            value={selectedSymbol}
            onChange={e => setSelectedSymbol(e.target.value)}
          >
            <option value="">— select symbol —</option>
            {allSymbols.map(s => <option key={s.symbol || s} value={s.symbol || s}>{s.symbol || s}</option>)}
          </select>
        )}
      </div>

      {!selectedSymbol ? (
        <p className="text-sm" style={{ color: 'var(--muted)' }}>Select a symbol to view and edit its sessions.</p>
      ) : loading ? (
        <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--muted)' }}>
          <Loader2 size={14} className="animate-spin" /> Loading sessions…
        </div>
      ) : (
        <>
          {/* Base sessions */}
          <div className="ui-card p-4 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Base Trading Sessions</h3>
              <button onClick={handleSaveBase} disabled={savingBase} className="ui-btn ui-btn-primary ui-btn-sm">
                {savingBase ? <Loader2 size={13} className="animate-spin" /> : <><Save size={13} /> Save</>}
              </button>
            </div>
            <div className="overflow-auto">
              <table className="ui-grid w-full text-xs">
                <thead>
                  <tr>
                    <th style={{ width: 110 }}>Day</th>
                    <th>Quote Start</th>
                    <th>Quote End</th>
                    <th>Trade Start</th>
                    <th>Trade End</th>
                  </tr>
                </thead>
                <tbody>
                  {DAYS.map((day, i) => (
                    <SessionRow key={day} day={day} session={baseSessions[i]} onChange={(f, v) => updateBaseRow(i, f, v)} />
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Overrides */}
          <div className="ui-card p-4 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Per-Group Session Overrides</h3>
              <button onClick={() => setShowOverrideModal(true)} className="ui-btn ui-btn-secondary ui-btn-sm">
                <Plus size={13} /> Add Override
              </button>
            </div>
            {overrides.length === 0 ? (
              <p className="text-xs" style={{ color: 'var(--muted)' }}>No overrides configured for this symbol.</p>
            ) : (
              <table className="ui-grid w-full text-xs">
                <thead>
                  <tr>
                    <th>Group</th>
                    <th>Day</th>
                    <th>Quote Window</th>
                    <th>Trade Window</th>
                    <th style={{ textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {overrides.map(o => (
                    <tr key={o.id}>
                      <td style={{ color: 'var(--accent-text)' }}>{o.group}</td>
                      <td style={{ color: 'var(--text-2)' }}>{DAYS[o.day_of_week] || o.day_of_week}</td>
                      <td style={{ color: 'var(--text-2)' }}>{o.quoteStart} – {o.quoteEnd}</td>
                      <td style={{ color: 'var(--text-2)' }}>{o.tradeStart} – {o.tradeEnd}</td>
                      <td style={{ textAlign: 'right' }}>
                        <button
                          onClick={() => handleDeleteOverride(o.id)}
                          disabled={deletingId === o.id}
                          className="ui-btn ui-btn-ghost ui-btn-icon ui-btn-sm"
                          style={{ color: 'var(--danger)' }}
                        >
                          {deletingId === o.id ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      {showOverrideModal && (
        <OverrideModal
          symbol={selectedSymbol}
          onClose={() => setShowOverrideModal(false)}
          onSuccess={() => {
            setShowOverrideModal(false);
            sessionOverrideList({ symbol: selectedSymbol }).then(data => setOverrides(Array.isArray(data) ? data : [])).catch(() => {});
          }}
        />
      )}
    </div>
  );
};

export default SessionsTab;
