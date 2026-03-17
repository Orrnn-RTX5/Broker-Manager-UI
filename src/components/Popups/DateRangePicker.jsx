import { useState, useRef, useEffect } from 'react';
import { ChevronLeft, ChevronRight, CalendarDays, ChevronDown } from 'lucide-react';

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const DAYS   = ['Su','Mo','Tu','We','Th','Fr','Sa'];

const today = () => { const d = new Date(); d.setHours(0,0,0,0); return d; };

function isSameDay(a, b) {
  return a && b && a.toDateString() === b.toDateString();
}

function fmt(d) {
  if (!d) return '—';
  return `${d.getFullYear()}.${String(d.getMonth()+1).padStart(2,'0')}.${String(d.getDate()).padStart(2,'0')}`;
}

const PRESETS = [
  { label: 'Today',        range: () => { const d = today(); return [d, d]; } },
  { label: 'Yesterday',    range: () => { const d = new Date(today()); d.setDate(d.getDate()-1); return [d, d]; } },
  { label: 'Last 7 Days',  range: () => { const e = today(); const s = new Date(e); s.setDate(s.getDate()-6); return [s, e]; } },
  { label: 'Last Week',    range: () => {
    const now = today();
    const dow = now.getDay();
    const s = new Date(now); s.setDate(now.getDate() - dow - 7);
    const e = new Date(s);   e.setDate(s.getDate() + 6);
    return [s, e];
  }},
  { label: 'Last 30 Days', range: () => { const e = today(); const s = new Date(e); s.setDate(s.getDate()-29); return [s, e]; } },
  { label: 'This Month',   range: () => { const now = today(); const s = new Date(now.getFullYear(), now.getMonth(), 1); return [s, now]; } },
  { label: 'Last Month',   range: () => {
    const now = today();
    const s = new Date(now.getFullYear(), now.getMonth()-1, 1);
    const e = new Date(now.getFullYear(), now.getMonth(), 0);
    return [s, e];
  }},
  { label: 'This Year',    range: () => { const now = today(); return [new Date(now.getFullYear(),0,1), now]; } },
  { label: 'All Time',     range: () => [new Date(1970,0,1), today()] },
];

