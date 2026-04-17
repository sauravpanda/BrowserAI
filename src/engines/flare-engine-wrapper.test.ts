/**
 * FlareEngineWrapper unit tests. These cover the pure-logic surface of the
 * engine (constructor, dispose, cache-key hashing, error guards) without
 * hitting the @sauravpanda/flare WASM runtime or network — those require a real
 * browser environment and a published @sauravpanda/flare package.
 */

import { FlareEngineWrapper } from './flare-engine-wrapper';
import flareModels from '../config/models/flare-models.json';
import type { FlareConfig, MLCConfig, DemucsConfig } from '../config/models/types';

describe('FlareEngineWrapper', () => {
  test('constructs without throwing and starts in a clean state', () => {
    const engine = new FlareEngineWrapper();
    expect(engine).toBeDefined();
    expect(engine.isGpuEnabled).toBe(false);
    // modelInfo on an unloaded engine returns an empty object rather than throwing
    expect(engine.modelInfo).toEqual({});
  });

  test('generateText() before loadModel() throws a helpful error', async () => {
    const engine = new FlareEngineWrapper();
    await expect(engine.generateText('hello')).rejects.toThrow(/No model loaded/i);
  });

  test('embed() always throws — Flare only supports text generation', async () => {
    const engine = new FlareEngineWrapper();
    await expect(engine.embed('test')).rejects.toThrow(/Embedding is not supported/i);
  });

  test('loadAdapter() before loadModel() throws', async () => {
    const engine = new FlareEngineWrapper();
    await expect(
      engine.loadAdapter({ url: 'https://example.com/adapter.safetensors' }),
    ).rejects.toThrow(/No model loaded/i);
  });

  test('isCached() returns false on a never-loaded engine', async () => {
    const engine = new FlareEngineWrapper();
    await expect(engine.isCached()).resolves.toBe(false);
  });

  test('clearCache() is a no-op on a never-loaded engine', async () => {
    const engine = new FlareEngineWrapper();
    await expect(engine.clearCache()).resolves.toBeUndefined();
  });

  test('dispose() is safe on a never-loaded engine', () => {
    const engine = new FlareEngineWrapper();
    expect(() => engine.dispose()).not.toThrow();
  });

  test('dispose() can be called multiple times', () => {
    const engine = new FlareEngineWrapper();
    engine.dispose();
    expect(() => engine.dispose()).not.toThrow();
  });

  test('loadModel() fails loudly when @sauravpanda/flare is not installed', async () => {
    const engine = new FlareEngineWrapper();
    const cfg: FlareConfig = {
      engine: 'flare',
      modelName: 'test-model',
      modelType: 'text-generation',
      repo: 'test/test',
      pipeline: 'text-generation',
      defaultQuantization: 'Q4_K_M',
      url: 'https://example.com/test.gguf',
    };
    // @sauravpanda/flare isn't installed in the test env, so the dynamic import
    // inside importFlare() should reject with a clear install instruction.
    await expect(engine.loadModel(cfg)).rejects.toThrow(/@sauravpanda\/flare/i);
  });
});

describe('flare-models.json', () => {
  test('registers at least one model', () => {
    const entries = Object.entries(flareModels);
    expect(entries.length).toBeGreaterThan(0);
  });

  test('every entry matches FlareConfig shape', () => {
    const models = flareModels as Record<string, FlareConfig>;
    for (const [key, cfg] of Object.entries(models)) {
      expect(cfg.engine).toBe('flare');
      expect(cfg.modelType).toBe('text-generation');
      expect(cfg.modelName).toBeDefined();
      expect(cfg.repo).toBeDefined();
      expect(cfg.pipeline).toBeDefined();
      expect(cfg.defaultQuantization).toBeDefined();
      // Either an explicit URL or a repo-derived one; at least one must be there.
      // Most registry entries ship a url; we don't require it at the schema level.
      void key;
    }
  });

  test('registered model identifiers do not clash with MLC/Demucs entries', () => {
    // If a model id exists in multiple registries, BrowserAI.loadModel's
    // preference logic has to pick correctly — having a collision between
    // Flare and MLC for the same id is a foot-gun.
    const flareKeys = new Set(Object.keys(flareModels));
    // Intentionally import lazily to avoid the cross-engine tests depending
    // on a specific MLC registry shape.
     
    const mlcModels = require('../config/models/mlc-models.json') as Record<string, MLCConfig>;
     
    const demucsModels = require('../config/models/demucs-models.json') as Record<string, DemucsConfig>;
    for (const k of flareKeys) {
      expect(mlcModels[k]).toBeUndefined();
      expect(demucsModels[k]).toBeUndefined();
    }
  });
});
