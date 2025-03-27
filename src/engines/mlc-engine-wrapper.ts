// src/engines/mlc-engine-wrapper.ts
import { 
  CreateMLCEngine, 
  MLCEngineInterface, 
  AppConfig, 
  modelLibURLPrefix, 
  modelVersion, 
  prebuiltAppConfig,
  CreateWebWorkerMLCEngine
} from '@mlc-ai/web-llm';
import { ModelConfig } from '../config/models/types';

// Add this worker code as a string at the top of the file
const workerCode = `
  // Ensure we're in a worker context
  if (typeof self === 'undefined') {
    throw new Error('This script must be run in a Web Worker');
  }

  console.log('[Worker] Starting initialization...');

  // Wrap the entire worker code in a try-catch
  try {
    // Wait for the main thread to send us the module URL
    self.onmessage = async (msg) => {
      if (msg.data.type === 'init') {
        console.log('[Worker] Received init message');
        const moduleURL = msg.data.moduleURL;
        
        try {
          const module = await import(moduleURL);
          console.log('[Worker] Module loaded successfully');
          const handler = new module.WebWorkerMLCEngineHandler();
          
          // Replace onmessage handler with the actual handler
          self.onmessage = (msg) => {
            console.log('[Worker] Received message:', msg.data);
            try {
              handler.onmessage(msg);
            } catch (error) {
              console.error('[Worker] Handler error:', error);
              self.postMessage({
                type: 'error',
                error: error instanceof Error ? error.message : String(error)
              });
            }
          };
          
          self.postMessage({ type: 'ready' });
          console.log('[Worker] Handler initialized successfully');
        } catch (error) {
          console.error('[Worker] Failed to load module:', error);
          self.postMessage({
            type: 'error',
            error: 'Failed to initialize worker: ' + (error instanceof Error ? error.message : String(error))
          });
        }
      }
    };
  } catch (error) {
    console.error('[Worker] Initialization error:', error);
    self.postMessage({
      type: 'error',
      error: 'Worker initialization failed: ' + (error instanceof Error ? error.message : String(error))
    });
  }

  self.onerror = (error) => {
    console.error('[Worker] Global error:', error);
    self.postMessage({
      type: 'error',
      error: error instanceof ErrorEvent ? error.message : 'Unknown worker error'
    });
  };

  self.onmessageerror = (error) => {
    console.error('[Worker] Message error:', error);
    self.postMessage({
      type: 'error',
      error: 'Message error: ' + (error instanceof Error ? error.message : String(error))
    });
  };

  console.log('[Worker] Basic initialization complete');
`;

interface MLCLoadModelOptions {
  useWorker?: boolean;
  onProgress?: (progress: any) => void;
  quantization?: string;
  [key: string]: any;
}

// Add a helper class to manage the model cache with LRU strategy
class MLCModelCacheManager {
  private static instance: MLCModelCacheManager;
  private modelQueue: string[] = [];
  private modelSizes: Map<string, number> = new Map(); // Track size of each model
  private maxCacheSize = 1024 * 1024 * 1024; // 1GB max cache size (adjust as needed)
  private readonly cacheThreshold = 0.8; // 80% threshold for cleanup
  private currentCacheSize = 0;

  private constructor() {
    // Calculate the current cache size
    this.calculateCacheSizeAsync();
    
    // Also estimate available storage and adjust max cache size
    this.estimateAvailableStorageAndSetLimit();
  }

  public static getInstance(): MLCModelCacheManager {
    if (!MLCModelCacheManager.instance) {
      MLCModelCacheManager.instance = new MLCModelCacheManager();
    }
    return MLCModelCacheManager.instance;
  }

