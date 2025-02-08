/**
 * @file Handler file for choosing the correct version of ONNX Runtime, based on the environment.
 * Ideally, we could import the `onnxruntime-web` and `onnxruntime-node` packages only when needed,
 * but dynamic imports don't seem to work with the current webpack version and/or configuration.
 * This is possibly due to the experimental nature of top-level await statements.
 * So, we just import both packages, and use the appropriate one based on the environment:
 *   - When running in node, we use `onnxruntime-node`.
 *   - When running in the browser, we use `onnxruntime-web` (`onnxruntime-node` is not bundled).
 *
 * This module is not directly exported, but can be accessed through the environment variables:
 * ```javascript
 * import { env } from '@huggingface/transformers';
 * console.log(env.backends.onnx);
 * ```
 *
 * @module backends/onnx
 */

import { env, apis } from '../env';

// NOTE: Import order matters here. We need to import `onnxruntime-node` before `onnxruntime-web`.
// In either case, we select the default export if it exists, otherwise we use the named export.
import * as ONNX from 'onnxruntime-web';
export { Tensor } from 'onnxruntime-common';

/**
 * @typedef {import('onnxruntime-common').InferenceSession.ExecutionProviderConfig} ONNXExecutionProviders
 */

/** @type {Record<import("../utils/devices.js").DeviceType, ONNXExecutionProviders>} */
const DEVICE_TO_EXECUTION_PROVIDER_MAPPING = Object.freeze({
  auto: null, // Auto-detect based on device and environment
  gpu: null, // Auto-detect GPU
  cpu: 'cpu', // CPU
  wasm: 'wasm', // WebAssembly
  webgpu: 'webgpu', // WebGPU
  cuda: 'cuda', // CUDA
  dml: 'dml', // DirectML

  webnn: { name: 'webnn', deviceType: 'cpu' }, // WebNN (default)
  'webnn-npu': { name: 'webnn', deviceType: 'npu' }, // WebNN NPU
  'webnn-gpu': { name: 'webnn', deviceType: 'gpu' }, // WebNN GPU
  'webnn-cpu': { name: 'webnn', deviceType: 'cpu' }, // WebNN CPU
});

/**
 * The list of supported devices, sorted by priority/performance.
 * @type {import("../utils/devices.js").DeviceType[]}
 */
const supportedDevices: string[] = [];

/** @type {ONNXExecutionProviders[]} */
let defaultDevices: string[] = [];


// Then add WebNN support
if (apis.IS_WEBNN_AVAILABLE) {
  supportedDevices.push('webnn-gpu', 'webnn-cpu');
}

// Add WebGPU as an option if available
if (apis.IS_WEBGPU_AVAILABLE) {
  // Add WASM as fallback when WebGPU fails
  supportedDevices.push('wasm', 'webgpu');
}

// Remove the previous "Always keep WASM as fallback" section since we've integrated it above
if (defaultDevices.length === 0) {
  defaultDevices = ['wasm'];
}

const InferenceSession = ONNX.InferenceSession;

/**
 * Map a device to the execution providers to use for the given device.
 * @param {import("../utils/devices.js").DeviceType|"auto"|null} [device=null] (Optional) The device to run the inference on.
 * @returns {ONNXExecutionProviders[]} The execution providers to use for the given device.
 */
export function deviceToExecutionProviders(device = null) {
  // Use the default execution providers if the user hasn't specified anything
  if (!device) return defaultDevices;

  // Handle overloaded cases
  switch (device) {
    case 'auto':
      return supportedDevices;
    case 'gpu':
      return supportedDevices.filter((x) => ['webgpu', 'cuda', 'dml', 'webnn-gpu'].includes(x));
  }

  if (supportedDevices.includes(device)) {
    return [DEVICE_TO_EXECUTION_PROVIDER_MAPPING[device] ?? device];
  }

  throw new Error(`Unsupported device: "${device}". Should be one of: ${supportedDevices.join(', ')}.`);
}

