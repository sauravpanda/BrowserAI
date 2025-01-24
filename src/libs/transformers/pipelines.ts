/**
 * @file Pipelines provide a high-level, easy to use, API for running machine learning models.
 *
 * **Example:** Instantiate pipeline using the `pipeline` function.
 * ```javascript
 * import { pipeline } from '@huggingface/transformers';
 *
 * const classifier = await pipeline('sentiment-analysis');
 * const output = await classifier('I love transformers!');
 * // [{'label': 'POSITIVE', 'score': 0.999817686}]
 * ```
 *
 * @module pipelines
 */

import { AutoTokenizer, PreTrainedTokenizer } from './tokenizers';
import {
  AutoModel,
  AutoModelForSpeechSeq2Seq,
  AutoModelForTextToWaveform,
  AutoModelForTextToSpectrogram,
  AutoModelForCTC,
  AutoModelForCausalLM,
  AutoModelForVision2Seq,
  AutoModelForImageToImage,
  AutoModelForImageFeatureExtraction,
  PreTrainedModel,
} from './models';
import { AutoProcessor } from './models/auto/processing_auto';
import { Processor } from './base/processing_utils';

import { Callable } from './utils/generic.js';

import { dispatchCallback, product } from './utils/core';
import { softmax, max, round } from './utils/maths';
import { read_audio, RawAudio } from './utils/audio';
import { Tensor, mean_pooling, interpolate_4d, quantize_embeddings, topk } from './utils/tensor';
import { RawImage } from './utils/image';
import { PretrainedOptions } from './utils/hub';
import { ImagePipelineConstructorArgs, Message, TextGenerationOutput, TextImagePipelineConstructorArgs } from './types';
import {
  ImageFeatureExtractionPipelineOptions,
  ImagePipelineInputs,
  AudioPipelineInputs,
  TextPipelineConstructorArgs,
  PipelineType,
  TextAudioPipelineConstructorArgs,
} from './types';
/**
 * @typedef {string | RawImage | URL} ImageInput
 * @typedef {ImageInput|ImageInput[]} ImagePipelineInputs
 */

/**
 * Prepare images for further tasks.
 * @param {ImagePipelineInputs} images images to prepare.
 * @returns {Promise<RawImage[]>} returns processed images.
 * @private
 */

async function prepareImages(images: ImagePipelineInputs) {
  if (!Array.isArray(images)) {
    images = [images];
  }

  // Possibly convert any non-images to images
  return await Promise.all(images.map((x) => RawImage.read(x)));
}

/**
 * @typedef {string | URL | Float32Array | Float64Array} AudioInput
 * @typedef {AudioInput|AudioInput[]} AudioPipelineInputs
 */

type AudioInput = string | URL | Float32Array | Float64Array;

/**
 * Prepare audios for further tasks.
 * @param {AudioPipelineInputs} audios audios to prepare.
 * @param {number} sampling_rate sampling rate of the audios.
 * @returns {Promise<Float32Array[]>} The preprocessed audio data.
 * @private
 */
async function prepareAudios(audios: AudioPipelineInputs, sampling_rate: number) {
  if (!Array.isArray(audios)) {
    audios = [audios];
  }

  return await Promise.all(
    audios.map((x) => {
      if (typeof x === 'string' || x instanceof URL) {
        return read_audio(x, sampling_rate);
      } else if (x instanceof Float64Array) {
        return new Float32Array(x);
      }
      return x;
    }),
  );
}

/**
 * @typedef {Object} BoundingBox
 * @property {number} xmin The minimum x coordinate of the bounding box.
 * @property {number} ymin The minimum y coordinate of the bounding box.
 * @property {number} xmax The maximum x coordinate of the bounding box.
 * @property {number} ymax The maximum y coordinate of the bounding box.
 */

/**
 * Helper function to convert list [xmin, xmax, ymin, ymax] into object { "xmin": xmin, ... }
 * @param {number[]} box The bounding box as a list.
 * @param {boolean} asInteger Whether to cast to integers.
 * @returns {BoundingBox} The bounding box as an object.
 * @private
 */
function get_bounding_box(box: number[], asInteger: boolean) {
  if (asInteger) {
    box = box.map((x) => x | 0);
  }
  const [xmin, ymin, xmax, ymax] = box;

  return { xmin, ymin, xmax, ymax };
}

/**
 * @callback DisposeType Disposes the item.
 * @returns {Promise<void>} A promise that resolves when the item has been disposed.
 *
 * @typedef {Object} Disposable
 * @property {DisposeType} dispose A promise that resolves when the pipeline has been disposed.
 */

/**
 * The Pipeline class is the class from which all pipelines inherit.
 * Refer to this class for methods shared across different pipelines.
 */
export abstract class Pipeline extends Callable {
  /**
   * Create a new Pipeline.
   * @param {Object} options An object containing the following properties:
   * @param {string} [options.task] The task of the pipeline. Useful for specifying subtasks.
   * @param {PreTrainedModel} [options.model] The model used by the pipeline.
   * @param {PreTrainedTokenizer} [options.tokenizer=null] The tokenizer used by the pipeline (if any).
   * @param {Processor} [options.processor=null] The processor used by the pipeline (if any).
   */
  task: string;
  model: PreTrainedModel;
  tokenizer: PreTrainedTokenizer | null;
  processor: Processor | null;

  constructor({
    task,
    model,
    tokenizer = null,
    processor = null,
  }: {
    task: string;
    model: PreTrainedModel;
    tokenizer?: PreTrainedTokenizer | null;
    processor?: Processor | null;
  }) {
    super();
    this.task = task;
    this.model = model;
    this.tokenizer = tokenizer;
    this.processor = processor;
  }

  async dispose(): Promise<void> {
    await this.model.dispose();
  }

  public abstract _call(...args: any[]): Promise<any>;
}

/**
 * @typedef {Object} ModelTokenizerConstructorArgs
 * @property {string} task The task of the pipeline. Useful for specifying subtasks.
 * @property {PreTrainedModel} model The model used by the pipeline.
 * @property {PreTrainedTokenizer} tokenizer The tokenizer used by the pipeline.
 *
 * @typedef {ModelTokenizerConstructorArgs} TextPipelineConstructorArgs An object used to instantiate a text-based pipeline.
 */

/**
 * @typedef {Object} ModelProcessorConstructorArgs
 * @property {string} task The task of the pipeline. Useful for specifying subtasks.
 * @property {PreTrainedModel} model The model used by the pipeline.
 * @property {Processor} processor The processor used by the pipeline.
 *
 * @typedef {ModelProcessorConstructorArgs} AudioPipelineConstructorArgs An object used to instantiate an audio-based pipeline.
 * @typedef {ModelProcessorConstructorArgs} ImagePipelineConstructorArgs An object used to instantiate an image-based pipeline.
 */

