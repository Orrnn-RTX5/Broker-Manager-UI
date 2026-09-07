const isRecordObject = (value) => (
  value !== null && typeof value === 'object' && !Array.isArray(value)
);

const asRecord = (value) => {
  if (Array.isArray(value)) return value.find(isRecordObject) || null;
  return isRecordObject(value) ? value : null;
};

const firstPresent = (sources, keys) => {
  for (const source of sources) {
    if (!source) continue;
    for (const key of keys) {
      const value = source[key];
      if (value !== undefined && value !== null && String(value).trim() !== '') return value;
    }
  }
  return undefined;
};

export const normalizeAccount = (account) => {
  if (typeof account === 'number' || typeof account === 'string') {
    return {
      login: String(account),
      Name: '',
      balance: undefined,
      MarginCallLevel: undefined,
    };
  }
  if (!isRecordObject(account)) {
    return { login: '', Name: '', balance: undefined, MarginCallLevel: undefined };
  }

  const nestedSources = [
    account.raw, account.Raw,
    account.account, account.Account,
    account.user, account.User,
    account.answer, account.Answer,
    account.data, account.Data,
    account.details, account.Details,
    account.client, account.Client,
  ].map(asRecord).filter(Boolean);
  const sources = [account, ...nestedSources];
  const source = Object.assign({}, ...nestedSources, account);
  const login = firstPresent(sources, [
    'login', 'Login', 'accountLogin', 'account_login', 'loginId', 'login_id',
    'LoginID', 'id', 'ID',
  ]);
  const balance = firstPresent(sources, [
    'balance', 'Balance', 'accountBalance', 'account_balance',
    'balanceValue', 'BalanceValue', 'currentBalance', 'CurrentBalance',
  ]);
  const name = firstPresent(sources, ['Name', 'name', 'accountName', 'AccountName', 'username', 'Username']);

  return {
    ...source,
    login: login === undefined || login === null ? '' : String(login).trim(),
    Name: name || [source.FirstName || source.firstName, source.LastName || source.lastName].filter(Boolean).join(' ') || '',
    balance,
    MarginCallLevel: source.marginLevel || source.MarginLevel || source.MarginCallLevel,
  };
};

export const normalizeSidebarAccountPage = (page) => {
  if (!page || !Array.isArray(page.rows)) return undefined;
  const normalizedRows = page.rows
    .map(normalizeAccount)
    .filter((account) => account.login.length > 0);
  const rowsByLogin = new Map();

  normalizedRows.forEach((account) => {
    const previous = rowsByLogin.get(account.login);
    if (!previous) {
      rowsByLogin.set(account.login, account);
      return;
    }

    // A stale/lightweight cache can contain the same login more than once.
    // Merge useful fields from later records without allowing empty values to
    // erase an already available balance or account detail.
    const merged = { ...previous };
    Object.entries(account).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') merged[key] = value;
    });
    rowsByLogin.set(account.login, merged);
  });

  const rows = [...rowsByLogin.values()];
  if (rows.length === 0) return undefined;

  return {
    ...page,
    rows,
    total: page.total ?? null,
    hasMore: Boolean(page.hasMore),
    nextOffset: page.nextOffset ?? rows.length,
  };
};
