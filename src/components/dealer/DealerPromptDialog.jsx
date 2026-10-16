import { useState } from 'react';

const DealerPromptDialog = ({ title, fields, onSubmit, onCancel, loading }) => {
  const [values, setValues] = useState(() => {
    const init = {};
    fields.forEach((field) => {
      init[field.key] = field.defaultValue ?? '';
    });
    return init;
  });

  return (
    <div
      className="fixed inset-0 z-[10001] flex items-center justify-center p-4 animate-in fade-in duration-200"
      style={{ background: 'transparent', backdropFilter: 'none' }}
      onClick={onCancel}
    >
      <div
        className="ui-card p-6 flex flex-col gap-4 animate-in zoom-in-95 duration-200 shadow-2xl"
        style={{ minWidth: 340, maxWidth: 450 }}
        onClick={(event) => event.stopPropagation()}
      >
        <div>
          <h3 className="text-lg font-bold" style={{ color: 'var(--text)' }}>{title}</h3>
          <p className="text-[10px] uppercase tracking-widest font-semibold mt-1" style={{ color: 'var(--muted)' }}>
            Trading Authorization Required
          </p>
        </div>

        <div className="flex flex-col gap-4 my-2">
          {fields.map((field) => (
            <div key={field.key} className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold" style={{ color: 'var(--text-2)' }}>{field.label}</label>
              <input
                type={field.type || 'text'}
                step={field.step}
                value={values[field.key]}
                onChange={(event) => setValues((previous) => ({ ...previous, [field.key]: event.target.value }))}
                className="ui-input"
                placeholder={field.placeholder}
                required={field.required}
                autoFocus={field === fields[0]}
              />
              {field.hint && <span className="text-[10px] leading-tight" style={{ color: 'var(--warn-text)' }}>{field.hint}</span>}
            </div>
          ))}
        </div>

        <div className="flex gap-3 justify-end pt-2">
          <button
            className="px-4 py-2 text-sm font-semibold rounded-lg hover:bg-white/5 transition-colors"
            onClick={onCancel}
            disabled={loading}
          >
            Cancel
          </button>
          <button
            className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg transition-all shadow-lg shadow-blue-600/20 disabled:opacity-50"
            disabled={loading}
            onClick={() => onSubmit(values)}
          >
            {loading ? 'Processing...' : 'Execute Order'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default DealerPromptDialog;
