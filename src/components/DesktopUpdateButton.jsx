import { useState } from 'react';
import { AlertCircle, CheckCircle2, Loader2, RefreshCw } from 'lucide-react';

const STATUS_LABEL = {
  idle: 'Check Update',
  checking: 'Checking',
  downloaded: 'Downloaded',
  'not-available': 'Up to date',
  disabled: 'Update off',
  error: 'Update failed',
};

const getDesktopUpdater = () => {
  if (typeof window === 'undefined') return null;
  const updater = window.rtx5Updater;
  return typeof updater?.checkForUpdates === 'function' ? updater : null;
};

const normalizeUpdateResult = (result) => {
  const status = typeof result?.status === 'string' ? result.status : 'error';
  const message = typeof result?.message === 'string' && result.message.trim()
    ? result.message
    : 'Update check failed.';

  return { status, message };
};

const getUpdateErrorMessage = (error) => {
  const message = error?.message || '';
  if (message.includes('No handler registered') && message.includes('rtx5-update:check')) {
    return 'Desktop update handler is not ready. Restart the desktop app and try again.';
  }

  return message || 'Update check failed.';
};

const DesktopUpdateButton = () => {
  const [updateState, setUpdateState] = useState({
    status: 'idle',
    message: 'Check for desktop app updates',
  });

  const updater = getDesktopUpdater();
  if (!updater) return null;

  const isBusy = updateState.status === 'checking';
  const label = STATUS_LABEL[updateState.status] || STATUS_LABEL.idle;
  const statusClass = updateState.status === 'downloaded'
    ? 'desktop-update-button-success'
    : updateState.status === 'error'
      ? 'desktop-update-button-error'
      : '';

  const handleCheckUpdate = async () => {
    setUpdateState({
      status: 'checking',
      message: 'Checking for desktop app updates...',
    });

    try {
      const result = normalizeUpdateResult(await updater.checkForUpdates());
      setUpdateState(result);
      window.alert(result.message);
    } catch (error) {
      const message = getUpdateErrorMessage(error);
      setUpdateState({ status: 'error', message });
      window.alert(message);
    }
  };

  return (
    <button
      type="button"
      className={`desktop-update-button ${statusClass}`}
      onClick={handleCheckUpdate}
      disabled={isBusy}
      title={updateState.message}
      aria-label="Check for desktop app updates"
    >
      {isBusy ? (
        <Loader2 size={13} className="animate-spin" aria-hidden="true" />
      ) : updateState.status === 'downloaded' ? (
        <CheckCircle2 size={13} aria-hidden="true" />
      ) : updateState.status === 'error' ? (
        <AlertCircle size={13} aria-hidden="true" />
      ) : (
        <RefreshCw size={13} aria-hidden="true" />
      )}
      <span>{label}</span>
    </button>
  );
};

export default DesktopUpdateButton;
