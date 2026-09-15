import React from 'react';
import {
  ComposableMap,
  Geographies,
  Geography,
  ZoomableGroup
} from "react-simple-maps";
import useThemeStore from '../../../store/themeStore';

const geoUrl = "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json";

// Mock data list matching the top screenshot
const activeCountries = [
  "India", "Brazil", "South Africa", "Nigeria", 
  "Egypt", "Saudi Arabia", "United Arab Emirates", 
  "Indonesia", "Philippines", "Turkey", "Vietnam",
  "Thailand", "Kenya", "Algeria", "Morocco", "Pakistan",
  "Bangladesh", "Tanzania"
];

const getCountryColor = (countryName, isDarkMode) => {
  if (countryName === "India") return "#3b82f6"; // Bright primary blue
  if (activeCountries.includes(countryName)) return "#60a5fa"; // Lighter blue
  return isDarkMode ? "#374151" : "var(--border)"; // Shared light-theme border for inactive countries
};

const ByCountryTradingAccountsMap = () => {
  const isDarkMode = useThemeStore((state) => state.isDarkMode);

  return (
    <div className="bg-white dark:bg-[#1e1e1e] flex flex-col pt-4 h-[350px] overflow-hidden transition-colors w-full border-b border-gray-100 dark:border-gray-800">
      <div className="text-[11px] text-gray-800 dark:text-gray-200 ml-4 mb-2 font-semibold z-10">Trading Accounts by Country</div>
      
      <div className="flex-1 w-full relative pt-2 overflow-hidden flex justify-center items-center">
        <ComposableMap 
          projection="geoMercator" 
          projectionConfig={{ scale: 130 }}
          width={800}
          height={400}
          style={{ width: "100%", height: "100%", maxHeight: "300px" }}
        >
          <ZoomableGroup center={[20, 10]} zoom={1.3}>
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

export default ByCountryTradingAccountsMap;
