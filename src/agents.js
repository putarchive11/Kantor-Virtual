// Data agen di sisi kantor (tampilan). System prompt-nya ada di api/_prompts.js.
// Untuk menambah agen baru: tambahkan entri di sini DAN di api/_prompts.js dengan id yang sama.

export const AGENTS = [
  {
    id: 'analis',
    name: 'Analis Marketplace',
    short: 'Analis',
    role: 'Pantau & analisis toko Shopee · Tokopedia · Lazada · TikTok',
    icon: '📊',
    active: true,
    tier: 'mantap',
    acceptsFile: true,
    look: { shirt: 0x2f9e6e, pants: 0x2d3142, hair: 0x2a1f1a, skin: 0xe8b98a, cap: null },
    spot: { x: 7, y: 5 }, // posisi meja dalam satuan tile (32px)
    greeting:
      'Assalamu’alaikum. Saya **Analis Marketplace**. Lampirkan file export dari Seller Centre (Excel/CSV) — performa toko, produk, atau iklan — lalu sebutkan toko dan periodenya. Saya petakan funnel-nya dan beri maksimal 5 aksi prioritas.',
    quick: [
      { label: 'Analisis file export', text: 'Tolong analisis file export terlampir. Toko: …, marketplace: …, periode: … (bandingkan dengan periode sebelumnya bila ada).' },
      { label: 'Hitung ROAS impas', text: 'Bantu hitung ROAS impas untuk produk ini. Harga jual: Rp…, HPP: Rp…, biaya admin marketplace: …%, ongkir ditanggung: Rp…, biaya operasional per order: Rp…' },
      { label: 'Penjualan turun, kenapa?', text: 'Penjualan toko … turun dibanding bulan lalu. Data yang saya punya: … Tolong diagnosa di tahap funnel mana yang bocor.' },
      { label: 'Checklist optimasi toko', text: 'Buatkan checklist optimasi toko (judul, deskripsi AIDA, gambar, dekorasi) untuk produk: …' },
    ],
  },
  {
    id: 'sutradara',
    name: 'Sutradara Video Ads',
    short: 'Sutradara',
    role: 'Script, hook, shot list & evaluasi iklan Meta · kerangka Video Ads 101',
    icon: '🎬',
    active: true,
    tier: 'hemat',
    acceptsFile: true,
    look: { shirt: 0xd9534f, pants: 0x30343f, hair: 0x1b1b1b, skin: 0xd9a066, cap: 0xf4f1e8 },
    spot: { x: 23, y: 5 },
    greeting:
      'Assalamu’alaikum. Saya **Sutradara Video Ads**. Sebutkan produknya (nama, harga, siapa pembelinya, keunggulan), nanti saya buatkan dari Kartu Kesiapan sampai script berwarna, 5 hook, dan shot list — sesuai rambu syariat dan kebijakan Meta.',
    quick: [
      { label: 'Paket iklan lengkap', text: 'Buatkan paket iklan video lengkap untuk produk: … Harga: Rp…, target pembeli: …, keunggulan: …, budget testing: Rp…/hari.' },
      { label: '5 hook untuk produk', text: 'Buatkan 5 variasi hook (jenis berbeda) untuk video produk: … Angle: …' },
      { label: 'Script video klip 30 dtk', text: 'Buatkan script video klip 30 detik dalam format tabel berwarna untuk produk: …' },
      { label: 'Evaluasi hasil iklan', text: 'Evaluasi hasil iklan terlampir (export Ads Manager). Beri diagnosis dan 1 tindakan per kreatif.' },
    ],
  },
  {
    id: 'umrah',
    name: 'Kreator Konten Umrah',
    short: 'Umrah',
    role: 'Konten umrah mandiri — segera hadir',
    icon: '🕋',
    active: false,
    look: { shirt: 0xf4f1e8, pants: 0xf4f1e8, hair: 0x2a1f1a, skin: 0xe0ac7e, cap: 0xffffff },
    spot: { x: 7, y: 14 },
  },
  {
    id: 'closing',
    name: 'CS Closing Chat',
    short: 'Closing',
    role: 'Balas & giring chat pembeli sampai closing — segera hadir',
    icon: '💬',
    active: false,
    look: { shirt: 0x5b7cfa, pants: 0x2d3142, hair: 0x3a2a20, skin: 0xe8b98a, cap: null },
    spot: { x: 23, y: 14 },
  },
];

export const agentById = (id) => AGENTS.find((a) => a.id === id);
