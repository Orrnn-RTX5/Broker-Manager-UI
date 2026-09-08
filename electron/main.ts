import { app, BrowserWindow, ipcMain, Menu, protocol, session, shell } from 'electron';
import type { Input, IpcMainInvokeEvent } from 'electron';
import log from 'electron-log';
import { autoUpdater } from 'electron-updater';
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const APP_ID = 'com.rtx5.brokermanager';
const APP_PROTOCOL = 'rtx5-manager';
const APP_HOST = 'app';
const APP_ORIGIN = `${APP_PROTOCOL}://${APP_HOST}`;
const DEFAULT_DEV_SERVER_URL = 'http://localhost:5180';
const WINDOW_STATE_CHANNEL = 'rtx5-window:state';
const HTTP_REQUEST_CHANNEL = 'rtx5-http:request';
const UPDATE_CHECK_CHANNEL = 'rtx5-update:check';
const MAX_DESKTOP_HTTP_BODY_BYTES = 1024 * 1024;
const ALLOWED_DESKTOP_HTTP_METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']);
const BLOCKED_DESKTOP_HTTP_HEADERS = new Set([
  'connection',
  'content-length',
  'cookie',
  'host',
  'origin',
  'referer',
  'sec-fetch-mode',
  'sec-fetch-site',
  'transfer-encoding',
]);
const PUBLIC_ASSET_FILES = new Set([
  'brand-logo.png',
  'login-trading-hero.png',
  'logo V2.ico',
  'rtx5-logo.png',
  'runtime-config.js',
]);
let mainWindow: BrowserWindow | null = null;
let autoUpdatesConfigured = false;
let updateCheckInFlight: Promise<DesktopUpdateCheckResponse> | null = null;

type DesktopHttpRequest = {
  url?: unknown;
  method?: unknown;
  headers?: unknown;
  body?: unknown;
};

type DesktopHttpResponse = {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: string;
};

type DesktopUpdateCheckStatus = 'disabled' | 'not-available' | 'downloaded' | 'error';

type DesktopUpdateCheckResponse = {
  status: DesktopUpdateCheckStatus;
  message: string;
  currentVersion: string;
  version?: string;
};

const MIME_TYPES: Record<string, string> = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
};

log.transports.file.level = 'info';

process.on('uncaughtException', (error) => {
  log.error('Uncaught desktop exception', error);
});

process.on('unhandledRejection', (reason) => {
  log.error('Unhandled desktop rejection', reason);
});

protocol.registerSchemesAsPrivileged([
  {
    scheme: APP_PROTOCOL,
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
    },
  },
]);

const getArgValue = (name: string): string | null => {
  const prefix = `--${name}=`;
  const match = process.argv.find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length) : null;
};

const hasArg = (name: string): boolean => process.argv.includes(`--${name}`);

const normalizeDevServerUrl = (rawUrl: string | null): string | null => {
  if (!rawUrl) return null;

  try {
    const url = new URL(rawUrl);
    const isLocalHttp = url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    return isLocalHttp ? url.origin : null;
  } catch {
    return null;
  }
};

const getDistDirectory = (): string => path.join(app.getAppPath(), 'dist');

const isInsideDirectory = (directory: string, filePath: string): boolean => {
  const relativePath = path.relative(directory, filePath);
  return relativePath === '' || (!relativePath.startsWith('..') && !path.isAbsolute(relativePath));
};

const getExistingFile = (directory: string, relativePath: string): string | null => {
  const candidate = path.normalize(path.join(directory, relativePath));
  if (!isInsideDirectory(directory, candidate)) return null;
  if (!existsSync(candidate)) return null;

  const stats = statSync(candidate);
  return stats.isFile() ? candidate : null;
};

const resolveRendererFile = (requestUrl: string): string => {
  const distDirectory = getDistDirectory();
  const indexFile = path.join(distDirectory, 'index.html');

  try {
    const url = new URL(requestUrl);
    const rawSegments = decodeURIComponent(url.pathname)
      .split('/')
      .map((segment) => segment.trim())
      .filter(Boolean);

    const assetSegmentIndex = rawSegments.indexOf('assets');
    if (assetSegmentIndex >= 0) {
      const assetPath = rawSegments.slice(assetSegmentIndex).join(path.sep);
      const assetFile = getExistingFile(distDirectory, assetPath);
      if (assetFile) return assetFile;
    }

    const requestedFileName = rawSegments[rawSegments.length - 1];
    if (requestedFileName && PUBLIC_ASSET_FILES.has(requestedFileName)) {
      const publicFile = getExistingFile(distDirectory, requestedFileName);
      if (publicFile) return publicFile;
    }

    const directPath = rawSegments.join(path.sep);
    if (directPath) {
      const directFile = getExistingFile(distDirectory, directPath);
      if (directFile) return directFile;
    }
  } catch (error) {
    log.warn('Failed to resolve renderer URL', { requestUrl, error });
  }

  return indexFile;
};

