export const IB_ACCOUNT_STATUSES = ['pending', 'approved', 'active', 'suspended', 'rejected', 'removed'];
export const IB_COMMISSION_STATUSES = ['accrued', 'pending_review', 'approved', 'rejected', 'paid'];
export const MUTABLE_COMMISSION_STATUSES = ['accrued', 'pending_review', 'approved', 'rejected'];
export const IB_COMMISSION_TYPES = ['per_lot', 'spread_share', 'flat'];
export const IB_PARENT_ELIGIBLE_STATUSES = ['approved', 'active'];

const TRUE_FLAG_VALUES = new Set(['1', 'true', 'yes', 'enabled']);
const FALSE_FLAG_VALUES = new Set(['0', 'false', 'no', 'disabled']);

export const emptyToNull = (value) => {
  const text = String(value ?? '').trim();
  return text ? text : null;
};

export const normalizeIbBoolean = (value, fallback = false) => {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (value === 1) return true;
    if (value === 0) return false;
  }

  const normalized = String(value).trim().toLowerCase();
  if (TRUE_FLAG_VALUES.has(normalized)) return true;
  if (FALSE_FLAG_VALUES.has(normalized)) return false;
  return fallback;
};

export const toNumberOrNull = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

export const normalizeRecords = (response, preferredKeys = []) => {
  if (Array.isArray(response)) return response;
  if (!response || typeof response !== 'object') return [];

  for (const key of [...preferredKeys, 'answer', 'data', 'records', 'items', 'rows']) {
    if (Array.isArray(response[key])) return response[key];
  }

  return response.login || response.id ? [response] : [];
};

export const normalizeObject = (response, preferredKeys = []) => {
  if (Array.isArray(response)) return response[0] || null;
  if (!response || typeof response !== 'object') return null;

  for (const key of [...preferredKeys, 'answer', 'data', 'record', 'item']) {
    const value = response[key];
    if (Array.isArray(value)) return value[0] || null;
    if (value && typeof value === 'object') return value;
  }

  return response;
};

export const normalizeIBAccount = (row = {}) => ({
  ...row,
  login: toNumberOrNull(row.login ?? row.Login),
  parent_ib_login: toNumberOrNull(row.parent_ib_login ?? row.parentLogin ?? row.parent),
  level: Number(row.level ?? 0),
  company_name: row.company_name || row.companyName || '',
  website: row.website || '',
  referral_code: row.referral_code || row.referralCode || '',
  status: IB_ACCOUNT_STATUSES.includes(row.status) ? row.status : 'pending',
  approved_at: toNumberOrNull(row.approved_at),
  notes: row.notes || '',
  created_at: toNumberOrNull(row.created_at),
  client_count: Number(row.client_count ?? 0),
  unpaid_total: Number(row.unpaid_total ?? 0),
});

export const normalizeIBTreeNode = (node = {}) => ({
  ...normalizeIBAccount(node),
  children: normalizeRecords(node.children || [], ['children']).map(normalizeIBTreeNode),
});

export const normalizeIBPlan = (row = {}) => ({
  ...row,
  id: toNumberOrNull(row.id),
  ib_login: toNumberOrNull(row.ib_login),
  plan_name: row.plan_name || '',
  commission_type: IB_COMMISSION_TYPES.includes(row.commission_type) ? row.commission_type : 'per_lot',
  rate: Number(row.rate ?? 0),
  override_rate: Number(row.override_rate ?? 0),
  symbol_filter: row.symbol_filter || '',
  group_filter: row.group_filter || '',
  min_lots: Number(row.min_lots ?? 0),
  max_lots: Number(row.max_lots ?? 0),
  enabled: normalizeIbBoolean(row.enabled ?? row.Enabled, true),
  created_at: toNumberOrNull(row.created_at),
});

export const normalizeIBCommission = (row = {}) => ({
  ...row,
  id: toNumberOrNull(row.id),
  ib_login: toNumberOrNull(row.ib_login),
  client_login: toNumberOrNull(row.client_login),
  deal_ticket: toNumberOrNull(row.deal_ticket),
  symbol: row.symbol || '',
  lots: Number(row.lots ?? 0),
  commission_type: row.commission_type || '',
  commission_amount: Number(row.commission_amount ?? 0),
  override_amount: Number(row.override_amount ?? 0),
  total_amount: Number(row.total_amount ?? 0),
  status: IB_COMMISSION_STATUSES.includes(row.status) ? row.status : 'accrued',
  paid: row.status === 'paid' || normalizeIbBoolean(row.paid ?? row.Paid, false),
  paid_at: toNumberOrNull(row.paid_at),
  pay_ticket: toNumberOrNull(row.pay_ticket),
  calculated_at: toNumberOrNull(row.calculated_at),
});

