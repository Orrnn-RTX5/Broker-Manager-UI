import { useEffect } from 'react';
import { useI18nStore } from './index.js';
import { runPass, isApplyingTranslation, TRANSLATED_ATTRIBUTES } from './domTranslation.js';

export default function UiTranslator() {
  const language = useI18nStore((state) => state.language);

  useEffect(() => {
    let timer = null;
    const schedule = () => {
      if (isApplyingTranslation() || timer !== null) return;
      timer = window.setTimeout(() => {
        timer = null;
        runPass(language);
      }, 50);
    };

    runPass(language);
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: TRANSLATED_ATTRIBUTES,
      characterData: true,
    });
    return () => {
      observer.disconnect();
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [language]);

  return null;
}
