import {
  pipeline,
  TextGenerationPipeline,
  FeatureExtractionPipeline,
  AutomaticSpeechRecognitionPipeline,
  TextToAudioPipeline,
  ImageToTextPipeline,
  ImageToImagePipeline,
  ImageFeatureExtractionPipeline,
  PipelineType,
} from '../libs/transformers/transformers';
import { ModelConfig } from '../config/models/types';
import { TTSEngine, SAMPLE_RATE as TTS_SAMPLE_RATE } from './tts-engine';
import { AutoProcessor, MultiModalityCausalLM } from '../libs/transformers/transformers';

/**
 * Detect whether a usable WebGPU adapter is available.
 * Falls back to CPU (ONNX WASM backend) when WebGPU is absent or fails.
 */
async function detectBestDevice(): Promise<'webgpu' | 'cpu'> {
  if (typeof navigator === 'undefined' || !('gpu' in navigator)) return 'cpu';
  try {
    const adapter = await (
      navigator as unknown as { gpu: { requestAdapter(): Promise<unknown> } }
    ).gpu.requestAdapter();
    return adapter ? 'webgpu' : 'cpu';
  } catch {
    return 'cpu';
  }
}

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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private imageProcessor: any = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private multimodalModel: any = null;

  constructor() {
    this.transformersPipeline = null;
    this.modelType = null;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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

      // Detect the best available compute device; fall back to CPU/WASM when
      // WebGPU is unavailable (e.g. Firefox, older Chromium, Node.js).
      // Callers may still override by passing `options.device` explicitly.
      if (!options.device) {
        options.device = await detectBestDevice();
        if (options.device === 'cpu') {
          console.info('[Transformers] WebGPU unavailable — falling back to CPU/WASM inference');
        }
      }

      // Configure pipeline options with proper worker settings
      const pipelineOptions = {
        progress_callback: options.onProgress || (() => {}),
        ...options,
      };

      // Handle TTS models first, before attempting to create other pipelines
      if (modelConfig.modelType === 'text-to-speech') {
        this.ttsEngine = new TTSEngine();
        console.log('Loading TTS model...');
        await this.ttsEngine.loadModel(modelConfig, options);
        console.log('TTS model loaded');
        return; // Exit early for TTS models
      }

      // Initialize image processor for multimodal models
      if (modelConfig.modelType === 'multimodal') {
        // console.log('Loading multimodal model...');
        this.imageProcessor = await AutoProcessor.from_pretrained(modelConfig.repo, pipelineOptions);
        // console.log('Image processor loaded');
        this.multimodalModel = await MultiModalityCausalLM.from_pretrained(modelConfig.repo, pipelineOptions);
        // console.log('Multimodal model loaded');
        return;
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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

  // Streaming text-to-speech method
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async textToSpeechStream(text: string, options: any = {}) {
    if (!this.ttsEngine) {
      throw new Error('Text-to-speech engine not initialized.');
    }

    try {
      // Find the selected voice's language from options or fallback
      const stream = this.ttsEngine.generateSpeechStream(text, options);

      // Return both the stream and the sample rate needed for playback
      return {
        stream: stream,
        sampleRate: (options.sampleRate as number) || TTS_SAMPLE_RATE,
      };
    } catch (error) {
      console.error('Error in text-to-speech stream:', error);
      throw error;
    }
  }

  // Generic method for backward compatibility
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async generate(prompt: string, options: any = {}) {
    switch (this.modelType) {
      case 'text-generation':
        return this.generateText(prompt, options);
      case 'feature-extraction':
        return this.extractFeatures(prompt, options);
      case 'automatic-speech-recognition':
        return this.transcribe(prompt, options);
      case 'text-to-speech':
        throw new Error('Direct text-to-speech is no longer supported. Use textToSpeechStream instead.');
      default:
        throw new Error(`Unsupported model type: ${this.modelType}`);
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async embed(input: string, options: any = {}) {
    if (!this.transformersPipeline || this.modelType !== 'feature-extraction') {
      throw new Error('Feature extraction pipeline not initialized. Load a feature-extraction model first.');
    }
    const result = await (this.transformersPipeline as any)(input, {
      pooling: options.pooling ?? 'mean',
      normalize: options.normalize ?? true,
      ...options,
    });
    return result;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async generateImage(input: { text: string }, options: any = {}) {
    if (this.modelType !== 'multimodal') {
      throw new Error('Multimodal model not initialized.');
    }

    if (!this.imageProcessor || !this.multimodalModel) {
      throw new Error('Image processor or multimodal model not initialized.');
    }

    try {
      const conversation = [{ role: 'user', content: input.text }];

      // Process the input text with the image processor
      const inputs = await this.imageProcessor(conversation, {
        chat_template: 'text_to_image',
        ...options,
      });

      // Generate the image
      const num_image_tokens = this.imageProcessor.num_image_tokens;

      const outputs = await this.multimodalModel.generate({
        ...inputs,
        min_new_tokens: num_image_tokens,
        max_new_tokens: num_image_tokens,
        do_sample: true,
      });

      return outputs;
    } catch (error) {
      console.error('Error generating image:', error);
      throw error;
    }
  }

  dispose() {
    this.transformersPipeline = null;
    this.ttsEngine = null;
    this.imageProcessor = null;
    this.multimodalModel = null;
    this.modelType = null;
  }
}
