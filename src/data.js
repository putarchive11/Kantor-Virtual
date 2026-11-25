// Membaca file export (Excel/CSV) di browser — file tidak pernah diunggah ke server
// selain sebagai teks ringkas di dalam pesan untuk agen.
import { sheetToText, parseCSV } from './tabular.js';

const MAX_FILE_BYTES = 15 * 1024 * 1024;
const MAX_CHARS = 90_000; // sisakan ruang untuk percakapan (batas server 120 ribu)

export async function fileToAgentText(file) {
  if (file.size > MAX_FILE_BYTES) throw new Error('File lebih dari 15 MB. Export periode yang lebih pendek.');
  const name = file.name;
  const ext = name.split('.').pop().toLowerCase();
  const blocks = [];
  let totalRows = 0;

  if (ext === 'csv' || ext === 'txt') {
    const text = await file.text();
    const r = sheetToText(name, parseCSV(text.replace(/^﻿/, '')));
    if (r.text) blocks.push(r.text);
    totalRows += r.dataRows;
  } else if (ext === 'xlsx' || ext === 'xls') {
    const XLSX = await import('xlsx');
    const wb = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true });
    const sheets = wb.SheetNames.slice(0, 4);
    for (const sn of sheets) {
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[sn], { header: 1, raw: true, defval: '' });
      const r = sheetToText(`${name} › ${sn}`, rows, { maxRows: sheets.length > 1 ? 150 : 300 });
      if (r.text) blocks.push(r.text);
      totalRows += r.dataRows;
    }
    if (wb.SheetNames.length > sheets.length) blocks.push(`(Catatan: ${wb.SheetNames.length - sheets.length} sheet lain tidak disertakan.)`);
  } else {
    throw new Error('Format belum didukung. Gunakan .xlsx, .xls, atau .csv.');
  }

  let text = blocks.join('\n\n');
  if (!text.trim()) throw new Error('File kosong atau tidak terbaca.');
  let cut = false;
  if (text.length > MAX_CHARS) {
    // Potong per baris; ringkasan numerik di bagian atas tiap blok tetap utuh untuk sheet pertama.
    text = text.slice(0, MAX_CHARS);
    text = text.slice(0, text.lastIndexOf('\n')) + '\n(… tabel dipotong karena terlalu panjang; ringkasan numerik di atas tetap dari semua baris.)';
    cut = true;
  }
  return { name, text, rows: totalRows, chars: text.length, cut };
}
