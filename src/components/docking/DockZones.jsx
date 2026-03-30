import { useState } from 'react';
import styles from './DockZone.module.css';

const ZONES = [
  { id: 'top',    label: '▲ Top',    className: styles.zoneTop    },
  { id: 'bottom', label: '▼ Bottom', className: styles.zoneBottom },
  { id: 'left',   label: '◀ Left',  className: styles.zoneLeft   },
  { id: 'right',  label: '▶ Right', className: styles.zoneRight  },
  { id: 'center', label: '⬛ Fill', className: styles.zoneCenter },
];

export default function DockZones({ visible, onDock }) {
  const [hoveredZone, setHoveredZone] = useState(null);

  if (!visible) return null;

  return (
    <div className={styles.overlay}>
      {ZONES.map(zone => (
        <div
          key={zone.id}
          className={`${zone.className} ${hoveredZone === zone.id ? styles.zoneActive : ''}`}
          onMouseEnter={() => setHoveredZone(zone.id)}
          onMouseLeave={() => setHoveredZone(null)}
          onMouseUp={() => onDock(zone.id)}
        >
          <span className={styles.zoneLabel}>{zone.label}</span>
        </div>
      ))}
    </div>
  );
}