/**
 * @typedef {Object} ModelTokenizerProcessorConstructorArgs
 * @property {string} task The task of the pipeline. Useful for specifying subtasks.
 * @property {PreTrainedModel} model The model used by the pipeline.
 * @property {PreTrainedTokenizer} tokenizer The tokenizer used by the pipeline.
 * @property {Processor} processor The processor used by the pipeline.
 *
 * @typedef {ModelTokenizerProcessorConstructorArgs} TextAudioPipelineConstructorArgs An object used to instantiate a text- and audio-based pipeline.
 * @typedef {ModelTokenizerProcessorConstructorArgs} TextImagePipelineConstructorArgs An object used to instantiate a text- and image-based pipeline.
 */

/**
 * @typedef {import('./tokenizers.js').Message[]} Chat
 *
 * @typedef {Object} TextGenerationSingle
 * @property {string|Chat} generated_text The generated text.
 * @typedef {TextGenerationSingle[]} TextGenerationOutput
 *
 * @typedef {Object} TextGenerationSpecificParams Parameters specific to text-generation pipelines.
 * @property {boolean} [add_special_tokens] Whether or not to add special tokens when tokenizing the sequences.
 * @property {boolean} [return_full_text=true] If set to `false` only added text is returned, otherwise the full text is returned.
 * @typedef {import('./generation/configuration_utils.js').GenerationConfig & TextGenerationSpecificParams} TextGenerationConfig
 *
 * @callback TextGenerationPipelineCallback Complete the prompt(s) given as inputs.
 * @param {string|string[]|Chat|Chat[]} texts One or several prompts (or one list of prompts) to complete.
 * @param {Partial<TextGenerationConfig>} [options] Additional keyword arguments to pass along to the generate method of the model.
 * @returns {Promise<TextGenerationOutput|TextGenerationOutput[]>} An array or object containing the generated texts.
 *
 * @typedef {TextPipelineConstructorArgs & TextGenerationPipelineCallback & Disposable} TextGenerationPipelineType
 */

/**
 * Language generation pipeline using any `ModelWithLMHead` or `ModelForCausalLM`.
 * This pipeline predicts the words that will follow a specified text prompt.
 * NOTE: For the full list of generation parameters, see [`GenerationConfig`](./utils/generation#module_utils/generation.GenerationConfig).
 *
 * **Example:** Text generation with `Xenova/distilgpt2` (default settings).
 * ```javascript
 * const generator = await pipeline('text-generation', 'Xenova/distilgpt2');
 * const text = 'I enjoy walking with my cute dog,';
 * const output = await generator(text);
 * // [{ generated_text: "I enjoy walking with my cute dog, and I love to play with the other dogs." }]
 * ```
 *
 * **Example:** Text generation with `Xenova/distilgpt2` (custom settings).
 * ```javascript
 * const generator = await pipeline('text-generation', 'Xenova/distilgpt2');
 * const text = 'Once upon a time, there was';
 * const output = await generator(text, {
 *   temperature: 2,
 *   max_new_tokens: 10,
 *   repetition_penalty: 1.5,
 *   no_repeat_ngram_size: 2,
 *   num_beams: 2,
 *   num_return_sequences: 2,
 * });
 * // [{
 * //   "generated_text": "Once upon a time, there was an abundance of information about the history and activities that"
 * // }, {
 * //   "generated_text": "Once upon a time, there was an abundance of information about the most important and influential"
 * // }]
 * ```
 *
 * **Example:** Run code generation with `Xenova/codegen-350M-mono`.
 * ```javascript
 * const generator = await pipeline('text-generation', 'Xenova/codegen-350M-mono');
 * const text = 'def fib(n):';
 * const output = await generator(text, {
 *   max_new_tokens: 44,
 * });
 * // [{
 * //   generated_text: 'def fib(n):\n' +
 * //     '    if n == 0:\n' +
 * //     '        return 0\n' +
 * //     '    elif n == 1:\n' +
 * //     '        return 1\n' +
 * //     '    else:\n' +
 * //     '        return fib(n-1) + fib(n-2)\n'
 * // }]
 * ```
 */
type Chat = Message[];
export class TextGenerationPipeline
  extends /** @type {new (options: TextPipelineConstructorArgs) => TextGenerationPipelineType} */ Pipeline
{
  /**
   * Create a new TextGenerationPipeline.
   * @param {TextPipelineConstructorArgs} options An object used to instantiate the pipeline.
   */
  constructor(options: TextPipelineConstructorArgs) {
    super(options);
  }

  /** @type {TextGenerationPipelineCallback} */
  async _call(texts: string | string[] | Chat | Chat[], generate_kwargs = {}) {
    let isBatched = false;
    let isChatInput = false;

    // Normalize inputs
    /** @type {string[]} */
    let inputs;
    if (typeof texts === 'string') {
      inputs = texts = [texts];
    } else if (Array.isArray(texts) && texts.every((x) => typeof x === 'string')) {
      isBatched = true;
      inputs = /** @type {string[]} */ texts;
    } else {
      if (isChat(texts)) {
        texts = [texts as Chat];
      } else if (Array.isArray(texts) && texts.every(isChat)) {
        isBatched = true;
      } else {
        throw new Error('Input must be a string, an array of strings, a Chat, or an array of Chats');
      }
      isChatInput = true;

      // If the input is a chat, we need to apply the chat template
      inputs = /** @type {string[]} */ /** @type {Chat[]} */ texts.map((x: any) =>
        this.tokenizer!.apply_chat_template(x, {
          tokenize: false,
          add_generation_prompt: true,
        }),
      );
    }

    // By default, do not add special tokens
    const add_special_tokens = (generate_kwargs as any).add_special_tokens ?? false;

    // By default, return full text
    const return_full_text = isChatInput ? false : ((generate_kwargs as any).return_full_text ?? true);

    this.tokenizer!.padding_side = 'left';
    const model_inputs = (this.tokenizer as any)(texts, {
      add_special_tokens,
      padding: true,
      truncation: true,
    } as any);

    const outputTokenIds = /** @type {Tensor} */ await this.model.generate({
      ...model_inputs,
      ...generate_kwargs,
    });

    const decoded = (this.tokenizer as any).batch_decode(outputTokenIds, {
      skip_special_tokens: true,
    });

    let promptLengths;
    if (!return_full_text && (model_inputs as any).input_ids.dims.at(-1) > 0) {
      promptLengths = (this.tokenizer as any)
        .batch_decode((model_inputs as any).input_ids, {
          skip_special_tokens: true,
        })
        .map((x: any) => x.length);
    }

    /** @type {TextGenerationOutput[]} */
    const toReturn: TextGenerationOutput[] = Array.from({ length: texts.length }, (_) => []);
    for (let i = 0; i < (decoded as any).length; ++i) {
      const textIndex = Math.floor((i / (outputTokenIds as any).dims[0]) * texts.length);

      if (promptLengths) {
        // Trim the decoded text to only include the generated part
        decoded[i] = (decoded as any)[i].slice(promptLengths[textIndex]);
      }
      toReturn[textIndex].push({
        generated_text: isChatInput
          ? [.../** @type {Chat[]} */ texts[textIndex], { role: 'assistant', content: decoded[i] }]
          : decoded[i],
      });
    }
    return !isBatched && toReturn.length === 1 ? toReturn[0] : toReturn;
  }
}

