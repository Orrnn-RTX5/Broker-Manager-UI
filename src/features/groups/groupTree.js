// Group names nest on backslashes (PREP\contest\4540\Grp01), the MetaTrader 5
// Manager form, and on slashes (Yopips/demo) when the server stores them that way.
// These helpers turn the flat server group list into the folder rows of the
// Groups explorer and the container tree of the Navigator.
export const GROUP_PATH_SEPARATOR = '\\';
const PATH_SEPARATORS = /[/\\]/;

const lower = (value) => String(value ?? '').toLowerCase();
const nameOf = (group) => String(group?.name ?? '');
const compareLabels = (left, right) => String(left).localeCompare(String(right), undefined, { numeric: true, sensitivity: 'base' });
const canonicalPath = (path = '') => lower(path).split(PATH_SEPARATORS).join('\u0001');

/** Separator already used by a stored group name. Mixed names keep the backslash. */
export const pathSeparatorOf = (path = '') => (
  String(path).includes('/') && !String(path).includes('\\') ? '/' : GROUP_PATH_SEPARATOR
);

/**
 * Separator for a new name inside a container. A path that already contains one
 * keeps it; otherwise the groups under that container decide, so Yopips/demo
 * stays in the Yopips folder instead of becoming Yopips\demo.
 */
export const separatorForContainer = (groups, container = '') => {
  if (PATH_SEPARATORS.test(container)) return pathSeparatorOf(container);
  let slash = 0;
  let backslash = 0;
  for (const group of groups || []) {
    const name = nameOf(group);
    if (container && !isSamePath(name, container) && !isBelowPath(name, container)) continue;
    if (name.includes('\\')) backslash += 1;
    else if (name.includes('/')) slash += 1;
  }
  return slash > backslash ? '/' : GROUP_PATH_SEPARATOR;
};

export const isSamePath = (left, right) => canonicalPath(left) === canonicalPath(right);
export const isBelowPath = (candidate, parent) => {
  if (!parent) return false;
  return canonicalPath(candidate).startsWith(`${canonicalPath(parent)}\u0001`);
};
export const splitGroupPath = (path = '') => (path ? String(path).split(PATH_SEPARATORS) : []);
export const joinGroupPath = (...parts) => parts.filter(Boolean).join(GROUP_PATH_SEPARATOR);

/** Join a parent folder and a new subgroup with the separator that folder already uses. */
export const nestGroupName = (parent, leaf, separator = GROUP_PATH_SEPARATOR) => {
  const base = String(parent ?? '');
  const segments = splitGroupPath(leaf).filter((segment) => segment !== '');
  if (!base) return segments.join(separator);
  if (segments.length === 0) return base;
  return `${base}${separator}${segments.join(separator)}`;
};

export const getGroupLeafName = (path = '') => splitGroupPath(path).at(-1) ?? '';

export const getGroupParentPath = (path = '') => {
  const text = String(path ?? '');
  const position = Math.max(text.lastIndexOf('\\'), text.lastIndexOf('/'));
  return position < 0 ? '' : text.slice(0, position);
};

/** A folder, or a group whose name also prefixes other group names, opens like a folder. */
export const isGroupBranch = (node) => node.type === 'folder' || node.count > 0;

/** Groups whose full name sits at or below a folder path ('' means every group). */
export const listGroupsUnder = (groups, path = '') => groups.filter((group) => {
  const name = nameOf(group);
  return Boolean(name) && (!path || isSamePath(name, path) || isBelowPath(name, path));
});

export const countGroupsUnder = (groups, path = '') => listGroupsUnder(groups, path).length;

/** Row node for one server group shown with its full name (the "All Groups" view). */
export const groupRowNode = (group) => {
  const name = nameOf(group);
  return { id: `group:${name}`, type: 'group', label: name, name, path: name, count: 0, group };
};

/**
 * Rows shown when a folder is open. A group whose name also prefixes other
 * names becomes one folder-style row with its subgroups inside, never two rows.
 * Folder rows carry the segment label; leaf groups carry their full name.
 */
