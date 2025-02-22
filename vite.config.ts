import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    commonjsOptions: {
      include: [/@browserai\/browserai/, /node_modules/]
    }
  },
  optimizeDeps: {
    include: ['@browserai/browserai']
  }
}); 