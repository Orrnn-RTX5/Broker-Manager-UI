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

const ATTRIBUTE_SELECTOR = TRANSLATED_ATTRIBUTES.map((attr) => `[${attr}]`).join(', ');

// Translates every text node and translatable attribute under root.
const translateSubtree = (root, dictionary, language) => {
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

  if (root.matches?.(ATTRIBUTE_SELECTOR)) applyAttributes(root, dictionary, language);
  for (const element of root.querySelectorAll(ATTRIBUTE_SELECTOR)) applyAttributes(element, dictionary, language);
};

export const runPass = (language, root = typeof document !== 'undefined' ? document.body : null) => {
  if (!root) return;
  const dictionary = UI_DICTIONARIES[language];
  if (!dictionary) return;

  isApplying = true;
  try {
    translateSubtree(root, dictionary, language);
  } finally {
    isApplying = false;
  }
};

/**
 * Translates only what changed: the text nodes, elements and added subtrees
 * named by MutationObserver records. Live data (price ticks, grids) mutates
 * constantly, and rescanning the whole document for each change kept the
 * main thread busy.
 */
export const runPassForMutations = (language, records) => {
  const dictionary = UI_DICTIONARIES[language];
  if (!dictionary || !records?.length) return;
  const roots = new Set();
  const attributeTargets = new Set();
  for (const record of records) {
    if (record.type === 'characterData') roots.add(record.target);
    else if (record.type === 'attributes') attributeTargets.add(record.target);
    else for (const node of record.addedNodes) roots.add(node);
  }

  isApplying = true;
  try {
    for (const node of roots) {
      if (!node.isConnected) continue;
      if (node.nodeType === Node.TEXT_NODE) {
        if (!SKIP_TAGS.has(node.parentElement?.tagName)) applyText(node, dictionary, language);
      } else if (node.nodeType === Node.ELEMENT_NODE && !SKIP_TAGS.has(node.tagName)) {
        translateSubtree(node, dictionary, language);
      }
    }
    for (const element of attributeTargets) {
      if (element.isConnected) applyAttributes(element, dictionary, language);
    }
  } finally {
    isApplying = false;
  }
};
