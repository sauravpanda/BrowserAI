import { StyleTextToSpeech2Model, AutoTokenizer, Tensor } from "../libs/transformers/transformers";
import { ModelConfig } from '../config/models/types';
import { phonemize, phonemizeStream } from "../libs/transformers/utils/phonemize";
import { getVoiceData, VOICES } from "../libs/transformers/utils/voices";


const STYLE_DIM = 256;
const SAMPLE_RATE = 24000;

export interface AudioChunk {
  buffer: ArrayBuffer;
  isFirstChunk: boolean;
  metadata?: {
    totalChunks?: number;
    chunkIndex?: number;
  };
}

export class TTSEngine {
  private model: StyleTextToSpeech2Model | null = null;
  private tokenizer: any = null;
  private voiceDataCache: Record<string, Uint8Array> = {};

  constructor() {
    this.model = null;
    this.tokenizer = null;
  }

  async loadModel(modelConfig: ModelConfig, options: any = {}) {
    // console.log('Loading TTS model... ', modelConfig.repo, options);
    try {
      this.model = await StyleTextToSpeech2Model.from_pretrained(modelConfig.repo, {
        progress_callback: options.onProgress,
        dtype: options.dtype || "fp32",
        device:  "webgpu",
      });
      
      this.tokenizer = await AutoTokenizer.from_pretrained(modelConfig.repo, {
        progress_callback: options.onProgress
      });
    } catch (error) {
      console.error('Error loading TTS model:', error);
      throw error;
    }
  }

  /**
   * DEPRECATED: Non-streaming TTS method - kept for reference only
   * All TTS operations should use generateSpeechStream instead
   */
  /*
  async generateSpeech(text: string, options: any = {}): Promise<ArrayBuffer> {
    if (!this.model || !this.tokenizer) {
      throw new Error('TTS model not initialized');
    }

    const { voice = "af", speed = 1 } = options;

    if (!VOICES.hasOwnProperty(voice)) {
      console.error(`Voice "${voice}" not found. Available voices:`);
      console.table(VOICES);
      throw new Error(`Voice "${voice}" not found. Should be one of: ${Object.keys(VOICES).join(", ")}.`);
    }

    try {
      const language = (voice.at(0)); // "a" or "b"
      const phonemes = await phonemize(text, language);
      // console.log('Phonemes:', phonemes); // Debug log

      const { input_ids } = this.tokenizer(phonemes, {
        truncation: true,
      });

      // Select voice style based on number of input tokens
      const num_tokens = Math.min(Math.max(
        input_ids.dims.at(-1) - 2, // Without padding
        0,
      ), 509);

      // Load voice style
      const data = await this.getVoiceDataForStyle(voice);
      const offset = num_tokens * STYLE_DIM;
      const voiceData = data.slice(offset, offset + STYLE_DIM);
    //   console.log('Voice data length:', voiceData.length); // Debug log

      // Prepare model inputs
      const inputs = {
        input_ids: input_ids,
        style: new Tensor("float32", voiceData, [1, STYLE_DIM]),
        speed: new Tensor("float32", [speed], [1]),
      };
    //   console.log('Model inputs prepared'); // Debug log

      // Generate audio
      const output = await this.model._call(inputs);
    //   console.log('Raw audio received:', output);
      
      if (!output || !output.waveform) {
        throw new Error('Model returned null or undefined waveform');
      }
      
      // Convert Tensor to Float32Array and normalize the audio data
      const audioData = new Float32Array(output.waveform.data);
      
      if (audioData.length === 0) {
        throw new Error('Generated audio data is empty');
      }

      // Normalize audio data using a more efficient approach
      const maxValue = audioData.reduce((max, val) => Math.max(max, Math.abs(val)), 0);
      const normalizedData = maxValue > 0 ? 
        new Float32Array(audioData.length) : 
        audioData;
      
      if (maxValue > 0) {
        for (let i = 0; i < audioData.length; i++) {
          normalizedData[i] = audioData[i] / maxValue;
        }
      }

      // Convert Float32Array to Int16Array for WAV format more efficiently
      const int16Array = new Int16Array(normalizedData.length);
      const int16Factor = 0x7FFF;
      for (let i = 0; i < normalizedData.length; i++) {
        const s = normalizedData[i];
        int16Array[i] = s < 0 ? Math.max(-0x8000, s * 0x8000) : Math.min(0x7FFF, s * int16Factor);
      }

      // Create WAV header
      const wavHeader = createWAVHeader({
        numChannels: 1,
        sampleRate: SAMPLE_RATE,
        numSamples: int16Array.length
      });

      // Combine header with audio data
      const wavBytes = new Uint8Array(44 + int16Array.byteLength);
      wavBytes.set(new Uint8Array(wavHeader), 0);
      wavBytes.set(new Uint8Array(int16Array.buffer), 44);

    //   console.log('WAV file size:', wavBytes.length);
    //   console.log('Header size:', wavHeader);
    //   console.log('Audio data size:', int16Array.byteLength);

      return wavBytes.buffer;
    } catch (error) {
      console.error('Detailed error in generateSpeech:', error);
      throw error;
    }
  }
  */
  