  // Scan all caches to calculate total size
  private async calculateCacheSizeAsync(): Promise<void> {
    try {
      const cacheNames = ['webllm/config', 'webllm/wasm', 'webllm/model'];
      this.currentCacheSize = 0;
      this.modelSizes.clear();
      
      // Map to collect all URLs by model ID for debugging
      const modelUrlMap: Map<string, string[]> = new Map();
      
      // Map to track original model IDs to normalized ones
      const normalizedModelMap: Map<string, string> = new Map();
      
      console.log('Beginning cache calculation...');
      
      for (const cacheName of cacheNames) {
        console.log(`Scanning cache: ${cacheName}`);
        const cache = await caches.open(cacheName);
        const keys = await cache.keys();
        
        console.log(`Found ${keys.length} entries in ${cacheName}`);
        
        for (const key of keys) {
          const response = await cache.match(key);
          if (!response) continue;
          
          const blob = await response.blob();
          const size = blob.size;
          this.currentCacheSize += size;
          
          // Try to determine which model this entry belongs to
          const url = key.url;
          
          // Extract the raw model ID from the URL
          let rawModelId = this.extractRawModelId(url);
          
          if (rawModelId) {
            // Normalize the model ID to avoid duplicates
            let normalizedModelId = this.normalizeModelId(rawModelId);
            
            // Track the normalization for debugging
            if (!normalizedModelMap.has(rawModelId)) {
              normalizedModelMap.set(rawModelId, normalizedModelId);
            }
            
            // Track URLs for debugging
            if (!modelUrlMap.has(normalizedModelId)) {
              modelUrlMap.set(normalizedModelId, []);
            }
            modelUrlMap.get(normalizedModelId)?.push(url);
            
            if (!this.modelSizes.has(normalizedModelId)) {
              this.modelSizes.set(normalizedModelId, 0);
              if (!this.modelQueue.includes(normalizedModelId)) {
                this.modelQueue.push(normalizedModelId);
              }
            }
            this.modelSizes.set(normalizedModelId, (this.modelSizes.get(normalizedModelId) || 0) + size);
          } else {
            console.log(`Couldn't determine model for URL: ${url}`);
          }
        }
      }
      
      // Print detailed debug info
      console.log('--- MODEL CACHE DEBUG INFO ---');
      console.log(`Total cache size: ${this.formatBytes(this.currentCacheSize)}`);
      console.log(`Models in modelQueue: ${this.modelQueue.length}`);
      console.log(`Models in modelSizes map: ${this.modelSizes.size}`);
      
      // Normalize the model queue to ensure consistency
      this.normalizeModelQueue();
      
      console.log('Raw to normalized model mapping:');
      for (const [raw, normalized] of normalizedModelMap.entries()) {
        console.log(`- ${raw} → ${normalized}`);
      }
      
      console.log('Detected models:');
      for (const [modelId, size] of this.modelSizes.entries()) {
        console.log(`- ${modelId}: ${this.formatBytes(size)} (${modelUrlMap.get(modelId)?.length || 0} files)`);
      }
      
      console.log('LRU Queue order (oldest to newest):');
      this.modelQueue.forEach((id, index) => {
        console.log(`${index + 1}. ${id}`);
      });
      
      console.log(`Cache calculated. Total size: ${this.formatBytes(this.currentCacheSize)}, Models: ${this.modelQueue.length}`);
    } catch (error) {
      console.error('Error calculating cache size:', error);
    }
  }
  
