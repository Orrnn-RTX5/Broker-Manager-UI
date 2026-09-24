import { ComposableMap, Geographies, Geography, ZoomableGroup } from 'react-simple-maps';
import worldGeoData from '../countries-110m.json';

const countFormatter = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 });

const OnlineUsersByCountryMap = ({ geoCounts, summary = [] }) => {
  const maxCount = Math.max(0, ...(geoCounts ? geoCounts.values() : []));

  return (
    <div className="trading-analytics-map">
      <div className="trading-analytics-map-canvas">
        <ComposableMap projection="geoMercator" projectionConfig={{ scale: 120 }} width={800} height={390}>
          <ZoomableGroup center={[10, 12]} zoom={1.05}>
            <Geographies geography={worldGeoData}>
              {({ geographies }) => geographies.map((geo) => {
                const name = geo.properties.name || '';
                const count = geoCounts?.get(name.toLowerCase()) || 0;
                const intensity = count && maxCount ? 0.42 + 0.58 * Math.sqrt(count / maxCount) : 1;
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
      {summary.length > 0 && (
        <div className="trading-analytics-country-summary">
          {summary.slice(0, 4).map((item) => (
            <span key={item.name}><i />{item.name}<b>{countFormatter.format(item.count)}</b></span>
          ))}
        </div>
      )}
    </div>
  );
};

export default OnlineUsersByCountryMap;
