# 🏢 Kantor Virtual · Al Hijaz

Kantor 2D tempat **agen AI bekerja sebagai NPC**. Anda berjalan ke meja agen, menekan **E**, lalu memberi tugas. Jawaban agen mengalir langsung di panel samping. Agen menampilkan status *mengerjakan…* dan *✅ selesai!* di kantor, jadi Anda bisa pindah ke agen lain sambil menunggu.

| Agen | Status | Keahlian |
|---|---|---|
| 📊 **Analis Marketplace** | aktif | Analisis file export Seller Centre (Excel/CSV): funnel, optimasi toko, promo, ROAS impas, GMV Max, CPAS |
| 🎬 **Sutradara Video Ads** | aktif | Kartu Kesiapan → angle → brief 4 pilar → script berwarna + 5 hook → shot list → evaluasi iklan (kerangka Video Ads 101, dengan rambu syariat) |
| 🕋 Kreator Konten Umrah | segera | — |
| 💬 CS Closing Chat | segera | — |

## Cara kerja

```
Browser (Phaser 3)  ──POST /api/agent──▶  Fungsi serverless Vercel  ──▶  Claude API
  kantor, panel,       agentId + pesan       memilih system prompt,        Haiku 5.5 / Sonnet 5.5
  baca Excel/CSV       + kode akses          menyimpan API key
```

- **API key hanya ada di server** (env Vercel). Kode di browser tidak pernah melihatnya.
- **Kode akses** (`OFFICE_PASSCODE`) mencegah orang lain yang tahu URL-nya menghabiskan saldo API Anda.
- Browser hanya boleh memilih agen yang terdaftar. System prompt ada di `api/_prompts.js`, jadi endpoint ini tidak bisa dipakai sebagai chatbot bebas.
- **File Excel/CSV dibaca di browser.** Yang dikirim ke agen hanya teks ringkas: ringkasan numerik yang dihitung dari semua baris, ditambah maksimal 300 baris tabel.
- **Biaya per tugas** dihitung dari jumlah token sebenarnya dan dijumlahkan per hari dan per bulan di kiri atas. Batas harian bawaannya $0,50 dan bisa diubah dengan mengklik kotak biaya.

## Deploy gratis ke Vercel (±10 menit)

1. Buat API key di **console.anthropic.com → Settings → API Keys**, lalu isi saldo kecil (mis. $5). Di **Settings → Limits**, pasang *spend limit* bulanan sebagai batas keras.
2. Masuk ke **vercel.com** dengan akun GitHub → **Add New… → Project** → pilih repo `Kantor-Virtual` → **Import**. Framework terdeteksi otomatis sebagai Vite.
3. Sebelum klik **Deploy**, buka **Environment Variables** dan isi:
   - `ANTHROPIC_API_KEY` = API key dari langkah 1
   - `OFFICE_PASSCODE` = kode akses pilihan Anda (minimal 8 karakter, jangan dipakai di tempat lain)
4. Klik **Deploy**. Buka URL `*.vercel.app` yang diberikan, dekati meja agen, tekan **E**, lalu masukkan kode akses saat diminta.

> GitHub Pages **tidak bisa** dipakai karena tidak menjalankan fungsi `/api/agent`. Gunakan Vercel.

## Jalankan di komputer sendiri

```bash
npm install
cp .env.example .env.local    # isi ANTHROPIC_API_KEY & OFFICE_PASSCODE,
                              # atau MOCK_API=1 untuk uji tanpa biaya
npm run dev                   # buka http://localhost:5173
npm test                      # uji unit
```

## Kontrol

| Aksi | Desktop | HP |
|---|---|---|
| Berjalan | `W A S D` / panah, atau klik lantai | ketuk lantai |
| Bicara dengan agen | `E` / `Enter` di dekat meja, atau klik agen | ketuk agen / tombol hijau |
| Tutup panel | `Esc` | ✕ |
| Kirim tugas | `Enter` (`Shift+Enter` untuk baris baru) | Kirim |

Model bisa dipilih per agen: **Hemat** (Haiku 5.5, ±$0,004 per tugas sedang) atau **Mantap** (Sonnet 5.5, ±$0,07 per tugas sedang).

## Menambah agen baru

1. `src/agents.js`: tambahkan entri (id, nama, ikon, warna baju, posisi meja, tombol cepat), lalu set `active: true`.
2. `api/_prompts.js`: tambahkan system prompt dengan **id yang sama**.
3. Meja untuk `umrah` dan `closing` sudah disiapkan. Cukup aktifkan dan isi prompt-nya.

## Struktur

```
api/agent.js          fungsi serverless: validasi, kode akses, streaming ke Claude, hitung biaya
api/_prompts.js       system prompt tiap agen
src/game/OfficeScene.js  ruangan, perabot, agen, pemain, kamera
src/game/textures.js  semua grafis pixel-art digambar dengan kode (tanpa aset)
src/game/path.js      A* untuk klik-untuk-berjalan
src/ui.js             HUD biaya, daftar agen, panel tugas, kode akses
src/tabular.js        parser angka Indonesia/Inggris, ringkasan numerik, CSV
tests/                uji unit (node --test)
```

## Catatan

- Batas harian dicek di browser. Batas keras tetap *spend limit* di console Anthropic.
- Riwayat percakapan tersimpan di browser (localStorage) per agen. Tekan ⟲ dua kali untuk menghapusnya.
- Tarif model ada di `api/agent.js` (`MODELS`). Perbarui bila Anthropic mengubah harga.
