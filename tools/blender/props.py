# 应援/抗议道具：花圈（黑白、粉色两款）、应援花篮、横幅架、手举牌、烟花箱
# 运行：/tmp/bvenv/bin/python tools/blender/props.py [名字...]
import sys, os, math, random
sys.path.insert(0, os.path.dirname(__file__))
from lib import *
from mathutils import Vector


def flower(name, r, loc, color, parent, rnd, depth=0.55, petals=True):
    """一朵菊花/玫瑰：压扁的球，花瓣用顶点抖动做出蓬松感。"""
    o = sphere(name, r, loc, mat(f'f{color}', color, rough=0.75), 9, 6, (1, depth, 1), parent)
    if petals:
        for v in o.data.vertices:
            k = 1 + rnd.uniform(-0.12, 0.12)
            v.co.x *= k; v.co.z *= k
    o.rotation_euler = (0, rnd.uniform(0, 6.28), 0)
    return o


# ---------- 花圈（근조화환）：三脚架 + 花环 + 两条竖丝带，正面 -Y ----------
def wreath(support=False):
    root = empty('model')
    rnd = random.Random(11 if support else 7)
    wood = mat('wood', (0.42, 0.3, 0.17), rough=0.8)
    for s in (-1, 1):
        tube(f'leg{s}', [(s * 0.52, -0.18, 0), (s * 0.3, -0.08, 1.0), (s * 0.12, 0.04, 2.0)], 0.018, wood, root, 4)
    tube('legb', [(0, 0.62, 0), (0, 0.32, 1.0), (0, 0.06, 1.95)], 0.018, wood, root, 4)
    tube('cross', [(-0.36, -0.12, 0.72), (0.36, -0.12, 0.72)], 0.014, wood, root, 2)
    cz = 2.05
    green = mat('leafring', (0.12, 0.26, 0.09), rough=0.8)
    cyl('backing', 0.98, 0.08, (0, 0.07, cz), green, 'Y', 40, parent=root)
    inner = (0.95, 0.55, 0.68) if support else (0.025, 0.025, 0.025)
    cyl('inner', 0.56, 0.05, (0, 0.03, cz), mat('inner', inner, rough=0.85), 'Y', 32, parent=root)
    if support:
        cols = [(1.0, 0.35, 0.55), (1.0, 0.62, 0.75), (1.0, 0.82, 0.3), (0.98, 0.96, 0.94), (0.85, 0.45, 0.95)]
        weights = [3, 3, 2, 2, 1]
    else:
        cols = [(0.93, 0.93, 0.9), (0.96, 0.92, 0.75), (0.95, 0.78, 0.25)]
        weights = [6, 3, 1]
    pick = lambda: rnd.choices(cols, weights)[0]
    k = 0
    for rad, n in ((0.64, 22), (0.78, 28), (0.92, 34)):
        for i in range(n):
            a = i / n * math.tau + rnd.uniform(-0.04, 0.04)
            rr = rad + rnd.uniform(-0.025, 0.025)
            flower(f'fl{k}', rnd.uniform(0.072, 0.095), (math.cos(a) * rr, -0.02 + rnd.uniform(-0.03, 0.02), cz + math.sin(a) * rr), pick(), root, rnd)
            k += 1
    # 下面横档上的一排小花 + 蝴蝶结
    for i in range(9):
        flower(f'low{i}', 0.07, (-0.32 + i * 0.08, -0.15, 0.78 + rnd.uniform(-0.02, 0.03)), pick(), root, rnd)
    bow = mat('bow', (1, 0.4, 0.6) if support else (0.9, 0.9, 0.9), rough=0.6)
    for s in (-1, 1):
        sphere(f'bow{s}', 0.11, (s * 0.1, -0.1, cz - 0.98), bow, 10, 6, (1, 0.35, 0.6), root)
    # 两条竖丝带（运行时贴字）
    rm = mat('ribbon', (1, 1, 1), rough=0.8)
    plane('ribbon_L', 0.2, 1.6, (-0.32, -0.16, 1.0), rm, '-Y', root)
    plane('ribbon_R', 0.2, 1.6, (0.32, -0.16, 1.0), rm, '-Y', root)


