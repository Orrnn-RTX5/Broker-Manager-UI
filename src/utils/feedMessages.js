const parseJsonLines = (raw = '') => String(raw || '')
  .trim()
  .split('\n')
  .map((line) => line.trim())
  .filter(Boolean)
  .map((line) => JSON.parse(line));

const isTick = (value) => (
  value &&
  typeof value === 'object' &&
  value.symbol &&
  (value.bid !== undefined || value.ask !== undefined)
);

const getArray = (value) => (Array.isArray(value) ? value : []);

export const extractFeedTicks = (raw = '') => {
  const payloads = parseJsonLines(raw);
  const ticks = [];

  payloads.forEach((payload) => {
    if (isTick(payload)) {
      ticks.push(payload);
      return;
    }

    [
      ...getArray(payload?.ticks),
      ...getArray(payload?.data),
      ...getArray(payload?.quotes),
      ...getArray(payload?.symbols),
    ].forEach((entry) => {
      if (isTick(entry)) ticks.push(entry);
    });
  });

  return ticks;
};
