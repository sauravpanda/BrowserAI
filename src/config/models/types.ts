export interface BaseModelConfig {
  modelName: string;
  modelType: ModelType;
  repo: string;
  pipeline: string;
  defaultQuantization: string;
  supportedDTypes?: string[];
  contextLength?: number;
  defaultParams?: Record<string, unknown>;
  quantizations?: string[];
  requiredFeatures?: string[];
  modelLibrary?: string;
  metadata?: Record<string, unknown>;
}

export type ModelType =
  | 'text-generation'
  | 'sentiment-analysis'
  | 'feature-extraction'
  | 'automatic-speech-recognition'
  | 'multimodal'
  | 'text-to-speech'
  | 'audio-source-separation';

export interface MLCConfig extends BaseModelConfig {
  engine: 'mlc';
  quantized?: boolean;
  threads?: number;
  overrides?: Record<string, unknown>;
}

export interface TransformersConfig extends BaseModelConfig {
  engine: 'transformers';
  revision?: string;
}

export interface DemucsConfig extends BaseModelConfig {
  engine: 'demucs';
  modelUrl: string;
  sampleRate: number;
  segmentSamples: number;
  channels: number;
  sources: string[];
  executionProviders?: ('webgpu' | 'wasm')[];
}

export interface FlareConfig extends BaseModelConfig {
  engine: 'flare';
  /** Direct URL to the GGUF model file (overrides registry URL) */
  url?: string;
  /** Model architecture hint (e.g. 'llama', 'mistral', 'qwen2') */
  architecture?: string;
  /** Quantization string (e.g. 'Q8_0', 'Q4_K_M') */
  quantization?: string;
  /** Approximate download size in MB */
  downloadSizeMB?: number;
}

export type ModelConfig = MLCConfig | TransformersConfig | DemucsConfig | FlareConfig;
