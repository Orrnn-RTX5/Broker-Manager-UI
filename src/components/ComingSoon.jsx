import { BarChart3, CircleDashed } from 'lucide-react';

/**
 * Lightweight placeholder card — renders where charts/maps used to live.
 * Keeps layout stable while the backend metrics endpoints are being
 * finalized. Swap for the real component later without refactoring pages.
 */
export default function ComingSoon({ title, description, height = 260, compact = false, className = '' }) {
  if (compact) {
    return (
      <section className={`data-state-card data-state-card-compact ui-card ${className}`} style={{ minHeight: height }}>
        <div className="data-state-compact-main">
          <div className="data-state-card-title">
            <span className="data-state-card-icon" style={{ background: 'var(--accent-soft)', color: 'var(--accent-text)' }}><BarChart3 size={17} /></span>
            <h3>{title || 'Analytics view'}</h3>
          </div>
          {description && <p>{description}</p>}
        </div>
        <div className="data-state-compact-meta">
          <span className="data-state-card-status"><CircleDashed size={12} /> Awaiting data source</span>
        </div>
      </section>
    );
  }

  return (
    <section className={`data-state-card ui-card ${className}`} style={{ minHeight: height }}>
      <header className="data-state-card-header">
        <div className="data-state-card-title">
          <span className="data-state-card-icon" style={{ background: 'var(--accent-soft)', color: 'var(--accent-text)' }}><BarChart3 size={17} /></span>
          <h3>{title || 'Analytics view'}</h3>
        </div>
        <span className="data-state-card-status"><CircleDashed size={12} /> Data pending</span>
      </header>
      <div className="data-state-card-content">
        <strong>Waiting for live aggregation</strong>
        {description && <p>{description}</p>}
      </div>
      <footer className="data-state-card-footer">This panel will populate automatically when its manager endpoint is available.</footer>
    </section>
  );
}
