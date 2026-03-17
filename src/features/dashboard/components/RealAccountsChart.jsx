import { LineChart, Line, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Tooltip, Brush } from 'recharts';
import useThemeStore from '../../../store/themeStore';

// Generate mock data for the spiky "Real Accounts" chart
const generateSpikyData = () => {
  const data = [];
  for (let i = 0; i < 30; i++) {
    // Random spikes between 0 and 25
    data.push({
      time: i === 0 || i === 29 ? '00:00' : '',
      value: Math.floor(Math.random() * (25 - 2 + 1)) + 2
    });
  }
  return data;
};

const data = generateSpikyData();

const RealAccountsChart = () => {
  const isDarkMode = useThemeStore((state) => state.isDarkMode);

  return (
    <div className="bg-white dark:bg-[#1e1e1e] p-4 rounded-sm border border-gray-200 dark:border-[#333333] shadow-sm h-96 flex flex-col transition-colors">
      <div className="text-[13px] font-semibold text-gray-800 dark:text-gray-200 mb-4 h-5">Real Accounts</div>
      <div className="flex-1 w-full relative">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={isDarkMode ? '#333333' : '#e5e7eb'} />
            <XAxis dataKey="time" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: isDarkMode ? '#9ca3af' : '#6b7280' }} />
            <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: isDarkMode ? '#9ca3af' : '#6b7280' }} domain={[0, 25]} ticks={[0, 5, 10, 15, 20, 25]} />
            <Tooltip
              cursor={{ stroke: isDarkMode ? '#6b7280' : '#9ca3af', strokeWidth: 1, strokeDasharray: '3 3' }}
              contentStyle={{
                fontSize: '12px',
                borderRadius: '4px',
                border: isDarkMode ? '1px solid #404040' : '1px solid #e5e7eb',
                boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
                padding: '4px 8px',
                backgroundColor: isDarkMode ? '#252526' : '#ffffff',
                color: isDarkMode ? '#e5e7eb' : '#000000'
              }}
              labelStyle={{ display: 'none' }}
            />
            <Line type="linear" dataKey="value" stroke={isDarkMode ? '#60a5fa' : '#3b82f6'} strokeWidth={2} dot={false} isAnimationActive={false} />
            <Brush dataKey="time" height={15} stroke={isDarkMode ? '#60a5fa' : '#3b82f6'} fill={isDarkMode ? '#2d2d30' : '#f3f4f6'} tickFormatter={() => ''} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default RealAccountsChart;
