import { createLogger, defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import process from 'node:process'
import path from 'node:path'
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
  const apiHost = env.VITE_API_HOST || ''
  const apiHostExt = env.VITE_API_HOST_EXT || apiHost
  const discoveryHost = env.VITE_DISCOVERY_BASE_URL || ''
  const wsHost = env.VITE_WS_HOST || apiHost
  const feedWsUrl = env.VITE_FEED_WS_URL || env.FEED_WS_URL || ''
  const wsFeedPath = env.VITE_WS_FEED_PATH || '/ws/feed'
  const proxySecure = env.VITE_PROXY_INSECURE !== 'true'
  const stripManagerPrefix = env.VITE_MANAGER_PROXY_STRIP_MANAGER_PREFIX === 'true'
  const isDesktopMode = mode === 'electron' || mode === 'desktop'
  const wsProxySource = feedWsUrl || wsHost
  let wsProxyUrl = null
  try {
    wsProxyUrl = new URL(wsProxySource.replace(/^wss:/i, 'https:').replace(/^ws:/i, 'http:'))
  } catch {
    // Empty or invalid runtime host: the WebSocket proxy stays unconfigured.
  }
  const wsProxyTarget = wsProxyUrl?.origin || ''
  const wsProxyPath = feedWsUrl && wsProxyUrl ? wsProxyUrl.pathname : wsFeedPath
  const stripFeedProxyOrigin = env.VITE_FEED_PROXY_STRIP_ORIGIN === 'true'
  const rewriteManagerProxyPath = (path) => stripManagerPrefix
    ? path.replace(/^\/api\/manager(?=\/|\?|$)/i, '') || '/'
    : path.replace(/^\/api/i, '')
  const rewriteLegacyManagerPath = (path) => stripManagerPrefix
    ? path.replace(/^\/manager/i, '') || '/'
    : path

  return {
    base: isDesktopMode ? './' : '/',
    customLogger: viteLogger,
    plugins: [
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
          rewrite: (path) => path.replace(/^\/discovery-api/, ''),
          configure: (proxy) => {
            proxy.on('error', () => {})
            proxy.on('proxyReq', (proxyReq) => {
              proxyReq.on('error', () => {})
              try {
                const origin = new URL(discoveryHost).origin
                proxyReq.setHeader('origin', origin)
                proxyReq.setHeader('referer', `${origin}/`)
              } catch {
                // Keep the incoming headers if the discovery host is not a URL.
              }
              // Tunnel auth cookies must reach Vite, not the discovery host.
              proxyReq.removeHeader('cookie')
            })
          },
        },
        '^/api/manager(?:/|\\?|$)': {
          target: apiHost,
          changeOrigin: true,
          secure: proxySecure,
          rewrite: rewriteManagerProxyPath,
        },
        '^/api/v\\d+(?:/|$)': {
          target: apiHost,
          changeOrigin: true,
          secure: proxySecure,
        },
        '^/reports/v\\d+(?:/|$)': {
          target: env.VITE_REPORTS_API_HOST || apiHost,
          changeOrigin: true,
          secure: proxySecure,
        },
        '^/manager(?:/|$)': {
          target: apiHost,
          changeOrigin: true,
          secure: proxySecure,
          ws: true,
          // Manager session sockets validate the browser Origin. Preserve it;
          // the optional bridge origin stripping does not apply to this route.
          rewrite: rewriteLegacyManagerPath,
          configure: (proxy) => {
            proxy.on('error', () => {})
            proxy.on('proxyReqWs', (proxyReq, req, socket) => {
              proxyReq.on('error', () => {})
              socket.on('error', () => {})
              req.socket?.on?.('error', () => {})
            })
          },
        },
        '^/OnTick(?:\\?|$)': {
          target: apiHost,
          changeOrigin: true,
          secure: proxySecure,
          ws: true,
          configure: (proxy) => {
            proxy.on('error', () => {})
            proxy.on('proxyReqWs', (proxyReq, req, socket) => {
              proxyReq.on('error', () => {})
              socket.on('error', () => {})
              req.socket?.on?.('error', () => {})
            })
          },
        },
        '^/OnPositionUpdate(?:\\?|$)': {
          target: apiHost,
          changeOrigin: true,
          secure: proxySecure,
          ws: true,
          configure: (proxy) => {
            proxy.on('error', () => {})
            proxy.on('proxyReqWs', (proxyReq, req, socket) => {
              proxyReq.on('error', () => {})
              socket.on('error', () => {})
              req.socket?.on?.('error', () => {})
            })
          },
        },
        '^/OnAccountMetrics(?:\\?|$)': {
          target: apiHost,
          changeOrigin: true,
          secure: proxySecure,
          ws: true,
          configure: (proxy) => {
            proxy.on('error', () => {})
            proxy.on('proxyReqWs', (proxyReq, req, socket) => {
              proxyReq.on('error', () => {})
              socket.on('error', () => {})
              req.socket?.on?.('error', () => {})
            })
          },
        },
        '^/Manager(?:/|$)': {
          target: apiHost,
          changeOrigin: true,
          secure: proxySecure,
          rewrite: rewriteLegacyManagerPath,
        },
        // Port 8091 APIs: MarketDepth, SessionOverride, SpreadSchedule
        '/ext-api': {
          target: apiHostExt,
          changeOrigin: true,
          secure: proxySecure,
          rewrite: (path) => path.replace(/^\/ext-api/, ''),
        },
        [wsProxyPath]: {
          target: wsProxyTarget,
          changeOrigin: true,
          secure: proxySecure,
          ws: true,
          rewriteWsOrigin: !stripFeedProxyOrigin,
          configure: (proxy) => {
            proxy.on('error', () => {})
            proxy.on('proxyReqWs', (proxyRequest, req, socket) => {
              proxyRequest.on('error', () => {})
              socket.on('error', () => {})
              req.socket?.on?.('error', () => {})
              if (stripFeedProxyOrigin) {
                proxyRequest.removeHeader('origin')
              }
            })
          },
        },
      }
    }
  }
})
