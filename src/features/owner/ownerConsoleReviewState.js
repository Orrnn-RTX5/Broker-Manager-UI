export const OWNER_CONSOLE_REVIEW_STORAGE_KEY = 'rtx5_owner_console_reviewed_v1';

const EMPTY_REVIEW_STATE = Object.freeze({ alerts: [], approvals: [] });

const normalizeIds = (value) => (
  Array.isArray(value)
    ? [...new Set(value.filter((id) => typeof id === 'string' && id))]
    : []
);

export function readOwnerConsoleReviewState(storage = globalThis.sessionStorage) {
  try {
    const saved = JSON.parse(storage?.getItem?.(OWNER_CONSOLE_REVIEW_STORAGE_KEY) || 'null');
    return {
      alerts: normalizeIds(saved?.alerts),
      approvals: normalizeIds(saved?.approvals),
    };
  } catch {
    return { ...EMPTY_REVIEW_STATE };
  }
}

export function markOwnerConsoleWorkflowReviewed(state, collection, id, storage = globalThis.sessionStorage) {
  if (!Object.hasOwn(EMPTY_REVIEW_STATE, collection) || typeof id !== 'string' || !id) {
    return state;
  }

  const current = {
    alerts: normalizeIds(state?.alerts),
    approvals: normalizeIds(state?.approvals),
  };
  if (current[collection].includes(id)) return current;

  const next = { ...current, [collection]: [...current[collection], id] };
  try {
    storage?.setItem?.(OWNER_CONSOLE_REVIEW_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // The in-memory count still updates when session storage is unavailable.
  }
  return next;
}

export function countUnreviewedOwnerWorkflows(items, reviewedIds) {
  const reviewed = new Set(normalizeIds(reviewedIds));
  return items.filter((item) => !reviewed.has(item.id)).length;
}
