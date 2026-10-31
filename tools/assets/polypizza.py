"""Poly Pizza fetcher: only models whose page states Licence "CC0 1.0".

python polypizza.py search <query>                    list CC0 hits (id, title, creator, tris)
python polypizza.py get <category> <id>[=name]...     download + Blender-normalise to .glb
"""
import json, re, sys, time, urllib.parse
from lib import get, asset_dir, add_credit, blender_convert, STAGING


def page_data(url):
    s = get(url).decode('utf8', 'replace')
    i = s.index('window.__SERVER_APP_STATE__')
    return json.JSONDecoder().raw_decode(s[s.index('{', i):])[0]


def find_models(o, out):
    if isinstance(o, dict):
        if 'PublicID' in o and 'Title' in o:
            out[o['PublicID']] = o
        for v in o.values():
            find_models(v, out)
    elif isinstance(o, list):
        for v in o:
            find_models(v, out)
    return out


def search(q):
    res = page_data(f'https://poly.pizza/search/{urllib.parse.quote(q)}')['initialData']['result']
    return [dict(PublicID=m['publicID'], Title=m['title'], Creator={'Username': m['creator']['username']},
                 Licence=m['licence']) for m in res if str(m.get('licence', '')).startswith('CC0')]


def model_info(pid):
    hits = find_models(page_data(f'https://poly.pizza/m/{pid}'), {})
    m = hits.get(pid) or next(iter(hits.values()))
    return m, f"https://static.poly.pizza/{m['ResourceID']}.glb"


def fetch(cat, pid, name=None):
    m, url = model_info(pid)
    if not str(m.get('Licence', '')).startswith('CC0'):
        raise RuntimeError(f"licence is {m.get('Licence')!r}, not CC0")
    name = name or re.sub(r'[^a-z0-9]+', '_', m['Title'].lower()).strip('_')
    raw = get(url, STAGING / 'polypizza' / f'{pid}.glb')
    out = blender_convert(raw, asset_dir(cat, 'polypizza', name) / f'{name}.glb')
    creator = (m.get('Creator') or {}).get('Username', 'unknown')
    add_credit(cat, m['Title'], f'https://poly.pizza/m/{pid}', creator, 'CC0', out)
    return out


if __name__ == '__main__':
    if sys.argv[1] == 'search':
        for m in search(' '.join(sys.argv[2:])):
            print(m['PublicID'], '|', m['Title'], '|', (m.get('Creator') or {}).get('Username'), '|', m.get('Tris'),
                  '|', m.get('Licence'))
    else:
        failed = []
        for arg in sys.argv[3:]:
            pid, _, name = arg.partition('=')
            try:
                fetch(sys.argv[2], pid, name or None); print('ok', arg, flush=True)
            except Exception as e:
                failed.append(arg); print('FAIL', arg, repr(e)[:300], flush=True)
            time.sleep(1)
        print('failed:', failed)
