// Shared data-grid utilities — pure functions, no React.
// Used by the ClientsContextMenu "Copy As" and "Export" items.

/** Quote a value for CSV/TSV if it contains the delimiter, quote, or newline. */
const csvCell = (v, delim) => {
  if (v === null || v === undefined) return '';
  const s = String(v);
  if (s.includes(delim) || s.includes('"') || s.includes('\n') || s.includes('\r')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
};

/** Serialize rows → CSV/TSV string. `columns` is [{ key, label }, ...]. */
export function rowsToDelimited(rows, columns, delim = ',') {
  if (!rows || rows.length === 0) return '';
  const header = columns.map(c => csvCell(c.label || c.key, delim)).join(delim);
  const body = rows
    .map(r => columns.map(c => csvCell(r[c.key], delim)).join(delim))
    .join('\n');
  return `${header}\n${body}`;
}

export const rowsToCSV = (rows, columns) => rowsToDelimited(rows, columns, ',');
export const rowsToTSV = (rows, columns) => rowsToDelimited(rows, columns, '\t');

/** JSON export — strips columns not in the visible set, preserves types. */
export function rowsToJSON(rows, columns) {
  const visibleKeys = columns.map(c => c.key);
  const picked = rows.map(r => {
    const out = {};
    for (const k of visibleKeys) out[k] = r[k];
    return out;
  });
  return JSON.stringify(picked, null, 2);
}

/** Copy a string to the clipboard. Returns a promise that resolves on success. */
export async function copyToClipboard(text) {
  if (navigator.clipboard?.writeText) {
    return navigator.clipboard.writeText(text);
  }
  // Fallback for insecure contexts (http://)
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.select();
  try { document.execCommand('copy'); } finally { document.body.removeChild(ta); }
}

/** Trigger a browser download of the given text blob. */
export function downloadBlob(text, filename, mime = 'text/csv;charset=utf-8') {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Revoke after a tick so Safari finishes the download.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Build a date-stamped filename, e.g. "clients-2026-04-15.csv". */
export function stampedFilename(base, ext) {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${base}-${y}-${m}-${dd}.${ext}`;
}
