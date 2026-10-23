// Tile grid + A* pathfinding. Pure module: no rendering, no DOM.
// Coordinates: x grows east, y grows south. A tile (x,y) covers [x,x+1) x [y,y+1).
export class Grid {
  constructor(w, h) {
    this.w = w; this.h = h;
    this.block = new Uint8Array(w * h);   // 1 = solid (walls, furniture)
    this.seat = new Uint8Array(w * h);    // 1 = enterable only as a final destination
  }
  inside(x, y) { return x >= 0 && y >= 0 && x < this.w && y < this.h; }
  i(x, y) { return y * this.w + x; }
  solid(x, y) { return !this.inside(x, y) || this.block[this.i(x, y)] === 1; }
  walkable(x, y) { return this.inside(x, y) && !this.block[this.i(x, y)] && !this.seat[this.i(x, y)]; }
  setBlock(x, y, v = 1) { if (this.inside(x, y)) this.block[this.i(x, y)] = v; }
  setSeat(x, y, v = 1) { if (this.inside(x, y)) this.seat[this.i(x, y)] = v; }

  // 8-way A*, no corner cutting. Returns [{x,y}...] of tile centres excluding the start, or null.
  // The goal tile may be a seat tile (final step only).
  path(sx, sy, gx, gy) {
    sx |= 0; sy |= 0; gx |= 0; gy |= 0;
    if (!this.inside(gx, gy) || this.block[this.i(gx, gy)]) return null;
    if (sx === gx && sy === gy) return [];
    const W = this.w, N = W * this.h;
    const g = new Float32Array(N).fill(Infinity), from = new Int32Array(N).fill(-1), closed = new Uint8Array(N);
    const open = [];                         // tiny binary heap of [f, idx]
    const push = (f, id) => { open.push([f, id]); let k = open.length - 1; while (k > 0) { const p = (k - 1) >> 1; if (open[p][0] <= open[k][0]) break; [open[p], open[k]] = [open[k], open[p]]; k = p; } };
    const pop = () => { const top = open[0], last = open.pop(); if (open.length) { open[0] = last; let k = 0; for (;;) { let l = 2 * k + 1, r = l + 1, m = k; if (l < open.length && open[l][0] < open[m][0]) m = l; if (r < open.length && open[r][0] < open[m][0]) m = r; if (m === k) break; [open[m], open[k]] = [open[k], open[m]]; k = m; } } return top; };
    const h = (x, y) => { const dx = Math.abs(x - gx), dy = Math.abs(y - gy); return (dx + dy) + (Math.SQRT2 - 2) * Math.min(dx, dy); };
    const s = this.i(sx, sy), goal = this.i(gx, gy);
    g[s] = 0; push(h(sx, sy), s);
    const D = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
    while (open.length) {
      const [, cur] = pop();
      if (closed[cur]) continue; closed[cur] = 1;
      if (cur === goal) break;
      const cx = cur % W, cy = (cur / W) | 0;
      for (const [dx, dy] of D) {
        const nx = cx + dx, ny = cy + dy;
        if (!this.inside(nx, ny)) continue;
        const ni = this.i(nx, ny);
        if (closed[ni] || this.block[ni]) continue;
        if (this.seat[ni] && ni !== goal) continue;
        if (dx && dy && (!this.walkable(cx + dx, cy) || !this.walkable(cx, cy + dy))) continue;   // no corner cutting
        const ng = g[cur] + (dx && dy ? Math.SQRT2 : 1);
        if (ng < g[ni]) { g[ni] = ng; from[ni] = cur; push(ng + h(nx, ny), ni); }
      }
    }
    if (from[goal] < 0) return null;
    const out = []; for (let c = goal; c !== s; c = from[c]) out.push({ x: (c % W) + 0.5, y: ((c / W) | 0) + 0.5 });
    return out.reverse();
  }

  // Nearest walkable tile to (x,y) by BFS ring; used when a click lands on furniture.
  nearestWalkable(x, y) {
    x |= 0; y |= 0;
    for (let r = 0; r < Math.max(this.w, this.h); r++)
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++)
        if (Math.max(Math.abs(dx), Math.abs(dy)) === r && this.walkable(x + dx, y + dy)) return { x: x + dx, y: y + dy };
    return null;
  }
}
