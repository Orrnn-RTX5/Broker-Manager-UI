import apiClient from '../../services/apiClient';
import { normalizeExposure } from './exposureModel.js';

export async function fetchExposure({ signal } = {}) {
  const payload = await apiClient.get('/api/v1/exposure', { signal, maxResponseBytes: 4 * 1024 * 1024 });
  return normalizeExposure(payload);
}
