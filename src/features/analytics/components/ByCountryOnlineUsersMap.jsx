import React from 'react';
import {
  ComposableMap,
  Geographies,
  Geography,
  ZoomableGroup
} from "react-simple-maps";
import useThemeStore from '../../../store/themeStore';

const geoUrl = "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json";

// The screenshot highlights India and Russia in blue
const activeCountries = ["India", "Russia"];

const getCountryColor = (countryName, isDarkMode) => {
  if (countryName === "India") return "#3b82f6"; // Primary blue
  if (countryName === "Russia") return "#60a5fa"; // Lighter blue
  return isDarkMode ? "#374151" : "#e5e7eb"; // Very light gray for inactive
};

const ByCountryOnlineUsersMap = () => {
  const isDarkMode = useThemeStore((state) => state.isDarkMode);

  return (
    <div className="bg-white dark:bg-[#1e1e1e] flex flex-col pt-4 h-[350px] overflow-hidden transition-colors w-full border-r border-gray-100 dark:border-gray-800">
      <div className="text-[11px] text-gray-800 dark:text-gray-200 ml-4 mb-2 font-semibold z-10">Online Users by Country</div>
      
      <div className="flex-1 w-full relative pt-2 overflow-hidden flex justify-center items-center">
        <ComposableMap 
          projection="geoMercator" 
          projectionConfig={{ scale: 120 }}
          width={800}
          height={400}
          style={{ width: "100%", height: "100%", maxHeight: "300px" }}
        >
          <ZoomableGroup center={[40, 30]} zoom={1.1}>
            <Geographies geography={geoUrl}>
              {({ geographies }) =>
                geographies.map((geo) => {
                  const countryName = geo.properties.name;
                  return (
                    <Geography
                      key={geo.rsmKey}
                      geography={geo}
                      fill={getCountryColor(countryName, isDarkMode)}
                      stroke={isDarkMode ? "#1e1e1e" : "#ffffff"}
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

export default ByCountryOnlineUsersMap;
