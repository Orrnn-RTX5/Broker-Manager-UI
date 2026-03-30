import { useDockingContext } from './DockingContext';
import styles from './PanelToolbar.module.css';

export default function PanelToolbar() {
  const { panels, togglePanel } = useDockingContext();

  return (
    <div className={styles.toolbar}>
      {Object.values(panels).map(panel => (
        <button
          key={panel.id}
          className={`${styles.btn} ${panel.visible ? styles.btnActive : ''}`}
          title={panel.title}
          onClick={() => togglePanel(panel.id)}
        >
          <span className={styles.btnIcon}>{panel.icon}</span>
          <span className={styles.btnLabel}>{panel.title}</span>
        </button>
      ))}
    </div>
  );
}
