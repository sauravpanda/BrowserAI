/**
 * @file Definitions of all models available in Transformers.js.
 *
 * **Example:** Load and run an `AutoModel`.
 *
 * ```javascript
 * import { AutoModel, AutoTokenizer } from '@huggingface/transformers';
 *
 * let tokenizer = await AutoTokenizer.from_pretrained('Xenova/bert-base-uncased');
 * let model = await AutoModel.from_pretrained('Xenova/bert-base-uncased');
 *
 * let inputs = await tokenizer('I love transformers!');
 * let { logits } = await model(inputs);
 * // Tensor {
 * //     data: Float32Array(183132) [-7.117443084716797, -7.107812881469727, -7.092104911804199, ...]
 * //     dims: (3) [1, 6, 30522],
 * //     type: "float32",
 * //     size: 183132,
 * // }
 * ```
 *
 * We also provide other `AutoModel`s (listed below), which you can use in the same way as the Python library. For example:
 *
 * **Example:** Load and run an `AutoModelForSeq2SeqLM`.
 * ```javascript
 * import { AutoModelForSeq2SeqLM, AutoTokenizer } from '@huggingface/transformers';
 *
 * let tokenizer = await AutoTokenizer.from_pretrained('Xenova/t5-small');
 * let model = await AutoModelForSeq2SeqLM.from_pretrained('Xenova/t5-small');
 *
 * let { input_ids } = await tokenizer('translate English to German: I love transformers!');
 * let outputs = await model.generate(input_ids);
 * let decoded = tokenizer.decode(outputs[0], { skip_special_tokens: true });
 * // 'Ich liebe Transformatoren!'
 * ```
 *
 * @module models
 */

import { AutoConfig, getKeyValueShapes, PretrainedConfig, TransformersJSConfig } from './configs';

import { deviceToExecutionProviders, createInferenceSession, isONNXTensor, isONNXProxy } from './backends/onnx';
import {
  DATA_TYPES,
  DEFAULT_DEVICE_DTYPE_MAPPING,
  DEFAULT_DTYPE_SUFFIX_MAPPING,
  isWebGpuFp16Supported,
} from './utils/dtypes';

import { Callable } from './utils/generic';

import { mergeArrays, pick, ProgressCallback } from './utils/core';

import { getModelFile, getModelJSON } from './utils/hub';

import { GITHUB_ISSUE_URL } from './utils/constants';

import {
  LogitsProcessorList,
  ForcedBOSTokenLogitsProcessor,
  ForcedEOSTokenLogitsProcessor,
  SuppressTokensAtBeginLogitsProcessor,
  WhisperTimeStampLogitsProcessor,
  NoRepeatNGramLogitsProcessor,
  RepetitionPenaltyLogitsProcessor,
  NoBadWordsLogitsProcessor,
  MinLengthLogitsProcessor,
  MinNewTokensLengthLogitsProcessor,
  TemperatureLogitsWarper,
  TopKLogitsWarper,
  TopPLogitsWarper,
  ClassifierFreeGuidanceLogitsProcessor,
  LogitsProcessor,
} from './generation/logits_process';

import { GenerationConfig } from './generation/configuration_utils';

import {
  cat,
  mean,
  zeros,
  zeros_like,
  ones,
  ones_like,
  full,
  full_like,
  stack,
  std_mean,
  Tensor,
} from './utils/tensor';
import { RawImage } from './utils/image';

import { dynamic_time_warping, max, medianFilter } from './utils/maths';
import { EosTokenCriteria, MaxLengthCriteria, StoppingCriteriaList } from './generation/stopping_criteria';
import { LogitsSampler } from './generation/logits_sampler';
import { apis } from './env';

import { WhisperGenerationConfig, WhisperGenerationFunctionParameters } from './models/whisper/generation_whisper';
import { whisper_language_to_code } from './models/whisper/common_whisper';
import { GenerationFunctionParameters } from './generation/parameters';

//////////////////////////////////////////////////
// Model types: used internally
const MODEL_TYPES = {
  EncoderOnly: 0,
  EncoderDecoder: 1,
  Seq2Seq: 2,
  Vision2Seq: 3,
  DecoderOnly: 4,
  MaskGeneration: 5,
  ImageTextToText: 6,
  Musicgen: 7,
  MultiModality: 8,
  Phi3V: 9,
};
//////////////////////////////////////////////////

//////////////////////////////////////////////////
// Helper functions

// NOTE: These will be populated fully later
const MODEL_TYPE_MAPPING = new Map();
const MODEL_NAME_TO_CLASS_MAPPING = new Map();
const MODEL_CLASS_TO_NAME_MAPPING = new Map();

/**
 * Constructs an InferenceSession using a model file located at the specified path.
 * @param {string} pretrained_model_name_or_path The path to the directory containing the model file.
 * @param {string} fileName The name of the model file.
 * @param {import('./utils/hub.js').PretrainedModelOptions} options Additional options for loading the model.
 * @returns {Promise<{buffer: Uint8Array, session_options: Object, session_config: Object}>} A Promise that resolves to the data needed to create an InferenceSession object.
 * @private
 */
async function getSession(pretrained_model_name_or_path: string, fileName: string, options: any) {
  const custom_config = options.config?.['transformers.js_config'] ?? {};
  let device = options.device ?? custom_config.device;
  if (device && typeof device !== 'string') {
    if (device.hasOwnProperty(fileName)) {
      device = device[fileName];
    } else {
      console.warn(`device not specified for "${fileName}". Using the default device.`);
      device = null;
    }
  }

  // If the device is not specified, we use the default (supported) execution providers.
  const selectedDevice =
    /** @type {import("./utils/devices.js").DeviceType} */ device ?? (apis.IS_NODE_ENV ? 'cpu' : 'wasm');
  const executionProviders = deviceToExecutionProviders(selectedDevice);

  // If options.dtype is specified, we use it to choose the suffix for the model file.
  // Otherwise, we use the default dtype for the device.
  let dtype = options.dtype ?? custom_config.dtype;
  if (typeof dtype !== 'string') {
    if (dtype && dtype.hasOwnProperty(fileName)) {
      dtype = dtype[fileName];
    } else {
      dtype =
        DEFAULT_DEVICE_DTYPE_MAPPING[selectedDevice as keyof typeof DEFAULT_DEVICE_DTYPE_MAPPING] ?? DATA_TYPES.fp32;
      console.warn(
        `dtype not specified for "${fileName}". Using the default dtype (${dtype}) for this device (${selectedDevice}).`,
      );
    }
  }

  if (dtype === DATA_TYPES.auto) {
    // Try to choose the auto dtype based on the custom config
    let config_dtype = custom_config.dtype;
    if (typeof config_dtype !== 'string') {
      config_dtype = config_dtype[fileName];
    }

    if (config_dtype && config_dtype !== DATA_TYPES.auto && DATA_TYPES.hasOwnProperty(config_dtype)) {
      // Defined by the custom config, and is not "auto"
      dtype = config_dtype;
    } else {
      // Choose default dtype based on device, falling back to fp32
      dtype =
        DEFAULT_DEVICE_DTYPE_MAPPING[selectedDevice as keyof typeof DEFAULT_DEVICE_DTYPE_MAPPING] ?? DATA_TYPES.fp32;
    }
  }

  const selectedDtype = /** @type {import("./utils/dtypes.js").DataType} */ dtype;

  if (!DEFAULT_DTYPE_SUFFIX_MAPPING.hasOwnProperty(selectedDtype)) {
    throw new Error(`Invalid dtype: ${selectedDtype}. Should be one of: ${Object.keys(DATA_TYPES).join(', ')}`);
  } else if (selectedDtype === DATA_TYPES.fp16 && selectedDevice === 'webgpu' && !(await isWebGpuFp16Supported())) {
    throw new Error(`The device (${selectedDevice}) does not support fp16.`);
  }

  // Only valid for models with a decoder
  const kv_cache_dtype = custom_config.kv_cache_dtype
    ? typeof custom_config.kv_cache_dtype === 'string'
      ? custom_config.kv_cache_dtype
      : (custom_config.kv_cache_dtype[selectedDtype] ?? 'float32')
    : undefined;

  if (kv_cache_dtype && !['float32', 'float16'].includes(kv_cache_dtype)) {
    throw new Error(`Invalid kv_cache_dtype: ${kv_cache_dtype}. Should be one of: float32, float16`);
  }

  const session_config = {
    dtype: selectedDtype,
    kv_cache_dtype,
  };

  // Construct the model file name
  const suffix = DEFAULT_DTYPE_SUFFIX_MAPPING[selectedDtype as keyof typeof DEFAULT_DTYPE_SUFFIX_MAPPING];
  const modelFileName = `${options.subfolder ?? ''}/${fileName}${suffix}.onnx`;

  const session_options = { ...options.session_options };

  // Overwrite `executionProviders` if not specified
  session_options.executionProviders ??= executionProviders;

  // Overwrite `freeDimensionOverrides` if specified in config and not set in session options
  const free_dimension_overrides = custom_config.free_dimension_overrides;
  if (free_dimension_overrides) {
    session_options.freeDimensionOverrides ??= free_dimension_overrides;
  } else if (selectedDevice.startsWith('webnn') && !session_options.freeDimensionOverrides) {
    console.warn(
      'WebNN does not currently support dynamic shapes and requires `free_dimension_overrides` to be set in config.json as a field within "transformers.js_config". ' +
      'When `free_dimension_overrides` is not set, you may experience significant performance degradation.',
    );
  }

  const bufferPromise = getModelFile(pretrained_model_name_or_path, modelFileName, true, options);

  // handle onnx external data files
  const use_external_data_format = options.use_external_data_format ?? custom_config.use_external_data_format;
  /** @type {Promise<{path: string, data: Uint8Array}>[]} */
  let externalDataPromises = [];
  if (
    use_external_data_format &&
    (use_external_data_format === true ||
      (typeof use_external_data_format === 'object' &&
        use_external_data_format.hasOwnProperty(fileName) &&
        use_external_data_format[fileName] === true))
  ) {
    if (apis.IS_NODE_ENV) {
      throw new Error('External data format is not yet supported in Node.js');
    }
    const path = `${fileName}${suffix}.onnx_data`;
    const fullPath = `${options.subfolder ?? ''}/${path}`;
    externalDataPromises.push(
      new Promise(async (resolve, reject) => {
        const data = await getModelFile(pretrained_model_name_or_path, fullPath, true, options);
        resolve({ path, data });
      }),
    );
  } else if (session_options.externalData !== undefined) {
    externalDataPromises = session_options.externalData.map(async (ext: any) => {
      if (typeof ext.data === 'string') {
        const ext_buffer = await getModelFile(pretrained_model_name_or_path, ext.data, true, options);
        return { ...ext, data: ext_buffer };
      }
      return ext;
    });
  }

  if (externalDataPromises.length > 0) {
    session_options.externalData = await Promise.all(externalDataPromises);
  }

  if (selectedDevice === 'webgpu') {
    const shapes = getKeyValueShapes(options.config, {
      prefix: 'present',
    });
    if (Object.keys(shapes).length > 0 && !isONNXProxy()) {
      // Only set preferredOutputLocation if shapes are present and we aren't proxying ONNX
      /** @type {Record<string, import('onnxruntime-common').Tensor.DataLocation>} */
      const preferredOutputLocation: Record<string, any> = {};
      for (const key in shapes) {
        preferredOutputLocation[key] = 'gpu-buffer';
      }
      session_options.preferredOutputLocation = preferredOutputLocation;
    }
  }

  const buffer = (await bufferPromise) as Uint8Array;

  return { buffer, session_options, session_config };
}

/**
 * Helper function to create multiple InferenceSession objects.
 *
 * @param {string} pretrained_model_name_or_path The path to the directory containing the model file.
 * @param {Record<string, string>} names The names of the model files to load.
 * @param {import('./utils/hub.js').PretrainedModelOptions} options Additional options for loading the model.
 * @returns {Promise<Record<string, any>>} A Promise that resolves to a dictionary of InferenceSession objects.
 * @private
 */
async function constructSessions(pretrained_model_name_or_path: string, names: Record<string, string>, options: any) {
  return Object.fromEntries(
    await Promise.all(
      Object.keys(names).map(async (name) => {
        const { buffer, session_options, session_config } = await getSession(
          pretrained_model_name_or_path,
          names[name],
          options,
        );
        const session = await createInferenceSession(buffer, session_options, session_config);
        return [name, session];
      }),
    ),
  );
}

/**
 * Helper function to load multiple optional configuration files
 * @param {string} pretrained_model_name_or_path The path to the directory containing the config file.
 * @param {Record<string, string>} names The names of the config files to load.
 * @param {import('./utils/hub.js').PretrainedModelOptions} options Additional options for loading the configs.
 * @returns {Promise<Record<string, any>>} A Promise that resolves to a dictionary of configuration objects.
 * @private
 */
async function getOptionalConfigs(pretrained_model_name_or_path: string, names: Record<string, string>, options: any) {
  return Object.fromEntries(
    await Promise.all(
      Object.keys(names).map(async (name) => {
        const config = await getModelJSON(pretrained_model_name_or_path, names[name], false, options);
        return [name, config];
      }),
    ),
  );
}

/**
 * Validate model inputs
 * @param {Object} session The InferenceSession object that will be run.
 * @param {Object} inputs The inputs to check.
 * @returns {Record<string, Tensor>} The checked inputs.
 * @throws {Error} If any inputs are missing.
 * @private
 */
function validateInputs(session: any, inputs: any) {
  /**
   * NOTE: Create either a shallow or deep copy based on `onnx.wasm.proxy`
   * @type {Record<string, Tensor>}
   */
  const checkedInputs = Object.create(null);
  const missingInputs = [];
  for (const inputName of session.inputNames) {
    const tensor = inputs[inputName];
    // Rare case where one of the model's input names corresponds to a built-in
    // object name (e.g., toString), which would cause a simple (!tensor) check to fail,
    // because it's not undefined but a function.
    if (!(tensor instanceof Tensor)) {
      missingInputs.push(inputName);
      continue;
    }
    // NOTE: When `env.wasm.proxy is true` the tensor is moved across the Worker
    // boundary, transferring ownership to the worker and invalidating the tensor.
    // So, in this case, we simply sacrifice a clone for it.
    checkedInputs[inputName] = isONNXProxy() ? tensor.clone() : tensor;
  }
  if (missingInputs.length > 0) {
    throw new Error(
      `An error occurred during model execution: "Missing the following inputs: ${missingInputs.join(', ')}.`,
    );
  }

  const numInputsProvided = Object.keys(inputs).length;
  const numInputsNeeded = session.inputNames.length;
  if (numInputsProvided > numInputsNeeded) {
    // No missing inputs, but too many inputs were provided.
    // Warn the user and ignore the extra inputs.
    let ignored = Object.keys(inputs).filter((inputName) => !session.inputNames.includes(inputName));
    console.warn(
      `WARNING: Too many inputs were provided (${numInputsProvided} > ${numInputsNeeded}). The following inputs will be ignored: "${ignored.join(', ')}".`,
    );
  }

  return checkedInputs;
}

/**
 * Executes an InferenceSession using the specified inputs.
 * NOTE: `inputs` must contain at least the input names of the model.
 *  - If additional inputs are passed, they will be ignored.
 *  - If inputs are missing, an error will be thrown.
 *
 * @param {Object} session The InferenceSession object to run.
 * @param {Object} inputs An object that maps input names to input tensors.
 * @returns {Promise<Object>} A Promise that resolves to an object that maps output names to output tensors.
 * @private
 */
async function sessionRun(session: any, inputs: any) {
  console.log(`Running session ${session.path || 'unknown'}:`, {
    inputNames: session.inputNames,
    inputShapes: Object.fromEntries(
      Object.entries(inputs).map(([k, v]) => [k, (v as any).dims])
    )
  });
  const checkedInputs = validateInputs(session, inputs);
  try {
    // pass the original ort tensor
    const ortFeed = Object.fromEntries(
      Object.entries(checkedInputs).map(([k, v]) => [k, (v as Tensor).ort_tensor]),
    );
    let output = await session.run(ortFeed);
    console.log('Session run successful:', {
      outputNames: Object.keys(output)
    });
    output = replaceTensors(output);
    return output;
  } catch (e) {
    // Error messages can be long (nested) and uninformative. For this reason,
    // we apply minor formatting to show the most important information
    const formatted = Object.fromEntries(
      Object.entries(checkedInputs).map(([k, v]) => [
        k,
        {
          // Extract these properties from the underlying ORT tensor
          type: (v as Tensor).type,
          dims: (v as Tensor).dims,
          data: (v as Tensor).data,
        },
      ]),
    );

    console.error('Session run failed:', {
      e,
      session: session.path,
      inputNames: session.inputNames,
      inputShapes: Object.fromEntries(
        Object.entries(inputs).map(([k, v]) => [k, (v as any).dims])
      )
    });

    // This usually occurs when the inputs are of the wrong type.
    console.error(`An error occurred during model execution: "${e}".`);
    console.error('Inputs given to model:', formatted);
    throw e;
  }
}

/**
 * Replaces ONNX Tensor objects with custom Tensor objects to support additional functions.
 * @param {Object} obj The object to replace tensor objects in.
 * @returns {Object} The object with tensor objects replaced by custom Tensor objects.
 * @private
 */
function replaceTensors(obj: any) {
  for (let prop in obj) {
    if (isONNXTensor(obj[prop])) {
      obj[prop] = new Tensor(obj[prop]);
    } else if (typeof obj[prop] === 'object') {
      replaceTensors(obj[prop]);
    }
  }
  return obj;
}

/**
 * Converts an array or Tensor of integers to an int64 Tensor.
 * @param {any[]|Tensor} items The input integers to be converted.
 * @returns {Tensor} The int64 Tensor with the converted values.
 * @throws {Error} If the input array is empty or the input is a batched Tensor and not all sequences have the same length.
 * @private
 */
function toI64Tensor(items: any) {
  if (items instanceof Tensor) {
    return items;
  }
  // items is an array
  if (items.length === 0) {
    throw Error('items must be non-empty');
  }

  if (Array.isArray(items[0])) {
    // batched
    if (items.some((x: any) => x.length !== items[0].length)) {
      throw Error(
        "Unable to create tensor, you should probably activate truncation and/or padding with 'padding=True' and/or 'truncation=True' to have batched tensors with the same length.",
      );
    }

    return new Tensor('int64', BigInt64Array.from(items.flat().map((x: any) => BigInt(x))), [
      items.length,
      items[0].length,
    ]);
  } else {
    //flat
    return new Tensor('int64', BigInt64Array.from(items.map((x: any) => BigInt(x))), [1, items.length]);
  }
}

/**
 * Creates a boolean tensor with a single value.
 * @param {boolean} value The value of the tensor.
 * @returns {Tensor} The boolean tensor.
 * @private
 */
function boolTensor(value: boolean) {
  return new Tensor('bool', [value], [1]);
}

// JS doesn't support mixins, so we define some reused functions here, and allow "this" to be passed in
/**
 * Perform forward pass on the seq2seq model (both encoder and decoder).
 * @param {Object} self The seq2seq model object.
 * @param {Object} model_inputs The input object for the model containing encoder and decoder inputs.
 * @returns {Promise<Seq2SeqLMOutput>} Promise that resolves with the output of the seq2seq model.
 * @private
 */
async function seq2seqForward(self: any, model_inputs: any) {
  let { encoder_outputs, input_ids, decoder_input_ids, ...other_decoder_inputs } = model_inputs;
  // Encode if needed
  if (!encoder_outputs) {
    const encoder_inputs = pick(model_inputs, self.sessions['model'].inputNames);
    // Encoder outputs are not given, so we must compute them.
    encoder_outputs = (await encoderForward(self, encoder_inputs)).last_hidden_state;
  }

  other_decoder_inputs.input_ids = decoder_input_ids;
  other_decoder_inputs.encoder_hidden_states = encoder_outputs;

  if (self.sessions['decoder_model_merged'].inputNames.includes('encoder_attention_mask')) {
    other_decoder_inputs.encoder_attention_mask = model_inputs.attention_mask;
  }

  const decoderResults = await decoderForward(self, other_decoder_inputs, true);

  return decoderResults;
}

/**
 * Forward pass of an encoder model.
 * @param {Object} self The encoder model.
 * @param {Object} model_inputs The input data to be used for the forward pass.
 * @returns {Promise<Object>} The model's outputs.
 * @private
 */
async function encoderForward(self: any, model_inputs: any) {
  const session = self.sessions['model'];
  const encoderFeeds = pick(model_inputs, session.inputNames);
  if (session.inputNames.includes('inputs_embeds') && !encoderFeeds.inputs_embeds) {
    if (!model_inputs.input_ids) {
      throw new Error('Both `input_ids` and `inputs_embeds` are missing in the model inputs.');
    }
    encoderFeeds.inputs_embeds = await self.encode_text({ input_ids: model_inputs.input_ids });
  }
  if (session.inputNames.includes('token_type_ids') && !encoderFeeds.token_type_ids) {
    // Assign default `token_type_ids` (all zeroes) to the `encoderFeeds` if the model expects it,
    // but they weren't created by the tokenizer.
    // encoderFeeds.token_type_ids = new Tensor(
    //   'int64',
    //   new BigInt64Array(encoderFeeds.input_ids.data.length),
    //   encoderFeeds.input_ids.dims,
    // );

    if (!encoderFeeds.input_ids) {
      throw new Error('Both `input_ids` and `token_type_ids` are missing in the model inputs.');
    }
    // Assign default `token_type_ids` (all zeroes) to the `encoderFeeds` if the model expects it,
    // but they weren't created by the tokenizer.
    encoderFeeds.token_type_ids = zeros_like(encoderFeeds.input_ids);
  }

  if (session.inputNames.includes('pixel_mask') && !encoderFeeds.pixel_mask) {
    if (!encoderFeeds.pixel_values) {
      throw new Error('Both `pixel_values` and `pixel_mask` are missing in the model inputs.');
    }
    // Assign default `pixel_mask` (all ones) to the `encoderFeeds` if the model expects it,
    // but they weren't created by the processor.
    const dims = encoderFeeds.pixel_values.dims;
    encoderFeeds.pixel_mask = ones([dims[0], dims[2], dims[3]]);
  }
  // console.log("encoder forward running here: ", session, encoderFeeds)
  return await sessionRun(session, encoderFeeds);
}

/**
 * Forward pass of a decoder model.
 * @param {Object} self The decoder model.
 * @param {Object} model_inputs The input data to be used for the forward pass.
 * @returns {Promise<Object>} The logits and past key values.
 * @private
 */
async function decoderForward(self: any, model_inputs: any, is_encoder_decoder = false) {
  const session = self.sessions[is_encoder_decoder ? 'decoder_model_merged' : 'model'];

  // Add debugging
  console.log('Decoder inputs:', model_inputs);
  console.log('Session config:', session.config);

  const { past_key_values, ...new_model_inputs } = model_inputs;

  if (session.inputNames.includes('use_cache_branch')) {
    new_model_inputs.use_cache_branch = boolTensor(!!past_key_values);
  }
  if (
    session.inputNames.includes('position_ids') &&
    new_model_inputs.attention_mask &&
    !new_model_inputs.position_ids
  ) {
    // NOTE: Handle a special case for paligemma models, where positions are 1-indexed
    const start_index = self.config?.model_type === 'paligemma' ? 1 : 0;
    new_model_inputs.position_ids = createPositionIds(new_model_inputs, past_key_values, start_index);
  }

  // Unpack the `past_key_values` object into model inputs
  self.addPastKeyValues(new_model_inputs, past_key_values);

  // Select only the inputs that are needed for the current session
  const fixed = pick(new_model_inputs, session.inputNames);
  return await sessionRun(session, fixed);
}

function default_merge_input_ids_with_image_features({
  image_token_id,
  inputs_embeds,
  image_features,
  input_ids,
  attention_mask,
}: {
  image_token_id: number;
  inputs_embeds: Tensor;
  image_features: Tensor;
  input_ids: Tensor;
  attention_mask: Tensor;
}) {
  const image_tokens = input_ids.tolist().map((ids: any) =>
    ids.reduce((acc: any, x: any, idx: any) => {
      if (x == image_token_id) acc.push(idx);
      return acc;
    }, []),
  );
  const n_image_tokens = image_tokens.reduce((acc: any, x: any) => acc + x.length, 0);
  const n_image_features = image_features.dims[0];
  if (n_image_tokens !== n_image_features) {
    throw new Error(
      `Image features and image tokens do not match: tokens: ${n_image_tokens}, features ${n_image_features}`,
    );
  }

  // Equivalent to performing a masked_scatter
  let img = 0;
  for (let i = 0; i < image_tokens.length; ++i) {
    const tokens = image_tokens[i];
    const embeds = inputs_embeds[i];
    for (let j = 0; j < tokens.length; ++j) {
      (embeds[tokens[j]].data as any).set(image_features[img++].data);
    }
  }
  return { inputs_embeds, attention_mask };
}

