"""ambientCG (CC0) fetcher for PBR materials, atlases and decals.

python ambientcg.py tex <category> <assetId>...     1K-JPG: color, normalGL, roughness, AO (+opacity if any)
python ambientcg.py decal <assetId>...              1K-PNG -> <id>_rgba.png (color + opacity) and normal
"""
import io, sys, time, zipfile
from PIL import Image
from lib import get, get_json, asset_dir, add_credit, shrink_jpgs

API = 'https://ambientcg.com/api/v2/full_json'
KEEP = {'Color': 'color', 'NormalGL': 'nor_gl', 'Roughness': 'rough', 'AmbientOcclusion': 'ao',
        'Opacity': 'opacity', 'Metalness': 'metal'}


def fetch(aid, attr):
    a = get_json(f'{API}?id={aid}&include=downloadData,displayData')['foundAssets'][0]
    dl = a['downloadFolders']['default']['downloadFiletypeCategories']['zip']['downloads']
    url = next(d['fullDownloadPath'] for d in dl if d['attribute'] == attr)
    return a, zipfile.ZipFile(io.BytesIO(get(url)))


def maps(z):
    out = {}
    for n in z.namelist():
        for key, short in KEEP.items():
            if n.rsplit('.', 1)[0].endswith('_' + key):
                out[short] = n
    return out


def tex(cat, aid):
    a, z = fetch(aid, '1K-JPG')
    d = asset_dir(cat, 'ambientcg', aid)
    for short, n in maps(z).items():
        (d / f'{aid}_{short}_1k.{n.rsplit(".", 1)[1]}').write_bytes(z.read(n))
    shrink_jpgs(d)
    add_credit(cat, a.get('displayName', aid), f'https://ambientcg.com/view?id={aid}', 'ambientCG (Lennart Demes)',
               'CC0', d)


def decal(aid, max_size=1024):
    a, z = fetch(aid, '1K-PNG')
    m = maps(z)
    d = asset_dir('decals', 'ambientcg', aid)
    color = Image.open(io.BytesIO(z.read(m['color']))).convert('RGBA')
    if 'opacity' in m:
        color.putalpha(Image.open(io.BytesIO(z.read(m['opacity']))).convert('L').resize(color.size))
    color.thumbnail((max_size, max_size))
    color.save(d / f'{aid}_rgba.png', optimize=True)
    if 'nor_gl' in m:
        nor = Image.open(io.BytesIO(z.read(m['nor_gl']))).convert('RGB')
        nor.thumbnail((max_size, max_size))
        nor.save(d / f'{aid}_nor_gl.jpg', quality=90)
    add_credit('decals', a.get('displayName', aid), f'https://ambientcg.com/view?id={aid}',
               'ambientCG (Lennart Demes)', 'CC0', d)


if __name__ == '__main__':
    kind, rest = sys.argv[1], sys.argv[2:]
    cat, ids = (rest[0], rest[1:]) if kind == 'tex' else (None, rest)
    failed = []
    for aid in ids:
        try:
            tex(cat, aid) if kind == 'tex' else decal(aid)
            print('ok', aid, flush=True)
        except Exception as e:
            failed.append(aid)
            print('FAIL', aid, repr(e)[:300], flush=True)
        time.sleep(1)
    print('failed:', failed)
