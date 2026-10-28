import {
  getGroupFolderRows,
  getGroupLeafName,
  getGroupParentPath,
  getGroupRowText,
  groupRowNode,
  isGroupBranch,
  listGroupContainerPaths,
  splitGroupPath,
} from './groupTree.js';
import { accountsInGroup, readLeverageRatio } from './groupAccountRows.js';

const ROUTE_SEPARATOR_REGEX = /[\\/>]+/;

/**
 * Normalizes a segment for phonetic/transliteration comparison so common
 * spelling variants (such as "dipanwita" vs "dipannita" or "lavaerage" vs "leverage")
 * can be matched when no exact or substring match exists.
 */
export const normalizeSearchToken = (value) =>
  String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, '');

export const normalizePhoneticToken = (value) =>
  normalizeSearchToken(value)
    .replace(/nw/g, 'n')
    .replace(/nv/g, 'n')
    .replace(/w/g, 'v')
    .replace(/ph/g, 'f')
    .replace(/([a-z])\1+/g, '$1');

/**
 * Strips vowels after the first character and collapses duplicate consonants so
 * vowel-transposed or vowel-heavy typos (like "lavaerage" -> "leverage") match cleanly.
 */
export const normalizeConsonantSkeleton = (value) => {
  const token = normalizePhoneticToken(value);
  if (!token) return '';
  return (token[0] + token.slice(1).replace(/[aeiouy]/g, '')).replace(/([a-z])\1+/g, '$1');
};

export const levenshteinDistance = (a, b) => {
  const left = String(a ?? '');
  const right = String(b ?? '');
  if (left === right) return 0;
  if (!left.length) return right.length;
  if (!right.length) return left.length;

  const prev = new Array(right.length + 1);
  const curr = new Array(right.length + 1);
  for (let j = 0; j <= right.length; j += 1) prev[j] = j;

  for (let i = 1; i <= left.length; i += 1) {
    curr[0] = i;
    for (let j = 1; j <= right.length; j += 1) {
      const cost = left[i - 1] === right[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        prev[j] + 1,
        curr[j - 1] + 1,
        prev[j - 1] + cost,
      );
    }
    for (let j = 0; j <= right.length; j += 1) prev[j] = curr[j];
  }
  return prev[right.length];
};

/**
 * Scores how well `candidate` matches `querySegment`.
 * Returns 0 when there is no match, or a positive score ordered by match tier:
 *   100 = exact case-insensitive match
 *    92 = exact normalized token match
 *    82 = prefix match
 *    72 = word-boundary prefix match
 *    62 = substring match
 *    50 = phonetic/transliteration exact match (e.g. dipanwita <-> dipannita)
 *    46 = consonant-skeleton / anagram transposition match (e.g. lavaerage <-> leverage, emial <-> email)
 *    44 = phonetic prefix match
 *    38 = bounded edit-distance fuzzy match for non-numeric identifiers
 */
export const scoreSegmentMatch = (candidate, querySegment, { allowFuzzy = true } = {}) => {
  const rawCandidate = String(candidate ?? '').trim();
  const rawQuery = String(querySegment ?? '').trim();
  if (!rawCandidate || !rawQuery) return 0;

  const candLower = rawCandidate.toLowerCase();
  const queryLower = rawQuery.toLowerCase();

  if (candLower === queryLower) return 100;

  const candNorm = normalizeSearchToken(rawCandidate);
  const queryNorm = normalizeSearchToken(rawQuery);
  if (!candNorm || !queryNorm) return 0;
  if (candNorm === queryNorm) return 92;

  if (candLower.startsWith(queryLower) || candNorm.startsWith(queryNorm)) {
    return 82;
  }

  const tokens = candLower.split(/[\s\\/_.-]+/).filter(Boolean);
  if (tokens.some((token) => token === queryLower)) return 76;
  if (tokens.some((token) => token.startsWith(queryLower))) return 72;

  if (candLower.includes(queryLower) || candNorm.includes(queryNorm)) {
    return 62;
  }

  // Do not fuzzy-match pure numbers (such as account logins) to different numbers.
  if (!allowFuzzy || /^\d+$/.test(queryNorm)) return 0;

  const candPhonetic = normalizePhoneticToken(rawCandidate);
  const queryPhonetic = normalizePhoneticToken(rawQuery);
  if (candPhonetic && queryPhonetic) {
    if (candPhonetic === queryPhonetic) return 50;
    if (queryPhonetic.length >= 4 && candPhonetic.startsWith(queryPhonetic)) return 44;
  }

  if (queryNorm.length >= 4 && candNorm.length >= 4 && candNorm[0] === queryNorm[0]) {
    const candSkel = normalizeConsonantSkeleton(candNorm);
    const querySkel = normalizeConsonantSkeleton(queryNorm);
    if (candSkel.length >= 3 && candSkel === querySkel) {
      return 46;
    }
    if (
      candNorm.length === queryNorm.length
      && [...candNorm].sort().join('') === [...queryNorm].sort().join('')
    ) {
      return 46;
    }

    const distance = levenshteinDistance(candNorm, queryNorm);
    const maxLen = Math.max(candNorm.length, queryNorm.length);
    const similarity = 1 - distance / maxLen;
    if ((distance <= 1 && maxLen >= 4) || (distance <= 2 && maxLen >= 5 && similarity >= 0.65)) {
      return 38;
    }
  }

  return 0;
};

const getAccountSources = (payload) => {
  if (!payload || typeof payload !== 'object') return [];
  return [
    payload,
    payload.account,
    payload.Account,
    payload.user,
    payload.User,
    payload.answer,
    payload.Answer,
    payload.data,
    payload.Data,
    payload.raw,
    payload.Raw,
    payload.details,
    payload.Details,
    payload.profile,
    payload.Profile,
    payload.client,
    payload.Client,
  ]
    .map((source) => (
      Array.isArray(source)
        ? source.find((item) => item && typeof item === 'object' && !Array.isArray(item))
        : source
    ))
    .filter((source) => source && typeof source === 'object' && !Array.isArray(source));
};

const pickAccountField = (sources, keys) => {
  for (const source of sources) {
    for (const key of keys) {
      const value = source?.[key];
      if (value !== undefined && value !== null && String(value).trim() !== '') {
        return value;
      }
    }
  }
  return '';
};

const formatMoneyValue = (value, currency = '') => {
  if (value === '' || value === undefined || value === null) return '';
  const num = Number(value);
  if (!Number.isFinite(num)) return String(value);
  const formatted = num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return currency ? `${formatted} ${currency}` : formatted;
};

const formatPercentValue = (value) => {
  if (value === '' || value === undefined || value === null) return '';
  const num = Number(value);
  if (!Number.isFinite(num)) return String(value);
  return `${num}%`;
};

/**
 * Catalog of account fields addressable via `group / [folder /] account / <field>`.
 */