/**
 * @typedef {Object} FeatureExtractionPipelineOptions Parameters specific to feature extraction pipelines.
 * @property {'none'|'mean'|'cls'} [pooling="none"] The pooling method to use.
 * @property {boolean} [normalize=false] Whether or not to normalize the embeddings in the last dimension.
 * @property {boolean} [quantize=false] Whether or not to quantize the embeddings.
 * @property {'binary'|'ubinary'} [precision='binary'] The precision to use for quantization.
 *
 * @callback FeatureExtractionPipelineCallback Extract the features of the input(s).
 * @param {string|string[]} texts One or several texts (or one list of texts) to get the features of.
 * @param {FeatureExtractionPipelineOptions} [options] The options to use for feature extraction.
 * @returns {Promise<Tensor>} The features computed by the model.
 *
 * @typedef {TextPipelineConstructorArgs & FeatureExtractionPipelineCallback & Disposable} FeatureExtractionPipelineType
 */

/**
 * Feature extraction pipeline using no model head. This pipeline extracts the hidden
 * states from the base transformer, which can be used as features in downstream tasks.
 *
 * **Example:** Run feature extraction with `bert-base-uncased` (without pooling/normalization).
 * ```javascript
 * const extractor = await pipeline('feature-extraction', 'Xenova/bert-base-uncased', { revision: 'default' });
 * const output = await extractor('This is a simple test.');
 * // Tensor {
 * //   type: 'float32',
 * //   data: Float32Array [0.05939924716949463, 0.021655935794115067, ...],
 * //   dims: [1, 8, 768]
 * // }
 * ```
 *
 * **Example:** Run feature extraction with `bert-base-uncased` (with pooling/normalization).
 * ```javascript
 * const extractor = await pipeline('feature-extraction', 'Xenova/bert-base-uncased', { revision: 'default' });
 * const output = await extractor('This is a simple test.', { pooling: 'mean', normalize: true });
 * // Tensor {
 * //   type: 'float32',
 * //   data: Float32Array [0.03373778983950615, -0.010106077417731285, ...],
 * //   dims: [1, 768]
 * // }
 * ```
 *
 * **Example:** Calculating embeddings with `sentence-transformers` models.
 * ```javascript
 * const extractor = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
 * const output = await extractor('This is a simple test.', { pooling: 'mean', normalize: true });
 * // Tensor {
 * //   type: 'float32',
 * //   data: Float32Array [0.09094982594251633, -0.014774246141314507, ...],
 * //   dims: [1, 384]
 * // }
 * ```
 * **Example:** Calculating binary embeddings with `sentence-transformers` models.
 * ```javascript
 * const extractor = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
 * const output = await extractor('This is a simple test.', { pooling: 'mean', quantize: true, precision: 'binary' });
 * // Tensor {
 * //   type: 'int8',
 * //   data: Int8Array [49, 108, 24, ...],
 * //   dims: [1, 48]
 * // }
 * ```
 */
export class FeatureExtractionPipeline
  extends /** @type {new (options: TextPipelineConstructorArgs) => FeatureExtractionPipelineType} */ Pipeline
{
  /**
   * Create a new FeatureExtractionPipeline.
   * @param {TextPipelineConstructorArgs} options An object used to instantiate the pipeline.
   */
  constructor(options: TextPipelineConstructorArgs) {
    super(options);
  }

  /** @type {FeatureExtractionPipelineCallback} */
  async _call(
    texts: string | string[],
    {
      pooling = /** @type {'none'} */ 'none',
      normalize = false,
      quantize = false,
      precision = /** @type {'binary'} */ 'binary',
    } = {},
  ) {
    // Run tokenization
    const model_inputs = (this.tokenizer as any)(texts, {
      padding: true,
      truncation: true,
    });

    // Run model
    const outputs = await (this.model as any)(model_inputs);

    // TODO: Provide warning to the user that they might be using model which was not exported
    // specifically for feature extraction
    // console.log(this.model.config)
    // console.log(outputs)

    /** @type {Tensor} */
    let result = outputs.last_hidden_state ?? outputs.logits ?? outputs.token_embeddings;
    if (pooling === 'none') {
      // Skip pooling
    } else if (pooling === 'mean') {
      result = mean_pooling(result, model_inputs.attention_mask);
    } else if (pooling === 'cls') {
      result = result.slice(null, 0);
    } else {
      throw Error(`Pooling method '${pooling}' not supported.`);
    }

    if (normalize) {
      result = result.normalize(2, -1);
    }

    if (quantize) {
      result = quantize_embeddings(result, precision as any);
    }

    return result;
  }
}

/**
 * @typedef {Object} ImageFeatureExtractionPipelineOptions Parameters specific to image feature extraction pipelines.
 * @property {boolean} [pool=null] Whether or not to return the pooled output. If set to `false`, the model will return the raw hidden states.
 *
 * @callback ImageFeatureExtractionPipelineCallback Extract the features of the input(s).
 * @param {ImagePipelineInputs} images One or several images (or one list of images) to get the features of.
 * @param {ImageFeatureExtractionPipelineOptions} [options] The options to use for image feature extraction.
 * @returns {Promise<Tensor>} The image features computed by the model.
 *
 * @typedef {ImagePipelineConstructorArgs & ImageFeatureExtractionPipelineCallback & Disposable} ImageFeatureExtractionPipelineType
 */

/**
 * Image feature extraction pipeline using no model head. This pipeline extracts the hidden
 * states from the base transformer, which can be used as features in downstream tasks.
 *
 * **Example:** Perform image feature extraction with `Xenova/vit-base-patch16-224-in21k`.
 * ```javascript
 * const image_feature_extractor = await pipeline('image-feature-extraction', 'Xenova/vit-base-patch16-224-in21k');
 * const url = 'https://huggingface.co/datasets/huggingface/documentation-images/resolve/main/cats.png';
 * const features = await image_feature_extractor(url);
 * // Tensor {
 * //   dims: [ 1, 197, 768 ],
 * //   type: 'float32',
 * //   data: Float32Array(151296) [ ... ],
 * //   size: 151296
 * // }
 * ```
 *
 * **Example:** Compute image embeddings with `Xenova/clip-vit-base-patch32`.
 * ```javascript
 * const image_feature_extractor = await pipeline('image-feature-extraction', 'Xenova/clip-vit-base-patch32');
 * const url = 'https://huggingface.co/datasets/huggingface/documentation-images/resolve/main/cats.png';
 * const features = await image_feature_extractor(url);
 * // Tensor {
 * //   dims: [ 1, 512 ],
 * //   type: 'float32',
 * //   data: Float32Array(512) [ ... ],
 * //   size: 512
 * // }
 * ```
 */
export class ImageFeatureExtractionPipeline
  extends /** @type {new (options: ImagePipelineConstructorArgs) => ImageFeatureExtractionPipelineType} */ Pipeline
{
  /**
   * Create a new ImageFeatureExtractionPipeline.
   * @param {ImagePipelineConstructorArgs} options An object used to instantiate the pipeline.
   */
  constructor(options: ImagePipelineConstructorArgs) {
    super(options);
  }

  /** @type {ImageFeatureExtractionPipelineCallback} */
  async _call(images: ImagePipelineInputs, { pool = null } = {}) {
    const preparedImages = await prepareImages(images);
    const { pixel_values } = await (this.processor as any)(preparedImages);
    const outputs = await (this.model as any)({ pixel_values });

    /** @type {Tensor} */
    let result;
    if (pool) {
      if (!('pooler_output' in outputs)) {
        throw Error(
          `No pooled output was returned. Make sure the model has a 'pooler' layer when using the 'pool' option.`,
        );
      }
      result = outputs.pooler_output;
    } else {
      result = outputs.last_hidden_state ?? outputs.logits ?? outputs.image_embeds;
    }
    return result;
  }
}

