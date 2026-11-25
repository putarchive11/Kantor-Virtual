// Grid A* sederhana untuk "klik lantai → berjalan menghindari perabot".

export class NavGrid {
  /**
   * @param {number} width lebar dunia (px)
   * @param {number} height tinggi dunia (px)
   * @param {number} cell ukuran sel (px)
   * @param {{x:number,y:number,w:number,h:number}[]} blocks persegi penghalang
   * @param {number} pad jarak aman (setengah lebar badan pemain)
   */
  constructor(width, height, cell, blocks, pad = 8) {
    this.cell = cell;
    this.cols = Math.ceil(width / cell);
    this.rows = Math.ceil(height / cell);
    this.blocked = new Uint8Array(this.cols * this.rows);
    for (const b of blocks) {
      const x0 = Math.max(0, Math.floor((b.x - pad) / cell));
      const y0 = Math.max(0, Math.floor((b.y - pad) / cell));
      const x1 = Math.min(this.cols - 1, Math.floor((b.x + b.w + pad - 1) / cell));
      const y1 = Math.min(this.rows - 1, Math.floor((b.y + b.h + pad - 1) / cell));
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) this.blocked[y * this.cols + x] = 1;
    }
  }

  isFree(cx, cy) {
    return cx >= 0 && cy >= 0 && cx < this.cols && cy < this.rows && !this.blocked[cy * this.cols + cx];
  }

  toCell(px, py) {
    return [Math.floor(px / this.cell), Math.floor(py / this.cell)];
  }

  center(cx, cy) {
    return { x: cx * this.cell + this.cell / 2, y: cy * this.cell + this.cell / 2 };
  }

  /** Sel bebas terdekat dari (cx,cy) — dipakai bila tujuan klik ada di atas perabot. */
  nearestFree(cx, cy, maxR = 12) {
    if (this.isFree(cx, cy)) return [cx, cy];
    for (let r = 1; r <= maxR; r++) {
      let best = null;
      let bestD = Infinity;
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          if (!this.isFree(cx + dx, cy + dy)) continue;
          const d = dx * dx + dy * dy;
          if (d < bestD) {
            bestD = d;
            best = [cx + dx, cy + dy];
          }
        }
      }
      if (best) return best;
    }
    return null;
  }

  /** A* 8 arah tanpa memotong sudut. Mengembalikan daftar titik (px) atau null. */
  find(sx, sy, tx, ty) {
    let [ax, ay] = this.toCell(sx, sy);
    const start = this.nearestFree(ax, ay, 3);
    const [bx, by] = this.toCell(tx, ty);
    const goal = this.nearestFree(bx, by);
    if (!start || !goal) return null;
    [ax, ay] = start;
    const { cols } = this;
    const idx = (x, y) => y * cols + x;
    const startI = idx(ax, ay);
    const goalI = idx(goal[0], goal[1]);
    const g = new Float32Array(this.cols * this.rows).fill(Infinity);
    const came = new Int32Array(this.cols * this.rows).fill(-1);
    const closed = new Uint8Array(this.cols * this.rows);
    const h = (i) => {
      const dx = Math.abs((i % cols) - goal[0]);
      const dy = Math.abs(Math.floor(i / cols) - goal[1]);
      return Math.max(dx, dy) + (Math.SQRT2 - 1) * Math.min(dx, dy);
    };
    // Binary heap kecil.
    const heap = [];
    const push = (i, f) => {
      heap.push([f, i]);
      let k = heap.length - 1;
      while (k > 0) {
        const p = (k - 1) >> 1;
        if (heap[p][0] <= heap[k][0]) break;
        [heap[p], heap[k]] = [heap[k], heap[p]];
        k = p;
      }
    };
    const pop = () => {
      const top = heap[0];
      const last = heap.pop();
      if (heap.length) {
        heap[0] = last;
        let k = 0;
        for (;;) {
          const l = 2 * k + 1;
          const r = l + 1;
          let m = k;
          if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
          if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
          if (m === k) break;
          [heap[m], heap[k]] = [heap[k], heap[m]];
          k = m;
        }
      }
      return top[1];
    };

    g[startI] = 0;
    push(startI, h(startI));
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
    while (heap.length) {
      const cur = pop();
      if (closed[cur]) continue;
      if (cur === goalI) break;
      closed[cur] = 1;
      const cx = cur % cols;
      const cy = Math.floor(cur / cols);
      for (const [dx, dy] of dirs) {
        const nx = cx + dx;
        const ny = cy + dy;
        if (!this.isFree(nx, ny)) continue;
        if (dx && dy && (!this.isFree(cx + dx, cy) || !this.isFree(cx, cy + dy))) continue;
        const ni = idx(nx, ny);
        const ng = g[cur] + (dx && dy ? Math.SQRT2 : 1);
        if (ng < g[ni]) {
          g[ni] = ng;
          came[ni] = cur;
          push(ni, ng + h(ni));
        }
      }
    }
    if (came[goalI] === -1 && goalI !== startI) return null;

    const cells = [];
    for (let i = goalI; i !== -1; i = came[i]) cells.push(i);
    cells.reverse();
    // Rapikan: buang titik yang segaris supaya gerakan tidak patah-patah.
    const pts = [];
    for (let k = 1; k < cells.length; k++) {
      const prev = cells[k - 1];
      const cur = cells[k];
      const next = cells[k + 1];
      const d1 = [(cur % cols) - (prev % cols), Math.floor(cur / cols) - Math.floor(prev / cols)];
      const d2 = next === undefined ? null : [(next % cols) - (cur % cols), Math.floor(next / cols) - Math.floor(cur / cols)];
      if (!d2 || d1[0] !== d2[0] || d1[1] !== d2[1]) pts.push(this.center(cur % cols, Math.floor(cur / cols)));
    }
    return pts;
  }
}
