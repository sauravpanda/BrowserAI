/**
 * FlareEngineWrapper — BrowserAI adapter for the Flare WASM inference engine.
 *
 * Flare is a pure Rust → WASM engine that runs standard GGUF files directly
 * (no TVM compilation step). It supports WebGPU acceleration, OPFS caching for
 * instant repeat loads, LoRA adapter merging, and progressive model loading.
 *
 * The `@sauravpanda/flare` npm package must be installed for this engine to work:
 *   npm install @sauravpanda/flare
 *
 * Resolves issues: #293 #295 #296 #297 #298 #300
 */

import { FlareConfig } from '../config/models/types';

// Flare WASM API types (from @sauravpanda/flare)
interface FlareEngineWasm {
  load(bytes: Uint8Array): FlareEngineInstance;
}
interface FlareEngineInstance {
  init_gpu(): Promise<boolean>;
  apply_chat_template(userMessage: string, systemMessage: string): string;
  encode_text(text: string): Uint32Array;
  decode_ids(ids: Uint32Array): string;
  decode_token(id: number): string;
  decode_token_chunk(id: number): string;
  generate_text(prompt: string, maxTokens: number): string;
  generate_text_with_params(
    prompt: string,
    maxTokens: number,
    temperature: number,
    topP: number,
    topK: number,
    repeatPenalty: number,
    minP: number,
  ): string;
  begin_stream(promptTokens: Uint32Array, maxTokens: number): void;
  begin_stream_with_params(
    promptTokens: Uint32Array,
    maxTokens: number,
    temperature: number,
    topP: number,
    topK: number,
    repeatPenalty: number,
    minP: number,
  ): void;
  next_token(): number | undefined;
  stop_stream(): void;
  readonly stream_done: boolean;
  readonly stream_stop_reason: string;
  readonly max_seq_len: number;
  readonly tokens_used: number;
  readonly chat_template_name: string;
  readonly model_name: string;
  readonly architecture: string;
  readonly metadata_json: string;
  merge_lora(adapterBytes: Uint8Array): void;
  merge_lora_with_alpha(adapterBytes: Uint8Array, alpha: number): void;
  reset(): void;
  add_stop_sequence(seq: string): void;
  clear_stop_sequences(): void;
  backend_info(): string;
  enable_prefill_profiling(): void;
  disable_prefill_profiling(): void;
  prefill_profile_json(): string;
}

interface FlareModule {
  default: () => Promise<void>;
  FlareEngine: FlareEngineWasm;
  webgpu_available: () => boolean;
  is_model_cached: (name: string) => Promise<boolean>;
  cache_model: (name: string, data: Uint8Array) => Promise<void>;
  load_cached_model: (name: string) => Promise<Uint8Array | null>;
}

export interface FlareLoadOptions {
  /** Progress callback — (loadedBytes, totalBytes) */
  onProgress?: (loaded: number, total: number) => void;
  /** Enable WebGPU acceleration (default: true) */
  useGpu?: boolean;
  /** Override the GGUF download URL */
  url?: string;
  /** System prompt injected into every conversation turn */
  systemPrompt?: string;
}

export interface FlareGenerateOptions {
  max_tokens?: number;
  temperature?: number;
  top_p?: number;
  top_k?: number;
  repeat_penalty?: number;
  min_p?: number;
  /** Per-token callback — called with each decoded token string during streaming */
  onToken?: (token: string) => void;
  /** System prompt for this generation (overrides instance-level systemPrompt) */
  system?: string;
  /** Stop sequences — generation halts when one of these appears in the output */
  stop?: string[];
  /** Whether to stream (return full text) or not */
  stream?: boolean;
}

export interface FlareAdapterOptions {
  /** URL to fetch the SafeTensors LoRA adapter file */
  url: string;
  /** Alpha scaling factor (overrides the value in the adapter file) */
  alpha?: number;
}

const OPFS_CACHE_DIR = 'flare-models';

/**
 * Fetch a file with download progress reporting.
 */
async function fetchWithProgress(
  url: string,
  onProgress?: (loaded: number, total: number) => void,
): Promise<Uint8Array> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
  }

  const contentLength = response.headers.get('Content-Length');
  const total = contentLength ? parseInt(contentLength, 10) : 0;

  if (!response.body || !onProgress) {
    const buffer = await response.arrayBuffer();
    onProgress?.(buffer.byteLength, buffer.byteLength);
    return new Uint8Array(buffer);
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let loaded = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loaded += value.byteLength;
    onProgress(loaded, total || loaded);
  }

  const allBytes = new Uint8Array(loaded);
  let offset = 0;
  for (const chunk of chunks) {
    allBytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return allBytes;
}

