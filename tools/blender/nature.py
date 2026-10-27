# 行道树（银杏、榉树、圆冠树）+ 树池铁箅子；路人配件（棒球帽、毛线帽、双肩包、斜挎包、应援棒）
# 运行：/tmp/bvenv/bin/python tools/blender/nature.py [名字...]
import sys, os, math, random
sys.path.insert(0, os.path.dirname(__file__))
from lib import *
from mathutils import Vector, noise


def blob(name, r, loc, material, parent, rnd, sub=2, amp=0.22, squash=(1, 1, 1)):
    """叶团：细分的二十面体，用噪声把表面拱成一簇一簇。"""
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=sub, radius=r)
    off = Vector((rnd.uniform(0, 50), rnd.uniform(0, 50), rnd.uniform(0, 50)))
    for v in bm.verts:
        n = v.co.normalized()
        k = 1 + amp * noise.noise(v.co * (2.2 / r) + off) + rnd.uniform(-0.04, 0.04)
        v.co = Vector((n.x * r * k * squash[0], n.y * r * k * squash[1], n.z * r * k * squash[2]))
    o = link(name, bm, material, parent)
    o.location = loc
    smooth(o, 80)
    return o


def trunk(root, pts, r, bark):
    return tube('trunk', pts, r, bark, root, 3)


def grate(root):
    iron = mat('grate', (0.15, 0.15, 0.16), metal=0.6, rough=0.5)
    for s in (-1, 1):
        box(f'gx{s}', (1.3, 0.06, 0.04), (0, s * 0.62, 0.02), iron, parent=root)
        box(f'gy{s}', (0.06, 1.3, 0.04), (s * 0.62, 0, 0.02), iron, parent=root)
    for k in range(-4, 5):
        if abs(k) <= 1:
            continue
        box(f'bar{k}', (1.2, 0.025, 0.03), (0, k * 0.13, 0.02), iron, parent=root)
    box('soil', (1.2, 1.2, 0.02), (0, 0, 0.005), mat('soil', (0.1, 0.07, 0.05), rough=1), parent=root)


def ginkgo():
    """银杏：主干笔直，树冠窄长呈尖塔形（首尔最常见的行道树）。"""
    root = empty('model'); rnd = random.Random(1)
    bark = mat('bark', (0.3, 0.24, 0.18), rough=0.95)
    trunk(root, [(0, 0, 0), (0.02, 0.01, 3.0), (0, 0, 7.6)], 0.14, bark)
    for k in range(4):
        a = k * 1.7
        tube(f'br{k}', [(0, 0, 2.6 + k * 1.0), (math.cos(a) * 0.7, math.sin(a) * 0.7, 3.4 + k * 1.0)], 0.04, bark, root, 3)
    leaf = mat('leaf', (0.36, 0.5, 0.16), rough=0.8)
    for i in range(9):
        z = 2.9 + i * 0.6
        rr = 1.35 * (1 - i / 10) + 0.25
        a = rnd.uniform(0, 6.28)
        blob(f'lf{i}', rr, (math.cos(a) * 0.25, math.sin(a) * 0.25, z), leaf, root, rnd, squash=(1, 1, 0.75))
    grate(root)


def zelkova():
    """榉树：短主干分三叉，树冠宽阔像花瓶。"""
    root = empty('model'); rnd = random.Random(2)
    bark = mat('bark', (0.33, 0.28, 0.22), rough=0.95)
    trunk(root, [(0, 0, 0), (0.05, 0, 1.6), (0, 0.05, 2.6)], 0.17, bark)
    leaf = mat('leaf', (0.24, 0.42, 0.14), rough=0.8)
    for k in range(3):
        a = k * 2.1 + 0.3
        tip = (math.cos(a) * 1.5, math.sin(a) * 1.5, 4.6)
        tube(f'br{k}', [(0, 0, 2.4), (math.cos(a) * 0.6, math.sin(a) * 0.6, 3.4), tip], 0.08, bark, root, 4)
        blob(f'lfa{k}', 1.35, (tip[0] * 1.1, tip[1] * 1.1, 5.2), leaf, root, rnd, squash=(1, 1, 0.7))
    blob('lftop', 1.5, (0, 0, 5.9), leaf, root, rnd, squash=(1.1, 1.1, 0.7))
    for k in range(3):
        a = k * 2.1 + 1.3
        blob(f'lfb{k}', 1.0, (math.cos(a) * 1.4, math.sin(a) * 1.4, 4.6), leaf, root, rnd, squash=(1, 1, 0.75))
    grate(root)


def roundtree():
    """圆冠树：公园、广场边上用。"""
    root = empty('model'); rnd = random.Random(3)
    bark = mat('bark', (0.28, 0.22, 0.16), rough=0.95)
    trunk(root, [(0, 0, 0), (-0.05, 0.03, 1.5), (0.04, 0, 3.0)], 0.13, bark)
    leaf = mat('leaf', (0.2, 0.38, 0.13), rough=0.8)
    blob('lf0', 1.6, (0, 0, 4.0), leaf, root, rnd, amp=0.25)
    for k in range(5):
        a = k * 1.26
        blob(f'lf{k + 1}', 0.95, (math.cos(a) * 1.2, math.sin(a) * 1.2, 3.6 + (k % 2) * 0.7), leaf, root, rnd)
    grate(root)


