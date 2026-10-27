# 车辆：轿车、出租车、面包车、皮卡、公交、LED 抗议卡车、咖啡应援车、电动滑板车
# 运行：/tmp/bvenv/bin/python tools/blender/vehicles.py [名字...]
import sys, os, math
sys.path.insert(0, os.path.dirname(__file__))
from lib import *
import bmesh
from mathutils import Matrix, Vector

# ---------- 公共材质 ----------
def M():
    return dict(
        paint=mat('paint', (0.75, 0.75, 0.78), metal=0.55, rough=0.32, coat=1.0, coat_rough=0.06),
        glass=mat('glass', (0.02, 0.025, 0.03), metal=0.3, rough=0.04),
        trim=mat('trim', (0.04, 0.04, 0.045), rough=0.55),
        plastic=mat('plastic', (0.09, 0.09, 0.1), rough=0.7),
        chrome=mat('chrome', (0.9, 0.9, 0.92), metal=1.0, rough=0.12),
        rubber=mat('rubber', (0.025, 0.025, 0.025), rough=0.92),
        rim=mat('rim', (0.62, 0.64, 0.68), metal=1.0, rough=0.28),
        head=mat('emit_head', (0.95, 0.95, 0.95), rough=0.05, emit=(1.0, 0.94, 0.82), strength=6),
        tail=mat('emit_tail', (0.35, 0.0, 0.0), rough=0.15, emit=(1.0, 0.04, 0.02), strength=4),
        amber=mat('emit_amber', (0.6, 0.3, 0.0), rough=0.15, emit=(1.0, 0.45, 0.0), strength=2),
        plate=mat('plate', (0.92, 0.92, 0.9), rough=0.4),
        well=mat('wheelwell', (0.02, 0.02, 0.02), rough=1.0),
    )


def pts(prof, L):
    """轮廓点：f 是车长方向的比例（+1 车头，-1 车尾），转成 Blender 的 y（车头朝 -Y）。"""
    return [(-f * L / 2, z) for f, z in prof]


def cabin(name, prof, L, W, m, splits=(), inset=0.07, tumble=0.9, parent=None, roof_extra=0.0):
    """座舱：挤出成实体，侧面按 splits 切成几扇窗，车窗内缩形成窗框和立柱。"""
    bm = bmesh.new()
    p = pts(prof, L)
    vs = [bm.verts.new((-W / 2, y, z)) for y, z in p]
    f = bm.faces.new(vs)
    res = bmesh.ops.extrude_face_region(bm, geom=[f])
    bmesh.ops.translate(bm, verts=[e for e in res['geom'] if isinstance(e, bmesh.types.BMVert)], vec=(W, 0, 0))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    zmin = min(z for _, z in p)
    for v in bm.verts:   # 车顶内收
        if v.co.z > zmin + 0.1:
            v.co.x *= tumble
    for ys in splits:
        geom = bm.verts[:] + bm.edges[:] + bm.faces[:]
        bmesh.ops.bisect_plane(bm, geom=geom, plane_co=(0, -ys * L / 2, 0), plane_no=(0, 1, 0))
    bm.normal_update()
    glass = []
    for fc in bm.faces:
        n = fc.normal
        if fc.calc_area() < 0.05:
            continue
        if abs(n.x) > 0.6 or (-0.4 < n.z < 0.95 and abs(n.y) > 0.25):
            glass.append(fc)
    bmesh.ops.inset_individual(bm, faces=glass, thickness=inset, depth=-0.015)
    for fc in glass:
        fc.material_index = 1
    o = link(name, bm, [m['paint'], m['glass']], parent)
    smooth(o, 28)
    return o


def wheel(name, r, w, loc, m, parent, spokes=5):
    """车轮：wheel_XX 是转向枢轴，spin_XX 是滚动枢轴，下面挂轮胎和轮毂。"""
    pivot = empty('wheel_' + name, loc, parent)
    spin = empty('spin_' + name, (0, 0, 0), pivot)
    side = 1 if loc[0] > 0 else -1
    cyl(f't_{name}', r, w, (0, 0, 0), m['rubber'], 'X', 32, bevel=min(0.07, r * 0.2), seg=3, parent=spin)
    cyl(f'r_{name}', r * 0.64, w * 0.9, (side * 0.012, 0, 0), m['rim'], 'X', 24, parent=spin)
    for k in range(spokes):
        s = box(f's_{name}{k}', (0.03, r * 0.1, r * 0.55), (side * (w * 0.47), 0, 0), m['rim'], parent=spin, rot=(math.radians(360 / spokes * k), 0, 0))
        s.location = (side * (w * 0.47), 0, 0)
    cyl(f'h_{name}', r * 0.16, w * 0.98, (side * 0.02, 0, 0), m['chrome'], 'X', 12, parent=spin)
    return pivot


