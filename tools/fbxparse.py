"""Minimal binary FBX (v7100-7400, 32-bit offsets) reader: nodes + properties. Enough to pull meshes out."""
import struct, zlib
import numpy as np

class Node:
    __slots__ = ('name', 'props', 'children')
    def __init__(s, name): s.name = name; s.props = []; s.children = []
    def find(s, name): return [c for c in s.children if c.name == name]
    def first(s, name):
        f = s.find(name); return f[0] if f else None

def _prop(b, o):
    t = b[o:o+1].decode(); o += 1
    if t in 'YCFDIL':
        fmt = {'Y': '<h', 'C': '<?', 'F': '<f', 'D': '<d', 'I': '<i', 'L': '<q'}[t]
        v = struct.unpack_from(fmt, b, o)[0]; return v, o + struct.calcsize(fmt)
    if t in 'fdilb':
        n, enc, clen = struct.unpack_from('<III', b, o); o += 12
        raw = b[o:o+clen]; o += clen
        if enc: raw = zlib.decompress(raw)
        dt = {'f': '<f4', 'd': '<f8', 'i': '<i4', 'l': '<i8', 'b': '?'}[t]
        return np.frombuffer(raw, dtype=dt, count=n).copy(), o
    if t in 'SR':
        n = struct.unpack_from('<I', b, o)[0]; o += 4; raw = b[o:o+n]; o += n
        return (raw.decode('utf8', 'replace') if t == 'S' else raw), o
    raise ValueError('prop type ' + t)

def parse(path):
    b = open(path, 'rb').read()
    assert b.startswith(b'Kaydara FBX Binary'), 'not binary FBX'
    ver = struct.unpack_from('<I', b, 23)[0]
    assert ver < 7500, 'FBX 7500+ (64-bit) not supported'
    def read(o):
        end, nprops, plen, nlen = struct.unpack_from('<IIIB', b, o)
        if end == 0: return None, o + 13
        o += 13; n = Node(b[o:o+nlen].decode()); o += nlen
        for _ in range(nprops):
            v, o = _prop(b, o); n.props.append(v)
        while o < end:
            c, o = read(o)
            if c is None: break
            n.children.append(c)
        return n, end
    root = Node('root'); o = 27
    while o < len(b) - 100:
        n, o2 = read(o)
        if n is None: break
        root.children.append(n); o = o2
    return root, ver
