import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useGroupList } from '../../hooks/useGroupList';
import { ArrowLeft, Users2, Activity, Settings, Database, Clock, BarChart2, ArrowRightLeft, Loader, AlertTriangle } from 'lucide-react';

const GroupDetailsPage = () => {
  const { groupName } = useParams();
  const navigate = useNavigate();
  const { groups, loading, error } = useGroupList();

  const [stats, setStats] = useState(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [statsError, setStatsError] = useState(null);

  const [showMoveInput, setShowMoveInput] = useState(false);
  const [toGroupInput, setToGroupInput] = useState('');
  const [isMoving, setIsMoving] = useState(false);

  useEffect(() => {
    if (!groupName) return;
    const fetchStats = async () => {
      setStatsLoading(true);
      setStatsError(null);
      const token = localStorage.getItem('authToken');
      if (!token) { setStatsError('Not connected'); setStatsLoading(false); return; }
      try {
        const res = await fetch(`/api/manager/GroupStats?id=${token}&group=${groupName}`, {
          headers: { accept: 'application/json' }
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        setStats(await res.json());
      } catch (err) {
        setStatsError(err.message);
      } finally {
        setStatsLoading(false);
      }
    };
    fetchStats();
  }, [groupName]);

  const handleMoveAccounts = async () => {
    if (!toGroupInput || !groupName) return;
    setIsMoving(true);
    const token = localStorage.getItem('authToken');
    try {
      const res = await fetch(`/api/manager/GroupMoveAccounts?id=${token}&from_group=${groupName}&to_group=${toGroupInput}`, {
        headers: { accept: 'application/json' }
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await res.json();
      alert(`Successfully moved accounts from ${groupName} to ${toGroupInput}`);
      setShowMoveInput(false);
      setToGroupInput('');
    } catch (err) {
      alert('Error moving accounts: ' + err.message);
    } finally {
      setIsMoving(false);
    }
  };

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center gap-2 h-full w-full" style={{ color: 'var(--muted)' }}>
        <Loader size={16} className="animate-spin" style={{ color: 'var(--accent)' }} />
        Loading group…
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8 flex flex-col items-center justify-center gap-2 h-full w-full">
        <span className="text-sm flex items-center gap-2" style={{ color: 'var(--danger-text)' }}>
          <AlertTriangle size={14} /> {error}
        </span>
        <button className="ui-btn ui-btn-secondary ui-btn-sm" onClick={() => navigate('/groups')}>Return to list</button>
      </div>
    );
  }

  const group = groups.find(g => g.name === groupName);

  if (!group) {
    return (
      <div className="p-8 flex flex-col items-center justify-center gap-2 h-full w-full">
        <span className="text-sm" style={{ color: 'var(--muted)' }}>Group "{groupName}" not found.</span>
        <button className="ui-btn ui-btn-secondary ui-btn-sm" onClick={() => navigate('/groups')}>Return to list</button>
      </div>
    );
  }

  const DetailRow = ({ label, value, type = 'text', highlight = false }) => {
    let display = value;
    if (type === 'boolean') display = value ? 'Enabled' : 'Disabled';
    else if (type === 'array') display = value && value.length > 0 ? value.join(', ') : 'None';
    else if (type === 'date') display = new Date(value * 1000).toLocaleString();

    return (
      <div className="flex items-center px-3 py-1.5 rounded transition-colors"
        style={{ background: highlight ? 'var(--accent-soft)' : 'transparent' }}
        onMouseOver={e => { if (!highlight) e.currentTarget.style.background = 'var(--surface-2)'; }}
        onMouseOut={e => { if (!highlight) e.currentTarget.style.background = 'transparent'; }}
      >
        <span className="text-xs w-44 shrink-0" style={{ color: 'var(--text-3)' }}>{label}</span>
        <span className="text-xs font-medium truncate" style={{ color: highlight ? 'var(--accent-text)' : 'var(--text)' }}>
          {display ?? '—'}
        </span>
      </div>
    );
  };

  const Section = ({ title, icon: Icon, children, extra }) => (
    <div className="ui-card flex flex-col overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 shrink-0"
        style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface-2)' }}>
        <div className="flex items-center gap-2">
          {Icon && <Icon size={13} style={{ color: 'var(--accent)' }} />}
          <span className="text-xs font-semibold tracking-wide uppercase" style={{ color: 'var(--text-2)' }}>{title}</span>
        </div>
        {extra}
      </div>
      <div className="p-1.5 flex flex-col gap-0.5">
        {children}
      </div>
    </div>
  );

  return (
    <div className="p-5 w-full h-full flex flex-col gap-4 overflow-y-auto" style={{ background: 'var(--bg)' }}>

      {/* Header */}
      <div className="flex items-center gap-3">
        <button className="ui-btn ui-btn-ghost ui-btn-sm p-1.5" onClick={() => navigate('/groups')}>
          <ArrowLeft size={15} />
        </button>
        <Users2 size={17} style={{ color: 'var(--accent)' }} />
        <div>
          <h1 className="text-lg font-semibold" style={{ color: 'var(--text)' }}>Group: {group.name}</h1>
          <p className="text-xs" style={{ color: 'var(--text-3)' }}>Group configuration &amp; live statistics</p>
        </div>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3 max-w-5xl">

        <Section title="Core Configuration" icon={Settings}>
          <DetailRow label="Description"  value={group.description} />
          <DetailRow label="Currency"     value={group.currency}    highlight />
          <DetailRow label="Account Type" value={group.accountType} />
          <DetailRow label="Demo Group"   value={group.demo}        type="boolean" />
          <DetailRow label="Status"       value={group.enabled}     type="boolean" />
        </Section>

        <Section title="Trading Limits & Finances" icon={Activity}>
          <DetailRow label="Leverage"        value={`1:${group.leverage}`}       highlight />
          <DetailRow label="Margin Call Level" value={`${group.marginCallLevel}%`} />
          <DetailRow label="Stop Out Level"  value={`${group.stopOutLevel}%`} />
          <DetailRow label="Commission Rate" value={group.commissionRate} />
          <DetailRow label="Commission Type" value={group.commissionType} />
        </Section>

        <Section title="Execution Parameters" icon={Database}>
          <DetailRow label="Trading Allowed"            value={group.tradeAllowed}              type="boolean" />
          <DetailRow label="Execution Mode"             value={group.executionMode} />
          <DetailRow label="Book Type"                  value={group.bookType}                  highlight />
          <DetailRow label="Routing Mode"               value={
            group.routingMode === 'a_book' ? 'A-Book' : 
            group.routingMode === 'hybrid' ? 'Hybrid' : 
            'B-Book'
          } highlight />
          <DetailRow label="Spread Markup"              value={group.spreadMarkup} />
          <DetailRow label="Lot Divisor"                value={group.lotDivisor} />
          <DetailRow label="Max Lot Per Trade"          value={group.maxLotPerTrade} />
          <DetailRow label="Max Total Lots"             value={group.maxTotalLots} />
          <DetailRow label="Negative Balance Protection" value={group.negativeBalanceProtection} type="boolean" />
        </Section>

        <Section title="Symbols & History" icon={Clock}>
          <DetailRow label="Allowed Symbols" value={group.symbolsAllowed} type="array" />
          <DetailRow label="Blocked Symbols" value={group.symbolsBlocked} type="array" />
          <DetailRow label="Created At"      value={group.createdAt}      type="date" />
          <DetailRow label="Last Updated"    value={group.updatedAt}      type="date" />
        </Section>

        <Section
          title="Group Statistics"
          icon={BarChart2}
          extra={
            <button
              className="ui-btn ui-btn-ghost ui-btn-sm p-1"
              title="Move accounts to another group"
              onClick={() => setShowMoveInput(v => !v)}
            >
              <ArrowRightLeft size={13} />
            </button>
          }
        >
          {showMoveInput && (
            <div className="mx-1.5 mb-2 p-2 rounded flex flex-col gap-2"
              style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
              <span className="text-[10px] uppercase tracking-widest" style={{ color: 'var(--text-3)' }}>Move accounts to:</span>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  placeholder="Target group name…"
                  value={toGroupInput}
                  onChange={e => setToGroupInput(e.target.value)}
                  className="ui-input ui-input-sm flex-1"
                />
                <button
                  className="ui-btn ui-btn-primary ui-btn-sm"
                  onClick={handleMoveAccounts}
                  disabled={isMoving || !toGroupInput}
                >
                  {isMoving ? <Loader size={11} className="animate-spin" /> : 'Move'}
                </button>
              </div>
            </div>
          )}

          {statsLoading ? (
            <div className="flex items-center gap-2 px-3 py-4 text-xs" style={{ color: 'var(--muted)' }}>
              <Loader size={13} className="animate-spin" style={{ color: 'var(--accent)' }} /> Loading stats…
            </div>
          ) : statsError ? (
            <div className="flex items-center gap-2 px-3 py-3 text-xs" style={{ color: 'var(--danger-text)' }}>
              <AlertTriangle size={13} /> {statsError}
            </div>
          ) : stats ? (
            <>
              <DetailRow label="Account Count"    value={stats.accountCount} />
              <DetailRow label="Active Positions" value={stats.activePositions} />
              <DetailRow label="Total Volume"     value={stats.totalVolume} />
              <DetailRow label="Total Equity"     value={stats.totalEquity  != null ? Number(stats.totalEquity).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : undefined} highlight />
              <DetailRow label="Total Balance"    value={stats.totalBalance != null ? Number(stats.totalBalance).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : undefined} highlight />
            </>
          ) : (
            <div className="px-3 py-4 text-xs" style={{ color: 'var(--muted)' }}>No statistics available.</div>
          )}
        </Section>

      </div>
    </div>
  );
};

export default GroupDetailsPage;
