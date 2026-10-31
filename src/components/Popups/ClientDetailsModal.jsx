import { createElement, useEffect } from 'react';
import { X, User, Mail, Phone, MapPin, Globe, Tag, BadgeCheck, Target } from 'lucide-react';
import './ClientDetailsModal.css';

const STATUS_META = {
  active:       { badgeClass: 'ui-status-ok',      pillTone: 'is-ok' },
  inactive:     { badgeClass: 'ui-status-neutral', pillTone: 'is-neutral' },
  unregistered: { badgeClass: 'ui-status-warn',    pillTone: 'is-warn' },
  pending:      { badgeClass: 'ui-status-info',    pillTone: 'is-info' },
  blocked:      { badgeClass: 'ui-status-danger',  pillTone: 'is-danger' },
  suspended:    { badgeClass: 'ui-status-danger',  pillTone: 'is-danger' },
};

const resolveStatusMeta = (status) => {
  const key = String(status || '').trim().toLowerCase();
  return STATUS_META[key] || { badgeClass: 'ui-status-neutral', pillTone: 'is-neutral' };
};

const formatDisplayValue = (value) => {
  if (value === undefined || value === null) return null;
  const trimmed = String(value).trim();
  if (!trimmed || trimmed === '-' || trimmed === '—' || trimmed.toLowerCase() === 'undefined') {
    return null;
  }
  return trimmed;
};

const getInitials = (name) => {
  const clean = formatDisplayValue(name);
  if (!clean) return '?';
  const parts = clean.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
  }
  return parts[0].slice(0, 2).toUpperCase();
};

const FieldItem = ({ icon: Icon, label, value, mono = false, children }) => {
  const cleanValue = formatDisplayValue(value);
  const hasContent = Boolean(children || cleanValue);

  return (
    <div className="client-details-item">
      <span className="client-details-item-icon" aria-hidden="true">
        {createElement(Icon, { size: 14, strokeWidth: 1.85 })}
      </span>
      <div className="client-details-item-content">
        <div className="client-details-item-label">{label}</div>
        <div className={`client-details-item-value${mono ? ' is-mono tabular' : ''}${!hasContent ? ' is-empty' : ''}`}>
          {children || cleanValue || '—'}
        </div>
      </div>
    </div>
  );
};

export default function ClientDetailsModal({ client, onClose }) {
  useEffect(() => {
    if (!client) return undefined;
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose?.();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [client, onClose]);

  if (!client) return null;

  const displayName = formatDisplayValue(client.name) || `Client ${client.id}`;
  const cleanEmail = formatDisplayValue(client.email);
  const cleanStatus = formatDisplayValue(client.status);
  const cleanType = formatDisplayValue(client.type);
  const statusMeta = resolveStatusMeta(cleanStatus);

  return (
    <div
      className="ui-modal-backdrop client-details-backdrop"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose?.();
      }}
    >
      <div
        className="ui-modal client-details-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="client-details-modal-title"
      >
        <header className="ui-modal-header client-details-header">
          <div className="client-details-identity">
            <span className="client-details-avatar" aria-hidden="true">
              {getInitials(client.name)}
            </span>
            <div className="client-details-heading">
              <div className="client-details-title-row">
                <h2 id="client-details-modal-title" className="client-details-name">
                  {displayName}
                </h2>
                {cleanStatus && (
                  <span className={`client-details-status-pill ${statusMeta.pillTone}`}>
                    <span className="client-details-status-dot" aria-hidden="true" />
                    <span>{cleanStatus}</span>
                  </span>
                )}
              </div>
              <div className="client-details-meta">
                <span className="client-details-id-pill tabular">ID {client.id}</span>
                {cleanType && (
                  <>
                    <span className="client-details-meta-sep" aria-hidden="true">·</span>
                    <span>{cleanType}</span>
                  </>
                )}
              </div>
            </div>
          </div>
          <button
            type="button"
            className="client-details-close x"
            aria-label="Close client details"
            onClick={onClose}
          >
            <X size={15} />
          </button>
        </header>

        <div className="ui-modal-body client-details-body">
          <div className="client-details-grid">
            <FieldItem icon={User} label="Full Name" value={client.name} />
            <FieldItem icon={Mail} label="Email" value={cleanEmail}>
              {cleanEmail ? (
                <a href={`mailto:${cleanEmail}`} className="client-details-email-link">
                  {cleanEmail}
                </a>
              ) : null}
            </FieldItem>
            <FieldItem icon={Phone} label="Phone" value={client.phone} mono />
            <FieldItem icon={BadgeCheck} label="Status" value={cleanStatus}>
              {cleanStatus ? (
                <span className={`ui-status ${statusMeta.badgeClass}`} style={{ textTransform: 'capitalize' }}>
                  {cleanStatus}
                </span>
              ) : null}
            </FieldItem>
            <FieldItem icon={MapPin} label="City" value={client.city} />
            <FieldItem icon={Globe} label="Country" value={client.country} />
            <FieldItem icon={Tag} label="Type" value={client.type} />
            <FieldItem icon={Target} label="Lead" value={client.lead} />
          </div>
        </div>

        <footer className="ui-modal-footer client-details-footer">
          <button type="button" className="ui-btn ui-btn-secondary ui-btn-sm" onClick={onClose}>
            Close
          </button>
          {cleanEmail && (
            <a
              href={`mailto:${cleanEmail}`}
              className="ui-btn ui-btn-primary ui-btn-sm"
              style={{ textDecoration: 'none' }}
            >
              <Mail size={13} />
              Send Email
            </a>
          )}
        </footer>
      </div>
    </div>
  );
}
