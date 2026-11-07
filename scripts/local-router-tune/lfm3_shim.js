// LFM3-1.7B (ONNX, q4f16) behind the web-llm engine surface webgpuClient uses, for
// browser_eval.mjs only. Nothing in src/ imports it.
//
// browser_eval serves this file and Transformers.js 4.3.2 under /__lfm3/ (same origin, so
// the app's CSP holds) and swaps it in as webgpuClient's engine. The app's own code then
// builds every prompt: strategicPrompt through generateContent, and the advisory rubric
// through scoreNextToken. Only inference differs from a Qwen run.
//
// Transformers.js loads the weights and creates the WebGPU session; this file drives the
// session itself, because Liquid's card says WebGPU prefill must go in chunks of at most
// 256 tokens and Transformers.js prefills the whole prompt in one step.
import { AutoModelForCausalLM, AutoTokenizer, Tensor, env } from './transformers.min.js';

export const LFM3_REPO = 'LiquidAI/LFM3-1.7B-ONNX';
export const LFM3_REVISION = '57c125dfa29f2d39157e280b1d1f7480b8736d8d';
const STOP_IDS = new Set([124900, 124893]); // <|im_end|>, <|pad|>
const IM_END = '<|im_end|>';

function halfToFloat(h) {
  const s = (h & 0x8000) >> 15;
  const e = (h & 0x7c00) >> 10;
  const f = h & 0x03ff;
  if (e === 0) return (s ? -1 : 1) * 2 ** -14 * (f / 1024);
  if (e === 31) return f ? NaN : (s ? -1 : 1) * Infinity;
  return (s ? -1 : 1) * 2 ** (e - 15) * (1 + f / 1024);
}

function lastRow(tensor) {
  const vocab = tensor.dims[tensor.dims.length - 1];
  const data = tensor.data;
  const start = data.length - vocab;
  const out = new Float32Array(vocab);
  if (data instanceof Uint16Array)
    for (let i = 0; i < vocab; i++) out[i] = halfToFloat(data[start + i]);
  else for (let i = 0; i < vocab; i++) out[i] = Number(data[start + i]);
  return out;
}

