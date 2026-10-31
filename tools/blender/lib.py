# Blender 资产公共工具（在 /tmp/bvenv 的 bpy 里运行，Blender 5.2）
# 坐标约定：Blender Z 向上，模型"前方"朝 -Y；导出 glTF 时会转成 Y 向上、前方 +Z（和游戏里一致）。
import bpy, bmesh, math, os, time, addon_utils
from mathutils import Vector, Matrix

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
OUT = os.path.join(ROOT, 'assets', 'models')
PREV = os.path.join(ROOT, 'tools', 'blender', 'previews')
os.makedirs(OUT, exist_ok=True); os.makedirs(PREV, exist_ok=True)

_mats = {}


def reset():
    """清空场景，开启 Cycles。每个资产单独一个干净场景。"""
    bpy.ops.wm.read_factory_settings(use_empty=True)
    addon_utils.enable('cycles', default_set=True)
    _mats.clear()
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'
    sc.cycles.device = 'CPU'
    sc.unit_settings.system = 'METRIC'


def mat(name, color=(0.8, 0.8, 0.8), metal=0.0, rough=0.5, emit=None, strength=1.0, coat=0.0, coat_rough=0.05):
    """PBR 材质。名字有意义：游戏里按材质名找部件（paint=车漆可换色，emit_*=夜间发光，screen=贴文字的屏幕）。"""
    m = _mats.get(name)    # 同名材质：以最后一次调用的参数为准（方便各车型改车漆颜色）
    if m is None:
        m = bpy.data.materials.new(name)
        m.use_nodes = True
    b = m.node_tree.nodes.get('Principled BSDF')
    b.inputs['Base Color'].default_value = (*color, 1)
    b.inputs['Metallic'].default_value = metal
    b.inputs['Roughness'].default_value = rough
    if emit:
        b.inputs['Emission Color'].default_value = (*emit, 1)
        b.inputs['Emission Strength'].default_value = strength
    if coat:
        b.inputs['Coat Weight'].default_value = coat
        b.inputs['Coat Roughness'].default_value = coat_rough
    _mats[name] = m
    return m


# ---------------- 网格构建 ----------------
def link(name, bm, materials, parent=None, smooth_angle=None):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(o)
    for m in (materials if isinstance(materials, (list, tuple)) else [materials]):
        me.materials.append(m)
    if parent:
        o.parent = parent
    if smooth_angle is not None:
        smooth(o, smooth_angle)
    return o


def smooth(o, angle=35):
    me = o.data
    for p in me.polygons:
        p.use_smooth = True
    try:
        me.set_sharp_from_angle(angle=math.radians(angle))
    except Exception:
        pass


def empty(name, loc=(0, 0, 0), parent=None):
    e = bpy.data.objects.new(name, None)
    bpy.context.scene.collection.objects.link(e)
    e.location = loc
    if parent:
        e.parent = parent
    return e


def box(name, size, loc=(0, 0, 0), material=None, bevel=0.0, seg=2, parent=None, rot=(0, 0, 0), smooth_angle=None):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=size, verts=bm.verts)
    o = link(name, bm, material, parent, smooth_angle)
    o.location = loc
    o.rotation_euler = rot
    if bevel:
        add_bevel(o, bevel, seg)
    return o


def cyl(name, r, depth, loc=(0, 0, 0), material=None, axis='Z', verts=24, r2=None, bevel=0.0, seg=2, parent=None, smooth_angle=40):
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=verts, radius1=r, radius2=r if r2 is None else r2, depth=depth)
    if axis == 'X':
        bmesh.ops.rotate(bm, verts=bm.verts, cent=(0, 0, 0), matrix=Matrix.Rotation(math.radians(90), 3, 'Y'))
    elif axis == 'Y':
        bmesh.ops.rotate(bm, verts=bm.verts, cent=(0, 0, 0), matrix=Matrix.Rotation(math.radians(90), 3, 'X'))
    o = link(name, bm, material, parent, smooth_angle)
    o.location = loc
    if bevel:
        add_bevel(o, bevel, seg)
    return o


def sphere(name, r, loc=(0, 0, 0), material=None, seg=16, rings=10, scale=(1, 1, 1), parent=None):
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=seg, v_segments=rings, radius=r)
    bmesh.ops.scale(bm, vec=scale, verts=bm.verts)
    o = link(name, bm, material, parent, 60)
    o.location = loc
    return o


