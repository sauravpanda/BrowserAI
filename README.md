<div align="center">

# BrowserAI 🚀

### Run Production-Ready LLMs Directly in Your Browser

<p align="center">
  <strong>Simple • Fast • Private • Open Source</strong>
</p>

[Live Demo](https://chat.browserai.dev) •
[Documentation](https://docs.browserai.dev) •
[Discord Community](https://discord.gg/6qfmtSUMdb)

<img src="https://img.youtube.com/vi/BoxYT6SU7PQ/0.jpg" alt="BrowserAI Demo" width="600"/>

</div>

## 🌟 Live Demos

| Demo | Description | Try It |
|------|-------------|--------|
| **Chat** | Multi-model chat interface | [chat.browserai.dev](https://chat.browserai.dev) |
| **Voice Chat** | Full-featured with speech recognition & TTS | [voice-demo.browserai.dev](https://voice-demo.browserai.dev) |
| **Text-to-Speech** | Powered by Kokoro 82M | [tts-demo.browserai.dev](https://tts-demo.browserai.dev) |

## ⚡ Key Features

- 🔒 **100% Private**: All processing happens locally in your browser
- 🚀 **WebGPU Accelerated**: Near-native performance
- 💰 **Zero Server Costs**: No complex infrastructure needed
- 🌐 **Offline Capable**: Works without internet after initial download
- 🎯 **Developer Friendly**: Simple sdk with multiple engine support
- 📦 **Production Ready**: Pre-optimized popular models

## 🎯 Perfect For

- Web developers building AI-powered applications
- Companies needing privacy-conscious AI solutions
- Researchers experimenting with browser-based AI
- Hobbyists exploring AI without infrastructure overhead

## ✨ Features

- 🎯 Run AI models directly in the browser - no server required!
- ⚡ WebGPU acceleration for blazing fast inference
- 🔄 Seamless switching between MLC and Transformers engines
- 📦 Pre-configured popular models ready to use
- 🛠️ Easy-to-use API for text generation and more


## 🚀 Quick Start
```bash
npm install @browserai/browserai
```

OR 
```bash
yarn add @browserai/browserai
```

### Basic Usage

```javascript
import { BrowserAI } from '@browserai/browserai';

const browserAI = new BrowserAI();

browserAI.loadModel('llama-3.2-1b-instruct');

const response = await browserAI.generateText('Hello, how are you?');
console.log(response);
```


## 📚 Examples

### Text Generation with Custom Parameters
```javascript
const ai = new BrowserAI();
await ai.loadModel('llama-3.2-1b-instruct', {
  quantization: 'q4f16_1' // Optimize for size/speed
});

const response = await ai.generateText('Write a short poem about coding', {
  temperature: 0.8,
  maxTokens: 100
});
```

### Chat with System Prompt
```javascript
const ai = new BrowserAI();
await ai.loadModel('gemma-2b-it');

const response = await ai.generateText([
  { role: 'system', content: 'You are a helpful assistant.' },
  { role: 'user', content: 'What is WebGPU?' }
]);
```

### Speech Recognition
```javascript
const ai = new BrowserAI();
await ai.loadModel('whisper-tiny-en');

// Using the built-in recorder
await ai.startRecording();
const audioBlob = await ai.stopRecording();
const transcription = await ai.transcribeAudio(audioBlob);
```

### Text-to-Speech
```javascript
const ai = new BrowserAI();
await ai.loadModel('kokoro-tts');
const audioBuffer = await ai.textToSpeech('Hello, how are you today?');
// Play the audio using Web Audio API
const audioContext = new AudioContext();
const source = audioContext.createBufferSource();
audioContext.decodeAudioData(audioBuffer, (buffer) => {
  source.buffer = buffer;
  source.connect(audioContext.destination);
  source.start(0);
});
```

## 🔧 Supported Models

More models will be added soon. Request a model by creating an issue.

### MLC Models
- Llama-3.2-1b-Instruct
- SmolLM2-135M-Instruct
- SmolLM2-360M-Instruct
- SmolLM2-1.7B-Instruct
- Qwen-0.5B-Instruct
- Gemma-2B-IT
- TinyLlama-1.1B-Chat-v0.4
- Phi-3.5-mini-instruct
- Qwen2.5-1.5B-Instruct
- DeepSeek-R1-Distill-Qwen-7B
- DeepSeek-R1-Distill-Llama-8B
- Snowflake-Arctic-Embed-M-B32
- Snowflake-Arctic-Embed-S-B32
- Snowflake-Arctic-Embed-M-B4
- Snowflake-Arctic-Embed-S-B4

### Transformers Models
- Llama-3.2-1b-Instruct
- Whisper-tiny-en (Speech Recognition)
- Kokoro-TTS (Text-to-Speech)

## 🗺️ Enhanced Roadmap

### Phase 1: Foundation
- 🎯 Simplified model initialization
- 📊 Basic monitoring and metrics
- 🔍 Simple RAG implementation
- 🛠️ Developer tools integration

### Phase 2: Advanced Features
- 📚 Enhanced RAG capabilities
  - Hybrid search
  - Auto-chunking
  - Source tracking
- 📊 Advanced observability
  - Performance dashboards
  - Memory profiling
  - Error tracking

### Phase 3: Enterprise Features
- 🔐 Security features
- 📈 Advanced analytics
- 🤝 Multi-model orchestration

## 🤝 Contributing

We welcome contributions! Feel free to:

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- [MLC AI](https://github.com/mlc-ai/mlc-llm) for their incredible mode compilation library and support for webgpu runtime and xgrammar
- [Hugging Face](https://huggingface.co/) and [Xenova](https://github.com/xenova) for their Transformers.js library, licensed under Apache License 2.0. The original code has been modified to work in a browser environment and converted to TypeScript.
- All our contributors and supporters!

---

<p align="center">Made with ❤️ for the AI community</p>

## 🚀 Requirements

- Modern browser with WebGPU support (Chrome 113+, Edge 113+, or equivalent)
- For models with `shader-f16` requirement, hardware must support 16-bit floating point operations