  // Extract raw model ID from URL using patterns based on the model config
  private extractRawModelId(url: string): string | null {
    // Special cases for specific model families to maintain version numbers
    
    // Llama models (llama-3.2-1b-instruct, llama-3.2-3b-instruct)
    const llamaPattern = /\/(Llama-3\.2-\d+[Bb]-Instruct)/i;
    const llamaMatch = url.match(llamaPattern);
    if (llamaMatch && llamaMatch[1]) {
      return llamaMatch[1];
    }
    
    // Hermes models (hermes-llama-3.2-3b)
    const hermesPattern = /\/(Hermes-\d+-Llama-\d+\.\d+-\d+[Bb])/i;
    const hermesMatch = url.match(hermesPattern);
    if (hermesMatch && hermesMatch[1]) {
      return hermesMatch[1];
    }
    
    // Qwen models (qwen2.5-0.5b-instruct, qwen2.5-1.5b-instruct, qwen2.5-3b-instruct)
    const qwenPattern = /\/(Qwen2(?:\.5)?-\d+\.?\d*[Bb]-Instruct)/i;
    const qwenMatch = url.match(qwenPattern);
    if (qwenMatch && qwenMatch[1]) {
      return qwenMatch[1];
    }
    
    // SmolLM models (smollm2-135m-instruct, smollm2-360m-instruct, smollm2-1.7b-instruct)
    const smolLMPattern = /\/(SmolLM2-\d+\.?\d*[BbMG]-Instruct)/i;
    const smolLMMatch = url.match(smolLMPattern);
    if (smolLMMatch && smolLMMatch[1]) {
      return smolLMMatch[1];
    }
    
    // Gemma models (gemma-2b-it)
    const gemmaPattern = /\/(gemma-\d+[Bb]-it)/i;
    const gemmaMatch = url.match(gemmaPattern);
    if (gemmaMatch && gemmaMatch[1]) {
      return gemmaMatch[1];
    }
    
    // TinyLlama models (tinyllama-1.1b-chat-v0.4)
    const tinyLlamaPattern = /\/(TinyLlama-\d+\.?\d*[Bb]-Chat-v[\d\.]+)/i;
    const tinyLlamaMatch = url.match(tinyLlamaPattern);
    if (tinyLlamaMatch && tinyLlamaMatch[1]) {
      return tinyLlamaMatch[1];
    }
    
    // Phi models (phi-3.5-mini-instruct)
    const phiPattern = /\/(Phi-\d+\.?\d+-\w+-\w+)/i;
    const phiMatch = url.match(phiPattern);
    if (phiMatch && phiMatch[1]) {
      return phiMatch[1];
    }
    
    // DeepSeek models (deepseek-r1-distill-qwen-1.5b, deepseek-r1-distill-qwen-7b, deepseek-r1-distill-llama-8b)
    const deepSeekPattern = /\/(DeepSeek-R1-Distill-(?:Qwen|Llama)-\d+\.?\d*[Bb])/i;
    const deepSeekMatch = url.match(deepSeekPattern);
    if (deepSeekMatch && deepSeekMatch[1]) {
      return deepSeekMatch[1];
    }
    
    // Snowflake arctic embed models (snowflake-arctic-embed-m-b4, snowflake-arctic-embed-s-b4, etc.)
    const snowflakePattern = /\/(snowflake-arctic-embed-[ms])(?:-b\d+)?/i;
    const snowflakeMatch = url.match(snowflakePattern);
    if (snowflakeMatch && snowflakeMatch[1]) {
      return snowflakeMatch[1];
    }
    
    // Fallback for models with quantization and MLC suffix
    const mlcPattern = /\/([A-Za-z0-9\.\-]+(?:-\d+\.?\d*[BbMG])(?:-[A-Za-z0-9\.\-]+)?)-[qQ]\d[fF]\d+(?:_\d+)?-MLC/;
    const mlcMatch = url.match(mlcPattern);
    if (mlcMatch && mlcMatch[1]) {
      return mlcMatch[1];
    }
    
    // Fallback for models with just quantization
    const quantPattern = /\/([A-Za-z0-9\.\-]+(?:-\d+\.?\d*[BbMG])(?:-[A-Za-z0-9\.\-]+)?)-[qQ]\d[fF]\d+(?:_\d+)?/;
    const quantMatch = url.match(quantPattern);
    if (quantMatch && quantMatch[1]) {
      return quantMatch[1];
    }
    
    // Fallback for any other model pattern
    const genericPattern = /\/([A-Za-z0-9\.\-]+(?:-\d+\.?\d*[BbMG])(?:-[A-Za-z0-9\.\-]+)?)/;
    const genericMatch = url.match(genericPattern);
    if (genericMatch && genericMatch[1]) {
      return genericMatch[1];
    }
    
    return null;
  }

