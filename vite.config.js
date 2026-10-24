import { createLogger, defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import http from 'node:http'
import https from 'node:https'
import process from 'node:process'
import path from 'node:path'
import { Readable } from 'node:stream'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const ignoredWsProxyErrorCodes = new Set(['ECONNABORTED', 'ECONNRESET', 'ECONNREFUSED', 'EPIPE', 'ETIMEDOUT'])
const viteLogger = createLogger()
const defaultLoggerError = viteLogger.error

viteLogger.error = (message, options) => {
  const isIgnoredWsProxyError = (
    typeof message === 'string'
    && ignoredWsProxyErrorCodes.has(options?.error?.code)
    && (message.includes('ws proxy error:') || message.includes('ws proxy socket error:'))
  )

  if (isIgnoredWsProxyError) return
  defaultLoggerError.call(viteLogger, message, options)
}

// https://vite.dev/config/
export default defineConfig(({ mode, command }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const localRuntimeConfig = Object.fromEntries(Object.entries(env)
    .filter(([key]) => key.startsWith('VITE_'))
    .map(([key, value]) => [key.slice(5), value]))
  const localRuntimeSource = `window.__RTX_RUNTIME_CONFIG__=${JSON.stringify(localRuntimeConfig)};window.RUNTIME_CONFIG=window.__RTX_RUNTIME_CONFIG__;`
  const localRuntimePlugin = env.VITE_LOCAL_BACKEND === 'true' ? {
    name: 'local-backend-runtime',
    configureServer(server) {
      server.middlewares.use('/runtime-config.js', (_request, response) => {
        response.setHeader('Content-Type', 'application/javascript')
        response.end(localRuntimeSource)
      })
    },
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'runtime-config.js', source: localRuntimeSource })
    },
  } : null
  const apiHost = env.VITE_API_HOST || 'https://backend.orrnn.com'
  const apiHostExt = env.VITE_API_HOST_EXT || apiHost
  const discoveryHost = env.VITE_DISCOVERY_BASE_URL || env.VITE_API_HOST || 'https://superbackend.orrnn.com'
  const wsHost = env.VITE_WS_HOST || apiHost
  const feedWsUrl = env.VITE_FEED_WS_URL || env.FEED_WS_URL || ''
  const wsFeedPath = env.VITE_WS_FEED_PATH || '/ws/feed'
  const proxySecure = env.VITE_PROXY_INSECURE !== 'true'
  const agentOptions = { keepAlive: true, keepAliveMsecs: 30000, maxSockets: 6, maxFreeSockets: 6, timeout: 60000, scheduling: 'lifo' }
  const httpAgent = new http.Agent(agentOptions)
  const httpsAgent = new https.Agent({ ...agentOptions, rejectUnauthorized: proxySecure })
  const getProxyAgent = (target = '') => (String(target).startsWith('https:') ? httpsAgent : httpAgent)
  const attachTlsHandshakeWatchdog = (proxyReq, handshakeTimeoutMs = 2200) => {
    const onSocket = (socket) => {
      if (!socket?.encrypted) {
        proxyReq._tlsEstablished = true
        return
      }
      if (socket._tlsEstablished || socket.secureConnecting === false) {
        socket._tlsEstablished = true
        proxyReq._tlsEstablished = true
        return
      }
      const timer = setTimeout(() => {
        if (!socket._tlsEstablished && !socket.destroyed) {
          const err = new Error('Upstream TLS handshake timed out')
          err.code = 'ETIMEDOUT'
          socket.destroy(err)
        }
      }, handshakeTimeoutMs)
      timer.unref?.()
      const clear = () => clearTimeout(timer)
      socket.once('secureConnect', () => {
        socket._tlsEstablished = true
        proxyReq._tlsEstablished = true
        clear()
      })
      socket.once('error', clear)
      socket.once('close', clear)
    }
    if (proxyReq.socket) onSocket(proxyReq.socket)
    else proxyReq.once('socket', onSocket)
  }
  const stripManagerPrefix = env.VITE_MANAGER_PROXY_STRIP_MANAGER_PREFIX === 'true'
  const isDesktopMode = mode === 'electron' || mode === 'desktop'
  const wsProxySource = feedWsUrl || wsHost
  const wsProxyUrl = new URL(wsProxySource.replace(/^wss:/i, 'https:').replace(/^ws:/i, 'http:'))
  const wsProxyTarget = wsProxyUrl.origin
  const wsProxyPath = feedWsUrl ? wsProxyUrl.pathname : wsFeedPath
  const stripFeedProxyOrigin = env.VITE_FEED_PROXY_STRIP_ORIGIN === 'true'
  const rewriteManagerProxyPath = (path) => stripManagerPrefix
    ? path.replace(/^\/api\/manager(?=\/|\?|$)/i, '') || '/'
    : path.replace(/^\/api/i, '')
  const rewriteLegacyManagerPath = (path) => stripManagerPrefix
    ? path.replace(/^\/manager/i, '') || '/'
    : path

  const configureSafeProxy = (proxy, { isWs = false, stripOrigin = false, customOrigin = '' } = {}) => {
    const web = proxy.web.bind(proxy)
    proxy.web = (req, res, options, ...args) => {
      const isBodylessRead = ['GET', 'HEAD', 'OPTIONS'].includes(req.method)
        && !req.headers['transfer-encoding']
        && !Number(req.headers['content-length'] || 0)
      let retries = 0
      const maxRetries = 4
      const onError = (error, ...details) => {
        const failedBeforeTls = req._lastProxyReq && !req._lastProxyReq._tlsEstablished
        if (retries < maxRetries && (isBodylessRead || failedBeforeTls) && ignoredWsProxyErrorCodes.has(error?.code)
          && !res.headersSent && !res.destroyed && !req.socket?.destroyed) {
          retries += 1
          const retryOptions = isBodylessRead
            ? { ...options, buffer: Readable.from([]) }
            : options
          return web(req, res, retryOptions, onError)
        }
        const callback = args.find((arg) => typeof arg === 'function')
        if (callback) callback(error, ...details)
        else proxy.emit('error', error, ...details)
      }
      return web(req, res, options, onError)
    }
    if (isWs) {
      const ws = proxy.ws.bind(proxy)
      proxy.ws = (req, socket, head, options, ...args) => {
        let retries = 0
        const maxRetries = 3
        const onError = (error, ...details) => {
          if (retries < maxRetries && ignoredWsProxyErrorCodes.has(error?.code)
            && socket && !socket.destroyed && !socket.writableEnded && !socket._wsUpgraded) {
            retries += 1
            return ws(req, socket, head, options, onError)
          }
          const callback = args.find((arg) => typeof arg === 'function')
          if (callback) callback(error, ...details)
          else proxy.emit('error', error, ...details)
        }
        return ws(req, socket, head, options, onError)
      }
    }
    proxy.on('error', (_err, _req, res) => {
      if (res && typeof res.writeHead === 'function' && !res.headersSent && !res.writableEnded) {
        try {
          res.writeHead(502, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'Upstream broker service temporarily unavailable' }))
        } catch {
          // Ignore response write errors on closed sockets.
        }
      } else if (res && typeof res.destroy === 'function') {
        try {
          res.destroy()
        } catch {
          // Ignore socket destroy errors.
        }
      }
    })
    proxy.on('proxyReq', (proxyReq, req) => {
      if (req) req._lastProxyReq = proxyReq
      proxyReq.on('error', () => {})
      req?.socket?.on?.('error', () => {})
      attachTlsHandshakeWatchdog(proxyReq)
      if (customOrigin) {
        try {
          const origin = new URL(customOrigin).origin
          proxyReq.setHeader('origin', origin)
          proxyReq.setHeader('referer', `${origin}/`)
        } catch {
          // Keep the incoming headers if customOrigin is not a valid URL.
        }
        proxyReq.removeHeader('cookie')
      }
    })
    if (isWs) {
      proxy.on('proxyReqWs', (proxyReq, req, socket) => {
        if (req) req._lastProxyReq = proxyReq
        proxyReq.on('error', () => {})
        socket.on('error', () => {})
        req.socket?.on?.('error', () => {})
        attachTlsHandshakeWatchdog(proxyReq)
        proxyReq.once('upgrade', () => {
          socket._wsUpgraded = true
        })
        if (stripOrigin) {
          proxyReq.removeHeader('origin')
        }
      })
    }
  }

  const warmUpProxyPool = () => {
    if (!String(apiHost).startsWith('https:')) return
    for (let i = 0; i < 2; i += 1) {
      try {
        const req = https.request(`${apiHost.replace(/\/+$/, '')}/ConnectionStatus`, {
          method: 'HEAD',
          agent: httpsAgent,
          timeout: 5000,
        }, (res) => {
          res.resume()
        })
        attachTlsHandshakeWatchdog(req)
        req.on('error', () => {})
        req.end()
      } catch {
        // Ignore warmup errors.
      }
    }
  }

  const gracefulRestartPlugin = {
    name: 'graceful-ws-restart',
    configureServer(server) {
      warmUpProxyPool()
      const sockets = new Set()
      server.httpServer?.on('connection', (socket) => {
        sockets.add(socket)
        socket.on('close', () => sockets.delete(socket))
      })
      server.httpServer?.on('upgrade', (_req, socket) => {
        sockets.add(socket)
        socket.on('close', () => sockets.delete(socket))
      })
      const originalClose = server.httpServer?.close?.bind(server.httpServer)
      if (originalClose && server.httpServer) {
        server.httpServer.close = (callback) => {
          for (const socket of sockets) {
            try {
              socket.destroy()
            } catch {
              // Best-effort cleanup so port 5180 is released immediately on .env reload.
            }
          }
          sockets.clear()
          return originalClose(callback)
        }
      }
    },
  }

  return {
    base: isDesktopMode ? './' : '/',
    customLogger: viteLogger,
    plugins: [
      gracefulRestartPlugin,
      localRuntimePlugin,
      react(),
      tailwindcss(),
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    // Strip all console.* and debugger statements from production bundles
    // (manager-ui-F08): verbose request/response and per-account financial
    // diagnostics must not reach the browser console in production. Dev server
    // (command === 'serve') keeps console output for debugging.
    esbuild: command === 'build' ? { drop: ['console', 'debugger'] } : {},
    server: {
      host: true,
      port: 5180,
      strictPort: true,
      allowedHosts: true,
      proxy: {
        // Broker discovery does not consistently send browser CORS headers.
        // Keep the browser request same-origin during local development while
        // forwarding the original /api/v2 path to the discovery service.
        '/discovery-api': {
          target: discoveryHost,
          changeOrigin: true,
          secure: proxySecure,
          agent: getProxyAgent(discoveryHost),
          rewrite: (path) => path.replace(/^\/discovery-api/, ''),
          configure: (proxy) => configureSafeProxy(proxy, { customOrigin: discoveryHost }),
        },
        '^/api/manager(?:/|\\?|$)': {
          target: apiHost,
          changeOrigin: true,
          secure: proxySecure,
          agent: getProxyAgent(apiHost),
          rewrite: rewriteManagerProxyPath,
          configure: (proxy) => configureSafeProxy(proxy),
        },
        '^/api/v\\d+(?:/|$)': {
          target: apiHost,
          changeOrigin: true,
          secure: proxySecure,
          agent: getProxyAgent(apiHost),
          configure: (proxy) => configureSafeProxy(proxy),
        },
        '^/reports/v\\d+(?:/|$)': {
          target: env.VITE_REPORTS_API_HOST || apiHost,
          changeOrigin: true,
          secure: proxySecure,
          agent: getProxyAgent(env.VITE_REPORTS_API_HOST || apiHost),
          configure: (proxy) => configureSafeProxy(proxy),
        },
        '^/manager(?:/|$)': {
          target: apiHost,
          changeOrigin: true,
          secure: proxySecure,
          agent: getProxyAgent(apiHost),
          ws: true,
          // Manager session sockets validate the browser Origin. Preserve it;
          // the optional bridge origin stripping does not apply to this route.
          rewrite: rewriteLegacyManagerPath,
          configure: (proxy) => configureSafeProxy(proxy, { isWs: true }),
        },
        '^/On(?:Tick|PositionUpdate|AccountMetrics)(?:\\?|$)': {
          target: apiHost,
          changeOrigin: true,
          secure: proxySecure,
          agent: getProxyAgent(apiHost),
          ws: true,
          configure: (proxy) => configureSafeProxy(proxy, { isWs: true }),
        },
        '^/Manager(?:/|$)': {
          target: apiHost,
          changeOrigin: true,
          secure: proxySecure,
          agent: getProxyAgent(apiHost),
          rewrite: rewriteLegacyManagerPath,
          configure: (proxy) => configureSafeProxy(proxy),
        },
        // Port 8091 APIs: MarketDepth, SessionOverride, SpreadSchedule
        '/ext-api': {
          target: apiHostExt,
          changeOrigin: true,
          secure: proxySecure,
          agent: getProxyAgent(apiHostExt),
          rewrite: (path) => path.replace(/^\/ext-api/, ''),
          configure: (proxy) => configureSafeProxy(proxy),
        },
        [wsProxyPath]: {
          target: wsProxyTarget,
          changeOrigin: true,
          secure: proxySecure,
          agent: getProxyAgent(wsProxyTarget),
          ws: true,
          rewriteWsOrigin: !stripFeedProxyOrigin,
          configure: (proxy) => configureSafeProxy(proxy, { isWs: true, stripOrigin: stripFeedProxyOrigin }),
        },
      }
    }
  }
})
