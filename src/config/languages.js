// Languages offered by the manager chrome. Arabic (AR) is permanently removed.
export const LANGUAGE_OPTIONS = Object.freeze([
  { code: 'en', label: 'English (EN)' },
  { code: 'zh', label: 'Chinese (ZH)' },
  { code: 'fr', label: 'French (FR)' },
  { code: 'de', label: 'German (DE)' },
  { code: 'hi', label: 'Hindi (HI)' },
  { code: 'ja', label: 'Japanese (JA)' },
  { code: 'ru', label: 'Russian (RU)' },
  { code: 'es', label: 'Spanish (ES)' },
  { code: 'tr', label: 'Turkish (TR)' },
]);

export const LANGUAGE_CODE_BY_LABEL = Object.freeze(
  LANGUAGE_OPTIONS.reduce((accumulator, option) => {
    accumulator[option.label] = option.code;
    return accumulator;
  }, {}),
);
