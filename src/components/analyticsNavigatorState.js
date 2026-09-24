import {
  Activity, BarChart2, ClipboardCheck, FileText, Folder,
  Globe, LayoutDashboard, Megaphone, TrendingUp, Users
} from 'lucide-react';

export const ANALYTICS_STORAGE_KEY = 'rtx5_analytics_tree_items_v2';

export const DEFAULT_ANALYTICS_ITEMS = [
  { id: 'analytics-dashboard', label: 'Dashboard', iconName: 'LayoutDashboard', path: '/dashboard', type: 'file', isDefault: true },
  { id: 'analytics-trading-accounts', label: 'Trading Analytics', iconName: 'TrendingUp', path: '/analytics/trading-accounts', type: 'file', isDefault: true },
  { id: 'analytics-online-users', label: 'Online Users', iconName: 'Users', path: '/analytics/online-users', type: 'file', isDefault: true },
  { id: 'analytics-open-positions', label: 'Open Positions', iconName: 'Activity', path: '/analytics/open-positions', type: 'file', isDefault: true },
  { id: 'analytics-open-orders', label: 'Open Orders', iconName: 'ClipboardCheck', path: '/analytics/open-orders', type: 'file', isDefault: true },
  { id: 'analytics-advertising-campaigns', label: 'Advertising Campaigns', iconName: 'Megaphone', path: '/analytics/advertising-campaigns', type: 'file', isDefault: true },
  { id: 'analytics-by-country', label: 'By Country', iconName: 'Globe', path: '/analytics/by-country', type: 'file', isDefault: true },
];

export const PRESET_ANALYTICS_DEFINITIONS = {
  'preset-trading-accounts': { id: 'analytics-trading-accounts', label: 'Trading Analytics', iconName: 'TrendingUp', path: '/analytics/trading-accounts', type: 'file', isDefault: true },
  'preset-online-users': { id: 'analytics-online-users', label: 'Online Users', iconName: 'Users', path: '/analytics/online-users', type: 'file', isDefault: true },
  'preset-open-positions': { id: 'analytics-open-positions', label: 'Open Positions', iconName: 'Activity', path: '/analytics/open-positions', type: 'file', isDefault: true },
  'preset-open-orders': { id: 'analytics-open-orders', label: 'Open Orders', iconName: 'ClipboardCheck', path: '/analytics/open-orders', type: 'file', isDefault: true },
  'preset-advertising-campaigns': { id: 'analytics-advertising-campaigns', label: 'Advertising Campaigns', iconName: 'Megaphone', path: '/analytics/advertising-campaigns', type: 'file', isDefault: true },
  'preset-by-country': { id: 'analytics-by-country', label: 'By Country', iconName: 'Globe', path: '/analytics/by-country', type: 'file', isDefault: true },
};

export const ICON_MAP = {
  LayoutDashboard,
  TrendingUp,
  Users,
  Activity,
  ClipboardCheck,
  Megaphone,
  Globe,
  FileText,
  BarChart2,
  Folder,
};

export function getIconComponent(iconName, isFolder) {
  if (isFolder) return Folder;
  if (iconName && ICON_MAP[iconName]) return ICON_MAP[iconName];
  return FileText;
}

export function loadAnalyticsTree() {
  try {
    const raw = localStorage.getItem(ANALYTICS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        // Auto-heal: Ensure essential Trading Analytics view is present if accidentally deleted
        const hasTradingAnalytics = findNodeInfo(parsed, 'analytics-trading-accounts') ||
          parsed.some((item) => item.id === 'analytics-trading-accounts' || item.path === '/analytics/trading-accounts');
        if (!hasTradingAnalytics) {
          const tradingItem = {
            id: 'analytics-trading-accounts',
            label: 'Trading Analytics',
            iconName: 'TrendingUp',
            path: '/analytics/trading-accounts',
            type: 'file',
            isDefault: true,
          };
          const dashIdx = parsed.findIndex((item) => item.id === 'analytics-dashboard');
          if (dashIdx !== -1) {
            parsed.splice(dashIdx + 1, 0, tradingItem);
          } else {
            parsed.unshift(tradingItem);
          }
          saveAnalyticsTree(parsed);
        }
        return parsed;
      }
    }
  } catch {
    // Ignore storage errors and fallback
  }
  return DEFAULT_ANALYTICS_ITEMS;
}

export function saveAnalyticsTree(items) {
  try {
    localStorage.setItem(ANALYTICS_STORAGE_KEY, JSON.stringify(items));
  } catch {
    // Ignore storage errors
  }
}

/**
 * Merges all default presets into current tree, restoring missing defaults while preserving custom items.
 */
export function restoreDefaultPresets(currentTree) {
  const current = Array.isArray(currentTree) ? currentTree : [];
  const customItems = current.filter((item) => !DEFAULT_ANALYTICS_ITEMS.some((d) => d.id === item.id));
  const restored = [...DEFAULT_ANALYTICS_ITEMS, ...customItems];
  saveAnalyticsTree(restored);
  return restored;
}

/**
 * Recursively searches for an item and collects all existing labels.
 */
export function getAllLabels(items) {
  const labels = new Set();
  function traverse(list) {
    for (const item of list) {
      labels.add(item.label);
      if (Array.isArray(item.children)) {
        traverse(item.children);
      }
    }
  }
  traverse(items);
  return labels;
}

export function generateUniqueName(items, baseName) {
  const existingLabels = getAllLabels(items);
  if (!existingLabels.has(baseName)) return baseName;
  let counter = 2;
  while (existingLabels.has(`${baseName} ${counter}`)) {
    counter++;
  }
  return `${baseName} ${counter}`;
}

/**
 * Finds a node by ID anywhere in the tree.
 * Returns { node, parent, index, parentArray }
 */
export function findNodeInfo(items, targetId, parent = null) {
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (item.id === targetId) {
      return { node: item, parent, index: i, parentArray: items };
    }
    if (Array.isArray(item.children)) {
      const found = findNodeInfo(item.children, targetId, item);
      if (found) return found;
    }
  }
  return null;
}

/**
 * Inserts a new node into the tree.
 * - If targetId is null: appends to top level items.
 * - If target is a folder and insertAsChild is true: adds inside the folder.
 * - Else: inserts as a sibling right after the target.
 */
export function insertNode(items, targetId, newNode, insertAsChild = false) {
  // Deep clone to ensure immutability
  const clone = JSON.parse(JSON.stringify(items));

  if (!targetId || targetId === 'analytics-root') {
    clone.push(newNode);
    return clone;
  }

  const info = findNodeInfo(clone, targetId);
  if (!info) {
    clone.push(newNode);
    return clone;
  }

  const { node, parentArray, index } = info;
  if (node.type === 'folder' && insertAsChild) {
    if (!Array.isArray(node.children)) {
      node.children = [];
    }
    node.children.push(newNode);
  } else {
    // Insert right after target at the same location/level
    parentArray.splice(index + 1, 0, newNode);
  }

  return clone;
}

/**
 * Updates a node's properties (e.g. label) recursively.
 */
export function updateNode(items, targetId, updates) {
  return items.map((item) => {
    if (item.id === targetId) {
      return { ...item, ...updates };
    }
    if (Array.isArray(item.children)) {
      return { ...item, children: updateNode(item.children, targetId, updates) };
    }
    return item;
  });
}

/**
 * Recursively deletes a node by ID.
 */
export function deleteNode(items, targetId) {
  return items
    .filter((item) => item.id !== targetId)
    .map((item) => {
      if (Array.isArray(item.children)) {
        return { ...item, children: deleteNode(item.children, targetId) };
      }
      return item;
    });
}
