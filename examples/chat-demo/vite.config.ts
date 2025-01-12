import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  base: '/sauravpanda/BrowserAI/',
  plugins: [react()],
  build: {
    commonjsOptions: {
      include: [/@browserai\/browserai/, /node_modules/]
    }
  },
  optimizeDeps: {
    include: ['@browserai/browserai']
  },
})
