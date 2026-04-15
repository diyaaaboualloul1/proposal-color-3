import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 6060,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:6001',
        changeOrigin: true
      }
    },
    // Serve index.html for all non-file routes (SPA fallback for React Router)
    historyApiFallback: true
  },
  preview: {
    port: 6060,
    host: '0.0.0.0'
  }
})
