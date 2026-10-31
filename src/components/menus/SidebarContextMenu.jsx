import { useEffect, useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import '../Popups/AccountPanel.css';

const SidebarContextMenu = ({ x, y, account, onClose, onAction, onIntent, isBlocked, canManageAccounts = true, canManageRestrictions = true }) => {
  const menuRef = useRef(null);
  const login = typeof account === 'object' ? account.login : account;
  useLayoutEffect(() => {
    const menu = menuRef.current;
    if (!menu) return;
    const box = menu.getBoundingClientRect();
    menu.style.left = `${Math.max(8, Math.min(x, window.innerWidth - box.width - 8))}px`;
    menu.style.top = `${Math.max(8, Math.min(y, window.innerHeight - box.height - 8))}px`;
    menu.querySelector('button:not(:disabled)')?.focus({ preventScroll: true });
  }, [x, y]);
  useEffect(() => {
    const outside = event => { if (!menuRef.current?.contains(event.target)) onClose(); };
    const escape = event => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('mousedown', outside);
    document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('mousedown', outside); document.removeEventListener('keydown', escape); };
  }, [onClose]);
  const keyboard = event => {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const buttons = [...menuRef.current.querySelectorAll('button:not(:disabled)')];
    const index = buttons.indexOf(document.activeElement);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
    buttons[next]?.focus();
  };
  const item = (action, label, disabled = false, title) => <button key={action} type="button" role="menuitem" className={`ui-ctxmenu-item${disabled ? ' is-disabled' : ''}${action === 'delete' ? ' is-danger' : ''}`} disabled={disabled} title={title}
    onPointerEnter={() => !disabled && onIntent?.(action, account)} onFocus={() => !disabled && onIntent?.(action, account)}
    onClick={() => { onAction(action, account); onClose(); }}>{label}</button>;
  const menuNode = <div ref={menuRef} className="ui-ctxmenu account-panel-context-menu" role="menu" aria-label={`Account ${login} actions`} style={{ top: y, left: x }} onKeyDown={keyboard} onClick={event => event.stopPropagation()} onContextMenu={event => { event.preventDefault(); event.stopPropagation(); }}>
    <div className="account-panel-menu-title">Account {login}</div>
    {item('details', 'Details')}
    {item('summary', 'Summary')}
    <div className="ui-ctxmenu-sep" role="separator" />
    {item('restrictions', 'Restrictions', !canManageRestrictions, !canManageRestrictions ? 'No permission to change restrictions' : undefined)}
    {item('block', 'Block', isBlocked || !canManageAccounts, !canManageAccounts ? 'No permission to block accounts' : undefined)}
    {item('unblock', 'Unblock', !isBlocked || !canManageAccounts, !canManageAccounts ? 'No permission to unblock accounts' : undefined)}
    <div className="ui-ctxmenu-sep" role="separator" />
    {item('delete', 'Delete', !canManageAccounts, !canManageAccounts ? 'No permission to delete accounts' : undefined)}
  </div>;
  if (typeof document !== 'undefined') {
    const portalTarget =
      document.querySelector('.rtx5-command-shell') ||
      document.getElementById('root') ||
      document.body;
    return createPortal(menuNode, portalTarget);
  }
  return menuNode;
};

export default SidebarContextMenu;
