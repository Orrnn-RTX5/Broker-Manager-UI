import test from 'node:test';
import assert from 'node:assert/strict';
import { UI_DICTIONARIES } from './uiDictionary/index.js';
import { LOCALES } from './locales/index.js';
import { lookupTranslation } from './translatorEngine.js';
import { applyText, applyAttributes } from './domTranslation.js';

test('German covers keyed menus and notifications without missing keys', () => {
  for (const key of Object.keys(LOCALES.en)) {
    assert.equal(typeof LOCALES.de[key], 'string', key);
    assert.deepEqual(LOCALES.de[key].match(/\{\w+\}/g), LOCALES.en[key].match(/\{\w+\}/g), key);
  }
  assert.equal(LOCALES.de['bar.unread'], '{count} ungelesen');
  assert.equal(LOCALES.de['help.topics'], 'Hilfethemen');
});

test('German translates complete phrases, dynamic counts and search attributes', () => {
  for (const [source, expected] of [
    ['Regional Activity', 'Regionale Aktivität'],
    ['Account share · Volume share', 'Kontenanteil · Volumenanteil'],
    ['Page 2 of 8', 'Seite 2 von 8'],
    ['Account: 200001, TEST TEST, USD, 1:500', 'Konto: 200001, TEST TEST, USD, 1:500'],
    ['Used margin: 967.58', 'Verwendete Margin: 967.58'],
    ['Resize Market Watch panel', 'Marktübersicht: Größe ändern'],
    ['5 pending', '5 ausstehend'],
    ['Loading online users…', 'Online-Benutzer werden geladen…'],
    ['No clients match the current filters.', 'Keine Kunden entsprechen den aktuellen Filtern.'],
  ]) assert.equal(lookupTranslation(UI_DICTIONARIES.de, source), expected, source);

  const attributes = { placeholder: 'Search symbols...', title: 'Show password' };
  const element = { getAttribute: (key) => attributes[key] ?? null, setAttribute: (key, value) => { attributes[key] = value; } };
  applyAttributes(element, UI_DICTIONARIES.de, 'de');
  assert.equal(attributes.placeholder, 'Symbole suchen...');
  assert.equal(attributes.title, 'Passwort anzeigen');
  applyAttributes(element, UI_DICTIONARIES.en, 'en');
  assert.equal(attributes.placeholder, 'Search symbols...');
});

test('German preserves identifiers and restores English after live text changes', () => {
  for (const value of ['client-9000@example.com', 'real-account_20001', 'EURUSD', 'BTCUSD', '9000', '1,250.50']) {
    const node = { data: value };
    applyText(node, UI_DICTIONARIES.de, 'de');
    assert.equal(node.data, value);
  }
  const node = { data: 'Show password' };
  applyText(node, UI_DICTIONARIES.de, 'de');
  assert.equal(node.data, 'Passwort anzeigen');
  node.data = 'Hide password';
  applyText(node, UI_DICTIONARIES.de, 'de');
  assert.equal(node.data, 'Passwort verbergen');
  applyText(node, UI_DICTIONARIES.en, 'en');
  assert.equal(node.data, 'Hide password');
});
