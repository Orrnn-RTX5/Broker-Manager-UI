import { useState } from 'react';
import { Download, Loader2 } from 'lucide-react';
import { isDesktopBackendTarget } from '../config/backendTarget.js';
import { startLatestDesktopDownload } from '../services/desktopRelease.js';

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

  const handleDownload = async () => {
    setLoading(true);
    setError('');

    try {
      await startLatestDesktopDownload();
    } catch (err) {
      const message = err?.message || copy.error;
      setError(message);
      if (variant === 'menu') window.alert(copy.error);
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
