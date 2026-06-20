import { app, BrowserWindow, Menu, protocol, session, shell } from 'electron';
import log from 'electron-log';
import { autoUpdater } from 'electron-updater';
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const APP_ID = 'com.rtx5.brokermanager';
const APP_PROTOCOL = 'rtx5-manager';
const APP_HOST = 'app';
const APP_ORIGIN = `${APP_PROTOCOL}://${APP_HOST}`;
const DEFAULT_DEV_SERVER_URL = 'http://localhost:5173';
const PUBLIC_ASSET_FILES = new Set([
  'brand-logo.png',
  'login-trading-hero.png',
  'logo V2.ico',
  'rtx5-logo.png',
  'runtime-config.js',
]);
let mainWindow: BrowserWindow | null = null;

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

const configureAutoUpdates = (): void => {
  if (!app.isPackaged) return;

  log.transports.file.level = 'info';
  autoUpdater.logger = log;
  autoUpdater.allowPrerelease = false;

  autoUpdater.on('error', (error) => {
    log.error('Desktop update error', error);
  });

  autoUpdater.on('update-available', (info) => {
    log.info('Desktop update available', info.version);
  });

  autoUpdater.on('update-not-available', (info) => {
    log.info('Desktop is up to date', info.version);
  });

  setTimeout(() => {
    autoUpdater.checkForUpdatesAndNotify().catch((error: unknown) => {
      log.error('Desktop update check failed', error);
    });
  }, 15000);
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
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      devTools: !app.isPackaged || process.env.RTX5_ENABLE_DEVTOOLS === 'true',
    },
  });

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
