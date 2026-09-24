import { useEffect, useRef, useState } from 'react';
import {
  Activity, ClipboardCheck, FileClock, Gavel, GitBranch, Handshake, Plus,
  TrendingUp, User, UserRound, Users, X,
} from 'lucide-react';
import { useLocation } from 'react-router-dom';
import useWorkspaceNavigation from '../../hooks/useWorkspaceNavigation';
import { useT } from '../../i18n/index.js';

const DEFAULT_WORKSPACE_TABS = [
  { labelKey: 'tabs.dashboard', path: '/dashboard', match: (path) => ['/', '/dashboard', '/admin-dashboard'].includes(path) },
  { labelKey: 'tabs.exposure', path: '/exposure' },
  { labelKey: 'tabs.liquidity', path: '/symbols' },
  { labelKey: 'tabs.riskMonitor', path: '/dealer/restrictions' },
  { labelKey: 'tabs.compliance', path: '/clients' },
];

const QUICK_NAVIGATION = [
  { labelKey: 'tabs.dailyReport', path: '/reports/daily', icon: FileClock },
  { labelKey: 'tabs.tradingAnalytics', path: '/analytics/trading-accounts', icon: TrendingUp },
  { labelKey: 'tabs.onlineUsers', path: '/analytics/online-users', icon: Users },
  { labelKey: 'tabs.openPositions', path: '/analytics/open-positions', icon: Activity },
  { labelKey: 'tabs.openOrders', path: '/analytics/open-orders', icon: ClipboardCheck },
  { labelKey: 'tabs.clients', path: '/clients', icon: UserRound },
  { labelKey: 'tabs.tradingAccounts', path: '/clients/trading-accounts', icon: User },
  { labelKey: 'tabs.positionHistory', path: '/clients/positions', icon: FileClock },
  { labelKey: 'tabs.dealingDesk', path: '/dealing', icon: Activity },
  { labelKey: 'tabs.dealerQueue', path: '/dealer/queue', icon: Gavel },
  { labelKey: 'tabs.ibAccounts', path: '/ib', icon: Handshake },
  { labelKey: 'tabs.ibTree', path: '/ib/tree', icon: GitBranch },
];

import { loadAnalyticsTree, findNodeInfo } from '../analyticsNavigatorState.js';

const isTabActive = (tab, pathname) => {
  if (tab.match) return tab.match(pathname);
  return pathname === tab.path || pathname.startsWith(`${tab.path}/`);
};

const findKnownTab = (pathname) => {
  const allKnown = [...DEFAULT_WORKSPACE_TABS, ...QUICK_NAVIGATION];
  const found = allKnown.find((tab) => isTabActive(tab, pathname));
  if (found) return found;

  if (pathname.startsWith('/analytics/custom')) {
    const reportId = pathname.replace('/analytics/custom/', '').replace('/analytics/custom', '');
    const tree = loadAnalyticsTree();
    const info = reportId ? findNodeInfo(tree, reportId) : null;
    const label = info?.node?.label || 'Custom Analytics';
    return { label, path: pathname, icon: TrendingUp };
  }
  return null;
};