export async function createLfm3Engine({
  dtype = 'q4f16',
  chunk = 256,
  queueTokens,
  // Liquid's recommended sampling (card: temperature 0.1, top_k 50, repetition_penalty 1.1),
  // applied to any request that arrives at exactly this temperature.
  recommendedAt = 0.1,
  onProgress,
} = {}) {
  env.allowLocalModels = false;
  env.backends.onnx.wasm.wasmPaths = new URL('./', import.meta.url).href;
  const tokenizer = await AutoTokenizer.from_pretrained(LFM3_REPO, { revision: LFM3_REVISION });
  const model = await AutoModelForCausalLM.from_pretrained(LFM3_REPO, {
    revision: LFM3_REVISION,
    dtype,
    device: 'webgpu',
    progress_callback: onProgress,
  });
  const session = model.sessions.model;
  const inputNames = session.inputNames;
  const meta = Object.fromEntries((session.inputMetadata ?? []).map((m) => [m.name, m]));
  const pastNames = inputNames.filter((n) => n.startsWith('past'));
  const keepName = inputNames.find((n) => n === 'logits_to_keep' || n === 'num_logits_to_keep');
  const presentFor = (past) =>
    past.startsWith('past_key_values.')
      ? past.replace('past_key_values.', 'present.')
      : past.replace('past_conv.', 'present_conv.');

  const ort = (type, data, dims) => new Tensor(type, data, dims).ort_tensor;
  const emptyCache = () => {
    const cache = {};
    for (const name of pastNames) {
      const m = meta[name];
      if (!m?.shape) throw new Error(`no metadata for ${name}`);
      const dims = m.shape.map((d) => (typeof d === 'number' ? d : /batch/i.test(d) ? 1 : 0));
      const size = dims.reduce((a, b) => a * b, 1);
      const type = m.type ?? 'float16';
      cache[name] = ort(
        type,
        type === 'float16' ? new Uint16Array(size) : new Float32Array(size),
        dims
      );
    }
    return cache;
  };
  const dispose = (cache) => {
    for (const t of Object.values(cache)) if (t?.location === 'gpu-buffer') t.dispose?.();
  };

  /** Feed `ids` after `state` (len tokens already cached); returns the last position's logits. */
  async function feed(ids, state, chunkSize = chunk) {
    let logits = null;
    for (let at = 0; at < ids.length; at += chunkSize) {
      const part = ids.slice(at, at + chunkSize);
      const n = part.length;
      const total = state.len + n;
      const feeds = {
        input_ids: ort('int64', BigInt64Array.from(part, BigInt), [1, n]),
        attention_mask: ort('int64', new BigInt64Array(total).fill(1n), [1, total]),
        ...state.cache,
      };
      if (inputNames.includes('position_ids'))
        feeds.position_ids = ort(
          'int64',
          BigInt64Array.from({ length: n }, (_, i) => BigInt(state.len + i)),
          [1, n]
        );
      if (keepName) feeds[keepName] = ort('int64', BigInt64Array.from([1n]), [1]);
      const out = await session.run(feeds);
      const next = {};
      for (const past of pastNames) next[past] = out[presentFor(past)];
      dispose(state.cache);
      state.cache = next;
      state.len = total;
      logits = lastRow(out.logits);
      out.logits.dispose?.();
    }
    return logits;
  }

  function sample(logits, { temperature, topP, topK, repetitionPenalty, seen }) {
    if (repetitionPenalty && repetitionPenalty !== 1) {
      for (const id of seen) {
        const v = logits[id];
        logits[id] = v > 0 ? v / repetitionPenalty : v * repetitionPenalty;
      }
    }
    // The 256 largest logits carry the sampled set; the normaliser is over the whole vocabulary.
    const K = Math.min(topK ?? 256, 256);
    const top = [];
    let floor = -Infinity;
    for (let i = 0; i < logits.length; i++) {
      const v = logits[i];
      if (top.length < K) {
        top.push(i);
        if (top.length === K) {
          top.sort((a, b) => logits[b] - logits[a]);
          floor = logits[top[K - 1]];
        }
      } else if (v > floor) {
        let j = K - 1;
        while (j > 0 && logits[top[j - 1]] < v) {
          top[j] = top[j - 1];
          j--;
        }
        top[j] = i;
        floor = logits[top[K - 1]];
      }
    }
    if (top.length < K) top.sort((a, b) => logits[b] - logits[a]);
    const t = Math.max(temperature, 1e-5);
    const max = logits[top[0]] / t;
    let z = 0;
    if (topK) for (const i of top) z += Math.exp(logits[i] / t - max);
    else for (let i = 0; i < logits.length; i++) z += Math.exp(logits[i] / t - max);
    const keep = [];
    let mass = 0;
    for (const i of top) {
      const p = Math.exp(logits[i] / t - max) / z;
      keep.push([i, p]);
      mass += p;
      if (mass >= (topP ?? 1)) break;
    }
    let r = Math.random() * mass;
    for (const [i, p] of keep) if ((r -= p) <= 0) return i;
    return keep[keep.length - 1][0];
  }

  // The routing rubric's five first tokens. Callers pass Qwen ids (LOCAL_QUEUE_TOKENS); each
  // maps to the first LFM3 piece of the same queue name and answers under the Qwen token
  // string, so jevClient reads the scores unchanged.
  const queueMap = new Map();
  for (const [queue, { id, token }] of Object.entries(queueTokens ?? {})) {
    const lfmId = tokenizer.encode(queue, { add_special_tokens: false })[0];
    queueMap.set(id, { queue, token, lfmId, piece: tokenizer.decode([lfmId]) });
  }
  if (new Set([...queueMap.values()].map((q) => q.lfmId)).size !== queueMap.size)
    throw new Error('LFM3 queue first tokens collide');

  let busy = Promise.resolve();
  let interrupted = false;
  const exclusive = (fn) => {
    const run = busy.then(fn, fn);
    busy = run.catch(() => undefined);
    return run;
  };

  function promptIds(request) {
    const text = tokenizer.apply_chat_template(request.messages, {
      tokenize: false,
      add_generation_prompt: true,
      enable_thinking: request.extra_body?.enable_thinking !== false,
    });
    return { text, ids: Array.from(tokenizer.encode(text, { add_special_tokens: false })) };
  }

  async function create(request) {
    return exclusive(async () => {
      interrupted = false;
      const { ids } = promptIds(request);
      const state = { cache: emptyCache(), len: 0 };
      try {
        const bias = request.logit_bias ? Object.keys(request.logit_bias).map(Number) : [];
        if (bias.length && request.max_tokens === 1) {
          const logits = await feed(ids, state);
          const picks = bias.map((qid) => {
            const q = queueMap.get(qid);
            if (!q) throw new Error(`no LFM3 mapping for biased id ${qid}`);
            return { ...q, logit: logits[q.lfmId] / (request.temperature ?? 1) };
          });
          const max = Math.max(...picks.map((p) => p.logit));
          const lz = Math.log(picks.reduce((s, p) => s + Math.exp(p.logit - max), 0)) + max;
          const top = picks
            .map((p) => ({ token: p.token, logprob: p.logit - lz }))
            .sort((a, b) => b.logprob - a.logprob);
          return {
            choices: [
              {
                message: { content: top[0].token },
                finish_reason: 'length',
                logprobs: { content: [{ token: top[0].token, top_logprobs: top }] },
              },
            ],
            usage: { prompt_tokens: ids.length, completion_tokens: 1 },
          };
        }
        const recommended = request.temperature === recommendedAt;
        const opts = {
          temperature: request.temperature ?? 0.7,
          topP: request.top_p ?? 1,
          topK: recommended ? 50 : undefined,
          repetitionPenalty: recommended ? 1.1 : undefined,
          seen: new Set(ids),
        };
        const t0 = performance.now();
        let logits = await feed(ids, state);
        const prefillMs = performance.now() - t0;
        const out = [];
        let finish = 'length';
        const maxTokens = request.max_tokens ?? 2048;
        while (out.length < maxTokens) {
          if (interrupted) {
            finish = 'abort';
            break;
          }
          const next = sample(logits, opts);
          if (STOP_IDS.has(next)) {
            finish = 'stop';
            break;
          }
          out.push(next);
          opts.seen.add(next);
          logits = await feed([next], state);
        }
        const text = tokenizer.decode(out, { skip_special_tokens: false }).split(IM_END)[0];
        return {
          choices: [{ message: { content: text }, finish_reason: finish }],
          usage: {
            prompt_tokens: ids.length,
            completion_tokens: out.length,
            extra: {
              prefill_ms: Math.round(prefillMs),
              decode_ms: Math.round(performance.now() - t0 - prefillMs),
            },
          },
        };
      } finally {
        dispose(state.cache);
      }
    });
  }

  return {
    kind: 'lfm3-onnx',
    repo: LFM3_REPO,
    revision: LFM3_REVISION,
    dtype,
    chunk,
    inputNames,
    queueMap: Object.fromEntries(
      [...queueMap.values()].map((q) => [q.queue, { lfmId: q.lfmId, piece: q.piece }])
    ),
    chat: { completions: { create } },
    completions: {
      create: async () => {
        throw new Error('raw completions are not part of the LFM3 shim');
      },
    },
    interruptGenerate() {
      interrupted = true;
    },
    // Diagnostics for the smoke run.
    tokenizer,
    promptIds,
    feed: (ids, chunkSize) =>
      exclusive(async () => {
        const state = { cache: emptyCache(), len: 0 };
        try {
          return await feed(ids, state, chunkSize);
        } finally {
          dispose(state.cache);
        }
      }),
    pastMeta: pastNames.slice(0, 4).map((n) => meta[n]),
    async unload() {
      await model.dispose();
    },
  };
}