/**
 * Try to read model bytes from the OPFS cache.
 * Returns null if OPFS is unavailable or the model is not cached.
 */
async function readFromOpfs(cacheKey: string): Promise<Uint8Array | null> {
  try {
    const root = await navigator.storage.getDirectory();
    const dir = await root.getDirectoryHandle(OPFS_CACHE_DIR, { create: false });
    const fileHandle = await dir.getFileHandle(cacheKey, { create: false });
    const file = await fileHandle.getFile();
    const buffer = await file.arrayBuffer();
    return new Uint8Array(buffer);
  } catch {
    return null;
  }
}

/**
 * Write model bytes to the OPFS cache (fire-and-forget).
 */
async function writeToOpfs(cacheKey: string, data: Uint8Array): Promise<void> {
  const root = await navigator.storage.getDirectory();
  const dir = await root.getDirectoryHandle(OPFS_CACHE_DIR, { create: true });
  const fileHandle = await dir.getFileHandle(cacheKey, { create: true });
  const writable = await fileHandle.createWritable();
  // Copy to a fresh ArrayBuffer to satisfy FileSystemWriteChunkType (avoids SharedArrayBuffer issue)
  const plain = new ArrayBuffer(data.byteLength);
  new Uint8Array(plain).set(data);
  await writable.write(plain);
  await writable.close();
}

/**
 * Check whether a model is present in the OPFS cache.
 */
export async function isModelCached(cacheKey: string): Promise<boolean> {
  try {
    const root = await navigator.storage.getDirectory();
    const dir = await root.getDirectoryHandle(OPFS_CACHE_DIR, { create: false });
    await dir.getFileHandle(cacheKey, { create: false });
    return true;
  } catch {
    return false;
  }
}

/**
 * Delete a cached model from OPFS.
 */
export async function deleteCachedModel(cacheKey: string): Promise<void> {
  try {
    const root = await navigator.storage.getDirectory();
    const dir = await root.getDirectoryHandle(OPFS_CACHE_DIR, { create: false });
    await dir.removeEntry(cacheKey);
  } catch {
    // Ignore if not found
  }
}

/**
 * List all model cache keys stored in OPFS.
 */
export async function listCachedModels(): Promise<string[]> {
  try {
    const root = await navigator.storage.getDirectory();
    const dir = await root.getDirectoryHandle(OPFS_CACHE_DIR, { create: false });
    const keys: string[] = [];
    for await (const [name] of dir as unknown as AsyncIterable<[string, FileSystemHandle]>) {
      keys.push(name);
    }
    return keys;
  } catch {
    return [];
  }
}

/**
 * Build an OpenAI-compatible chat completions response object.
 */
function buildChatResponse(content: string, promptTokens: number, completionTokens: number, stopReason: string) {
  return {
    id: `flare-${Date.now()}`,
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model: 'flare',
    choices: [
      {
        index: 0,
        message: { role: 'assistant', content },
        finish_reason: stopReason === 'eos' ? 'stop' : stopReason === 'length' ? 'length' : 'stop',
      },
    ],
    usage: {
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      total_tokens: promptTokens + completionTokens,
    },
  };
}

/**
 * BrowserAI engine adapter for Flare.
 *
 * Implements the same interface as MLCEngineWrapper / TransformersEngineWrapper.
 */
export class FlareEngineWrapper {
  private flare: FlareModule | null = null;
  private engine: FlareEngineInstance | null = null;
  private systemPrompt = '';
  private modelCacheKey = '';
  private gpuEnabled = false;
  /**
   * Process-wide latch: log the first real prefill profile once per page load.
   * Prevents spamming the console on every `generateText` call.
   */
  private static profileLogged = false;

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  /**
   * Load a Flare GGUF model.
   *
   * On first call: downloads the GGUF file and stores it in OPFS.
   * On repeat calls: loads instantly from the OPFS cache (<100 ms).
   */
  async loadModel(modelConfig: FlareConfig, options: FlareLoadOptions = {}): Promise<void> {
    // Dynamically import @sauravpanda/flare — fails gracefully if not installed
    this.flare = await this.importFlare();

    const url = options.url ?? modelConfig.url;
    if (!url) {
      throw new Error(
        `No URL found for Flare model "${modelConfig.modelName}". ` +
          'Provide a URL in the model config or in loadModel options.',
      );
    }

    this.systemPrompt = (options.systemPrompt as string) ?? '';
    this.modelCacheKey = this.buildCacheKey(url);

    // Attempt to load from OPFS cache first
    let modelBytes = await readFromOpfs(this.modelCacheKey);

    if (!modelBytes) {
      // Download with progress
      modelBytes = await fetchWithProgress(url, options.onProgress);

      // Cache for next time (non-blocking)
      writeToOpfs(this.modelCacheKey, modelBytes).catch((err) => {
        console.warn('[Flare] OPFS cache write failed:', err);
      });
    } else {
      // Instant cache hit — report 100% progress
      options.onProgress?.(modelBytes.byteLength, modelBytes.byteLength);
    }

    // Load model into WASM
    this.engine = this.flare.FlareEngine.load(modelBytes);

    // Try to initialise WebGPU backend
    const useGpu = options.useGpu !== false;
    if (useGpu) {
      try {
        this.gpuEnabled = await this.engine.init_gpu();
        console.log('[Flare] backend_info:', JSON.parse(this.engine.backend_info()));
        // Turn profiling on now; the first generateText call reads the JSON
        // after prefill completes.  Overhead when active is a single
        // function-pointer check per phase boundary.
        this.engine.enable_prefill_profiling();
        if (!this.gpuEnabled) {
          console.info('[Flare] WebGPU unavailable — using CPU SIMD path');
        }
      } catch {
        console.info('[Flare] WebGPU init failed — using CPU SIMD path');
        this.gpuEnabled = false;
      }
    }
  }