def plane(name, w, h, loc=(0, 0, 0), material=None, normal='-Y', parent=None):
    """带 0..1 UV 的矩形面（贴文字用）。normal 指向观看方向。"""
    bm = bmesh.new()
    uv = bm.loops.layers.uv.new('UVMap')
    hw, hh = w / 2, h / 2
    if normal == '-Y':
        co = [(-hw, 0, -hh), (hw, 0, -hh), (hw, 0, hh), (-hw, 0, hh)]
    elif normal == '+Y':
        co = [(hw, 0, -hh), (-hw, 0, -hh), (-hw, 0, hh), (hw, 0, hh)]
    elif normal == '+X':   # 从 +X 看过去，右手边是 +Y
        co = [(0, -hw, -hh), (0, hw, -hh), (0, hw, hh), (0, -hw, hh)]
    elif normal == '-X':   # 从 -X 看过去，右手边是 -Y
        co = [(0, hw, -hh), (0, -hw, -hh), (0, -hw, hh), (0, hw, hh)]
    else:  # '+Z'
        co = [(-hw, -hh, 0), (hw, -hh, 0), (hw, hh, 0), (-hw, hh, 0)]
    vs = [bm.verts.new(c) for c in co]
    f = bm.faces.new(vs)
    for loop, (u, v) in zip(f.loops, [(0, 0), (1, 0), (1, 1), (0, 1)]):
        loop[uv].uv = (u, v)
    o = link(name, bm, material, parent)
    o.location = loc
    return o


def grid(name, w, h, nx, ny, loc=(0, 0, 0), material=None, normal='-Y', parent=None):
    """细分的矩形面（横幅布料要做飘动动画），UV 0..1。"""
    bm = bmesh.new()
    uv = bm.loops.layers.uv.new('UVMap')
    vs = []
    for j in range(ny + 1):
        row = []
        for i in range(nx + 1):
            u, v = i / nx, j / ny
            x, z = (u - 0.5) * w, (v - 0.5) * h
            row.append(bm.verts.new((x, 0, z) if normal == '-Y' else (-x, 0, z)))
        vs.append(row)
    for j in range(ny):
        for i in range(nx):
            f = bm.faces.new((vs[j][i], vs[j][i + 1], vs[j + 1][i + 1], vs[j + 1][i]))
            for loop, (a, b) in zip(f.loops, ((i, j), (i + 1, j), (i + 1, j + 1), (i, j + 1))):
                loop[uv].uv = (a / nx, b / ny)
    o = link(name, bm, material, parent)
    o.location = loc
    return o


def lathe(name, prof, loc=(0, 0, 0), material=None, seg=24, parent=None, smooth_angle=50):
    """旋转体：prof 是 (半径, 高度) 点列，从下到上。"""
    bm = bmesh.new()
    vs = [bm.verts.new((r, 0, z)) for r, z in prof]
    es = [bm.edges.new((vs[i], vs[i + 1])) for i in range(len(vs) - 1)]
    bmesh.ops.spin(bm, geom=vs + es, angle=math.radians(360), steps=seg, axis=(0, 0, 1), cent=(0, 0, 0))
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-4)
    # 封口
    for z in (prof[0][1], prof[-1][1]):
        ring = [e for e in bm.edges if e.is_boundary and all(abs(v.co.z - z) < 1e-4 for v in e.verts)]
        if ring:
            try:
                bmesh.ops.edgeloop_fill(bm, edges=ring)
            except Exception:
                pass
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    o = link(name, bm, material, parent, smooth_angle)
    o.location = loc
    return o


def tube(name, pts, r, material=None, parent=None, res=8):
    """沿折线/曲线扫一个圆截面（灯臂、栏杆扶手）。pts 为控制点，自动平滑。"""
    cu = bpy.data.curves.new(name, 'CURVE')
    cu.dimensions = '3D'
    cu.bevel_depth = r
    cu.bevel_resolution = 0 if r < 0.025 else 1 if r < 0.09 else 2   # 细管子少几段
    cu.resolution_u = res
    cu.use_fill_caps = True
    sp = cu.splines.new('BEZIER')
    sp.bezier_points.add(len(pts) - 1)
    for bp, p in zip(sp.bezier_points, pts):
        bp.co = p
        bp.handle_left_type = bp.handle_right_type = 'AUTO'
    co = bpy.data.objects.new(name + '_c', cu)
    bpy.context.scene.collection.objects.link(co)
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(co.evaluated_get(dg), depsgraph=dg)
    bpy.data.objects.remove(co, do_unlink=True)
    o = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(o)
    if material:
        me.materials.append(material)
    if parent:
        o.parent = parent
    smooth(o, 60)
    return o


