// Penyedia Claude (Anthropic Messages API, streaming).
import { readSSE } from './_sse.js';

const HINT = {
  401: 'API key Claude tidak valid.',
  402: 'Saldo API Claude habis — isi ulang di console Anthropic.',
  429: 'Terlalu banyak permintaan atau batas pengeluaran Claude tercapai. Coba lagi nanti.',
  529: 'Server Claude sedang sibuk. Coba lagi sebentar lagi.',
};

/**
 * @returns {Promise<{inputTokens:number, outputTokens:number, cost:number, truncated:boolean, label:string}>}
 */
export async function streamClaude({ model, system, messages, onDelta, onError }) {
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
        system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
        messages,
      }),
    });
  } catch (e) {
    onError('Gagal menghubungi Claude API: ' + e.message);
    return null;
  }
  if (!upstream.ok) {
    let detail = '';
    try {
      detail = (await upstream.json())?.error?.message ?? '';
    } catch { /* abaikan */ }
    onError(`${HINT[upstream.status] ?? `Claude API error ${upstream.status}.`} ${detail}`.trim());
    return null;
  }

  let input = 0;
  let cacheRead = 0;
  let cacheWrite = 0;
  let output = 0;
  let stop = null;
  try {
    await readSSE(upstream.body, (ev) => {
      if (ev.type === 'message_start') {
        const u = ev.message?.usage ?? {};
        input = u.input_tokens ?? 0;
        cacheRead = u.cache_read_input_tokens ?? 0;
        cacheWrite = u.cache_creation_input_tokens ?? 0;
      } else if (ev.type === 'content_block_delta' && ev.delta?.type === 'text_delta') {
        onDelta(ev.delta.text);
      } else if (ev.type === 'message_delta') {
        output = ev.usage?.output_tokens ?? output;
        stop = ev.delta?.stop_reason ?? stop;
      } else if (ev.type === 'error') {
        onError(ev.error?.message ?? 'Error dari Claude API.');
      }
    });
  } catch (e) {
    onError('Aliran jawaban terputus: ' + e.message);
  }
  // Cache read ±0,1× dan cache write ±1,25× harga input (perkiraan konservatif).
  const cost =
    (input * model.input + output * model.output + cacheRead * model.input * 0.1 + cacheWrite * model.input * 1.25) / 1_000_000;
  return { inputTokens: input + cacheRead + cacheWrite, outputTokens: output, cost, truncated: stop === 'max_tokens', label: model.label };
}
