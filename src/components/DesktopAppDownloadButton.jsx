import { showResult } from '../store/resultDialogStore.js';
import { useState } from 'react';
import { Download, Loader2 } from 'lucide-react';
import { isDesktopBackendTarget } from '../config/backendTarget.js';
import { getBrokerInfo } from '../services/brokerAuth.js';
import {
  RELEASE_CHANNEL_UNAVAILABLE_MESSAGE,
  isReleaseChannelConfigured,
  startLatestDesktopDownload,
} from '../services/desktopRelease.js';

const COPY = {
  menu: {
    idle: 'Desktop App',
    loading: 'Preparing',
    title: 'Download latest desktop app',
    error: 'Could not start desktop app download.',
  },
  auth: {
    idle: 'Download desktop app',
    loading: 'Preparing download',
    title: 'Download latest RTX-5 Broker Manager desktop app',
    error: 'Could not start the download. Please try again.',
  },
};

const DesktopAppDownloadButton = ({ variant = 'menu' }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const copy = COPY[variant] || COPY.menu;

  if (isDesktopBackendTarget()) return null;

  // When no update channel is configured, disable with an honest tooltip
  // instead of letting the user sit on an infinite "Preparing" spinner.
  // Tenant-agnostic: the message comes from the release module, no new copy.
  if (!isReleaseChannelConfigured(getBrokerInfo())) {
    return (
      <div className={`desktop-app-download desktop-app-download-${variant}`}>
        <button
          type="button"
          className={`desktop-app-download-button desktop-app-download-button-${variant}`}
          disabled
          title={RELEASE_CHANNEL_UNAVAILABLE_MESSAGE}
          aria-label={copy.title}
          aria-disabled="true"
        >
          <Download size={variant === 'auth' ? 16 : 13} aria-hidden="true" />
          <span>{copy.idle}</span>
        </button>
      </div>
    );
  }

  const handleDownload = async () => {
    setLoading(true);
    setError('');

    try {
      await startLatestDesktopDownload({ signal: AbortSignal.timeout(15000), brokerInfo: getBrokerInfo() });
    } catch (err) {
      const message = err?.message || copy.error;
      setError(message);
      if (variant === 'menu') showResult.error(copy.error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={`desktop-app-download desktop-app-download-${variant}`}>
      <button
        type="button"
        className={`desktop-app-download-button desktop-app-download-button-${variant}`}
        onClick={handleDownload}
        disabled={loading}
        title={error || copy.title}
        aria-label={copy.title}
      >
        {loading
          ? <Loader2 size={variant === 'auth' ? 16 : 13} className="animate-spin" aria-hidden="true" />
          : <Download size={variant === 'auth' ? 16 : 13} aria-hidden="true" />}
        <span>{loading ? copy.loading : copy.idle}</span>
      </button>
      {error && variant === 'auth' && (
        <p className="desktop-app-download-error" role="status">
          {error}
        </p>
      )}
    </div>
  );
};

export default DesktopAppDownloadButton;
