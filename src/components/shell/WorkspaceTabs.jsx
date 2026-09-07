import { useEffect, useRef, useState } from 'react';
import { Activity, ClipboardCheck, Handshake, Plus, UserRound, Users, X } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import useWorkspaceNavigation from '../../hooks/useWorkspaceNavigation';

const WORKSPACE_TABS = [
  { label: 'Executive Dashboard', path: '/dashboard', match: (path) => ['/', '/dashboard', '/admin-dashboard'].includes(path) },
  { label: 'Exposure', path: '/analytics/open-positions' },
  { label: 'Liquidity', path: '/symbols' },
  { label: 'Risk Monitor', path: '/dealer/restrictions' },
  { label: 'Compliance', path: '/clients' },
];

const QUICK_NAVIGATION = [
  { label: 'Online Users', path: '/analytics/online-users', icon: Users },
  { label: 'Open Positions', path: '/analytics/open-positions', icon: Activity },
  { label: 'Open Orders', path: '/analytics/open-orders', icon: ClipboardCheck },
  { label: 'Clients', path: '/clients', icon: UserRound },
  { label: 'IB Management', path: '/ib', icon: Handshake },
];

export default function WorkspaceTabs() {
  const location = useLocation();
  const navigate = useWorkspaceNavigation();
  const [closedTabs, setClosedTabs] = useState([]);
  const [isQuickNavOpen, setIsQuickNavOpen] = useState(false);
  const tabsRef = useRef(null);
  const visibleTabs = WORKSPACE_TABS.filter((tab) => !closedTabs.includes(tab.label));

  useEffect(() => {
    const matchingTab = WORKSPACE_TABS.find((tab) => tab.match ? tab.match(location.pathname) : location.pathname === tab.path);
    if (matchingTab) {
      setClosedTabs((current) => current.includes(matchingTab.label)
        ? current.filter((label) => label !== matchingTab.label)
        : current);
    }
  }, [location.pathname]);

  useEffect(() => {
    const handlePointerDown = (event) => {
      if (!tabsRef.current?.contains(event.target)) setIsQuickNavOpen(false);
    };
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') setIsQuickNavOpen(false);
    };
    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  const closeTab = (tab) => {
    setClosedTabs((current) => current.includes(tab.label) ? current : [...current, tab.label]);
  };

  const openQuickNavigation = (path) => {
    setIsQuickNavOpen(false);
    navigate(path);
  };

  return (
    <div ref={tabsRef} className="cc-workspace-tabs" role="tablist" aria-label="Open workspaces">
      <div className="cc-workspace-tab-scroll">
        {visibleTabs.map((tab) => {
          const isActive = tab.match ? tab.match(location.pathname) : location.pathname === tab.path;
          return (
            <div key={tab.label} className={`cc-workspace-tab-shell ${isActive ? 'is-active' : ''}`}>
              <button
                type="button"
                className="cc-workspace-tab"
                role="tab"
                aria-selected={isActive}
                title={tab.label}
                onPointerEnter={() => navigate.preload?.(tab.path)}
                onClick={() => navigate(tab.path)}
              >
                <span>{tab.label}</span>
              </button>
              {!isActive && (
                <button type="button" className="cc-workspace-tab-close" title={`Close ${tab.label}`} aria-label={`Close ${tab.label}`} onClick={() => closeTab(tab)}>
                  <X size={12} />
                </button>
              )}
            </div>
          );
        })}
      </div>
      <div className="cc-workspace-add-wrap">
        <button
          type="button"
          className={`cc-workspace-add ${isQuickNavOpen ? 'is-open' : ''}`}
          title="Open quick navigation"
          aria-label="Open quick navigation"
          aria-haspopup="menu"
          aria-expanded={isQuickNavOpen}
          onClick={() => setIsQuickNavOpen((open) => !open)}
        ><Plus size={15} /></button>
        {isQuickNavOpen && (
          <div className="cc-workspace-add-menu" role="menu" aria-label="Quick navigation">
            <strong>Quick navigation</strong>
            {QUICK_NAVIGATION.map(({ label, path, icon: Icon }) => (
              <button key={path} type="button" role="menuitem" onClick={() => openQuickNavigation(path)}>
                <Icon size={13} />
                <span>{label}</span>
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="cc-workspace-spacer" />
    </div>
  );
}
