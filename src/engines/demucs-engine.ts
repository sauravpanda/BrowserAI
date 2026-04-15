import * as ort from 'onnxruntime-web';
import { DemucsConfig, ModelConfig } from '../config/models/types';

export interface SeparateOptions {
  overlap?: number;
  shifts?: number;
  onProgress?: (progress: { segment: number; total: number; percent: number }) => void;
}

export interface SeparationResult {
  sources: Record<string, AudioBuffer>;
  sampleRate: number;
}

const isDemucsConfig = (c: ModelConfig): c is DemucsConfig => c.engine === 'demucs';

export class DemucsEngine {
  private session: ort.InferenceSession | null = null;
  private config: DemucsConfig | null = null;

  async loadModel(modelConfig: ModelConfig, options: Record<string, unknown> = {}): Promise<void> {
    if (!isDemucsConfig(modelConfig)) {
      throw new Error('DemucsEngine requires a model config with engine: "demucs"');
    }
    this.config = modelConfig;

    const onProgress = options.onProgress as ((p: { progress: number }) => void) | undefined;
    const modelBuffer = await this.fetchModel(modelConfig.modelUrl, onProgress);

    const providers = (options.executionProviders as ('webgpu' | 'wasm')[] | undefined) ??
      modelConfig.executionProviders ?? ['webgpu', 'wasm'];

    this.session = await ort.InferenceSession.create(modelBuffer, {
      executionProviders: providers,
      graphOptimizationLevel: 'all',
    });
  }

  async separate(audio: AudioBuffer, options: SeparateOptions = {}): Promise<SeparationResult> {
    if (!this.session || !this.config) {
      throw new Error('Demucs model not loaded. Call loadModel first.');
    }

    const cfg = this.config;
    const overlap = options.overlap ?? 0.25;
    const shifts = Math.max(1, options.shifts ?? 1);
    const resampled = await this.toTargetRate(audio, cfg.sampleRate, cfg.channels);
    const channels = this.toInterleavedChannels(resampled, cfg.channels);
    const totalSamples = resampled.length;

    // NOTE: this engine assumes the ONNX graph bakes in Demucs' input
    // normalization and output denormalization (verified true for
    // smank/htdemucs-onnx — see ReduceMean(mix) at the input and
    // Mul(..., sqrt_var) + Add(..., mean) at the output). If you plug in
    // an export of HTDemucs.forward() without the apply_model() wrapper,
    // you'll need to add external mean/std handling here or the stems
    // will be scale-wrong.

    const numSources = cfg.sources.length;
    const accumulated = new Array(numSources)
      .fill(null)
      .map(() => new Array(cfg.channels).fill(null).map(() => new Float32Array(totalSamples)));

    const maxShift = Math.floor(0.5 * cfg.sampleRate);
    let segmentCounter = 0;
    const segmentsPerShift = this.countSegments(totalSamples, cfg.segmentSamples, overlap);
    const totalSegments = segmentsPerShift * shifts;

    for (let shiftIdx = 0; shiftIdx < shifts; shiftIdx++) {
      const shiftOffset = shifts === 1 ? 0 : Math.floor(Math.random() * maxShift);
      const shifted = this.applyShift(channels, totalSamples, shiftOffset, cfg.channels);
      const stems = await this.runSplit(shifted, totalSamples, overlap, (segIdx, segTotal) => {
        segmentCounter++;
        options.onProgress?.({
          segment: segmentCounter,
          total: totalSegments,
          percent: (segmentCounter / totalSegments) * 100,
        });
        void segIdx;
        void segTotal;
      });
      for (let s = 0; s < numSources; s++) {
        for (let c = 0; c < cfg.channels; c++) {
          const src = stems[s][c];
          const dst = accumulated[s][c];
          for (let n = shiftOffset; n < totalSamples; n++) {
            dst[n - shiftOffset] += src[n];
          }
        }
      }
      void shiftIdx;
    }

    const invShifts = 1 / shifts;
    // eslint-disable-next-line no-console
    console.log('[DemucsEngine] post overlap-add stem stats:');
    for (let s = 0; s < numSources; s++) {
      for (let c = 0; c < cfg.channels; c++) {
        const chan = accumulated[s][c];
        let sum = 0, sumSq = 0, minV = Infinity, maxV = -Infinity, nanCount = 0;
        for (let n = 0; n < totalSamples; n++) {
          const v = chan[n] * invShifts;
          if (!Number.isFinite(v)) { nanCount++; continue; }
          sum += v; sumSq += v * v;
          if (v < minV) minV = v;
          if (v > maxV) maxV = v;
        }
        const mean = sum / totalSamples;
        const std = Math.sqrt(Math.max(0, sumSq / totalSamples - mean * mean));
        // eslint-disable-next-line no-console
        console.log(
          `  ${cfg.sources[s]} ch${c}: mean=${mean.toFixed(5)} std=${std.toFixed(5)} ` +
            `min=${minV.toFixed(3)} max=${maxV.toFixed(3)} nan=${nanCount}`,
        );
      }
    }
    const sourceBuffers: Record<string, AudioBuffer> = {};
    for (let s = 0; s < numSources; s++) {
      // Use the AudioBuffer constructor directly so we don't have to create
      // (and then tear down) an AudioContext just to allocate a buffer. Some
      // browsers return invalid-looking channel data from buffers whose
      // owning AudioContext was closed right after copyToChannel — avoiding
      // a context sidesteps that entire class of problem.
      const buffer = new AudioBuffer({
        length: totalSamples,
        numberOfChannels: cfg.channels,
        sampleRate: cfg.sampleRate,
      });
      for (let c = 0; c < cfg.channels; c++) {
        const chan = accumulated[s][c];
        if (invShifts !== 1) {
          for (let n = 0; n < totalSamples; n++) chan[n] *= invShifts;
        }
        buffer.copyToChannel(chan, c);
      }
      sourceBuffers[cfg.sources[s]] = buffer;
    }

    return { sources: sourceBuffers, sampleRate: cfg.sampleRate };
  }

