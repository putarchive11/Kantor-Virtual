// Penyimpanan ringan di browser: biaya, batas harian, kode akses, riwayat percakapan.
// Semua akses localStorage dibungkus try/catch (bisa penuh/diblokir di mode privat).

const K = {
  costs: 'kv.costs.v1',
  limit: 'kv.limit.v1',
  code: 'kv.code.v1',
  convo: (id) => `kv.convo.v1.${id}`,
};

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw == null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}
function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export const bus = new EventTarget();
export const emit = (type, detail) => bus.dispatchEvent(new CustomEvent(type, { detail }));
export const on = (type, fn) => bus.addEventListener(type, (e) => fn(e.detail));

// Tanggal lokal (Asia/Jakarta mengikuti jam perangkat) dalam format YYYY-MM-DD.
export function todayKey(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export const costs = {
  all: () => read(K.costs, {}),
  today() {
    return this.all()[todayKey()] ?? 0;
  },
  month() {
    const prefix = todayKey().slice(0, 7);
    return Object.entries(this.all())
      .filter(([k]) => k.startsWith(prefix))
      .reduce((s, [, v]) => s + v, 0);
  },
  add(usd) {
    if (!(usd > 0)) return;
    const all = this.all();
    const k = todayKey();
    all[k] = (all[k] ?? 0) + usd;
    // Simpan 90 hari terakhir saja.
    const keys = Object.keys(all).sort();
    while (keys.length > 90) delete all[keys.shift()];
    write(K.costs, all);
    emit('costs-changed');
  },
};

export const limit = {
  get: () => read(K.limit, 0.5),
  set(v) {
    write(K.limit, Math.max(0.05, Number(v) || 0.5));
    emit('costs-changed');
  },
};

export const accessCode = {
  get: () => read(K.code, ''),
  set: (v) => write(K.code, v),
  clear: () => write(K.code, ''),
};

// Riwayat: [{ role, content, display?, file?, meta? }]
export const convo = {
  get: (id) => read(K.convo(id), []),
  set(id, msgs) {
    if (!write(K.convo(id), msgs)) {
      // Kalau penuh, simpan tanpa isi data lampiran (tampilan tetap utuh).
      write(K.convo(id), msgs.map((m) => (m.file ? { ...m, content: m.display ?? m.content } : m)));
    }
  },
  clear: (id) => write(K.convo(id), []),
};

export const fmtUSD = (v) => '$' + (v < 0.01 && v > 0 ? v.toFixed(4) : v.toFixed(3));
