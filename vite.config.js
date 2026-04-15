import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const apiHost = env.VITE_API_HOST || 'http://backend.orrnn.com'
  const apiHostExt = env.VITE_API_HOST_EXT || 'http://backend.orrnn.com:8091'

  return {
    plugins: [
      react(),
      tailwindcss(),
    ],
    server: {
      proxy: {
        '/api/manager': {
          target: apiHost,
          changeOrigin: true,
          secure: false,
          rewrite: (path) => path.replace(/^\/api/, ''),
        },
        '/api/v2': {
          target: apiHost,
          changeOrigin: true,
          secure: false,
          rewrite: (path) => path.replace(/^\/api/, ''),
        },
        '/manager': {
          target: apiHost,
          changeOrigin: true,
          secure: false,
        },
        '/Manager': {
          target: apiHost,
          changeOrigin: true,
          secure: false,
        },
        // Port 8091 APIs: MarketDepth, SessionOverride, SpreadSchedule
        '/ext-api': {
          target: apiHostExt,
          changeOrigin: true,
          secure: false,
          rewrite: (path) => path.replace(/^\/ext-api/, ''),
        },
      }
    }
  }
})
