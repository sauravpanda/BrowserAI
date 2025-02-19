import { WebWorkerMLCEngineHandler } from "@mlc-ai/web-llm";

console.log('[Worker] Initializing MLC Web Worker');

const handler = new WebWorkerMLCEngineHandler();

// Add error handling and logging
self.onerror = (error) => {
  console.error('[Worker] Error:', error);
};

self.onmessageerror = (error) => {
  console.error('[Worker] Message Error:', error);
};

self.onmessage = (msg) => {
  console.log('[Worker] Received message:', msg.data);
  try {
    handler.onmessage(msg);
  } catch (error) {
    console.error('[Worker] Handler error:', error);
    // Notify main thread of error
    self.postMessage({
      type: 'error',
      error: error.message
    });
  }
};

// Log when handler is ready
console.log('[Worker] MLC Web Worker initialized'); 