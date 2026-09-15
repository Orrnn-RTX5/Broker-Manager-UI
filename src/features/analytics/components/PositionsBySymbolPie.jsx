import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import useThemeStore from '../../../store/themeStore';

const data = [
  { name: 'US30.c', value: 31.25, color: '#38bdf8' }, // Light Blue
  { name: 'XAUUSD.c', value: 22.86, color: '#fcd34d' }, // Yellow
  { name: 'XAUUSD', value: 15.39, color: '#86efac' }, // Green
  { name: 'UT100.c', value: 14.58, color: '#b45309' }, // Orange/Brown
  { name: 'BTCUSD', value: 8.34, color: '#f43f5e' }, // Pink
  { name: 'EURUSD', value: 3.00, color: '#10b981' }, // Emerald
  { name: 'Other', value: 2.00, color: '#4f46e5' }, // Indigo
  { name: 'USOIL.c', value: 1.58, color: '#6366f1' }, // Violet
  { name: 'USDJPY', value: 1.00, color: '#f59e0b' }, // Amber
];

const PositionsBySymbolPie = () => {
  const isDarkMode = useThemeStore((state) => state.isDarkMode);

  return (
    <div className="bg-white dark:bg-[#1e1e1e] flex flex-col pt-4 h-[300px] relative border border-[#e5e7eb] dark:border-gray-800 rounded-md transition-colors">
      <div className="text-[12px] text-gray-800 dark:text-gray-200 ml-4 mb-2 font-semibold z-10">Positions by Symbol</div>

      {/* Absolute left legend matching screenshot */}
      <div className="absolute left-6 top-12 flex flex-col gap-1 z-10 pointer-events-none">
        {data.map((item, index) => (
          <div key={index} className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: item.color }}></div>
            <span className="text-gray-700 dark:text-gray-300 text-[10px]">{item.name}</span>
          </div>
        ))}
      </div>

      <div className="absolute inset-0 flex items-center justify-center pointer-events-none mt-4">
        <span className="text-[12px] font-bold text-gray-800 dark:text-gray-200 bg-gray-100 dark:bg-[#333333] px-3 py-1 rounded-full border border-gray-300 dark:border-gray-600 transition-colors">1.7 K</span>
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
              strokeWidth={2}
              isAnimationActive={false}
              labelLine={{ stroke: isDarkMode ? '#6b7280' : 'var(--border)', strokeWidth: 1 }}
              label={({ cx, cy, midAngle, innerRadius, outerRadius, value, index }) => {
                if (data[index].value < 5) return null; // Only show large labels
                const RADIAN = Math.PI / 180;
                const radius = outerRadius + 30;
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

export default PositionsBySymbolPie;
