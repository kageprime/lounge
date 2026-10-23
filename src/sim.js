// Lounge simulation. Pure + deterministic given a seed: no DOM, no Three.js.
// The ONLY way to change the world is world.command(cmd). Humans, bots, and one day network peers all go through it.
//   {t:'join', person}  {t:'leave', id}  {t:'move', id, x, y}  {t:'use', id, use}  {t:'stand', id}
//   {t:'say', id, text} {t:'emote', id, name}  {t:'loadout', id, loadout}
import { Grid } from './grid.js';
import { resolve } from './props.js';
import { sanitize, EMOTES } from './avatar-data.js';

const WALK = 2.8, TURN = 14;
const angDiff = (a, b) => { let d = (b - a) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return d; };

export class World {
  constructor(layout) {
    this.layout = { ...layout, props: layout.props ? layout.props.map(p => ({ ...p })) : [] };
    this.t = 0; this.people = new Map(); this.occ = new Map(); this.listeners = [];
    this.phase = 'normal';
    this.grid = new Grid(layout.w, layout.h);
    for (let x = 0; x < layout.w; x++) this.grid.setBlock(x, 0);     // north wall
    for (let y = 0; y < layout.h; y++) this.grid.setBlock(0, y);     // west wall
    this.props = new Map(); this.uses = new Map();
    for (const p of this.layout.props) this.addProp(p);
  }
  addProp(p) {
    const r = resolve(p); this.props.set(p.id, r);
    if (!r.T.flat) for (const t of r.foot) this.grid.setBlock(t.x, t.y, 1);
    for (const u of r.uses) {
      this.uses.set(u.id, u);
      if (u.mode === 'sit') { this.grid.setBlock(u.tile.x, u.tile.y, 0); this.grid.setSeat(u.tile.x, u.tile.y, 1); }
    }
    return r;
  }
  on(fn) { this.listeners.push(fn); return () => this.off(fn); }
  off(fn) { this.listeners = this.listeners.filter(f => f !== fn); }
  emit(e) { e.t = e.type; for (const f of this.listeners) f(e); }

  canPlaceProp(p, ignoreId = null) {
    if (!p || !p.type) return false;
    const r = resolve(p);
    if (!r || !r.T) return false;
    const W = this.layout.w, H = this.layout.h;
    if (r.T.wall) {
      const side = p.side || 'n';
      if (side === 'n') {
        if (p.x < 1 || p.x > W - 1 || p.y !== 0) return false;
      } else if (side === 'w') {
        if (p.y < 1 || p.y > H - 1 || p.x !== 0) return false;
      } else return false;
      return true;
    }
    for (const t of r.foot) {
      if (t.x < 1 || t.x >= W || t.y < 1 || t.y >= H) return false;
    }
    if (r.T.flat) return true;

    const sp = this.layout.spawn;
    if (sp) {
      for (const t of r.foot) {
        if (t.x === sp.x && t.y === sp.y) return false;
      }
    }
    for (const other of this.props.values()) {
      if (other.id === ignoreId || other.T.flat || other.T.wall) continue;
      for (const ot of other.foot) {
        for (const t of r.foot) {
          if (ot.x === t.x && ot.y === t.y) return false;
        }
      }
    }
    for (const u of r.uses) {
      if (u.tile.x < 1 || u.tile.x >= W || u.tile.y < 1 || u.tile.y >= H) return false;
      if (u.mode !== 'sit') {
        for (const other of this.props.values()) {
          if (other.id === ignoreId || other.T.flat || other.T.wall) continue;
          for (const ot of other.foot) {
            if (ot.x === u.tile.x && ot.y === u.tile.y) return false;
          }
        }
      }
    }
    return true;
  }

  _rerouteWalkers() {
    for (const p of this.people.values()) {
      if (p.state === 'walk' && p.path.length) {
        if (p.path.some(pt => !this.grid.walkable(Math.floor(pt.x), Math.floor(pt.y)))) {
          const dest = p.path.at(-1);
          const newPath = this.grid.path(p.x, p.y, Math.floor(dest.x), Math.floor(dest.y));
          if (newPath) p.path = newPath;
          else { p.path = []; p.state = 'idle'; if (p.pending) this._release(p); }
        }
      }
    }
  }