/**
 * Forward pass of an image-text-to-text model.
 * @param {Object} self The image-text-to-text model model.
 * @param {Object} model_inputs The input data to be used for the forward pass.
 * @param {Tensor} [model_inputs.input_ids=null]
 * @param {Tensor} [model_inputs.attention_mask=null]
 * @param {Tensor} [model_inputs.pixel_values=null]
 * @param {Tensor} [model_inputs.position_ids=null]
 * @param {Tensor} [model_inputs.inputs_embeds=null]
 * @param {Tensor} [model_inputs.past_key_values=null]
 * @param {Object} [model_inputs.generation_config=null]
 * @param {Object} [model_inputs.logits_processor=null]
 * @returns {Promise<Tensor>} The model's output tensor
 * @private
 */
async function imageTextToTextForward(
  self: any,
  {
    // Produced by the tokenizer/processor:
    input_ids = null,
    attention_mask = null,
    pixel_values = null,

    // Used during generation:
    position_ids = null,
    inputs_embeds = null,
    past_key_values = null,

    // Generic generation parameters
    generation_config = null,
    logits_processor = null,

    // TODO: needed?
    ...kwargs
  },
) {
  if (!inputs_embeds) {
    // 1. Extract the input embeddings
    inputs_embeds = await self.encode_text({ input_ids, ...kwargs });

    // 2. Possibly, merge text and images
    if (pixel_values && (input_ids as any)?.dims[1] !== 1) {
      const image_features = await self.encode_image({ pixel_values, ...kwargs });

      ({ inputs_embeds, attention_mask } = self._merge_input_ids_with_image_features({
        image_features,
        inputs_embeds,
        input_ids,
        attention_mask,
      }));
    } else if (past_key_values && pixel_values && (input_ids as any)?.dims[1] === 1) {
      // This is the case when we are generating with cache
      const target_length = (input_ids as any)?.dims[1] ?? 1; // always 1
      const past_length = (Object.values(past_key_values)[0] as any).dims.at(-2);

      attention_mask = cat(
        [
          ones([(input_ids as any).dims[0], past_length]),
          (attention_mask as any)?.slice(null, [(attention_mask as any).dims[1] - target_length, (attention_mask as any).dims[1]]),
        ],
        1,
      ) as any;
    }
  }

  if (!position_ids) {
    if (self.config.model_type === 'qwen2_vl') {
      // Special case for qwen2_vl models
      // @ts-ignore
      const { image_grid_thw, video_grid_thw } = kwargs;
      [position_ids] = self.get_rope_index(input_ids, image_grid_thw, video_grid_thw, attention_mask);
    }
  }

  const outputs = await decoderForward(
    self,
    {
      inputs_embeds,
      past_key_values,
      attention_mask,
      position_ids,
      generation_config,
      logits_processor,
    },
    true,
  );
  return outputs;
}

/**
 * Helper function to perform the following:
 * ```python
 * x = attention_mask.long().cumsum(-1) - 1
 * x.masked_fill_(attention_mask == 0, 1)
 * ```
 * @param {Tensor} attention_mask
 * @returns {{data: BigInt64Array, dims: number[]}}
 */
function cumsum_masked_fill(attention_mask: Tensor, start_index = 0) {
  const [bz, seq_len] = attention_mask.dims;
  const attn_mask_data = attention_mask.data;

  const data = new BigInt64Array(attn_mask_data.length);
  for (let i = 0; i < bz; ++i) {
    const start = i * seq_len;
    let sum = BigInt(start_index);
    for (let j = 0; j < seq_len; ++j) {
      const index = start + j;
      if (attn_mask_data[index] === 0n) {
        data[index] = BigInt(1);
      } else {
        // === 1n
        data[index] = sum;
        sum += attn_mask_data[index];
      }
    }
  }
  return { data, dims: attention_mask.dims };
}

/**
 * If the model supports providing position_ids, we create position_ids on the fly for batch generation,
 * by computing the cumulative sum of the attention mask along the sequence length dimension.
 *
 * Equivalent to:
 * ```python
 * position_ids = attention_mask.long().cumsum(-1) - 1
 * position_ids.masked_fill_(attention_mask == 0, 1)
 * if past_key_values:
 *     position_ids = position_ids[:, -input_ids.shape[1] :]
 * ```
 */
function createPositionIds(model_inputs: Record<string, any>, past_key_values = null, start_index = 0) {
  const { input_ids, inputs_embeds, attention_mask } = model_inputs;

  const { data, dims } = cumsum_masked_fill(attention_mask, start_index);
  let position_ids = new Tensor('int64', data, dims);
  if (past_key_values) {
    const offset = -(input_ids ?? inputs_embeds).dims.at(1);
    // position_ids = position_ids.slice(null, [offset, null]);
    position_ids = position_ids.slice(null, [offset]);
  }
  return position_ids;
}

function decoder_prepare_inputs_for_generation(
  self: PreTrainedModel,
  input_ids: Tensor,
  model_inputs: Record<string, any>,
  generation_config: GenerationConfig,
) {
  if (model_inputs.past_key_values) {
    const past_length = (Object.values(model_inputs.past_key_values)[0] as any).dims.at(-2);
    const { input_ids, attention_mask } = model_inputs;

    // Keep only the unprocessed tokens:
    // 1 - If the length of the attention_mask exceeds the length of input_ids, then we are in a setting where
    // some of the inputs are exclusively passed as part of the cache (e.g. when passing input_embeds as
    // input)
    if (attention_mask && attention_mask.dims[1] > input_ids.dims[1]) {
      // NOTE: not needed since we only pass the generated tokens to the next forward pass
      // const offset = -(attention_mask.dims[1] - past_length);
      // model_inputs.input_ids = input_ids.slice(null, [offset, null]);
    }
    // 2 - If the past_length is smaller than input_ids', then input_ids holds all input tokens.
    // We can discard input_ids based on the past_length.
    else if (past_length < input_ids.dims[1]) {
      // NOTE: Required for phi models.
      // See https://github.com/huggingface/transformers/issues/30809#issuecomment-2111918479 for more information.
      model_inputs.input_ids = input_ids.slice(null, [past_length, null]);
    }
    // 3 - Otherwise (past_length >= input_ids.shape[1]), let's assume input_ids only has unprocessed tokens.
    else {
      if (
        // NOTE: Only used by VLMs (!= so that null matches undefined)
        (self.config as any).image_token_index != null &&
        // Equivalent to `self.config.image_token_index in input_ids` (== so that int matches bigint)
        input_ids.data.some((x: any) => x == (self.config as any).image_token_index)
      ) {
        // TODO: Support multiple image tokens
        const num_image_tokens = (self.config as any).num_image_tokens;
        if (!num_image_tokens) {
          throw new Error('`num_image_tokens` is missing in the model configuration.');
        }

        const num_new_tokens = input_ids.dims[1] - (past_length - num_image_tokens);
        model_inputs.input_ids = input_ids.slice(null, [-num_new_tokens, null]);

        // TODO: The attention mask should be formed from the attention mask passed in model_inputs
        model_inputs.attention_mask = ones([1, past_length + num_new_tokens]);
      }
    }
  }

  return model_inputs;
}

function encoder_decoder_prepare_inputs_for_generation(
  self: PreTrainedModel,
  input_ids: Tensor,
  model_inputs: Record<string, any>,
  generation_config: GenerationConfig,
) {
  if (model_inputs.past_key_values) {
    input_ids = input_ids.map((x: any) => [x.at(-1)]);
  }

  return {
    ...model_inputs,
    decoder_input_ids: toI64Tensor(input_ids),
  };
}

function image_text_to_text_prepare_inputs_for_generation(
  self: PreTrainedModel,
  ...args: [Tensor, Record<string, any>, GenerationConfig]
) {
  if (self.config.is_encoder_decoder) {
    return encoder_decoder_prepare_inputs_for_generation(self, ...args);
  } else {
    return decoder_prepare_inputs_for_generation(self, ...args);
  }
}

function multimodality_prepare_inputs_for_generation(
  self: PreTrainedModel,
  input_ids: Tensor,
  model_inputs: Record<string, any>,
  generation_config: GenerationConfig,
) {
  const has_past_key_values = !!model_inputs.past_key_values;

  if (generation_config.guidance_scale !== null && generation_config.guidance_scale > 1) {
    if (has_past_key_values) {
      model_inputs.input_ids = cat([model_inputs.input_ids, model_inputs.input_ids], 0);
      // NOTE: attention_mask handled in generation
    } else {
      model_inputs.input_ids = cat(
        [model_inputs.input_ids, full_like(model_inputs.input_ids, BigInt(generation_config.pad_token_id as number))],
        0,
      );
      model_inputs.attention_mask = cat([model_inputs.attention_mask, full_like(model_inputs.attention_mask, 0n)], 0);
    }
  }

  if (has_past_key_values || !model_inputs.pixel_values) {
    model_inputs.pixel_values = full([0, 0, 3, 384, 384], 1.0);
  }

  if (has_past_key_values) {
    const num_img_tokens = 0;
    const num_text_tokens = 1;
    const has_image = num_img_tokens > 0 ? 1 : 0;

    const batch_size = 1;
    model_inputs.images_seq_mask = new Tensor(
      'bool',
      new Array(num_img_tokens + num_text_tokens).fill(true).fill(false, 0, num_text_tokens),
      [batch_size, num_img_tokens + num_text_tokens],
    );
    model_inputs.images_emb_mask = new Tensor('bool', new Array(num_img_tokens).fill(!!has_image), [
      batch_size,
      1,
      num_img_tokens,
    ]);
  }
  return model_inputs;
}

//////////////////////////////////////////////////

//////////////////////////////////////////////////
/**
 * A base class for pre-trained models that provides the model configuration and an ONNX session.
 */
export class PreTrainedModel extends Callable {
  main_input_name = 'input_ids';
  forward_params = ['input_ids', 'attention_mask'];
  /**
   * Creates a new instance of the `PreTrainedModel` class.
   * @param {import('./configs.js').PretrainedConfig} config The model configuration.
   * @param {Record<string, any>} sessions The inference sessions for the model.
   * @param {Record<string, Object>} configs Additional configuration files (e.g., generation_config.json).
   */
  config: PretrainedConfig;
  sessions: Record<string, any>;
  configs: Record<string, any>;
  can_generate: boolean;
  _forward: (self: PreTrainedModel, model_inputs: Record<string, any>) => Promise<any>;
  _prepare_inputs_for_generation: (
    self: PreTrainedModel,
    input_ids: Tensor,
    model_inputs: Record<string, any>,
    generation_config: GenerationConfig,
    ...args: any[]
  ) => Record<string, any>;
  custom_config: TransformersJSConfig;
  constructor(config: PretrainedConfig, sessions: Record<string, any>, configs: Record<string, any>) {
    super();

    this.config = config;
    this.sessions = sessions;
    this.configs = configs;

    const modelName = MODEL_CLASS_TO_NAME_MAPPING.get(this.constructor);
    const modelType = MODEL_TYPE_MAPPING.get(modelName);

    this.can_generate = false;
    this._forward = PreTrainedModel.prototype._forward;

    this._prepare_inputs_for_generation = PreTrainedModel.prototype._prepare_inputs_for_generation;
    switch (modelType) {
      case MODEL_TYPES.DecoderOnly:
        this.can_generate = true;
        this._forward = decoderForward;
        this._prepare_inputs_for_generation = decoder_prepare_inputs_for_generation;
        break;
      case MODEL_TYPES.Seq2Seq:
      case MODEL_TYPES.Vision2Seq:
      case MODEL_TYPES.Musicgen:
        this.can_generate = true;

        this._forward = seq2seqForward;
        this._prepare_inputs_for_generation = encoder_decoder_prepare_inputs_for_generation;
        break;

      case MODEL_TYPES.EncoderDecoder:
        this._forward = seq2seqForward;
        break;
      case MODEL_TYPES.ImageTextToText:
        this.can_generate = true;
        this._forward = imageTextToTextForward;
        this._prepare_inputs_for_generation = image_text_to_text_prepare_inputs_for_generation;
        break;
      case MODEL_TYPES.Phi3V:
        this.can_generate = true;
        this._prepare_inputs_for_generation = image_text_to_text_prepare_inputs_for_generation;
        break;

      case MODEL_TYPES.MultiModality:
        this.can_generate = true;
        this._prepare_inputs_for_generation = multimodality_prepare_inputs_for_generation;
        break;

      default:
        // should be MODEL_TYPES.EncoderOnly
        this._forward = encoderForward;
        break;
    }

    if (this.can_generate) {
      this.forward_params.push('past_key_values');
    }

    /** @type {import('./configs.js').TransformersJSConfig} */
    this.custom_config = this.config['transformers_js_config'] ?? {};
  }

  /**
   * Disposes of all the ONNX sessions that were created during inference.
   * @returns {Promise<unknown[]>} An array of promises, one for each ONNX session that is being disposed.
   * @todo Use https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/FinalizationRegistry
   */
  async dispose() {
    const promises = [];
    for (const session of Object.values(this.sessions)) {
      if (session?.handler?.dispose) {
        promises.push(session.handler.dispose());
      }
    }
    return await Promise.all(promises);
  }

  /**
   * Instantiate one of the model classes of the library from a pretrained model.
   *
   * The model class to instantiate is selected based on the `model_type` property of the config object
   * (either passed as an argument or loaded from `pretrained_model_name_or_path` if possible)
   *
   * @param {string} pretrained_model_name_or_path The name or path of the pretrained model. Can be either:
   * - A string, the *model id* of a pretrained model hosted inside a model repo on huggingface.co.
   *   Valid model ids can be located at the root-level, like `bert-base-uncased`, or namespaced under a
   *   user or organization name, like `dbmdz/bert-base-german-cased`.
   * - A path to a *directory* containing model weights, e.g., `./my_model_directory/`.
   * @param {import('./utils/hub.js').PretrainedModelOptions} options Additional options for loading the model.
   *
   * @returns {Promise<PreTrainedModel>} A new instance of the `PreTrainedModel` class.
   */
  static async from_pretrained(
    pretrained_model_name_or_path: string,
    {
      progress_callback = null,
      config = null,
      cache_dir = null,
      local_files_only = false,
      revision = 'main',
      model_file_name = null,
      subfolder = 'onnx',
      device = null,
      dtype = null,
      use_external_data_format = null,
      session_options = {},
    }: ModelOptions = {},
  ) {
    let options = {
      progress_callback,
      config,
      cache_dir,
      local_files_only,
      revision,
      model_file_name,
      subfolder,
      device,
      dtype,
      use_external_data_format,
      session_options,
    };

    const modelName = MODEL_CLASS_TO_NAME_MAPPING.get(this);
    const modelType = MODEL_TYPE_MAPPING.get(modelName);

    config = (options.config as any) = await AutoConfig.from_pretrained(pretrained_model_name_or_path, options);

    let info;
    if (modelType === MODEL_TYPES.DecoderOnly) {
      info = await Promise.all([
        constructSessions(
          pretrained_model_name_or_path,
          {
            model: options.model_file_name ?? 'model',
          },
          options,
        ),
        getOptionalConfigs(
          pretrained_model_name_or_path,
          {
            generation_config: 'generation_config.json',
          },
          options,
        ),
      ]);
    } else if (modelType === MODEL_TYPES.Seq2Seq || modelType === MODEL_TYPES.Vision2Seq) {
      info = await Promise.all([
        constructSessions(
          pretrained_model_name_or_path,
          {
            model: 'encoder_model',
            decoder_model_merged: 'decoder_model_merged',
          },
          options,
        ),
        getOptionalConfigs(
          pretrained_model_name_or_path,
          {
            generation_config: 'generation_config.json',
          },
          options,
        ),
      ]);
    } else if (modelType === MODEL_TYPES.MaskGeneration) {
      info = await Promise.all([
        constructSessions(
          pretrained_model_name_or_path,
          {
            model: 'vision_encoder',
            prompt_encoder_mask_decoder: 'prompt_encoder_mask_decoder',
          },
          options,
        ),
      ]);
    } else if (modelType === MODEL_TYPES.EncoderDecoder) {
      info = await Promise.all([
        constructSessions(
          pretrained_model_name_or_path,
          {
            model: 'encoder_model',
            decoder_model_merged: 'decoder_model_merged',
          },
          options,
        ),
      ]);
    } else if (modelType === MODEL_TYPES.ImageTextToText) {
      const sessions = {
        embed_tokens: 'embed_tokens',
        vision_encoder: 'vision_encoder',
        decoder_model_merged: 'decoder_model_merged',
      };
      if ((config as any).is_encoder_decoder) {
        (sessions as any)['model'] = 'encoder_model';
      }
      info = await Promise.all([
        constructSessions(pretrained_model_name_or_path, sessions, options),
        getOptionalConfigs(
          pretrained_model_name_or_path,
          {
            generation_config: 'generation_config.json',
          },
          options,
        ),
      ]);
    } else if (modelType === MODEL_TYPES.Musicgen) {
      info = await Promise.all([
        constructSessions(
          pretrained_model_name_or_path,
          {
            model: 'text_encoder',
            decoder_model_merged: 'decoder_model_merged',
            encodec_decode: 'encodec_decode',
          },
          options,
        ),
        getOptionalConfigs(
          pretrained_model_name_or_path,
          {
            generation_config: 'generation_config.json',
          },
          options,
        ),
      ]);
    } else if (modelType === MODEL_TYPES.MultiModality) {
      info = await Promise.all([
        constructSessions(
          pretrained_model_name_or_path,
          {
            prepare_inputs_embeds: 'prepare_inputs_embeds',
            model: 'language_model',
            lm_head: 'lm_head',
            gen_head: 'gen_head',
            gen_img_embeds: 'gen_img_embeds',
            image_decode: 'image_decode',
          },
          options,
        ),
        getOptionalConfigs(
          pretrained_model_name_or_path,
          {
            generation_config: 'generation_config.json',
          },
          options,
        ),
      ]);
    } else if (modelType === MODEL_TYPES.Phi3V) {
      info = await Promise.all([
        constructSessions(
          pretrained_model_name_or_path,
          {
            prepare_inputs_embeds: 'prepare_inputs_embeds',
            model: 'model',
            vision_encoder: 'vision_encoder',
          },
          options,
        ),
        getOptionalConfigs(
          pretrained_model_name_or_path,
          {
            generation_config: 'generation_config.json',
          },
          options,
        ),
      ]);
    } else {
      // should be MODEL_TYPES.EncoderOnly
      if (modelType !== MODEL_TYPES.EncoderOnly) {
        const type = modelName ?? (config as any)?.model_type;
        if (type !== 'custom') {
          console.warn(
            `Model type for '${type}' not found, assuming encoder-only architecture. Please report this at ${GITHUB_ISSUE_URL}.`,
          );
        }
      }
      info = await Promise.all([
        constructSessions(
          pretrained_model_name_or_path,
          {
            model: options.model_file_name ?? 'model',
          },
          options,
        ),
      ]);
    }

    // @ts-ignore
    return new this(config, ...info);
  }

  /**
   * Runs the model with the provided inputs
   * @param {Object} model_inputs Object containing input tensors
   * @returns {Promise<Object>} Object containing output tensors
   */
  async _call(model_inputs: Record<string, unknown>) {
    return await this.forward(model_inputs);
  }

  /**
   * Forward method for a pretrained model. If not overridden by a subclass, the correct forward method
   * will be chosen based on the model type.
   * @param {Object} model_inputs The input data to the model in the format specified in the ONNX model.
   * @returns {Promise<Object>} The output data from the model in the format specified in the ONNX model.
   * @throws {Error} This method must be implemented in subclasses.
   */
  async forward(model_inputs: Record<string, unknown>) {
    return await this._forward(this, model_inputs);
  }

  /**
   * Get the model's generation config, if it exists.
   * @returns {GenerationConfig|null} The model's generation config if it exists, otherwise `null`.
   */
  get generation_config() {
    return this.configs?.generation_config ?? null;
  }

  /**
   * This function returns a [`LogitsProcessorList`] list object that contains all relevant [`LogitsWarper`]
   * instances used for multinomial sampling.
   * @param {GenerationConfig} generation_config The generation config.
   * @returns {LogitsProcessorList} generation_config
   */
  _get_logits_warper(generation_config: GenerationConfig) {
    // instantiate warpers list
    const warpers = new LogitsProcessorList();

    if (generation_config.temperature !== null && generation_config.temperature !== 1.0) {
      warpers.push(new TemperatureLogitsWarper(generation_config.temperature));
    }
    if (generation_config.top_k !== null && generation_config.top_k !== 0) {
      // TODO: add min_tokens_to_keep
      warpers.push(new TopKLogitsWarper(generation_config.top_k) as any);
    }
    if (generation_config.top_p !== null && generation_config.top_p < 1.0) {
      // TODO: add min_tokens_to_keep
      warpers.push(new TopPLogitsWarper(generation_config.top_p) as any);
    }

    return warpers;
  }

  /**
   * @param {GenerationConfig} generation_config
   * @param {number} input_ids_seq_length The starting sequence length for the input ids.
   * @returns {LogitsProcessorList}
   * @private
   */
  _get_logits_processor(
    generation_config: GenerationConfig,
    input_ids_seq_length: number,
    // encoder_input_ids, TODO
    // prefix_allowed_tokens_fn, TODO
    logits_processor: LogitsProcessorList | null = null,
  ) {
    const processors = new LogitsProcessorList();

    // if (generation_config.diversity_penalty !== null && generation_config.diversity_penalty > 0.0) {
    //     processors.push(new HammingDiversityLogitsProcessor(
    //         generation_config.diversity_penalty,
    //         generation_config.num_beams,
    //         generation_config.num_beam_groups
    //     ));
    // }

    // if (generation_config.encoder_repetition_penalty !== null && generation_config.encoder_repetition_penalty !== 1.0) {
    //     processors.push(new EncoderRepetitionPenaltyLogitsProcessor(
    //         generation_config.encoder_repetition_penalty,
    //         encoder_input_ids
    //     ));
    // }

    if (generation_config.repetition_penalty !== null && generation_config.repetition_penalty !== 1.0) {
      processors.push(new RepetitionPenaltyLogitsProcessor(generation_config.repetition_penalty));
    }

    if (generation_config.no_repeat_ngram_size !== null && generation_config.no_repeat_ngram_size > 0) {
      processors.push(new NoRepeatNGramLogitsProcessor(generation_config.no_repeat_ngram_size));
    }

    // if (generation_config.encoder_no_repeat_ngram_size !== null && generation_config.encoder_no_repeat_ngram_size > 0) {
    //     if (this.config.is_encoder_decoder) {
    //         processors.push(new EncoderNoRepeatNGramLogitsProcessor(
    //             generation_config.encoder_no_repeat_ngram_size,
    //             encoder_input_ids
    //         ));
    //     } else {
    //         throw new Error("It's impossible to use `encoder_no_repeat_ngram_size` with decoder-only architecture");
    //     }
    // }

    if (generation_config.bad_words_ids !== null) {
      processors.push(
        new NoBadWordsLogitsProcessor(
          generation_config.bad_words_ids,
          (generation_config.eos_token_id as any),
        ),
      );
    }

    if (
      generation_config.min_length !== null &&
      generation_config.eos_token_id !== null &&
      generation_config.min_length > 0
    ) {
      processors.push(new MinLengthLogitsProcessor(generation_config.min_length, generation_config.eos_token_id));
    }

    if (
      generation_config.min_new_tokens !== null &&
      generation_config.eos_token_id !== null &&
      generation_config.min_new_tokens > 0
    ) {
      processors.push(
        new MinNewTokensLengthLogitsProcessor(
          input_ids_seq_length,
          generation_config.min_new_tokens,
          generation_config.eos_token_id,
        ),
      );
    }

    // if (prefix_allowed_tokens_fn !== null) {
    //     processors.push(new PrefixConstrainedLogitsProcessor(
    //         prefix_allowed_tokens_fn,
    //         generation_config.num_beams / generation_config.num_beam_groups
    //     ));
    // }

    if (generation_config.forced_bos_token_id !== null) {
      processors.push(new ForcedBOSTokenLogitsProcessor(generation_config.forced_bos_token_id));
    }

    if (generation_config.forced_eos_token_id !== null) {
      processors.push(
        new ForcedEOSTokenLogitsProcessor(generation_config.max_length, generation_config.forced_eos_token_id),
      );
    }

    // if (generation_config.remove_invalid_values === true) {
    //     processors.push(new InfNanRemoveLogitsProcessor());
    // }

    // if (generation_config.exponential_decay_length_penalty !== null) {
    //     processors.push(new ExponentialDecayLengthPenalty(
    //         generation_config.exponential_decay_length_penalty,
    //         generation_config.eos_token_id,
    //         input_ids_seq_length
    //     ));
    // }

    // if (generation_config.suppress_tokens !== null) {
    //     processors.push(new SuppressTokensLogitsProcessor(generation_config.suppress_tokens));
    // }

    if (generation_config.begin_suppress_tokens !== null) {
      const begin_index =
        input_ids_seq_length > 1 || generation_config.forced_bos_token_id === null
          ? input_ids_seq_length
          : input_ids_seq_length + 1;

      processors.push(new SuppressTokensAtBeginLogitsProcessor(generation_config.begin_suppress_tokens, begin_index));
    }

    // DEPRECATED: https://github.com/huggingface/transformers/pull/29485
    // if (generation_config.forced_decoder_ids !== null) {
    //     processors.push(new ForceTokensLogitsProcessor(generation_config.forced_decoder_ids));
    // }

    // 8. prepare batched CFG externally
    if (generation_config.guidance_scale !== null && generation_config.guidance_scale > 1) {
      processors.push(new ClassifierFreeGuidanceLogitsProcessor(generation_config.guidance_scale));
    }

    if (logits_processor !== null) {
      processors.extend(logits_processor as any);
    }

    // `LogitNormalization` should always be the last logit processor, when present
    // if (generation_config.renormalize_logits === true) {
    //     processors.push(new LogitNormalization());
    // }

    return processors;
  }

