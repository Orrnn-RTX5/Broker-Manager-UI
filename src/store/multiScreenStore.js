import { create } from 'zustand';

export const MAX_MULTI_SCREENS = 6;
export const MAX_ACCOUNT_DETAIL_WINDOWS = 4;

let nextScreenCounter = 0;
let nextAccountWindowZOrder = 1;

const extractAccountLogin = (account) => {
  if (account === null || account === undefined) return '';
  if (typeof account === 'object') {
    const raw = account.login ?? account.Login ?? '';
    return String(raw).trim();
  }
  return String(account).trim();
};

const pickLowestFreeSlotIndex = (windows = []) => {
  const used = new Set(windows.map((w) => Number(w.slotIndex)).filter(Number.isInteger));
  for (let slot = 0; slot < MAX_ACCOUNT_DETAIL_WINDOWS; slot += 1) {
    if (!used.has(slot)) return slot;
  }
  return windows.length % MAX_ACCOUNT_DETAIL_WINDOWS;
};

export const buildScreenGridRows = (screens = []) => {
  const items = Array.isArray(screens) ? screens.slice(0, MAX_MULTI_SCREENS) : [];
  if (items.length === 0) return [];
  const cols = Math.ceil(Math.sqrt(items.length));
  const rows = [];
  for (let index = 0; index < items.length; index += cols) {
    rows.push(items.slice(index, index + cols));
  }
  return rows;
};

const createScreenEntry = (prefix, extra = {}) => {
  nextScreenCounter += 1;
  return {
    id: `${prefix}-screen-${nextScreenCounter}`,
    createdAt: Date.now(),
    movable: false,
    position: { x: 0, y: 0 },
    dockZone: null,
    ...extra,
  };
};

