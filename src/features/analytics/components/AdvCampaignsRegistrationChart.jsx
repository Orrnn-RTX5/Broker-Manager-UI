import { useState, useRef } from 'react';
import { ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Tooltip, Cell } from 'recharts';
import useThemeStore from '../../../store/themeStore';

const data = [
  { time: '', value: null }, // Invisible padding
  { time: '2025.01.01', value: 7990 }, // The single point with crosshair from screenshot
  { time: ' ', value: null }, // Invisible padding
];

const CustomTooltip = ({ active, payload, label, isDarkMode }) => {
  if (active && payload && payload.length) {
    return (
      <div
        className={`${isDarkMode ? 'bg-[#2a2d3e] text-white border-gray-600' : 'shadow-md'} text-[11px] px-2 py-1 flex items-center gap-2 border rounded`}
        style={isDarkMode ? undefined : { backgroundColor: 'var(--surface)', color: 'var(--text)', borderColor: 'var(--accent)' }}
      >
        <span>{label}</span>
        <span className="text-gray-400 font-semibold text-[10px]">Count</span>
        <span className="font-semibold">{payload[0].value}</span>
      </div>
    );
  }
  return null;
};

const AdvCampaignsRegistrationChart = () => {
  const [mousePos, setMousePos] = useState({ x: null, y: null });
  const containerRef = useRef(null);
  const isDarkMode = useThemeStore((state) => state.isDarkMode);

  const handleMouseMove = (e) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Constrain the crosshair within the bounds of the chart div
    if (x >= 0 && x <= rect.width && y >= 0 && y <= rect.height) {
      setMousePos({ x, y });
    } else {
      setMousePos({ x: null, y: null });
    }
  };

  const handleMouseLeave = () => {
    setMousePos({ x: null, y: null });
  };

  return (
    <div className="bg-white dark:bg-[#1e1e1e] flex flex-col cursor-crosshair border border-[#e5e7eb] dark:border-gray-800 pt-4 h-72 rounded-sm transition-colors">
      <div className="text-[11px] text-gray-800 dark:text-gray-200 ml-4 mb-2 font-semibold">Trading Accounts by Registration Date</div>
      <div
        className="flex-1 w-full relative"
        ref={containerRef}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
      >

        {/* The Tracking Crosshair Lines */}
        {mousePos.x !== null && mousePos.y !== null && (
          <>
            {/* Vertical Line */}
            <div
              className="absolute top-0 bottom-0 pointer-events-none z-10"
              style={{ left: `${mousePos.x}px`, width: '1px', backgroundColor: '#3b82f6', opacity: 0.5 }}
            />
            {/* Horizontal Line */}
            <div
              className="absolute left-0 right-0 pointer-events-none z-10"
              style={{ top: `${mousePos.y}px`, height: '1px', backgroundColor: '#3b82f6', opacity: 0.5 }}
            />
          </>
        )}

        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 20, right: 20, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={isDarkMode ? '#374151' : 'var(--border-2)'} />
            <XAxis dataKey="time" type="category" allowDuplicatedCategory={false} axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: isDarkMode ? '#9ca3af' : 'var(--muted)' }} />
            <YAxis dataKey="value" type="number" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: isDarkMode ? '#9ca3af' : 'var(--muted)' }} domain={[0, 8000]} ticks={[0, 1000, 2000, 3000, 4000, 5000, 6000, 7000, 8000]} tickFormatter={(val) => val === 0 ? '0' : `${val / 1000} K`} />

            <Tooltip
              content={<CustomTooltip isDarkMode={isDarkMode} />}
              cursor={false} /* Turn off native recharts cursor */
              isAnimationActive={false}
            />

            <Scatter data={data} fill="#0369a1">
              {data.map((entry, index) => (
                <Cell key={`cell-${index}`} stroke="#38bdf8" strokeWidth={2} r={entry.value === null ? 0 : 3} />
              ))}
            </Scatter>
          </ScatterChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default AdvCampaignsRegistrationChart;
