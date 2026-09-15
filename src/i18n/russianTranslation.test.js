import test from 'node:test';
import assert from 'node:assert/strict';
import { UI_DICTIONARIES } from './uiDictionary/index.js';
import { LOCALES } from './locales/index.js';
import { lookupTranslation } from './translatorEngine.js';
import { applyText, applyAttributes } from './domTranslation.js';

test('Russian covers audited phrases and preserves interpolation variables', () => {
  for (const key of Object.keys(UI_DICTIONARIES.ja)) {
    assert.ok(UI_DICTIONARIES.ru[key] || lookupTranslation(UI_DICTIONARIES.ru, key), key);
  }
  for (const [key, value] of Object.entries(LOCALES.en)) {
    assert.equal(typeof LOCALES.ru[key], 'string', key);
    assert.deepEqual(LOCALES.ru[key].match(/\{\w+\}/g), value.match(/\{\w+\}/g), key);
    assert.notEqual(LOCALES.ru[key], value, key);
  }
});

test('Russian translates full templates without changing account data or amounts', () => {
  for (const [source, expected] of [
    ['Regional Activity', 'Активность по регионам'],
    ['Page 2 of 8', 'Страница 2 из 8'],
    ['Showing 1-5 of 20 clients', 'Клиенты: показано 1-5 из 20'],
    ['Account: 200001, TEST TEST, USD, 1:500', 'Счёт: 200001, TEST TEST, USD, 1:500'],
    ['Used margin: 967.58', 'Использованная маржа: 967.58'],
    ['Deposit 1,250.50 USD into account #200001?', 'Зачислить 1,250.50 USD на счёт №200001?'],
    ['Place a BUY market order for 0.10 lots of EURUSD on account #200001?', 'Разместить рыночный ордер на покупку 0.10 лота EURUSD на счёте №200001?'],
    ["Are you sure you want to delete group 'demo/STD'?", "Вы действительно хотите удалить группу 'demo/STD'?"],
    ['Open details for client 200001', 'Открыть сведения о клиенте 200001'],
  ]) assert.equal(lookupTranslation(UI_DICTIONARIES.ru, source), expected, source);
});

test('Russian preserves identifiers and restores English text and attributes', () => {
  for (const value of ['client-9000@example.com', 'real-account_20001', 'EURUSD', 'BTCUSD', '9000', '1,250.50']) {
    const node = { data: value };
    applyText(node, UI_DICTIONARIES.ru, 'ru');
    assert.equal(node.data, value);
  }
  const node = { data: 'Show password' };
  applyText(node, UI_DICTIONARIES.ru, 'ru');
  assert.equal(node.data, 'Показать пароль');
  node.data = 'Hide password';
  applyText(node, UI_DICTIONARIES.ru, 'ru');
  assert.equal(node.data, 'Скрыть пароль');
  applyText(node, UI_DICTIONARIES.en, 'en');
  assert.equal(node.data, 'Hide password');
  const attributes = { placeholder: 'Search symbols...', title: 'Show password' };
  const element = { getAttribute: key => attributes[key] ?? null, setAttribute: (key,value) => { attributes[key] = value; } };
  applyAttributes(element, UI_DICTIONARIES.ru, 'ru');
  assert.equal(attributes.placeholder, 'Поиск инструментов...');
  applyAttributes(element, UI_DICTIONARIES.en, 'en');
  assert.equal(attributes.placeholder, 'Search symbols...');
  assert.equal(attributes.title, 'Show password');
});

test('First visit defaults to English; saved Russian persists until every reset event clears it', async () => {
  const oldWindow = globalThis.window;
  const oldDocument = globalThis.document;
  const local = new Map();
  const session = new Map();
  const storage = (map) => ({ getItem: (key) => map.get(key) ?? null, setItem: (key, value) => map.set(key, value), removeItem: (key) => map.delete(key) });
  const events = new Map();
  globalThis.window = { localStorage: storage(local), sessionStorage: storage(session), addEventListener: (name, fn) => events.set(name, fn) };
  globalThis.document = { documentElement: {} };
  try {
    const fresh = await import('./index.js?russian-test=fresh');
    assert.equal(fresh.DEFAULT_LANGUAGE, 'en');
    assert.equal(fresh.useI18nStore.getState().language, 'en');
    assert.equal(document.documentElement.lang, 'en');
    fresh.useI18nStore.getState().setLanguage('ru');
    const returning = await import('./index.js?russian-test=returning');
    assert.equal(returning.useI18nStore.getState().language, 'ru');
    for (const event of ['manager:reset', 'manager:reset-layout']) {
      returning.useI18nStore.getState().setLanguage('ru');
      session.set('manager_language', 'ru');
      events.get(event)();
      assert.equal(returning.useI18nStore.getState().language, 'en');
      assert.equal(document.documentElement.lang, 'en');
      assert.equal(local.has('manager_language'), false);
      assert.equal(session.has('manager_language'), false);
    }
    const reopened = await import('./index.js?russian-test=after-reset');
    assert.equal(reopened.useI18nStore.getState().language, 'en');
  } finally {
    if (oldWindow === undefined) delete globalThis.window; else globalThis.window = oldWindow;
    if (oldDocument === undefined) delete globalThis.document; else globalThis.document = oldDocument;
  }
});
