import { useId } from 'react';
import geometry from './regionalMapGeometry';

const RegionalActivityMap = () => {
  const gradientId = useId();

  return (
    <div className="cc-map-visual" role="img" aria-label="World map showing regional coverage in North America, South America, Europe, the Middle East and North Africa, and Asia">
      <svg viewBox="0 0 620 290" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="var(--cc-map-land-top)" />
            <stop offset="1" stopColor="var(--cc-map-land-bottom)" />
          </linearGradient>
        </defs>
        <path className="cc-map-grid" d={geometry.graticule} />
        <path className="cc-map-land" fill={`url(#${gradientId})`} d={geometry.land} />
        <path className="cc-map-borders" d={geometry.borders} />
        <g className="cc-map-markers">
          {geometry.markers.map(({ name, point: [x, y] }, index) => (
            <g key={name} transform={`translate(${x} ${y})`}>
              <g className="cc-map-starlight" style={{ animationDelay: `${index * -1.3}s`, animationDuration: `${5 + index * 0.6}s` }}>
                <circle className="core" r="2.3" />
              </g>
            </g>
          ))}
        </g>
      </svg>
      <div className="cc-map-caption"><span>GLOBAL COVERAGE</span><span><i /> Regional presence</span></div>
    </div>
  );
};

export default RegionalActivityMap;
