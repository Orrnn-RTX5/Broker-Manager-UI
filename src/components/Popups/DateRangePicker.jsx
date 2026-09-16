import { useState, useRef, useEffect } from 'react';
import { ChevronLeft, ChevronRight, CalendarDays, ChevronDown } from 'lucide-react';
import { useI18nStore } from '../../i18n/index.js';


const today = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };

function isSameDay(a, b) {
  return a && b && a.toDateString() === b.toDateString();
}

function fmt(d) {
  if (!d) return '—';
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
}

const PRESETS = [
  { label: 'Today', range: () => { const d = today(); return [d, d]; } },
  { label: 'Yesterday', range: () => { const d = new Date(today()); d.setDate(d.getDate() - 1); return [d, d]; } },
  { label: 'Last 7 Days', range: () => { const e = today(); const s = new Date(e); s.setDate(s.getDate() - 6); return [s, e]; } },
  {
    label: 'Last Week', range: () => {
      const now = today();
      const dow = now.getDay();
      const s = new Date(now); s.setDate(now.getDate() - dow - 7);
      const e = new Date(s); e.setDate(s.getDate() + 6);
      return [s, e];
    }
  },
  { label: 'Last 30 Days', range: () => { const e = today(); const s = new Date(e); s.setDate(s.getDate() - 29); return [s, e]; } },
  { label: 'This Month', range: () => { const now = today(); const s = new Date(now.getFullYear(), now.getMonth(), 1); return [s, now]; } },
  {
    label: 'Last Month', range: () => {
      const now = today();
      const s = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const e = new Date(now.getFullYear(), now.getMonth(), 0);
      return [s, e];
    }
  },
  { label: 'This Year', range: () => { const now = today(); return [new Date(now.getFullYear(), 0, 1), now]; } },
  { label: 'All Time', range: () => [new Date(1970, 0, 1), today()] },
];