# ---------- 应援花篮：三脚架 + 编织篮 + 花团 + 卡片 ----------
def basket():
    root = empty('model')
    rnd = random.Random(21)
    wm = mat('standwhite', (0.92, 0.92, 0.9), metal=0.5, rough=0.35)
    for i in range(3):
        a = i / 3 * math.tau + 0.5
        tube(f'leg{i}', [(math.cos(a) * 0.3, math.sin(a) * 0.3, 0), (math.cos(a) * 0.16, math.sin(a) * 0.16, 0.72)], 0.015, wm, root, 2)
    lathe('ringstand', [(0.15, 0.7), (0.19, 0.7), (0.19, 0.73), (0.15, 0.73)], material=wm, seg=20, parent=root)
    prof = [(0, 0.72), (0.26, 0.72)]
    for j in range(9):   # 编织纹：半径一起一伏
        z = 0.74 + j * 0.06
        prof.append(((0.3 + j * 0.018) + (0.012 if j % 2 else 0), z))
    prof += [(0.47, 1.28), (0.44, 1.29), (0.0, 1.29)]
    lathe('basket', prof, material=mat('wicker', (0.62, 0.45, 0.24), rough=0.85), seg=28, parent=root)
    pink = mat('ribbonpink', (1, 0.42, 0.62), rough=0.55)
    tube('handle', [(-0.44, 0, 1.25), (-0.36, 0, 1.75), (0, 0, 1.98), (0.36, 0, 1.75), (0.44, 0, 1.25)], 0.02, pink, root, 10)
    cols = [(1.0, 0.25, 0.45), (1.0, 0.6, 0.72), (1.0, 0.85, 0.3), (0.98, 0.96, 0.94), (0.75, 0.4, 0.95), (0.95, 0.1, 0.2)]
    for i in range(46):
        v = Vector((rnd.uniform(-1, 1), rnd.uniform(-1, 1), rnd.uniform(0.15, 1))).normalized()
        flower(f'fl{i}', rnd.uniform(0.07, 0.1), (v.x * 0.43, v.y * 0.43, 1.24 + v.z * 0.36), rnd.choice(cols), root, rnd, depth=0.85)
    leaf = mat('leaf', (0.18, 0.4, 0.15), rough=0.7)
    for i in range(12):
        a = i / 12 * math.tau
        o = sphere(f'lf{i}', 0.1, (math.cos(a) * 0.46, math.sin(a) * 0.46, 1.27), leaf, 8, 5, (1.6, 0.6, 0.18), root)
        o.rotation_euler = (0, math.radians(-25), a)
    for s in (-1, 1):
        sphere(f'bow{s}', 0.09, (s * 0.09, -0.47, 1.1), pink, 10, 6, (1, 0.35, 0.65), root)
        box(f'tail{s}', (0.05, 0.01, 0.3), (s * 0.05, -0.47, 0.93), pink, parent=root, rot=(0, s * 0.25, 0))
    tube('cardstick', [(0, -0.3, 1.2), (0, -0.36, 1.75)], 0.008, wm, root, 2)
    box('cardback', (0.82, 0.015, 0.47), (0, -0.37, 1.92), mat('cardpaper', (1, 0.94, 0.96), rough=0.6), parent=root)
    plane('sign_card', 0.8, 0.45, (0, -0.38, 1.92), mat('card', (1, 1, 1), rough=0.6), '-Y', root)


# ---------- 横幅：两根立杆 + 注水底座 + 布（30×4 细分，运行时飘动） ----------
def banner():
    root = empty('model')
    pole = mat('pole', (0.75, 0.76, 0.78), metal=0.85, rough=0.3)
    base = mat('basepl', (0.08, 0.2, 0.55), rough=0.5)
    for s in (-1, 1):
        lathe(f'base{s}', [(0, 0), (0.3, 0), (0.3, 0.1), (0.24, 0.17), (0.08, 0.22), (0.05, 0.26), (0, 0.26)], (s * 3.25, 0, 0), base, 20, root)
        lathe(f'pole{s}', [(0, 0.2), (0.035, 0.2), (0.035, 3.2), (0, 3.2)], (s * 3.25, 0, 0), pole, 10, root)
        sphere(f'cap{s}', 0.05, (s * 3.25, 0, 3.22), pole, 10, 6, (1, 1, 1), root)
        for z in (1.72, 3.08):
            tube(f'tie{s}{z}', [(s * 3.16, 0, z), (s * 3.25, 0, z)], 0.008, mat('rope', (0.9, 0.9, 0.85), rough=0.8), root, 2)
    grid('cloth', 6.3, 1.4, 30, 4, (0, 0, 2.4), mat('cloth', (1, 1, 1), rough=0.85), '-Y', root)


# ---------- 手举牌：木棍 + 泡沫板，正面 -Y ----------
def picket():
    root = empty('model')
    cyl('stick', 0.017, 2.1, (0, 0.015, 1.05), mat('stick', (0.55, 0.4, 0.24), rough=0.8), 'Z', 8, parent=root)
    box('board', (0.92, 0.022, 0.58), (0, 0.012, 2.0), mat('foam', (0.95, 0.95, 0.93), rough=0.8), bevel=0.006, parent=root)
    plane('sign_board', 0.88, 0.54, (0, -0.0005, 2.0), mat('boardface', (1, 1, 1), rough=0.8), '-Y', root)


# ---------- 烟花箱（组合烟花）：1.2×1.2×0.5 ----------
def fireworks():
    root = empty('model')
    box('cake', (1.2, 1.2, 0.46), (0, 0, 0.23), mat('paint', (0.75, 0.06, 0.06), rough=0.55), bevel=0.02, parent=root)
    gold = mat('gold', (0.95, 0.72, 0.2), metal=1, rough=0.3)
    for z in (0.06, 0.4):
        box(f'band{z}', (1.21, 1.21, 0.04), (0, 0, z), gold, parent=root)
    for i in range(6):
        for j in range(6):
            x, y = -0.5 + i * 0.2, -0.5 + j * 0.2
            lathe(f't{i}{j}', [(0, 0.44), (0.075, 0.44), (0.075, 0.52), (0.055, 0.52), (0.055, 0.47), (0, 0.47)], (x, y, 0), mat('tube', (0.85, 0.82, 0.75), rough=0.8), 10, root)
    tube('fuse', [(0.6, -0.3, 0.3), (0.75, -0.35, 0.22), (0.85, -0.25, 0.05)], 0.008, mat('fuse', (0.15, 0.6, 0.2), rough=0.6), root, 6)


ALL = {
    'pr_wreath_w': lambda: wreath(False), 'pr_wreath_p': lambda: wreath(True), 'pr_basket': basket,
    'pr_banner': banner, 'pr_picket': picket, 'pr_fireworks': fireworks,
}

if __name__ == '__main__':
    names = [a for a in sys.argv[1:] if a in ALL] or list(ALL)
    for n in names:
        build(n, ALL[n])
