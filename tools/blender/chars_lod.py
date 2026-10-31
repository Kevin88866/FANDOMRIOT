# 把 Mixamo 人物处理成游戏用的两档：
#   <名字>.glb      玩家用：网格合并成一个（减少绘制调用），贴图 1024
#   <名字>_lod.glb  路人用：再减面到约 9000 三角形，贴图 512
# 运行：/tmp/bvenv/bin/python tools/blender/chars_lod.py [名字...]
import bpy, os, sys, glob, addon_utils
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
SRC = os.path.join(ROOT, 'assets', 'thirdparty', 'characters')
OUT = os.path.join(ROOT, 'assets', 'models', 'chars')
os.makedirs(OUT, exist_ok=True)


def tris(objs):
    return sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in objs)


def process(path, name, lod, tex):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=path)
    meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']
    bpy.ops.object.select_all(action='DESELECT')
    for o in meshes: o.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    if len(meshes) > 1: bpy.ops.object.join()
    body = bpy.context.view_layer.objects.active
    body.name = 'body'
    if lod:
        n = tris([body])
        if n > lod:
            m = body.modifiers.new('dec', 'DECIMATE'); m.ratio = lod / n; m.use_collapse_triangulate = True
            # 修改器要排在骨骼修改器之前才能应用
            bpy.ops.object.modifier_move_to_index(modifier='dec', index=0)
            bpy.ops.object.modifier_apply(modifier='dec')
    for img in bpy.data.images:
        if img.size[0] > tex: img.scale(tex, tex * img.size[1] // max(1, img.size[0]))
    out = os.path.join(OUT, name + ('_lod' if lod else '') + '.glb')
    bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', export_skins=True, export_animations=False,
                              export_morph=False)
    print(name, 'lod' if lod else 'full', tris([body]), 'tris', os.path.getsize(out) // 1024, 'KB')


names = sys.argv[1:] or [os.path.basename(d).replace('mixamo_', '') for d in sorted(glob.glob(os.path.join(SRC, 'mixamo_*')))]
for nm in names:
    src = glob.glob(os.path.join(SRC, 'mixamo_' + nm, '*.glb'))[0]
    process(src, nm, None, 1024)
    process(src, nm, 9000, 512)
