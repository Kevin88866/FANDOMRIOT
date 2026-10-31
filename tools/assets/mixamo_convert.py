"""Convert downloaded Mixamo FBX (see mixamo.mjs) to .glb and register credits.

python mixamo_convert.py chars|anims
Characters keep skin + mixamorig:* bones (textures <= 1024); animations are armature-only clips on Y Bot.
"""
import json, sys
from lib import STAGING, asset_dir, add_credit, blender_convert, mb

LICENSE = 'Mixamo (Adobe) royalty-free; no raw redistribution'
kind = sys.argv[1]
src = STAGING / 'mixamo' / kind
manifest = json.loads((src / 'manifest.json').read_text(encoding='utf8'))
failed = []
for fbx in sorted(src.glob('*.fbx')):
    name = fbx.stem
    info = manifest.get(name, {})
    try:
        if kind == 'chars':
            out = blender_convert(fbx, asset_dir('characters', 'mixamo', name) / f'{name}.glb', 1024, 0, ['noanim', 'jpg'])
            title, cat = info.get('title', name), 'characters'
            if mb(out) > 15:
                print('WARN over 15MB', name, mb(out))
        else:
            out = blender_convert(fbx, asset_dir('anims', 'mixamo', name) / f'{name}.glb', 1024, 0,
                                  ['anim', f'name={name}'])
            title, cat = f"{info.get('title', name)} - {info.get('description', '')}".strip(' -'), 'anims'
        add_credit(cat, title, 'https://www.mixamo.com/', 'Adobe Mixamo', LICENSE, out)
        print(f'ok {name} {mb(out):.1f} MB', flush=True)
    except Exception as e:
        failed.append(name)
        print('FAIL', name, repr(e)[-300:], flush=True)
print('failed:', failed)
