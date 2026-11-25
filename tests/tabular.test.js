import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseNumberID, sheetToText, parseCSV, numericSummary } from '../src/tabular.js';

test('parseNumberID: format Indonesia & Inggris', () => {
  assert.equal(parseNumberID('Rp1.250.000'), 1250000);
  assert.equal(parseNumberID('Rp 1.250.000,50'), 1250000.5);
  assert.equal(parseNumberID('1,250,000.50'), 1250000.5);
  assert.equal(parseNumberID('12,5%'), 12.5);
  assert.equal(parseNumberID('3.5'), 3.5);
  assert.equal(parseNumberID('(2.000)'), -2000);
  assert.equal(parseNumberID('-15'), -15);
  assert.equal(parseNumberID(42), 42);
  assert.equal(parseNumberID('abc'), null);
  assert.equal(parseNumberID(''), null);
  assert.equal(parseNumberID('1.2.3'), null);
});

test('numericSummary melewati kolom ID/tanggal', () => {
  const s = numericSummary(['No. Pesanan', 'Tanggal', 'Omzet', 'Produk'], [
    ['2311A', '2026-11-01', 'Rp10.000', 'Madu'],
    ['2311B', '2026-11-02', 'Rp20.000', 'Kitab'],
  ]);
  assert.equal(s.length, 1);
  assert.equal(s[0].label, 'Omzet');
  assert.equal(s[0].sum, 30000);
  assert.equal(s[0].avg, 15000);
});

test('sheetToText: header terdeteksi, ringkasan dari semua baris, tabel dipotong', () => {
  const rows = [['Laporan Toko'], [], ['Produk', 'Pengunjung', 'Pesanan']];
  for (let i = 0; i < 10; i++) rows.push([`P${i}`, 100, 5]);
  const r = sheetToText('toko.xlsx', rows, { maxRows: 3 });
  assert.equal(r.dataRows, 10);
  assert.match(r.text, /Pengunjung: terisi=10, total=1\.000/);
  assert.match(r.text, /ditampilkan 3 dari 10/);
});

test('parseCSV: kutip, pemisah titik koma, CRLF', () => {
  const rows = parseCSV('a;b;c\r\n"x;1";"he said ""hi""";3\r\n');
  assert.deepEqual(rows, [['a', 'b', 'c'], ['x;1', 'he said "hi"', '3']]);
});
