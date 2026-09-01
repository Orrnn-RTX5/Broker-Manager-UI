export const shouldShowInGlobalLoader = (query) => (
  query.meta?.suppressGlobalLoader !== true
  && (typeof query.getObserversCount !== 'function' || query.getObserversCount() > 0)
);