const registerAppProtocol = (): void => {
  protocol.handle(APP_PROTOCOL, async (request) => {
    const filePath = resolveRendererFile(request.url);
    const mimeType = MIME_TYPES[path.extname(filePath).toLowerCase()] || 'application/octet-stream';

    try {
      const fileContents = readFileSync(filePath);
      return new Response(new Uint8Array(fileContents), {
        headers: {
          'content-type': mimeType,
        },
      });
    } catch (error) {
      log.error('Failed to serve desktop asset', { filePath, error });
      return new Response('Not found', { status: 404 });
    }
  });
};

const isTrustedAppNavigation = (targetUrl: string, devServerOrigin: string | null): boolean => {
  try {
    const url = new URL(targetUrl);
    if (url.protocol === `${APP_PROTOCOL}:` && url.host === APP_HOST) return true;
    if (devServerOrigin && url.origin === devServerOrigin) return true;
    return false;
  } catch {
    return false;
  }
};

const isAllowedExternalUrl = (targetUrl: string): boolean => {
  try {
    const url = new URL(targetUrl);
    return url.protocol === 'https:' || url.protocol === 'mailto:';
  } catch {
    return false;
  }
};

const openExternalIfAllowed = (targetUrl: string): void => {
  if (isAllowedExternalUrl(targetUrl)) {
    void shell.openExternal(targetUrl);
  }
};

const configureSessionSecurity = (devServerOrigin: string | null): void => {
  const allowedPermissions = new Set(['clipboard-sanitized-write']);

  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback, details) => {
    const requestingUrl = details.requestingUrl || webContents.getURL();
    const isTrusted = isTrustedAppNavigation(requestingUrl, devServerOrigin);
    callback(isTrusted && allowedPermissions.has(permission));
  });
};

const isPrivateOrLocalHostname = (hostname: string): boolean => {
  const normalized = hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (
    normalized === 'localhost' ||
    normalized === '::1' ||
    normalized.startsWith('fc') ||
    normalized.startsWith('fd') ||
    normalized.startsWith('fe80:')
  ) {
    return true;
  }

  const parts = normalized.split('.').map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return false;
  }

  const [first = 0, second = 0] = parts;
  return (
    first === 0 ||
    first === 10 ||
    first === 127 ||
    first === 169 && second === 254 ||
    first === 172 && second >= 16 && second <= 31 ||
    first === 192 && second === 168
  );
};

const isAllowedDesktopHttpPath = (pathname: string): boolean => (
  pathname === '/' ||
  pathname.startsWith('/api/') ||
  pathname.startsWith('/manager/') ||
  pathname.startsWith('/Manager/') ||
  pathname.startsWith('/ext-api/') ||
  /^\/[A-Za-z][A-Za-z0-9]*(?:\/|$)/.test(pathname)
);

const validateDesktopHttpUrl = (rawUrl: unknown): URL => {
  if (typeof rawUrl !== 'string' || !rawUrl.trim()) {
    throw new Error('Desktop HTTP request URL is required.');
  }

  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error('Desktop HTTP request URL is invalid.');
  }

  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error('Desktop HTTP bridge only allows HTTP(S) URLs.');
  }
  if (isPrivateOrLocalHostname(url.hostname)) {
    throw new Error('Desktop HTTP bridge does not allow local or private hosts.');
  }
  if (!isAllowedDesktopHttpPath(url.pathname)) {
    throw new Error('Desktop HTTP bridge rejected this endpoint path.');
  }

  return url;
};

const normalizeDesktopHttpMethod = (method: unknown): string => {
  const normalized = String(method || 'GET').trim().toUpperCase();
  if (!ALLOWED_DESKTOP_HTTP_METHODS.has(normalized)) {
    throw new Error(`Desktop HTTP method is not allowed: ${normalized}`);
  }
  return normalized;
};