export const getIBStatusActions = (status) => {
  if (status === 'pending') return ['approve', 'reject'];
  if (status === 'approved' || status === 'active') return ['suspend'];
  if (status === 'suspended') return ['activate'];
  return [];
};

export const isEligibleIBParent = (ibOrStatus) => {
  const status = typeof ibOrStatus === 'string' ? ibOrStatus : ibOrStatus?.status;
  return IB_PARENT_ELIGIBLE_STATUSES.includes(status);
};

export const canRemoveIB = (ib) => (
  Boolean(toNumberOrNull(ib?.login ?? ib?.Login))
  && normalizeIBAccount(ib).status !== 'removed'
);

export const canSetCommissionStatus = (commission, status) => (
  Boolean(commission)
  && !commission.paid
  && MUTABLE_COMMISSION_STATUSES.includes(status)
  && commission.status !== status
);

const requirePositiveInteger = (value, label) => {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return `${label} must be a positive integer.`;
  return '';
};

const requireNonNegativeNumber = (value, label) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return `${label} cannot be negative.`;
  return '';
};

export const validateIBCreateInput = (form = {}) => {
  const errors = [];
  const loginError = requirePositiveInteger(form.login, 'Account login');
  if (loginError) errors.push(loginError);

  if (emptyToNull(form.parent_ib_login)) {
    const parentError = requirePositiveInteger(form.parent_ib_login, 'Parent IB login');
    if (parentError) errors.push(parentError);
  }

  return errors;
};

export const buildIBCreatePayload = (form = {}) => ({
  login: Number(form.login),
  ...(emptyToNull(form.parent_ib_login) ? { parent_ib_login: Number(form.parent_ib_login) } : {}),
  ...(emptyToNull(form.company_name) ? { company_name: emptyToNull(form.company_name) } : {}),
  ...(emptyToNull(form.referral_code) ? { referral_code: emptyToNull(form.referral_code) } : {}),
  ...(emptyToNull(form.notes) ? { notes: emptyToNull(form.notes) } : {}),
});

export const validateClientLinkInput = ({ ib_login, client_login } = {}) => {
  const errors = [];
  const ibError = requirePositiveInteger(ib_login, 'IB login');
  if (ibError) errors.push(ibError);
  const clientError = requirePositiveInteger(client_login, 'Client login');
  if (clientError) errors.push(clientError);
  if (!ibError && !clientError && Number(ib_login) === Number(client_login)) {
    errors.push('Client login cannot be the same as the IB login.');
  }
  return errors;
};

export const validateCommissionPlanInput = (form = {}) => {
  const errors = [];
  if (!emptyToNull(form.plan_name)) errors.push('Plan name is required.');
  if (!IB_COMMISSION_TYPES.includes(form.commission_type)) errors.push('Commission type is invalid.');

  const rate = Number(form.rate);
  if (!Number.isFinite(rate) || rate <= 0) errors.push('Rate must be greater than zero.');

  const overrideError = requireNonNegativeNumber(form.override_rate ?? 0, 'Override rate');
  if (overrideError) errors.push(overrideError);
  const minError = requireNonNegativeNumber(form.min_lots ?? 0, 'Min lots');
  if (minError) errors.push(minError);
  const maxError = requireNonNegativeNumber(form.max_lots ?? 0, 'Max lots');
  if (maxError) errors.push(maxError);

  const minLots = Number(form.min_lots ?? 0);
  const maxLots = Number(form.max_lots ?? 0);
  if (Number.isFinite(minLots) && Number.isFinite(maxLots) && maxLots > 0 && maxLots < minLots) {
    errors.push('Max lots must be greater than or equal to min lots.');
  }

  return errors;
};

export const buildCommissionPlanPayload = (form = {}, ibLogin) => ({
  ...(form.id ? { id: Number(form.id) } : {}),
  ib_login: Number(form.ib_login || ibLogin),
  plan_name: emptyToNull(form.plan_name),
  commission_type: form.commission_type,
  rate: Number(form.rate),
  override_rate: Number(form.override_rate || 0),
  ...(emptyToNull(form.symbol_filter) ? { symbol_filter: emptyToNull(form.symbol_filter) } : {}),
  ...(emptyToNull(form.group_filter) ? { group_filter: emptyToNull(form.group_filter) } : {}),
  min_lots: Number(form.min_lots || 0),
  max_lots: Number(form.max_lots || 0),
  enabled: form.enabled !== false,
});

