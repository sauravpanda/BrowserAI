// src/index.js (Main entry point)

import { MLCEngineWrapper } from '../../engines/mlc-engine-wrapper';
import { TransformersEngineWrapper } from '../../engines/transformer-engine-wrapper';
import { ModelConfig, MLCConfig, TransformersConfig } from '../../config/models/types';
import mlcModels from '../../config/models/mlc-models.json';
import transformersModels from '../../config/models/transformers-models.json';
import { TTSEngine } from '@/engines/tts-engine';

// Combine model configurations
const MODEL_CONFIG: Record<string, ModelConfig> = {
  ...(mlcModels as Record<string, MLCConfig>),
  ...(transformersModels as Record<string, TransformersConfig>),
};

export class BrowserAI {
  private engine: MLCEngineWrapper | TransformersEngineWrapper | null;
  public currentModel: ModelConfig | null;
  private mediaRecorder: MediaRecorder | null = null;
  private audioChunks: Blob[] = [];
  private modelIdentifier: string | null = null;
  private ttsEngine: TTSEngine | null = null;
  private customModels: Record<string, ModelConfig> = {};

  constructor() {
    this.engine = null;
    this.currentModel = null;
  }

  registerCustomModel(modelIdentifier: string, modelConfig: ModelConfig): void {
    if (MODEL_CONFIG[modelIdentifier]) {
      console.warn(`Overriding existing model with identifier "${modelIdentifier}"`);
    }
    this.customModels[modelIdentifier] = modelConfig;
  }

  async loadModel(modelIdentifier: string, options: Record<string, unknown> = {}): Promise<void> {
    this.modelIdentifier = modelIdentifier;
    // Check custom models first, then fall back to built-in models
    const modelConfig = this.customModels[this.modelIdentifier] || MODEL_CONFIG[this.modelIdentifier];
    if (!modelConfig) {
      throw new Error(`Model identifier "${this.modelIdentifier}" not recognized.`);
    }

    // Check if model exists in both MLC and Transformers configs
    const mlcVersion = (mlcModels as Record<string, MLCConfig>)[this.modelIdentifier];
    // const transformersVersion = (transformersModels as Record<string, TransformersConfig>)[modelIdentifier];

    // For text-generation models, prefer MLC if available
    let engineToUse = modelConfig.engine;
    if (modelConfig.modelType === 'text-generation' && mlcVersion) {
      engineToUse = 'mlc';
    }

    switch (engineToUse) {
      case 'mlc':
        this.engine = new MLCEngineWrapper();
        await this.engine.loadModel(mlcVersion || modelConfig, options);
        break;
      case 'transformers':
        this.engine = new TransformersEngineWrapper();
        await this.engine.loadModel(modelConfig, options);
        break;
      default:
        throw new Error(`Engine "${engineToUse}" not supported.`);
    }

    this.currentModel = modelConfig;
  }

  async generateText(prompt: string, options: Record<string, unknown> = {}): Promise<unknown> {
    if (!this.engine) {
      throw new Error('No model loaded. Please call loadModel first.');
    }

    try {
      const result = await this.engine.generateText(prompt, options);
      return result;
    } catch (error) {
      console.error('Error generating text:', error);
      throw error;
    }
  }

  async embed(input: string, options: Record<string, unknown> = {}): Promise<unknown> {
    if (!this.engine) {
      throw new Error('No model loaded. Please call loadModel first.');
    }
    return await this.engine.embed(input, options);
  }

  async transcribeAudio(audio: Blob | Float32Array, options: Record<string, unknown> = {}): Promise<unknown> {
    if (!this.engine) {
      throw new Error('No model loaded. Please call loadModel first.');
    }

    try {
      if (this.engine instanceof TransformersEngineWrapper) {
        if (audio instanceof Blob) {
          const audioContext = new AudioContext({
            sampleRate: 16000, // Force 16kHz sample rate
          });

          const arrayBuffer = await audio.arrayBuffer();
          const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

          // Ensure we get the correct number of samples
          const float32Data = new Float32Array(Math.floor(audioBuffer.length));
          audioBuffer.copyFromChannel(float32Data, 0);

          // Clean up
          audioContext.close();

          return await this.engine.transcribe(float32Data, options);
        }
        return await this.engine.transcribe(audio, options);
      } else {
        throw new Error('Engine does not support transcribe method.');
      }
    } catch (error) {
      console.error('Transcription error:', error);
      throw error;
    }
  }

  async startRecording(): Promise<void> {
    if (this.mediaRecorder) {
      throw new Error('Recording already in progress');
    }

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    this.mediaRecorder = new MediaRecorder(stream);
    this.audioChunks = [];

    this.mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        this.audioChunks.push(event.data);
      }
    };

    this.mediaRecorder.start();
  }

  async stopRecording(): Promise<Blob> {
    return new Promise((resolve, reject) => {
      if (!this.mediaRecorder || this.mediaRecorder.state === 'inactive') {
        reject(new Error('No recording in progress'));
        return;
      }

      this.mediaRecorder.onstop = () => {
        const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm' });
        this.audioChunks = [];
        this.mediaRecorder = null;
        resolve(audioBlob);
      };

      this.mediaRecorder.stop();
    });
  }

  async generateResponse(text: string): Promise<string> {
    if (!this.modelIdentifier) {
      throw new Error('No model loaded. Please call loadModel first.');
    }
    if (this.currentModel?.modelName !== this.modelIdentifier) {
      await this.loadModel(this.modelIdentifier);
    }
    const response = await this.generateText(text);
    return response as string;
  }

  async textToSpeech(text: string, options: Record<string, unknown> = {}): Promise<ArrayBuffer> {
    if (!this.ttsEngine) {
      this.ttsEngine = new TTSEngine();
      await this.ttsEngine.loadModel(MODEL_CONFIG['kokoro-tts'], {
        quantized: true,
        device: 'webgpu',
        ...options,
      });
    }

    try {
      const audioData = await this.ttsEngine.generateSpeech(text, options);
      return audioData;
    } catch (error) {
      console.error('Error generating speech:', error);
      throw error;
    }
  }

  async generateImage(text: string, options: Record<string, unknown> = {}): Promise<string> {
    if (!this.modelIdentifier) {
      throw new Error('No model loaded. Please call loadModel first.');
    }

    if (this.currentModel?.modelType !== 'multimodal') {
      throw new Error('Current model does not support multimodal inputs.');
    }

    if (this.engine instanceof TransformersEngineWrapper) {
      const response = await this.engine.generateImage({
        text: text as string,
      }, options);
      return response;
    }

    throw new Error('Current engine does not support multimodal generation');
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

  async clearSpecificModelCache(modelIdentifier: string): Promise<void> {
    if (!this.engine || !(this.engine instanceof MLCEngineWrapper)) {
      throw new Error('MLC Engine not initialized.');
    }
    
    try {
      await this.engine.clearSpecificModel(modelIdentifier);
      console.log(`Successfully cleared cache for model: ${modelIdentifier}`);
    } catch (error) {
      console.error(`Error clearing model cache for ${modelIdentifier}:`, error);
      throw error;
    }
  }

  dispose() {
    if (this.engine instanceof MLCEngineWrapper) {
      this.engine.dispose();
    }
    this.engine = null;
    this.currentModel = null;
  }
}