/* one month grid */
function MonthGrid({ year, month, startDate, endDate, hovered, onDayClick, onDayHover }) {
  const language = useI18nStore((state) => state.language);
  const monthLabel = new Intl.DateTimeFormat(language, { month: 'long' }).format(new Date(year, month, 1));
  const days = Array.from({ length: 7 }, (_, day) => new Intl.DateTimeFormat(language, { weekday: 'short' }).format(new Date(2026, 0, 4 + day)));
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));

  const rangeEnd = endDate || hovered;
  const lo = startDate && rangeEnd ? (startDate < rangeEnd ? startDate : rangeEnd) : startDate;
  const hi = startDate && rangeEnd ? (startDate < rangeEnd ? rangeEnd : startDate) : rangeEnd;

  return (
    <div className="select-none w-[196px] shrink-0">
      <div className="text-center text-xs py-1 font-medium" style={{ color: 'var(--text)' }}>{monthLabel} {year}</div>
      <div className="grid grid-cols-7 mb-0.5">
        {days.map(d => (
          <div key={d} className="text-center text-[10px] py-1 font-medium" style={{ color: 'var(--muted)' }}>{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-y-px">
        {cells.map((date, i) => {
          if (!date) return <div key={`e-${i}`} />;
          const cur = new Date(date); cur.setHours(0, 0, 0, 0);
          const isStart = lo && isSameDay(cur, lo);
          const isEnd = hi && isSameDay(cur, hi);
          const inRange = lo && hi && cur > lo && cur < hi;
          const isTod = isSameDay(cur, today());

          const style = {};
          let extraClass = '';
          if (isStart || isEnd) { style.background = 'var(--accent)'; style.color = '#fff'; }
          else if (inRange) { style.background = 'var(--accent-soft)'; style.color = 'var(--accent-text)'; }
          else if (isTod) style.color = 'var(--accent)';
          else style.color = 'var(--text-2)';

          return (
            <div
              key={i}
              onClick={() => onDayClick(cur)}
              onMouseEnter={() => onDayHover(cur)}
              className={`text-center text-[11px] py-1 cursor-pointer rounded-md ${extraClass}`}
              style={style}
              onMouseOver={(e) => { if (!isStart && !isEnd) e.currentTarget.style.background = 'var(--accent-soft)'; }}
              onMouseOut={(e) => {
                if (isStart || isEnd) return;
                if (inRange) e.currentTarget.style.background = 'var(--accent-soft)';
                else e.currentTarget.style.background = 'transparent';
              }}
            >
              {date.getDate()}
            </div>
          );
        })}
      </div>
    </div>
  );
}

const DateRangePicker = ({ onChange }) => {
  const [open, setOpen] = useState(false);
  const [startDate, setStart] = useState(null);
  const [endDate, setEnd] = useState(null);
  const [hovered, setHovered] = useState(null);
  const [picking, setPicking] = useState(false);
  const [activePreset, setActivePreset] = useState(null);
  const t = today();
  const [leftYear, setLeftYear] = useState(t.getMonth() === 0 ? t.getFullYear() - 1 : t.getFullYear());
  const [leftMonth, setLeftMonth] = useState(t.getMonth() === 0 ? 11 : t.getMonth() - 1);
  const ref = useRef(null);

  const rightMonth = leftMonth === 11 ? 0 : leftMonth + 1;
  const rightYear = leftMonth === 11 ? leftYear + 1 : leftYear;

  const prevMonth = () => {
    if (leftMonth === 0) { setLeftMonth(11); setLeftYear(y => y - 1); }
    else setLeftMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (leftMonth >= 10) {
      setLeftMonth(m => m === 11 ? 1 : 0);
      if (leftMonth === 11) setLeftYear(y => y + 1);
    } else setLeftMonth(m => m + 2);
  };

  const applyPreset = (preset) => {
    const [s, e] = preset.range();
    setStart(s); setEnd(e);
    setPicking(false); setHovered(null);
    setActivePreset(preset.label);
    // navigate left calendar to show the range start
    setLeftYear(s.getFullYear());
    setLeftMonth(s.getMonth() === 11 ? 10 : s.getMonth());
  };

  const handleDay = (date) => {
    setActivePreset(null);
    if (!picking) { setStart(date); setEnd(null); setPicking(true); }
    else {
      let s = startDate, e = date;
      if (s > e) [s, e] = [e, s];
      setStart(s); setEnd(e); setPicking(false); setHovered(null);
    }
  };

  const handleApply = () => {
    if (onChange && startDate) onChange({ start: startDate, end: endDate || startDate });
    setOpen(false);
  };

  const handleReset = () => {
    setStart(null); setEnd(null); setPicking(false); setHovered(null); setActivePreset(null);
    if (onChange) onChange(null);
  };

  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const label = startDate
    ? `${fmt(startDate)} — ${endDate ? fmt(endDate) : '...'}`
    : `1970.01.01 — ${fmt(today())}`;

  return (
    <div className="relative" ref={ref}>
      {/* Trigger */}
      <div
        onClick={() => setOpen(o => !o)}
        className="flex items-center h-7 px-2.5 text-xs min-w-[200px] justify-between cursor-pointer rounded-md transition-colors"
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--border-3)',
          color: 'var(--text-2)',
          boxShadow: 'var(--shadow-xs)',
        }}
      >
        <span className="truncate tabular">{label}</span>
        <div className="flex items-center gap-1 ml-2 pl-2" style={{ borderLeft: '1px solid var(--border)', color: 'var(--accent)' }}>
          <CalendarDays size={13} />
          <ChevronDown size={11} style={{ color: 'var(--muted)' }} />
        </div>
      </div>

      {/* Popup */}
      {open && (
        <div
          className="ui-card absolute top-9 right-0 z-[9999] flex"
          style={{ minWidth: 600, boxShadow: 'var(--shadow-xl)' }}
          onMouseLeave={() => !picking && setHovered(null)}
        >
          {/* LEFT: Presets sidebar */}
          <div
            className="w-[140px] shrink-0 py-2 flex flex-col"
            style={{ borderRight: '1px solid var(--border)' }}
          >
            {PRESETS.map(p => {
              const active = activePreset === p.label;
              return (
                <button
                  key={p.label}
                  onClick={() => applyPreset(p)}
                  className="text-left px-3 py-1.5 text-xs transition-colors rounded-md mx-1.5 my-0.5"
                  style={{
                    background: active ? 'var(--accent-soft)' : 'transparent',
                    color: active ? 'var(--accent-text)' : 'var(--text-2)',
                    fontWeight: active ? 500 : 400,
                  }}
                  onMouseOver={(e) => { if (!active) e.currentTarget.style.background = 'var(--surface-3)'; }}
                  onMouseOut={(e) => { if (!active) e.currentTarget.style.background = 'transparent'; }}
                >
                  {p.label}
                </button>
              );
            })}
          </div>

          {/* RIGHT: Calendars + footer */}
          <div className="flex flex-col flex-1 min-w-0">
            <div className="flex gap-0 p-3">
              <div className="flex flex-col">
                <div className="flex items-center justify-between mb-1 px-1">
                  <button onClick={prevMonth} className="ui-btn ui-btn-ghost ui-btn-icon ui-btn-sm">
                    <ChevronLeft size={13} />
                  </button>
                  <div />
                </div>
                <MonthGrid
                  year={leftYear} month={leftMonth}
                  startDate={startDate} endDate={endDate} hovered={hovered}
                  onDayClick={handleDay} onDayHover={setHovered}
                />
              </div>

              <div className="w-px mx-3" style={{ background: 'var(--border)' }} />

              <div className="flex flex-col">
                <div className="flex items-center justify-between mb-1 px-1">
                  <div />
                  <button onClick={nextMonth} className="ui-btn ui-btn-ghost ui-btn-icon ui-btn-sm">
                    <ChevronRight size={13} />
                  </button>
                </div>
                <MonthGrid
                  year={rightYear} month={rightMonth}
                  startDate={startDate} endDate={endDate} hovered={hovered}
                  onDayClick={handleDay} onDayHover={setHovered}
                />
              </div>
            </div>

            <div
              className="flex items-center justify-between px-4 py-2.5"
              style={{ borderTop: '1px solid var(--border)', background: 'var(--surface-2)' }}
            >
              <span className="text-xs truncate tabular" style={{ color: 'var(--text-3)' }}>
                {picking ? 'Select end date…' : startDate ? `${fmt(startDate)}  →  ${fmt(endDate)}` : 'Select start date'}
              </span>
              <div className="flex gap-2 shrink-0 ml-2">
                <button onClick={handleReset} className="ui-btn ui-btn-secondary ui-btn-xs">Reset</button>
                <button onClick={handleApply} className="ui-btn ui-btn-primary ui-btn-xs">Apply</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DateRangePicker;
