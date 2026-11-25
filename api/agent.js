// Fungsi serverless Vercel: /api/agent
//   GET  → daftar model yang aktif (tanpa membuka rahasia apa pun)
//   POST → meneruskan percakapan ke Gemini atau Claude dan mengalirkan jawaban (streaming)
//
// Env (Vercel → Settings → Environment Variables). Isi minimal SATU key:
//   GEMINI_API_KEY     — key gratis dari Google AI Studio (aistudio.google.com)
//   ANTHROPIC_API_KEY  — key berbayar dari console Anthropic
//   OFFICE_PASSCODE    — kode akses kantor (wajib), supaya orang lain tidak bisa memakai kuota/saldo Anda
// Opsional:
//   GEMINI_MODEL, GEMINI_MODEL_LITE — ganti nama model Gemini (boleh beberapa, dipisah koma)
//   GEMINI_PRICE_IN, GEMINI_PRICE_OUT — tarif USD per 1 juta token bila billing Google aktif
//   MOCK_API=1         — mode uji tanpa memanggil AI (tanpa biaya)

import { timingSafeEqual } from 'node:crypto';
import { AGENTS } from './_prompts.js';
import { streamClaude } from './_claude.js';
import { streamGemini } from './_gemini.js';

export const config = { maxDuration: 60 };

// Tarif Claude per 1 juta token (USD). Perbarui bila tarif Anthropic berubah.
export const MODELS = {
  gemini: { provider: 'gemini', label: 'Gemini Flash', option: 'Gratis · Gemini Flash', maxTokens: 8192 },
  'gemini-lite': { provider: 'gemini', label: 'Gemini Flash-Lite', option: 'Gratis · Gemini Flash-Lite', maxTokens: 8192 },
  hemat: { provider: 'claude', id: 'claude-haiku-5-5', label: 'Haiku 5.5', option: 'Hemat · Claude Haiku 5.5', input: 0.1, output: 0.5, maxTokens: 4000 },
  mantap: { provider: 'claude', id: 'claude-sonnet-5-5', label: 'Sonnet 5.5', option: 'Mantap · Claude Sonnet 5.5', input: 2, output: 10, maxTokens: 6000 },
};

const MAX_MESSAGES = 30;
const MAX_TOTAL_CHARS = 120_000; // batas ukuran percakapan per permintaan (≈30–40 ribu token)

export function costUSD(model, inputTokens, outputTokens) {
  return (inputTokens * (model.input ?? 0) + outputTokens * (model.output ?? 0)) / 1_000_000;
}

const isMock = () => process.env.MOCK_API === '1';
export function providerReady(provider) {
  if (isMock()) return true;
  if (provider === 'gemini') return !!process.env.GEMINI_API_KEY;
  if (provider === 'claude') return !!process.env.ANTHROPIC_API_KEY;
  return false;
}

/** Model yang bisa dipakai sekarang, urut: gratis dulu. */
export function availableModels() {
  return Object.entries(MODELS)
    .filter(([, m]) => providerReady(m.provider))
    .map(([tier, m]) => ({ tier, label: m.option, provider: m.provider }));
}

function sameSecret(a, b) {
  const x = Buffer.from(String(a ?? ''));
  const y = Buffer.from(String(b ?? ''));
  if (x.length !== y.length) return false;
  return timingSafeEqual(x, y);
}

async function readJson(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') return JSON.parse(req.body);
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : {};
}

function sendJson(res, status, obj) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(obj));
}