const normalizeDesktopHttpHeaders = (headers: unknown): Record<string, string> => {
  if (!headers || typeof headers !== 'object' || Array.isArray(headers)) return {};

  return Object.entries(headers as Record<string, unknown>).reduce<Record<string, string>>((acc, [key, value]) => {
    const normalizedKey = key.trim().toLowerCase();
    if (!normalizedKey || BLOCKED_DESKTOP_HTTP_HEADERS.has(normalizedKey)) return acc;
    if (!/^[!#$%&'*+.^_`|~0-9a-z-]+$/i.test(normalizedKey)) return acc;
    if (value === undefined || value === null) return acc;
    acc[normalizedKey] = String(value);
    return acc;
  }, {});
};

const normalizeDesktopHttpBody = (body: unknown): string | undefined => {
  if (body === undefined || body === null) return undefined;
  if (typeof body !== 'string') throw new Error('Desktop HTTP request body must be a string.');
  if (Buffer.byteLength(body, 'utf8') > MAX_DESKTOP_HTTP_BODY_BYTES) {
    throw new Error('Desktop HTTP request body is too large.');
  }
  return body;
};

const responseHeadersToObject = (headers: Headers): Record<string, string> => {
  const out: Record<string, string> = {};
  headers.forEach((value, key) => {
    out[key] = value;
  });
  return out;
};

const registerDesktopHttpIpc = (): void => {
  ipcMain.handle(HTTP_REQUEST_CHANNEL, async (_event, rawRequest: DesktopHttpRequest): Promise<DesktopHttpResponse> => {
    const url = validateDesktopHttpUrl(rawRequest?.url);
    const method = normalizeDesktopHttpMethod(rawRequest?.method);
    const headers = normalizeDesktopHttpHeaders(rawRequest?.headers);
    const body = normalizeDesktopHttpBody(rawRequest?.body);

    log.info('Desktop HTTP request', { method, url: `${url.origin}${url.pathname}` });

    const requestInit: RequestInit = {
      method,
      headers,
      redirect: 'follow',
    };
    if (body !== undefined) requestInit.body = body;

    const response = await fetch(url, requestInit);

    return {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeadersToObject(response.headers),
      body: await response.text(),
    };
  });
};

const configureAutoUpdates = (): void => {
  if (!app.isPackaged) return;
  if (autoUpdatesConfigured) return;

  log.transports.file.level = 'info';
  autoUpdater.logger = log;
  autoUpdater.allowPrerelease = false;
  autoUpdater.autoDownload = false;

  autoUpdater.on('error', (error) => {
    log.error('Desktop update error', error);
  });

  autoUpdater.on('checking-for-update', () => {
    log.info('Checking for desktop update');
  });

  autoUpdater.on('update-available', (info) => {
    log.info('Desktop update available', info.version);
  });

  autoUpdater.on('update-not-available', (info) => {
    log.info('Desktop is up to date', info.version);
  });

  autoUpdater.on('update-downloaded', (info) => {
    log.info('Desktop update downloaded', info.version);
  });

  autoUpdatesConfigured = true;
};

const getDesktopUpdateErrorMessage = (error: unknown): string => {
  if (error instanceof Error && error.message.trim()) return error.message;
  return 'Update check failed.';
};

const checkAndDownloadDesktopUpdate = async (): Promise<DesktopUpdateCheckResponse> => {
  const currentVersion = app.getVersion();

  if (!app.isPackaged) {
    return {
      status: 'disabled',
      message: 'Updates are available only in the installed desktop app.',
      currentVersion,
    };
  }

  configureAutoUpdates();

  try {
    const result = await autoUpdater.checkForUpdates();
    if (!result?.isUpdateAvailable) {
      return {
        status: 'not-available',
        message: 'App is already up to date.',
        currentVersion,
      };
    }

    const nextVersion = result.updateInfo.version;
    await autoUpdater.downloadUpdate();

    const response: DesktopUpdateCheckResponse = {
      status: 'downloaded',
      message: nextVersion
        ? `Update ${nextVersion} downloaded. Restart the app to install it.`
        : 'Update downloaded. Restart the app to install it.',
      currentVersion,
    };

    if (nextVersion) response.version = nextVersion;
    return response;
  } catch (error: unknown) {
    const message = getDesktopUpdateErrorMessage(error);
    log.error('Manual desktop update check failed', error);
    return {
      status: 'error',
      message,
      currentVersion,
    };
  }
};

const registerDesktopUpdateIpc = (): void => {
  ipcMain.handle(UPDATE_CHECK_CHANNEL, async (): Promise<DesktopUpdateCheckResponse> => {
    if (updateCheckInFlight) return updateCheckInFlight;

    updateCheckInFlight = checkAndDownloadDesktopUpdate().finally(() => {
      updateCheckInFlight = null;
    });

    return updateCheckInFlight;
  });
};

const getWindowFromEvent = (event: IpcMainInvokeEvent): BrowserWindow | null =>
  BrowserWindow.fromWebContents(event.sender);

const sendWindowState = (windowRef: BrowserWindow): void => {
  if (windowRef.isDestroyed()) return;
  windowRef.webContents.send(WINDOW_STATE_CHANNEL, {
    isMaximized: windowRef.isMaximized(),
  });
};

const registerWindowControlIpc = (): void => {
  ipcMain.handle('rtx5-window:minimize', (event) => {
    const windowRef = getWindowFromEvent(event);
    if (!windowRef) return false;
    windowRef.minimize();
    return true;
  });

  ipcMain.handle('rtx5-window:toggle-maximize', (event) => {
    const windowRef = getWindowFromEvent(event);
    if (!windowRef) return false;
    if (windowRef.isMaximized()) {
      windowRef.unmaximize();
    } else {
      windowRef.maximize();
    }
    return windowRef.isMaximized();
  });

  ipcMain.handle('rtx5-window:close', (event) => {
    const windowRef = getWindowFromEvent(event);
    if (!windowRef) return false;
    windowRef.close();
    return true;
  });

  ipcMain.handle('rtx5-window:is-maximized', (event) => {
    const windowRef = getWindowFromEvent(event);
    return windowRef?.isMaximized() ?? false;
  });
};

const bindWindowStateEvents = (windowRef: BrowserWindow): void => {
  windowRef.on('maximize', () => sendWindowState(windowRef));
  windowRef.on('unmaximize', () => sendWindowState(windowRef));
  windowRef.on('restore', () => sendWindowState(windowRef));
};

const isDevToolsToggleShortcut = (input: Input): boolean => {
  if (input.type !== 'keyDown' || input.isAutoRepeat) return false;

  const key = input.key.toLowerCase();
  return input.control && input.shift && !input.alt && !input.meta && key === 'i';
};

const bindDevToolsShortcut = (windowRef: BrowserWindow): void => {
  windowRef.webContents.on('before-input-event', (event, input) => {
    if (!isDevToolsToggleShortcut(input)) return;

    event.preventDefault();
    if (windowRef.webContents.isDevToolsOpened()) {
      windowRef.webContents.closeDevTools();
      return;
    }

    windowRef.webContents.openDevTools({ mode: 'detach', activate: true });
  });
};

const createWindow = async (devServerOrigin: string | null): Promise<void> => {
  log.info('Creating desktop window', {
    packaged: app.isPackaged,
    appPath: app.getAppPath(),
    devServerOrigin,
  });

  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1200,
    minHeight: 760,
    title: 'RTX-5 Broker Manager',
    backgroundColor: '#080f1f',
    icon: path.join(getDistDirectory(), 'logo V2.ico'),
    frame: false,
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      preload: path.join(__dirname, 'preload.cjs'),
      webSecurity: true,
      devTools: true,
    },
  });

  bindWindowStateEvents(mainWindow);
  bindDevToolsShortcut(mainWindow);

  mainWindow.once('ready-to-show', () => {
    log.info('Desktop window ready to show');
    mainWindow?.show();
  });

  mainWindow.on('closed', () => {
    log.info('Desktop window closed');
    mainWindow = null;
  });

  mainWindow.webContents.on('did-finish-load', () => {
    log.info('Desktop renderer finished load');
  });

  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedUrl) => {
    log.error('Desktop renderer failed load', { errorCode, errorDescription, validatedUrl });
  });

  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    log.error('Desktop renderer process gone', details);
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    openExternalIfAllowed(url);
    return { action: 'deny' };
  });

  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (isTrustedAppNavigation(url, devServerOrigin)) return;

    event.preventDefault();
    openExternalIfAllowed(url);
  });

  const rendererUrl = devServerOrigin || `${APP_ORIGIN}/`;
  log.info('Loading desktop renderer', { rendererUrl });
  await mainWindow.loadURL(rendererUrl);
};

const devServerOrigin = normalizeDevServerUrl(getArgValue('dev-server')) || (hasArg('use-dev-server')
  ? DEFAULT_DEV_SERVER_URL
  : null);

app.setAppUserModelId(APP_ID);

app.whenReady().then(async () => {
  log.info('Desktop app ready');
  registerAppProtocol();
  log.info('Desktop protocol registered');
  configureSessionSecurity(devServerOrigin);
  registerDesktopHttpIpc();
  registerDesktopUpdateIpc();
  registerWindowControlIpc();
  Menu.setApplicationMenu(null);

  await createWindow(devServerOrigin);
  configureAutoUpdates();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void createWindow(devServerOrigin);
    }
  });
}).catch((error: unknown) => {
  log.error('Failed to start desktop app', error);
  app.quit();
});

app.on('before-quit', () => {
  log.info('Desktop app before quit');
});

app.on('window-all-closed', () => {
  log.info('Desktop app window-all-closed');
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
