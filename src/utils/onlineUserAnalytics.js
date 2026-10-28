const cleanValue = (value) => String(value ?? '').trim();

const stringCompare = (left, right) => {
  const l = left.toLowerCase();
  const r = right.toLowerCase();
  if (l < r) return -1;
  if (l > r) return 1;
  return left < right ? -1 : (left > right ? 1 : 0);
};

const sortedCounts = (counts) => [...counts.entries()]
  .map(([name, count]) => ({ name, count }))
  .sort((left, right) => right.count - left.count || stringCompare(left.name, right.name));

const uniqueValues = (rows, key) => [...new Set(rows.map((row) => cleanValue(row?.[key])).filter(Boolean))]
  .sort(stringCompare);

// Maps manager country values (names, common aliases, ISO alpha-2 codes) onto
// the country names used by the world-atlas 110m topojson geometries.
const COUNTRY_NAME_ALIASES = {
  'united states': 'United States of America',
  'united states of america': 'United States of America',
  'usa': 'United States of America',
  'u.s.': 'United States of America',
  'u.s.a.': 'United States of America',
  'uk': 'United Kingdom',
  'great britain': 'United Kingdom',
  'england': 'United Kingdom',
  'britain': 'United Kingdom',
  'russian federation': 'Russia',
  'south korea': 'South Korea',
  'korea, south': 'South Korea',
  'korea (south)': 'South Korea',
  'republic of korea': 'South Korea',
  'north korea': 'North Korea',
  'korea, north': 'North Korea',
  'viet nam': 'Vietnam',
  'iran, islamic republic of': 'Iran',
  'syrian arab republic': 'Syria',
  'lao people\'s democratic republic': 'Laos',
  'moldova, republic of': 'Moldova',
  'tanzania, united republic of': 'Tanzania',
  'venezuela, bolivarian republic of': 'Venezuela',
  'bolivia, plurinational state of': 'Bolivia',
  'czech republic': 'Czechia',
  'ivory coast': 'Côte d\'Ivoire',
  'cote d\'ivoire': 'Côte d\'Ivoire',
  'cote divoire': 'Côte d\'Ivoire',
  'democratic republic of the congo': 'Dem. Rep. Congo',
  'congo (kinshasa)': 'Dem. Rep. Congo',
  'congo, democratic republic of the': 'Dem. Rep. Congo',
  'drc': 'Dem. Rep. Congo',
  'republic of the congo': 'Congo',
  'congo (brazzaville)': 'Congo',
  'congo, republic of the': 'Congo',
  'bosnia and herzegovina': 'Bosnia and Herz.',
  'bosnia': 'Bosnia and Herz.',
  'north macedonia': 'Macedonia',
  'republic of macedonia': 'Macedonia',
  'swaziland': 'eSwatini',
  'east timor': 'Timor-Leste',
  'burma': 'Myanmar',
  'palestinian territories': 'Palestine',
  'palestinian territory': 'Palestine',
  'western sahara': 'W. Sahara',
  'dominican republic': 'Dominican Rep.',
  'equatorial guinea': 'Eq. Guinea',
  'central african republic': 'Central African Rep.',
  'solomon islands': 'Solomon Is.',
  'falkland islands': 'Falkland Is.',
  'south sudan': 'S. Sudan',
  'turkiye': 'Turkey',
  'türkiye': 'Turkey',
  'uae': 'United Arab Emirates',
  'brunei darussalam': 'Brunei',
};