/**
 * @typedef {Object} Chunk
 * @property {[number, number]} timestamp The start and end timestamp of the chunk in seconds.
 * @property {string} text The recognized text.
 */

/**
 * @typedef {Object} AutomaticSpeechRecognitionOutput
 * @property {string} text The recognized text.
 * @property {Chunk[]} [chunks] When using `return_timestamps`, the `chunks` will become a list
 * containing all the various text chunks identified by the model.
 *
 * @typedef {Object} AutomaticSpeechRecognitionSpecificParams Parameters specific to automatic-speech-recognition pipelines.
 * @property {boolean|'word'} [return_timestamps] Whether to return timestamps or not. Default is `false`.
 * @property {number} [chunk_length_s] The length of audio chunks to process in seconds. Default is 0 (no chunking).
 * @property {number} [stride_length_s] The length of overlap between consecutive audio chunks in seconds. If not provided, defaults to `chunk_length_s / 6`.
 * @property {boolean} [force_full_sequences] Whether to force outputting full sequences or not. Default is `false`.
 * @property {string} [language] The source language. Default is `null`, meaning it should be auto-detected. Use this to potentially improve performance if the source language is known.
 * @property {string} [task] The task to perform. Default is `null`, meaning it should be auto-detected.
 * @property {number} [num_frames] The number of frames in the input audio.
 * @typedef {import('./generation/configuration_utils.js').GenerationConfig & AutomaticSpeechRecognitionSpecificParams} AutomaticSpeechRecognitionConfig
 *
 * @callback AutomaticSpeechRecognitionPipelineCallback Transcribe the audio sequence(s) given as inputs to text.
 * @param {AudioPipelineInputs} audio The input audio file(s) to be transcribed. The input is either:
 * - `string` or `URL` that is the filename/URL of the audio file, the file will be read at the processor's sampling rate
 * to get the waveform using the [`AudioContext`](https://developer.mozilla.org/en-US/docs/Web/API/AudioContext) API.
 * If `AudioContext` is not available, you should pass the raw waveform in as a Float32Array of shape `(n, )`.
 * - `Float32Array` or `Float64Array` of shape `(n, )`, representing the raw audio at the correct sampling rate (no further check will be done).
 * @param {Partial<AutomaticSpeechRecognitionConfig>} [options] Additional keyword arguments to pass along to the generate method of the model.
 * @returns {Promise<AutomaticSpeechRecognitionOutput|AutomaticSpeechRecognitionOutput[]>} An object containing the transcription text and optionally timestamps if `return_timestamps` is `true`.
 *
 * @typedef {TextAudioPipelineConstructorArgs & AutomaticSpeechRecognitionPipelineCallback & Disposable} AutomaticSpeechRecognitionPipelineType
 */

interface Chunk {
  timestamp: [number, number];
  text: string;
}

interface AutomaticSpeechRecognitionOutput {
  text: string;
  chunks?: Chunk[];
}

interface AutomaticSpeechRecognitionSpecificParams {
  return_timestamps?: boolean | 'word';
  chunk_length_s?: number;
  stride_length_s?: number;
  force_full_sequences?: boolean;
  language?: string;
  task?: string;
  num_frames?: number;
}

type AutomaticSpeechRecognitionConfig = import('./generation/configuration_utils.js').GenerationConfig &
  AutomaticSpeechRecognitionSpecificParams;

type AutomaticSpeechRecognitionPipelineCallback = (
  audio: AudioPipelineInputs,
  options?: Partial<AutomaticSpeechRecognitionConfig>,
) => Promise<AutomaticSpeechRecognitionOutput | AutomaticSpeechRecognitionOutput[]>;

type AutomaticSpeechRecognitionPipelineType = TextAudioPipelineConstructorArgs &
  AutomaticSpeechRecognitionPipelineCallback &
  Disposable;

/**
 * Pipeline that aims at extracting spoken text contained within some audio.
 *
 * **Example:** Transcribe English.
 * ```javascript
 * const transcriber = await pipeline('automatic-speech-recognition', 'Xenova/whisper-tiny.en');
 * const url = 'https://huggingface.co/datasets/Xenova/transformers.js-docs/resolve/main/jfk.wav';
 * const output = await transcriber(url);
 * // { text: " And so my fellow Americans ask not what your country can do for you, ask what you can do for your country." }
 * ```
 *
 * **Example:** Transcribe English w/ timestamps.
 * ```javascript
 * const transcriber = await pipeline('automatic-speech-recognition', 'Xenova/whisper-tiny.en');
 * const url = 'https://huggingface.co/datasets/Xenova/transformers.js-docs/resolve/main/jfk.wav';
 * const output = await transcriber(url, { return_timestamps: true });
 * // {
 * //   text: " And so my fellow Americans ask not what your country can do for you, ask what you can do for your country."
 * //   chunks: [
 * //     { timestamp: [0, 8],  text: " And so my fellow Americans ask not what your country can do for you" }
 * //     { timestamp: [8, 11], text: " ask what you can do for your country." }
 * //   ]
 * // }
 * ```
 *
 * **Example:** Transcribe English w/ word-level timestamps.
 * ```javascript
 * const transcriber = await pipeline('automatic-speech-recognition', 'Xenova/whisper-tiny.en');
 * const url = 'https://huggingface.co/datasets/Xenova/transformers.js-docs/resolve/main/jfk.wav';
 * const output = await transcriber(url, { return_timestamps: 'word' });
 * // {
 * //   "text": " And so my fellow Americans ask not what your country can do for you ask what you can do for your country.",
 * //   "chunks": [
 * //     { "text": " And", "timestamp": [0, 0.78] },
 * //     { "text": " so", "timestamp": [0.78, 1.06] },
 * //     { "text": " my", "timestamp": [1.06, 1.46] },
 * //     ...
 * //     { "text": " for", "timestamp": [9.72, 9.92] },
 * //     { "text": " your", "timestamp": [9.92, 10.22] },
 * //     { "text": " country.", "timestamp": [10.22, 13.5] }
 * //   ]
 * // }
 * ```
 *
 * **Example:** Transcribe French.
 * ```javascript
 * const transcriber = await pipeline('automatic-speech-recognition', 'Xenova/whisper-small');
 * const url = 'https://huggingface.co/datasets/Xenova/transformers.js-docs/resolve/main/french-audio.mp3';
 * const output = await transcriber(url, { language: 'french', task: 'transcribe' });
 * // { text: " J'adore, j'aime, je n'aime pas, je déteste." }
 * ```
 *
 * **Example:** Translate French to English.
 * ```javascript
 * const transcriber = await pipeline('automatic-speech-recognition', 'Xenova/whisper-small');
 * const url = 'https://huggingface.co/datasets/Xenova/transformers.js-docs/resolve/main/french-audio.mp3';
 * const output = await transcriber(url, { language: 'french', task: 'translate' });
 * // { text: " I love, I like, I don't like, I hate." }
 * ```
 *
 * **Example:** Transcribe/translate audio longer than 30 seconds.
 * ```javascript
 * const transcriber = await pipeline('automatic-speech-recognition', 'Xenova/whisper-tiny.en');
 * const url = 'https://huggingface.co/datasets/Xenova/transformers.js-docs/resolve/main/ted_60.wav';
 * const output = await transcriber(url, { chunk_length_s: 30, stride_length_s: 5 });
 * // { text: " So in college, I was a government major, which means [...] So I'd start off light and I'd bump it up" }
 * ```
 */
