# 写实行道树：拆分 Poly Pizza 的枫树组（CC0，带树皮和叶片透明贴图），另加 Poly Haven 小树和灌木（减面）。
# 运行：/tmp/bvenv/bin/python tools/blender/trees2.py
import sys, os, glob
sys.path.insert(0, os.path.dirname(__file__))
from lib import *

TP = os.path.join(ROOT, 'assets', 'thirdparty', 'plants')


def load(name):
    reset()
    bpy.ops.import_scene.gltf(filepath=glob.glob(os.path.join(TP, name, '*.glb'))[0])
    for o in list(bpy.context.scene.objects):
        if o.type == 'MESH':
            mw = o.matrix_world.copy(); o.parent = None; o.matrix_world = mw
    for o in list(bpy.context.scene.objects):
        if o.type != 'MESH': bpy.data.objects.remove(o, do_unlink=True)
    for img in bpy.data.images:
        if img.size[0] > 512: img.scale(512, 512)
    return [o for o in bpy.context.scene.objects if o.type == 'MESH']


def finish(objs, name, height, limit=None):
    """合并、落地居中、缩放到目标高度、可选减面，导出（保留贴图，不烘焙 AO）。"""
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs: o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    if len(objs) > 1: bpy.ops.object.join()
    o = bpy.context.view_layer.objects.active
    bb = [Vector(c) for c in o.bound_box]
    lo = Vector((min(v.x for v in bb), min(v.y for v in bb), min(v.z for v in bb))); hi = Vector((max(v.x for v in bb), max(v.y for v in bb), max(v.z for v in bb)))
    s = height / (hi.z - lo.z)
    for v in o.data.vertices: v.co = (v.co - Vector(((lo.x + hi.x) / 2, (lo.y + hi.y) / 2, lo.z))) * s
    if limit:
        n = sum(len(p.vertices) - 2 for p in o.data.polygons)
        if n > limit:
            m = o.modifiers.new('dec', 'DECIMATE'); m.ratio = limit / n; m.use_collapse_triangulate = True
            apply_mods(o)
    for m in o.data.materials:   # 叶片材质改名 leaf_*，游戏里按名字开 alphaTest + 双面 + 风摆
        if m and any(k in m.name.lower() for k in ('leaf', 'leaves', 'shrub', 'orange')):
            m.name = 'leaf_' + m.name
            # 叶片贴图去色（保留明暗和透明度），游戏里按实例染成红 / 橙 / 黄 / 绿
            for n in m.node_tree.nodes:
                if n.type == 'TEX_IMAGE' and n.image and n.image.colorspace_settings.name != 'Non-Color' and not n.image.get('gray'):
                    import numpy as np
                    img = n.image; px = np.array(img.pixels[:]).reshape(-1, 4)
                    lum = px[:, 0] * 0.3 + px[:, 1] * 0.59 + px[:, 2] * 0.11
                    lum = np.clip(lum / max(1e-3, np.percentile(lum[px[:, 3] > 0.5], 85)) * 0.85, 0, 1)
                    px[:, 0] = px[:, 1] = px[:, 2] = lum
                    img.pixels[:] = px.ravel(); img['gray'] = 1; img.pack()
    o.name = 'tree'
    export(name, vertex_colors=False)
    preview(name)


def maple(k):
    """枫树组：5 棵并排，拆成单独的模型（按 X 位置聚类）。"""
    objs = load('polypizza_maple_trees')
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs: o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    if len(objs) > 1: bpy.ops.object.join()
    bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT'); bpy.ops.mesh.separate(type='LOOSE'); bpy.ops.object.mode_set(mode='OBJECT')
    parts = [o for o in bpy.context.scene.objects if o.type == 'MESH']
    cx = lambda o: sum((o.matrix_world @ Vector(c)).x for c in o.bound_box) / 8
    xs = [cx(o) for o in parts]; lo, hi = min(xs), max(xs)
    keep = []
    for o, x in zip(parts, xs):
        if min(4, int((x - lo) / ((hi - lo) / 5 + 1e-6))) == k: keep.append(o)
        else: bpy.data.objects.remove(o, do_unlink=True)
    return keep


if __name__ == '__main__':
    for k, h in ((0, 7.0), (2, 8.0), (4, 6.5)):
        finish(maple(k), f'tr_maple{k}', h)
