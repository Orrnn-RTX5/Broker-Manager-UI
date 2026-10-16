import { showResult } from '../store/resultDialogStore.js';
import { AlertCircle, Download, FileSpreadsheet, FileText, X } from 'lucide-react';
import { createElement } from 'react';
import { exportCurrentView, getCurrentViewExportData } from '../utils/currentViewExport';

const exportFormats = [
  { id: 'csv', label: 'CSV', detail: 'Universal spreadsheet data file', icon: Download },
  { id: 'excel', label: 'Excel', detail: 'Excel-compatible worksheet (.xls)', icon: FileSpreadsheet },
  { id: 'pdf', label: 'PDF', detail: 'Opens Save as PDF in the print dialog', icon: FileText },
];

const ExportCurrentViewDialog = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  const data = getCurrentViewExportData();
  const rows = data?.rows.length || 0;

  const handleExport = (format) => {
    try {
      exportCurrentView(format, data);
      onClose();
    } catch (error) {
      showResult.error(error.message || 'Could not export the current page data.');
    }
  };

  return (
    <div className="fixed inset-0 z-[10001] flex items-center justify-center p-4" style={{ background: 'transparent' }} role="presentation" onMouseDown={onClose}>
      <section className="ui-card w-full max-w-md p-5" role="dialog" aria-modal="true" aria-labelledby="export-current-view-title" onMouseDown={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="export-current-view-title" className="text-base font-semibold" style={{ color: 'var(--text)' }}>Export current data</h2>
            <p className="mt-1 text-xs" style={{ color: 'var(--text-3)' }}>
              {rows ? `${rows} visible row${rows === 1 ? '' : 's'} from ${data.title}.` : 'No visible data table was found on this page.'}
            </p>
          </div>
          <button type="button" className="ui-btn ui-btn-ghost ui-btn-sm p-1" onClick={onClose} aria-label="Close export dialog"><X size={16} /></button>
        </div>

        {!rows && (
          <div className="mt-4 flex items-start gap-2 rounded-md p-3 text-xs" style={{ color: 'var(--warning, var(--text-2))', background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
            <AlertCircle size={15} className="shrink-0" />
            Navigate to a page with a data table, then choose Export again.
          </div>
        )}

        <div className="mt-4 grid gap-2">
          {exportFormats.map(({ id, label, detail, icon: Icon }) => (
            <button key={id} type="button" disabled={!rows} onClick={() => handleExport(id)} className="ui-btn ui-btn-secondary flex items-center gap-3 px-3 py-3 text-left disabled:cursor-not-allowed">
              {createElement(Icon, { size: 18, style: { color: 'var(--accent)' } })}
              <span className="flex flex-col">
                <span className="text-sm font-medium" style={{ color: 'var(--text)' }}>{label}</span>
                <span className="text-xs" style={{ color: 'var(--text-3)' }}>{detail}</span>
              </span>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
};

export default ExportCurrentViewDialog;
