// components/ui/donut-chart.jsx
"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { useDonutChartAnimation } from "../../hooks/useDonutChartAnimation";

const DonutChart = React.forwardRef(
  (
    {
      data = [],
      totalValue: propTotalValue,
      size = 200,
      strokeWidth = 20,
      animationDuration = 0.68,
      animationDelayPerSegment = 0.08,
      highlightOnHover = true,
      strokeLinecap = "butt",
      centerContent,
      onSegmentHover,
      animationState: externalAnimationState,
      className,
      ...props
    },
    ref
  ) => {
    const [hoveredSegment, setHoveredSegment] = React.useState(null);

    const internalTotalValue = React.useMemo(
      () =>
        propTotalValue ??
        data.reduce((sum, segment) => sum + (Number(segment?.value) || 0), 0),
      [data, propTotalValue]
    );

    const effectiveInitialDurationMs =
      animationDuration && animationDuration > 0
        ? Math.round(animationDuration * 1000)
        : 680;
    const effectiveStaggerStep =
      animationDelayPerSegment && animationDelayPerSegment > 0
        ? animationDelayPerSegment
        : 0.08;

    const internalAnimationState = useDonutChartAnimation(
      externalAnimationState ? [] : data,
      internalTotalValue,
      {
        initialDurationMs: effectiveInitialDurationMs,
        updateDurationMs: 520,
        staggerStep: effectiveStaggerStep,
      }
    );

    const activeAnimation = externalAnimationState || internalAnimationState;
    const {
      segments: animatedSegments = [],
      isStatic = true,
      isInitialEntrance = false,
      overallEased = 1,
      rotationDeg = 0,
      scale = 1,
    } = activeAnimation;

    const radius = size / 2 - strokeWidth / 2;
    const circumference = 2 * Math.PI * radius;

    const visibleSegments = React.useMemo(
      () => animatedSegments.filter((segment) => Number(segment?.value) > 0),
      [animatedSegments]
    );

    React.useEffect(() => {
      onSegmentHover?.(hoveredSegment);
    }, [hoveredSegment, onSegmentHover]);

    const handleMouseLeave = () => {
      setHoveredSegment(null);
    };

    const rotorStateClass = isStatic
      ? "is-static"
      : isInitialEntrance
        ? "is-entering"
        : "is-updating";

    return (
      <div
        ref={ref}
        className={cn("relative flex items-center justify-center", className)}
        style={{ width: size, height: size }}
        onMouseLeave={handleMouseLeave}
        data-chart-static={isStatic ? "true" : "false"}
        {...props}
      >
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          className="overflow-visible -rotate-90"
          data-chart-static={isStatic ? "true" : "false"}
        >
          {/* Base background ring */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="transparent"
            stroke="var(--border-2, rgba(255, 255, 255, 0.08))"
            strokeWidth={strokeWidth}
          />

          {/* Data Segments with subtle rotational/reveal entrance */}
          <g
            className={cn("donut-chart-rotor", rotorStateClass)}
            style={
              isStatic
                ? {
                    transformOrigin: `${size / 2}px ${size / 2}px`,
                    transformBox: "view-box",
                  }
                : {
                    transformOrigin: `${size / 2}px ${size / 2}px`,
                    transformBox: "view-box",
                    transform: `rotate(${rotationDeg}deg) scale(${scale})`,
                    opacity: Math.max(0.28, overallEased),
                  }
            }
          >
            {visibleSegments.map((segment) => {
              const arcLength = Math.max(
                0,
                (segment.animatedPercentage / 100) * circumference
              );
              const strokeDasharray = `${arcLength} ${circumference}`;
              const strokeDashoffset = -(
                (segment.animatedOffset / 100) *
                circumference
              );
              const isActive = hoveredSegment?.label === segment.label;

              return (
                <circle
                  key={segment.label || segment.index}
                  cx={size / 2}
                  cy={size / 2}
                  r={radius}
                  fill="transparent"
                  stroke={segment.color}
                  strokeWidth={strokeWidth}
                  strokeDasharray={strokeDasharray}
                  strokeDashoffset={strokeDashoffset}
                  strokeLinecap={strokeLinecap}
                  className={cn(
                    "donut-chart-segment origin-center transition-transform duration-200",
                    isStatic ? "is-static" : "is-animating",
                    highlightOnHover && "cursor-pointer"
                  )}
                  style={{
                    filter: isActive
                      ? `drop-shadow(0px 0px 6px ${segment.color}) brightness(1.15)`
                      : "none",
                    transform: isActive ? "scale(1.03)" : "scale(1)",
                    opacity: isStatic ? 1 : Math.max(0.24, segment.sliceProgress),
                    transition: "filter 0.2s ease-out, transform 0.2s ease-out",
                  }}
                  onMouseEnter={() => setHoveredSegment(segment)}
                />
              );
            })}
          </g>
        </svg>

        {/* Center Content */}
        {centerContent && (
          <div
            className={cn(
              "donut-chart-center absolute flex flex-col items-center justify-center pointer-events-none",
              isStatic ? "is-static" : "is-animating"
            )}
            style={{
              width: size - strokeWidth * 2.5,
              height: size - strokeWidth * 2.5,
              opacity: isStatic ? 1 : Math.max(0.25, overallEased),
            }}
          >
            {centerContent}
          </div>
        )}
      </div>
    );
  }
);

DonutChart.displayName = "DonutChart";

export { DonutChart };
