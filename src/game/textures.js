// Semua grafis digambar dengan kode (tanpa file gambar) — ringan dan bebas lisensi.

const shade = (c, f) => {
  const r = Math.min(255, Math.max(0, Math.round(((c >> 16) & 255) * f)));
  const g = Math.min(255, Math.max(0, Math.round(((c >> 8) & 255) * f)));
  const b = Math.min(255, Math.max(0, Math.round((c & 255) * f)));
  return (r << 16) | (g << 8) | b;
};

function make(scene, key, w, h, draw) {
  if (scene.textures.exists(key)) return;
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  draw(g, w, h);
  g.generateTexture(key, w, h);
  g.destroy();
}

/** Karakter 24×34: frame 0 diam, 1 & 2 langkah. */
function character(scene, key, look, { headset = false } = {}) {
  for (let f = 0; f < 3; f++) {
    make(scene, `${key}-${f}`, 24, 34, (g) => {
      const leg = f === 1 ? -2 : f === 2 ? 2 : 0;
      // bayangan
      g.fillStyle(0x000000, 0.22).fillEllipse(12, 31, 18, 6);
      // kaki
      g.fillStyle(look.pants).fillRect(7, 22 + Math.max(0, leg), 4, 8 - Math.abs(leg) / 2);
      g.fillRect(13, 22 + Math.max(0, -leg), 4, 8 - Math.abs(leg) / 2);
      g.fillStyle(0x222222).fillRect(6, 29 + Math.max(0, leg) - (leg > 0 ? 1 : 0), 6, 2);
      g.fillRect(12, 29 + Math.max(0, -leg) - (leg < 0 ? 1 : 0), 6, 2);
      // badan
      g.fillStyle(look.shirt).fillRoundedRect(5, 13, 14, 11, 3);
      g.fillStyle(shade(look.shirt, 0.8)).fillRect(5, 21, 14, 3);
      // lengan
      const arm = f === 0 ? 0 : f === 1 ? 1 : -1;
      g.fillStyle(shade(look.shirt, 0.9)).fillRoundedRect(2, 14 + arm, 4, 8, 2).fillRoundedRect(18, 14 - arm, 4, 8, 2);
      g.fillStyle(look.skin).fillRect(2, 21 + arm, 4, 2).fillRect(18, 21 - arm, 4, 2);
      // kerah
      g.fillStyle(shade(look.shirt, 1.25)).fillTriangle(9, 13, 15, 13, 12, 16);
      // kepala
      g.fillStyle(look.skin).fillRoundedRect(6, 2, 12, 12, 4);
      g.fillStyle(look.hair).fillRoundedRect(6, 2, 12, 4, { tl: 4, tr: 4, bl: 0, br: 0 });
      g.fillRect(6, 4, 2, 4).fillRect(16, 4, 2, 4);
      if (look.cap) {
        g.fillStyle(look.cap).fillRoundedRect(6, 0, 12, 5, { tl: 3, tr: 3, bl: 0, br: 0 });
        g.fillStyle(shade(look.cap, 0.85)).fillRect(6, 4, 12, 1);
      }
      // mata
      g.fillStyle(0x1d1d1d).fillRect(9, 8, 2, 2).fillRect(13, 8, 2, 2);
      g.fillStyle(shade(look.skin, 0.8)).fillRect(11, 11, 2, 1);
      if (headset) {
        g.fillStyle(0x2b2b33).fillRect(5, 3, 14, 2);
        g.fillRect(4, 6, 3, 5).fillRect(17, 6, 3, 5);
        g.fillStyle(0x3ddc97).fillRect(4, 8, 1, 2);
        g.lineStyle(1, 0x2b2b33).lineBetween(6, 10, 10, 12);
      }
    });
  }
}

