export const MANAGER_REFRESH_EVENT = 'manager:refresh-data';

/**
 * Refresh both React Query-backed screens and legacy useDataSource screens.
 * React Query already refetches active queries when they are invalidated.
 */
export async function refreshWorkspaceData(queryClient, eventTarget = globalThis.window) {
  if (!queryClient?.invalidateQueries) {
    throw new TypeError('A query client is required to refresh the workspace.');
  }

  eventTarget?.dispatchEvent?.(new Event(MANAGER_REFRESH_EVENT));
  await queryClient.invalidateQueries({ refetchType: 'active' });
}

export function resetWorkspaceLayout(resetLayout, navigate) {
  if (typeof resetLayout !== 'function') {
    throw new TypeError('The workspace layout cannot be reset.');
  }

  resetLayout();
  try {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('manager:reset-layout'));
    }
  } catch {
    // ignore
  }
  navigate?.('/dashboard');
}

/**
 * Toggle the standard Fullscreen API with WebKit fallbacks for embedded shells.
 * Resolves to the new fullscreen state.
 */
export async function toggleDocumentFullscreen(doc = globalThis.document) {
  if (!doc) {
    throw new Error('Fullscreen is not available in this environment.');
  }

  const fullscreenElement = doc.fullscreenElement ?? doc.webkitFullscreenElement;
  if (fullscreenElement) {
    const exitFullscreen = doc.exitFullscreen ?? doc.webkitExitFullscreen;
    if (typeof exitFullscreen !== 'function') {
      throw new Error('Exiting fullscreen is not supported by this browser.');
    }

    await Promise.resolve(exitFullscreen.call(doc));
    return false;
  }

  const root = doc.documentElement;
  const requestFullscreen = root?.requestFullscreen ?? root?.webkitRequestFullscreen;
  if (typeof requestFullscreen !== 'function') {
    throw new Error('Fullscreen is not supported by this browser.');
  }

  await Promise.resolve(requestFullscreen.call(root));
  return true;
}