def lights(L, W, m, head_z, tail_z, root, head_w=0.42, round_head=False):
    for s in (-1, 1):
        box(f'head{s}', (head_w, 0.08, 0.13), (s * W * 0.33, -L / 2 + 0.01, head_z), m['head'], bevel=0.03, parent=root)
        box(f'drl{s}', (head_w * 0.9, 0.06, 0.025), (s * W * 0.33, -L / 2 - 0.005, head_z - 0.09), m['head'], parent=root)
        box(f'ind{s}', (0.09, 0.07, 0.06), (s * W * 0.45, -L / 2 + 0.03, head_z), m['amber'], bevel=0.015, parent=root)
        box(f'tail{s}', (0.38, 0.07, 0.12), (s * W * 0.36, L / 2 - 0.01, tail_z), m['tail'], bevel=0.025, parent=root)


def bumpers(L, W, m, z, root, h=0.22, grille=True):
    box('bump_f', (W * 1.01, 0.22, h), (0, -L / 2 + 0.06, z), m['plastic'], bevel=0.06, seg=3, parent=root)
    box('bump_r', (W * 1.01, 0.22, h), (0, L / 2 - 0.06, z), m['plastic'], bevel=0.06, seg=3, parent=root)
    plane('plate_f', 0.52, 0.11, (0, -L / 2 - 0.06, z), m['plate'], '-Y', root)
    plane('plate_r', 0.52, 0.11, (0, L / 2 + 0.06, z + 0.12), m['plate'], '+Y', root)
    if grille:
        box('grille', (W * 0.5, 0.05, 0.12), (0, -L / 2 + 0.02, z + 0.2), m['trim'], bevel=0.02, parent=root)
        for k in range(3):
            box(f'slat{k}', (W * 0.48, 0.06, 0.012), (0, -L / 2 + 0.01, z + 0.16 + k * 0.04), m['chrome'], parent=root)


def mirrors(y, z, W, m, root):
    for s in (-1, 1):
        box(f'mir{s}', (0.07, 0.12, 0.1), (s * (W / 2 + 0.1), y, z), m['paint'], bevel=0.025, parent=root)
        box(f'mirg{s}', (0.01, 0.1, 0.08), (s * (W / 2 + 0.135), y, z), m['chrome'], parent=root)
        box(f'mirs{s}', (0.12, 0.04, 0.03), (s * (W / 2 + 0.04), y, z - 0.03), m['trim'], parent=root)


def arches(body, L, W, axles, r, m, root):
    for k, f in enumerate(axles):
        y = -f * L / 2
        c = cyl('cut', r + 0.075, W + 0.6, (0, y, r), None, 'X', 40)
        boolean(body, c)
        cyl(f'well{k}', r + 0.06, W - 0.12, (0, y, r), m['well'], 'X', 24, parent=root)


def door_lines(L, W, m, root, ys, z0, z1):
    for k, f in enumerate(ys):
        for s in (-1, 1):
            box(f'seam{k}{s}', (0.006, 0.008, z1 - z0), (s * (W / 2 + 0.002), -f * L / 2, (z0 + z1) / 2), m['trim'], parent=root)
            box(f'hdl{k}{s}', (0.02, 0.12, 0.025), (s * (W / 2 + 0.01), -f * L / 2 + 0.25, z1 - 0.08), m['chrome'], bevel=0.008, parent=root)


# ---------- 轿车 / 出租车 ----------
SEDAN_LOWER = [(-1, 0.34), (1, 0.34), (1, 0.6), (0.97, 0.75), (0.86, 0.84), (0.45, 0.96), (-0.7, 1.0), (-0.93, 0.99), (-1, 0.82), (-1, 0.5)]
SEDAN_CABIN = [(0.46, 0.95), (0.09, 1.39), (-0.39, 1.42), (-0.71, 0.99)]


