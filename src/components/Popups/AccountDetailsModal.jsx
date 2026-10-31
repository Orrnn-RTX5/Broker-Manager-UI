import { showResult } from '../../store/resultDialogStore.js';
import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { X, Minus, Square, PlusSquare, Loader, Eye, EyeOff, Copy, Check as CheckIcon, Plus, CheckCircle2, Edit3, Play, Trash2, BarChart3, ChevronRight, FileText, Settings, ShieldCheck, CircleAlert, PanelLeft, PanelBottom, PanelRight } from 'lucide-react';
import { completeAccountPositions, getAccountPositions, getPositionHistory, hasAccountPositionsContinuation, invalidateAccountPositionsCache, invalidatePositionsCache, peekAccountPositions } from '../../services/api';
import PositionHistoryGrid from '../../features/clients/components/PositionHistoryGrid';
import { getPositionSnapshotRows, getPositionUpdateLogin, subscribeToPositionSync, requiresPositionReconciliation } from '../../services/positionSync';
import { useLivePositions, useLiveAccountMetrics } from '../../hooks/useLiveTrading';
import { liveTradingState } from '../../services/liveTradingState';
import positionAdapter from './adapters/position';
import orderAdapter from './adapters/order';
import dealAdapter from './adapters/deal';
import AccountTradeTab from './AccountTradeTab';
import DepositDialog from './DepositDialog';
import { orderDelete } from '../../services/tradeApi';
import { changeManagerPassword, checkManagerPassword } from '../../services/managerPasswordApi';
import { loadAccountDetails, peekAccountDetails, updateCachedAccountDetails } from '../../services/accountDetails';
import { useAccountDetails } from '../../hooks/useAccountDetails';
import { closeManagerPosition } from '../../services/managerTradeApi';
import { submitManagerTransaction } from '../../services/managerFinanceApi';
import { updateManagerAccount } from '../../services/managerAccountApi';
import { usePermissions } from '../../hooks/usePermissions';
import { useMultiScreenStore } from '../../store/multiScreenStore';
import { PERMISSIONS } from '../../utils/permissions';
import { redactSensitive } from '../../utils/redaction';
import { normalizeResult } from '../../utils/resultMessage';
import './AccountDetailsModal.css';
import {
  canCloseAccountTrades,
  canMutateAccountTrades,
  TRADE_CLOSE_DENIED_MESSAGE,
  TRADE_MUTATION_DENIED_MESSAGE,
} from './accountTradePermissions';
import { joinMoneyAmount } from './accountTransactionCopy.js';
import {
  DEFAULT_MANAGER_TRANSACTION_TYPE,
  buildManagerTransactionConfirmation,
  buildManagerTransactionFailurePrefix,
  buildManagerTransactionSuccessMessage,
  getManagerTransactionActionLabel,
  getManagerTransactionOptions,
  getManagerTransactionPendingLabel,
  getManagerTransactionPendingNoun,
  isTransferType,
  resolveManagerTransactionType,
  resolveTransferDestination,
} from './accountFinanceOps.js';

const ADAPTERS = { position: positionAdapter, order: orderAdapter, deal: dealAdapter };

const TABS = [
  'Overview', 'Exposure', 'Personal', 'Account', 'Limits', 'Profile', 'Balance', 'Trade', 'History', 'Security', 'Credentials'
];

const ACCOUNT_NUMBER_FORMATTER = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const ACCOUNT_POSITION_LIVE_REFRESH_MIN_MS = 50;

const formatSpaceNumber = (val, decimals = 2) => {
  const n = Number(val);
  if (val === null || val === undefined || val === '' || !Number.isFinite(n)) return (0).toFixed(decimals);
  const fixed = Math.abs(n).toFixed(decimals);
  const [intPart, decPart] = fixed.split('.');
  const withSpaces = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return `${n < 0 ? '-' : ''}${withSpaces}${decPart !== undefined ? `.${decPart}` : ''}`;
};

const AccountTitleIcon = ({ group }) => {
  const g = String(group || '').toLowerCase();
  const isReal = g.includes('real') && !g.includes('demo') && !g.includes('contest');
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
      className={`account-details-title-user-icon ${isReal ? 'is-real' : 'is-demo'}`}
    >
      <circle cx="8" cy="5" r="2.6" stroke="currentColor" strokeWidth="1.4" />
      <path d="M3.2 13.5c0-2.4 2.15-4.1 4.8-4.1s4.8 1.7 4.8 4.1" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M2.5 13.5h11" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
};

const PositionSymbolIcon = ({ type }) => {
  const isBuy = String(type || '').toLowerCase() === 'buy';
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 12 12"
      fill="none"
      aria-hidden="true"
      className={`account-overview-pos-icon ${isBuy ? 'is-buy' : 'is-sell'}`}
    >
      <rect x="1.5" y="1" width="9" height="10" rx="1.2" stroke="currentColor" strokeWidth="1.2" />
      <line x1="3.5" y1="4.2" x2="8.5" y2="4.2" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
      <line x1="3.5" y1="7.2" x2="7.2" y2="7.2" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
    </svg>
  );
};

const SummaryBalanceIcon = () => (
  <svg
    width="13"
    height="13"
    viewBox="0 0 14 14"
    fill="none"
    aria-hidden="true"
    className="account-overview-balance-icon"
  >
    <circle cx="7" cy="7" r="5.6" stroke="currentColor" strokeWidth="1.2" />
    <path d="M7 4.2v5.6M4.2 7h5.6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
  </svg>
);


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

const readPopupDockZones = () => {
  if (typeof document === 'undefined' || typeof window === 'undefined') return {};
  const shell = document.querySelector('.cc-shell-workspace');
  const shellRect = shell?.getBoundingClientRect() || {
    left: 0,
    top: 64,
    width: window.innerWidth,
    height: Math.max(400, window.innerHeight - 92),
    right: window.innerWidth,
    bottom: Math.max(464, window.innerHeight - 28),
  };

  const marketPanel = document.querySelector('[data-panel-id="market_data"]');
  const navPanel = document.querySelector('[data-panel-id="navigator"]');
  const mRect = marketPanel?.getBoundingClientRect();
  const nRect = navPanel?.getBoundingClientRect();
  const validLeftRects = [mRect, nRect].filter((r) => r && r.width > 40 && r.height > 40);

  let leftRect;
  if (validLeftRects.length > 0) {
    const minLeft = Math.round(Math.min(...validLeftRects.map((r) => r.left)));
    const minTop = Math.round(Math.min(...validLeftRects.map((r) => r.top)));
    const maxRight = Math.round(Math.max(...validLeftRects.map((r) => r.right)));
    const maxBottom = Math.round(Math.max(...validLeftRects.map((r) => r.bottom)));
    const combinedWidth = Math.max(460, maxRight - minLeft);
    const clampedWidth = Math.min(combinedWidth, Math.max(460, Math.round(shellRect.width * 0.48)));
    leftRect = {
      left: minLeft,
      top: minTop,
      width: clampedWidth,
      height: Math.max(300, maxBottom - minTop),
      right: minLeft + clampedWidth,
      bottom: maxBottom,
    };
  } else {
    const fallbackWidth = Math.max(460, Math.round(shellRect.width * 0.36));
    const fallbackHeight = Math.max(320, Math.round(shellRect.height * 0.72));
    leftRect = {
      left: Math.round(shellRect.left),
      top: Math.round(shellRect.top),
      width: fallbackWidth,
      height: fallbackHeight,
      right: Math.round(shellRect.left + fallbackWidth),
      bottom: Math.round(shellRect.top + fallbackHeight),
    };
  }

  const terminalPanel = document.querySelector('[data-panel-id="terminal"]');
  const tRect = terminalPanel?.getBoundingClientRect();
  const bottomLeft = tRect && tRect.width > 40 ? Math.round(tRect.left) : Math.round(shellRect.left);
  const bottomWidth = tRect && tRect.width > 40 ? Math.round(tRect.width) : Math.round(shellRect.width);
  const bottomEdge = tRect && tRect.height > 40 ? Math.round(tRect.bottom) : Math.round(shellRect.bottom);
  const bottomHeight = Math.min(
    Math.max(320, tRect && tRect.height > 40 ? Math.round(tRect.height) : 320),
    Math.max(320, Math.round(shellRect.height * 0.6))
  );
  const bottomTop = Math.max(Math.round(shellRect.top + 60), bottomEdge - bottomHeight);
  const bottomRect = {
    left: bottomLeft,
    top: bottomTop,
    width: bottomWidth,
    height: bottomEdge - bottomTop,
    right: bottomLeft + bottomWidth,
    bottom: bottomEdge,
  };

  const centerWorkspace = document.querySelector('.cc-center-workspace');
  const cRect = centerWorkspace?.getBoundingClientRect();
  const rightBase = cRect && cRect.width > 120 && cRect.height > 120 ? cRect : shellRect;
  const rightWidth = Math.max(480, Math.round(rightBase.width * 0.56));
  const rightLeft = Math.max(Math.round(shellRect.left), Math.round(rightBase.right - rightWidth));
  const rightRect = {
    left: rightLeft,
    top: Math.round(rightBase.top),
    width: Math.round(rightBase.right - rightLeft),
    height: Math.round(rightBase.height),
    right: Math.round(rightBase.right),
    bottom: Math.round(rightBase.bottom),
  };

  return {
    shell: shellRect,
    left: leftRect,
    bottom: bottomRect,
    right: rightRect,
  };
};

