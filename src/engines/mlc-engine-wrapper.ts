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

export class MLCEngineWrapper {
  private mlcEngine: MLCEngineInterface | null = null;
  private appConfig: AppConfig | null = null;
  private worker: Worker | null = null;

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

          // Get the URL of the local module
          const moduleURL = new URL('@mlc-ai/web-llm', import.meta.url).href;
          // console.log('[MLCEngine] Using local module URL:', moduleURL);

          // Send init message with local module URL
          this.worker.postMessage({
            type: 'init',
            moduleURL
          });
        });

        // console.log('[MLCEngine] Worker initialized successfully');
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