def sedan(L=4.6, W=1.9, color=(0.75, 0.75, 0.78), taxi=False):
    m = M()
    if taxi:
        m['paint'] = mat('paint', (0.9, 0.42, 0.12), metal=0.4, rough=0.35, coat=1.0)
    root = empty('vehicle')
    body = extrude_profile('body', pts(SEDAN_LOWER, L), W, m['paint'], root, bevel=0.06, seg=3, angle=32)
    apply_mods(body)
    arches(body, L, W, (0.62, -0.62), 0.38, m, root)
    smooth(body, 32)
    cabin('cabin', SEDAN_CABIN, L, W * 0.98, m, splits=(-0.16,), inset=0.065, tumble=0.88, parent=root)
    bumpers(L, W, m, 0.45, root)
    lights(L, W, m, 0.74, 0.86, root)
    mirrors(-L * 0.2, 1.02, W, m, root)
    door_lines(L, W, m, root, (0.42, -0.16, -0.62), 0.42, 0.95)
    box('skirt', (W * 1.005, L * 0.55, 0.08), (0, 0, 0.36), m['plastic'], bevel=0.02, parent=root)
    for nm, (f, x) in {'FL': (0.62, -1), 'FR': (0.62, 1), 'RL': (-0.62, -1), 'RR': (-0.62, 1)}.items():
        wheel(nm, 0.38, 0.26, (x * (W / 2 - 0.14), -f * L / 2, 0.38), m, root)
    if taxi:
        sign = box('taxi_box', (0.62, 0.26, 0.2), (0, L * 0.07, 1.53), mat('signbody', (0.95, 0.92, 0.8), rough=0.4), bevel=0.04, parent=root)
        sm = mat('screen', (0.9, 0.9, 0.85), emit=(1, 0.95, 0.75), strength=1.2)
        plane('sign_taxi', 0.56, 0.15, (0, L * 0.07 - 0.135, 1.53), sm, '-Y', root)
        plane('sign_taxi2', 0.56, 0.15, (0, L * 0.07 + 0.135, 1.53), sm, '+Y', root)


# ---------- 面包车（玩家座驾） ----------
VAN_LOWER = [(-1, 0.36), (1, 0.36), (1, 0.66), (0.96, 0.88), (0.8, 1.02), (0.62, 1.07), (-1, 1.07)]
VAN_CABIN = [(0.62, 1.06), (0.36, 1.92), (-0.98, 1.95), (-1, 1.06)]


def van(L=5.0, W=2.0):
    m = M()
    m['paint'] = mat('paint', (0.85, 0.87, 0.9), metal=0.35, rough=0.38, coat=0.8)
    root = empty('vehicle')
    body = extrude_profile('body', pts(VAN_LOWER, L), W, m['paint'], root, bevel=0.07, seg=3)
    apply_mods(body)
    arches(body, L, W, (0.64, -0.6), 0.38, m, root)
    smooth(body, 32)
    cabin('cabin', VAN_CABIN, L, W * 0.99, m, splits=(0.2, -0.3, -0.7), inset=0.07, tumble=0.95, parent=root)
    bumpers(L, W, m, 0.48, root)
    lights(L, W, m, 0.86, 0.95, root, head_w=0.5)
    mirrors(-L * 0.3, 1.25, W, m, root)
    door_lines(L, W, m, root, (0.3, -0.15), 0.45, 1.85)
    for s in (-1, 1):   # 车顶行李架
        box(f'rail{s}', (0.05, L * 0.6, 0.05), (s * W * 0.38, L * 0.12, 2.0), m['trim'], parent=root)
    for nm, (f, x) in {'FL': (0.64, -1), 'FR': (0.64, 1), 'RL': (-0.6, -1), 'RR': (-0.6, 1)}.items():
        wheel(nm, 0.38, 0.27, (x * (W / 2 - 0.15), -f * L / 2, 0.38), m, root)


# ---------- 皮卡 ----------
PICK_LOWER = [(-1, 0.42), (1, 0.42), (1, 0.75), (0.95, 0.98), (0.5, 1.1), (-1, 1.1)]
PICK_CABIN = [(0.5, 1.09), (0.24, 1.86), (-0.17, 1.88), (-0.23, 1.09)]


