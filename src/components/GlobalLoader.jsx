import React from 'react';
import { useIsFetching } from '@tanstack/react-query';

const GlobalLoader = () => {
  const isFetching = useIsFetching();

  if (isFetching === 0) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-[10000] h-1 bg-transparent overflow-hidden pointer-events-none">
      <div 
        className="h-full bg-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.8)] animate-pulse"
        style={{
          width: '100%',
          animation: 'shimmer 1.5s infinite linear',
          backgroundImage: 'linear-gradient(90deg, transparent 0%, #3b82f6 50%, transparent 100%)',
          backgroundSize: '200% 100%'
        }}
      />
      
      {/* Small floating spinner in corner as well for better feedback */}
      <div className="fixed bottom-6 left-6 z-[10000] bg-[#1a1c23]/80 backdrop-blur-md px-3 py-1.5 rounded-full border border-white/10 flex items-center gap-2 shadow-2xl">
        <div className="w-3 h-3 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        <span className="text-[10px] font-medium text-gray-400 uppercase tracking-wider">Syncing Data</span>
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      `}} />
    </div>
  );
};

export default GlobalLoader;
