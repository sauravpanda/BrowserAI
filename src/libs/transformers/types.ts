import { Processor } from './base/processing_utils';
import { GenerationConfig } from './generation/configuration_utils';
import { PreTrainedModel } from './models';
import { PreTrainedTokenizer } from './tokenizers';
import { RawImage } from './utils/image';
import { Tensor } from './utils/tensor';
import { SUPPORTED_TASKS, TASK_ALIASES } from './pipelines';
// Core types
export interface Message {
  role: string;
  content: string;
}

export type Chat = Message[];

export type ImageInput = string | RawImage | URL;
export type ImagePipelineInputs = ImageInput | ImageInput[];

export type AudioInput = string | URL | Float32Array | Float64Array;
export type AudioPipelineInputs = AudioInput | AudioInput[];

// Pipeline types
export interface TextGenerationSingle {
  generated_text: string | Chat;
}
export type TextGenerationOutput = TextGenerationSingle[];

export interface TextGenerationSpecificParams {
  add_special_tokens?: boolean;
  return_full_text?: boolean;
}

export interface TextGenerationConfig extends GenerationConfig, TextGenerationSpecificParams {}

// Constructor args
export interface ModelTokenizerConstructorArgs {
  task: string;
  model: PreTrainedModel;
  tokenizer: PreTrainedTokenizer;
}

export interface ModelProcessorConstructorArgs {
  task: string;
  model: PreTrainedModel;
  processor: Processor;
}

export interface ModelTokenizerProcessorConstructorArgs {
  task: string;
  model: PreTrainedModel;
  tokenizer: PreTrainedTokenizer;
  processor: Processor;
}

export type TextPipelineConstructorArgs = ModelTokenizerConstructorArgs;
export type AudioPipelineConstructorArgs = ModelProcessorConstructorArgs;
export type ImagePipelineConstructorArgs = ModelProcessorConstructorArgs;
export type TextAudioPipelineConstructorArgs = ModelTokenizerProcessorConstructorArgs;
export type TextImagePipelineConstructorArgs = ModelTokenizerProcessorConstructorArgs;

// Pipeline callbacks
export type TextGenerationPipelineCallback = (
  texts: string | string[] | Chat | Chat[],
  options?: Partial<TextGenerationConfig>,
) => Promise<TextGenerationOutput | TextGenerationOutput[]>;

export type FeatureExtractionPipelineCallback = (
  texts: string | string[],
  options?: FeatureExtractionPipelineOptions,
) => Promise<Tensor>;

export type ImageFeatureExtractionPipelineCallback = (
  images: ImagePipelineInputs,
  options?: ImageFeatureExtractionPipelineOptions,
) => Promise<Tensor>;

// Pipeline options
export interface FeatureExtractionPipelineOptions {
  pooling?: 'none' | 'mean' | 'cls';
  normalize?: boolean;
  quantize?: boolean;
  precision?: 'binary' | 'ubinary';
}

export interface ImageFeatureExtractionPipelineOptions {
  pool?: boolean | null;
}

// Task types
export type TaskType = keyof typeof SUPPORTED_TASKS;
export type AliasType = keyof typeof TASK_ALIASES;
export type PipelineType = TaskType | AliasType;
