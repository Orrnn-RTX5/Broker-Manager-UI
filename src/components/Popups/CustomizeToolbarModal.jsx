import React from 'react';
import { X, HelpCircle, FolderOpen, Printer, Copy, CheckCircle, Settings, CheckSquare, Grid, LayoutGrid, ArrowRightToLine, Cpu, Layers, HelpCircle as HelpIcon, RefreshCw, MoreVertical } from 'lucide-react';

const availableButtons = [
  { id: 'open_manager', icon: FolderOpen, label: 'Open Manager Data', colorClass: 'text-yellow-600' },
  { id: 'print_preview', icon: Printer, label: 'Print Preview', colorClass: 'text-blue-500' },
  { id: 'copy', icon: Copy, label: 'Copy', colorClass: 'text-blue-500' },
  { id: 'check_balance', icon: CheckCircle, label: 'Check Balance', colorClass: 'text-green-500' },
  { id: 'fix_balance', icon: Settings, label: 'Fix Balance', colorClass: 'text-blue-400' },
  { id: 'bulk_closing', icon: CheckSquare, label: 'Bulk Closing', colorClass: 'text-teal-400' },
  { id: 'grid', icon: Grid, label: 'Grid', colorClass: 'text-blue-500' },
  { id: 'tile_windows', icon: LayoutGrid, label: 'Tile Windows', colorClass: 'text-blue-400' }
];

const selectedButtons = [
  { id: 'connect', icon: ArrowRightToLine, label: 'Connect', colorClass: 'text-green-500' },
  { id: 'automation', icon: Cpu, label: 'Automation', colorClass: 'text-green-500' },
  { id: 'queue', icon: Layers, label: 'Queue', colorClass: 'text-blue-500' },
  { id: 'sep1', isSeparator: true },
  { id: 'help', icon: HelpIcon, label: 'Help', colorClass: 'text-blue-500' },
  { id: 'sep2', isSeparator: true },
  { id: 'bulk_operations', icon: RefreshCw, label: 'Bulk Operations', colorClass: 'text-blue-500' },
  { id: 'sep3', isSeparator: true },
  { id: 'customize', icon: MoreVertical, label: 'Customize', colorClass: 'text-blue-500' }
];

const ListBox = ({ title, items, selectedIndex }) => {
  return (
    <div className="flex flex-col h-[320px] w-[200px]">
      <span className="text-[12px] text-gray-200 mb-1">{title}</span>
      <div className="flex-1 bg-[#1e1e1e] border border-gray-500 overflow-y-auto w-full">
        {items.map((item, index) => {
          if (item.isSeparator) {
            return (
              <div key={item.id} className="w-full flex justify-center py-[2px] cursor-pointer hover:bg-[#2b2b2b]">
                <div className="h-px bg-gray-500 w-[90%]"></div>
              </div>
            );
          }
          
          const isSelected = index === selectedIndex;
          
          return (
            <div 
              key={item.id} 
              className={`flex items-center gap-3 px-2 py-1 cursor-pointer select-none ${isSelected ? 'bg-[#007acc] text-white' : 'hover:bg-[#2b2b2b] text-gray-300'}`}
            >
              <div className="w-4 flex justify-center">
                <item.icon size={16} className={isSelected ? 'text-white' : item.colorClass} strokeWidth={1.5} />
              </div>
              <span className="text-[12px] whitespace-nowrap">{item.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

const Button = ({ children, className = "" }) => (
  <button className={`bg-[#2b2b2b] hover:bg-[#3f3f46] border border-gray-500 text-gray-200 text-[12px] rounded-[3px] py-[3px] px-3 w-[80px] transition-colors focus:outline-none focus:border-blue-400 ${className}`}>
    {children}
  </button>
);

const CustomizeToolbarModal = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/40">
      <div className="w-[580px] bg-[#1e1e1e] border border-gray-600 rounded-sm shadow-2xl flex flex-col font-sans">
        
        {/* Header directly matching standard Windows-style dark theme */}
        <div className="flex justify-between items-center px-3 py-2 bg-[#2b2b2b] border-b border-gray-700 select-none">
          <div className="flex items-center gap-2">
            <div className="flex gap-[2px]">
              <Settings size={14} className="text-yellow-500" />
              <Layers size={14} className="text-green-500 -ml-2" />
            </div>
            <span className="text-[13px] text-gray-200 tracking-wide">Customizing Toolbar</span>
          </div>
          <div className="flex gap-2">
            <button className="text-gray-400 hover:text-white hover:bg-white/10 p-0.5 rounded transition-colors focus:outline-none">
              <HelpCircle size={14} />
            </button>
            <button 
              onClick={onClose}
              className="text-gray-400 hover:text-white hover:bg-red-500 p-0.5 rounded transition-colors focus:outline-none"
            >
              <X size={14} />
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="p-4 flex gap-4 h-[350px]">
          
          {/* Left Column (Available) */}
          <ListBox title="Available buttons:" items={availableButtons} selectedIndex={0} />

          {/* Middle Buttons */}
          <div className="flex flex-col justify-center gap-2">
            <Button>Insert -{'>'}</Button>
            <Button>{'<-'} Remove</Button>
          </div>

          {/* Right Column (Selected) */}
          <ListBox title="Selected buttons:" items={selectedButtons} selectedIndex={8} />

          {/* Far Right Action Buttons */}
          <div className="flex flex-col justify-between">
            <div className="flex flex-col gap-2 mt-[20px]">
              <Button>Up</Button>
              <Button>Down</Button>
              <div className="h-2"></div>
              <Button>Reset</Button>
            </div>
            
            <Button className="mt-auto" onClick={onClose}>Close</Button>
          </div>

        </div>
      </div>
    </div>
  );
};

export default CustomizeToolbarModal;
