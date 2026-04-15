/**
 * Regression test for GH #192.
 *
 * Previously, `image.ts` had a top-level `throw new Error('Unable to load
 * image processing library.')` when running outside a browser/web-worker
 * env. Because `image.ts` is transitively imported by the main BrowserAI
 * bundle, ANY `import { BrowserAI }` from a Node.js process failed
 * immediately — even for pure text-generation users who never touched
 * image processing. See:
 * https://github.com/sauravpanda/BrowserAI/issues/192
 *
 * The fix replaces the eager throw with lazy stubs, so the module loads
 * cleanly everywhere and only actually-called image ops trip the error.
 *
 * This test mocks the `env` module so we can simulate the "non-browser"
 * condition under jest's default CJS runtime without pulling in `env.ts`
 * directly (which uses `import.meta.url` and can't be parsed by the CJS
 * runtime). `hub.ts` is also mocked because its real imports pull in
 * `env.ts` transitively.
 */

// Mock before ANY imports of image.ts — jest hoists jest.mock calls.
// We need `backends.onnx` present because src/libs/transformers/backends/onnx.ts
// writes to it at module load time when tensor.ts is transitively imported.
jest.mock('../env', () => ({
  env: {
    allowRemoteModels: true,
    allowLocalModels: true,
    useBrowserCache: false,
    useFSCache: false,
    useCustomCache: false,
    customCache: null,
    backends: { onnx: null },
  },
  apis: {
    IS_BROWSER_ENV: false,
    IS_WEBWORKER_ENV: false,
    IS_WEB_CACHE_AVAILABLE: false,
    IS_WEBGPU_AVAILABLE: false,
    IS_WEBNN_AVAILABLE: false,
    IS_PROCESS_AVAILABLE: true,
    IS_NODE_ENV: true,
    IS_FS_AVAILABLE: false,
    IS_PATH_AVAILABLE: true,
  },
}));

// `hub.ts` transitively pulls in `env.ts` with `import.meta.url` which
// breaks jest's CJS runtime. Stub it — `image.ts` only imports `getFile`
// from it, and no code path we test actually calls that function.
jest.mock('./hub', () => ({
  getFile: jest.fn(),
}));

describe('image.ts (non-browser env — #192 regression)', () => {
  test('module imports without throwing when IS_BROWSER_ENV is false', () => {
    // This is the core regression: before the fix, `require('./image')`
    // hit the top-level throw and crashed the test file before any
    // assertion ran. After the fix, the require succeeds.
    expect(() => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      require('./image');
    }).not.toThrow();
  });

  test('RawImage can be constructed from raw pixel data', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { RawImage } = require('./image');
    const pixels = new Uint8ClampedArray(4 * 4 * 4); // 4x4 RGBA
    const img = new RawImage(pixels, 4, 4, 4);
    expect(img.width).toBe(4);
    expect(img.height).toBe(4);
    expect(img.channels).toBe(4);
    expect(img.data).toBeInstanceOf(Uint8ClampedArray);
    expect(img.data.length).toBe(64);
  });

  test('toCanvas() fails with a clear error in non-browser env', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { RawImage } = require('./image');
    const pixels = new Uint8ClampedArray(4 * 4 * 4);
    const img = new RawImage(pixels, 4, 4, 4);
    // The important bit for #192 is that we REACH this call at all
    // instead of blowing up at import time.
    expect(() => img.toCanvas()).toThrow(/browser/i);
  });
});
