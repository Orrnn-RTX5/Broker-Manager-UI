import { DockingProvider, DockLayout, PanelToolbar, DOCK_POSITIONS } from './docking';
import styles from './App.module.css';

// ─── Panel content components ────────────────────────────────────────────────

function WatchlistPanel() {
  const items = [
    { sym: 'EURUSD', bid: '1.08412', ask: '1.08415', chg: '+0.0021', up: true },
    { sym: 'GBPUSD', bid: '1.26834', ask: '1.26839', chg: '-0.0015', up: false },
    { sym: 'USDJPY', bid: '149.221', ask: '149.227', chg: '+0.312', up: true },
    { sym: 'XAUUSD', bid: '2018.45', ask: '2018.95', chg: '+4.25', up: true },
    { sym: 'BTCUSD', bid: '43120.5', ask: '43125.0', chg: '-210.3', up: false },
  ];
  return (
    <div style={{ fontFamily: 'monospace', fontSize: 12 }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ color: '#5a6270', borderBottom: '1px solid #2d333b' }}>
            <th style={{ padding: '4px 8px', textAlign: 'left', fontWeight: 500 }}>Symbol</th>
            <th style={{ padding: '4px 6px', textAlign: 'right', fontWeight: 500 }}>Bid</th>
            <th style={{ padding: '4px 6px', textAlign: 'right', fontWeight: 500 }}>Ask</th>
            <th style={{ padding: '4px 8px', textAlign: 'right', fontWeight: 500 }}>Chg</th>
          </tr>
        </thead>
        <tbody>
          {items.map(i => (
            <tr key={i.sym} style={{ borderBottom: '1px solid #1c2128' }}>
              <td style={{ padding: '5px 8px', color: '#c8d0dc', fontWeight: 600 }}>{i.sym}</td>
              <td style={{ padding: '5px 6px', color: '#a8b4c0', textAlign: 'right' }}>{i.bid}</td>
              <td style={{ padding: '5px 6px', color: '#a8b4c0', textAlign: 'right' }}>{i.ask}</td>
              <td style={{ padding: '5px 8px', textAlign: 'right', color: i.up ? '#27ae60' : '#e74c3c', fontWeight: 600 }}>
                {i.chg}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ChartPanel() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#3a4250', fontSize: 13 }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 40, marginBottom: 8 }}>📈</div>
        <div>EURUSD — H1 Chart</div>
        <div style={{ fontSize: 11, marginTop: 4, color: '#2a303a' }}>Plug in your chart library here</div>
      </div>
    </div>
  );
}

function TradesPanel() {
  const trades = [
    { id: '#12041', sym: 'EURUSD', type: 'BUY',  lots: 0.10, open: '1.08210', sl: '1.0800', tp: '1.0870', profit: '+$21.20' },
    { id: '#12039', sym: 'XAUUSD', type: 'BUY',  lots: 0.05, open: '2010.50', sl: '2000.0', tp: '2040.0', profit: '+$39.75' },
    { id: '#12035', sym: 'GBPUSD', type: 'SELL', lots: 0.20, open: '1.27100', sl: '1.2750', tp: '1.2650', profit: '-$12.80' },
  ];
  return (
    <div style={{ fontFamily: 'monospace', fontSize: 11 }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 600 }}>
        <thead>
          <tr style={{ color: '#5a6270', borderBottom: '1px solid #2d333b' }}>
            {['Ticket','Symbol','Type','Lots','Open Price','S/L','T/P','Profit'].map(h => (
              <th key={h} style={{ padding: '4px 8px', textAlign: h === 'Profit' ? 'right' : 'left', fontWeight: 500 }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {trades.map(t => (
            <tr key={t.id} style={{ borderBottom: '1px solid #1c2128' }}>
              <td style={{ padding: '5px 8px', color: '#5a8fcf' }}>{t.id}</td>
              <td style={{ padding: '5px 8px', color: '#c8d0dc', fontWeight: 600 }}>{t.sym}</td>
              <td style={{ padding: '5px 8px', color: t.type === 'BUY' ? '#27ae60' : '#e74c3c', fontWeight: 600 }}>{t.type}</td>
              <td style={{ padding: '5px 8px', color: '#a8b4c0' }}>{t.lots}</td>
              <td style={{ padding: '5px 8px', color: '#a8b4c0' }}>{t.open}</td>
              <td style={{ padding: '5px 8px', color: '#a8b4c0' }}>{t.sl}</td>
              <td style={{ padding: '5px 8px', color: '#a8b4c0' }}>{t.tp}</td>
              <td style={{ padding: '5px 8px', textAlign: 'right', color: t.profit.startsWith('+') ? '#27ae60' : '#e74c3c', fontWeight: 600 }}>{t.profit}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AccountPanel() {
  const stats = [
    ['Balance',   '$10,241.80'],
    ['Equity',    '$10,289.95'],
    ['Margin',    '$120.00'],
    ['Free Margin','$10,169.95'],
    ['Margin Lvl','8572.46%'],
  ];
  return (
    <div style={{ padding: '8px' }}>
      {stats.map(([k, v]) => (
        <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 4px', borderBottom: '1px solid #1c2128', fontSize: 12 }}>
          <span style={{ color: '#5a6270' }}>{k}</span>
          <span style={{ color: '#c8d0dc', fontWeight: 600, fontFamily: 'monospace' }}>{v}</span>
        </div>
      ))}
    </div>
  );
}

function LogPanel() {
  const logs = [
    { time: '14:32:11', msg: 'Order #12041 opened BUY 0.10 EURUSD at 1.08210', type: 'info' },
    { time: '14:31:55', msg: 'Connection to trade server restored', type: 'ok' },
    { time: '14:28:03', msg: 'Order #12039 opened BUY 0.05 XAUUSD at 2010.50', type: 'info' },
    { time: '14:12:40', msg: 'Stop Loss hit: Order #11998 SELL GBPUSD — Loss: -$18.40', type: 'warn' },
    { time: '13:55:22', msg: 'Connected to MetaQuotes-Demo server', type: 'ok' },
  ];
  const col = { info: '#5a8fcf', ok: '#27ae60', warn: '#e67e22' };
  return (
    <div style={{ fontFamily: 'monospace', fontSize: 11, padding: '4px 0' }}>
      {logs.map((l, i) => (
        <div key={i} style={{ display: 'flex', gap: 12, padding: '3px 8px', borderBottom: '1px solid #141820' }}>
          <span style={{ color: '#3a4250', flexShrink: 0 }}>{l.time}</span>
          <span style={{ color: col[l.type] }}>{l.msg}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Panel registry ──────────────────────────────────────────────────────────

const INITIAL_PANELS = {
  watchlist: {
    title: 'Market Watch',
    icon: '◉',
    defaultPosition: DOCK_POSITIONS.LEFT,
    visible: true,
  },
  chart: {
    title: 'Chart',
    icon: '📈',
    defaultPosition: DOCK_POSITIONS.CENTER,
    visible: true,
  },
  trades: {
    title: 'Trade',
    icon: '⚡',
    defaultPosition: DOCK_POSITIONS.BOTTOM,
    visible: true,
  },
  account: {
    title: 'Account',
    icon: '👤',
    defaultPosition: DOCK_POSITIONS.FLOAT,
    floatPos: { x: 60, y: 80 },
    size: { width: 260, height: 210 },
    visible: true,
  },
  log: {
    title: 'Terminal Log',
    icon: '▤',
    defaultPosition: DOCK_POSITIONS.FLOAT,
    floatPos: { x: 360, y: 80 },
    size: { width: 460, height: 160 },
    visible: true,
  },
};

const PANEL_CONTENTS = {
  watchlist: <WatchlistPanel />,
  chart:     <ChartPanel />,
  trades:    <TradesPanel />,
  account:   <AccountPanel />,
  log:       <LogPanel />,
};

// ─── App ─────────────────────────────────────────────────────────────────────

export default function App() {
  return (
    <DockingProvider initialPanels={INITIAL_PANELS}>
      <div className={styles.app}>
        {/* Top menu bar */}
        <div className={styles.menuBar}>
          <span className={styles.logo}>MT5 Manager</span>
          <span style={{ color: '#3a4250', fontSize: 11 }}>drag title bars · drop on edge zones to dock</span>
        </div>

        {/* Panel toggle toolbar */}
        <PanelToolbar />

        {/* The docking layout */}
        <div className={styles.workspace}>
          <DockLayout panelContents={PANEL_CONTENTS} />
        </div>
      </div>
    </DockingProvider>
  );
}
