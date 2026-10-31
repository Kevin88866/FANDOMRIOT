# 一楼店面内景模块：宽 6 米、深 3 米、高 3.6 米，正面朝 -Y（导出后朝 +Z，对着街）。
# 用下载的 CC0 家具（Kenney / Poly Haven）摆进带 PBR 地板墙面的房间，前面是玻璃门窗。
# 运行：/tmp/bvenv/bin/python tools/blender/shops.py [名字...]
import sys, os, math, random, glob
sys.path.insert(0, os.path.dirname(__file__))
from lib import *
import bmesh

TP = os.path.join(ROOT, 'assets', 'thirdparty')
W, D, H = 6.0, 3.0, 3.6


def pbr(name, folder, scale=1.0, tint=None):
    """用下载的 PBR 贴图建材质（颜色 + 法线 + 粗糙度），图片缩到 512。"""
    m = bpy.data.materials.new(name); m.use_nodes = True
    nt = m.node_tree; b = nt.nodes.get('Principled BSDF')
    d = glob.glob(os.path.join(TP, 'textures', folder, '*'))
    pick = lambda key: next((f for f in d if key in os.path.basename(f)), None)
    def tex(path, non_color=False):
        img = bpy.data.images.load(path, check_existing=True)
        if img.size[0] > 512: img.scale(512, 512)
        if non_color: img.colorspace_settings.name = 'Non-Color'
        n = nt.nodes.new('ShaderNodeTexImage'); n.image = img; return n
    if pick('_diff'):
        t = tex(pick('_diff'))
        if tint:
            mix = nt.nodes.new('ShaderNodeMix'); mix.data_type = 'RGBA'; mix.blend_type = 'MULTIPLY'; mix.inputs['Factor'].default_value = 1
            nt.links.new(t.outputs['Color'], mix.inputs[6]); mix.inputs[7].default_value = (*tint, 1); nt.links.new(mix.outputs[2], b.inputs['Base Color'])
        else:
            nt.links.new(t.outputs['Color'], b.inputs['Base Color'])
    if pick('_rough'):
        t = tex(pick('_rough'), True); nt.links.new(t.outputs['Color'], b.inputs['Roughness'])
    if pick('_nor_gl'):
        t = tex(pick('_nor_gl'), True); nm = nt.nodes.new('ShaderNodeNormalMap'); nt.links.new(t.outputs['Color'], nm.inputs['Color']); nt.links.new(nm.outputs['Normal'], b.inputs['Normal'])
    m['uvscale'] = scale
    return m


def uv_world(o, scale=1.0):
    """按世界尺寸铺 UV（地板、墙面贴图不拉伸）。"""
    me = o.data; uv = me.uv_layers.new(name='UVMap') if not me.uv_layers else me.uv_layers[0]
    for poly in me.polygons:
        n = poly.normal
        for li in poly.loop_indices:
            v = me.vertices[me.loops[li].vertex_index].co + o.location
            if abs(n.z) > 0.5: uv.data[li].uv = (v.x / scale, v.y / scale)
            elif abs(n.x) > 0.5: uv.data[li].uv = (v.y / scale, v.z / scale)
            else: uv.data[li].uv = (v.x / scale, v.z / scale)


