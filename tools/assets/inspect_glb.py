"""Print a one-line summary of each .glb: size, triangles, images (with pixel sizes), skins, animations."""
import json, struct, sys
from pathlib import Path

def summary(p):
    b = Path(p).read_bytes()
    jlen = struct.unpack_from('<I', b, 12)[0]
    j = json.loads(b[20:20 + jlen])
    binoff = 20 + jlen + 8
    tris = 0
    for m in j.get('meshes', []):
        for pr in m['primitives']:
            acc = j['accessors'][pr['indices']] if 'indices' in pr else j['accessors'][pr['attributes']['POSITION']]
            tris += acc['count'] // 3
    sizes = []
    for im in j.get('images', []):
        bv = j['bufferViews'][im['bufferView']]
        data = b[binoff + bv.get('byteOffset', 0): binoff + bv.get('byteOffset', 0) + bv['byteLength']]
        if data[:8] == b'\x89PNG\r\n\x1a\n':
            sizes.append('png%dx%d' % struct.unpack('>II', data[16:24]))
        else:
            i = 2
            while i < len(data):
                mk, ln = data[i + 1], struct.unpack('>H', data[i + 2:i + 4])[0]
                if mk in (0xC0, 0xC2):
                    h, w = struct.unpack('>HH', data[i + 5:i + 9]); sizes.append(f'jpg{w}x{h}'); break
                i += 2 + ln
    return f"{len(b)/1e6:.1f}MB tris={tris} imgs={sizes} skins={len(j.get('skins', []))} anims={[a.get('name') for a in j.get('animations', [])]}"

for p in sys.argv[1:]:
    print(Path(p).name, summary(p))
