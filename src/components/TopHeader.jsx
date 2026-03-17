import { Menu, Bell, Search, Settings } from 'lucide-react';

const TopHeader = () => {
  return (
    <header className="h-16 bg-white dark:bg-[#1e1e1e] border-b border-gray-200 dark:border-[#333333] flex items-center justify-between px-6 z-10 sticky top-0 transition-colors">
      <div className="flex items-center gap-4">
        <button className="p-2 rounded-md text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-[#2d2d30] transition-colors">
          <Menu size={20} />
        </button>

        <div className="relative group hidden sm:block">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Search size={16} className="text-gray-400" />
          </div>
          <input
            type="text"
            placeholder="Search thousands of features... (Ctrl+K)"
            className="pl-10 pr-4 py-2 w-96 bg-white dark:bg-[#252526] border border-gray-200 dark:border-[#404040] rounded-lg text-sm text-black dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all"
          />
          <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
            <span className="text-xs text-gray-400 bg-gray-100 dark:bg-[#333333] px-1.5 py-0.5 rounded border border-gray-200 dark:border-[#404040] font-medium leading-tight">Ctrl K</span>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button className="p-2 relative rounded-md text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-[#2d2d30] transition-colors">
          <Bell size={20} />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full border-2 border-white dark:border-[#1e1e1e]"></span>
        </button>
        <button className="p-2 rounded-md text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-[#2d2d30] transition-colors">
          <Settings size={20} />
        </button>
      </div>
    </header>
  );
};

export default TopHeader;
