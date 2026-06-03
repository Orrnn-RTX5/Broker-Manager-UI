const providers = [
  { id: 1, name: 'FINPRIME GROUP', type: 'text', color: 'text-blue-900', sub: 'GROUP' },
  { id: 2, name: 'Exclusive Markets', type: 'text', color: 'text-cyan-600', icon: '✦' },
  { id: 3, name: 'ALCHEMY', type: 'text', color: 'text-yellow-600', icon: 'A' },
  { id: 4, name: 'FxGrow', type: 'text', color: 'text-red-600', bg: 'bg-white' },
  { id: 5, name: 'FxPro', type: 'text', color: 'text-white', bg: 'bg-red-600' },
  { id: 6, name: 'MiltonGlobal', type: 'text', color: 'text-red-500', icon: 'M' },

  { id: 7, name: 'DBG', type: 'text', color: 'text-white', bg: 'bg-black', sub: 'MARKETS' },
  { id: 8, name: 'LP PRIME', type: 'text', color: 'text-blue-400', bg: 'bg-slate-900' },
  { id: 9, name: 'exinity', type: 'text', color: 'text-blue-500', sub: 'CONNECT' },
  { id: 10, name: 'V', type: 'text', color: 'text-yellow-600', icon: 'V', huge: true, bg: 'bg-slate-900' },
  { id: 11, name: 'Finalto', type: 'text', color: 'text-white', bg: 'bg-slate-800' },
  { id: 12, name: 'J2T', type: 'text', color: 'text-blue-400', bg: 'bg-blue-900', huge: true },

  { id: 13, name: 'equiti', type: 'text', color: 'text-teal-500', bg: 'bg-slate-900' },
  { id: 14, name: 'BitDelta', type: 'text', color: 'text-gray-700' },
  { id: 15, name: 'CMS', type: 'text', color: 'text-black', sub: 'FINANCIAL' },
  { id: 16, name: 'FINPRIME', type: 'text', color: 'text-blue-900', sub: 'GROUP' },
  { id: 17, name: 'V (Light)', type: 'text', color: 'text-teal-600', icon: 'V', huge: true },
  { id: 18, name: 'Star', type: 'text', color: 'text-orange-500', icon: '★', bg: 'bg-black' },
];

const LiquidityProviders = () => {
  return (
    <div className="flex flex-col gap-4">
      {/* Logos Grid */}
      <div className="flex flex-wrap gap-2">
        {providers.map((p) => (
          <div
            key={p.id}
            className={`w-[60px] h-[60px] sm:w-[72px] sm:h-[72px] flex flex-col items-center justify-center border border-gray-200 dark:border-[#333333] rounded-sm shadow-sm transition-colors
              ${p.bg ? p.bg : 'bg-white dark:bg-[#1e1e1e]'} 
              ${p.color}
            `}
          >
            {p.icon && p.huge ? (
              <span className="text-3xl font-bold">{p.icon}</span>
            ) : p.icon ? (
              <span className="text-lg font-bold">{p.icon}</span>
            ) : null}

            {!p.huge && <span className="text-[9px] font-bold text-center leading-tight">
              {p.name.toUpperCase()}
            </span>}

            {p.sub && <span className="text-[6px] tracking-wide text-gray-500 mt-0.5">{p.sub}</span>}
          </div>
        ))}
      </div>

      {/* Description below logos */}
      <div className="mt-2 max-w-lg">
        <h3 className="font-semibold text-[13px] text-gray-800 dark:text-gray-200 mb-1">Liquidity Providers integrated into Ultency</h3>
        <p className="text-[11px] text-gray-600 dark:text-gray-400 leading-snug">
          Connect top-tier liquidity in a few clicks. The system is fully integrated with RTX5, no external gateways are needed. Try it now with a 90-day free access period.
        </p>
      </div>
    </div>
  );
};

export default LiquidityProviders;
