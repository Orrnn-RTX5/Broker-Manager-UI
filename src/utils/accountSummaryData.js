const FIELDS = [
  { label: 'Login', keys: ['Login', 'login', 'login_id'], login: true },
  { label: 'Balance', keys: ['Balance', 'balance'] },
  { label: 'Equity', keys: ['Equity', 'equity'] },
  { label: 'Profit / Loss', keys: ['Profit', 'profit', 'floating_pnl'] },
  { label: 'Margin', keys: ['Margin', 'margin', 'used_margin'] },
  { label: 'Free Margin', keys: ['FreeMargin', 'freeMargin', 'free_margin', 'MarginFree', 'marginFree'] },
];

export const selectAccountSummary = (payload, login) => {
  if (!payload || typeof payload !== 'object') return null;
  if (Array.isArray(payload)) {
    const matching = payload.find(row => String(row?.Login ?? row?.login ?? '') === String(login));
    return matching ? selectAccountSummary(matching, login) : payload.length === 1 ? selectAccountSummary(payload[0], login) : null;
  }
  for (const key of ['accounts', 'answer', 'data', 'account', 'summary']) {
    if (payload[key] && typeof payload[key] === 'object') return selectAccountSummary(payload[key], login);
  }
  const payloadLogin = payload.Login ?? payload.login ?? payload.login_id;
  if (payloadLogin != null && String(payloadLogin) !== String(login)) return null;
  return payload;
};

const readValue = (sources, keys) => {
  for (const source of sources) {
    for (const key of keys) {
      const value = source?.[key];
      if (value !== undefined && value !== null && String(value).trim() !== '') return value;
    }
  }
  return null;
};

export const buildAccountSummaryRows = (payload, account = {}, login) => {
  const data = selectAccountSummary(payload, login);
  const row = selectAccountSummary(account, login);
  const sources = data ? [data] : [row, row?.raw];
  const precision = Number(readValue(sources, ['CurrencyDigits', 'currencyDigits', 'currency_digits']));
  const digits = Number.isInteger(precision) && precision >= 0 && precision <= 8 && readValue(sources, ['CurrencyDigits', 'currencyDigits', 'currency_digits']) !== null ? precision : 2;
  const number = new Intl.NumberFormat('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
  return FIELDS.map(field => {
    const raw = field.login ? String(login) : readValue(sources, field.keys);
    const numeric = raw === null || typeof raw === 'boolean' ? null : Number(String(raw).replace(/,/g, '').trim());
    return {
      label: field.label,
      value: field.login ? raw : numeric !== null && Number.isFinite(numeric) ? number.format(numeric) : '—',
      tone: field.label === 'Profit / Loss' && numeric !== null && numeric !== 0 && Number.isFinite(numeric) ? numeric < 0 ? 'is-negative' : 'is-positive' : '',
    };
  });
};
