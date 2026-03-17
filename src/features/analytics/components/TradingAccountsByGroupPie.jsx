import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import useThemeStore from '../../../store/themeStore';

const data = [
  { name: 'Demo\\extra', value: 9.93, color: '#FDE047' }, // Yellow
  { name: 'Demo\\MaxMaster', value: 85.68, color: '#38BDF8' }, // Light Blue
  { name: 'Other 1', value: 1.5, color: '#F87171' }, // Red
  { name: 'Other 2', value: 1.0, color: '#4ADE80' }, // Green
  { name: 'Other 3', value: 1.89, color: '#A78BFA' }, // Purple
];

const TradingAccountsByGroupPie = () => {
  const isDarkMode = useThemeStore((state) => state.isDarkMode);

  return (
    <div className="bg-white dark:bg-[#1e1e1e] p-4 rounded-sm border border-gray-200 dark:border-gray-800 h-72 flex flex-col relative transition-colors">
      <div className="text-[13px] font-semibold text-gray-800 dark:text-gray-200 mb-2 h-5">Trading Accounts by Group</div>

      {/* Central Label for Total Count */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none mt-6">
        <span className="text-[14px] font-semibold text-gray-800 dark:text-gray-200">8.9 K</span>
      </div>

      <div className="flex-1 w-full relative flex items-center justify-center">
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
              stroke={isDarkMode ? "#1e1e1e" : "#ffffff"}
              strokeWidth={1}
              isAnimationActive={false}
              label={({ cx, cy, midAngle, innerRadius, outerRadius, value, index }) => {
                // Only show labels for the big ones
                if (data[index].value < 5) return null;
                const RADIAN = Math.PI / 180;
                const radius = outerRadius + 20;
                const x = cx + radius * Math.cos(-midAngle * RADIAN);
                const y = cy + radius * Math.sin(-midAngle * RADIAN);

                return (
                  <text x={x} y={y} fill={isDarkMode ? "#d1d5db" : "#4b5563"} textAnchor={x > cx ? 'start' : 'end'} dominantBaseline="central" fontSize={11}>
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
              itemStyle={{ fontSize: '11px', color: isDarkMode ? '#f3f4f6' : '#1f2937' }}
              contentStyle={{ borderRadius: '4px', padding: '4px 8px', backgroundColor: isDarkMode ? '#374151' : '#ffffff', border: isDarkMode ? '1px solid #4b5563' : '1px solid #e5e7eb' }}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default TradingAccountsByGroupPie;
