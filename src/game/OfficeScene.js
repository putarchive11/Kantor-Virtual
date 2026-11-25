import Phaser from 'phaser';
import { AGENTS, agentById } from '../agents.js';
import { buildTextures } from './textures.js';
import { NavGrid } from './path.js';
import { emit, on } from '../store.js';

export const T = 32;
export const COLS = 30;
export const ROWS = 19;
export const W = COLS * T; // 960
export const H = ROWS * T; // 608
const WALL_TOP = 64; // tinggi dinding atas (2 tile)
const WALL = 12; // tebal dinding samping/bawah
const SPEED = 155;
const TALK_RADIUS = 62;
const FONT = '"Plus Jakarta Sans", system-ui, sans-serif';

const isTyping = () => {
  const el = document.activeElement;
  return el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT');
};

export class OfficeScene extends Phaser.Scene {
  constructor() {
    super('office');
    this.blocks = []; // persegi penghalang untuk navigasi
    this.agentObjs = new Map();
    this.path = null;
    this.pendingOpen = null;
    this.near = undefined;
    this.panelOpen = false;
  }

  create() {
    buildTextures(this, AGENTS);
    this.physics.world.setBounds(WALL, WALL_TOP, W - WALL * 2, H - WALL_TOP - WALL);
    this.solids = this.physics.add.staticGroup();

    this.drawRoom();
    this.drawZones();
    this.placeFurniture();
    AGENTS.forEach((a) => this.placeAgent(a));
    this.createPlayer();

    this.nav = new NavGrid(W, H, 16, this.blocks, 8);
    this.setupInput();

    on('agent-status', ({ id, status }) => this.setAgentStatus(id, status));
    on('go-to-agent', (id) => this.walkToAgent(id, true));
    on('panel-opened', () => (this.panelOpen = true));
    on('panel-closed', () => (this.panelOpen = false));

    this.cameras.main.setBackgroundColor('#16141c');
    this.fitCamera();
    this.scale.on('resize', () => this.fitCamera());
    this.cameras.main.fadeIn(500, 22, 20, 28);
    emit('scene-ready');
  }

  /** Layar lebar: seluruh kantor terlihat. Layar sempit (HP): zoom lebih dekat dan kamera mengikuti pemain. */
  fitCamera() {
    const cam = this.cameras.main;
    const { width, height } = this.scale.gameSize;
    if (!width || !height) return;
    cam.setViewport(0, 0, width, height);
    const fit = Math.min(width / W, height / H);
    const zoom = fit >= 0.7 ? fit : Math.max(fit, Math.min(0.85, height / H));
    cam.setZoom(zoom);
    if (zoom > fit + 0.001) {
      cam.setBounds(0, 0, W, H);
      cam.startFollow(this.player, true, 0.15, 0.15);
    } else {
      cam.stopFollow();
      cam.removeBounds();
      cam.centerOn(W / 2, H / 2);
    }
  }

  /* ---------------------------------------------------------------- ruangan */

  block(x, y, w, h) {
    this.blocks.push({ x, y, w, h });
    const z = this.add.zone(x + w / 2, y + h / 2, w, h);
    this.physics.add.existing(z, true);
    this.solids.add(z);
    return z;
  }

