import { Activity, CircleCheck, Wifi, WifiOff } from 'lucide-react';
import DesktopAppDownloadButton from '../DesktopAppDownloadButton';
import DesktopUpdateButton from '../DesktopUpdateButton';
import { useT } from '../../i18n/index.js';

export default function StatusBar({
  isAuthenticated = false,
  connectionData = null,
  pingMs = null,
  trafficKb = 13.0,
}) {
  const t = useT();
  const visibleConnectionData = isAuthenticated ? connectionData : null;
  const visiblePingMs = isAuthenticated ? pingMs : null;
  const isConnected = visibleConnectionData?.status === 'Connected';
  const pingTone = visiblePingMs == null
    ? 'var(--muted)'
    : visiblePingMs < 150 ? 'var(--ok)' : 'var(--warn)';
  const safeTrafficKb = Number.isFinite(Number(trafficKb)) ? Number(trafficKb).toFixed(1) : '0.0';

  return (
    <footer className="cc-status-bar" aria-label={t('status.connection')}>
      <div className="cc-status-group">
        <span className="cc-status-version">RTX5 Manager v2.6.0</span>
        <span><i className="cc-status-dot is-live" />{t('status.production')}</span>
        <span><CircleCheck size={11} />{t('status.ready')}</span>
      </div>

      <div className="cc-status-group cc-status-right" aria-label={t('status.connection')}>
        <DesktopAppDownloadButton variant="menu" />
        <DesktopUpdateButton />
        <span className="cc-status-divider" aria-hidden="true" />
        <span className="cc-status-telemetry">
          <Activity size={12} style={{ color: pingTone }} aria-hidden="true" />
          <span className="font-mono tabular">
            {visiblePingMs != null ? `${visiblePingMs} ms` : '---'} · {safeTrafficKb} KB
          </span>
        </span>
        <span className="cc-status-divider" aria-hidden="true" />
        <div className="cc-status-connection relative group">
          <div
            className="cc-status-connection-pill"
            style={{
              background: isConnected ? 'var(--ok-soft)' : 'var(--surface-3)',
              color: isConnected ? 'var(--ok-text)' : 'var(--muted)',
              borderColor: isConnected ? 'var(--ok-border)' : 'var(--border)',
            }}
          >
            {isConnected ? <Wifi size={12} aria-hidden="true" /> : <WifiOff size={12} aria-hidden="true" />}
            <span>{isConnected ? t('status.connected') : t('status.disconnected')}</span>
          </div>

          {isConnected && (
            <div className="cc-status-connection-popover" role="tooltip">
              <div className="font-semibold pb-2 mb-2" style={{ color: 'var(--text)', borderBottom: '1px solid var(--border)' }}>
                {t('status.connection')}
              </div>
              <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5">
                <div style={{ color: 'var(--text-3)' }}>{t('status.status')}</div>
                <div style={{ color: 'var(--ok-text)', fontWeight: 500 }}>{visibleConnectionData.status}</div>
                <div style={{ color: 'var(--text-3)' }}>{t('status.login')}</div>
                <div className="font-mono tabular" style={{ color: 'var(--text)' }}>{visibleConnectionData.login || '—'}</div>
                <div style={{ color: 'var(--text-3)' }}>{t('status.uptime')}</div>
                <div className="font-mono tabular" style={{ color: 'var(--text)' }}>{visibleConnectionData.connectedTime ?? '—'}s</div>
              </div>
            </div>
          )}
        </div>
      </div>
    </footer>
  );
}
