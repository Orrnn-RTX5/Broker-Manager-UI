import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import useThemeStore from '../../../store/themeStore';

const data = [
  { name: 'None', value: 100, color: '#38BDF8' }, // Light Blue
];

const AdvCampaignsBySourcePie = () => {
  const isDarkMode = useThemeStore((state) => state.isDarkMode);

  return (
    <div className="bg-white dark:bg-[#1e1e1e] p-4 rounded-sm border border-gray-200 dark:border-gray-800 h-72 flex flex-col relative transition-colors">
      <div className="text-[13px] font-semibold text-gray-800 dark:text-gray-200 mb-2 h-5">Trading Accounts by Source</div>

      {/* Central Label for Total Count */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none mt-6">
        <span className="text-[14px] font-semibold text-gray-800 dark:text-gray-200">8.9 K</span>
      </div>

      <div className="flex-1 w-full relative flex items-center justify-center">
        {/* Custom Legend for "None" */}
        <div className="absolute left-0 top-6 flex items-center gap-1.5 z-10 pointer-events-none">
          <div className="w-2.5 h-2.5 bg-[#38BDF8]"></div>
          <span className="text-[11px] text-gray-800 dark:text-gray-200">None</span>
        </div>

        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={60}
              outerRadius={90}
              paddingAngle={1}
              dataKey="value"
              stroke={isDarkMode ? "#1e1e1e" : "var(--surface)"}
              strokeWidth={1}
              isAnimationActive={false}
              label={({ cx, cy, midAngle, innerRadius, outerRadius, value, index }) => {
                const RADIAN = Math.PI / 180;
                const radius = outerRadius + 20;
                const x = cx + radius * Math.cos(-midAngle * RADIAN);
                const y = cy + radius * Math.sin(-midAngle * RADIAN);

                return (
                  <text x={x} y={y} fill={isDarkMode ? "#d1d5db" : "var(--text-2)"} textAnchor={x > cx ? 'start' : 'end'} dominantBaseline="central" fontSize={11}>
                    {data[index].name}: 100.00%
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

export default AdvCampaignsBySourcePie;
