import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/demucs.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  sourcemap: true,
  treeshake: false,
  splitting: false,
  outDir: 'dist',
  outExtension({ format }) {
    // Package has "type": "module", so bare .js is parsed as ESM by Node.
    // Emit CJS as .cjs to avoid the "module is not defined in ES module scope"
    // error that CJS consumers were hitting (see GH #192 follow-up).
    return {
      js: format === 'esm' ? '.mjs' : '.cjs',
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
