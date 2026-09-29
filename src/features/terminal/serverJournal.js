import apiClient from '../../services/apiClient.js';
import { buildServerJournalQuery } from './serverJournalCore.js';

export * from './serverJournalCore.js';

export const fetchServerJournal = (options) =>
  apiClient.get(`/api/v1/manager/journal?${buildServerJournalQuery(options)}`);
