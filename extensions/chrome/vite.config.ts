import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { viteStaticCopy } from 'vite-plugin-static-copy';

export default defineConfig({
  plugins: [
    react(),
    viteStaticCopy({
      targets: [
        {
          src: 'public/manifest.json',
          dest: '.',
        },
        {
          src: 'public/icons',
          dest: 'icons',
        },
        {
          src: 'public/content-script.js',
          dest: '.',
        },
      ],
    }),
  ],
  base: './',
  build: {
    outDir: 'build',
    rollupOptions: {
      input: {
        main: 'index.html',
        sidepanel: 'sidepanel.html'
      },
    },
  },
});