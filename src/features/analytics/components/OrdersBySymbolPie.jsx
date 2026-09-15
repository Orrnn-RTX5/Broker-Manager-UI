import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import useThemeStore from '../../../store/themeStore';

const data = [
  { name: 'XAUUSD', value: 74.62, color: '#38bdf8' }, // Light Blue
  { name: 'EURUSD', value: 6.92, color: '#fcd34d' }, // Yellow
  { name: 'XAUUSD.c', value: 1.54, color: '#86efac' }, // Green
  { name: 'USDJPY', value: 1.54, color: '#ef4444' }, // Red
  { name: 'Other 1', value: 1.54, color: '#ec4899' }, // Pink
  { name: 'Other 2', value: 1.54, color: '#a855f7' }, // Purple
  { name: 'Other 3', value: 1.54, color: '#3b82f6' }, // Blue
  { name: 'Other 4', value: 1.54, color: '#10b981' }, // Emerald
  { name: 'Other 5', value: 1.54, color: '#f97316' }, // Orange
];

const OrdersBySymbolPie = () => {
  const isDarkMode = useThemeStore((state) => state.isDarkMode);

  return (
    <div className="bg-transparent flex flex-col pt-4 h-[300px] relative transition-colors">
      <div className="text-[12px] text-gray-800 dark:text-gray-200 ml-4 mb-2 font-semibold z-10">Orders by Symbol</div>

      {/* Central Label for Orders Count */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none mt-4">
        <span className="text-[12px] font-bold text-gray-800 dark:text-gray-200 bg-gray-100 dark:bg-[#333333] px-3 py-1 rounded-full border border-gray-300 dark:border-gray-600 transition-colors">130</span>
      </div>

      <div className="flex-1 w-full relative flex items-center justify-center">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={50}
              outerRadius={90}
              paddingAngle={1}
              dataKey="value"
              stroke={isDarkMode ? "#1e1e1e" : "var(--surface)"}
              strokeWidth={1}
              isAnimationActive={false}
              label={({ cx, cy, midAngle, innerRadius, outerRadius, value, index }) => {
                // Ensure only top 4 are labeled matching screenshot
                if (index > 3) return null;
                const RADIAN = Math.PI / 180;
                const radius = outerRadius + 20;
                const x = cx + radius * Math.cos(-midAngle * RADIAN);
                const y = cy + radius * Math.sin(-midAngle * RADIAN);

                return (
                  <text x={x} y={y} fill={isDarkMode ? "#d1d5db" : "var(--text-2)"} textAnchor={x > cx ? 'start' : 'end'} dominantBaseline="central" fontSize={10}>
                    {data[index].name}: {value}%
                  </text>
                );
              }}
            >
              {data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip
              itemStyle={{ fontSize: '11px', color: isDarkMode ? '#f3f4f6' : 'var(--text)' }}
              contentStyle={{ borderRadius: '4px', padding: '4px 8px', backgroundColor: isDarkMode ? '#374151' : 'var(--surface)', border: isDarkMode ? '1px solid #4b5563' : '1px solid var(--border-2)' }}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default OrdersBySymbolPie;
