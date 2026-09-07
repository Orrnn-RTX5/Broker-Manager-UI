import { Fragment, useCallback, useRef } from 'react';
import { ChevronsLeftRight } from 'lucide-react';
import { useDockingContext } from './DockingContext';
import { DOCK_POSITIONS } from './useDocking';
import DockPanel from './DockPanel';
import GlobalDockOverlay from './GlobalDockOverlay';
import styles from './DockLayout.module.css';

const MIN_LEFT_PANEL_WIDTH = 180;
const MIN_NAVIGATOR_WIDTH = 200;
const MIN_MARKET_WATCH_WIDTH = 230;
const MIN_CENTER_WIDTH = 360;
const MIN_BOTTOM_PANEL_HEIGHT = 96;
const MIN_MIDDLE_AREA_HEIGHT = 260;

const getMinimumPanelWidth = (panel) => {
  if (panel?.id === 'market_data') return MIN_MARKET_WATCH_WIDTH;
  if (panel?.id === 'navigator') return MIN_NAVIGATOR_WIDTH;
  return MIN_LEFT_PANEL_WIDTH;
};

const getLeftPanelWidth = (panel) => {
  const width = Number(panel?.size?.width);
  const fallback = panel?.id === 'market_data'
    ? 280
    : panel?.id === 'navigator' ? 260 : 280;
  const preferredWidth = Number.isFinite(width) && width > 0 ? width : fallback;
  return Math.max(getMinimumPanelWidth(panel), preferredWidth);
};

const DockedPaneResizer = ({ panel, centerAreaRef, onResize }) => {
  const minimumWidth = getMinimumPanelWidth(panel);

  const getMaximumWidth = (currentWidth) => {
    const centerWidth = centerAreaRef.current?.getBoundingClientRect().width;
    const availableCenterWidth = Number.isFinite(centerWidth) ? centerWidth : MIN_CENTER_WIDTH;

    // Only use the center pane's live width. That keeps the dashboard usable
    // even when a right-side panel is open.
    return Math.max(
      minimumWidth,
      currentWidth + Math.max(0, availableCenterWidth - MIN_CENTER_WIDTH)
    );
  };

  const handlePointerDown = (event) => {
    if (event.button !== 0 && event.pointerType !== 'touch') return;

    event.preventDefault();
    const resizer = event.currentTarget;
    const panelElement = resizer.previousElementSibling;
    const startWidth = panelElement?.getBoundingClientRect().width || getLeftPanelWidth(panel);
    const startX = event.clientX;
    const pointerId = event.pointerId;
    const maximumWidth = getMaximumWidth(startWidth);
    let isResizing = true;

    const handlePointerMove = (moveEvent) => {
      if (moveEvent.pointerId !== pointerId) return;

      const nextWidth = Math.min(
        maximumWidth,
        Math.max(minimumWidth, startWidth + moveEvent.clientX - startX)
      );
      onResize(panel.id, Math.round(nextWidth));
    };

    const cleanup = () => {
      if (!isResizing) return;
      isResizing = false;
      resizer.removeEventListener('pointermove', handlePointerMove);
      resizer.removeEventListener('pointerup', handlePointerEnd);
      resizer.removeEventListener('pointercancel', handlePointerEnd);
      resizer.removeEventListener('lostpointercapture', cleanup);
      if (resizer.hasPointerCapture?.(pointerId)) {
        resizer.releasePointerCapture(pointerId);
      }
    };

    const handlePointerEnd = (endEvent) => {
      if (endEvent.pointerId === pointerId) cleanup();
    };

    resizer.addEventListener('pointermove', handlePointerMove);
    resizer.addEventListener('pointerup', handlePointerEnd);
    resizer.addEventListener('pointercancel', handlePointerEnd);
    resizer.addEventListener('lostpointercapture', cleanup);
    resizer.setPointerCapture?.(pointerId);
  };

  const handleKeyDown = (event) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;

    event.preventDefault();
    const delta = event.key === 'ArrowRight' ? 16 : -16;
    const currentWidth = getLeftPanelWidth(panel);
    const nextWidth = Math.min(
      getMaximumWidth(currentWidth),
      Math.max(minimumWidth, currentWidth + delta)
    );
    onResize(panel.id, Math.round(nextWidth));
  };

  return (
    <div
      className={styles.paneResizer}
      role="separator"
      aria-label={`Resize ${panel.title} panel`}
      aria-orientation="vertical"
      aria-valuemin={minimumWidth}
      aria-valuenow={Math.round(getLeftPanelWidth(panel))}
      tabIndex={0}
      title="Drag to resize"
      onPointerDown={handlePointerDown}
      onKeyDown={handleKeyDown}
    >
      <ChevronsLeftRight size={12} aria-hidden="true" />
    </div>
  );
};