export const ACCOUNT_ROUTE_FIELDS = [
  {
    key: 'email',
    label: 'Email',
    category: 'Personal',
    tab: 'Personal',
    aliases: ['email', 'e-mail', 'mail', 'emial', 'emailaddress', 'useremail'],
    read: (sources) => String(pickAccountField(sources, ['Email', 'email', 'username', 'Username']) || ''),
  },
  {
    key: 'leverage',
    label: 'Leverage',
    category: 'Account',
    tab: 'Account',
    aliases: ['leverage', 'lavaerage', 'levarage', 'lavarage', 'laverage', 'leverge', 'levrage', 'lev', 'ratio'],
    read: (sources, group) => {
      for (const source of sources) {
        const ratio = readLeverageRatio(source);
        if (ratio !== null) return `1 : ${ratio}`;
      }
      const groupRatio = readLeverageRatio(group);
      return groupRatio !== null ? `1 : ${groupRatio}` : '';
    },
  },
  {
    key: 'balance',
    label: 'Balance',
    category: 'Balance',
    tab: 'Balance',
    aliases: ['balance', 'ballance', 'bal', 'accountbalance', 'cash'],
    read: (sources, group) => {
      const ccy = String(pickAccountField(sources, ['Currency', 'currency']) || group?.currency || '');
      return formatMoneyValue(pickAccountField(sources, ['Balance', 'balance', 'accountBalance', 'account_balance']), ccy);
    },
  },
  {
    key: 'equity',
    label: 'Equity',
    category: 'Balance',
    tab: 'Balance',
    aliases: ['equity', 'eq', 'equty', 'accountequity'],
    read: (sources, group) => {
      const ccy = String(pickAccountField(sources, ['Currency', 'currency']) || group?.currency || '');
      return formatMoneyValue(pickAccountField(sources, ['Equity', 'equity']), ccy);
    },
  },
  {
    key: 'name',
    label: 'Name',
    category: 'Personal',
    tab: 'Personal',
    aliases: ['name', 'fullname', 'clientname', 'holder', 'accountname', 'firstname', 'lastname'],
    read: (sources) => {
      const direct = pickAccountField(sources, ['Name', 'name', 'accountName', 'AccountName']);
      if (direct) return String(direct);
      const first = pickAccountField(sources, ['FirstName', 'firstName']);
      const last = pickAccountField(sources, ['LastName', 'lastName']);
      return [first, last].filter(Boolean).join(' ');
    },
  },
  {
    key: 'login',
    label: 'Login',
    category: 'Account',
    tab: 'Overview',
    aliases: ['login', 'account', 'accountid', 'accountnumber', 'id'],
    read: (sources) => String(pickAccountField(sources, ['login', 'Login', 'account_id', 'accountLogin']) || ''),
  },
  {
    key: 'group',
    label: 'Group',
    category: 'Account',
    tab: 'Account',
    aliases: ['group', 'groupname', 'accountgroup', 'folder'],
    read: (sources, group) => String(pickAccountField(sources, ['Group', 'group', 'accountGroup', 'AccountGroup']) || group?.name || ''),
  },
  {
    key: 'currency',
    label: 'Currency',
    category: 'Account',
    tab: 'Account',
    aliases: ['currency', 'curr', 'ccy', 'basecurrency'],
    read: (sources, group) => String(pickAccountField(sources, ['Currency', 'currency']) || group?.currency || 'USD'),
  },
  {
    key: 'margin',
    label: 'Margin',
    category: 'Balance',
    tab: 'Balance',
    aliases: ['margin', 'usedmargin', 'marginused'],
    read: (sources, group) => {
      const ccy = String(pickAccountField(sources, ['Currency', 'currency']) || group?.currency || '');
      return formatMoneyValue(pickAccountField(sources, ['Margin', 'margin']), ccy);
    },
  },
  {
    key: 'free_margin',
    label: 'Free Margin',
    category: 'Balance',
    tab: 'Balance',
    aliases: ['freemargin', 'marginfree', 'availablemargin', 'free'],
    read: (sources, group) => {
      const ccy = String(pickAccountField(sources, ['Currency', 'currency']) || group?.currency || '');
      return formatMoneyValue(pickAccountField(sources, ['MarginFree', 'marginFree', 'freeMargin', 'free_margin']), ccy);
    },
  },
  {
    key: 'margin_level',
    label: 'Margin Level',
    category: 'Limits',
    tab: 'Limits',
    aliases: ['marginlevel', 'level'],
    read: (sources) => formatPercentValue(pickAccountField(sources, ['MarginLevel', 'marginLevel', 'margin_level'])),
  },
  {
    key: 'margin_call',
    label: 'Margin Call Level',
    category: 'Limits',
    tab: 'Limits',
    aliases: ['margincall', 'margincalllevel', 'mc'],
    read: (sources, group) => formatPercentValue(pickAccountField(sources, ['MarginCallLevel', 'marginCallLevel', 'margin_call_level']) || group?.marginCallLevel),
  },
  {
    key: 'stop_out',
    label: 'Stop Out Level',
    category: 'Limits',
    tab: 'Limits',
    aliases: ['stopout', 'stopoutlevel', 'so'],
    read: (sources, group) => formatPercentValue(pickAccountField(sources, ['StopOutLevel', 'stopOutLevel', 'stop_out_level']) || group?.stopOutLevel),
  },
  {
    key: 'credit',
    label: 'Credit',
    category: 'Balance',
    tab: 'Balance',
    aliases: ['credit', 'bonus', 'creditbalance'],
    read: (sources, group) => {
      const ccy = String(pickAccountField(sources, ['Currency', 'currency']) || group?.currency || '');
      return formatMoneyValue(pickAccountField(sources, ['Credit', 'credit']), ccy);
    },
  },
  {
    key: 'profit',
    label: 'Floating P/L',
    category: 'Trade',
    tab: 'Trade',
    aliases: ['profit', 'pnl', 'pl', 'p/l', 'floatingprofit', 'loss'],
    read: (sources, group) => {
      const ccy = String(pickAccountField(sources, ['Currency', 'currency']) || group?.currency || '');
      return formatMoneyValue(pickAccountField(sources, ['Profit', 'profit', 'floatingProfit', 'floating_profit']), ccy);
    },
  },
  {
    key: 'phone',
    label: 'Phone',
    category: 'Personal',
    tab: 'Personal',
    aliases: ['phone', 'phonenumber', 'mobile', 'tel', 'telephone', 'cell', 'contact'],
    read: (sources) => String(pickAccountField(sources, ['Phone', 'phone', 'PhoneNumber', 'phoneNumber', 'Mobile', 'mobile', 'Telephone', 'telephone']) || ''),
  },
  {
    key: 'country',
    label: 'Country',
    category: 'Personal',
    tab: 'Personal',
    aliases: ['country', 'nation', 'countryname'],
    read: (sources) => String(pickAccountField(sources, ['Country', 'country', 'CountryName', 'countryName', 'ClientCountry', 'clientCountry']) || ''),
  },
  {
    key: 'city',
    label: 'City',
    category: 'Personal',
    tab: 'Personal',
    aliases: ['city', 'town', 'cityname'],
    read: (sources) => String(pickAccountField(sources, ['City', 'city', 'CityName', 'cityName']) || ''),
  },
  {
    key: 'state',
    label: 'State / Region',
    category: 'Personal',
    tab: 'Personal',
    aliases: ['state', 'province', 'region', 'statename'],
    read: (sources) => String(pickAccountField(sources, ['State', 'state', 'Province', 'province', 'Region', 'region']) || ''),
  },
  {
    key: 'zipcode',
    label: 'Zip Code',
    category: 'Personal',
    tab: 'Personal',
    aliases: ['zipcode', 'zip', 'postalcode', 'postal', 'pincode'],
    read: (sources) => String(pickAccountField(sources, ['ZipCode', 'zipCode', 'Zip', 'zip', 'PostalCode', 'postalCode']) || ''),
  },
  {
    key: 'address',
    label: 'Address',
    category: 'Personal',
    tab: 'Personal',
    aliases: ['address', 'street', 'residence'],
    read: (sources) => String(pickAccountField(sources, ['Address', 'address', 'Street', 'street', 'Address1', 'address1']) || ''),
  },
  {
    key: 'company',
    label: 'Company',
    category: 'Personal',
    tab: 'Personal',
    aliases: ['company', 'organization', 'org', 'firm'],
    read: (sources) => String(pickAccountField(sources, ['Company', 'company', 'Organization', 'organization']) || ''),
  },
  {
    key: 'status',
    label: 'Status',
    category: 'Account',
    tab: 'Account',
    aliases: ['status', 'accountstatus', 'accountmode', 'mode'],
    read: (sources) => String(pickAccountField(sources, ['Status', 'status', 'AccountMode', 'accountMode', 'mode']) || ''),
  },
  {
    key: 'language',
    label: 'Language',
    category: 'Personal',
    tab: 'Personal',
    aliases: ['language', 'lang', 'locale'],
    read: (sources) => String(pickAccountField(sources, ['Language', 'language', 'Lang', 'lang']) || ''),
  },
  {
    key: 'comment',
    label: 'Comment',
    category: 'Personal',
    tab: 'Personal',
    aliases: ['comment', 'comments', 'note', 'notes', 'remark'],
    read: (sources) => String(pickAccountField(sources, ['Comment', 'comment', 'Notes', 'notes', 'Note', 'note']) || ''),
  },
  {
    key: 'registration',
    label: 'Registration',
    category: 'Overview',
    tab: 'Overview',
    aliases: ['registration', 'registered', 'created', 'createdat', 'joindate'],
    read: (sources) => String(pickAccountField(sources, ['Registration', 'registration', 'Registered', 'registered', 'created_at', 'createdAt']) || ''),
  },
  {
    key: 'last_access',
    label: 'Last Access',
    category: 'Overview',
    tab: 'Overview',
    aliases: ['lastaccess', 'lastlogin', 'lastseen'],
    read: (sources) => String(pickAccountField(sources, ['LastAccess', 'lastAccess', 'last_access']) || ''),
  },
  {
    key: 'last_ip',
    label: 'Last IP',
    category: 'Overview',
    tab: 'Overview',
    aliases: ['lastip', 'ip', 'ipaddress'],
    read: (sources) => String(pickAccountField(sources, ['LastIP', 'lastIP', 'last_ip']) || ''),
  },
];

