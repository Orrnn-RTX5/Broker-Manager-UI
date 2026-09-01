import { LoaderCircle } from 'lucide-react';

const GridLoadingState = ({ label = 'Loading data…' }) => (
  <div
    className="flex-1 min-h-[240px] flex items-center justify-center p-6"
    role="status"
    aria-live="polite"
  >
    <div className="flex flex-col items-center gap-3 text-center">
      <div
        className="w-11 h-11 rounded-xl flex items-center justify-center"
        style={{
          background: 'var(--accent-soft)',
          border: '1px solid var(--accent-border)',
          color: 'var(--accent-text)',
        }}
      >
        <LoaderCircle size={20} className="animate-spin" />
      </div>
      <span className="text-sm font-medium" style={{ color: 'var(--text-3)' }}>{label}</span>
    </div>
  </div>
);

export default GridLoadingState;
