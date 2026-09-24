import { X, User, Mail, Phone, MapPin, Globe, Tag, BadgeCheck, Target } from 'lucide-react';

const STATUS_BADGE = {
  Active:       'ui-status-ok',
  Inactive:     'ui-status-neutral',
  Unregistered: 'ui-status-warn',
  Pending:      'ui-status-info',
};

const Row = ({ icon: Icon, label, value, mono }) => (
  <div className="flex items-start gap-3 py-3 px-4" style={{ borderBottom: '1px solid var(--border-2)' }}>
    <span
      className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5"
      style={{ background: 'var(--surface-2)', color: 'var(--text-3)' }}
    >
      <Icon size={14} />
    </span>
    <div className="flex-1 min-w-0">
      <div className="text-[11px] uppercase tracking-wider font-semibold" style={{ color: 'var(--text-3)' }}>{label}</div>
      <div
        className={`text-sm mt-0.5 break-words ${mono ? 'font-mono tabular' : ''}`}
        style={{ color: 'var(--text)', fontWeight: 500 }}
      >
        {value || <span style={{ color: 'var(--muted)', fontWeight: 400 }}>—</span>}
      </div>
    </div>
  </div>
);

export default function ClientDetailsModal({ client, onClose }) {
  if (!client) return null;
  return (
    <div className="ui-modal-backdrop" style={{ zIndex: 99999 }}>
      <div className="ui-modal" style={{ width: 520 }}>
        <div className="ui-modal-header">
          <span
            className="w-10 h-10 rounded-xl flex items-center justify-center mr-3 text-lg font-semibold"
            style={{ background: 'var(--accent-soft)', color: 'var(--accent-text)' }}
          >
            {(client.name || '?').charAt(0).toUpperCase()}
          </span>
          <div className="flex-1">
            <div className="text-[15px] font-semibold leading-tight" style={{ color: 'var(--text)' }}>
              {client.name || `Client ${client.id}`}
            </div>
            <div className="flex items-center gap-2 mt-1">
              <span className="tabular text-xs font-mono" style={{ color: 'var(--text-3)' }}>ID {client.id}</span>
              {client.status && (
                <span className={`ui-status ${STATUS_BADGE[client.status] || 'ui-status-neutral'}`}>
                  {client.status}
                </span>
              )}
            </div>
          </div>
          <span className="x" onClick={onClose}><X size={16} /></span>
        </div>

        <div className="ui-modal-body" style={{ padding: 0, maxHeight: '70vh' }}>
          <Row icon={User}       label="Full Name" value={client.name} />
          <Row icon={Mail}       label="Email"     value={client.email} />
          <Row icon={Phone}      label="Phone"     value={client.phone} mono />
          <Row icon={MapPin}     label="City"      value={client.city} />
          <Row icon={Globe}      label="Country"   value={client.country} />
          <Row icon={Tag}        label="Type"      value={client.type} />
          <Row icon={BadgeCheck} label="Status"    value={client.status} />
          <Row icon={Target}     label="Lead"      value={client.lead === 'Undefined' ? null : client.lead} />
        </div>

        <div className="ui-modal-footer">
          <button className="ui-btn ui-btn-secondary ui-btn-sm" onClick={onClose}>Close</button>
          {client.email && (
            <a href={`mailto:${client.email}`} className="ui-btn ui-btn-primary ui-btn-sm" style={{ textDecoration: 'none' }}>
              <Mail size={13} />
              Send Email
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