// ISO 3166-1 alpha-2 → world-atlas 110m geometry name.
const ISO2_TO_GEO_NAME = {
  AF: 'Afghanistan', AL: 'Albania', DZ: 'Algeria', AO: 'Angola', AR: 'Argentina',
  AM: 'Armenia', AU: 'Australia', AT: 'Austria', AZ: 'Azerbaijan', BS: 'Bahamas',
  BD: 'Bangladesh', BY: 'Belarus', BE: 'Belgium', BZ: 'Belize', BJ: 'Benin',
  BT: 'Bhutan', BO: 'Bolivia', BA: 'Bosnia and Herz.', BW: 'Botswana', BR: 'Brazil',
  BN: 'Brunei', BG: 'Bulgaria', BF: 'Burkina Faso', BI: 'Burundi', KH: 'Cambodia',
  CM: 'Cameroon', CA: 'Canada', CF: 'Central African Rep.', TD: 'Chad', CL: 'Chile',
  CN: 'China', CO: 'Colombia', CG: 'Congo', CD: 'Dem. Rep. Congo', CR: 'Costa Rica',
  HR: 'Croatia', CU: 'Cuba', CY: 'Cyprus', CZ: 'Czechia', CI: 'Côte d\'Ivoire',
  DK: 'Denmark', DJ: 'Djibouti', DO: 'Dominican Rep.', EC: 'Ecuador', EG: 'Egypt',
  SV: 'El Salvador', GQ: 'Eq. Guinea', ER: 'Eritrea', EE: 'Estonia', SZ: 'eSwatini',
  ET: 'Ethiopia', FJ: 'Fiji', FI: 'Finland', FR: 'France', GA: 'Gabon', GM: 'Gambia',
  GE: 'Georgia', DE: 'Germany', GH: 'Ghana', GR: 'Greece', GL: 'Greenland',
  GT: 'Guatemala', GN: 'Guinea', GW: 'Guinea-Bissau', GY: 'Guyana', HT: 'Haiti',
  HN: 'Honduras', HU: 'Hungary', IS: 'Iceland', IN: 'India', ID: 'Indonesia',
  IR: 'Iran', IQ: 'Iraq', IE: 'Ireland', IL: 'Israel', IT: 'Italy', JM: 'Jamaica',
  JP: 'Japan', JO: 'Jordan', KZ: 'Kazakhstan', KE: 'Kenya', KW: 'Kuwait',
  KG: 'Kyrgyzstan', LA: 'Laos', LV: 'Latvia', LB: 'Lebanon', LS: 'Lesotho',
  LR: 'Liberia', LY: 'Libya', LT: 'Lithuania', LU: 'Luxembourg', MG: 'Madagascar',
  MW: 'Malawi', MY: 'Malaysia', ML: 'Mali', MR: 'Mauritania', MX: 'Mexico',
  MD: 'Moldova', MN: 'Mongolia', ME: 'Montenegro', MA: 'Morocco', MZ: 'Mozambique',
  MM: 'Myanmar', NA: 'Namibia', NP: 'Nepal', NL: 'Netherlands', NZ: 'New Zealand',
  NI: 'Nicaragua', NE: 'Niger', NG: 'Nigeria', KP: 'North Korea', MK: 'Macedonia',
  NO: 'Norway', OM: 'Oman', PK: 'Pakistan', PS: 'Palestine', PA: 'Panama',
  PG: 'Papua New Guinea', PY: 'Paraguay', PE: 'Peru', PH: 'Philippines',
  PL: 'Poland', PT: 'Portugal', PR: 'Puerto Rico', QA: 'Qatar', RO: 'Romania',
  RU: 'Russia', RW: 'Rwanda', SA: 'Saudi Arabia', SN: 'Senegal', RS: 'Serbia',
  SL: 'Sierra Leone', SK: 'Slovakia', SI: 'Slovenia', SB: 'Solomon Is.',
  SO: 'Somalia', ZA: 'South Africa', KR: 'South Korea', SS: 'S. Sudan',
  ES: 'Spain', LK: 'Sri Lanka', SD: 'Sudan', SR: 'Suriname', SE: 'Sweden',
  CH: 'Switzerland', SY: 'Syria', TW: 'Taiwan', TJ: 'Tajikistan', TZ: 'Tanzania',
  TH: 'Thailand', TL: 'Timor-Leste', TG: 'Togo', TT: 'Trinidad and Tobago',
  TN: 'Tunisia', TR: 'Turkey', TM: 'Turkmenistan', UG: 'Uganda', UA: 'Ukraine',
  AE: 'United Arab Emirates', GB: 'United Kingdom', US: 'United States of America',
  UY: 'Uruguay', UZ: 'Uzbekistan', VU: 'Vanuatu', VE: 'Venezuela', VN: 'Vietnam',
  EH: 'W. Sahara', YE: 'Yemen', ZM: 'Zambia', ZW: 'Zimbabwe', XK: 'Kosovo',
};

