import { useState, useEffect, useRef } from 'react';
import { Settings, Save, X, Check, ChevronRight } from 'lucide-react';

const Sep = () => <div className="ui-ctxmenu-sep" />;

const Item = ({ text, icon: Icon, iconTone, rightText, rightIcon: RightIcon, hasCheck, disabled, submenu, onClick }) => {
  const [isHovered, setIsHovered] = useState(false);
  const closeTimeout = useRef(null);
  const toneColor = {
    ok:      'var(--ok-text)',
    danger:  'var(--danger-text)',
    warn:    'var(--warn-text)',
    accent:  'var(--accent-text)',
    info:    'var(--info-text)',
  }[iconTone] || 'var(--text-3)';

  const onEnter = () => { if (closeTimeout.current) clearTimeout(closeTimeout.current); setIsHovered(true); };
  const onLeave = () => { closeTimeout.current = setTimeout(() => setIsHovered(false), 150); };

  return (
    <div
      className={`ui-ctxmenu-item relative ${disabled ? 'is-disabled' : ''} ${isHovered && submenu ? 'is-active' : ''}`}
      onClick={disabled ? undefined : onClick}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
    >
      <span className="w-4 h-4 inline-flex items-center justify-center">
        {hasCheck ? <Check size={12} strokeWidth={2.5} style={{ color: 'var(--accent)' }} />
          : Icon ? <Icon size={14} strokeWidth={1.75} style={{ color: toneColor }} /> : null}
      </span>
      <span className="flex-1">{text}</span>
      {rightText && <span className="kbd">{rightText}</span>}
      {RightIcon && <RightIcon size={13} style={{ color: 'var(--muted)' }} />}

      {submenu && isHovered && (
        <div
          className="ui-ctxmenu absolute top-0 left-full ml-1 z-[10000]"
          style={{ minWidth: 220 }}
          onMouseEnter={onEnter}
          onMouseLeave={onLeave}
        >
          {submenu.map((it, idx) => <Item key={idx} {...it} />)}
        </div>
      )}
    </div>
  );
};

const AnalyticsContextMenu = ({ x, y, onClose }) => {
  useEffect(() => {
    const handleClick = () => onClose();
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, [onClose]);

  const style = {
    top:  Math.min(y, window.innerHeight - 450),
    left: Math.min(x, window.innerWidth - 450),
  };

  const handleSaveMock = () => alert('Layout and settings have been saved locally.');

  const onlineUserMetricsSubmenu = [
    { text: 'Online Users by Country' }, { text: 'Online Users by Group' },
    { text: 'Online Users by City' },    { text: 'Online Users by Balance' },
    { text: 'Online Users by Type' },    { text: 'Online Users by Build' },
    { text: 'Online Users by Color' },
  ];

  const summarySubmenu = [
    { text: 'Total Active Accounts' },
    { text: 'Total Net Deposits' },
    { text: 'Total Withdrawal/Deposit Ratio' },
    { text: 'Total Broker Floating P/L' },
    { text: 'Summary Exposure by A/B-Book' },
    { text: 'Summary A-Book by Symbol Group' },
    { text: 'Summary B-Book by Symbol Group' },
  ];

  return (
    <div
      className="ui-ctxmenu fixed z-[9999]"
      style={{ ...style, width: 240 }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <Item text="Add Online User Metrics"      rightIcon={ChevronRight} submenu={onlineUserMetricsSubmenu} />
      <Item text="Add Account Metrics"          rightIcon={ChevronRight} />
      <Item text="Add Position Metrics"         rightIcon={ChevronRight} />
      <Item text="Add Order Metrics"            rightIcon={ChevronRight} />
      <Item text="Add Summary"                  rightIcon={ChevronRight} submenu={summarySubmenu} />
      <Item text="Add Finteza Website"          rightIcon={ChevronRight} />
      <Item text="Add Finteza Campaign"         rightIcon={ChevronRight} />
      <Item text="Add Ultency Liquidity Provider" rightIcon={ChevronRight} />
      <Item text="Add External"                 rightIcon={ChevronRight} />
      <Sep />
      <Item text="Edit"    icon={Settings} iconTone="accent" rightText="Ctrl+E" />
      <Item text="Save"    icon={Save}     iconTone="accent" rightText="Ctrl+S" onClick={handleSaveMock} />
      <Item text="Save as" rightIcon={ChevronRight} onClick={handleSaveMock} />
      <Item text="Delete"  icon={X}        iconTone="danger" />
      <Sep />
      <Item text="Title"                hasCheck />
      <Item text="Legend" />
      <Item text="Details"              hasCheck />
      <Item text="Zero base value axis" hasCheck />
      <Item text="Type"     rightIcon={ChevronRight} />
      <Item text="Stacking" rightIcon={ChevronRight} />
      <Item text="Top"      rightIcon={ChevronRight} />
      <Sep />
      <Item text="Auto Arrange" hasCheck />
      <Item text="Grid"         hasCheck />
    </div>
  );
};

export default AnalyticsContextMenu;
