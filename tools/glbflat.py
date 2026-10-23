"""Flat-colour GLB preview for untextured models (Kenney). Handles node TRS hierarchy + indices.
   glbflat.py out.png yaw pitch file.glb ...   (draws a red tick on +z, i.e. where the model's FRONT should be)"""
import sys, json, struct, numpy as np
from PIL import Image
sys.path.insert(0, __import__('os').path.dirname(__file__)); import fbxmesh

def qmat(q):
    x, y, z, w = q; return np.array([[1-2*(y*y+z*z), 2*(x*y-z*w), 2*(x*z+y*w)], [2*(x*y+z*w), 1-2*(x*x+z*z), 2*(y*z-x*w)], [2*(x*z-y*w), 2*(y*z+x*w), 1-2*(x*x+y*y)]])

def load(path):
    b = open(path, 'rb').read(); jl = struct.unpack_from('<I', b, 12)[0]; j = json.loads(b[20:20+jl]); bin_ = b[20+jl+8:]
    ct = {5126: '<f4', 5123: '<u2', 5125: '<u4', 5121: 'u1'}; nc = {'VEC3': 3, 'VEC2': 2, 'SCALAR': 1}
    def acc(i):
        a = j['accessors'][i]; v = j['bufferViews'][a['bufferView']]; n = nc[a['type']]
        return np.frombuffer(bin_, ct[a['componentType']], a['count']*n, v.get('byteOffset', 0)+a.get('byteOffset', 0)).reshape(-1, n)
    P, N, C = [], [], []
    def walk(ni, M):
        nd = j['nodes'][ni]; L = np.eye(4)
        if 'matrix' in nd: L = np.array(nd['matrix']).reshape(4, 4).T
        else:
            S = np.diag(list(nd.get('scale', [1, 1, 1])) + [1]); R = np.eye(4); R[:3, :3] = qmat(nd.get('rotation', [0, 0, 0, 1])); T = np.eye(4); T[:3, 3] = nd.get('translation', [0, 0, 0]); L = T @ R @ S
        W = M @ L
        if 'mesh' in nd:
            for pr in j['meshes'][nd['mesh']]['primitives']:
                p = acc(pr['attributes']['POSITION']); n = acc(pr['attributes']['NORMAL']); idx = acc(pr['indices'])[:, 0].astype(int) if 'indices' in pr else np.arange(len(p))
                pw = (p @ W[:3, :3].T + W[:3, 3]); nw = n @ np.linalg.inv(W[:3, :3]).T
                m = j['materials'][pr.get('material', 0)]; col = m.get('pbrMetallicRoughness', {}).get('baseColorFactor', [0.8, 0.8, 0.8, 1])[:3]
                P.append(pw[idx]); N.append(nw[idx]); C.append(np.tile(col, (len(idx), 1)))
        for c in nd.get('children', []): walk(c, W)
    for r in j['scenes'][j.get('scene', 0)]['nodes']: walk(r, np.eye(4))
    return np.concatenate(P), np.concatenate(N), np.concatenate(C), j

def render_flat(P, N, C, out, yaw, pitch, size=360, marker=True):
    cols = np.unique(C.round(4), axis=0); idx = np.array([np.where((cols == c.round(4)).all(1))[0][0] for c in C[::3]]).repeat(3)
    pal = np.zeros((1, len(cols), 3), np.uint8); pal[0] = (np.clip(cols, 0, 1) * 255).astype(np.uint8); T = np.stack([(idx + 0.5) / len(cols), np.full(len(idx), 0.5)], 1)
    # tiny +z marker: a thin red box sticking out the front
    lo, hi = P.min(0), P.max(0); c = (lo + hi) / 2; s = (hi - lo).max() * 0.03
    pm = np.array([[-s, 0, 0], [s, 0, 0], [s, s*2, 0], [-s, 0, 0], [s, s*2, 0], [-s, s*2, 0]]) + np.array([c[0], lo[1], hi[2] + s]); pm = pm.astype(float)
    P2 = np.concatenate([P, pm]); N2 = np.concatenate([N, np.tile([0, 0, 1.0], (6, 1))])
    pal2 = np.concatenate([pal, np.array([[[255, 0, 0]]], np.uint8)], 1); T2 = np.concatenate([T * np.array([len(cols) / (len(cols) + 1), 1]), np.tile([(len(cols) + 0.5) / (len(cols) + 1), 0.5], (6, 1))])
    if not marker: P2, N2, T2, pal2 = P, N, T, pal
    fbxmesh.render(P2, N2, T2, Image.fromarray(pal2), out, yaw=yaw, pitch=pitch, size=size, uv_flip=False)

if __name__ == '__main__':
    out, yaw, pit, files = sys.argv[1], float(sys.argv[2]), float(sys.argv[3]), sys.argv[4:]
    size = 300; sheet = Image.new('RGB', (size * min(len(files), 5), size * ((len(files) + 4) // 5)))
    for k, f in enumerate(files):
        P, N, C, j = load(f); render_flat(P, N, C, '/tmp/_f.png', yaw, pit, size); sheet.paste(Image.open('/tmp/_f.png'), ((k % 5) * size, (k // 5) * size))
    sheet.save(out)