/**
 * Evaluates all catalog fields against an account object and its group settings.
 */
export const extractAccountFields = (account, group = null) => {
  const sources = getAccountSources(account);
  return ACCOUNT_ROUTE_FIELDS.map((descriptor) => {
    const rawValue = descriptor.read(sources, group);
    const hasValue = rawValue !== '' && rawValue !== null && rawValue !== undefined;
    return {
      key: descriptor.key,
      label: descriptor.label,
      category: descriptor.category,
      tab: descriptor.tab,
      aliases: descriptor.aliases,
      value: hasValue ? String(rawValue) : '—',
      rawValue: hasValue ? String(rawValue) : '',
      hasValue,
    };
  });
};

/**
 * Matches a field query segment (such as "email", "lavaerage", "balance", "phone")
 * against an account's fields, supporting exact, prefix, alias, and fuzzy/phonetic matching.
 */
export const matchAccountField = (account, group, fieldQuery) => {
  const query = String(fieldQuery ?? '').trim();
  if (!query) return null;

  const fields = extractAccountFields(account, group);
  let bestField = null;
  let bestScore = 0;

  for (const field of fields) {
    const candidates = [field.key, field.label, ...(field.aliases || [])];
    let fieldScore = 0;
    for (const candidate of candidates) {
      const score = scoreSegmentMatch(candidate, query, { allowFuzzy: true });
      if (score > fieldScore) fieldScore = score;
    }
    if (fieldScore > bestScore) {
      bestScore = fieldScore;
      bestField = field;
    }
  }

  if (bestField && bestScore > 0) {
    return { field: bestField, score: bestScore, allFields: fields };
  }

  // Fallback: check any custom raw key on the account object
  const sources = getAccountSources(account);
  for (const source of sources) {
    for (const [rawKey, rawVal] of Object.entries(source)) {
      if (rawVal === null || rawVal === undefined || typeof rawVal === 'object') continue;
      const score = scoreSegmentMatch(rawKey, query, { allowFuzzy: true });
      if (score > bestScore) {
        bestScore = score;
        bestField = {
          key: rawKey.toLowerCase(),
          label: rawKey,
          category: 'Account',
          tab: 'Overview',
          aliases: [rawKey.toLowerCase()],
          value: String(rawVal).trim() || '—',
          rawValue: String(rawVal).trim(),
          hasValue: String(rawVal).trim() !== '',
        };
      }
    }
  }

  return bestField ? { field: bestField, score: bestScore, allFields: fields } : null;
};

/**
 * Parses a search/router string into normalized route segments.
 * Supports `/`, `\`, and `>` separators with optional whitespace around them.
 */
