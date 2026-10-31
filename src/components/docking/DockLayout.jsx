import { Fragment, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ChevronsLeftRight } from 'lucide-react';
import { useDockingContext } from './DockingContext';
import { DOCK_POSITIONS, LEFT_STACK_MODES } from './useDocking';
import DockPanel from './DockPanel';
import GlobalDockOverlay from './GlobalDockOverlay';
import styles from './DockLayout.module.css';

const MIN_LEFT_PANEL_WIDTH = 180;
const MIN_NAVIGATOR_WIDTH = 170;
// The 320px quote table needs 82% of its width plus the scrollbar for Symbol/Bid/Ask.
const MIN_MARKET_WATCH_WIDTH = 276;
const MIN_CENTER_WIDTH = 360;
const MIN_USABLE_CENTER_CONTENT_WIDTH = 720;
const MIN_BOTTOM_PANEL_HEIGHT = 96;
const MIN_MIDDLE_AREA_HEIGHT = 260;
const MIN_STACKED_PANEL_HEIGHT = 96;
const CENTER_OVERFLOW_TOLERANCE = 2;

const getMinimumPanelWidth = (panel) => {
  if (panel?.id === 'market_data') return MIN_MARKET_WATCH_WIDTH;
  if (panel?.id === 'navigator') return MIN_NAVIGATOR_WIDTH;
  return MIN_LEFT_PANEL_WIDTH;
};

const getLeftPanelWidth = (panel) => {
  const width = Number(panel?.size?.width);
  const fallback = panel?.id === 'market_data'
    ? 280
    : panel?.id === 'navigator' ? 180 : 280;
  const preferredWidth = Number.isFinite(width) && width > 0 ? width : fallback;
  return Math.max(getMinimumPanelWidth(panel), preferredWidth);
};

function useRightPanelOverflowGuard(centerAreaRef, rightPanelStateKey, updatePanel) {
  useLayoutEffect(() => {
    if (!rightPanelStateKey) return undefined;

    const centerArea = centerAreaRef.current;
    const viewport = centerArea?.querySelector('.cc-route-viewport');
    if (!viewport) return undefined;

    const rightPanels = rightPanelStateKey.split('|').map((entry) => {
      const [id, userPinned] = entry.split(':');
      return { id, userPinned: userPinned === 'pinned' };
    });
    let frameId = null;
    const closeRightPanelsIfContentOverflows = () => {
      const contentIsTooNarrow = viewport.clientWidth < MIN_USABLE_CENTER_CONTENT_WIDTH;
      const contentOverflows = viewport.scrollWidth > viewport.clientWidth + CENTER_OVERFLOW_TOLERANCE;
      if (!contentIsTooNarrow && !contentOverflows) return;

      rightPanels.filter((panel) => !panel.userPinned).forEach((panel) => {
        updatePanel(panel.id, { visible: false, maximized: false });
      });
    };
    const scheduleCheck = () => {
      if (typeof globalThis.requestAnimationFrame !== 'function') {
        closeRightPanelsIfContentOverflows();
        return;
      }
      if (frameId !== null) globalThis.cancelAnimationFrame(frameId);
      frameId = globalThis.requestAnimationFrame(() => {
        frameId = null;
        closeRightPanelsIfContentOverflows();
      });
    };

    // Check synchronously when a side panel opens so the cramped layout is
    // never presented as an intermediate state.
    closeRightPanelsIfContentOverflows();

    const ResizeObserverImpl = globalThis.ResizeObserver;
    const resizeObserver = ResizeObserverImpl ? new ResizeObserverImpl(scheduleCheck) : null;
    resizeObserver?.observe(centerArea);
    resizeObserver?.observe(viewport);

    const MutationObserverImpl = globalThis.MutationObserver;
    const mutationObserver = MutationObserverImpl ? new MutationObserverImpl(scheduleCheck) : null;
    mutationObserver?.observe(viewport, { childList: true, subtree: true });

    return () => {
      resizeObserver?.disconnect();
      mutationObserver?.disconnect();
      if (frameId !== null) globalThis.cancelAnimationFrame?.(frameId);
    };
  }, [centerAreaRef, rightPanelStateKey, updatePanel]);
}

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

