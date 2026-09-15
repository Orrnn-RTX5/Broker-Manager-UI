import React from 'react';
import {
  ComposableMap,
  Geographies,
  Geography,
  ZoomableGroup
} from "react-simple-maps";
import useThemeStore from '../../../store/themeStore';

// TopoJSON data for world map
const geoUrl = "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json";

// Mock data list of countries that have trading accounts
// This mocks the specific blue highlighting seen in the screenshot
const activeCountries = [
  "India", "Brazil", "South Africa", "Nigeria", 
  "Egypt", "Saudi Arabia", "United Arab Emirates", 
  "Indonesia", "Philippines", "Turkey", "Vietnam",
  "Thailand", "Kenya", "Algeria", "Morocco", "Pakistan",
  "Bangladesh", "Tanzania"
];

// Map a specific vibrant blue for India, and standard blue for others
const getCountryColor = (countryName, isDarkMode) => {
  if (countryName === "India") return "#3b82f6"; // Bright primary blue
  if (activeCountries.includes(countryName)) return "#60a5fa"; // Lighter blue
  return isDarkMode ? "#374151" : "var(--border)"; // Shared light-theme border for inactive countries
};

const TradingAccountsByCountryMap = () => {
  const isDarkMode = useThemeStore((state) => state.isDarkMode);

  return (
    <div className="bg-white dark:bg-[#1e1e1e] p-4 rounded-sm border border-gray-200 dark:border-gray-800 shadow-sm h-72 flex flex-col relative w-full overflow-hidden transition-colors">
      <div className="text-[13px] font-semibold text-gray-800 dark:text-gray-200 mb-2 h-5 z-10">Trading Accounts by Country</div>
      
      <div className="flex-1 w-full relative pt-2">
        <ComposableMap 
          projection="geoMercator" 
          projectionConfig={{ scale: 120 }}
          width={800}
          height={400}
          style={{ width: "100%", height: "100%" }}
        >
          <ZoomableGroup center={[20, 10]} zoom={1.2}>
            <Geographies geography={geoUrl}>
              {({ geographies }) =>
                geographies.map((geo) => {
                  const countryName = geo.properties.name;
                  return (
                    <Geography
                      key={geo.rsmKey}
                      geography={geo}
                      fill={getCountryColor(countryName, isDarkMode)}
                      stroke={isDarkMode ? "#1e1e1e" : "var(--surface)"}
                      strokeWidth={0.5}
                      style={{
                        default: { outline: "none" },
                        hover: { fill: "#2563eb", outline: "none", cursor: "pointer" },
                        pressed: { outline: "none" },
                      }}
                    />
                  );
                })
              }
            </Geographies>
          </ZoomableGroup>
        </ComposableMap>
      </div>
    </div>
  );
};

export default TradingAccountsByCountryMap;
