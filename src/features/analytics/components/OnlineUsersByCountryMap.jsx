import { ComposableMap, Geographies, Geography, ZoomableGroup } from 'react-simple-maps';
import worldGeoData from '../countries-110m.json';

const countFormatter = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 });
const percentage = (value, total) => (total ? `${((value / total) * 100).toFixed(2)}%` : '0.00%');

const OnlineUsersByCountryMap = ({ geoCounts, summary = [], breakdown = [], total = 0 }) => {
  const maxCount = Math.max(0, ...(geoCounts ? geoCounts.values() : []));
  const rows = breakdown.length > 0 ? breakdown : summary;
  const totalCount = total || rows.reduce((sum, item) => sum + item.count, 0);

  return (
    <div className="online-users-country-layout">
      <div className="trading-analytics-map-canvas online-users-country-map-canvas">
        <ComposableMap projection="geoMercator" projectionConfig={{ scale: 120 }} width={800} height={350}>
          <ZoomableGroup center={[10, 14]} zoom={1.08}>
            <Geographies geography={worldGeoData}>
              {({ geographies }) => geographies.map((geo) => {
                const name = geo.properties.name || '';
                const count = geoCounts?.get(name.toLowerCase()) || 0;
                const intensity = count && maxCount ? 0.48 + 0.52 * Math.sqrt(count / maxCount) : 1;
                return (
                  <Geography
                    key={geo.rsmKey}
                    geography={geo}
                    fill={count ? 'var(--accent)' : 'var(--cc-map-land-bottom, #3c4140)'}
                    fillOpacity={count ? intensity : 0.82}
                    stroke="var(--bg-panel)"
                    strokeWidth={0.55}
                    style={{
                      default: { outline: 'none' },
                      hover: { fill: count ? 'var(--accent-hover)' : 'var(--cc-map-land-top, #505654)', outline: 'none' },
                      pressed: { outline: 'none' },
                    }}
                  >
                    <title>{name}: {countFormatter.format(count)} online</title>
                  </Geography>
                );
              })}
            </Geographies>
          </ZoomableGroup>
        </ComposableMap>
      </div>
      {rows.length > 0 && (
        <div className="online-users-country-breakdown">
          {rows.slice(0, 6).map((item) => {
            const isUnspecified = item.name === 'Unspecified';
            return (
              <div key={item.name} className="trading-analytics-group-row">
                <div className="trading-analytics-group-row-info">
                  <span
                    className="trading-analytics-group-dot"
                    style={{ backgroundColor: isUnspecified ? 'var(--border-3)' : 'var(--accent)' }}
                  />
                  <span className="trading-analytics-group-name" title={item.name}>{item.name}</span>
                </div>
                <div className="trading-analytics-group-row-stats">
                  <span className="trading-analytics-group-count tabular">{countFormatter.format(item.count)}</span>
                  <span className="trading-analytics-group-pct tabular">{percentage(item.count, totalCount)}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default OnlineUsersByCountryMap;