export class AutomaticSpeechRecognitionPipeline
  extends /** @type {new (options: TextAudioPipelineConstructorArgs) => AutomaticSpeechRecognitionPipelineType} */ Pipeline
{
  /**
   * Create a new AutomaticSpeechRecognitionPipeline.
   * @param {TextAudioPipelineConstructorArgs} options An object used to instantiate the pipeline.
   */
  constructor(options: TextAudioPipelineConstructorArgs) {
    super(options);
  }

  /** @type {AutomaticSpeechRecognitionPipelineCallback} */
  async _call(audio: AudioPipelineInputs, kwargs = {}) {
    switch ((this.model as any).config.model_type) {
      case 'whisper':
        return this._call_whisper(audio, kwargs);
      case 'wav2vec2':
      case 'wav2vec2-bert':
      case 'unispeech':
      case 'unispeech-sat':
      case 'hubert':
        return this._call_wav2vec2(audio, kwargs);
      case 'moonshine':
        return this._call_moonshine(audio, kwargs);
      default:
        throw new Error(
          `AutomaticSpeechRecognitionPipeline does not support model type '${this.model.config.model_type}'.`,
        );
    }
  }

  /**
   * @type {AutomaticSpeechRecognitionPipelineCallback}
   * @private
   */
  async _call_wav2vec2(audio: AudioPipelineInputs, kwargs: Partial<AutomaticSpeechRecognitionConfig>) {
    // TODO use kwargs

    if (kwargs.language) {
      console.warn('`language` parameter is not yet supported for `wav2vec2` models, defaulting to "English".');
    }
    if (kwargs.task) {
      console.warn('`task` parameter is not yet supported for `wav2vec2` models, defaulting to "transcribe".');
    }

    const single = !Array.isArray(audio);
    if (single) {
      audio = [audio as AudioInput];
    }

    const sampling_rate = (this.processor as any).feature_extractor.config.sampling_rate;
    const preparedAudios = await prepareAudios(audio, sampling_rate);

    const toReturn = [];
    for (const aud of preparedAudios) {
      const inputs = await (this.processor as any)(aud);
      const output = await (this.model as any)(inputs);
      const logits = output.logits[0];

      const predicted_ids = [];
      for (const item of logits) {
        predicted_ids.push(max(item.data)[1]);
      }
      const predicted_sentences = (this.tokenizer as any).decode(predicted_ids);
      toReturn.push({ text: predicted_sentences });
    }
    return single ? toReturn[0] : toReturn;
  }

  /**
   * @type {AutomaticSpeechRecognitionPipelineCallback}
   * @private
   */
  async _call_whisper(audio: AudioPipelineInputs, kwargs: Partial<AutomaticSpeechRecognitionConfig>) {
    const return_timestamps = kwargs.return_timestamps ?? false;
    const chunk_length_s = kwargs.chunk_length_s ?? 0;
    const force_full_sequences = kwargs.force_full_sequences ?? false;
    let stride_length_s = kwargs.stride_length_s ?? null;

    const generation_config = { ...kwargs };

    if (return_timestamps === 'word') {
      (generation_config as any)['return_token_timestamps'] = true;
      generation_config['return_timestamps'] = false; // Do not predict timestamp tokens
    }

    const single = !Array.isArray(audio);
    if (single) {
      audio = [audio as AudioInput];
    }

    const time_precision =
      (this.processor as any).feature_extractor.config.chunk_length / (this.model as any).config.max_source_positions;
    const hop_length = (this.processor as any).feature_extractor.config.hop_length;

    const sampling_rate = (this.processor as any).feature_extractor.config.sampling_rate;
    const preparedAudios = await prepareAudios(audio, sampling_rate);

    const toReturn = [];
    for (const aud of preparedAudios) {
      /** @type {{stride: number[], input_features: Tensor, is_last: boolean, tokens?: bigint[], token_timestamps?: number[]}[]} */
      let chunks = [];
      if (chunk_length_s > 0) {
        if (stride_length_s === null) {
          stride_length_s = chunk_length_s / 6;
        } else if (chunk_length_s <= stride_length_s) {
          throw Error('`chunk_length_s` must be larger than `stride_length_s`.');
        }

        // TODO support different stride_length_s (for left and right)

        const window = sampling_rate * chunk_length_s;
        const stride = sampling_rate * stride_length_s;
        const jump = window - 2 * stride;
        let offset = 0;

        // Create subarrays of audio with overlaps
        while (true) {
          const offset_end = offset + window;
          const subarr = aud.subarray(offset, offset_end);
          const feature = await (this.processor as any)(subarr);

          const is_first = offset === 0;
          const is_last = offset_end >= aud.length;
          chunks.push({
            stride: [subarr.length, is_first ? 0 : stride, is_last ? 0 : stride],
            input_features: feature.input_features,
            is_last,
          });
          if (is_last) break;
          offset += jump;
        }
      } else {
        chunks = [
          {
            stride: [aud.length, 0, 0],
            input_features: (await (this.processor as any)(aud)).input_features,
            is_last: true,
            tokens: [],
          },
        ];
      }

      // Generate for each set of input features
      for (const chunk of chunks) {
        generation_config.num_frames = Math.floor(chunk.stride[0] / hop_length);
        // console.log(generation_config, chunk);
        // NOTE: doing sequentially for now
        const data = await this.model.generate({
          inputs: chunk.input_features,
          ...generation_config,
        });

        // TODO: Right now we only get top beam
        if (return_timestamps === 'word') {
          // @ts-expect-error TS2339
          chunk.tokens = data.sequences.tolist()[0];
          // @ts-expect-error TS2339
          chunk.token_timestamps = data.token_timestamps.tolist()[0].map((x: number) => round(x, 2));
        } else {
          chunk.tokens = (data as Tensor)[0].tolist();
        }

        // convert stride to seconds
        chunk.stride = chunk.stride.map((x) => x / sampling_rate);
      }

      // Merge text chunks
      // @ts-ignore
      const [full_text, optional] = this.tokenizer._decode_asr(chunks, {
        time_precision,
        return_timestamps,
        force_full_sequences,
      });

      toReturn.push({ text: full_text, ...optional });
    }
    return single ? toReturn[0] : toReturn;
  }

  /**
   * @type {AutomaticSpeechRecognitionPipelineCallback}
   * @private
   */
  async _call_moonshine(audio: AudioPipelineInputs, kwargs: Partial<AutomaticSpeechRecognitionConfig>) {
    const single = !Array.isArray(audio);
    if (single) {
      audio = [audio as AudioInput];
    }
    const sampling_rate = (this.processor as any).feature_extractor.config.sampling_rate;
    const preparedAudios = await prepareAudios(audio, sampling_rate);
    const toReturn = [];
    for (const aud of preparedAudios) {
      const inputs = await (this.processor as any)(aud);

      // According to the [paper](https://arxiv.org/pdf/2410.15608):
      // "We use greedy decoding, with a heuristic limit of 6 output tokens
      // per second of audio to avoid repeated output sequences."
      const max_new_tokens = Math.floor(aud.length / sampling_rate) * 6;
      const outputs = await this.model.generate({ max_new_tokens, ...kwargs, ...inputs });

      const text = (this.processor as any).batch_decode(/** @type {Tensor} */ outputs, {
        skip_special_tokens: true,
      })[0];
      toReturn.push({ text });
    }
    return single ? toReturn[0] : toReturn;
  }
}