export const getGroupFolderRows = (groups, path = '') => {
  const depth = splitGroupPath(path).length;
  const nodes = new Map();
  for (const group of groups) {
    const name = nameOf(group);
    if (!name || (path && !isBelowPath(name, path))) continue;
    const parts = splitGroupPath(name);
    if (parts.length <= depth) continue;
    const childPath = parts.slice(0, depth + 1).join(pathSeparatorOf(name));
    const key = lower(childPath);
    const node = nodes.get(key) || { id: `folder:${childPath}`, type: 'folder', label: parts[depth], name: childPath, path: childPath, count: 0, group: null };
    if (parts.length === depth + 1) Object.assign(node, { id: `group:${name}`, type: 'group', name, group });
    else node.count += 1;
    nodes.set(key, node);
  }
  return [...nodes.values()].sort((left, right) => {
    const leftBranch = isGroupBranch(left);
    const rightBranch = isGroupBranch(right);
    if (leftBranch !== rightBranch) return leftBranch ? -1 : 1;
    return compareLabels(left.label, right.label);
  });
};

/** Every group and folder path that can hold a subgroup, parents before children. */
export const listGroupContainerPaths = (groups) => {
  const paths = new Map();
  for (const group of groups) {
    const name = nameOf(group);
    if (!name) continue;
    const parts = splitGroupPath(name);
    const separator = pathSeparatorOf(name);
    for (let depth = 1; depth <= parts.length; depth += 1) {
      const candidate = parts.slice(0, depth).join(separator);
      // A real group's spelling wins over a folder merely implied by a nested name.
      if (depth === parts.length || !paths.has(lower(candidate))) paths.set(lower(candidate), candidate);
    }
  }
  return [...paths.values()].sort(compareLabels);
};

/**
 * Navigator tree: container folders (with the number of groups underneath)
 * followed by the groups themselves, so the Groups node drops down to every
 * group name. A group that also prefixes other names stays one folder node.
 */
export const buildGroupNavigatorTree = (groups) => {
  const root = { children: new Map() };
  for (const group of groups) {
    const name = nameOf(group);
    if (!name) continue;
    const parts = splitGroupPath(name);
    const separator = pathSeparatorOf(name);
    let node = root;
    for (let depth = 0; depth < parts.length; depth += 1) {
      const childPath = parts.slice(0, depth + 1).join(separator);
      const key = lower(childPath);
      let child = node.children.get(key);
      if (!child) {
        child = { id: `tree:${childPath}`, label: parts[depth], path: childPath, count: 0, group: null, children: new Map() };
        node.children.set(key, child);
      }
      if (depth === parts.length - 1) child.group = group;
      else child.count += 1;
      node = child;
    }
  }
  const finalize = (node) => [...node.children.values()]
    .map((child) => {
      const children = finalize(child);
      return { ...child, type: children.length ? 'folder' : 'group', children };
    })
    .sort((left, right) => (left.type === right.type
      ? compareLabels(left.label, right.label)
      : left.type === 'folder' ? -1 : 1));
  return finalize(root);
};

const readField = (record, keys) => {
  for (const key of keys) {
    const value = record?.[key];
    if ((typeof value === 'string' && value.trim()) || typeof value === 'number' || typeof value === 'boolean') return value;
  }
  return '';
};

export const ROUTING_LABELS = Object.freeze({ a_book: 'A-Book', b_book: 'B-Book', hybrid: 'Hybrid' });

export const getGroupRoutingLabel = (group) => {
  const mode = readField(group, ['routingMode', 'routing_mode']);
  return ROUTING_LABELS[mode] || String(readField(group, ['bookType', 'book_type']) || '');
};

/** "100 / 99 %" from the margin call and stop out levels, as the MT5 Margin column shows them. */
export const getGroupMarginText = (group) => {
  const explicit = readField(group, ['margin', 'Margin']);
  if (explicit !== '') return String(explicit);
  const call = readField(group, ['marginCallLevel', 'margin_call_level', 'margin_call', 'MarginCall']);
  const stop = readField(group, ['stopOutLevel', 'stop_out_level', 'stop_out', 'MarginStopOut']);
  const parts = [call, stop].filter((value) => value !== '');
  return parts.length ? `${parts.join(' / ')} %` : '';
};

/** Column text for one group row. */
export const getGroupRowText = (group) => {
  const leverage = readField(group, ['leverage', 'Leverage']);
  const demo = group?.demo;
  return {
    type: String(readField(group, ['accountType', 'account_type', 'type', 'Type']) || (demo === true ? 'Demo' : demo === false ? 'Real' : '')),
    risk: String(readField(group, ['riskManagement', 'risk_management', 'risk', 'RiskManagement']) || getGroupRoutingLabel(group)),
    margin: getGroupMarginText(group),
    leverage: leverage === '' || Number(leverage) === 0 ? '' : `1:${leverage}`,
    currency: String(readField(group, ['currency', 'Currency', 'deposit_currency'])),
  };
};
