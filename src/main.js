import './style.css';
import Phaser from 'phaser';
import { OfficeScene } from './game/OfficeScene.js';
import { initUI } from './ui.js';
import { on } from './store.js';

async function boot() {
  // Tunggu font supaya label di kanvas tidak memakai font cadangan (maks 1,5 detik).
  await Promise.race([document.fonts?.ready, new Promise((r) => setTimeout(r, 1500))]);

  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'game',
    pixelArt: true,
    backgroundColor: '#16141c',
    // RESIZE: kanvas mengisi layar; kamera yang mengatur zoom (lihat OfficeScene.fitCamera).
    scale: { mode: Phaser.Scale.RESIZE, width: '100%', height: '100%' },
    physics: { default: 'arcade', arcade: { debug: false } },
    input: { keyboard: { capture: [] } },
    scene: [OfficeScene],
  });

  // Panel membuka/menutup mengubah lebar area game → hitung ulang skala.
  const host = document.getElementById('game');
  new ResizeObserver(() => game.scale.refresh()).observe(host);

  on('scene-ready', () => {
    initUI();
    const l = document.getElementById('loading');
    l.classList.add('gone');
    setTimeout(() => l.remove(), 500);
  });

  // Untuk pengujian otomatis.
  window.__kantor = game;
}

boot();