const DockedBottomResizer = ({ panel, middleAreaRef, onResize }) => {
  const getCurrentHeight = (panelElement) => {
    const renderedHeight = panelElement?.getBoundingClientRect().height;
    if (Number.isFinite(renderedHeight) && renderedHeight > 0) return renderedHeight;

    const configuredHeight = Number(panel?.size?.height);
    return Number.isFinite(configuredHeight) && configuredHeight > 0 ? configuredHeight : 132;
  };

  const getMaximumHeight = (currentHeight) => {
    const middleHeight = middleAreaRef.current?.getBoundingClientRect().height;
    const availableMiddleHeight = Number.isFinite(middleHeight) ? middleHeight : MIN_MIDDLE_AREA_HEIGHT;
    return currentHeight + Math.max(0, availableMiddleHeight - MIN_MIDDLE_AREA_HEIGHT);
  };

  const handlePointerDown = (event) => {
    if (event.button !== 0 && event.pointerType !== 'touch') return;

    event.preventDefault();
    const resizer = event.currentTarget;
    const panelElement = resizer.nextElementSibling;
    const startHeight = getCurrentHeight(panelElement);
    const startY = event.clientY;
    const pointerId = event.pointerId;
    const maximumHeight = getMaximumHeight(startHeight);
    let isResizing = true;

    const handlePointerMove = (moveEvent) => {
      if (moveEvent.pointerId !== pointerId) return;
      const nextHeight = Math.min(
        maximumHeight,
        Math.max(MIN_BOTTOM_PANEL_HEIGHT, startHeight - (moveEvent.clientY - startY))
      );
      onResize(panel.id, Math.round(nextHeight));
    };

    const cleanup = () => {
      if (!isResizing) return;
      isResizing = false;
      resizer.removeEventListener('pointermove', handlePointerMove);
      resizer.removeEventListener('pointerup', handlePointerEnd);
      resizer.removeEventListener('pointercancel', handlePointerEnd);
      resizer.removeEventListener('lostpointercapture', cleanup);
      if (resizer.hasPointerCapture?.(pointerId)) resizer.releasePointerCapture(pointerId);
    };

    const handlePointerEnd = (endEvent) => {
      if (endEvent.pointerId === pointerId) cleanup();
    };

    resizer.addEventListener('pointermove', handlePointerMove);
    resizer.addEventListener('pointerup', handlePointerEnd);
    resizer.addEventListener('pointercancel', handlePointerEnd);
    resizer.addEventListener('lostpointercapture', cleanup);
    resizer.setPointerCapture?.(pointerId);
  };

  const handleKeyDown = (event) => {
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;

    event.preventDefault();
    const currentHeight = getCurrentHeight(event.currentTarget.nextElementSibling);
    const delta = event.key === 'ArrowUp' ? 16 : -16;
    const nextHeight = Math.min(
      getMaximumHeight(currentHeight),
      Math.max(MIN_BOTTOM_PANEL_HEIGHT, currentHeight + delta)
    );
    onResize(panel.id, Math.round(nextHeight));
  };

  return (
    <div
      className={styles.bottomResizer}
      role="separator"
      aria-label={`Resize ${panel.title} panel`}
      aria-orientation="horizontal"
      aria-valuemin={MIN_BOTTOM_PANEL_HEIGHT}
      aria-valuenow={Math.round(getCurrentHeight())}
      tabIndex={0}
      title="Drag to resize terminal"
      onPointerDown={handlePointerDown}
      onKeyDown={handleKeyDown}
    ><span aria-hidden="true" /></div>
  );
};

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
  const { panels, draggingId, dockPanel, updatePanel } = useDockingContext();
  const centerAreaRef = useRef(null);
  const middleAreaRef = useRef(null);

  const visiblePanels = Object.values(panels).filter(p => p.visible);
  const maximizedPanel = visiblePanels.find(panel => panel.maximized);
  const layoutPanels = maximizedPanel
    ? visiblePanels.filter(panel => panel.id !== maximizedPanel.id)
    : visiblePanels;

  const get = (pos) => layoutPanels
    .filter(p => p.position === pos)
    .sort((a, b) => (a.order || 0) - (b.order || 0));

  const topPanels    = get(DOCK_POSITIONS.TOP);
  const bottomPanels = get(DOCK_POSITIONS.BOTTOM);
  const leftPanels   = get(DOCK_POSITIONS.LEFT).sort((a, b) => {
    // The terminal workspace always reserves the far-left rail for quotes,
    // then keeps navigation beside it. Other left-docked panels follow.
    const terminalOrder = { market_data: 0, navigator: 1 };
    return (terminalOrder[a.id] ?? a.order ?? 99) - (terminalOrder[b.id] ?? b.order ?? 99);
  });
  const rightPanels  = get(DOCK_POSITIONS.RIGHT);
  const centerPanels = get(DOCK_POSITIONS.CENTER);
  const floatPanels  = get(DOCK_POSITIONS.FLOAT);
  const resizeLeftPanel = useCallback((id, width) => {
    const panel = panels[id];
    if (!panel) return;
    const normalizedWidth = Math.max(getMinimumPanelWidth(panel), width);
    updatePanel(id, {
      size: {
        ...panel.size,
        width: normalizedWidth,
      },
    });
  }, [panels, updatePanel]);
  const resizeBottomPanel = useCallback((id, height) => {
    const panel = panels[id];
    if (!panel) return;
    updatePanel(id, {
      size: {
        ...panel.size,
        height: Math.max(MIN_BOTTOM_PANEL_HEIGHT, height),
      },
    });
  }, [panels, updatePanel]);

  const getLeftPanelLayoutStyle = (panel) => {
    const width = getLeftPanelWidth(panel);
    return {
      width: `${width}px`,
      minWidth: `${width}px`,
      flex: `0 0 ${width}px`,
      height: '100%',
    };
  };

  const getSingleLeftPanelLayoutStyle = (panel) => {
    const width = getLeftPanelWidth(panel);
    return {
      width: `${width}px`,
      minWidth: `${width}px`,
      height: '100%',
    };
  };

  return (
    <div className={styles.root}>
      {/* Top strip */}
      {topPanels.map(p => (
        <DockPanel key={p.id} id={p.id}>
          {panelContents[p.id]}
        </DockPanel>
      ))}

      {/* Middle row */}
      <div ref={middleAreaRef} className={styles.middle}>
        {leftPanels.length > 1 && (
          <div className={styles.leftSideRow}>
            {leftPanels.map((p, index) => (
              <Fragment key={p.id}>
                <DockPanel
                  id={p.id}
                  canMoveUp={index > 0}
                  canMoveDown={index < leftPanels.length - 1}
                  layoutStyle={getLeftPanelLayoutStyle(p)}
                >
                  {panelContents[p.id]}
                </DockPanel>
                <DockedPaneResizer
                  panel={p}
                  centerAreaRef={centerAreaRef}
                  onResize={resizeLeftPanel}
                />
              </Fragment>
            ))}
          </div>
        )}

        {leftPanels.length === 1 && (
          <>
            <div className={styles.sideColumn}>
              <DockPanel id={leftPanels[0].id} layoutStyle={getSingleLeftPanelLayoutStyle(leftPanels[0])}>
                {panelContents[leftPanels[0].id]}
              </DockPanel>
            </div>
            <DockedPaneResizer
              panel={leftPanels[0]}
              centerAreaRef={centerAreaRef}
              onResize={resizeLeftPanel}
            />
          </>
        )}

        <div ref={centerAreaRef} className={styles.centerArea}>
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
        <Fragment key={p.id}>
          <DockedBottomResizer panel={p} middleAreaRef={middleAreaRef} onResize={resizeBottomPanel} />
          <DockPanel id={p.id}>
            {panelContents[p.id]}
          </DockPanel>
        </Fragment>
      ))}

      {/* Floating panels (fixed position, handled by DockPanel) */}
      {maximizedPanel && (
        <div className={styles.maximizedPanelOverlay}>
          <DockPanel
            id={maximizedPanel.id}
            layoutStyle={{ width: '100%', minWidth: 0, height: '100%', flex: '1 1 auto' }}
          >
            {panelContents[maximizedPanel.id]}
          </DockPanel>
        </div>
      )}

      {!maximizedPanel && floatPanels.map(p => (
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
