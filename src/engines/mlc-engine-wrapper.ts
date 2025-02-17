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
}