export const parseGroupSearchRoute = (rawInput, groups = []) => {
  const raw = String(rawInput ?? '');
  const trimmed = raw.trim();
  if (!trimmed) {
    return {
      raw,
      trimmed: '',
      isPathQuery: false,
      hasLeadingSeparator: false,
      hasTrailingSeparator: false,
      segments: [],
      activeSegment: '',
    };
  }

  const isPathQuery = ROUTE_SEPARATOR_REGEX.test(trimmed);
  const hasLeadingSeparator = /^[\\/>]/.test(trimmed);
  const hasTrailingSeparator = /[\\/>]\s*$/.test(trimmed);
  const rawSegments = trimmed
    .split(ROUTE_SEPARATOR_REGEX)
    .map((part) => part.trim())
    .filter(Boolean);

  // Strip a leading "Groups" root breadcrumb label unless an actual group starts with "groups".
  let segments = rawSegments;
  if (
    segments.length > 1
    && segments[0].toLowerCase() === 'groups'
    && !groups.some((item) => {
      const first = splitGroupPath(groupRowNode(item).name)[0];
      return first && first.toLowerCase() === 'groups';
    })
  ) {
    segments = segments.slice(1);
  }

  return {
    raw,
    trimmed,
    isPathQuery,
    hasLeadingSeparator,
    hasTrailingSeparator,
    segments,
    activeSegment: hasTrailingSeparator ? '' : (segments.at(-1) ?? ''),
  };
};

/**
 * Walks the group folder hierarchy step-by-step to resolve a sequence of path segments.
 */
const resolvePathFromFolder = (groups, startFolder, segments) => {
  if (!segments.length) return null;
  let currentFolder = startFolder || '';
  let currentNode = null;
  let totalScore = 0;

  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index];
    const folderRows = getGroupFolderRows(groups, currentFolder);
    if (!folderRows.length) return null;

    let bestNode = null;
    let bestScore = 0;
    for (const row of folderRows) {
      const labelScore = scoreSegmentMatch(row.label, segment);
      const leafScore = scoreSegmentMatch(getGroupLeafName(row.name), segment);
      const score = Math.max(labelScore, leafScore);
      if (score > bestScore) {
        bestScore = score;
        bestNode = row;
      }
    }

    if (!bestNode || bestScore === 0) return null;
    currentNode = bestNode;
    currentFolder = bestNode.path;
    totalScore += bestScore;
  }

  if (!currentNode) return null;
  return {
    node: currentNode,
    score: totalScore / segments.length,
  };
};

/**
 * Resolves a sequence of group/folder segments across the entire group tree,
 * trying root first, then relative to `currentFolder`, then multi-segment container matching.
 */
export const resolveGroupNodeBySegments = (groups, segments, currentFolder = '') => {
  if (!Array.isArray(segments) || segments.length === 0) return null;

  const candidates = [];

  // 1. Walk from root
  const fromRoot = resolvePathFromFolder(groups, '', segments);
  if (fromRoot) {
    candidates.push({ ...fromRoot, priority: 3 });
  }

  // 2. Walk relative to currentFolder
  if (currentFolder) {
    const fromCurrent = resolvePathFromFolder(groups, currentFolder, segments);
    if (fromCurrent) {
      candidates.push({ ...fromCurrent, priority: 4 });
    }
  }

  // 3. Direct multi-segment match against all groups and containers (supports skipping intermediate folders if unique)
  const allGroupNodes = groups.map(groupRowNode);
  const containers = listGroupContainerPaths(groups);
  const allPaths = new Set([
    ...containers,
    ...allGroupNodes.map((node) => node.name).filter(Boolean),
  ]);

  for (const path of allPaths) {
    const pathParts = splitGroupPath(path);
    if (pathParts.length < segments.length) continue;

    if (segments.length === 1) {
      const leaf = pathParts.at(-1) || path;
      const leafScore = scoreSegmentMatch(leaf, segments[0]);
      const fullScore = scoreSegmentMatch(path, segments[0]);
      const score = Math.max(leafScore, fullScore);
      if (score > 0) {
        const parentPath = getGroupParentPath(path);
        const nodeInFolder = getGroupFolderRows(groups, parentPath).find((row) => row.path === path)
          || allGroupNodes.find((row) => row.name === path);
        if (nodeInFolder) {
          const depthBonus = parentPath === currentFolder ? 5 : parentPath === '' ? 3 : 1;
          candidates.push({
            node: nodeInFolder,
            score: score + depthBonus * 0.1,
            priority: parentPath === currentFolder ? 4 : parentPath === '' ? 3 : 2,
          });
        }
      }
    } else if (pathParts.length >= segments.length) {
      let partIdx = 0;
      let segScoreSum = 0;
      let matchedAll = true;
      for (let s = 0; s < segments.length; s += 1) {
        let foundScore = 0;
        while (partIdx < pathParts.length) {
          const score = scoreSegmentMatch(pathParts[partIdx], segments[s]);
          partIdx += 1;
          if (score > 0) {
            foundScore = score;
            break;
          }
        }
        if (!foundScore) {
          matchedAll = false;
          break;
        }
        segScoreSum += foundScore;
      }
      const lastPartScore = scoreSegmentMatch(pathParts.at(-1), segments.at(-1));
      if (matchedAll && lastPartScore > 0) {
        const parentPath = getGroupParentPath(path);
        const nodeInFolder = getGroupFolderRows(groups, parentPath).find((row) => row.path === path)
          || allGroupNodes.find((row) => row.name === path);
        if (nodeInFolder) {
          candidates.push({
            node: nodeInFolder,
            score: segScoreSum / segments.length,
            priority: pathParts.length === segments.length ? 3 : 1,
          });
        }
      }
    }
  }

  if (!candidates.length) return null;

  candidates.sort((a, b) => {
    if (Math.floor(b.score) !== Math.floor(a.score)) {
      return Math.floor(b.score) - Math.floor(a.score);
    }
    if (b.priority !== a.priority) return b.priority - a.priority;
    return a.node.path.length - b.node.path.length;
  });

  return candidates[0].node;
};

/**
 * The group record for a name: an exact match after trimming, case-sensitive.
 * Group names are identities ("Alpha" and "ALPHA" are two groups), so there is
 * no case-insensitive fallback. Returns null when no record matches exactly.
 */
export const resolveGroupByName = (groups, name) => {
  const target = String(name ?? '').trim();
  if (!target) return null;
  return (groups || []).find((g) => groupRowNode(g).name.trim() === target) || null;
};

/**
 * Collects all accounts belonging to `targetNode` (either directly in `targetNode.group`
 * or in any subgroup underneath `targetNode.path`).
 */
export const collectAccountsUnderNode = (groups, accountRows, targetNode) => {
  if (!targetNode || !Array.isArray(accountRows)) return [];

  // Group names are case-sensitive identities (see groupNameKey): no case folding.
  const targetPath = String(targetNode.path || targetNode.name || '').trim();
  const matchingGroups = new Map();

  if (targetNode.group?.name) {
    matchingGroups.set(targetNode.group.name.trim(), targetNode.group);
  }

  for (const item of groups || []) {
    const node = groupRowNode(item);
    const name = node.name.trim();
    if (
      name === targetPath
      || name.startsWith(`${targetPath}\\`)
      || name.startsWith(`${targetPath}/`)
    ) {
      matchingGroups.set(name, node.group);
    }
  }

  const seenLogins = new Set();
  const collected = [];

  if (matchingGroups.size === 0 && targetPath) {
    for (const row of accountsInGroup(accountRows, targetPath, targetNode.group)) {
      if (!seenLogins.has(row.login)) {
        seenLogins.add(row.login);
        collected.push({ ...row, groupObj: targetNode.group || { name: targetPath } });
      }
    }
    return collected;
  }

  for (const groupObj of matchingGroups.values()) {
    const rows = accountsInGroup(accountRows, groupObj.name, groupObj);
    for (const row of rows) {
      if (!seenLogins.has(row.login)) {
        seenLogins.add(row.login);
        collected.push({ ...row, groupObj });
      }
    }
  }

  return collected;
};

