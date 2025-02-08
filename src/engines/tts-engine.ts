import { StyleTextToSpeech2Model, AutoTokenizer, Tensor } from "../libs/transformers/transformers";
import { ModelConfig } from '../config/models/types';
import { phonemize } from "../libs/transformers/utils/phonemize";
import { getVoiceData, VOICES } from "../libs/transformers/utils/voices";


const STYLE_DIM = 256;
const SAMPLE_RATE = 24000;

export class TTSEngine {
  private model: StyleTextToSpeech2Model | null = null;
  private tokenizer: any = null;

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
      const data = await getVoiceData(voice);
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
}

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

function writeString(view: DataView, offset: number, string: string) {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
} 
