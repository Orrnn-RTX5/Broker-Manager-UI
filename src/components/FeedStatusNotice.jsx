import { AlertTriangle } from 'lucide-react';
import { getFeedStatusCopy } from '../utils/feedStatus.js';

const FeedStatusNotice = ({ feedError, compact = false, className = '', cachedCount = 0 }) => {
  const copy = getFeedStatusCopy(feedError);
  if (!copy) return null;

  const count = Number(cachedCount) || 0;

  return (
    <div
      role="status"
      aria-live="polite"
      className={`flex gap-2 rounded border text-left ${compact ? 'px-2 py-2' : 'px-3 py-2.5'} ${className}`}
      style={{
        borderColor: 'var(--warning, #f59e0b)',
        background: 'color-mix(in srgb, var(--warning, #f59e0b) 10%, transparent)',
        color: 'var(--text)',
      }}
    >
      <AlertTriangle
        size={compact ? 14 : 16}
        className="shrink-0 mt-0.5"
        style={{ color: 'var(--warning, #f59e0b)' }}
      />
      <div className="min-w-0">
        <div className={`${compact ? 'text-[11px]' : 'text-xs'} font-semibold`}>
          {copy.title}
        </div>
        <div className={`${compact ? 'text-[11px]' : 'text-xs'} leading-5`} style={{ color: 'var(--text-2)' }}>
          {copy.message}
        </div>
        {count > 0 && (
          <div className={`${compact ? 'text-[11px]' : 'text-xs'} leading-5 font-medium`} style={{ color: 'var(--text-2)' }}>
            Showing {count} cached symbol{count === 1 ? '' : 's'}. Prices are not live.
          </div>
        )}
      </div>
    </div>
  );
};

export default FeedStatusNotice;