def pickup(L=5.4, W=2.1):
    m = M()
    m['paint'] = mat('paint', (0.08, 0.08, 0.09), metal=0.5, rough=0.3, coat=1.0)
    root = empty('vehicle')
    body = extrude_profile('body', pts(PICK_LOWER, L), W, m['paint'], root, bevel=0.07, seg=3)
    apply_mods(body)
    arches(body, L, W, (0.64, -0.62), 0.42, m, root)
    smooth(body, 32)
    cabin('cabin', PICK_CABIN, L, W * 0.97, m, splits=(0.12,), inset=0.07, tumble=0.92, parent=root)
    # 货斗：凹进去的内衬 + 尾门
    box('bed', (W * 0.86, L * 0.36, 0.06), (0, L * 0.3, 1.11), m['plastic'], parent=root)
    box('tailgate', (W * 0.98, 0.08, 0.42), (0, L / 2 - 0.04, 1.28), m['paint'], bevel=0.03, parent=root)
    for s in (-1, 1):
        box(f'bedwall{s}', (0.08, L * 0.38, 0.42), (s * (W / 2 - 0.04), L * 0.3, 1.28), m['paint'], bevel=0.03, parent=root)
    box('rollbar', (W * 0.86, 0.08, 0.08), (0, L * 0.06, 1.95), m['chrome'], bevel=0.02, parent=root)
    for s in (-1, 1):
        box(f'rollpost{s}', (0.08, 0.08, 0.5), (s * W * 0.43, L * 0.06, 1.72), m['chrome'], bevel=0.02, parent=root)
    bumpers(L, W, m, 0.55, root, h=0.26)
    lights(L, W, m, 0.92, 1.05, root, head_w=0.48)
    mirrors(-L * 0.06, 1.32, W, m, root)
    for nm, (f, x) in {'FL': (0.64, -1), 'FR': (0.64, 1), 'RL': (-0.62, -1), 'RR': (-0.62, 1)}.items():
        wheel(nm, 0.42, 0.32, (x * (W / 2 - 0.16), -f * L / 2, 0.42), m, root, spokes=6)


# ---------- 公交 ----------
def bus(L=10.5, W=2.5):
    m = M()
    m['paint'] = mat('paint', (0.16, 0.56, 0.31), metal=0.25, rough=0.35, coat=0.8)
    root = empty('vehicle')
    AX = (0.5, -0.46)        # 前轴、后轴（车长比例）：前门放在前轴前面
    lower = extrude_profile('body', [(-L / 2, 0.36), (L / 2, 0.36), (L / 2, 1.25), (-L / 2, 1.25)], W, m['paint'], root, bevel=0.08, seg=3)
    apply_mods(lower)
    arches(lower, L, W, AX, 0.52, m, root)
    smooth(lower, 32)
    prof = [(1, 1.24), (0.995, 2.95), (0.97, 3.08), (-1, 3.08), (-1, 1.24)]
    splits = tuple(0.92 - k * 0.19 for k in range(10))
    cabin('cabin', prof, L, W, m, splits=splits, inset=0.07, tumble=1.0, parent=root)
    box('roofpod', (W * 0.7, L * 0.35, 0.28), (0, L * 0.08, 3.22), m['paint'], bevel=0.08, parent=root)
    sm = mat('screen', (0.05, 0.03, 0.0), emit=(1, 0.6, 0.1), strength=1.5)
    plane('sign_route', 1.6, 0.32, (0, -L / 2 - 0.02, 2.8), sm, '-Y', root)
    plane('sign_side', 1.9, 0.3, (-W / 2 - 0.02, -L * 0.18, 2.78), sm, '-X', root)
    box('bump_f', (W * 1.01, 0.25, 0.32), (0, -L / 2 + 0.05, 0.5), m['plastic'], bevel=0.06, parent=root)
    box('bump_r', (W * 1.01, 0.25, 0.32), (0, L / 2 - 0.05, 0.5), m['plastic'], bevel=0.06, parent=root)
    for k in range(5):   # 后部发动机散热格栅
        box(f'eng{k}', (W * 0.6, 0.03, 0.04), (0, L / 2 + 0.005, 0.85 + k * 0.08), m['trim'], parent=root)
    for s in (-1, 1):
        box(f'head{s}', (0.32, 0.08, 0.16), (s * W * 0.36, -L / 2 + 0.01, 0.8), m['head'], bevel=0.03, parent=root)
        box(f'ind{s}', (0.12, 0.08, 0.1), (s * W * 0.45, -L / 2 + 0.01, 0.8), m['amber'], bevel=0.02, parent=root)
        box(f'tail{s}', (0.22, 0.08, 0.4), (s * W * 0.42, L / 2 - 0.01, 1.0), m['tail'], bevel=0.03, parent=root)
    # 右侧（-X，人行道一侧）两扇门：玻璃门板 + 门框 + 踏步
    for k, (yc, wd) in enumerate(((-L / 2 + 0.75, 1.0), (L * 0.06, 1.15))):
        box(f'doorframe{k}', (0.05, wd + 0.12, 2.3), (-W / 2 - 0.005, yc, 1.55), m['trim'], parent=root)
        box(f'door{k}', (0.06, wd, 2.15), (-W / 2 - 0.012, yc, 1.55), m['glass'], parent=root)
        box(f'doorbar{k}', (0.07, 0.04, 2.1), (-W / 2 - 0.015, yc, 1.55), m['chrome'], parent=root)
        box(f'step{k}', (0.3, wd, 0.06), (-W / 2 + 0.1, yc, 0.42), m['plastic'], parent=root)
    mirrors(-L / 2 + 0.15, 2.4, W + 0.25, m, root)
    for nm, (f, x) in {'FL': (AX[0], -1), 'FR': (AX[0], 1), 'RL': (AX[1], -1), 'RR': (AX[1], 1)}.items():
        wheel(nm, 0.52, 0.34, (x * (W / 2 - 0.2), -f * L / 2, 0.52), m, root, spokes=8)


