"""Pull a triangulated mesh (unwelded, per-corner normals + UVs) out of a parsed FBX."""
import numpy as np
import fbxparse

def load_mesh(path):
    root, _ = fbxparse.parse(path)
    g = root.first('Objects').find('Geometry')[0]
    V = g.first('Vertices').props[0].reshape(-1, 3).astype(np.float64)
    pvi = g.first('PolygonVertexIndex').props[0]
    # polygons: negative index marks the last corner (value is ~idx)
    polys, cur = [], []
    for i in pvi:
        if i < 0: cur.append(~int(i)); polys.append(cur); cur = []
        else: cur.append(int(i))
    ne = g.first('LayerElementNormal'); uv = g.first('LayerElementUV'); mt = g.first('LayerElementMaterial')
    N = ne.first('Normals').props[0].reshape(-1, 3) if ne else None
    nmap = ne.first('MappingInformationType').props[0] if ne else None
    UV = uv.first('UV').props[0].reshape(-1, 2); UVI = uv.first('UVIndex').props[0] if uv.first('UVIndex') else None
    P, NN, T = [], [], []
    corner = 0
    for poly in polys:
        for k in range(1, len(poly) - 1):                     # triangle fan
            for c in (0, k, k + 1):
                ci = corner + c
                P.append(V[poly[c]])
                if N is not None: NN.append(N[ci] if nmap == 'ByPolygonVertex' else N[poly[c]])
                T.append(UV[UVI[ci]] if UVI is not None else UV[ci])
        corner += len(poly)
    P = np.array(P); T = np.array(T); NN = np.array(NN) if N is not None else None
    if NN is None:
        tri = P.reshape(-1, 3, 3); fn = np.cross(tri[:, 1] - tri[:, 0], tri[:, 2] - tri[:, 0]); NN = np.repeat(fn, 3, axis=0)
    return P, NN, T          # all (n*3, k); UVs in FBX convention (v up)

def check_winding(P, N):
    tri = P.reshape(-1, 3, 3); fn = np.cross(tri[:, 1] - tri[:, 0], tri[:, 2] - tri[:, 0])
    n = N.reshape(-1, 3, 3).sum(1)
    return float(np.mean(np.einsum('ij,ij->i', fn, n) > 0))

def render(P, N, T, tex, out, yaw=35, pitch=20, size=520, uv_flip=True, light=(0.4, 0.8, 0.5)):
    """Tiny software rasteriser (orthographic, z-buffer, lambert) to eyeball a model without a GPU/browser."""
    from PIL import Image
    tex = np.asarray(tex.convert('RGB'), dtype=np.float32) / 255; th, tw = tex.shape[:2]
    cy, sy = np.cos(np.radians(yaw)), np.sin(np.radians(yaw)); cp, sp = np.cos(np.radians(pitch)), np.sin(np.radians(pitch))
    R = np.array([[cy, 0, sy], [0, 1, 0], [-sy, 0, cy]]); Rp = np.array([[1, 0, 0], [0, cp, -sp], [0, sp, cp]])
    M = Rp @ R; Q = (P - (P.max(0) + P.min(0)) / 2) @ M.T; Nn = N @ M.T
    ext = np.abs(Q[:, :2]).max(); sc = size * 0.46 / ext
    sx = size / 2 + Q[:, 0] * sc; sy_ = size * 0.5 - Q[:, 1] * sc; z = Q[:, 2]
    img = np.full((size, size, 3), 0.18, dtype=np.float32); zb = np.full((size, size), -1e9)
    L = np.array(light) / np.linalg.norm(light)
    for t in range(0, len(P), 3):
        xs, ys, zs = sx[t:t+3], sy_[t:t+3], z[t:t+3]
        x0, x1 = int(max(0, np.floor(xs.min()))), int(min(size - 1, np.ceil(xs.max()))); y0, y1 = int(max(0, np.floor(ys.min()))), int(min(size - 1, np.ceil(ys.max())))
        if x1 < x0 or y1 < y0: continue
        d = (ys[1] - ys[2]) * (xs[0] - xs[2]) + (xs[2] - xs[1]) * (ys[0] - ys[2])
        if abs(d) < 1e-9: continue
        gx, gy = np.meshgrid(np.arange(x0, x1 + 1) + 0.5, np.arange(y0, y1 + 1) + 0.5)
        w0 = ((ys[1] - ys[2]) * (gx - xs[2]) + (xs[2] - xs[1]) * (gy - ys[2])) / d
        w1 = ((ys[2] - ys[0]) * (gx - xs[2]) + (xs[0] - xs[2]) * (gy - ys[2])) / d; w2 = 1 - w0 - w1
        m = (w0 >= 0) & (w1 >= 0) & (w2 >= 0)
        if not m.any(): continue
        zz = w0 * zs[0] + w1 * zs[1] + w2 * zs[2]; m &= zz > zb[y0:y1 + 1, x0:x1 + 1]
        if not m.any(): continue
        u = w0 * T[t, 0] + w1 * T[t + 1, 0] + w2 * T[t + 2, 0]; v = w0 * T[t, 1] + w1 * T[t + 1, 1] + w2 * T[t + 2, 1]
        if uv_flip: v = 1 - v
        col = tex[np.clip((v * th).astype(int), 0, th - 1), np.clip((u * tw).astype(int) % tw, 0, tw - 1)]
        n = Nn[t:t+3].mean(0); n /= (np.linalg.norm(n) + 1e-9)
        if n[2] < -0.05 and False: pass
        shade = 0.45 + 0.55 * max(0, float(n @ (M @ L)))
        sub = img[y0:y1 + 1, x0:x1 + 1]; sub[m] = col[m] * shade; zb[y0:y1 + 1, x0:x1 + 1][m] = zz[m]
    Image.fromarray((np.clip(img, 0, 1) * 255).astype(np.uint8)).save(out)
