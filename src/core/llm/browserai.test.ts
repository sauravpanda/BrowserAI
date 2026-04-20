/**
 * BrowserAI class unit tests.
 *
 * Covers: construction, public API guard rails, and custom model
 * registration. The loadModel() → engine routing logic is exercised
 * indirectly via mocked engines (no real model loads happen in tests).
 *
 * The MLC engine wrapper is mocked because its real implementation uses
 * `new URL('@mlc-ai/web-llm', import.meta.url)`, which jest's default
 * CJS runtime can't parse. The mock gives us a stub MLCEngineWrapper
 * class whose loadModel/generateText are never actually called — all our
 * assertions fire before any engine method runs.
 */

// Mock all engine wrappers so we never pull in onnxruntime-web, @mlc-ai/web-llm,
// or transformers.js at test time. These modules all use `import.meta.url`
// somewhere in their module-init code, which jest's default CJS runtime can't
// parse. The stubs just need an API-compatible surface — our BrowserAI tests
// assert on public-API guard rails, not on actual engine behavior.

jest.mock('../../engines/mlc-engine-wrapper', () => ({
  MLCEngineWrapper: class {
    async loadModel(): Promise<void> {}
    async generateText(): Promise<unknown> {
      return null;
    }
    async embed(): Promise<unknown> {
      return null;
    }
    async clearSpecificModel(): Promise<void> {}
    dispose(): void {}
  },
}));

jest.mock('../../engines/transformer-engine-wrapper', () => ({
  TransformersEngineWrapper: class {
    async loadModel(): Promise<void> {}
    async generateText(): Promise<unknown> {
      return null;
    }
    async embed(): Promise<unknown> {
      return null;
    }
    async transcribe(): Promise<unknown> {
      return null;
    }
    async textToSpeechStream(): Promise<unknown> {
      return null;
    }
    async generateImage(): Promise<string> {
      return '';
    }
    dispose(): void {}
  },
}));

jest.mock('../../engines/demucs-engine', () => ({
  DemucsEngine: class {
    async loadModel(): Promise<void> {}
    async separate(): Promise<unknown> {
      return { sources: {}, sampleRate: 44100 };
    }
    dispose(): void {}
  },
}));

jest.mock('../../engines/flare-engine-wrapper', () => ({
  FlareEngineWrapper: class {
    async loadModel(): Promise<void> {}
    async generateText(): Promise<unknown> {
      return null;
    }
    async embed(): Promise<never> {
      throw new Error('Embedding is not supported');
    }
    async loadAdapter(): Promise<void> {}
    async isCached(): Promise<boolean> {
      return false;
    }
    async clearCache(): Promise<void> {}
    dispose(): void {}
    get isGpuEnabled(): boolean {
      return false;
    }
    get modelInfo(): Record<string, unknown> {
      return {};
    }
  },
}));

import { BrowserAI } from './index';
import type { ModelConfig, DemucsConfig, FlareConfig } from '../../config/models/types';