  _placeProp(prop) {
    if (!prop || !prop.id || this.props.has(prop.id)) return false;
    if (!this.canPlaceProp(prop)) return false;
    const r = this.addProp(prop);
    this.layout.props.push({ ...prop });
    this._rerouteWalkers();
    this.emit({ type: 'propPlaced', prop: r });
    return r;
  }

  _moveProp(id, x, y, r) {
    const existing = this.props.get(id);
    if (!existing) return false;
    const rot = r != null ? (r & 3) : existing.r;
    const origConfig = this.layout.props.find(p => p.id === id) || existing;
    const updated = { ...origConfig, x, y, r: rot };
    if (!this.canPlaceProp(updated, id)) return false;

    this._removeProp(id);
    const resolved = this.addProp(updated);
    this.layout.props.push(updated);
    this._rerouteWalkers();
    this.emit({ type: 'propMoved', id, x, y, r: rot, prop: resolved });
    return resolved;
  }

  _removeProp(id) {
    const r = this.props.get(id);
    if (!r) return false;
    for (const p of this.people.values()) {
      if (p.use && p.use.startsWith(id + '#')) this._stand(p);
      if (p.pending && p.pending.startsWith(id + '#')) {
        this.occ.delete(p.pending);
        p.pending = null;
        p.state = 'idle';
      }
    }
    for (const u of r.uses) {
      this.occ.delete(u.id);
      this.uses.delete(u.id);
      if (u.mode === 'sit') this.grid.setSeat(u.tile.x, u.tile.y, 0);
    }
    if (!r.T.flat && !r.T.wall) {
      for (const t of r.foot) this.grid.setBlock(t.x, t.y, 0);
    }
    this.props.delete(id);
    const idx = this.layout.props.findIndex(p => p.id === id);
    if (idx !== -1) this.layout.props.splice(idx, 1);
    this.emit({ type: 'propRemoved', id });
    return true;
  }

