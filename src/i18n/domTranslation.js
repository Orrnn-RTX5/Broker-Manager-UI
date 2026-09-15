import { UI_DICTIONARIES } from './uiDictionary/index.js';
import { lookupTranslation } from './translatorEngine.js';

export const TRANSLATED_ATTRIBUTES = ['placeholder', 'title', 'aria-label'];
export const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'CODE']);

export const textOriginals = new WeakMap();
export const attributeOriginals = new WeakMap();

let isApplying = false;

export const isApplyingTranslation = () => isApplying;

export const applyText = (node, dictionary, language) => {
  if (!node || typeof node.data !== 'string') return;
  let record = textOriginals.get(node);
  if (!record) {
    record = { original: node.data, translated: null };
    textOriginals.set(node, record);
  } else if (node.data !== record.translated) {
    // node.data was mutated outside the translator (e.g. by React)
    record.original = node.data;
    record.translated = null;
  }

  if (language === 'en') {
    if (dictionary) {
      const hit = lookupTranslation(dictionary, record.original);
      if (hit && hit !== record.original) {
        const leading = record.original.match(/^\s*/)?.[0] || '';
        const trailing = record.original.match(/\s*$/)?.[0] || '';
        const next = `${leading}${hit}${trailing}`;
        record.translated = next;
        if (node.data !== next) {
          node.data = next;
        }
        return;
      }
    }
    if (record.translated !== null && node.data === record.translated) {
      node.data = record.original;
    }
    record.translated = null;
    return;
  }

  const hit = lookupTranslation(dictionary, record.original);
  const leading = record.original.match(/^\s*/)?.[0] || '';
  const trailing = record.original.match(/\s*$/)?.[0] || '';
  const next = hit ? `${leading}${hit}${trailing}` : record.original;

  record.translated = next;
  if (node.data !== next) {
    node.data = next;
  }
};

export const applyAttributes = (element, dictionary, language) => {
  if (!element || typeof element.getAttribute !== 'function') return;
  let store = attributeOriginals.get(element);
  if (!store) {
    store = {};
    attributeOriginals.set(element, store);
  }
  for (const attr of TRANSLATED_ATTRIBUTES) {
    const current = element.getAttribute(attr);
    if (current === null || current === undefined) {
      delete store[attr];
      continue;
    }
    let record = store[attr];
    if (!record) {
      record = { original: current, translated: null };
      store[attr] = record;
    } else if (current !== record.translated) {
      // Attribute was updated outside the translator (e.g. by React)
      record.original = current;
      record.translated = null;
    }

    if (language === 'en') {
      if (dictionary) {
        const hit = lookupTranslation(dictionary, record.original);
        if (hit && hit !== record.original) {
          record.translated = hit;
          if (current !== hit) {
            element.setAttribute(attr, hit);
          }
          continue;
        }
      }
      if (record.translated !== null && current === record.translated) {
        element.setAttribute(attr, record.original);
      }
      record.translated = null;
      continue;
    }

    const hit = lookupTranslation(dictionary, record.original);
    const next = hit || record.original;
    record.translated = next;
    if (current !== next) {
      element.setAttribute(attr, next);
    }
  }
};

export const runPass = (language, root = typeof document !== 'undefined' ? document.body : null) => {
  if (!root) return;
  const dictionary = UI_DICTIONARIES[language];
  if (!dictionary) return;

  isApplying = true;
  try {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: (node) => {
        const parent = node.parentElement;
        if (!parent || SKIP_TAGS.has(parent.tagName)) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      },
    });
    const textNodes = [];
    while (walker.nextNode()) textNodes.push(walker.currentNode);
    for (const node of textNodes) applyText(node, dictionary, language);

    const selector = TRANSLATED_ATTRIBUTES.map((attr) => `[${attr}]`).join(', ');
    const attributed = root.querySelectorAll(selector);
    for (const element of attributed) applyAttributes(element, dictionary, language);
  } finally {
    isApplying = false;
  }
};
