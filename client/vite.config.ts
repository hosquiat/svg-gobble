import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: process.env.VITE_PROXY_TARGET ?? 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    rollupOptions: {
      output: {
        manualChunks: {
          codemirror: [
            '@codemirror/lang-xml',
            '@uiw/codemirror-theme-tokyo-night-storm',
            '@uiw/react-codemirror',
          ],
          svgo: ['svgo'],
        },
      },
    },
  },
})
