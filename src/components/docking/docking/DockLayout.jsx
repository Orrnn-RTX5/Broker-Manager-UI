import { useDockingContext } from './DockingContext';
import { DOCK_POSITIONS } from './useDocking';
import DockPanel from './DockPanel';
import styles from './DockLayout.module.css';

/**
 * DockLayout renders:
 *   top-bar  ← panels docked to top
 *   ┌──────────────────────────────┐
 *   │ left │   center    │ right  │
 *   └──────────────────────────────┘
 *   bottom-bar  ← panels docked to bottom
 *
 * Float panels render in a fixed overlay (handled by DockPanel itself).
 *
 * Usage:
 *   <DockLayout panelContents={{ myPanel: <MyContent /> }} />
 */
export default function DockLayout({ panelContents = {} }) {
  const { panels } = useDockingContext();

  const visiblePanels = Object.values(panels).filter(p => p.visible);

  const get = (pos) => visiblePanels.filter(p => p.position === pos);

  const topPanels    = get(DOCK_POSITIONS.TOP);
  const bottomPanels = get(DOCK_POSITIONS.BOTTOM);
  const leftPanels   = get(DOCK_POSITIONS.LEFT);
  const rightPanels  = get(DOCK_POSITIONS.RIGHT);
  const centerPanels = get(DOCK_POSITIONS.CENTER);
  const floatPanels  = get(DOCK_POSITIONS.FLOAT);

  return (
    <div className={styles.root}>
      {/* Top strip */}
      {topPanels.map(p => (
        <DockPanel key={p.id} id={p.id}>
          {panelContents[p.id]}
        </DockPanel>
      ))}

      {/* Middle row */}
      <div className={styles.middle}>
        {leftPanels.map(p => (
          <DockPanel key={p.id} id={p.id}>
            {panelContents[p.id]}
          </DockPanel>
        ))}

        <div className={styles.centerArea}>
          {centerPanels.map(p => (
            <DockPanel key={p.id} id={p.id}>
              {panelContents[p.id]}
            </DockPanel>
          ))}
        </div>

        {rightPanels.map(p => (
          <DockPanel key={p.id} id={p.id}>
            {panelContents[p.id]}
          </DockPanel>
        ))}
      </div>

      {/* Bottom strip */}
      {bottomPanels.map(p => (
        <DockPanel key={p.id} id={p.id}>
          {panelContents[p.id]}
        </DockPanel>
      ))}

      {/* Floating panels (fixed position, handled by DockPanel) */}
      {floatPanels.map(p => (
        <DockPanel key={p.id} id={p.id}>
          {panelContents[p.id]}
        </DockPanel>
      ))}
    </div>
  );
}
