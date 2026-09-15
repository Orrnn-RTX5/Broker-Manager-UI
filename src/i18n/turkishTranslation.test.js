import test from 'node:test';
import assert from 'node:assert/strict';
import { UI_DICTIONARIES } from './uiDictionary/index.js';
import { LOCALES } from './locales/index.js';
import { lookupTranslation } from './translatorEngine.js';
import { applyText, applyAttributes } from './domTranslation.js';

test('Turkish covers audited phrases and preserves interpolation variables', () => {
  for (const key of Object.keys(UI_DICTIONARIES.es)) {
    assert.ok(UI_DICTIONARIES.tr[key] || lookupTranslation(UI_DICTIONARIES.tr, key), key);
  }
  for (const [key, value] of Object.entries(LOCALES.en)) {
    assert.equal(typeof LOCALES.tr[key], 'string', key);
    assert.deepEqual(LOCALES.tr[key].match(/\{\w+\}/g), value.match(/\{\w+\}/g), key);
    assert.notEqual(LOCALES.tr[key], value, key);
  }
});

test('Turkish translates full templates without changing account data or amounts', () => {
  for (const [source, expected] of [
    ['Regional Activity', 'Bölgesel faaliyet'], ['USER ID', 'Kullanıcı kimliği'],
    ['Page 2 of 8', 'Sayfa 2 / 8'],
    ['Showing 1-5 of 20 clients', 'Müşteriler: 1-5 gösteriliyor; toplam 20'],
    ['Account: 200001, TEST TEST, USD, 1:500', 'Hesap: 200001, TEST TEST, USD, 1:500'],
    ['Used margin: 967.58', 'Kullanılan teminat: 967.58'],
    ['Deposit 1,250.50 USD into account #200001?', '#200001 numaralı hesaba 1,250.50 USD yatırılsın mı?'],
    ['Place a BUY market order for 0.10 lots of EURUSD on account #200001?', '#200001 numaralı hesapta 0.10 lot EURUSD için piyasadan alış emri verilsin mi?'],
    ["Are you sure you want to delete group 'demo/STD'?", "'demo/STD' grubunu silmek istediğinizden emin misiniz?"],
    ['Open details for client 200001', 'Müşteri ayrıntılarını aç: 200001'],
    ['1 Accounts', '1 hesap'], ['2 Accounts', '2 hesap'], ['1 Active sessions', '1 aktif oturum'],
  ]) assert.equal(lookupTranslation(UI_DICTIONARIES.tr, source), expected, source);
});

test('Turkish preserves identifiers and dates and restores English text and attributes', () => {
  for (const value of ['client-9000@example.com', 'real-account_20001', 'EURUSD', 'BTCUSD', '9000', '1,250.50', '12 Eyl 19:05:28']) {
    const node = { data: value };
    applyText(node, UI_DICTIONARIES.tr, 'tr');
    assert.equal(node.data, value);
  }
  const node = { data: 'Show password' };
  applyText(node, UI_DICTIONARIES.tr, 'tr');
  assert.equal(node.data, 'Parolayı göster');
  node.data = 'Hide password';
  applyText(node, UI_DICTIONARIES.tr, 'tr');
  assert.equal(node.data, 'Parolayı gizle');
  applyText(node, UI_DICTIONARIES.en, 'en');
  assert.equal(node.data, 'Hide password');
  const attributes = { placeholder: 'Search symbols...', title: 'Show password' };
  const element = { getAttribute: key => attributes[key] ?? null, setAttribute: (key,value) => { attributes[key] = value; } };
  applyAttributes(element, UI_DICTIONARIES.tr, 'tr');
  assert.equal(attributes.placeholder, 'Enstrüman ara...');
  applyAttributes(element, UI_DICTIONARIES.en, 'en');
  assert.equal(attributes.placeholder, 'Search symbols...');
  assert.equal(attributes.title, 'Show password');
});

test('First visit defaults to English; saved Turkish persists until every reset event clears it', async () => {
  const oldWindow = globalThis.window;
  const oldDocument = globalThis.document;
  const local = new Map();
  const session = new Map();
  const storage = (map) => ({ getItem: (key) => map.get(key) ?? null, setItem: (key, value) => map.set(key, value), removeItem: (key) => map.delete(key) });
  const events = new Map();
  globalThis.window = { localStorage: storage(local), sessionStorage: storage(session), addEventListener: (name, fn) => events.set(name, fn) };
  globalThis.document = { documentElement: {} };
  try {
    const fresh = await import('./index.js?turkish-test=fresh');
    assert.equal(fresh.DEFAULT_LANGUAGE, 'en');
    assert.equal(fresh.useI18nStore.getState().language, 'en');
    assert.equal(document.documentElement.lang, 'en');
    fresh.useI18nStore.getState().setLanguage('tr');
    const returning = await import('./index.js?turkish-test=returning');
    assert.equal(returning.useI18nStore.getState().language, 'tr');
    for (const event of ['manager:reset', 'manager:reset-layout']) {
      returning.useI18nStore.getState().setLanguage('tr');
      session.set('manager_language', 'tr');
      events.get(event)();
      assert.equal(returning.useI18nStore.getState().language, 'en');
      assert.equal(document.documentElement.lang, 'en');
      assert.equal(local.has('manager_language'), false);
      assert.equal(session.has('manager_language'), false);
    }
    const reopened = await import('./index.js?turkish-test=after-reset');
    assert.equal(reopened.useI18nStore.getState().language, 'en');
  } finally {
    if (oldWindow === undefined) delete globalThis.window; else globalThis.window = oldWindow;
    if (oldDocument === undefined) delete globalThis.document; else globalThis.document = oldDocument;
  }
});