/**
 * To prevent multiple calls to `initWasm()`, we store the first call in a Promise
 * that is resolved when the first InferenceSession is created. Subsequent calls
 * will wait for this Promise to resolve before creating their own InferenceSession.
 * @type {Promise<any>|null}
 */
let wasmInitPromise: Promise<any> | null = null;

/**
 * Create an ONNX inference session.
 * @param {Uint8Array} buffer The ONNX model buffer.
 * @param {import('onnxruntime-common').InferenceSession.SessionOptions} session_options ONNX inference session options.
 * @param {Object} session_config ONNX inference session configuration.
 * @returns {Promise<import('onnxruntime-common').InferenceSession & { config: Object}>} The ONNX inference session.
 */
export async function createInferenceSession(
  buffer: Uint8Array,
  session_options: any,
  session_config: any
) {
  if (wasmInitPromise) {
    // A previous session has already initialized the WASM runtime
    // so we wait for it to resolve before creating this new session.
    await wasmInitPromise;
  }

  const sessionPromise = InferenceSession.create(buffer, session_options);
  wasmInitPromise ??= sessionPromise;
  const session = await sessionPromise;
  (session as any).config = session_config;
  return session;
}

/**
 * Check if an object is an ONNX tensor.
 * @param {any} x The object to check
 * @returns {boolean} Whether the object is an ONNX tensor.
 */
export function isONNXTensor(x: any) {
  return x instanceof ONNX.Tensor;
}

/** @type {import('onnxruntime-common').Env} */
// @ts-ignore
const ONNX_ENV = ONNX?.env;
if (ONNX_ENV?.wasm) {
  // Initialize wasm backend with suitable default settings.

  // (Optional) Set path to wasm files. This is needed when running in a web worker.
  // https://onnxruntime.ai/docs/api/js/interfaces/Env.WebAssemblyFlags.html#wasmPaths
  // We use remote wasm files by default to make it easier for newer users.
  // In practice, users should probably self-host the necessary .wasm files.

  ONNX_ENV.wasm.wasmPaths = {
    wasm: `https://cdn.jsdelivr.net/npm/@huggingface/transformers@${env.version}/dist/ort-wasm-simd-threaded.jsep.wasm`,
    mjs: `https://cdn.jsdelivr.net/npm/@huggingface/transformers@${env.version}/dist/ort-wasm-simd-threaded.jsep.mjs`,
  };
  // https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.2.4/dist/ort-wasm-simd-threaded.jsep.wasm
  // console.log('ONNX_ENV.wasm.wasmPaths', ONNX_ENV.wasm.wasmPaths);
  // TODO: Add support for loading WASM files from cached buffer when we upgrade to onnxruntime-web@1.19.0
  // https://github.com/microsoft/onnxruntime/pull/21534

  // Users may wish to proxy the WASM backend to prevent the UI from freezing,
  // However, this is not necessary when using WebGPU, so we default to false.
  ONNX_ENV.wasm.proxy = false;

  // Disable threading to avoid potential issues
  ONNX_ENV.wasm.numThreads = 1;
  
  // https://developer.mozilla.org/en-US/docs/Web/API/crossOriginIsolated
  if (typeof crossOriginIsolated === 'undefined' || !crossOriginIsolated) {
    ONNX_ENV.wasm.numThreads = 1;
  }
}

if (ONNX_ENV?.webgpu) {
  // console.log('ONNX_ENV.webgpu', ONNX_ENV.webgpu);
  ONNX_ENV.webgpu.powerPreference = 'high-performance';
}

/**
 * Check if ONNX's WASM backend is being proxied.
 * @returns {boolean} Whether ONNX's WASM backend is being proxied.
 */
export function isONNXProxy() {
  // TODO: Update this when allowing non-WASM backends.
  return ONNX_ENV?.wasm?.proxy;
}

// Expose ONNX environment variables to `env.backends.onnx`
env.backends.onnx = ONNX_ENV;