  /**
   * This function merges multiple generation configs together to form a final generation config to be used by the model for text generation.
   * It first creates an empty `GenerationConfig` object, then it applies the model's own `generation_config` property to it. Finally, if a `generation_config` object was passed in the arguments, it overwrites the corresponding properties in the final config with those of the passed config object.
   * @param {GenerationConfig|null} generation_config A `GenerationConfig` object containing generation parameters.
   * @param {Object} kwargs Additional generation parameters to be used in place of those in the `generation_config` object.
   * @returns {GenerationConfig} The final generation config object to be used by the model for text generation.
   */
  _prepare_generation_config(
    generation_config: GenerationConfig | null,
    kwargs: any,
    cls = GenerationConfig,
  ) {
    // Create empty generation config (contains defaults)
    // We pass `this.config` so that if `eos_token_id` or `bos_token_id` exist in the model's config, we will use them
    const config = { ...this.config };
    for (const key of ['decoder', 'generator', 'text_config']) {
      // Special case: some models have generation attributes set in the decoder.
      // Use them if still unset in the generation config.
      if (key in config) {
        Object.assign(config, (config as any)[key]);
      }
    }

    const gen_config = new cls(config);

    // Apply model's generation config, if it exists
    Object.assign(gen_config, this.generation_config ?? {});

    // Next, use any generation config specified by the user
    // when calling `generate`
    if (generation_config) {
      Object.assign(gen_config, generation_config);
    }

    // Finally, if any kwargs were passed, use them to overwrite
    if (kwargs) {
      Object.assign(gen_config, pick(kwargs, Object.getOwnPropertyNames(gen_config)));
    }

    return gen_config;
  }

  /**
   *
   * @param {GenerationConfig} generation_config
   * @param {StoppingCriteriaList} [stopping_criteria=null]
   */
  _get_stopping_criteria(generation_config: GenerationConfig, stopping_criteria = null) {
    const criteria = new StoppingCriteriaList();

    if (generation_config.max_length !== null) {
      criteria.push(new MaxLengthCriteria(generation_config.max_length, this.config.max_position_embeddings ?? null));
    }
    // if (generation_config.max_time !== null) {
    //     criteria.push(new MaxTimeCriteria(generation_config.max_time));
    // }
    if (generation_config.eos_token_id !== null) {
      criteria.push(new EosTokenCriteria(generation_config.eos_token_id));
    }

    if (stopping_criteria) {
      criteria.extend(stopping_criteria);
    }
    return criteria;
  }

  /**
   * Confirms that the model class is compatible with generation.
   * If not, raises an exception that points to the right class to use.
   */
  _validate_model_class() {
    if (!this.can_generate) {
      const generate_compatible_mappings = [
        MODEL_FOR_CAUSAL_LM_MAPPING_NAMES,
        // MODEL_FOR_CAUSAL_IMAGE_MODELING_MAPPING, // TODO
        MODEL_FOR_VISION_2_SEQ_MAPPING_NAMES,
        MODEL_FOR_SPEECH_SEQ_2_SEQ_MAPPING_NAMES,
      ];

      const modelName = MODEL_CLASS_TO_NAME_MAPPING.get(this.constructor);

      const generate_compatible_classes = new Set();
      const modelType = this.config.model_type;
      for (const model_mapping of generate_compatible_mappings) {
        const supported_models = model_mapping.get(modelType ?? 'custom');
        if (supported_models) {
          generate_compatible_classes.add(supported_models[0]);
        }
      }

      let errorMessage = `The current model class (${modelName}) is not compatible with \`.generate()\`, as it doesn't have a language model head.`;
      if (generate_compatible_classes.size > 0) {
        errorMessage += ` Please use the following class instead: ${[...generate_compatible_classes].join(', ')}`;
      }
      throw Error(errorMessage);
    }
  }

  prepare_inputs_for_generation(
    this: PreTrainedModel,
    ...args: [Tensor, Record<string, unknown>, GenerationConfig]
  ) {
    return this._prepare_inputs_for_generation(this, ...args);
  }

  /**
   *
   * @param {Object} inputs
   * @param {bigint[][]} inputs.generated_input_ids
   * @param {Object} inputs.outputs
   * @param {Object} inputs.model_inputs
   * @param {boolean} inputs.is_encoder_decoder
   * @returns {Object} The updated model inputs for the next generation iteration.
   */
  _update_model_kwargs_for_generation({
    generated_input_ids,
    outputs,
    model_inputs,
    is_encoder_decoder,
  }: {
    generated_input_ids: bigint[][];
    outputs: Record<string, unknown>;
    model_inputs: Record<string, unknown>;
    is_encoder_decoder: boolean;
  }) {
    // update past_key_values
    model_inputs['past_key_values'] = this.getPastKeyValues(outputs, (model_inputs.past_key_values as any));

    // update inputs for next run
    model_inputs['input_ids'] = new Tensor('int64', generated_input_ids.flat(), [generated_input_ids.length, 1]);

    if (!is_encoder_decoder) {
      // update attention mask
      model_inputs.attention_mask = cat(
        [(model_inputs.attention_mask as any), ones([(model_inputs.attention_mask as any).dims[0], 1])],
        1,
      );
    } else if ('decoder_attention_mask' in model_inputs) {
      // TODO: update decoder attention mask if the model requires it
    }

    // force recreate position_ids in next iteration
    model_inputs['position_ids'] = null;

    return model_inputs;
  }

  /**
   * This function extracts the model-specific `inputs` for generation.
   * @param {Object} params
   * @param {Tensor} [params.inputs=null]
   * @param {number} [params.bos_token_id=null]
   * @param {Record<string, Tensor|number[]>} [params.model_kwargs]
   * @returns {{inputs_tensor: Tensor, model_inputs: Record<string, Tensor>, model_input_name: string}} The model-specific inputs for generation.
   */
  _prepare_model_inputs({
    inputs,
    bos_token_id,
    model_kwargs,
  }: {
    inputs: Tensor | null;
    bos_token_id: number | null;
    model_kwargs: Record<string, any>;
  }) {
    const model_inputs = pick(model_kwargs, this.forward_params);
    const input_name = this.main_input_name;
    if (input_name in model_inputs) {
      if (inputs) {
        throw new Error(
          '`inputs`: {inputs}` were passed alongside {input_name} which is not allowed. ' +
          'Make sure to either pass {inputs} or {input_name}=...',
        );
      }
    } else {
      model_inputs[input_name] = inputs;
    }

    const inputs_tensor = model_inputs[input_name];

    return { inputs_tensor, model_inputs, model_input_name: input_name };
  }

  async _prepare_encoder_decoder_kwargs_for_generation({
    inputs_tensor,
    model_inputs,
    model_input_name,
    generation_config,
  }: {
    inputs_tensor: Tensor;
    model_inputs: Record<string, unknown>;
    model_input_name: string;
    generation_config: GenerationConfig;
  }) {
    if (
      this.sessions['model'].inputNames.includes('inputs_embeds') &&
      !model_inputs.inputs_embeds &&
      '_prepare_inputs_embeds' in this
    ) {
      // Encoder expects `inputs_embeds` instead of `input_ids`
      const { input_ids, pixel_values, attention_mask, ...kwargs } = model_inputs;
      // @ts-ignore
      const prepared_inputs = await this._prepare_inputs_embeds(model_inputs);
      model_inputs = {
        ...kwargs,
        ...pick(prepared_inputs, ['inputs_embeds', 'attention_mask']),
      };
    }
    let { last_hidden_state } = await encoderForward(this, model_inputs);

    // for classifier free guidance we need to add a 'null' input to our encoder hidden states
    if (generation_config.guidance_scale !== null && generation_config.guidance_scale > 1) {
      last_hidden_state = cat([last_hidden_state, full_like(last_hidden_state, 0.0)], 0);

      if ('attention_mask' in model_inputs) {
        model_inputs['attention_mask'] = cat(
          [(model_inputs['attention_mask'] as any), zeros_like((model_inputs['attention_mask'] as any))],
          0,
        );
      }
    } else if (model_inputs.decoder_input_ids) {
      // Ensure that the encoder outputs have the same batch size as the decoder inputs,
      // allowing for more efficient batched generation for single inputs
      const decoder_input_ids_batch_size = toI64Tensor(model_inputs.decoder_input_ids).dims[0];
      if (decoder_input_ids_batch_size !== last_hidden_state.dims[0]) {
        if (last_hidden_state.dims[0] !== 1) {
          throw new Error(
            `The encoder outputs have a different batch size (${last_hidden_state.dims[0]}) than the decoder inputs (${decoder_input_ids_batch_size}).`,
          );
        }
        last_hidden_state = cat(
          Array.from({ length: decoder_input_ids_batch_size }, () => last_hidden_state),
          0,
        );
      }
    }
    model_inputs['encoder_outputs'] = last_hidden_state;

    return model_inputs;
  }

  /**
   * Prepares `decoder_input_ids` for generation with encoder-decoder models
   * @param {*} param0
   */
  _prepare_decoder_input_ids_for_generation({
    batch_size,
    model_input_name,
    model_kwargs,
    decoder_start_token_id,
    bos_token_id,
    generation_config,
  }: {
    batch_size: number;
    model_input_name: string;
    model_kwargs: Record<string, unknown>;
    decoder_start_token_id: number | null;
    bos_token_id: number | null;
    generation_config: GenerationConfig;
  }) {
    let { decoder_input_ids, ...model_inputs } = model_kwargs;

    // Prepare input ids if the user has not defined `decoder_input_ids` manually.
    if (!(decoder_input_ids instanceof Tensor)) {
      if (!decoder_input_ids) {
        decoder_start_token_id ??= bos_token_id;

        if (this.config.model_type === 'musicgen') {
          // Custom logic (TODO: move to Musicgen class)
          decoder_input_ids = Array.from(
            {
              // @ts-expect-error TS2339
              length: batch_size * this.config.decoder.num_codebooks,
            },
            () => [decoder_start_token_id],
          );
        } else if (Array.isArray(decoder_start_token_id)) {
          if (decoder_start_token_id.length !== batch_size) {
            throw new Error(
              `\`decoder_start_token_id\` expcted to have length ${batch_size} but got ${decoder_start_token_id.length}`,
            );
          }
          decoder_input_ids = decoder_start_token_id;
        } else {
          decoder_input_ids = Array.from(
            {
              length: batch_size,
            },
            () => [decoder_start_token_id],
          );
        }
      } else if (!Array.isArray((decoder_input_ids as any)[0])) {
        // Correct batch size
        decoder_input_ids = Array.from(
          {
            length: batch_size,
          },
          () => decoder_input_ids,
        );
      }
      decoder_input_ids = toI64Tensor(decoder_input_ids);
    }

    model_kwargs['decoder_attention_mask'] = ones_like((decoder_input_ids as any));

    return { input_ids: decoder_input_ids, model_inputs };
  }

  /**
   * Generates sequences of token ids for models with a language modeling head.
   * @param {import('./generation/parameters.js').GenerationFunctionParameters} options
   * @returns {Promise<ModelOutput|Tensor>} The output of the model, which can contain the generated token ids, attentions, and scores.
   */
  async generate({
    inputs = null,
    generation_config = null,
    logits_processor = null,
    stopping_criteria = null,
    streamer = null,
    ...kwargs
  }: any) {
    this._validate_model_class();

    // Update generation config with defaults and kwargs
    generation_config = this._prepare_generation_config(generation_config, kwargs);

    // 3. Define model inputs
    let { inputs_tensor, model_inputs, model_input_name } = this._prepare_model_inputs({
      inputs: inputs,
      bos_token_id: null,
      model_kwargs: kwargs,
    });

    const is_encoder_decoder = this.config.is_encoder_decoder;

    // 4. Define other model kwargs
    if (!is_encoder_decoder) {
      // decoder-only models should use left-padding for generation
    } else if (!('encoder_outputs' in model_inputs)) {
      // if model is encoder decoder encoder_outputs are created
      // and added to `model_kwargs`
      model_inputs = await this._prepare_encoder_decoder_kwargs_for_generation({
        inputs_tensor: (inputs_tensor as Tensor),
        model_inputs: (model_inputs as Record<string, unknown>),
        model_input_name: (model_input_name as string),
        generation_config: (generation_config as GenerationConfig),
      });
    }

    // 5. Prepare `input_ids` which will be used for auto-regressive generation
    // TODO: Update to align with HF transformers' implementation
    let input_ids;
    if (is_encoder_decoder) {
      // Generating from the encoder outputs
      ({ input_ids, model_inputs } = this._prepare_decoder_input_ids_for_generation({
        batch_size: (model_inputs[model_input_name] as any).dims.at(0),
        model_input_name,
        model_kwargs: model_inputs,
        decoder_start_token_id: (generation_config as any).decoder_start_token_id,
        bos_token_id: (generation_config as any).bos_token_id,
        generation_config,
      }));
    } else {
      input_ids = model_inputs[model_input_name];
    }

    // 6. Prepare `max_length` depending on other stopping criteria.
    let input_ids_length = input_ids.dims.at(-1);

    if (generation_config && (generation_config as any).max_new_tokens !== null) {
      (generation_config as any).max_length = input_ids_length + (generation_config as any).max_new_tokens;
    }

    // input_ids_length = model_inputs[model_input_name].dims.at(1);
    // // inputs instanceof Tensor ?  : inputs.length;

    // // decoder-only
    // if (input_ids_length === 0) {
    //     throw Error("Must supply a non-empty array of input token ids.")
    // }

    // let decoder_input_ids =
    // generation_config.decoder_input_ids
    // ?? generation_config.decoder_start_token_id
    // ?? generation_config.bos_token_id
    // ?? generation_config.eos_token_id;

    // Update logits processor
    // 8. prepare distribution pre_processing samplers
    const prepared_logits_processor = this._get_logits_processor(generation_config, input_ids_length, logits_processor as any);

    // 9. prepare stopping criteria
    const prepared_stopping_criteria = this._get_stopping_criteria(generation_config, stopping_criteria as any);

    // /** @type {number[]} */
    // let eos_token_ids = generation_config.eos_token_id;
    // if (eos_token_ids !== null && !Array.isArray(eos_token_ids)) {
    //     eos_token_ids = [eos_token_ids];
    // }

    const numInputs = model_inputs[model_input_name].dims.at(0);

    // TODO:
    // done is a list of booleans to keep track of which inputs are done
    // const done = new Array(numInputs).fill(false);
    // For efficiency purposes, we remove completed rows from model_inputs
    // when the beam is complete, and we keep track of the row index
    // const rowIndexToBatchIndex = new Map();

    const sampler = LogitsSampler.getSampler(generation_config);

    // TODO make > numInputs
    const scores = new Array(numInputs).fill(0);
    /** @type {bigint[][]} */
    const all_input_ids = input_ids.tolist();
    if (streamer) {
      (streamer as any).put(all_input_ids);
    }
    // const all_generated_input_ids = Array.from({ length: numInputs }, () => []);

    // NOTE: For now, we don't support spawning new beams
    // TODO: when we do, we simply copy past key values and accumulate into single large tensor

    ////////////////////////////////////////////////////
    // Generic search which handles 4 generation modes:
    // - GenerationMode.GREEDY_SEARCH
    // - GenerationMode.SAMPLE
    // - GenerationMode.BEAM_SEARCH
    // - GenerationMode.BEAM_SAMPLE
    ////////////////////////////////////////////////////
    let outputs;
    let attentions = {};
    while (true) {
      // prepare model inputs
      model_inputs = this.prepare_inputs_for_generation(all_input_ids, model_inputs, generation_config);
      outputs = await this.forward(model_inputs);

      if ((generation_config as any).output_attentions && (generation_config as any).return_dict_in_generate) {
        // Get attentions if they are present
        const token_attentions = this.getAttentions(outputs);
        for (const key in token_attentions) {
          if (!(key in attentions)) {
            (attentions as any)[key] = [];
          }
          (attentions as any)[key].push(token_attentions[key]);
        }
      }

      // Logits are of the form [batch_size, out_seq_length, vocab_size]
      // In most cases, this will be [batch_size, 1, vocab_size]
      // So, we select the last token's logits:
      // (equivalent to `logits = outputs.logits[:, -1, :]`)
      const logits = outputs.logits.slice(null, -1, null);

      const next_tokens_scores = prepared_logits_processor._call(all_input_ids, logits);

      /** @type {[bigint][]} */
      const generated_input_ids = [];
      // const new_kv_cache = [];// NOTE: Only used for beam search when concatenating new kv
      // Loop over each batch
      for (let batch_idx = 0; batch_idx < next_tokens_scores.dims.at(0); ++batch_idx) {
        const logs = next_tokens_scores[batch_idx];

        const sampledTokens = await sampler.sample(logs);
        for (const [newTokenId, logProb] of sampledTokens) {
          const bigint = BigInt(newTokenId);
          // TODO: If branching, use previous beam as a starting point
          // update generated ids, model inputs, and length for next step
          scores[batch_idx] += logProb;
          all_input_ids[batch_idx].push(bigint);
          generated_input_ids.push([bigint]);

          // TODO: Support beam search
          break;
        }
      }
      if (streamer) {
        (streamer as any).put(generated_input_ids);
      }

      const stop = prepared_stopping_criteria._call(all_input_ids, scores);
      if (stop.every(((x: any) => x))) {
        break;
      }

      model_inputs = this._update_model_kwargs_for_generation({
        generated_input_ids,
        outputs,
        model_inputs,
        is_encoder_decoder,
      });
    }

    if (streamer) {
      (streamer as any).end();
    }

    // Retrieve and dispose all final past key values (including encoder attentions)
    const past_key_values = this.getPastKeyValues(outputs, (model_inputs as any).past_key_values, true);

    // TODO: ensure all_input_ids is padded correctly...
    const sequences = new Tensor('int64', all_input_ids.flat(), [all_input_ids.length, all_input_ids[0].length]);

    if ((generation_config as any).return_dict_in_generate) {
      return {
        sequences,
        past_key_values,
        ...attentions,
        // TODO:
        // scores,
        // logits,
      };
    } else {
      // Dispose all remaining tensors
      for (const tensor of Object.values(outputs)) {
        if ((tensor as any).location === 'gpu-buffer') {
          (tensor as any).dispose();
        }
      }
      return sequences;
    }
  }

  /**
   * Returns an object containing past key values from the given decoder results object.
   *
   * @param {Object} decoderResults The decoder results object.
   * @param {Object} pastKeyValues The previous past key values.
   * @returns {Object} An object containing past key values.
   */
  getPastKeyValues(
    decoderResults: Record<string, unknown>,
    pastKeyValues: Record<string, unknown>,
    disposeEncoderPKVs = false,
  ) {
    const pkvs = Object.create(null);

    for (const name in decoderResults) {
      if (name.startsWith('present')) {
        const newName = name.replace('present', 'past_key_values');
        const is_encoder_pkv = name.includes('encoder');
        if (is_encoder_pkv && pastKeyValues) {
          // Optimization introduced by optimum to reuse past key values.
          // So, we just replace the constant outputs (`decoderResults[name]`) with the previous past key values.
          // https://github.com/huggingface/optimum/blob/0bf2c05fb7e1182b52d21b703cfc95fd9e4ea3dc/optimum/onnxruntime/base.py#L677-L704
          pkvs[newName] = pastKeyValues[newName];
        } else {
          // decoder or using first encoder PKVs
          pkvs[newName] = decoderResults[name];
        }

        if (pastKeyValues && (!is_encoder_pkv || disposeEncoderPKVs)) {
          // - Always dispose decoder PKVs
          // - Only dispose encoder past key values when requested (after generation)
          const t = pastKeyValues[newName];
          if ((t as any).location === 'gpu-buffer') {
            (t as any).dispose();
          }
        }
      }
    }
    return pkvs;
  }

  /**
   * Returns an object containing attentions from the given model output object.
   *
   * @param {Object} model_output The output of the model.
   * @returns {{cross_attentions?: Tensor[]}} An object containing attentions.
   */
  getAttentions(model_output: Record<string, unknown>) {
    const attentions: Record<string, unknown[]> = {};

    for (const attnName of ['cross_attentions', 'encoder_attentions', 'decoder_attentions']) {
      for (const name in model_output) {
        if (name.startsWith(attnName)) {
          if (!(attnName in attentions)) {
            attentions[attnName] = [];
          }
          attentions[attnName].push(model_output[name]);
        }
      }
    }
    return attentions;
  }

  /**
   * Adds past key values to the decoder feeds object. If pastKeyValues is null, creates new tensors for past key values.
   *
   * @param {Object} decoderFeeds The decoder feeds object to add past key values to.
   * @param {Object} pastKeyValues An object containing past key values.
   */
  addPastKeyValues(decoderFeeds: Record<string, any>, pastKeyValues: Record<string, any>) {
    if (pastKeyValues) {
      Object.assign(decoderFeeds, pastKeyValues);
    } else {
      const session = this.sessions['decoder_model_merged'] ?? this.sessions['model'];
      const dtype = session?.config?.kv_cache_dtype ?? 'float32';
      const empty = dtype === 'float16' ? new Uint16Array() : [];

      const batch_size = (decoderFeeds[this.main_input_name] ?? decoderFeeds.attention_mask)?.dims?.[0] ?? 1;
      const shapes = getKeyValueShapes(this.config, { batch_size });

      for (const name in shapes) {
        decoderFeeds[name] = new Tensor(dtype, empty, shapes[name]);
      }
    }
  }

  async encode_image({ pixel_values }: { pixel_values: Tensor }) {
    // image_inputs === { pixel_values }
    const features = (await sessionRun(this.sessions['vision_encoder'], { pixel_values })).image_features;
    // @ts-expect-error TS2339
    if (!this.config.num_image_tokens) {
      console.warn(
        'The number of image tokens was not set in the model configuration. ' +
        `Setting it to the number of features detected by the vision encoder (${features.dims[1]}).`,
      );
      // @ts-expect-error TS2339
      this.config.num_image_tokens = features.dims[1];
    }
    return features;
  }

  async encode_text({ input_ids }: { input_ids: Tensor }) {
    // text_inputs === { input_ids, attention_mask }
    return (await sessionRun(this.sessions['embed_tokens'], { input_ids })).inputs_embeds;
  }
}

//////////////////////////////////////////////////
// Base model output class
export class ModelOutput { }

/**
 * Base class for model's outputs, with potential hidden states and attentions.
 */
export class BaseModelOutput extends ModelOutput {
  /**
   * @param {Object} output The output of the model.
   * @param {Tensor} output.last_hidden_state Sequence of hidden-states at the output of the last layer of the model.
   * @param {Tensor} [output.hidden_states] Hidden-states of the model at the output of each layer plus the optional initial embedding outputs.
   * @param {Tensor} [output.attentions] Attentions weights after the attention softmax, used to compute the weighted average in the self-attention heads.
   */
  last_hidden_state: Tensor;
  hidden_states: Tensor[] | null;
  attentions: Tensor[] | null;

  constructor({
    last_hidden_state,
    hidden_states = null,
    attentions = null,
  }: {
    last_hidden_state: Tensor;
    hidden_states?: Tensor[] | null;
    attentions?: Tensor[] | null;
  }) {
    super();
    this.last_hidden_state = last_hidden_state;
    this.hidden_states = hidden_states;
    this.attentions = attentions;
  }
}

