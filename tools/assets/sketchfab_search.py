"""Search Sketchfab for downloadable CC0 models: python sketchfab_search.py <max_faces> <query...>"""
import json, sys, urllib.parse
from lib import get_json

def search(q, max_faces, n=24):
    url = 'https://api.sketchfab.com/v3/search?' + urllib.parse.urlencode(dict(
        type='models', q=q, license='cc0', downloadable='true', max_face_count=max_faces, count=n,
        sort_by='-likeCount'))
    return [dict(uid=m['uid'], name=m['name'], user=m['user']['username'], faces=m['faceCount'],
                 lic=(m.get('license') or {}).get('label'), likes=m['likeCount']) for m in get_json(url)['results']]

if __name__ == '__main__':
    for m in search(' '.join(sys.argv[2:]), int(sys.argv[1])):
        print(f"{m['uid']} {m['faces']:>7} {m['likes']:>4} {m['lic']} | {m['name'][:60]} | {m['user']}")
