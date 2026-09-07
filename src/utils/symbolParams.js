export const SYMBOL_PARAMS_BATCH_SIZE = 60;

const getSymbolName = (entry) => String(
  typeof entry === 'string' ? entry : entry?.symbol || entry?.Symbol || entry?.name || ''
).trim();

export const chunkSymbolNames = (symbols, batchSize = SYMBOL_PARAMS_BATCH_SIZE) => {
  const names = [...new Set((Array.isArray(symbols) ? symbols : [])
    .map(getSymbolName)
    .filter(Boolean))];
  const size = Math.max(1, Number(batchSize) || SYMBOL_PARAMS_BATCH_SIZE);
  const chunks = [];
  for (let index = 0; index < names.length; index += size) {
    chunks.push(names.slice(index, index + size));
  }
  return chunks;
};