  drawRoom() {
    this.add.tileSprite(W / 2, (WALL_TOP + H) / 2, W - WALL * 2, H - WALL_TOP, 'floor').setDepth(-100);

    const g = this.add.graphics().setDepth(-90);
    // bayangan dinding di lantai
    g.fillStyle(0x000000, 0.12).fillRect(WALL, WALL_TOP, W - WALL * 2, 10);
    g.fillStyle(0x000000, 0.08).fillRect(WALL, WALL_TOP, 8, H - WALL_TOP).fillRect(W - WALL - 8, WALL_TOP, 8, H - WALL_TOP);

    const wall = this.add.graphics().setDepth(-80);
    // dinding atas: tutup + muka dinding
    wall.fillStyle(0x4b505c).fillRect(0, 0, W, 14);
    wall.fillStyle(0xe9e4da).fillRect(WALL, 14, W - WALL * 2, WALL_TOP - 14);
    wall.fillStyle(0xd9d2c4).fillRect(WALL, WALL_TOP - 10, W - WALL * 2, 10);
    wall.fillStyle(0xbfb6a5).fillRect(WALL, WALL_TOP - 2, W - WALL * 2, 2);
    // dinding samping & bawah (tampak dari atas)
    wall.fillStyle(0x5d636d).fillRect(0, 0, WALL, H).fillRect(W - WALL, 0, WALL, H).fillRect(0, H - WALL, W, WALL);
    wall.fillStyle(0x6c7380).fillRect(2, 0, WALL - 4, H).fillRect(W - WALL + 2, 0, WALL - 4, H).fillRect(0, H - WALL + 2, W, WALL - 4);

    // pintu
    this.add.image(W / 2, H - WALL / 2, 'door').setDepth(-70);
    const mat = this.add.graphics().setDepth(-95);
    mat.fillStyle(0x7a2e2e, 0.9).fillRoundedRect(W / 2 - 40, H - WALL - 30, 80, 26, 4);
    mat.fillStyle(0x9b3b3b).fillRoundedRect(W / 2 - 36, H - WALL - 27, 72, 20, 3);
    this.add.text(W / 2, H - WALL - 17, 'MARHABAN', { fontFamily: FONT, fontSize: '10px', fontStyle: '700', color: '#f3d9a4', resolution: 2 }).setOrigin(0.5).setDepth(-94).setLetterSpacing(2);

    // batas tabrakan dinding
    this.block(0, 0, W, WALL_TOP);
    this.block(0, 0, WALL, H);
    this.block(W - WALL, 0, WALL, H);
    this.block(0, H - WALL, W, WALL);

    // hiasan dinding
    this.add.image(132, 34, 'window').setDepth(-75);
    this.add.image(352, 34, 'frame').setDepth(-75);
    this.add.image(480, 38, 'whiteboard').setDepth(-75);
    this.add.image(600, 30, 'clock').setDepth(-75);
    this.add.image(842, 34, 'window').setDepth(-75);
    this.clockHand = this.add.graphics().setDepth(-74);
  }

  drawZones() {
    const g = this.add.graphics().setDepth(-96);
    const zone = (x, y, w, h, color, alpha = 0.35) => {
      g.fillStyle(color, alpha).fillRoundedRect(x, y, w, h, 10);
      g.lineStyle(2, color, 0.55).strokeRoundedRect(x, y, w, h, 10);
    };
    zone(64, 84, 320, 160, 0x3ddc97, 0.18); // marketplace
    zone(576, 84, 320, 160, 0x6aa8ff, 0.18); // studio
    zone(64, 372, 320, 150, 0xd4af37, 0.16); // umrah
    zone(576, 372, 320, 150, 0xb48cff, 0.16); // closing
    zone(24, 262, 150, 92, 0x0f5132, 0.22); // musholla
    zone(392, 112, 176, 150, 0x9c6b45, 0.16); // rapat

    const label = (x, y, text, color) =>
      this.add
        .text(x, y, text, { fontFamily: FONT, fontSize: '11px', fontStyle: '800', color, resolution: 2 })
        .setOrigin(0, 0)
        .setAlpha(0.75)
        .setDepth(-95)
        .setLetterSpacing(2);
    label(76, 226, 'MARKETPLACE', '#1d7a52');
    label(588, 226, 'STUDIO VIDEO', '#2e5fa8');
    label(76, 504, 'KONTEN UMRAH', '#8a6d10');
    label(588, 504, 'CLOSING CHAT', '#6b4bb3');
    label(32, 338, 'MUSHOLLA', '#0f5132');
    label(404, 244, 'RUANG RAPAT', '#6e4a32');
  }

  prop(key, x, y, { solid = null, depthOffset = 0 } = {}) {
    const img = this.add.image(x, y, key);
    img.setDepth(y + img.height / 2 + depthOffset);
    if (solid) this.block(x + solid[0], y + solid[1], solid[2], solid[3]);
    return img;
  }