  private async runSplit(
    channels: Float32Array[],
    totalSamples: number,
    overlap: number,
    onSegment: (segIdx: number, segTotal: number) => void,
  ): Promise<Float32Array[][]> {
    const cfg = this.config!;
    const segment = cfg.segmentSamples;
    const stride = Math.max(1, Math.floor(segment * (1 - overlap)));
    const weight = this.buildTransitionWindow(segment);
    const numSources = cfg.sources.length;

    const stems = new Array(numSources)
      .fill(null)
      .map(() => new Array(cfg.channels).fill(null).map(() => new Float32Array(totalSamples)));
    const weightSum = new Float32Array(totalSamples);

    const segmentStarts: number[] = [];
    for (let start = 0; start < totalSamples; start += stride) {
      segmentStarts.push(start);
      if (start + segment >= totalSamples) break;
    }

    const inputName = this.session!.inputNames[0];
    const outputName = this.session!.outputNames[0];

    for (let idx = 0; idx < segmentStarts.length; idx++) {
      const start = segmentStarts[idx];
      const chunk = this.extractChunk(channels, cfg.channels, start, segment, totalSamples);
      const input = new ort.Tensor('float32', chunk, [1, cfg.channels, segment]);
      const result = await this.session!.run({ [inputName]: input });
      const outputTensor = result[outputName];
      const outData = outputTensor.data as Float32Array;
      if (idx === 0) {
        let sum = 0, sumSq = 0, minV = Infinity, maxV = -Infinity;
        for (let i = 0; i < outData.length; i++) {
          const v = outData[i];
          sum += v; sumSq += v * v;
          if (v < minV) minV = v;
          if (v > maxV) maxV = v;
        }
        const mean = sum / outData.length;
        const std = Math.sqrt(Math.max(0, sumSq / outData.length - mean * mean));
        // eslint-disable-next-line no-console
        console.log(
          `[DemucsEngine] seg0 raw stats mean=${mean.toFixed(4)} std=${std.toFixed(4)} ` +
            `min=${minV.toFixed(3)} max=${maxV.toFixed(3)} dims=[${outputTensor.dims}]`,
        );
      }
      for (let s = 0; s < numSources; s++) {
        for (let c = 0; c < cfg.channels; c++) {
          const base = (s * cfg.channels + c) * segment;
          const target = stems[s][c];
          for (let n = 0; n < segment; n++) {
            const absolute = start + n;
            if (absolute >= totalSamples) break;
            target[absolute] += outData[base + n] * weight[n];
          }
        }
      }
      for (let n = 0; n < segment; n++) {
        const absolute = start + n;
        if (absolute >= totalSamples) break;
        weightSum[absolute] += weight[n];
      }
      onSegment(idx + 1, segmentStarts.length);
      await new Promise((r) => setTimeout(r, 0));
    }

    {
      let minW = Infinity, maxW = -Infinity;
      for (let n = 0; n < totalSamples; n++) {
        const w = weightSum[n];
        if (w < minW) minW = w;
        if (w > maxW) maxW = w;
      }
      // eslint-disable-next-line no-console
      console.log(
        `[DemucsEngine] weightSum range: min=${minW.toExponential(3)} max=${maxW.toExponential(3)} ` +
          `segments=${segmentStarts.length}`,
      );
    }

    for (let s = 0; s < numSources; s++) {
      for (let c = 0; c < cfg.channels; c++) {
        const target = stems[s][c];
        for (let n = 0; n < totalSamples; n++) {
          const w = weightSum[n];
          if (w > 1e-8) target[n] /= w;
        }
      }
    }
    return stems;
  }

