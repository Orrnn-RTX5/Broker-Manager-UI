import { useMemo } from 'react';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';

const SLICE_COLORS = ['#38bdf8', '#f2c94c', '#8bc34a', '#a987ff', '#e46b95', '#6f98a8', '#f97316', '#2dd4bf'];
const RADIAN = Math.PI / 180;
const countFormatter = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 });
const tooltipStyle = {
  background: 'var(--surface)',
  border: '1px solid var(--border-3)',
  borderRadius: 4,
  color: 'var(--text)',
  fontSize: 10,
};

const truncateName = (name) => {
  const label = String(name ?? '');
  return label.length > 26 ? `${label.slice(0, 24)}…` : label;
};

const renderSliceLabel = ({ cx, cy, midAngle, outerRadius, name, percent }) => {
  if (!Number.isFinite(percent) || percent < 0.04) return null;
  const cosine = Math.cos(-midAngle * RADIAN);
  const sine = Math.sin(-midAngle * RADIAN);
  const startX = cx + (outerRadius + 2) * cosine;
  const startY = cy + (outerRadius + 2) * sine;
  const middleX = cx + (outerRadius + 12) * cosine;
  const middleY = cy + (outerRadius + 12) * sine;
  const endX = middleX + (cosine >= 0 ? 16 : -16);
  const textX = endX + (cosine >= 0 ? 4 : -4);
  return (
    <g className="trading-analytics-pie-label">
      <path d={`M${startX},${startY}L${middleX},${middleY}L${endX},${middleY}`} />
      <text x={textX} y={middleY} textAnchor={cosine >= 0 ? 'start' : 'end'} dominantBaseline="central">
        {truncateName(name)}: {(percent * 100).toFixed(2)}%
      </text>
    </g>
  );
};

const OnlineUsersDonut = ({ slices = [], total }) => {
  const data = useMemo(() => slices.map((item, index) => ({
    ...item,
    color: SLICE_COLORS[index % SLICE_COLORS.length],
  })), [slices]);
  const totalCount = total ?? data.reduce((sum, item) => sum + item.count, 0);

  return (
    <div className="online-users-donut">
      <ResponsiveContainer width="100%" height="100%" minWidth={0} initialDimension={{ width: 360, height: 220 }}>
        <PieChart margin={{ top: 18, right: 40, bottom: 18, left: 40 }}>
          <Pie
            data={data}
            dataKey="count"
            nameKey="name"
            cx="50%"
            cy="50%"
            innerRadius="50%"
            outerRadius="68%"
            paddingAngle={1}
            stroke="var(--surface)"
            strokeWidth={1}
            isAnimationActive={false}
            label={renderSliceLabel}
            labelLine={false}
          >
            {data.map((entry) => (
              <Cell key={entry.name} fill={entry.color} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={tooltipStyle}
            formatter={(value, name) => [countFormatter.format(value), name]}
          />
        </PieChart>
      </ResponsiveContainer>
      <div className="online-users-donut-center" aria-hidden="true">
        <strong>{countFormatter.format(totalCount)}</strong>
      </div>
    </div>
  );
};

export default OnlineUsersDonut;
