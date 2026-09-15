import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import useThemeStore from '../../../store/themeStore';

const data = [
  { name: 'None', value: 97.58, color: '#38BDF8' }, // Light Blue
  { name: 'English', value: 1.0, color: '#FDE047' }, // Yellow
  { name: 'Hindi', value: 0.5, color: '#4ADE80' }, // Green
  { name: 'Arabic', value: 0.5, color: '#EF4444' }, // Red
  { name: 'Indonesian', value: 0.2, color: '#F43F5E' }, // Rose
  { name: 'Bangla', value: 0.1, color: '#6366F1' }, // Indigo
  { name: 'Italian', value: 0.1, color: '#10B981' }, // Emerald
  { name: 'Polish', value: 0.01, color: '#84CC16' }, // Lime
  { name: 'Ukrainian', value: 0.01, color: '#F59E0B' }, // Amber
];

const ByCountryLanguagePie = () => {
  const isDarkMode = useThemeStore((state) => state.isDarkMode);

  return (
    <div className="bg-white dark:bg-[#1e1e1e] pt-4 px-4 pb-4 h-[350px] flex flex-col relative transition-colors">
      <div className="text-[11px] font-semibold text-gray-800 dark:text-gray-200 mb-2 h-5">Trading Accounts by Language</div>

      {/* Central Label for Total Count */}
      <div className="absolute inset-0 flex items-center justify-center pl-24 pointer-events-none mt-6">
        <span className="text-[14px] font-semibold text-gray-800 dark:text-white z-10">8.9 K</span>
        {/* Inner dark circle to mask the hole over the center background */}
        <div className="absolute w-12 h-12 rounded-full bg-white dark:bg-[#1e1e1e] z-0"></div>
      </div>

      <div className="flex-1 w-full relative flex items-center justify-between">

        {/* Custom Legend List mimicking screenshot */}
        <div className="flex flex-col justify-center gap-1.5 z-10 pl-2">
          {data.map((item, idx) => (
            <div key={idx} className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5" style={{ backgroundColor: item.color }}></div>
              <span className="text-[10px] text-gray-800 dark:text-gray-200">{item.name}</span>
            </div>
          ))}
        </div>

        {/* The Pie Chart positioned to the right */}
        <div className="flex-1 h-full pr-10">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                cx="60%"
                cy="50%"
                innerRadius={55}
                outerRadius={85}
                paddingAngle={0}
                dataKey="value"
                stroke={isDarkMode ? "#1e1e1e" : "var(--surface)"}
                strokeWidth={1}
                isAnimationActive={false}
                label={({ cx, cy, midAngle, innerRadius, outerRadius, value, index }) => {
                  if (data[index].name !== 'None') return null; // Only label None
                  const RADIAN = Math.PI / 180;
                  const radius = outerRadius + 20;
                  const x = cx + radius * Math.cos(-midAngle * RADIAN);
                  const y = cy + radius * Math.sin(-midAngle * RADIAN);

                  return (
                    <text x={x} y={y} fill={isDarkMode ? "#d1d5db" : "var(--text-2)"} textAnchor="start" dominantBaseline="central" fontSize={11}>
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
    </div>
  );
};

export default ByCountryLanguagePie;
