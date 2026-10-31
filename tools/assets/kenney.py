"""Kenney (CC0) pack fetcher: downloads a pack zip and extracts the files matching glob patterns.

python kenney.py <category> <pack-slug> <glob> [<glob>...]
"""
import fnmatch, http.cookiejar, io, json, sys, urllib.request, zipfile
from pathlib import PurePosixPath
from lib import UA, STAGING, asset_dir, add_credit


def opener():
    return urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))


def pack_zip(slug):
    cache = STAGING / 'kenney' / f'{slug}.zip'
    if cache.exists():
        return zipfile.ZipFile(cache)
    o = opener()
    page = f'https://kenney.nl/assets/{slug}'
    o.open(urllib.request.Request(page, headers={'User-Agent': UA})).read()
    did = ('assets/' + slug).encode().hex()
    req = urllib.request.Request(f'https://kenney.nl/download-link/{did}', headers={'User-Agent': UA, 'Referer': page})
    url = json.loads(o.open(req).read())['url']
    data = o.open(urllib.request.Request(url, headers={'User-Agent': UA, 'Referer': page})).read()
    cache.parent.mkdir(parents=True, exist_ok=True)
    cache.write_bytes(data)
    return zipfile.ZipFile(io.BytesIO(data))


def extract(cat, slug, globs):
    z = pack_zip(slug)
    d = asset_dir(cat, 'kenney', slug.replace('-', '_'))
    n = 0
    for name in z.namelist():
        base = PurePosixPath(name).name
        if base and not name.endswith('/') and any(fnmatch.fnmatch(name.lower(), g.lower()) for g in globs):
            (d / base).write_bytes(z.read(name)); n += 1
    lic = next((x for x in z.namelist() if PurePosixPath(x).name.lower() == 'license.txt'), None)
    if lic:
        (d / 'License.txt').write_bytes(z.read(lic))
    add_credit(cat, f'Kenney {slug.replace("-", " ").title()}', f'https://kenney.nl/assets/{slug}', 'Kenney',
               'CC0', d)
    print('ok', slug, n, 'files')


if __name__ == '__main__':
    extract(sys.argv[1], sys.argv[2], sys.argv[3:])