/**
 * Matches an account query segment against a list of normalized account rows.
 */
export const matchAccountInList = (accountCandidates, accountQuery) => {
  const query = String(accountQuery ?? '').trim();
  if (!query || !Array.isArray(accountCandidates) || accountCandidates.length === 0) {
    return null;
  }
  const queryLower = query.toLowerCase();

  let best = null;
  let bestScore = 0;

  for (const item of accountCandidates) {
    const loginStr = String(item.login ?? '').trim();
    const loginLower = loginStr.toLowerCase();
    const nameLower = String(item.name ?? '').trim().toLowerCase();
    const emailLower = String(item.email ?? '').trim().toLowerCase();

    let score = 0;
    if (loginLower === queryLower) score = 100;
    else if (nameLower && nameLower === queryLower) score = 95;
    else if (emailLower && emailLower === queryLower) score = 94;
    else if (loginLower.startsWith(queryLower)) score = 85;
    else if (nameLower && nameLower.startsWith(queryLower)) score = 78;
    else if (loginLower.includes(queryLower)) score = 68;
    else if (nameLower && nameLower.includes(queryLower)) score = 62;
    else if (emailLower && emailLower.includes(queryLower)) score = 58;

    if (score > bestScore) {
      bestScore = score;
      best = item;
    }
  }

  return best ? { match: best, score: bestScore } : null;
};

const nodeToRoute = (node) => {
  if (!node) return null;
  if (isGroupBranch(node)) {
    return {
      type: 'folder',
      folder: node.path,
      node,
      group: node.group || null,
      label: node.path,
    };
  }
  const groupObj = node.group || { name: node.path || node.name };
  return {
    type: 'group',
    group: groupObj,
    folder: getGroupParentPath(groupObj.name),
    node,
    label: groupObj.name,
  };
};

const buildAccountFieldRoute = (accountRoute, fieldMatch) => {
  const groupName = accountRoute.group?.name || '';
  const prefixLabel = groupName ? `${groupName} / ${accountRoute.login}` : String(accountRoute.login);
  return {
    type: 'account-field',
    field: fieldMatch.field,
    allFields: fieldMatch.allFields,
    account: accountRoute.account,
    login: accountRoute.login,
    accountRow: accountRoute.accountRow,
    group: accountRoute.group,
    folder: accountRoute.folder,
    label: `${prefixLabel} / ${fieldMatch.field.label}`,
  };
};

/**
 * Resolves an account route from segments (without field suffix).
 */
const resolveCoreRoute = ({
  segments,
  isPathQuery,
  hasLeadingSeparator,
  groups = [],
  accountRows = [],
  currentFolder = '',
  openedGroup = null,
}) => {
  if (!segments.length) return null;

  if (openedGroup && hasLeadingSeparator && segments.length === 1) {
    const groupNode = groupRowNode(openedGroup);
    const candidates = collectAccountsUnderNode(groups, accountRows, groupNode);
    const found = matchAccountInList(candidates, segments[0]);
    if (found) {
      const targetGroup = found.match.groupObj || openedGroup;
      return {
        type: 'account',
        account: found.match.account,
        login: found.match.login,
        accountRow: found.match,
        group: targetGroup,
        folder: getGroupParentPath(targetGroup.name),
        label: `${targetGroup.name} / ${found.match.login}`,
      };
    }
  }

  if (segments.length >= 2) {
    const prefixSegments = segments.slice(0, -1);
    const lastSegment = segments.at(-1);
    const prefixNode = resolveGroupNodeBySegments(groups, prefixSegments, currentFolder);

    if (prefixNode) {
      const accountCandidates = collectAccountsUnderNode(groups, accountRows, prefixNode);
      const foundAccount = matchAccountInList(accountCandidates, lastSegment);
      if (foundAccount && foundAccount.score >= 85) {
        const targetGroup = foundAccount.match.groupObj || prefixNode.group || { name: prefixNode.path };
        return {
          type: 'account',
          account: foundAccount.match.account,
          login: foundAccount.match.login,
          accountRow: foundAccount.match,
          group: targetGroup,
          folder: getGroupParentPath(targetGroup.name),
          label: `${targetGroup.name} / ${foundAccount.match.login}`,
        };
      }
    }

    const fullPathNode = resolveGroupNodeBySegments(groups, segments, currentFolder);
    if (fullPathNode) {
      return nodeToRoute(fullPathNode);
    }

    if (prefixNode) {
      const accountCandidates = collectAccountsUnderNode(groups, accountRows, prefixNode);
      const foundAccount = matchAccountInList(accountCandidates, lastSegment);
      if (foundAccount) {
        const targetGroup = foundAccount.match.groupObj || prefixNode.group || { name: prefixNode.path };
        return {
          type: 'account',
          account: foundAccount.match.account,
          login: foundAccount.match.login,
          accountRow: foundAccount.match,
          group: targetGroup,
          folder: getGroupParentPath(targetGroup.name),
          label: `${targetGroup.name} / ${foundAccount.match.login}`,
        };
      }

      if (/^\d+$/.test(lastSegment)) {
        const globalCandidates = (accountRows || []).map((raw) => {
          const login = String(raw?.login ?? raw?.Login ?? raw?.account_id ?? '').trim();
          const groupName = String(raw?.group ?? raw?.Group ?? '').trim();
          return { login, name: String(raw?.Name ?? raw?.name ?? ''), email: String(raw?.Email ?? raw?.email ?? ''), account: raw, groupName };
        });
        const globalMatch = globalCandidates.find((item) => item.login === lastSegment);
        // The stored group owns the account. Its exact record when one exists, else a name-only
        // object for the stored name. Never prefixNode.group: that is a case-insensitive segment match.
        const owningGroup = globalMatch?.groupName
          ? (resolveGroupByName(groups, globalMatch.groupName) || { name: globalMatch.groupName })
          : (prefixNode.group || { name: prefixNode.path });
        return {
          type: 'account',
          account: globalMatch?.account || { login: lastSegment, Group: owningGroup.name, group: owningGroup.name },
          login: lastSegment,
          group: owningGroup,
          folder: getGroupParentPath(owningGroup.name),
          label: `${owningGroup.name} / ${lastSegment}`,
        };
      }
    }

    return null;
  }

  const singleSegment = segments[0];

  if (openedGroup && !isPathQuery) {
    const groupNode = groupRowNode(openedGroup);
    const inGroupAccounts = collectAccountsUnderNode(groups, accountRows, groupNode);
    const accountMatch = matchAccountInList(inGroupAccounts, singleSegment);
    if (accountMatch && (accountMatch.score >= 85 || /^\d+$/.test(singleSegment))) {
      return {
        type: 'account',
        account: accountMatch.match.account,
        login: accountMatch.match.login,
        accountRow: accountMatch.match,
        group: openedGroup,
        folder: getGroupParentPath(openedGroup.name),
        label: `${openedGroup.name} / ${accountMatch.match.login}`,
      };
    }
  }

  const matchedNode = resolveGroupNodeBySegments(groups, [singleSegment], currentFolder);
  if (matchedNode) {
    return nodeToRoute(matchedNode);
  }

  if (Array.isArray(accountRows) && accountRows.length > 0) {
    const allNormalized = [];
    for (const item of groups) {
      const gNode = groupRowNode(item);
      for (const row of accountsInGroup(accountRows, gNode.name, gNode.group)) {
        allNormalized.push({ ...row, groupObj: gNode.group });
      }
    }
    const globalAccountMatch = matchAccountInList(allNormalized, singleSegment);
    if (globalAccountMatch && globalAccountMatch.score >= 85) {
      const targetGroup = globalAccountMatch.match.groupObj;
      return {
        type: 'account',
        account: globalAccountMatch.match.account,
        login: globalAccountMatch.match.login,
        accountRow: globalAccountMatch.match,
        group: targetGroup,
        folder: targetGroup ? getGroupParentPath(targetGroup.name) : '',
        label: targetGroup ? `${targetGroup.name} / ${globalAccountMatch.match.login}` : globalAccountMatch.match.login,
      };
    }
  }

  return null;
};