def uvbox(name, size, loc=(0, 0, 0), material=None, tile=(12.0, 22.4), parent=None, faces='all'):
    """贴楼面贴图用的盒子：UV 按世界尺寸（一格 = 一块立面贴图），上下叠放的盒子贴图能对齐。"""
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=size, verts=bm.verts)
    bmesh.ops.translate(bm, vec=loc, verts=bm.verts)
    uv = bm.loops.layers.uv.new('UVMap')
    tw, th = tile
    for f in bm.faces:
        n = f.normal
        for l in f.loops:
            x, y, z = l.vert.co
            if abs(n.x) > 0.5:
                l[uv].uv = ((y if n.x > 0 else -y) / tw, z / th)
            elif abs(n.y) > 0.5:
                l[uv].uv = ((-x if n.y > 0 else x) / tw, z / th)
            else:
                l[uv].uv = (x / tw, y / tw)
    if faces == 'sides':
        bmesh.ops.delete(bm, geom=[f for f in bm.faces if abs(f.normal.z) > 0.5], context='FACES')
    o = link(name, bm, material, parent)
    return o


def extrude_profile(name, pts, width, material, parent=None, bevel=0.0, seg=3, angle=35, x0=None):
    """侧面轮廓（y, z 点列）沿 X 方向挤出成实体，宽 width。"""
    bm = bmesh.new()
    x = -width / 2 if x0 is None else x0
    vs = [bm.verts.new((x, y, z)) for (y, z) in pts]
    f = bm.faces.new(vs)
    res = bmesh.ops.extrude_face_region(bm, geom=[f])
    ev = [e for e in res['geom'] if isinstance(e, bmesh.types.BMVert)]
    bmesh.ops.translate(bm, verts=ev, vec=(width, 0, 0))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    o = link(name, bm, material, parent)
    if bevel:
        add_bevel(o, bevel, seg, angle)
    smooth(o, angle)
    return o


def add_bevel(o, width, seg=2, angle=30):
    m = o.modifiers.new('bevel', 'BEVEL')
    m.width = width
    m.segments = seg
    m.limit_method = 'ANGLE'
    m.angle_limit = math.radians(angle)
    m.harden_normals = False
    return m


def apply_mods(o):
    """把修改器结果烘焙成真实网格（烘焙顶点色前必须这样做）。"""
    if o.type != 'MESH' or not o.modifiers:
        return
    dg = bpy.context.evaluated_depsgraph_get()
    oe = o.evaluated_get(dg)
    me = bpy.data.meshes.new_from_object(oe, preserve_all_data_layers=True, depsgraph=dg)
    o.modifiers.clear()
    old = o.data
    o.data = me
    if old.users == 0:
        bpy.data.meshes.remove(old)


def boolean(o, cutter, op='DIFFERENCE'):
    m = o.modifiers.new('bool', 'BOOLEAN')
    m.operation = op
    m.object = cutter
    try:
        m.solver = 'EXACT'
    except Exception:
        pass
    apply_mods(o)
    bpy.data.objects.remove(cutter, do_unlink=True)


def join(objs, name):
    """合并多个网格（减少游戏里的节点数）。"""
    objs = [o for o in objs if o and o.type == 'MESH']
    if not objs:
        return None
    for o in objs:
        apply_mods(o)
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.join()
    objs[0].name = name
    return objs[0]


# ---------------- 烘焙 / 导出 / 预览 ----------------
KEEP_PREFIX = ('screen', 'sign_', 'ribbon', 'cloth', 'lamp_', 'keep_')
SPECIAL_MAT = ('paint', 'glass', 'emit_', 'screen', 'cloth', 'leaf', 'skin', 'facade')


def _special(m):
    # 带贴图的材质（导入的 Poly Haven 模型、PBR 地板墙面）不能并进顶点色共享材质
    if m is not None and m.use_nodes and any(n.type == 'TEX_IMAGE' for n in m.node_tree.nodes):
        return True
    return m is None or m.name.startswith(SPECIAL_MAT)


def _group_of(o):
    """网格归属的分组节点：最近的 spin_*/keep_* 空物体，否则是根。"""
    p = o.parent
    while p is not None:
        if p.type == 'EMPTY' and (p.name.startswith('spin_') or p.name.startswith('grp_')):
            return p
        if p.parent is None:
            return p
        p = p.parent
    return None


