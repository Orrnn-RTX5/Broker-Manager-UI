import { Home, Users, Briefcase, Activity, Settings, Menu, Bell, Search } from 'lucide-react';

const Sidebar = () => {
  return (
    <div className="w-64 bg-white dark:bg-[#1e1e1e] border-r border-gray-200 dark:border-[#333333] text-gray-800 dark:text-gray-200 h-full flex flex-col transition-all duration-300">
      <div className="h-12 flex items-center justify-center border-b border-gray-200 dark:border-[#333333] transition-colors">
        <h1 className="text-xl font-bold tracking-wider text-purple-600 dark:text-purple-400">MT5 MANAGER</h1>
      </div>

      <nav className="flex-1 overflow-y-auto py-4">
        <ul className="space-y-1 px-3">
          <li>
            <a href="#" className="flex items-center gap-3 px-3 py-2 rounded-md bg-purple-100 dark:bg-purple-600/20 text-purple-600 dark:text-purple-400 hover:bg-purple-200 dark:hover:bg-purple-600/30 transition-colors">
              <Home size={20} />
              <span className="font-medium">Dashboard</span>
            </a>
          </li>
          <li>
            <a href="#" className="flex items-center gap-3 px-3 py-2 rounded-md text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
              <Users size={20} />
              <span className="font-medium">Clients Structure</span>
            </a>
          </li>
          <li>
            <a href="#" className="flex items-center gap-3 px-3 py-2 rounded-md text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
              <Briefcase size={20} />
              <span className="font-medium">Positions</span>
            </a>
          </li>
          <li>
            <a href="#" className="flex items-center gap-3 px-3 py-2 rounded-md text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
              <Activity size={20} />
              <span className="font-medium">Orders</span>
            </a>
          </li>
          <li>
            <a href="#" className="flex items-center gap-3 px-3 py-2 rounded-md text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
              <Settings size={20} />
              <span className="font-medium">Configuration</span>
            </a>
          </li>
        </ul>
      </nav>

      <div className="p-4 border-t border-gray-200 dark:border-[#333333] transition-colors">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-purple-500 to-pink-500"></div>
          <div>
            <p className="text-sm font-medium">Admin User</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">Main Server</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Sidebar;
