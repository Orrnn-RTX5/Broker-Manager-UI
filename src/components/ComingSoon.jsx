import { Construction } from 'lucide-react';

/**
 * Lightweight placeholder card — renders where charts/maps used to live.
 * Keeps layout stable while the backend metrics endpoints are being
 * finalized. Swap for the real component later without refactoring pages.
 */
export default function ComingSoon({ title, description, height = 320 }) {
  return (
    <div
      className="ui-card flex flex-col items-center justify-center text-center p-8"
      style={{ minHeight: height, background: 'var(--surface-2)' }}
    >
      <div
        className="w-12 h-12 rounded-full flex items-center justify-center mb-3"
        style={{ background: 'var(--accent-soft)', color: 'var(--accent-text)' }}
      >
        <Construction size={20} />
      </div>
      <h3 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
        {title || 'Coming soon'}
      </h3>
      {description && (
        <p className="text-xs mt-1.5 max-w-xs" style={{ color: 'var(--text-3)' }}>
          {description}
        </p>
      )}
    </div>
  );
}