/** Validasi isi permintaan. Mengembalikan { error } atau { agent, tier, model, messages }. */
export function validate(body) {
  const agent = AGENTS[body?.agentId];
  if (!agent) return { error: 'Agen tidak dikenal.' };
  let tier = MODELS[body?.tier] ? body.tier : null;
  if (!tier || !providerReady(MODELS[tier].provider)) tier = availableModels()[0]?.tier ?? 'gemini';
  const model = MODELS[tier];
  const msgs = body?.messages;
  if (!Array.isArray(msgs) || msgs.length === 0) return { error: 'Pesan kosong.' };
  if (msgs.length > MAX_MESSAGES) return { error: `Percakapan terlalu panjang (maks ${MAX_MESSAGES} pesan). Mulai percakapan baru.` };
  let total = 0;
  const messages = [];
  for (const [i, m] of msgs.entries()) {
    const role = m?.role;
    const content = m?.content;
    if (!['user', 'assistant'].includes(role) || typeof content !== 'string' || !content.trim()) {
      return { error: 'Format pesan tidak valid.' };
    }
    if (i === 0 && role !== 'user') return { error: 'Pesan pertama harus dari pengguna.' };
    if (i > 0 && role === msgs[i - 1].role) return { error: 'Urutan pesan tidak valid.' };
    total += content.length;
    messages.push({ role, content });
  }
  if (messages.at(-1).role !== 'user') return { error: 'Pesan terakhir harus dari pengguna.' };
  if (total > MAX_TOTAL_CHARS) {
    return { error: `Data terlalu besar (${total.toLocaleString('id-ID')} karakter, maks ${MAX_TOTAL_CHARS.toLocaleString('id-ID')}). Kecilkan file atau mulai percakapan baru.` };
  }
  return { agent, tier, model, messages };
}

function sse(res, obj) {
  res.write(`data: ${JSON.stringify(obj)}\n\n`);
}

async function mockStream(res, agent, model, messages) {
  const last = messages.at(-1).content.slice(0, 160).replace(/\s+/g, ' ');
  const text = `## Mode uji (MOCK_API)\n\nHalo, saya **${agent.name}**. Ini jawaban contoh tanpa memanggil AI, jadi **tidak ada biaya**.\n\nPermintaan Anda:\n> ${last}\n\n| Metrik | Nilai |\n|---|---|\n| Model | ${model.label} |\n| Pesan | ${messages.length} |\n\nHapus \`MOCK_API\` dan isi \`GEMINI_API_KEY\` atau \`ANTHROPIC_API_KEY\` untuk jawaban sungguhan.`;
  for (const piece of text.match(/.{1,24}/gs)) {
    sse(res, { type: 'delta', text: piece });
    await new Promise((r) => setTimeout(r, 35));
  }
  const inTok = Math.ceil(messages.reduce((n, m) => n + m.content.length, 0) / 4);
  sse(res, { type: 'done', usage: { input: inTok, output: Math.ceil(text.length / 4) }, cost: 0, model: model.label, mock: true });
}

export default async function handler(req, res) {
  if (req.method === 'GET') {
    return sendJson(res, 200, {
      models: availableModels(),
      passcode: !!process.env.OFFICE_PASSCODE || isMock(),
      mock: isMock(),
    });
  }
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return sendJson(res, 405, { error: 'Gunakan POST.' });
  }

  const passcode = process.env.OFFICE_PASSCODE;
  if (!passcode && !isMock()) {
    return sendJson(res, 500, { error: 'OFFICE_PASSCODE belum diatur di server (Vercel → Settings → Environment Variables).' });
  }
  if (passcode && !sameSecret(req.headers['x-office-code'], passcode)) {
    return sendJson(res, 401, { error: 'Kode akses salah.' });
  }

  let body;
  try {
    body = await readJson(req);
  } catch {
    return sendJson(res, 400, { error: 'Body bukan JSON yang valid.' });
  }
  const v = validate(body);
  if (v.error) return sendJson(res, 400, { error: v.error });
  const { agent, tier, model, messages } = v;

  if (!providerReady(model.provider)) {
    return sendJson(res, 500, { error: 'Belum ada API key AI di server. Isi GEMINI_API_KEY (gratis) atau ANTHROPIC_API_KEY di Vercel, lalu redeploy.' });
  }

  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('X-Accel-Buffering', 'no');

  if (isMock()) {
    await mockStream(res, agent, model, messages);
    return res.end();
  }

  const common = {
    system: agent.system,
    messages,
    onDelta: (text) => sse(res, { type: 'delta', text }),
    onError: (error) => sse(res, { type: 'error', error }),
  };
  const r =
    model.provider === 'gemini'
      ? await streamGemini({ ...common, tier, maxTokens: model.maxTokens })
      : await streamClaude({ ...common, model });

  if (r) {
    sse(res, {
      type: 'done',
      usage: { input: r.inputTokens, output: r.outputTokens },
      cost: r.cost,
      model: r.label,
      truncated: r.truncated,
      free: !!r.free,
    });
  }
  res.end();
}