/**
 * @typedef {Object} ImageToTextSingle
 * @property {string} generated_text The generated text.
 * @typedef {ImageToTextSingle[]} ImageToTextOutput
 *
 * @callback ImageToTextPipelineCallback Assign labels to the image(s) passed as inputs.
 * @param {ImagePipelineInputs} texts The images to be captioned.
 * @param {Partial<import('./generation/configuration_utils.js').GenerationConfig>} [options] Additional keyword arguments to pass along to the generate method of the model.
 * @returns {Promise<ImageToTextOutput|ImageToTextOutput[]>} An object (or array of objects) containing the generated text(s).
 *
 * @typedef {TextImagePipelineConstructorArgs & ImageToTextPipelineCallback & Disposable} ImageToTextPipelineType
 */

/**
 * Image To Text pipeline using a `AutoModelForVision2Seq`. This pipeline predicts a caption for a given image.
 *
 * **Example:** Generate a caption for an image w/ `Xenova/vit-gpt2-image-captioning`.
 * ```javascript
 * const captioner = await pipeline('image-to-text', 'Xenova/vit-gpt2-image-captioning');
 * const url = 'https://huggingface.co/datasets/Xenova/transformers.js-docs/resolve/main/cats.jpg';
 * const output = await captioner(url);
 * // [{ generated_text: 'a cat laying on a couch with another cat' }]
 * ```
 *
 * **Example:** Optical Character Recognition (OCR) w/ `Xenova/trocr-small-handwritten`.
 * ```javascript
 * const captioner = await pipeline('image-to-text', 'Xenova/trocr-small-handwritten');
 * const url = 'https://huggingface.co/datasets/Xenova/transformers.js-docs/resolve/main/handwriting.jpg';
 * const output = await captioner(url);
 * // [{ generated_text: 'Mr. Brown commented icily.' }]
 * ```
 */
export class ImageToTextPipeline
  extends /** @type {new (options: TextImagePipelineConstructorArgs) => ImageToTextPipelineType} */ Pipeline
{
  /**
   * Create a new ImageToTextPipeline.
   * @param {TextImagePipelineConstructorArgs} options An object used to instantiate the pipeline.
   */
  constructor(options: TextImagePipelineConstructorArgs) {
    super(options);
  }

  /** @type {ImageToTextPipelineCallback} */
  async _call(images: ImagePipelineInputs, generate_kwargs = {}) {
    const isBatched = Array.isArray(images);
    const preparedImages = await prepareImages(images);

    const { pixel_values } = await (this.processor as any)(preparedImages);

    const toReturn = [];
    for (const batch of pixel_values) {
      batch.dims = [1, ...batch.dims];
      const output = await (this.model as any).generate({ inputs: batch, ...generate_kwargs });
      const decoded = (this.tokenizer as any)
        .batch_decode(/** @type {Tensor} */ output, {
          skip_special_tokens: true,
        })
        .map((x: any) => ({ generated_text: x.trim() }));
      toReturn.push(decoded);
    }

    return isBatched ? toReturn : toReturn[0];
  }
}

/**
 * @typedef {Object} VocoderOptions
 * @property {PreTrainedModel} [vocoder] The vocoder used by the pipeline (if the model uses one). If not provided, use the default HifiGan vocoder.
 * @typedef {TextAudioPipelineConstructorArgs & VocoderOptions} TextToAudioPipelineConstructorArgs
 */
type VocoderOptions = {
  vocoder: PreTrainedModel | null;
};

/**
 * @typedef {Object} TextToAudioOutput
 * @property {Float32Array} audio The generated audio waveform.
 * @property {number} sampling_rate The sampling rate of the generated audio waveform.
 *
 * @typedef {Object} TextToAudioPipelineOptions Parameters specific to text-to-audio pipelines.
 * @property {Tensor|Float32Array|string|URL} [speaker_embeddings=null] The speaker embeddings (if the model requires it).
 *
 * @callback TextToAudioPipelineCallback Generates speech/audio from the inputs.
 * @param {string|string[]} texts The text(s) to generate.
 * @param {TextToAudioPipelineOptions} options Parameters passed to the model generation/forward method.
 * @returns {Promise<TextToAudioOutput>} An object containing the generated audio and sampling rate.
 *
 * @typedef {TextToAudioPipelineConstructorArgs & TextToAudioPipelineCallback & Disposable} TextToAudioPipelineType
 */

type TextToAudioPipelineConstructorArgs = TextAudioPipelineConstructorArgs & VocoderOptions;

/**
 * Text-to-audio generation pipeline using any `AutoModelForTextToWaveform` or `AutoModelForTextToSpectrogram`.
 * This pipeline generates an audio file from an input text and optional other conditional inputs.
 *
 * **Example:** Generate audio from text with `Xenova/speecht5_tts`.
 * ```javascript
 * const synthesizer = await pipeline('text-to-speech', 'Xenova/speecht5_tts', { quantized: false });
 * const speaker_embeddings = 'https://huggingface.co/datasets/Xenova/transformers.js-docs/resolve/main/speaker_embeddings.bin';
 * const out = await synthesizer('Hello, my dog is cute', { speaker_embeddings });
 * // {
 * //   audio: Float32Array(26112) [-0.00005657337896991521, 0.00020583874720614403, ...],
 * //   sampling_rate: 16000
 * // }
 * ```
 *
 * You can then save the audio to a .wav file with the `wavefile` package:
 * ```javascript
 * import wavefile from 'wavefile';
 * import fs from 'fs';
 *
 * const wav = new wavefile.WaveFile();
 * wav.fromScratch(1, out.sampling_rate, '32f', out.audio);
 * fs.writeFileSync('out.wav', wav.toBuffer());
 * ```
 *
 * **Example:** Multilingual speech generation with `Xenova/mms-tts-fra`. See [here](https://huggingface.co/models?pipeline_tag=text-to-speech&other=vits&sort=trending) for the full list of available languages (1107).
 * ```javascript
 * const synthesizer = await pipeline('text-to-speech', 'Xenova/mms-tts-fra');
 * const out = await synthesizer('Bonjour');
 * // {
 * //   audio: Float32Array(23808) [-0.00037693005288019776, 0.0003325853613205254, ...],
 * //   sampling_rate: 16000
 * // }
 * ```
 */