  placeFurniture() {
    // Studio
    this.prop('backdrop', 736, 82, { depthOffset: -200 });
    this.prop('ringlight', 664, 112, { solid: [-12, 8, 24, 20] });
    this.prop('camera', 812, 112, { solid: [-10, 8, 20, 18] });

    // Ruang rapat
    this.prop('roundtable', 480, 186, { solid: [-34, -20, 68, 44] });
    for (const [dx, dy] of [[-48, -6], [48, -6], [0, -40], [-30, 32], [30, 32]]) {
      this.prop('chair', 480 + dx, 186 + dy, { depthOffset: dy > 0 ? 20 : -20 });
    }

    // Musholla & maktabah
    this.prop('rug', 50, 300);
    this.prop('rug', 86, 300);
    this.prop('rug', 122, 300);
    this.prop('shelf', 140, 92, { solid: [-36, -10, 72, 30] });
    this.prop('shelf', 330, 92, { solid: [-36, -10, 72, 30] });

    // Lounge kanan tengah
    this.prop('coffee', 840, 300, { solid: [-29, -10, 58, 26] });
    this.prop('sofa', 840, 346, { solid: [-50, -12, 100, 30] });
    this.prop('plant', 924, 300, { solid: [-9, 8, 18, 12] });

    // Lain-lain
    this.prop('dispenser', 932, 120, { solid: [-9, 4, 18, 18] });
    this.prop('cabinet', 32, 110, { solid: [-19, -6, 38, 30] });
    this.prop('printer', 420, 330, { solid: [-19, -6, 38, 20] });
    this.prop('plant', 30, 560, { solid: [-9, 8, 18, 12] });
    this.prop('plant', 930, 560, { solid: [-9, 8, 18, 12] });
    this.prop('plant', 410, 560, { solid: [-9, 8, 18, 12] });
    this.prop('plant', 550, 560, { solid: [-9, 8, 18, 12] });
    this.prop('plant', 574, 300, { solid: [-9, 8, 18, 12] });
  }

  /* ---------------------------------------------------------------- agen */

  nameTag(text, { dot = 0x3ddc97, sub = null } = {}) {
    const c = this.add.container(0, 0);
    const t = this.add.text(0, 0, text, { fontFamily: FONT, fontSize: '11px', fontStyle: '700', color: '#ffffff', resolution: 2 }).setOrigin(0, 0.5);
    const w = t.width + 24;
    const bg = this.add.graphics();
    bg.fillStyle(0x16141c, 0.82).fillRoundedRect(-w / 2, -10, w, 20, 7);
    const d = this.add.graphics();
    d.fillStyle(dot).fillCircle(-w / 2 + 9, 0, 3.5);
    t.setX(-w / 2 + 16);
    c.add([bg, d, t]);
    c.dot = d;
    c.dotX = -w / 2 + 9;
    c.setDepth(10_000);
    if (sub) c.sub = sub;
    return c;
  }

  setTagDot(tag, color) {
    tag.dot.clear().fillStyle(color).fillCircle(tag.dotX, 0, 3.5);
  }

