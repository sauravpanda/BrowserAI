/**
 * DemucsEngine unit tests. These exercise the pure-logic surface of the
 * engine (constructor, config validation, guard rails) without touching
 * ORT sessions or network I/O — that side of things needs a real browser
 * environment with onnxruntime-web's WASM/WebGPU backends and is covered
 * by the manual demo.
 *
 * The tests run in jest's default jsdom env because the engine source
 * statically imports `onnxruntime-web`, which peeks at `navigator` and
 * other browser globals at module load time.
 */

import { DemucsEngine } from './demucs-engine';
import demucsModels from '../config/models/demucs-models.json';
import type { DemucsConfig, MLCConfig, TransformersConfig } from '../config/models/types';

describe('DemucsEngine', () => {
  test('constructs without throwing', () => {
    expect(() => new DemucsEngine()).not.toThrow();
  });

  test('separate() before loadModel() throws a helpful error', async () => {
    const engine = new DemucsEngine();
    // Provide a minimal fake AudioBuffer shape — the method should reject
    // before ever touching it.
    const fakeAudio = {
      sampleRate: 44100,
      numberOfChannels: 2,
      length: 1000,
      duration: 1000 / 44100,
      getChannelData: () => new Float32Array(1000),
    } as unknown as AudioBuffer;
    await expect(engine.separate(fakeAudio)).rejects.toThrow(/not loaded/i);
  });

  test('loadModel() rejects a non-demucs model config', async () => {
    const engine = new DemucsEngine();
    const badConfig: MLCConfig = {
      engine: 'mlc',
      modelName: 'llama-3.2-1b-instruct',
      modelType: 'text-generation',
      repo: 'some/repo',
      pipeline: 'text-generation',
      defaultQuantization: 'q4',
    };
    await expect(engine.loadModel(badConfig)).rejects.toThrow(/engine: "demucs"/);
  });

  test('loadModel() rejects a transformers-engine config', async () => {
    const engine = new DemucsEngine();
    const badConfig: TransformersConfig = {
      engine: 'transformers',
      modelName: 'whisper-tiny',
      modelType: 'automatic-speech-recognition',
      repo: 'some/repo',
      pipeline: 'automatic-speech-recognition',
      defaultQuantization: 'q4',
    };
    await expect(engine.loadModel(badConfig)).rejects.toThrow(/engine: "demucs"/);
  });

  test('dispose() is safe on a never-loaded engine', () => {
    const engine = new DemucsEngine();
    expect(() => engine.dispose()).not.toThrow();
  });
});

describe('demucs-models.json', () => {
  test('ships an htdemucs entry that matches DemucsConfig shape', () => {
    const htdemucs = (demucsModels as Record<string, DemucsConfig>).htdemucs;
    expect(htdemucs).toBeDefined();
    expect(htdemucs.engine).toBe('demucs');
    expect(htdemucs.modelType).toBe('audio-source-separation');
    expect(htdemucs.pipeline).toBe('audio-source-separation');
  });

  test('htdemucs entry has a valid-looking modelUrl', () => {
    const htdemucs = (demucsModels as Record<string, DemucsConfig>).htdemucs;
    expect(htdemucs.modelUrl).toMatch(/^https?:\/\//);
    expect(htdemucs.modelUrl).toMatch(/\.onnx(\?|$)/);
  });

  test('htdemucs sample rate is 44100 and segment is 7.8s worth of samples', () => {
    const htdemucs = (demucsModels as Record<string, DemucsConfig>).htdemucs;
    expect(htdemucs.sampleRate).toBe(44100);
    expect(htdemucs.channels).toBe(2);
    // htdemucs was trained on 7.8s segments at 44.1 kHz: 7.8 * 44100 = 343,980
    expect(htdemucs.segmentSamples).toBe(343980);
  });

  test('htdemucs sources are exactly the 4 Demucs stems in canonical order', () => {
    const htdemucs = (demucsModels as Record<string, DemucsConfig>).htdemucs;
    // Source order matters — it's the output-channel dimension of the ONNX
    // graph, and swapping them silently mislabels stems. smank/htdemucs-onnx
    // was exported with [drums, bass, other, vocals].
    expect(htdemucs.sources).toEqual(['drums', 'bass', 'other', 'vocals']);
  });

  test('htdemucs declares webgpu as a preferred execution provider', () => {
    const htdemucs = (demucsModels as Record<string, DemucsConfig>).htdemucs;
    expect(htdemucs.executionProviders).toBeDefined();
    expect(htdemucs.executionProviders).toContain('webgpu');
    expect(htdemucs.executionProviders).toContain('wasm');
  });
});