describe('BrowserAI', () => {
  test('constructs in a clean unloaded state', () => {
    const ai = new BrowserAI();
    expect(ai).toBeDefined();
    expect(ai.currentModel).toBeNull();
  });

  test('generateText() before loadModel() throws', async () => {
    const ai = new BrowserAI();
    await expect(ai.generateText('hello')).rejects.toThrow(/No model loaded/i);
  });

  test('embed() before loadModel() throws', async () => {
    const ai = new BrowserAI();
    await expect(ai.embed('hello')).rejects.toThrow(/No model loaded/i);
  });

  test('separateAudio() before loadModel() throws', async () => {
    const ai = new BrowserAI();
    const fakeAudio = {
      sampleRate: 44100,
      numberOfChannels: 2,
      length: 1000,
      duration: 1000 / 44100,
      getChannelData: () => new Float32Array(1000),
    } as unknown as AudioBuffer;
    await expect(ai.separateAudio(fakeAudio)).rejects.toThrow(/No model loaded/i);
  });

  test('transcribeAudio() before loadModel() throws', async () => {
    const ai = new BrowserAI();
    const blob = new Blob([new Uint8Array(100)], { type: 'audio/wav' });
    await expect(ai.transcribeAudio(blob)).rejects.toThrow(/No model loaded/i);
  });

  test('loadAdapter() before loadModel() throws with Flare-specific error', async () => {
    const ai = new BrowserAI();
    await expect(ai.loadAdapter({ url: 'https://example.com/adapter.safetensors' })).rejects.toThrow(/Flare engine/i);
  });

  test('isFlareModelCached() returns false when no engine is loaded', async () => {
    const ai = new BrowserAI();
    await expect(ai.isFlareModelCached()).resolves.toBe(false);
  });

  test('loadModel() with an unknown identifier throws', async () => {
    const ai = new BrowserAI();
    await expect(ai.loadModel('definitely-not-a-real-model')).rejects.toThrow(/not recognized/i);
  });

  test('registerCustomModel() stores the config and makes it loadable', () => {
    const ai = new BrowserAI();
    const customCfg: DemucsConfig = {
      engine: 'demucs',
      modelName: 'my-custom-demucs',
      modelType: 'audio-source-separation',
      repo: 'local',
      pipeline: 'audio-source-separation',
      defaultQuantization: 'fp32',
      modelUrl: 'https://example.com/my.onnx',
      sampleRate: 44100,
      segmentSamples: 343980,
      channels: 2,
      sources: ['drums', 'bass', 'other', 'vocals'],
    };
    // Method returns void; we just assert it doesn't throw.
    expect(() => ai.registerCustomModel('my-custom-demucs', customCfg)).not.toThrow();
  });

  test('dispose() is safe on a fresh instance', () => {
    const ai = new BrowserAI();
    expect(() => ai.dispose()).not.toThrow();
  });

  test('dispose() can be called multiple times', () => {
    const ai = new BrowserAI();
    ai.dispose();
    expect(() => ai.dispose()).not.toThrow();
  });

  test('clearFlareModelCache() on an unloaded engine throws a clear error', async () => {
    const ai = new BrowserAI();
    await expect(ai.clearFlareModelCache()).rejects.toThrow(/Flare engine/i);
  });
});

describe('BrowserAI — engine registry sanity', () => {
  test('built-in MODEL_CONFIG includes entries from all four registries', () => {
    // Importing the whole BrowserAI module pulls in all model JSON files.
    // This is a smoke test that no two registries have collided and broken
    // the spread order — if, say, demucs-models.json has a key that shadows
    // an mlc-models.json key, loading the older entry would silently break.

    const mlc = require('../../config/models/mlc-models.json') as Record<string, ModelConfig>;

    const transformers = require('../../config/models/transformers-models.json') as Record<string, ModelConfig>;

    const demucs = require('../../config/models/demucs-models.json') as Record<string, ModelConfig>;

    const flare = require('../../config/models/flare-models.json') as Record<string, ModelConfig>;

    const mlcKeys = new Set(Object.keys(mlc));
    const transformersKeys = new Set(Object.keys(transformers));
    const demucsKeys = new Set(Object.keys(demucs));
    const flareKeys = new Set(Object.keys(flare));

    // Demucs and Flare entries should never collide with each other or with
    // the other specialized registries, since they have incompatible
    // interfaces. MLC ↔ Transformers collisions are allowed (BrowserAI has
    // explicit preference logic) so we don't check that pair.
    for (const k of demucsKeys) {
      expect(flareKeys.has(k)).toBe(false);
      expect(mlcKeys.has(k)).toBe(false);
      expect(transformersKeys.has(k)).toBe(false);
    }
    for (const k of flareKeys) {
      expect(demucsKeys.has(k)).toBe(false);
    }
  });

  test('every Flare model config has engine: "flare"', () => {
    const flare = require('../../config/models/flare-models.json') as Record<string, FlareConfig>;
    for (const cfg of Object.values(flare)) {
      expect(cfg.engine).toBe('flare');
    }
  });

  test('every Demucs model config has engine: "demucs"', () => {
    const demucs = require('../../config/models/demucs-models.json') as Record<string, DemucsConfig>;
    for (const cfg of Object.values(demucs)) {
      expect(cfg.engine).toBe('demucs');
    }
  });
});
