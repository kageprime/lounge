"""Offline sanity render of the whole lounge with the manifest's real models, using the SAME fit maths as src/fit.js and the
stage's placement rules. Not a lighting preview: flat colours, no shadows. Catches scale / orientation / clipping mistakes.
   scenesim.py layout.json manifest.json out.png [yaw pitch]"""
import sys, json, re, math, os, numpy as np
from PIL import Image
sys.path.insert(0, os.path.dirname(__file__)); import fbxmesh, glbflat, glbpreview

def hex2rgb(h): h = h.lstrip('#'); return np.array([int(h[i:i+2], 16) for i in (0, 2, 4)]) / 255
def lin2srgb(c): return np.clip(np.asarray(c, float), 0, 1) ** (1 / 2.2)

def pick(manifest, r):
    e = manifest.get(f"{r['type']}:{r['id']}") or manifest.get(r['type'])
    if not e or e.get('enabled') is False: return None
    files = e.get('files') or ([e['file']] if e.get('file') else None)
    if not files: return None
    m = re.search(r'(\d+)$', r['id']); h = 0
    for ch in r['id']: h = (h * 31 + ord(ch)) & 0xffffffff
    return {**e, 'file': files[(int(m.group(1)) if m else h) % len(files)]}

def fit(mn, mx, e, T):
    sx, sy, sz = mx - mn; margin = e.get('margin', 0.92)
    foot = min(T['w'] * margin / sx if sx > 1e-6 else math.inf, T['d'] * margin / sz if sz > 1e-6 else math.inf)
    if e.get('scale') is not None: s = e['scale']
    elif e.get('height') and sy > 1e-6:
        s = e['height'] / sy
        if e.get('clamp') is not False: s = min(s, foot)
    else: s = foot if math.isfinite(foot) else 1
    o = e.get('offset', [0, 0, 0])
    pz = (0 if T['wall'] else -T['d'] / 2) - mn[2] * s if e.get('anchor') == 'back' else -(mn[2] + mx[2]) / 2 * s
    return s, np.array([-(mn[0] + mx[0]) / 2 * s + o[0], -mn[1] * s + o[1], pz + o[2]])

def model_tris(path, e, color):
    """returns P (n*3,3), N, colours(n*3,3) in model space, with tint/screen/emissive approximated as flat colours"""
    if os.path.basename(path).startswith('cab_'):
        j, parts = glbpreview.read_glb(path); P, N, C = [], [], []
        for (p, n, t, tex, name) in parts:
            arr = np.asarray(tex.convert('RGB'), float).reshape(-1, 3) / 255; bright = arr[arr.sum(1) > 0.35]
            col = bright.mean(0) if len(bright) else arr.mean(0)
            if name == 'screen': col = hex2rgb(color) * 0.9
            P.append(p.astype(float)); N.append(n.astype(float)); C.append(np.tile(col, (len(p), 1)))
        return np.concatenate(P), np.concatenate(N), np.concatenate(C)
    if os.path.basename(path) == 'vending.glb':
        P, N, C, j = glbflat.load(path); return P, N, C
    # Kenney: need per-primitive material names for tinting -> reload with names
    b = open(path, 'rb').read(); jl = __import__('struct').unpack_from('<I', b, 12)[0]; j = json.loads(b[20:20 + jl])
    P, N, C, _ = glbflat.load(path)
    # recompute per-corner colours with tints by walking again (glbflat gives factor colours; patch by material order)
    names = [m['name'] for m in j['materials']]; cols = []; counts = []
    for node in j['nodes']:
        pass
    # simple approach: primitive order == material order within each mesh; rebuild counts
    out = []; k = 0
    for mesh in j['meshes']:
        for pr in mesh['primitives']:
            a = j['accessors'][pr['indices']]['count'] if 'indices' in pr else j['accessors'][pr['attributes']['POSITION']]['count']
            out.append((names[pr.get('material', 0)], a))
    # nodes may instance meshes more than once / multiple nodes; glbflat appends in node-walk order == mesh order here (checked per file)
    res = np.array(C, float).copy(); pos = 0
    for (nm, cnt) in out:
        if pos + cnt > len(res): break
        base = lin2srgb(res[pos]); tinted = None
        for t in e.get('tint', []):
            if t['material'] == nm and color: tinted = hex2rgb(color) * t.get('scale', 1)
        res[pos:pos + cnt] = tinted if tinted is not None else base; pos += cnt
    return P, N, res