  placeAgent(a) {
    const x = a.spot.x * T;
    const y = a.spot.y * T;
    const desk = this.add.image(x, y, 'desk').setDepth(y + 14);
    this.add.image(x, y - 32, 'chair').setDepth(y - 32);
    const npc = this.add.sprite(x, y - 12, `agent-${a.id}-0`).setOrigin(0.5, 1).setDepth(y - 12);
    if (!a.active) {
      npc.setAlpha(0.45);
      desk.setTint(0xbbbbbb);
    }
    this.block(x - 36, y - 46, 72, 66);

    // layar monitor yang berkedip saat bekerja
    const glow = this.add.rectangle(x, y - 12, 26, 13, 0x9fe1ff, 0).setDepth(y + 15);

    const tag = this.nameTag(a.short, { dot: a.active ? 0x3ddc97 : 0x6b6680 });
    tag.setPosition(x, y - 60);
    const icon = this.add.text(x, y - 82, a.icon, { fontSize: '18px', resolution: 2 }).setOrigin(0.5).setDepth(10_000);
    this.tweens.add({ targets: icon, y: y - 86, duration: 1400, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
    this.tweens.add({ targets: npc, scaleY: 1.03, duration: 1800, yoyo: true, repeat: -1, ease: 'Sine.inOut' });

    const bubble = this.add.container(x + 46, y - 74).setDepth(10_001).setVisible(false);
    const bubbleBg = this.add.graphics();
    const bubbleText = this.add.text(0, 0, '', { fontFamily: FONT, fontSize: '11px', fontStyle: '700', color: '#16141c', resolution: 2 }).setOrigin(0, 0.5);
    bubble.add([bubbleBg, bubbleText]);

    this.anims.create({
      key: `agent-${a.id}-work`,
      frames: [{ key: `agent-${a.id}-1` }, { key: `agent-${a.id}-2` }],
      frameRate: 7,
      repeat: -1,
    });

    const hit = this.add.zone(x, y - 20, 80, 90).setInteractive({ useHandCursor: true });
    hit.setData('agentId', a.id);

    this.agentObjs.set(a.id, { a, x, y, npc, desk, glow, tag, icon, bubble, bubbleBg, bubbleText, front: { x, y: y + 42 } });
  }

  showBubble(o, text, bg) {
    o.bubbleText.setText(text);
    const w = o.bubbleText.width + 16;
    o.bubbleBg.clear().fillStyle(bg).fillRoundedRect(-8, -11, w, 22, 8).fillTriangle(-4, 8, 6, 8, -8, 16);
    o.bubbleText.setX(0);
    o.bubble.setVisible(true).setScale(0.6);
    this.tweens.add({ targets: o.bubble, scale: 1, duration: 220, ease: 'Back.out' });
  }

  setAgentStatus(id, status) {
    const o = this.agentObjs.get(id);
    if (!o) return;
    o.workTween?.remove();
    o.dotsTimer?.remove();
    o.glow.setFillStyle(0x9fe1ff, 0);
    if (status === 'working') {
      o.npc.play(`agent-${id}-work`);
      this.setTagDot(o.tag, 0xffb547);
      let n = 0;
      this.showBubble(o, '⚙️ mengerjakan', 0xffe2a8);
      o.dotsTimer = this.time.addEvent({
        delay: 400,
        loop: true,
        callback: () => {
          n = (n + 1) % 4;
          o.bubbleText.setText('⚙️ mengerjakan' + '.'.repeat(n));
        },
      });
      o.glow.setFillStyle(0x9fe1ff, 0.0);
      o.workTween = this.tweens.add({ targets: o.glow, fillAlpha: 0.55, duration: 300, yoyo: true, repeat: -1 });
    } else {
      o.npc.stop().setTexture(`agent-${id}-0`);
      if (status === 'done') {
        this.setTagDot(o.tag, 0x6aa8ff);
        this.showBubble(o, '✅ selesai!', 0xc9f7e1);
        o.workTween = this.tweens.add({ targets: o.bubble, y: o.y - 80, duration: 500, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
        this.sparkle(o.x, o.y - 50);
      } else if (status === 'off') {
        this.setTagDot(o.tag, 0x6b6680);
        this.showBubble(o, 'segera hadir', 0xd6d3df);
        o.bubble.setAlpha(0.8);
      } else {
        this.setTagDot(o.tag, 0x3ddc97);
        o.bubble.setVisible(false).setY(o.y - 74);
      }
    }
  }

  sparkle(x, y) {
    for (let i = 0; i < 10; i++) {
      const s = this.add.image(x, y, 'spark').setDepth(10_002).setScale(0.6).setTint(Phaser.Utils.Array.GetRandom([0x3ddc97, 0xffe08a, 0x6aa8ff]));
      const ang = (Math.PI * 2 * i) / 10;
      this.tweens.add({
        targets: s,
        x: x + Math.cos(ang) * 30,
        y: y + Math.sin(ang) * 24,
        alpha: 0,
        scale: 0.1,
        duration: 700,
        ease: 'Cubic.out',
        onComplete: () => s.destroy(),
      });
    }
  }

  /* ---------------------------------------------------------------- pemain */

  createPlayer() {
    this.anims.create({ key: 'player-walk', frames: [{ key: 'player-1' }, { key: 'player-0' }, { key: 'player-2' }, { key: 'player-0' }], frameRate: 10, repeat: -1 });
    this.player = this.physics.add.sprite(W / 2, H - 52, 'player-0').setOrigin(0.5, 1);
    this.player.body.setSize(14, 8).setOffset(5, 26);
    this.player.setCollideWorldBounds(true);
    this.physics.add.collider(this.player, this.solids);
    this.playerTag = this.nameTag('Anda', { dot: 0x3ddc97 });

    this.marker = this.add.graphics().setDepth(-50).setVisible(false);
    this.marker.lineStyle(2, 0x3ddc97, 0.9).strokeEllipse(0, 0, 22, 10);
  }

  setupInput() {
    // enableCapture=false: tombol tetap bisa diketik di kotak chat.
    this.keys = this.input.keyboard.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT,E,ENTER,SPACE', false);
    this.input.on('pointerdown', (pointer, over) => {
      if (pointer.button !== 0) return;
      const agentHit = over.find((o) => o.getData?.('agentId'));
      if (agentHit) {
        this.walkToAgent(agentHit.getData('agentId'), true);
        return;
      }
      this.pendingOpen = null;
      this.walkTo(pointer.worldX, pointer.worldY);
    });
  }

  walkTo(x, y) {
    const pts = this.nav.find(this.player.x, this.player.y - 4, x, y);
    if (!pts) return false;
    this.path = pts;
    this.stuck = null;
    const end = pts.at(-1) ?? { x: this.player.x, y: this.player.y };
    this.marker.setPosition(end.x, end.y).setVisible(true).setAlpha(1).setScale(1.4);
    this.tweens.add({ targets: this.marker, scale: 1, duration: 250, ease: 'Back.out' });
    return true;
  }

  walkToAgent(id, open) {
    const o = this.agentObjs.get(id);
    if (!o) return;
    if (Phaser.Math.Distance.Between(this.player.x, this.player.y, o.front.x, o.front.y) < TALK_RADIUS) {
      this.path = null;
      if (open) emit('open-agent', id);
      return;
    }
    this.pendingOpen = open ? id : null;
    this.walkTo(o.front.x, o.front.y);
  }

  update(time) {
    const p = this.player;
    const k = this.keys;
    let vx = 0;
    let vy = 0;
    const keyboardOn = !isTyping();
    if (keyboardOn) {
      if (k.A.isDown || k.LEFT.isDown) vx -= 1;
      if (k.D.isDown || k.RIGHT.isDown) vx += 1;
      if (k.W.isDown || k.UP.isDown) vy -= 1;
      if (k.S.isDown || k.DOWN.isDown) vy += 1;
    }

    if (vx || vy) {
      this.path = null;
      this.pendingOpen = null;
      this.marker.setVisible(false);
      const len = Math.hypot(vx, vy);
      p.setVelocity((vx / len) * SPEED, (vy / len) * SPEED);
    } else if (this.path?.length) {
      const t = this.path[0];
      const dx = t.x - p.x;
      const dy = t.y - p.y;
      const d = Math.hypot(dx, dy);
      if (d < 5) {
        this.path.shift();
        if (!this.path.length) {
          p.setVelocity(0, 0);
          this.marker.setVisible(false);
          this.path = null;
        }
      } else {
        p.setVelocity((dx / d) * SPEED, (dy / d) * SPEED);
        // Kalau tersangkut lebih dari 0,6 detik, lepaskan jalur.
        if (!this.stuck || Math.hypot(p.x - this.stuck.x, p.y - this.stuck.y) > 2) this.stuck = { x: p.x, y: p.y, t: time };
        else if (time - this.stuck.t > 600) {
          this.path = null;
          this.pendingOpen = null;
          this.marker.setVisible(false);
        }
      }
    } else {
      p.setVelocity(0, 0);
    }

    const moving = p.body.velocity.lengthSq() > 4;
    if (moving && !this.movedOnce) {
      this.movedOnce = true;
      emit('player-moved');
    }
    if (moving) {
      if (!p.anims.isPlaying) p.play('player-walk');
      if (p.body.velocity.x < -1) p.setFlipX(true);
      else if (p.body.velocity.x > 1) p.setFlipX(false);
    } else if (p.anims.isPlaying) {
      p.stop();
      p.setTexture('player-0');
    }
    p.setDepth(p.y);
    this.playerTag.setPosition(p.x, p.y - 44);

    // Agen terdekat
    let nearest = null;
    let best = TALK_RADIUS;
    for (const [id, o] of this.agentObjs) {
      const d = Phaser.Math.Distance.Between(p.x, p.y, o.front.x, o.front.y);
      if (d < best) {
        best = d;
        nearest = id;
      }
    }
    if (nearest !== this.near) {
      this.near = nearest;
      emit('near-agent', nearest);
    }
    if (nearest && this.pendingOpen === nearest && !this.path) {
      this.pendingOpen = null;
      emit('open-agent', nearest);
    }
    if (keyboardOn && nearest && (Phaser.Input.Keyboard.JustDown(k.E) || Phaser.Input.Keyboard.JustDown(k.ENTER))) {
      emit('open-agent', nearest);
    }

    // jarum jam berjalan sesuai jam perangkat
    if (time - (this.lastClock ?? -1e9) > 1000) {
      this.lastClock = time;
      const now = new Date();
      const hA = ((now.getHours() % 12) + now.getMinutes() / 60) * (Math.PI / 6) - Math.PI / 2;
      const mA = now.getMinutes() * (Math.PI / 30) - Math.PI / 2;
      this.clockHand.clear().lineStyle(2, 0x2b2b33).lineBetween(600, 30, 600 + Math.cos(hA) * 5, 30 + Math.sin(hA) * 5);
      this.clockHand.lineStyle(1.5, 0xd9534f).lineBetween(600, 30, 600 + Math.cos(mA) * 7.5, 30 + Math.sin(mA) * 7.5);
    }
  }
}

export { agentById };