  // This method has been deprecated in favor of generateSpeechStream
  async generateSpeech(text: string, options: any = {}): Promise<ArrayBuffer> {
    console.warn('generateSpeech is deprecated - use generateSpeechStream instead');
    
    // Collect all chunks from streaming implementation
    const chunks: ArrayBuffer[] = [];
    let isFirstChunk = true;
    
    for await (const chunk of this.generateSpeechStream(text, options)) {
      if (isFirstChunk) {
        // First chunk contains WAV header
        chunks.push(chunk.buffer);
        isFirstChunk = false;
      } else {
        chunks.push(chunk.buffer);
      }
    }
    
    // Combine all chunks into a single ArrayBuffer
    const totalLength = chunks.reduce((acc, curr) => acc + curr.byteLength, 0);
    const combinedBuffer = new ArrayBuffer(totalLength);
    const view = new Uint8Array(combinedBuffer);
    
    let offset = 0;
    for (const chunk of chunks) {
      view.set(new Uint8Array(chunk), offset);
      offset += chunk.byteLength;
    }
    
    return combinedBuffer;
  }

  /**
   * Generates speech in streaming mode, yielding audio chunks as they're processed
   */
  async *generateSpeechStream(text: string, options: any = {}): AsyncGenerator<AudioChunk> {
    if (!this.model || !this.tokenizer) {
      throw new Error('TTS model not initialized');
    }

    const { voice = "af", speed = 1 } = options;

    if (!VOICES.hasOwnProperty(voice)) {
      console.error(`Voice "${voice}" not found. Available voices:`);
      console.table(VOICES);
      throw new Error(`Voice "${voice}" not found. Should be one of: ${Object.keys(VOICES).join(", ")}.`);
    }

    try {
      const language = voice.at(0); // "a" or "b"
      
      // Pre-load voice data to avoid re-fetching for each chunk
      const voiceData = await this.getVoiceDataForStyle(voice);
      
      // Streaming phonemization
      let chunkIndex = 0;
      const phonemeChunks: string[] = [];
      
      // First pass to collect all phoneme chunks for better chunking decisions
      for await (const phonemeChunk of phonemizeStream(text, language)) {
        if (phonemeChunk.trim().length > 0) {
          phonemeChunks.push(phonemeChunk);
        }
      }
      
      // Process each chunk
      for (let i = 0; i < phonemeChunks.length; i++) {
        const phonemeChunk = phonemeChunks[i];
        
        if (phonemeChunk.trim().length === 0) continue;
        
        // Tokenize the phonemes
        const { input_ids } = this.tokenizer(phonemeChunk, {
          truncation: true,
        });

        // Select voice style based on number of input tokens
        const num_tokens = Math.min(Math.max(
          input_ids.dims.at(-1) - 2, // Without padding
          0,
        ), 509);

        // Slice the appropriate voice style data
        const offset = num_tokens * STYLE_DIM;
        const chunkVoiceData = voiceData.slice(offset, offset + STYLE_DIM);

        // Prepare model inputs
        const inputs = {
          input_ids: input_ids,
          style: new Tensor("float32", chunkVoiceData, [1, STYLE_DIM]),
          speed: new Tensor("float32", [speed], [1]),
        };

        // Generate audio for this chunk
        const output = await this.model._call(inputs);
        
        if (!output || !output.waveform) {
          console.warn('Model returned null or undefined waveform for a chunk, skipping...');
          continue;
        }
        
        // Process audio data
        const audioData = new Float32Array(output.waveform.data);
        
        if (audioData.length === 0) {
          console.warn('Generated audio data is empty for a chunk, skipping...');
          continue;
        }

        // Normalize audio data
        const maxValue = audioData.reduce((max, val) => Math.max(max, Math.abs(val)), 0);
        const normalizedData = maxValue > 0 ? 
          new Float32Array(audioData.length) : 
          audioData;
        
        if (maxValue > 0) {
          for (let j = 0; j < audioData.length; j++) {
            normalizedData[j] = audioData[j] / maxValue;
          }
        }

        // Convert to Int16Array for WAV format
        const int16Array = new Int16Array(normalizedData.length);
        const int16Factor = 0x7FFF;
        for (let j = 0; j < normalizedData.length; j++) {
          const s = normalizedData[j];
          int16Array[j] = s < 0 ? Math.max(-0x8000, s * 0x8000) : Math.min(0x7FFF, s * int16Factor);
        }

        // For the first chunk, include a WAV header
        // For subsequent chunks, just use the raw PCM data
        let audioBuffer: ArrayBuffer;
        const isFirstChunk = i === 0;
        
        if (isFirstChunk) {
          // Create WAV header
          const wavHeader = createWAVHeader({
            numChannels: 1,
            sampleRate: SAMPLE_RATE,
            numSamples: int16Array.length
          });

          // Combine header with audio data
          const wavBytes = new Uint8Array(44 + int16Array.byteLength);
          wavBytes.set(new Uint8Array(wavHeader), 0);
          wavBytes.set(new Uint8Array(int16Array.buffer), 44);
          audioBuffer = wavBytes.buffer;
        } else {
          // Just use the raw PCM data for subsequent chunks
          audioBuffer = int16Array.buffer;
        }

        // Yield this chunk with metadata
        yield {
          buffer: audioBuffer,
          isFirstChunk,
          metadata: {
            chunkIndex: chunkIndex++,
            totalChunks: phonemeChunks.length
          }
        };
      }
    } catch (error) {
      console.error('Error in generateSpeechStream:', error);
      throw error;
    }
  }

