// Dedicated Web Worker that owns the Flare FlareEngine.
//
// The main thread talks to this worker via structured `{id, type, args}`
// messages and receives back either `{id, result}`, `{id, error}`, or
// (for streaming calls) multiple `{id, stream}` messages followed by a
// final `{id, result}`.
//
// Loading Flare on the main thread blocks the UI for the full duration
// of the 138 MB GGUF parse + GPU buffer upload.  Moving it here keeps
// the tab responsive — matches how MLC and Transformers.js already work.

let flareLib = null;
let engine = null;

function reply(id, result) {
  self.postMessage({ id, result });
}

function replyError(id, err) {
  self.postMessage({
    id,
    error: { message: (err && err.message) || String(err), stack: err && err.stack },
  });
}

function replyStream(id, tokenText, tokenId) {
  self.postMessage({ id, stream: { tokenText, tokenId } });
}

self.addEventListener('message', async (e) => {
  const { id, type, args } = e.data || {};
  try {
    await dispatch(id, type, args || {});
  } catch (err) {
    replyError(id, err);
  }
});

async function dispatch(id, type, args) {
  switch (type) {
    case 'init': {
      // Mirrors the main-thread blob-URL trick so the CDN-hosted ES module
      // can be imported without CORS problems and so import.meta.url resolves
      // to the correct wasm file.
      const { jsUrl, wasmUrl, patchImportMeta } = args;
      const resp = await fetch(jsUrl, { cache: 'no-cache' });
      if (!resp.ok) throw new Error(`HTTP ${resp.status} fetching ${jsUrl}`);
      let src = await resp.text();
      if (patchImportMeta) {
        src = src.replaceAll('import.meta.url', JSON.stringify(jsUrl));
        // Workaround for wasm-pack codegen: a JSDoc block contains "/* done */"
        // which prematurely closes the outer /** */ comment.
        src = src.replaceAll('/* done */', '/* done -/');
      }
      const blob = new Blob([src], { type: 'application/javascript' });
      const blobUrl = URL.createObjectURL(blob);
      try {
        flareLib = await import(blobUrl);
      } finally {
        URL.revokeObjectURL(blobUrl);
      }
      await flareLib.default(wasmUrl);
      return reply(id, { ok: true });
    }

    case 'load': {
      if (!flareLib) throw new Error('init must be called before load');
      // `args.bytes` is transferred from the main thread so this is a move,
      // not a copy.
      engine = flareLib.FlareEngine.load(args.bytes);
      return reply(id, { architecture: engine.architecture });
    }

    case 'init_gpu': {
      if (!engine) throw new Error('load must be called before init_gpu');
      const gpuOk = await engine.init_gpu();
      return reply(id, {
        gpuOk,
        backendInfo: JSON.parse(engine.backend_info()),
      });
    }

    case 'enable_prefill_profiling':
      engine.enable_prefill_profiling();
      return reply(id, null);

    case 'disable_prefill_profiling':
      engine.disable_prefill_profiling();
      return reply(id, null);

    case 'prefill_profile_json':
      return reply(id, engine.prefill_profile_json());

    case 'apply_chat_template':
      return reply(id, engine.apply_chat_template(args.userMsg || '', args.systemMsg || ''));

    case 'encode_text':
      return reply(id, Array.from(engine.encode_text(args.text)));

    case 'reset':
      engine.reset();
      return reply(id, null);

    case 'stream': {
      // One-shot streaming: the worker drains every token in a tight loop,
      // posting each decoded chunk immediately.  Since the worker has nothing
      // else to do between tokens, the event loop stays unblocked.
      const {
        promptTokens,
        maxTokens,
        temperature,
        topP,
        topK,
        repeatPenalty,
        minP,
      } = args;
      engine.reset();
      engine.begin_stream_with_params(
        new Uint32Array(promptTokens),
        maxTokens,
        temperature,
        topP,
        topK,
        repeatPenalty,
        minP,
      );
      let count = 0;
      while (!engine.stream_done) {
        const tokId = engine.next_token();
        if (tokId === undefined || tokId === null) break;
        const text = engine.decode_token_chunk(tokId);
        replyStream(id, text, tokId);
        count += 1;
      }
      return reply(id, { done: true, completionTokens: count });
    }

    case 'dispose':
      engine = null;
      return reply(id, null);

    default:
      throw new Error(`unknown message type: ${type}`);
  }
}