export function buildTextures(scene, agents) {
  // Lantai kayu
  make(scene, 'floor', 32, 32, (g) => {
    g.fillStyle(0xdcc9a6).fillRect(0, 0, 32, 32);
    g.fillStyle(0xd2bd97).fillRect(0, 0, 32, 8).fillRect(0, 16, 32, 8);
    g.fillStyle(0xc3ad86).fillRect(0, 7, 32, 1).fillRect(0, 15, 32, 1).fillRect(0, 23, 32, 1).fillRect(0, 31, 32, 1);
    g.fillRect(10, 0, 1, 8).fillRect(26, 8, 1, 8).fillRect(4, 16, 1, 8).fillRect(20, 24, 1, 8);
    g.fillStyle(0xe6d5b5, 0.6).fillRect(13, 3, 6, 1).fillRect(2, 19, 5, 1);
  });

  // Meja kerja dengan monitor & keyboard
  make(scene, 'desk', 72, 46, (g) => {
    g.fillStyle(0x000000, 0.2).fillRoundedRect(3, 8, 68, 38, 6);
    g.fillStyle(0x6e4a32).fillRoundedRect(0, 4, 70, 38, 5);
    g.fillStyle(0x8b5e3c).fillRoundedRect(0, 0, 70, 34, 5);
    g.fillStyle(0x9c6b45).fillRect(4, 3, 62, 2);
    // monitor
    g.fillStyle(0x1e1e24).fillRoundedRect(20, 2, 30, 18, 2);
    g.fillStyle(0x3b8bd9).fillRect(22, 4, 26, 13);
    g.fillStyle(0x7fc4ff).fillRect(24, 6, 10, 2).fillRect(24, 10, 18, 1).fillRect(24, 13, 14, 1);
    g.fillStyle(0x1e1e24).fillRect(33, 20, 4, 3).fillRect(29, 22, 12, 2);
    // keyboard & mouse
    g.fillStyle(0x2c2c34).fillRoundedRect(22, 25, 24, 6, 1);
    g.fillStyle(0x4a4a55).fillRect(24, 27, 20, 1);
    g.fillStyle(0xe8e8ee).fillRoundedRect(50, 26, 4, 5, 2);
    // cangkir & kertas
    g.fillStyle(0xf5f0e6).fillRect(6, 8, 10, 13);
    g.fillStyle(0xc9c1b0).fillRect(8, 11, 6, 1).fillRect(8, 14, 6, 1).fillRect(8, 17, 4, 1);
    g.fillStyle(0xffffff).fillCircle(60, 12, 4);
    g.fillStyle(0x6b3e26).fillCircle(60, 12, 2.5);
  });

  make(scene, 'chair', 24, 24, (g) => {
    g.fillStyle(0x000000, 0.2).fillEllipse(12, 20, 20, 7);
    g.fillStyle(0x2f3142).fillRoundedRect(3, 2, 18, 8, 3);
    g.fillStyle(0x3d4056).fillRoundedRect(4, 9, 16, 10, 3);
    g.fillStyle(0x1f2130).fillRect(11, 18, 2, 4);
  });

  make(scene, 'plant', 26, 38, (g) => {
    g.fillStyle(0x000000, 0.2).fillEllipse(13, 35, 20, 6);
    g.fillStyle(0xb5653d).fillRoundedRect(6, 22, 14, 13, 3);
    g.fillStyle(0xcf7a4d).fillRect(5, 22, 16, 3);
    g.fillStyle(0x2f8f4e).fillCircle(13, 12, 9).fillCircle(7, 17, 6).fillCircle(19, 17, 6);
    g.fillStyle(0x45b36b).fillCircle(10, 9, 4).fillCircle(17, 13, 4).fillCircle(8, 16, 3);
  });

  make(scene, 'sofa', 104, 44, (g) => {
    g.fillStyle(0x000000, 0.22).fillRoundedRect(4, 10, 100, 34, 8);
    g.fillStyle(0x3d3f7a).fillRoundedRect(0, 0, 100, 22, 8);
    g.fillStyle(0x50539a).fillRoundedRect(0, 14, 100, 26, 8);
    g.fillStyle(0x5d61ad).fillRoundedRect(14, 17, 35, 18, 4).fillRoundedRect(51, 17, 35, 18, 4);
    g.fillStyle(0x3d3f7a).fillRoundedRect(0, 12, 12, 28, 5).fillRoundedRect(88, 12, 12, 28, 5);
  });

  make(scene, 'coffee', 60, 34, (g) => {
    g.fillStyle(0x000000, 0.2).fillRoundedRect(3, 6, 58, 28, 6);
    g.fillStyle(0x5b3b28).fillRoundedRect(0, 2, 58, 28, 6);
    g.fillStyle(0x7a5136).fillRoundedRect(0, 0, 58, 24, 6);
    g.fillStyle(0xffffff).fillCircle(16, 11, 4);
    g.fillStyle(0x6b3e26).fillCircle(16, 11, 2.5);
    g.fillStyle(0xe7d8b8).fillRect(30, 6, 18, 12);
    g.fillStyle(0x2f8f4e).fillRect(32, 8, 14, 2);
  });

  make(scene, 'roundtable', 76, 70, (g) => {
    g.fillStyle(0x000000, 0.2).fillEllipse(40, 42, 72, 50);
    g.fillStyle(0x7a5136).fillEllipse(38, 38, 72, 50);
    g.fillStyle(0x9c6b45).fillEllipse(38, 34, 72, 50);
    g.fillStyle(0xb07c52, 0.6).fillEllipse(30, 28, 30, 14);
    g.fillStyle(0xf5f0e6).fillRect(46, 30, 14, 10);
    g.fillStyle(0x2c2c34).fillRoundedRect(20, 32, 18, 11, 2);
    g.fillStyle(0x3b8bd9).fillRect(22, 34, 14, 7);
  });

  make(scene, 'shelf', 72, 50, (g) => {
    g.fillStyle(0x000000, 0.2).fillRect(3, 8, 70, 42);
    g.fillStyle(0x5a3a26).fillRect(0, 0, 70, 46);
    g.fillStyle(0x3f281a).fillRect(4, 4, 62, 18).fillRect(4, 25, 62, 18);
    const cols = [0x2f8f4e, 0xc0392b, 0x2e6fd1, 0xe0a526, 0x7d3c98, 0x16a085, 0xd35400, 0xf4f1e8];
    let x = 5;
    let i = 0;
    while (x < 64) {
      const w = 4 + (i % 3);
      const h = 13 + ((i * 7) % 5);
      g.fillStyle(cols[i % cols.length]).fillRect(x, 22 - h, w, h);
      g.fillStyle(cols[(i + 3) % cols.length]).fillRect(x, 43 - (h - 1), w, h - 1);
      g.fillStyle(0xf1c40f, 0.8).fillRect(x + 1, 22 - h + 3, w - 2, 1);
      x += w + 1;
      i++;
    }
  });

  // Sajadah (musholla)
  make(scene, 'rug', 30, 52, (g) => {
    g.fillStyle(0x0f5132).fillRoundedRect(0, 0, 30, 52, 3);
    g.fillStyle(0x1e7b4f).fillRoundedRect(3, 3, 24, 46, 2);
    g.fillStyle(0xd4af37).fillRect(3, 44, 24, 2);
    g.fillStyle(0x0f5132).fillTriangle(6, 18, 24, 18, 15, 7).fillRect(6, 18, 18, 16);
    g.fillStyle(0xd4af37).fillRect(14, 10, 2, 3);
    g.fillStyle(0xf4f1e8).fillRect(0, 50, 30, 2).fillRect(0, 0, 30, 2);
  });

  make(scene, 'whiteboard', 110, 48, (g) => {
    g.fillStyle(0xaab0bd).fillRect(0, 0, 110, 46);
    g.fillStyle(0xffffff).fillRect(3, 3, 104, 38);
    g.fillStyle(0x7b8190).fillRect(10, 41, 90, 4);
    g.lineStyle(2, 0x2e6fd1).strokeRect(10, 9, 26, 20);
    g.lineStyle(2, 0x3ddc97).lineBetween(42, 26, 52, 18).lineBetween(52, 18, 62, 22).lineBetween(62, 22, 74, 10);
    g.fillStyle(0xd9534f).fillRect(80, 10, 20, 3).fillRect(80, 17, 14, 3).fillRect(80, 24, 18, 3);
  });

  make(scene, 'ringlight', 34, 54, (g) => {
    g.fillStyle(0x000000, 0.2).fillEllipse(17, 51, 22, 6);
    g.lineStyle(2, 0x2b2b33).lineBetween(17, 26, 17, 50).lineBetween(17, 50, 9, 52).lineBetween(17, 50, 25, 52);
    g.lineStyle(5, 0xfff6d6).strokeCircle(17, 14, 11);
    g.lineStyle(1, 0xffffff, 0.8).strokeCircle(17, 14, 13);
    g.fillStyle(0x2b2b33).fillRect(14, 12, 6, 4);
  });

  make(scene, 'camera', 30, 50, (g) => {
    g.fillStyle(0x000000, 0.2).fillEllipse(15, 47, 22, 6);
    g.lineStyle(2, 0x3a3a44).lineBetween(15, 18, 6, 47).lineBetween(15, 18, 24, 47).lineBetween(15, 18, 15, 46);
    g.fillStyle(0x1e1e24).fillRoundedRect(5, 4, 20, 14, 2);
    g.fillStyle(0x3a3a44).fillCircle(15, 11, 5);
    g.fillStyle(0x6aa8ff).fillCircle(15, 11, 2.5);
    g.fillStyle(0xd9534f).fillCircle(22, 6, 1.5);
  });

  make(scene, 'backdrop', 120, 30, (g) => {
    g.fillStyle(0x3a3a44).fillRect(0, 0, 4, 30).fillRect(116, 0, 4, 30);
    g.fillStyle(0x2fa36b).fillRect(4, 2, 112, 26);
    g.fillStyle(0x38b97a).fillRect(4, 2, 112, 4);
  });

  make(scene, 'dispenser', 22, 42, (g) => {
    g.fillStyle(0x000000, 0.2).fillEllipse(11, 39, 18, 6);
    g.fillStyle(0xe8e8ee).fillRoundedRect(3, 16, 16, 22, 2);
    g.fillStyle(0x9fd3ff, 0.85).fillRoundedRect(4, 0, 14, 17, 5);
    g.fillStyle(0xd9534f).fillRect(6, 24, 3, 3);
    g.fillStyle(0x2e6fd1).fillRect(13, 24, 3, 3);
  });

  make(scene, 'printer', 40, 30, (g) => {
    g.fillStyle(0x000000, 0.2).fillRect(2, 6, 40, 24);
    g.fillStyle(0xc9ccd6).fillRoundedRect(0, 4, 38, 22, 3);
    g.fillStyle(0x9aa0ad).fillRect(4, 8, 30, 4);
    g.fillStyle(0xffffff).fillRect(8, 0, 22, 8);
    g.fillStyle(0x3ddc97).fillRect(30, 18, 3, 2);
  });

  make(scene, 'cabinet', 40, 52, (g) => {
    g.fillStyle(0x000000, 0.2).fillRect(3, 6, 40, 46);
    g.fillStyle(0x4a5060).fillRect(0, 0, 38, 48);
    g.fillStyle(0x5b6274).fillRect(3, 3, 32, 13).fillRect(3, 18, 32, 13).fillRect(3, 33, 32, 12);
    g.fillStyle(0xaab0bd).fillRect(15, 8, 8, 2).fillRect(15, 23, 8, 2).fillRect(15, 38, 8, 2);
  });

  make(scene, 'clock', 22, 22, (g) => {
    g.fillStyle(0x2b2b33).fillCircle(11, 11, 11);
    g.fillStyle(0xffffff).fillCircle(11, 11, 9);
    g.fillStyle(0x2b2b33).fillRect(10, 3, 2, 2).fillRect(10, 17, 2, 2).fillRect(3, 10, 2, 2).fillRect(17, 10, 2, 2);
  });

  make(scene, 'frame', 46, 30, (g) => {
    g.fillStyle(0x8b5e3c).fillRect(0, 0, 46, 30);
    g.fillStyle(0x0f5132).fillRect(3, 3, 40, 24);
    g.fillStyle(0xd4af37).fillRect(8, 13, 30, 2).fillRect(13, 9, 20, 1).fillRect(15, 19, 16, 1);
  });

  make(scene, 'window', 70, 30, (g) => {
    g.fillStyle(0x5d636d).fillRect(0, 0, 70, 30);
    g.fillStyle(0x9fd3ff).fillRect(3, 3, 31, 24).fillRect(36, 3, 31, 24);
    g.fillStyle(0xd8efff, 0.7).fillTriangle(5, 25, 20, 5, 25, 5).fillTriangle(40, 25, 55, 5, 60, 5);
  });

  make(scene, 'door', 64, 14, (g) => {
    g.fillStyle(0x6e4a32).fillRect(0, 0, 64, 14);
    g.fillStyle(0x8b5e3c).fillRect(2, 2, 29, 10).fillRect(33, 2, 29, 10);
    g.fillStyle(0xd4af37).fillRect(28, 6, 2, 3).fillRect(34, 6, 2, 3);
  });

  make(scene, 'spark', 8, 8, (g) => {
    g.fillStyle(0xffffff).fillCircle(4, 4, 3);
  });

  character(scene, 'player', { shirt: 0x1f6feb, pants: 0x2d3142, hair: 0x1b1b1b, skin: 0xe0ac7e, cap: 0x1b1b1b });
  for (const a of agents) character(scene, `agent-${a.id}`, a.look, { headset: true });
}
