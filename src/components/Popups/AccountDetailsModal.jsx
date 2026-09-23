import { showResult } from '../../store/resultDialogStore.js';
import { useState, useEffect, useRef } from 'react';
import { X, Square, PlusSquare, Loader, Eye, EyeOff, Copy, Check as CheckIcon, Plus, CheckCircle2, Edit3, Play, Trash2, BarChart3, ChevronRight, FileText, Settings, RefreshCw, ShieldCheck } from 'lucide-react';
import { completeAccountPositions, getAccountPositions, getPositionHistory, hasAccountPositionsContinuation, invalidatePositionsCache, peekAccountPositions } from '../../services/api';
import PositionHistoryGrid from '../../features/clients/components/PositionHistoryGrid';
import { getPositionUpdateLogin, subscribeToPositionSync, requiresPositionReconciliation } from '../../services/positionSync';
import { useLivePositions, useLiveAccountMetrics } from '../../hooks/useLiveTrading';
import { liveTradingState } from '../../services/liveTradingState';
import positionAdapter from './adapters/position';
import orderAdapter from './adapters/order';
import dealAdapter from './adapters/deal';
import AccountTradeTab from './AccountTradeTab';
import DepositDialog from './DepositDialog';
import { orderDelete } from '../../services/tradeApi';
import { fetchManagerApi } from '../../services/managerFetch';
import { closeManagerPosition } from '../../services/managerTradeApi';
import { submitManagerTransaction } from '../../services/managerFinanceApi';
import { updateManagerAccount } from '../../services/managerAccountApi';
import { usePermissions } from '../../hooks/usePermissions';
import { PERMISSIONS } from '../../utils/permissions';
import { redactSensitive } from '../../utils/redaction';
import {
  canCloseAccountTrades,
  canMutateAccountTrades,
  TRADE_CLOSE_DENIED_MESSAGE,
  TRADE_MUTATION_DENIED_MESSAGE,
} from './accountTradePermissions';

const ADAPTERS = { position: positionAdapter, order: orderAdapter, deal: dealAdapter };

const TABS = [
  'Overview', 'Personal', 'Account', 'Limits', 'Balance', 'Trade', 'History', 'Security'
];

const ACCOUNT_NUMBER_FORMATTER = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const ACCOUNT_POSITION_LIVE_REFRESH_MIN_MS = 50;


const pendingAccountDetailsRequests = new Map();

const requestAccountDetails = async (loginId) => {
  const params = new URLSearchParams({ login: String(loginId) });
  const response = await fetchManagerApi(`/AccountDetails?${params.toString()}`, {
    headers: { accept: 'application/json' },
  });
  const text = await response.text();
  let payload;

  try {
    payload = JSON.parse(text);
  } catch {
    throw new Error(response.ok ? 'Invalid account details response' : text || 'Failed to refresh account balance');
  }

  if (!response.ok) {
    throw new Error(payload?.error || payload?.message || 'Failed to refresh account balance');
  }

  return payload;
};

const loadAccountDetails = (loginId, { force = false } = {}) => {
  const key = String(loginId);
  if (!force && pendingAccountDetailsRequests.has(key)) return pendingAccountDetailsRequests.get(key);

  const request = requestAccountDetails(loginId).finally(() => {
    if (pendingAccountDetailsRequests.get(key) === request) pendingAccountDetailsRequests.delete(key);
  });
  pendingAccountDetailsRequests.set(key, request);
  return request;
};

const TradeContextMenuItem = ({ icon: Icon, text, color, onClick, submenu, isHeader, disabled = false }) => (
  <div
    className={`flex items-center gap-3 px-3 py-2 text-[12px] cursor-pointer transition-colors group
      ${isHeader ? 'bg-blue-600/10 text-blue-400 font-bold border-b border-blue-500/20' : 'hover:bg-white/5 text-gray-300'}
      ${disabled ? 'opacity-50 cursor-not-allowed hover:bg-transparent' : ''}`}
    onClick={disabled ? undefined : onClick}
  >
    <div className="w-4 h-4 flex items-center justify-center">
      {Icon && <Icon size={14} style={{ color: color || 'currentColor' }} />}
    </div>
    <span className="flex-1">{text}</span>
    {submenu && <ChevronRight size={12} className="text-gray-600" />}
  </div>
);

const TradeContextMenuSeparator = () => <div className="h-[1px] bg-[var(--border)] my-1 opacity-50" />;

const LANGUAGE_OPTIONS = [
  'English (en)',
  'Chinese (zh)',
  'French (fr)',
  'German (de)',
  'Hindi (hi)',
  'Japanese (ja)',
  'Russian (ru)',
  'Spanish (es)',
  'Turkish (tr)',
];

const createGeneratedPassword = () => {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%';
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  const random = Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join('');
  return `A9!${random}`;
};

// Whitelist of fields the account update form is allowed to submit. Anything not in
// this set (e.g. balance, equity, password_hash, broker_id, is_admin injected
// via dev-tools into formData) is stripped before the request is built so the
// client cannot be coaxed into pushing arbitrary columns to the backend.
const USER_UPDATE_ALLOWED_FIELDS = new Set([
  'FirstName', 'LastName', 'MiddleName', 'Company', 'Language', 'Status',
  'IDNumber', 'LeadCampaign', 'MQID', 'LeadSource',
  'Email', 'Phone', 'Country', 'State', 'City', 'ZipCode', 'Address', 'Comment',
  'Group', 'Leverage', 'MarginCallLevel', 'StopOutLevel',
]);

const pickAllowedFields = (source, allowed) =>
  Object.entries(source || {}).reduce((acc, [key, value]) => {
    if (allowed.has(key)) acc[key] = value;
    return acc;
  }, {});

const hasDisplayValue = (value) =>
  value !== undefined && value !== null && !(typeof value === 'string' && value.trim() === '');

// Account windows are draggable. Keep their title bar and tabs reachable even
// after a drag or a browser resize, otherwise the top controls can disappear
// above the viewport while the lower form remains visible.
const clampPopupPosition = (position = {}, size = {}) => {
  const width = Math.max(0, Number(size.width) || 0);
  const height = Math.max(0, Number(size.height) || 0);
  const maxX = Math.max(0, window.innerWidth - width);
  const maxY = Math.max(0, window.innerHeight - height);

  return {
    x: Math.min(maxX, Math.max(0, Number(position.x) || 0)),
    y: Math.min(maxY, Math.max(0, Number(position.y) || 0)),
  };
};

const normalizeLanguageOption = (value) => {
  if (!hasDisplayValue(value)) return LANGUAGE_OPTIONS[0];
  const raw = String(value).trim();
  const normalized = raw.toLowerCase();
  return LANGUAGE_OPTIONS.find((option) =>
    option.toLowerCase() === normalized || option.toLowerCase().endsWith(`(${normalized})`)
  ) || raw;
};

const pickFirstValue = (sources, keys, fallback = '') => {
  for (const source of sources) {
    if (!source || typeof source !== 'object') continue;
    for (const key of keys) {
      const value = source[key];
      if (hasDisplayValue(value)) return value;
    }
  }
  return fallback;
};

const getAccountDetailSources = (payload) => {
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
    .map((source) => Array.isArray(source)
      ? source.find((item) => item && typeof item === 'object' && !Array.isArray(item))
      : source)
    .filter((source) => source && typeof source === 'object' && !Array.isArray(source));
};

const ACCOUNT_FIELD_KEYS = {
  FirstName: ['FirstName', 'firstName', 'Name', 'name'],
  LastName: ['LastName', 'lastName'],
  MiddleName: ['MiddleName', 'middleName', 'Middle', 'middle', 'SecondName', 'secondName'],
  Company: ['Company', 'company', 'Organization', 'organization'],
  Language: ['Language', 'language', 'Lang', 'lang'],
  Status: ['Status', 'status'],
  IDNumber: ['IDNumber', 'idNumber', 'IdNumber', 'id_number', 'ID', 'Id', 'id', 'Document', 'document', 'Passport', 'passport', 'NationalID', 'nationalId', 'national_id'],
  LeadCampaign: ['LeadCampaign', 'leadCampaign', 'LeadCampaignName', 'leadCampaignName', 'lead_campaign', 'Campaign', 'campaign', 'CampaignId', 'campaignId'],
  LeadSource: ['LeadSource', 'leadSource', 'lead_source', 'Source', 'source', 'LeadSourceId', 'leadSourceId'],
  MQID: ['MQID', 'mqid', 'MetaQuotesID', 'MetaQuotesId', 'metaQuotesID', 'metaQuotesId'],
  Email: ['Email', 'email'],
  Phone: ['Phone', 'phone', 'PhoneNumber', 'phoneNumber', 'phone_number', 'Mobile', 'mobile', 'MobilePhone', 'mobilePhone', 'CellPhone', 'cellPhone', 'Telephone', 'telephone'],
  Country: ['Country', 'country', 'CountryName', 'countryName', 'country_name', 'ClientCountry', 'clientCountry', 'client_country'],
  State: ['State', 'state', 'StateName', 'stateName', 'state_name', 'Province', 'province', 'Region', 'region'],
  City: ['City', 'city', 'CityName', 'cityName', 'city_name'],
  ZipCode: ['ZipCode', 'zipCode', 'Zip', 'zip', 'zip_code', 'PostalCode', 'postalCode', 'postal_code'],
  Address: ['Address', 'address', 'Address1', 'address1', 'Address2', 'address2', 'Street', 'street'],
  Comment: ['Comment', 'comment', 'Notes', 'notes', 'Note', 'note'],
  Group: ['Group', 'group'],
  Currency: ['Currency', 'currency'],
  Leverage: ['Leverage', 'leverage'],
  Registration: ['Registration', 'registration', 'Registered', 'registered'],
  LastAccess: ['LastAccess', 'lastAccess', 'last_access'],
  LastIP: ['LastIP', 'lastIP', 'last_ip'],
  AccountMode: ['AccountMode', 'accountMode', 'mode'],
  Balance: ['Balance', 'balance'],
  Equity: ['Equity', 'equity'],
  Margin: ['Margin', 'margin'],
  MarginFree: ['MarginFree', 'marginFree'],
  MarginLevel: ['MarginLevel', 'marginLevel'],
  Credit: ['Credit', 'credit'],
  Profit: ['Profit', 'profit'],
  Swap: ['Swap', 'swap'],
  MarginCallLevel: ['MarginCallLevel', 'marginCallLevel'],
  StopOutLevel: ['StopOutLevel', 'stopOutLevel'],
};