/**
 * Main router resolver: resolves a search input string into a target navigation route:
 *  - `{ type: 'folder', folder, node, label }`
 *  - `{ type: 'group', group, folder, node, label }`
 *  - `{ type: 'account', account, login, group, folder, label }`
 *  - `{ type: 'account-field', field, allFields, account, login, group, folder, label }`
 *  - `null` if nothing matches
 */
export const resolveGroupSearchRoute = ({
  query,
  groups = [],
  accountRows = [],
  currentFolder = '',
  openedGroup = null,
  selectedLogin = null,
}) => {
  const parsed = parseGroupSearchRoute(query, groups);
  const { segments, isPathQuery, hasLeadingSeparator } = parsed;
  if (segments.length === 0) return null;

  // 1. Check if `segments` is `<account_route> / <field_name>` (e.g. `dipanwita / 200029 / email` or `200029 / lavaerage`)
  if (segments.length >= 2) {
    const parentSegments = segments.slice(0, -1);
    const fieldSegment = segments.at(-1);
    const parentRoute = resolveCoreRoute({
      segments: parentSegments,
      isPathQuery: parentSegments.length > 1,
      hasLeadingSeparator: false,
      groups,
      accountRows,
      currentFolder,
      openedGroup,
    });

    if (parentRoute && parentRoute.type === 'account') {
      const fieldMatch = matchAccountField(parentRoute.account, parentRoute.group, fieldSegment);
      if (fieldMatch && fieldMatch.score >= 38) {
        return buildAccountFieldRoute(parentRoute, fieldMatch);
      }
    }
  }

  // 2. Check if user typed `/ email` or `/ lavaerage` while an account is selected or inside an openedGroup
  if (segments.length === 1 && hasLeadingSeparator && openedGroup) {
    const groupNode = groupRowNode(openedGroup);
    const candidates = collectAccountsUnderNode(groups, accountRows, groupNode);
    const targetAccRow = (selectedLogin && candidates.find((c) => String(c.login) === String(selectedLogin)))
      || (candidates.length === 1 ? candidates[0] : null);
    if (targetAccRow) {
      const fieldMatch = matchAccountField(targetAccRow.account, openedGroup, segments[0]);
      if (fieldMatch && fieldMatch.score >= 38) {
        return buildAccountFieldRoute(
          {
            type: 'account',
            account: targetAccRow.account,
            login: targetAccRow.login,
            accountRow: targetAccRow,
            group: openedGroup,
            folder: getGroupParentPath(openedGroup.name),
          },
          fieldMatch,
        );
      }
    }
  }

  // 3. Otherwise resolve standard folder / group / account route
  return resolveCoreRoute({
    segments,
    isPathQuery,
    hasLeadingSeparator,
    groups,
    accountRows,
    currentFolder,
    openedGroup,
  });
};

/**
 * Generates interactive router autocomplete & action suggestions for the search dropdown,
 * including account field value cards when routing after an account number.
 */