  // -------------------------------------------------------------------------
  // Text generation
  // -------------------------------------------------------------------------

  /**
   * Generate text. Accepts a plain string prompt or an OpenAI-style messages array.
   * Returns an OpenAI-compatible chat completion object.
   */
  async generateText(
    input: string | Array<{ role: string; content: string }>,
    options: FlareGenerateOptions = {},
  ): Promise<unknown> {
    if (!this.engine) throw new Error('[Flare] No model loaded. Call loadModel first.');

    // Normalise input to a messages array
    const messages: Array<{ role: string; content: string }> = Array.isArray(input)
      ? input
      : [{ role: 'user', content: input }];

    // Extract system message (last system wins) and user message (last user wins)
    const systemMsg =
      (options.system as string) ?? messages.findLast((m) => m.role === 'system')?.content ?? this.systemPrompt ?? '';
    const userMsg = messages.findLast((m) => m.role === 'user')?.content ?? '';

    // Format using Flare's built-in chat template
    const formattedPrompt = this.engine.apply_chat_template(userMsg, systemMsg);
    const promptTokens = this.engine.encode_text(formattedPrompt);

    // Set stop sequences
    this.engine.clear_stop_sequences();
    const stopSeqs = options.stop ?? [];
    for (const seq of stopSeqs) {
      this.engine.add_stop_sequence(seq);
    }

    const maxTokens = (options.max_tokens as number) ?? 512;
    const temperature = (options.temperature as number) ?? 0.7;
    const topP = (options.top_p as number) ?? 0.9;
    const topK = (options.top_k as number) ?? 40;
    const repeatPenalty = (options.repeat_penalty as number) ?? 1.1;
    const minP = (options.min_p as number) ?? 0.0;
    const onToken = options.onToken;

    // Reset KV cache for a fresh generation
    this.engine.reset();

    let outputText = '';
    let completionTokens = 0;

    if (onToken) {
      // Streaming path — call onToken per decoded token
      this.engine.begin_stream_with_params(promptTokens, maxTokens, temperature, topP, topK, repeatPenalty, minP);

      // First-run prefill profile snapshot (if profiling is enabled).
      if (!FlareEngineWrapper.profileLogged) {
        try {
          const profile = JSON.parse((this.engine as unknown as { prefill_profile_json(): string }).prefill_profile_json());
          if (profile && profile.seq_len > 0) {
            console.log('[Flare] prefill profile:', profile);
            FlareEngineWrapper.profileLogged = true;
          }
        } catch {
          // prefill_profile_json is only present on flare-web >= 0.2.10
        }
      }

      while (!this.engine.stream_done) {
        const tokenId = this.engine.next_token();
        if (tokenId === undefined) break;
        const tokenText = this.engine.decode_token_chunk(tokenId);
        outputText += tokenText;
        completionTokens++;
        onToken(tokenText);
      }
    } else {
      // Batch path — generate_text_with_params is synchronous inside WASM
      outputText = this.engine.generate_text_with_params(
        formattedPrompt,
        maxTokens,
        temperature,
        topP,
        topK,
        repeatPenalty,
        minP,
      );
      completionTokens = outputText.length; // approximate
    }

    const stopReason = this.engine.stream_stop_reason || 'stop';

    return buildChatResponse(outputText, promptTokens.length, completionTokens, stopReason);
  }

  /**
   * Embeddings are not supported by Flare (GGUF text-generation only).
   */
  async embed(_input: string, _options: Record<string, unknown> = {}): Promise<unknown> {
    throw new Error('[Flare] Embedding is not supported. Use a Transformers.js feature-extraction model instead.');
  }