export const resolveOnlineUserCountry = (value) => {
  const raw = cleanValue(value);
  if (!raw) return { name: '', geoName: '' };

  const upper = raw.toUpperCase();
  if (/^[A-Z]{2}$/.test(upper) && ISO2_TO_GEO_NAME[upper]) {
    return { name: ISO2_TO_GEO_NAME[upper], geoName: ISO2_TO_GEO_NAME[upper] };
  }

  const lowered = raw.toLowerCase();
  const alias = COUNTRY_NAME_ALIASES[lowered];
  if (alias) {
    return { name: alias, geoName: alias };
  }

  const geoName = raw
    .split(/\s+/)
    .map((word) => (word.length > 1 ? word[0].toUpperCase() + word.slice(1) : word.toUpperCase()))
    .join(' ');
  return { name: geoName, geoName };
};

export const resolveOnlineUserType = (row = {}) => {
  const raw = cleanValue(row.type) || cleanValue(row.deviceType) || cleanValue(row.client) || cleanValue(row.platform);
  if (!raw) return 'Unknown';
  const lowered = raw.toLowerCase();
  if (lowered === 'api' || lowered.includes('api')) return 'API';
  if (lowered === 'manager' || lowered.includes('manager')) return 'Manager';
  if (lowered.includes('android')) return 'Android';
  if (lowered.includes('ios') || lowered.includes('iphone') || lowered.includes('ipad')) return 'iOS';
  if (lowered.includes('win')) return 'Windows';
  if (lowered.includes('mac')) return 'macOS';
  if (lowered.includes('linux')) return 'Linux';
  if (lowered.includes('web')) return 'Web';
  return raw.charAt(0).toUpperCase() + raw.slice(1);
};

export const enrichOnlineUserRows = (rows = [], accounts = []) => {
  const accountList = Array.isArray(accounts) ? accounts : [];
  const accountsByLogin = new Map();
  for (const acc of accountList) {
    const loginKey = cleanValue(acc?.login ?? acc?.Login);
    if (loginKey) accountsByLogin.set(loginKey, acc);
  }

  return (Array.isArray(rows) ? rows : []).map((row) => {
    const loginKey = cleanValue(row?.login ?? row?.Login);
    const matched = loginKey ? accountsByLogin.get(loginKey) : null;
    const resolvedType = resolveOnlineUserType(row);
    const isManager = resolvedType === 'Manager' || Boolean(row?.isAdmin);

    const rawCountry = cleanValue(row?.country ?? row?.Country) || cleanValue(matched?.country ?? matched?.Country);
    const { name: normalizedCountry } = resolveOnlineUserCountry(rawCountry);

    const rawGroup = cleanValue(row?.group ?? row?.Group)
      || cleanValue(matched?.group ?? matched?.Group)
      || (isManager ? 'Managers' : '');

    const explicitRowName = row?.name && row?.name !== row?.username ? cleanValue(row.name) : '';
    const rawName = explicitRowName
      || cleanValue(matched?.name ?? matched?.Name)
      || cleanValue(row?.name ?? row?.username ?? row?.Username)
      || (isManager ? `Manager #${loginKey}` : '');

    const rowEquity = Number(row?.equity ?? row?.Equity);
    const matchedEquity = Number(matched?.equity ?? matched?.Equity);
    const equity = Number.isFinite(rowEquity) && rowEquity !== 0
      ? rowEquity
      : (Number.isFinite(matchedEquity) ? matchedEquity : 0);

    // Never invent a currency: when neither the session row nor the matched
    // account reports one, the currency stays '' (explicit unknown state).
    const currency = cleanValue(row?.currency ?? row?.Currency)
      || cleanValue(matched?.currency ?? matched?.Currency)
      || '';

    return {
      ...row,
      login: loginKey,
      name: rawName,
      group: rawGroup,
      country: normalizedCountry || rawCountry,
      type: resolvedType,
      equity,
      currency,
    };
  });
};

const matchesSearch = (row, query) => {
  const needle = cleanValue(query).toLowerCase();
  if (!needle) return true;
  return [row.login, row.name, row.group, row.type, row.deviceType, row.client, row.ip, row.country]
    .some((value) => String(value || '').toLowerCase().includes(needle));
};

const DEFAULT_SESSION_TYPES = ['API', 'Manager', 'Web'];