export class TextToAudioPipeline
  extends /** @type {new (options: TextToAudioPipelineConstructorArgs) => TextToAudioPipelineType} */ Pipeline
{
  DEFAULT_VOCODER_ID = 'Xenova/speecht5_hifigan';

  /**
   * Create a new TextToAudioPipeline.
   * @param {TextToAudioPipelineConstructorArgs} options An object used to instantiate the pipeline.
   */
  vocoder: PreTrainedModel | null;
  constructor(options: TextToAudioPipelineConstructorArgs) {
    super(options);

    // TODO: Find a better way for `pipeline` to set the default vocoder
    this.vocoder = options.vocoder ?? null;
  }

  /** @type {TextToAudioPipelineCallback} */
  async _call(
    text_inputs: string | string[],
    { speaker_embeddings = null }: { speaker_embeddings: Tensor | Float32Array | string | URL | null },
  ) {
    // console.log("inside call", this.model.config);
    // If this.processor is not set, we are using a `AutoModelForTextToWaveform` model
    if (this.processor) {
      // console.log("Found processor:", this.processor)
      return this._call_text_to_spectrogram(text_inputs, { speaker_embeddings });
    } else {
      console.log("No Processor found, running waveform")
      return this._call_text_to_waveform(text_inputs);
    }
  }

  async _call_text_to_waveform(text_inputs: string | string[]) {
    // Run tokenization
    const inputs = (this.tokenizer as any)(text_inputs, {
      padding: true,
      truncation: true,
    });

    // Generate waveform
    const { waveform } = await (this.model as any)(inputs);

    // @ts-expect-error TS2339
    const sampling_rate = this.model.config.sampling_rate;
    return new RawAudio(
      waveform.data,
      sampling_rate,
    );
  }

  async _call_text_to_spectrogram(
    text_inputs: string | string[],
    { speaker_embeddings = null as Tensor | Float32Array | string | URL | null },
  ) {
    // Load vocoder, if not provided
    if (!this.vocoder) {
      console.log('No vocoder specified, using default HifiGan vocoder.');
      this.vocoder = await (AutoModel as any).from_pretrained(this.DEFAULT_VOCODER_ID, { dtype: 'fp32' });
    }

    // Load speaker embeddings as Float32Array from path/URL
    if (typeof speaker_embeddings === 'string' || speaker_embeddings instanceof URL) {
      // Load from URL with fetch
      speaker_embeddings = new Float32Array(await (await fetch(speaker_embeddings)).arrayBuffer());
    }

    if (speaker_embeddings instanceof Float32Array) {
      speaker_embeddings = new Tensor('float32', speaker_embeddings, [1, speaker_embeddings.length]);
    } else if (!(speaker_embeddings instanceof Tensor)) {
      throw new Error('Speaker embeddings must be a `Tensor`, `Float32Array`, `string`, or `URL`.');
    }

    // Run tokenization
    const { input_ids } = (this.tokenizer as any)(text_inputs, {
      padding: true,
      truncation: true,
    });

    // NOTE: At this point, we are guaranteed that `speaker_embeddings` is a `Tensor`
    // @ts-ignore
    const { waveform } = await (this.model as any).generate_speech(input_ids, speaker_embeddings, {
      vocoder: this.vocoder,
    });

    const sampling_rate = (this.processor as any).feature_extractor.config.sampling_rate;
    return new RawAudio(
        waveform.data,
        sampling_rate,
    );
  }
}

/**
 * @callback ImageToImagePipelineCallback Transform the image(s) passed as inputs.
 * @param {ImagePipelineInputs} images The images to transform.
 * @returns {Promise<RawImage|RawImage[]>} The transformed image or list of images.
 *
 * @typedef {ImagePipelineConstructorArgs & ImageToImagePipelineCallback & Disposable} ImageToImagePipelineType
 */

/**
 * Image to Image pipeline using any `AutoModelForImageToImage`. This pipeline generates an image based on a previous image input.
 *
 * **Example:** Super-resolution w/ `Xenova/swin2SR-classical-sr-x2-64`
 * ```javascript
 * const upscaler = await pipeline('image-to-image', 'Xenova/swin2SR-classical-sr-x2-64');
 * const url = 'https://huggingface.co/datasets/Xenova/transformers.js-docs/resolve/main/butterfly.jpg';
 * const output = await upscaler(url);
 * // RawImage {
 * //   data: Uint8Array(786432) [ 41, 31, 24,  43, ... ],
 * //   width: 512,
 * //   height: 512,
 * //   channels: 3
 * // }
 * ```
 */
export class ImageToImagePipeline
  extends /** @type {new (options: ImagePipelineConstructorArgs) => ImageToImagePipelineType} */ Pipeline
{
  /**
   * Create a new ImageToImagePipeline.
   * @param {ImagePipelineConstructorArgs} options An object used to instantiate the pipeline.
   */
  processor: any;

  constructor(options: ImagePipelineConstructorArgs) {
    super(options);
    this.processor = options.processor;
  }

  /** @type {ImageToImagePipelineCallback} */
  async _call(images: ImagePipelineInputs) {
    const preparedImages = await prepareImages(images);
    const inputs = await this.processor(preparedImages);
    const outputs = await (this.model as any)(inputs);

    /** @type {RawImage[]} */
    const toReturn = [];
    for (const batch of outputs.reconstruction) {
      const output = batch.squeeze().clamp_(0, 1).mul_(255).round_().to('uint8');
      toReturn.push(RawImage.fromTensor(output));
    }

    return toReturn.length > 1 ? toReturn : toReturn[0];
  }
}