export const getGroupSearchSuggestions = ({
  query,
  groups = [],
  accountRows = [],
  currentFolder = '',
  openedGroup = null,
  selectedLogin = null,
  limit = 10,
}) => {
  const parsed = parseGroupSearchRoute(query, groups);
  const { segments, hasTrailingSeparator, hasLeadingSeparator } = parsed;
  if (segments.length === 0) return [];

  const suggestions = [];
  const seenKeys = new Set();
  const pushSuggestion = (item) => {
    if (!item || seenKeys.has(item.key) || suggestions.length >= limit) return;
    seenKeys.add(item.key);
    suggestions.push(item);
  };

  // Case 1: Trailing slash, e.g. `dipanwita /` or `dipanwita / 200029 /`
  if (hasTrailingSeparator) {
    // Check if the path before the trailing slash resolves to an account!
    const parentRoute = resolveCoreRoute({
      segments,
      isPathQuery: segments.length > 1,
      hasLeadingSeparator,
      groups,
      accountRows,
      currentFolder,
      openedGroup,
    });

    if (parentRoute && parentRoute.type === 'account') {
      const fields = extractAccountFields(parentRoute.account, parentRoute.group);
      const populatedFields = fields.filter((f) => f.hasValue);
      const orderedFields = populatedFields.length > 0 ? [...populatedFields, ...fields.filter((f) => !f.hasValue)] : fields;
      const prefixLabel = parentRoute.group?.name ? `${parentRoute.group.name} / ${parentRoute.login}` : String(parentRoute.login);

      for (const field of orderedFields) {
        pushSuggestion({
          key: `account-field:${parentRoute.login}:${field.key}`,
          type: 'account-field',
          field,
          allFields: fields,
          account: parentRoute.account,
          login: parentRoute.login,
          accountRow: parentRoute.accountRow,
          group: parentRoute.group,
          folder: parentRoute.folder,
          label: `${prefixLabel} / ${field.label}`,
          title: `${prefixLabel} / ${field.key}`,
          subtitle: `${field.label}: ${field.value}`,
          completionText: `${prefixLabel} / ${field.key}`,
        });
      }
      return suggestions;
    }

    const parentNode = resolveGroupNodeBySegments(groups, segments, currentFolder);
    if (!parentNode) return [];

    const nodeRoute = nodeToRoute(parentNode);
    if (nodeRoute) {
      pushSuggestion({
        key: `${nodeRoute.type}:${nodeRoute.label}`,
        ...nodeRoute,
        title: parentNode.path,
        subtitle: nodeRoute.type === 'folder' ? 'Open folder' : 'Open group accounts',
        completionText: `${parentNode.path} / `,
      });
    }

    const childRows = getGroupFolderRows(groups, parentNode.path);
    for (const child of childRows) {
      const route = nodeToRoute(child);
      if (route) {
        pushSuggestion({
          key: `${route.type}:${route.label}`,
          ...route,
          title: `${parentNode.path} / ${child.label}`,
          subtitle: route.type === 'folder' ? `Folder (${child.count})` : 'Group',
          completionText: `${parentNode.path} / ${child.label} / `,
        });
      }
    }

    const accounts = collectAccountsUnderNode(groups, accountRows, parentNode);
    for (const acc of accounts) {
      const targetGroup = acc.groupObj || parentNode.group || { name: parentNode.path };
      pushSuggestion({
        key: `account:${targetGroup.name}:${acc.login}`,
        type: 'account',
        account: acc.account,
        login: acc.login,
        accountRow: acc,
        group: targetGroup,
        folder: getGroupParentPath(targetGroup.name),
        label: `${targetGroup.name} / ${acc.login}`,
        title: `${targetGroup.name} / ${acc.login}`,
        subtitle: acc.name ? `${acc.name} · Open account details` : 'Open account details',
        completionText: `${targetGroup.name} / ${acc.login} / `,
      });
    }

    return suggestions;
  }

  // Case 2: Multi-segment without trailing slash, or `/ field`
  if (segments.length >= 2 || (segments.length === 1 && hasLeadingSeparator)) {
    const primary = resolveGroupSearchRoute({
      query,
      groups,
      accountRows,
      currentFolder,
      openedGroup,
      selectedLogin,
    });

    if (primary) {
      if (primary.type === 'account-field') {
        const prefixLabel = primary.group?.name ? `${primary.group.name} / ${primary.login}` : String(primary.login);
        pushSuggestion({
          key: `account-field:${primary.login}:${primary.field.key}`,
          ...primary,
          title: `${prefixLabel} / ${primary.field.key}`,
          subtitle: `${primary.field.label}: ${primary.field.value}`,
          completionText: `${prefixLabel} / ${primary.field.key}`,
        });

        // Also list other matching fields on the same account
        const lastSegment = segments.at(-1);
        const allFields = primary.allFields || extractAccountFields(primary.account, primary.group);
        const scoredOtherFields = allFields
          .map((field) => {
            const best = Math.max(
              scoreSegmentMatch(field.key, lastSegment),
              scoreSegmentMatch(field.label, lastSegment),
              ...(field.aliases || []).map((a) => scoreSegmentMatch(a, lastSegment)),
            );
            return { field, score: best };
          })
          .filter((item) => item.score > 0)
          .sort((a, b) => b.score - a.score);

        for (const { field } of scoredOtherFields) {
          pushSuggestion({
            key: `account-field:${primary.login}:${field.key}`,
            ...primary,
            field,
            label: `${prefixLabel} / ${field.label}`,
            title: `${prefixLabel} / ${field.key}`,
            subtitle: `${field.label}: ${field.value}`,
            completionText: `${prefixLabel} / ${field.key}`,
          });
        }

        // Also offer a quick switch to sibling fields with values
        for (const field of allFields.filter((f) => f.hasValue)) {
          pushSuggestion({
            key: `account-field:${primary.login}:${field.key}`,
            ...primary,
            field,
            label: `${prefixLabel} / ${field.label}`,
            title: `${prefixLabel} / ${field.key}`,
            subtitle: `${field.label}: ${field.value}`,
            completionText: `${prefixLabel} / ${field.key}`,
          });
        }

        return suggestions;
      }

      pushSuggestion({
        key: `${primary.type}:${primary.label}`,
        ...primary,
        title: primary.label,
        subtitle:
          primary.type === 'account'
            ? (primary.accountRow?.name ? `${primary.accountRow.name} · Open account details` : 'Open account details')
            : primary.type === 'folder'
              ? 'Open folder'
              : 'Open group accounts',
        completionText: `${primary.label} / `,
      });

      // If primary resolved to an account (e.g. `dipanwita / 200029`), preview its top fields (`email`, `leverage`, `balance`, `equity`)!
      if (primary.type === 'account') {
        const fields = extractAccountFields(primary.account, primary.group);
        const previewKeys = ['email', 'leverage', 'balance', 'equity', 'phone', 'status'];
        const prefixLabel = primary.group?.name ? `${primary.group.name} / ${primary.login}` : String(primary.login);
        for (const key of previewKeys) {
          const field = fields.find((f) => f.key === key);
          if (field && (field.hasValue || key === 'email' || key === 'leverage')) {
            pushSuggestion({
              key: `account-field:${primary.login}:${field.key}`,
              type: 'account-field',
              field,
              allFields: fields,
              account: primary.account,
              login: primary.login,
              accountRow: primary.accountRow,
              group: primary.group,
              folder: primary.folder,
              label: `${prefixLabel} / ${field.label}`,
              title: `${prefixLabel} / ${field.key}`,
              subtitle: `${field.label}: ${field.value}`,
              completionText: `${prefixLabel} / ${field.key}`,
            });
          }
        }
      }
    }

    const prefixSegments = segments.slice(0, -1);
    const lastSegment = segments.at(-1);
    const prefixNode = resolveGroupNodeBySegments(groups, prefixSegments, currentFolder);
    if (prefixNode) {
      const childRows = getGroupFolderRows(groups, prefixNode.path);
      for (const child of childRows) {
        if (scoreSegmentMatch(child.label, lastSegment) > 0) {
          const route = nodeToRoute(child);
          if (route) {
            pushSuggestion({
              key: `${route.type}:${route.label}`,
              ...route,
              title: `${prefixNode.path} / ${child.label}`,
              subtitle: route.type === 'folder' ? `Folder (${child.count})` : 'Group',
              completionText: `${prefixNode.path} / ${child.label} / `,
            });
          }
        }
      }

      const accounts = collectAccountsUnderNode(groups, accountRows, prefixNode);
      const scoredAccounts = accounts
        .map((acc) => {
          const matched = matchAccountInList([acc], lastSegment);
          return matched ? { acc, score: matched.score } : null;
        })
        .filter(Boolean)
        .sort((a, b) => b.score - a.score);

      for (const { acc } of scoredAccounts) {
        const targetGroup = acc.groupObj || prefixNode.group || { name: prefixNode.path };
        pushSuggestion({
          key: `account:${targetGroup.name}:${acc.login}`,
          type: 'account',
          account: acc.account,
          login: acc.login,
          accountRow: acc,
          group: targetGroup,
          folder: getGroupParentPath(targetGroup.name),
          label: `${targetGroup.name} / ${acc.login}`,
          title: `${targetGroup.name} / ${acc.login}`,
          subtitle: acc.name ? `${acc.name} · Open account details` : 'Open account details',
          completionText: `${targetGroup.name} / ${acc.login} / `,
        });
      }
    }

    return suggestions;
  }

  // Case 3: Single segment, e.g. `dipanwita` or `200029`
  const singleSegment = segments[0];
  const primary = resolveGroupSearchRoute({
    query,
    groups,
    accountRows,
    currentFolder,
    openedGroup,
    selectedLogin,
  });
  if (primary) {
    pushSuggestion({
      key: `${primary.type}:${primary.label}`,
      ...primary,
      title: primary.label,
      subtitle:
        primary.type === 'account'
          ? (primary.accountRow?.name ? `${primary.accountRow.name} · Open account details` : 'Open account details')
          : primary.type === 'folder'
            ? 'Open folder'
            : 'Open group accounts',
      completionText: `${primary.label} / `,
    });
  }

  const folderRows = getGroupFolderRows(groups, currentFolder);
  const allGroupNodes = groups.map(groupRowNode);
  const candidateNodes = [...folderRows, ...allGroupNodes];
  const scoredNodes = [];
  const seenPaths = new Set();

  for (const node of candidateNodes) {
    if (!node?.path || seenPaths.has(node.path)) continue;
    seenPaths.add(node.path);
    const score = Math.max(
      scoreSegmentMatch(node.label, singleSegment),
      scoreSegmentMatch(node.name, singleSegment),
    );
    if (score > 0) {
      const parentPath = getGroupParentPath(node.path);
      const canonicalNode = getGroupFolderRows(groups, parentPath).find((r) => r.path === node.path) || node;
      scoredNodes.push({ node: canonicalNode, score });
    }
  }
  scoredNodes.sort((a, b) => b.score - a.score);

  for (const { node } of scoredNodes) {
    const route = nodeToRoute(node);
    if (route) {
      pushSuggestion({
        key: `${route.type}:${route.label}`,
        ...route,
        title: route.label,
        subtitle: route.type === 'folder' ? `Open folder (${node.count})` : 'Open group accounts',
        completionText: `${route.label} / `,
      });
    }
  }

  if (primary && (primary.type === 'group' || primary.type === 'folder') && primary.node) {
    const childRows = getGroupFolderRows(groups, primary.node.path);
    for (const child of childRows.slice(0, 3)) {
      const route = nodeToRoute(child);
      if (route) {
        pushSuggestion({
          key: `${route.type}:${route.label}`,
          ...route,
          title: `${primary.node.path} / ${child.label}`,
          subtitle: route.type === 'folder' ? `Subfolder (${child.count})` : 'Subgroup',
          completionText: `${primary.node.path} / ${child.label} / `,
        });
      }
    }

    const previewAccounts = collectAccountsUnderNode(groups, accountRows, primary.node).slice(0, 4);
    for (const acc of previewAccounts) {
      const targetGroup = acc.groupObj || primary.group || { name: primary.node.path };
      pushSuggestion({
        key: `account:${targetGroup.name}:${acc.login}`,
        type: 'account',
        account: acc.account,
        login: acc.login,
        accountRow: acc,
        group: targetGroup,
        folder: getGroupParentPath(targetGroup.name),
        label: `${targetGroup.name} / ${acc.login}`,
        title: `${targetGroup.name} / ${acc.login}`,
        subtitle: acc.name ? `${acc.name} · Open account details` : 'Open account details',
        completionText: `${targetGroup.name} / ${acc.login} / `,
      });
    }
  }

  return suggestions;
};

