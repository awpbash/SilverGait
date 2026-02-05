import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    // Allow access from any host (useful for ngrok, localtunnel, mobile testing, WSL)
    host: true,
    port: 5173,
    strictPort: false,
    // Enable file watching in WSL (uncomment if hot reload doesn't work)
    // watch: {
    //   usePolling: true,
    // },
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
})

