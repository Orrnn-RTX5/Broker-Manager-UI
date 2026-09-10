export const SYMBOL_TABLE_ROW_HEIGHT = 32;
export const getSymbolTableWindow = (count, scrollTop = 0, height = 200) => {
  const visible = Math.ceil(Math.max(1, height) / SYMBOL_TABLE_ROW_HEIGHT);
  const start = Math.min(Math.max(0, count - visible), Math.max(0, Math.floor(scrollTop / SYMBOL_TABLE_ROW_HEIGHT) - 4));
  const end = Math.min(count, start + visible + 8);
  return { start, end, top: start * SYMBOL_TABLE_ROW_HEIGHT, bottom: (count - end) * SYMBOL_TABLE_ROW_HEIGHT };
};
