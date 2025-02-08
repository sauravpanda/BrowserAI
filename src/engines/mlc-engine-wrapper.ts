// src/engines/mlc-engine-wrapper.ts
import { CreateMLCEngine, MLCEngineInterface, AppConfig, modelLibURLPrefix, modelVersion, prebuiltAppConfig } from '@mlc-ai/web-llm';
import { ModelConfig } from '../config/models/types';

export class MLCEngineWrapper {
  private mlcEngine: MLCEngineInterface | null = null;
  private appConfig: AppConfig | null = null;
  constructor() {
    this.mlcEngine = null;
  }

  async loadModel(modelConfig: ModelConfig, options: any = {}) {
    try {
      const quantization = options.quantization || modelConfig.defaultQuantization;
      const modelIdentifier = modelConfig.repo.replace('{quantization}', quantization).split('/')[1];
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
      // console.log(this.appConfig);
      this.mlcEngine = await CreateMLCEngine(modelIdentifier, {
        initProgressCallback: options.onProgress, // Pass progress callback
        appConfig: this.appConfig,
        ...options, // Pass other options
      });
    } catch (error) {
      console.error('Error loading MLC model:', error);
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to load MLC model "${modelConfig}": ${message}`);
    }
  }

  async generateText(input: string | Record<string, any>[], options: any = {}) {
    if (!this.mlcEngine) {
      throw new Error('MLC Engine not initialized.');
    }

    // Initialize messages array regardless of input type
    let messages: Record<string, any>[] = [];

    // If input is an array, use it directly
    if (Array.isArray(input)) {
      messages = input;
    } else if (typeof input === 'string') {
      // If input is a string, construct messages array
      if (options.system_prompt) {
        messages.push({ role: 'system', content: options.system_prompt });
      }
      messages.push({ role: 'user', content: input });
    }

    // Set default options
    options.max_tokens = options.max_tokens || 300;
    options.temperature = options.temperature || 0.6;
    options.top_p = options.top_p || 0.95;
    options.frequency_penalty = options.frequency_penalty || 0.5;
    options.presence_penalty = options.presence_penalty || 0.5;
    if (options.stream) {
      options.stream_options = { include_usage: true };
      return this.mlcEngine.chat.completions.create({ messages: messages as any, ...options });
    }
    console.log(messages);
    const result = await this.mlcEngine.chat.completions.create({ messages: messages as any, ...options });
    return result.choices[0].message.content;
  }

  async embed(input: string, options: any = {}) {
    if (!this.mlcEngine) {
      throw new Error('MLC Engine not initialized.');
    }
    const result = await this.mlcEngine.embeddings.create({ input, ...options });
    return result.data[0].embedding;
  }
}
