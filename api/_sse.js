// Membaca aliran Server-Sent Events dari fetch() upstream, memanggil onData untuk setiap JSON "data:".
export async function readSSE(body, onData) {
  const decoder = new TextDecoder();
  let buffer = '';
  const flush = (block) => {
    const data = block
      .split(/\r?\n/)
      .filter((l) => l.startsWith('data:'))
      .map((l) => l.slice(5).trim())
      .join('');
    if (!data || data === '[DONE]') return;
    let ev;
    try {
      ev = JSON.parse(data);
    } catch {
      return;
    }
    onData(ev);
  };
  for await (const chunk of body) {
    buffer += decoder.decode(chunk, { stream: true });
    let m;
    while ((m = buffer.match(/\r?\n\r?\n/))) {
      flush(buffer.slice(0, m.index));
      buffer = buffer.slice(m.index + m[0].length);
    }
  }
  if (buffer.trim()) flush(buffer);
}
