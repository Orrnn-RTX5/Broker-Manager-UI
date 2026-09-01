import { downloadBlob, stampedFilename } from './gridUtils';

const cleanText = (value) => String(value || '').replace(/\s+/g, ' ').trim();
const escapeHtml = (value) => cleanText(value)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

const csvCell = (value) => {
  const text = cleanText(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

const getTableRows = (table) => Array.from(table.querySelectorAll('tbody tr'))
  .map((row) => Array.from(row.querySelectorAll('td, th')).map((cell) => cleanText(cell.textContent)))
  .filter((row) => row.some(Boolean));

const getTableHeaders = (table) => {
  const headerRow = Array.from(table.querySelectorAll('thead tr')).at(-1);
  if (headerRow) {
    return Array.from(headerRow.querySelectorAll('th, td')).map((cell) => cleanText(cell.textContent));
  }

  const firstRow = table.querySelector('tr');
  return firstRow
    ? Array.from(firstRow.querySelectorAll('th, td')).map((cell) => cleanText(cell.textContent))
    : [];
};

const visibleTables = (root) => Array.from(root.querySelectorAll('table'))
  .filter((table) => table.getClientRects().length > 0)
  .map((table) => ({ table, headers: getTableHeaders(table), rows: getTableRows(table) }))
  .filter(({ headers, rows }) => headers.length > 0 && rows.length > 0);

export const getCurrentViewExportData = () => {
  if (typeof document === 'undefined') return null;

  const root = document.querySelector('[data-export-current-view]') || document;
  const candidates = visibleTables(root);
  if (!candidates.length) return null;

  // The current view may contain supporting tables; export the primary table
  // with the most visible rows rather than a docked utility panel.
  const source = candidates.sort((a, b) => b.rows.length - a.rows.length)[0];
  const includedIndexes = source.headers
    .map((header, index) => ({ header, index }))
    .filter(({ header }) => header.toLowerCase() !== 'actions')
    .map(({ index }) => index);
  const headers = includedIndexes.map((index) => source.headers[index] || `Column ${index + 1}`);
  const rows = source.rows.map((row) => includedIndexes.map((index) => row[index] || ''));
  const title = cleanText(root.querySelector('h1')?.textContent) || 'manager-data';

  return { title, headers, rows };
};

const filenameBase = (title) => cleanText(title)
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-|-$/g, '') || 'manager-data';

const toCsv = ({ headers, rows }) => [headers, ...rows]
  .map((row) => row.map(csvCell).join(','))
  .join('\r\n');

const toExcelHtml = ({ title, headers, rows }) => `<!doctype html>
<html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title></head>
<body><table border="1"><thead><tr>${headers.map((header) => `<th>${escapeHtml(header)}</th>`).join('')}</tr></thead>
<tbody>${rows.map((row) => `<tr>${row.map((value) => `<td>${escapeHtml(value)}</td>`).join('')}</tr>`).join('')}</tbody></table></body></html>`;

const toPrintHtml = ({ title, headers, rows }) => `<!doctype html>
<html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>
<style>body{font:12px Arial,sans-serif;color:#111;margin:28px}h1{font-size:18px;margin:0 0 16px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #b7c3d0;padding:7px;text-align:left;vertical-align:top}th{background:#eaf1f8;font-weight:700}@media print{body{margin:12mm}}</style>
</head><body><h1>${escapeHtml(title)}</h1><table><thead><tr>${headers.map((header) => `<th>${escapeHtml(header)}</th>`).join('')}</tr></thead>
<tbody>${rows.map((row) => `<tr>${row.map((value) => `<td>${escapeHtml(value)}</td>`).join('')}</tr>`).join('')}</tbody></table></body></html>`;

export const exportCurrentView = (format, data = getCurrentViewExportData()) => {
  if (!data?.rows?.length) throw new Error('There is no visible table data to export on this page.');

  const base = filenameBase(data.title);
  if (format === 'csv') {
    downloadBlob(`\uFEFF${toCsv(data)}`, stampedFilename(base, 'csv'), 'text/csv;charset=utf-8');
    return;
  }

  if (format === 'excel') {
    downloadBlob(toExcelHtml(data), stampedFilename(base, 'xls'), 'application/vnd.ms-excel;charset=utf-8');
    return;
  }

  if (format === 'pdf') {
    const printWindow = window.open('', '_blank', 'width=1000,height=800');
    if (!printWindow) throw new Error('Your browser blocked the print window. Allow pop-ups and try again.');
    printWindow.opener = null;
    printWindow.document.write(toPrintHtml(data));
    printWindow.document.close();
    printWindow.focus();
    window.setTimeout(() => printWindow.print(), 100);
    return;
  }

  throw new Error('Choose CSV, Excel, or PDF.');
};
