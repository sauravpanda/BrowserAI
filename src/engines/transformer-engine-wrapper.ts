import {
  pipeline,
  TextGenerationPipeline,
  FeatureExtractionPipeline,
  AutomaticSpeechRecognitionPipeline,
  TextToAudioPipeline,
  ImageToTextPipeline,
  ImageToImagePipeline,
  ImageFeatureExtractionPipeline,
  PipelineType
} from '../libs/transformers/transformers';
import { ModelConfig } from '../config/models/types';
import { TTSEngine } from './tts-engine';

export class TransformersEngineWrapper {
  private transformersPipeline:
    | TextGenerationPipeline
    | FeatureExtractionPipeline
    | AutomaticSpeechRecognitionPipeline
    | TextToAudioPipeline
    | ImageToTextPipeline
    | ImageToImagePipeline
    | ImageFeatureExtractionPipeline
    | null = null;
  private modelType: string | null = null;
  private ttsEngine: TTSEngine | null = null;

  constructor() {
    this.transformersPipeline = null;
    this.modelType = null;
  }

  async loadModel(modelConfig: ModelConfig, options: any = {}) {
    try {
      // Validate required model config properties
      if (!modelConfig.modelType) {
        throw new Error('Model configuration missing required "modelType" property');
      }
      if (!modelConfig.repo) {
        throw new Error('Model configuration missing required "repo" property');
      }

      this.modelType = modelConfig.modelType;
      
      options.device = 'webgpu';

      // Configure pipeline options with proper worker settings
      const pipelineOptions = {
        progress_callback: options.onProgress,
        ...options
      };

      // Handle TTS models first, before attempting to create other pipelines
      if (modelConfig.modelType === 'text-to-speech') {
        this.ttsEngine = new TTSEngine();
        console.log('Loading TTS model...');
        await this.ttsEngine.loadModel(modelConfig, options);
        console.log('TTS model loaded');
        return; // Exit early for TTS models
      }

      // For non-TTS models, create the appropriate pipeline
      const pipelineType = modelConfig.pipeline as PipelineType;
      this.transformersPipeline = await pipeline(pipelineType, modelConfig.repo, pipelineOptions);

    } catch (error) {
      console.error('Error loading Transformers model:', error);
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to load Transformers model "${modelConfig.modelName}": ${message}`);
    }
  }

  // Text generation specific method
  async generateText(input: string | Array<{ role: string; content: string }>, options: any = {}) {
    if (!this.transformersPipeline || this.modelType !== 'text-generation') {
      throw new Error('Text generation pipeline not initialized.');
    }

    let messages = Array.isArray(input) ? input : [];

    // If input is a string, construct messages array
    if (typeof input === 'string') {
      if (options.system_prompt) {
        messages.push({ role: 'system', content: options.system_prompt });
      }
      messages.push({ role: 'user', content: input });
    }

    // Convert messages array to text format
    const prompt = messages.map((m) => `${m.role}: ${m.content}`).join('\n');

    const result = await (this.transformersPipeline as any)(prompt, {
      temperature: options.temperature ?? 0.1,
      max_new_tokens: options.max_new_tokens ?? 300,
      repetition_penalty: options.repetition_penalty,
      no_repeat_ngram_size: options.no_repeat_ngram_size,
      num_beams: options.num_beams,
      num_return_sequences: options.num_return_sequences,
      ...options,
    });
    return result;
  }

  // Feature extraction specific method
  async extractFeatures(text: string, options: any = {}) {
    if (!this.transformersPipeline || this.modelType !== 'feature-extraction') {
      throw new Error('Feature extraction pipeline not initialized.');
    }
    return await (this.transformersPipeline as any)(text, {
      pooling: options.pooling ?? 'mean',
      normalize: options.normalize ?? true,
      ...options,
    });
  }

  // Speech recognition specific method
  async transcribe(audioInput: Float32Array | Float64Array | string | Blob, options: any = {}) {
    if (!this.transformersPipeline || this.modelType !== 'automatic-speech-recognition') {
      throw new Error('Speech recognition pipeline not initialized.');
    }

    const input = audioInput instanceof Blob ? new Float32Array(await audioInput.arrayBuffer()) : (audioInput as any);

    const result = await (this.transformersPipeline as any)(input, {
      language: options.language,
      task: options.task,
      return_timestamps: options.return_timestamps,
      chunk_length_s: options.chunk_length_s,
      stride_length_s: options.stride_length_s,
      ...options,
    });
    return result;
  }

  // Add text-to-speech method
  async textToSpeech(text: string, options: any = {}) {
    if (!this.ttsEngine) {
      throw new Error('Text-to-speech engine not initialized.');
    }

    try {
      return await this.ttsEngine.generateSpeech(text, options);
    } catch (error) {
      console.error('Error in text-to-speech:', error);
      throw error;
    }
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
      case 'text-to-speech':
        return this.textToSpeech(prompt);
      default:
        throw new Error(`Unsupported model type: ${this.modelType}`);
    }
  }

  async embed(input: string, options: any = {}) {
    if (!this.transformersPipeline || this.modelType !== 'feature-extraction') {
      console.debug(`Feature extraction pipeline not initialized. ${input}, ${options}`);
      throw new Error('Feature extraction pipeline not initialized.');
    }
  }
}