//////////////////////////////////////////////////
// Audio Spectrogram Transformer (AST) models
export class ASTPreTrainedModel extends PreTrainedModel { }

/**
 * The bare AST Model transformer outputting raw hidden-states without any specific head on top.
 */
export class ASTModel extends ASTPreTrainedModel { }

//////////////////////////////////////////////////

//////////////////////////////////////////////////
// Whisper models
export class WhisperPreTrainedModel extends PreTrainedModel {
  requires_attention_mask = false;
  main_input_name = 'input_features';
  forward_params = [
    'input_features',
    'attention_mask',
    'decoder_input_ids',
    'decoder_attention_mask',
    'past_key_values',
  ];
}

/**
 * WhisperModel class for training Whisper models without a language model head.
 */
export class WhisperModel extends WhisperPreTrainedModel { }

/**
 * WhisperForConditionalGeneration class for generating conditional outputs from Whisper models.
 */
export class WhisperForConditionalGeneration extends WhisperPreTrainedModel {
  _prepare_generation_config(generation_config: GenerationConfig, kwargs: Record<string, unknown>) {
    return /** @type {WhisperGenerationConfig} */ super._prepare_generation_config(
      generation_config,
      kwargs,
      WhisperGenerationConfig,
    );
  }

  /**
   *
   * @param {WhisperGenerationConfig} generation_config
   */
  _retrieve_init_tokens(generation_config: WhisperGenerationConfig) {
    // prefix tokens are of the form:
    //  - Multilingual: <|startoftranscript|> <|lang_id|> <|task|> [<|notimestamps|>]
    //  - English-only: <|startoftranscript|> [<|notimestamps|>]

    // 1. Handle <|startoftranscript|> token
    const init_tokens = [generation_config.decoder_start_token_id];

    // 2. Handle <|lang_id|> and <|task> tokens
    let language: string | null = generation_config.language;
    const task = generation_config.task;
    if (generation_config.is_multilingual) {
      if (!language) {
        // TODO: Implement language detection
        console.warn('No language specified - defaulting to English (en).');
        language = 'en';
      }

      // Add language token
      const language_code = whisper_language_to_code(language);
      const language_token = `<|${language_code}|>`;
      if (generation_config.lang_to_id) {
        init_tokens.push(generation_config.lang_to_id[language_token]);
      }

      // Add task token
      // NOTE: Defaults to 'transcribe' if no task is specified
      if (!generation_config.task_to_id) throw new Error('task_to_id mapping is required but was not provided');
      init_tokens.push(generation_config.task_to_id[task ?? 'transcribe']);
    } else if (language || task) {
      throw new Error(
        'Cannot specify `task` or `language` for an English-only model. If the model is intended to be multilingual, pass `is_multilingual=true` to generate, or update the generation config.',
      );
    }

    // 3. Handle <|notimestamps|> token
    if (
      !generation_config.return_timestamps &&
      generation_config.no_timestamps_token_id &&
      init_tokens.at(-1) !== generation_config.no_timestamps_token_id
    ) {
      init_tokens.push(generation_config.no_timestamps_token_id);
    } else if (generation_config.return_timestamps && init_tokens.at(-1) === generation_config.no_timestamps_token_id) {
      console.warn(
        '<|notimestamps|> prompt token is removed from generation_config since `return_timestamps` is set to `true`.',
      );
      init_tokens.pop();
    }

    // let's make sure we don't pass `null` tokens as prompt tokens
    return init_tokens.filter((token) => token != null);
  }

  /**
   * Transcribes or translates log-mel input features to a sequence of auto-regressively generated token ids.
   * @param {import('./models/whisper/generation_whisper.js').WhisperGenerationFunctionParameters} options
   * @returns {Promise<ModelOutput|Tensor>} The output of the model, which can contain the generated token ids, attentions, and scores.
   */
  async generate({
    inputs = null,
    generation_config = null,
    logits_processor = null,
    stopping_criteria = null,

    // Whisper-specific options (passed to kwargs)
    // prompt_ids = null,
    // language = null,
    // task = null,

    ...kwargs
  }: any) {
    generation_config = this._prepare_generation_config(generation_config, kwargs);

    const init_tokens = kwargs.decoder_input_ids ?? this._retrieve_init_tokens(generation_config);

    if (generation_config.return_timestamps) {
      logits_processor ??= new LogitsProcessorList();
      logits_processor.push(new WhisperTimeStampLogitsProcessor(generation_config, init_tokens));
    }

    if (generation_config.begin_suppress_tokens) {
      logits_processor ??= new LogitsProcessorList();
      logits_processor.push(
        new SuppressTokensAtBeginLogitsProcessor(generation_config.begin_suppress_tokens, init_tokens.length),
      );
    }

    if (generation_config.return_token_timestamps) {
      if (!generation_config.alignment_heads) {
        throw new Error(
          'Model generation config has no `alignment_heads`, token-level timestamps not available. ' +
          'See https://gist.github.com/hollance/42e32852f24243b748ae6bc1f985b13a on how to add this property to the generation config.',
        );
      }

      if (generation_config.task === 'translate') {
        console.warn("Token-level timestamps may not be reliable for task 'translate'.");
      }

      generation_config.output_attentions = true;
      generation_config.return_dict_in_generate = true;
    }

    const outputs: any = await super.generate({
      inputs,
      generation_config,
      logits_processor,
      decoder_input_ids: init_tokens,
      ...kwargs,
    });

    if (generation_config.return_token_timestamps) {
      (outputs as any)['token_timestamps'] = this._extract_token_timestamps(
        outputs,
        generation_config.alignment_heads,
        generation_config.num_frames,
      );
    }

    return outputs;
  }

  /**
   * Calculates token-level timestamps using the encoder-decoder cross-attentions and
   * dynamic time-warping (DTW) to map each output token to a position in the input audio.
   * If `num_frames` is specified, the encoder-decoder cross-attentions will be cropped before applying DTW.
   * @param {Object} generate_outputs Outputs generated by the model
   * @param {Tensor[][]} generate_outputs.cross_attentions The cross attentions output by the model
   * @param {Tensor} generate_outputs.sequences The sequences output by the model
   * @param {number[][]} alignment_heads Alignment heads of the model
   * @param {number} [num_frames=null] Number of frames in the input audio.
   * @param {number} [time_precision=0.02] Precision of the timestamps in seconds
   * @returns {Tensor} tensor containing the timestamps in seconds for each predicted token
   */
  _extract_token_timestamps(
    generate_outputs: Record<string, unknown>,
    alignment_heads: number[][],
    num_frames = null,
    time_precision = 0.02,
  ) {
    if (!generate_outputs.cross_attentions) {
      throw new Error(
        'Model outputs must contain cross attentions to extract timestamps. ' +
        'This is most likely because the model was not exported with `output_attentions=True`.',
      );
    }
    if (num_frames == null) {
      console.warn(
        '`num_frames` has not been set, meaning the entire audio will be analyzed. ' +
        'This may lead to inaccurate token-level timestamps for short audios (< 30 seconds).',
      );
    }

    // @ts-expect-error TS2339
    let median_filter_width = this.config.median_filter_width;
    if (median_filter_width === undefined) {
      console.warn('Model config has no `median_filter_width`, using default value of 7.');
      median_filter_width = 7;
    }

    // TODO: Improve batch processing
    const batch = generate_outputs.cross_attentions;
    // Create a list with `decoder_layers` elements, each a tensor of shape
    // (batch size, attention_heads, output length, input length).
    const cross_attentions = Array.from(
      { length: (this.config as any).decoder_layers },
      // Concatenate the cross attentions for each layer across sequence length dimension.
      (_, i) =>
        cat(
          (batch as any).map((x: any) => x[i]),
          2,
        ),
    );

    const weights = stack(
      alignment_heads.map(([l, h]) => {
        if (l >= cross_attentions.length) {
          throw new Error(
            `Layer index ${l} is out of bounds for cross attentions (length ${cross_attentions.length}).`,
          );
        }
        return num_frames
          ? cross_attentions[l].slice(null, h, null, [0, num_frames])
          : cross_attentions[l].slice(null, h);
      }),
    ).transpose(1, 0, 2, 3);

    const [std, calculatedMean] = std_mean(weights, -2, 0, true);

    // Normalize and smoothen the weights.
    const smoothedWeights = weights.clone(); // [1, 8, seqLength, 1500]

    for (let a = 0; a < smoothedWeights.dims[0]; ++a) {
      const aTensor = smoothedWeights[a]; // [8, seqLength, 1500]

      for (let b = 0; b < aTensor.dims[0]; ++b) {
        const bTensor = aTensor[b]; // [seqLength, 1500]

        const stdTensorData = std[a][b][0].data; // [1500]
        const meanTensorData = calculatedMean[a][b][0].data; // [1500]

        for (let c = 0; c < bTensor.dims[0]; ++c) {
          let cTensorData = bTensor[c].data; // [1500]
          for (let d = 0; d < cTensorData.length; ++d) {
            cTensorData[d] = (cTensorData[d] - meanTensorData[d]) / stdTensorData[d];
          }

          // Apply median filter.
          (cTensorData as any).set(medianFilter((cTensorData as any), median_filter_width));
        }
      }
    }

    // Average the different cross-attention heads.
    const batchedMatrices = [mean(smoothedWeights, 1)];

    const timestampsShape = (generate_outputs.sequences as any).dims;

    const timestamps = new Tensor(
      'float32',
      new Float32Array(timestampsShape[0] * timestampsShape[1]),
      timestampsShape,
    );

    // Perform dynamic time warping on each element of the batch.
    for (let batch_idx = 0; batch_idx < timestampsShape[0]; ++batch_idx) {
      // NOTE: Since we run only one batch at a time, we can squeeze to get the same dimensions
      // as the python implementation
      const matrix = batchedMatrices[batch_idx].neg().squeeze_(0);
      const [text_indices, time_indices] = dynamic_time_warping(matrix.tolist());

      const diffs = Array.from({ length: text_indices.length - 1 }, (v, i) => text_indices[i + 1] - text_indices[i]);
      const jumps = mergeArrays([1], diffs).map((x) => !!x); // convert to boolean

      const jump_times = [];
      for (let i = 0; i < jumps.length; ++i) {
        if (jumps[i]) {
          // NOTE: No point in rounding here, since we set to Float32Array later
          jump_times.push(time_indices[i] * time_precision);
        }
      }
      (timestamps[batch_idx].data as any).set(jump_times, 1);
    }

    return timestamps;
  }
}
//////////////////////////////////////////////////

//////////////////////////////////////////////////
// Moonshine models
export class MoonshinePreTrainedModel extends PreTrainedModel {
  requires_attention_mask = false;
  main_input_name = 'input_values';
  forward_params = ['input_values', 'decoder_input_ids', 'past_key_values'];
}

/**
 * MoonshineModel class for training Moonshine models without a language model head.
 */
export class MoonshineModel extends MoonshinePreTrainedModel { }

export class MoonshineForConditionalGeneration extends MoonshinePreTrainedModel { }
//////////////////////////////////////////////////

//////////////////////////////////////////////////
// LLaVa Models
export class LlavaPreTrainedModel extends PreTrainedModel {
  forward_params = ['input_ids', 'attention_mask', 'pixel_values', 'position_ids', 'past_key_values'];
}

/**
 * The LLAVA model which consists of a vision backbone and a language model.
 */
export class LlavaForConditionalGeneration extends LlavaPreTrainedModel {
  _merge_input_ids_with_image_features({ inputs_embeds, image_features, input_ids, attention_mask }: any) {
    // @ts-expect-error TS2339
    const image_token_index = this.config.image_token_index;

    const idsList = input_ids.tolist();

    // NOTE: we use .findIndex instead of .indexOf to perform weak comparison (==) between BigInt and Number
    const indexOfImage = idsList.map((x: any) => x.findIndex((x: any) => x == image_token_index));

    const noImages = indexOfImage.every((x: any) => x === -1);
    const allImages = indexOfImage.every((x: any) => x !== -1);
    if (!noImages && !allImages) {
      // Check for padding reasons
      throw new Error('Every input should contain either 0 or 1 image token.');
    }

    if (noImages) {
      return {
        inputs_embeds,
        attention_mask,
      };
    }

    const stacked = [];
    const stacked_attention_mask = [];
    for (let i = 0; i < indexOfImage.length; ++i) {
      const index = indexOfImage[i];

      const e = inputs_embeds[i];
      const im = image_features[i];
      const am = attention_mask[i];
      stacked.push(cat([e.slice([0, index]), im, e.slice([index + 1, e.dims[0]])], 0));

      stacked_attention_mask.push(
        cat([am.slice([0, index]), ones([im.dims[0]]), am.slice([index + 1, am.dims[0]])], 0),
      );
    }

    return {
      inputs_embeds: stack(stacked, 0),
      attention_mask: stack(stacked_attention_mask, 0),
    };
  }
}
//////////////////////////////////////////////////

export class LlavaOnevisionForConditionalGeneration extends LlavaForConditionalGeneration { } // NOTE: extends LlavaForConditionalGeneration
export class Moondream1ForConditionalGeneration extends LlavaForConditionalGeneration { } // NOTE: extends LlavaForConditionalGeneration

export class Florence2PreTrainedModel extends PreTrainedModel {
  forward_params = [
    // Encoder inputs
    'input_ids',
    'inputs_embeds',
    'attention_mask',
    'pixel_values',

    // Decoder inputs
    'encoder_outputs',
    'decoder_input_ids',
    'decoder_inputs_embeds',
    'decoder_attention_mask',
    'past_key_values',
  ];
  main_input_name = 'inputs_embeds';
}

export class Florence2ForConditionalGeneration extends Florence2PreTrainedModel {
  _merge_input_ids_with_image_features({
    inputs_embeds,
    image_features,
    input_ids,
    attention_mask,
  }: {
    inputs_embeds: Tensor;
    image_features: Tensor;
    input_ids: Tensor;
    attention_mask: Tensor;
  }) {
    return {
      inputs_embeds: cat(
        [
          image_features, // image embeds
          inputs_embeds, // task prefix embeds
        ],
        1,
      ),
      attention_mask: cat(
        [
          ones(image_features.dims.slice(0, 2)), // image attention mask
          attention_mask, // task prefix attention mask
        ],
        1,
      ),
    };
  }

  async _prepare_inputs_embeds({
    input_ids,
    pixel_values,
    inputs_embeds,
    attention_mask,
  }: {
    input_ids: Tensor | null;
    pixel_values: Tensor | null;
    inputs_embeds: Tensor | null;
    attention_mask: Tensor | null;
  }) {
    if (!input_ids && !pixel_values) {
      throw new Error('Either `input_ids` or `pixel_values` should be provided.');
    }

    // 1. Possibly, extract the input embeddings
    let text_features, image_features;
    if (input_ids) {
      text_features = await this.encode_text({ input_ids });
    }
    if (pixel_values) {
      image_features = await this.encode_image({ pixel_values });
    }

    // 2. Possibly, merge text and images
    if (text_features && image_features) {
      ({ inputs_embeds, attention_mask } = this._merge_input_ids_with_image_features({
        inputs_embeds: text_features,
        image_features,
        input_ids: input_ids as Tensor,
        attention_mask: attention_mask as Tensor,
      }));
    } else {
      inputs_embeds = text_features || image_features;
    }

    return { inputs_embeds, attention_mask };
  }

  async forward({
    input_ids,
    pixel_values,
    attention_mask,
    decoder_input_ids,
    decoder_attention_mask,
    encoder_outputs,
    past_key_values,

    inputs_embeds,
    decoder_inputs_embeds,
  }: any) {
    if (!inputs_embeds) {
      ({ inputs_embeds, attention_mask } = await this._prepare_inputs_embeds({
        input_ids,
        pixel_values,
        inputs_embeds,
        attention_mask,
      }));
    }

    if (!encoder_outputs) {
      // Must compute encoder outputs
      let { last_hidden_state } = await encoderForward(this, { inputs_embeds, attention_mask });
      encoder_outputs = last_hidden_state;
    }

    if (!decoder_inputs_embeds) {
      if (!decoder_input_ids) {
        throw new Error('Either `decoder_input_ids` or `decoder_inputs_embeds` should be provided.');
      }
      decoder_inputs_embeds = await this.encode_text({ input_ids: decoder_input_ids });
    }

    const decoderFeeds = {
      inputs_embeds: decoder_inputs_embeds,
      attention_mask: decoder_attention_mask,
      encoder_attention_mask: attention_mask,
      encoder_hidden_states: encoder_outputs,
      past_key_values,
    };
    const decoder_outputs = await decoderForward(this, decoderFeeds, true);
    return decoder_outputs;
  }
}

export class PaliGemmaPreTrainedModel extends PreTrainedModel {
  forward_params = [
    'input_ids',
    // 'inputs_embeds',
    'attention_mask',
    'pixel_values',
    'position_ids',
    'past_key_values',
  ];
}

export class PaliGemmaForConditionalGeneration extends PaliGemmaPreTrainedModel {
  _merge_input_ids_with_image_features(kwargs: any) {
    const vision_hidden_size = kwargs.image_features.dims.at(-1);
    const reshaped_image_hidden_states = kwargs.image_features.view(-1, vision_hidden_size);

    return default_merge_input_ids_with_image_features({
      image_token_id: (this.config as any).image_token_index,
      image_features: reshaped_image_hidden_states,
      ...kwargs,
    });
  }
}

//////////////////////////////////////////////////
// Idefics3 Models
export class Idefics3PreTrainedModel extends PreTrainedModel {
  forward_params = [
    'input_ids',
    'attention_mask',
    'pixel_values',
    'pixel_attention_mask',
    'position_ids',
    'past_key_values',
  ];
}

/**
 * The LLAVA model which consists of a vision backbone and a language model.
 */
export class Idefics3ForConditionalGeneration extends Idefics3PreTrainedModel {
  async encode_image({ pixel_values, pixel_attention_mask }: { pixel_values: Tensor; pixel_attention_mask: Tensor }) {
    const features = (await sessionRun(this.sessions['vision_encoder'], { pixel_values, pixel_attention_mask }))
      .image_features;
    return features;
  }

  _merge_input_ids_with_image_features(kwargs: any) {
    const vision_hidden_size = kwargs.image_features.dims.at(-1);
    const reshaped_image_hidden_states = kwargs.image_features.view(-1, vision_hidden_size);

    return default_merge_input_ids_with_image_features({
      image_token_id: (this.config as any).image_token_id,
      ...kwargs,
      image_features: reshaped_image_hidden_states,
    });
  }
}
//////////////////////////////////////////////////

export class Phi3VPreTrainedModel extends PreTrainedModel {
  forward_params = [
    'input_ids',
    'inputs_embeds',
    'attention_mask',
    'position_ids',
    'pixel_values',
    'image_sizes',
    'past_key_values',
  ];
}
export class Phi3VForCausalLM extends Phi3VPreTrainedModel {
  async forward({
    // Produced by the tokenizer/processor:
    input_ids = null,
    attention_mask = null,
    pixel_values = null,
    image_sizes = null,

    // Used during generation:
    position_ids = null,
    inputs_embeds = null,
    past_key_values = null,

    // Generic generation parameters
    generation_config = null,
    logits_processor = null,

    // TODO: needed?
    ...kwargs
  }) {
    if (!inputs_embeds) {
      let image_features;
      if (pixel_values && (input_ids as any).dims[1] !== 1) {
        if (!image_sizes) {
          throw new Error('`image_sizes` must be provided when `pixel_values` is provided.');
        }

        // Encode the image
        ({ image_features } = await sessionRun(this.sessions['vision_encoder'], {
          pixel_values,
          image_sizes,
        }));
      } else {
        const hidden_size = this.config.normalized_config.hidden_size;
        image_features = new Tensor('float32', [], [0, hidden_size]);
      }

      ({ inputs_embeds } = await sessionRun(this.sessions['prepare_inputs_embeds'], {
        input_ids,
        image_features,
      }));
    }

    const outputs = await decoderForward(
      this,
      {
        inputs_embeds,
        past_key_values,
        attention_mask,
        position_ids,
        generation_config,
        logits_processor,
      },
      false,
    );
    return outputs;
  }
}

//////////////////////////////////////////////////
export class CLIPPreTrainedModel extends PreTrainedModel { }

/**
 * CLIP Text and Vision Model with a projection layers on top
 *
 * **Example:** Perform zero-shot image classification with a `CLIPModel`.
 *
 * ```javascript
 * import { AutoTokenizer, AutoProcessor, CLIPModel, RawImage } from '@huggingface/transformers';
 *
 * // Load tokenizer, processor, and model
 * let tokenizer = await AutoTokenizer.from_pretrained('Xenova/clip-vit-base-patch16');
 * let processor = await AutoProcessor.from_pretrained('Xenova/clip-vit-base-patch16');
 * let model = await CLIPModel.from_pretrained('Xenova/clip-vit-base-patch16');
 *
 * // Run tokenization
 * let texts = ['a photo of a car', 'a photo of a football match']
 * let text_inputs = tokenizer(texts, { padding: true, truncation: true });
 *
 * // Read image and run processor
 * let image = await RawImage.read('https://huggingface.co/datasets/Xenova/transformers.js-docs/resolve/main/football-match.jpg');
 * let image_inputs = await processor(image);
 *
 * // Run model with both text and pixel inputs
 * let output = await model({ ...text_inputs, ...image_inputs });
 * // {
 * //   logits_per_image: Tensor {
 * //     dims: [ 1, 2 ],
 * //     data: Float32Array(2) [ 18.579734802246094, 24.31830596923828 ],
 * //   },
 * //   logits_per_text: Tensor {
 * //     dims: [ 2, 1 ],
 * //     data: Float32Array(2) [ 18.579734802246094, 24.31830596923828 ],
 * //   },
 * //   text_embeds: Tensor {
 * //     dims: [ 2, 512 ],
 * //     data: Float32Array(1024) [ ... ],
 * //   },
 * //   image_embeds: Tensor {
 * //     dims: [ 1, 512 ],
 * //     data: Float32Array(512) [ ... ],
 * //   }
 * // }
 * ```
 */
export class CLIPModel extends CLIPPreTrainedModel { }

/**
 * The text model from CLIP without any head or projection on top.
 */
export class CLIPTextModel extends CLIPPreTrainedModel {
  /** @type {typeof PreTrainedModel.from_pretrained} */
  static async from_pretrained(pretrained_model_name_or_path: string, options: any = {}) {
    return super.from_pretrained(pretrained_model_name_or_path, {
      ...options,
      // Update default model file name if not provided
      model_file_name: options.model_file_name ?? 'text_model',
    });
  }
}

/**
 * CLIP Text Model with a projection layer on top (a linear layer on top of the pooled output)
 *
 * **Example:** Compute text embeddings with `CLIPTextModelWithProjection`.
 *
 * ```javascript
 * import { AutoTokenizer, CLIPTextModelWithProjection } from '@huggingface/transformers';
 *
 * // Load tokenizer and text model
 * const tokenizer = await AutoTokenizer.from_pretrained('Xenova/clip-vit-base-patch16');
 * const text_model = await CLIPTextModelWithProjection.from_pretrained('Xenova/clip-vit-base-patch16');
 *
 * // Run tokenization
 * let texts = ['a photo of a car', 'a photo of a football match'];
 * let text_inputs = tokenizer(texts, { padding: true, truncation: true });
 *
 * // Compute embeddings
 * const { text_embeds } = await text_model(text_inputs);
 * // Tensor {
 * //   dims: [ 2, 512 ],
 * //   type: 'float32',
 * //   data: Float32Array(1024) [ ... ],
 * //   size: 1024
 * // }
 * ```
 */
export class CLIPTextModelWithProjection extends CLIPPreTrainedModel {
  /** @type {typeof PreTrainedModel.from_pretrained} */
  static async from_pretrained(pretrained_model_name_or_path: string, options: any = {}) {
    return super.from_pretrained(pretrained_model_name_or_path, {
      ...options,
      // Update default model file name if not provided
      model_file_name: options.model_file_name ?? 'text_model',
    });
  }
}

/**
 * The vision model from CLIP without any head or projection on top.
 */
export class CLIPVisionModel extends CLIPPreTrainedModel {
  /** @type {typeof PreTrainedModel.from_pretrained} */
  static async from_pretrained(pretrained_model_name_or_path: string, options: any = {}) {
    return super.from_pretrained(pretrained_model_name_or_path, {
      ...options,
      // Update default model file name if not provided
      model_file_name: options.model_file_name ?? 'vision_model',
    });
  }
}

