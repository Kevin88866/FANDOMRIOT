"""Poly Haven (CC0) fetcher: textures, HDRIs and models.

python -I polyhaven.py tex <category> <id>...
python -I polyhaven.py hdri <id>...
python -I polyhaven.py model <category> <max_tris> <id>...
"""
import json, sys, time
from pathlib import Path
from lib import get, get_json, asset_dir, add_credit, blender_convert, mb, shrink_jpgs, STAGING

API = 'https://api.polyhaven.com'
TEX_MAPS = {'diff': 'Diffuse', 'nor_gl': 'nor_gl', 'rough': 'Rough', 'ao': 'AO'}


def info(aid):
    i = get_json(f'{API}/info/{aid}')
    return i['name'], ', '.join(i['authors'])


def tex(cat, aid, res='1k'):
    files = get_json(f'{API}/files/{aid}')
    name, author = info(aid)
    d = asset_dir(cat, 'polyhaven', aid)
    for short, key in TEX_MAPS.items():
        if key not in files:
            continue
        get(files[key][res]['jpg']['url'], d / f'{aid}_{short}_{res}.jpg')
    shrink_jpgs(d)
    add_credit(cat, name, f'https://polyhaven.com/a/{aid}', author, 'CC0', d)


def hdri(aid):
    files = get_json(f'{API}/files/{aid}')
    name, author = info(aid)
    d = asset_dir('hdri', 'polyhaven', aid)
    for res in ('1k', '2k'):
        get(files['hdri'][res]['hdr']['url'], d / f'{aid}_{res}.hdr')
    add_credit('hdri', name, f'https://polyhaven.com/a/{aid}', author, 'CC0', d)


def model(cat, aid, max_tris=0, max_tex=1024):
    files = get_json(f'{API}/files/{aid}')
    name, author = info(aid)
    g = files['gltf']['1k']['gltf']
    stage = STAGING / 'polyhaven' / aid
    gltf = get(g['url'], stage / f'{aid}.gltf')
    used = {b['uri'] for b in json.loads(gltf.read_text(encoding='utf8')).get('buffers', [])}
    used |= {im['uri'] for im in json.loads(gltf.read_text(encoding='utf8')).get('images', [])}
    for rel, f in g['include'].items():
        if rel in used and not (stage / rel).exists():
            get(f['url'], stage / rel)
    d = asset_dir(cat, 'polyhaven', aid)
    out = blender_convert(gltf, d / f'{aid}.glb', max_tex, max_tris)
    add_credit(cat, name, f'https://polyhaven.com/a/{aid}', author, 'CC0', out)
    return out


if __name__ == '__main__':
    kind, rest = sys.argv[1], sys.argv[2:]
    failed = []
    if kind == 'tex':
        cat, ids = rest[0], rest[1:]
    elif kind == 'model':
        cat, max_tris, ids = rest[0], int(rest[1]), rest[2:]
    else:
        ids = rest
    for aid in ids:
        try:
            if kind == 'tex':
                tex(cat, aid)
            elif kind == 'hdri':
                hdri(aid)
            else:
                out = model(cat, aid, max_tris)
                print(f'  {aid}: {mb(out):.1f} MB')
            print('ok', aid, flush=True)
        except Exception as e:
            failed.append(aid)
            print('FAIL', aid, repr(e)[:400], flush=True)
        time.sleep(0.5)
    print('failed:', failed)