/**
 * Filters the current folder/group rows for the table view, supporting both
 * standard text search, fuzzy group names (e.g. `dipanwita` -> `dipannita`),
 * and multi-segment router paths (`dipanwita / 200029 / email`).
 */
export const filterGroupRowsBySearch = (rows, search, currentFolder = '') => {
  const raw = String(search ?? '').trim();
  if (!raw) return rows;

  const parsed = parseGroupSearchRoute(raw);
  const queryLower = raw.toLowerCase();

  let targetSegment = raw;
  if (parsed.isPathQuery && parsed.segments.length > 0) {
    const folderSegments = splitGroupPath(currentFolder);
    if (
      folderSegments.length > 0
      && parsed.segments.length > folderSegments.length
      && folderSegments.every((seg, idx) => scoreSegmentMatch(seg, parsed.segments[idx]) > 0)
    ) {
      targetSegment = parsed.segments[folderSegments.length];
    } else {
      targetSegment = parsed.segments[0];
    }
  }

  const directMatches = rows.filter((node) => {
    const values = node.group ? getGroupRowText(node.group) : {};
    const fields = [node.name, node.label, ...Object.values(values)];
    if (fields.some((value) => String(value ?? '').toLowerCase().includes(queryLower))) {
      return true;
    }
    if (parsed.isPathQuery && targetSegment) {
      return (
        scoreSegmentMatch(node.label, targetSegment, { allowFuzzy: false }) > 0
        || scoreSegmentMatch(node.name, targetSegment, { allowFuzzy: false }) > 0
      );
    }
    return false;
  });

  if (directMatches.length > 0) return directMatches;

  return rows.filter((node) => (
    scoreSegmentMatch(node.label, targetSegment, { allowFuzzy: true }) > 0
    || scoreSegmentMatch(getGroupLeafName(node.name), targetSegment, { allowFuzzy: true }) > 0
  ));
};

/**
 * Filters the opened group's account rows, supporting plain search,
 * account routes (`dipanwita / 200029`), and account field routes (`dipanwita / 200029 / email`).
 */
export const filterAccountRowsBySearch = (accountRows, search, columns = []) => {
  const raw = String(search ?? '').trim();
  if (!raw) return accountRows;

  const parsed = parseGroupSearchRoute(raw);
  if (!parsed.isPathQuery) {
    const queryLower = raw.toLowerCase();
    const matches = accountRows.filter((row) =>
      columns.some((column) => String(row[column.key] ?? '').toLowerCase().includes(queryLower)),
    );
    return matches.length === 0 && !/^\d+$/.test(queryLower) ? accountRows : matches;
  }

  // In a path query, find which segment matches an account login in `accountRows`
  for (let i = parsed.segments.length - 1; i >= 0; i -= 1) {
    const seg = parsed.segments[i].toLowerCase();
    const loginMatches = accountRows.filter(
      (row) => String(row.login ?? '').toLowerCase().includes(seg) || String(row.name ?? '').toLowerCase().includes(seg),
    );
    if (loginMatches.length > 0) {
      return loginMatches;
    }
  }

  return accountRows;
};
