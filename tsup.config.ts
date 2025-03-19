import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  sourcemap: true,
  treeshake: false,
  splitting: false,
  outDir: 'dist',
  outExtension({ format }) {
    return {
      js: format === 'esm' ? '.mjs' : '.js'
    };
  },
  target: 'es2020',
  platform: 'browser',
  minify: false,
  shims: false,
  noExternal: [],
  esbuildOptions(options) {
    options.platform = 'neutral';
  },
  bundle: true,
  skipNodeModulesBundle: true,
}); 
