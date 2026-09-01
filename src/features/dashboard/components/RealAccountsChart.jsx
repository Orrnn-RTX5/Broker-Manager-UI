import { LineChart, Line, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Tooltip, Brush } from 'recharts';

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
  return (
    <div className="ui-card p-5 h-96 flex flex-col">
      <div className="text-sm font-semibold mb-4" style={{ color: 'var(--text)' }}>Real Accounts</div>
      <div className="flex-1 w-full relative">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
            <XAxis dataKey="time" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: 'var(--text-3)' }} />
            <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: 'var(--text-3)' }} domain={[0, 25]} ticks={[0, 5, 10, 15, 20, 25]} />
            <Tooltip
              cursor={{ stroke: 'var(--muted)', strokeWidth: 1, strokeDasharray: '3 3' }}
              contentStyle={{
                fontSize: '12px',
                borderRadius: '8px',
                border: '1px solid var(--border)',
                boxShadow: 'var(--shadow-md)',
                padding: '6px 10px',
                backgroundColor: 'var(--surface)',
                color: 'var(--text)'
              }}
              labelStyle={{ display: 'none' }}
            />
            <Line type="linear" dataKey="value" stroke="var(--accent)" strokeWidth={2} dot={false} isAnimationActive={false} />
            <Brush dataKey="time" height={15} stroke="var(--accent)" fill="var(--surface-2)" tickFormatter={() => ''} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default RealAccountsChart;
