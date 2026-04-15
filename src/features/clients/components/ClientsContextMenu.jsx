import { useState, useEffect, useRef } from 'react';
import { X, Check, ChevronRight, UserPlus, UserSquare, Mail, BookOpen, Search, RefreshCw } from 'lucide-react';

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
          style={{ minWidth: 200 }}
          onMouseEnter={onEnter}
          onMouseLeave={onLeave}
        >
          {submenu.map((it, idx) => <Item key={idx} {...it} />)}
        </div>
      )}
    </div>
  );
};

const ClientsContextMenu = ({ x, y, onClose }) => {
  useEffect(() => {
    const handleClick = () => onClose();
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, [onClose]);

  const style = {
    top:  Math.min(y, window.innerHeight - 450),
    left: Math.min(x, window.innerWidth - 400),
  };

  const handleCopyMock = (type) => {
    const mockData = `Mock ${type} Data:\nLogin\tName\tGroup\n1001\tJohn Doe\treal\n1002\tJane Smith\tdemo`;
    navigator.clipboard.writeText(mockData);
    alert(`${type} data copied to clipboard!`);
  };

  const handleExport = () => {
    alert('Exporting mock data to CSV...\nIn a real scenario, this would trigger a file download.');
  };

  const selectBySubmenu = [{ text: 'All' }, { text: 'None' }, { text: 'Invert Selection' }];
  const filterSubmenu   = [{ text: 'Contains' }, { text: 'Equals' }, { text: 'Starts with' }, { text: 'Clear Filter' }];
  const copyAsSubmenu   = [
    { text: 'Text', onClick: () => handleCopyMock('Text') },
    { text: 'CSV',  onClick: () => handleCopyMock('CSV') },
    { text: 'JSON', onClick: () => handleCopyMock('JSON') },
  ];
  const columnsSubmenu  = [
    { text: 'Login', hasCheck: true }, { text: 'Name', hasCheck: true },
    { text: 'Group', hasCheck: true }, { text: 'Country', hasCheck: true },
    { text: 'City', hasCheck: true },
  ];

  return (
    <div
      className="ui-ctxmenu fixed z-[9999]"
      style={{ ...style, width: 240 }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <Item text="New Client"        icon={UserPlus}   iconTone="ok"     rightText="Ctrl+Shift+N" />
      <Item text="Client Details"    icon={UserSquare} iconTone="accent" />
      <Item text="Fix Personal Data" icon={UserSquare} iconTone="info" />
      <Sep />
      <Item text="Email"   icon={Mail}     iconTone="warn" />
      <Item text="Journal" icon={BookOpen} iconTone="warn" />
      <Sep />
      <Item text="Select By" rightIcon={ChevronRight} submenu={selectBySubmenu} />
      <Item text="Filter"    rightIcon={ChevronRight} submenu={filterSubmenu} />
      <Item text="Copy As"   rightIcon={ChevronRight} submenu={copyAsSubmenu} />
      <Item text="Export"    icon={RefreshCw} iconTone="ok" onClick={handleExport} />
      <Item text="Find"      icon={Search} rightText="Ctrl+F" disabled />
      <Sep />
      <Item text="Delete Clients" icon={X} iconTone="danger" rightText="Ctrl+D" />
      <Sep />
      <Item text="Auto Scroll" />
      <Item text="Auto Arrange" hasCheck rightText="A" />
      <Item text="Grid"         hasCheck rightText="G" />
      <Sep />
      <Item text="Columns" rightIcon={ChevronRight} submenu={columnsSubmenu} />
    </div>
  );
};

export default ClientsContextMenu;