  command(c) {
    const p = c.id && this.people.get(c.id);
    switch (c.t) {
      case 'join': return this._join(c.person);
      case 'leave': if (p) { this._release(p); this.people.delete(p.id); this.emit({ type: 'leave', id: p.id }); } return true;
      case 'move': return p ? this._move(p, c.x, c.y) : false;
      case 'warp': return p ? this._warp(p, c.x, c.y) : false;
      case 'use': return p ? this._use(p, c.use) : false;
      case 'stand': if (p) this._stand(p); return !!p;
      case 'say': if (p && c.text) { p.say = { text: String(c.text).slice(0, 80), t: 4.5 }; this.emit({ type: 'say', id: p.id, text: p.say.text }); } return !!p;
      case 'emote': if (p && EMOTES.includes(c.name)) { p.emote = { name: c.name, t: 2.2 }; this.emit({ type: 'emote', id: p.id, name: c.name }); } return !!p;
      case 'loadout': if (p) { p.loadout = sanitize(c.loadout); this.emit({ type: 'loadout', id: p.id }); } return !!p;
      case 'placeProp': return this._placeProp(c.prop);
      case 'moveProp': return this._moveProp(c.propId ?? (this.props.has(c.id) ? c.id : null), c.x, c.y, c.r);
      case 'removeProp': return this._removeProp(c.propId ?? (this.props.has(c.id) ? c.id : null));
      case 'setPhase': {
        const ph = c.phase === 'twilight' ? 'twilight' : 'normal';
        if (this.phase !== ph) {
          this.phase = ph;
          this.emit({ type: 'phaseChange', phase: ph });
        }
        return true;
      }
      case 'talk': {
        if (p && c.targetId && this.people.has(c.targetId)) {
          this.emit({ type: 'talk', fromId: p.id, targetId: c.targetId, text: c.text });
          return true;
        }
        return false;
      }
      case 'gift': {
        if (p && c.targetId && this.people.has(c.targetId)) {
          this.emit({ type: 'gift', fromId: p.id, targetId: c.targetId, item: c.item });
          return true;
        }
        return false;
      }
      case 'consume': {
        if (p && c.item) {
          this.emit({ type: 'consume', id: p.id, item: c.item });
          return true;
        }
        return false;
      }
      case 'workGig': {
        if (p && c.gigId) {
          this.emit({ type: 'workGig', id: p.id, gigId: c.gigId });
          return true;
        }
        return false;
      }
    }
    return false;
  }
  _join(per) {
    const sp = this.layout.spawn;
    const p = { id: per.id, name: per.name || 'Guest', human: !!per.human, loadout: sanitize(per.loadout), x: per.x ?? sp.x + 0.5, y: per.y ?? sp.y + 0.5,
      face: Math.PI, state: 'idle', path: [], use: null, pending: null, emote: null, say: null, vis: Math.PI, seatH: 0, brain: null };
    this.people.set(p.id, p); this.emit({ type: 'join', id: p.id }); return p;
  }
  _release(p) { if (p.use) { if (this.occ.get(p.use) === p.id) this.occ.delete(p.use); p.use = null; } if (p.pending) { if (this.occ.get(p.pending) === p.id) this.occ.delete(p.pending); p.pending = null; } p.seatH = 0; }
  _stand(p) {
    if (!p.use) return;
    const u = this.uses.get(p.use); const was = p.use; this._release(p); p.state = 'idle';
    // step off a seat to the nearest free walkable tile
    if (u && u.mode === 'sit') { const n = this.grid.nearestWalkable(u.tile.x, u.tile.y); if (n) { p.x = n.x + 0.5; p.y = n.y + 0.5; } }
    this.emit({ type: 'stand', id: p.id, use: was });
  }
  _move(p, x, y) {
    let tx = Math.floor(x), ty = Math.floor(y);
    if (!this.grid.walkable(tx, ty)) { const n = this.grid.nearestWalkable(tx, ty); if (!n) return false; tx = n.x; ty = n.y; }
    if (p.use) this._stand(p); this._release(p);
    const path = this.grid.path(p.x, p.y, tx, ty); if (!path) return false;
    p.path = path; p.state = path.length ? 'walk' : 'idle'; return true;
  }
  _warp(p, x, y) {
    let tx = Math.floor(x), ty = Math.floor(y);
    if (!this.grid.walkable(tx, ty)) { const n = this.grid.nearestWalkable(tx, ty); if (n) { tx = n.x; ty = n.y; } }
    if (p.use) this._stand(p); this._release(p);
    p.path = []; p.state = 'idle'; p.x = tx + 0.5; p.y = ty + 0.5; p.seatH = 0;
    this.emit({ type: 'warp', id: p.id, x: p.x, y: p.y });
    return true;
  }
  _use(p, useId) {
    const u = this.uses.get(useId); if (!u) return false;
    const owner = this.occ.get(useId); if (owner && owner !== p.id) { this.emit({ type: 'denied', id: p.id, use: useId }); return false; }
    if (p.use === useId) return true;
    if (p.use) this._stand(p); this._release(p);
    const path = this.grid.path(p.x, p.y, u.tile.x, u.tile.y); if (!path) return false;
    this.occ.set(useId, p.id); p.pending = useId; p.path = path; p.state = path.length ? 'walk' : 'idle';
    if (!path.length) this._arrive(p); return true;
  }
  _arrive(p) {
    if (!p.pending) { p.state = 'idle'; this.emit({ type: 'arrive', id: p.id }); return; }
    const u = this.uses.get(p.pending); p.use = p.pending; p.pending = null;
    p.x = u.tile.x + 0.5; p.y = u.tile.y + 0.5; p.face = u.face; p.state = u.mode === 'sit' ? 'sit' : 'use'; p.seatH = u.seatH;
    this.emit({ type: 'use', id: p.id, use: u.id, prop: u.prop, action: u.action, mode: u.mode });
  }
  freeUses(filter) { const out = []; for (const u of this.uses.values()) if (!this.occ.has(u.id) && (!filter || filter(u))) out.push(u); return out; }

  step(dt) {
    this.t += dt;
    for (const p of this.people.values()) {
      if (p.emote && (p.emote.t -= dt) <= 0) p.emote = null;
      if (p.say && (p.say.t -= dt) <= 0) p.say = null;
      if (p.brain) p.brain(this, p, dt);
      if (p.state === 'walk' && p.path.length) {
        let left = WALK * dt;
        while (left > 0 && p.path.length) {
          const n = p.path[0], dx = n.x - p.x, dy = n.y - p.y, d = Math.hypot(dx, dy);
          if (d > 1e-6) p.face = Math.atan2(dx, dy);
          if (d <= left) { p.x = n.x; p.y = n.y; p.path.shift(); left -= d; } else { p.x += dx / d * left; p.y += dy / d * left; left = 0; }
        }
        if (!p.path.length) this._arrive(p);
      }
      p.vis += angDiff(p.vis, p.face) * Math.min(1, TURN * dt);     // smoothed facing for rendering
    }
  }
}
