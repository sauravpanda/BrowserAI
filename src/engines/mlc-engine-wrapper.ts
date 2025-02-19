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

interface MLCLoadModelOptions {
  useWorker?: boolean;
  onProgress?: (progress: any) => void;
  quantization?: string;
  [key: string]: any;
}

export class MLCEngineWrapper {
  private mlcEngine: MLCEngineInterface | null = null;
  private appConfig: AppConfig | null = null;
  private worker: Worker | null = null;

  constructor() {
    this.mlcEngine = null;
  }

  async loadModel(modelConfig: ModelConfig, options: MLCLoadModelOptions = {}) {
    try {
      // Clean up any existing worker
      if (this.worker) {
        this.worker.terminate();
        this.worker = null;
      }

      // Create new worker if requested
      if (options.useWorker) {
        console.log('[MLCEngine] Creating new worker');
        
        this.worker = new Worker(
          new URL('../workers/mlc.worker.ts', import.meta.url),
          { type: 'module' }
        );
        
        // Add error handling for worker
        this.worker.onerror = (error) => {
          console.error('[MLCEngine] Worker error:', error);
          throw new Error(`Worker error: ${error.message}`);
        };

        this.worker.onmessageerror = (error) => {
          console.error('[MLCEngine] Worker message error:', error);
        };

        // Listen for messages from worker
        this.worker.onmessage = (msg) => {
          console.log('[MLCEngine] Received worker message:', msg.data);
          if (msg.data.type === 'error') {
            throw new Error(`Worker error: ${msg.data.error}`);
          }
        };

        console.log('[MLCEngine] Worker created successfully');
      }

      const quantization = options.quantization || modelConfig.defaultQuantization;
      const modelIdentifier = modelConfig.repo.replace('{quantization}', quantization).split('/')[1];
      
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
        console.log('[MLCEngine] Creating web worker engine');
        this.mlcEngine = await CreateWebWorkerMLCEngine(
          this.worker,
          modelIdentifier,
          {
            initProgressCallback: (progress: any) => {
              console.log('[MLCEngine] Loading progress:', progress);
              options.onProgress?.(progress);
            },
            appConfig: this.appConfig,
            ...options,
          }
        );
        console.log('[MLCEngine] Web worker engine created successfully');
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
        console.error('[MLCEngine] Error with worker, cleaning up');
        this.worker.terminate();
        this.worker = null;
      }
      console.error('[MLCEngine] Error loading model:', error);
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to load MLC model "${modelConfig}": ${message}`);
    }
  }

  async generateText(input: string | Record<string, any>[], options: any = {}) {
    if (!this.mlcEngine) {
      throw new Error('MLC Engine not initialized.');
    }

    let messages: Record<string, any>[] = Array.isArray(input) 
      ? input 
      : [
          ...(options.system_prompt ? [{ role: 'system', content: options.system_prompt }] : []),
          { role: 'user', content: input }
        ];

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
      messages.unshift({
        role: 'system',
        content: 'You must respond with valid JSON that matches the provided schema. Do not include any explanations or additional text.'
      });

      // Ensure the schema is properly stringified
      const schema = typeof options.json_schema === 'string' 
        ? options.json_schema 
        : JSON.stringify(options.json_schema);

      options.response_format = {
        type: "json_object",
        schema:schema
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
    return result.choices[0].message.content;
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
}