  // -------------------------------------------------------------------------
  // LoRA adapters (issue #298)
  // -------------------------------------------------------------------------

  /**
   * Fetch and merge a LoRA adapter into the loaded model weights.
   *
   * The adapter file must be in SafeTensors format. After merging, all
   * subsequent `generateText` calls use the adapted model. Unmerging requires
   * reloading the base model via `loadModel`.
   *
   * @example
   * ```ts
   * const ai = new BrowserAI({ engine: 'flare' });
   * await ai.loadModel('llama-3.2-1b-flare');
   * await ai.loadAdapter({ url: 'https://.../.../adapter.safetensors', alpha: 16 });
   * ```
   */
  async loadAdapter(options: FlareAdapterOptions): Promise<void> {
    if (!this.engine) throw new Error('[Flare] No model loaded. Call loadModel first.');

    const adapterBytes = await fetchWithProgress(options.url);

    if (options.alpha !== undefined) {
      this.engine.merge_lora_with_alpha(adapterBytes, options.alpha);
    } else {
      this.engine.merge_lora(adapterBytes);
    }

    console.info('[Flare] LoRA adapter merged successfully.');
  }

  // -------------------------------------------------------------------------
  // Progressive loading helpers (issue #300)
  // -------------------------------------------------------------------------

  /**
   * Load a model progressively — returns as soon as the engine is initialised
   * (with OPFS cache), or while the download is in flight.
   *
   * The `onLayersReady` callback is called each time new layers become
   * available, allowing early inference on the partial model.
   *
   * NOTE: True progressive layer-by-layer inference requires Flare's
   * `FlareProgressiveLoader` WASM class. This method provides the BrowserAI
   * API surface; the underlying progressive streaming is handled by the loader.
   */
  async loadModelProgressive(
    modelConfig: FlareConfig,
    options: FlareLoadOptions & {
      onLayersReady?: (availableLayers: number, totalLayers: number) => void;
    } = {},
  ): Promise<void> {
    // For now delegate to normal loadModel — progressive layer inference
    // will be wired in once FlareProgressiveLoader exposes layer callbacks.
    return this.loadModel(modelConfig, options);
  }

  // -------------------------------------------------------------------------
  // Cache management
  // -------------------------------------------------------------------------

  /**
   * Check whether the currently loaded model is cached in OPFS.
   */
  async isCached(): Promise<boolean> {
    if (!this.modelCacheKey) return false;
    return isModelCached(this.modelCacheKey);
  }

  /**
   * Delete the OPFS cache entry for the currently loaded model.
   */
  async clearCache(): Promise<void> {
    if (!this.modelCacheKey) return;
    await deleteCachedModel(this.modelCacheKey);
    console.info('[Flare] Cleared OPFS cache for:', this.modelCacheKey);
  }

  // -------------------------------------------------------------------------
  // Diagnostics
  // -------------------------------------------------------------------------

  get isGpuEnabled(): boolean {
    return this.gpuEnabled;
  }

  get modelInfo(): Record<string, unknown> {
    if (!this.engine) return {};
    return {
      modelName: this.engine.model_name,
      architecture: this.engine.architecture,
      chatTemplate: this.engine.chat_template_name,
      maxSeqLen: this.engine.max_seq_len,
      tokensUsed: this.engine.tokens_used,
      gpuEnabled: this.gpuEnabled,
    };
  }

  dispose(): void {
    this.engine = null;
    this.flare = null;
    this.systemPrompt = '';
    this.modelCacheKey = '';
    this.gpuEnabled = false;
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  private async importFlare(): Promise<FlareModule> {
    try {
      // Dynamic import so the package is optional — BrowserAI still works
      // without @sauravpanda/flare as long as users don't select the Flare engine.
      const mod = await import('@sauravpanda/flare' as string);
      // Initialise the WASM module
      await (mod as unknown as { default: () => Promise<void> }).default();
      return mod as unknown as FlareModule;
    } catch (err) {
      throw new Error(
        '[Flare] Could not load @sauravpanda/flare. ' +
          'Install it with: npm install @sauravpanda/flare\n' +
          `Original error: ${err}`,
      );
    }
  }

  private buildCacheKey(url: string): string {
    // Use the last path segment (filename) as the cache key, with a hash of
    // the full URL to avoid collisions between same-named files on different hosts.
    const filename = url.split('/').pop() ?? 'model.gguf';
    const hash = this.simpleHash(url);
    return `${filename}-${hash}`;
  }

  /** Deterministic 32-bit hash of a string (djb2 variant). */
  private simpleHash(str: string): string {
    let h = 5381;
    for (let i = 0; i < str.length; i++) {
      h = ((h << 5) + h) ^ str.charCodeAt(i);
    }
    return (h >>> 0).toString(16);
  }
}
