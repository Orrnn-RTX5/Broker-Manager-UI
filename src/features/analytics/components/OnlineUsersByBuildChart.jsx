import { useRef, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip as RechartsTooltip, XAxis, YAxis } from 'recharts';

const BAR_COLORS = ['#ec4899', '#3730a3', '#16a34a', '#a3e635', '#f59e0b', '#ef4444', '#3b82f6', '#f97316', '#a855f7', '#14b8a6', '#84cc16', '#eab308'];
const countFormatter = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 });

const BuildTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div
      className="text-[11px] px-2 py-1 flex items-center gap-2 border rounded"
      style={{ background: 'var(--surface)', color: 'var(--text)', borderColor: 'var(--border-3)' }}
    >
      <span>Build: {label}</span>
      <span style={{ color: 'var(--text-3)' }}>Users</span>
      <span className="font-semibold">{countFormatter.format(payload[0].value)}</span>
    </div>
  );
};

const OnlineUsersByBuildChart = ({ data = [] }) => {
  const [mousePos, setMousePos] = useState({ x: null, y: null });
  const containerRef = useRef(null);

  const handleMouseMove = (event) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    if (x >= 0 && x <= rect.width && y >= 0 && y <= rect.height) setMousePos({ x, y });
    else setMousePos({ x: null, y: null });
  };

  return (
    <div
      className="online-users-build-chart"
      ref={containerRef}
      onMouseMove={handleMouseMove}
      onMouseLeave={() => setMousePos({ x: null, y: null })}
    >
      {mousePos.x !== null && mousePos.y !== null && (
        <>
          <div
            className="absolute top-0 bottom-0 pointer-events-none z-10"
            style={{ left: `${mousePos.x}px`, width: '1px', background: 'var(--accent)', opacity: 0.5 }}
          />
          <div
            className="absolute left-0 right-0 pointer-events-none z-10"
            style={{ top: `${mousePos.y}px`, height: '1px', background: 'var(--accent)', opacity: 0.5 }}
          />
        </>
      )}

      <ResponsiveContainer width="100%" height="100%" minWidth={0} initialDimension={{ width: 360, height: 220 }}>
        <BarChart data={data} margin={{ top: 14, right: 8, bottom: 2, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
          <XAxis dataKey="build" axisLine={{ stroke: 'var(--border-3)' }} tickLine={false} interval={0} tick={{ fill: 'var(--text-3)', fontSize: 9 }} />
          <YAxis allowDecimals={false} width={36} axisLine={{ stroke: 'var(--border-3)' }} tickLine={false} tick={{ fill: 'var(--text-3)', fontSize: 9 }} />
          <RechartsTooltip content={<BuildTooltip />} cursor={false} isAnimationActive={false} />
          <Bar dataKey="count" isAnimationActive={false}>
            {data.map((entry, index) => (
              <Cell key={entry.build} fill={BAR_COLORS[index % BAR_COLORS.length]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};

export default OnlineUsersByBuildChart;
