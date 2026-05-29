import { buildManagerApiUrl } from '../config/endpoints';

export const fetchManagerApi = (endpoint, options) =>
  fetch(buildManagerApiUrl(endpoint), options);