  /**
   * Get voice data with caching to avoid repeated fetches
   */
  private async getVoiceDataForStyle(voice: string): Promise<Uint8Array> {
    if (!this.voiceDataCache[voice]) {
      this.voiceDataCache[voice] = await getVoiceData(voice);
    }
    return this.voiceDataCache[voice];
  }
}

/**
 * Creates a WAV header for the given audio parameters
 */
function createWAVHeader({ numChannels, sampleRate, numSamples }: { 
  numChannels: number, 
  sampleRate: number, 
  numSamples: number 
}): ArrayBuffer {
  const buffer = new ArrayBuffer(44);
  const view = new DataView(buffer);

  // "RIFF" chunk descriptor
  writeString(view, 0, 'RIFF');
  // File size (data size + 36 bytes of header)
  view.setUint32(4, 36 + numSamples * 2, true);
  writeString(view, 8, 'WAVE');

  // "fmt " sub-chunk
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true); // fmt chunk size
  view.setUint16(20, 1, true); // audio format (1 for PCM)
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numChannels * 2, true); // byte rate
  view.setUint16(32, numChannels * 2, true); // block align
  view.setUint16(34, 16, true); // bits per sample

  // "data" sub-chunk
  writeString(view, 36, 'data');
  view.setUint32(40, numSamples * 2, true); // data size

  return buffer;
}

/**
 * Helper function to write a string to a DataView at the specified offset
 */
function writeString(view: DataView, offset: number, string: string) {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}