export const useMultiScreenStore = create((set, get) => ({
  accountScreens: [],
  activeAccountScreenId: null,
  groupScreens: [],
  activeGroupScreenId: null,
  activeView: null,
  isWorkspaceMovable: false,
  workspacePosition: { x: 0, y: 0 },
  workspaceDockZone: null,
  openAccountWindows: [],
  activeAccountWindowLogin: null,
  mountedAccountWindowHosts: { sidebar: false, tradingAccounts: false },

  registerAccountWindowHost: (host, mounted) => {
    if (host !== 'sidebar' && host !== 'tradingAccounts') return;
    set((state) => {
      if (Boolean(state.mountedAccountWindowHosts?.[host]) === Boolean(mounted)) return state;
      return {
        mountedAccountWindowHosts: {
          ...state.mountedAccountWindowHosts,
          [host]: Boolean(mounted),
        },
      };
    });
  },

  openAccountDetailWindow: (account, options = {}) => {
    const state = get();
    const login = extractAccountLogin(account);
    if (!login) {
      return {
        status: 'invalid',
        login: null,
        count: state.openAccountWindows.length,
        limit: MAX_ACCOUNT_DETAIL_WINDOWS,
      };
    }

    const existingIndex = state.openAccountWindows.findIndex((item) => String(item.login) === login);
    if (existingIndex !== -1) {
      nextAccountWindowZOrder += 1;
      const nextWindows = state.openAccountWindows.map((item, idx) => {
        if (idx !== existingIndex) return item;
        const nextAccount =
          typeof account === 'object' && account !== null
            ? (typeof item.account === 'object' && item.account !== null ? { ...item.account, ...account } : account)
            : item.account;
        return {
          ...item,
          account: nextAccount,
          initialTab: options.initialTab || item.initialTab || 'Overview',
          zOrder: nextAccountWindowZOrder,
        };
      });
      set({
        openAccountWindows: nextWindows,
        activeAccountWindowLogin: login,
      });
      return {
        status: 'focused',
        login,
        slotIndex: nextWindows[existingIndex].slotIndex,
        count: nextWindows.length,
        limit: MAX_ACCOUNT_DETAIL_WINDOWS,
      };
    }

    if (state.openAccountWindows.length >= MAX_ACCOUNT_DETAIL_WINDOWS) {
      const fallbackActiveLogin =
        state.activeAccountWindowLogin
        || state.openAccountWindows[state.openAccountWindows.length - 1]?.login
        || null;
      set({
        activeAccountWindowLogin: fallbackActiveLogin,
      });
      return {
        status: 'limit-reached',
        login: fallbackActiveLogin,
        count: state.openAccountWindows.length,
        limit: MAX_ACCOUNT_DETAIL_WINDOWS,
      };
    }

    nextAccountWindowZOrder += 1;
    const slotIndex = pickLowestFreeSlotIndex(state.openAccountWindows);
    const normalizedAccount = typeof account === 'object' && account !== null ? account : { login };
    const entry = {
      id: `account-detail-${login}`,
      login,
      account: normalizedAccount,
      source: options.source || 'sidebar',
      initialTab: options.initialTab || 'Overview',
      slotIndex,
      zOrder: nextAccountWindowZOrder,
      openedAt: Date.now(),
    };
    const nextWindows = [...state.openAccountWindows, entry];
    set({
      openAccountWindows: nextWindows,
      activeAccountWindowLogin: login,
    });
    return {
      status: 'added',
      login,
      slotIndex,
      count: nextWindows.length,
      limit: MAX_ACCOUNT_DETAIL_WINDOWS,
    };
  },

  closeAccountDetailWindow: (loginOrAccount) => {
    const login = extractAccountLogin(loginOrAccount);
    if (!login) return;
    set((state) => {
      const nextWindows = state.openAccountWindows.filter((item) => String(item.login) !== login);
      if (nextWindows.length === state.openAccountWindows.length) return state;
      let nextActiveLogin = state.activeAccountWindowLogin;
      if (String(nextActiveLogin) === login) {
        const topRemaining = [...nextWindows].sort((a, b) => (b.zOrder || 0) - (a.zOrder || 0))[0];
        nextActiveLogin = topRemaining?.login ?? null;
      }
      return {
        openAccountWindows: nextWindows,
        activeAccountWindowLogin: nextActiveLogin,
      };
    });
  },

  focusAccountDetailWindow: (loginOrAccount) => {
    const login = extractAccountLogin(loginOrAccount);
    if (!login) return;
    const state = get();
    if (!state.openAccountWindows.some((item) => String(item.login) === login)) return;
    nextAccountWindowZOrder += 1;
    set({
      activeAccountWindowLogin: login,
      openAccountWindows: state.openAccountWindows.map((item) => (
        String(item.login) === login ? { ...item, zOrder: nextAccountWindowZOrder } : item
      )),
    });
  },

  closeAllAccountDetailWindows: () => {
    set({
      openAccountWindows: [],
      activeAccountWindowLogin: null,
    });
  },

  openAccountScreen: (options = {}) => {
    const state = get();
    if (state.accountScreens.length >= MAX_MULTI_SCREENS) {
      const fallbackActiveId =
        state.activeAccountScreenId
        || state.accountScreens[state.accountScreens.length - 1]?.id
        || null;
      set({
        activeView: 'account',
        activeAccountScreenId: fallbackActiveId,
      });
      return {
        status: 'limit-reached',
        screenId: fallbackActiveId,
        count: state.accountScreens.length,
        limit: MAX_MULTI_SCREENS,
      };
    }

    const screen = createScreenEntry('account', options);
    const nextScreens = [...state.accountScreens, screen];
    set({
      accountScreens: nextScreens,
      activeAccountScreenId: screen.id,
      activeView: 'account',
    });
    return {
      status: 'added',
      screenId: screen.id,
      count: nextScreens.length,
      limit: MAX_MULTI_SCREENS,
    };
  },

  closeAccountScreen: (screenId) => {
    set((state) => {
      const removedIndex = state.accountScreens.findIndex((item) => item.id === screenId);
      if (removedIndex === -1) return state;
      const nextScreens = state.accountScreens.filter((item) => item.id !== screenId);
      let nextActiveId = state.activeAccountScreenId;
      if (nextActiveId === screenId) {
        const replacement = nextScreens[Math.min(removedIndex, nextScreens.length - 1)];
        nextActiveId = replacement?.id ?? null;
      }
      const nextView =
        nextScreens.length > 0
          ? state.activeView
          : state.activeView === 'account'
            ? (state.groupScreens.length > 0 ? 'group' : null)
            : state.activeView;
      return {
        accountScreens: nextScreens,
        activeAccountScreenId: nextActiveId,
        activeView: nextView,
      };
    });
  },

  closeAllAccountScreens: () => {
    set((state) => ({
      accountScreens: [],
      activeAccountScreenId: null,
      activeView:
        state.activeView === 'account'
          ? (state.groupScreens.length > 0 ? 'group' : null)
          : state.activeView,
    }));
  },

  setActiveAccountScreen: (screenId) => {
    const state = get();
    if (!screenId || state.activeAccountScreenId === screenId) return;
    if (!state.accountScreens.some((item) => item.id === screenId)) return;
    set({ activeAccountScreenId: screenId });
  },

  openGroupScreen: (options = {}) => {
    const state = get();
    if (state.groupScreens.length >= MAX_MULTI_SCREENS) {
      const fallbackActiveId =
        state.activeGroupScreenId
        || state.groupScreens[state.groupScreens.length - 1]?.id
        || null;
      set({
        activeView: 'group',
        activeGroupScreenId: fallbackActiveId,
      });
      return {
        status: 'limit-reached',
        screenId: fallbackActiveId,
        count: state.groupScreens.length,
        limit: MAX_MULTI_SCREENS,
      };
    }

    const screen = createScreenEntry('group', {
      presetName: options.presetName || '',
      duplicateData: options.duplicateData || null,
    });
    const nextScreens = [...state.groupScreens, screen];
    set({
      groupScreens: nextScreens,
      activeGroupScreenId: screen.id,
      activeView: 'group',
    });
    return {
      status: 'added',
      screenId: screen.id,
      count: nextScreens.length,
      limit: MAX_MULTI_SCREENS,
    };
  },

  closeGroupScreen: (screenId) => {
    set((state) => {
      const removedIndex = state.groupScreens.findIndex((item) => item.id === screenId);
      if (removedIndex === -1) return state;
      const nextScreens = state.groupScreens.filter((item) => item.id !== screenId);
      let nextActiveId = state.activeGroupScreenId;
      if (nextActiveId === screenId) {
        const replacement = nextScreens[Math.min(removedIndex, nextScreens.length - 1)];
        nextActiveId = replacement?.id ?? null;
      }
      const nextView =
        nextScreens.length > 0
          ? state.activeView
          : state.activeView === 'group'
            ? (state.accountScreens.length > 0 ? 'account' : null)
            : state.activeView;
      return {
        groupScreens: nextScreens,
        activeGroupScreenId: nextActiveId,
        activeView: nextView,
      };
    });
  },

  closeAllGroupScreens: () => {
    set((state) => ({
      groupScreens: [],
      activeGroupScreenId: null,
      activeView:
        state.activeView === 'group'
          ? (state.accountScreens.length > 0 ? 'account' : null)
          : state.activeView,
    }));
  },

  setActiveGroupScreen: (screenId) => {
    const state = get();
    if (!screenId || state.activeGroupScreenId === screenId) return;
    if (!state.groupScreens.some((item) => item.id === screenId)) return;
    set({ activeGroupScreenId: screenId });
  },

  setActiveView: (view) => {
    set({ activeView: view });
  },

  toggleWorkspaceMovable: () => {
    set((state) => {
      const nextMovable = !state.isWorkspaceMovable;
      return {
        isWorkspaceMovable: nextMovable,
        workspacePosition: nextMovable ? (state.workspacePosition || { x: 0, y: 0 }) : { x: 0, y: 0 },
        workspaceDockZone: nextMovable ? state.workspaceDockZone : null,
      };
    });
  },

  setWorkspaceMovable: (movable) => {
    const nextMovable = Boolean(movable);
    set((state) => ({
      isWorkspaceMovable: nextMovable,
      workspacePosition: nextMovable ? (state.workspacePosition || { x: 0, y: 0 }) : { x: 0, y: 0 },
      workspaceDockZone: nextMovable ? state.workspaceDockZone : null,
    }));
  },

  setWorkspacePosition: (position) => {
    set({
      workspacePosition: {
        x: Number(position?.x) || 0,
        y: Number(position?.y) || 0,
      },
    });
  },

  dockWorkspaceToZone: (zone) => {
    const normalized = !zone || zone === 'right' ? null : zone;
    set({
      isWorkspaceMovable: true,
      workspaceDockZone: normalized,
      workspacePosition: { x: 0, y: 0 },
    });
  },

  toggleScreenMovable: (mode, screenId) => {
    const key = mode === 'group' ? 'groupScreens' : 'accountScreens';
    set((state) => ({
      [key]: state[key].map((item) => {
        if (item.id !== screenId) return item;
        const nextMovable = !item.movable;
        return {
          ...item,
          movable: nextMovable,
          position: nextMovable ? (item.position || { x: 0, y: 0 }) : { x: 0, y: 0 },
          dockZone: nextMovable ? (item.dockZone || null) : null,
        };
      }),
    }));
  },

  setScreenMovable: (mode, screenId, movable) => {
    const key = mode === 'group' ? 'groupScreens' : 'accountScreens';
    const nextMovable = Boolean(movable);
    set((state) => ({
      [key]: state[key].map((item) => {
        if (item.id !== screenId) return item;
        return {
          ...item,
          movable: nextMovable,
          position: nextMovable ? (item.position || { x: 0, y: 0 }) : { x: 0, y: 0 },
          dockZone: nextMovable ? (item.dockZone || null) : null,
        };
      }),
    }));
  },

  setScreenPosition: (mode, screenId, position) => {
    const key = mode === 'group' ? 'groupScreens' : 'accountScreens';
    const nextPos = {
      x: Number(position?.x) || 0,
      y: Number(position?.y) || 0,
    };
    set((state) => ({
      [key]: state[key].map((item) => (
        item.id === screenId ? { ...item, position: nextPos } : item
      )),
    }));
  },

  dockScreenToZone: (mode, screenId, zone) => {
    const key = mode === 'group' ? 'groupScreens' : 'accountScreens';
    const normalized = !zone || zone === 'right' ? null : zone;
    set((state) => ({
      [key]: state[key].map((item) => (
        item.id === screenId
          ? { ...item, movable: true, dockZone: normalized, position: { x: 0, y: 0 } }
          : item
      )),
    }));
  },

  resetMultiScreens: () => {
    set((state) => ({
      accountScreens: [],
      activeAccountScreenId: null,
      groupScreens: [],
      activeGroupScreenId: null,
      activeView: null,
      isWorkspaceMovable: false,
      workspacePosition: { x: 0, y: 0 },
      workspaceDockZone: null,
      openAccountWindows: [],
      activeAccountWindowLogin: null,
      mountedAccountWindowHosts: state.mountedAccountWindowHosts || { sidebar: false, tradingAccounts: false },
    }));
  },
}));

export default useMultiScreenStore;
