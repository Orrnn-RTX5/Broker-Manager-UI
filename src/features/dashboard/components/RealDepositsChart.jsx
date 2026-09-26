import { LineChart, Line, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Tooltip, Brush } from 'recharts';

// Generate mock data for the flat-then-spike "Real Deposits" chart
const generateSpikeData = () => {
  const data = [];
  for (let i = 0; i < 30; i++) {
    // Mostly flat at 0, then a massive spike at the end up to 25000
    let val = 0;
    if (i === 28) val = 12000;
    if (i === 29) val = 25000;

    data.push({
      time: i === 0 || i === 29 ? '00:00' : '',
      value: val
    });
  }
  return data;
};

const data = generateSpikeData();

const RealDepositsChart = () => {
  return (
    <div className="ui-card p-5 h-96 flex flex-col">
      <div className="text-sm font-semibold mb-4" style={{ color: 'var(--text)' }}>Real Deposits & Withdrawals, USD</div>
      <div className="flex-1 w-full relative">
        <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={160} initialDimension={{ width: 320, height: 180 }}>
          <LineChart data={data} margin={{ top: 5, right: 5, left: -10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
            <XAxis dataKey="time" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: 'var(--text-3)' }} />
            <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: 'var(--text-3)' }} domain={[0, 25000]} ticks={[0, 5000, 10000, 15000, 20000, 25000]} />
            <Tooltip
              cursor={{ stroke: 'var(--muted)', strokeWidth: 1, strokeDasharray: '3 3' }}
              contentStyle={{
                fontSize: '11px',
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

export default RealDepositsChart;