/* one month grid */
function MonthGrid({ year, month, startDate, endDate, hovered, onDayClick, onDayHover }) {
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month+1, 0).getDate();
  const cells = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));

  const rangeEnd = endDate || hovered;
  const lo = startDate && rangeEnd ? (startDate < rangeEnd ? startDate : rangeEnd) : startDate;
  const hi = startDate && rangeEnd ? (startDate < rangeEnd ? rangeEnd : startDate) : rangeEnd;

  return (
    <div className="select-none w-[196px] shrink-0">
      <div className="text-center text-[11px] text-gray-700 dark:text-gray-200 py-1">{MONTHS[month]} {year}</div>
      <div className="grid grid-cols-7 mb-0.5">

        
        {DAYS.map(d => (
          <div key={d} className="text-center text-[10px] text-gray-400 dark:text-gray-500 py-0.5">{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-y-px">
        {cells.map((date, i) => {
          if (!date) return <div key={`e-${i}`} />;
          const cur = new Date(date); cur.setHours(0,0,0,0);
          const isStart = lo && isSameDay(cur, lo);
          const isEnd   = hi && isSameDay(cur, hi);
          const inRange = lo && hi && cur > lo && cur < hi;
          const isTod   = isSameDay(cur, today());

          let cls = 'text-gray-700 dark:text-gray-300';
          if (isStart || isEnd) cls = 'bg-blue-600 text-white rounded';
          else if (inRange)     cls = 'bg-blue-100 dark:bg-blue-900/50 text-blue-900 dark:text-blue-100';
          else if (isTod)       cls += ' text-blue-500';

          return (
            <div
              key={i}
              onClick={() => onDayClick(cur)}
              onMouseEnter={() => onDayHover(cur)}
              className={`text-center text-[11px] py-[3px] cursor-pointer transition-colors rounded ${cls}
                ${!isStart && !isEnd ? 'hover:bg-blue-200 dark:hover:bg-blue-800/50' : ''}`}
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
  const [open,      setOpen]      = useState(false);
  const [startDate, setStart]     = useState(null);
  const [endDate,   setEnd]       = useState(null);
  const [hovered,   setHovered]   = useState(null);
  const [picking,   setPicking]   = useState(false);
  const [activePreset, setActivePreset] = useState(null);
  const t = today();
  const [leftYear,  setLeftYear]  = useState(t.getMonth() === 0 ? t.getFullYear()-1 : t.getFullYear());
  const [leftMonth, setLeftMonth] = useState(t.getMonth() === 0 ? 11 : t.getMonth()-1);
  const ref = useRef(null);

  const rightMonth = leftMonth === 11 ? 0   : leftMonth + 1;
  const rightYear  = leftMonth === 11 ? leftYear+1 : leftYear;

  const prevMonth = () => {
    if (leftMonth === 0) { setLeftMonth(11); setLeftYear(y => y-1); }
    else setLeftMonth(m => m-1);
  };
  const nextMonth = () => {
    if (leftMonth >= 10) {
      setLeftMonth(m => m === 11 ? 1 : 0);
      if (leftMonth === 11) setLeftYear(y => y+1);
    } else setLeftMonth(m => m+2);
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
    : '1970.01.01 — 2026.03.16';

  return (
    <div className="relative" ref={ref}>
      {/* Trigger */}
      <div
        onClick={() => setOpen(o => !o)}
        className="flex items-center border border-gray-300 dark:border-gray-700 bg-white dark:bg-[#1e1e1e] rounded-sm h-[22px] px-2 text-[10px] text-gray-700 dark:text-gray-300 min-w-[190px] justify-between cursor-pointer hover:border-blue-400 transition-colors"
      >
        <span className="truncate">{label}</span>
        <div className="flex items-center gap-1 ml-2 border-l border-gray-200 dark:border-gray-700 pl-1 text-blue-500">
          <CalendarDays size={12} />
          <ChevronDown size={10} className="text-gray-500" />
        </div>
      </div>

      {/* Popup */}
      {open && (
        <div
          ref={null}
          className="absolute top-[26px] right-0 z-[9999] bg-white dark:bg-[#252526] border border-gray-200 dark:border-[#444] shadow-2xl flex"
          style={{ minWidth: 580 }}
          onMouseLeave={() => !picking && setHovered(null)}
        >
          {/* LEFT: Presets sidebar */}
          <div className="w-[130px] shrink-0 border-r border-gray-100 dark:border-[#444] py-2 flex flex-col">
            {PRESETS.map(p => (
              <button
                key={p.label}
                onClick={() => applyPreset(p)}
                className={`text-left px-3 py-[5px] text-[11px] transition-colors
                  ${activePreset === p.label
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-[#333]'}`}
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* RIGHT: Calendars + footer */}
          <div className="flex flex-col flex-1 min-w-0">
            {/* Two month calendars */}
            <div className="flex gap-0 p-3">
              {/* Left month */}
              <div className="flex flex-col">
                <div className="flex items-center justify-between mb-1 px-1">
                  <button onClick={prevMonth} className="p-0.5 hover:bg-gray-100 dark:hover:bg-[#333] rounded transition-colors">
                    <ChevronLeft size={12} className="text-gray-500" />
                  </button>
                  <div />
                </div>
                <MonthGrid
                  year={leftYear} month={leftMonth}
                  startDate={startDate} endDate={endDate} hovered={hovered}
                  onDayClick={handleDay} onDayHover={setHovered}
                />
              </div>

              <div className="w-px bg-gray-100 dark:bg-[#444] mx-3" />

              {/* Right month */}
              <div className="flex flex-col">
                <div className="flex items-center justify-between mb-1 px-1">
                  <div />
                  <button onClick={nextMonth} className="p-0.5 hover:bg-gray-100 dark:hover:bg-[#333] rounded transition-colors">
                    <ChevronRight size={12} className="text-gray-500" />
                  </button>
                </div>
                <MonthGrid
                  year={rightYear} month={rightMonth}
                  startDate={startDate} endDate={endDate} hovered={hovered}
                  onDayClick={handleDay} onDayHover={setHovered}
                />
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between border-t border-gray-100 dark:border-[#444] px-3 py-2">
              <span className="text-[10px] text-gray-400 dark:text-gray-500 truncate">
                {picking ? 'Select end date…' : startDate ? `${fmt(startDate)}  →  ${fmt(endDate)}` : 'Select start date'}
              </span>
              <div className="flex gap-2 shrink-0 ml-2">
                <button
                  onClick={handleReset}
                  className="text-[10px] px-2 py-0.5 border border-gray-300 dark:border-gray-600 rounded-sm hover:bg-gray-100 dark:hover:bg-[#333] text-gray-600 dark:text-gray-300 transition-colors"
                >Reset</button>
                <button
                  onClick={handleApply}
                  className="text-[10px] px-3 py-0.5 bg-blue-600 hover:bg-blue-700 text-white rounded-sm transition-colors"
                >Apply</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DateRangePicker;
