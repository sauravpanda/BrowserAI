import { BrowserAI } from 'browserai';

const browserAI = new BrowserAI();

// Load an MLC model
await browserAI.loadModel("Llama-3.1-8B-Instruct", {
  onProgress: (progress) => {
    console.log("MLC Model Loading Progress:", progress);
  }
});

const mlcResponse = await browserAI.generate("Tell me a joke.");
console.log("MLC Response:", mlcResponse);

// Load a Transformers.js model
await browserAI.loadModel("distilbert-sentiment", {
  onProgress: (progress) => {
    console.log("Transformers Model Loading Progress:", progress);
  },
  dtype: 'q4' // Example Transformers-specific option
});

const transformersResponse = await browserAI.generate("This movie was great!");
console.log("Transformers Response:", transformersResponse);