# ---------- 平头货车驾驶室（LED 卡车、咖啡车共用） ----------
def truck_cab(L, W, m, root, cab_len=2.2, h=2.45, color=(0.95, 0.95, 0.95)):
    m['paint'] = mat('paint', color, metal=0.3, rough=0.35, coat=0.9)
    y0 = -L / 2
    prof = [(y0, 0.75), (y0 + cab_len, 0.75), (y0 + cab_len, h + 0.6), (y0 + 0.35, h + 0.6), (y0 + 0.06, h + 0.2), (y0, 1.4)]
    bm = bmesh.new()
    vs = [bm.verts.new((-W / 2, y, z)) for y, z in prof]
    f = bm.faces.new(vs)
    res = bmesh.ops.extrude_face_region(bm, geom=[f])
    bmesh.ops.translate(bm, verts=[e for e in res['geom'] if isinstance(e, bmesh.types.BMVert)], vec=(W, 0, 0))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.normal_update()
    glass = []
    for fc in bm.faces:
        n, c = fc.normal, fc.calc_center_median()
        if n.y < -0.3 and c.z > 1.6:
            glass.append(fc)            # 前挡风
        elif abs(n.x) > 0.7 and c.z > 1.3:
            glass.append(fc)            # 侧窗
    # 侧窗只要前半部分：先切一刀
    bmesh.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:], plane_co=(0, y0 + cab_len * 0.55, 0), plane_no=(0, 1, 0))
    bmesh.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:], plane_co=(0, 0, 1.45), plane_no=(0, 0, 1))
    bm.normal_update()
    glass = []
    for fc in bm.faces:
        n, c = fc.normal, fc.calc_center_median()
        if n.y < -0.3 and c.z > 1.5:
            glass.append(fc)
        elif abs(n.x) > 0.7 and c.z > 1.5 and c.y < y0 + cab_len * 0.55:
            glass.append(fc)
    bmesh.ops.inset_individual(bm, faces=glass, thickness=0.08, depth=-0.02)
    for fc in glass:
        fc.material_index = 1
    cab = link('cab', bm, [m['paint'], m['glass']], root)
    add_bevel(cab, 0.06, 3, 35)
    apply_mods(cab)
    smooth(cab, 30)
    box('grille', (W * 0.7, 0.06, 0.5), (0, y0 - 0.02, 1.05), m['trim'], bevel=0.03, parent=root)
    for k in range(4):
        box(f'slat{k}', (W * 0.68, 0.07, 0.03), (0, y0 - 0.03, 0.88 + k * 0.11), m['chrome'], parent=root)
    box('bump_f', (W * 1.02, 0.25, 0.32), (0, y0 - 0.05, 0.62), m['plastic'], bevel=0.06, parent=root)
    plane('plate_f', 0.52, 0.11, (0, y0 - 0.18, 0.62), m['plate'], '-Y', root)
    for s in (-1, 1):
        box(f'head{s}', (0.4, 0.08, 0.2), (s * W * 0.36, y0 - 0.01, 1.05), m['head'], bevel=0.04, parent=root)
        box(f'ind{s}', (0.12, 0.08, 0.1), (s * W * 0.47, y0 - 0.01, 1.05), m['amber'], bevel=0.02, parent=root)
        box(f'mirarm{s}', (0.35, 0.05, 0.05), (s * (W / 2 + 0.15), y0 + 0.5, 2.1), m['trim'], parent=root)
        box(f'mir{s}', (0.08, 0.14, 0.32), (s * (W / 2 + 0.33), y0 + 0.5, 2.0), m['trim'], bevel=0.03, parent=root)
        box(f'step{s}', (0.2, 0.45, 0.06), (s * (W / 2 - 0.05), y0 + 0.9, 0.55), m['chrome'], parent=root)
    box('chassis', (W * 0.8, L - 0.5, 0.3), (0, 0, 0.62), m['trim'], parent=root)
    return y0 + cab_len


