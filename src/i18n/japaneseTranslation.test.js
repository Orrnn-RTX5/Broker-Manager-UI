import test from 'node:test';
import assert from 'node:assert/strict';
import { UI_DICTIONARIES } from './uiDictionary/index.js';
import { LOCALES } from './locales/index.js';
import { lookupTranslation } from './translatorEngine.js';
import { applyText, applyAttributes } from './domTranslation.js';

test('Japanese covers audited phrases and retains interpolation variables', () => {
  for (const key of Object.keys(UI_DICTIONARIES.de)) {
    assert.ok(UI_DICTIONARIES.ja[key] || lookupTranslation(UI_DICTIONARIES.ja, key), key);
  }
  for (const [key, value] of Object.entries(LOCALES.en)) {
    assert.equal(typeof LOCALES.ja[key], 'string', key);
    assert.deepEqual(LOCALES.ja[key].match(/\{\w+\}/g), value.match(/\{\w+\}/g), key);
    assert.notEqual(LOCALES.ja[key], value, key);
  }
});

test('Japanese sentences retain account identifiers, amounts and trading symbols', () => {
  for (const [source, expected] of [
    ['Page 2 of 8', '2 / 8 ページ'],
    ['Showing 1-5 of 20 clients', 'クライアント: 全20件中 1-5件を表示'],
    ['Sort by Login', 'ログインで並べ替え'],
    ['Account: 200001, TEST TEST, USD, 1:500', '口座: 200001, TEST TEST, USD, 1:500'],
    ['Deposit 1,250.50 USD into account #200001?', '口座 #200001 に 1,250.50 USD を入金しますか？'],
    ['Place a BUY market order for 0.10 lots of EURUSD on account #200001?', '口座 #200001 で EURUSD を 0.10 ロット、買いの成行注文を出しますか？'],
    ["Are you sure you want to delete group 'demo/STD'?", "グループ 'demo/STD' を削除しますか？"],
    ['Open details for client 200001', '顧客詳細を開く: 200001'],
  ]) assert.equal(lookupTranslation(UI_DICTIONARIES.ja, source), expected, source);
});

test('Japanese preserves identifiers and restores English text and attributes', () => {
  for (const value of ['client-9000@example.com', 'real-account_20001', 'EURUSD', 'BTCUSD', '9000', '1,250.50']) {
    const node = { data: value };
    applyText(node, UI_DICTIONARIES.ja, 'ja');
    assert.equal(node.data, value);
  }
  const node = { data: 'Show password' };
  applyText(node, UI_DICTIONARIES.ja, 'ja');
  assert.equal(node.data, 'パスワードを表示');
  node.data = 'Hide password';
  applyText(node, UI_DICTIONARIES.ja, 'ja');
  assert.equal(node.data, 'パスワードを非表示');
  applyText(node, UI_DICTIONARIES.en, 'en');
  assert.equal(node.data, 'Hide password');
  const attributes = { placeholder: 'Search symbols...', title: 'Show password' };
  const element = { getAttribute: key => attributes[key] ?? null, setAttribute: (key,value) => { attributes[key] = value; } };
  applyAttributes(element, UI_DICTIONARIES.ja, 'ja');
  assert.equal(attributes.placeholder, '銘柄を検索...');
  applyAttributes(element, UI_DICTIONARIES.en, 'en');
  assert.equal(attributes.placeholder, 'Search symbols...');
  assert.equal(attributes.title, 'Show password');
});

test('First visit defaults to English; saved Japanese persists until every reset event clears it', async () => {
  const oldWindow = globalThis.window;
  const oldDocument = globalThis.document;
  const local = new Map();
  const session = new Map();
  const storage = (map) => ({ getItem: (key) => map.get(key) ?? null, setItem: (key, value) => map.set(key, value), removeItem: (key) => map.delete(key) });
  const events = new Map();
  globalThis.window = { localStorage: storage(local), sessionStorage: storage(session), addEventListener: (name, fn) => events.set(name, fn) };
  globalThis.document = { documentElement: {} };
  try {
    const fresh = await import('./index.js?japanese-test=fresh');
    assert.equal(fresh.DEFAULT_LANGUAGE, 'en');
    assert.equal(fresh.useI18nStore.getState().language, 'en');
    assert.equal(document.documentElement.lang, 'en');
    fresh.useI18nStore.getState().setLanguage('ja');
    const returning = await import('./index.js?japanese-test=returning');
    assert.equal(returning.useI18nStore.getState().language, 'ja');
    for (const event of ['manager:reset', 'manager:reset-layout']) {
      returning.useI18nStore.getState().setLanguage('ja');
      session.set('manager_language', 'ja');
      events.get(event)();
      assert.equal(returning.useI18nStore.getState().language, 'en');
      assert.equal(document.documentElement.lang, 'en');
      assert.equal(local.has('manager_language'), false);
      assert.equal(session.has('manager_language'), false);
    }
    const reopened = await import('./index.js?japanese-test=after-reset');
    assert.equal(reopened.useI18nStore.getState().language, 'en');
  } finally {
    if (oldWindow === undefined) delete globalThis.window; else globalThis.window = oldWindow;
    if (oldDocument === undefined) delete globalThis.document; else globalThis.document = oldDocument;
  }
});