def densify(o, max_len=0.45, rounds=4):
    """把过长的边细分，顶点 AO 才不会在大平面上拉出难看的渐变。"""
    me = o.data
    bm = bmesh.new()
    bm.from_mesh(me)
    for _ in range(rounds):
        long_edges = [e for e in bm.edges if e.calc_length() > max_len]
        if not long_edges:
            break
        bmesh.ops.subdivide_edges(bm, edges=long_edges, cuts=1, use_grid_fill=True)
    bm.to_mesh(me)
    bm.free()


def optimize(max_len=0.45):
    """按分组合并网格：每个分组只剩一个网格（多个材质槽），减少游戏里的绘制调用。
    带特殊名字的网格（screen_*、sign_* 等）保持独立，运行时要按名字找到它们。"""
    sc = bpy.context.scene
    meshes = [o for o in sc.objects if o.type == 'MESH']
    for o in meshes:
        apply_mods(o)
    groups = {}
    for o in meshes:
        if o.name.startswith(KEEP_PREFIX):
            continue
        g = _group_of(o)
        groups.setdefault(g.name if g else '', []).append(o)
    out = []
    for gname, objs in groups.items():
        if gname.startswith('spin_'):
            nm = 'w_' + gname[5:]
        elif gname.startswith('grp_'):
            nm = gname[4:]
        else:
            nm = 'body'
        if len(objs) > 1:
            j = join(objs, nm)
        else:
            j = objs[0]; j.name = nm
        out.append(j)
    for o in out:
        if max_len:
            densify(o, max_len)
    return out


def bake_ao(samples=24, soften=0.38, distance=0.6, atlas=True):
    """把环境光遮蔽烘焙进顶点色（缝隙、车底、窗框会更有立体感）。
    atlas=True 时，普通材质（塑料、橡胶、镀铬……）的颜色也写进顶点色，合并成两个共享材质
    （shared_rough / shared_metal），一辆车只剩几个绘制调用。"""
    sc = bpy.context.scene
    meshes = [o for o in sc.objects if o.type == 'MESH']
    for o in meshes:
        apply_mods(o)
    rough = mat('shared_rough', (1, 1, 1), rough=0.72)
    metal = mat('shared_metal', (1, 1, 1), metal=1.0, rough=0.22)
    base = {}
    for o in meshes:
        me = o.data
        cols = [(1.0, 1.0, 1.0)] * len(me.loops)
        if atlas:
            remap = {}
            for i, m in enumerate(list(me.materials)):
                if m is None or _special(m) or m.name.startswith('shared_'):
                    continue
                b = m.node_tree.nodes.get('Principled BSDF')
                c = tuple(b.inputs['Base Color'].default_value)[:3]
                tgt = metal if b.inputs['Metallic'].default_value > 0.5 else rough
                if tgt.name not in [mm.name for mm in me.materials if mm]:
                    me.materials.append(tgt)
                remap[i] = (c, [mm.name if mm else '' for mm in me.materials].index(tgt.name))
            cols = list(cols)
            for p in me.polygons:
                r = remap.get(p.material_index)
                if r:
                    for li in p.loop_indices:
                        cols[li] = r[0]
                    p.material_index = r[1]
            # 去掉没人用的材质槽（Blender 会自动重排面的材质索引）
            used = {p.material_index for p in me.polygons}
            for i in reversed(range(len(me.materials))):
                if i not in used:
                    me.materials.pop(index=i)
        base[o.name] = cols
    sc.cycles.samples = samples
    sc.world = sc.world or bpy.data.worlds.new('w')
    sc.world.light_settings.distance = distance
    bpy.ops.object.select_all(action='DESELECT')
    for o in meshes:
        ca = o.data.color_attributes.get('Col') or o.data.color_attributes.new('Col', 'BYTE_COLOR', 'CORNER')
        o.data.color_attributes.active_color = ca
        o.select_set(True)
    if not meshes:
        return
    bpy.context.view_layer.objects.active = meshes[0]
    sc.render.bake.target = 'VERTEX_COLORS'
    t = time.time()
    bpy.ops.object.bake(type='AO')
    # 柔化：AO 太重会显脏；再乘上底色
    for o in meshes:
        d = o.data.color_attributes['Col'].data
        bc = base[o.name]
        for i, c in enumerate(d):
            v = soften + (1 - soften) * c.color[0]
            b = bc[i]
            c.color = (b[0] * v, b[1] * v, b[2] * v, 1)
    print(f'  AO baked {len(meshes)} meshes in {time.time() - t:.1f}s')


