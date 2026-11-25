// Fungsi murni untuk mengubah tabel (array of rows) menjadi teks ringkas untuk agen.
// Ringkasan numerik dihitung dari SEMUA baris, supaya agen tidak menjumlah di kepala.

const ID_LIKE = /(tanggal|date|waktu|\btime\b|\bjam\b|pesanan\s*(id|no)|order\s*(id|no)|nomor|resi|awb|\bsku\b|kode|\bcode\b|\bid\b|^no\.?$|^no\.?\s|telepon|phone|\bhp\b|zip)/i;

/** Ubah string angka gaya Indonesia/Inggris menjadi Number; null bila bukan angka. */
export function parseNumberID(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v !== 'string') return null;
  let s = v.trim();
  if (!s) return null;
  let neg = false;
  if (/^\(.*\)$/.test(s)) {
    neg = true;
    s = s.slice(1, -1);
  }
  s = s.replace(/^(rp\.?|idr)\s*/i, '').replace(/[%\s ]/g, '');
  if (s.startsWith('-')) {
    neg = !neg;
    s = s.slice(1);
  }
  if (!/^[\d.,]+$/.test(s) || !/\d/.test(s)) return null;
  const lastDot = s.lastIndexOf('.');
  const lastComma = s.lastIndexOf(',');
  if (lastDot !== -1 && lastComma !== -1) {
    // Pemisah yang muncul terakhir adalah desimal.
    s = lastComma > lastDot ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  } else if (lastDot !== -1) {
    if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, ''); // 1.234.567 → ribuan
    else if ((s.match(/\./g) || []).length > 1) return null;
  } else if (lastComma !== -1) {
    if (/^\d{1,3}(,\d{3}){2,}$/.test(s)) s = s.replace(/,/g, ''); // 1,234,567 → ribuan
    else if ((s.match(/,/g) || []).length > 1) return null;
    else s = s.replace(',', '.'); // 12,5 → desimal gaya Indonesia
  }
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return neg ? -n : n;
}

const clean = (v) => {
  if (v == null) return '';
  if (v instanceof Date) return isNaN(v) ? '' : v.toISOString().slice(0, 10);
  return String(v).replace(/\s+/g, ' ').trim();
};

/** Cari baris header: baris pertama dengan ≥2 sel terisi yang diikuti baris data. */
export function findHeaderRow(rows) {
  for (let i = 0; i < Math.min(rows.length, 30); i++) {
    const filled = rows[i].filter((c) => clean(c) !== '').length;
    if (filled >= 2) return i;
  }
  return 0;
}

const fmt = (n) => {
  if (Number.isInteger(n)) return n.toLocaleString('id-ID');
  return n.toLocaleString('id-ID', { maximumFractionDigits: 4 });
};

/** Ringkasan per kolom numerik. */
export function numericSummary(header, data) {
  const out = [];
  header.forEach((name, ci) => {
    const label = clean(name) || `Kolom ${ci + 1}`;
    if (ID_LIKE.test(label)) return;
    let nonEmpty = 0;
    const nums = [];
    for (const r of data) {
      const raw = r[ci];
      if (clean(raw) === '' || raw instanceof Date) continue;
      nonEmpty++;
      const n = parseNumberID(raw);
      if (n !== null) nums.push(n);
    }
    if (nums.length === 0 || nums.length / nonEmpty < 0.6) return;
    const sum = nums.reduce((a, b) => a + b, 0);
    out.push({
      label,
      count: nums.length,
      sum,
      avg: sum / nums.length,
      min: Math.min(...nums),
      max: Math.max(...nums),
    });
  });
  return out;
}

const csvCell = (v, max = 80) => {
  let s = clean(v);
  if (s.length > max) s = s.slice(0, max - 1) + '…';
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/**
 * Ubah satu sheet menjadi blok teks untuk agen.
 * @param {string} title nama file/sheet
 * @param {any[][]} rows
 * @param {{maxRows?: number, maxCols?: number}} opt
 */
export function sheetToText(title, rows, { maxRows = 300, maxCols = 40 } = {}) {
  rows = rows.filter((r) => Array.isArray(r) && r.some((c) => clean(c) !== ''));
  if (rows.length === 0) return { text: '', dataRows: 0, cols: 0 };
  const h = findHeaderRow(rows);
  const header = rows[h].slice(0, maxCols);
  const data = rows.slice(h + 1).map((r) => r.slice(0, maxCols));
  // Buang kolom yang seluruhnya kosong.
  const keep = header.map((_, ci) => clean(header[ci]) !== '' || data.some((r) => clean(r[ci]) !== ''));
  const pick = (r) => r.filter((_, ci) => keep[ci]);
  const H = pick(header);
  const D = data.map(pick);
  const summary = numericSummary(H, D);

  const lines = [];
  lines.push(`=== DATA: ${title} — ${D.length} baris data, ${H.length} kolom ===`);
  if (summary.length) {
    lines.push('RINGKASAN NUMERIK (dihitung sistem dari semua baris):');
    for (const s of summary) {
      lines.push(`- ${s.label}: terisi=${s.count}, total=${fmt(s.sum)}, rata-rata=${fmt(s.avg)}, min=${fmt(s.min)}, maks=${fmt(s.max)}`);
    }
  }
  const shown = D.slice(0, maxRows);
  lines.push(
    shown.length < D.length
      ? `TABEL (CSV, ditampilkan ${shown.length} dari ${D.length} baris pertama):`
      : 'TABEL (CSV):',
  );
  lines.push(H.map((c) => csvCell(c)).join(','));
  for (const r of shown) lines.push(H.map((_, ci) => csvCell(r[ci])).join(','));
  return { text: lines.join('\n'), dataRows: D.length, cols: H.length };
}

/** Pecah teks CSV sederhana (mendukung tanda kutip, pemisah , atau ;). */
export function parseCSV(text) {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? '';
  const sep = (firstLine.match(/;/g) || []).length > (firstLine.match(/,/g) || []).length ? ';' : ',';
  const rows = [];
  let row = [];
  let cell = '';
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else q = false;
      } else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === sep) {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += ch;
  }
  if (cell !== '' || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}
