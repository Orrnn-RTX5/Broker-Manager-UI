import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(here, 'NavigatorPanel.jsx'), 'utf8');

const readMenuBlock = (name) => {
  const match = source.match(new RegExp(`const ${name} = \\[([\\s\\S]*?)\\];`));
  assert.ok(match, `${name} must remain a static menu-item array`);
  return match[1];
};

const EXPECTED_ACTIONS = {
  SERVER_CONTEXT_MENU_ITEMS: ['connect', 'disconnect'],
  DAILY_REPORT_CONTEXT_MENU_ITEMS: ['connect', 'disconnect', 'change-password', 'delete-account'],
};

const parseActionEntries = (block, name) => {
  const entries = block.match(/\{ action: '[^']+'[\s\S]*? \}/g);
  assert.ok(entries?.length, `${name} must keep its action entries`);
  return entries;
};

const parseReason = (entry) => {
  const m = entry.match(/disabledReason:\s*'([^']*)'/);
  assert.ok(m, `${entry} must carry disabledReason`);
  return m[1];
};

const parseLabel = (entry) => {
  const m = entry.match(/label:\s*'([^']*)'/);
  assert.ok(m, `${entry} must carry a label`);
  return m[1];
};

for (const name of ['SERVER_CONTEXT_MENU_ITEMS', 'DAILY_REPORT_CONTEXT_MENU_ITEMS']) {
  test(`${name}: every action item is disabled with an explicit reason, never a dead click`, () => {
    const block = readMenuBlock(name);
    const entries = parseActionEntries(block, name);
    for (const entry of entries) {
      assert.match(entry, /disabled: true/, `${entry} must stay disabled`);
      assert.match(entry, /disabledReason: '[^']+'/i, `${entry} must carry a user-visible reason`);
    }
    assert.doesNotMatch(block, /onClick/, `${name} must not gain click stubs without a real handler (SUI-M7)`);
  });

  test(`${name}: pins the exact action set so no entry can be added, removed, or re-enabled silently`, () => {
    const block = readMenuBlock(name);
    const entries = parseActionEntries(block, name);
    const actual = entries.map((e) => e.match(/action: '([^']+)'/)[1]);
    assert.deepEqual(
      [...actual].sort(),
      [...EXPECTED_ACTIONS[name]].sort(),
      `${name} must keep exactly actions [${EXPECTED_ACTIONS[name].join(', ')}], found [${actual.join(', ')}]`,
    );
    for (const action of EXPECTED_ACTIONS[name]) {
      const count = actual.filter((a) => a === action).length;
      assert.equal(count, 1, `${name} must contain action '${action}' exactly once, found ${count}`);
    }
  });

  test(`${name}: every entry carries a non-empty reason distinct from its label and no click handler`, () => {
    const block = readMenuBlock(name);
    const entries = parseActionEntries(block, name);
    for (const entry of entries) {
      const reason = parseReason(entry);
      assert.ok(reason.trim().length > 0, `${entry} disabledReason must be non-empty`);
      assert.ok(reason.trim().length >= 10, `${entry} disabledReason must be user-meaningful, got '${reason}'`);
      const label = parseLabel(entry);
      assert.ok(label.trim().length > 0, `${entry} must keep a visible label`);
      assert.notEqual(
        reason.trim().toLowerCase(),
        label.trim().toLowerCase(),
        `disabledReason must explain why, not echo the label ('${label}')`,
      );
      assert.doesNotMatch(entry, /onClick/, `${entry} must not carry its own click handler while disabled`);
      assert.doesNotMatch(entry, /disabled:\s*false/, `${entry} must not smuggle a disabled:false override`);
    }
    assert.doesNotMatch(block, /disabled:\s*false/, `${name} must not contain any disabled:false entry`);
    assert.doesNotMatch(block, /disabledReason:\s*''/, `${name} must not contain an empty disabledReason`);
  });
}

test('DAILY_REPORT_CONTEXT_MENU_ITEMS: keeps exactly one inert separator between server and account actions', () => {
  const block = readMenuBlock('DAILY_REPORT_CONTEXT_MENU_ITEMS');
  const separators = block.match(/\{ separator: true \}/g) || [];
  assert.equal(separators.length, 1, `daily-report menu must keep exactly one separator, found ${separators.length}`);
  const sepIndex = block.indexOf('{ separator: true }');
  const changePwIndex = block.indexOf("action: 'change-password'");
  assert.ok(changePwIndex > sepIndex, 'change-password must stay after the separator');
});

test('SERVER_CONTEXT_MENU_ITEMS: stays separator-free (both entries are server actions)', () => {
  const block = readMenuBlock('SERVER_CONTEXT_MENU_ITEMS');
  assert.doesNotMatch(block, /separator/, 'server menu must not gain separators');
});

test('NavigatorContextMenu surfaces each disabled reason the way TreeNode does', () => {
  assert.match(
    source,
    /title=\{item\.disabled && item\.disabledReason \? `\$\{item\.label\} — \$\{item\.disabledReason\}` : undefined\}/,
    'disabled menu items must expose their reason via title',
  );
});

test('NavigatorContextMenu: disabled state is wired to the native button (not just the data)', () => {
  assert.match(source, /disabled=\{item\.disabled\}/, 'menu button must bind disabled={item.disabled}');
  assert.match(
    source,
    /aria-disabled=\{item\.disabled \|\| undefined\}/,
    'menu button must expose aria-disabled for assistive tech',
  );
  assert.match(
    source,
    /tabIndex=\{item\.disabled \? -1/,
    'disabled menu items must be removed from tab order',
  );
});

test('NavigatorContextMenu: disabled items never fire handlers even if one is attached later', () => {
  assert.match(
    source,
    /onClick=\{\(\) => \{\s*if \(item\.disabled\) return;/,
    'menu onClick must early-return for disabled items',
  );
});

test('Enabled neighbors unaffected: analytics menus still offer real clickable actions', () => {
  // These two menus are useMemo(() => [...], [...]) arrays (not static
  // `const x = [...]`), so they need their own reader: capture up to the
  // memo close `\n  ], [` (two-space indent; nested submenu closes are deeper).
  const readMemoMenuBlock = (name) => {
    const match = source.match(new RegExp(`const ${name} = useMemo\\(\\(\\) => \\[([\\s\\S]*?)\\n  \\], \\[`));
    assert.ok(match, `${name} must remain a useMemo menu-item array with real handlers`);
    return match[1];
  };
  for (const name of ['analyticsRootContextMenuItems', 'analyticsContextMenuItems']) {
    const block = readMemoMenuBlock(name);
    assert.match(block, /onClick/, `${name} must keep enabled actions with real handlers`);
    assert.doesNotMatch(
      block,
      /disabled: true/,
      `${name} must not inherit the dead server-menu disabled state`,
    );
  }
});