export default function WorkspaceTabs() {
  const location = useLocation();
  const navigate = useWorkspaceNavigation();
  const t = useT();
  const [tabs, setTabs] = useState(DEFAULT_WORKSPACE_TABS);
  const [isQuickNavOpen, setIsQuickNavOpen] = useState(false);
  const tabsRef = useRef(null);
  const visibleTabs = tabs;

  // If the user navigates (sidebar, deep-link, etc.) to a known workspace
  // that is not currently in the tab strip, pin it at the end (just before +).
  useEffect(() => {
    const matchingKnown = findKnownTab(location.pathname);
    if (!matchingKnown) return;
    setTabs((current) => {
      if (current.some((tab) => tab.path === matchingKnown.path)) return current;
      // Re-insert closed defaults at their original position, append new ones at end.
      const defaultIndex = DEFAULT_WORKSPACE_TABS.findIndex((tab) => tab.path === matchingKnown.path);
      if (defaultIndex === -1) return [...current, { label: matchingKnown.label, labelKey: matchingKnown.labelKey, path: matchingKnown.path }];
      const next = [...current];
      let insertAt = next.length;
      for (let i = defaultIndex + 1; i < DEFAULT_WORKSPACE_TABS.length; i += 1) {
        const siblingIndex = next.findIndex((tab) => tab.path === DEFAULT_WORKSPACE_TABS[i].path);
        if (siblingIndex !== -1) {
          insertAt = siblingIndex;
          break;
        }
      }
      next.splice(insertAt, 0, { label: matchingKnown.label, labelKey: matchingKnown.labelKey, path: matchingKnown.path });
      return next;
    });
  }, [location.pathname, location.key]);

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

  const closeTab = (tabToClose) => {
    setTabs((current) => current.filter((tab) => tab.path !== tabToClose.path));
  };

  const openQuickNavigation = (item) => {
    // Pin the selected heading at the end of the strip (just before +),
    // then move + after it. Navigating triggers the active state.
    setTabs((current) => {
      if (current.some((tab) => tab.path === item.path)) return current;
      return [...current, { labelKey: item.labelKey, path: item.path }];
    });
    setIsQuickNavOpen(false);
    navigate(item.path);
  };

  // Only offer workspaces that aren't already pinned in the strip.
  const availableQuickNav = QUICK_NAVIGATION.filter(
    (item) => !visibleTabs.some((tab) => tab.path === item.path),
  );

  return (
    <div ref={tabsRef} className="cc-workspace-tabs" role="tablist" aria-label={t('tabs.openWorkspaces')}>
      <div className="cc-workspace-tab-scroll">
        {visibleTabs.map((tab) => {
          const isActive = isTabActive(tab, location.pathname);
          const tabLabel = tab.label || t(tab.labelKey);
          return (
            <div key={tab.path} className={`cc-workspace-tab-shell ${isActive ? 'is-active' : ''}`}>
              <button
                type="button"
                className="cc-workspace-tab"
                role="tab"
                aria-selected={isActive}
                title={tabLabel}
                onPointerEnter={() => navigate.preload?.(tab.path)}
                onClick={() => navigate(tab.path)}
              >
                <span>{tabLabel}</span>
              </button>
                <button type="button" className="cc-workspace-tab-close" title={`${t('tabs.close')} ${tabLabel}`} aria-label={`${t('tabs.close')} ${tabLabel}`} onClick={() => closeTab(tab)}>
                  <X size={12} />
                </button>
            </div>
          );
        })}
      </div>
      <div className="cc-workspace-add-wrap">
        <button
          type="button"
          className={`cc-workspace-add ${isQuickNavOpen ? 'is-open' : ''}`}
          title={t('tabs.openQuickNavigation')}
          aria-label={t('tabs.openQuickNavigation')}
          aria-haspopup="menu"
          aria-expanded={isQuickNavOpen}
          onClick={() => setIsQuickNavOpen((open) => !open)}
        ><Plus size={15} /></button>
        {isQuickNavOpen && (
          <div className="cc-workspace-add-menu" role="menu" aria-label={t('tabs.quickNavigation')}>
            <strong>{t('tabs.quickNavigation')}</strong>
            {availableQuickNav.map((item) => {
              const Icon = item.icon;
              return (
                <button key={item.path} type="button" role="menuitem" onClick={() => openQuickNavigation(item)}>
                  <Icon size={13} />
                  <span>{t(item.labelKey)}</span>
                </button>
              );
            })}
            {availableQuickNav.length === 0 && (
              <small>{t('tabs.allOpen')}</small>
            )}
          </div>
        )}
      </div>
      <div className="cc-workspace-spacer" />
    </div>
  );
}
