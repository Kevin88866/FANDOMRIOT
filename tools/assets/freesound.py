"""Freesound CC0 fetcher (no API key): searches with the CC0 licence filter, re-checks the licence on each
sound page, and saves the public high-quality preview (.ogg, ~128 kbps).

python freesound.py <slot> <count> <max_seconds> <query words...>
Files go to assets/thirdparty/sfx/freesound_<slot>/<slot>_<soundid>.ogg
"""
import html, re, sys, time, urllib.parse
from lib import get, asset_dir, add_credit

BASE = 'https://freesound.org'


def search(query, max_sec):
    f = f'license:"Creative Commons 0" duration:[0.5 TO {max_sec}]'
    url = f'{BASE}/search/?' + urllib.parse.urlencode({'q': query, 'f': f, 's': 'Downloads (most first)'})
    page = get(url).decode('utf8', 'replace')
    out = []
    for m in re.finditer(r'<div[^>]+data-sound-id="(\d+)"[^>]*>', page):
        tag = m.group(0)
        attr = lambda k: html.unescape((re.search(fr'data-{k}="([^"]*)"', tag) or [None, ''])[1])
        out.append(dict(id=attr('sound-id'), title=attr('title'), user=attr('username'), ogg=attr('ogg'),
                        dur=attr('duration')))
    return [s for s in out if s['ogg']]


def is_cc0(user, sid):
    page = get(f'{BASE}/people/{user}/sounds/{sid}/').decode('utf8', 'replace')
    return 'creativecommons.org/publicdomain/zero' in page


def fetch(slot, count, max_sec, query):
    d = asset_dir('sfx', 'freesound', slot)
    got = 0
    for s in search(query, max_sec):
        if got >= count:
            break
        try:
            if not is_cc0(s['user'], s['id']):
                print('  skip (not CC0 on page)', s['id']); continue
            out = get(s['ogg'].replace('-lq.', '-hq.'), d / f"{slot}_{s['id']}.ogg")
            add_credit('sfx', s['title'], f"{BASE}/people/{s['user']}/sounds/{s['id']}/", s['user'], 'CC0', out)
            got += 1
            print(f"  ok {s['id']} {s['title'][:50]!r} by {s['user']} ({s['dur']}s)")
        except Exception as e:
            print('  FAIL', s['id'], repr(e)[:200])
        time.sleep(1.5)
    print(f'{slot}: {got}/{count}', flush=True)
    return got


if __name__ == '__main__':
    fetch(sys.argv[1], int(sys.argv[2]), int(sys.argv[3]), ' '.join(sys.argv[4:]))
