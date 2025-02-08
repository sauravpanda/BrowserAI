export interface BaseModelConfig {
  modelName: string;
  modelType: ModelType;
  repo: string;
  pipeline: string;
  defaultQuantization: string;
  supportedDTypes?: string[];
  contextLength?: number;
  defaultParams?: Record<string, any>;
  quantizations?: string[];
  requiredFeatures?: string[];
  modelLibrary?: string;
  metadata?: Record<string, any>;
}

export type ModelType =
  | 'text-generation'
  | 'sentiment-analysis'
  | 'feature-extraction'
  | 'automatic-speech-recognition'
  | 'multimodal'
  | 'text-to-speech';

export interface MLCConfig extends BaseModelConfig {
  engine: 'mlc';
  quantized?: boolean;
  threads?: number;
  overrides?: Record<string, any>;
}

export interface TransformersConfig extends BaseModelConfig {
  engine: 'transformers';
  revision?: string;
}

export type ModelConfig = MLCConfig | TransformersConfig;
