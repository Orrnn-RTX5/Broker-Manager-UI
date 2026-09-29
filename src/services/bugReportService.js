import { fetchManagerApi } from './managerFetch';

// Bug reporting from the Manager UI.
//
// The report goes to the broker's manager backend, which forwards it to the
// RTX5 control plane. Nothing about a bug report is stored in the broker's own
// database, and the browser never talks to object storage directly.
//
// Identity is deliberately not sent from here: the backend derives the broker,
// the login and whether this is a manager or an admin session from the session
// itself, so nothing this file sends could impersonate another reporter.

const OPTIONS_ENDPOINT = '/api/v1/manager/bug-reports/options';
const SUBMIT_ENDPOINT = '/api/v1/manager/bug-reports';

export const MAX_ATTACHMENTS = 5;
export const MAX_FILE_BYTES = 8 * 1024 * 1024;

// Accepted by the backend, which re-checks each file's magic bytes rather than
// trusting what the browser labels it. SVG is absent on purpose: it can carry
// script, and a stored one would later be shown to a reviewer.
export const ACCEPTED_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'text/plain'];

export const CATEGORY_LABELS = {
  trading: 'Trading',
  order: 'Orders',
  position: 'Positions',
  market_data: 'Market data',
  authentication: 'Authentication',
  ui_ux: 'UI / UX',
  performance: 'Performance',
  connection: 'Connection',
  account: 'Account',
  configuration: 'Configuration',
  other: 'Other',
};

export const SEVERITY_LABELS = {
  low: 'Low — cosmetic or minor',
  medium: 'Medium — works, but wrongly',
  high: 'High — important function broken',
  critical: 'Critical — trading or account integrity affected',
};

const readJson = async (response) => {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { error: text };
  }
};

export const fetchBugReportOptions = async () => {
  const response = await fetchManagerApi(OPTIONS_ENDPOINT, { method: 'GET' });
  const data = await readJson(response);
  if (!response.ok) {
    throw new Error(data?.error || 'Could not load the bug report form');
  }
  return {
    categories: data.categories || Object.keys(CATEGORY_LABELS),
    severities: data.severities || Object.keys(SEVERITY_LABELS),
    enabled: data.enabled !== false,
    maxAttachments: data.max_attachments || MAX_ATTACHMENTS,
    maxFileBytes: data.max_file_bytes || MAX_FILE_BYTES,
  };
};

// Collected automatically so the reporter does not have to type what the
// application already knows. Deliberately narrow: this is everything sent, and
// it never touches storage, tokens or cookies.
export const collectEnvironment = () => {
  const environment = {
    app_version: (import.meta.env && import.meta.env.VITE_APP_VERSION) || '',
    route: typeof window !== 'undefined' ? window.location?.hash || window.location?.pathname || '' : '',
    os: typeof navigator !== 'undefined' ? navigator.platform || '' : '',
    browser: typeof navigator !== 'undefined' ? navigator.userAgent || '' : '',
    screen_resolution: typeof window !== 'undefined' && window.screen
      ? `${window.screen.width}x${window.screen.height}`
      : '',
    locale: typeof navigator !== 'undefined' ? navigator.language || '' : '',
    timezone: '',
  };
  try {
    environment.timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
  } catch {
    environment.timezone = '';
  }
  return environment;
};

export const validateAttachment = (file) => {
  if (!file) return 'No file selected';
  if (file.size > MAX_FILE_BYTES) {
    return `${file.name || 'That file'} is larger than ${MAX_FILE_BYTES / (1024 * 1024)} MB`;
  }
  // A best-effort client check only. The backend decides from the file's own
  // leading bytes, so a renamed executable is rejected there regardless.
  if (file.type && !ACCEPTED_TYPES.includes(file.type)) {
    return `${file.name || 'That file'} is not an accepted type (PNG, JPEG, WEBP or plain text)`;
  }
  return null;
};

// Convert attached screenshots before upload and keep the original if WebP
// is unsupported or larger. Text logs and existing WebP files are untouched.
const compressScreenshot = async (file) => {
  if (!['image/png', 'image/jpeg'].includes(file.type)) return file;
  try {
    const bitmap = await createImageBitmap(file);
    try {
      const canvas = document.createElement('canvas');
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const context = canvas.getContext('2d');
      if (!context) return file;
      context.drawImage(bitmap, 0, 0);
      for (const quality of [0.82, 0.68]) {
        const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/webp', quality));
        if (blob?.type === 'image/webp' && blob.size < file.size) {
          return new File([blob], `${file.name.replace(/\.[^.]+$/, '')}.webp`, {
            type: 'image/webp',
            lastModified: file.lastModified,
          });
        }
      }
    } finally {
      bitmap.close();
    }
  } catch {
    // A corrupt or unsupported image can still be submitted in its original form.
  }
  return file;
};

export const submitBugReport = async ({ form, attachments = [], signal }) => {
  const payload = {
    title: form.title,
    description: form.description,
    category: form.category,
    severity: form.severity,
    steps_to_reproduce: (form.steps || '')
      .split('\n')
      .map((line) => line.replace(/^\s*\d+[).]?\s*/, '').trim())
      .filter(Boolean),
    expected_behavior: form.expected || '',
    actual_behavior: form.actual || '',
    occurred_at: Math.floor(Date.now() / 1000),
    page: form.page || '',
    ...collectEnvironment(),
  };

  const body = new FormData();
  body.append('payload', JSON.stringify(payload));
  const uploadFiles = await Promise.all(attachments.map(compressScreenshot));
  uploadFiles.forEach((file) => body.append('attachments', file, file.name));

  // No Content-Type header: the browser must set the multipart boundary.
  const response = await fetchManagerApi(SUBMIT_ENDPOINT, { method: 'POST', body, signal });
  const data = await readJson(response);

  if (!response.ok) {
    if (response.status === 503) {
      throw new Error('Bug reporting is not configured on this server yet. Please contact your administrator.');
    }
    if (response.status === 502) {
      throw new Error('The RTX5 support service could not be reached. Please try again in a moment.');
    }
    throw new Error(data?.error || 'The report could not be submitted');
  }
  return data;
};
