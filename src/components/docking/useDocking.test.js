import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DOCK_POSITIONS,
  LEFT_STACK_MODES,
  applyPanelDockPlacement,
} from './useDocking.js';

const here = dirname(fileURLToPath(import.meta.url));

const createInitialPanels = () => ({
  market_data: {
    id: 'market_data',
    title: 'Market Watch',
    defaultPosition: DOCK_POSITIONS.LEFT,
    position: DOCK_POSITIONS.LEFT,
    visible: true,
    order: 0,
    size: { width: 346, height: '100%' },
    dockedSize: { width: 346, height: '100%' },
  },
  navigator: {
    id: 'navigator',
    title: 'Navigator',
    defaultPosition: DOCK_POSITIONS.LEFT,
    position: DOCK_POSITIONS.LEFT,
    visible: true,
    order: 1,
    size: { width: 204, height: '100%' },
    dockedSize: { width: 204, height: '100%' },
  },
});

test('Navigator docking guide placements set left, right, bottom, and outer-left positions', () => {
  const initialPanels = createInitialPanels();
  let state = {
    panels: createInitialPanels(),
    leftStackMode: LEFT_STACK_MODES.ROW,
  };

  // Float navigator first (simulating moving Navigator)
  state.panels.navigator = {
    ...state.panels.navigator,
    position: DOCK_POSITIONS.FLOAT,
    size: { width: 248, height: 360 },
  };

  // Click/drop on 'outer-left' -> Navigator on left (order 0), Market Watch on right (order 1), row mode
  state = applyPanelDockPlacement(
    state.panels,
    initialPanels,
    state.leftStackMode,
    'navigator',
    'outer-left'
  );
  assert.equal(state.leftStackMode, LEFT_STACK_MODES.ROW);
  assert.equal(state.panels.navigator.position, DOCK_POSITIONS.LEFT);
  assert.equal(state.panels.navigator.order, 0);
  assert.equal(state.panels.market_data.order, 1);
  assert.equal(state.panels.navigator.size.width, 204);

  // Click/drop on 'bottom' -> Market Watch on top (order 0), Navigator on bottom (order 1), column mode
  state = applyPanelDockPlacement(
    state.panels,
    initialPanels,
    state.leftStackMode,
    'navigator',
    'bottom'
  );
  assert.equal(state.leftStackMode, LEFT_STACK_MODES.COLUMN);
  assert.equal(state.panels.market_data.order, 0);
  assert.equal(state.panels.navigator.order, 1);

  // Click/drop on 'right' -> Market Watch on left (order 0), Navigator on right (order 1), row mode
  state = applyPanelDockPlacement(
    state.panels,
    initialPanels,
    state.leftStackMode,
    'navigator',
    'right'
  );
  assert.equal(state.leftStackMode, LEFT_STACK_MODES.ROW);
  assert.equal(state.panels.market_data.order, 0);
  assert.equal(state.panels.navigator.order, 1);

  // Click/drop on 'left' -> Navigator on left (order 0), Market Watch on right (order 1), row mode
  state = applyPanelDockPlacement(
    state.panels,
    initialPanels,
    state.leftStackMode,
    'navigator',
    'left'
  );
  assert.equal(state.leftStackMode, LEFT_STACK_MODES.ROW);
  assert.equal(state.panels.navigator.order, 0);
  assert.equal(state.panels.market_data.order, 1);
});

test('Market Watch docking guide placements set left, right, and bottom positions', () => {
  const initialPanels = createInitialPanels();
  let state = {
    panels: createInitialPanels(),
    leftStackMode: LEFT_STACK_MODES.ROW,
  };

  // Move Market Watch to right of Navigator
  state = applyPanelDockPlacement(
    state.panels,
    initialPanels,
    state.leftStackMode,
    'market_data',
    'right'
  );
  assert.equal(state.leftStackMode, LEFT_STACK_MODES.ROW);
  assert.equal(state.panels.navigator.order, 0);
  assert.equal(state.panels.market_data.order, 1);
  assert.equal(state.panels.market_data.size.width, 346);

  // Move Market Watch to bottom below Navigator
  state = applyPanelDockPlacement(
    state.panels,
    initialPanels,
    state.leftStackMode,
    'market_data',
    'bottom'
  );
  assert.equal(state.leftStackMode, LEFT_STACK_MODES.COLUMN);
  assert.equal(state.panels.navigator.order, 0);
  assert.equal(state.panels.market_data.order, 1);

  // Move Market Watch back to outer-left
  state = applyPanelDockPlacement(
    state.panels,
    initialPanels,
    state.leftStackMode,
    'market_data',
    'outer-left'
  );
  assert.equal(state.leftStackMode, LEFT_STACK_MODES.ROW);
  assert.equal(state.panels.market_data.order, 0);
  assert.equal(state.panels.navigator.order, 1);
  assert.equal(state.terminalFullWidth, false);
});

test('GlobalDockOverlay, DockLayout, and DockPanel keep full-width Operations Terminal on initial open/reset and switch to center Toolbox layout when moving panels', () => {
  const overlaySource = readFileSync(join(here, 'GlobalDockOverlay.jsx'), 'utf8');
  const layoutSource = readFileSync(join(here, 'DockLayout.jsx'), 'utf8');
  const panelSource = readFileSync(join(here, 'DockPanel.jsx'), 'utf8');
  const hookSource = readFileSync(join(here, 'useDocking.js'), 'utf8');

  for (const zone of ['outer-left', 'left', 'right', 'bottom', 'top']) {
    assert.match(overlaySource, new RegExp(`data-dock-zone="${zone}"`));
  }

  assert.doesNotMatch(layoutSource, /terminalOrder\s*=\s*\{\s*market_data:\s*0,\s*navigator:\s*1\s*\}/);
  assert.match(layoutSource, /data-left-stack-mode="row"/);
  assert.match(layoutSource, /data-left-stack-mode="column"/);
  assert.match(panelSource, /setActiveDockGuideId\?\.\(id\)/);
  assert.match(hookSource, /const \[terminalFullWidth, setTerminalFullWidth\] = useState\(true\)/);
  assert.match(hookSource, /setTerminalFullWidth\(true\)/);
  assert.match(hookSource, /setTerminalFullWidth\(false\)/);
  assert.match(panelSource, /isCompactToolboxTerminal = id === 'terminal' && !isFloat && !isMaximized && !terminalFullWidth/);
  assert.match(layoutSource, /import\s*\{[^}]*\buseEffect\b[^}]*\}\s*from\s*'react'/);
  assert.match(layoutSource, /terminalFullWidth \? styles\.middleFullBottom : styles\.middleCenterBottom/);
  assert.match(panelSource, /if \(isMt5DockPane && !isFloat\)/);
});