  // Normalize model ID while preserving all important version information
  private normalizeModelId(rawModelId: string): string {
    // First, make case-insensitive
    const lowerCaseId = rawModelId.toLowerCase();
    
    // Handle specific model families
    
    // Llama models
    if (lowerCaseId.includes('llama-3.2') && lowerCaseId.includes('instruct')) {
      const match = rawModelId.match(/(Llama-3\.2-\d+[Bb])-Instruct/i);
      if (match) return match[1] + '-Instruct';
    }
    
    // Hermes models
    if (lowerCaseId.includes('hermes') && lowerCaseId.includes('llama')) {
      const match = rawModelId.match(/(Hermes-\d+-Llama-\d+\.\d+-\d+[Bb])/i);
      if (match) return match[1];
    }
    
    // Qwen models - CRUCIAL to maintain version differences
    if (lowerCaseId.includes('qwen')) {
      // Preserve the full Qwen version
      if (lowerCaseId.includes('qwen2.5')) {
        const match = rawModelId.match(/(Qwen2\.5-\d+\.?\d*[Bb])-Instruct/i);
        if (match) return match[1] + '-Instruct';
      } else if (lowerCaseId.includes('qwen2')) {
        const match = rawModelId.match(/(Qwen2-\d+\.?\d*[Bb])-Instruct/i);
        if (match) return match[1] + '-Instruct';
      }
    }
    
    // SmolLM models
    if (lowerCaseId.includes('smollm')) {
      const match = rawModelId.match(/(SmolLM2-\d+\.?\d*[BbMG])(-Instruct)?/i);
      if (match) return match[1] + (match[2] || '');
    }
    
    // Gemma models
    if (lowerCaseId.includes('gemma')) {
      const match = rawModelId.match(/(gemma-\d+[Bb])-it/i);
      if (match) return match[1] + '-it';
    }
    
    // TinyLlama models
    if (lowerCaseId.includes('tinyllama')) {
      const match = rawModelId.match(/(TinyLlama-\d+\.?\d*[Bb]-Chat-v[\d\.]+)/i);
      if (match) return match[1];
    }
    
    // Phi models
    if (lowerCaseId.includes('phi')) {
      const match = rawModelId.match(/(Phi-\d+\.?\d+-\w+-\w+)/i);
      if (match) return match[1];
    }
    
    // DeepSeek models
    if (lowerCaseId.includes('deepseek')) {
      const match = rawModelId.match(/(DeepSeek-R1-Distill-(?:Qwen|Llama)-\d+\.?\d*[Bb])/i);
      if (match) return match[1];
    }
    
    // Snowflake models - keep base model but remove batch size
    if (lowerCaseId.includes('snowflake')) {
      const match = rawModelId.match(/(snowflake-arctic-embed-[ms])/i);
      if (match) return match[1];
    }
    
    // Generic fallback: remove quantization and other suffixes
    let normalizedId = rawModelId
      .replace(/-q\d+f\d+(_\d+)?(-MLC)?$/i, '')  // Remove quantization
      .replace(/-MLC$/i, '');                    // Remove MLC suffix
    
    // Remove batch size suffixes
    normalizedId = normalizedId.replace(/-b\d+$/i, '');
    
    return normalizedId;
  }

  // Format bytes to human-readable format
  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  // Mark a model as recently used or add it to the queue
  public touchModel(modelIdentifier: string): void {
    // Normalize the model identifier
    const normalizedId = this.normalizeModelId(modelIdentifier);
    
    // Remove the model if it's already in the queue (using normalized ID)
    this.modelQueue = this.modelQueue.filter(id => this.normalizeModelId(id) !== normalizedId);
    
    // Add to the end (most recently used position)
    this.modelQueue.push(normalizedId);
    
    // Schedule a cache check (but don't await it to avoid blocking)
    setTimeout(() => {
      this.checkCacheSizeAndCleanup();
    }, 0);
  }
  
  // Check if cache exceeds threshold and clean up if needed
  private async checkCacheSizeAndCleanup(): Promise<void> {
    await this.calculateCacheSizeAsync();
    
    if (this.currentCacheSize > this.maxCacheSize * this.cacheThreshold) {
      console.log(`Cache size (${this.formatBytes(this.currentCacheSize)}) exceeds ${this.cacheThreshold * 100}% threshold (${this.formatBytes(this.maxCacheSize * this.cacheThreshold)})`);
      
      // If we have more than one model, remove oldest until we're under threshold
      while (this.modelQueue.length > 1 && this.currentCacheSize > this.maxCacheSize * this.cacheThreshold) {
        const oldestModel = this.modelQueue.shift();
        if (oldestModel) {
          // Ensure we're using the normalized ID
          const normalizedId = this.normalizeModelId(oldestModel);
          console.log(`Removing least recently used model: ${normalizedId}`);
          await this.removeModelFromCache(normalizedId);
          await this.calculateCacheSizeAsync();
        }
      }
    }
  }

