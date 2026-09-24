import { useEffect } from 'react';
import { useI18nStore } from './index.js';
import { runPass, runPassForMutations, isApplyingTranslation, TRANSLATED_ATTRIBUTES } from './domTranslation.js';

export default function UiTranslator() {
  const language = useI18nStore((state) => state.language);

  useEffect(() => {
    let timer = null;
    // Only the nodes named by mutation records are re-translated; live data
    // changes many times a second and a full-document pass per batch is costly.
    let pending = [];
    const schedule = (records) => {
      if (isApplyingTranslation()) return;
      pending.push(...records);
      if (timer !== null) return;
      timer = window.setTimeout(() => {
        timer = null;
        const batch = pending;
        pending = [];
        runPassForMutations(language, batch);
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