def build(layout, manifest, base):
    W, H = layout['w'], layout['h']; P, N, C = [], [], []
    def box(cx, cy, cz, sx, sy, sz, col):
        x0, x1, y0, y1, z0, z1 = cx - sx / 2, cx + sx / 2, cy, cy + sy, cz - sz / 2, cz + sz / 2
        v = lambda x, y, z: np.array([x, y, z], float)
        faces = [([0, 0, 1], [v(x0, y0, z1), v(x1, y0, z1), v(x1, y1, z1), v(x0, y1, z1)]), ([0, 0, -1], [v(x1, y0, z0), v(x0, y0, z0), v(x0, y1, z0), v(x1, y1, z0)]),
                 ([1, 0, 0], [v(x1, y0, z1), v(x1, y0, z0), v(x1, y1, z0), v(x1, y1, z1)]), ([-1, 0, 0], [v(x0, y0, z0), v(x0, y0, z1), v(x0, y1, z1), v(x0, y1, z0)]),
                 ([0, 1, 0], [v(x0, y1, z1), v(x1, y1, z1), v(x1, y1, z0), v(x0, y1, z0)])]
        for n, q in faces:
            for tri in ((0, 1, 2), (0, 2, 3)):
                for i in tri: P.append(q[i]); N.append(n); C.append(col)
    box(W / 2, -0.02, H / 2, W, 0.02, H, np.array([0.22, 0.2, 0.28]))                       # floor
    box(W / 2, 0, 0.5, W, 1.2, 1, np.array([0.35, 0.3, 0.45])); box(0.5, 0, H / 2, 1, 1.2, H, np.array([0.35, 0.3, 0.45]))   # low walls (so we can see in)
    stats = []
    for r in layout['props']:
        e = pick(manifest, r); T = r['T']
        if e:
            mp = os.path.join(base, e['file']); p, n, c = model_tris(mp, e, r.get('color') or '#888888')
            mn, mx = p.min(0), p.max(0); s, pos = fit(mn, mx, e, T)
            # model rotY (deg) is applied first in the loader; none used for now
            lp = p * s + pos; ln = n
            if T['wall']:
                th = 0 if (r.get('side') or 'n') == 'n' else math.pi / 2; origin = (r['x'] + 0.5, 1.02) if (r.get('side') or 'n') == 'n' else (1.02, r['y'] + 0.5)
            else: th = -(r['r']) * math.pi / 2; origin = (r['cx'], r['cy'])
            R = np.array([[math.cos(th), 0, math.sin(th)], [0, 1, 0], [-math.sin(th), 0, math.cos(th)]])
            wp = lp @ R.T + np.array([origin[0], 0, origin[1]]); wn = ln @ R.T
            P.extend(wp); N.extend(wn); C.extend(c)
            ex = (wp.max(0) - wp.min(0)); stats.append((r['id'], r['type'], e['file'], round(s, 3), 'size', ex.round(2).tolist()))
        elif not T['flat'] and not T['wall']:
            w, d = T['w'], T['d']; th = -(r['r']) * math.pi / 2
            hgt = {'bar': 1.1, 'pool': 0.85, 'jukebox': 1.3, 'claw': 1.9, 'ludotable': 0.8}.get(r['type'], 1.0)
            ww, dd = (w, d) if r['r'] % 2 == 0 else (d, w)
            box(r['cx'], 0, r['cy'], ww * 0.92, hgt, dd * 0.92, hex2rgb(r.get('color') or '#777777') * 0.6)
    return np.array(P), np.array(N), np.array(C), stats

if __name__ == '__main__':
    lay = json.load(open(sys.argv[1])); man = json.load(open(sys.argv[2]))['models']; out = sys.argv[3]
    yaw = float(sys.argv[4]) if len(sys.argv) > 4 else 28; pit = float(sys.argv[5]) if len(sys.argv) > 5 else 38
    P, N, C, stats = build(lay, man, os.path.dirname(sys.argv[2]))
    for s in stats: print(*s)
    glbflat.render_flat(P, N, C, out, yaw, pit, size=1100, marker=False)
