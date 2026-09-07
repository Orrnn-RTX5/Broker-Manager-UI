const markers = [
  { id: 'north-america', x: 112, y: 68, level: 'medium' },
  { id: 'south-america', x: 170, y: 128, level: 'low' },
  { id: 'europe', x: 312, y: 58, level: 'high' },
  { id: 'mena', x: 342, y: 91, level: 'low' },
  { id: 'asia', x: 438, y: 76, level: 'high' },
  { id: 'oceania', x: 520, y: 130, level: 'medium' },
];

const RegionalActivityMap = () => (
  <div className="cc-map-visual" role="img" aria-label="Regional brokerage activity across the world">
    <svg viewBox="0 0 620 180" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      <defs>
        <linearGradient id="regional-land" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="var(--cc-map-land-top)" />
          <stop offset="1" stopColor="var(--cc-map-land-bottom)" />
        </linearGradient>
        <filter id="regional-marker-glow" x="-250%" y="-250%" width="600%" height="600%">
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>

      <g className="cc-map-grid">
        {[60, 140, 220, 300, 380, 460, 540].map((x) => <line key={`x-${x}`} x1={x} y1="13" x2={x} y2="167" />)}
        {[40, 90, 140].map((y) => <line key={`y-${y}`} x1="20" y1={y} x2="600" y2={y} />)}
      </g>

      <g className="cc-map-land" fill="url(#regional-land)">
        <path d="M47 54 72 35 111 28 145 36 166 31 194 41 183 54 157 59 146 72 128 76 119 91 99 96 88 83 64 80 55 68Z" />
        <path d="M134 99 157 94 181 104 192 122 184 140 173 151 166 169 153 158 148 139 137 124 128 109Z" />
        <path d="M271 49 284 35 305 33 318 40 330 37 342 45 332 54 314 54 303 62 285 60Z" />
        <path d="M292 68 320 61 348 72 359 91 350 112 337 124 329 148 313 158 302 136 289 119 283 96Z" />
        <path d="M337 48 363 36 395 39 416 31 451 38 475 35 511 48 548 52 570 68 550 79 520 78 500 91 474 84 454 94 432 88 408 98 391 85 365 82 350 66Z" />
        <path d="M492 119 513 108 542 113 561 127 549 143 522 146 499 138 483 127Z" />
        <path d="M211 28 226 19 242 22 247 33 231 40 215 37Z" />
        <path d="M573 112 581 108 586 116 579 125Z" />
      </g>

      <g className="cc-map-coastline">
        <path d="M47 54 72 35 111 28 145 36 166 31 194 41 183 54 157 59 146 72 128 76 119 91 99 96 88 83 64 80 55 68Z" />
        <path d="M134 99 157 94 181 104 192 122 184 140 173 151 166 169 153 158 148 139 137 124 128 109Z" />
        <path d="M271 49 284 35 305 33 318 40 330 37 342 45 332 54 314 54 303 62 285 60Z" />
        <path d="M292 68 320 61 348 72 359 91 350 112 337 124 329 148 313 158 302 136 289 119 283 96Z" />
        <path d="M337 48 363 36 395 39 416 31 451 38 475 35 511 48 548 52 570 68 550 79 520 78 500 91 474 84 454 94 432 88 408 98 391 85 365 82 350 66Z" />
        <path d="M492 119 513 108 542 113 561 127 549 143 522 146 499 138 483 127Z" />
      </g>

      <g className="cc-map-markers" filter="url(#regional-marker-glow)">
        {markers.map((marker) => (
          <g key={marker.id} className={`is-${marker.level}`}>
            <circle className="pulse" cx={marker.x} cy={marker.y} r="9" />
            <circle className="core" cx={marker.x} cy={marker.y} r="3.5" />
          </g>
        ))}
      </g>
    </svg>
    <span className="cc-map-caption"><i /> Operational footprint</span>
  </div>
);

export default RegionalActivityMap;