def ledtruck(L=8.2, W=2.5):
    m = M()
    root = empty('vehicle')
    cab_end = truck_cab(L, W, m, root, color=(0.94, 0.94, 0.95))
    box_len = L / 2 - cab_end - 0.15
    yc = cab_end + 0.15 + box_len / 2
    frame = mat('frame', (0.12, 0.13, 0.15), metal=0.6, rough=0.4)
    box('box', (W, box_len, 2.9), (0, yc, 2.35), frame, bevel=0.05, parent=root)
    sm = mat('screen', (0.01, 0.01, 0.01), rough=0.3, emit=(0.02, 0.02, 0.02), strength=1)
    plane('screen_L', box_len - 0.35, 2.55, (W / 2 + 0.012, yc, 2.35), sm, '+X', root)
    plane('screen_R', box_len - 0.35, 2.55, (-W / 2 - 0.012, yc, 2.35), sm, '-X', root)
    plane('screen_B', W - 0.3, 2.55, (0, L / 2 + 0.012, 2.35), sm, '+Y', root)
    for s in (-1, 1):   # 车厢上的走线槽和侧灯
        box(f'rail{s}', (0.06, box_len, 0.08), (s * (W / 2 + 0.02), yc, 3.82), m['chrome'], parent=root)
        for k in range(4):
            box(f'mk{s}{k}', (0.04, 0.1, 0.06), (s * (W / 2 + 0.02), yc - box_len / 2 + 0.4 + k * (box_len - 0.8) / 3, 0.95), m['amber'], parent=root)
        box(f'tail{s}', (0.3, 0.06, 0.18), (s * W * 0.38, L / 2 + 0.02, 0.95), m['tail'], bevel=0.02, parent=root)
        box(f'guard{s}', (0.05, box_len * 0.7, 0.25), (s * (W / 2 - 0.05), yc, 0.65), m['plastic'], parent=root)
    for nm, (y, x) in {'FL': (-L / 2 + 1.25, -1), 'FR': (-L / 2 + 1.25, 1), 'RL': (L / 2 - 2.35, -1), 'RR': (L / 2 - 2.35, 1), 'ML': (L / 2 - 1.3, -1), 'MR': (L / 2 - 1.3, 1)}.items():
        wheel(nm, 0.5, 0.36, (x * (W / 2 - 0.22), y, 0.5), m, root, spokes=8)


