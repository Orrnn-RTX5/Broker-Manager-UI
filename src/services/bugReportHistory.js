// Confirmed submission receipts only. The manager API has no history endpoint.
// Keep metadata in this tab, scoped by broker and reporter; never store report
// descriptions, attachments, authentication tokens, or a guessed review status.
export const BUG_REPORT_HISTORY_EVENT = 'manager:bug-report-receipts';
export const OPEN_BUG_REPORT_EVENT = 'manager:open-bug-report';

const memory = new Map();
const LIMIT = 100;
const EMPTY = [];

const storageForTab = () => {
  try { return globalThis.sessionStorage; } catch { return null; }
};

export function bugReportHistoryScope(user, brokerId = '') {
  const broker = user?.broker_id || user?.brokerId || brokerId;
  const reporter = user?.login ?? user?.id;
  return broker && reporter != null ? JSON.stringify([String(broker), String(reporter)]) : null;
}

const keyFor = (scope) => `manager:bug-report-receipts:v1:${scope}`;

function normalize(row) {
  if (
    !row ||
    typeof row.report_id !== 'string' ||
    !row.report_id.trim() ||
    typeof row.title !== 'string' ||
    !Number.isFinite(row.submitted_at)
  ) {
    return null;
  }
  return {
    report_id: row.report_id.slice(0, 200),
    title: row.title.slice(0, 500),
    category: typeof row.category === 'string' ? row.category.slice(0, 50) : 'other',
    severity: typeof row.severity === 'string' ? row.severity.slice(0, 50) : 'medium',
    submitted_at: row.submitted_at,
    attachment_issue: row.attachment_issue === true,
  };
}

export function readBugReportHistory(scope, storage = storageForTab()) {
  if (!scope) return EMPTY;
  if (memory.has(scope)) return memory.get(scope);
  try {
    const saved = storage?.getItem(keyFor(scope));
    if (saved) {
      const rows = JSON.parse(saved);
      if (Array.isArray(rows)) {
        const valid = rows.map(normalize).filter(Boolean).slice(0, LIMIT);
        memory.set(scope, valid);
        return valid;
      }
    }
  } catch {
    /* A receipt remains available in memory if browser storage fails. */
  }
  memory.set(scope, EMPTY);
  return EMPTY;
}

export function recordBugReportReceipt(scope, receipt, form, storage = storageForTab()) {
  if (!scope) return;
  const row = normalize({
    report_id: receipt?.report_id,
    title: form?.title?.trim(),
    category: form?.category,
    severity: form?.severity,
    submitted_at: Date.now(),
    attachment_issue: Boolean(receipt?.failed_attachments?.length),
  });
  if (!row) return;
  const rows = [
    row,
    ...readBugReportHistory(scope, storage).filter((item) => item.report_id !== row.report_id),
  ].slice(0, LIMIT);
  memory.set(scope, rows);
  try {
    storage?.setItem(keyFor(scope), JSON.stringify(rows));
  } catch {
    /* Keep server success independent of local storage. */
  }
  globalThis.window?.dispatchEvent(new CustomEvent(BUG_REPORT_HISTORY_EVENT, { detail: scope }));
}

export function requestOpenBugReport() {
  globalThis.window?.dispatchEvent(new CustomEvent(OPEN_BUG_REPORT_EVENT));
}