def export(name, vertex_colors=True):
    path = os.path.join(OUT, name + '.glb')
    bpy.ops.object.select_all(action='DESELECT')
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', export_apply=True, export_yup=True,
                              export_vertex_color='ACTIVE' if vertex_colors else 'NONE',
                              export_materials='EXPORT', export_cameras=False, export_lights=False, export_extras=True)
    print(f'  exported {path} ({os.path.getsize(path) / 1024:.0f} KB)')
    return path


def preview(name, res=(560, 360), samples=40, elev=18, azims=(-38, 145), dist_k=1.25):
    """用 Cycles 渲染一张预览图（自动取景），方便检查模型。"""
    sc = bpy.context.scene
    objs = [o for o in sc.objects if o.type == 'MESH']
    lo = Vector((1e9, 1e9, 1e9)); hi = Vector((-1e9, -1e9, -1e9))
    for o in objs:
        for c in o.bound_box:
            w = o.matrix_world @ Vector(c)
            lo = Vector(map(min, lo, w)); hi = Vector(map(max, hi, w))
    ctr = (lo + hi) / 2
    size = (hi - lo).length
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam'))
    sc.collection.objects.link(cam)
    cam.data.lens = 50
    sc.camera = cam
    for nm, rot, en in [('key', (0.8, 0.2, 0.9), 3.2), ('fill', (1.1, 0, -2.2), 1.0)]:
        l = bpy.data.objects.new(nm, bpy.data.lights.new(nm, 'SUN')); l.data.energy = en; l.rotation_euler = rot; sc.collection.objects.link(l)
    sc.world = sc.world or bpy.data.worlds.new('w')
    sc.world.use_nodes = True
    bg = sc.world.node_tree.nodes.get('Background')
    bg.inputs['Color'].default_value = (0.32, 0.36, 0.45, 1); bg.inputs['Strength'].default_value = 0.9
    floor = bpy.data.objects.new('floor', bpy.data.meshes.new('floor'))
    bm = bmesh.new(); bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=size * 3); bm.to_mesh(floor.data); bm.free()
    floor.location = (ctr.x, ctr.y, lo.z - 0.001); sc.collection.objects.link(floor)
    floor.data.materials.append(mat('_floor', (0.12, 0.12, 0.13), rough=0.9))
    # 预览时让材质乘上顶点色（导出已经完成，不影响 glb）
    for m in bpy.data.materials:
        if not m.use_nodes or m.name == '_floor':
            continue
        nt = m.node_tree
        b = nt.nodes.get('Principled BSDF')
        if b is None or b.inputs['Base Color'].is_linked:
            continue
        a = nt.nodes.new('ShaderNodeVertexColor'); a.layer_name = 'Col'
        mx = nt.nodes.new('ShaderNodeMix'); mx.data_type = 'RGBA'; mx.blend_type = 'MULTIPLY'
        mx.inputs['Factor'].default_value = 1.0
        mx.inputs[6].default_value = b.inputs['Base Color'].default_value
        nt.links.new(a.outputs['Color'], mx.inputs[7])
        nt.links.new(mx.outputs[2], b.inputs['Base Color'])
    sc.cycles.samples = samples
    sc.cycles.use_denoising = True
    sc.render.resolution_x, sc.render.resolution_y = res
    t = time.time()
    for k, azim in enumerate(azims):   # 多个角度：name.png、name_1.png……
        e, a = math.radians(elev), math.radians(azim)
        d = size * dist_k * 1.6
        cam.location = ctr + Vector((math.sin(a) * math.cos(e) * d, -math.cos(a) * math.cos(e) * d, math.sin(e) * d))
        cam.rotation_euler = (ctr - cam.location).to_track_quat('-Z', 'Y').to_euler()
        sc.render.filepath = os.path.join(PREV, name + ('' if k == 0 else f'_{k}') + '.png')
        bpy.ops.render.render(write_still=True)
    print(f'  preview {name} x{len(azims)} ({time.time() - t:.1f}s)')
    for o in [cam, floor] + [o for o in sc.objects if o.type == 'LIGHT']:
        bpy.data.objects.remove(o, do_unlink=True)


def build(name, fn, ao=True, prev=True, merge=True, max_len=0.45, **kw):
    """标准流程：清场 → 建模 → 烘焙 AO → 导出 → 预览。"""
    t = time.time()
    print(f'[{name}]')
    reset()
    fn(**kw)
    if merge:
        optimize(max_len)
    if ao:
        bake_ao()
    export(name, vertex_colors=ao)
    if prev:
        preview(name)
    print(f'  done in {time.time() - t:.1f}s')