/**
 * CLIP Vision Model with a projection layer on top (a linear layer on top of the pooled output)
 *
 * **Example:** Compute vision embeddings with `CLIPVisionModelWithProjection`.
 *
 * ```javascript
 * import { AutoProcessor, CLIPVisionModelWithProjection, RawImage} from '@huggingface/transformers';
 *
 * // Load processor and vision model
 * const processor = await AutoProcessor.from_pretrained('Xenova/clip-vit-base-patch16');
 * const vision_model = await CLIPVisionModelWithProjection.from_pretrained('Xenova/clip-vit-base-patch16');
 *
 * // Read image and run processor
 * let image = await RawImage.read('https://huggingface.co/datasets/Xenova/transformers.js-docs/resolve/main/football-match.jpg');
 * let image_inputs = await processor(image);
 *
 * // Compute embeddings
 * const { image_embeds } = await vision_model(image_inputs);
 * // Tensor {
 * //   dims: [ 1, 512 ],
 * //   type: 'float32',
 * //   data: Float32Array(512) [ ... ],
 * //   size: 512
 * // }
 * ```
 */
export class CLIPVisionModelWithProjection extends CLIPPreTrainedModel {
  /** @type {typeof PreTrainedModel.from_pretrained} */
  static async from_pretrained(pretrained_model_name_or_path: string, options: any = {}) {
    return super.from_pretrained(pretrained_model_name_or_path, {
      ...options,
      // Update default model file name if not provided
      model_file_name: options.model_file_name ?? 'vision_model',
    });
  }
}
//////////////////////////////////////////////////

//////////////////////////////////////////////////
// SigLIP models
export class SiglipPreTrainedModel extends PreTrainedModel { }

/**
 * SigLIP Text and Vision Model with a projection layers on top
 *
 * **Example:** Perform zero-shot image classification with a `SiglipModel`.
 *
 * ```javascript
 * import { AutoTokenizer, AutoProcessor, SiglipModel, RawImage } from '@huggingface/transformers';
 *
 * // Load tokenizer, processor, and model
 * const tokenizer = await AutoTokenizer.from_pretrained('Xenova/siglip-base-patch16-224');
 * const processor = await AutoProcessor.from_pretrained('Xenova/siglip-base-patch16-224');
 * const model = await SiglipModel.from_pretrained('Xenova/siglip-base-patch16-224');
 *
 * // Run tokenization
 * const texts = ['a photo of 2 cats', 'a photo of 2 dogs'];
 * const text_inputs = tokenizer(texts, { padding: 'max_length', truncation: true });
 *
 * // Read image and run processor
 * const image = await RawImage.read('http://images.cocodataset.org/val2017/000000039769.jpg');
 * const image_inputs = await processor(image);
 *
 * // Run model with both text and pixel inputs
 * const output = await model({ ...text_inputs, ...image_inputs });
 * // {
 * //   logits_per_image: Tensor {
 * //     dims: [ 1, 2 ],
 * //     data: Float32Array(2) [ -1.6019744873046875, -10.720091819763184 ],
 * //   },
 * //   logits_per_text: Tensor {
 * //     dims: [ 2, 1 ],
 * //     data: Float32Array(2) [ -1.6019744873046875, -10.720091819763184 ],
 * //   },
 * //   text_embeds: Tensor {
 * //     dims: [ 2, 768 ],
 * //     data: Float32Array(1536) [ ... ],
 * //   },
 * //   image_embeds: Tensor {
 * //     dims: [ 1, 768 ],
 * //     data: Float32Array(768) [ ... ],
 * //   }
 * // }
 * ```
 */
export class SiglipModel extends SiglipPreTrainedModel { }

/**
 * The text model from SigLIP without any head or projection on top.
 *
 * **Example:** Compute text embeddings with `SiglipTextModel`.
 *
 * ```javascript
 * import { AutoTokenizer, SiglipTextModel } from '@huggingface/transformers';
 *
 * // Load tokenizer and text model
 * const tokenizer = await AutoTokenizer.from_pretrained('Xenova/siglip-base-patch16-224');
 * const text_model = await SiglipTextModel.from_pretrained('Xenova/siglip-base-patch16-224');
 *
 * // Run tokenization
 * const texts = ['a photo of 2 cats', 'a photo of 2 dogs'];
 * const text_inputs = tokenizer(texts, { padding: 'max_length', truncation: true });
 *
 * // Compute embeddings
 * const { pooler_output } = await text_model(text_inputs);
 * // Tensor {
 * //   dims: [ 2, 768 ],
 * //   type: 'float32',
 * //   data: Float32Array(1536) [ ... ],
 * //   size: 1536
 * // }
 * ```
 */
export class SiglipTextModel extends SiglipPreTrainedModel {
  /** @type {typeof PreTrainedModel.from_pretrained} */
  static async from_pretrained(pretrained_model_name_or_path: string, options: any = {}) {
    return super.from_pretrained(pretrained_model_name_or_path, {
      ...options,
      // Update default model file name if not provided
      model_file_name: options.model_file_name ?? 'text_model',
    });
  }
}

/**
 * The vision model from SigLIP without any head or projection on top.
 *
 * **Example:** Compute vision embeddings with `SiglipVisionModel`.
 *
 * ```javascript
 * import { AutoProcessor, SiglipVisionModel, RawImage} from '@huggingface/transformers';
 *
 * // Load processor and vision model
 * const processor = await AutoProcessor.from_pretrained('Xenova/siglip-base-patch16-224');
 * const vision_model = await SiglipVisionModel.from_pretrained('Xenova/siglip-base-patch16-224');
 *
 * // Read image and run processor
 * const image = await RawImage.read('https://huggingface.co/datasets/Xenova/transformers.js-docs/resolve/main/football-match.jpg');
 * const image_inputs = await processor(image);
 *
 * // Compute embeddings
 * const { pooler_output } = await vision_model(image_inputs);
 * // Tensor {
 * //   dims: [ 1, 768 ],
 * //   type: 'float32',
 * //   data: Float32Array(768) [ ... ],
 * //   size: 768
 * // }
 * ```
 */
export class SiglipVisionModel extends CLIPPreTrainedModel {
  /** @type {typeof PreTrainedModel.from_pretrained} */
  static async from_pretrained(pretrained_model_name_or_path: string, options: any = {}) {
    return super.from_pretrained(pretrained_model_name_or_path, {
      ...options,
      // Update default model file name if not provided
      model_file_name: options.model_file_name ?? 'vision_model',
    });
  }
}
//////////////////////////////////////////////////
// ChineseCLIP models
export class ChineseCLIPPreTrainedModel extends PreTrainedModel { }

export class ChineseCLIPModel extends ChineseCLIPPreTrainedModel { }
//////////////////////////////////////////////////

//////////////////////////////////////////////////
// JinaCLIP models
export class JinaCLIPPreTrainedModel extends PreTrainedModel { }

export class JinaCLIPModel extends JinaCLIPPreTrainedModel {
  async forward(model_inputs: any) {
    const missing_text_inputs = !model_inputs.input_ids;
    const missing_image_inputs = !model_inputs.pixel_values;

    if (missing_text_inputs && missing_image_inputs) {
      throw new Error('Either `input_ids` or `pixel_values` should be provided.');
    }

    // If either `input_ids` or `pixel_values` aren't passed, we need to create dummy input since the model requires a value to be specified.
    if (missing_text_inputs) {
      // NOTE: We cannot pass zero-dimension tensor as input for input_ids.
      // Fortunately, the majority of time is spent in the vision encoder, so this shouldn't significantly impact performance.
      model_inputs.input_ids = ones([model_inputs.pixel_values.dims[0], 1]);
    }

    if (missing_image_inputs) {
      // NOTE: Since we create a zero-sized tensor, this does not increase computation time.
      // @ts-ignore
      const { image_size } = this.config.vision_config;
      model_inputs.pixel_values = full([0, 3, image_size, image_size], 0.0); // (pass zero-dimension tensor)
    }

    const { text_embeddings, image_embeddings, l2norm_text_embeddings, l2norm_image_embeddings } = await super.forward(
      model_inputs,
    );

    const result: any = {};
    if (!missing_text_inputs) {
      result.text_embeddings = text_embeddings;
      result.l2norm_text_embeddings = l2norm_text_embeddings;
    }
    if (!missing_image_inputs) {
      result.image_embeddings = image_embeddings;
      result.l2norm_image_embeddings = l2norm_image_embeddings;
    }
    return result;
  }
}

export class JinaCLIPTextModel extends JinaCLIPPreTrainedModel {
  /** @type {typeof PreTrainedModel.from_pretrained} */
  static async from_pretrained(pretrained_model_name_or_path: string, options: any = {}) {
    return super.from_pretrained(pretrained_model_name_or_path, {
      ...options,
      // Update default model file name if not provided
      model_file_name: options.model_file_name ?? 'text_model',
    });
  }
}

export class JinaCLIPVisionModel extends JinaCLIPPreTrainedModel {
  /** @type {typeof PreTrainedModel.from_pretrained} */
  static async from_pretrained(pretrained_model_name_or_path: string, options: any = {}) {
    return super.from_pretrained(pretrained_model_name_or_path, {
      ...options,
      // Update default model file name if not provided
      model_file_name: options.model_file_name ?? 'vision_model',
    });
  }
}
//////////////////////////////////////////////////

//////////////////////////////////////////////////
// GPT2 models
export class GPT2PreTrainedModel extends PreTrainedModel { }

export class GPT2Model extends GPT2PreTrainedModel { }

/**
 * GPT-2 language model head on top of the GPT-2 base model. This model is suitable for text generation tasks.
 */
export class GPT2LMHeadModel extends GPT2PreTrainedModel { }
// export class GPT2ForSequenceClassification extends GPT2PreTrainedModel {
// TODO
// }
//////////////////////////////////////////////////

//////////////////////////////////////////////////
// JAIS models
export class JAISPreTrainedModel extends PreTrainedModel { }

/**
 * The bare JAIS Model transformer outputting raw hidden-states without any specific head on top.
 */
export class JAISModel extends JAISPreTrainedModel { }

/**
 * The JAIS Model transformer with a language modeling head on top (linear layer with weights tied to the input embeddings).
 */
export class JAISLMHeadModel extends JAISPreTrainedModel { }
//////////////////////////////////////////////////

//////////////////////////////////////////////////
// GPTNeo models
export class GPTNeoPreTrainedModel extends PreTrainedModel { }
export class GPTNeoModel extends GPTNeoPreTrainedModel { }

export class GPTNeoForCausalLM extends GPTNeoPreTrainedModel { }
//////////////////////////////////////////////////

//////////////////////////////////////////////////
// GPTNeoX models
export class GPTNeoXPreTrainedModel extends PreTrainedModel { }
export class GPTNeoXModel extends GPTNeoXPreTrainedModel { }

export class GPTNeoXForCausalLM extends GPTNeoXPreTrainedModel { }
//////////////////////////////////////////////////

//////////////////////////////////////////////////
// GPT-J models
export class GPTJPreTrainedModel extends PreTrainedModel { }

export class GPTJModel extends GPTJPreTrainedModel { }

export class GPTJForCausalLM extends GPTJPreTrainedModel { }
//////////////////////////////////////////////////

//////////////////////////////////////////////////
// GPTBigCode models
export class GPTBigCodePreTrainedModel extends PreTrainedModel { }

export class GPTBigCodeModel extends GPTBigCodePreTrainedModel { }

export class GPTBigCodeForCausalLM extends GPTBigCodePreTrainedModel { }
//////////////////////////////////////////////////

//////////////////////////////////////////////////
// CodeGen models
export class CodeGenPreTrainedModel extends PreTrainedModel { }
/**
 * CodeGenModel is a class representing a code generation model without a language model head.
 */
export class CodeGenModel extends CodeGenPreTrainedModel { }

/**
 * CodeGenForCausalLM is a class that represents a code generation model based on the GPT-2 architecture. It extends the `CodeGenPreTrainedModel` class.
 */
export class CodeGenForCausalLM extends CodeGenPreTrainedModel { }
//////////////////////////////////////////////////

//////////////////////////////////////////////////
// LLama models

/**
 * The bare LLama Model outputting raw hidden-states without any specific head on top.
 */
export class LlamaPreTrainedModel extends PreTrainedModel { }
/**
 * The bare LLaMA Model outputting raw hidden-states without any specific head on top.
 */
export class LlamaModel extends LlamaPreTrainedModel { }

export class LlamaForCausalLM extends LlamaPreTrainedModel { }
//////////////////////////////////////////////////

//////////////////////////////////////////////////
// EXAONE models
export class ExaonePreTrainedModel extends PreTrainedModel { }
export class ExaoneModel extends ExaonePreTrainedModel { }
export class ExaoneForCausalLM extends ExaonePreTrainedModel { }
//////////////////////////////////////////////////

//////////////////////////////////////////////////
// MobileLLM models
export class MobileLLMPreTrainedModel extends PreTrainedModel { }
export class MobileLLMModel extends MobileLLMPreTrainedModel { }
export class MobileLLMForCausalLM extends MobileLLMPreTrainedModel { }
//////////////////////////////////////////////////

//////////////////////////////////////////////////
// OLMo models
export class OlmoPreTrainedModel extends PreTrainedModel { }
export class OlmoModel extends OlmoPreTrainedModel { }
export class OlmoForCausalLM extends OlmoPreTrainedModel { }
//////////////////////////////////////////////////

//////////////////////////////////////////////////
// OLMo2 models
export class Olmo2PreTrainedModel extends PreTrainedModel { }
export class Olmo2Model extends Olmo2PreTrainedModel { }
export class Olmo2ForCausalLM extends Olmo2PreTrainedModel { }
//////////////////////////////////////////////////

//////////////////////////////////////////////////
// Granite models
export class GranitePreTrainedModel extends PreTrainedModel { }
export class GraniteModel extends GranitePreTrainedModel { }
export class GraniteForCausalLM extends GranitePreTrainedModel { }
//////////////////////////////////////////////////

//////////////////////////////////////////////////
// Cohere models

/**
 * The bare Cohere Model outputting raw hidden-states without any specific head on top.
 */
export class CoherePreTrainedModel extends PreTrainedModel { }
export class CohereModel extends CoherePreTrainedModel { }

export class CohereForCausalLM extends CoherePreTrainedModel { }
//////////////////////////////////////////////////

//////////////////////////////////////////////////
// Gemma models

/**
 * The bare Gemma Model outputting raw hidden-states without any specific head on top.
 */
export class GemmaPreTrainedModel extends PreTrainedModel { }
/**
 * The bare Gemma Model outputting raw hidden-states without any specific head on top.
 */
export class GemmaModel extends GemmaPreTrainedModel { }

export class GemmaForCausalLM extends GemmaPreTrainedModel { }
//////////////////////////////////////////////////

//////////////////////////////////////////////////
// Gemma2 models

/**
 * The bare Gemma2 Model outputting raw hidden-states without any specific head on top.
 */
export class Gemma2PreTrainedModel extends PreTrainedModel { }
/**
 * The bare Gemma2 Model outputting raw hidden-states without any specific head on top.
 */
export class Gemma2Model extends Gemma2PreTrainedModel { }

export class Gemma2ForCausalLM extends Gemma2PreTrainedModel { }
//////////////////////////////////////////////////

//////////////////////////////////////////////////
export class OpenELMPreTrainedModel extends PreTrainedModel { }
export class OpenELMModel extends OpenELMPreTrainedModel { }

export class OpenELMForCausalLM extends OpenELMPreTrainedModel { }

//////////////////////////////////////////////////
// Qwen2 models

/**
 * The bare Qwen2 Model outputting raw hidden-states without any specific head on top.
 */
export class Qwen2PreTrainedModel extends PreTrainedModel { }
/**
 * The bare Qwen2 Model outputting raw hidden-states without any specific head on top.
 */
export class Qwen2Model extends Qwen2PreTrainedModel { }

export class Qwen2ForCausalLM extends Qwen2PreTrainedModel { }
//////////////////////////////////////////////////

//////////////////////////////////////////////////
// Phi models
export class PhiPreTrainedModel extends PreTrainedModel { }
/**
 * The bare Phi Model outputting raw hidden-states without any specific head on top.
 */
export class PhiModel extends PhiPreTrainedModel { }

export class PhiForCausalLM extends PhiPreTrainedModel { }
//////////////////////////////////////////////////

//////////////////////////////////////////////////
// Phi3 models
export class Phi3PreTrainedModel extends PreTrainedModel { }

/**
 * The bare Phi3 Model outputting raw hidden-states without any specific head on top.
 */
export class Phi3Model extends Phi3PreTrainedModel { }

export class Phi3ForCausalLM extends Phi3PreTrainedModel { }
//////////////////////////////////////////////////

//////////////////////////////////////////////////
// Bloom models
/**
 * The Bloom Model transformer with a language modeling head on top (linear layer with weights tied to the input embeddings).
 */
export class BloomPreTrainedModel extends PreTrainedModel { }

/**
 * The bare Bloom Model transformer outputting raw hidden-states without any specific head on top.
 */
export class BloomModel extends BloomPreTrainedModel { }

/**
 * The Bloom Model transformer with a language modeling head on top (linear layer with weights tied to the input embeddings).
 */
export class BloomForCausalLM extends BloomPreTrainedModel { }
//////////////////////////////////////////////////

//////////////////////////////////////////////////
// MPT models
export class MptPreTrainedModel extends PreTrainedModel { }

/**
 * The bare Mpt Model transformer outputting raw hidden-states without any specific head on top.
 */
export class MptModel extends MptPreTrainedModel { }

/**
 * The MPT Model transformer with a language modeling head on top (linear layer with weights tied to the input embeddings).
 */
export class MptForCausalLM extends MptPreTrainedModel { }
//////////////////////////////////////////////////

//////////////////////////////////////////////////
// OPT models
export class OPTPreTrainedModel extends PreTrainedModel { }

/**
 * The bare OPT Model outputting raw hidden-states without any specific head on top.
 */
export class OPTModel extends OPTPreTrainedModel { }

/**
 * The OPT Model transformer with a language modeling head on top (linear layer with weights tied to the input embeddings).
 */
export class OPTForCausalLM extends OPTPreTrainedModel { }
//////////////////////////////////////////////////

//////////////////////////////////////////////////
export class VitPosePreTrainedModel extends PreTrainedModel { }

/**
 * The VitPose model with a pose estimation head on top.
 */
export class VitPoseForPoseEstimation extends VitPosePreTrainedModel { }
//////////////////////////////////////////////////

//////////////////////////////////////////////////
export class ViTMAEPreTrainedModel extends PreTrainedModel { }
export class ViTMAEModel extends ViTMAEPreTrainedModel { }
//////////////////////////////////////////////////

//////////////////////////////////////////////////
export class GroupViTPreTrainedModel extends PreTrainedModel { }
export class GroupViTModel extends GroupViTPreTrainedModel { }
//////////////////////////////////////////////////

//////////////////////////////////////////////////
export class VitMattePreTrainedModel extends PreTrainedModel { }

/**
 * ViTMatte framework leveraging any vision backbone e.g. for ADE20k, CityScapes.
 *
 * **Example:** Perform image matting with a `VitMatteForImageMatting` model.
 * ```javascript
 * import { AutoProcessor, VitMatteForImageMatting, RawImage } from '@huggingface/transformers';
 *
 * // Load processor and model
 * const processor = await AutoProcessor.from_pretrained('Xenova/vitmatte-small-distinctions-646');
 * const model = await VitMatteForImageMatting.from_pretrained('Xenova/vitmatte-small-distinctions-646');
 *
 * // Load image and trimap
 * const image = await RawImage.fromURL('https://huggingface.co/datasets/Xenova/transformers.js-docs/resolve/main/vitmatte_image.png');
 * const trimap = await RawImage.fromURL('https://huggingface.co/datasets/Xenova/transformers.js-docs/resolve/main/vitmatte_trimap.png');
 *
 * // Prepare image + trimap for the model
 * const inputs = await processor(image, trimap);
 *
 * // Predict alpha matte
 * const { alphas } = await model(inputs);
 * // Tensor {
 * //   dims: [ 1, 1, 640, 960 ],
 * //   type: 'float32',
 * //   size: 614400,
 * //   data: Float32Array(614400) [ 0.9894027709960938, 0.9970508813858032, ... ]
 * // }
 * ```
 *
 * You can visualize the alpha matte as follows:
 * ```javascript
 * import { Tensor, cat } from '@huggingface/transformers';
 *
 * // Visualize predicted alpha matte
 * const imageTensor = image.toTensor();
 *
 * // Convert float (0-1) alpha matte to uint8 (0-255)
 * const alphaChannel = alphas
 *   .squeeze(0)
 *   .mul_(255)
 *   .clamp_(0, 255)
 *   .round_()
 *   .to('uint8');
 *
 * // Concatenate original image with predicted alpha
 * const imageData = cat([imageTensor, alphaChannel], 0);
 *
 * // Save output image
 * const outputImage = RawImage.fromTensor(imageData);
 * outputImage.save('output.png');
 * ```
 */
export class VitMatteForImageMatting extends VitMattePreTrainedModel {
  /**
   * @param {any} model_inputs
   */
  async _call(model_inputs: any) {
    return new ImageMattingOutput(await super._call(model_inputs));
  }
}
//////////////////////////////////////////////////

//////////////////////////////////////////////////
export class Swin2SRPreTrainedModel extends PreTrainedModel { }

/**
 * The bare Swin2SR Model transformer outputting raw hidden-states without any specific head on top.
 */
export class Swin2SRModel extends Swin2SRPreTrainedModel { }

/**
 * Swin2SR Model transformer with an upsampler head on top for image super resolution and restoration.
 *
 * **Example:** Super-resolution w/ `Xenova/swin2SR-classical-sr-x2-64`.
 *
 * ```javascript
 * import { AutoProcessor, Swin2SRForImageSuperResolution, RawImage } from '@huggingface/transformers';
 *
 * // Load processor and model
 * const model_id = 'Xenova/swin2SR-classical-sr-x2-64';
 * const processor = await AutoProcessor.from_pretrained(model_id);
 * const model = await Swin2SRForImageSuperResolution.from_pretrained(model_id);
 *
 * // Prepare model inputs
 * const url = 'https://huggingface.co/datasets/Xenova/transformers.js-docs/resolve/main/butterfly.jpg';
 * const image = await RawImage.fromURL(url);
 * const inputs = await processor(image);
 *
 * // Run model
 * const outputs = await model(inputs);
 *
 * // Convert Tensor to RawImage
 * const output = outputs.reconstruction.squeeze().clamp_(0, 1).mul_(255).round_().to('uint8');
 * const outputImage = RawImage.fromTensor(output);
 * // RawImage {
 * //   data: Uint8Array(786432) [ 41, 31, 24, ... ],
 * //   width: 512,
 * //   height: 512,
 * //   channels: 3
 * // }
 * ```
 */
export class Swin2SRForImageSuperResolution extends Swin2SRPreTrainedModel { }
//////////////////////////////////////////////////


//////////////////////////////////////////////////
export class SamPreTrainedModel extends PreTrainedModel { }

/**
 * Segment Anything Model (SAM) for generating segmentation masks, given an input image
 * and optional 2D location and bounding boxes.
 *
 * **Example:** Perform mask generation w/ `Xenova/sam-vit-base`.
 * ```javascript
 * import { SamModel, AutoProcessor, RawImage } from '@huggingface/transformers';
 *
 * const model = await SamModel.from_pretrained('Xenova/sam-vit-base');
 * const processor = await AutoProcessor.from_pretrained('Xenova/sam-vit-base');
 *
 * const img_url = 'https://huggingface.co/ybelkada/segment-anything/resolve/main/assets/car.png';
 * const raw_image = await RawImage.read(img_url);
 * const input_points = [[[450, 600]]] // 2D localization of a window
 *
 * const inputs = await processor(raw_image, { input_points });
 * const outputs = await model(inputs);
 *
 * const masks = await processor.post_process_masks(outputs.pred_masks, inputs.original_sizes, inputs.reshaped_input_sizes);
 * // [
 * //   Tensor {
 * //     dims: [ 1, 3, 1764, 2646 ],
 * //     type: 'bool',
 * //     data: Uint8Array(14002632) [ ... ],
 * //     size: 14002632
 * //   }
 * // ]
 * const scores = outputs.iou_scores;
 * // Tensor {
 * //   dims: [ 1, 1, 3 ],
 * //   type: 'float32',
 * //   data: Float32Array(3) [
 * //     0.8892380595207214,
 * //     0.9311248064041138,
 * //     0.983696699142456
 * //   ],
 * //   size: 3
 * // }
 * ```
 */
