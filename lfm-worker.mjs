// Liquid AI LFM2 is a language model, not a custom score-adding shader.
// The documented ONNX conversion supports q4 + WebGPU with Transformers.js.
const MODEL = 'onnx-community/LFM2-350M-ONNX';
const REVISION = '1888d143147cd4f17d4b75a60f9bc8a568e2342d'; // 動作検証済みの版に固定
const LIBRARY = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1';
let generator = null, loading = null, running = false, api = null;

async function getGenerator() {
  if (generator) return generator;
  if (loading) return loading;
  loading = (async () => {
    if (!self.navigator.gpu) throw new Error('WebGPUが利用できません');
    self.postMessage({ type:'status', message:'LFM2-350Mのランタイムを取得中' });
    api = await import(LIBRARY);
    self.postMessage({ type:'status', message:'ランタイムOK・重みを取得中' });
    api.env.allowLocalModels = false;
    api.env.useBrowserCache = true;
    // GitHub Pages cannot configure COOP/COEP headers. Keep auxiliary WASM single-threaded.
    try { api.env.backends.onnx.wasm.numThreads = 1; } catch {}
    const loadedFiles = new Map();
    generator = await api.pipeline('text-generation', MODEL, {
      device:'webgpu',
      dtype:'q4',
      revision:REVISION,
      progress_callback: info => {
        if (info.status === 'progress') {
          loadedFiles.set(info.file, { loaded:info.loaded || 0, total:info.total || 0 });
          const items = [...loadedFiles.values()];
          const loaded = items.reduce((sum,f) => sum + f.loaded,0);
          const total = items.reduce((sum,f) => sum + f.total,0);
          self.postMessage({ type:'progress', loaded, progress:total ? loaded / total * 100 : null });
        }
      },
    });
    return generator;
  })();
  try { return await loading; } finally { loading = null; }
}

self.onmessage = async ({ data }) => {
  if (data.type === 'dispose') {
    if (!running && generator) { await generator.dispose(); generator = null; }
    return;
  }
  if (running) return;
  try {
    if (data.type === 'load') {
      await getGenerator();
      self.postMessage({ type:'ready' });
    } else if (data.type === 'generate') {
      running = true;
      const pipe = await getGenerator();
      const streamer = new api.TextStreamer(pipe.tokenizer, {
        skip_prompt:true, skip_special_tokens:true,
        callback_function:text => self.postMessage({ type:'token', id:data.id, text }),
      });
      const output = await pipe(data.messages, {
        max_new_tokens:1000, do_sample:false, repetition_penalty:1.05, streamer,
      });
      const result = output[0].generated_text;
      const text = Array.isArray(result) ? result.at(-1).content : result;
      if (typeof text !== 'string' || !text.trim()) throw new Error('生成結果が空でした');
      self.postMessage({ type:'complete', id:data.id, text });
    }
  } catch (error) {
    self.postMessage({ type:'error', id:data.id, message:String(error.message || error).slice(0,350) });
  } finally { running = false; }
};
