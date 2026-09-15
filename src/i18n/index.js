import { create } from 'zustand';
import { LOCALES } from './locales/index.js';

export const DEFAULT_LANGUAGE = 'en';
const STORAGE_KEY = 'manager_language';

const getInitialLanguage = () => {
  if (typeof window === 'undefined') return DEFAULT_LANGUAGE;
  try {
    const stored = window.localStorage?.getItem(STORAGE_KEY);
    if (stored && LOCALES[stored]) return stored;
  } catch {
    // ignore
  }
  return DEFAULT_LANGUAGE;
};

const initialLanguage = getInitialLanguage();

const applyDocumentLocale = (language) => {
  if (typeof document !== 'undefined') {
    document.documentElement.lang = language;
    document.documentElement.dir = 'ltr';
  }
};

applyDocumentLocale(initialLanguage);

export const useI18nStore = create((set) => ({
  language: initialLanguage,
  setLanguage: (language) => {
    const next = LOCALES[language] ? language : DEFAULT_LANGUAGE;
    applyDocumentLocale(next);
    if (typeof window !== 'undefined') {
      try {
        window.localStorage?.setItem(STORAGE_KEY, next);
      } catch {
        // ignore
      }
    }
    set({ language: next });
  },
  resetLanguage: () => {
    applyDocumentLocale(DEFAULT_LANGUAGE);
    if (typeof window !== 'undefined') {
      try {
        window.localStorage?.removeItem(STORAGE_KEY);
        window.sessionStorage?.removeItem(STORAGE_KEY);
      } catch {
        // ignore
      }
    }
    set({ language: DEFAULT_LANGUAGE });
  },
}));

if (typeof window !== 'undefined') {
  const handleReset = () => {
    useI18nStore.getState().resetLanguage();
  };
  window.addEventListener('manager:reset-layout', handleReset);
  window.addEventListener('manager:reset', handleReset);
}

const interpolate = (value, params) => (params
  ? value.replace(/\{(\w+)\}/g, (match, key) => (key in params ? String(params[key]) : match))
  : value);

export const useT = () => {
  const language = useI18nStore((state) => state.language);
  return (key, params) => {
    const value = LOCALES[language]?.[key] ?? LOCALES.en[key] ?? key;
    return interpolate(value, params);
  };
};
