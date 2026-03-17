import React, { useState, useEffect, useRef } from 'react';
import { Settings, Save, X, Check, ChevronRight, UserPlus, FileText, UserSquare, Mail, BookOpen, Search, RefreshCw } from 'lucide-react';

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
          className="absolute top-0 left-full ml-1 w-[180px] bg-[#2b2b2b] border border-[#404040] rounded-sm py-1 shadow-2xl font-sans z-[10000]"
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

const ClientsContextMenu = ({ x, y, onClose }) => {
  useEffect(() => {
    const handleClick = () => onClose();
    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, [onClose]);

  // Ensure menu stays within viewport
  const style = {
    top: Math.min(y, window.innerHeight - 450), // roughly menu height
    left: Math.min(x, window.innerWidth - 400), // roughly menu + submenu width
  };

  const selectBySubmenu = [
    { text: "All" },
    { text: "None" },
    { text: "Invert Selection" }
  ];

  const filterSubmenu = [
    { text: "Contains" },
    { text: "Equals" },
    { text: "Starts with" },
    { text: "Clear Filter" }
  ];

  const copyAsSubmenu = [
    { text: "Text" },
    { text: "CSV" },
    { text: "JSON" }
  ];

  const columnsSubmenu = [
    { text: "Login", hasCheck: true },
    { text: "Name", hasCheck: true },
    { text: "Group", hasCheck: true },
    { text: "Country", hasCheck: true },
    { text: "City", hasCheck: true }
  ];

  return (
    <div 
      className="fixed z-[9999] w-[240px] bg-[#2b2b2b] border border-[#404040] rounded-sm py-1 shadow-2xl font-sans"
      style={style}
      onContextMenu={(e) => e.preventDefault()}
    >
      <MenuItem text="New Client" icon={UserPlus} iconColor="text-green-500" rightText="Ctrl+Shift+N" />
      <MenuItem text="Client Details" icon={UserSquare} iconColor="text-blue-400" />
      <MenuItem text="Fix Personal Data" icon={UserSquare} iconColor="text-blue-500" />
      
      <MenuDivider />
      
      <MenuItem text="Email" icon={Mail} iconColor="text-yellow-600" />
      <MenuItem text="Journal" icon={BookOpen} iconColor="text-yellow-600" />
      
      <MenuDivider />
      
      <MenuItem text="Select By" rightIcon={ChevronRight} submenu={selectBySubmenu} />
      <MenuItem text="Filter" rightIcon={ChevronRight} submenu={filterSubmenu} />
      <MenuItem text="Copy As" rightIcon={ChevronRight} submenu={copyAsSubmenu} />
      <MenuItem text="Export" icon={RefreshCw} iconColor="text-green-500" />
      <MenuItem text="Find" icon={Search} iconColor="text-gray-500" rightText="Ctrl+F" disabled={true} />
      
      <MenuDivider />
      
      <MenuItem text="Delete Clients" icon={X} iconColor="text-red-500" rightText="Ctrl+D" />
      
      <MenuDivider />
      
      <MenuItem text="Auto Scroll" />
      <MenuItem text="Auto Arrange" hasCheck={true} rightText="A" />
      <MenuItem text="Grid" hasCheck={true} rightText="G" />
      
      <MenuDivider />
      
      <MenuItem text="Columns" rightIcon={ChevronRight} submenu={columnsSubmenu} />
    </div>
  );
};

export default ClientsContextMenu;
