"""Blender batch converter: any supported model -> single .glb with downscaled textures.

blender -b --factory-startup -P convert_glb.py -- SRC DEST MAX_TEX MAX_TRIS [flags...]
flags: anim (armature + animation only, mesh dropped), noanim, name=<action name>,
       scale=<float>, jpg (re-encode PNGs without real transparency as JPEG)
"""
import bpy, sys, os, tempfile
from pathlib import Path

argv = sys.argv[sys.argv.index('--') + 1:]
src, dest, max_tex, max_tris = Path(argv[0]), Path(argv[1]), int(argv[2]), int(argv[3])
flags = argv[4:]
opt = dict(f.split('=', 1) for f in flags if '=' in f)
anim_only = 'anim' in flags

bpy.ops.wm.read_factory_settings(use_empty=True)
ext = src.suffix.lower()
if ext in ('.gltf', '.glb'):
    bpy.ops.import_scene.gltf(filepath=str(src))
elif ext == '.fbx':
    bpy.ops.import_scene.fbx(filepath=str(src), use_anim=True, automatic_bone_orientation=False,
                             ignore_leaf_bones=False)
elif ext == '.obj':
    bpy.ops.wm.obj_import(filepath=str(src))
elif ext == '.dae':
    bpy.ops.wm.collada_import(filepath=str(src))
elif ext == '.blend':
    with bpy.data.libraries.load(str(src)) as (data_from, data_to):
        data_to.objects = data_from.objects
    for o in data_to.objects:
        if o is not None:
            bpy.context.scene.collection.objects.link(o)
else:
    raise SystemExit(f'unsupported {ext}')

if anim_only:
    for o in list(bpy.data.objects):
        if o.type != 'ARMATURE':
            bpy.data.objects.remove(o, do_unlink=True)
    acts = list(bpy.data.actions)
    if 'name' in opt and acts:
        acts[0].name = opt['name']

if 'scale' in opt:
    s = float(opt['scale'])
    for o in bpy.context.scene.objects:
        if o.parent is None:
            o.scale = [c * s for c in o.scale]

# Downscale textures and rewrite them as standalone files so the exporter encodes the small versions.
tmp = Path(tempfile.mkdtemp(prefix='glbconv_'))
for i, img in enumerate(bpy.data.images):
    if img.source != 'FILE' or img.size[0] == 0:
        continue
    w, h = img.size
    if max(w, h) > max_tex:
        k = max_tex / max(w, h)
        img.scale(max(1, int(w * k)), max(1, int(h * k)))
    name = Path(img.filepath or img.name).suffix.lower()
    png = name == '.png' or img.file_format == 'PNG'
    if png and 'jpg' in flags:
        px = img.pixels[:]
        png = img.channels == 4 and min(px[3::4]) < 0.99
    out = tmp / f'img{i}.{"png" if png else "jpg"}'
    img.filepath_raw = str(out)
    img.file_format = 'PNG' if png else 'JPEG'
    if img.packed_file:
        img.unpack(method='REMOVE')
        img.filepath_raw = str(out)
    img.save()

# Optional decimation of heavy meshes, keeping the total under max_tris.
if max_tris > 0:
    meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']
    deps = bpy.context.evaluated_depsgraph_get()
    total = 0
    for o in meshes:
        m = o.evaluated_get(deps).data
        total += sum(len(p.vertices) - 2 for p in m.polygons)
    if total > max_tris:
        ratio = max_tris / total
        for o in meshes:
            if o.find_armature():
                continue  # never collapse skinned meshes
            mod = o.modifiers.new('dec', 'DECIMATE')
            mod.ratio = ratio
            mod.use_collapse_triangulate = True
        print(f'decimated {total} -> ~{max_tris} tris (ratio {ratio:.3f})')

dest.parent.mkdir(parents=True, exist_ok=True)
bpy.ops.export_scene.gltf(
    filepath=str(dest), export_format='GLB', export_image_format='AUTO', export_apply=True,
    export_animations='noanim' not in flags, export_skins=True, export_yup=True,
    export_texcoords=True, export_normals=True, export_materials='EXPORT', export_cameras=False,
    export_lights=False)
print('EXPORTED', dest, os.path.getsize(dest))
