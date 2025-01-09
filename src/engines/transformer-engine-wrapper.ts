import {
  pipeline, TextGenerationPipeline, FeatureExtractionPipeline, AutomaticSpeechRecognitionPipeline, TextClassificationPipeline
} from '@huggingface/transformers';
import { ModelConfig } from "../config/models/types";


export class TransformersEngineWrapper {
  private transformersPipeline: TextGenerationPipeline | FeatureExtractionPipeline | AutomaticSpeechRecognitionPipeline | TextClassificationPipeline | null = null;
  private modelType: string | null = null;

  constructor() {
    this.transformersPipeline = null;
    this.modelType = null;
  }

  async loadModel(modelConfig: ModelConfig, options: any = {}) {
    try {
      this.modelType = modelConfig.modelType;
      this.transformersPipeline = await pipeline(modelConfig.modelType, modelConfig.repo, {
        progress_callback: options.onProgress,
        ...options,
      });
    } catch (error) {
      console.error("Error loading Transformers model:", error);
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to load Transformers model "${modelConfig.modelName}": ${message}`);
    }
  }

  // Text generation specific method
  async generateText(prompt: string, options: any = {}) {
    if (!this.transformersPipeline || this.modelType !== 'text-generation') {
      throw new Error("Text generation pipeline not initialized.");
    }
    const result = await this.transformersPipeline(prompt, {
      temperature: options.temperature ?? 1,
      max_new_tokens: options.max_new_tokens ?? 50,
      repetition_penalty: options.repetition_penalty,
      no_repeat_ngram_size: options.no_repeat_ngram_size,
      num_beams: options.num_beams,
      num_return_sequences: options.num_return_sequences,
      ...options
    });
    return result;
  }

  // Feature extraction specific method
  async extractFeatures(text: string, options: any = {}) {
    if (!this.transformersPipeline || this.modelType !== 'feature-extraction') {
      throw new Error("Feature extraction pipeline not initialized.");
    }
    return await this.transformersPipeline(text, {
      pooling: options.pooling ?? 'mean',
      normalize: options.normalize ?? true,
      ...options
    });
  }

  // Speech recognition specific method
  async transcribe(audioInput: Float32Array | Float64Array | string | Blob, options: any = {}) {
    if (!this.transformersPipeline || this.modelType !== 'automatic-speech-recognition') {
      throw new Error("Speech recognition pipeline not initialized.");
    }
    
    const input = audioInput instanceof Blob ? 
      new Float32Array(await audioInput.arrayBuffer()) : 
      audioInput as any;
      
    const result = await this.transformersPipeline(input, {
      language: options.language,
      task: options.task,
      return_timestamps: options.return_timestamps,
      chunk_length_s: options.chunk_length_s,
      stride_length_s: options.stride_length_s,
      ...options
    });
    return result;
  }

  // Generic method for backward compatibility
  async generate(prompt: string, options: any = {}) {
    switch (this.modelType) {
      case 'text-generation':
        return this.generateText(prompt, options);
      case 'feature-extraction':
        return this.extractFeatures(prompt, options);
      case 'automatic-speech-recognition':
        return this.transcribe(prompt, options);
      default:
        throw new Error(`Unsupported model type: ${this.modelType}`);
    }
  }
}