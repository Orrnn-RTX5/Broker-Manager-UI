import { getRuntimeConfigValue } from '../config/backendTarget.js';
import { buildReportsSummaryEndpoint } from '../config/managerApiContract.js';

export const requestReportsSummary = async (get, { date, ...options } = {}) => {
  const enabled = getRuntimeConfigValue(['REPORTS_SUMMARY_ENABLED', 'VITE_REPORTS_SUMMARY_ENABLED'], 'true');
  if (enabled.toLowerCase() === 'false') {
    const error = new Error('Daily report summary is unavailable on this backend.');
    error.code = 'REPORTS_SUMMARY_UNAVAILABLE';
    throw error;
  }
  return get(buildReportsSummaryEndpoint(date), options);
};
