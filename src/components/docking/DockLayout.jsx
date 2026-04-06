import { useDockingContext } from './DockingContext';
import { DOCK_POSITIONS } from './useDocking';
import DockPanel from './DockPanel';
import GlobalDockOverlay from './GlobalDockOverlay';
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
 *   <DockLayout panelContents={{ myPanel: <MyContent /> }}>
 *     <MainStaticWorkspace />
 *   </DockLayout>
 */
export default function DockLayout({ panelContents = {}, children }) {
  const { panels, draggingId, dockPanel } = useDockingContext();

  const visiblePanels = Object.values(panels).filter(p => p.visible);

  const get = (pos) => visiblePanels
    .filter(p => p.position === pos)
    .sort((a, b) => (a.order || 0) - (b.order || 0));

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
        {leftPanels.length > 0 && (
          <div className={styles.sideColumn}>
            {leftPanels.map((p, index) => (
              <DockPanel 
                key={p.id} 
                id={p.id}
                canMoveUp={index > 0}
                canMoveDown={index < leftPanels.length - 1}
              >
                {panelContents[p.id]}
              </DockPanel>
            ))}
          </div>
        )}

        <div className={styles.centerArea}>
          {children}
          {centerPanels.map(p => (
            <DockPanel key={p.id} id={p.id}>
              {panelContents[p.id]}
            </DockPanel>
          ))}
        </div>

        {rightPanels.length > 0 && (
          <div className={styles.sideColumn}>
            {rightPanels.map((p, index) => (
              <DockPanel 
                key={p.id} 
                id={p.id}
                canMoveUp={index > 0}
                canMoveDown={index < rightPanels.length - 1}
              >
                {panelContents[p.id]}
              </DockPanel>
            ))}
          </div>
        )}
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

      {/* Global drop overlay for dock zones when a panel is being dragged */}
      <GlobalDockOverlay
        visible={!!draggingId}
        onDock={(zone) => {
          if (draggingId) dockPanel(draggingId, zone);
        }}
      />
    </div>
  );
}
