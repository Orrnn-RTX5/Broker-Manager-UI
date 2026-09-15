import { chunkSymbolNames } from '../utils/symbolParams.js';

const nameOf = row => String(typeof row === 'string' ? row : row?.symbol || row?.Symbol || row?.name || '').trim();

async function runPool(items, request, concurrency = 4) {
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (next < items.length) await request(items[next++]);
  }));
}

// Publish completed batches independently. A slow category or the last symbol
// batch must not hide data that the server has already returned.
export async function loadSymbolManagement({ getNames, getCategories, getParams, getCategorySymbols, onProgress, cachedSymbols = [] }) {
  const rows = new Map();
  const core = new Map();
  const metadata = new Map();
  const cached = new Map(cachedSymbols.map(row => [nameOf(row), row]));
  let categories = [];
  let metadataDone = false;
  let failed = false;
  let metadataFailed = false;
  let namesLoaded = false;

  const snapshot = (finished = false) => ({
    symbols: [...rows.keys()].sort((a, b) => a.localeCompare(b)).map(symbol => {
      const params = core.get(symbol);
      const extra = metadata.get(symbol);
      const ready = Boolean(params && (extra || (metadataDone && !metadataFailed)));
      // Category records distinguish derived instruments. Resolve their type
      // immediately, without waiting for unrelated parameter batches.
      const symbolType = extra ? (extra.symbolType || 'base')
        : params?.symbolType || rows.get(symbol)?.symbolType
          || (metadataDone && !metadataFailed ? 'base' : cached.get(symbol)?.symbolType);
      return {
        ...cached.get(symbol), ...rows.get(symbol), ...params, ...extra, symbol,
        ...(symbolType ? { symbolType } : {}),
        __managementPartial: !ready,
        __managementLoading: !finished,
      };
    }),
    categories,
    partial: !finished,
    error: finished && failed ? 'Some symbol details could not be loaded. Retry to fetch the missing data.' : '',
  });
  const publish = () => { if (namesLoaded) onProgress?.(snapshot()); };

  const metadataTask = (async () => {
    try {
      categories = await getCategories();
      if (!Array.isArray(categories)) throw new Error('Invalid category response');
      publish();
      await runPool(categories, async category => {
        try {
          const data = await getCategorySymbols(category.name);
          if (!Array.isArray(data)) throw new Error('Invalid category symbols');
          data.forEach(row => {
            const symbol = nameOf(row);
            if (symbol) metadata.set(symbol, { ...row, category: category.name });
          });
          publish();
        } catch { failed = true; metadataFailed = true; }
      });
    } catch { categories = []; failed = true; metadataFailed = true; }
    metadataDone = true;
    publish();
  })();

  let namesError;
  try {
    const names = await getNames();
    if (!Array.isArray(names)) throw new Error('Invalid symbol list');
    names.forEach(row => {
      const symbol = nameOf(row);
      if (symbol) rows.set(symbol, typeof row === 'object' ? row : { symbol });
    });
    namesLoaded = true;
    publish();
    // Match the table's alphabetical order so its first rows are requested first.
    const batches = chunkSymbolNames([...rows.keys()].sort((a, b) => a.localeCompare(b)));
    await runPool(batches, async batch => {
      try {
        const data = await getParams(batch);
        if (!Array.isArray(data)) throw new Error('Invalid symbol parameters');
        data.forEach(row => {
          const symbol = nameOf(row);
          if (symbol) core.set(symbol, row);
        });
        if (batch.some(symbol => !core.has(symbol))) failed = true;
        publish();
      } catch { failed = true; }
    });
  } catch (error) { namesError = error; }
  await metadataTask;
  if (namesError) throw namesError;
  const result = snapshot(true);
  onProgress?.(result);
  return result;
}