const TradeContextMenu = ({ x, y, data, onClose, onModify, onCloseTrade, canCloseTrades, canManipulateTrades }) => {
  const style = {
    top: Math.min(y, window.innerHeight - 400),
    left: Math.min(x, window.innerWidth - 240),
  };

  return (
    <div
      className="fixed z-[100000] w-56 ui-card shadow-2xl border border-[var(--border)] rounded-lg py-1 overflow-hidden"
      style={style}
      onContextMenu={(e) => e.preventDefault()}
    >
      <TradeContextMenuItem text={`TRADE #${data?.position || '---'}`} isHeader />
      <TradeContextMenuItem icon={Plus} text="New Order" color="var(--ok-text)" />
      <TradeContextMenuItem icon={CheckCircle2} text="Close Position" color="var(--danger-text)" disabled={!canCloseTrades} onClick={() => { onCloseTrade(data.position); onClose(); }} />
      <TradeContextMenuItem icon={Edit3} text="Modify or Cancel" color="var(--accent)" disabled={!canManipulateTrades} onClick={() => { onModify(data); onClose(); }} />
      <TradeContextMenuItem icon={Play} text="Activate" />
      <TradeContextMenuSeparator />
      <TradeContextMenuItem icon={Settings} text="Edit" color="var(--info-text)" />
      <TradeContextMenuItem icon={Trash2} text="Delete" color="var(--danger-text)" />
      <TradeContextMenuSeparator />
      <TradeContextMenuItem text="Volumes" icon={BarChart3} submenu />
      <TradeContextMenuItem text="Profit" icon={BarChart3} submenu />
      <TradeContextMenuSeparator />
      <TradeContextMenuItem text="Report" icon={FileText || BarChart3} submenu />
      <TradeContextMenuSeparator />
      <TradeContextMenuItem text="Show Milliseconds" />
      <TradeContextMenuItem text="Auto Arrange" />
      <TradeContextMenuItem text="Grid" />
      <TradeContextMenuSeparator />
      <TradeContextMenuItem text="Columns" submenu />
    </div>
  );
};