export class SamModel extends SamPreTrainedModel {
  /**
   * Compute image embeddings and positional image embeddings, given the pixel values of an image.
   * @param {Object} model_inputs Object containing the model inputs.
   * @param {Tensor} model_inputs.pixel_values Pixel values obtained using a `SamProcessor`.
   * @returns {Promise<{ image_embeddings: Tensor, image_positional_embeddings: Tensor }>} The image embeddings and positional image embeddings.
   */
  async get_image_embeddings({ pixel_values }: { pixel_values: Tensor }) {
    // in:
    //  - pixel_values: tensor.float32[batch_size,3,1024,1024]
    //
    // out:
    //  - image_embeddings: tensor.float32[batch_size,256,64,64]
    //  - image_positional_embeddings: tensor.float32[batch_size,256,64,64]
    return await encoderForward(this, { pixel_values });
  }

  /**
   * @typedef {Object} SamModelInputs Object containing the model inputs.
   * @property {Tensor} pixel_values Pixel values as a Tensor with shape `(batch_size, num_channels, height, width)`.
   * These can be obtained using a `SamProcessor`.
   * @property {Tensor} [input_points] Input 2D spatial points with shape `(batch_size, num_points, 2)`.
   * This is used by the prompt encoder to encode the prompt.
   * @property {Tensor} [input_labels] Input labels for the points, as a Tensor of shape `(batch_size, point_batch_size, num_points)`.
   * This is used by the prompt encoder to encode the prompt. There are 4 types of labels:
   *  - `1`: the point is a point that contains the object of interest
   *  - `0`: the point is a point that does not contain the object of interest
   *  - `-1`: the point corresponds to the background
   *  - `-10`: the point is a padding point, thus should be ignored by the prompt encoder
   * @property {Tensor} [input_boxes] Input bounding boxes with shape `(batch_size, num_boxes, 4)`.
   * @property {Tensor} [image_embeddings] Image embeddings used by the mask decoder.
   * @property {Tensor} [image_positional_embeddings] Image positional embeddings used by the mask decoder.
   */

  /**
   * @param {SamModelInputs} model_inputs Object containing the model inputs.
   * @returns {Promise<Object>} The output of the model.
   */
  async forward(model_inputs: any) {
    if (!model_inputs.image_embeddings || !model_inputs.image_positional_embeddings) {
      // Compute the image embeddings if they are missing
      model_inputs = {
        ...model_inputs,
        ...(await this.get_image_embeddings(model_inputs)),
      };
    }

    if (!model_inputs.input_labels && model_inputs.input_points) {
      // Set default input labels if they are missing
      const shape = (model_inputs.input_points as any).dims.slice(0, -1);
      const numElements = shape.reduce((a: number, b: number) => a * b, 1);
      model_inputs.input_labels = new Tensor('int64', new BigInt64Array(numElements).fill(1n), shape);
    }

    const decoder_inputs = {
      image_embeddings: model_inputs.image_embeddings,
      image_positional_embeddings: model_inputs.image_positional_embeddings,
      input_points: null,
      input_labels: null,
      input_boxes: null,
    };
    if (model_inputs.input_points) {
      decoder_inputs.input_points = model_inputs.input_points;
    }
    if (model_inputs.input_labels) {
      decoder_inputs.input_labels = model_inputs.input_labels;
    }
    if (model_inputs.input_boxes) {
      decoder_inputs.input_boxes = model_inputs.input_boxes;
    }

    // Returns:
    //  - iou_scores: tensor.float32[batch_size,point_batch_size,3]
    //  - pred_masks: tensor.float32[batch_size,point_batch_size,3,256,256]
    return await sessionRun(this.sessions['prompt_encoder_mask_decoder'], decoder_inputs);
  }

  /**
   * Runs the model with the provided inputs
   * @param {Object} model_inputs Model inputs
   * @returns {Promise<SamImageSegmentationOutput>} Object containing segmentation outputs
   */
  async _call(model_inputs: any) {
    return new SamImageSegmentationOutput(await super._call(model_inputs));
  }
}

/**
 * Base class for Segment-Anything model's output.
 */
export class SamImageSegmentationOutput extends ModelOutput {
  /**
   * @param {Object} output The output of the model.
   * @param {Tensor} output.iou_scores The output logits of the model.
   * @param {Tensor} output.pred_masks Predicted boxes.
   */
  iou_scores: Tensor;
  pred_masks: Tensor;
  constructor({ iou_scores, pred_masks }: { iou_scores: Tensor; pred_masks: Tensor }) {
    super();
    this.iou_scores = iou_scores;
    this.pred_masks = pred_masks;
  }
}
//////////////////////////////////////////////////

//////////////////////////////////////////////////
// Wav2Vec2 models
export class Wav2Vec2PreTrainedModel extends PreTrainedModel { }

/**
 * The bare Wav2Vec2 Model transformer outputting raw hidden-states without any specific head on top.
 *
 * **Example:** Load and run a `Wav2Vec2Model` for feature extraction.
 *
 * ```javascript
 * import { AutoProcessor, AutoModel, read_audio } from '@huggingface/transformers';
 *
 * // Read and preprocess audio
 * const processor = await AutoProcessor.from_pretrained('Xenova/mms-300m');
 * const audio = await read_audio('https://huggingface.co/datasets/Narsil/asr_dummy/resolve/main/mlk.flac', 16000);
 * const inputs = await processor(audio);
 *
 * // Run model with inputs
 * const model = await AutoModel.from_pretrained('Xenova/mms-300m');
 * const output = await model(inputs);
 * // {
 * //   last_hidden_state: Tensor {
 * //     dims: [ 1, 1144, 1024 ],
 * //     type: 'float32',
 * //     data: Float32Array(1171456) [ ... ],
 * //     size: 1171456
 * //   }
 * // }
 * ```
 */
export class Wav2Vec2Model extends Wav2Vec2PreTrainedModel { }

export class Wav2Vec2ForCTC extends Wav2Vec2PreTrainedModel {
  /**
   * @param {Object} model_inputs
   * @param {Tensor} model_inputs.input_values Float values of input raw speech waveform.
   * @param {Tensor} model_inputs.attention_mask Mask to avoid performing convolution and attention on padding token indices. Mask values selected in [0, 1]
   */
  async _call(model_inputs: any) {
    return new CausalLMOutput(await super._call(model_inputs) as { logits: Tensor });
  }
}

//////////////////////////////////////////////////

//////////////////////////////////////////////////
// PyAnnote models
export class PyAnnotePreTrainedModel extends PreTrainedModel { }

/**
 * The bare PyAnnote Model transformer outputting raw hidden-states without any specific head on top.
 */
export class PyAnnoteModel extends PyAnnotePreTrainedModel { }

/**
 * PyAnnote Model with a frame classification head on top for tasks like Speaker Diarization.
 *
 * **Example:** Load and run a `PyAnnoteForAudioFrameClassification` for speaker diarization.
 *
 * ```javascript
 * import { AutoProcessor, AutoModelForAudioFrameClassification, read_audio } from '@huggingface/transformers';
 *
 * // Load model and processor
 * const model_id = 'onnx-community/pyannote-segmentation-3.0';
 * const model = await AutoModelForAudioFrameClassification.from_pretrained(model_id);
 * const processor = await AutoProcessor.from_pretrained(model_id);
 *
 * // Read and preprocess audio
 * const url = 'https://huggingface.co/datasets/Xenova/transformers.js-docs/resolve/main/mlk.wav';
 * const audio = await read_audio(url, processor.feature_extractor.config.sampling_rate);
 * const inputs = await processor(audio);
 *
 * // Run model with inputs
 * const { logits } = await model(inputs);
 * // {
 * //   logits: Tensor {
 * //     dims: [ 1, 767, 7 ],  // [batch_size, num_frames, num_classes]
 * //     type: 'float32',
 * //     data: Float32Array(5369) [ ... ],
 * //     size: 5369
 * //   }
 * // }
 *
 * const result = processor.post_process_speaker_diarization(logits, audio.length);
 * // [
 * //   [
 * //     { id: 0, start: 0, end: 1.0512535626298245, confidence: 0.8220156481664611 },
 * //     { id: 2, start: 1.0512535626298245, end: 2.3398869619825127, confidence: 0.9008811707860472 },
 * //     ...
 * //   ]
 * // ]
 *
 * // Display result
 * console.table(result[0], ['start', 'end', 'id', 'confidence']);
 * // ┌─────────┬────────────────────┬────────────────────┬────┬─────────────────────┐
 * // │ (index) │ start              │ end                │ id │ confidence          │
 * // ├─────────┼────────────────────┼────────────────────┼────┼─────────────────────┤
 * // │ 0       │ 0                  │ 1.0512535626298245 │ 0  │ 0.8220156481664611  │
 * // │ 1       │ 1.0512535626298245 │ 2.3398869619825127 │ 2  │ 0.9008811707860472  │
 * // │ 2       │ 2.3398869619825127 │ 3.5946089560890773 │ 0  │ 0.7521651315796233  │
 * // │ 3       │ 3.5946089560890773 │ 4.578039708226655  │ 2  │ 0.8491978128022479  │
 * // │ 4       │ 4.578039708226655  │ 4.594995410849717  │ 0  │ 0.2935352600416393  │
 * // │ 5       │ 4.594995410849717  │ 6.121008646925269  │ 3  │ 0.6788051309866024  │
 * // │ 6       │ 6.121008646925269  │ 6.256654267909762  │ 0  │ 0.37125512393851134 │
 * // │ 7       │ 6.256654267909762  │ 8.630452635138397  │ 2  │ 0.7467035186353542  │
 * // │ 8       │ 8.630452635138397  │ 10.088643060721703 │ 0  │ 0.7689364814666032  │
 * // │ 9       │ 10.088643060721703 │ 12.58113134631177  │ 2  │ 0.9123324509131324  │
 * // │ 10      │ 12.58113134631177  │ 13.005023911888312 │ 0  │ 0.4828358177572041  │
 * // └─────────┴────────────────────┴────────────────────┴────┴─────────────────────┘
 * ```
 */
export class PyAnnoteForAudioFrameClassification extends PyAnnotePreTrainedModel {
  /**
   * Calls the model on new inputs.
   * @param {Object} model_inputs The inputs to the model.
   * @returns {Promise<TokenClassifierOutput>} An object containing the model's output logits for sequence classification.
   */
  async _call(model_inputs: any) {
    return new TokenClassifierOutput(await super._call(model_inputs) as { logits: Tensor });
  }
}
//////////////////////////////////////////////////

//////////////////////////////////////////////////
// WeSpeakerResNet models
export class WeSpeakerResNetPreTrainedModel extends PreTrainedModel { }
export class WeSpeakerResNetModel extends WeSpeakerResNetPreTrainedModel { }
//////////////////////////////////////////////////

//////////////////////////////////////////////////
// UniSpeech models
export class UniSpeechPreTrainedModel extends PreTrainedModel { }

/**
 * The bare UniSpeech Model transformer outputting raw hidden-states without any specific head on top.
 */
export class UniSpeechModel extends UniSpeechPreTrainedModel { }

/**
 * UniSpeech Model with a `language modeling` head on top for Connectionist Temporal Classification (CTC).
 */
export class UniSpeechForCTC extends UniSpeechPreTrainedModel {
  /**
   * @param {Object} model_inputs
   * @param {Tensor} model_inputs.input_values Float values of input raw speech waveform.
   * @param {Tensor} model_inputs.attention_mask Mask to avoid performing convolution and attention on padding token indices. Mask values selected in [0, 1]
   */
  async _call(model_inputs: any) {
    return new CausalLMOutput(await super._call(model_inputs) as { logits: Tensor });
  }
}

//////////////////////////////////////////////////

//////////////////////////////////////////////////
// UniSpeechSat models
export class UniSpeechSatPreTrainedModel extends PreTrainedModel { }

/**
 * The bare UniSpeechSat Model transformer outputting raw hidden-states without any specific head on top.
 */
export class UniSpeechSatModel extends UniSpeechSatPreTrainedModel { }

/**
 * UniSpeechSat Model with a `language modeling` head on top for Connectionist Temporal Classification (CTC).
 */
export class UniSpeechSatForCTC extends UniSpeechSatPreTrainedModel {
  /**
   * @param {Object} model_inputs
   * @param {Tensor} model_inputs.input_values Float values of input raw speech waveform.
   * @param {Tensor} model_inputs.attention_mask Mask to avoid performing convolution and attention on padding token indices. Mask values selected in [0, 1]
   */
  async _call(model_inputs: any) {
    return new CausalLMOutput(await super._call(model_inputs) as { logits: Tensor });
  }
}

/**
 * UniSpeechSat Model with a frame classification head on top for tasks like Speaker Diarization.
 */
export class UniSpeechSatForAudioFrameClassification extends UniSpeechSatPreTrainedModel {
  /**
   * Calls the model on new inputs.
   * @param {Object} model_inputs The inputs to the model.
   * @returns {Promise<TokenClassifierOutput>} An object containing the model's output logits for sequence classification.
   */
  async _call(model_inputs: any) {
    return new TokenClassifierOutput(await super._call(model_inputs) as { logits: Tensor });
  }
}
//////////////////////////////////////////////////

//////////////////////////////////////////////////
// Wav2Vec2Bert models
export class Wav2Vec2BertPreTrainedModel extends PreTrainedModel { }

/**
 * The bare Wav2Vec2Bert Model transformer outputting raw hidden-states without any specific head on top.
 */
export class Wav2Vec2BertModel extends Wav2Vec2BertPreTrainedModel { }

/**
 * Wav2Vec2Bert Model with a `language modeling` head on top for Connectionist Temporal Classification (CTC).
 */
export class Wav2Vec2BertForCTC extends Wav2Vec2BertPreTrainedModel {
  /**
   * @param {Object} model_inputs
   * @param {Tensor} model_inputs.input_features Float values of input mel-spectrogram.
   * @param {Tensor} model_inputs.attention_mask Mask to avoid performing convolution and attention on padding token indices. Mask values selected in [0, 1]
   */
  async _call(model_inputs: any) {
    return new CausalLMOutput(await super._call(model_inputs) as { logits: Tensor });
  }
}

//////////////////////////////////////////////////

//////////////////////////////////////////////////
// Hubert models
export class HubertPreTrainedModel extends PreTrainedModel { }

/**
 * The bare Hubert Model transformer outputting raw hidden-states without any specific head on top.
 *
 * **Example:** Load and run a `HubertModel` for feature extraction.
 *
 * ```javascript
 * import { AutoProcessor, AutoModel, read_audio } from '@huggingface/transformers';
 *
 * // Read and preprocess audio
 * const processor = await AutoProcessor.from_pretrained('Xenova/hubert-base-ls960');
 * const audio = await read_audio('https://huggingface.co/datasets/Xenova/transformers.js-docs/resolve/main/jfk.wav', 16000);
 * const inputs = await processor(audio);
 *
 * // Load and run model with inputs
 * const model = await AutoModel.from_pretrained('Xenova/hubert-base-ls960');
 * const output = await model(inputs);
 * // {
 * //   last_hidden_state: Tensor {
 * //     dims: [ 1, 549, 768 ],
 * //     type: 'float32',
 * //     data: Float32Array(421632) [0.0682469978928566, 0.08104046434164047, -0.4975186586380005, ...],
 * //     size: 421632
 * //   }
 * // }
 * ```
 */
export class HubertModel extends Wav2Vec2PreTrainedModel { }

/**
 * Hubert Model with a `language modeling` head on top for Connectionist Temporal Classification (CTC).
 */
export class HubertForCTC extends Wav2Vec2PreTrainedModel {
  /**
   * @param {Object} model_inputs
   * @param {Tensor} model_inputs.input_values Float values of input raw speech waveform.
   * @param {Tensor} model_inputs.attention_mask Mask to avoid performing convolution and attention on padding token indices. Mask values selected in [0, 1]
   */
  async _call(model_inputs: any) {
    return new CausalLMOutput(await super._call(model_inputs) as { logits: Tensor });
  }
}

//////////////////////////////////////////////////

//////////////////////////////////////////////////
// WavLM models
/**
 * An abstract class to handle weights initialization and a simple interface for downloading and loading pretrained models.
 */
export class WavLMPreTrainedModel extends PreTrainedModel { }

/**
 * The bare WavLM Model transformer outputting raw hidden-states without any specific head on top.
 *
 * **Example:** Load and run a `WavLMModel` for feature extraction.
 *
 * ```javascript
 * import { AutoProcessor, AutoModel, read_audio } from '@huggingface/transformers';
 *
 * // Read and preprocess audio
 * const processor = await AutoProcessor.from_pretrained('Xenova/wavlm-base');
 * const audio = await read_audio('https://huggingface.co/datasets/Xenova/transformers.js-docs/resolve/main/jfk.wav', 16000);
 * const inputs = await processor(audio);
 *
 * // Run model with inputs
 * const model = await AutoModel.from_pretrained('Xenova/wavlm-base');
 * const output = await model(inputs);
 * // {
 * //   last_hidden_state: Tensor {
 * //     dims: [ 1, 549, 768 ],
 * //     type: 'float32',
 * //     data: Float32Array(421632) [-0.349443256855011, -0.39341306686401367,  0.022836603224277496, ...],
 * //     size: 421632
 * //   }
 * // }
 * ```
 */
export class WavLMModel extends WavLMPreTrainedModel { }

/**
 * WavLM Model with a `language modeling` head on top for Connectionist Temporal Classification (CTC).
 */
export class WavLMForCTC extends WavLMPreTrainedModel {
  /**
   * @param {Object} model_inputs
   * @param {Tensor} model_inputs.input_values Float values of input raw speech waveform.
   * @param {Tensor} model_inputs.attention_mask Mask to avoid performing convolution and attention on padding token indices. Mask values selected in [0, 1]
   */
  async _call(model_inputs: any) {
    return new CausalLMOutput(await super._call(model_inputs) as { logits: Tensor });
  }
}

/**
 * WavLM Model with an XVector feature extraction head on top for tasks like Speaker Verification.
 *
 * **Example:** Extract speaker embeddings with `WavLMForXVector`.
 * ```javascript
 * import { AutoProcessor, AutoModel, read_audio } from '@huggingface/transformers';
 *
 * // Read and preprocess audio
 * const processor = await AutoProcessor.from_pretrained('Xenova/wavlm-base-plus-sv');
 * const url = 'https://huggingface.co/datasets/Xenova/transformers.js-docs/resolve/main/jfk.wav';
 * const audio = await read_audio(url, 16000);
 * const inputs = await processor(audio);
 *
 * // Run model with inputs
 * const model = await AutoModel.from_pretrained('Xenova/wavlm-base-plus-sv');
 * const outputs = await model(inputs);
 * // {
 * //   logits: Tensor {
 * //     dims: [ 1, 512 ],
 * //     type: 'float32',
 * //     data: Float32Array(512) [0.5847219228744507, ...],
 * //     size: 512
 * //   },
 * //   embeddings: Tensor {
 * //     dims: [ 1, 512 ],
 * //     type: 'float32',
 * //     data: Float32Array(512) [-0.09079201519489288, ...],
 * //     size: 512
 * //   }
 * // }
 * ```
 */
export class WavLMForXVector extends WavLMPreTrainedModel {
  /**
   * Calls the model on new inputs.
   * @param {Object} model_inputs The inputs to the model.
   * @returns {Promise<XVectorOutput>} An object containing the model's output logits and speaker embeddings.
   */
  async _call(model_inputs: any) {
    return new XVectorOutput(await super._call(model_inputs) as { logits: Tensor, embeddings: Tensor });
  }
}

/**
 * WavLM Model with a frame classification head on top for tasks like Speaker Diarization.
 *
 * **Example:** Perform speaker diarization with `WavLMForAudioFrameClassification`.
 * ```javascript
 * import { AutoProcessor, AutoModelForAudioFrameClassification, read_audio } from '@huggingface/transformers';
 *
 * // Read and preprocess audio
 * const processor = await AutoProcessor.from_pretrained('Xenova/wavlm-base-plus-sd');
 * const url = 'https://huggingface.co/datasets/Xenova/transformers.js-docs/resolve/main/jfk.wav';
 * const audio = await read_audio(url, 16000);
 * const inputs = await processor(audio);
 *
 * // Run model with inputs
 * const model = await AutoModelForAudioFrameClassification.from_pretrained('Xenova/wavlm-base-plus-sd');
 * const { logits } = await model(inputs);
 * // {
 * //   logits: Tensor {
 * //     dims: [ 1, 549, 2 ],  // [batch_size, num_frames, num_speakers]
 * //     type: 'float32',
 * //     data: Float32Array(1098) [-3.5301010608673096, ...],
 * //     size: 1098
 * //   }
 * // }
 *
 * const labels = logits[0].sigmoid().tolist().map(
 *     frames => frames.map(speaker => speaker > 0.5 ? 1 : 0)
 * );
 * console.log(labels); // labels is a one-hot array of shape (num_frames, num_speakers)
 * // [
 * //     [0, 0], [0, 0], [0, 0], [0, 0], [0, 0], [0, 0],
 * //     [0, 0], [0, 0], [0, 0], [0, 0], [0, 0], [0, 0],
 * //     [0, 0], [0, 1], [0, 1], [0, 1], [0, 1], [0, 1],
 * //     ...
 * // ]
 * ```
 */
export class WavLMForAudioFrameClassification extends WavLMPreTrainedModel {
  /**
   * Calls the model on new inputs.
   * @param {Object} model_inputs The inputs to the model.
   * @returns {Promise<TokenClassifierOutput>} An object containing the model's output logits for sequence classification.
   */
  async _call(model_inputs: any) {
    return new TokenClassifierOutput(await super._call(model_inputs) as { logits: Tensor });
  }
}

//////////////////////////////////////////////////
// SpeechT5 models
/**
 * An abstract class to handle weights initialization and a simple interface for downloading and loading pretrained models.
 */
export class SpeechT5PreTrainedModel extends PreTrainedModel { }

/**
 * The bare SpeechT5 Encoder-Decoder Model outputting raw hidden-states without any specific pre- or post-nets.
 */
export class SpeechT5Model extends SpeechT5PreTrainedModel { }

/**
 * SpeechT5 Model with a speech encoder and a text decoder.
 *
 * **Example:** Generate speech from text with `SpeechT5ForSpeechToText`.
 * ```javascript
 * import { AutoTokenizer, AutoProcessor, SpeechT5ForTextToSpeech, SpeechT5HifiGan, Tensor } from '@huggingface/transformers';
 *
 * // Load the tokenizer and processor
 * const tokenizer = await AutoTokenizer.from_pretrained('Xenova/speecht5_tts');
 * const processor = await AutoProcessor.from_pretrained('Xenova/speecht5_tts');
 *
 * // Load the models
 * // NOTE: We use the full-precision versions as they are more accurate
 * const model = await SpeechT5ForTextToSpeech.from_pretrained('Xenova/speecht5_tts', { dtype: 'fp32' });
 * const vocoder = await SpeechT5HifiGan.from_pretrained('Xenova/speecht5_hifigan', { dtype: 'fp32' });
 *
 * // Load speaker embeddings from URL
 * const speaker_embeddings_data = new Float32Array(
 *     await (await fetch('https://huggingface.co/datasets/Xenova/transformers.js-docs/resolve/main/speaker_embeddings.bin')).arrayBuffer()
 * );
 * const speaker_embeddings = new Tensor(
 *     'float32',
 *     speaker_embeddings_data,
 *     [1, speaker_embeddings_data.length]
 * )
 *
 * // Run tokenization
 * const { input_ids } = tokenizer('Hello, my dog is cute');
 *
 * // Generate waveform
 * const { waveform } = await model.generate_speech(input_ids, speaker_embeddings, { vocoder });
 * console.log(waveform)
 * // Tensor {
 * //   dims: [ 26112 ],
 * //   type: 'float32',
 * //   size: 26112,
 * //   data: Float32Array(26112) [ -0.00043630177970044315, -0.00018082228780258447, ... ],
 * // }
 * ```
 */
export class SpeechT5ForSpeechToText extends SpeechT5PreTrainedModel { }

/**
 * SpeechT5 Model with a text encoder and a speech decoder.
 */
export class SpeechT5ForTextToSpeech extends SpeechT5PreTrainedModel {
  /**
   * @typedef {Object} SpeechOutput
   * @property {Tensor} [spectrogram] The predicted log-mel spectrogram of shape
   * `(output_sequence_length, config.num_mel_bins)`. Returned when no `vocoder` is provided
   * @property {Tensor} [waveform] The predicted waveform of shape `(num_frames,)`. Returned when a `vocoder` is provided.
   * @property {Tensor} [cross_attentions] The outputs of the decoder's cross-attention layers of shape
   * `(config.decoder_layers, config.decoder_attention_heads, output_sequence_length, input_sequence_length)`. returned when `output_cross_attentions` is `true`.
   */

