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

  constructor() {
    this.transformersPipeline = null;
    this.modelType = null;
  }

  async loadModel(modelConfig: ModelConfig, options: any = {}) {
    try {
      this.modelType = modelConfig.modelType;

      // Configure pipeline options with proper worker settings
      const pipelineOptions = {
        progress_callback: options.onProgress,
        ...options,
        // Add worker configuration
        worker: {
          // Ensure worker has no DOM dependencies
          env: 'worker',
          // Disable service workers which may try to access document
          serviceWorker: false,
          // Skip DOM checks
          skipCompatibilityCheck: true,
        },
      };

      this.transformersPipeline = await pipeline(
        modelConfig.modelType as PipelineType,
        modelConfig.repo,
        pipelineOptions
      );
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
  async textToSpeech(text: string) {
    if (!this.transformersPipeline || this.modelType !== 'text-to-speech') {
      throw new Error('Text-to-speech pipeline not initialized.');
    }

    const pipeline = this.transformersPipeline as any;
    const speaker_embeddings =
      'https://huggingface.co/datasets/Xenova/transformers.js-docs/resolve/main/speaker_embeddings.bin';

    try {
      const result = await pipeline(text, {
        speaker_embeddings,
      });

      // Convert Float32Array to proper audio buffer format
      const audioData = result.audio;
      if (audioData instanceof Float32Array) {
        // Convert to 16-bit PCM
        const pcmData = new Int16Array(audioData.length);
        for (let i = 0; i < audioData.length; i++) {
          const s = Math.max(-1, Math.min(1, audioData[i]));
          pcmData[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
        }

        // Create WAV header
        const wavHeader = new ArrayBuffer(44);
        const view = new DataView(wavHeader);

        // WAV header details
        this.writeString(view, 0, 'RIFF');
        view.setUint32(4, 36 + pcmData.length * 2, true);
        this.writeString(view, 8, 'WAVE');
        this.writeString(view, 12, 'fmt ');
        view.setUint32(16, 16, true);
        view.setUint16(20, 1, true);
        view.setUint16(22, 1, true);
        view.setUint32(24, 16000, true); // Sample rate
        view.setUint32(28, 32000, true); // Byte rate
        view.setUint16(32, 2, true);
        view.setUint16(34, 16, true);
        this.writeString(view, 36, 'data');
        view.setUint32(40, pcmData.length * 2, true);

        // Combine header and data
        const wavBlob = new Blob([wavHeader, pcmData], { type: 'audio/wav' });
        return await wavBlob.arrayBuffer();
      }

      return result.audio;
    } catch (error) {
      console.error('Error in text-to-speech:', error);
      throw error;
    }
  }

  // Helper function to write strings to DataView
  private writeString(view: DataView, offset: number, string: string) {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
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
}
