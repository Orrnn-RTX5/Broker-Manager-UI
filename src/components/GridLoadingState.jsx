import { LoaderCircle } from 'lucide-react';

const GridLoadingState = ({ label = 'Loading data…', compact = false }) => (
  <div
    className={`grid-loading-soft-landing relative flex flex-col w-full overflow-hidden ${compact ? 'flex-none h-[144px] min-h-0' : 'flex-1 min-h-[260px]'}`}
    role="status"
    aria-live="polite"
  >
    {/* Subtle realistic skeleton rows that maintain table structure without sudden shifts */}
    <div className="w-full flex-1 flex flex-col p-3 gap-2.5 pointer-events-none opacity-40 select-none">
      <div className="h-7 w-full rounded bg-[var(--surface-3)] animate-pulse" />
      {[...Array(compact ? 3 : 6)].map((_, i) => (
        <div
          key={i}
          className="h-7 w-full rounded flex items-center gap-4 px-3"
          style={{ background: i % 2 === 0 ? 'var(--surface-2)' : 'transparent' }}
        >
          <div className="h-2.5 w-14 rounded bg-[var(--surface-3)] animate-pulse" />
          <div className="h-2.5 w-32 rounded bg-[var(--surface-3)] animate-pulse" />
          <div className="h-2.5 w-24 rounded bg-[var(--surface-3)] animate-pulse" />
          <div className="h-2.5 w-16 rounded bg-[var(--surface-3)] animate-pulse" />
          <div className="h-2.5 w-20 rounded bg-[var(--surface-3)] animate-pulse ml-auto" />
          <div className="h-2.5 w-16 rounded bg-[var(--surface-3)] animate-pulse" />
        </div>
      ))}
    </div>

    {/* Elegant floating center badge with backdrop blur for soft landing */}
    <div className="absolute inset-0 flex items-center justify-center p-4">
      <div
        className="flex items-center gap-2.5 px-4 py-2 rounded-lg shadow-sm backdrop-blur-md transition-all"
        style={{
          background: 'color-mix(in srgb, var(--surface) 92%, transparent)',
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