  // Delete a specific model from cache
  public async removeModelFromCache(modelIdentifier: string): Promise<void> {
    try {
      const cacheNames = ['webllm/config', 'webllm/wasm', 'webllm/model'];
      
      // Normalize the input model identifier
      const normalizedModelId = this.normalizeModelId(modelIdentifier);
      console.log(`Removing model: ${modelIdentifier} (normalized: ${normalizedModelId})`);
      
      for (const cacheName of cacheNames) {
        const cache = await caches.open(cacheName);
        const keys = await cache.keys();
        
        const modelKeys = keys.filter(request => {
          const url = request.url;
          const rawModelId = this.extractRawModelId(url);
          if (rawModelId) {
            const urlNormalizedId = this.normalizeModelId(rawModelId);
            return urlNormalizedId === normalizedModelId;
          }
          return false;
        });
        
        console.log(`Found ${modelKeys.length} entries to remove from ${cacheName}`);
        
        // Delete all entries for this model from the current cache
        await Promise.all(modelKeys.map(key => cache.delete(key)));
      }
      
      console.log(`Successfully removed model ${normalizedModelId} from cache`);
      
      // Also remove from our tracking data structures
      this.modelSizes.delete(normalizedModelId);
      this.modelQueue = this.modelQueue.filter(id => id !== normalizedModelId);
    } catch (error) {
      console.error(`Error removing model ${modelIdentifier} from cache:`, error);
      throw error;
    }
  }
  
  // Get current cache statistics with additional debug info
  public async getCacheInfo(): Promise<{
    totalSize: number,
    maxSize: number,
    usedPercent: number,
    models: {id: string, size: number, position: number}[],
    debug: {
      modelQueueLength: number,
      modelSizesLength: number,
      modelQueue: string[]
    }
  }> {
    await this.calculateCacheSizeAsync();
    
    return {
      totalSize: this.currentCacheSize,
      maxSize: this.maxCacheSize,
      usedPercent: (this.currentCacheSize / this.maxCacheSize) * 100,
      models: Array.from(this.modelSizes.entries()).map(([id, size]) => ({
        id,
        size,
        position: this.modelQueue.indexOf(id) + 1
      })),
      debug: {
        modelQueueLength: this.modelQueue.length,
        modelSizesLength: this.modelSizes.size,
        modelQueue: [...this.modelQueue]
      }
    };
  }

  // Normalize the entire model queue to ensure consistency
  private normalizeModelQueue(): void {
    // Create a new queue with normalized IDs
    const normalizedQueue: string[] = [];
    const seenNormalizedIds = new Set<string>();
    
    // Process from oldest to newest to maintain LRU order
    for (const id of this.modelQueue) {
      const normalizedId = this.normalizeModelId(id);
      
      // Only add each normalized ID once (most recent position)
      if (!seenNormalizedIds.has(normalizedId)) {
        normalizedQueue.push(normalizedId);
        seenNormalizedIds.add(normalizedId);
      }
    }
    
    // Replace the queue with the normalized version
    this.modelQueue = normalizedQueue;
    
    console.log(`Normalized model queue. New length: ${this.modelQueue.length}`);
  }

  // Estimate available storage and set the cache limit
  private async estimateAvailableStorageAndSetLimit(): Promise<void> {
    try {
      // Check if the Storage API is available
      if ('storage' in navigator && 'estimate' in navigator.storage) {
        const estimate = await navigator.storage.estimate();
        const quota = estimate.quota || 0;
        const usage = estimate.usage || 0;
        
        // Available space is quota minus usage
        const availableBytes = quota - usage;
        
        // Log the storage information
        console.log(`Storage quota: ${this.formatBytes(quota)}`);
        console.log(`Current storage usage: ${this.formatBytes(usage)}`);
        console.log(`Available storage: ${this.formatBytes(availableBytes)}`);
        
        // Set our max cache size to 60% of available space, but cap it at 5GB
        const calculatedMax = Math.min(availableBytes * 0.6, 5 * 1024 * 1024 * 1024);
        
        // Ensure we have at least 500MB cache size
        this.maxCacheSize = Math.max(calculatedMax, 500 * 1024 * 1024);
        
        console.log(`Set max cache size to ${this.formatBytes(this.maxCacheSize)} (60% of available space)`);
      } else {
        // If Storage API isn't available, use a reasonable default
        this.maxCacheSize = 1024 * 1024 * 1024; // 1GB default
        console.log(`Storage API not available. Using default max cache size: ${this.formatBytes(this.maxCacheSize)}`);
      }
    } catch (error) {
      // If there's an error, fall back to a default size
      this.maxCacheSize = 1024 * 1024 * 1024; // 1GB default
      console.error('Error estimating storage:', error);
      console.log(`Using default max cache size: ${this.formatBytes(this.maxCacheSize)}`);
    }
  }
}

