import { useMemo, useState } from 'react';
import { motion as Motion, AnimatePresence } from 'framer-motion';
import { DonutChart } from '../../../components/ui/donut-chart';
import { useDonutChartAnimation } from '../../../hooks/useDonutChartAnimation';

const SLICE_COLORS = ['#008ffb', '#f2c94c', '#8bc34a', '#a987ff', '#e46b95', '#6f98a8', '#f97316', '#2dd4bf'];
const countFormatter = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 });
const percentage = (value, total) => (total ? `${((value / total) * 100).toFixed(2)}%` : '0.00%');

const OnlineUsersDonut = ({ slices = [], total, unitLabel = 'online' }) => {
  const [hoveredSlice, setHoveredSlice] = useState(null);

  const donutData = useMemo(
    () => slices.map((item, index) => ({
      value: item.count,
      label: item.name,
      color: SLICE_COLORS[index % SLICE_COLORS.length],
    })),
    [slices]
  );

  const totalCount = total ?? donutData.reduce((sum, item) => sum + item.value, 0);
  const donutAnimation = useDonutChartAnimation(donutData, totalCount);

  const activeSegment = useMemo(() => {
    if (!hoveredSlice) return null;
    const key = typeof hoveredSlice === 'object' ? hoveredSlice?.label : hoveredSlice;
    return donutAnimation.segments.find((segment) => segment.label === key) || null;
  }, [hoveredSlice, donutAnimation.segments]);

  return (
    <div className="trading-analytics-group online-users-donut-panel">
      <div className="trading-analytics-group-layout">
        <div className="trading-analytics-group-chart">
          <DonutChart
            data={donutData}
            totalValue={totalCount}
            size={148}
            strokeWidth={18}
            animationState={donutAnimation}
            highlightOnHover
            onSegmentHover={setHoveredSlice}
            centerContent={
              <AnimatePresence mode="wait">
                <Motion.div
                  key={activeSegment ? activeSegment.label : 'total'}
                  initial={donutAnimation.reducedMotion ? false : { opacity: 0, scale: 0.92 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={donutAnimation.reducedMotion ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.92 }}
                  transition={{ duration: donutAnimation.reducedMotion ? 0 : 0.15, ease: 'easeOut' }}
                  className="flex flex-col items-center justify-center text-center px-1 pointer-events-none select-none"
                >
                  <span className="text-[10px] text-[var(--text-3)] font-medium truncate max-w-[84px] leading-tight">
                    {activeSegment ? activeSegment.label : unitLabel}
                  </span>
                  <strong className="text-base font-bold text-[var(--text)] leading-tight my-0.5 tabular">
                    {activeSegment
                      ? countFormatter.format(activeSegment.animatedValue)
                      : countFormatter.format(donutAnimation.animatedTotal)}
                  </strong>
                  {activeSegment && (
                    <span className="text-[10px] font-semibold text-[var(--accent)] leading-tight tabular">
                      {activeSegment.animatedPercentLabel || percentage(activeSegment.value, totalCount)}
                    </span>
                  )}
                </Motion.div>
              </AnimatePresence>
            }
          />
        </div>
        <div className="trading-analytics-group-breakdown">
          {donutAnimation.segments.map((segment) => {
            const isHovered = activeSegment?.label === segment.label;
            return (
              <div
                key={segment.label}
                onMouseEnter={() => setHoveredSlice(segment)}
                onMouseLeave={() => setHoveredSlice(null)}
                className={`trading-analytics-group-row ${isHovered ? 'is-active' : ''} ${donutAnimation.isStatic ? 'is-static' : 'is-animating'}`}
                style={
                  donutAnimation.isStatic
                    ? undefined
                    : { opacity: Math.max(0.35, segment.sliceProgress) }
                }
              >
                <div className="trading-analytics-group-row-info">
                  <span className="trading-analytics-group-dot" style={{ backgroundColor: segment.color }} />
                  <span className="trading-analytics-group-name" title={segment.label}>{segment.label}</span>
                </div>
                <div className="trading-analytics-group-row-stats">
                  <span className="trading-analytics-group-count tabular">{countFormatter.format(segment.animatedValue)}</span>
                  <span className="trading-analytics-group-pct tabular">{segment.animatedPercentLabel}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default OnlineUsersDonut;
