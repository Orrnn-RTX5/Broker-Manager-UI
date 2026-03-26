import { useState, useEffect } from 'react';
import { X, Minus, Square, User, PlusSquare, MinusSquare, Loader, Eye, EyeOff, Copy, Check as CheckIcon } from 'lucide-react';

const TABS = [
  'Overview', 'Exposure', 'Personal', 'Account', 'Limits',
  'Profile', 'Subscriptions', 'Balance', 'Trade', 'History', 'Security'
];

const AccountDetailsModal = ({ account, onClose, initialTab = 'Overview' }) => {
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

  // Since the user is passing either an Account Object or just an integer Login ID, we handle both.
  const loginId = typeof account === 'object' ? account.login : account;

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
        const res = await fetch(`http://69.197.178.27/manager/AccountDetails?id=${token}&login=${loginId}`, {
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

    fetchDetails();
  }, [loginId]);

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

      const res = await fetch(`http://69.197.178.27/manager/UserUpdate?${params.toString()}`, {
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
      const res = await fetch(`http://69.197.178.27/manager/UserPasswordCheck?${params.toString()}`, {
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
      const res = await fetch(`http://69.197.178.27/manager/UserPasswordChange?${params.toString()}`, {
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

      const res = await fetch(`http://69.197.178.27/manager/Deposit?${params.toString()}`, {
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

  const balanceVal = activeData.balance !== undefined ? Number(activeData.balance).toFixed(2) : '-235 895.00';
  const equityVal = activeData.equity !== undefined ? Number(activeData.equity).toFixed(2) : '-231 664.00';
  const marginVal = activeData.margin !== undefined ? Number(activeData.margin).toFixed(2) : '2 000.00';
  const freeMarginVal = activeData.marginFree !== undefined ? Number(activeData.marginFree).toFixed(2) : '-233 664.00';
  const marginLevelVal = activeData.marginLevel !== undefined ? Number(activeData.marginLevel).toFixed(2) : '-11 583.20';

  const formatDate = (unix) => {
    if (!unix) return 'N/A';
    const d = new Date(unix * 1000);
    return d.toISOString().replace('T', ' ').slice(0, 19).replace(/-/g, '.');
  };

  const titleText = `Account: ${loginId}, ${name}, ${currencyValue}, ${leverageValue}, ${modeVal}`;

  return (
    <div className="fixed inset-0 z-[100000] flex items-center justify-center bg-black/40 backdrop-blur-sm pointer-events-auto">

      {/* Main Window */}
      <div className="w-[850px] h-[600px] bg-[#1a1a1a] border border-[#333] shadow-2xl flex flex-col font-sans text-gray-800 dark:text-gray-200 select-none overflow-hidden rounded-sm">

        {/* Title Bar */}
        <div className="h-8 bg-[#2d212f] bg-gradient-to-r from-[#2a1b2d] to-[#1e1e1e] flex items-center justify-between px-3 border-b border-[#333] cursor-default flex-shrink-0">
          <div className="flex items-center gap-2 text-[13px]">
            <User size={14} className="text-green-500" />
            <span>{titleText}</span>
          </div>
          <div className="flex items-center gap-3 text-gray-500">
            <Minus size={14} className="hover:text-gray-700 dark:text-gray-300 cursor-pointer" />
            <Square size={12} className="hover:text-gray-700 dark:text-gray-300 cursor-pointer" />
            <X size={16} onClick={onClose} className="hover:text-red-400 cursor-pointer" />
          </div>
        </div>

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
                  <span className="text-gray-300">MetaQuotes ID: {accountData ? accountData.MQID : (activeData.MQID || '04BA44AF')}</span>
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
                <div className="grid grid-cols-[120px_60px_60px_80px_80px_80px_80px_80px_1fr] bg-[#252526] border-b border-[#333] text-[12px] text-gray-700 dark:text-gray-300 font-medium font-sans">
                  <div className="p-1 px-2 border-r border-[#333]">Symbol</div>
                  <div className="p-1 px-2 border-r border-[#333] flex justify-between">Type <span className="text-[10px]">▲</span></div>
                  <div className="p-1 px-2 border-r border-[#333] text-right">Volume</div>
                  <div className="p-1 px-2 border-r border-[#333] text-right">Price</div>
                  <div className="p-1 px-2 border-r border-[#333] text-right">S / L</div>
                  <div className="p-1 px-2 border-r border-[#333] text-right">T / P</div>
                  <div className="p-1 px-2 border-r border-[#333] text-right">Price</div>
                  <div className="p-1 px-2 border-r border-[#333] text-right">Swap</div>
                  <div className="p-1 px-2 text-right">Profit</div>
                </div>

                {/* Rows */}
                <div className="flex flex-col text-[12px] font-sans">
                  {/* Row 1 */}
                  <div className="grid grid-cols-[120px_60px_60px_80px_80px_80px_80px_80px_1fr] border-b border-[#333] hover:bg-[#2d2d30] cursor-default">
                    <div className="p-1 px-2 border-r border-[#333] flex items-center gap-1.5"><MinusSquare size={10} className="text-blue-500" /> gold.future</div>
                    <div className="p-1 px-2 border-r border-[#333]">buy</div>
                    <div className="p-1 px-2 border-r border-[#333] text-right">1</div>
                    <div className="p-1 px-2 border-r border-[#333] text-right">4972.62</div>
                    <div className="p-1 px-2 border-r border-[#333] text-right">0.00</div>
                    <div className="p-1 px-2 border-r border-[#333] text-right">5300.47</div>
                    <div className="p-1 px-2 border-r border-[#333] text-right">4993.49</div>
                    <div className="p-1 px-2 border-r border-[#333] text-right">0.00</div>
                    <div className="p-1 px-2 text-right font-medium">2 087.00</div>
                  </div>
                  {/* Row 2 */}
                  <div className="grid grid-cols-[120px_60px_60px_80px_80px_80px_80px_80px_1fr] hover:bg-[#2d2d30] cursor-default">
                    <div className="p-1 px-2 border-r border-[#333] flex items-center gap-1.5"><MinusSquare size={10} className="text-blue-500" /> gold.future</div>
                    <div className="p-1 px-2 border-r border-[#333]">buy</div>
                    <div className="p-1 px-2 border-r border-[#333] text-right">1</div>
                    <div className="p-1 px-2 border-r border-[#333] text-right">4972.05</div>
                    <div className="p-1 px-2 border-r border-[#333] text-right">0.00</div>
                    <div className="p-1 px-2 border-r border-[#333] text-right">5304.19</div>
                    <div className="p-1 px-2 border-r border-[#333] text-right">4993.49</div>
                    <div className="p-1 px-2 border-r border-[#333] text-right">0.00</div>
                    <div className="p-1 px-2 text-right font-medium">2 144.00</div>
                  </div>
                </div>

                {/* Summary Row */}
                <div className="bg-[#3e3e42] mt-auto">
                  <div className="flex border-b border-[#333] text-[12px] font-bold font-sans">
                    <div className="flex-1 p-1 px-2 flex items-center gap-1.5 text-gray-900 dark:text-white">
                      <PlusSquare size={10} className="text-gray-700 dark:text-gray-300" />
                      Balance: {balanceVal} {currencyValue} <span className="font-normal opacity-80 mx-1">Equity:</span> {equityVal} <span className="font-normal opacity-80 mx-1">Margin:</span> {marginVal} <span className="font-normal opacity-80 mx-1">Free Margin:</span> {freeMarginVal}
                    </div>
                    <div className="w-[80px] p-1 px-2 text-right">0.00</div>
                    <div className="w-[100px] p-1 px-2 text-right font-medium">{activeData.profit !== undefined ? activeData.profit : '4 231.00'}</div>
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
                  <div className="p-1 px-2 flex items-center gap-1.5 text-gray-900 dark:text-white text-[12px] font-bold font-sans border-b border-[#333]">
                    <PlusSquare size={10} className="text-gray-700 dark:text-gray-300" />
                    Balance: {balanceVal} {currencyValue} <span className="font-normal opacity-80 mx-1">Equity:</span> {equityVal} <span className="font-normal opacity-80 mx-1">Margin:</span> {marginVal} <span className="font-normal opacity-80 mx-1">Free Margin:</span> {freeMarginVal}
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
              <div className="w-[280px] border border-gray-300 dark:border-gray-500 bg-[#222222] flex flex-col relative shrink-0">
                <div className="absolute top-1 left-2 bg-transparent text-gray-900 dark:text-white text-[12px] font-bold font-sans z-10">EURUSD</div>
                {/* Mock Chart Area */}
                <div className="flex-1 relative overflow-hidden flex items-end">

                  {/* Y Axis horizontal grid lines */}
                  <div className="absolute inset-0 flex flex-col pt-6 pb-20 justify-between">
                    {[1.14660, 1.14650, 1.14640, 1.14630].map(y => (
                      <div key={y} className="w-full flex items-center h-[1px]">
                        <div className="flex-1 border-b border-[#3b3b3b]"></div>
                        <span className="text-[10px] text-[#bbb] font-mono pl-1 w-12 text-right -mt-2.5 bg-[#222]">{y.toFixed(5)}</span>
                      </div>
                    ))}
                  </div>

                  {/* X Axis vertical grid lines */}
                  <div className="absolute inset-0 flex justify-between px-6 pt-0 pb-0">
                    <div className="w-[1px] h-full border-l border-dashed border-[#3b3b3b]"></div>
                    <div className="w-[1px] h-full border-l border-dashed border-[#3b3b3b]"></div>
                    <div className="w-[1px] h-full border-l border-dashed border-[#3b3b3b]"></div>
                    <div className="w-[1px] h-full border-l border-dashed border-[#3b3b3b]"></div>
                    <div className="w-[1px] h-full border-l border-dashed border-[#3b3b3b] mr-8"></div>
                  </div>

                  {/* Mock SVG lines for the chart - realistic jagged path */}
                  <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="w-[85%] h-[80%] absolute bottom-4 left-0 z-0 drop-shadow-sm">
                    {/* Red Line (Sell) */}
                    <polyline points="0,25 2,15 4,35 6,25 8,45 12,20 14,40 16,30 20,60 22,45 24,70 26,55 30,90 32,80 35,65 37,85 41,65 44,95 47,85 50,75 52,95 55,85" fill="none" stroke="#ef5350" strokeWidth="1.2" strokeLinejoin="miter" />
                    {/* Blue Line (Buy) */}
                    <polyline points="0,30 2,20 4,40 6,30 8,50 12,25 14,45 16,35 20,65 22,50 24,75 26,60 30,95 32,85 35,70 37,90 41,70 44,100 47,90 50,80 52,100 55,90" fill="none" stroke="#3d5afe" strokeWidth="1.2" strokeLinejoin="miter" />
                  </svg>

                  {/* Current prices on axis */}
                  <div className="absolute right-0 bottom-3 flex flex-col font-mono w-[50px] z-10 bg-[#222]">
                    <div className="bg-[#ef5350] text-[#fff] text-[10px] py-[1px] px-1 text-center font-medium leading-none tracking-tighter">1.14619</div>
                    <div className="bg-[#3d5afe] text-[#fff] text-[10px] py-[1px] px-1 text-center font-medium leading-none tracking-tighter mt-[1px]">1.14617</div>
                  </div>
                </div>
                {/* X Axis mock dates */}
                <div className="h-[22px] flex items-center justify-between px-1 text-[9px] text-[#bbb] font-mono tracking-tighter shrink-0 border-t border-gray-300 dark:border-gray-500 bg-[#1e1e1e]">
                  <span>2026.03.19</span>
                  <span>07:48</span>
                  <span>07:48</span>
                  <span>07:49</span>
                  <span>07:50</span>
                  <span>07:50:37</span>
                </div>
              </div>

              {/* Right Trade Form Area */}
              <div className="flex-1 flex flex-col pl-4 text-[13px] font-sans">

                <div className="grid grid-cols-[80px_1fr] items-center gap-2 mb-3">
                  <span className="text-gray-700 dark:text-gray-300 text-right">Symbol:</span>
                  <select className="h-[22px] bg-[#1a1b1f] border border-gray-300 dark:border-gray-600 rounded-sm px-1 text-gray-800 dark:text-gray-200 focus:outline-none w-full appearance-none">
                    <option>EURUSD, Euro vs US Dollar</option>
                  </select>
                </div>

                <div className="grid grid-cols-[80px_1fr] items-center gap-2 mb-6">
                  <span className="text-gray-700 dark:text-gray-300 text-right">Type:</span>
                  <select className="h-[22px] bg-[#1a1b1f] border border-gray-300 dark:border-gray-600 rounded-sm px-1 text-gray-800 dark:text-gray-200 focus:outline-none w-full appearance-none">
                    <option>Market Order</option>
                  </select>
                </div>

                <div className="grid grid-cols-[80px_170px_1fr] items-center gap-2 mb-3">
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

                <div className="grid grid-cols-[80px_170px] items-center gap-2 mb-3">
                  <span className="text-gray-700 dark:text-gray-300 text-right">Fill Policy:</span>
                  <select className="h-[22px] bg-[#1a1b1f] border border-gray-300 dark:border-gray-600 rounded-sm px-1 text-gray-800 dark:text-gray-200 focus:outline-none flex-1 appearance-none">
                    <option>Fill or Kill</option>
                  </select>
                </div>

                <div className="grid grid-cols-[80px_170px_1fr] items-center gap-2 mb-3">
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
                      <input type="checkbox" defaultChecked className="accent-[#3794ff] rounded-sm bg-[#1a1b1f] border-gray-300 dark:border-gray-600 h-3.5 w-3.5" /> Auto
                    </label>
                  </div>
                </div>

                <div className="grid grid-cols-[80px_170px_80px_1fr] items-center gap-x-2 gap-y-3 mb-6">
                  <span className="text-gray-700 dark:text-gray-300 text-right">Stop Loss:</span>
                  <div className="flex">
                    <input type="text" defaultValue="0.00000" className="h-[22px] w-[120px] bg-[#1a1b1f] border border-gray-300 dark:border-gray-600 rounded-sm px-2 text-gray-800 dark:text-gray-200 focus:outline-none text-right shadow-[inset_0_1px_2px_rgba(0,0,0,0.5)]" />
                    <div className="flex flex-col ml-1 justify-between h-[22px]">
                      <button className="h-[10px] w-4 bg-[#2d2d30] border border-gray-300 dark:border-gray-600 rounded-[1px] flex items-center justify-center hover:bg-[#3e3e42]"><span className="text-[8px] leading-none mb-0.5" style={{ fontFamily: 'system-ui', transform: 'scaleX(1.5)' }}>▲</span></button>
                      <button className="h-[10px] w-4 bg-[#2d2d30] border border-gray-300 dark:border-gray-600 rounded-[1px] flex items-center justify-center hover:bg-[#3e3e42]"><span className="text-[8px] leading-none mt-0.5" style={{ fontFamily: 'system-ui', transform: 'scaleX(1.5)' }}>▼</span></button>
                    </div>
                  </div>

                  <span className="text-gray-700 dark:text-gray-300 text-right">Take Profit:</span>
                  <div className="flex">
                    <input type="text" defaultValue="0.00000" className="h-[22px] w-[120px] bg-[#1a1b1f] border border-gray-300 dark:border-gray-600 rounded-sm px-2 text-gray-800 dark:text-gray-200 focus:outline-none text-right shadow-[inset_0_1px_2px_rgba(0,0,0,0.5)]" />
                    <div className="flex flex-col ml-1 justify-between h-[22px]">
                      <button className="h-[10px] w-4 bg-[#2d2d30] border border-gray-300 dark:border-gray-600 rounded-[1px] flex items-center justify-center hover:bg-[#3e3e42]"><span className="text-[8px] leading-none mb-0.5" style={{ fontFamily: 'system-ui', transform: 'scaleX(1.5)' }}>▲</span></button>
                      <button className="h-[10px] w-4 bg-[#2d2d30] border border-gray-300 dark:border-gray-600 rounded-[1px] flex items-center justify-center hover:bg-[#3e3e42]"><span className="text-[8px] leading-none mt-0.5" style={{ fontFamily: 'system-ui', transform: 'scaleX(1.5)' }}>▼</span></button>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-[80px_1fr] items-center gap-2 mb-6">
                  <span className="text-gray-700 dark:text-gray-300 text-right">Comment:</span>
                  <select className="h-[22px] bg-[#1a1b1f] border border-gray-300 dark:border-gray-600 rounded-sm px-1 text-gray-800 dark:text-gray-200 focus:outline-none w-full appearance-none"></select>
                </div>

                <div className="flex justify-center items-center gap-3 py-4 text-[26px] font-sans tracking-tight">
                  <span className="text-[#ef5350]">1.14617</span>
                  <span className="text-gray-700 dark:text-gray-300 text-2xl font-light">/</span>
                  <span className="text-[#64b5f6]">1.14619</span>
                </div>

                <div className="grid grid-cols-2 gap-5 px-3 mb-2">
                  <button className="h-[30px] rounded-[3px] bg-gradient-to-b from-[#8c3232] to-[#551d1d] hover:from-[#a03939] hover:to-[#6b2424] border-t border-[#c65858] text-gray-900 dark:text-white text-[13px] font-medium shadow-[0_2px_4px_rgba(0,0,0,0.5)]">
                    Sell at 1.14617
                  </button>
                  <button className="h-[30px] rounded-[3px] bg-gradient-to-b from-[#3a4980] to-[#1a2345] hover:from-[#46589a] hover:to-[#263262] border-t border-[#657bc8] text-gray-900 dark:text-white text-[13px] font-medium shadow-[0_2px_4px_rgba(0,0,0,0.5)]">
                    Buy at 1.14619
                  </button>
                </div>

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

      </div>
    </div>
  );
};

export default AccountDetailsModal;
