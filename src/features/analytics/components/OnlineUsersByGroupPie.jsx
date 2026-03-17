import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import useThemeStore from '../../../store/themeStore';

const data = [
  { name: 'YOFX\\YOFX', value: 40.91, color: '#38bdf8' }, // Blue
  { name: 'Demo\\extra', value: 22.73, color: '#fcd34d' }, // Yellow
  { name: 'Demo\\MaxMaster', value: 13.64, color: '#86efac' }, // Green
  { name: 'demo\\PRO', value: 13.64, color: '#b45309' }, // Brown
  { name: 'Other 1', value: 4.54, color: '#f43f5e' }, // Pink
  { name: 'Other 2', value: 4.54, color: '#1e3a8a' }, // Dark Blue
];

const OnlineUsersByGroupPie = () => {
  const isDarkMode = useThemeStore((state) => state.isDarkMode);

  return (
    <div className="bg-white dark:bg-[#1e1e1e] flex flex-col pt-4 h-[300px] relative border-t border-[#e5e7eb] dark:border-gray-800 transition-colors">
      <div className="text-[11px] text-gray-800 dark:text-gray-200 ml-4 mb-2 font-semibold">Online Users by Group</div>

      <div className="absolute inset-0 flex items-center justify-center pointer-events-none mt-6">
        <span className="text-[12px] text-gray-800 dark:text-gray-200">22</span>
      </div>

      <div className="flex-1 w-full relative flex items-center justify-center">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={55}
              outerRadius={85}
              paddingAngle={1}
              dataKey="value"
              stroke={isDarkMode ? "#1e1e1e" : "#ffffff"}
              strokeWidth={1}
              isAnimationActive={false}
              label={({ cx, cy, midAngle, innerRadius, outerRadius, value, index }) => {
                if (data[index].value < 10) return null; // Filter small labels as per screenshot
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

export default OnlineUsersByGroupPie;
