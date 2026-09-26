import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';

const data = [
  { name: 'None', value: 100 }
];

const COLORS = ['var(--accent)'];

const AccountsBySourceChart = ({ onClick }) => {
  return (
    <div
      className="ui-card ui-card-hover p-5 h-96 flex flex-col cursor-pointer group transition-all"
      onClick={onClick}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
          Accounts by Source
        </div>
        <span className="text-[10px]" style={{ color: 'var(--muted)' }}>Click for details</span>
      </div>
      <div className="flex-1 w-full relative flex items-center justify-center">
        <div className="w-1/2 h-full flex items-center justify-center relative">
          <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={160} initialDimension={{ width: 320, height: 180 }}>
            <PieChart>
              <Pie
                data={data}
                cx="50%"
                cy="50%"
                innerRadius={50}
                outerRadius={72}
                paddingAngle={0}
                dataKey="value"
                stroke="none"
                isAnimationActive={false}
              >
                {data.map((_, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="w-1/2 flex items-center justify-start pl-4">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full" style={{ background: 'var(--accent)' }} />
            <span className="text-xs" style={{ color: 'var(--text-2)' }}>None</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AccountsBySourceChart;