export const buildOnlineUserFilterOptions = (rows = [], accounts = [], extraGroups = []) => {
  const enriched = Array.isArray(accounts) && accounts.length > 0
    ? enrichOnlineUserRows(rows, accounts)
    : (Array.isArray(rows) ? rows : []);

  const countrySet = new Set();
  for (const row of enriched) {
    const { name } = resolveOnlineUserCountry(row?.country);
    if (name) countrySet.add(name);
  }
  for (const acc of Array.isArray(accounts) ? accounts : []) {
    const { name } = resolveOnlineUserCountry(acc?.country ?? acc?.Country);
    if (name) countrySet.add(name);
  }

  const groupSet = new Set();
  for (const row of enriched) {
    const g = cleanValue(row?.group);
    if (g && g !== 'Unspecified') groupSet.add(g);
  }
  for (const acc of Array.isArray(accounts) ? accounts : []) {
    const g = cleanValue(acc?.group ?? acc?.Group);
    if (g) groupSet.add(g);
  }
  for (const item of Array.isArray(extraGroups) ? extraGroups : []) {
    const g = cleanValue(typeof item === 'object' ? item?.name : item);
    if (g) groupSet.add(g);
  }

  const typeSet = new Set(DEFAULT_SESSION_TYPES);
  for (const row of enriched) {
    const t = resolveOnlineUserType(row);
    if (t && t !== 'Unknown') typeSet.add(t);
  }

  return {
    countries: [...countrySet].sort(stringCompare),
    groups: [...groupSet].sort(stringCompare),
    types: [...typeSet].sort(stringCompare),
    builds: uniqueValues(enriched, 'version'),
  };
};

export const buildOnlineUserAnalytics = (rows = [], filters = {}, accounts = []) => {
  const sourceRows = Array.isArray(accounts) && accounts.length > 0
    ? enrichOnlineUserRows(rows, accounts)
    : (Array.isArray(rows) ? rows : []);

  const group = cleanValue(filters.group);
  const type = cleanValue(filters.type);
  const build = cleanValue(filters.build);
  const country = cleanValue(filters.country);
  const filterCountryGeo = country ? resolveOnlineUserCountry(country).geoName.toLowerCase() : '';

  const countries = new Map();
  const geoCountries = new Map();
  const groups = new Map();
  const types = new Map();
  const builds = new Map();
  let total = 0;
  let totalEquity = 0;
  let adminSessions = 0;
  let unspecifiedCountries = 0;

  for (const row of sourceRows) {
    const rowType = resolveOnlineUserType(row);
    const rowBuild = cleanValue(row.version) || 'Unknown';
    const rowGroup = cleanValue(row.group) || 'Unspecified';
    const { name: rowCountry, geoName } = resolveOnlineUserCountry(row.country);

    if (group && rowGroup.trim() !== String(group).trim()) continue; // group names are case-sensitive identities
    if (type && rowType.toLowerCase() !== type.toLowerCase()) continue;
    if (build && cleanValue(row.version) !== build) continue;
    if (filterCountryGeo && geoName.toLowerCase() !== filterCountryGeo) continue;
    if (!matchesSearch(row, filters.search)) continue;

    total += 1;
    totalEquity += Number.isFinite(row.equity) ? row.equity : 0;
    if (row.isAdmin) adminSessions += 1;
    groups.set(rowGroup, (groups.get(rowGroup) || 0) + 1);
    types.set(rowType, (types.get(rowType) || 0) + 1);
    builds.set(rowBuild, (builds.get(rowBuild) || 0) + 1);
    if (rowCountry) {
      countries.set(rowCountry, (countries.get(rowCountry) || 0) + 1);
      const geoKey = geoName.toLowerCase();
      geoCountries.set(geoKey, (geoCountries.get(geoKey) || 0) + 1);
    } else {
      unspecifiedCountries += 1;
    }
  }

  const sortedCountries = sortedCounts(countries);
  const countryBreakdown = unspecifiedCountries > 0
    ? [...sortedCountries, { name: 'Unspecified', count: unspecifiedCountries }]
    : sortedCountries;

  return {
    total,
    totalEquity,
    adminSessions,
    uniqueGroups: groups.size,
    countries: sortedCountries,
    countryBreakdown,
    geoCountries,
    groups: sortedCounts(groups),
    types: sortedCounts(types),
    builds: sortedCounts(builds),
  };
};