export class MLCEngineWrapper {
  private mlcEngine: MLCEngineInterface | null = null;
  private appConfig: AppConfig | null = null;
  private worker: Worker | null = null;
  private cacheManager = MLCModelCacheManager.getInstance();

  constructor() {
    this.mlcEngine = null;
  }

  async loadModel(modelConfig: ModelConfig, options: MLCLoadModelOptions = {}) {
    try {
      if (this.worker) {
        this.worker.terminate();
        this.worker = null;
      }

      if (options.useWorker) {
        // console.log('[MLCEngine] Creating new worker');
        
        const blob = new Blob([workerCode], { type: 'text/javascript' });
        const workerUrl = URL.createObjectURL(blob);
        
        this.worker = new Worker(workerUrl, { 
          type: 'module',
          name: 'mlc-worker' 
        });
        
        URL.revokeObjectURL(workerUrl);

        this.worker.onerror = (error) => {
          console.error('[MLCEngine] Worker error:', error);
          throw new Error(`Worker error: ${error.message}`);
        };

        this.worker.onmessageerror = (error) => {
          console.error('[MLCEngine] Worker message error:', error);
        };

        // Wait for worker to be ready
        await new Promise<void>((resolve, reject) => {
          if (!this.worker) return reject(new Error('Worker not initialized'));

          const timeout = setTimeout(() => {
            reject(new Error('Worker initialization timeout'));
          }, 10000);

          this.worker.onmessage = (msg) => {
            // console.log('[MLCEngine] Received worker message:', msg.data);
            if (msg.data.type === 'ready') {
              clearTimeout(timeout);
              resolve();
            } else if (msg.data.type === 'error') {
              clearTimeout(timeout);
              reject(new Error(msg.data.error));
            }
          };

          // Fix for import.meta.url in CJS environment
          let moduleURL;
          try {
            // Try the ESM approach first
            moduleURL = new URL('@mlc-ai/web-llm', import.meta.url).href;
          } catch (e) {
            // Fallback for CJS environment
            moduleURL = '@mlc-ai/web-llm';
            console.log('[MLCEngine] Using module name as fallback for CJS environment');
          }
          
          // Send init message with module URL
          this.worker.postMessage({
            type: 'init',
            moduleURL
          });
        });

        // console.log('[MLCEngine] Worker initialized successfully');
      }

      const quantization = options.quantization || modelConfig.defaultQuantization;
      const modelIdentifier = modelConfig.repo.replace('{quantization}', quantization).split('/')[1];
      
      // Mark this model as recently used in our LRU cache
      this.cacheManager.touchModel(modelIdentifier);
      
      console.log('[MLCEngine] Loading model:', modelIdentifier, 'with worker:', !!this.worker);

      if (modelConfig.modelLibrary) {
        this.appConfig = {
          model_list: [
            {
              model: "https://huggingface.co/" + modelConfig.repo.replace('{quantization}', quantization),
              model_id: modelIdentifier,
              model_lib:
                modelConfig?.modelLibrary?.startsWith('http') ? modelConfig.modelLibrary : (modelLibURLPrefix + '/' +
                  modelVersion + '/' + modelConfig.modelLibrary),
            },
          ],
        };
      }
      else {
        this.appConfig = prebuiltAppConfig;
      }

      if (this.worker) {
        // console.log('[MLCEngine] Creating web worker engine');
        this.mlcEngine = await CreateWebWorkerMLCEngine(
          this.worker,
          modelIdentifier,
          {
            initProgressCallback: (progress: any) => {
              // console.log('[MLCEngine] Loading progress:', progress);
              options.onProgress?.(progress);
            },
            appConfig: this.appConfig,
            ...options,
          }
        );
        // console.log('[MLCEngine] Web worker engine created successfully');
      } else {
        this.mlcEngine = await CreateMLCEngine(modelIdentifier, {
          initProgressCallback: options.onProgress,
          appConfig: this.appConfig,
          ...options,
        });
      }
    } catch (error) {
      // Clean up worker if initialization failed
      if (this.worker) {
        // console.error('[MLCEngine] Error with worker, cleaning up');
        this.worker.terminate();
        this.worker = null;
      }
      // console.error('[MLCEngine] Error loading model:', error);
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to load MLC model "${modelConfig}": ${message}`);
    }
  }

  async generateText(input: string | Record<string, any>[], options: any = {}) {
    if (!this.mlcEngine) {
      throw new Error('MLC Engine not initialized.');
    }

    // Start with system messages
    let messages: Record<string, any>[] = [];
    
    // Combine system prompts into a single message
    let systemContent = '';
    
    if (options.json_schema) {
      systemContent += 'You must respond with valid JSON that matches the provided schema. Do not include any explanations or additional text.\n\n';
    }
    
    if (options.system_prompt) {
      systemContent += options.system_prompt;
    }

    // Add combined system message if we have any system content
    if (systemContent) {
      messages.push({
        role: 'system',
        content: systemContent.trim()
      });
    }

    // Then add the user input
    if (Array.isArray(input)) {
      messages.push(...input);
    } else {
      messages.push({ role: 'user', content: input });
    }

    // Set default options
    const defaultOptions = {
      max_tokens: 300,
      temperature: 0.6,
      top_p: 0.95,
      frequency_penalty: 0.5,
      presence_penalty: 0.5
    };

    // Handle JSON schema
    if (options.json_schema) {
      // Ensure the schema is properly stringified
      const schema = typeof options.json_schema === 'string' 
        ? options.json_schema 
        : JSON.stringify(options.json_schema);

      options.response_format = {
        type: "json_object",
        schema: schema
      };
    }

    const finalOptions = {
      ...defaultOptions,
      ...options,
      messages
    };

    if (options.stream) {
      finalOptions.stream_options = { include_usage: true };
      return this.mlcEngine.chat.completions.create(finalOptions);
    }

    const result = await this.mlcEngine.chat.completions.create(finalOptions);
    return result;
  }

  async embed(input: string, options: any = {}) {
    if (!this.mlcEngine) {
      throw new Error('MLC Engine not initialized.');
    }
    const result = await this.mlcEngine.embeddings.create({ input, ...options });
    return result.data[0].embedding;
  }

  dispose() {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
    this.mlcEngine = null;
  }

  async clearModelCache(): Promise<void> {
    return new Promise<void>(async (resolve, reject) => {
      try {
        // MLC models are stored in Cache Storage with specific prefixes
        const cacheNames = ['webllm/config', 'webllm/wasm', 'webllm/model'];
        
        // Get all cache names
        const existingCacheNames = await caches.keys();
        
        // Filter caches that match our MLC prefixes
        const mlcCaches = existingCacheNames.filter(name => 
          cacheNames.some(prefix => name.includes(prefix))
        );
        
        // Delete all matching caches
        await Promise.all(mlcCaches.map(name => caches.delete(name)));
        
        console.log('Successfully cleared MLC model cache');
        resolve();
      } catch (error) {
        console.error('Error clearing model cache:', error);
        reject(error);
      }
    });
  }
  
  async clearSpecificModel(modelIdentifier: string): Promise<void> {
    if (!modelIdentifier) {
      throw new Error('Model identifier is required');
    }
    return this.cacheManager.removeModelFromCache(modelIdentifier);
  }

  // Add this new method to the MLCEngineWrapper class
  async getCacheInfo(): Promise<any> {
    return this.cacheManager.getCacheInfo();
  }

  async printCacheInfo(): Promise<void> {
    const info = await this.cacheManager.getCacheInfo();
    
    console.log('=== MLC MODEL CACHE INFORMATION ===');
    console.log(`Total cache size: ${this.formatBytes(info.totalSize)} of ${this.formatBytes(info.maxSize)} (${info.usedPercent.toFixed(2)}%)`);
    console.log(`Number of models: ${info.models.length}`);
    
    console.log('\nModels by LRU order (most recently used last):');
    const sortedModels = [...info.models].sort((a, b) => a.position - b.position);
    
    sortedModels.forEach((model, index) => {
      console.log(`${index + 1}. ${model.id}: ${this.formatBytes(model.size)}`);
    });
    
    console.log('\nDebug info:');
    console.log(`Model queue length: ${info.debug.modelQueueLength}`);
    console.log(`Model sizes map length: ${info.debug.modelSizesLength}`);
    console.log('LRU Queue order:', info.debug.modelQueue);
  }

  // Helper method for formatting bytes
  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
}
