// Klien untuk /api/agent: mengirim percakapan dan membaca jawaban streaming.

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

/**
 * @param {{agentId:string, tier:string, messages:{role:string,content:string}[], code:string,
 *          onDelta:(t:string)=>void, signal?:AbortSignal}} p
 * @returns {Promise<{text:string, usage?:{input:number,output:number}, cost:number, model?:string, truncated?:boolean, mock?:boolean}>}
 */
export async function runAgent({ agentId, tier, messages, code, onDelta, signal }) {
  let res;
  try {
    res = await fetch('/api/agent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-office-code': code },
      body: JSON.stringify({ agentId, tier, messages }),
      signal,
    });
  } catch (e) {
    if (e.name === 'AbortError') throw e;
    throw new ApiError('Tidak bisa terhubung ke server kantor. Periksa koneksi internet.', 0);
  }

  if (!res.ok) {
    let msg = `Server error ${res.status}.`;
    try {
      msg = (await res.json()).error ?? msg;
    } catch { /* abaikan */ }
    if (res.status === 404) msg = 'Endpoint /api/agent tidak ditemukan. Pastikan situs di-deploy di Vercel (bukan GitHub Pages).';
    throw new ApiError(msg, res.status);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  let text = '';
  let done = null;
  let streamError = null;

  for (;;) {
    const { value, done: end } = await reader.read();
    if (end) break;
    buf += decoder.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf('\n\n')) !== -1) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 2);
      if (!line.startsWith('data:')) continue;
      let ev;
      try {
        ev = JSON.parse(line.slice(5));
      } catch {
        continue;
      }
      if (ev.type === 'delta') {
        text += ev.text;
        onDelta?.(ev.text);
      } else if (ev.type === 'done') done = ev;
      else if (ev.type === 'error') streamError = ev.error;
    }
  }

  if (streamError) {
    const err = new ApiError(streamError, 502);
    err.partial = text;
    err.cost = done?.cost ?? 0;
    throw err;
  }
  return { text, cost: done?.cost ?? 0, usage: done?.usage, model: done?.model, truncated: done?.truncated, mock: done?.mock, free: done?.free };
}

/** Model yang aktif di server (ditentukan oleh API key yang diisi di Vercel). */
export async function getModels() {
  try {
    const r = await fetch('/api/agent', { headers: { Accept: 'application/json' } });
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  }
}
