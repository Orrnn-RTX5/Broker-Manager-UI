import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  server: {
    proxy: {
      '/api/manager': {
        target: 'http://69.197.178.27:80',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
      '/api/v2': {
        target: 'http://69.197.178.27:80',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
      '/manager': {
        target: 'http://69.197.178.27:80',
        changeOrigin: true,
        secure: false,
      },
      '/Manager': {
        target: 'http://69.197.178.27:80',
        changeOrigin: true,
        secure: false,
      },
      // Port 8091 APIs: MarketDepth, SessionOverride, SpreadSchedule
      '/ext-api': {
        target: 'http://69.197.178.27:8091',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/ext-api/, ''),
      },
    }
  }
})

