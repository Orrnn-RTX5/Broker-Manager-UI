import { useState } from 'react';

/**
 * GlobalDockOverlay
 *
 * Renders a fixed full-screen overlay with edge drop zones when ANY float
 * panel is being dragged. Zones appear at screen edges (top, bottom, left,
 * right) and a center zone. User hovers over the zone they want and releases.
 *
 * This replaces the old per-panel DockZones approach to prevent accidental
 * docking and to correctly support all four directions.
 */

const ZONES = [
  {
    id: 'top',
    label: '▲  Top',
    style: {
      position: 'fixed',
      top: 0,
      left: '20%',
      right: '20%',
      height: 72,
      borderRadius: '0 0 12px 12px',
      borderTop: 'none',
    },
  },
  {
    id: 'bottom',
    label: '▼  Bottom',
    style: {
      position: 'fixed',
      bottom: 0,
      left: '20%',
      right: '20%',
      height: 72,
      borderRadius: '12px 12px 0 0',
      borderBottom: 'none',
    },
  },
  {
    id: 'left',
    label: '◀  Left',
    style: {
      position: 'fixed',
      left: 0,
      top: '20%',
      bottom: '20%',
      width: 80,
      borderRadius: '0 12px 12px 0',
      borderLeft: 'none',
    },
  },
  {
    id: 'right',
    label: '▶  Right',
    style: {
      position: 'fixed',
      right: 0,
      top: '20%',
      bottom: '20%',
      width: 80,
      borderRadius: '12px 0 0 12px',
      borderRight: 'none',
    },
  },

];

const BASE_ZONE_STYLE = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'rgba(30, 140, 255, 0.10)',
  border: '2px dashed rgba(30, 140, 255, 0.45)',
  cursor: 'crosshair',
  transition: 'background 0.12s, border-color 0.12s, transform 0.1s',
  userSelect: 'none',
  zIndex: 99998,
};

const ACTIVE_ZONE_STYLE = {
  background: 'rgba(30, 140, 255, 0.30)',
  border: '2px dashed rgba(30, 140, 255, 0.95)',
  transform: 'scale(1.03)',
};

const LABEL_STYLE = {
  fontSize: 12,
  fontWeight: 700,
  color: 'rgba(30, 140, 255, 0.95)',
  pointerEvents: 'none',
  whiteSpace: 'nowrap',
  letterSpacing: '0.5px',
};

export default function GlobalDockOverlay({ visible, onDock }) {
  const [hoveredZone, setHoveredZone] = useState(null);

  if (!visible) return null;

  return (
    // Transparent pointer-events blocker that prevents clicks going through
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 99997,
        pointerEvents: 'none',
      }}
    >
      {ZONES.map(zone => (
        <div
          key={zone.id}
          style={{
            ...BASE_ZONE_STYLE,
            ...zone.style,
            pointerEvents: 'all',
            ...(hoveredZone === zone.id ? ACTIVE_ZONE_STYLE : {}),
          }}
          onMouseEnter={() => setHoveredZone(zone.id)}
          onMouseLeave={() => setHoveredZone(null)}
          onMouseUp={() => {
            setHoveredZone(null);
            // Map the 'bottom' zone to actual 'center' placement behavior
            if (zone.id === 'bottom') {
              onDock('center');
            } else {
              onDock(zone.id);
            }
          }}
        >
          <span style={LABEL_STYLE}>{zone.label}</span>
        </div>
      ))}
    </div>
  );
}
