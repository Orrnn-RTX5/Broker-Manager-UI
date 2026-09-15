import test from 'node:test';
import assert from 'node:assert/strict';
import { UI_DICTIONARIES } from './uiDictionary/index.js';
import { LOCALES } from './locales/index.js';
import { lookupTranslation } from './translatorEngine.js';
import { applyText, applyAttributes } from './domTranslation.js';

test('Hindi covers the audited interface phrases and preserves interpolation variables', () => {
  for (const key of Object.keys(UI_DICTIONARIES.de)) {
    assert.ok(UI_DICTIONARIES.hi[key] || lookupTranslation(UI_DICTIONARIES.hi, key), key);
  }
  for (const [key, value] of Object.entries(LOCALES.en)) {
    assert.equal(typeof LOCALES.hi[key], 'string', key);
    assert.deepEqual(LOCALES.hi[key].match(/\{\w+\}/g), value.match(/\{\w+\}/g), key);
    assert.notEqual(LOCALES.hi[key], value, `${key} must not fall back to English`);
  }
});

test('Hindi translates full phrases and dynamic labels without changing their values', () => {
  for (const [source, expected] of [
    ['Regional Activity', 'क्षेत्रीय गतिविधि'],
    ['Account share · Volume share', 'खातों का हिस्सा · वॉल्यूम का हिस्सा'],
    ['Page 2 of 8', 'कुल 8 में से पृष्ठ 2'],
    ['Showing 1-5 of 20 clients', '20 में से 1-5 ग्राहक दिखाए जा रहे हैं'],
    ['Account: 200001, TEST TEST, USD, 1:500', 'खाता: 200001, TEST TEST, USD, 1:500'],
    ['Used margin: 967.58', 'उपयोग किया गया मार्जिन: 967.58'],
    ['Loading online users…', 'ऑनलाइन उपयोगकर्ता लोड हो रहे हैं…'],
    ['No clients match the current filters.', 'वर्तमान फ़िल्टर से कोई ग्राहक मेल नहीं खाता।'],
    ['Deposit 1,250.50 USD into account #200001?', 'खाता #200001 में 1,250.50 USD जमा करें?'],
    ['Place a BUY market order for 0.10 lots of EURUSD on account #200001?', 'खाता #200001 पर EURUSD के 0.10 लॉट का खरीद बाज़ार ऑर्डर दें?'],
    ["Are you sure you want to delete group 'demo/STD'?", "क्या आप समूह 'demo/STD' हटाना चाहते हैं?"],
    ['Open details for client 200001', 'ग्राहक विवरण खोलें: 200001'],
  ]) assert.equal(lookupTranslation(UI_DICTIONARIES.hi, source), expected, source);
});

test('Hindi preserves identifiers and restores English text and attributes', () => {
  for (const value of ['client-9000@example.com', 'real-account_20001', 'EURUSD', 'BTCUSD', '9000', '1,250.50']) {
    const node = { data: value };
    applyText(node, UI_DICTIONARIES.hi, 'hi');
    assert.equal(node.data, value);
  }
  const node = { data: 'Show password' };
  applyText(node, UI_DICTIONARIES.hi, 'hi');
  assert.equal(node.data, 'पासवर्ड दिखाएँ');
  node.data = 'Hide password';
  applyText(node, UI_DICTIONARIES.hi, 'hi');
  assert.equal(node.data, 'पासवर्ड छिपाएँ');
  applyText(node, UI_DICTIONARIES.en, 'en');
  assert.equal(node.data, 'Hide password');
  const attributes = { placeholder: 'Search symbols...', title: 'Show password' };
  const element = { getAttribute: (key) => attributes[key] ?? null, setAttribute: (key, value) => { attributes[key] = value; } };
  applyAttributes(element, UI_DICTIONARIES.hi, 'hi');
  assert.equal(attributes.placeholder, 'सिंबल खोजें...');
  applyAttributes(element, UI_DICTIONARIES.en, 'en');
  assert.equal(attributes.placeholder, 'Search symbols...');
  assert.equal(attributes.title, 'Show password');
});

test('First visit defaults to English; saved Hindi persists until every reset event clears it', async () => {
  const oldWindow = globalThis.window;
  const oldDocument = globalThis.document;
  const local = new Map();
  const session = new Map();
  const storage = (map) => ({ getItem: (key) => map.get(key) ?? null, setItem: (key, value) => map.set(key, value), removeItem: (key) => map.delete(key) });
  const events = new Map();
  globalThis.window = { localStorage: storage(local), sessionStorage: storage(session), addEventListener: (name, fn) => events.set(name, fn) };
  globalThis.document = { documentElement: {} };
  try {
    const fresh = await import('./index.js?hindi-test=fresh');
    assert.equal(fresh.DEFAULT_LANGUAGE, 'en');
    assert.equal(fresh.useI18nStore.getState().language, 'en');
    assert.equal(document.documentElement.lang, 'en');
    fresh.useI18nStore.getState().setLanguage('hi');
    const returning = await import('./index.js?hindi-test=returning');
    assert.equal(returning.useI18nStore.getState().language, 'hi');
    for (const event of ['manager:reset', 'manager:reset-layout']) {
      returning.useI18nStore.getState().setLanguage('hi');
      session.set('manager_language', 'hi');
      events.get(event)();
      assert.equal(returning.useI18nStore.getState().language, 'en');
      assert.equal(document.documentElement.lang, 'en');
      assert.equal(local.has('manager_language'), false);
      assert.equal(session.has('manager_language'), false);
    }
    const reopened = await import('./index.js?hindi-test=after-reset');
    assert.equal(reopened.useI18nStore.getState().language, 'en');
  } finally {
    if (oldWindow === undefined) delete globalThis.window; else globalThis.window = oldWindow;
    if (oldDocument === undefined) delete globalThis.document; else globalThis.document = oldDocument;
  }
});
