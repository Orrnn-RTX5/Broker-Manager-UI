import { useState, useEffect, useRef } from 'react';
import { X, Minus, Square, User, PlusSquare, MinusSquare, Loader, Eye, EyeOff, Copy, Check as CheckIcon } from 'lucide-react';
import { getPositions } from '../../services/api';
import { buildFeedWsUrl, buildMetricsWsUrl } from '../../config/endpoints';
import positionAdapter from './adapters/position';
import orderAdapter from './adapters/order';
import dealAdapter from './adapters/deal';
import { orderDelete } from '../../services/tradeApi';

const ADAPTERS = { position: positionAdapter, order: orderAdapter, deal: dealAdapter };

const TABS = [
  'Overview', 'Personal', 'Account', 'Limits', 'Balance', 'Trade', 'History', 'Security'
];

const AccountDetailsModal = ({ account, targetTicket, onClose, initialTab = 'Overview', entity = 'position' }) => {
  const adapter = ADAPTERS[entity] || positionAdapter;
  const [activeTab, setActiveTab] = useState(initialTab);
  const [accountData, setAccountData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [formData, setFormData] = useState({});
  const [updateLoading, setUpdateLoading] = useState(false);
  const [passwords, setPasswords] = useState({ master: '', investor: '', api: '', phone: '', otp: '' });
  const [checkingPassword, setCheckingPassword] = useState(null);
  const [changingPassword, setChangingPassword] = useState(null);
  const [showPasswords, setShowPasswords] = useState({ master: false, investor: false, api: false, phone: false, otp: false });
  const [copiedField, setCopiedField] = useState(null);

  const [depositAmount, setDepositAmount] = useState('');
  const [depositComment, setDepositComment] = useState('');
  const [depositCredit, setDepositCredit] = useState('');
  const [isDepositing, setIsDepositing] = useState(false);
  const [depositError, setDepositError] = useState(null);
  const [depositSuccess, setDepositSuccess] = useState(null);

  const [positions, setPositions] = useState([]);
  const [selectedTicketRow, setSelectedTicketRow] = useState(null);
  const [modalTradeSymbol, setModalTradeSymbol] = useState('EURUSD');
  const [tradeSL, setTradeSL] = useState('0.00000');
  const [tradeTP, setTradeTP] = useState('0.00000');
  const [isUpdatingTrade, setIsUpdatingTrade] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [tradeTickHistory, setTradeTickHistory] = useState([]);
  const [isAutoPipTrack, setIsAutoPipTrack] = useState(true);
  const tradeSymbolRef = useRef(modalTradeSymbol);

  const selectedTicketRowRef = useRef(selectedTicketRow);
  useEffect(() => { selectedTicketRowRef.current = selectedTicketRow; }, [selectedTicketRow]);

  const isAutoPipTrackRef = useRef(isAutoPipTrack);
  useEffect(() => { isAutoPipTrackRef.current = isAutoPipTrack; }, [isAutoPipTrack]);

  const adjustValue = (setter, amount) => {
    setIsAutoPipTrack(false);
    setter(prev => (parseFloat(prev) + amount).toFixed(5));
  };

  const initialWidth = Math.min(850, window.innerWidth - 40);
  const initialHeight = Math.min(600, window.innerHeight - 40);

  const [position, setPosition] = useState({
    x: Math.max(0, (window.innerWidth - initialWidth) / 2),
    y: Math.max(0, (window.innerHeight - initialHeight) / 2)
  });
  const [size, setSize] = useState({ width: initialWidth, height: initialHeight });
  const [isMaximized, setIsMaximized] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [preMaxState, setPreMaxState] = useState({ x: 0, y: 0, w: 0, h: 0 });

  const handleHeaderMouseDown = (e) => {
    if (isMaximized || e.target.closest('button') || e.target.closest('.window-controls')) return;
    e.preventDefault();
    let startX = e.clientX;
    let startY = e.clientY;
    let startPosX = position.x;
    let startPosY = position.y;

    const handleMouseMove = (moveEvent) => {
      setPosition({
        x: startPosX + (moveEvent.clientX - startX),
        y: startPosY + (moveEvent.clientY - startY),
      });
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
    if (isMaximized || isMinimized) return;
    e.preventDefault();
    e.stopPropagation();
    let startX = e.clientX;
    let startY = e.clientY;
    let startWidth = size.width;
    let startHeight = size.height;
    let startPosX = position.x;
    let startPosY = position.y;

    const handleMouseMove = (moveEvent) => {
      let dx = moveEvent.clientX - startX;
      let dy = moveEvent.clientY - startY;

      if (edge === 'right') {
        setSize(prev => ({ ...prev, width: Math.max(500, startWidth + dx) }));
      } else if (edge === 'bottom') {
        setSize(prev => ({ ...prev, height: Math.max(400, startHeight + dy) }));
      } else if (edge === 'bottom-right') {
        setSize(prev => ({
          width: Math.max(500, startWidth + dx),
          height: Math.max(400, startHeight + dy)
        }));
      } else if (edge === 'left') {
        let newWidth = Math.max(500, startWidth - dx);
        let actualDx = startWidth - newWidth;
        setSize(prev => ({ ...prev, width: newWidth }));
        setPosition(prev => ({ ...prev, x: startPosX - actualDx }));
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
    if (isMinimized) setIsMinimized(false);
    if (!isMaximized) {
      setPreMaxState({ x: position.x, y: position.y, w: size.width, h: size.height });
      setIsMaximized(true);
    } else {
      setIsMaximized(false);
      setPosition({ x: preMaxState.x, y: preMaxState.y });
      setSize({ width: preMaxState.w, height: preMaxState.h });
    }
  };

  const toggleMinimize = () => {
    if (isMaximized) setIsMaximized(false);
    setIsMinimized(!isMinimized);
  };

  // Entity-aware close/cancel. For Position we cancel via OrderClose (legacy
  // behaviour kept); Order cancels via adapter; Deals cannot be deleted.
  const handleDeleteTrade = async (ticket) => {
    if (entity === 'deal') {
      alert('Deals are historical records and cannot be deleted from this view.');
      return;
    }
    const verb = entity === 'order' ? 'cancel order' : 'close position';
    if (!window.confirm(`Are you sure you want to ${verb} #${ticket}?`)) return;
    setIsDeleting(true);
    const label = entity === 'order' ? `Cancel Order #${ticket}` : `Close Position #${ticket}`;
    try {
      let result;
      if (entity === 'order') {
        result = await orderDelete(ticket);
      } else {
        const token = localStorage.getItem('authToken');
        const res = await fetch(`/api/manager/OrderClose?id=${token}&ticket=${ticket}`, {
          method: 'GET',
          headers: { 'accept': 'application/json' }
        });
        const text = await res.text();
        try { result = JSON.parse(text); } catch { result = { message: text }; }
        if (!res.ok) throw Object.assign(new Error(result?.message || 'Failed to close position'), { status: res.status });
      }
      console.log(`[${label}] response:`, result);
      const status = result?.retcode || result?.status || 'OK';
      const message = result?.message || JSON.stringify(result);
      alert(`${label}\n\nstatus: ${status}\nmessage: ${message}`);
      setPositions(prev => prev.filter(p => p.position !== ticket));
    } catch (err) {
      console.error(`[${label}] error:`, err);
      const status = err?.code || err?.status || 'ERROR';
      alert(`${label} failed\n\nstatus: ${status}\nmessage: ${err?.message || String(err)}`);
    } finally {
      setIsDeleting(false);
    }
  };

  const [liveMetrics, setLiveMetrics] = useState(null);

  // Since the user is passing either an Account Object or just an integer Login ID, we handle both.
  const loginId = typeof account === 'object' ? account.login : account;

  useEffect(() => {
    if (!loginId) return;

    let ws;
    let reconnectTimeout;

    const connectMetricsWs = () => {
      const token = localStorage.getItem('authToken');
      if (!token) return;

      const metricsUrl = buildMetricsWsUrl(token, loginId);
      console.log(`[Metrics WS] Connecting to: ${metricsUrl}`);
      ws = new WebSocket(metricsUrl);

      ws.onopen = () => {
        console.log(`[Metrics WS] Connected successfully for account ${account}`);
      };

      ws.onerror = (e) => {
        console.error(`[Metrics WS] Error payload:`, e);
      };

      ws.onmessage = (e) => {
        try {
          const parsed = JSON.parse(e.data);
          let updateObj = null;

          // Unwrap nested envelope: { channel: "...", data: { data: { login: 200074... } } }
          let payload = parsed;
          if (parsed && parsed.data && parsed.data.data) {
            payload = parsed.data.data;
          }

          if (Array.isArray(payload)) {
            updateObj = payload.find(m => m.login == loginId || m.login === undefined);
          } else {
            updateObj = payload;
          }

          if (updateObj && (updateObj.login == loginId || updateObj.login === undefined)) {
            if (updateObj.balance !== undefined || updateObj.equity !== undefined || updateObj.floating_pnl !== undefined || updateObj.total_swap !== undefined) {
              setLiveMetrics(prev => prev ? { ...prev, ...updateObj } : updateObj);
            }
          }
        } catch (err) {
          console.error(`[Metrics WS] Error parsing message:`, err);
        }
      };

      ws.onclose = (e) => {
        console.log(`[Metrics WS] Connection closed cleanly=${e.wasClean} code=${e.code} reason=${e.reason}. Reconnecting in 3s...`);
        reconnectTimeout = setTimeout(connectMetricsWs, 3000);
      };
    };

    connectMetricsWs();

    return () => {
      clearTimeout(reconnectTimeout);
      if (ws) {
        ws.onclose = null;
        ws.onerror = null;
        if (ws.readyState === WebSocket.OPEN) {
          ws.close();
        } else if (ws.readyState === WebSocket.CONNECTING) {
          ws.onopen = () => ws.close();
        }
      }
    };
  }, [loginId]);

  useEffect(() => {
    tradeSymbolRef.current = modalTradeSymbol;
  }, [modalTradeSymbol]);

  useEffect(() => {
    if (activeTab !== 'Trade') return;

    let ws;
    let reconnectTimeout;

    const connectWebSocket = () => {
      ws = new WebSocket(buildFeedWsUrl());
      ws.onopen = () => ws.send(JSON.stringify({ type: 'subscribe', symbols: ["*"] }));
      ws.onmessage = (e) => {
        try {
          const messages = e.data.trim().split('\n');
          let newTick = null;
          messages.forEach(msgStr => {
            if (!msgStr) return;
            const msg = JSON.parse(msgStr);
            if (msg.symbol === tradeSymbolRef.current && msg.bid && msg.ask) {
              newTick = { bid: parseFloat(msg.bid), ask: parseFloat(msg.ask), time: Date.now() };
            }
          });
          if (newTick) {
            setTradeTickHistory(prev => {
              const updated = [...prev, newTick];
              if (updated.length > 500) return updated.slice(-500);
              return updated;
            });
            // Auto Update SL/TP if enabled
            if (isAutoPipTrackRef.current && selectedTicketRowRef.current) {
              const type = selectedTicketRowRef.current.type;
              const pipSpacing = 0.00050; // 5 pips
              if (type === 'buy') {
                setTradeTP((parseFloat(newTick.ask) + pipSpacing).toFixed(5));
                setTradeSL((parseFloat(newTick.bid) - pipSpacing).toFixed(5));
              } else if (type === 'sell') {
                setTradeTP((parseFloat(newTick.bid) - pipSpacing).toFixed(5));
                setTradeSL((parseFloat(newTick.ask) + pipSpacing).toFixed(5));
              }
            }
          }
        } catch (err) { }
      };
      ws.onclose = () => { reconnectTimeout = setTimeout(connectWebSocket, 3000); };
    };

    connectWebSocket();
    return () => {
      clearTimeout(reconnectTimeout);
      if (ws) {
        ws.onclose = null;
        ws.onerror = null;
        if (ws.readyState === WebSocket.OPEN) {
          ws.close();
        } else if (ws.readyState === WebSocket.CONNECTING) {
          ws.onopen = () => ws.close();
        }
      }
    };
  }, [activeTab]);

  useEffect(() => {
    if (liveMetrics) {
      console.log(`[AccountDetailsModal ${loginId}] NEW LIVE METRICS TICK:`, {
        balance: liveMetrics.balance,
        equity: liveMetrics.equity,
        margin: liveMetrics.used_margin,

        free_margin: liveMetrics.free_margin,
        margin_level: liveMetrics.margin_level,
        pnl: liveMetrics.floating_pnl,
        swap: liveMetrics.total_swap
      });
    }
  }, [liveMetrics, loginId]);

  const handleModifySLTP = (pos) => {
    setSelectedTicketRow(pos);
    setModalTradeSymbol(pos.symbol || 'EURUSD');
    setTradeSL(pos.priceSl ? Number(pos.priceSl).toFixed(5) : '0.00000');
    setTradeTP(pos.priceTp ? Number(pos.priceTp).toFixed(5) : '0.00000');
    setTradeTickHistory([]);
    setActiveTab('Trade');
  };

  // Pretty-prints an API response into the alert body. Always logs the
  // raw response + the originating call name to the console so devs can
  // inspect headers/stack via devtools even if they dismiss the alert.

  const showResult = (label, result) => {
    console.log(`[${label}] response:`, result);
    const status = result?.retcode || result?.status || 'OK';
    const message = result?.message || JSON.stringify(result);
    alert(`${label}\n\nstatus: ${status}\nmessage: ${message}`);
  };

  const showError = (label, err) => {
    console.error(`[${label}] error:`, err);
    const status = err?.code || err?.status || 'ERROR';
    const message = err?.message || String(err);
    alert(`${label} failed\n\nstatus: ${status}\nmessage: ${message}`);
  };

  // Commits S/L + T/P (and, for deals, any adapter-editable field)
  // through the entity-aware adapter.
  const handleUpdateTrade = async () => {
    if (!selectedTicketRow) return;
    const ticket = selectedTicketRow.position || selectedTicketRow.ticket;
    if (!ticket) { alert('No ticket selected.'); return; }

    setIsUpdatingTrade(true);
    try {
      const sl = parseFloat(tradeSL);
      const tp = parseFloat(tradeTP);
      const results = [];
      if (adapter.editableFields.stoploss && !Number.isNaN(sl)) {
        results.push(await adapter.modifyField({ ticket, field: 'stoploss', value: sl }));
      }
      if (adapter.editableFields.takeprofit && !Number.isNaN(tp)) {
        results.push(await adapter.modifyField({ ticket, field: 'takeprofit', value: tp }));
      }
      showResult(`Modify ${adapter.label} #${ticket}`, results[results.length - 1] || { message: 'no changes' });
    } catch (err) {
      showError(`Modify ${adapter.label}`, err);
    } finally {
      setIsUpdatingTrade(false);
    }
  };

  // Runs a named adapter action (Flip, ForceClose, Cancel, etc.)
  const runAdapterAction = async (action) => {
    if (!selectedTicketRow) { alert('Select a row first.'); return; }
    const ticket = selectedTicketRow.position || selectedTicketRow.ticket;
    const login = loginId;
    const ctx = { ticket, login };

    if (action.confirm && !window.confirm(action.confirm)) return;

    let formData = {};
    if (action.prompt) {
      for (const field of action.prompt) {
        const raw = window.prompt(`${field.label}${field.required ? ' (required)' : ''}:`);
        if (raw === null) return;
        if (field.required && !raw.trim()) { alert(`${field.label} is required.`); return; }
        formData[field.key] = field.type === 'number' ? parseFloat(raw) : raw;
      }
    }

    try {
      const result = await action.run(ctx, formData);
      showResult(action.label, result);
    } catch (err) {
      showError(action.label, err);
    }
  };

  const togglePassword = (field) => {
    setShowPasswords(prev => ({ ...prev, [field]: !prev[field] }));
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

  if (!account) return null;

  useEffect(() => {
    if (!loginId) return;

    const fetchDetails = async () => {
      setLoading(true);
      setError(null);
      const token = localStorage.getItem('authToken');
      if (!token) {
        setError("Not connected");
        setLoading(false);
        return;
      }

      try {
        const res = await fetch(`/api/manager/AccountDetails?id=${token}&login=${loginId}`, {
          headers: { 'accept': 'application/json' }
        });
        const text = await res.text();
        let payload;
        try {
          payload = JSON.parse(text);
        } catch {
          throw new Error('Invalid JSON response');
        }
        if (!res.ok) throw new Error(payload.error || 'Server error');
        setAccountData(payload);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    const fetchPositions = async () => {
      try {
        const data = await getPositions();
        const mine = data.filter(p => String(p.login) === String(loginId));
        setPositions(mine);

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
            setModalTradeSymbol(hit.symbol || 'EURUSD');
            setTradeSL(hit.priceSl ? Number(hit.priceSl).toFixed(5) : '0.00000');
            setTradeTP(hit.priceTp ? Number(hit.priceTp).toFixed(5) : '0.00000');
            setTradeTickHistory([]);
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
        console.error("Failed to fetch positions", err);
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
      }
    };

    fetchDetails();
    fetchPositions();
  }, [loginId, targetTicket]);

  const activeData = accountData || (typeof account === 'object' ? account : {});

  const getValue = (field, fallback = '') => {
    if (formData[field] !== undefined) return formData[field];
    return accountData ? (accountData[field] ?? fallback) : (activeData[field] || fallback);
  };

  const handleInputChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleUpdate = async () => {
    if (Object.keys(formData).length === 0) return;
    try {
      setUpdateLoading(true);
      const token = localStorage.getItem('authToken');
      if (!token) throw new Error("Not connected");

      const params = new URLSearchParams({
        id: token,
        login: loginId,
        ...formData
      });

      const res = await fetch(`/api/manager/UserUpdate?${params.toString()}`, {
        method: 'GET',
        headers: { 'accept': 'application/json' }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update');

      setAccountData(prev => ({ ...prev, ...formData }));
      setFormData({});
    } catch (err) {
      console.error(err);
      alert("Error updating: " + err.message);
    } finally {
      setUpdateLoading(false);
    }
  };

  const handlePasswordCheck = async (type, password) => {
    if (!password) {
      alert("Please enter a password to check.");
      return;
    }
    setCheckingPassword(type);
    try {
      const token = localStorage.getItem('authToken');
      const params = new URLSearchParams({
        id: token,
        login: loginId,
        type: type,
        password: password
      });
      const res = await fetch(`/api/manager/UserPasswordCheck?${params.toString()}`, {
        method: 'GET',
        headers: { 'accept': 'text/plain' }
      });
      const text = await res.text();
      alert(`Password Check Result:\n${text}`);
    } catch (err) {
      alert(`Error checking password: ${err.message}`);
    } finally {
      setCheckingPassword(null);
    }
  };


  const handlePasswordChange = async (type, password) => {
    if (!password) {
      alert("Please enter a new password to change.");
      return;
    }
    setChangingPassword(type);
    try {
      const token = localStorage.getItem('authToken');
      const params = new URLSearchParams({
        id: token,
        login: loginId,
        type: type,
        password: password
      });
      const res = await fetch(`/api/manager/UserPasswordChange?${params.toString()}`, {
        method: 'GET',
        headers: { 'accept': 'text/plain' }
      });
      const text = await res.text();
      alert(`Password Change Result:\n${text}`);
    } catch (err) {
      alert(`Error changing password: ${err.message}`);
    } finally {
      setChangingPassword(null);
    }
  };

  const handleDeposit = async () => {
    const amountVal = Number(depositAmount);
    if (!amountVal || amountVal <= 0 || amountVal > 1000000 || isNaN(amountVal)) {
      setDepositError("Amount must be a positive number and cannot exceed 1,000,000.");
      return;
    }

    setIsDepositing(true);
    setDepositError(null);
    setDepositSuccess(null);

    try {
      const token = localStorage.getItem('authToken');
      const params = new URLSearchParams({
        id: token,
        login: loginId,
        amount: amountVal
      });
      if (depositComment) params.append('comment', depositComment);
      if (depositCredit) params.append('credit', depositCredit);

      const res = await fetch(`/api/manager/Deposit?${params.toString()}`, {
        method: 'GET',
        headers: { 'accept': 'application/json' }
      });

      const responseText = await res.text();
      // attempt to parse if JSON
      let data;
      try { data = JSON.parse(responseText); } catch (e) { data = responseText; }

      if (!res.ok) {
        throw new Error(typeof data === 'object' ? (data.error || data.message || 'Deposit failed') : data);
      }
      setDepositSuccess(`Successfully deposited ${amountVal}!`);
      setDepositAmount('');
      setDepositComment('');
      setDepositCredit('');
    } catch (err) {
      setDepositError(err.message);
    } finally {
      setIsDepositing(false);
    }
  };

  const name = accountData ? (accountData.Name || [accountData.FirstName, accountData.LastName].filter(Boolean).join(' '))
    : (activeData.Name || [activeData.FirstName, activeData.LastName].filter(Boolean).join(' ') || 'Hassanbm Mukerd');

  const groupValue = accountData ? (accountData.Group ?? '') : (activeData.Group || 'demo\\forex-hedge-usd-01');
  const currencyValue = accountData ? (accountData.Currency ?? '') : (activeData.Currency || 'USD');
  const leverageValue = accountData ? (accountData.Leverage ? `1:${accountData.Leverage}` : '') : (activeData.Leverage ? `1:${activeData.Leverage}` : '1:1000');
  const modeRaw = activeData.AccountMode || 'hedge';
  const modeVal = modeRaw.charAt(0).toUpperCase() + modeRaw.slice(1);

  const formatNumber = (val) => {
    if (val === null || val === undefined || isNaN(Number(val))) return '0.00';
    return Number(val).toFixed(2);
  };

  const balanceVal = liveMetrics?.balance !== undefined ? formatNumber(liveMetrics.balance) : formatNumber(activeData.balance);
  const equityVal = liveMetrics?.equity !== undefined ? formatNumber(liveMetrics.equity) : formatNumber(activeData.equity);
  const marginVal = liveMetrics?.used_margin !== undefined ? formatNumber(liveMetrics.used_margin) : formatNumber(activeData.margin);
  const freeMarginVal = liveMetrics?.free_margin !== undefined ? formatNumber(liveMetrics.free_margin) : formatNumber(activeData.marginFree);
  const marginLevelVal = liveMetrics?.margin_level !== undefined ? formatNumber(liveMetrics.margin_level) : formatNumber(activeData.marginLevel);

  const formatDate = (unix) => {
    if (!unix) return 'N/A';
    const d = new Date(unix * 1000);
    return d.toISOString().replace('T', ' ').slice(0, 19).replace(/-/g, '.');
  };

  const titleText = `Account: ${loginId}, ${name}, ${currencyValue}, ${leverageValue}, ${modeVal}`;

  return (
    <div
      style={{
        position: 'fixed',
        left: isMaximized ? 0 : position.x,
        top: isMaximized ? 0 : position.y,
        width: isMaximized ? '100vw' : (isMinimized ? 300 : size.width),
        height: isMaximized ? '100vh' : (isMinimized ? 32 : size.height),
        zIndex: 100000
      }}
      className="legacy-popup flex flex-col shadow-2xl rounded-xl font-sans select-none overflow-hidden"
    >
      {!isMaximized && !isMinimized && (
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
        className="h-8 bg-[#2d212f] bg-gradient-to-r from-[#2a1b2d] to-[#1e1e1e] flex items-center justify-between px-3 border-b border-[#333] cursor-move flex-shrink-0"
      >
        <div className="flex items-center gap-2 text-[13px] truncate">
          <User size={14} className="text-green-500 shrink-0" />
          <span className="truncate pr-2">{titleText}</span>
        </div>
        <div className="flex items-center gap-3 text-gray-500 window-controls ml-2 shrink-0">
          <Minus size={14} onClick={toggleMinimize} className="hover:text-gray-700 dark:text-gray-300 cursor-pointer" />
          <Square size={12} onClick={toggleMaximize} className="hover:text-gray-700 dark:text-gray-300 cursor-pointer" />
          <X size={16} onClick={onClose} className="hover:text-red-400 cursor-pointer" />
        </div>
      </div>

      {!isMinimized && (
        <>
          {/* Tab Bar */}
          <div className="h-8 bg-[#1e1e1e] flex items-center px-1 border-b border-[#333] flex-shrink-0">
            {TABS.map(tab => (
              <div
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-3 h-full flex items-center text-[13px] cursor-pointer transition-colors ${activeTab === tab
                  ? 'border-t-2 border-t-blue-500 bg-[#252526] text-gray-900 dark:text-white'
                  : 'text-gray-400 hover:text-gray-800 dark:text-gray-200 hover:bg-[#2a2a2b] border-t-2 border-t-transparent'
                  }`}
              >
                {tab}
              </div>
            ))}
          </div>

          {/* Content Area */}
          <div className="flex-1 overflow-auto bg-[#1e1e1e] p-4 flex flex-col gap-4">

            {activeTab === 'Overview' ? (
              <>
                {/* Top Info Section */}
                <div className="space-y-1.5 text-[13px] font-sans px-1">
                  <div className="flex gap-1.5 items-center">
                    <span className="text-white font-medium">{name}, {loginId},</span>
                    <a href="#" className="text-[#3794ff] hover:underline cursor-pointer">{groupValue}</a>
                    <span className="text-gray-300">, {leverageValue}</span>
                  </div>

                  <div className="text-gray-300">
                    {[accountData ? accountData.Country : activeData.Country, accountData ? accountData.City : activeData.City].filter(Boolean).join(', ') || 'France, Sanaa'}
                  </div>

                  <div className="flex gap-4">
                    <span className="text-gray-300">{accountData ? accountData.Phone : (activeData.Phone || '+967775529929')}</span>
                    <span className="text-gray-300">RTX5 ID: {accountData ? accountData.MQID : (activeData.MQID || '04BA44AF')}</span>
                  </div>

                  <div>
                    <a href="#" className="text-[#3794ff] hover:underline cursor-pointer">{accountData ? accountData.Email : (activeData.Email || 'hassanbm801@gmail.com')}</a>
                  </div>

                  <div className="flex gap-4 text-gray-400 text-[11px] pt-2">
                    <span>Registered: {accountData ? formatDate(accountData.Registration) : (activeData.Registration ? formatDate(activeData.Registration) : '2023.08.15 14:30')}</span>
                    <span>Last access: {accountData ? formatDate(accountData.LastAccess) : (activeData.LastAccess ? formatDate(activeData.LastAccess) : '2023.10.22 09:15')}</span>
                    <span>Last Address: {accountData ? (accountData.LastIP ?? '') : (activeData.LastIP || '192.168.1.1')}</span>
                  </div>
                </div>

                {/* Data Grid Section */}
                <div className="border border-[#333] rounded-sm mt-2 flex flex-col flex-1 bg-[#1e1e1e]">
                  {/* Header */}
                  <div className="grid grid-cols-[120px_60px_60px_80px_80px_80px_80px_80px_1fr_50px] bg-[#252526] border-b border-[#333] text-[12px] text-gray-700 dark:text-gray-300 font-medium font-sans">
                    <div className="p-1 px-2 border-r border-[#333]">Symbol</div>
                    <div className="p-1 px-2 border-r border-[#333] flex justify-between">Type <span className="text-[10px]">▲</span></div>
                    <div className="p-1 px-2 border-r border-[#333] text-right">Volume</div>
                    <div className="p-1 px-2 border-r border-[#333] text-right">Price</div>
                    <div className="p-1 px-2 border-r border-[#333] text-right">S / L</div>
                    <div className="p-1 px-2 border-r border-[#333] text-right">T / P</div>
                    <div className="p-1 px-2 border-r border-[#333] text-right">Price</div>
                    <div className="p-1 px-2 border-r border-[#333] text-right">Swap</div>
                    <div className="p-1 px-2 text-right border-r border-[#333]">Profit</div>
                    <div className="p-1 flex items-center justify-center"></div>
                  </div>

                  {/* Rows */}
                  <div className="flex flex-col text-[12px] font-sans overflow-y-auto">
                    {(() => {
                      const displayPositions = targetTicket ? positions.filter(p => p.position === targetTicket) : positions;
                      return displayPositions.length > 0 ? displayPositions.map((pos) => (
                        <div key={pos.position} className="grid grid-cols-[120px_60px_60px_80px_80px_80px_80px_80px_1fr_50px] border-b border-[#333] hover:bg-[#2d2d30] cursor-default">
                          <div className="p-1 px-2 border-r border-[#333] flex items-center gap-1.5"><MinusSquare size={10} className="text-blue-500" /> {pos.symbol}</div>
                          <div className="p-1 px-2 border-r border-[#333]">{pos.type}</div>
                          <div className="p-1 px-2 border-r border-[#333] text-right">{pos.volume}</div>
                          <div className="p-1 px-2 border-r border-[#333] text-right font-mono">{Number(pos.priceOpen).toFixed(2)}</div>

                          {/* S/L */}
                          <div
                            onDoubleClick={() => handleModifySLTP(pos)}
                            className="p-1 px-2 border-r border-[#333] text-right font-mono cursor-pointer hover:bg-blue-900/40"
                            title="Double-click to modify S/L"
                          >
                            {Number(pos.priceSl || 0).toFixed(2)}
                          </div>

                          {/* T/P */}
                          <div
                            onDoubleClick={() => handleModifySLTP(pos)}
                            className="p-1 px-2 border-r border-[#333] text-right font-mono cursor-pointer hover:bg-blue-900/40"
                            title="Double-click to modify T/P"
                          >
                            {Number(pos.priceTp || 0).toFixed(2)}
                          </div>

                          <div className="p-1 px-2 border-r border-[#333] text-right font-mono">{Number(pos.priceCurrent).toFixed(2)}</div>
                          <div className="p-1 px-2 border-r border-[#333] text-right font-mono">{Number(pos.swap || 0).toFixed(2)}</div>
                          <div className={`p-1 px-2 text-right border-r border-[#333] font-medium font-mono ${pos.profit >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                            {Number(pos.profit || 0).toFixed(2)}
                          </div>
                          <div className="p-1 flex items-center justify-center">
                            <button
                              onClick={() => handleDeleteTrade(pos.position)}
                              disabled={isDeleting}
                              className="text-red-500 bg-red-500/20 rounded p-0.5 disabled:opacity-50 disabled:cursor-not-allowed"
                              title="Close Position"
                            >
                              CLOSE
                            </button>
                          </div>
                        </div>
                      )) : (
                        <div className="p-4 text-center text-gray-500 italic">No open positions matching ticket</div>
                      );
                    })()}
                  </div>

                  {/* Summary Row */}
                  <div className="bg-[#3e3e42] mt-auto">
                    <div className="flex border-b border-[#333] text-[12px] font-bold font-sans">
                      <div className="flex-1 p-1 px-2 flex items-center gap-1.5 text-gray-900 dark:text-white">
                        <PlusSquare size={10} className="text-gray-700 dark:text-gray-300" />
                        Balance: {balanceVal} {currencyValue} <span className="font-normal opacity-80 mx-1">Equity:</span> {equityVal} <span className="font-normal opacity-80 mx-1">Margin:</span> {marginVal} <span className="font-normal opacity-80 mx-1">Free Margin:</span> {freeMarginVal}
                      </div>
                      <div className="w-[80px] p-1 px-2 text-right">
                        {liveMetrics?.total_swap !== undefined ? formatNumber(liveMetrics.total_swap) : '0.00'}
                      </div>
                      <div className={`w-[100px] p-1 px-2 text-right font-medium ${Number(liveMetrics?.floating_pnl ?? activeData.profit ?? 0) >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                        {liveMetrics?.floating_pnl !== undefined ? formatNumber(liveMetrics.floating_pnl) : (activeData.profit !== undefined ? formatNumber(activeData.profit) : '0.00')}
                      </div>
                    </div>
                    <div className="p-1 px-6 text-[12px] font-bold font-sans text-gray-900 dark:text-white">
                      <span className="font-normal opacity-80 mr-1">Margin Level:</span> {marginLevelVal} %
                    </div>
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
                        {liveMetrics?.total_swap !== undefined ? formatNumber(liveMetrics.total_swap) : '0.00'}
                      </div>
                      <div className={`w-[100px] p-1 px-2 text-right font-medium ${Number(liveMetrics?.floating_pnl ?? activeData.profit ?? 0) >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                        {liveMetrics?.floating_pnl !== undefined ? formatNumber(liveMetrics.floating_pnl) : (activeData.profit !== undefined ? formatNumber(activeData.profit) : '0.00')}
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
              <div className="flex-1 flex flex-col overflow-y-auto pr-2 custom-scrollbar text-[13px] font-sans">

                <div className="grid grid-cols-[110px_1fr] items-center gap-x-2 gap-y-2 mb-2">
                  <span className="text-gray-700 dark:text-gray-300 text-right">Name:</span>
                  <input type="text" value={getValue('FirstName', 'Hassanbm')} onChange={(e) => handleInputChange('FirstName', e.target.value)} className="h-[22px] bg-[#1a1b1f] border border-gray-300 dark:border-gray-600 rounded-sm px-2 text-gray-800 dark:text-gray-200 focus:outline-none focus:border-blue-500 w-full" />
                </div>

                <div className="grid grid-cols-[110px_1fr_110px_1fr] items-center gap-x-2 gap-y-2 mb-2">
                  <span className="text-gray-700 dark:text-gray-300 text-right">Last name:</span>
                  <input type="text" value={getValue('LastName', 'Mukerd')} onChange={(e) => handleInputChange('LastName', e.target.value)} className="h-[22px] bg-[#1a1b1f] border border-gray-300 dark:border-gray-600 rounded-sm px-2 text-gray-800 dark:text-gray-200 focus:outline-none focus:border-blue-500 w-full" />
                  <span className="text-gray-700 dark:text-gray-300 text-right">Middle name:</span>
                  <input type="text" className="h-[22px] bg-[#1a1b1f] border border-gray-300 dark:border-gray-600 rounded-sm px-2 text-gray-800 dark:text-gray-200 focus:outline-none focus:border-blue-500 w-full" />
                </div>

                <div className="grid grid-cols-[110px_1fr] items-center gap-x-2 gap-y-2 mb-6">
                  <span className="text-gray-700 dark:text-gray-300 text-right">Company:</span>
                  <input type="text" value={getValue('Company')} onChange={(e) => handleInputChange('Company', e.target.value)} className="h-[22px] bg-[#1a1b1f] border border-gray-300 dark:border-gray-600 rounded-sm px-2 text-gray-800 dark:text-gray-200 focus:outline-none focus:border-blue-500 w-full" />
                </div>

                <div className="grid grid-cols-[110px_200px_110px_1fr] items-center gap-x-2 gap-y-2 mb-6">
                  <span className="text-gray-700 dark:text-gray-300 text-right">Registered:</span>
                  <div className="flex w-full">
                    <input type="text" defaultValue={activeData.Registration ? formatDate(activeData.Registration) : '2026.02.06 19:12:35'} className="h-[22px] bg-[#1a1b1f] border border-gray-300 dark:border-gray-600 rounded-l-sm px-2 text-gray-800 dark:text-gray-200 focus:outline-none flex-1 border-r-0" />
                    <button className="h-[22px] bg-[#2d2d30] border border-gray-300 dark:border-gray-600 rounded-r-sm px-1 flex items-center justify-center hover:bg-[#3e3e42]"><Square size={12} className="text-[#3794ff]" /></button>
                  </div>

                  <span className="text-gray-700 dark:text-gray-300 text-right opacity-0">-</span>
                  <span></span>

                  <span className="text-gray-700 dark:text-gray-300 text-right">Language:</span>
                  <select className="h-[22px] bg-[#1a1b1f] border border-gray-300 dark:border-gray-600 rounded-sm px-1 text-gray-800 dark:text-gray-200 focus:outline-none w-full appearance-none">
                    {['English (en)', 'Arabic (ar)', 'Chinese (zh)', 'French (fr)', 'German (de)', 'Hindi (hi)', 'Japanese (ja)', 'Russian (ru)', 'Spanish (es)', 'Turkish (tr)'].map((l) => (
                      <option key={l} value={l}>{l}</option>
                    ))}
                  </select>

                  <span className="text-gray-700 dark:text-gray-300 text-right">Status:</span>
                  <select className="h-[22px] bg-[#1a1b1f] border border-gray-300 dark:border-gray-600 rounded-sm px-1 text-gray-800 dark:text-gray-200 focus:outline-none w-full appearance-none">
                    {activeData.Status && <option>{activeData.Status}</option>}
                  </select>

                  <span className="text-gray-700 dark:text-gray-300 text-right">ID number:</span>
                  <input type="text" className="h-[22px] bg-[#1a1b1f] border border-gray-300 dark:border-gray-600 rounded-sm px-2 text-gray-800 dark:text-gray-200 focus:outline-none w-full" />

                  <span className="text-gray-700 dark:text-gray-300 text-right">Lead campaign:</span>
                  <input type="text" className="h-[22px] bg-[#1a1b1f] border border-gray-300 dark:border-gray-600 rounded-sm px-2 text-gray-800 dark:text-gray-200 focus:outline-none w-full" />

                  <span className="text-gray-700 dark:text-gray-300 text-right">MetaQuotes ID:</span>
                  <div className="flex gap-2 w-full">
                    <input type="text" value={getValue('MQID', "04BA44AF")} onChange={(e) => handleInputChange('MQID', e.target.value)} className="h-[22px] flex-1 bg-[#1a1b1f] border border-gray-300 dark:border-gray-600 rounded-sm px-2 text-gray-800 dark:text-gray-200 focus:outline-none" />
                    <button className="h-[22px] px-2 bg-[#2d2d30] border border-gray-300 dark:border-gray-600 rounded-sm hover:bg-[#3e3e42] flex items-center justify-center text-[10px] whitespace-nowrap">&gt;&gt;</button>
                  </div>

                  <span className="text-gray-700 dark:text-gray-300 text-right">Lead source:</span>
                  <input type="text" className="h-[22px] bg-[#1a1b1f] border border-gray-300 dark:border-gray-600 rounded-sm px-2 text-gray-800 dark:text-gray-200 focus:outline-none w-full" />
                </div>

                <div className="grid grid-cols-[110px_1fr] items-center gap-x-2 gap-y-2 mb-6">
                  <span className="text-gray-700 dark:text-gray-300 text-right">Email:</span>
                  <input type="text" value={getValue('Email', "hassanbm801@gmail.com")} onChange={(e) => handleInputChange('Email', e.target.value)} className="h-[22px] bg-[#1a1b1f] border border-gray-300 dark:border-gray-600 rounded-sm px-2 text-gray-800 dark:text-gray-200 focus:outline-none w-full" />

                  <span className="text-gray-700 dark:text-gray-300 text-right">Phone:</span>
                  <input type="text" value={getValue('Phone', "+967775529929")} onChange={(e) => handleInputChange('Phone', e.target.value)} className="h-[22px] bg-[#1a1b1f] border border-gray-300 dark:border-gray-600 rounded-sm px-2 text-gray-800 dark:text-gray-200 focus:outline-none w-[200px]" />
                </div>

                <div className="grid grid-cols-[110px_200px_110px_1fr] items-center gap-x-2 gap-y-2 mb-2">
                  <span className="text-gray-700 dark:text-gray-300 text-right">Country:</span>
                  <input type="text" value={getValue('Country', 'France')} onChange={(e) => handleInputChange('Country', e.target.value)} className="h-[22px] bg-[#1a1b1f] border border-gray-300 dark:border-gray-600 rounded-sm px-2 text-gray-800 dark:text-gray-200 focus:outline-none w-full" />

                  <span className="text-gray-700 dark:text-gray-300 text-right">State:</span>
                  <input type="text" className="h-[22px] bg-[#1a1b1f] border border-gray-300 dark:border-gray-600 rounded-sm px-2 text-gray-800 dark:text-gray-200 focus:outline-none w-full" />

                  <span className="text-gray-700 dark:text-gray-300 text-right">City:</span>
                  <input type="text" value={getValue('City', 'Sanaa')} onChange={(e) => handleInputChange('City', e.target.value)} className="h-[22px] bg-[#1a1b1f] border border-gray-300 dark:border-gray-600 rounded-sm px-2 text-gray-800 dark:text-gray-200 focus:outline-none w-full" />

                  <span className="text-gray-700 dark:text-gray-300 text-right">Zip code:</span>
                  <input type="text" value={getValue('ZipCode')} onChange={(e) => handleInputChange('ZipCode', e.target.value)} className="h-[22px] bg-[#1a1b1f] border border-gray-300 dark:border-gray-600 rounded-sm px-2 text-gray-800 dark:text-gray-200 focus:outline-none w-full" />
                </div>

                <div className="grid grid-cols-[110px_1fr] items-center gap-x-2 gap-y-2 mb-6">
                  <span className="text-gray-700 dark:text-gray-300 text-right">Address:</span>
                  <input type="text" value={getValue('Address')} onChange={(e) => handleInputChange('Address', e.target.value)} className="h-[22px] bg-[#1a1b1f] border border-gray-300 dark:border-gray-600 rounded-sm px-2 text-gray-800 dark:text-gray-200 focus:outline-none w-full" />
                </div>

                <div className="grid grid-cols-[110px_1fr] items-center gap-x-2 gap-y-2">
                  <span className="text-gray-700 dark:text-gray-300 text-right">Comment:</span>
                  <input type="text" value={getValue('Comment', 'Android 11, samsung a50...')} onChange={(e) => handleInputChange('Comment', e.target.value)} className="h-[22px] bg-[#1a1b1f] border border-gray-300 dark:border-gray-600 rounded-sm px-2 text-gray-800 dark:text-gray-200 focus:outline-none w-full" />
                </div>

              </div>
            ) : activeTab === 'Account' ? (
              <div className="flex-1 flex flex-col overflow-y-auto pr-2 custom-scrollbar text-[13px] font-sans">

                <div className="grid grid-cols-[110px_1fr] items-center gap-x-2 gap-y-3 mb-3">
                  <span className="text-gray-700 dark:text-gray-300 text-right">Group:</span>
                  <select value={getValue('Group', groupValue)} onChange={(e) => handleInputChange('Group', e.target.value)} className="h-[22px] bg-[#1a1b1f] border border-[#3794ff] rounded-sm px-1 text-gray-800 dark:text-gray-200 focus:outline-none w-full appearance-none">
                    <option value={getValue('Group', groupValue)}>{getValue('Group', groupValue)}</option>
                    <option value="demo\forex-hedge-usd-01">demo\forex-hedge-usd-01</option>
                    <option value="std_ecn">std_ecn</option>
                    <option value="demo_standard">demo_standard</option>
                  </select>
                </div>

                <div className="grid grid-cols-[110px_130px_100px_130px] items-center gap-x-2 gap-y-3 mb-3">
                  <span className="text-gray-700 dark:text-gray-300 text-right">Color:</span>
                  <div className="flex items-center gap-2">
                    <div className="w-[80px] h-[22px] bg-[#1a1b1f] border border-gray-300 dark:border-gray-600 rounded-sm flex items-center justify-between px-1">
                      <div className="w-3 h-3 bg-transparent"></div>
                      <span className="opacity-0">v</span>
                    </div>
                    <label className="flex items-center gap-1.5 cursor-pointer text-gray-700 dark:text-gray-300">
                      <input type="checkbox" className="accent-blue-500 rounded-sm bg-[#1a1b1f] border-gray-300 dark:border-gray-600 h-3 w-3" /> None
                    </label>
                  </div>

                  <span className="text-gray-700 dark:text-gray-300 text-right">Leverage:</span>
                  <select value={getValue('Leverage', String(leverageValue).replace('1:', ''))} onChange={(e) => handleInputChange('Leverage', e.target.value)} className="h-[22px] bg-[#1a1b1f] border border-gray-300 dark:border-gray-600 rounded-sm px-1 text-gray-800 dark:text-gray-200 focus:outline-none w-full appearance-none">
                    <option value={getValue('Leverage', String(leverageValue).replace('1:', ''))}>1:{getValue('Leverage', String(leverageValue).replace('1:', ''))}</option>
                    <option value="10">1:10</option>
                    <option value="50">1:50</option>
                    <option value="100">1:100</option>
                    <option value="500">1:500</option>
                    <option value="1000">1:1000</option>
                  </select>
                </div>

                <div className="grid grid-cols-[110px_200px_110px_200px] items-center gap-x-2 gap-y-3 mb-4">
                  <span className="text-gray-700 dark:text-gray-300 text-right">Bank account:</span>
                  <input type="text" className="h-[22px] bg-[#1a1b1f] border border-gray-300 dark:border-gray-600 rounded-sm px-2 text-gray-800 dark:text-gray-200 focus:outline-none w-[200px]" />

                  <span className="text-gray-700 dark:text-gray-300 text-right">Agent account:</span>
                  <input type="text" className="h-[22px] bg-[#1a1b1f] border border-gray-300 dark:border-gray-600 rounded-sm px-2 text-gray-800 dark:text-gray-200 focus:outline-none w-[200px]" />
                </div>

                <div className="ml-[118px] space-y-2.5 mb-6">
                  <label className="flex items-center gap-2 cursor-pointer text-gray-800 dark:text-gray-200">
                    <input type="checkbox" defaultChecked className="accent-[#3794ff] rounded-sm bg-[#1a1b1f] border-gray-300 dark:border-gray-600 h-3.5 w-3.5" /> Enable this account
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer text-gray-800 dark:text-gray-200">
                    <input type="checkbox" defaultChecked className="accent-[#3794ff] rounded-sm bg-[#1a1b1f] border-gray-300 dark:border-gray-600 h-3.5 w-3.5" /> Enable password change
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer text-gray-800 dark:text-gray-200">
                    <input type="checkbox" defaultChecked className="accent-[#3794ff] rounded-sm bg-[#1a1b1f] border-gray-300 dark:border-gray-600 h-3.5 w-3.5" /> Enable one-time password
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer text-gray-800 dark:text-gray-200">
                    <input type="checkbox" className="accent-[#3794ff] rounded-sm bg-[#1a1b1f] border-gray-300 dark:border-gray-600 h-3.5 w-3.5" /> Change password at next login
                  </label>
                </div>

                <div className="flex flex-1 gap-2">
                  <div className="w-[110px] flex flex-col gap-2 shrink-0 pt-0 text-gray-700 dark:text-gray-300 text-right">
                    <span>Trade accounts:</span>
                    <div className="mt-8 flex flex-col gap-2">
                      <button className="h-6 bg-[#3a3a3c] hover:bg-[#4a4a4c] border border-[#555] rounded-sm w-[70px] ml-auto">Add</button>
                      <button className="h-6 bg-[#3a3a3c] hover:bg-[#4a4a4c] border border-[#555] rounded-sm w-[70px] ml-auto">Edit</button>
                      <button className="h-6 bg-[#3a3a3c] hover:bg-[#4a4a4c] border border-[#555] rounded-sm w-[70px] ml-auto">Delete</button>
                    </div>
                  </div>
                  <div className="flex-1 border border-gray-300 dark:border-gray-600 bg-[#1e1e1e] flex flex-col">
                    <div className="grid grid-cols-2 bg-[#252526] h-[22px] border-b border-gray-300 dark:border-gray-600 px-1 items-center">
                      <div className="border-r border-gray-300 dark:border-gray-600 px-1">Gateway ID</div>
                      <div className="px-2">Account</div>
                    </div>
                  </div>
                </div>

              </div>
            ) : activeTab === 'Limits' ? (
              <div className="flex-1 flex flex-col overflow-y-auto pr-2 custom-scrollbar text-[13px] font-sans">

                <div className="flex gap-8 mb-4">
                  <div className="flex-1 space-y-3">
                    <label className="flex items-center gap-2 cursor-pointer text-gray-800 dark:text-gray-200">
                      <input type="checkbox" defaultChecked className="accent-[#3794ff] rounded-sm bg-[#1a1b1f] border-gray-300 dark:border-gray-600 h-3.5 w-3.5" /> Show to regular managers
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer text-gray-800 dark:text-gray-200">
                      <input type="checkbox" defaultChecked className="accent-[#3794ff] rounded-sm bg-[#1a1b1f] border-gray-300 dark:border-gray-600 h-3.5 w-3.5" /> Include in server reports
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer text-gray-800 dark:text-gray-200">
                      <input type="checkbox" defaultChecked className="accent-[#3794ff] rounded-sm bg-[#1a1b1f] border-gray-300 dark:border-gray-600 h-3.5 w-3.5" /> Enable daily reports
                    </label>

                    <div className="h-2"></div>

                    <label className="flex items-center gap-2 cursor-pointer text-gray-800 dark:text-gray-200">
                      <input type="checkbox" className="accent-[#3794ff] rounded-sm bg-[#1a1b1f] border-gray-300 dark:border-gray-600 h-3.5 w-3.5" /> Enable API connections
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer text-gray-800 dark:text-gray-200">
                      <input type="checkbox" className="accent-[#3794ff] rounded-sm bg-[#1a1b1f] border-gray-300 dark:border-gray-600 h-3.5 w-3.5" /> Enable sponsored VPS hosting
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer text-gray-800 dark:text-gray-200">
                      <input type="checkbox" className="accent-[#3794ff] rounded-sm bg-[#1a1b1f] border-gray-300 dark:border-gray-600 h-3.5 w-3.5" /> Allow access to subscription data via data feeds
                    </label>
                  </div>

                  <div className="flex-1 space-y-3">
                    <label className="flex items-center gap-2 cursor-pointer text-gray-800 dark:text-gray-200">
                      <input type="checkbox" defaultChecked className="accent-[#3794ff] rounded-sm bg-[#1a1b1f] border-gray-300 dark:border-gray-600 h-3.5 w-3.5" /> Enable trading
                    </label>
                    <div className="h-6"></div>
                    <label className="flex items-center gap-2 cursor-pointer text-gray-800 dark:text-gray-200">
                      <input type="checkbox" defaultChecked className="accent-[#3794ff] rounded-sm bg-[#1a1b1f] border-gray-300 dark:border-gray-600 h-3.5 w-3.5" /> Enable algo trading by Expert Advisors
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer text-gray-800 dark:text-gray-200">
                      <input type="checkbox" defaultChecked className="accent-[#3794ff] rounded-sm bg-[#1a1b1f] border-gray-300 dark:border-gray-600 h-3.5 w-3.5" /> Enable trailing stops
                    </label>
                  </div>
                </div>

                <div className="grid grid-cols-[180px_1fr] items-center gap-x-2 gap-y-3 mt-4 w-[380px] mx-auto ml-8">
                  <span className="text-gray-700 dark:text-gray-300 text-right">Limit total value of positions:</span>
                  <div className="flex items-center gap-2">
                    <select className="h-[22px] w-[100px] bg-[#1a1b1f] border border-[#3794ff] text-[#3794ff] rounded-sm px-1 focus:outline-none appearance-none font-medium">
                      <option>Default</option>
                    </select>
                    <span className="text-gray-700 dark:text-gray-300">USD</span>
                  </div>

                  <span className="text-gray-700 dark:text-gray-300 text-right">Limit number of active orders:</span>
                  <select className="h-[22px] w-[100px] bg-[#1a1b1f] border border-[#3794ff] text-[#3794ff] rounded-sm px-1 focus:outline-none appearance-none font-medium">
                    <option>Default</option>
                  </select>
                </div>

              </div>
            ) : activeTab === 'Trade' ? (
              <div className="flex-1 flex gap-2 overflow-hidden bg-[#1a1a1c] p-1 pr-2">
                {/* Left Graph Area */}
                <div className="w-[380px] border border-[#333] bg-[#0a0a0a] flex flex-col relative shrink-0"
                  style={{
                    backgroundImage: `radial-gradient(circle, #2d2d30 1px, transparent 1px)`,
                    backgroundSize: '15px 15px'
                  }}>
                  <div className="absolute top-1 left-2 bg-[#2d2d30] px-1 text-gray-300 text-[11px] border border-[#404040] shadow-sm font-sans z-10">{modalTradeSymbol}</div>

                  {/* Real-time SVG Chart */}
                  <div className="flex-1 relative overflow-hidden flex items-end">
                    {(() => {
                      if (tradeTickHistory.length < 2) {
                        return <div className="absolute inset-0 flex items-center justify-center text-gray-600 text-[11px]">Waiting for ticks on {modalTradeSymbol}...</div>;
                      }

                      const recentHistory = tradeTickHistory.slice(-80);
                      const asks = recentHistory.map(t => t.ask);
                      const bids = recentHistory.map(t => t.bid);
                      const minVal = Math.min(...bids);
                      const maxVal = Math.max(...asks);

                      const range = maxVal - minVal || 0.0001;
                      const padding = range * 0.20;
                      const minP = minVal - padding;
                      const maxP = maxVal + padding;
                      const finalRange = maxP - minP;

                      const width = 100;

                      const getPoints = (isAsk) => {
                        return recentHistory.map((t, i) => {
                          const x = (i / Math.max(recentHistory.length - 1, 1)) * width;
                          const val = isAsk ? t.ask : t.bid;
                          const rawY = 100 - (((val - minP) / finalRange) * 100);
                          const y = isAsk ? rawY - 2.5 : rawY + 2.5; // Artificial spread expansion
                          return `${x},${y}`;
                        }).join(' ');
                      };

                      const currentAsk = recentHistory[recentHistory.length - 1].ask;
                      const currentBid = recentHistory[recentHistory.length - 1].bid;

                      let askY = 100 - (((currentAsk - minP) / finalRange) * 100) - 2.5;
                      let bidY = 100 - (((currentBid - minP) / finalRange) * 100) + 2.5;

                      askY = Math.max(0, Math.min(100, askY));
                      bidY = Math.max(0, Math.min(100, bidY));

                      const yAxisLabels = [0, 0.25, 0.5, 0.75, 1].map(percent => {
                        const y = 100 - (percent * 100);
                        const val = minP + (finalRange * percent);
                        return (
                          <div key={percent} className="absolute right-0 w-[45px] text-[#777] text-[9px] text-right font-mono select-none pr-1" style={{ top: `${y}%`, transform: 'translateY(-50%)' }}>
                            {val.toFixed(5)}
                          </div>
                        );
                      });

                      return (
                        <>
                          {yAxisLabels}

                          <svg className="w-full h-full absolute inset-0 pointer-events-none" preserveAspectRatio="none" viewBox="0 0 100 100" style={{ paddingRight: '45px', boxSizing: 'border-box' }}>
                            <polyline fill="none" stroke="#ef4444" strokeWidth="0.5" points={getPoints(true)} />
                            <polyline fill="none" stroke="#3b82f6" strokeWidth="0.5" points={getPoints(false)} />
                          </svg>

                          {/* Tail Lines */}
                          <div className="absolute right-[45px] left-0 pointer-events-none border-t border-dashed border-[#ef4444]" style={{ top: `${askY}%` }} />
                          <div className="absolute right-[45px] left-0 pointer-events-none border-t border-dashed border-[#3b82f6]" style={{ top: `${bidY}%` }} />

                          {/* Tail Price Labels */}
                          <div className="absolute right-0 w-[45px] bg-[#ef4444] text-[10px] text-white font-mono text-center px-0.5 z-20" style={{ top: `${askY}%`, transform: 'translateY(-50%)' }}>
                            {currentAsk.toFixed(5)}
                          </div>
                          <div className="absolute right-0 w-[45px] bg-[#3b82f6] text-[10px] text-white font-mono text-center px-0.5 z-20" style={{ top: `${bidY}%`, transform: 'translateY(-50%)' }}>
                            {currentBid.toFixed(5)}
                          </div>
                        </>
                      );
                    })()}
                  </div>
                </div>

                {/* Right Trade Form Area */}
                <div className="flex-1 flex flex-col pl-4 text-[13px] font-sans pb-4 overflow-y-auto custom-scrollbar overflow-x-hidden">

                  {selectedTicketRow ? (
                    <div className="grid grid-cols-[80px_1fr] items-center gap-2 mb-3 mt-1">
                      <span className="text-blue-400 text-right font-bold">Ticket:</span>
                      <input type="text" readOnly value={selectedTicketRow.position} className="h-[22px] bg-[#1a1b1f] border border-blue-500/50 rounded-sm px-2 text-blue-400 focus:outline-none w-full appearance-none font-mono font-bold" />
                    </div>
                  ) : (
                    <div className="grid grid-cols-[80px_1fr] items-center gap-2 mb-3 mt-1">
                      <span className="text-gray-500 text-right">New Trade</span>
                      <div className="h-[22px]" />
                    </div>
                  )}

                  <div className="grid grid-cols-[80px_1fr] items-center gap-2 mb-2 mt-1">
                    <span className="text-gray-700 dark:text-gray-300 text-right">Symbol:</span>
                    <select
                      value={modalTradeSymbol}
                      onChange={(e) => {
                        setModalTradeSymbol(e.target.value);
                        setTradeTickHistory([]);
                      }}
                      className="h-[22px] bg-[#1a1b1f] border border-gray-300 dark:border-gray-600 rounded-sm px-1 text-gray-800 dark:text-gray-200 focus:outline-none w-full appearance-none font-bold"
                    >
                      <option value={modalTradeSymbol}>{modalTradeSymbol}</option>
                    </select>
                  </div>

                  <div className="grid grid-cols-[80px_1fr] items-center gap-2 mb-2">
                    <span className="text-gray-700 dark:text-gray-300 text-right">Type:</span>
                    <input type="text" readOnly value={selectedTicketRow ? (selectedTicketRow.type === 'buy' ? 'Buy Order' : 'Sell Order') : 'Market Order'} className="h-[22px] bg-[#1a1b1f] border border-gray-300 dark:border-gray-600 rounded-sm px-2 text-gray-800 dark:text-gray-200 focus:outline-none w-full appearance-none font-medium" />
                  </div>

                  <div className="grid grid-cols-[80px_170px_1fr] items-center gap-2 mb-2">
                    <span className="text-gray-700 dark:text-gray-300 text-right">Volume:</span>
                    <div className="flex">
                      <input type="text" defaultValue="0.01" className="h-[22px] w-[120px] bg-[#1a1b1f] border border-[#3794ff] rounded-sm px-2 text-[#3794ff] focus:outline-none font-medium text-right shadow-[inset_0_1px_2px_rgba(0,0,0,0.5)]" />
                      <div className="flex flex-col ml-1 justify-between h-[22px]">
                        <button className="h-[10px] w-4 bg-[#2d2d30] border border-gray-300 dark:border-gray-600 rounded-[1px] flex items-center justify-center hover:bg-[#3e3e42]"><span className="text-[8px] leading-none mb-0.5" style={{ fontFamily: 'system-ui', transform: 'scaleX(1.5)' }}>▲</span></button>
                        <button className="h-[10px] w-4 bg-[#2d2d30] border border-gray-300 dark:border-gray-600 rounded-[1px] flex items-center justify-center hover:bg-[#3e3e42]"><span className="text-[8px] leading-none mt-0.5" style={{ fontFamily: 'system-ui', transform: 'scaleX(1.5)' }}>▼</span></button>
                      </div>
                    </div>
                    <span className="text-gray-700 dark:text-gray-300">1 000 EUR</span>
                  </div>

                  <div className="grid grid-cols-[80px_170px] items-center gap-2 mb-2">
                    <span className="text-gray-700 dark:text-gray-300 text-right">Fill Policy:</span>
                    <select className="h-[22px] bg-[#1a1b1f] border border-gray-300 dark:border-gray-600 rounded-sm px-1 text-gray-800 dark:text-gray-200 focus:outline-none flex-1 appearance-none">
                      <option>Fill or Kill</option>
                    </select>
                  </div>

                  <div className="grid grid-cols-[80px_170px_1fr] items-center gap-2 mb-2">
                    <span className="text-gray-700 dark:text-gray-300 text-right">At Price:</span>
                    <div className="flex">
                      <input type="text" defaultValue="1.14620" className="h-[22px] w-[120px] bg-[#1a1b1f] border border-gray-300 dark:border-gray-600 rounded-sm px-2 text-gray-800 dark:text-gray-200 focus:outline-none text-right shadow-[inset_0_1px_2px_rgba(0,0,0,0.5)]" />
                      <div className="flex flex-col ml-1 justify-between h-[22px]">
                        <button className="h-[10px] w-4 bg-[#2d2d30] border border-gray-300 dark:border-gray-600 rounded-[1px] flex items-center justify-center hover:bg-[#3e3e42]"><span className="text-[8px] leading-none mb-0.5" style={{ fontFamily: 'system-ui', transform: 'scaleX(1.5)' }}>▲</span></button>
                        <button className="h-[10px] w-4 bg-[#2d2d30] border border-gray-300 dark:border-gray-600 rounded-[1px] flex items-center justify-center hover:bg-[#3e3e42]"><span className="text-[8px] leading-none mt-0.5" style={{ fontFamily: 'system-ui', transform: 'scaleX(1.5)' }}>▼</span></button>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 ml-2">
                      <button className="px-5 py-[1px] bg-[#2d2d30] border border-gray-300 dark:border-gray-500 rounded-sm hover:bg-[#3e3e42] text-[12px] h-[22px]">Update</button>
                      <label className="flex items-center gap-1.5 cursor-pointer text-gray-800 dark:text-gray-200">
                        <input type="checkbox" checked={isAutoPipTrack} onChange={(e) => setIsAutoPipTrack(e.target.checked)} className="accent-[#3794ff] rounded-sm bg-[#1a1b1f] border-gray-300 dark:border-gray-600 h-3.5 w-3.5" /> Auto
                      </label>
                    </div>
                  </div>

                  <div className="grid grid-cols-[70px_1fr_75px_1fr] items-center gap-x-1.5 gap-y-3 mb-2 mt-4 w-full pr-2">
                    <span className="text-gray-700 dark:text-gray-300 text-right">Stop Loss:</span>
                    <div className="flex w-full">
                      <input type="text" value={tradeSL} onChange={(e) => { setTradeSL(e.target.value); setIsAutoPipTrack(false); }} className="h-[22px] w-full bg-[#1a1b1f] border border-gray-300 dark:border-gray-600 rounded-sm px-2 text-gray-800 dark:text-gray-200 focus:outline-none text-right shadow-[inset_0_1px_2px_rgba(0,0,0,0.5)]" />
                      <div className="flex flex-col ml-1 justify-between h-[22px] shrink-0">
                        <button onClick={() => adjustValue(setTradeSL, 0.00001)} className="h-[10px] w-4 bg-[#2d2d30] border border-gray-300 dark:border-gray-600 rounded-[1px] flex items-center justify-center hover:bg-[#3e3e42]"><span className="text-[8px] leading-none mb-0.5" style={{ fontFamily: 'system-ui', transform: 'scaleX(1.5)' }}>▲</span></button>
                        <button onClick={() => adjustValue(setTradeSL, -0.00001)} className="h-[10px] w-4 bg-[#2d2d30] border border-gray-300 dark:border-gray-600 rounded-[1px] flex items-center justify-center hover:bg-[#3e3e42]"><span className="text-[8px] leading-none mt-0.5" style={{ fontFamily: 'system-ui', transform: 'scaleX(1.5)' }}>▼</span></button>
                      </div>
                    </div>

                    <span className="text-gray-700 dark:text-gray-300 text-right">Take Profit:</span>
                    <div className="flex w-full">
                      <input type="text" value={tradeTP} onChange={(e) => { setTradeTP(e.target.value); setIsAutoPipTrack(false); }} className="h-[22px] w-full bg-[#1a1b1f] border border-gray-300 dark:border-gray-600 rounded-sm px-2 text-gray-800 dark:text-gray-200 focus:outline-none text-right shadow-[inset_0_1px_2px_rgba(0,0,0,0.5)]" />
                      <div className="flex flex-col ml-1 justify-between h-[22px] shrink-0">
                        <button onClick={() => adjustValue(setTradeTP, 0.00001)} className="h-[10px] w-4 bg-[#2d2d30] border border-gray-300 dark:border-gray-600 rounded-[1px] flex items-center justify-center hover:bg-[#3e3e42]"><span className="text-[8px] leading-none mb-0.5" style={{ fontFamily: 'system-ui', transform: 'scaleX(1.5)' }}>▲</span></button>
                        <button onClick={() => adjustValue(setTradeTP, -0.00001)} className="h-[10px] w-4 bg-[#2d2d30] border border-gray-300 dark:border-gray-600 rounded-[1px] flex items-center justify-center hover:bg-[#3e3e42]"><span className="text-[8px] leading-none mt-0.5" style={{ fontFamily: 'system-ui', transform: 'scaleX(1.5)' }}>▼</span></button>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-[80px_1fr] items-center gap-2 mb-2">
                    <span className="text-gray-700 dark:text-gray-300 text-right">Comment:</span>
                    <select className="h-[22px] bg-[#1a1b1f] border border-gray-300 dark:border-gray-600 rounded-sm px-1 text-gray-800 dark:text-gray-200 focus:outline-none w-full appearance-none"></select>
                  </div>

                  <div className="flex justify-center items-center gap-3 py-4 text-[26px] font-sans tracking-tight">
                    <span className="text-[#ef5350]">
                      {tradeTickHistory.length > 0 ? tradeTickHistory[tradeTickHistory.length - 1].ask.toFixed(5) : '0.000'}
                    </span>
                    <span className="text-gray-700 dark:text-gray-300 text-2xl font-light">/</span>
                    <span className="text-[#64b5f6]">
                      {tradeTickHistory.length > 0 ? tradeTickHistory[tradeTickHistory.length - 1].bid.toFixed(5) : '0.000'}
                    </span>
                  </div>

                  {selectedTicketRow ? (
                    <div className="px-3 mb-2 flex flex-col gap-2">
                      <button
                        onClick={handleUpdateTrade}
                        disabled={isUpdatingTrade}
                        className="ui-btn ui-btn-primary"
                        style={{ height: 34, fontWeight: 600 }}
                      >
                        {isUpdatingTrade ? 'Modifying…' : `Modify ${adapter.label} S/L · T/P`}
                      </button>

                      {adapter.actions.length > 0 && (
                        <div className="flex flex-wrap gap-2 justify-center">
                          {adapter.actions.map(act => (
                            <button
                              key={act.key}
                              onClick={() => runAdapterAction(act)}
                              title={act.title}
                              className={
                                act.tone === 'danger' ? 'ui-btn ui-btn-danger ui-btn-sm' :
                                  act.tone === 'danger-outline' ? 'ui-btn ui-btn-secondary ui-btn-sm' :
                                    'ui-btn ui-btn-secondary ui-btn-sm'
                              }
                              style={act.tone === 'danger-outline' ? { color: 'var(--danger-text)', borderColor: 'var(--danger-border)' } : undefined}
                            >
                              {act.label}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="px-3 mb-2">
                      <div
                        className="text-center text-xs py-4 rounded-lg"
                        style={{
                          background: 'var(--surface-2)',
                          border: '1px dashed var(--border)',
                          color: 'var(--text-3)',
                        }}
                      >
                        Select a {adapter.label.toLowerCase()} row to enable modifications.
                      </div>
                    </div>
                  )}

                  <div className="px-3 mt-1 relative">
                    <div className="h-6 bg-[#252526] border border-[#333] shadow-[inset_0_1px_3px_rgba(0,0,0,0.6)]"></div>
                  </div>

                </div>
              </div>
            ) : activeTab === 'Security' ? (
              <div className="flex-1 flex flex-col overflow-y-auto pr-2 custom-scrollbar text-[13px] font-sans px-2">

                <div className="mb-6 space-y-1">
                  <p className="text-gray-800 dark:text-gray-200 mb-1">Master password is used for full access to the trading account</p>
                  <div className="flex gap-4 items-start">
                    <div>
                      <div className="relative">
                        <input type={showPasswords.master ? "text" : "password"} value={passwords.master} onChange={(e) => setPasswords(p => ({ ...p, master: e.target.value }))} placeholder="|" className="w-[180px] h-[22px] bg-[#1a1b1f] border border-[#3794ff] rounded-sm pl-2 pr-12 text-gray-800 dark:text-gray-200 focus:outline-none shadow-[inset_0_1px_2px_rgba(0,0,0,0.5)]" />
                        <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
                          <button onClick={() => togglePassword('master')} className="text-gray-400 hover:text-gray-800 dark:text-gray-200 focus:outline-none">
                            {showPasswords.master ? <EyeOff size={13} /> : <Eye size={13} />}
                          </button>
                          <button onClick={() => handleCopy('master', passwords.master)} className="text-gray-400 hover:text-gray-800 dark:text-gray-200 focus:outline-none">
                            {copiedField === 'master' ? <CheckIcon size={12} className="text-green-500" /> : <Copy size={12} />}
                          </button>
                        </div>
                      </div>
                      <p className="text-[11px] text-[#dbab44] mt-1 tracking-wide">minimum 8 characters</p>
                    </div>
                    <button onClick={() => handlePasswordCheck('USER_PASS_MAIN', passwords.master)} disabled={checkingPassword === 'USER_PASS_MAIN'} className="h-[22px] w-[90px] bg-[#2d2d30] border border-gray-300 dark:border-gray-500 rounded-sm hover:bg-[#3e3e42] text-gray-800 dark:text-gray-200 disabled:opacity-50">{checkingPassword === 'USER_PASS_MAIN' ? '...' : 'Check'}</button>
                    <button onClick={() => handlePasswordChange('Master', passwords.master)} disabled={changingPassword === 'Master'} className="h-[22px] w-[90px] bg-[#2d2d30] border border-gray-300 dark:border-gray-500 rounded-sm hover:bg-[#3e3e42] text-gray-800 dark:text-gray-200 disabled:opacity-50">{changingPassword === 'Master' ? 'Wait...' : 'Change'}</button>
                    <button className="h-[22px] w-[90px] bg-[#2d2d30] border border-gray-300 dark:border-gray-500 rounded-sm hover:bg-[#3e3e42] text-gray-800 dark:text-gray-200">Generate</button>
                  </div>
                </div>

                <div className="mb-6 space-y-1">
                  <p className="text-gray-800 dark:text-gray-200 mb-1">Investor password is used for limited access to the trading account in read-only mode</p>
                  <div className="flex gap-4 items-start">
                    <div>
                      <div className="relative">
                        <input type={showPasswords.investor ? "text" : "password"} value={passwords.investor} onChange={(e) => setPasswords(p => ({ ...p, investor: e.target.value }))} placeholder="" className="w-[180px] h-[22px] bg-[#1a1b1f] border border-gray-300 dark:border-gray-600 rounded-sm pl-2 pr-12 text-gray-800 dark:text-gray-200 focus:outline-none shadow-[inset_0_1px_2px_rgba(0,0,0,0.5)]" />
                        <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
                          <button onClick={() => togglePassword('investor')} className="text-gray-400 hover:text-gray-800 dark:text-gray-200 focus:outline-none">
                            {showPasswords.investor ? <EyeOff size={13} /> : <Eye size={13} />}
                          </button>
                          <button onClick={() => handleCopy('investor', passwords.investor)} className="text-gray-400 hover:text-gray-800 dark:text-gray-200 focus:outline-none">
                            {copiedField === 'investor' ? <CheckIcon size={12} className="text-green-500" /> : <Copy size={12} />}
                          </button>
                        </div>
                      </div>
                      <p className="text-[11px] text-gray-400 mt-1 tracking-wide">minimum 8 characters</p>
                    </div>
                    <button onClick={() => handlePasswordCheck('USER_PASS_INVESTOR', passwords.investor)} disabled={checkingPassword === 'USER_PASS_INVESTOR'} className="h-[22px] w-[90px] bg-[#2d2d30] border border-gray-300 dark:border-gray-500 rounded-sm hover:bg-[#3e3e42] text-gray-800 dark:text-gray-200 disabled:opacity-50">{checkingPassword === 'USER_PASS_INVESTOR' ? '...' : 'Check'}</button>
                    <button onClick={() => handlePasswordChange('Invester', passwords.investor)} disabled={changingPassword === 'Invester'} className="h-[22px] w-[90px] bg-[#2d2d30] border border-gray-300 dark:border-gray-500 rounded-sm hover:bg-[#3e3e42] text-gray-800 dark:text-gray-200 disabled:opacity-50">{changingPassword === 'Invester' ? 'Wait...' : 'Change'}</button>
                  </div>
                </div>

                <div className="mb-6 space-y-1">
                  <p className="text-gray-800 dark:text-gray-200 mb-1">API password is used for access to the server using Web API</p>
                  <div className="flex gap-4 items-start">
                    <div>
                      <div className="relative">
                        <input type={showPasswords.api ? "text" : "password"} value={passwords.api} onChange={(e) => setPasswords(p => ({ ...p, api: e.target.value }))} placeholder="" className="w-[180px] h-[22px] bg-[#1a1b1f] border border-gray-300 dark:border-gray-600 rounded-sm pl-2 pr-12 text-gray-800 dark:text-gray-200 focus:outline-none shadow-[inset_0_1px_2px_rgba(0,0,0,0.5)]" />
                        <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
                          <button onClick={() => togglePassword('api')} className="text-gray-400 hover:text-gray-800 dark:text-gray-200 focus:outline-none">
                            {showPasswords.api ? <EyeOff size={13} /> : <Eye size={13} />}
                          </button>
                          <button onClick={() => handleCopy('api', passwords.api)} className="text-gray-400 hover:text-gray-800 dark:text-gray-200 focus:outline-none">
                            {copiedField === 'api' ? <CheckIcon size={12} className="text-green-500" /> : <Copy size={12} />}
                          </button>
                        </div>
                      </div>
                      <p className="text-[11px] text-gray-400 mt-1 tracking-wide">minimum 8 characters</p>
                    </div>
                    <button className="h-[22px] w-[90px] bg-[#2d2d30] border border-gray-300 dark:border-gray-500 rounded-sm hover:bg-[#3e3e42] text-gray-800 dark:text-gray-200">Check</button>
                    <button className="h-[22px] w-[90px] bg-[#2d2d30] border border-gray-300 dark:border-gray-500 rounded-sm hover:bg-[#3e3e42] text-gray-800 dark:text-gray-200">Change</button>
                  </div>
                </div>

                <div className="mb-6 space-y-1">
                  <p className="text-gray-800 dark:text-gray-200 mb-1">Phone password allows to identify the account owner when performing trade operations by phone</p>
                  <div className="flex gap-4 items-start">
                    <div>
                      <div className="relative">
                        <input type={showPasswords.phone ? "text" : "password"} value={passwords.phone} onChange={(e) => setPasswords(p => ({ ...p, phone: e.target.value }))} placeholder="" className="w-[180px] h-[22px] bg-[#1a1b1f] border border-gray-300 dark:border-gray-600 rounded-sm pl-2 pr-12 text-gray-800 dark:text-gray-200 focus:outline-none shadow-[inset_0_1px_2px_rgba(0,0,0,0.5)]" />
                        <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
                          <button onClick={() => togglePassword('phone')} className="text-gray-400 hover:text-gray-800 dark:text-gray-200 focus:outline-none">
                            {showPasswords.phone ? <EyeOff size={13} /> : <Eye size={13} />}
                          </button>
                          <button onClick={() => handleCopy('phone', passwords.phone)} className="text-gray-400 hover:text-gray-800 dark:text-gray-200 focus:outline-none">
                            {copiedField === 'phone' ? <CheckIcon size={12} className="text-green-500" /> : <Copy size={12} />}
                          </button>
                        </div>
                      </div>
                      <p className="text-[11px] text-gray-400 mt-1 tracking-wide">to view password set focus to field</p>
                    </div>
                  </div>
                </div>

                <div className="mb-4 space-y-1">
                  <p className="text-gray-800 dark:text-gray-200 mb-1">Shared secret key in combination with the current timestamp is used to generate one-time password</p>
                  <p className="text-gray-700 dark:text-gray-300 mt-2 mb-1">OTP secret key</p>
                  <div className="flex gap-4 items-start">
                    <div>
                      <div className="relative">
                        <input type={showPasswords.otp ? "text" : "password"} value={passwords.otp} onChange={(e) => setPasswords(p => ({ ...p, otp: e.target.value }))} placeholder="" className="w-[180px] h-[22px] bg-[#1a1b1f] border border-gray-300 dark:border-gray-600 rounded-sm pl-2 pr-12 text-gray-800 dark:text-gray-200 focus:outline-none shadow-[inset_0_1px_2px_rgba(0,0,0,0.5)]" />
                        <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
                          <button onClick={() => togglePassword('otp')} className="text-gray-400 hover:text-gray-800 dark:text-gray-200 focus:outline-none">
                            {showPasswords.otp ? <EyeOff size={13} /> : <Eye size={13} />}
                          </button>
                          <button onClick={() => handleCopy('otp', passwords.otp)} className="text-gray-400 hover:text-gray-800 dark:text-gray-200 focus:outline-none">
                            {copiedField === 'otp' ? <CheckIcon size={12} className="text-green-500" /> : <Copy size={12} />}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

              </div>
            ) : activeTab === 'Balance' ? (
              <div className="flex-1 overflow-y-auto px-4 py-4 custom-scrollbar text-[13px] font-sans">
                <div className="max-w-[500px] mx-auto bg-[#f8f8f8] dark:bg-[#252526] border border-[#d3d3d3] dark:border-[#333333] shadow-sm rounded-none">
                  <div className="h-7 bg-[#e5e5e5] dark:bg-[#2d2d30] border-b border-[#d3d3d3] dark:border-[#333333] flex items-center px-3 select-none">
                    <h2 className="text-[11px] font-bold text-gray-800 dark:text-gray-200 tracking-wide uppercase">Deposit Funds</h2>
                  </div>

                  <div className="p-4 flex flex-col gap-3">
                    {depositError && <div className="p-2 bg-[#ffdddd] dark:bg-red-900/30 border border-[#f5c2c2] dark:border-red-800 text-red-700 dark:text-red-400 rounded-none text-[11px]">{depositError}</div>}
                    {depositSuccess && <div className="p-2 bg-[#d4edda] dark:bg-green-900/30 border border-[#c3e6cb] dark:border-green-800 text-green-800 dark:text-green-400 rounded-none text-[11px]">{depositSuccess}</div>}

                    <div className="flex flex-col gap-1">
                      <label className="text-[11px] text-gray-700 dark:text-gray-300">Amount *</label>
                      <input
                        type="number"
                        value={depositAmount}
                        onChange={(e) => setDepositAmount(e.target.value)}
                        placeholder="Max 1,000,000"
                        className="w-full h-[22px] bg-white dark:bg-[#1a1b1f] border border-[#a0a0a0] dark:border-[#555] rounded-none px-2 text-[11px] text-gray-800 dark:text-gray-200 focus:outline-none focus:border-blue-500"
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-[11px] text-gray-700 dark:text-gray-300">Comment</label>
                      <input
                        type="text"
                        value={depositComment}
                        onChange={(e) => setDepositComment(e.target.value)}
                        className="w-full h-[22px] bg-white dark:bg-[#1a1b1f] border border-[#a0a0a0] dark:border-[#555] rounded-none px-2 text-[11px] text-gray-800 dark:text-gray-200 focus:outline-none focus:border-blue-500"
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-[11px] text-gray-700 dark:text-gray-300">Credit</label>
                      <input
                        type="text"
                        value={depositCredit}
                        onChange={(e) => setDepositCredit(e.target.value)}
                        className="w-full h-[22px] bg-white dark:bg-[#1a1b1f] border border-[#a0a0a0] dark:border-[#555] rounded-none px-2 text-[11px] text-gray-800 dark:text-gray-200 focus:outline-none focus:border-blue-500"
                      />
                    </div>
                    <button
                      onClick={handleDeposit}
                      disabled={isDepositing || !depositAmount}
                      className="mt-2 w-[100px] h-[24px] self-end bg-[#e1e1e1] dark:bg-[#333333] hover:bg-[#d4d4d4] dark:hover:bg-[#3e3e42] border border-[#adadad] dark:border-[#555555] text-gray-800 dark:text-gray-200 text-[11px] disabled:opacity-50 transition-colors rounded-none"
                    >
                      {isDepositing ? 'Working...' : 'Deposit'}
                    </button>
                  </div>
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
          <div className="h-12 bg-[#252526] border-t border-[#333] flex items-center justify-between px-4 flex-shrink-0">
            <button className="px-5 py-1.5 min-w-[120px] bg-[#3a3a3c] hover:bg-[#4a4a4c] border border-[#555] rounded-[3px] text-[12px] text-gray-800 dark:text-gray-200 transition-colors">
              Client Properties
            </button>

            <div className="flex gap-2">
              <button onClick={handleUpdate} disabled={updateLoading || Object.keys(formData).length === 0} className="px-5 py-1.5 min-w-[80px] bg-[#3a3a3c] hover:bg-[#4a4a4c] border border-[#555] rounded-[3px] text-[12px] text-gray-800 dark:text-gray-200 transition-colors disabled:opacity-50">
                {updateLoading ? 'Wait...' : 'Update'}
              </button>
              <button onClick={onClose} className="px-5 py-1.5 min-w-[80px] bg-[#3a3a3c] hover:bg-[#4a4a4c] border border-[#555] rounded-[3px] text-[12px] text-gray-800 dark:text-gray-200 transition-colors">
                Cancel
              </button>
              <button className="px-5 py-1.5 min-w-[80px] bg-[#3a3a3c] hover:bg-[#4a4a4c] border border-[#555] rounded-[3px] text-[12px] text-gray-800 dark:text-gray-200 transition-colors">
                Help
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default AccountDetailsModal;