# ---------- 路人配件：原点在挂载点（帽子 = 头顶，包 = 后背中间），正面 -Y ----------
def cap():
    root = empty('model')
    pm = mat('paint', (0.1, 0.1, 0.12), rough=0.7)
    s = sphere('crown', 0.105, (0, 0.005, -0.02), pm, 16, 9, (1, 1.05, 0.85), root)
    bm = bmesh.new(); bm.from_mesh(s.data)
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.co.z < -0.005], context='VERTS')
    bm.to_mesh(s.data); bm.free()
    b = cyl('brim', 0.1, 0.012, (0, -0.1, -0.02), pm, 'Z', 20, parent=root)
    b.scale = (0.85, 1.0, 1)
    sphere('button', 0.012, (0, 0.005, 0.07), pm, 8, 5, (1, 1, 1), root)


def beanie():
    root = empty('model')
    pm = mat('paint', (0.6, 0.12, 0.12), rough=0.9)
    s = sphere('crown', 0.108, (0, 0, -0.03), pm, 16, 10, (1, 1.05, 1.0), root)
    bm = bmesh.new(); bm.from_mesh(s.data)
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.co.z < -0.02], context='VERTS')
    bm.to_mesh(s.data); bm.free()
    lathe('fold', [(0.0, 0), (0.112, 0), (0.114, 0.045), (0.0, 0.045)], (0, 0, -0.055), pm, 18, root)
    sphere('pom', 0.035, (0, 0, 0.1), pm, 10, 6, (1, 1, 1), root)


def backpack():
    root = empty('model')
    pm = mat('paint', (0.12, 0.16, 0.25), rough=0.8)
    box('bag', (0.3, 0.15, 0.4), (0, 0.1, -0.05), pm, bevel=0.05, seg=3, parent=root)
    box('pocket', (0.22, 0.05, 0.16), (0, 0.19, -0.14), pm, bevel=0.03, parent=root)
    trim = mat('trim', (0.05, 0.05, 0.05), rough=0.7)
    box('zip', (0.24, 0.005, 0.01), (0, 0.215, -0.07), trim, parent=root)
    for s in (-1, 1):
        tube(f'strap{s}', [(s * 0.09, 0.03, 0.14), (s * 0.1, -0.06, 0.2), (s * 0.11, -0.13, 0.05), (s * 0.11, -0.1, -0.2), (s * 0.1, 0.02, -0.24)], 0.012, trim, root, 6)


def crossbag():
    root = empty('model')
    pm = mat('paint', (0.55, 0.38, 0.22), rough=0.6)
    box('bag', (0.2, 0.07, 0.15), (0.14, -0.12, -0.32), pm, bevel=0.02, parent=root)
    trim = mat('trim', (0.05, 0.05, 0.05), rough=0.7)
    tube('strap', [(0.16, -0.1, -0.25), (0.05, -0.13, -0.05), (-0.1, -0.1, 0.15), (-0.14, 0.0, 0.2), (-0.08, 0.1, 0.1), (0.1, 0.12, -0.15), (0.15, -0.06, -0.26)], 0.01, trim, root, 6)


def lightstick():
    """应援棒：手柄 + 发光的头（战队色）。原点在手握处。"""
    root = empty('model')
    cyl('handle', 0.018, 0.18, (0, 0, 0.0), mat('handle', (0.92, 0.92, 0.92), rough=0.4), 'Z', 12, parent=root)
    sphere('head', 0.055, (0, 0, 0.14), mat('emit_team', (1, 1, 1), emit=(1, 1, 1), strength=3), 16, 10, (1, 1, 1.15), root)


def _hair(long=False):
    root = empty('model')
    hm = mat('paint', (0.03, 0.025, 0.02), rough=0.55)
    s = sphere('hair', 0.118, (0, 0.012, -0.105), hm, 20, 14, (1, 1.1, 1.0), root)
    bm = bmesh.new(); bm.from_mesh(s.data)
    kill = []
    for v in bm.verts:
        x, y, z = v.co
        front = y < -0.02
        if front and z < (0.045 if not long else 0.04):     # 额头以下露出脸
            kill.append(v)
        elif not front and z < (-0.06 if not long else -0.118):
            kill.append(v)
    bmesh.ops.delete(bm, geom=kill, context='VERTS')
    bm.to_mesh(s.data); bm.free()
    if long:   # 波波头：后脑和两侧往下垂
        b = lathe('bob', [(0.0, -0.2), (0.1, -0.2), (0.125, -0.12), (0.125, -0.02), (0.0, -0.02)], (0, 0.025, -0.08), hm, 18, root)
        bm = bmesh.new(); bm.from_mesh(b.data)
        bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.co.y < -0.03], context='VERTS')
        bm.to_mesh(b.data); bm.free()


ALL = {'tr_ginkgo': ginkgo, 'tr_zelkova': zelkova, 'tr_round': roundtree,
       'acc_cap': cap, 'acc_beanie': beanie, 'acc_backpack': backpack, 'acc_crossbag': crossbag, 'acc_lightstick': lightstick,
       'acc_hair': lambda: _hair(False), 'acc_hair_long': lambda: _hair(True)}

if __name__ == '__main__':
    names = [a for a in sys.argv[1:] if a in ALL] or list(ALL)
    for n in names:
        build(n, ALL[n], max_len=4.0 if n.startswith('tr_') else 0.45)
