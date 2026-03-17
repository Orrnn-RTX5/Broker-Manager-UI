import React, { useState, useEffect, useRef } from 'react';
import { Settings, Save, X, Check, ChevronRight } from 'lucide-react';

const MenuDivider = () => <div className="h-px bg-[#404040] my-1 mx-1"></div>;

const MenuItem = ({ text, icon: Icon, iconColor = "", rightText = "", rightIcon: RightIcon, hasCheck = false, disabled = false, submenu, onClick }) => {
  const [isHovered, setIsHovered] = useState(false);
  let closeTimeout = useRef(null);

  const handleMouseEnter = () => {
    if (closeTimeout.current) clearTimeout(closeTimeout.current);
    setIsHovered(true);
  };

  const handleMouseLeave = () => {
    closeTimeout.current = setTimeout(() => {
      setIsHovered(false);
    }, 150); // slight delay to make moving to submenu easier
  };

  return (
    <div 
      className={`relative flex items-center justify-between px-6 py-1 text-[12px] cursor-pointer hover:bg-[#3f3f46] select-none ${disabled ? 'text-gray-500 cursor-default' : 'text-gray-200'} ${isHovered && submenu ? 'bg-[#3f3f46]' : ''}`}
      onClick={disabled ? undefined : onClick}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <div className="flex items-center gap-2">
        <div className="w-4 h-4 flex items-center justify-center">
          {hasCheck ? (
             <Check size={12} className="text-white" strokeWidth={2.5} />
          ) : Icon ? (
             <Icon size={14} className={iconColor} strokeWidth={1.5} />
          ) : null}
        </div>
        <span>{text}</span>
      </div>
      <div className="flex items-center gap-2">
        {rightText && <span className="text-gray-400 text-[11px]">{rightText}</span>}
        {RightIcon && <RightIcon size={14} className="text-gray-400" />}
      </div>

      {/* Render Submenu if it exists and item is hovered */}
      {submenu && isHovered && (
        <div 
          className="absolute top-0 left-full ml-1 w-[220px] bg-[#2b2b2b] border border-[#404040] rounded-sm py-1 shadow-2xl font-sans z-[10000]"
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        >
          {submenu.map((item, idx) => (
            <MenuItem key={idx} {...item} />
          ))}
        </div>
      )}
    </div>
  );
};

const AnalyticsContextMenu = ({ x, y, onClose }) => {
  useEffect(() => {
    const handleClick = () => onClose();
    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, [onClose]);

  // Ensure menu stays within viewport
  // If submenu might overflow right, we'd need more logic, but keeping it simple for now
  const style = {
    top: Math.min(y, window.innerHeight - 450), // roughly menu height
    left: Math.min(x, window.innerWidth - 450), // menu width + submenu width roughly
  };

  const onlineUserMetricsSubmenu = [
    { text: "Online Users by Country" },
    { text: "Online Users by Group" },
    { text: "Online Users by City" },
    { text: "Online Users by Balance" },
    { text: "Online Users by Type" },
    { text: "Online Users by Build" },
    { text: "Online Users by Color" }
  ];

  const summarySubmenu = [
    { text: "Total Active Accounts" },
    { text: "Total Net Deposits" },
    { text: "Total Withdrawal/Deposit Ratio" },
    { text: "Total Broker Floating P/L" },
    { text: "Summary Exposure by A/B-Book" },
    { text: "Summary A-Book by Symbol Group" },
    { text: "Summary B-Book by Symbol Group" }
  ];

  return (
    <div 
      className="fixed z-[9999] w-[220px] bg-[#2b2b2b] border border-[#404040] rounded-sm py-1 shadow-2xl font-sans"
      style={style}
      onContextMenu={(e) => e.preventDefault()}
    >
      <MenuItem 
        text="Add Online User Metrics" 
        rightIcon={ChevronRight} 
        submenu={onlineUserMetricsSubmenu} 
      />
      <MenuItem text="Add Account Metrics" rightIcon={ChevronRight} />
      <MenuItem text="Add Position Metrics" rightIcon={ChevronRight} />
      <MenuItem text="Add Order Metrics" rightIcon={ChevronRight} />
      <MenuItem 
        text="Add Summary" 
        rightIcon={ChevronRight} 
        submenu={summarySubmenu}
      />
      <MenuItem text="Add Finteza Website" rightIcon={ChevronRight} />
      <MenuItem text="Add Finteza Campaign" rightIcon={ChevronRight} />
      <MenuItem text="Add Ultency Liquidity Provider" rightIcon={ChevronRight} />
      <MenuItem text="Add External" rightIcon={ChevronRight} />
      
      <MenuDivider />
      
      <MenuItem text="Edit" icon={Settings} iconColor="text-blue-500" rightText="Ctrl+E" />
      <MenuItem text="Save" icon={Save} iconColor="text-blue-500" rightText="Ctrl+S" />
      <MenuItem text="Save as" rightIcon={ChevronRight} />
      <MenuItem text="Delete" icon={X} iconColor="text-red-500" />
      
      <MenuDivider />
      
      <MenuItem text="Title" hasCheck={true} />
      <MenuItem text="Legend" />
      <MenuItem text="Details" hasCheck={true} />
      <MenuItem text="Zero base value axis" hasCheck={true} />
      <MenuItem text="Type" rightIcon={ChevronRight} />
      <MenuItem text="Stacking" rightIcon={ChevronRight} />
      <MenuItem text="Top" rightIcon={ChevronRight} />
      
      <MenuDivider />
      
      <MenuItem text="Auto Arrange" hasCheck={true} />
      <MenuItem text="Grid" hasCheck={true} />
    </div>
  );
};

export default AnalyticsContextMenu;
