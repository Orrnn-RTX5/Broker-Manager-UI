const fs=require('node:fs');
const file='src/services/api.js';
let text=fs.readFileSync(file,'utf8');
text="import { loadSymbolManagement } from './symbolManagementLoader.js';\n"+text;
const start=text.indexOf('const symbolName = (entry) => String(');
const end=text.indexOf('\nexport const symbolManagementList =',start);
if(start<0||end<0)throw Error('Loader boundaries not found');
text=text.slice(0,start)+`const fetchSymbolManagementData = async () => {
  // Bound stalled requests while completed rows remain available for review.
  const signal = AbortSignal.timeout(15_000);
  const data = await loadSymbolManagement({
    getNames: () => apiClient.get('/SymbolsList', { signal }),
    getCategories: () => apiClient.get('/SymbolCategoryList', { signal }),
    getParams: async batch => {
      const response = await apiClient.get('/SymbolsParams?' + arrayQuery('symbols[]', batch), { signal });
      return Array.isArray(response) ? response : getRecords(response, 'symbols');
    },
    getCategorySymbols: category => apiClient.get('/SymbolsByCategory?' + query({ category }), { signal }),
    onProgress: notifySymbolManagementProgress,
    cachedSymbols: peekSymbolManagementData()?.symbols || [],
  });
  // Incomplete responses must not become a fresh, complete cache entry.
  if (!data.error && data.symbols.every(row => !row.__managementPartial)) writeStoredSymbolManagementData(data);
  return data;
};
`+text.slice(end);
fs.writeFileSync(file,text);
