// Penyedia Gemini (Google AI Studio / Gemini Developer API, streaming).
// Nama model Gemini sering berganti, jadi ada daftar cadangan: bila model pertama
// tidak ada (404) atau kuota gratisnya habis (429), model berikutnya dicoba.
import { readSSE } from './_sse.js';

const BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

export function geminiCandidates(tier) {
  const fromEnv = (name) => (process.env[name] || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (tier === 'gemini-lite') {
    return [...fromEnv('GEMINI_MODEL_LITE'), 'gemini-3.5-flash-lite', 'gemini-3.1-flash-lite', 'gemini-flash-lite-latest'];
  }
  return [...fromEnv('GEMINI_MODEL'), 'gemini-3.6-flash', 'gemini-3.5-flash', 'gemini-flash-latest'];
}

const prettyName = (id) =>
  id
    .replace(/^gemini-/, 'Gemini ')
    .replace(/-flash-lite/, ' Flash-Lite')
    .replace(/-flash/, ' Flash')
    .replace(/-latest$/, ' (latest)');

function errorText(status, detail) {
  if (status === 400 && /api key/i.test(detail)) return 'API key Gemini tidak valid.';
  if (status === 403) return 'API key Gemini ditolak (izin/region). Periksa key di Google AI Studio.';
  if (status === 429) return 'Kuota gratis Gemini habis untuk saat ini (batas per menit/per hari). Coba lagi nanti atau pilih model lain.';
  if (status === 503) return 'Server Gemini sedang sibuk. Coba lagi sebentar lagi.';
  return `Gemini API error ${status}. ${detail}`.trim();
}

export async function streamGemini({ tier, maxTokens, system, messages, onDelta, onError }) {
  const contents = messages.map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] }));
  const body = JSON.stringify({
    systemInstruction: { parts: [{ text: system }] },
    contents,
    generationConfig: { maxOutputTokens: maxTokens, temperature: 0.7 },
  });

  const tried = [];
  let quotaHit = false;
  let upstream = null;
  let modelId = null;
  for (const id of [...new Set(geminiCandidates(tier))]) {
    let res;
    try {
      res = await fetch(`${BASE}/${encodeURIComponent(id)}:streamGenerateContent?alt=sse`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY },
        body,
      });
    } catch (e) {
      onError('Gagal menghubungi Gemini API: ' + e.message);
      return null;
    }
    if (res.ok) {
      upstream = res;
      modelId = id;
      break;
    }
    let detail = '';
    try {
      detail = (await res.json())?.error?.message ?? '';
    } catch { /* abaikan */ }
    tried.push(`${id} (${res.status})`);
    // 404 = model tidak ada / tidak tersedia; 429 = kuota model ini habis → coba model lain.
    if (res.status === 404 || res.status === 429) {
      if (res.status === 429) quotaHit = true;
      continue;
    }
    onError(errorText(res.status, detail));
    return null;
  }
  if (!upstream) {
    onError(
      (quotaHit ? errorText(429, '') : 'Tidak ada model Gemini yang tersedia untuk key ini.') +
        ` Dicoba: ${tried.join(', ')}. Atur GEMINI_MODEL di Vercel bila perlu.`,
    );
    return null;
  }

  let input = 0;
  let output = 0;
  let finish = null;
  try {
    await readSSE(upstream.body, (ev) => {
      if (ev.error) {
        onError(ev.error.message ?? 'Error dari Gemini API.');
        return;
      }
      const cand = ev.candidates?.[0];
      for (const part of cand?.content?.parts ?? []) {
        if (part.text && !part.thought) onDelta(part.text);
      }
      if (cand?.finishReason) finish = cand.finishReason;
      const u = ev.usageMetadata;
      if (u) {
        input = u.promptTokenCount ?? input;
        output = (u.candidatesTokenCount ?? 0) + (u.thoughtsTokenCount ?? 0) || output;
      }
    });
  } catch (e) {
    onError('Aliran jawaban terputus: ' + e.message);
  }
  if (finish === 'SAFETY' || finish === 'RECITATION' || finish === 'PROHIBITED_CONTENT') {
    onError(`Gemini menghentikan jawaban (${finish}). Ubah kalimat permintaan atau pilih model Claude.`);
  }
  // Tier gratis: biaya 0. Bila billing Google diaktifkan, isi GEMINI_PRICE_IN/OUT (USD per 1 juta token).
  const pin = Number(process.env.GEMINI_PRICE_IN) || 0;
  const pout = Number(process.env.GEMINI_PRICE_OUT) || 0;
  return {
    inputTokens: input,
    outputTokens: output,
    cost: (input * pin + output * pout) / 1_000_000,
    truncated: finish === 'MAX_TOKENS',
    label: prettyName(modelId),
    free: !pin && !pout,
  };
}
