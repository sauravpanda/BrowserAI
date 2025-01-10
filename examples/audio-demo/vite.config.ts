import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vite.dev/config/
export default defineConfig({
  base: '/sauravpanda/BrowserAI',
  plugins: [react()],
  resolve: {
    alias: {
      '@browserai/browserai': path.resolve(__dirname, '../../src/index.ts')
    }
  },
  optimizeDeps: {
    include: ['@browserai/browserai']
  }
})
