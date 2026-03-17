import { useState, useRef } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Tooltip as RechartsTooltip, Cell } from 'recharts';
import useThemeStore from '../../../store/themeStore';

const data = [
  { build: '5500', value: 9, color: '#ec4899' }, // Pink
  { build: '5660', value: 7, color: '#4f46e5' }, // Indigo
  { build: '5464', value: 2, color: '#65a30d' }, // Green
  { build: '5472', value: 1, color: '#d9f99d' }, // Lime Light
  { build: '5572', value: 1, color: '#fcd34d' }, // Yellow
  { build: '5450', value: 1, color: '#b45309' }, // Brown
  { build: '5545', value: 1, color: '#f87171' }, // Red Light
];

const CustomTooltip = ({ active, payload, label, isDarkMode }) => {
  if (active && payload && payload.length) {
    return (
      <div className={`${isDarkMode ? 'bg-[#2a2d3e] text-white border-gray-600' : 'bg-white text-gray-800 border-[#3b82f6] shadow-md'} text-[11px] px-2 py-1 flex items-center gap-2 border rounded`}>
        <span>Build: {label}</span>
        <span className="text-gray-400 font-semibold text-[10px]">Count</span>
        <span className="font-semibold">{payload[0].value}</span>
      </div>
    );
  }
  return null;
};

const OnlineUsersByBuildChart = () => {
  const [mousePos, setMousePos] = useState({ x: null, y: null });
  const containerRef = useRef(null);
  const isDarkMode = useThemeStore((state) => state.isDarkMode);

  const handleMouseMove = (e) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

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
    <div className="bg-white dark:bg-[#1e1e1e] flex flex-col border-t border-l border-[#e5e7eb] dark:border-gray-800 pt-4 h-[300px] cursor-crosshair transition-colors">
      <div className="text-[11px] text-gray-800 dark:text-gray-200 ml-4 mb-2 font-semibold">Online Users by Build</div>
      <div
        className="flex-1 w-full relative pl-2 pr-6"
        ref={containerRef}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
      >

        {/* Tracking Crosshair Lines matching the previous implementation */}
        {mousePos.x !== null && mousePos.y !== null && (
          <>
            <div
              className="absolute top-0 bottom-0 pointer-events-none z-10"
              style={{ left: `${mousePos.x}px`, width: '1px', backgroundColor: '#3b82f6', opacity: 0.5 }}
            />
            <div
              className="absolute left-0 right-0 pointer-events-none z-10"
              style={{ top: `${mousePos.y}px`, height: '1px', backgroundColor: '#3b82f6', opacity: 0.5 }}
            />
          </>
        )}

        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 20, right: 0, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={isDarkMode ? "#374151" : "#e5e7eb"} />
            <XAxis dataKey="build" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: isDarkMode ? "#9ca3af" : "#6b7280" }} />
            <YAxis axisLine={false} tickLine={{ stroke: isDarkMode ? "#6b7280" : "#e5e7eb" }} tick={{ fontSize: 11, fill: isDarkMode ? "#9ca3af" : "#6b7280" }} domain={[0, 9]} ticks={[0, 1, 2, 3, 4, 5, 6, 7, 8, 9]} />

            <RechartsTooltip
              content={<CustomTooltip isDarkMode={isDarkMode} />}
              cursor={false} /* Disable default recharts gray overlay */
              isAnimationActive={false}
            />

            <Bar dataKey="value" isAnimationActive={false}>
              {data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default OnlineUsersByBuildChart;
