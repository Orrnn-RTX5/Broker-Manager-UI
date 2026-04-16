import { useState, useRef } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Tooltip, Legend } from 'recharts';
import useThemeStore from '../../../store/themeStore';

const data = [
  { symbol: 'US30.c', buy: 60, sell: 40 },
  { symbol: 'XAUUSD.c', buy: 80, sell: 20 },
  { symbol: 'XAUUSD', buy: 40, sell: 60 },
  { symbol: 'GOLD.FUTURE', buy: 55, sell: 45 },
  { symbol: 'AUDUSD.c', buy: 70, sell: 30 },
  { symbol: 'HKDJPY.c', buy: 35, sell: 65 },
  { symbol: 'ETHUSD', buy: 20, sell: 80 },
  { symbol: 'SOLUSD', buy: 90, sell: 10 },
  { symbol: 'USOIL.c', buy: 45, sell: 55 },
  { symbol: 'AUDUSD', buy: 75, sell: 25 },
  { symbol: 'EURUSD.c', buy: 50, sell: 50 },
  { symbol: 'AUDCAD', buy: 65, sell: 35 },
  { symbol: 'HK50', buy: 85, sell: 15 },
  { symbol: 'BNBUSD', buy: 30, sell: 70 },
  { symbol: 'USDTRY', buy: 55, sell: 45 },
  { symbol: 'AUDCAD.c', buy: 40, sell: 60 },
  { symbol: 'ADAUSD', buy: 60, sell: 40 },
];

const CustomTooltip = ({ active, payload, label, isDarkMode }) => {
  if (active && payload && payload.length) {
    return (
      <div className={`${isDarkMode ? 'bg-[#2a2d3e] text-white border-gray-600' : 'bg-white text-gray-800 border-gray-300 shadow-md'} text-[11px] px-3 py-2 flex flex-col gap-1 border rounded`}>
        <span className="font-bold mb-1">{label}</span>
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 bg-[#3b82f6]"></div>
          <span>Buy: {payload[0].value}%</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 bg-[#eab308]"></div>
          <span>Sell: {payload[1].value}%</span>
        </div>
      </div>
    );
  }
  return null;
};

const PositionsBySentimentChart = () => {
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
    <div className="bg-white dark:bg-[#1e1e1e] flex flex-col pt-4 h-[350px] cursor-crosshair border border-[#e5e7eb] dark:border-gray-800 rounded-md transition-colors">
      <div className="text-[12px] text-gray-800 dark:text-gray-200 ml-4 mb-4 font-semibold">Positions by Sentiment</div>
      <div
        className="flex-1 w-full relative pl-2 pr-4 pb-2"
        ref={containerRef}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
      >

      {/* Tra  cking Crosshair Lines matching previous dark style */}
        {mousePos.x !== null && mousePos.y !== null && (
          <>
            <div
              className="absolute top-0 bottom-0 pointer-events-none z-10"
              style={{ left: `${mousePos.x}px`, width: '1px', backgroundColor: isDarkMode ? '#60a5fa' : '#3b82f6', opacity: 0.5 }}
            />
            <div
              className="absolute left-0 right-0 pointer-events-none z-10"
              style={{ top: `${mousePos.y}px`, height: '1px', backgroundColor: isDarkMode ? '#60a5fa' : '#3b82f6', opacity: 0.5 }}
            />
          </>
        )}

        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 0, right: 0, left: -20, bottom: 20 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={true} horizontal={true} stroke={isDarkMode ? "#374151" : "#e5e7eb"} opacity={isDarkMode ? 0.5 : 1} />
            <XAxis dataKey="symbol" axisLine={true} stroke={isDarkMode ? "#4b5563" : "#d1d5db"} tickLine={true} tick={{ fontSize: 9, fill: isDarkMode ? '#9ca3af' : '#6b7280' }} interval={0} angle={0} />
            <YAxis axisLine={true} stroke={isDarkMode ? "#4b5563" : "#d1d5db"} tickLine={true} tick={{ fontSize: 10, fill: isDarkMode ? '#9ca3af' : '#6b7280' }} domain={[0, 100]} ticks={[0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100]} />

            <Tooltip
              content={<CustomTooltip isDarkMode={isDarkMode} />}
              cursor={false} /* Disable default recharts gray overlay */
              isAnimationActive={false}
            />
            <Legend verticalAlign="bottom" height={36} iconType="rect" iconSize={12} wrapperStyle={{ fontSize: '11px', color: isDarkMode ? '#d1d5db' : '#4b5563', paddingTop: '10px' }} />

            <Bar dataKey="buy" stackId="a" fill="#3b82f6" name="Buy" isAnimationActive={false} barSize={25} />
            <Bar dataKey="sell" stackId="a" fill="#eab308" name="Sell" isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default PositionsBySentimentChart;