const DockedStackResizer = ({ topPanel, columnRef, topRatio, onRatioChange }) => {
  const handlePointerDown = (event) => {
    if (event.button !== 0 && event.pointerType !== 'touch') return;
    event.preventDefault();
    const resizer = event.currentTarget;
    const columnHeight = columnRef.current?.getBoundingClientRect().height || 480;
    const startY = event.clientY;
    const startTopHeight = Math.round(columnHeight * topRatio);
    const pointerId = event.pointerId;
    let isResizing = true;

    const handlePointerMove = (moveEvent) => {
      if (moveEvent.pointerId !== pointerId) return;
      const nextTopHeight = Math.min(
        Math.max(MIN_STACKED_PANEL_HEIGHT, columnHeight - MIN_STACKED_PANEL_HEIGHT),
        Math.max(MIN_STACKED_PANEL_HEIGHT, startTopHeight + (moveEvent.clientY - startY))
      );
      const nextRatio = Math.min(0.82, Math.max(0.18, nextTopHeight / Math.max(1, columnHeight)));
      onRatioChange(nextRatio);
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

  return (
    <div
      className={styles.bottomResizer}
      role="separator"
      aria-label={`Resize ${topPanel.title} height`}
      aria-orientation="horizontal"
      tabIndex={0}
      title="Drag to resize stacked panels"
      onPointerDown={handlePointerDown}
    >
      <span aria-hidden="true" />
    </div>
  );
};

const DockedBottomResizer = ({ panel, middleAreaRef, isFullWidth = false, onResize }) => {
  const getCurrentHeight = (panelElement) => {
    const renderedHeight = panelElement?.getBoundingClientRect().height;
    if (Number.isFinite(renderedHeight) && renderedHeight > 0) return renderedHeight;

    const configuredHeight = Number(panel?.size?.height);
    return Number.isFinite(configuredHeight) && configuredHeight > 0 ? configuredHeight : 132;
  };

  const getMaximumHeight = (currentHeight) => {
    const middleHeight = middleAreaRef.current?.getBoundingClientRect().height;
    const availableMiddleHeight = Number.isFinite(middleHeight) ? middleHeight : MIN_MIDDLE_AREA_HEIGHT;
    return isFullWidth
      ? currentHeight + Math.max(0, availableMiddleHeight - MIN_MIDDLE_AREA_HEIGHT)
      : Math.max(MIN_BOTTOM_PANEL_HEIGHT, availableMiddleHeight - MIN_MIDDLE_AREA_HEIGHT);
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
 */
export default function DockLayout({ panelContents = {}, children }) {
  const {
    panels,
    draggingId,
    activeDockGuideId,
    setActiveDockGuideId,
    leftStackMode,
    terminalFullWidth,
    dockPanel,
    updatePanel,
  } = useDockingContext();
  const centerAreaRef = useRef(null);
  const middleAreaRef = useRef(null);
  const stackedColumnRef = useRef(null);
  const [stackedTopRatio, setStackedTopRatio] = useState(0.5);

  useEffect(() => {
    const handleReset = () => setStackedTopRatio(0.5);
    window.addEventListener('manager:reset-layout', handleReset);
    return () => window.removeEventListener('manager:reset-layout', handleReset);
  }, []);

  const visiblePanels = Object.values(panels).filter(p => p.visible);
  const maximizedPanel = visiblePanels.find(panel => panel.maximized);
  const layoutPanels = maximizedPanel
    ? visiblePanels.filter(panel => panel.id !== maximizedPanel.id)
    : visiblePanels;

  const get = (pos) => layoutPanels
    .filter(p => p.position === pos)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  const topPanels    = get(DOCK_POSITIONS.TOP);
  const bottomPanels = get(DOCK_POSITIONS.BOTTOM);
  const leftPanels   = get(DOCK_POSITIONS.LEFT);
  const rightPanels  = get(DOCK_POSITIONS.RIGHT);
  const centerPanels = get(DOCK_POSITIONS.CENTER);
  const floatPanels  = get(DOCK_POSITIONS.FLOAT);
  const isLeftStacked = leftStackMode === LEFT_STACK_MODES.COLUMN && leftPanels.length > 1;
  const activeGuidePanelId = draggingId || activeDockGuideId;

  const rightPanelStateKey = rightPanels.map((panel) => `${panel.id}:${panel.userPinned ? 'pinned' : 'auto'}`).join('|');
  useRightPanelOverflowGuard(centerAreaRef, rightPanelStateKey, updatePanel);

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

  const resizeStackedLeftColumn = useCallback((_id, width) => {
    const dockedLeft = Object.values(panels).filter(
      (p) => p.visible && !p.maximized && p.position === DOCK_POSITIONS.LEFT
    );
    if (!dockedLeft.length) return;
    const minRequired = Math.max(...dockedLeft.map(getMinimumPanelWidth));
    const normalizedWidth = Math.max(minRequired, width);
    dockedLeft.forEach((p) => {
      updatePanel(p.id, {
        size: {
          ...p.size,
          width: normalizedWidth,
        },
      });
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

  const stackedColumnWidth = leftPanels.length > 0
    ? Math.max(...leftPanels.map(getLeftPanelWidth))
    : 346;

  return (
    <div className={styles.root}>
      {/* Top strip */}
      {topPanels.map(p => (
        <DockPanel key={p.id} id={p.id}>
          {panelContents[p.id]}
        </DockPanel>
      ))}

      {/* Main grid workspace: switches bottom terminal between full-width and center-bottom purely via CSS Grid areas */}
      <div
        ref={middleAreaRef}
        className={`${styles.middle} ${terminalFullWidth ? styles.middleFullBottom : styles.middleCenterBottom}`}
      >
        <div className={styles.leftZone}>
          {leftPanels.length > 0 && (
            /* Supports data-left-stack-mode="row" and data-left-stack-mode="column" without unmounting panels */
            <div
              ref={stackedColumnRef}
              className={
                isLeftStacked
                  ? styles.leftSideStackColumn
                  : leftPanels.length > 1
                    ? styles.leftSideRow
                    : styles.sideColumn
              }
              data-left-stack-mode={isLeftStacked ? 'column' : 'row'}
              style={
                isLeftStacked
                  ? {
                      width: `${stackedColumnWidth}px`,
                      minWidth: `${stackedColumnWidth}px`,
                      flex: `0 0 ${stackedColumnWidth}px`,
                    }
                  : undefined
              }
            >
              {leftPanels.map((p, index) => {
                const isTop = index === 0;
                const pct = isTop ? Math.round(stackedTopRatio * 100) : Math.round((1 - stackedTopRatio) * 100);
                const panelLayoutStyle = isLeftStacked
                  ? {
                      width: '100%',
                      minWidth: 0,
                      height: `${pct}%`,
                      minHeight: `${MIN_STACKED_PANEL_HEIGHT}px`,
                      flex: `${pct} 1 0%`,
                    }
                  : leftPanels.length === 1
                    ? getSingleLeftPanelLayoutStyle(p)
                    : getLeftPanelLayoutStyle(p);
                return (
                  <Fragment key={p.id}>
                    {isLeftStacked && index > 0 && (
                      <DockedStackResizer
                        topPanel={leftPanels[index - 1]}
                        columnRef={stackedColumnRef}
                        topRatio={stackedTopRatio}
                        onRatioChange={setStackedTopRatio}
                      />
                    )}
                    <DockPanel
                      id={p.id}
                      canMoveUp={index > 0}
                      canMoveDown={index < leftPanels.length - 1}
                      layoutStyle={panelLayoutStyle}
                    >
                      {panelContents[p.id]}
                    </DockPanel>
                    {!isLeftStacked && (
                      <DockedPaneResizer
                        panel={p}
                        centerAreaRef={centerAreaRef}
                        onResize={resizeLeftPanel}
                      />
                    )}
                  </Fragment>
                );
              })}
            </div>
          )}
          {isLeftStacked && leftPanels.length > 1 && (
            <DockedPaneResizer
              panel={{ ...leftPanels[0], size: { width: stackedColumnWidth } }}
              centerAreaRef={centerAreaRef}
              onResize={resizeStackedLeftColumn}
            />
          )}
        </div>

        <div ref={centerAreaRef} className={styles.centerArea}>
          {children}
          {centerPanels.map(p => (
            <DockPanel key={p.id} id={p.id}>
              {panelContents[p.id]}
            </DockPanel>
          ))}
        </div>

        <div className={styles.rightZone}>
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

        <div className={styles.bottomZone}>
          {bottomPanels.map(p => (
            <Fragment key={p.id}>
              <DockedBottomResizer panel={p} middleAreaRef={middleAreaRef} isFullWidth={false} onResize={resizeBottomPanel} />
              <DockPanel id={p.id}>
                {panelContents[p.id]}
              </DockPanel>
            </Fragment>
          ))}
        </div>
      </div>

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

      {/* MT5 Smart Docking guide overlay when moving a panel */}
      <GlobalDockOverlay
        visible={Boolean(activeGuidePanelId)}
        activePanelId={activeGuidePanelId}
        panels={panels}
        isDragging={Boolean(draggingId)}
        onDock={(zone) => {
          if (activeGuidePanelId) dockPanel(activeGuidePanelId, zone);
        }}
        onDismiss={() => setActiveDockGuideId?.(null)}
      />
    </div>
  );
}
