import { LoaderCircle } from 'lucide-react';

const GridLoadingState = ({ label = 'Loading data…', compact = false }) => (
  <div
    className={`grid-loading-soft-landing relative flex flex-col w-full overflow-hidden ${compact ? 'flex-none h-[144px] min-h-0' : 'flex-1 min-h-[260px]'}`}
    role="status"
    aria-live="polite"
  >
    <div className="flex-1 flex items-center justify-center p-4">
      <div
        className="flex items-center gap-2.5 px-4 py-2 rounded-lg shadow-sm transition-all"
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          boxShadow: '0 4px 16px rgba(0, 0, 0, 0.08)',
        }}
      >
        <LoaderCircle size={15} className="animate-spin text-[var(--accent)] shrink-0" />
        <span className="font-medium text-xs tracking-tight" style={{ color: 'var(--text-2)' }}>
          {label}
        </span>
      </div>
    </div>
  </div>
);

export default GridLoadingState;