  private countSegments(totalSamples: number, segment: number, overlap: number): number {
    const stride = Math.max(1, Math.floor(segment * (1 - overlap)));
    let count = 0;
    for (let start = 0; start < totalSamples; start += stride) {
      count++;
      if (start + segment >= totalSamples) break;
    }
    return count;
  }

  private applyShift(
    channels: Float32Array[],
    length: number,
    shift: number,
    numCh: number,
  ): Float32Array[] {
    if (shift === 0) return channels;
    const out: Float32Array[] = [];
    for (let c = 0; c < numCh; c++) {
      const src = channels[c];
      const dst = new Float32Array(length);
      for (let n = 0; n < length - shift; n++) dst[n + shift] = src[n];
      out.push(dst);
    }
    return out;
  }

  dispose(): void {
    this.session?.release();
    this.session = null;
    this.config = null;
  }

  private async fetchModel(
    url: string,
    onProgress?: (p: { progress: number }) => void,
  ): Promise<Uint8Array> {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Failed to fetch Demucs model: ${response.status} ${response.statusText}`);
    const total = Number(response.headers.get('content-length')) || 0;
    if (!response.body || !onProgress || !total) {
      return new Uint8Array(await response.arrayBuffer());
    }
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let received = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      received += value.length;
      onProgress({ progress: (received / total) * 100 });
    }
    const merged = new Uint8Array(received);
    let offset = 0;
    for (const chunk of chunks) {
      merged.set(chunk, offset);
      offset += chunk.length;
    }
    return merged;
  }

  private async toTargetRate(audio: AudioBuffer, targetRate: number, channels: number): Promise<AudioBuffer> {
    if (audio.sampleRate === targetRate && audio.numberOfChannels === channels) return audio;
    const length = Math.ceil((audio.duration * targetRate));
    const offline = new OfflineAudioContext(channels, length, targetRate);
    const src = offline.createBufferSource();
    const srcBuffer = offline.createBuffer(
      Math.max(audio.numberOfChannels, 1),
      audio.length,
      audio.sampleRate,
    );
    for (let c = 0; c < audio.numberOfChannels; c++) {
      srcBuffer.copyToChannel(audio.getChannelData(c), c);
    }
    src.buffer = srcBuffer;
    src.connect(offline.destination);
    src.start();
    return await offline.startRendering();
  }

  private toInterleavedChannels(audio: AudioBuffer, channels: number): Float32Array[] {
    const out: Float32Array[] = [];
    for (let c = 0; c < channels; c++) {
      if (c < audio.numberOfChannels) {
        out.push(audio.getChannelData(c).slice());
      } else {
        out.push(audio.getChannelData(0).slice());
      }
    }
    return out;
  }

  private extractChunk(
    stereo: Float32Array[],
    channels: number,
    start: number,
    segment: number,
    totalSamples: number,
  ): Float32Array {
    const out = new Float32Array(channels * segment);
    for (let c = 0; c < channels; c++) {
      const src = stereo[c];
      const dstOffset = c * segment;
      for (let n = 0; n < segment; n++) {
        const idx = start + n;
        out[dstOffset + n] = idx < totalSamples ? src[idx] : 0;
      }
    }
    return out;
  }

  // Demucs-style trapezoidal transition weight (see demucs/apply.py).
  // Rises 1..half, then falls half..1. transition_power=1.
  private buildTransitionWindow(length: number): Float32Array {
    const half = Math.floor(length / 2);
    const w = new Float32Array(length);
    for (let i = 0; i < half; i++) w[i] = i + 1;
    for (let i = 0; i < length - half; i++) w[half + i] = length - half - i;
    let max = 0;
    for (let i = 0; i < length; i++) if (w[i] > max) max = w[i];
    if (max > 0) {
      for (let i = 0; i < length; i++) w[i] /= max;
    }
    return w;
  }
}