const detectPopupDockZone = (clientX, clientY, rects) => {
  if (!rects || !rects.shell) return null;
  const { shell, left, bottom, right } = rects;
  if (clientX < shell.left - 24 || clientX > shell.right + 24 || clientY < 0 || clientY > window.innerHeight) {
    return null;
  }
  const bottomTriggerTop = Math.max(bottom.top, shell.bottom - Math.max(240, Math.round(shell.height * 0.32)));
  if (clientY >= bottomTriggerTop && clientX >= bottom.left && clientX <= bottom.right) {
    return 'bottom';
  }
  const leftTriggerRight = Math.min(left.right, shell.left + Math.max(320, Math.round(shell.width * 0.28)));
  if (clientX <= leftTriggerRight && clientY >= left.top && clientY <= left.bottom) {
    return 'left';
  }
  const rightTriggerLeft = Math.max(right.left, shell.right - Math.max(320, Math.round(shell.width * 0.28)));
  if (clientX >= rightTriggerLeft && clientY >= right.top && clientY <= right.bottom) {
    return 'right';
  }
  return null;
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

const AccountDetailsModal = ({
  account,
  targetTicket,
  onClose,
  initialTab = 'Overview',
  entity = 'position',
  onAccountUpdated,
  windowIndex = 0,
  totalWindows = 1,
  zOrder = 1,
  isActiveWindow = true,
  onFocusWindow,
}) => {
  const adapter = ADAPTERS[entity] || positionAdapter;
  const loginId = account && typeof account === 'object' ? account.login : account;
  const { canAct, resolved, hasPermission } = usePermissions();
  const canViewPositions = resolved && hasPermission(PERMISSIONS.VIEW_POSITIONS);
  const initialPositions = canViewPositions ? peekAccountPositions(loginId) : undefined;
  const canManageAccounts = canAct(PERMISSIONS.MANAGE_ACCOUNTS);
  const canManageFinances = canAct(PERMISSIONS.MANAGE_FINANCES);
  const canManagePasswords = canAct(PERMISSIONS.MANAGE_PASSWORDS);
  const canManipulateTrades = canMutateAccountTrades(canAct);
  const canCloseTrades = canCloseAccountTrades(canAct);
  const openAccountScreen = useMultiScreenStore((state) => state.openAccountScreen);
  const multiScreenCount = useMultiScreenStore(
    (state) => state.accountScreens.length + state.groupScreens.length
  );
  const [activeTab, setActiveTab] = useState(initialTab);
  const [positionsDeniedLogin, setPositionsDeniedLogin] = useState(null);
  const showPositions = canViewPositions && positionsDeniedLogin !== String(loginId);
  const visibleTab = activeTab === 'History' && !showPositions ? 'Overview' : activeTab;
  const [focusedTicket, setFocusedTicket] = useState(targetTicket);
  const windowRef = useRef(null);
  useEffect(() => {
    const dialog = windowRef.current;
    if (!dialog) return;
    const previous = document.activeElement;
    dialog.querySelector('.account-details-tab.is-active')?.focus({ preventScroll: true });
    return () => { if (previous?.isConnected) previous.focus({ preventScroll: true }); };
  }, []);
  const accountData = useAccountDetails(loginId);
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
  const [depositDestination, setDepositDestination] = useState('');
  const [transactionType, setTransactionType] = useState(DEFAULT_MANAGER_TRANSACTION_TYPE);
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
  const positions = useLivePositions(showPositions ? snapshotPositions : [], loginId, showPositions, positionsSnapshotRevision);
  const liveMetrics = useLiveAccountMetrics(loginId);
  const [, setPositionsLoading] = useState(() => initialPositions === undefined);
  const [positionsError, setPositionsError] = useState('');
  const [historyRows, setHistoryRows] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState('');
  const [positionSyncRevision, setPositionSyncRevision] = useState(0);
  const lastPositionsRequestAtRef = useRef(0);
  const pendingPositionsRefreshTimerRef = useRef(null);
  const [selectedTicketSnapshot, setSelectedTicketRow] = useState(null);
  const selectedTicketRow = useLivePositions(showPositions && selectedTicketSnapshot ? [selectedTicketSnapshot] : [], loginId)[0] || null;
  const [isDeleting, setIsDeleting] = useState(false);
  const [pendingTradeClose, setPendingTradeClose] = useState(null);
  const tradeConfirmationRef = useRef(null);
  const isOrderCancellation = entity === 'order';
  const previousLoginIdRef = useRef(loginId);

  useEffect(() => {
    if (String(previousLoginIdRef.current ?? '') === String(loginId ?? '')) return;
    previousLoginIdRef.current = loginId;
    setActiveTab(initialTab);
    setFocusedTicket(targetTicket);
    setFormData({});
    setUpdateFeedback(null);
    setPasswords({ master: '', investor: '', api: '', phone: '', otp: '' });
    setShowPasswords({ master: false, investor: false, api: false, phone: false, otp: false });
    setDepositAmount('');
    setDepositComment('');
    setDepositDestination('');
    setDepositError(null);
    setDepositSuccess(null);
    finishDepositConfirmation(false);
    setPositions(canViewPositions ? (peekAccountPositions(loginId) || []) : []);
    setPositionsError('');
    setHistoryRows([]);
    setHistoryError('');
    setSelectedTicketRow(null);
    setPendingTradeClose(null);
    setCtxMenu({ x: 0, y: 0, isOpen: false, data: null });
  }, [loginId, initialTab, targetTicket, canViewPositions]);

  useEffect(() => {
    if (!pendingTradeClose) return;
    const trigger = document.activeElement;
    const dialog = tradeConfirmationRef.current;
    dialog.querySelector('.trade-close-confirmation-cancel')?.focus();
    const handleKeyDown = event => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        if (dialog.getAttribute('aria-busy') !== 'true') setPendingTradeClose(null);
      }
      if (event.key !== 'Tab') return;
      const buttons = [...dialog.querySelectorAll('button:not(:disabled)')];
      if (!buttons.length) {
        event.preventDefault();
        dialog.focus();
      } else if (event.shiftKey && document.activeElement === buttons[0]) {
        event.preventDefault();
        buttons.at(-1).focus();
      } else if (!event.shiftKey && document.activeElement === buttons.at(-1)) {
        event.preventDefault();
        buttons[0].focus();
      }
    };
    dialog.addEventListener('keydown', handleKeyDown);
    return () => {
      dialog.removeEventListener('keydown', handleKeyDown);
      if (trigger?.isConnected) trigger.focus();
    };
  }, [pendingTradeClose]);

  const [ctxMenu, setCtxMenu] = useState({ x: 0, y: 0, isOpen: false, data: null });

  useEffect(() => {
    const closeMenu = () => setCtxMenu(prev => prev.isOpen ? { ...prev, isOpen: false } : prev);
    window.addEventListener('click', closeMenu);
    return () => window.removeEventListener('click', closeMenu);
  }, []);

  const initialWidth = Math.min(760, window.innerWidth - 40);
  const initialHeight = Math.min(545, window.innerHeight - 40);
  const hasUserMovedRef = useRef(false);

  const computeMultiScreenSafeBounds = useCallback((slotIdx = windowIndex, totalCount = totalWindows) => {
    const vw = typeof window !== 'undefined' ? window.innerWidth : 1280;
    const vh = typeof window !== 'undefined' ? window.innerHeight : 720;
    const safeSlot = Math.max(0, Number(slotIdx) || 0) % 4;
    const safeTotal = Math.max(1, Math.min(4, Number(totalCount) || 1));

    let availLeft = 8;
    let availTop = 40;
    let maxRight = vw - 8;
    let maxBottom = vh - 28;

    if (typeof document !== 'undefined') {
      const shellEl = document.querySelector('.cc-shell-workspace');
      const shellRect = shellEl?.getBoundingClientRect();
      if (shellRect && shellRect.height > 200) {
        availTop = Math.max(36, Math.round(shellRect.top) + 4);
        maxBottom = Math.min(vh - 8, Math.round(shellRect.bottom) - 4);
      }

      const multiEl = document.querySelector('.multi-screen-workspace');
      const multiRect = multiEl?.getBoundingClientRect();
      if (multiRect && multiRect.width > 120 && multiRect.left > 320) {
        maxRight = Math.min(maxRight, Math.max(320, Math.round(multiRect.left) - 10));
      }

      const accountsPanelEl = document.querySelector('[data-panel-id="accounts"]');
      const accountsRect = accountsPanelEl?.getBoundingClientRect();
      if (accountsRect && accountsRect.width > 80 && accountsRect.left > 480) {
        maxRight = Math.min(maxRight, Math.max(420, Math.round(accountsRect.left) - 8));
      }
    }

    const availWidth = Math.max(420, maxRight - availLeft);
    const availHeight = Math.max(280, maxBottom - availTop);

    if (safeTotal === 1) {
      const width = Math.min(initialWidth, availWidth);
      const height = Math.min(initialHeight, availHeight);
      const x = availLeft + Math.max(0, Math.round((availWidth - width) / 2));
      const y = availTop + Math.max(0, Math.round((availHeight - height) / 2));
      return { x, y, width, height };
    }

    const gap = 10;
    const col = safeSlot % 2;
    const row = Math.floor(safeSlot / 2);

    if (safeTotal === 2) {
      const width = Math.max(440, Math.min(initialWidth, Math.floor((availWidth - gap) / 2)));
      const height = Math.max(340, Math.min(initialHeight, availHeight - 16));
      const x = col === 0 ? availLeft : Math.max(availLeft + 28, maxRight - width);
      const y = availTop + Math.max(0, Math.round((availHeight - height) / 2));
      return { x, y, width, height };
    }

    const width = Math.max(440, Math.min(680, Math.floor((availWidth - gap) / 2)));
    const height = Math.max(280, Math.min(460, Math.floor((availHeight - gap) / 2)));
    const x = col === 0 ? availLeft : Math.max(availLeft + 28, maxRight - width);
    const y = row === 0 ? availTop : Math.max(availTop + 28, maxBottom - height);
    return { x, y, width, height };
  }, [initialWidth, initialHeight, windowIndex, totalWindows]);

  const [position, setPosition] = useState(() => {
    const b = computeMultiScreenSafeBounds(windowIndex, totalWindows);
    return { x: b.x, y: b.y };
  });
  const [size, setSize] = useState(() => {
    const b = computeMultiScreenSafeBounds(windowIndex, totalWindows);
    return { width: b.width, height: b.height };
  });
  const [isMaximized, setIsMaximized] = useState(false);
  const [dockZone, setDockZone] = useState(null);
  const [isDraggingWindow, setIsDraggingWindow] = useState(false);
  const [hoveredDockZone, setHoveredDockZone] = useState(null);
  const [dockRects, setDockRects] = useState(() => readPopupDockZones());
  const hoveredDockZoneRef = useRef(null);
  const [preMaxState, setPreMaxState] = useState(() => {
    const b = computeMultiScreenSafeBounds(windowIndex, totalWindows);
    return { x: b.x, y: b.y, w: b.width, h: b.height };
  });

  useEffect(() => {
    if (isMaximized || dockZone) return undefined;
    const rafId = window.requestAnimationFrame(() => {
      if (!hasUserMovedRef.current) {
        const nextBounds = computeMultiScreenSafeBounds(windowIndex, totalWindows);
        setSize({ width: nextBounds.width, height: nextBounds.height });
        setPosition({ x: nextBounds.x, y: nextBounds.y });
        setPreMaxState({ x: nextBounds.x, y: nextBounds.y, w: nextBounds.width, h: nextBounds.height });
        return;
      }
      if (multiScreenCount <= 0) return;
      const multiEl = document.querySelector('.multi-screen-workspace');
      const multiRect = multiEl?.getBoundingClientRect();
      if (!multiRect || multiRect.width <= 120 || multiRect.left <= 320) return;
      const maxRight = Math.max(320, Math.round(multiRect.left) - 10);
      setSize((currSize) => {
        const nextWidth = Math.min(currSize.width, Math.max(420, maxRight - 16));
        setPosition((currPos) => {
          if (currPos.x + nextWidth <= maxRight) return currPos;
          const nextX = Math.max(8, maxRight - nextWidth);
          return clampPopupPosition({ x: nextX, y: currPos.y }, { width: nextWidth, height: currSize.height });
        });
        return nextWidth === currSize.width ? currSize : { ...currSize, width: nextWidth };
      });
    });
    return () => window.cancelAnimationFrame(rafId);
  }, [multiScreenCount, isMaximized, dockZone, windowIndex, totalWindows, computeMultiScreenSafeBounds]);

  const applyDockZone = (targetZone, options = {}) => {
    const { toggleIfSame = true } = options;
    if (!targetZone || (toggleIfSame && dockZone === targetZone)) {
      const restoreW = preMaxState.w || initialWidth;
      const restoreH = preMaxState.h || initialHeight;
      const restoreX = preMaxState.w ? preMaxState.x : Math.max(0, (window.innerWidth - restoreW) / 2);
      const restoreY = preMaxState.h ? preMaxState.y : Math.max(0, (window.innerHeight - restoreH) / 2);
      setDockZone(null);
      setIsMaximized(false);
      setSize({ width: restoreW, height: restoreH });
      setPosition(clampPopupPosition({ x: restoreX, y: restoreY }, { width: restoreW, height: restoreH }));
      return;
    }

    const rects = readPopupDockZones();
    setDockRects(rects);
    const zoneRect = rects[targetZone];
    if (!zoneRect) return;

    if (!isMaximized && !dockZone) {
      setPreMaxState({ x: position.x, y: position.y, w: size.width, h: size.height });
    }
    setIsMaximized(false);
    setDockZone(targetZone);
    setPosition({ x: zoneRect.left, y: zoneRect.top });
    setSize({ width: zoneRect.width, height: zoneRect.height });
  };

  const handleHeaderMouseDown = (e) => {
    if (e.button !== undefined && e.button !== 0) return;
    if (e.target.closest('button') || e.target.closest('.account-details-window-controls')) return;
    e.preventDefault();
    const startX = e.clientX;
    const startY = e.clientY;
    let startPosX = position.x;
    let startPosY = position.y;
    let activeSize = { width: size.width, height: size.height };
    let moved = false;
    let currentRects = dockRects;

    const handleMouseMove = (moveEvent) => {
      const dx = moveEvent.clientX - startX;
      const dy = moveEvent.clientY - startY;

      if (!moved && Math.hypot(dx, dy) >= 5) {
        moved = true;
        hasUserMovedRef.current = true;
        currentRects = readPopupDockZones();
        setDockRects(currentRects);
        setIsDraggingWindow(true);

        if (isMaximized || dockZone) {
          const restoreW = preMaxState.w || initialWidth;
          const restoreH = preMaxState.h || initialHeight;
          activeSize = { width: restoreW, height: restoreH };
          startPosX = Math.min(Math.max(0, startX - restoreW / 2), Math.max(0, window.innerWidth - restoreW));
          startPosY = Math.min(Math.max(0, startY - 18), Math.max(0, window.innerHeight - restoreH));
          setIsMaximized(false);
          setDockZone(null);
          setSize(activeSize);
        } else {
          setPreMaxState({ x: position.x, y: position.y, w: size.width, h: size.height });
        }
      }

      if (!moved) return;

      const zone = detectPopupDockZone(moveEvent.clientX, moveEvent.clientY, currentRects);
      if (hoveredDockZoneRef.current !== zone) {
        hoveredDockZoneRef.current = zone;
        setHoveredDockZone(zone);
      }

      setPosition(clampPopupPosition({
        x: startPosX + dx,
        y: startPosY + dy,
      }, activeSize));
    };

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.userSelect = '';
      const dropZone = hoveredDockZoneRef.current;
      hoveredDockZoneRef.current = null;
      setHoveredDockZone(null);
      setIsDraggingWindow(false);
      if (moved && dropZone) {
        const rects = readPopupDockZones();
        setDockRects(rects);
        const zoneRect = rects[dropZone];
        if (zoneRect) {
          setIsMaximized(false);
          setDockZone(dropZone);
          setPosition({ x: zoneRect.left, y: zoneRect.top });
          setSize({ width: zoneRect.width, height: zoneRect.height });
        }
      }
    };

    document.body.style.userSelect = 'none';
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  const handleResizeMouseDown = (e, edge) => {
    if (isMaximized) return;
    e.preventDefault();
    e.stopPropagation();
    hasUserMovedRef.current = true;
    let startX = e.clientX;
    let startY = e.clientY;
    let startWidth = size.width;
    let startHeight = size.height;
    let startPosX = position.x;
    let startPosY = position.y;
    const minW = 420;
    const minH = 260;

    const handleMouseMove = (moveEvent) => {
      let dx = moveEvent.clientX - startX;
      let dy = moveEvent.clientY - startY;

      if (edge === 'right') {
        setSize(prev => ({ ...prev, width: Math.max(minW, startWidth + dx) }));
      } else if (edge === 'bottom') {
        setSize(prev => ({ ...prev, height: Math.max(minH, startHeight + dy) }));
      } else if (edge === 'bottom-right') {
        setSize({
          width: Math.max(minW, startWidth + dx),
          height: Math.max(minH, startHeight + dy)
        });
      } else if (edge === 'left') {
        let newWidth = Math.max(minW, startWidth - dx);
        let actualDx = newWidth - startWidth;
        setSize(prev => ({ ...prev, width: newWidth }));
        setPosition(prev => ({
          ...prev,
          x: clampPopupPosition({ x: startPosX - actualDx, y: prev.y }, { width: newWidth, height: startHeight }).x,
        }));
      } else if (edge === 'top') {
        let newHeight = Math.max(minH, startHeight - dy);
        let actualDy = newHeight - startHeight;
        setSize(prev => ({ ...prev, height: newHeight }));
        setPosition(prev => ({
          ...prev,
          y: clampPopupPosition({ x: prev.x, y: startPosY - actualDy }, { width: startWidth, height: newHeight }).y,
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
    else if (edge === 'bottom' || edge === 'top') document.body.style.cursor = 'ns-resize';
    else if (edge === 'bottom-right') document.body.style.cursor = 'nwse-resize';
    document.body.style.userSelect = 'none';

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  const toggleMaximize = () => {
    if (!isMaximized) {
      if (!dockZone) {
        setPreMaxState({ x: position.x, y: position.y, w: size.width, h: size.height });
      }
      setDockZone(null);
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
      if (dockZone) {
        const rects = readPopupDockZones();
        setDockRects(rects);
        const zoneRect = rects[dockZone];
        if (zoneRect) {
          setPosition({ x: zoneRect.left, y: zoneRect.top });
          setSize({ width: zoneRect.width, height: zoneRect.height });
        }
        return;
      }
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
  }, [size, dockZone]);

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
  // Fail-closed for positions: the Trade tab gates its Close button on a known
  // symbol, so ticket-only closes here must resolve the ticket's own symbol
  // from the positions list already in scope and refuse when it is unknown or
  // empty (no invented fallback; generic for all symbols). Orders cancel by
  // ticket via orderDelete and their symbol is not in scope here, so the gate
  // applies to positions only.
  const requestTradeClose = (trade) => {
    if (!requireTradeClosePermission()) return;
    if (entity === 'deal') {
      showResult.info('Deals are historical records and cannot be deleted from this view.');
      return;
    }
    const ticket = trade?.position ?? trade?.ticket;
    const positionDetails = entity === 'position' && ticket !== undefined && ticket !== null
      ? positions.find(position => String(position.position) === String(ticket))
      : undefined;
    if (entity === 'position') {
      const resolvedSymbol = [trade?.symbol, positionDetails?.symbol]
        .map((value) => String(value ?? '').trim())
        .find((value) => value !== '') ?? '';
      if (!resolvedSymbol) {
        showResult.error(`Cannot close position #${ticket ?? '—'}: the symbol is unknown. Reopen the account and try again.`);
        return;
      }
      setPendingTradeClose({ ...positionDetails, ...trade, symbol: resolvedSymbol });
      return;
    }
    setPendingTradeClose({ ...positionDetails, ...trade });
  };

  const handleDeleteTrade = async (ticket) => {
    if (!requireTradeClosePermission()) return;
    // Defense in depth behind requestTradeClose and the disabled confirm
    // button: never send a position close when the ticket's symbol cannot be
    // resolved from the positions list already in scope (or the pending
    // confirmation row). Orders cancel by ticket and stay ungated here.
    if (entity === 'position') {
      const resolvedSymbol = [positions.find((position) => String(position.position) === String(ticket))?.symbol, pendingTradeClose?.symbol]
        .map((value) => String(value ?? '').trim())
        .find((value) => value !== '') ?? '';
      if (!resolvedSymbol) {
        showResult.error(`Cannot close position #${ticket ?? '—'}: the symbol is unknown. Reopen the account and try again.`);
        return;
      }
    }
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
      const outcome = normalizeResult(result);
      if (entity === 'order') {
        showResult({ ...result, message: `${label}\n\n${message}` });
      }
      // A completed HTTP request can still report a rejected or pending close.
      // Only remove a trade when the result confirms success.
      if (outcome.type !== 'success') return;
      invalidatePositionsCache(loginId);
      setPositions(prev => prev.filter(p => String(p.position) !== String(ticket)));
      if (entity === 'position') {
        setSelectedTicketRow(null);
        setPositionSyncRevision(revision => revision + 1);
      }
    } catch (err) {
      console.error(`[${label}] error:`, err);
      const status = err?.code || err?.status || 'ERROR';
      const message = `${label} failed\n\nstatus: ${status}\nmessage: ${err?.message || String(err)}`;
      if (entity === 'order') showResult.error(message);
    } finally {
      setIsDeleting(false);
      setPendingTradeClose(null);
      if (entity === 'position') {
        // Keep the full account trade list visible after either outcome.
        setFocusedTicket(null);
        setActiveTab('Overview');
      }
    }
  };

  useEffect(() => {
    if (!showPositions) return undefined;
    const refreshPositions = () => {
      const runRefresh = () => {
        pendingPositionsRefreshTimerRef.current = null;
        lastPositionsRequestAtRef.current = Date.now();
        invalidateAccountPositionsCache(loginId);
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
      if (event?.type === 'snapshot') {
        if (event.reason === 'reconciled') setPositionSyncRevision((revision) => revision + 1);
        return;
      }

      if (event?.type === 'position') {
        if (event?.snapshot) {
          // applyPositionsSnapshot already wrote this account's scoped cache;
          // re-reading it is instant and must not invalidate it back to HTTP.
          const snapshotRows = getPositionSnapshotRows(event.payload) || [];
          const hasLogin = snapshotRows.some((row) => (
            String(row?.account_login ?? row?.accountLogin ?? row?.login ?? row?.Login ?? '') === String(loginId)
          ));
          const cached = peekAccountPositions(loginId);
          const updatedTickets = new Set(snapshotRows.map((row) => String(row?.positionTicket ?? row?.Position ?? row?.ticket ?? row?.Ticket ?? row?.position ?? '')));
          const hasUpdatedTicket = cached?.some((row) => updatedTickets.has(String(row.position)));
          if (cached !== undefined && (hasLogin || hasUpdatedTicket)) {
            setPositionSyncRevision((revision) => revision + 1);
          }
          return;
        }
        const updateLogin = getPositionUpdateLogin(event.payload);
        // Untargeted frames must not make every open account refetch. The
        // periodic snapshot below reconciles any malformed server envelope.
        if (updateLogin === undefined || String(updateLogin) !== String(loginId)) return;
      } else {
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
  }, [loginId, showPositions]);

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
    const fetchDetails = async ({ silent = false, force = true } = {}) => {
      const requestId = ++detailsRequest;
      if (!silent) setLoading(true);
      if (!silent) setError(null);

      try {
        await loadAccountDetails(loginId, { force });
        if (active && requestId === detailsRequest) setError(null);
      } catch (err) {
        if (active && requestId === detailsRequest) setError(err.message);
      } finally {
        if (active && requestId === detailsRequest) setLoading(false);
      }
    };

    // Last-known details (or the grid row) are already on screen, so only a
    // first-ever open shows the loading status while it revalidates.
    fetchDetails({ silent: peekAccountDetails(loginId) !== undefined, force: false });

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
    if (!loginId || !showPositions) return;

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

        // When the popup was opened via double-click on a row, `focusedTicket`
        // holds that row's ticket. Auto-select it so the Trade tab is pre-wired
        // to that position (no more "Select a row" placeholder).
        if (focusedTicket) {
          const hit = mine.find(p =>
            String(p.position ?? p.ticket) === String(focusedTicket)
          );
          if (hit) {
            setSelectedTicketRow(hit);
          } else {
            // Fallback: synthesize a minimal row so buttons still work for
            // Orders / Deals where the popup doesn't fetch its own list.
            setSelectedTicketRow({
              position: focusedTicket,
              ticket: focusedTicket,
              symbol: '',
              type: '',
              priceSl: 0,
              priceTp: 0,
            });
          }
        }
      } catch (err) {
        if (!active) return;
        console.error("Failed to fetch positions", err);
        setPositionsError(err?.message || 'Unable to load open positions.');
        if (Number(err?.status) === 403 || /\bview_positions\b/i.test(String(err?.message || ''))) {
          setPositionsDeniedLogin(String(loginId));
          setPositions([]);
          setSelectedTicketRow(null);
          return;
        }
        if (focusedTicket) {
          setSelectedTicketRow({
            position: focusedTicket,
            ticket: focusedTicket,
            symbol: '',
            type: '',
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
  }, [loginId, focusedTicket, positionSyncRevision, showPositions]);

  useEffect(() => {
    if (activeTab !== 'History' || !loginId || !showPositions) return;

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
  }, [activeTab, loginId, showPositions]);

  // Early return AFTER all hooks so hook order is invariant across renders.
  if (!account) return null;

  const rowData = account && typeof account === 'object' ? account : {};
  const fieldSources = [...getAccountDetailSources(accountData), ...getAccountDetailSources(rowData)];
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

      updateCachedAccountDetails(loginId, allowedUpdates);
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
      // POST keeps the cleartext password out of the request URL.
      const { ok, text } = await checkManagerPassword({ login: loginId, type, password });
      showResult(text, { title: 'Password check result', type: ok ? undefined : 'error' });
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
      // POST keeps the cleartext password out of the request URL.
      const { ok, text } = await changeManagerPassword({ login: loginId, type, password });
      showResult(text, { title: 'Password change result', type: ok ? undefined : 'error' });
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
      setDepositDestination('');
      setDepositError(`${message} The amount, destination and comment have been reset.`);
    };
    setDepositError(null);
    setDepositSuccess(null);
    // The selector only offers supported types, but the submit path still
    // resolves fail-closed so a tampered selection can never be submitted as
    // the wrong transaction kind. All four types share the same permission
    // gate, validation, and idempotency flow below.
    let transactionTypeKey;
    try {
      transactionTypeKey = resolveManagerTransactionType(transactionType);
    } catch {
      reportFailure('Unsupported transaction type selected.');
      return;
    }
    const transactionActionLabel = getManagerTransactionActionLabel(transactionTypeKey);
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

    // Transfers require a destination account login, resolved through the
    // tested helper (SecureTransfer contract: from_login AND to_login as
    // positive different integers). All other types send no to_login.
    let parsedDestination = null;
    if (transactionTypeKey === 'transfer') {
      try {
        parsedDestination = resolveTransferDestination(depositDestination, parsedLogin);
      } catch (err) {
        reportFailure(err?.message || 'Destination login must be a positive integer account login.');
        return;
      }
    }

    if (depositConfirmationRef.current || isDepositing) return;
    const confirmed = await new Promise((resolve) => {
      depositConfirmationRef.current = resolve;
      setDepositConfirmation(buildManagerTransactionConfirmation(transactionTypeKey, joinMoneyAmount(amountVal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }), currencyValue), parsedLogin, parsedDestination));
    });
    if (!confirmed) return;

    setIsDepositing(true);
    setDepositError(null);
    setDepositSuccess(null);

    try {
      // TransferRequest carries from_login/to_login (no `login` key); all
      // other types carry `login`. The backend 400s a transfer without both
      // positive different integers, so the keys must match the endpoint.
      const result = await submitManagerTransaction(transactionTypeKey, {
        ...(transactionTypeKey === 'transfer'
          ? { from_login: parsedLogin, to_login: parsedDestination }
          : { login: parsedLogin }),
        amount: amountVal,
        comment: depositComment.trim(),
      });

      if (result && typeof result === 'object' && (result.success === false || result.ok === false)) {
        throw new Error(result.error || result.message || `${transactionActionLabel} failed`);
      }

      const responseMessage = result && typeof result === 'object'
        ? (result.message || result.detail || result.status_message)
        : '';
      const successMessage = buildManagerTransactionSuccessMessage(transactionTypeKey, joinMoneyAmount(amountVal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }), currencyValue), parsedLogin, parsedDestination);
      setDepositSuccess(typeof responseMessage === 'string' && responseMessage ? `${successMessage} ${responseMessage}` : successMessage);
      setDepositAmount('');
      setDepositComment('');
      setDepositDestination('');
      // Refresh failures must never turn a completed transaction into a failed transaction.
      void Promise.resolve().then(() => onAccountUpdated?.(loginId)).catch(() => {});

      // Do not wait for the next grid/websocket interval after the backend has
      // accepted the transaction: refresh the displayed balance immediately.
      void loadAccountDetails(loginId, { force: true })
        .catch(() => {
          setDepositSuccess((message) => message
            ? `${message} The balance could not be refreshed. Reopen the account to check it; do not repeat the transaction.`
            : message);
        });
    } catch (err) {
      reportFailure(`${buildManagerTransactionFailurePrefix(transactionTypeKey, parsedLogin)}: ${err?.message || 'The result could not be confirmed. Check account history before trying again.'}`);
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
  // No group-currency source is in scope here (only the account payload and
  // live metrics), so an unreported currency stays '' (unknown) instead of
  // inventing 'USD'. Render sites already treat '' as unknown ('—'/blank).
  const currencyValue = getFieldValue('Currency', '');
  const rawLeverageValue = getFieldValue('Leverage');
  const rawLeverageNumber = String(rawLeverageValue || '100').replace(/^1\s*:\s*/, '');
  const leverageValue = rawLeverageValue ? `1:${String(rawLeverageValue).replace(/^1:/, '')}` : '';
  const leverageHeaderLabel = leverageValue || `1:${rawLeverageNumber}`;
  const modeRaw = String(getFieldValue('AccountMode', 'hedge'));
  const modeVal = modeRaw.charAt(0).toUpperCase() + modeRaw.slice(1);
  const modeHeaderLabel = modeRaw.toLowerCase().startsWith('hedg')
    ? 'Hedge'
    : modeRaw.toLowerCase().startsWith('net')
      ? 'Netting'
      : (modeVal || 'Hedge');
  const statusValue = String(getFieldValue('Status', 'active')).toLowerCase();
  const statusLabel = statusValue.charAt(0).toUpperCase() + statusValue.slice(1);
  const languageValue = normalizeLanguageOption(getValue('Language', LANGUAGE_OPTIONS[0]));
  const registrationValue = getFieldValue('Registration');
  const lastAccessValue = getFieldValue('LastAccess');
  const lastIpValue = getFieldValue('LastIP');
  const emailValue = getFieldValue('Email');
  const mqidValue = getFieldValue('MQID');

  const formatNumber = (val) => {
    if (val === null || val === undefined || isNaN(Number(val))) return '0.00';
    return ACCOUNT_NUMBER_FORMATTER.format(Number(val));
  };

  const rawBalanceVal = getFieldValue('Balance', 0);
  const rawEquityVal = getFieldValue('Equity', rawBalanceVal);
  const rawMarginVal = getFieldValue('Margin', 0);
  const rawFreeMarginVal = getFieldValue('MarginFree', Number(rawEquityVal || 0) - Number(rawMarginVal || 0));
  const balanceVal = formatNumber(rawBalanceVal);
  const equityVal = formatNumber(rawEquityVal);
  const marginVal = formatNumber(rawMarginVal);
  const freeMarginVal = formatNumber(rawFreeMarginVal);
  const rawMarginLevel = getFieldValue('MarginLevel', null);
  const hasMarginLevel = rawMarginLevel !== null && rawMarginLevel !== undefined && rawMarginLevel !== '' && Number.isFinite(Number(rawMarginLevel));
  const computedMarginLevel = hasMarginLevel
    ? Number(rawMarginLevel)
    : (Number(rawMarginVal) > 0 ? (Number(rawEquityVal) / Number(rawMarginVal)) * 100 : null);
  const marginLevelVal = hasMarginLevel ? formatNumber(rawMarginLevel) : '—';
  const profitVal = getFieldValue('Profit', 0);
  const swapVal = formatNumber(getFieldValue('Swap', 0));
  const balanceSpaceVal = formatSpaceNumber(rawBalanceVal);
  const equitySpaceVal = formatSpaceNumber(rawEquityVal);
  const marginSpaceVal = formatSpaceNumber(rawMarginVal);
  const freeMarginSpaceVal = formatSpaceNumber(rawFreeMarginVal);
  const marginLevelSpaceVal = computedMarginLevel !== null && Number.isFinite(computedMarginLevel)
    ? formatSpaceNumber(computedMarginLevel)
    : '0.00';

  const formatDate = (value) => {
    if (!hasDisplayValue(value)) return '';
    const raw = String(value).trim();
    if (/^\d{4}\.\d{2}\.\d{2}/.test(raw)) return raw;
    const isNumeric = /^-?\d+(\.\d+)?$/.test(raw);
    const d = isNumeric
      ? new Date(Number(raw) > 100000000000 ? Number(raw) : Number(raw) * 1000)
      : new Date(raw);
    if (Number.isNaN(d.getTime())) return raw;
    return d.toISOString().replace('T', ' ').slice(0, 19).replace(/-/g, '.');
  };

  const formatOverviewDate = (value) => {
    const formatted = formatDate(value);
    return formatted ? formatted.slice(0, 10) : '';
  };

  const formatOverviewDateTime = (value) => {
    const formatted = formatDate(value);
    return formatted ? formatted.slice(0, 16) : '';
  };

  const titleText = `Account: ${[loginId, name, currencyValue, leverageHeaderLabel, modeHeaderLabel].filter(Boolean).join(', ')}`;

  const dockOverlay =
    isDraggingWindow && typeof document !== 'undefined'
      ? createPortal(
          <div className="multi-screen-dock-overlay account-details-dock-overlay" data-testid="account-details-dock-overlay">
            {[
              { id: 'left', label: '◀ Attach to Left', rect: dockRects.left },
              { id: 'bottom', label: '▼ Attach to Bottom', rect: dockRects.bottom },
              { id: 'right', label: '▶ Attach to Right', rect: dockRects.right },
            ].map((zone) => {
              if (!zone.rect) return null;
              const isHovered = hoveredDockZone === zone.id;
              return (
                <div
                  key={zone.id}
                  data-dock-zone={zone.id}
                  className={`multi-screen-dock-zone multi-screen-dock-zone--${zone.id}${isHovered ? ' is-hovered' : ''}`}
                  style={{
                    left: `${zone.rect.left}px`,
                    top: `${zone.rect.top}px`,
                    width: `${zone.rect.width}px`,
                    height: `${zone.rect.height}px`,
                  }}
                >
                  <span className="multi-screen-dock-zone-badge">{zone.label}</span>
                </div>
              );
            })}
          </div>,
          document.body
        )
      : null;

  const modalNode = (
    <>
    {dockOverlay}
    <div className="account-details-backdrop" aria-hidden="true" />
    <div
      ref={windowRef}
      onMouseDownCapture={() => onFocusWindow?.()}
      onFocusCapture={() => onFocusWindow?.()}
      onKeyDown={event => {
        if (pendingTradeClose || isDepositing || depositConfirmation || updateFeedback) return;
        if (event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          if (ctxMenu.isOpen) setCtxMenu(previous => ({ ...previous, isOpen: false }));
          else onClose();
        }
        if (event.key !== 'Tab') return;
        const controls = [...event.currentTarget.querySelectorAll('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href]')].filter(control => control.getClientRects().length > 0);
        if (event.shiftKey && document.activeElement === controls[0]) { event.preventDefault(); controls.at(-1)?.focus(); }
        else if (!event.shiftKey && document.activeElement === controls.at(-1)) { event.preventDefault(); controls[0]?.focus(); }
      }}
      style={{
        position: 'fixed',
        left: isMaximized ? 0 : position.x,
        top: isMaximized ? 0 : position.y,
        width: isMaximized ? '100vw' : size.width,
        height: isMaximized ? '100vh' : size.height,
        zIndex: 100000 + (Number(zOrder) || 1)
      }}
      className={`account-details-window legacy-popup flex flex-col font-sans select-none overflow-hidden${dockZone ? ` is-docked is-docked--${dockZone}` : ''}${isActiveWindow ? ' is-active-window' : ''}`}
      data-maximized={isMaximized}
      data-dock-zone={dockZone || 'floating'}
      data-account-window-login={loginId}
      role="dialog"
      aria-modal="true"
      aria-label={`Account details for ${loginId}`}
    >
      {!isMaximized && (
        <>
          <div onMouseDown={(e) => handleResizeMouseDown(e, 'top')} className="absolute left-0 right-0 top-0 h-1 cursor-ns-resize hover:bg-blue-500/50 z-10" />
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
          <AccountTitleIcon group={groupValue} />
          <span className="account-details-title truncate">{titleText}</span>
        </div>
        <div className="account-details-window-controls ml-2 shrink-0">
          <div className="account-details-dock-controls" role="group" aria-label="Dock account details window">
            <button
              type="button"
              onClick={() => applyDockZone('left')}
              aria-pressed={dockZone === 'left'}
              aria-label="Dock account details left"
              title={dockZone === 'left' ? 'Undock from left' : 'Set to left'}
              className={dockZone === 'left' ? 'is-active' : ''}
              data-dock-action="left"
            >
              <PanelLeft size={13} />
            </button>
            <button
              type="button"
              onClick={() => applyDockZone('bottom')}
              aria-pressed={dockZone === 'bottom'}
              aria-label="Dock account details bottom"
              title={dockZone === 'bottom' ? 'Undock from bottom' : 'Set to bottom'}
              className={dockZone === 'bottom' ? 'is-active' : ''}
              data-dock-action="bottom"
            >
              <PanelBottom size={13} />
            </button>
            <button
              type="button"
              onClick={() => applyDockZone('right')}
              aria-pressed={dockZone === 'right'}
              aria-label="Dock account details right"
              title={dockZone === 'right' ? 'Undock from right' : 'Set to right'}
              className={dockZone === 'right' ? 'is-active' : ''}
              data-dock-action="right"
            >
              <PanelRight size={13} />
            </button>
          </div>
          <span className="account-details-controls-sep" aria-hidden="true" />
          <button type="button" onClick={onClose} aria-label="Minimize account details"><Minus size={13} /></button>
          <button type="button" onClick={toggleMaximize} aria-label={isMaximized ? 'Restore account details' : 'Maximize account details'}><Square size={12} /></button>
          <button type="button" onClick={onClose} aria-label="Close account details" className="is-close"><X size={15} /></button>
        </div>
      </div>

        <>
          {/* Tab Bar */}
          <div className="account-details-tabs flex items-center flex-shrink-0" role="tablist" aria-label="Account detail sections" onKeyDown={event => {
            if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
            event.preventDefault();
            const buttons = [...event.currentTarget.querySelectorAll('[role="tab"]')];
            const index = buttons.indexOf(event.target.closest('[role="tab"]'));
            const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + buttons.length) % buttons.length;
            const tabs = TABS.filter(tab => showPositions || tab !== 'History');
            setActiveTab(tabs[next]);
            buttons[next]?.focus({ preventScroll: true });
          }}>
            {TABS.filter(tab => showPositions || tab !== 'History').map(tab => (
              <button
                type="button"
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`account-details-tab ${visibleTab === tab ? 'is-active' : ''}`}
                role="tab"
                id={`account-tab-${tab.toLowerCase()}`}
                aria-selected={visibleTab === tab}
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
            aria-labelledby={`account-tab-${visibleTab.toLowerCase()}`}
            className={`account-details-content flex-1 overflow-auto flex flex-col ${visibleTab === 'Overview' ? 'is-overview' : ''} ${visibleTab === 'Trade' ? '!p-2 !gap-0 !overflow-hidden' : ''}`}
          >
            {activeTab !== 'Trade' && activeTab !== 'Overview' && (detailsLoading || detailsError) && (
              <div className={`account-details-status ${detailsError ? 'is-error' : 'is-loading'}`} role={detailsError ? 'alert' : 'status'}>
                {detailsLoading && <Loader size={12} className="animate-spin" />}
                <span>{detailsError ? `Live account details unavailable: ${detailsError}` : 'Refreshing account details…'}</span>
              </div>
            )}

            {visibleTab === 'Overview' ? (
              <div className="account-overview-mt5">
                {/* Top Info Section */}
                <section className="account-overview-summary">
                  <div className="account-overview-headline">
                    <span>{name}, {loginId}, </span>
                    <a
                      href="#account"
                      onClick={(e) => {
                        e.preventDefault();
                        setActiveTab('Account');
                      }}
                      className="account-overview-link is-underlined"
                    >
                      {groupValue || '—'}
                    </a>
                    <span>, 1 : {rawLeverageNumber}</span>
                  </div>

                  <div className="account-overview-meta-block">
                    <div className="account-overview-meta-line">
                      MetaQuotes ID: {mqidValue || '—'}
                    </div>
                    <div className="account-overview-meta-line">
                      {emailValue ? (
                        <a href={`mailto:${emailValue}`} className="account-overview-link">
                          {emailValue}
                        </a>
                      ) : (
                        <span className="account-overview-link">—</span>
                      )}
                    </div>
                    <div className="account-overview-meta-line account-overview-timestamps">
                      <span>Registered: {formatOverviewDate(registrationValue) || '—'}</span>
                      <span>Last access: {formatOverviewDateTime(lastAccessValue) || '—'}</span>
                      <span>Last Address: {lastIpValue || '—'}</span>
                    </div>
                  </div>
                </section>

                {/* Bordered Positions & Summary Box */}
                <div className="account-overview-positions-box flex-1 flex flex-col overflow-hidden">
                  <div className="account-overview-table-scroll custom-scrollbar">
                    {/* Header */}
                    <div className="account-overview-pos-grid account-overview-pos-header">
                      <div className="is-left">Symbol</div>
                      <div className="is-right">Type</div>
                      <div className="is-right">Volume</div>
                      <div className="is-right">Price</div>
                      <div className="is-right">S / L</div>
                      <div className="is-right">T / P</div>
                      <div className="is-right">Price</div>
                      <div className="is-right">Swap</div>
                      <div className="is-right is-last">Profit</div>
                    </div>

                    {/* Position Rows + Summary Strip */}
                    <div className="account-overview-pos-body">
                      {(() => {
                        const displayPositions = showPositions
                          ? (focusedTicket ? positions.filter(p => String(p.position) === String(focusedTicket)) : positions)
                          : [];
                        const totalSwapNum = displayPositions.length > 0
                          ? displayPositions.reduce((acc, p) => acc + Number(p.swap || 0), 0)
                          : Number(getFieldValue('Swap', 0) || 0);
                        const totalProfitNum = displayPositions.length > 0 && (profitVal === null || profitVal === undefined || Number(profitVal) === 0)
                          ? displayPositions.reduce((acc, p) => acc + Number(p.profit || 0), 0)
                          : Number(profitVal || 0);
                        const summarySwapDisplay = formatSpaceNumber(totalSwapNum);
                        const summaryProfitDisplay = formatSpaceNumber(totalProfitNum);

                        return (
                          <>
                            {positionsError && displayPositions.length > 0 && (
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
                              const sideText = String(pos.type || '').toLowerCase();
                              const volNum = Number(pos.volume ?? pos.lots ?? 0);
                              return (
                                <div
                                  key={pos.position}
                                  onContextMenu={(e) => {
                                    e.preventDefault();
                                    setCtxMenu({ x: e.clientX, y: e.clientY, isOpen: true, data: pos });
                                  }}
                                  className="account-overview-pos-grid account-overview-pos-row cursor-pointer"
                                >
                                  <div className="is-left account-overview-pos-symbol">
                                    <PositionSymbolIcon type={sideText} />
                                    <span className="truncate">{pos.symbol}</span>
                                  </div>
                                  <div className="is-right">{sideText}</div>
                                  <div className="is-right tabular">{Number.isFinite(volNum) ? volNum.toFixed(2) : pos.volume}</div>
                                  <div className="is-right tabular">{Number(pos.priceOpen || 0).toFixed(5)}</div>
                                  <div
                                    onDoubleClick={() => handleModifySLTP(pos)}
                                    className="is-right tabular cursor-pointer"
                                    title="Double-click to modify S/L"
                                  >
                                    {Number(pos.priceSl || 0).toFixed(5)}
                                  </div>
                                  <div
                                    onDoubleClick={() => handleModifySLTP(pos)}
                                    className="is-right tabular cursor-pointer"
                                    title="Double-click to modify T/P"
                                  >
                                    {Number(pos.priceTp || 0).toFixed(5)}
                                  </div>
                                  <div className="is-right tabular">
                                    {pos.priceCurrent == null ? '—' : Number(pos.priceCurrent).toFixed(5)}
                                  </div>
                                  <div className="is-right tabular">{formatSpaceNumber(pos.swap || 0)}</div>
                                  <div className="is-right is-last tabular">
                                    {pos.profit == null ? '—' : formatSpaceNumber(pos.profit)}
                                  </div>
                                </div>
                              );
                            })}

                            {/* Grey Financial Summary Strip */}
                            <div
                              className="account-overview-summary-strip"
                              role="group"
                              aria-label="Account financial snapshot"
                            >
                              <div className="account-overview-pos-grid account-overview-summary-main">
                                <div className="account-overview-summary-metrics">
                                  <SummaryBalanceIcon />
                                  <span>
                                    Balance: {balanceSpaceVal}{currencyValue ? ` ${currencyValue}` : ''}
                                    {'  '}Equity: {equitySpaceVal}
                                    {'  '}Margin: {marginSpaceVal}
                                    {'  '}Free Margin: {freeMarginSpaceVal}
                                  </span>
                                </div>
                                <div className="is-right tabular account-overview-summary-swap">
                                  {summarySwapDisplay}
                                </div>
                                <div className="is-right is-last tabular account-overview-summary-profit">
                                  {summaryProfitDisplay}
                                </div>
                              </div>
                              <div className="account-overview-summary-sub">
                                Margin Level: {marginLevelSpaceVal} %
                              </div>
                            </div>
                          </>
                        );
                      })()}
                    </div>
                  </div>
                </div>
              </div>
            ) : activeTab === 'Exposure' ? (
              <div className="flex flex-1 gap-2">
                <div className="border border-[#333] rounded-sm flex flex-col flex-1 bg-[#1e1e1e]">
                  {/* Header */}
                  <div className="grid grid-cols-[140px_1fr_1fr_1fr_160px] bg-[#252526] border-b border-[#333] text-[12px] text-gray-700 dark:text-gray-300 font-medium font-sans">
                    <div className="p-1 px-2 border-r border-[#333]">Asset</div>
                    <div className="p-1 px-2 border-r border-[#333] text-right">Volume</div>
                    <div className="p-1 px-2 border-r border-[#333] text-right">Rate</div>
                    <div className="p-1 px-2 border-r border-[#333] text-right">Value</div>
                    <div className="p-1 px-2 text-center">Graph</div>
                  </div>
                  {/* Rows */}
                  <div className="flex flex-col text-[12px] font-sans text-gray-800 dark:text-gray-200">
                    <div role="status" className="p-1 px-2 border-b border-[#333] text-center">No exposure breakdown is available for the account.</div>
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
                  </div>
                </div>
              </div>
            ) : activeTab === 'Personal' ? (
              <div className="account-personal-tab">
                <header className="account-personal-intro">
                  <div><h2>Personal details</h2></div>
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
                ].map(({ title, fields }) => (
                  <section className="account-personal-section" key={title}>
                    <div className="account-personal-section-header"><h3>{title}</h3></div>
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
                  </div>
                </div>

                <section className="account-settings-card">
                  <div className="account-settings-card-title">
                    <h3>Account assignment</h3>
                    <span className={`ui-status ${statusValue === 'active' ? 'ui-status-ok' : 'ui-status-danger'}`}>{statusLabel}</span>
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
                positions={showPositions ? positions : []}
                selectedTicketRow={showPositions ? selectedTicketRow : null}
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
            ) : activeTab === 'History' && showPositions ? (
              <div className="account-history-tab">
                <div className="account-section-heading">
                  <div>
                    <h2>Position history</h2>
                  </div>
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
                  <div>
                    <h2>Password management</h2>
                    <p>Verify or change account passwords.</p>
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
                  <span>Generated passwords are applied only when you select Change.</span>
                </div>
              </div>
            ) : activeTab === 'Balance' ? (
              <div className="account-transaction-tab custom-scrollbar">
                <div className="account-transaction-card">
                  <div className="account-transaction-header">
                    <h2 className="text-[12px] font-bold   tracking-wide uppercase">
                      {getManagerTransactionActionLabel(transactionType)} funds
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
                      <label htmlFor="transaction-type" className="text-[12px] font-medium">Type *</label>
                      <select
                        id="transaction-type"
                        value={transactionType}
                        disabled={isDepositing || !canManageFinances}
                        onChange={(e) => {
                          setTransactionType(resolveManagerTransactionType(e.target.value));
                          setDepositDestination('');
                          setDepositError(null);
                          setDepositSuccess(null);
                        }}
                        className="w-full h-9    border   rounded-md px-3 text-[12px]   focus:outline-none   transition-all "
                      >
                        {getManagerTransactionOptions().map((option) => (
                          <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                      </select>
                    </div>

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

                    {isTransferType(transactionType) && (
                      <div className="flex flex-col gap-1.5">
                        <label htmlFor="transaction-to-login" className="text-[11px] font-normal">To login *</label>
                        <input
                          type="text"
                          id="transaction-to-login"
                          value={depositDestination}
                          disabled={isDepositing || !canManageFinances}
                          onChange={(e) => {
                            setDepositDestination(e.target.value);
                            setDepositError(null);
                            setDepositSuccess(null);
                          }}
                          placeholder="Destination account login"
                          inputMode="numeric"
                          className="w-full h-9    border   rounded-md px-3 text-[11px]   focus:outline-none   transition-all "
                        />
                      </div>
                    )}

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
                      {isDepositing ? getManagerTransactionPendingLabel(transactionType) : getManagerTransactionActionLabel(transactionType)}
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
          <div className="account-details-footer flex items-center justify-between flex-shrink-0">
            <button
              type="button"
              onClick={() => openAccountScreen?.()}
              className="account-details-btn account-details-new-client"
            >
              New Client
            </button>
            <div className="account-details-footer-right flex items-center gap-2">
              <button
                type={activeTab === 'Trade' ? 'submit' : 'button'}
                form={activeTab === 'Trade' ? 'account-trade-update-form' : undefined}
                onClick={
                  activeTab === 'Trade'
                    ? undefined
                    : () => {
                        if (Object.keys(formData).length > 0) {
                          void handleUpdate();
                        } else {
                          void loadAccountDetails(loginId, { force: true });
                          invalidatePositionsCache(loginId);
                          setPositionSyncRevision((revision) => revision + 1);
                        }
                      }
                }
                disabled={
                  activeTab === 'Trade'
                    ? !tradeUpdateState.canUpdate
                    : visibleTab === 'Overview'
                      ? updateLoading
                      : updateLoading || Object.keys(formData).length === 0 || !canManageAccounts
                }
                title={
                  activeTab === 'Trade'
                    ? 'Select an existing position and change its volume, SL or TP to update'
                    : !canManageAccounts && visibleTab !== 'Overview'
                      ? 'You do not have permission to update accounts'
                      : undefined
                }
                className="account-details-btn account-details-update"
              >
                {(activeTab === 'Trade' ? tradeUpdateState.busy : updateLoading) ? 'Wait...' : 'Update'}
              </button>
              <button
                type="button"
                onClick={onClose}
                className="account-details-btn account-details-close"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {}}
                className="account-details-btn account-details-help"
              >
                Help
              </button>
            </div>
          </div>
        </>

      {ctxMenu.isOpen && (
        <TradeContextMenu
          {...ctxMenu}
          onClose={() => setCtxMenu(prev => ({ ...prev, isOpen: false }))}
          onModify={handleModifySLTP}
          onCloseTrade={(ticket) => requestTradeClose({ ...(ctxMenu.data || {}), position: ticket })}
          canCloseTrades={canCloseTrades && (entity !== 'position' || Boolean(String(ctxMenu.data?.symbol ?? positions.find((position) => String(position.position) === String(ctxMenu.data?.position))?.symbol ?? '').trim()))}
          canManipulateTrades={canManipulateTrades}
        />
      )}

      {pendingTradeClose && (
        <div className="trade-close-confirmation">
          <div ref={tradeConfirmationRef} className="trade-close-confirmation-card" role="alertdialog" aria-modal="true" aria-busy={isDeleting} aria-labelledby="trade-close-confirmation-title" aria-describedby="trade-close-confirmation-description" tabIndex={-1}>
            <div className="trade-close-confirmation-header">
              <div>
                <h2 id="trade-close-confirmation-title">{isOrderCancellation ? 'Cancel order' : 'Close position'}</h2>
                <p className="trade-close-confirmation-subtitle">Review the trade details before confirming.</p>
              </div>
              <button type="button" onClick={() => setPendingTradeClose(null)} disabled={isDeleting} aria-label="Dismiss trade confirmation" className="trade-close-confirmation-dismiss">
                <X size={18} />
              </button>
            </div>
            <div className="trade-close-confirmation-body">
              <section className="trade-close-confirmation-details" aria-label="Trade details">
                <div className="trade-close-confirmation-instrument">
                  <div><span>Symbol</span><strong>{pendingTradeClose.symbol || '—'}</strong></div>
                  <span className="trade-close-confirmation-side" aria-label={`Side: ${pendingTradeClose.type || 'Unavailable'}`}>{pendingTradeClose.type || '—'}</span>
                </div>
                <dl className="trade-close-confirmation-summary">
                  <div><dt>{isOrderCancellation ? 'Order' : 'Position'}</dt><dd>#{pendingTradeClose.position}</dd></div>
                  <div><dt>Action</dt><dd>{isOrderCancellation ? 'Cancel order' : 'Market close'}</dd></div>
                </dl>
              </section>
              <div className="trade-close-confirmation-notice">
                <CircleAlert size={16} aria-hidden="true" />
                <p id="trade-close-confirmation-description" className="trade-close-confirmation-message">
                  <strong>This action cannot be undone.</strong>
                  <span>{isOrderCancellation ? 'This will cancel the selected pending order.' : 'This position will close at the current market price.'}</span>
                </p>
              </div>
            </div>
            <div className="trade-close-confirmation-actions">
              <button type="button" onClick={() => setPendingTradeClose(null)} disabled={isDeleting} className="trade-close-confirmation-cancel">{isOrderCancellation ? 'Keep order' : 'Cancel'}</button>
              <button type="button" onClick={() => handleDeleteTrade(pendingTradeClose.position)} disabled={isDeleting || (!isOrderCancellation && entity === 'position' && !String(pendingTradeClose.symbol ?? '').trim())} title={!isOrderCancellation && entity === 'position' && !String(pendingTradeClose.symbol ?? '').trim() ? 'Cannot close position: the symbol is unknown' : undefined} aria-busy={isDeleting} className="trade-close-confirmation-confirm">
                {isDeleting && <Loader size={14} className="animate-spin" aria-hidden="true" />}
                {isDeleting ? (isOrderCancellation ? 'Cancelling…' : 'Closing…') : (isOrderCancellation ? 'Cancel order' : 'Close position')}
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
        message={depositConfirmation || (isDepositing ? `Waiting for the broker to confirm your ${getManagerTransactionPendingNoun(transactionType)}. Please do not submit it again.` : depositError || depositSuccess)}
        onConfirm={() => finishDepositConfirmation(true)}
        onDismiss={() => { finishDepositConfirmation(false); setDepositError(null); setDepositSuccess(null); }}
      />
    )}
    </>
  );

  if (typeof document !== 'undefined') {
    const portalTarget =
      document.querySelector('.rtx5-command-shell') ||
      document.getElementById('root') ||
      document.body;
    return createPortal(modalNode, portalTarget);
  }
  return modalNode;
};

export default AccountDetailsModal;
