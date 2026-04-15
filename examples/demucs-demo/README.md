# Demucs Demo

Runs [Demucs](https://github.com/facebookresearch/demucs) source separation fully in the browser via BrowserAI + onnxruntime-web.

The demo loads `DemucsEngine` from a small standalone bundle at `dist/demucs.mjs` (~7 KB) and pulls `onnxruntime-web` from jsDelivr via an import map. It does **not** import the full BrowserAI bundle — that one has node-only imports (`fs`, `path`) and can't be loaded directly in a browser; it's meant for bundler consumers.

## Run

```bash
# from the repo root
npm install
npm run build
npx serve .
```

Then open `http://localhost:3000/examples/demucs-demo/` and:

1. Click **Load htdemucs** — downloads the ONNX model (~80MB, cached by the browser after first load).
2. Pick an audio file (mp3, wav, m4a, …).
3. Click **Separate** — produces four stems: `drums`, `bass`, `other`, `vocals`, each playable and downloadable.

## Model source

The default entry in `src/config/models/demucs-models.json` points at [`smank/htdemucs-onnx`](https://huggingface.co/smank/htdemucs-onnx) (verified: single input `mix [1, 2, samples]` → single output `sources [1, 4, 2, samples]`, opset 17, STFT baked in). It's ~290 MB fp32. If you want a different checkpoint:

```js
import { BrowserAI } from "@browserai/browserai";

const ai = new BrowserAI();
ai.registerCustomModel("htdemucs", {
  engine: "demucs",
  modelName: "htdemucs",
  modelType: "audio-source-separation",
  repo: "local",
  pipeline: "audio-source-separation",
  defaultQuantization: "fp32",
  modelUrl: "https://your-host/htdemucs.onnx",
  sampleRate: 44100,
  segmentSamples: 343980,
  channels: 2,
  sources: ["drums", "bass", "other", "vocals"],
  executionProviders: ["webgpu", "wasm"],
});
await ai.loadModel("htdemucs");
```

## Converting your own checkpoint

If you want a clean, in-house ONNX export from Facebook's Demucs checkpoints, the typical path is:

```bash
pip install demucs onnx torch
python -c "
import torch
from demucs.pretrained import get_model
model = get_model('htdemucs').models[0].eval()
dummy = torch.zeros(1, 2, 343980)
torch.onnx.export(model, dummy, 'htdemucs.onnx', opset_version=17,
                  input_names=['mix'], output_names=['stems'],
                  dynamic_axes={'mix': {2: 'samples'}, 'stems': {3: 'samples'}})
"
```

Note: htdemucs includes an STFT branch that may need custom ONNX ops depending on the Demucs version. Verify that the export has input shape `[1, 2, N]` and output shape `[1, 4, 2, N]` before plugging it in.

## Performance

- Uses WebGPU when available, falls back to WASM.
- Processes audio in ~7.8-second segments with 25% overlap and Hann windowing.
- Expect several seconds per segment on CPU fallback; much faster with WebGPU.
