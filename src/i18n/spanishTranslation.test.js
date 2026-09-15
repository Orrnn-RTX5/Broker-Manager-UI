import test from 'node:test';
import assert from 'node:assert/strict';
import { UI_DICTIONARIES } from './uiDictionary/index.js';
import { LOCALES } from './locales/index.js';
import { lookupTranslation } from './translatorEngine.js';
import { applyText, applyAttributes } from './domTranslation.js';

test('Spanish covers audited phrases and preserves interpolation variables', () => {
  for (const key of Object.keys(UI_DICTIONARIES.ru)) {
    assert.ok(UI_DICTIONARIES.es[key] || lookupTranslation(UI_DICTIONARIES.es, key), key);
  }
  for (const [key, value] of Object.entries(LOCALES.en)) {
    assert.equal(typeof LOCALES.es[key], 'string', key);
    assert.deepEqual(LOCALES.es[key].match(/\{\w+\}/g), value.match(/\{\w+\}/g), key);
    assert.notEqual(LOCALES.es[key], value, key);
  }
});

test('Spanish translates full templates without changing account data or amounts', () => {
  for (const [source, expected] of [
    ['Regional Activity', 'Actividad regional'],
    ['Page 2 of 8', 'Página 2 de 8'],
    ['Showing 1-5 of 20 clients', 'Mostrando 1-5 de 20 clientes'],
    ['Account: 200001, TEST TEST, USD, 1:500', 'Cuenta: 200001, TEST TEST, USD, 1:500'],
    ['Used margin: 967.58', 'Margen utilizado: 967.58'],
    ['Deposit 1,250.50 USD into account #200001?', '¿Depositar 1,250.50 USD en la cuenta n.º 200001?'],
    ['Place a BUY market order for 0.10 lots of EURUSD on account #200001?', '¿Colocar una orden de compra a mercado de 0.10 lotes de EURUSD en la cuenta n.º 200001?'],
    ["Are you sure you want to delete group 'demo/STD'?", "¿Seguro que desea eliminar el grupo 'demo/STD'?"],
    ['Open details for client 200001', 'Abrir detalles del cliente 200001'],
    ['1 pending', '1 pendiente'], ['5 pending', '5 pendientes'],
    ['1 Accounts', '1 cuenta'], ['2 Accounts', '2 cuentas'], ['1 Active sessions', '1 sesión activa'],
  ]) assert.equal(lookupTranslation(UI_DICTIONARIES.es, source), expected, source);
});

test('Spanish preserves identifiers and restores English text and attributes', () => {
  for (const value of ['client-9000@example.com', 'real-account_20001', 'EURUSD', 'BTCUSD', '9000', '1,250.50', '12 sept, 19:05:28']) {
    const node = { data: value };
    applyText(node, UI_DICTIONARIES.es, 'es');
    assert.equal(node.data, value);
  }
  const node = { data: 'Show password' };
  applyText(node, UI_DICTIONARIES.es, 'es');
  assert.equal(node.data, 'Mostrar contraseña');
  node.data = 'Hide password';
  applyText(node, UI_DICTIONARIES.es, 'es');
  assert.equal(node.data, 'Ocultar contraseña');
  applyText(node, UI_DICTIONARIES.en, 'en');
  assert.equal(node.data, 'Hide password');
  const attributes = { placeholder: 'Search symbols...', title: 'Show password' };
  const element = { getAttribute: key => attributes[key] ?? null, setAttribute: (key,value) => { attributes[key] = value; } };
  applyAttributes(element, UI_DICTIONARIES.es, 'es');
  assert.equal(attributes.placeholder, 'Buscar instrumentos...');
  applyAttributes(element, UI_DICTIONARIES.en, 'en');
  assert.equal(attributes.placeholder, 'Search symbols...');
  assert.equal(attributes.title, 'Show password');
});

test('First visit defaults to English; saved Spanish persists until every reset event clears it', async () => {
  const oldWindow = globalThis.window;
  const oldDocument = globalThis.document;
  const local = new Map();
  const session = new Map();
  const storage = (map) => ({ getItem: (key) => map.get(key) ?? null, setItem: (key, value) => map.set(key, value), removeItem: (key) => map.delete(key) });
  const events = new Map();
  globalThis.window = { localStorage: storage(local), sessionStorage: storage(session), addEventListener: (name, fn) => events.set(name, fn) };
  globalThis.document = { documentElement: {} };
  try {
    const fresh = await import('./index.js?spanish-test=fresh');
    assert.equal(fresh.DEFAULT_LANGUAGE, 'en');
    assert.equal(fresh.useI18nStore.getState().language, 'en');
    assert.equal(document.documentElement.lang, 'en');
    fresh.useI18nStore.getState().setLanguage('es');
    const returning = await import('./index.js?spanish-test=returning');
    assert.equal(returning.useI18nStore.getState().language, 'es');
    for (const event of ['manager:reset', 'manager:reset-layout']) {
      returning.useI18nStore.getState().setLanguage('es');
      session.set('manager_language', 'es');
      events.get(event)();
      assert.equal(returning.useI18nStore.getState().language, 'en');
      assert.equal(document.documentElement.lang, 'en');
      assert.equal(local.has('manager_language'), false);
      assert.equal(session.has('manager_language'), false);
    }
    const reopened = await import('./index.js?spanish-test=after-reset');
    assert.equal(reopened.useI18nStore.getState().language, 'en');
  } finally {
    if (oldWindow === undefined) delete globalThis.window; else globalThis.window = oldWindow;
    if (oldDocument === undefined) delete globalThis.document; else globalThis.document = oldDocument;
  }
});