export const SUPPORTED_TASKS = {
  'text-generation': {
    tokenizer: AutoTokenizer,
    pipeline: TextGenerationPipeline,
    model: AutoModelForCausalLM,
    default: {
      // TODO: replace with original
      // "model": "gpt2",
      model: 'Xenova/gpt2',
    },
    type: 'text',
  },
  'automatic-speech-recognition': {
    tokenizer: AutoTokenizer,
    pipeline: AutomaticSpeechRecognitionPipeline,
    model: [AutoModelForSpeechSeq2Seq, AutoModelForCTC],
    processor: AutoProcessor,
    default: {
      // TODO: replace with original
      // "model": "openai/whisper-tiny.en",
      model: 'Xenova/whisper-tiny.en',
    },
    type: 'multimodal',
  },
  'text-to-audio': {
    tokenizer: AutoTokenizer,
    pipeline: TextToAudioPipeline,
    model: [AutoModelForTextToWaveform, AutoModelForTextToSpectrogram],
    processor: [AutoProcessor, /* Some don't use a processor */ null],
    default: {
      // TODO: replace with original
      // "model": "microsoft/speecht5_tts",
      model: 'Xenova/speecht5_tts',
    },
    type: 'text',
  },
  'image-to-text': {
    tokenizer: AutoTokenizer,
    pipeline: ImageToTextPipeline,
    model: AutoModelForVision2Seq,
    processor: AutoProcessor,
    default: {
      // TODO: replace with original
      // "model": "nlpconnect/vit-gpt2-image-captioning",
      model: 'Xenova/vit-gpt2-image-captioning',
    },
    type: 'multimodal',
  },
  'image-to-image': {
    // no tokenizer
    pipeline: ImageToImagePipeline,
    model: AutoModelForImageToImage,
    processor: AutoProcessor,
    default: {
      // TODO: replace with original
      // "model": "caidas/swin2SR-classical-sr-x2-64",
      model: 'Xenova/swin2SR-classical-sr-x2-64',
    },
    type: 'image',
  },

  // This task serves as a useful interface for dealing with sentence-transformers (https://huggingface.co/sentence-transformers).
  'feature-extraction': {
    tokenizer: AutoTokenizer,
    pipeline: FeatureExtractionPipeline,
    model: AutoModel,
    default: {
      // TODO: replace with original
      // "model": "sentence-transformers/all-MiniLM-L6-v2",
      model: 'Xenova/all-MiniLM-L6-v2',
    },
    type: 'text',
  },
  'image-feature-extraction': {
    processor: AutoProcessor,
    pipeline: ImageFeatureExtractionPipeline,
    model: [AutoModelForImageFeatureExtraction, AutoModel],
    default: {
      // TODO: replace with original
      // "model": "google/vit-base-patch16-224",
      model: 'Xenova/vit-base-patch16-224-in21k',
    },
    type: 'image',
  },
} as const;

// TODO: Add types for TASK_ALIASES
export const TASK_ALIASES = {
  asr: 'automatic-speech-recognition',
  'text-to-speech': 'text-to-audio',

  // Add for backwards compatibility
  embeddings: 'feature-extraction',
} as const;

/**
 * @typedef {keyof typeof SUPPORTED_TASKS} TaskType
 * @typedef {keyof typeof TASK_ALIASES} AliasType
 * @typedef {TaskType | AliasType} PipelineType All possible pipeline types.
 * @typedef {{[K in TaskType]: InstanceType<typeof SUPPORTED_TASKS[K]["pipeline"]>}} SupportedTasks A mapping of pipeline names to their corresponding pipeline classes.
 * @typedef {{[K in AliasType]: InstanceType<typeof SUPPORTED_TASKS[TASK_ALIASES[K]]["pipeline"]>}} AliasTasks A mapping from pipeline aliases to their corresponding pipeline classes.
 * @typedef {SupportedTasks & AliasTasks} AllTasks A mapping from all pipeline names and aliases to their corresponding pipeline classes.
 */

/**
 * Utility factory method to build a `Pipeline` object.
 *
 * @template {PipelineType} T The type of pipeline to return.
 * @param {T} task The task defining which pipeline will be returned. Currently accepted tasks are:
 *  - `"automatic-speech-recognition"`: will return a `AutomaticSpeechRecognitionPipeline`.
 *  - `"feature-extraction"`: will return a `FeatureExtractionPipeline`.
 *  - `"image-to-text"`: will return a `ImageToTextPipeline`.
 *  - `"text-generation"`: will return a `TextGenerationPipeline`.
 * @param {string} [model=null] The name of the pre-trained model to use. If not specified, the default model for the task will be used.
 * @param {import('./utils/hub.js').PretrainedModelOptions} [options] Optional parameters for the pipeline.
 * @returns {Promise<AllTasks[T]>} A Pipeline object for the specified task.
 * @throws {Error} If an unsupported pipeline is requested.
 */
export async function pipeline(
  task: PipelineType,
  model: string | null = null,
  {
    progress_callback = null,
    config = null,
    cache_dir = null,
    local_files_only = false,
    revision = 'main',
    device = null,
    dtype = null,
    model_file_name = null,
    session_options = {},
  } = {},
) {
  // Helper method to construct pipeline

  // Apply aliases
  // @ts-ignore
  task = TASK_ALIASES[task] ?? task;

  // Get pipeline info
  const pipelineInfo = SUPPORTED_TASKS[task.split('_', 1)[0] as keyof typeof SUPPORTED_TASKS];
  if (!pipelineInfo) {
    throw Error(`Unsupported pipeline: ${task}. Must be one of [${Object.keys(SUPPORTED_TASKS)}]`);
  }

  // Use model if specified, otherwise, use default
  if (!model) {
    model = pipelineInfo.default.model;
    console.log(`No model specified. Using default model: "${model}".`);
  }

  const pretrainedOptions = {
    progress_callback,
    config,
    cache_dir,
    local_files_only,
    revision,
    device,
    dtype,
    model_file_name,
    session_options,
  };

  const classes = new Map([
    ['tokenizer', (pipelineInfo as any).tokenizer],
    ['model', (pipelineInfo as any).model],
    ['processor', (pipelineInfo as any).processor],
  ]);

  // Load model, tokenizer, and processor (if they exist)
  const results = await loadItems(classes, model, pretrainedOptions);
  results.task = task;

  dispatchCallback(progress_callback, {
    status: 'ready',
    task: task,
    model: model,
  });

  const pipelineClass = pipelineInfo.pipeline;
  return new pipelineClass(results);
}

/**
 * Helper function to get applicable model, tokenizer, or processor classes for a given model.
 * @param {Map<string, any>} mapping The mapping of names to classes, arrays of classes, or null.
 * @param {string} model The name of the model to load.
 * @param {import('./utils/hub.js').PretrainedOptions} pretrainedOptions The options to pass to the `from_pretrained` method.
 * @private
 */
async function loadItems(mapping: Map<string, any>, model: string, pretrainedOptions: PretrainedOptions) {
  const result = Object.create(null);

  /**@type {Promise[]} */
  const promises = [];
  for (const [name, cls] of mapping.entries()) {
    if (!cls) continue;

    /**@type {Promise} */
    let promise;
    if (Array.isArray(cls)) {
      promise = new Promise(async (resolve, reject) => {
        let e;
        for (const c of cls) {
          if (c === null) {
            // If null, we resolve it immediately, meaning the relevant
            // class was not found, but it is optional.
            resolve(null);
            return;
          }
          try {
            resolve(await c.from_pretrained(model, pretrainedOptions));
            return;
          } catch (err) {
            if ((err as Error).message?.includes('Unsupported model type')) {
              // If the error is due to an unsupported model type, we
              // save the error and try the next class.
              e = err as Error;
            } else if ((err as Error).message?.includes('Could not locate file')) {
              e = err as Error;
            } else {
              reject(err);
              return;
            }
          }
        }
        reject(e);
      });
    } else {
      promise = cls.from_pretrained(model, pretrainedOptions);
    }

    result[name] = promise;
    promises.push(promise);
  }

  // Wait for all promises to resolve (in parallel)
  await Promise.all(promises);

  // Then assign to result
  for (const [name, promise] of Object.entries(result)) {
    result[name] = await promise;
  }

  return result;
}

function isChat(obj: any): obj is Chat {
  return Array.isArray(obj) && obj.every((x) => typeof x === 'object' && 'role' in x && 'content' in x);
}
