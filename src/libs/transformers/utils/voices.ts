// Some of this code is from https://github.com/hexgrad/kokoro/

export const VOICES = Object.freeze({
  af: {
    // Default voice is a 50-50 mix of Bella & Sarah
    name: "Default",
    language: "en-us",
    gender: "Female",
  },
  af_bella: {
    name: "Bella",
    language: "en-us",
    gender: "Female",
  },
  af_nicole: {
    name: "Nicole",
    language: "en-us",
    gender: "Female",
  },
  af_sarah: {
    name: "Sarah",
    language: "en-us",
    gender: "Female",
  },
  af_sky: {
    name: "Sky",
    language: "en-us",
    gender: "Female",
  },
  am_adam: {
    name: "Adam",
    language: "en-us",
    gender: "Male",
  },
  am_michael: {
    name: "Michael",
    language: "en-us",
    gender: "Male",
  },

  bf_emma: {
    name: "Emma",
    language: "en-gb",
    gender: "Female",
  },
  bf_isabella: {
    name: "Isabella",
    language: "en-gb",
    gender: "Female",
  },
  bm_george: {
    name: "George",
    language: "en-gb",
    gender: "Male",
  },
  bm_lewis: {
    name: "Lewis",
    language: "en-gb",
    gender: "Male",
  },
  hf_alpha: {
    name: "alpha",
    language: "hi",
    gender: "Female",
  },
  hf_beta: {
    name: "beta",
    language: "hi",
    gender: "Female",
  },
  hm_omega: {
    name: "omega",
    language: "hi",
    gender: "Male",
  },
  hm_psi: {
    name: "psi",
    language: "hi",
    gender: "Male",
  },
  ef_dora: {
    name: "dora",
    language: "es",
    gender: "Female",
  },
  em_alex: {
    name: "alex",
    language: "es",
    gender: "Male",
  },
  em_santa: {
    name: "santa",
    language: "es",
    gender: "Male",
  },
  ff_siwis: {
    name: "siwis",
    language: "es",
    gender: "Female",
  },
  jf_alpha: {
    name: "alpha",
    language: "ja",
    gender: "Female",
  },
  jf_gongitsune: {
    name: "gongitsune",
    language: "ja",
    gender: "Female",
  },
  jf_nezumi: {
    name: "nezumi",
    language: "ja",
    gender: "Female",
  },
  jf_tebukuro: {
    name: "tebukuro",
    language: "ja",
    gender: "Female",
  },
  jm_kumo: {
    name: "kumo",
    language: "ja",
    gender: "Male",
  },
  zf_xiaobei: {
    name: "xiaobei",
    language: "zh",
    gender: "Female",
  },
  zf_xiaoni: {
    name: "xiaoni",
    language: "zh",
    gender: "Female",
  },
  zf_xiaoxiao: {
    name: "xiaoxiao",
    language: "zh",
    gender: "Female",
  },
  zf_xiaoyi: {
    name: "xiaoyi",
    language: "zh",
    gender: "Female",
  },
  zm_yunjian: {
    name: "yunjian",
    language: "zh",
    gender: "Male",
  },
  zm_yunxi: {
    name: "yunxi",
    language: "zh",
    gender: "Male",
  },
  zm_yunxia: {
    name: "yunxia",
    language: "zh",
    gender: "Male",
  },
  zm_yunyang: {
    name: "yunyang",
    language: "zh",
    gender: "Male",
  },
});

const VOICE_DATA_URL = "https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX/resolve/main/voices";

/**
 *
 * @param {keyof typeof VOICES} id
 * @returns {Promise<ArrayBufferLike>}
 */
async function getVoiceFile(id: string) {
  const url = `${VOICE_DATA_URL}/${id}.bin`;

  let cache;
  try {
    cache = await caches.open("kokoro-voices");
    const cachedResponse = await cache.match(url);
    if (cachedResponse) {
      return await cachedResponse.arrayBuffer();
    }
  } catch (e) {
    console.warn("Unable to open cache", e);
  }

  // No cache, or cache failed to open. Fetch the file.
  const response = await fetch(url);
  const buffer = await response.arrayBuffer();

  if (cache) {
    try {
      // NOTE: We use `new Response(buffer, ...)` instead of `response.clone()` to handle LFS files
      await cache.put(
        url,
        new Response(buffer, {
          headers: response.headers,
        }),
      );
    } catch (e) {
      console.warn("Unable to cache file", e);
    }
  }

  return buffer;
}

const VOICE_CACHE = new Map();
export async function getVoiceData(voice: any) {
  if (VOICE_CACHE.has(voice)) {
    return VOICE_CACHE.get(voice);
  }

  const buffer = new Float32Array(await getVoiceFile(voice));
  VOICE_CACHE.set(voice, buffer);
  return buffer;
}