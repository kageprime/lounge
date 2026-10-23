"""Read a .glb back (independent of the converter) and render it with the software rasteriser: glbpreview.py a.glb b.glb -> sheet"""
import sys, json, struct, io, numpy as np
from PIL import Image
sys.path.insert(0, __import__('os').path.dirname(__file__)); import fbxmesh

def read_glb(path):
    b = open(path, 'rb').read(); assert struct.unpack_from('<I', b, 0)[0] == 0x46546c67 and struct.unpack_from('<I', b, 8)[0] == len(b)
    jl = struct.unpack_from('<I', b, 12)[0]; j = json.loads(b[20:20 + jl]); bin_ = b[20 + jl + 8:]
    def acc(i):
        a = j['accessors'][i]; v = j['bufferViews'][a['bufferView']]; n = {'VEC3': 3, 'VEC2': 2, 'SCALAR': 1}[a['type']]
        o = v['byteOffset'] + a.get('byteOffset', 0); return np.frombuffer(bin_, '<f4', a['count'] * n, o).reshape(-1, n)
    def img(i):
        v = j['bufferViews'][j['images'][i]['bufferView']]; return Image.open(io.BytesIO(bin_[v['byteOffset']:v['byteOffset'] + v['byteLength']]))
    parts = []
    for pr in j['meshes'][0]['primitives']:
        m = j['materials'][pr['material']]; ti = j['textures'][m['pbrMetallicRoughness']['baseColorTexture']['index']]['source']
        parts.append((acc(pr['attributes']['POSITION']), acc(pr['attributes']['NORMAL']), acc(pr['attributes']['TEXCOORD_0']), img(ti).convert('RGB'), m['name']))
    return j, parts

if __name__ == '__main__':
    out = sys.argv[1]; files = sys.argv[2:]; size = 360; sheet = Image.new('RGB', (size * len(files), size * 2))
    for k, f in enumerate(files):
        j, parts = read_glb(f)
        P = np.concatenate([p[0] for p in parts]); 
        for row, (yaw, pit) in enumerate([(32, 16), (-35, 14)]):
            # merge parts into one texture atlas stack so a single call renders both
            W = 1024; atlas = Image.new('RGB', (W, sum(p[3].size[1] * W // p[3].size[0] for p in parts)))
            y = 0; Ts = []; tot = atlas.size[1]
            for (pp, nn, tt, tex, name) in parts:
                h = tex.size[1] * W // tex.size[0]; atlas.paste(tex.resize((W, h)), (0, y)); t2 = tt.copy(); t2[:, 1] = (y + t2[:, 1] * h) / tot; Ts.append(t2); y += h
            N = np.concatenate([p[1] for p in parts]); T = np.concatenate(Ts)
            fbxmesh.render(P, N, T, atlas, '/tmp/_p.png', yaw=yaw, pitch=pit, size=size, uv_flip=False)
            sheet.paste(Image.open('/tmp/_p.png'), (k * size, row * size))
        print(f.split('/')[-1], [(p[4], len(p[0]) // 3, p[3].size) for p in parts], 'extra emissive:', 'emissiveTexture' in j['materials'][0])
    sheet.save(out)
