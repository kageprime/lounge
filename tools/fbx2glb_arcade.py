"""Convert the 'Arcade Machine Pack' Standard cabinet (FBX + skin PNG) to GLB.
  python3 tools/fbx2glb_arcade.py /path/to/ArcadeAssets
Output: assets/models/cab_<skin>.glb  (Y-up, floor y=0, front +z, raw units: ~2 wide x 4.1 tall)
Materials: "body" (skin atlas, marquee emissive) and "screen" (cropped 'insert coin' image, emissive; the lounge swaps in
the animated screen via manifest "screen":"screen"). The screen UVs are remapped to 0..1 so any screen image fits.
"""
import sys, io, os, json, struct
import numpy as np
from PIL import Image
sys.path.insert(0, os.path.dirname(__file__))
import fbxmesh

SKINS = {   # skin -> texture file that has the baked "insert coin" screen
    'alientox': 'ArcadeStandardAlientoxSCREEN.png', 'hotlava': 'ArcadeStandardHotLavaSCREENtexture.png',
    'xoxoxo': 'ArcadeStandardXOXOXOSCREEN.png', 'police': 'ArcadeStandardPSquadScreenFBX.png',
}

def png(im):
    b = io.BytesIO(); im.save(b, 'PNG', optimize=True); return b.getvalue()

def pick_faces(P, N, T):
    tri = P.reshape(-1, 3, 3); n = N.reshape(-1, 3, 3).mean(1); n /= np.linalg.norm(n, axis=1, keepdims=True)
    c = tri.mean(1); uvs = T.reshape(-1, 3, 2)
    span = np.ptp(uvs, axis=1)
    screen = [i for i in range(len(tri)) if abs(n[i, 1] - 0.14) < 0.03 and n[i, 2] > 0.97 and span[i, 0] > 0.3 and 2.3 < c[i, 1] < 3.1]
    marquee = [i for i in range(len(tri)) if n[i, 2] > 0.99 and c[i, 1] > 3.5 and span[i, 0] > 0.15]
    return screen, marquee

def build(fbx, tex_path, out):
    P, N, T = fbxmesh.load_mesh(fbx)
    tex = Image.open(tex_path).convert('RGB'); W, H = tex.size
    screen, marquee = pick_faces(P, N, T)
    assert len(screen) == 2 and len(marquee) >= 1, (screen, marquee)
    uv = T.reshape(-1, 3, 2).copy(); uv[:, :, 1] = 1 - uv[:, :, 1]          # glTF: v down
    # --- screen: crop its UV rect from the skin, then remap those corners to 0..1
    su = uv[screen].reshape(-1, 2); u0, v0 = su.min(0); u1, v1 = su.max(0)
    crop = tex.crop((int(u0 * W), int(v0 * H), int(np.ceil(u1 * W)), int(np.ceil(v1 * H))))
    suv = uv[screen].copy(); suv[:, :, 0] = (suv[:, :, 0] - u0) / (u1 - u0); suv[:, :, 1] = (suv[:, :, 1] - v0) / (v1 - v0)
    # --- marquee emissive: skin with everything outside the marquee rect blacked out
    mu = uv[marquee].reshape(-1, 2); m0, n0 = mu.min(0); m1, n1 = mu.max(0)
    em = Image.new('RGB', (W, H)); box = (int(m0 * W), int(n0 * H), int(np.ceil(m1 * W)), int(np.ceil(n1 * H))); em.paste(tex.crop(box), box[:2])
    keep = [i for i in range(len(P) // 3) if i not in screen]
    def prim(tris, uvs):
        p = P.reshape(-1, 3, 3)[tris].reshape(-1, 3); nn = N.reshape(-1, 3, 3)[tris].reshape(-1, 3); nn = nn / np.maximum(np.linalg.norm(nn, axis=1, keepdims=True), 1e-9)
        return p.astype(np.float32), nn.astype(np.float32), uvs.reshape(-1, 2).astype(np.float32)
    prims = [prim(keep, uv[keep]), prim(screen, suv)]
    # --- pack
    bin_ = bytearray(); views = []; acc = []
    def add(data, target=None):
        while len(bin_) % 4: bin_.append(0)
        off = len(bin_); bin_.extend(data); views.append({'buffer': 0, 'byteOffset': off, 'byteLength': len(data), **({'target': target} if target else {})}); return len(views) - 1
    meshprims = []
    for (p, nn, t) in prims:
        a = []
        for arr, typ in ((p, 'VEC3'), (nn, 'VEC3'), (t, 'VEC2')):
            bv = add(arr.tobytes(), 34962); d = {'bufferView': bv, 'componentType': 5126, 'count': len(arr), 'type': typ}
            if typ == 'VEC3' and arr is p: d['min'] = p.min(0).tolist(); d['max'] = p.max(0).tolist()
            acc.append(d); a.append(len(acc) - 1)
        meshprims.append({'attributes': {'POSITION': a[0], 'NORMAL': a[1], 'TEXCOORD_0': a[2]}})
    imgs = [add(png(tex)), add(png(crop)), add(png(em))]
    j = {'asset': {'version': '2.0', 'generator': 'neon-lounge fbx2glb_arcade'}, 'scene': 0, 'scenes': [{'nodes': [0]}], 'nodes': [{'name': 'cabinet', 'mesh': 0}],
         'meshes': [{'name': 'cabinet', 'primitives': [dict(meshprims[0], material=0), dict(meshprims[1], material=1)]}],
         'samplers': [{'magFilter': 9729, 'minFilter': 9987, 'wrapS': 33071, 'wrapT': 33071}],
         'images': [{'bufferView': v, 'mimeType': 'image/png'} for v in imgs],
         'textures': [{'sampler': 0, 'source': i} for i in range(3)],
         'materials': [
             {'name': 'body', 'pbrMetallicRoughness': {'baseColorTexture': {'index': 0}, 'metallicFactor': 0.0, 'roughnessFactor': 0.55}, 'emissiveTexture': {'index': 2}, 'emissiveFactor': [1, 1, 1]},
             {'name': 'screen', 'pbrMetallicRoughness': {'baseColorTexture': {'index': 1}, 'metallicFactor': 0.0, 'roughnessFactor': 0.2}, 'emissiveTexture': {'index': 1}, 'emissiveFactor': [1, 1, 1]}],
         'accessors': acc, 'bufferViews': views, 'buffers': [{'byteLength': len(bin_)}]}
    pad = lambda b, v: b + bytes([v]) * ((4 - len(b) % 4) % 4)
    jb = pad(json.dumps(j).encode(), 0x20); bb = pad(bytes(bin_), 0)
    glb = struct.pack('<III', 0x46546c67, 2, 12 + 8 + len(jb) + 8 + len(bb)) + struct.pack('<II', len(jb), 0x4e4f534a) + jb + struct.pack('<II', len(bb), 0x004e4942) + bb
    open(out, 'wb').write(glb); return len(glb), len(keep), P, N, uv, screen

if __name__ == '__main__':
    src = sys.argv[1] if len(sys.argv) > 1 else '/home/claude/arcade/ArcadeAssets'
    outdir = os.path.join(os.path.dirname(__file__), '..', 'assets', 'models'); os.makedirs(outdir, exist_ok=True)
    for skin, tex in SKINS.items():
        size, nk, *_ = build(os.path.join(src, 'ArcadeStandardFBX.fbx'), os.path.join(src, tex), os.path.join(outdir, f'cab_{skin}.glb'))
        print(f'cab_{skin}.glb {size/1024:.0f} KB')