def coffee(L=7.2, W=2.4):
    m = M()
    root = empty('vehicle')
    cab_end = truck_cab(L, W, m, root, cab_len=2.0, color=(1.0, 0.6, 0.72))
    box_len = L / 2 - cab_end - 0.15
    yc = cab_end + 0.15 + box_len / 2
    body = mat('boxpaint', (1.0, 0.72, 0.8), metal=0.2, rough=0.4, coat=0.6)
    box('box', (W, box_len, 2.6), (0, yc, 2.2), body, bevel=0.08, parent=root)
    sm = mat('screen', (0.95, 0.9, 0.92), rough=0.4, emit=(0.05, 0.05, 0.05), strength=1)
    plane('screen_L', box_len - 0.5, 1.2, (W / 2 + 0.012, yc, 2.85), sm, '+X', root)
    plane('screen_R', box_len - 0.5, 1.2, (-W / 2 - 0.012, yc, 2.85), sm, '-X', root)
    # 售卖窗口 + 雨篷 + 柜台
    win = mat('emit_warm', (1.0, 0.85, 0.6), emit=(1.0, 0.78, 0.5), strength=2.5)
    box('serve', (0.04, box_len * 0.55, 0.8), (W / 2 + 0.01, yc, 1.75), win, parent=root)
    box('counter', (0.35, box_len * 0.6, 0.06), (W / 2 + 0.17, yc, 1.32), mat('wood', (0.55, 0.38, 0.22), rough=0.6), parent=root)
    awn = mat('awning', (0.95, 0.35, 0.5), rough=0.6)
    for k in range(6):   # 条纹雨篷
        box(f'awn{k}', (0.9, box_len * 0.62 / 6, 0.04), (W / 2 + 0.42, yc - box_len * 0.31 + (k + 0.5) * box_len * 0.62 / 6, 2.32), awn if k % 2 == 0 else mat('awning2', (1, 1, 1), rough=0.6), rot=(0, math.radians(-15), 0), parent=root)
    cup = mat('cup', (0.98, 0.98, 0.96), rough=0.4)
    cyl('cup', 0.32, 0.7, (0, yc - box_len * 0.2, 3.85), cup, 'Z', 20, r2=0.4, parent=root)
    cyl('lid', 0.42, 0.1, (0, yc - box_len * 0.2, 4.25), mat('lid', (0.35, 0.2, 0.12), rough=0.5), 'Z', 20, parent=root)
    for s in (-1, 1):
        box(f'tail{s}', (0.3, 0.06, 0.18), (s * W * 0.38, L / 2 + 0.02, 0.95), m['tail'], bevel=0.02, parent=root)
    for nm, (y, x) in {'FL': (-L / 2 + 1.15, -1), 'FR': (-L / 2 + 1.15, 1), 'RL': (L / 2 - 1.5, -1), 'RR': (L / 2 - 1.5, 1)}.items():
        wheel(nm, 0.46, 0.32, (x * (W / 2 - 0.2), y, 0.46), m, root, spokes=6)


def scooter():
    m = M()
    root = empty('vehicle')
    deck = mat('paint', (0.15, 0.85, 0.95), metal=0.4, rough=0.35, coat=0.8)
    box('deck', (0.2, 0.95, 0.06), (0, 0.05, 0.16), deck, bevel=0.025, parent=root)
    box('grip', (0.18, 0.7, 0.01), (0, 0.08, 0.195), m['rubber'], parent=root)
    stem = cyl('stem', 0.025, 1.0, (0, -0.42, 0.68), m['chrome'], 'Z', 12, parent=root)
    stem.rotation_euler = (math.radians(-12), 0, 0)
    cyl('bar', 0.02, 0.5, (0, -0.52, 1.17), m['trim'], 'X', 10, parent=root)
    for s in (-1, 1):
        cyl(f'grip{s}', 0.028, 0.11, (s * 0.21, -0.52, 1.17), m['rubber'], 'X', 10, parent=root)
    box('lamp', (0.07, 0.04, 0.05), (0, -0.56, 1.05), m['head'], bevel=0.01, parent=root)
    box('fender', (0.06, 0.25, 0.03), (0, 0.55, 0.3), deck, bevel=0.01, parent=root)
    wheel('F', 0.11, 0.05, (0, -0.48, 0.11), m, root, spokes=3)
    wheel('R', 0.11, 0.05, (0, 0.5, 0.11), m, root, spokes=3)


ALL = {
    'car_sedan': lambda: sedan(),
    'car_taxi': lambda: sedan(L=4.7, W=1.85, taxi=True),
    'car_van': van,
    'car_pickup': pickup,
    'car_bus': bus,
    'car_ledtruck': ledtruck,
    'car_coffee': coffee,
    'car_scooter': scooter,
}

if __name__ == '__main__':
    names = [a for a in sys.argv[1:] if a in ALL] or list(ALL)
    for n in names:
        build(n, ALL[n])
