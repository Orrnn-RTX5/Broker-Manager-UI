import { create } from 'zustand';
import { persist } from 'zustand/middleware';

const getSavedTheme = () => {
  if (typeof window === 'undefined') return false;

  try {
    return JSON.parse(window.localStorage.getItem('theme-storage'))?.state?.isDarkMode === true;
  } catch {
    return false;
  }
};

const useThemeStore = create(
  persist(
    (set) => ({
      // Read localStorage synchronously so React's first render matches the
      // preference that the inline boot script applies before the page paints.
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