def imp(cat, name, height=None, loc=(0, 0, 0), rz=0.0, limit=700, parent=None, width=None, size=None):
    """导入一个下载的模型：合并、按目标高度（或宽度）缩放、减面、放好位置。"""
    path = glob.glob(os.path.join(TP, cat, name, '*.glb'))[0]
    before = set(bpy.context.scene.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    new = [o for o in bpy.context.scene.objects if o not in before]
    meshes = [o for o in new if o.type == 'MESH']
    names = [x.name for x in new]
    bpy.ops.object.select_all(action='DESELECT')
    for o in meshes: o.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    for o in meshes:   # 先脱离父级、应用变换
        mw = o.matrix_world.copy(); o.parent = None; o.matrix_world = mw
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    if len(meshes) > 1: bpy.ops.object.join()
    o = bpy.context.view_layer.objects.active
    keep = o.name
    for nm in names:
        if nm != keep and nm in bpy.data.objects: bpy.data.objects.remove(bpy.data.objects[nm], do_unlink=True)
    # 底部中心作为原点
    bb = [o.matrix_world @ Vector(c) for c in o.bound_box]
    lo = Vector((min(v.x for v in bb), min(v.y for v in bb), min(v.z for v in bb))); hi = Vector((max(v.x for v in bb), max(v.y for v in bb), max(v.z for v in bb)))
    for v in o.data.vertices: v.co -= Vector(((lo.x + hi.x) / 2, (lo.y + hi.y) / 2, lo.z))
    s = 1.0
    if size: s = size / max(1e-4, max(hi - lo))
    elif height: s = height / max(1e-4, hi.z - lo.z)
    elif width: s = width / max(1e-4, hi.x - lo.x)
    o.scale = (s, s, s); o.location = loc; o.rotation_euler = (0, 0, rz)
    bpy.context.view_layer.objects.active = o
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    n = sum(len(p.vertices) - 2 for p in o.data.polygons)
    if n > limit:
        m = o.modifiers.new('dec', 'DECIMATE'); m.ratio = limit / n
        apply_mods(o)
    for img in bpy.data.images:
        if img.size[0] > 512: img.scale(512, 512 * img.size[1] // max(1, img.size[0]))
    o.name = 'imp_' + name
    if parent: o.parent = parent
    return o


def room(root, floor_mat, wall_mat, light_color=(1, 0.97, 0.9), night=1.0):
    """房间壳：地板、后墙、侧墙、天花板灯带、正面玻璃门窗和窗框。"""
    f = box('floor', (W, D, 0.06), (0, 0, 0.03), floor_mat, parent=root); uv_world(f, 1.2)
    for nm, size, loc in (('back', (W, 0.1, H), (0, D / 2, H / 2)), ('sideL', (0.1, D, H), (-W / 2, 0, H / 2)), ('sideR', (0.1, D, H), (W / 2, 0, H / 2))):
        o = box(nm, size, loc, wall_mat, parent=root); uv_world(o, 1.5)
    box('ceiling', (W, D, 0.08), (0, 0, H), mat('ceiling', (0.9, 0.9, 0.88), rough=0.9), parent=root)
    lm = mat('emit_shop', (1, 1, 1), emit=light_color, strength=3.0 * night)
    for x in (-1.5, 1.5):
        box(f'light{x}', (2.2, 0.35, 0.03), (x, 0.2, H - 0.06), lm, parent=root)
    # 玻璃立面：竖框 + 玻璃 + 门（右侧）+ 底部踢脚 + 门把手
    frame = mat('frame', (0.12, 0.13, 0.14), metal=0.8, rough=0.35)
    gl = mat('glass_clear', (0.75, 0.82, 0.86), rough=0.04)
    gl.node_tree.nodes.get('Principled BSDF').inputs['Alpha'].default_value = 0.18
    box('glass', (W - 0.1, 0.02, H - 0.25), (0, -D / 2 + 0.03, (H - 0.25) / 2 + 0.15), gl, parent=root)
    for x in (-W / 2 + 0.04, -1.0, 1.2, 2.6, W / 2 - 0.04):
        box(f'mull{x}', (0.07, 0.09, H), (x, -D / 2 + 0.02, H / 2), frame, parent=root)
    box('kick', (W, 0.1, 0.15), (0, -D / 2 + 0.02, 0.075), frame, parent=root)
    box('transom', (W, 0.1, 0.08), (0, -D / 2 + 0.02, 2.4), frame, parent=root)
    box('head', (W, 0.12, 0.12), (0, -D / 2 + 0.02, H - 0.06), frame, parent=root)
    box('handle', (0.03, 0.06, 0.6), (1.35, -D / 2 - 0.04, 1.1), mat('chrome', (0.9, 0.9, 0.9), metal=1, rough=0.2), parent=root)


_proto = {}


def proto(cat, name, size):
    """商品原型只导入一次，后面复制网格（快很多）。"""
    key = (name, size)
    if key not in _proto:
        o = imp(cat, name, size=size, loc=(0, 0, -50), limit=150)
        _proto[key] = o
    return _proto[key]


def dup(src, loc, rz, parent):
    o = src.copy(); o.data = src.data  # 共享网格，合并时会各自实化
    bpy.context.scene.collection.objects.link(o)
    o.location = loc; o.rotation_euler = (0, 0, rz); o.parent = parent
    return o


def gondola(root, x, y, width, rnd, kinds, rows=(0.12, 0.55, 0.98, 1.41), depth=0.45, face=-1):
    """超市货架：背板 + 层板 + 两侧立柱，层板上排满商品（朝向 face）。"""
    steel = mat('shelf_steel', (0.82, 0.83, 0.84), metal=0.6, rough=0.4)
    box(f'gback{x}{y}', (width, 0.04, 1.75), (x, y - face * depth / 2, 0.9), steel, parent=root)
    for sx in (-width / 2, width / 2):
        box(f'gpost{x}{y}{sx}', (0.04, depth, 1.8), (x + sx, y, 0.9), steel, parent=root)
    for z in rows:
        box(f'gshelf{x}{y}{z}', (width, depth, 0.025), (x, y, z), steel, parent=root)
        box(f'glip{x}{y}{z}', (width, 0.01, 0.05), (x, y + face * depth / 2, z + 0.02), mat('pricetag', (0.95, 0.85, 0.2), rough=0.6), parent=root)
        # 商品用极简几何（6 边柱 / 盒子），一排合并成一个网格：远看是满满一排货，三角形很少
        kind = rnd.choice(('can', 'bottle', 'box', 'bag'))
        col = rnd.choice(GOODS_COLORS)
        gm = mat(f'goods_{col[0]:.2f}_{col[1]:.2f}', col, rough=0.45)
        step = {'can': 0.075, 'bottle': 0.085, 'box': 0.13, 'bag': 0.16}[kind]
        n = int((width - 0.08) / step); parts = []
        for i in range(n):
            px = x - width / 2 + 0.06 + i * step
            if kind == 'can': parts.append(cyl(f'g{x}{y}{z}{i}', 0.03, 0.12, (px, y, z + 0.073), gm, verts=6, parent=root, smooth_angle=None))
            elif kind == 'bottle': parts.append(cyl(f'g{x}{y}{z}{i}', 0.032, 0.24, (px, y, z + 0.133), gm, verts=6, parent=root, smooth_angle=None))
            elif kind == 'box': parts.append(box(f'g{x}{y}{z}{i}', (0.11, 0.3, 0.2), (px, y, z + 0.113), gm, parent=root))
            else: parts.append(box(f'g{x}{y}{z}{i}', (0.14, 0.06, 0.2), (px, y - 0.05, z + 0.113), gm, parent=root))
        join(parts, f'goods{x}{y}{z}')


GOODS_COLORS = [(0.85, 0.15, 0.12), (0.12, 0.45, 0.85), (0.95, 0.75, 0.1), (0.2, 0.65, 0.3), (0.95, 0.95, 0.92), (0.55, 0.2, 0.6), (0.95, 0.5, 0.15)]
GOODS = [('props', 'kenney_soda_can', 0.13), ('props', 'kenney_soda_bottle', 0.24), ('props', 'kenney_carton', 0.2),
         ('props', 'kenney_bottle_ketchup', 0.18), ('props', 'kenney_chocolate', 0.16), ('props', 'kenney_candy_bar', 0.14)]


def conv():   # 便利店
    root = empty('model'); rnd = random.Random(1); _proto.clear()
    room(root, pbr('floor', 'polyhaven_floor_tiles_06'), mat('wall', (0.93, 0.93, 0.92), rough=0.8), (0.95, 0.98, 1.0))
    gondola(root, -1.6, 1.15, 2.4, rnd, GOODS)          # 后墙货架
    gondola(root, 0.3, 0.05, 1.6, rnd, GOODS, rows=(0.12, 0.55, 0.98), face=-1)   # 中岛货架
    for x in (1.75, 2.55):   # 冷柜（发光）
        imp('interior', 'kenney_kitchenFridgeLarge', height=2.0, loc=(x, 1.2, 0.06), parent=root)
        box(f'cold{x}', (0.72, 0.02, 1.5), (x, 0.95, 1.15), mat('emit_cold', (0.9, 0.95, 1), emit=(0.8, 0.9, 1), strength=1.6), parent=root)
    imp('interior', 'kenney_kitchenBar', height=1.0, loc=(-2.0, -0.7, 0.06), rz=math.pi, parent=root)
    imp('interior', 'polyhaven_CashRegister_01', height=0.32, loc=(-2.0, -0.7, 1.06), rz=math.pi, parent=root, limit=800)
    imp('interior', 'polyhaven_WetFloorSign_01', height=0.65, loc=(1.0, -1.0, 0.06), rz=0.4, parent=root)
    imp('props', 'polyhaven_cardboard_box_01', height=0.35, loc=(2.5, -0.4, 0.06), parent=root, limit=300)
    for o in _proto.values(): bpy.data.objects.remove(o, do_unlink=True)


def cafe():   # 咖啡店
    root = empty('model'); rnd = random.Random(2)
    room(root, pbr('floor', 'polyhaven_wood_floor'), pbr('wall', 'polyhaven_painted_brick', tint=(0.95, 0.9, 0.85)), (1.0, 0.86, 0.66), 0.8)
    for x in (-2.4, -1.6, -0.8):
        imp('interior', 'kenney_kitchenBar', height=1.05, loc=(x, 1.1, 0.06), parent=root)
    imp('interior', 'kenney_kitchenCoffeeMachine', height=0.42, loc=(-2.0, 1.15, 1.11), parent=root)
    imp('props', 'kenney_cup_coffee', height=0.12, loc=(-1.4, 1.05, 1.11), parent=root)
    imp('interior', 'polyhaven_standing_chalkboard_01', height=1.5, loc=(-0.2, 1.3, 0.06), parent=root)
    for x, y in ((0.9, -0.3), (2.2, 0.6)):
        imp('interior', 'polyhaven_coffee_table_round_01', height=0.75, width=None, loc=(x, y, 0.06), parent=root, limit=600)
        for a in (0, math.pi):
            imp('interior', 'polyhaven_bar_chair_round_01', height=0.8, loc=(x + math.cos(a) * 0.7, y + math.sin(a) * 0.7, 0.06), rz=a + math.pi / 2, parent=root, limit=700)
    for x in (-1.2, 1.5):
        imp('interior', 'polyhaven_hanging_industrial_lamp', height=1.0, loc=(x, 0.3, H - 1.0), parent=root, limit=600)
    imp('interior', 'kenney_pottedPlant', height=1.1, loc=(2.6, 1.2, 0.06), parent=root)


def chicken():   # 炸鸡店 / 小饭馆
    root = empty('model')
    room(root, pbr('floor', 'polyhaven_terrazzo_tiles'), mat('wall', (0.95, 0.88, 0.75), rough=0.8), (1.0, 0.92, 0.78))
    for x in (-1.8, 0.4, 2.2):
        imp('interior', 'polyhaven_round_wooden_table_01', height=0.74, loc=(x, 0.3, 0.06), parent=root, limit=600)
        for a in (0.3, math.pi + 0.3):
            imp('interior', 'polyhaven_plastic_monobloc_chair_01', height=0.82, loc=(x + math.cos(a) * 0.75, 0.3 + math.sin(a) * 0.75, 0.06), rz=a - math.pi / 2, parent=root, limit=500)
        imp('props', 'kenney_fries', height=0.12, loc=(x, 0.3, 0.8), parent=root)
    imp('interior', 'polyhaven_Television_01', height=0.5, loc=(0, 1.42, 2.3), rz=math.pi, parent=root, limit=600)
    imp('interior', 'polyhaven_wall_clock', height=0.32, loc=(-2.0, 1.45, 2.5), rz=math.pi, parent=root, limit=300)
    imp('interior', 'polyhaven_korean_fire_extinguisher_01', height=0.6, loc=(2.7, 1.2, 0.06), parent=root, limit=500)


def pcbang():   # 网吧（PC 방）
    root = empty('model')
    room(root, pbr('floor', 'ambientcg_Carpet016'), mat('wall', (0.2, 0.22, 0.3), rough=0.8), (0.75, 0.82, 1.0), 0.9)
    box('ledstrip', (W - 0.3, 0.04, 0.05), (0, D / 2 - 0.06, 2.6), mat('emit_rgb', (0.4, 0.1, 0.8), emit=(0.6, 0.2, 1.0), strength=4), parent=root)
    for row, y in enumerate((0.9, -0.3)):
        for x in (-2.0, 0.0, 2.0):
            imp('interior', 'polyhaven_metal_office_desk', height=0.75, loc=(x, y, 0.06), parent=root, limit=500)
            for dx in (-0.45, 0.45):
                imp('interior', 'kenney_computerScreen', height=0.45, loc=(x + dx, y + 0.15, 0.81), parent=root)
                box(f'scr{x}{y}{dx}', (0.5, 0.01, 0.28), (x + dx, y + 0.11, 1.04), mat('emit_screen', (0.2, 0.4, 0.9), emit=(0.3, 0.55, 1), strength=2.5), parent=root)
                imp('interior', 'kenney_computerKeyboard', height=0.03, width=0.4, loc=(x + dx, y - 0.15, 0.81), parent=root)
                imp('interior', 'kenney_chairDesk', height=1.0, loc=(x + dx, y - 0.65, 0.06), parent=root)


def phone():   # 手机店 / 小商店：展示柜 + 柜台
    root = empty('model')
    room(root, pbr('floor', 'polyhaven_marble_tiles'), mat('wall', (0.97, 0.97, 0.97), rough=0.6), (1, 1, 1))
    for x in (-2.4, -1.4, 1.6, 2.6):
        imp('interior', 'polyhaven_wooden_display_shelves_01', height=1.6, loc=(x, 1.0, 0.06), rz=math.pi / 2, parent=root, limit=600)
    imp('interior', 'polyhaven_drawer_cabinet', height=1.0, loc=(0.1, 0.4, 0.06), rz=math.pi, parent=root, limit=600)
    for x in (-0.3, 0.1, 0.5):
        imp('props', 'polypizza_smartphone', height=0.16, loc=(x, 0.35, 1.06), parent=root, limit=200)
    imp('interior', 'kenney_pottedPlant', height=1.0, loc=(-2.6, -0.8, 0.06), parent=root)


ALL = {'shop_conv': conv, 'shop_cafe': cafe, 'shop_chicken': chicken, 'shop_pcbang': pcbang, 'shop_phone': phone}

if __name__ == '__main__':
    names = [a for a in sys.argv[1:] if a in ALL] or list(ALL)
    for n in names:
        build(n, ALL[n], max_len=4.0)
