// Fungsi serverless Vercel: POST /api/agent
// Meneruskan percakapan ke Claude API dan mengalirkan jawaban (streaming) ke kantor.
//
// Env yang dibutuhkan (Vercel → Settings → Environment Variables):
//   ANTHROPIC_API_KEY  — API key dari console Anthropic (jangan pernah di-commit)
//   OFFICE_PASSCODE    — kode akses kantor, supaya orang lain tidak bisa memakai saldo API Anda
// Opsional:
//   MOCK_API=1         — mode uji lokal tanpa memanggil Claude (tanpa biaya)

import { timingSafeEqual } from 'node:crypto';
import { AGENTS } from './_prompts.js';

export const config = { maxDuration: 60 };

// Harga per 1 juta token (USD). Perbarui bila tarif Anthropic berubah.
export const MODELS = {
  hemat: { id: 'claude-haiku-5-5', label: 'Haiku 5.5', input: 0.1, output: 0.5, maxTokens: 4000 },
  mantap: { id: 'claude-sonnet-5-5', label: 'Sonnet 5.5', input: 2, output: 10, maxTokens: 6000 },
};

const MAX_MESSAGES = 30;
const MAX_TOTAL_CHARS = 120_000; // batas ukuran percakapan per permintaan (≈30–40 ribu token)

export function costUSD(model, inputTokens, outputTokens) {
  return (inputTokens * model.input + outputTokens * model.output) / 1_000_000;
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
  res.end(JSON.stringify(obj));
}

/** Validasi isi permintaan. Mengembalikan { error } atau { agent, model, messages }. */
export function validate(body) {
  const agent = AGENTS[body?.agentId];
  if (!agent) return { error: 'Agen tidak dikenal.' };
  const model = MODELS[body?.tier] ?? MODELS.hemat;
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
  return { agent, model, messages };
}

function sse(res, obj) {
  res.write(`data: ${JSON.stringify(obj)}\n\n`);
}

async function mockStream(res, agent, model, messages) {
  const last = messages.at(-1).content.slice(0, 160).replace(/\s+/g, ' ');
  const text = `## Mode uji (MOCK_API)\n\nHalo, saya **${agent.name}**. Ini jawaban contoh tanpa memanggil Claude, jadi **tidak ada biaya**.\n\nPermintaan Anda:\n> ${last}\n\n| Metrik | Nilai |\n|---|---|\n| Model | ${model.label} |\n| Pesan | ${messages.length} |\n\nHapus \`MOCK_API\` dan isi \`ANTHROPIC_API_KEY\` untuk jawaban sungguhan.`;
  for (const piece of text.match(/.{1,24}/gs)) {
    sse(res, { type: 'delta', text: piece });
    await new Promise((r) => setTimeout(r, 35));
  }
  const inTok = Math.ceil(messages.reduce((n, m) => n + m.content.length, 0) / 4);
  const outTok = Math.ceil(text.length / 4);
  sse(res, { type: 'done', usage: { input: inTok, output: outTok }, cost: 0, model: model.label, mock: true });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return sendJson(res, 405, { error: 'Gunakan POST.' });
  }

  const mock = process.env.MOCK_API === '1';
  const passcode = process.env.OFFICE_PASSCODE;
  if (!passcode && !mock) {
    return sendJson(res, 500, { error: 'OFFICE_PASSCODE belum diatur di server.' });
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
  const { agent, model, messages } = v;

  if (!mock && !process.env.ANTHROPIC_API_KEY) {
    return sendJson(res, 500, { error: 'ANTHROPIC_API_KEY belum diatur di server.' });
  }

  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('X-Accel-Buffering', 'no');

  if (mock) {
    await mockStream(res, agent, model, messages);
    return res.end();
  }

  let upstream;
  try {
    upstream = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: model.id,
        max_tokens: model.maxTokens,
        stream: true,
        // System prompt panjang di-cache supaya tugas berikutnya lebih murah.
        system: [{ type: 'text', text: agent.system, cache_control: { type: 'ephemeral' } }],
        messages,
      }),
    });
  } catch (e) {
    sse(res, { type: 'error', error: 'Gagal menghubungi Claude API: ' + e.message });
    return res.end();
  }

  if (!upstream.ok) {
    let detail = '';
    try {
      const j = await upstream.json();
      detail = j?.error?.message ?? '';
    } catch { /* abaikan */ }
    const hint = {
      401: 'API key tidak valid.',
      402: 'Saldo API habis — isi ulang di console Anthropic.',
      429: 'Terlalu banyak permintaan atau batas pengeluaran tercapai. Coba lagi nanti.',
      529: 'Server Claude sedang sibuk. Coba lagi sebentar lagi.',
    }[upstream.status] ?? `Claude API error ${upstream.status}.`;
    sse(res, { type: 'error', error: `${hint} ${detail}`.trim() });
    return res.end();
  }

  // Terjemahkan event SSE Anthropic menjadi event sederhana untuk klien.
  let inputTokens = 0;
  let cacheRead = 0;
  let cacheWrite = 0;
  let outputTokens = 0;
  let stopReason = null;
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    for await (const chunk of upstream.body) {
      buffer += decoder.decode(chunk, { stream: true });
      let idx;
      while ((idx = buffer.indexOf('\n\n')) !== -1) {
        const block = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);
        const dataLine = block.split('\n').find((l) => l.startsWith('data:'));
        if (!dataLine) continue;
        let ev;
        try {
          ev = JSON.parse(dataLine.slice(5).trim());
        } catch {
          continue;
        }
        if (ev.type === 'message_start') {
          const u = ev.message?.usage ?? {};
          inputTokens = u.input_tokens ?? 0;
          cacheRead = u.cache_read_input_tokens ?? 0;
          cacheWrite = u.cache_creation_input_tokens ?? 0;
        } else if (ev.type === 'content_block_delta' && ev.delta?.type === 'text_delta') {
          sse(res, { type: 'delta', text: ev.delta.text });
        } else if (ev.type === 'message_delta') {
          outputTokens = ev.usage?.output_tokens ?? outputTokens;
          stopReason = ev.delta?.stop_reason ?? stopReason;
        } else if (ev.type === 'error') {
          sse(res, { type: 'error', error: ev.error?.message ?? 'Error dari Claude API.' });
        }
      }
    }
  } catch (e) {
    sse(res, { type: 'error', error: 'Aliran jawaban terputus: ' + e.message });
  }

  // Cache read ±0,1× dan cache write ±1,25× harga input (perkiraan konservatif).
  const cost =
    costUSD(model, inputTokens, outputTokens) +
    (cacheRead * model.input * 0.1 + cacheWrite * model.input * 1.25) / 1_000_000;
  sse(res, {
    type: 'done',
    usage: { input: inputTokens + cacheRead + cacheWrite, output: outputTokens },
    cost,
    model: model.label,
    truncated: stopReason === 'max_tokens',
  });
  res.end();
}