  /**
   * Converts a sequence of input tokens into a sequence of mel spectrograms, which are subsequently turned into a speech waveform using a vocoder.
   * @param {Tensor} input_values Indices of input sequence tokens in the vocabulary.
   * @param {Tensor} speaker_embeddings Tensor containing the speaker embeddings.
   * @param {Object} options Optional parameters for generating speech.
   * @param {number} [options.threshold=0.5] The generated sequence ends when the predicted stop token probability exceeds this value.
   * @param {number} [options.minlenratio=0.0] Used to calculate the minimum required length for the output sequence.
   * @param {number} [options.maxlenratio=20.0] Used to calculate the maximum allowed length for the output sequence.
   * @param {Object} [options.vocoder=null] The vocoder that converts the mel spectrogram into a speech waveform. If `null`, the output is the mel spectrogram.
   * @param {boolean} [options.output_cross_attentions=false] Whether or not to return the attentions tensors of the decoder's cross-attention layers.
   * @returns {Promise<SpeechOutput>} A promise which resolves to an object containing the spectrogram, waveform, and cross-attention tensors.
   */
  async generate_speech(
    input_values: Tensor,
    speaker_embeddings: Tensor,
    {
      threshold = 0.5,
      minlenratio = 0.0,
      maxlenratio = 20.0,
      vocoder = null,
      // output_cross_attentions = false, // TODO add
    } = {},
  ) {
    const model_inputs = {
      input_ids: input_values,
    };

    const { encoder_outputs, encoder_attention_mask } = await encoderForward(this, model_inputs);

    // @ts-expect-error TS2339
    const r = encoder_outputs.dims[1] / this.config.reduction_factor;
    const maxlen = Math.floor(r * maxlenratio);
    const minlen = Math.floor(r * minlenratio);

    // @ts-expect-error TS2339
    const num_mel_bins = this.config.num_mel_bins;

    let spectrogramParts = [];
    let past_key_values = null;
    let decoder_outputs = null;
    let idx = 0;

    while (true) {
      ++idx;

      const use_cache_branch = boolTensor(!!decoder_outputs);
      let output_sequence;
      if (decoder_outputs) {
        output_sequence = decoder_outputs.output_sequence_out;
      } else {
        output_sequence = new Tensor('float32', new Float32Array(num_mel_bins), [1, 1, num_mel_bins]);
      }
      let decoderFeeds = {
        use_cache_branch,
        output_sequence,
        encoder_attention_mask: encoder_attention_mask,
        speaker_embeddings: speaker_embeddings,
        encoder_hidden_states: encoder_outputs,
      };

      this.addPastKeyValues(decoderFeeds, past_key_values);
      decoder_outputs = await sessionRun(this.sessions['decoder_model_merged'], decoderFeeds);
      past_key_values = this.getPastKeyValues(decoder_outputs, past_key_values);

      const { prob, spectrum } = decoder_outputs;
      spectrogramParts.push(spectrum);

      if (
        idx >= minlen &&
        // Finished when stop token or maximum length is reached.
        (Array.from(prob.data as Float32Array).filter((p) => p >= threshold).length > 0 || idx >= maxlen)
      ) {
        break;
      }
    }

    const spectrogram = cat(spectrogramParts);
    const { waveform } = await sessionRun((vocoder as any).sessions['model'], { spectrogram: spectrogram as any });

    return {
      spectrogram,
      waveform,
      // cross_attentions: null, // TODO add
    };
  }
}

/**
 * HiFi-GAN vocoder.
 *
 * See [SpeechT5ForSpeechToText](./models#module_models.SpeechT5ForSpeechToText) for example usage.
 */
export class SpeechT5HifiGan extends PreTrainedModel {
  main_input_name = 'spectrogram';
}
//////////////////////////////////////////////////

//////////////////////////////////////////////////
// TrOCR models
export class TrOCRPreTrainedModel extends PreTrainedModel { }

/**
 * The TrOCR Decoder with a language modeling head.
 */
export class TrOCRForCausalLM extends TrOCRPreTrainedModel { }

//////////////////////////////////////////////////

//////////////////////////////////////////////////
// Mistral models
/**
 * The bare Mistral Model outputting raw hidden-states without any specific head on top.
 */
export class MistralPreTrainedModel extends PreTrainedModel { }

export class MistralModel extends MistralPreTrainedModel { }

export class MistralForCausalLM extends MistralPreTrainedModel { }
//////////////////////////////////////////////////

//////////////////////////////////////////////////
// Starcoder2 models
/**
 * The bare Starcoder2 Model outputting raw hidden-states without any specific head on top.
 */
export class Starcoder2PreTrainedModel extends PreTrainedModel { }

export class Starcoder2Model extends Starcoder2PreTrainedModel { }

export class Starcoder2ForCausalLM extends Starcoder2PreTrainedModel { }
//////////////////////////////////////////////////

//////////////////////////////////////////////////
// Falcon models
/**
 * The bare Falcon Model outputting raw hidden-states without any specific head on top.
 */
export class FalconPreTrainedModel extends PreTrainedModel { }

export class FalconModel extends FalconPreTrainedModel { }

export class FalconForCausalLM extends FalconPreTrainedModel { }
//////////////////////////////////////////////////

//////////////////////////////////////////////////
// CLAP models
export class ClapPreTrainedModel extends PreTrainedModel { }

export class ClapModel extends ClapPreTrainedModel { }

/**
 * CLAP Text Model with a projection layer on top (a linear layer on top of the pooled output).
 *
 * **Example:** Compute text embeddings with `ClapTextModelWithProjection`.
 *
 * ```javascript
 * import { AutoTokenizer, ClapTextModelWithProjection } from '@huggingface/transformers';
 *
 * // Load tokenizer and text model
 * const tokenizer = await AutoTokenizer.from_pretrained('Xenova/clap-htsat-unfused');
 * const text_model = await ClapTextModelWithProjection.from_pretrained('Xenova/clap-htsat-unfused');
 *
 * // Run tokenization
 * const texts = ['a sound of a cat', 'a sound of a dog'];
 * const text_inputs = tokenizer(texts, { padding: true, truncation: true });
 *
 * // Compute embeddings
 * const { text_embeds } = await text_model(text_inputs);
 * // Tensor {
 * //   dims: [ 2, 512 ],
 * //   type: 'float32',
 * //   data: Float32Array(1024) [ ... ],
 * //   size: 1024
 * // }
 * ```
 */
export class ClapTextModelWithProjection extends ClapPreTrainedModel {
  /** @type {typeof PreTrainedModel.from_pretrained} */
  static async from_pretrained(pretrained_model_name_or_path: string, options: any = {}) {
    return super.from_pretrained(pretrained_model_name_or_path, {
      ...options,
      // Update default model file name if not provided
      model_file_name: options.model_file_name ?? 'text_model',
    });
  }
}

/**
 * CLAP Audio Model with a projection layer on top (a linear layer on top of the pooled output).
 *
 * **Example:** Compute audio embeddings with `ClapAudioModelWithProjection`.
 *
 * ```javascript
 * import { AutoProcessor, ClapAudioModelWithProjection, read_audio } from '@huggingface/transformers';
 *
 * // Load processor and audio model
 * const processor = await AutoProcessor.from_pretrained('Xenova/clap-htsat-unfused');
 * const audio_model = await ClapAudioModelWithProjection.from_pretrained('Xenova/clap-htsat-unfused');
 *
 * // Read audio and run processor
 * const audio = await read_audio('https://huggingface.co/datasets/Xenova/transformers.js-docs/resolve/main/cat_meow.wav');
 * const audio_inputs = await processor(audio);
 *
 * // Compute embeddings
 * const { audio_embeds } = await audio_model(audio_inputs);
 * // Tensor {
 * //   dims: [ 1, 512 ],
 * //   type: 'float32',
 * //   data: Float32Array(512) [ ... ],
 * //   size: 512
 * // }
 * ```
 */
export class ClapAudioModelWithProjection extends ClapPreTrainedModel {
  /** @type {typeof PreTrainedModel.from_pretrained} */
  static async from_pretrained(pretrained_model_name_or_path: string, options: any = {}) {
    return super.from_pretrained(pretrained_model_name_or_path, {
      ...options,
      // Update default model file name if not provided
      model_file_name: options.model_file_name ?? 'audio_model',
    });
  }
}
//////////////////////////////////////////////////

//////////////////////////////////////////////////
// VITS models
export class VitsPreTrainedModel extends PreTrainedModel { }

/**
 * The complete VITS model, for text-to-speech synthesis.
 *
 * **Example:** Generate speech from text with `VitsModel`.
 * ```javascript
 * import { AutoTokenizer, VitsModel } from '@huggingface/transformers';
 *
 * // Load the tokenizer and model
 * const tokenizer = await AutoTokenizer.from_pretrained('Xenova/mms-tts-eng');
 * const model = await VitsModel.from_pretrained('Xenova/mms-tts-eng');
 *
 * // Run tokenization
 * const inputs = tokenizer('I love transformers');
 *
 * // Generate waveform
 * const { waveform } = await model(inputs);
 * // Tensor {
 * //   dims: [ 1, 35328 ],
 * //   type: 'float32',
 * //   data: Float32Array(35328) [ ... ],
 * //   size: 35328,
 * // }
 * ```
 */
export class VitsModel extends VitsPreTrainedModel {
  /**
   * Calls the model on new inputs.
   * @param {Object} model_inputs The inputs to the model.
   * @returns {Promise<VitsModelOutput>} The outputs for the VITS model.
   */
  async _call(model_inputs: any) {
    return new VitsModelOutput(await super._call(model_inputs) as VitsModelOutput);
  }
}
//////////////////////////////////////////////////

//////////////////////////////////////////////////
// StableLm models
export class StableLmPreTrainedModel extends PreTrainedModel { }

/**
 * The bare StableLm Model transformer outputting raw hidden-states without any specific head on top.
 */
export class StableLmModel extends StableLmPreTrainedModel { }

/**
 * StableLm Model with a `language modeling` head on top for Causal Language Modeling (with past).
 */
export class StableLmForCausalLM extends StableLmPreTrainedModel { }
//////////////////////////////////////////////////

//////////////////////////////////////////////////
// Musicgen models
export class MusicgenPreTrainedModel extends PreTrainedModel { }

/**
 * The bare Musicgen decoder model outputting raw hidden-states without any specific head on top.
 */
export class MusicgenModel extends MusicgenPreTrainedModel { }

/**
 * The MusicGen decoder model with a language modelling head on top.
 */
export class MusicgenForCausalLM extends MusicgenPreTrainedModel { }

/**
 * The composite MusicGen model with a text encoder, audio encoder and Musicgen decoder,
 * for music generation tasks with one or both of text and audio prompts.
 *
 * **Example:** Generate music from text with `Xenova/musicgen-small`.
 * ```javascript
 * import { AutoTokenizer, MusicgenForConditionalGeneration } from '@huggingface/transformers';
 *
 * // Load tokenizer and model
 * const tokenizer = await AutoTokenizer.from_pretrained('Xenova/musicgen-small');
 * const model = await MusicgenForConditionalGeneration.from_pretrained(
 *   'Xenova/musicgen-small', { dtype: 'fp32' }
 * );
 *
 * // Prepare text input
 * const prompt = '80s pop track with bassy drums and synth';
 * const inputs = tokenizer(prompt);
 *
 * // Generate audio
 * const audio_values = await model.generate({
 *   ...inputs,
 *   max_new_tokens: 512,
 *   do_sample: true,
 *   guidance_scale: 3,
 * });
 *
 * // (Optional) Write the output to a WAV file
 * import wavefile from 'wavefile';
 * import fs from 'fs';
 *
 * const wav = new wavefile.WaveFile();
 * wav.fromScratch(1, model.config.audio_encoder.sampling_rate, '32f', audio_values.data);
 * fs.writeFileSync('musicgen_out.wav', wav.toBuffer());
 * ```
 */
export class MusicgenForConditionalGeneration extends PreTrainedModel {
  // NOTE: not MusicgenPreTrainedModel
  forward_params = [
    'input_ids',
    'attention_mask',
    'encoder_outputs',
    'decoder_input_ids',
    'decoder_attention_mask',
    'past_key_values',
  ];

  /**
   * Apply the pattern mask to the final ids,
   * then revert the pattern delay mask by filtering the pad token id in a single step.
   * @param {Tensor} outputs The output tensor from the model.
   * @returns {Tensor} The filtered output tensor.
   */
  _apply_and_filter_by_delay_pattern_mask(outputs: any) {
    const [bs_x_codebooks, seqLength] = outputs.dims;
    // @ts-expect-error TS2339
    const num_codebooks = this.config.decoder.num_codebooks;
    const upperBound = seqLength - num_codebooks;

    let newDataSize = 0;
    for (let i = 0; i < outputs.size; ++i) {
      // @ts-expect-error TS2339
      if (outputs.data[i] === this.config.decoder.pad_token_id) {
        continue;
      }

      const row = i % seqLength;
      const col = Math.floor(i / seqLength) % num_codebooks;

      const diff = row - col;
      if (diff > 0 && diff <= upperBound) {
        outputs.data[newDataSize++] = outputs.data[i];
      }
    }

    const batch_size = Math.floor(bs_x_codebooks / num_codebooks);
    const inferred = newDataSize / (batch_size * num_codebooks);
    // TODO: assert `inferred` is an integer
    return new Tensor(outputs.type, outputs.data.slice(0, newDataSize), [batch_size, num_codebooks, inferred]);
  }

  prepare_inputs_for_generation(input_ids: any, model_inputs: any, generation_config: any) {
    // apply the delay pattern mask
    let clonedInputIds = structuredClone(input_ids);
    for (let i = 0; i < clonedInputIds.length; ++i) {
      for (let j = 0; j < clonedInputIds[i].length; ++j) {
        // @ts-expect-error TS2339
        if (i % this.config.decoder.num_codebooks >= j) {
          // @ts-expect-error TS2339
          clonedInputIds[i][j] = BigInt(this.config.decoder.pad_token_id);
        }
      }
    }
    // for classifier free guidance we need to replicate the decoder args across the batch dim
    // (we'll split these before sampling)
    if (generation_config.guidance_scale !== null && generation_config.guidance_scale > 1) {
      // [batch, seqLength] -> [2 * batch, seqLength]
      clonedInputIds = clonedInputIds.concat(clonedInputIds);
    }

    const prepped = super.prepare_inputs_for_generation(clonedInputIds, model_inputs, generation_config);
    return prepped;
  }

  /**
   * Generates sequences of token ids for models with a language modeling head.
   * @param {import('./generation/parameters.js').GenerationFunctionParameters} options
   * @returns {Promise<ModelOutput|Tensor>} The output of the model, which can contain the generated token ids, attentions, and scores.
   */
  async generate(options: any) {
    const output_ids = await super.generate(options);

    // apply the pattern mask to the final ids
    // tensor: int64[1,batch_size,4,chunk_length]
    const audio_codes = this._apply_and_filter_by_delay_pattern_mask(/** @type {Tensor} */ output_ids).unsqueeze_(0); // append the frame dimension back to the audio codes

    const { audio_values } = await sessionRun(this.sessions['encodec_decode'], { audio_codes });

    return audio_values;
  }
}
//////////////////////////////////////////////////

//////////////////////////////////////////////////
// Decision Transformer models
export class DecisionTransformerPreTrainedModel extends PreTrainedModel { }

/**
 * The model builds upon the GPT2 architecture to perform autoregressive prediction of actions in an offline RL setting.
 * Refer to the paper for more details: https://arxiv.org/abs/2106.01345
 */
export class DecisionTransformerModel extends DecisionTransformerPreTrainedModel { }

//////////////////////////////////////////////////

export class MultiModalityPreTrainedModel extends PreTrainedModel { }
export class MultiModalityCausalLM extends MultiModalityPreTrainedModel {
  forward_params = [
    // prepare_inputs_embeds
    'input_ids',
    'pixel_values',
    'images_seq_mask',
    'images_emb_mask',

    // language_model
    'attention_mask',
    'position_ids',
    'past_key_values',
  ];

  /**
   * @param {ConstructorParameters<typeof MultiModalityPreTrainedModel>} args
   */

  _generation_mode: string;
  sessions: any;
  constructor(args: ConstructorParameters<typeof MultiModalityPreTrainedModel>[0]) {
    super(args, {}, {});

    // State-based approach to switch out which heads to use during generation
    this._generation_mode = 'text';
  }

  async forward(model_inputs: any) {
    const mode = this._generation_mode ?? 'text';

    // TODO support re-using PKVs for input_ids.dims[1] !== 1
    // if (model_inputs.past_key_values) {
    //     //  && model_inputs.input_ids.dims[1] === 1
    // }

    let output_1;
    if (mode === 'text' || !model_inputs.past_key_values) {
      const session = this.sessions['prepare_inputs_embeds'];
      const prep_inputs = pick(model_inputs, session.inputNames);
      output_1 = await sessionRun(session, prep_inputs);
    } else {
      const session = this.sessions['gen_img_embeds'];
      const prep_inputs = pick(
        {
          image_ids: model_inputs.input_ids,
        },
        session.inputNames,
      );
      output_1 = await sessionRun(session, prep_inputs);
    }

    const input_2 = { ...model_inputs, ...output_1 };
    const output_2 = await decoderForward(this, input_2);

    const head = this.sessions[mode === 'text' ? 'lm_head' : 'gen_head'];
    if (!head) {
      throw new Error(`Unable to find "${head}" generation head`);
    }

    const output_3 = await sessionRun(head, pick(output_2, head.inputNames));

    return {
      ...output_1,
      ...output_2,
      ...output_3,
    };
  }

  /**
   * @param {import('./generation/parameters.js').GenerationFunctionParameters} options
   */
  async generate(options: any) {
    this._generation_mode = 'text';
    return super.generate(options);
  }

  /**
   * @param {import('./generation/parameters.js').GenerationFunctionParameters} options
   */
  async generate_images(options: any) {
    this._generation_mode = 'image';

    const start_num_tokens = (options.inputs ?? options[this.main_input_name]).dims[1];
    const all_tokens = await super.generate(options);

    const generated_tokens = /** @type {Tensor} */ ((all_tokens as Tensor).slice(null, [start_num_tokens, null]));

    const image_decode = this.sessions['image_decode'];
    const { decoded_image } = await sessionRun(image_decode, {
      generated_tokens,
    });

    // Equivalent to `np.clip((dec + 1) / 2 * 255, 0, 255)`
    const clamped = decoded_image
      .add_(1)
      .mul_(255 / 2)
      .clamp_(0, 255)
      .to('uint8');

    // Return as a list of images
    const images = [];
    for (const tensor of clamped) {
      const img = RawImage.fromTensor(tensor);
      images.push(img);
    }
    return images;
  }
}

export class MgpstrModelOutput extends ModelOutput {
  char_logits: Tensor;
  bpe_logits: Tensor;
  wp_logits: Tensor;
  constructor({ char_logits, bpe_logits, wp_logits }: any) {
    super();
    this.char_logits = char_logits;
    this.bpe_logits = bpe_logits;
    this.wp_logits = wp_logits;
  }

  get logits() {
    return [this.char_logits, this.bpe_logits, this.wp_logits];
  }
}

export class MgpstrPreTrainedModel extends PreTrainedModel { }

/**
 * MGP-STR Model transformer with three classification heads on top
 * (three A^3 modules and three linear layer on top of the transformer encoder output) for scene text recognition (STR).
 */
export class MgpstrForSceneTextRecognition extends MgpstrPreTrainedModel {
  /**
   * @param {any} model_inputs
   */
  async _call(model_inputs: any) {
    return new MgpstrModelOutput(await super._call(model_inputs) as { char_logits: Tensor, bpe_logits: Tensor, wp_logits: Tensor });
  }
}

//////////////////////////////////////////////////
// PatchTST Transformer models
export class PatchTSTPreTrainedModel extends PreTrainedModel { }

/**
 * The bare PatchTST Model outputting raw hidden-states without any specific head.
 */
export class PatchTSTModel extends PatchTSTPreTrainedModel { }

/**
 * The PatchTST for prediction model.
 */
export class PatchTSTForPrediction extends PatchTSTPreTrainedModel { }
//////////////////////////////////////////////////

//////////////////////////////////////////////////
// StyleTextToSpeech2 Transformer models
export class StyleTextToSpeech2PreTrainedModel extends PreTrainedModel { }
export class StyleTextToSpeech2Model extends StyleTextToSpeech2PreTrainedModel { }
//////////////////////////////////////////////////

//////////////////////////////////////////////////
// PatchTSMixer Transformer models
export class PatchTSMixerPreTrainedModel extends PreTrainedModel { }

/**
 * The bare PatchTSMixer Model outputting raw hidden-states without any specific head.
 */
export class PatchTSMixerModel extends PatchTSMixerPreTrainedModel { }

/**
 * The PatchTSMixer for prediction model.
 */
export class PatchTSMixerForPrediction extends PatchTSMixerPreTrainedModel { }
//////////////////////////////////////////////////

//////////////////////////////////////////////////
// AutoModels, used to simplify construction of PreTrainedModels
// (uses config to instantiate correct class)

/**
 * Base class of all AutoModels. Contains the `from_pretrained` function
 * which is used to instantiate pretrained models.
 */
interface ModelOptions {
  config?: PretrainedConfig | null;
  cache_dir?: string | null;
  local_files_only?: boolean;
  revision?: string;
  model_file_name?: string | null;
  subfolder?: string;
  device?: string | null;
  dtype?: string | null;
  use_external_data_format?: boolean | null;
  session_options?: any;
  progress_callback?: ProgressCallback | null;
}
export class PretrainedMixin {
  /**
   * Mapping from model type to model class.
   * @type {Map<string, any>[] | null}
   */
  static MODEL_CLASS_MAPPINGS: Map<string, any>[] | null = null;

  /**
   * Whether to attempt to instantiate the base class (`PretrainedModel`) if
   * the model type is not found in the mapping.
   */
  static BASE_IF_FAIL = false;

  /** @type {typeof PreTrainedModel.from_pretrained} */
  static async from_pretrained(
    pretrained_model_name_or_path: string,
    {
      progress_callback = null,
      config = null,
      cache_dir = null,
      local_files_only = false,
      revision = 'main',
      model_file_name = null,
      subfolder = 'onnx',
      device = null,
      dtype = null,
      use_external_data_format = null,
      session_options = {},
    } = {},
  ) {
    const options: ModelOptions = {
      progress_callback,
      config,
      cache_dir,
      local_files_only,
      revision,
      model_file_name,
      subfolder,
      device,
      dtype,
      use_external_data_format,
      session_options,
    };
    options.config = await AutoConfig.from_pretrained(pretrained_model_name_or_path, options);

    if (!this.MODEL_CLASS_MAPPINGS) {
      throw new Error('`MODEL_CLASS_MAPPINGS` not implemented for this type of `AutoClass`: ' + this.name);
    }

    for (const MODEL_CLASS_MAPPING of this.MODEL_CLASS_MAPPINGS) {
      const modelInfo = MODEL_CLASS_MAPPING.get((options.config as any)?.model_type);
      if (!modelInfo) {
        continue; // Item not found in this mapping
      }
      return await modelInfo[1].from_pretrained(pretrained_model_name_or_path, options);
    }

    if (this.BASE_IF_FAIL) {
      console.warn(`Unknown model class "${(options.config as any)?.model_type}", attempting to construct from base class.`);
      return await PreTrainedModel.from_pretrained(pretrained_model_name_or_path, options);
    } else {
      throw Error(`Unsupported model type: ${(options.config as any)?.model_type}`);
    }
  }
}

const MODEL_MAPPING_NAMES_ENCODER_ONLY = new Map([
  ['clap', ['ClapModel', ClapModel]],
  ['clip', ['CLIPModel', CLIPModel]],
  ['chinese_clip', ['ChineseCLIPModel', ChineseCLIPModel]],
  ['siglip', ['SiglipModel', SiglipModel]],
  ['jina_clip', ['JinaCLIPModel', JinaCLIPModel]],
  ['wav2vec2', ['Wav2Vec2Model', Wav2Vec2Model]],
  ['wav2vec2-bert', ['Wav2Vec2BertModel', Wav2Vec2BertModel]],
  ['unispeech', ['UniSpeechModel', UniSpeechModel]],
  ['unispeech-sat', ['UniSpeechSatModel', UniSpeechSatModel]],
  ['hubert', ['HubertModel', HubertModel]],
  ['wavlm', ['WavLMModel', WavLMModel]],
  ['audio-spectrogram-transformer', ['ASTModel', ASTModel]],
  ['vits', ['VitsModel', VitsModel]],
  ['pyannote', ['PyAnnoteModel', PyAnnoteModel]],
  ['wespeaker-resnet', ['WeSpeakerResNetModel', WeSpeakerResNetModel]],

  ['vit_mae', ['ViTMAEModel', ViTMAEModel]],
  ['groupvit', ['GroupViTModel', GroupViTModel]],
  ['swin2sr', ['Swin2SRModel', Swin2SRModel]],

  ['hifigan', ['SpeechT5HifiGan', SpeechT5HifiGan]],

  ['decision_transformer', ['DecisionTransformerModel', DecisionTransformerModel]],
  ['patchtst', ['PatchTSTForPrediction', PatchTSTModel]],
  ['patchtsmixer', ['PatchTSMixerForPrediction', PatchTSMixerModel]],

  ['mgp-str', ['MgpstrForSceneTextRecognition', MgpstrForSceneTextRecognition]],
  ['style_text_to_speech_2', ['StyleTextToSpeech2Model', StyleTextToSpeech2Model]],
]);

