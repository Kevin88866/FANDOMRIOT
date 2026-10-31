"""Shared helpers for the third-party asset fetchers: downloads, credits registry, CREDITS.md."""
import json, os, time, subprocess, urllib.request, urllib.error
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
OUT = REPO / 'assets' / 'thirdparty'
STAGING = REPO.parent / '_staging'
CREDITS_JSON = OUT / 'credits.json'
BLENDER = os.environ.get('BLENDER', r'D:\Blender\blender.exe')
UA = 'FandomRiot-assets/1.1 (personal project)'
CATEGORIES = ['characters', 'anims', 'vehicles', 'street', 'building', 'interior', 'props', 'plants',
              'animals', 'textures', 'decals', 'hdri', 'sfx', 'fonts', 'fx']


def get(url, dest=None, tries=3, headers=None):
    """GET url; return bytes, or write to dest and return its Path. Retries with backoff."""
    h = {'User-Agent': UA, **(headers or {})}
    for i in range(tries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=h), timeout=120) as r:
                data = r.read()
            if dest is None:
                return data
            dest = Path(dest); dest.parent.mkdir(parents=True, exist_ok=True)
            dest.write_bytes(data)
            return dest
        except (urllib.error.URLError, TimeoutError, ConnectionError) as e:
            if i == tries - 1:
                raise
            time.sleep(2 * (i + 1))


def get_json(url, **kw):
    return json.loads(get(url, **kw))


def asset_dir(cat, source, name):
    assert cat in CATEGORIES, cat
    d = OUT / cat / f'{source}_{name}'
    d.mkdir(parents=True, exist_ok=True)
    return d


def load_credits():
    return json.loads(CREDITS_JSON.read_text(encoding='utf8')) if CREDITS_JSON.exists() else []


def add_credit(cat, name, url, author, license, path):
    """Upsert one credits row keyed by path (relative to assets/thirdparty)."""
    rel = Path(path).resolve().relative_to(OUT).as_posix()
    lock = OUT / '.credits.lock'
    while True:  # several fetchers may run at once
        try:
            fd = os.open(lock, os.O_CREAT | os.O_EXCL); break
        except FileExistsError:
            time.sleep(0.1)
    try:
        rows = [r for r in load_credits() if r['path'] != rel]
        rows.append(dict(category=cat, name=name, url=url, author=author, license=license, path=rel))
        rows.sort(key=lambda r: (CATEGORIES.index(r['category']), r['path']))
        CREDITS_JSON.write_text(json.dumps(rows, ensure_ascii=False, indent=1), encoding='utf8')
        write_credits_md(rows)
    finally:
        os.close(fd); os.remove(lock)


def write_credits_md(rows=None):
    rows = load_credits() if rows is None else rows
    lines = ['# Third-party asset credits', '',
             'Only CC0 assets, Mixamo assets (Adobe, royalty-free, no raw redistribution) and OFL fonts are used.',
             'Paths are relative to `assets/thirdparty/`.', '']
    for cat in CATEGORIES:
        sub = [r for r in rows if r['category'] == cat]
        if not sub:
            continue
        lines += [f'## {cat}', '', '| Name | URL | Author | License | Path |', '|---|---|---|---|---|']
        lines += [f"| {r['name']} | {r['url']} | {r['author']} | {r['license']} | `{r['path']}` |" for r in sub]
        lines.append('')
    (OUT / 'CREDITS.md').write_text('\n'.join(lines), encoding='utf8')


def blender_convert(src, dest, max_tex=1024, max_tris=0, extra=None):
    """Convert src (gltf/fbx/obj/blend) to a single .glb using convert_glb.py inside Blender."""
    script = Path(__file__).with_name('convert_glb.py')
    args = [BLENDER, '-b', '--factory-startup', '-P', str(script), '--', str(src), str(dest),
            str(max_tex), str(max_tris)] + list(extra or [])
    r = subprocess.run(args, capture_output=True, text=True, encoding='utf8', errors='replace', timeout=900)
    if r.returncode != 0 or not Path(dest).exists():
        raise RuntimeError(f'blender failed for {src}:\n' + (r.stdout + r.stderr)[-2000:])
    return Path(dest)


def mb(p):
    return Path(p).stat().st_size / 1e6


def dir_mb(p):
    return sum(f.stat().st_size for f in Path(p).rglob('*') if f.is_file()) / 1e6


def shrink_jpgs(d):
    """Re-encode JPGs (q80, normals q90) when that makes them smaller; source 1K JPGs are near-lossless."""
    from PIL import Image
    for p in Path(d).rglob('*.jpg'):
        b = p.stat().st_size
        nor = 'nor' in p.name
        tmp = p.with_suffix('.tmp.jpg')
        with Image.open(p) as im:
            im.load()
            im.convert('RGB').save(tmp, quality=90 if nor else 80, optimize=True, subsampling=0 if nor else 2)
        tmp.replace(p) if tmp.stat().st_size < b else tmp.unlink()
