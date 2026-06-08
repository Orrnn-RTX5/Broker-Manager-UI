import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig(({ mode, command }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const apiHost = env.VITE_API_HOST || 'https://backend.orrnn.com'
  const apiHostExt = env.VITE_API_HOST_EXT || apiHost
  const proxySecure = env.VITE_PROXY_INSECURE !== 'true'

  return {
    plugins: [
      react(),
      tailwindcss(),
    ],
    // Strip all console.* and debugger statements from production bundles
    // (manager-ui-F08): verbose request/response and per-account financial
    // diagnostics must not reach the browser console in production. Dev server
    // (command === 'serve') keeps console output for debugging.
    esbuild: command === 'build' ? { drop: ['console', 'debugger'] } : {},
    server: {
      proxy: {
        '/api/manager': {
          target: apiHost,
          changeOrigin: true,
          secure: proxySecure,
          rewrite: (path) => path.replace(/^\/api/, ''),
        },
        '/api/v2': {
          target: apiHost,
          changeOrigin: true,
          secure: proxySecure,
          rewrite: (path) => path.replace(/^\/api/, ''),
        },
        '/manager': {
          target: apiHost,
          changeOrigin: true,
          secure: proxySecure,
        },
        '/Manager': {
          target: apiHost,
          changeOrigin: true,
          secure: proxySecure,
        },
        // Port 8091 APIs: MarketDepth, SessionOverride, SpreadSchedule
        '/ext-api': {
          target: apiHostExt,
          changeOrigin: true,
          secure: proxySecure,
          rewrite: (path) => path.replace(/^\/ext-api/, ''),
        },
      }
    }
  }
})
