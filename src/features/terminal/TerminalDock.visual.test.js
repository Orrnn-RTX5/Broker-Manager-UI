import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('./TerminalDock.jsx', import.meta.url), 'utf8');
const styles = readFileSync(new URL('../../styles/command-center.css', import.meta.url), 'utf8');
const openPositionsStyles = readFileSync(new URL('../../index.css', import.meta.url), 'utf8');

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const getCustomProperty = (css, selector, property) => {
  const blocks = css.matchAll(new RegExp(`(?:^|\\n)${escapeRegExp(selector)}\\s*\\{([^}]*)\\}`, 'g'));
  const propertyPattern = new RegExp(`${property}:\\s*([^;]+);`);
  const match = [...blocks]
    .map((block) => block[1].match(propertyPattern))
    .find(Boolean);
  assert.ok(match, `Missing ${property} in ${selector}`);
  return match[1].trim();
};

test('Operations Terminal matches Open Positions value and semantic colors', () => {
  assert.match(source, /const profitClassName = Number\(row\.profit\) < 0 \? 'is-negative' : 'is-positive'/);
  assert.match(source, /column === 'Action'[\s\S]*?className="cc-trade-side"/);
  assert.match(source, /column === 'Profit \/ Loss'[\s\S]*?cc-trade-profit/);

  const terminalSelector = '.cc-terminal-trades';
  const terminalDarkSelector = '.dark .cc-terminal-trades';
  const openPositionsSelector = '#root .open-positions-page .open-positions-grid';
  const openPositionsDarkSelector = '.dark #root .open-positions-page .open-positions-grid';

  assert.equal(
    getCustomProperty(styles, terminalSelector, '--trade-value-text'),
    getCustomProperty(openPositionsStyles, openPositionsSelector, '--open-position-value-color'),
  );
  assert.equal(
    getCustomProperty(styles, terminalDarkSelector, '--trade-value-text'),
    getCustomProperty(openPositionsStyles, openPositionsDarkSelector, '--open-position-value-color'),
  );
  assert.equal(
    getCustomProperty(styles, terminalSelector, '--trade-buy-text'),
    getCustomProperty(openPositionsStyles, openPositionsSelector, '--open-position-buy-color'),
  );
  assert.equal(
    getCustomProperty(styles, terminalSelector, '--trade-sell-text'),
    getCustomProperty(openPositionsStyles, openPositionsSelector, '--open-position-sell-color'),
  );
  assert.equal(
    getCustomProperty(styles, terminalDarkSelector, '--trade-buy-text'),
    getCustomProperty(openPositionsStyles, openPositionsDarkSelector, '--open-position-buy-color'),
  );
  assert.equal(
    getCustomProperty(styles, terminalDarkSelector, '--trade-sell-text'),
    getCustomProperty(openPositionsStyles, openPositionsDarkSelector, '--open-position-sell-color'),
  );
  assert.match(styles, /tbody td\s*\{\s*color:\s*var\(--trade-value-text\)/);
  assert.match(styles, /\.cc-trade-profit\.is-positive\s*\{\s*color:\s*var\(--trade-profit-text\)/);
  assert.match(styles, /\.cc-trade-profit\.is-negative\s*\{\s*color:\s*var\(--trade-loss-text\)/);
});

test('Journal Entry and Journal Viewer modals render enterprise key-value grid, severity badges, and telemetry panels', () => {
  const journalStyles = readFileSync(new URL('./TerminalJournal.css', import.meta.url), 'utf8');
  assert.ok(source.includes('cc-journal-field-cell'), 'Journal Entry must render structured field cells');
  assert.ok(source.includes('cc-journal-status-pill'), 'Journal Entry must render semantic severity status pills');
  assert.ok(source.includes('cc-journal-detail-panel is-message'), 'Journal Entry must render a dedicated Message panel');
  assert.ok(source.includes('cc-journal-detail-panel is-diagnostics'), 'Journal Entry must render a dedicated Diagnostics & Telemetry panel');
  assert.ok(source.includes('cc-journal-telemetry-chip'), 'Journal Entry must render structured diagnostic telemetry chips');
  assert.ok(
    !journalStyles.includes('.cc-journal-viewer-backdrop) *'),
    'Journal modal must not have its typographic hierarchy flattened by the dock table !important rule',
  );
});

