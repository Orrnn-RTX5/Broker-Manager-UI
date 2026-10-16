import { create } from 'zustand';
import { persist } from 'zustand/middleware';

const getSavedTheme = () => {
  if (typeof window === 'undefined') return true;

  try {
    return JSON.parse(window.localStorage.getItem('theme-storage'))?.state?.isDarkMode !== false;
  } catch {
    return true;
  }
};

const useThemeStore = create(
  persist(
    (set) => ({
      // Read localStorage synchronously so React's first render matches the
      // preference that the boot script applies before the page paints.
      isDarkMode: getSavedTheme(),
      toggleTheme: () => set((state) => ({ isDarkMode: !state.isDarkMode })),
      setTheme: (isDark) => set({ isDarkMode: isDark }),
    }),
    {
      name: 'theme-storage', // Save choice in localStorage
    }
  )
);

export default useThemeStore;