const MODEL_MAPPING_NAMES_DECODER_ONLY = new Map([
  ['bloom', ['BloomModel', BloomModel]],
  ['jais', ['JAISModel', JAISModel]],
  ['gpt2', ['GPT2Model', GPT2Model]],
  ['gptj', ['GPTJModel', GPTJModel]],
  ['gpt_bigcode', ['GPTBigCodeModel', GPTBigCodeModel]],
  ['gpt_neo', ['GPTNeoModel', GPTNeoModel]],
  ['gpt_neox', ['GPTNeoXModel', GPTNeoXModel]],
  ['codegen', ['CodeGenModel', CodeGenModel]],
  ['llama', ['LlamaModel', LlamaModel]],
  ['exaone', ['ExaoneModel', ExaoneModel]],
  ['olmo', ['OlmoModel', OlmoModel]],
  ['olmo2', ['Olmo2Model', Olmo2Model]],
  ['mobilellm', ['MobileLLMModel', MobileLLMModel]],
  ['granite', ['GraniteModel', GraniteModel]],
  ['cohere', ['CohereModel', CohereModel]],
  ['gemma', ['GemmaModel', GemmaModel]],
  ['gemma2', ['Gemma2Model', Gemma2Model]],
  ['openelm', ['OpenELMModel', OpenELMModel]],
  ['qwen2', ['Qwen2Model', Qwen2Model]],
  ['phi', ['PhiModel', PhiModel]],
  ['phi3', ['Phi3Model', Phi3Model]],
  ['mpt', ['MptModel', MptModel]],
  ['opt', ['OPTModel', OPTModel]],
  ['mistral', ['MistralModel', MistralModel]],
  ['starcoder2', ['Starcoder2Model', Starcoder2Model]],
  ['falcon', ['FalconModel', FalconModel]],
  ['stablelm', ['StableLmModel', StableLmModel]],
]);

const MODEL_FOR_SPEECH_SEQ_2_SEQ_MAPPING_NAMES = new Map([
  ['speecht5', ['SpeechT5ForSpeechToText', SpeechT5ForSpeechToText]],
  ['whisper', ['WhisperForConditionalGeneration', WhisperForConditionalGeneration]],
  ['moonshine', ['MoonshineForConditionalGeneration', MoonshineForConditionalGeneration]],
]);

const MODEL_FOR_TEXT_TO_SPECTROGRAM_MAPPING_NAMES = new Map([
  ['speecht5', ['SpeechT5ForTextToSpeech', SpeechT5ForTextToSpeech]],
]);

const MODEL_FOR_TEXT_TO_WAVEFORM_MAPPING_NAMES = new Map([
  ['vits', ['VitsModel', VitsModel]],
  ['musicgen', ['MusicgenForConditionalGeneration', MusicgenForConditionalGeneration]],
]);

const MODEL_FOR_CAUSAL_LM_MAPPING_NAMES = new Map([
  ['bloom', ['BloomForCausalLM', BloomForCausalLM]],
  ['gpt2', ['GPT2LMHeadModel', GPT2LMHeadModel]],
  ['jais', ['JAISLMHeadModel', JAISLMHeadModel]],
  ['gptj', ['GPTJForCausalLM', GPTJForCausalLM]],
  ['gpt_bigcode', ['GPTBigCodeForCausalLM', GPTBigCodeForCausalLM]],
  ['gpt_neo', ['GPTNeoForCausalLM', GPTNeoForCausalLM]],
  ['gpt_neox', ['GPTNeoXForCausalLM', GPTNeoXForCausalLM]],
  ['codegen', ['CodeGenForCausalLM', CodeGenForCausalLM]],
  ['llama', ['LlamaForCausalLM', LlamaForCausalLM]],
  ['exaone', ['ExaoneForCausalLM', ExaoneForCausalLM]],
  ['olmo', ['OlmoForCausalLM', OlmoForCausalLM]],
  ['olmo2', ['Olmo2ForCausalLM', Olmo2ForCausalLM]],
  ['mobilellm', ['MobileLLMForCausalLM', MobileLLMForCausalLM]],
  ['granite', ['GraniteForCausalLM', GraniteForCausalLM]],
  ['cohere', ['CohereForCausalLM', CohereForCausalLM]],
  ['gemma', ['GemmaForCausalLM', GemmaForCausalLM]],
  ['gemma2', ['Gemma2ForCausalLM', Gemma2ForCausalLM]],
  ['openelm', ['OpenELMForCausalLM', OpenELMForCausalLM]],
  ['qwen2', ['Qwen2ForCausalLM', Qwen2ForCausalLM]],
  ['phi', ['PhiForCausalLM', PhiForCausalLM]],
  ['phi3', ['Phi3ForCausalLM', Phi3ForCausalLM]],
  ['mpt', ['MptForCausalLM', MptForCausalLM]],
  ['opt', ['OPTForCausalLM', OPTForCausalLM]],
  ['mistral', ['MistralForCausalLM', MistralForCausalLM]],
  ['starcoder2', ['Starcoder2ForCausalLM', Starcoder2ForCausalLM]],
  ['falcon', ['FalconForCausalLM', FalconForCausalLM]],
  ['trocr', ['TrOCRForCausalLM', TrOCRForCausalLM]],
  ['stablelm', ['StableLmForCausalLM', StableLmForCausalLM]],

  // Also image-text-to-text
  ['phi3_v', ['Phi3VForCausalLM', Phi3VForCausalLM]],
]);

const MODEL_FOR_MULTIMODALITY_MAPPING_NAMES = new Map([
  ['multi_modality', ['MultiModalityCausalLM', MultiModalityCausalLM]],
]);

const MODEL_FOR_VISION_2_SEQ_MAPPING_NAMES = new Map([
  ['idefics3', ['Idefics3ForConditionalGeneration', Idefics3ForConditionalGeneration]],
]);

const MODEL_FOR_IMAGE_TEXT_TO_TEXT_MAPPING_NAMES = new Map([
  ['llava', ['LlavaForConditionalGeneration', LlavaForConditionalGeneration]],
  ['llava_onevision', ['LlavaOnevisionForConditionalGeneration', LlavaOnevisionForConditionalGeneration]],
  ['moondream1', ['Moondream1ForConditionalGeneration', Moondream1ForConditionalGeneration]],
  ['florence2', ['Florence2ForConditionalGeneration', Florence2ForConditionalGeneration]],
  //   ['qwen2-vl', ['Qwen2VLForConditionalGeneration', Qwen2VLForConditionalGeneration]],
  ['idefics3', ['Idefics3ForConditionalGeneration', Idefics3ForConditionalGeneration]],
  ['paligemma', ['PaliGemmaForConditionalGeneration', PaliGemmaForConditionalGeneration]],
]);

const MODEL_FOR_MASK_GENERATION_MAPPING_NAMES = new Map([['sam', ['SamModel', SamModel]]]);

const MODEL_FOR_CTC_MAPPING_NAMES = new Map([
  ['wav2vec2', ['Wav2Vec2ForCTC', Wav2Vec2ForCTC]],
  ['wav2vec2-bert', ['Wav2Vec2BertForCTC', Wav2Vec2BertForCTC]],
  ['unispeech', ['UniSpeechForCTC', UniSpeechForCTC]],
  ['unispeech-sat', ['UniSpeechSatForCTC', UniSpeechSatForCTC]],
  ['wavlm', ['WavLMForCTC', WavLMForCTC]],
  ['hubert', ['HubertForCTC', HubertForCTC]],
]);

const MODEL_FOR_AUDIO_XVECTOR_MAPPING_NAMES = new Map([['wavlm', ['WavLMForXVector', WavLMForXVector]]]);

const MODEL_FOR_IMAGE_MATTING_MAPPING_NAMES = new Map([
  ['vitmatte', ['VitMatteForImageMatting', VitMatteForImageMatting]],
]);

const MODEL_FOR_TIME_SERIES_PREDICTION_MAPPING_NAMES = new Map([
  ['patchtst', ['PatchTSTForPrediction', PatchTSTModel]],
  ['patchtsmixer', ['PatchTSMixerForPrediction', PatchTSMixerModel]],
]);

const MODEL_FOR_IMAGE_TO_IMAGE_MAPPING_NAMES = new Map([
  ['swin2sr', ['Swin2SRForImageSuperResolution', Swin2SRForImageSuperResolution]],
]);

const MODEL_FOR_POSE_ESTIMATION_MAPPING_NAMES = new Map([
  ['vitpose', ['VitPoseForPoseEstimation', VitPoseForPoseEstimation]],
]);

// NOTE: This is custom to Transformers.js, and is necessary because certain models
// (e.g., CLIP) are split into vision and text components
const MODEL_FOR_IMAGE_FEATURE_EXTRACTION_MAPPING_NAMES = new Map([
  ['clip', ['CLIPVisionModelWithProjection', CLIPVisionModelWithProjection]],
  ['siglip', ['SiglipVisionModel', SiglipVisionModel]],
  ['jina_clip', ['JinaCLIPVisionModel', JinaCLIPVisionModel]],
]);

const MODEL_CLASS_TYPE_MAPPING = [
  [MODEL_MAPPING_NAMES_ENCODER_ONLY, MODEL_TYPES.EncoderOnly],
  [MODEL_MAPPING_NAMES_DECODER_ONLY, MODEL_TYPES.DecoderOnly],
  [MODEL_FOR_SPEECH_SEQ_2_SEQ_MAPPING_NAMES, MODEL_TYPES.Seq2Seq],
  [MODEL_FOR_CAUSAL_LM_MAPPING_NAMES, MODEL_TYPES.DecoderOnly],
  [MODEL_FOR_MULTIMODALITY_MAPPING_NAMES, MODEL_TYPES.MultiModality],
  [MODEL_FOR_VISION_2_SEQ_MAPPING_NAMES, MODEL_TYPES.Vision2Seq],
  [MODEL_FOR_IMAGE_TEXT_TO_TEXT_MAPPING_NAMES, MODEL_TYPES.ImageTextToText],
  [MODEL_FOR_IMAGE_MATTING_MAPPING_NAMES, MODEL_TYPES.EncoderOnly],
  [MODEL_FOR_TIME_SERIES_PREDICTION_MAPPING_NAMES, MODEL_TYPES.EncoderOnly],
  [MODEL_FOR_IMAGE_TO_IMAGE_MAPPING_NAMES, MODEL_TYPES.EncoderOnly],
  [MODEL_FOR_POSE_ESTIMATION_MAPPING_NAMES, MODEL_TYPES.EncoderOnly],
  [MODEL_FOR_MASK_GENERATION_MAPPING_NAMES, MODEL_TYPES.MaskGeneration],
  [MODEL_FOR_CTC_MAPPING_NAMES, MODEL_TYPES.EncoderOnly],
  [MODEL_FOR_TEXT_TO_SPECTROGRAM_MAPPING_NAMES, MODEL_TYPES.Seq2Seq],
  [MODEL_FOR_TEXT_TO_WAVEFORM_MAPPING_NAMES, MODEL_TYPES.EncoderOnly],
  [MODEL_FOR_AUDIO_XVECTOR_MAPPING_NAMES, MODEL_TYPES.EncoderOnly],

  // Custom:
  [MODEL_FOR_IMAGE_FEATURE_EXTRACTION_MAPPING_NAMES, MODEL_TYPES.EncoderOnly],
];

for (const [mappings, type] of MODEL_CLASS_TYPE_MAPPING) {
  // @ts-ignore
  for (const [name, model] of mappings.values()) {
    MODEL_TYPE_MAPPING.set(name, type);
    MODEL_CLASS_TO_NAME_MAPPING.set(model, name);
    MODEL_NAME_TO_CLASS_MAPPING.set(name, model);
  }
}

const CUSTOM_MAPPING = [
  // OVERRIDE:
  // TODO: Refactor to allow class to specify model
  ['MusicgenForConditionalGeneration', MusicgenForConditionalGeneration, MODEL_TYPES.Musicgen],
  ['Phi3VForCausalLM', Phi3VForCausalLM, MODEL_TYPES.Phi3V],

  ['CLIPTextModelWithProjection', CLIPTextModelWithProjection, MODEL_TYPES.EncoderOnly],
  ['SiglipTextModel', SiglipTextModel, MODEL_TYPES.EncoderOnly],
  ['JinaCLIPTextModel', JinaCLIPTextModel, MODEL_TYPES.EncoderOnly],
  ['ClapTextModelWithProjection', ClapTextModelWithProjection, MODEL_TYPES.EncoderOnly],
  ['ClapAudioModelWithProjection', ClapAudioModelWithProjection, MODEL_TYPES.EncoderOnly],
];
for (const [name, model, type] of CUSTOM_MAPPING) {
  MODEL_TYPE_MAPPING.set(name, type);
  MODEL_CLASS_TO_NAME_MAPPING.set(model, name);
  MODEL_NAME_TO_CLASS_MAPPING.set(name, model);
}

/**
 * Helper class which is used to instantiate pretrained models with the `from_pretrained` function.
 * The chosen model class is determined by the type specified in the model config.
 *
 * @example
 * let model = await AutoModel.from_pretrained('Xenova/bert-base-uncased');
 */
export class AutoModel extends PretrainedMixin {
  static MODEL_CLASS_MAPPINGS = MODEL_CLASS_TYPE_MAPPING.map((x) => x[0]) as Map<string, any>[];
  static BASE_IF_FAIL = true;
}

/**
 * Helper class which is used to instantiate pretrained sequence-to-sequence speech-to-text models with the `from_pretrained` function.
 * The chosen model class is determined by the type specified in the model config.
 *
 * @example
 * let model = await AutoModelForSpeechSeq2Seq.from_pretrained('openai/whisper-tiny.en');
 */
export class AutoModelForSpeechSeq2Seq extends PretrainedMixin {
  static MODEL_CLASS_MAPPINGS = [MODEL_FOR_SPEECH_SEQ_2_SEQ_MAPPING_NAMES];
}

/**
 * Helper class which is used to instantiate pretrained sequence-to-sequence text-to-spectrogram models with the `from_pretrained` function.
 * The chosen model class is determined by the type specified in the model config.
 *
 * @example
 * let model = await AutoModelForTextToSpectrogram.from_pretrained('microsoft/speecht5_tts');
 */
export class AutoModelForTextToSpectrogram extends PretrainedMixin {
  static MODEL_CLASS_MAPPINGS = [MODEL_FOR_TEXT_TO_SPECTROGRAM_MAPPING_NAMES];
}

/**
 * Helper class which is used to instantiate pretrained text-to-waveform models with the `from_pretrained` function.
 * The chosen model class is determined by the type specified in the model config.
 *
 * @example
 * let model = await AutoModelForTextToSpectrogram.from_pretrained('facebook/mms-tts-eng');
 */
export class AutoModelForTextToWaveform extends PretrainedMixin {
  static MODEL_CLASS_MAPPINGS = [MODEL_FOR_TEXT_TO_WAVEFORM_MAPPING_NAMES];
}

/**
 * Helper class which is used to instantiate pretrained causal language models with the `from_pretrained` function.
 * The chosen model class is determined by the type specified in the model config.
 *
 * @example
 * let model = await AutoModelForCausalLM.from_pretrained('Xenova/gpt2');
 */
export class AutoModelForCausalLM extends PretrainedMixin {
  static MODEL_CLASS_MAPPINGS = [MODEL_FOR_CAUSAL_LM_MAPPING_NAMES];
}

/**
 * Helper class which is used to instantiate pretrained vision-to-sequence models with the `from_pretrained` function.
 * The chosen model class is determined by the type specified in the model config.
 *
 * @example
 * let model = await AutoModelForVision2Seq.from_pretrained('Xenova/vit-gpt2-image-captioning');
 */
export class AutoModelForVision2Seq extends PretrainedMixin {
  static MODEL_CLASS_MAPPINGS = [MODEL_FOR_VISION_2_SEQ_MAPPING_NAMES];
}

/**
 * Helper class which is used to instantiate pretrained mask generation models with the `from_pretrained` function.
 * The chosen model class is determined by the type specified in the model config.
 *
 * @example
 * let model = await AutoModelForMaskGeneration.from_pretrained('Xenova/sam-vit-base');
 */
export class AutoModelForMaskGeneration extends PretrainedMixin {
  static MODEL_CLASS_MAPPINGS = [MODEL_FOR_MASK_GENERATION_MAPPING_NAMES];
}

export class AutoModelForCTC extends PretrainedMixin {
  static MODEL_CLASS_MAPPINGS = [MODEL_FOR_CTC_MAPPING_NAMES];
}

export class AutoModelForXVector extends PretrainedMixin {
  static MODEL_CLASS_MAPPINGS = [MODEL_FOR_AUDIO_XVECTOR_MAPPING_NAMES];
}

export class AutoModelForImageMatting extends PretrainedMixin {
  static MODEL_CLASS_MAPPINGS = [MODEL_FOR_IMAGE_MATTING_MAPPING_NAMES];
}

export class AutoModelForImageToImage extends PretrainedMixin {
  static MODEL_CLASS_MAPPINGS = [MODEL_FOR_IMAGE_TO_IMAGE_MAPPING_NAMES];
}

export class AutoModelForPoseEstimation extends PretrainedMixin {
  static MODEL_CLASS_MAPPINGS = [MODEL_FOR_POSE_ESTIMATION_MAPPING_NAMES];
}

export class AutoModelForImageFeatureExtraction extends PretrainedMixin {
  static MODEL_CLASS_MAPPINGS = [MODEL_FOR_IMAGE_FEATURE_EXTRACTION_MAPPING_NAMES];
}

//////////////////////////////////////////////////

//////////////////////////////////////////////////
export class Seq2SeqLMOutput extends ModelOutput {
  /**
   * @param {Object} output The output of the model.
   * @param {Tensor} output.logits The output logits of the model.
   * @param {Tensor} output.past_key_values An tensor of key/value pairs that represent the previous state of the model.
   * @param {Tensor} output.encoder_outputs The output of the encoder in a sequence-to-sequence model.
   * @param {Tensor} [output.decoder_attentions] Attentions weights of the decoder, after the attention softmax, used to compute the weighted average in the self-attention heads.
   * @param {Tensor} [output.cross_attentions] Attentions weights of the decoder's cross-attention layer, after the attention softmax, used to compute the weighted average in the cross-attention heads.
   */
  logits: Tensor;
  past_key_values: Tensor;
  encoder_outputs: Tensor;
  decoder_attentions: Tensor | null;
  cross_attentions: Tensor | null;
  constructor({
    logits,
    past_key_values,
    encoder_outputs,
    decoder_attentions = null,
    cross_attentions = null,
  }: {
    logits: Tensor;
    past_key_values: Tensor;
    encoder_outputs: Tensor;
    decoder_attentions: Tensor | null;
    cross_attentions: Tensor | null;
  }) {
    super();
    this.logits = logits;
    this.past_key_values = past_key_values;
    this.encoder_outputs = encoder_outputs;
    this.decoder_attentions = decoder_attentions;
    this.cross_attentions = cross_attentions;
  }
}

/**
 * Base class for outputs of sentence classification models.
 */
export class SequenceClassifierOutput extends ModelOutput {
  /**
   * @param {Object} output The output of the model.
   * @param {Tensor} output.logits classification (or regression if config.num_labels==1) scores (before SoftMax).
   * @param {Record<string, Tensor>} [output.attentions] Object of `torch.FloatTensor` (one for each layer) of shape `(batch_size, num_heads, sequence_length, sequence_length)`.
   * Attentions weights after the attention softmax, used to compute the weighted average in the self-attention heads.
   */
  logits: Tensor;
  attentions: Record<string, Tensor>;
  constructor({ logits, ...attentions }: { logits: Tensor;[key: string]: Tensor }) {
    super();
    this.logits = logits;
    this.attentions = attentions;
  }
}

/**
 * Base class for outputs of XVector models.
 */
export class XVectorOutput extends ModelOutput {
  /**
   * @param {Object} output The output of the model.
   * @param {Tensor} output.logits Classification hidden states before AMSoftmax, of shape `(batch_size, config.xvector_output_dim)`.
   * @param {Tensor} output.embeddings Utterance embeddings used for vector similarity-based retrieval, of shape `(batch_size, config.xvector_output_dim)`.
   */
  logits: Tensor;
  embeddings: Tensor;
  constructor({ logits, embeddings }: { logits: Tensor; embeddings: Tensor }) {
    super();
    this.logits = logits;
    this.embeddings = embeddings;
  }
}

/**
 * Base class for outputs of token classification models.
 */
export class TokenClassifierOutput extends ModelOutput {
  /**
   * @param {Object} output The output of the model.
   * @param {Tensor} output.logits Classification scores (before SoftMax).
   */
  logits: Tensor;
  constructor({ logits }: { logits: Tensor }) {
    super();
    this.logits = logits;
  }
}

/**
 * Base class for masked language models outputs.
 */
export class MaskedLMOutput extends ModelOutput {
  /**
   * @param {Object} output The output of the model.
   * @param {Tensor} output.logits Prediction scores of the language modeling head (scores for each vocabulary token before SoftMax).
   */
  logits: Tensor;
  constructor({ logits }: { logits: Tensor }) {
    super();
    this.logits = logits;
  }
}

/**
 * Base class for outputs of question answering models.
 */
export class QuestionAnsweringModelOutput extends ModelOutput {
  /**
   * @param {Object} output The output of the model.
   * @param {Tensor} output.start_logits Span-start scores (before SoftMax).
   * @param {Tensor} output.end_logits Span-end scores (before SoftMax).
   */
  start_logits: Tensor;
  end_logits: Tensor;
  constructor({ start_logits, end_logits }: { start_logits: Tensor; end_logits: Tensor }) {
    super();
    this.start_logits = start_logits;
    this.end_logits = end_logits;
  }
}

/**
 * Base class for causal language model (or autoregressive) outputs.
 */
export class CausalLMOutput extends ModelOutput {
  /**
   * @param {Object} output The output of the model.
   * @param {Tensor} output.logits Prediction scores of the language modeling head (scores for each vocabulary token before softmax).
   */
  logits: Tensor;
  constructor({ logits }: { logits: Tensor }) {
    super();
    this.logits = logits;
  }
}

/**
 * Base class for causal language model (or autoregressive) outputs.
 */
export class CausalLMOutputWithPast extends ModelOutput {
  /**
   * @param {Object} output The output of the model.
   * @param {Tensor} output.logits Prediction scores of the language modeling head (scores for each vocabulary token before softmax).
   * @param {Tensor} output.past_key_values Contains pre-computed hidden-states (key and values in the self-attention blocks)
   * that can be used (see `past_key_values` input) to speed up sequential decoding.
   */
  logits: Tensor;
  past_key_values: Tensor;
  constructor({ logits, past_key_values }: { logits: Tensor; past_key_values: Tensor }) {
    super();
    this.logits = logits;
    this.past_key_values = past_key_values;
  }
}

export class ImageMattingOutput extends ModelOutput {
  /**
   * @param {Object} output The output of the model.
   * @param {Tensor} output.alphas Estimated alpha values, of shape `(batch_size, num_channels, height, width)`.
   */
  alphas: Tensor;
  constructor({ alphas }: { alphas: Tensor }) {
    super();
    this.alphas = alphas;
  }
}

/**
 * Describes the outputs for the VITS model.
 */
export class VitsModelOutput extends ModelOutput {
  /**
   * @param {Object} output The output of the model.
   * @param {Tensor} output.waveform The final audio waveform predicted by the model, of shape `(batch_size, sequence_length)`.
   * @param {Tensor} output.spectrogram The log-mel spectrogram predicted at the output of the flow model.
   * This spectrogram is passed to the Hi-Fi GAN decoder model to obtain the final audio waveform.
   */
  waveform: Tensor;
  spectrogram: Tensor;
  constructor({ waveform, spectrogram }: { waveform: Tensor; spectrogram: Tensor }) {
    super();
    this.waveform = waveform;
    this.spectrogram = spectrogram;
  }
}
