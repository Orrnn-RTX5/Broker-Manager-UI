export const CLOSE_POPUPS_REQUIRED_EVENT = 'rtx:close-popups-required';

/**
 * Computes whether floating popup windows/tabs (such as AccountDetailsModal
 * and BulkOperationsChargesModal) are currently open and blocking background
 * context menus, along with a clear user-facing instruction message.
 */
export function getBlockingPopupWindowSummary({
  openAccountWindows = [],
  hasBulkOperations = false,
  hasOtherModal = false,
  doc = typeof document !== 'undefined' ? document : null,
} = {}) {
  const stateAccountCount = Array.isArray(openAccountWindows)
    ? openAccountWindows.filter((win) => win && !win.minimized).length
    : 0;
  const domAccountCount = doc && typeof doc.querySelectorAll === 'function'
    ? doc.querySelectorAll('.account-details-window:not([data-minimized="true"])').length
    : 0;
  const openAccountCount = Math.max(stateAccountCount, domAccountCount);

  const domBulkOpen = Boolean(
    doc && typeof doc.querySelector === 'function' && doc.querySelector('.bulk-ops-window')
  );
  const bulkOpen = Boolean(hasBulkOperations || domBulkOpen);
  const otherOpen = Boolean(hasOtherModal);

  const totalOpenTabs = openAccountCount + (bulkOpen ? 1 : 0) + (otherOpen ? 1 : 0);
  const isBlocked = totalOpenTabs > 0;

  let message = '';
  if (totalOpenTabs >= 2) {
    message = `Please cross (✕) these ${totalOpenTabs} open tabs first — right-click will work again after closing them.`;
  } else if (totalOpenTabs === 1) {
    message = 'Please cross (✕) this open tab first — right-click will work again after closing it.';
  }

  return {
    isBlocked,
    totalOpenTabs,
    openAccountCount,
    bulkOpen,
    otherOpen,
    message,
  };
}

/**
 * Dispatches a global attention event so all open popup tabs (AccountDetailsModal,
 * BulkOperationsChargesModal) highlight their close (✕) buttons and show a banner
 * instructing the user to close the open tabs before using right-click.
 */
export function notifyCloseOpenPopupsRequired(options = {}) {
  const summary = getBlockingPopupWindowSummary(options);
  if (
    summary.isBlocked &&
    typeof window !== 'undefined' &&
    typeof window.dispatchEvent === 'function' &&
    typeof CustomEvent === 'function'
  ) {
    window.dispatchEvent(
      new CustomEvent(CLOSE_POPUPS_REQUIRED_EVENT, {
        detail: {
          ...summary,
          timestamp: Date.now(),
        },
      })
    );
  }
  return summary;
}