const AccountDetailsModal = ({ account, targetTicket, onClose, initialTab = 'Overview', entity = 'position', onAccountUpdated }) => {
  const adapter = ADAPTERS[entity] || positionAdapter;
  const loginId = account && typeof account === 'object' ? account.login : account;
  const initialPositions = peekAccountPositions(loginId);
  const { canAct } = usePermissions();
  const canManageAccounts = canAct(PERMISSIONS.MANAGE_ACCOUNTS);
  const canManageFinances = canAct(PERMISSIONS.MANAGE_FINANCES);
  const canManagePasswords = canAct(PERMISSIONS.MANAGE_PASSWORDS);
  const canManipulateTrades = canMutateAccountTrades(canAct);
  const canCloseTrades = canCloseAccountTrades(canAct);
  const [activeTab, setActiveTab] = useState(initialTab);
  const [accountData, setAccountData] = useState(null);
  const [detailsLoading, setLoading] = useState(false);
  const [detailsError, setError] = useState(null);
  const [formData, setFormData] = useState({});
  const [updateLoading, setUpdateLoading] = useState(false);
  const [updateFeedback, setUpdateFeedback] = useState(null);
  const [tradeUpdateState, setTradeUpdateState] = useState({ canUpdate: false, busy: false });
  const [passwords, setPasswords] = useState({ master: '', investor: '', api: '', phone: '', otp: '' });
  const [checkingPassword, setCheckingPassword] = useState(null);
  const [changingPassword, setChangingPassword] = useState(null);
  const [showPasswords, setShowPasswords] = useState({ master: false, investor: false, api: false, phone: false, otp: false });
  const [copiedField, setCopiedField] = useState(null);

  const [depositAmount, setDepositAmount] = useState('');
  const [depositComment, setDepositComment] = useState('');
  const [isDepositing, setIsDepositing] = useState(false);
  const [depositError, setDepositError] = useState(null);
  const [depositSuccess, setDepositSuccess] = useState(null);
  const [depositConfirmation, setDepositConfirmation] = useState(null);
  const depositConfirmationRef = useRef(null);
  useEffect(() => () => depositConfirmationRef.current?.(false), []);
  const finishDepositConfirmation = (confirmed) => {
    const resolve = depositConfirmationRef.current;
    depositConfirmationRef.current = null;
    setDepositConfirmation(null);
    resolve?.(confirmed);
  };

  const [snapshotPositions, setPositions] = useState(() => initialPositions || []);
  const [positionsSnapshotRevision, setPositionsSnapshotRevision] = useState(0);
  const positions = useLivePositions(snapshotPositions, loginId, true, positionsSnapshotRevision);
  const liveMetrics = useLiveAccountMetrics(loginId);
  const [positionsLoading, setPositionsLoading] = useState(() => initialPositions === undefined);
  const [positionsError, setPositionsError] = useState('');
  const [historyRows, setHistoryRows] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState('');
  const [historyRefreshRevision, setHistoryRefreshRevision] = useState(0);
  const [positionSyncRevision, setPositionSyncRevision] = useState(0);
  const lastPositionsRequestAtRef = useRef(0);
  const pendingPositionsRefreshTimerRef = useRef(null);
  const [selectedTicketSnapshot, setSelectedTicketRow] = useState(null);
  const selectedTicketRow = useLivePositions(selectedTicketSnapshot ? [selectedTicketSnapshot] : [], loginId)[0] || null;
  const [isDeleting, setIsDeleting] = useState(false);
  const [pendingTradeClose, setPendingTradeClose] = useState(null);

  const [ctxMenu, setCtxMenu] = useState({ x: 0, y: 0, isOpen: false, data: null });

  useEffect(() => {
    const closeMenu = () => setCtxMenu(prev => prev.isOpen ? { ...prev, isOpen: false } : prev);
    window.addEventListener('click', closeMenu);
    return () => window.removeEventListener('click', closeMenu);
  }, []);

  const initialWidth = Math.min(880, window.innerWidth - 40);
  const initialHeight = Math.min(630, window.innerHeight - 40);

  const [position, setPosition] = useState({
    x: Math.max(0, (window.innerWidth - initialWidth) / 2),
    y: Math.max(0, (window.innerHeight - initialHeight) / 2)
  });
  const [size, setSize] = useState({ width: initialWidth, height: initialHeight });
  const [isMaximized, setIsMaximized] = useState(false);
  const [preMaxState, setPreMaxState] = useState({ x: 0, y: 0, w: 0, h: 0 });

  const handleHeaderMouseDown = (e) => {
    if (isMaximized || e.target.closest('button') || e.target.closest('.window-controls')) return;
    e.preventDefault();
    let startX = e.clientX;
    let startY = e.clientY;
    let startPosX = position.x;
    let startPosY = position.y;

    const handleMouseMove = (moveEvent) => {
      setPosition(clampPopupPosition({
        x: startPosX + (moveEvent.clientX - startX),
        y: startPosY + (moveEvent.clientY - startY),
      }, size));
    };

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.userSelect = '';
    };

    document.body.style.userSelect = 'none';
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  const handleResizeMouseDown = (e, edge) => {
    if (isMaximized) return;
    e.preventDefault();
    e.stopPropagation();
    let startX = e.clientX;
    let startY = e.clientY;
    let startWidth = size.width;
    let startHeight = size.height;
    let startPosX = position.x;

    const handleMouseMove = (moveEvent) => {
      let dx = moveEvent.clientX - startX;
      let dy = moveEvent.clientY - startY;

      if (edge === 'right') {
        setSize(prev => ({ ...prev, width: Math.max(500, startWidth + dx) }));
      } else if (edge === 'bottom') {
        setSize(prev => ({ ...prev, height: Math.max(400, startHeight + dy) }));
      } else if (edge === 'bottom-right') {
        setSize({
          width: Math.max(500, startWidth + dx),
          height: Math.max(400, startHeight + dy)
        });
      } else if (edge === 'left') {
        let newWidth = Math.max(500, startWidth - dx);
        let actualDx = newWidth - startWidth;
        setSize(prev => ({ ...prev, width: newWidth }));
        setPosition(prev => ({
          ...prev,
          x: clampPopupPosition({ x: startPosX - actualDx, y: prev.y }, { width: newWidth, height: startHeight }).x,
        }));
      }
    };

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    if (edge === 'left' || edge === 'right') document.body.style.cursor = 'ew-resize';
    else if (edge === 'bottom') document.body.style.cursor = 'ns-resize';
    else if (edge === 'bottom-right') document.body.style.cursor = 'nwse-resize';
    document.body.style.userSelect = 'none';

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  const toggleMaximize = () => {
    if (!isMaximized) {
      setPreMaxState({ x: position.x, y: position.y, w: size.width, h: size.height });
      setIsMaximized(true);
    } else {
      setIsMaximized(false);
      setPosition(clampPopupPosition({ x: preMaxState.x, y: preMaxState.y }, {
        width: preMaxState.w,
        height: preMaxState.h,
      }));
      setSize({ width: preMaxState.w, height: preMaxState.h });
    }
  };

  useEffect(() => {
    const keepPopupVisible = () => {
      setPosition((currentPosition) => {
        const clampedPosition = clampPopupPosition(currentPosition, size);
        return clampedPosition.x === currentPosition.x && clampedPosition.y === currentPosition.y
          ? currentPosition
          : clampedPosition;
      });
    };

    keepPopupVisible();
    window.addEventListener('resize', keepPopupVisible);
    return () => window.removeEventListener('resize', keepPopupVisible);
  }, [size]);

  const requireTradeMutationPermission = () => {
    if (canManipulateTrades) return true;
    showResult.error(TRADE_MUTATION_DENIED_MESSAGE);
    return false;
  };

  const requireTradeClosePermission = () => {
    if (canCloseTrades) return true;
    showResult.error(TRADE_CLOSE_DENIED_MESSAGE);
    return false;
  };

  // Entity-aware close/cancel. Positions use the versioned POST manager API;
  // orders cancel via their adapter; deals are historical and cannot be deleted.
  const requestTradeClose = (trade) => {
    if (!requireTradeClosePermission()) return;
    if (entity === 'deal') {
      showResult.info('Deals are historical records and cannot be deleted from this view.');
      return;
    }
    setPendingTradeClose(trade);
  };

  const handleDeleteTrade = async (ticket) => {
    if (!requireTradeClosePermission()) return;
    setIsDeleting(true);
    const label = entity === 'order' ? `Cancel Order #${ticket}` : `Close Position #${ticket}`;
    try {
      let result;
      if (entity === 'order') {
        result = await orderDelete(ticket);
      } else {
        result = await closeManagerPosition(ticket);
      }
      console.log(`[${label}] response:`, redactSensitive(result));
      const message = result?.message || JSON.stringify(result);
      showResult({ ...result, message: `${label}\n\n${message}` });
      invalidatePositionsCache(loginId);
      if (entity !== 'order') liveTradingState.ingest({ type: 'position_closed', data: { account_login: loginId, ticket } });
      setPositions(prev => prev.filter(p => p.position !== ticket));
    } catch (err) {
      console.error(`[${label}] error:`, err);
      const status = err?.code || err?.status || 'ERROR';
      showResult.error(`${label} failed\n\nstatus: ${status}\nmessage: ${err?.message || String(err)}`);
    } finally {
      setIsDeleting(false);
      setPendingTradeClose(null);
    }
  };

  useEffect(() => {
    const refreshPositions = () => {
      const runRefresh = () => {
        pendingPositionsRefreshTimerRef.current = null;
        lastPositionsRequestAtRef.current = Date.now();
        invalidatePositionsCache(loginId);
        setPositionSyncRevision((revision) => revision + 1);
      };

      const elapsed = Date.now() - lastPositionsRequestAtRef.current;
      const remaining = ACCOUNT_POSITION_LIVE_REFRESH_MIN_MS - elapsed;
      if (remaining <= 0) {
        runRefresh();
        return;
      }
      if (pendingPositionsRefreshTimerRef.current !== null) return;
      // Coalesce a burst into one trailing refresh instead of dropping the last
      // update and leaving the modal stale until the 30-second safety poll.
      pendingPositionsRefreshTimerRef.current = window.setTimeout(runRefresh, remaining);
    };

    const unsubscribe = subscribeToPositionSync((event) => {
      if (event.type === 'position' && !requiresPositionReconciliation(event.payload)) return;
      // The modal already performs its initial account-scoped fetch. A websocket
      // reconnect can happen repeatedly on an unavailable feed, so treating every
      // `connected` snapshot as data invalidation creates a request loop.
      if (event?.type === 'snapshot' && event?.reason === 'connected') {
        refreshPositions();
        return;
      }

      if (event?.type === 'position') {
        const updateLogin = getPositionUpdateLogin(event.payload);
        // Untargeted frames must not make every open account refetch. The
        // periodic snapshot below reconciles any malformed server envelope.
        if (updateLogin === undefined && event.payload?.type !== 'state_changed') return;
        if (updateLogin !== undefined && String(updateLogin) !== String(loginId)) return;
      } else if (event?.type !== 'snapshot' || event?.reason !== 'poll') {
        return;
      }

      refreshPositions();
    });

    return () => {
      unsubscribe();
      if (pendingPositionsRefreshTimerRef.current !== null) {
        window.clearTimeout(pendingPositionsRefreshTimerRef.current);
        pendingPositionsRefreshTimerRef.current = null;
      }
    };
  }, [loginId]);

  const handleModifySLTP = (pos) => {
    setSelectedTicketRow(pos);
    setActiveTab('Trade');
  };

  const showUpdateResult = (label, result) => setUpdateFeedback({
    status: 'success', title: result?.title || 'Trade successful', message: result?.message || `${label} completed successfully.`,
  });
  const showError = (label, error) => setUpdateFeedback({
    status: 'error', title: 'Trade unsuccessful', message: `${label}: ${error?.message || "The request could not be completed."}`,
  });

  const togglePassword = (field) => {
    setShowPasswords(prev => ({ ...prev, [field]: !prev[field] }));
  };

  const generatePassword = (field) => {
    setPasswords((current) => ({ ...current, [field]: createGeneratedPassword() }));
    setShowPasswords((current) => ({ ...current, [field]: true }));
  };

  const handleCopy = async (field, value) => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 2000);
    } catch (err) {
      console.error('Failed to copy', err);
    }
  };

  // NOTE: all hooks (incl. this effect) MUST stay above the `if (!account)`
  // early return below so hook order is stable even if the modal is ever
  // rendered with a falsy `account` (react-hooks/rules-of-hooks). The effect
  // self-guards on `loginId`, so it is a no-op when there is no account.
  useEffect(() => {
    if (!loginId) return;

    let active = true;

    let detailsRequest = 0;
    const fetchDetails = async ({ silent = false } = {}) => {
      const requestId = ++detailsRequest;
      if (!silent) setLoading(true);
      if (!silent) setError(null);

      try {
        const details = await loadAccountDetails(loginId, { force: true });
        if (active && requestId === detailsRequest) {
          setAccountData(details);
          setError(null);
        }
      } catch (err) {
        if (active && requestId === detailsRequest && !silent) setError(err.message);
      } finally {
        if (active && requestId === detailsRequest) setLoading(false);
      }
    };

    fetchDetails();

    // Metrics arrive on the ticket-authenticated stream; this is recovery only.
    const detailsRefresh = setInterval(() => fetchDetails({ silent: true }), 30_000);
    const refreshDetails = () => fetchDetails({ silent: true });
    window.addEventListener('manager:refresh-data', refreshDetails);

    return () => {
      active = false;
      clearInterval(detailsRefresh);
      window.removeEventListener('manager:refresh-data', refreshDetails);
    };
  }, [loginId]);

  useEffect(() => {
    if (!loginId) return;

    let active = true;

    const fetchPositions = async () => {
      const startedRevision = liveTradingState.snapshot();
      lastPositionsRequestAtRef.current = Date.now();
      setPositionsLoading(true);
      setPositionsError('');
      try {
        let mine = await getAccountPositions(loginId);
        if (!active) return;
        setPositionsSnapshotRevision(startedRevision);
        setPositions(mine);

        if (hasAccountPositionsContinuation(loginId)) {
          mine = await completeAccountPositions(loginId, mine, {
            onPage: (rows) => {
              if (active) setPositions(rows);
            },
          });
          if (!active) return;
          setPositions(mine);
        }

        // When the popup was opened via double-click on a row, `targetTicket`
        // holds that row's ticket. Auto-select it so the Trade tab is pre-wired
        // to that position (no more "Select a row" placeholder).
        if (targetTicket) {
          const hit = mine.find(p =>
            p.position === targetTicket ||
            p.ticket === targetTicket ||
            String(p.position) === String(targetTicket)
          );
          if (hit) {
            setSelectedTicketRow(hit);
          } else {
            // Fallback: synthesize a minimal row so buttons still work for
            // Orders / Deals where the popup doesn't fetch its own list.
            setSelectedTicketRow({
              position: targetTicket,
              ticket: targetTicket,
              symbol: 'EURUSD',
              type: 'buy',
              priceSl: 0,
              priceTp: 0,
            });
          }
        }
      } catch (err) {
        if (!active) return;
        console.error("Failed to fetch positions", err);
        setPositionsError(err?.message || 'Unable to load open positions.');
        if (targetTicket) {
          setSelectedTicketRow({
            position: targetTicket,
            ticket: targetTicket,
            symbol: 'EURUSD',
            type: 'buy',
            priceSl: 0,
            priceTp: 0,
          });
        }
      } finally {
        if (active) setPositionsLoading(false);
      }
    };

    fetchPositions();

    return () => {
      active = false;
    };
  }, [loginId, targetTicket, positionSyncRevision]);

  useEffect(() => {
    if (activeTab !== 'History' || !loginId) return;

    let active = true;
    setHistoryLoading(true);
    setHistoryError('');
    getPositionHistory(loginId)
      .then((rows) => {
        if (active) setHistoryRows(Array.isArray(rows) ? rows : []);
      })
      .catch((err) => {
        if (!active) return;
        setHistoryRows([]);
        setHistoryError(err?.message || 'Failed to load position history.');
      })
      .finally(() => {
        if (active) setHistoryLoading(false);
      });

    return () => { active = false; };
  }, [activeTab, loginId, historyRefreshRevision]);

  // Early return AFTER all hooks so hook order is invariant across renders.
  if (!account) return null;

  const rowData = account && typeof account === 'object' ? account : {};
  const fieldSources = [...getAccountDetailSources(accountData), rowData];
  const getFieldValue = (field, fallback = '') => {
    const metricField = { Balance: 'balance', Credit: 'credit', Equity: 'equity', Margin: 'used_margin', MarginFree: 'free_margin', FreeMargin: 'free_margin', MarginLevel: 'margin_level', Profit: 'floating_pnl' }[field];
    if (metricField && liveMetrics?.[metricField] != null) return liveMetrics[metricField];
    // A saved empty string is intentional; do not revive an older row value.
    if (accountData?.[field] !== undefined && accountData[field] !== null) return accountData[field];
    return pickFirstValue(fieldSources, ACCOUNT_FIELD_KEYS[field] || [field], fallback);
  };

  const getValue = (field, fallback = '') => {
    if (formData[field] !== undefined) return formData[field];
    return getFieldValue(field, fallback);
  };

  const handleInputChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleUpdate = async () => {
    if (updateLoading) return;
    if (!canManageAccounts) {
      setFormData({});
      setUpdateFeedback({ status: 'error', title: 'Update unsuccessful', message: 'Your role does not have permission to update accounts.' });
      return;
    }
    const allowedUpdates = pickAllowedFields(formData, USER_UPDATE_ALLOWED_FIELDS);
    if (Object.keys(allowedUpdates).length !== Object.keys(formData).length) {
      setFormData({});
      setUpdateFeedback({ status: 'error', title: 'Update unsuccessful', message: 'One or more fields cannot be updated. The fields have been reset to their saved values.' });
      return;
    }
    if (Object.keys(allowedUpdates).length === 0) return;
    try {
      setUpdateLoading(true);
      setUpdateFeedback({ status: 'pending', title: 'Updating account', message: `Saving changes to account #${loginId}.` });

      await updateManagerAccount(loginId, allowedUpdates);

      setAccountData(prev => ({ ...prev, ...allowedUpdates }));
      setFormData({});
      setUpdateFeedback({ status: 'success', title: 'Update successful', message: `${activeTab === 'Personal' ? 'Personal details' : 'Account details'} for account #${loginId} updated successfully.` });
      // A parent refresh failure does not change the saved update's result.
      void Promise.resolve().then(() => onAccountUpdated?.(loginId, allowedUpdates)).catch(() => {});
    } catch (err) {
      console.error(err);
      setFormData({});
      setUpdateFeedback({ status: 'error', title: 'Update unsuccessful', message: `Could not update account #${loginId}: ${err?.message || 'Please try again.'} The fields have been reset to their last saved values.` });
    } finally {
      setUpdateLoading(false);
    }
  };

  const handlePasswordCheck = async (type, password) => {
    if (!canManagePasswords) {
      showResult.error('Your role does not have permission to verify account passwords.');
      return;
    }
    if (!password) {
      showResult.info("Please enter a password to check.");
      return;
    }
    setCheckingPassword(type);
    try {
      // POST the cleartext password in a JSON body (mirrors UserPasswordChange)
      // so it never appears in the request URL, server access logs, or browser
      // history (fe-manager-ui-03 / fe-manager-ui-08). Backend exposes POST JSON.
      const res = await fetchManagerApi('/UserPasswordCheck', {
        method: 'POST',
        headers: { 'accept': 'text/plain', 'Content-Type': 'application/json' },
        body: JSON.stringify({ login: loginId, type, password })
      });
      const text = await res.text();
      showResult(text, { title: 'Password check result', type: res.ok ? undefined : 'error' });
    } catch (err) {
      showResult.error(`Error checking password: ${err.message}`);
    } finally {
      setCheckingPassword(null);
    }
  };


  const handlePasswordChange = async (type, password) => {
    if (!canManagePasswords) {
      showResult.error('Your role does not have permission to change account passwords.');
      return;
    }
    if (!password) {
      showResult.info("Please enter a new password to change.");
      return;
    }
    setChangingPassword(type);
    try {
      // Send the new password in a POST JSON body. The backend exposes both GET
      // and POST for /UserPasswordChange; POST keeps the cleartext password out
      // of the request URL, server access logs, and browser history.
      const res = await fetchManagerApi('/UserPasswordChange', {
        method: 'POST',
        headers: { 'accept': 'text/plain', 'Content-Type': 'application/json' },
        body: JSON.stringify({ login: loginId, type, password })
      });
      const text = await res.text();
      showResult(text, { title: 'Password change result', type: res.ok ? undefined : 'error' });
    } catch (err) {
      showResult.error(`Error changing password: ${err.message}`);
    } finally {
      setChangingPassword(null);
    }
  };

  const handleTransaction = async () => {
    if (depositConfirmationRef.current || isDepositing) return;
    const reportFailure = (message) => {
      setDepositAmount('');
      setDepositComment('');
      setDepositError(`${message} The amount and comment have been reset.`);
    };
    setDepositError(null);
    setDepositSuccess(null);
    if (!canManageFinances) {
      reportFailure('Your role does not have permission to manage account funds.');
      return;
    }
    // Client-side validation is defence-in-depth only — the backend remains the
    // authority — but it must still reject malformed/blank/over-precision input
    // before a financial request reaches the backend.
    const validateMoney = (raw, { allowNegative = false } = {}) => {
      const str = String(raw).trim();
      // up to 2 decimal places, optional leading minus
      if (!/^-?\d+(\.\d{1,2})?$/.test(str)) return null;
      const num = Number(str);
      if (!Number.isFinite(num)) return null;
      if (!allowNegative && num <= 0) return null;
      if (Math.abs(num) > 1000000) return null;
      return num;
    };

    const amountVal = validateMoney(depositAmount);
    if (amountVal === null) {
      reportFailure("Amount must be a positive number with up to 2 decimals and cannot exceed 1,000,000.");
      return;
    }

    const parsedLogin = Number(loginId);
    if (!Number.isSafeInteger(parsedLogin) || parsedLogin <= 0) {
      reportFailure('This account has an invalid login ID. Please reopen the account and try again.');
      return;
    }

    if (depositConfirmationRef.current || isDepositing) return;
    const confirmed = await new Promise((resolve) => {
      depositConfirmationRef.current = resolve;
      setDepositConfirmation(`Deposit ${amountVal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currencyValue} into account #${parsedLogin}?`);
    });
    if (!confirmed) return;

    setIsDepositing(true);
    setDepositError(null);
    setDepositSuccess(null);

    try {
      const result = await submitManagerTransaction('deposit', {
        login: parsedLogin,
        amount: amountVal,
        comment: depositComment.trim(),
      });

      if (result && typeof result === 'object' && (result.success === false || result.ok === false)) {
        throw new Error(result.error || result.message || 'Deposit failed');
      }

      const responseMessage = result && typeof result === 'object'
        ? (result.message || result.detail || result.status_message)
        : '';
      const successMessage = `Deposited ${amountVal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currencyValue} into account #${parsedLogin} successfully.`;
      setDepositSuccess(typeof responseMessage === 'string' && responseMessage ? `${successMessage} ${responseMessage}` : successMessage);
      setDepositAmount('');
      setDepositComment('');
      // Refresh failures must never turn a completed deposit into a failed deposit.
      void Promise.resolve().then(() => onAccountUpdated?.(loginId)).catch(() => {});

      // Do not wait for the next grid/websocket interval after the backend has
      // accepted the transaction: refresh the displayed balance immediately.
      void loadAccountDetails(loginId)
        .then((payload) => setAccountData(payload))
        .catch(() => {
          setDepositSuccess((message) => message
            ? `${message} The balance could not be refreshed. Reopen the account to check it; do not repeat the deposit.`
            : message);
        });
    } catch (err) {
      reportFailure(`Deposit for account #${parsedLogin}: ${err?.message || 'The result could not be confirmed. Check account history before trying again.'}`);
    } finally {
      setIsDepositing(false);
    }
  };

  const firstNameValue = pickFirstValue(fieldSources, ['FirstName', 'firstName']);
  const lastNameValue = pickFirstValue(fieldSources, ['LastName', 'lastName']);
  const fullNameValue = pickFirstValue(fieldSources, ['Name', 'name', 'FullName', 'fullName']);
  const name = [firstNameValue, lastNameValue].filter(Boolean).join(' ') ||
    fullNameValue ||
    `Account ${loginId}`;

  const groupValue = getFieldValue('Group');
  const currencyValue = getFieldValue('Currency', 'USD');
  const rawLeverageValue = getFieldValue('Leverage');
  const leverageValue = rawLeverageValue ? `1:${String(rawLeverageValue).replace(/^1:/, '')}` : '';
  const modeRaw = String(getFieldValue('AccountMode', 'hedge'));
  const modeVal = modeRaw.charAt(0).toUpperCase() + modeRaw.slice(1);
  const statusValue = String(getFieldValue('Status', 'active')).toLowerCase();
  const statusLabel = statusValue.charAt(0).toUpperCase() + statusValue.slice(1);
  const languageValue = normalizeLanguageOption(getValue('Language', LANGUAGE_OPTIONS[0]));
  const registrationValue = getFieldValue('Registration');
  const lastAccessValue = getFieldValue('LastAccess');
  const lastIpValue = getFieldValue('LastIP');
  const countryCityValue = [getFieldValue('Country'), getFieldValue('City')].filter(Boolean).join(', ');

  const formatNumber = (val) => {
    if (val === null || val === undefined || isNaN(Number(val))) return '0.00';
    return ACCOUNT_NUMBER_FORMATTER.format(Number(val));
  };

  const balanceVal = formatNumber(getFieldValue('Balance'));
  const equityVal = formatNumber(getFieldValue('Equity'));
  const marginVal = formatNumber(getFieldValue('Margin'));
  const freeMarginVal = formatNumber(getFieldValue('MarginFree'));
  const rawMarginLevel = getFieldValue('MarginLevel', null);
  const hasMarginLevel = rawMarginLevel !== null && rawMarginLevel !== undefined && rawMarginLevel !== '' && Number.isFinite(Number(rawMarginLevel));
  const marginLevelVal = hasMarginLevel ? formatNumber(rawMarginLevel) : '—';
  const creditVal = formatNumber(getFieldValue('Credit', 0));
  const profitVal = getFieldValue('Profit', 0);
  const swapVal = formatNumber(getFieldValue('Swap', 0));
  const profitNumber = Number(profitVal || 0);
  const marginLevelNumber = Number(rawMarginLevel);
  const financialSnapshot = [
    { label: 'Balance', value: balanceVal, tone: 'primary' },
    { label: 'Equity', value: equityVal, tone: 'primary' },
    { label: 'Used margin', value: marginVal },
    { label: 'Free margin', value: freeMarginVal },
    { label: 'Credit', value: creditVal },
    {
      label: 'Margin level',
      value: `${marginLevelVal}${hasMarginLevel ? '%' : ''}`,
      tone: hasMarginLevel ? (marginLevelNumber < 100 ? 'negative' : 'positive') : '',
    },
    { label: 'Swap', value: swapVal },
    {
      label: 'Floating P/L',
      value: formatNumber(profitVal),
      tone: profitNumber > 0 ? 'positive' : profitNumber < 0 ? 'negative' : '',
    },
  ];

  const formatDate = (value) => {
    if (!hasDisplayValue(value)) return '';
    const raw = String(value).trim();
    if (!/^-?\d+(\.\d+)?$/.test(raw)) return raw;
    const numericValue = Number(raw);
    const d = new Date(numericValue > 100000000000 ? numericValue : numericValue * 1000);
    if (Number.isNaN(d.getTime())) return '';
    return d.toISOString().replace('T', ' ').slice(0, 19).replace(/-/g, '.');
  };

  const titleText = `Account: ${loginId}, ${name}, ${currencyValue}, ${leverageValue}, ${modeVal}`;

  return (
    <>
    <div className="account-details-backdrop" aria-hidden="true" />
    <div
      style={{
        position: 'fixed',
        left: isMaximized ? 0 : position.x,
        top: isMaximized ? 0 : position.y,
        width: isMaximized ? '100vw' : size.width,
        height: isMaximized ? '100vh' : size.height,
        zIndex: 100000
      }}
      className="account-details-window legacy-popup flex flex-col shadow-2xl rounded-xl font-sans select-none overflow-hidden"
      data-maximized={isMaximized}
      role="dialog"
      aria-modal="true"
      aria-label={`Account details for ${loginId}`}
    >
      {!isMaximized && (
        <>
          <div onMouseDown={(e) => handleResizeMouseDown(e, 'left')} className="absolute left-0 top-0 bottom-0 w-1 cursor-ew-resize hover:bg-blue-500/50 z-10 -ml-0.5" />
          <div onMouseDown={(e) => handleResizeMouseDown(e, 'right')} className="absolute right-0 top-0 bottom-0 w-1 cursor-ew-resize hover:bg-blue-500/50 z-10" />
          <div onMouseDown={(e) => handleResizeMouseDown(e, 'bottom')} className="absolute left-0 right-0 bottom-0 h-1 cursor-ns-resize hover:bg-blue-500/50 z-10" />
          <div onMouseDown={(e) => handleResizeMouseDown(e, 'bottom-right')} className="absolute right-0 bottom-0 w-3 h-3 cursor-nwse-resize hover:bg-blue-500/50 z-20" />
        </>
      )}

      {/* Title Bar */}
      <div
        onMouseDown={handleHeaderMouseDown}
        className="account-details-titlebar flex items-center justify-between cursor-move flex-shrink-0"
      >
        <div className="flex items-center gap-2 min-w-0">
          <span className="account-details-title truncate">{titleText}</span>
        </div>
        <div className="account-details-window-controls ml-2 shrink-0">
          <button type="button" onClick={toggleMaximize} aria-label={isMaximized ? 'Restore account details' : 'Maximize account details'}><Square size={13} /></button>
          <button type="button" onClick={onClose} aria-label="Close account details" className="is-close"><X size={16} /></button>
        </div>
      </div>

        <>
          {/* Tab Bar */}
          <div className="account-details-tabs flex items-center flex-shrink-0" role="tablist" aria-label="Account detail sections">
            {TABS.map(tab => (
              <button
                type="button"
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`account-details-tab ${activeTab === tab ? 'is-active' : ''}`}
                role="tab"
                id={`account-tab-${tab.toLowerCase()}`}
                aria-selected={activeTab === tab}
                aria-controls="account-details-tabpanel"
              >
                {tab}
              </button>
            ))}
          </div>

          {/* Content Area */}
          <div
            id="account-details-tabpanel"
            role="tabpanel"
            aria-labelledby={`account-tab-${activeTab.toLowerCase()}`}
            className={`account-details-content flex-1 overflow-auto flex flex-col ${activeTab === 'Overview' ? 'is-overview' : ''} ${activeTab === 'Trade' ? '!p-2 !gap-0 !overflow-hidden' : ''}`}
          >
            {activeTab !== 'Trade' && (detailsLoading || detailsError) && (
              <div className={`account-details-status ${detailsError ? 'is-error' : 'is-loading'}`} role={detailsError ? 'alert' : 'status'}>
                {detailsLoading && <Loader size={12} className="animate-spin" />}
                <span>{detailsError ? `Live account details unavailable: ${detailsError}` : 'Refreshing account details…'}</span>
              </div>
            )}

            {activeTab === 'Overview' ? (
              <>
                {/* Top Info Section */}
                <section className="account-overview-summary">
                  <div className="account-overview-heading">
                    <div className="min-w-0">
                      <p className="account-overview-eyebrow">Trading account</p>
                      <div className="flex gap-2 items-baseline flex-wrap">
                        <h2>{name}</h2>
                        <span className="account-overview-login">#{loginId}</span>
                      </div>
                    </div>
                    <div className="account-overview-badges">
                      <a href="#" className="account-overview-group">{groupValue}</a>
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-tight ${
                      statusValue === 'active' 
                      ? 'bg-blue-500/20 text-blue-500 border border-blue-500/30' 
                      : 'bg-red-500/20 text-red-500 border border-red-500/30'
                    }`}>
                      {statusLabel}
                    </span>
                    <span className="px-1.5 py-0.5 bg-blue-500/20 text-blue-400 border border-blue-500/30 rounded text-[10px] font-bold">
                      {leverageValue}
                    </span>
                  </div>
                  </div>

                  <div className="account-overview-details">
                    <div><span>Location</span><strong>{countryCityValue || '-'}</strong></div>
                    <div><span>RTX5 ID</span><strong className="tabular">{getFieldValue('MQID') || '-'}</strong></div>
                    <div><span>Phone</span><strong>{getFieldValue('Phone') || '-'}</strong></div>
                    <div><span>Email</span><a href="#">{getFieldValue('Email') || '-'}</a></div>
                  </div>

                  <div className="account-overview-timestamps">
                    <span>Registered: {formatDate(registrationValue) || '-'}</span>
                    <span>Last access: {formatDate(lastAccessValue) || '-'}</span>
                    <span>Last IP: {lastIpValue || '-'}</span>
                  </div>
                </section>

                {/* Data Grid Section Modernized */}
                <div className="account-positions-card flex-1 flex flex-col overflow-hidden">
                  <div className="account-positions-table-shell custom-scrollbar">
                    {/* Header */}
                    <div className="account-positions-grid account-positions-header">
                      <div className="p-3 border-r border-[var(--border)]">Symbol</div>
                      <div className="p-3 border-r border-[var(--border)]">Type</div>
                      <div className="p-3 border-r border-[var(--border)] text-right">Volume</div>
                      <div className="p-3 border-r border-[var(--border)] text-right">Open</div>
                      <div className="p-3 border-r border-[var(--border)] text-right">S / L</div>
                      <div className="p-3 border-r border-[var(--border)] text-right">T / P</div>
                      <div className="p-3 border-r border-[var(--border)] text-right">Current</div>
                      <div className="p-3 border-r border-[var(--border)] text-right">Swap</div>
                      <div className="p-3 text-right border-r border-[var(--border)]">Profit</div>
                      <div className="p-3 text-center">Action</div>
                    </div>

                    {/* Header and rows share one scroll area to keep columns aligned. */}
                    <div className="account-positions-body custom-scrollbar">
                    {(() => {
                      const displayPositions = targetTicket ? positions.filter(p => p.position === targetTicket) : positions;
                      if (positionsLoading && displayPositions.length === 0) {
                        return (
                          <div className="account-positions-state is-loading" role="status" aria-live="polite">
                            <span className="account-positions-state-content">
                              <Loader size={14} className="animate-spin" aria-hidden="true" />
                              <span>Loading open positions...</span>
                            </span>
                          </div>
                        );
                      }
                      if (positionsError && displayPositions.length === 0) {
                        return (
                          <div className="account-positions-state is-error" role="alert">
                            <span>Open positions could not be loaded.</span>
                            <button
                              type="button"
                              onClick={() => {
                                invalidatePositionsCache(loginId);
                                setPositionSyncRevision((revision) => revision + 1);
                              }}
                            >
                              Retry
                            </button>
                          </div>
                        );
                      }
                      return displayPositions.length > 0 ? (
                        <>
                          {positionsError && (
                            <div className="account-positions-partial-error" role="alert">
                              <span>Some open positions could not be loaded.</span>
                              <button
                                type="button"
                                onClick={() => {
                                  invalidatePositionsCache(loginId);
                                  setPositionSyncRevision((revision) => revision + 1);
                                }}
                              >
                                Retry
                              </button>
                            </div>
                          )}
                          {displayPositions.map((pos) => {
                        const isPos = pos.profit > 0;
                        const isNeg = pos.profit < 0;
                        return (
                          <div
                            key={pos.position}
                            onContextMenu={(e) => {
                              e.preventDefault();
                              setCtxMenu({ x: e.clientX, y: e.clientY, isOpen: true, data: pos });
                            }}
                            className="account-positions-grid account-positions-row cursor-pointer transition-colors group"
                          >
                            <div className="p-2 px-3 border-r border-[var(--border)] flex items-center gap-2 text-[var(--text)] font-medium">
                              {pos.symbol}
                            </div>
                            <div className={`p-2 px-3 border-r border-[var(--border)] text-[11px] uppercase font-bold ${pos.type === 'buy' ? 'text-[var(--ok-text)]' : 'text-[var(--danger-text)]'}`}>
                              {pos.type}
                            </div>
                            <div className="p-2 px-3 border-r border-[var(--border)] text-right text-[var(--text-2)]">{pos.volume}</div>
                            <div className="p-2 px-3 border-r border-[var(--border)] text-right font-mono text-[var(--text-2)]">{Number(pos.priceOpen).toFixed(5)}</div>

                            {/* S/L */}
                            <div
                              onDoubleClick={() => handleModifySLTP(pos)}
                              className="p-2 px-3 border-r border-[var(--border)] text-right font-mono text-amber-500/80 cursor-pointer hover:bg-amber-500/10 transition-colors"
                              title="Double-click to modify S/L"
                            >
                              {Number(pos.priceSl || 0).toFixed(5)}
                            </div>

                            {/* T/P */}
                            <div
                              onDoubleClick={() => handleModifySLTP(pos)}
                              className="p-2 px-3 border-r border-[var(--border)] text-right font-mono text-blue-500/80 cursor-pointer hover:bg-blue-500/10 transition-colors"
                              title="Double-click to modify T/P"
                            >
                              {Number(pos.priceTp || 0).toFixed(5)}
                            </div>

                            <div className="p-2 px-3 border-r border-[var(--border)] text-right font-mono text-[var(--text-2)]">{pos.priceCurrent == null ? '—' : pos.priceCurrent}</div>
                            <div className="p-2 px-3 border-r border-[var(--border)] text-right font-mono text-[var(--text-3)]">{Number(pos.swap || 0).toFixed(2)}</div>
                            <div className={`p-2 px-3 text-right border-r border-[var(--border)] font-bold font-mono ${isPos ? 'text-[var(--ok-text)]' : isNeg ? 'text-[var(--danger-text)]' : 'text-[var(--text-3)]'}`}>
                              {pos.profit == null ? '—' : Number(pos.profit).toFixed(2)}
                            </div>
                            <div className="p-2 flex items-center justify-center">
                              <button
                                onClick={() => requestTradeClose(pos)}
                                disabled={isDeleting || !canCloseTrades}
                                title={!canCloseTrades ? TRADE_CLOSE_DENIED_MESSAGE : undefined}
                                className="account-position-close-button"
                              >
                                CLOSE
                              </button>
                            </div>
                          </div>
                        );
                          })}
                        </>
                      ) : (
                        <div className="account-positions-empty">No open positions matching this account.</div>
                      );
                    })()}
                    </div>
                  </div>

                  {/* Account financial snapshot */}
                  <div className="account-balance-summary mt-auto" role="group" aria-label="Account financial snapshot">
                    <div className="account-balance-summary-header">
                      <div className="account-balance-summary-title">
                        <span>Financial snapshot</span>
                      </div>
                    </div>
                    <dl className="account-balance-metrics">
                      {financialSnapshot.map(({ label, value, tone }) => (
                        <div className={`account-balance-stat${tone ? ` is-${tone}` : ''}`} key={label}>
                          <dt>{label}</dt>
                          <dd className="tabular" title={`${label}: ${value}`}>{value}</dd>
                        </div>
                      ))}
                    </dl>
                    {hasMarginLevel && Number(rawMarginLevel) > 0 && Number(rawMarginLevel) < 100 && (
                      <div className="p-1 px-4 text-[10px] font-bold bg-red-500/10 text-red-500 border-b border-red-500/20 animate-pulse text-center uppercase tracking-widest">
                        MARGIN CALL WARNING
                      </div>
                    )}
                  </div>
                </div>
              </>
            ) : activeTab === 'Exposure' ? (
              <div className="flex flex-1 gap-2">
                <div className="border border-[#333] rounded-sm flex flex-col flex-1 bg-[#1e1e1e]">
                  {/* Header */}
                  <div className="grid grid-cols-[140px_1fr_1fr_1fr_160px] bg-[#252526] border-b border-[#333] text-[12px] text-gray-700 dark:text-gray-300 font-medium font-sans">
                    <div className="p-1 px-2 border-r border-[#333]">Asset</div>
                    <div className="p-1 px-2 border-r border-[#333] text-right">Volume</div>
                    <div className="p-1 px-2 border-r border-[#333] text-right">Rate</div>
                    <div className="p-1 px-2 border-r border-[#333] text-right">USD</div>
                    <div className="p-1 px-2 text-center">Graph</div>
                  </div>
                  {/* Rows */}
                  <div className="flex flex-col text-[12px] font-sans text-gray-800 dark:text-gray-200">
                    <div className="grid grid-cols-[140px_1fr_1fr_1fr_160px] border-b border-[#333]">
                      <div className="p-1 px-2 border-r border-[#333] flex items-center gap-1.5"><span className="text-[#d4b455] font-bold border border-[#d4b455] rounded-sm px-1 text-[10px] leading-tight">$</span> GOLD.FUTURE</div>
                      <div className="p-1 px-2 border-r border-[#333] text-right">2</div>
                      <div className="p-1 px-2 border-r border-[#333] text-right">1.00</div>
                      <div className="p-1 px-2 border-r border-[#333] text-right">2 000.00</div>
                      <div className="p-1 px-1 flex items-center gap-1">
                        <div className="flex-1 flex justify-end"></div>
                        <div className="w-[1px] h-3 bg-gray-500"></div>
                        <div className="flex-1 flex justify-start pl-1">
                          <div className="w-3 h-3 bg-[#3d5afe] border border-gray-300 dark:border-gray-600"></div>
                        </div>
                      </div>
                    </div>
                    <div className="grid grid-cols-[140px_1fr_1fr_1fr_160px] border-b border-[#333]">
                      <div className="p-1 px-2 border-r border-[#333] flex items-center gap-1.5"><span className="text-[#d4b455] font-bold border border-[#d4b455] rounded-sm px-1 text-[10px] leading-tight">$</span> USD</div>
                      <div className="p-1 px-2 border-r border-[#333] text-right">-233.664M</div>
                      <div className="p-1 px-2 border-r border-[#333] text-right">1.00</div>
                      <div className="p-1 px-2 border-r border-[#333] text-right">-233 664.00</div>
                      <div className="p-1 px-1 flex items-center gap-1">
                        <div className="flex-1 flex justify-end pr-1">
                          <div className="w-12 h-3 bg-[#ef5350] border border-gray-300 dark:border-gray-600"></div>
                        </div>
                        <div className="w-[1px] h-3 bg-gray-500"></div>
                        <div className="flex-1 flex justify-start pl-1">
                          <div className="w-3 h-3 bg-[#e53935] border border-gray-300 dark:border-gray-600"></div>
                        </div>
                      </div>
                    </div>
                  </div>
                  {/* Summary Footer */}
                  <div className="bg-[#3e3e42] mt-auto">
                    <div className="flex border-b border-[#333] text-[12px] font-bold font-sans">
                      <div className="flex-1 p-1 px-2 flex items-center gap-1.5 text-gray-900 dark:text-white">
                        <PlusSquare size={10} className="text-gray-700 dark:text-gray-300" />
                        Balance: {balanceVal} {currencyValue} <span className="font-normal opacity-80 mx-1">Equity:</span> {equityVal} <span className="font-normal opacity-80 mx-1">Margin:</span> {marginVal} <span className="font-normal opacity-80 mx-1">Free Margin:</span> {freeMarginVal}
                      </div>
                      <div className="w-[80px] p-1 px-2 text-right">
                        {swapVal}
                      </div>
                      <div className={`w-[100px] p-1 px-2 text-right font-medium ${Number(profitVal ?? 0) >= 0 ? 'text-blue-500' : 'text-red-500'}`}>
                        {formatNumber(profitVal)}
                      </div>
                    </div>
                    <div className="p-1 px-6 text-[12px] font-bold font-sans text-gray-900 dark:text-white">
                      <span className="font-normal opacity-80 mr-1">Margin Level:</span> {marginLevelVal} %
                    </div>
                  </div>
                </div>

                <div className="w-[200px] flex flex-col items-center justify-start pt-6 border border-[#333] bg-[#1a1a1c] relative flex-shrink-0">
                  <span className="text-[12px] text-gray-800 dark:text-gray-200 mb-6 font-sans">Long Positions</span>
                  <div className="w-24 h-24 rounded-full bg-gradient-to-br from-[#717bf5] to-[#121c9c] border border-gray-300 dark:border-gray-600 shadow-xl flex items-center justify-center">
                    <span className="text-[11px] text-gray-900 dark:text-white/90 drop-shadow-md relative -left-6 bg-transparent mix-blend-screen border-none outline-none z-10 font-sans tracking-wide">GOLD.FUTURE</span>
                  </div>
                </div>
              </div>
            ) : activeTab === 'Personal' ? (
              <div className="account-personal-tab">
                <header className="account-personal-intro">
                  <div><h2>Personal details</h2><p>Identity, contact information and account preferences.</p></div>
                  <span className="account-personal-account-ref">#{loginId}</span>
                </header>
                {[
                  { title: 'Identity', description: 'Account holder information', fields: [
                    ['FirstName', 'First name', fullNameValue], ['LastName', 'Last name'], ['MiddleName', 'Middle name'],
                    ['Company', 'Company'], ['IDNumber', 'ID number'], ['MQID', 'MetaQuotes ID'],
                  ] },
                  { title: 'Contact & address', description: 'Contact details and location', fields: [
                    ['Email', 'Email address'], ['Phone', 'Phone number'], ['Country', 'Country'],
                    ['State', 'State / province'], ['City', 'City'], ['ZipCode', 'Postal code'],
                    ['Address', 'Street address', '', 'wide'],
                  ] },
                  { title: 'Account information', description: 'Preferences and registration', fields: [
                    ['Language', 'Language', '', 'language'], ['Status', 'Status', '', 'status'],
                    ['Registered', 'Registered', '', 'registered'],
                    ['LeadCampaign', 'Lead campaign'], ['LeadSource', 'Lead source'], ['Comment', 'Comment'],
                  ] },
                ].map(({ title, description, fields }) => (
                  <section className="account-personal-section" key={title}>
                    <div className="account-personal-section-header"><h3>{title}</h3><p>{description}</p></div>
                    <div className="account-personal-grid">
                      {fields.map(([key, label, fallback = '', kind]) => (
                        <label className={'account-personal-field' + (kind === 'wide' ? ' account-personal-span-full' : '')} key={key}>
                          <span>{label}</span>
                          {kind === 'language' ? (
                            <select value={languageValue} onChange={(e) => handleInputChange('Language', e.target.value)}>
                              {!LANGUAGE_OPTIONS.includes(languageValue) && <option value={languageValue}>{languageValue}</option>}
                              {LANGUAGE_OPTIONS.map((language) => <option key={language} value={language}>{language}</option>)}
                            </select>
                          ) : kind === 'status' ? (
                            <select value={String(getValue('Status', statusValue)).toLowerCase()} onChange={(e) => handleInputChange('Status', e.target.value)}>
                              <option value="active">Active</option><option value="disabled">Disabled</option><option value="readonly">Read-only</option>
                            </select>
                          ) : (
                            <input type="text" readOnly={kind === 'registered'} value={kind === 'registered' ? formatDate(registrationValue) : getValue(key, fallback)} onChange={kind === 'registered' ? undefined : (e) => handleInputChange(key, e.target.value)} />
                          )}
                        </label>
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            ) : activeTab === 'Account' ? (
              <div className="account-settings-tab account-trading-settings custom-scrollbar">
                <div className="account-section-heading">
                  <div>
                    <h2>Trading configuration</h2>
                    <p>Review the account profile and update supported trading settings.</p>
                  </div>
                </div>

                <section className="account-settings-card">
                  <div className="account-settings-card-title">
                    <h3>Account assignment</h3>
                    <span className={`ui-badge ${statusValue === 'active' ? 'ui-badge-success' : 'ui-badge-danger'}`}>{statusLabel}</span>
                  </div>
                  <div className="account-settings-grid">
                    <label className="account-settings-field account-settings-span-full">
                      <span>Group</span>
                      <input
                        type="text"
                        value={getValue('Group', groupValue) || ''}
                        onChange={(event) => handleInputChange('Group', event.target.value)}
                        autoComplete="off"
                      />
                      <small>Enter the exact server group path.</small>
                    </label>
                    <label className="account-settings-field">
                      <span>Leverage</span>
                      <select value={String(getValue('Leverage', rawLeverageValue || '100')).replace(/^1:/, '')} onChange={(event) => handleInputChange('Leverage', event.target.value)}>
                        {[10, 25, 50, 100, 200, 500, 1000].map((value) => <option key={value} value={value}>1:{value}</option>)}
                      </select>
                    </label>
                    <div className="account-settings-field is-readonly">
                      <span>Currency</span>
                      <strong>{currencyValue || '—'}</strong>
                    </div>
                    <div className="account-settings-field is-readonly">
                      <span>Accounting mode</span>
                      <strong>{modeVal || '—'}</strong>
                    </div>
                    <div className="account-settings-field is-readonly">
                      <span>Login</span>
                      <strong className="tabular">{loginId}</strong>
                    </div>
                  </div>
                </section>

                <div className="account-settings-note">
                  <ShieldCheck size={15} />
                  <span>Changes are validated by the manager server. Account access and password controls are available in the Security tab.</span>
                </div>
              </div>
            ) : activeTab === 'Limits' ? (
              <div className="account-settings-tab account-limits-tab custom-scrollbar">
                <div className="account-section-heading">
                  <div>
                    <h2>Risk thresholds</h2>
                    <p>Configure the server-enforced margin protection levels for this account.</p>
                  </div>
                </div>

                <section className="account-settings-card account-risk-card">
                  <div className="account-risk-grid">
                    <label className="account-settings-field">
                      <span>Margin call level</span>
                      <div className="account-percent-field">
                        <input aria-label="Margin call level" type="number" min="0" max="10000" step="0.01" value={getValue('MarginCallLevel', '100') ?? ''} onChange={(event) => handleInputChange('MarginCallLevel', event.target.value)} />
                        <span>%</span>
                      </div>
                      <small>Warning threshold shown to managers.</small>
                    </label>
                    <label className="account-settings-field">
                      <span>Stop out level</span>
                      <div className="account-percent-field">
                        <input aria-label="Stop out level" type="number" min="0" max="10000" step="0.01" value={getValue('StopOutLevel', '50') ?? ''} onChange={(event) => handleInputChange('StopOutLevel', event.target.value)} />
                        <span>%</span>
                      </div>
                      <small>Liquidation threshold enforced by the server.</small>
                    </label>
                  </div>
                  <div className="account-risk-preview">
                    <span>Threshold preview</span>
                    <dl>
                      <div><dt>Margin call</dt><dd>{getValue('MarginCallLevel', '100') || '—'}%</dd></div>
                      <div><dt>Stop out</dt><dd>{getValue('StopOutLevel', '50') || '—'}%</dd></div>
                    </dl>
                  </div>
                </section>

                <div className="account-settings-note">
                  <strong>Group settings</strong>
                  <span>Trading permissions, reporting, API access and order limits are inherited from the assigned group.</span>
                </div>
              </div>
            ) : activeTab === 'Trade' ? (
              <AccountTradeTab
                loginId={loginId}
                account={account}
                positions={positions}
                selectedTicketRow={selectedTicketRow}
                setSelectedTicketRow={setSelectedTicketRow}
                adapter={adapter}
                canManipulateTrades={canManipulateTrades}
                canCloseTrades={canCloseTrades}
                handleModifySLTP={handleModifySLTP}
                requestTradeClose={requestTradeClose}
                showResult={showUpdateResult}
                showError={showError}
                onUpdateState={setTradeUpdateState}
                requireTradeMutationPermission={requireTradeMutationPermission}
                onTradePlaced={() => {
                  invalidatePositionsCache(loginId);
                  setPositionSyncRevision((revision) => revision + 1);
                }}
              />
            ) : activeTab === 'History' ? (
              <div className="account-history-tab">
                <div className="account-section-heading">
                  <div className="account-section-heading-icon"><FileText size={16} /></div>
                  <div>
                    <h2>Position history</h2>
                    <p>Closed trades and realized account activity for login {loginId}.</p>
                  </div>
                  <button
                    type="button"
                    className="ui-btn ui-btn-secondary ui-btn-sm account-history-refresh"
                    onClick={() => setHistoryRefreshRevision((revision) => revision + 1)}
                    disabled={historyLoading}
                  >
                    <RefreshCw size={12} className={historyLoading ? 'animate-spin' : ''} />
                    Refresh
                  </button>
                </div>
                <PositionHistoryGrid
                  data={historyRows}
                  isLoading={historyLoading}
                  error={historyError}
                  login={loginId}
                />
              </div>
            ) : activeTab === 'Security' ? (
              <div className="account-security-tab">
                <div className="account-section-heading">
                  <div className="account-section-heading-icon"><ShieldCheck size={16} /></div>
                  <div>
                    <h2>Password management</h2>
                    <p>Verify or rotate account credentials without exposing them in request URLs.</p>
                  </div>
                </div>

                <div className="account-security-list">
                  {[
                    { field: 'master', type: 'USER_PASS_MAIN', title: 'Master password', description: 'Full trading access for the account owner.' },
                    { field: 'investor', type: 'USER_PASS_INVESTOR', title: 'Investor password', description: 'Read-only access to account activity.' },
                    { field: 'api', type: 'USER_PASS_API', title: 'API password', description: 'Access through approved Web API integrations.' },
                  ].map(({ field, type, title, description }) => (
                    <section className="account-security-card" key={field}>
                      <div className="account-security-copy">
                        <h3>{title}</h3>
                        <p>{description}</p>
                      </div>
                      <div className="account-security-controls">
                        <div className="account-password-input">
                          <input
                            aria-label={`${title} value`}
                            type={showPasswords[field] ? 'text' : 'password'}
                            value={passwords[field]}
                            onChange={(event) => setPasswords((current) => ({ ...current, [field]: event.target.value }))}
                            placeholder="Minimum 8 characters"
                            autoComplete="new-password"
                          />
                          <button type="button" onClick={() => togglePassword(field)} aria-label={`${showPasswords[field] ? 'Hide' : 'Show'} ${title.toLowerCase()}`}>
                            {showPasswords[field] ? <EyeOff size={14} /> : <Eye size={14} />}
                          </button>
                          <button type="button" onClick={() => handleCopy(field, passwords[field])} disabled={!passwords[field]} aria-label={`Copy ${title.toLowerCase()}`}>
                            {copiedField === field ? <CheckIcon size={13} /> : <Copy size={13} />}
                          </button>
                        </div>
                        <button type="button" className="ui-btn ui-btn-secondary ui-btn-sm" onClick={() => generatePassword(field)}>Generate</button>
                        <button type="button" className="ui-btn ui-btn-secondary ui-btn-sm" onClick={() => handlePasswordCheck(type, passwords[field])} disabled={!passwords[field] || checkingPassword === type || !canManagePasswords}>
                          {checkingPassword === type ? 'Checking…' : 'Verify'}
                        </button>
                        <button type="button" className="ui-btn ui-btn-primary ui-btn-sm" onClick={() => handlePasswordChange(type, passwords[field])} disabled={passwords[field].length < 8 || changingPassword === type || !canManagePasswords}>
                          {changingPassword === type ? 'Updating…' : 'Change'}
                        </button>
                      </div>
                    </section>
                  ))}
                </div>

                <div className="account-settings-note">
                  <ShieldCheck size={15} />
                  <span>Passwords stay masked by default and are sent in an authenticated POST body. Generated values are not saved until you choose Change.</span>
                </div>
              </div>
            ) : activeTab === 'Balance' ? (
              <div className="account-transaction-tab custom-scrollbar">
                <div className="account-transaction-card">
                  <div className="account-transaction-header">
                    <h2 className="text-[12px] font-bold   tracking-wide uppercase">
                      Deposit funds
                    </h2>
                  </div>

                  <form className="account-transaction-body" noValidate onSubmit={(event) => { event.preventDefault(); handleTransaction(); }}>
                    <div className="account-transaction-balance">
                      <span className=" ">Current balance</span>
                      <span className="font-semibold tabular  ">{balanceVal}</span>
                    </div>
                    {depositError && (
                      <div className="p-3 bg-red-100/50 dark:bg-red-900/30  border border-red-200/50 dark:border-red-800/50 text-red-700 dark:text-red-300 rounded-md text-[12px]">
                        {depositError}
                      </div>
                    )}
                    {depositSuccess && (
                      <div className="p-3 bg-blue-100/50 dark:bg-blue-900/30  border border-blue-200/50 dark:border-blue-800/50 text-blue-800 dark:text-blue-300 rounded-md text-[12px]">
                        {depositSuccess}
                      </div>
                    )}

                    <div className="flex flex-col gap-1.5">
                      <label htmlFor="transaction-amount" className="text-[12px] font-medium">Amount *</label>
                      <input
                        type="number"
                        id="transaction-amount" value={depositAmount}
                        disabled={isDepositing || !canManageFinances}
                        onChange={(e) => {
                          setDepositAmount(e.target.value);
                          setDepositError(null);
                          setDepositSuccess(null);
                        }}
                        placeholder="Max 1,000,000"
                        min="0.01"
                        step="0.01"
                        className="w-full h-9    border   rounded-md px-3 text-[12px]   focus:outline-none   transition-all "
                      />
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <label htmlFor="transaction-comment" className="text-[12px] font-medium  ">Comment</label>
                      <input
                        type="text"
                        id="transaction-comment"
                        disabled={isDepositing || !canManageFinances}
                        value={depositComment}
                        onChange={(e) => {
                          setDepositComment(e.target.value);
                          setDepositError(null);
                          setDepositSuccess(null);
                        }}
                        className="w-full h-9    border   rounded-md px-3 text-[12px]   focus:outline-none   transition-all"
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={isDepositing || !canManageFinances}
                      title={!canManageFinances ? 'You do not have permission to manage account funds' : undefined}
                      className="account-transaction-submit"
                    >
                      {isDepositing ? 'Depositing...' : 'Deposit'}
                    </button>
                    {!canManageFinances && <p role="status">Your role does not have permission to manage account funds.</p>}
                  </form>
                </div>
              </div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-gray-500">
                <p>Placeholder content for <strong>{activeTab}</strong> tab.</p>
                <p className="text-[12px] mt-2">Provide UI structure references to complete this tab.</p>
              </div>
            )}

          </div>

          {/* Footer */}
          {activeTab !== 'Overview' && (
          <div className="account-details-footer flex items-center justify-end flex-shrink-0">
            <div className="flex gap-2">
              <button type={activeTab === 'Trade' ? 'submit' : 'button'} form={activeTab === 'Trade' ? 'account-trade-update-form' : undefined} onClick={activeTab === 'Trade' ? undefined : handleUpdate} disabled={activeTab === 'Trade' ? !tradeUpdateState.canUpdate : updateLoading || Object.keys(formData).length === 0 || !canManageAccounts} title={activeTab === 'Trade' ? 'Select an existing position and change its volume, SL or TP to update' : !canManageAccounts ? 'You do not have permission to update accounts' : undefined} className="px-5 py-1.5 min-w-[80px] bg-[#3a3a3c] hover:bg-[#4a4a4c] border border-[#555] rounded-[3px] text-[12px] text-gray-800 dark:text-gray-200 transition-colors disabled:opacity-50">
                {(activeTab === 'Trade' ? tradeUpdateState.busy : updateLoading) ? 'Wait...' : 'Update'}
              </button>
              <button type="button" onClick={onClose} className="px-5 py-1.5 min-w-[80px] bg-[#3a3a3c] hover:bg-[#4a4a4c] border border-[#555] rounded-[3px] text-[12px] text-gray-800 dark:text-gray-200 transition-colors">
                Close
              </button>
            </div>
          </div>
          )}
        </>

      {ctxMenu.isOpen && (
        <TradeContextMenu
          {...ctxMenu}
          onClose={() => setCtxMenu(prev => ({ ...prev, isOpen: false }))}
          onModify={handleModifySLTP}
          onCloseTrade={(ticket) => requestTradeClose({ position: ticket })}
          canCloseTrades={canCloseTrades}
          canManipulateTrades={canManipulateTrades}
        />
      )}

      {pendingTradeClose && (
        <div className="trade-close-confirmation" role="alertdialog" aria-modal="true" aria-labelledby="trade-close-confirmation-title" aria-describedby="trade-close-confirmation-description">
          <div className="trade-close-confirmation-card">
            <div className="trade-close-confirmation-header">
              <div>
                <p className="trade-close-confirmation-eyebrow">Trade confirmation</p>
                <h2 id="trade-close-confirmation-title">Close this position?</h2>
              </div>
              <button type="button" onClick={() => setPendingTradeClose(null)} aria-label="Cancel closing position" className="trade-close-confirmation-dismiss">
                <X size={18} />
              </button>
            </div>
            <p id="trade-close-confirmation-description" className="trade-close-confirmation-message">
              Close {pendingTradeClose.type ? `${String(pendingTradeClose.type).toUpperCase()} ` : ''}{pendingTradeClose.symbol || 'this'} position #{pendingTradeClose.position} at the current market price? This action cannot be undone.
            </p>
            <div className="trade-close-confirmation-actions">
              <button type="button" onClick={() => setPendingTradeClose(null)} className="trade-close-confirmation-cancel">Cancel</button>
              <button type="button" onClick={() => handleDeleteTrade(pendingTradeClose.position)} disabled={isDeleting} className="trade-close-confirmation-confirm">
                {isDeleting ? 'Closing…' : 'Close position'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
    {updateFeedback && (
      <DepositDialog
        {...updateFeedback}
        dismissLabel={updateFeedback.status === 'error' ? 'Back to details' : 'Continue'}
        onDismiss={() => setUpdateFeedback(null)}
      />
    )}
    {(depositConfirmation || isDepositing || depositSuccess || depositError) && (
      <DepositDialog
        status={depositConfirmation ? 'confirm' : isDepositing ? 'pending' : depositError ? 'error' : 'success'}
        message={depositConfirmation || (isDepositing ? 'Waiting for the broker to confirm your deposit. Please do not submit it again.' : depositError || depositSuccess)}
        onConfirm={() => finishDepositConfirmation(true)}
        onDismiss={() => { finishDepositConfirmation(false); setDepositError(null); setDepositSuccess(null); }}
      />
    )}
    </>
  );
};

export default AccountDetailsModal;
