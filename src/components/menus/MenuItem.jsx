import { ChevronRight } from 'lucide-react';

export const MenuItem = ({
  icon: Icon,
  text,
  shortcut,
  iconColor = "text-gray-600",
  iconBg = "",
  disabled,
  hasSubmenu = false,
  onClick
}) => {
  return (
    <div
      onClick={disabled ? undefined : onClick}
      className={`
      flex items-center justify-between px-6 py-1.5 cursor-pointer select-none text-[13px] transition-colors
      ${disabled ? 'text-gray-400 dark:text-gray-500 cursor-default' : 'text-[#1a1a1a] dark:text-gray-200 hover:bg-[#e6f0fa] dark:hover:bg-[#3f3f46]'}
    `}>
      <div className="flex items-center gap-3">
        <div className={`w-5 h-5 flex justify-center items-center ${iconBg}`}>
          {Icon && <Icon size={14} className={disabled ? 'text-gray-300' : iconColor} strokeWidth={1.5} />}
        </div>
        <span>{text}</span>
      </div>
      <div className="flex items-center gap-2">
        {shortcut && <span className="text-gray-500 dark:text-gray-400 ml-8 text-[12px]">{shortcut}</span>}
        {hasSubmenu && <ChevronRight size={14} className="text-gray-600 dark:text-gray-400" />}
      </div>
    </div>
  );
};

export const MenuDivider = () => <div className="h-px bg-[#d7d7d7] dark:bg-[#404040] my-1 mx-1 transition-colors"></div>;
