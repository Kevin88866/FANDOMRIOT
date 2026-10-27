# 楼体细节模块：外挂空调机、竖排招牌、楼顶设备（水箱、楼梯间、冷凝机、卫星锅、天线）
# 约定：贴墙的模块原点在墙面底部中心，向 -Y（导出后 +Z，朝街）伸出。
# 运行：/tmp/bvenv/bin/python tools/blender/buildings.py [名字...]
import sys, os, math
sys.path.insert(0, os.path.dirname(__file__))
from lib import *
import bmesh


# ---------- 外挂空调机（首尔楼面最常见的东西）+ 铁架 ----------
def ac():
    root = empty('model')
    body = mat('acbody', (0.86, 0.86, 0.83), metal=0.2, rough=0.5)
    box('case', (0.82, 0.3, 0.58), (0, -0.2, 0.33), body, bevel=0.02, parent=root)
    grill = mat('grill', (0.08, 0.08, 0.09), rough=0.6)
    cyl('fan', 0.22, 0.02, (-0.12, -0.355, 0.33), grill, 'Y', 20, parent=root)
    for k in range(4):
        box(f'bar{k}', (0.46, 0.012, 0.012), (-0.12, -0.368, 0.17 + k * 0.105), body, parent=root)
    for k in range(5):
        box(f'vent{k}', (0.16, 0.01, 0.02), (0.27, -0.356, 0.15 + k * 0.08), grill, parent=root)
    iron = mat('iron', (0.2, 0.2, 0.21), metal=0.7, rough=0.5)
    for s in (-1, 1):
        box(f'arm{s}', (0.04, 0.4, 0.04), (s * 0.36, -0.2, 0.02), iron, parent=root)
        tube(f'strut{s}', [(s * 0.36, -0.01, -0.3), (s * 0.36, -0.38, 0.0)], 0.015, iron, root, 2)
    tube('pipe', [(0.3, -0.06, 0.45), (0.3, -0.02, 0.7), (0.3, -0.01, 1.0)], 0.018, mat('pipe', (0.9, 0.9, 0.88), rough=0.5), root, 6)


# ---------- 竖排招牌（세로 간판）：从墙面伸出，两面贴字 ----------
def vsign():
    root = empty('model')
    frame = mat('vframe', (0.12, 0.12, 0.13), metal=0.6, rough=0.4)
    box('housing', (0.3, 0.86, 4.0), (0, -0.62, 2.0), frame, bevel=0.03, parent=root)
    for z in (0.5, 3.5):
        box(f'brk{z}', (0.08, 0.22, 0.08), (0, -0.1, z), frame, parent=root)
    sm = mat('screen', (1, 1, 1), emit=(0.5, 0.5, 0.5), strength=1)
    plane('sign_v', 0.78, 3.9, (0.155, -0.62, 2.0), sm, '+X', root)
    plane('sign_v2', 0.78, 3.9, (-0.155, -0.62, 2.0), sm, '-X', root)


# ---------- 楼顶水箱（FRP 拼板水箱 + 钢架） ----------
def tank():
    root = empty('model')
    steel = mat('steel', (0.35, 0.36, 0.38), metal=0.7, rough=0.45)
    for x in (-0.9, 0.9):
        for y in (-0.6, 0.6):
            box(f'leg{x}{y}', (0.08, 0.08, 0.45), (x, y, 0.225), steel, parent=root)
    box('frame', (2.0, 1.4, 0.08), (0, 0, 0.45), steel, parent=root)
    frp = mat('frp', (0.55, 0.72, 0.78), rough=0.55)
    box('tank', (2.0, 1.4, 1.5), (0, 0, 1.24), frp, bevel=0.03, parent=root)
    seam = mat('seam', (0.4, 0.55, 0.6), rough=0.6)
    for k in range(1, 4):
        box(f'sx{k}', (0.03, 1.42, 1.52), (-1.0 + k * 0.5, 0, 1.24), seam, parent=root)
    for k in range(1, 3):
        box(f'sz{k}', (2.02, 1.42, 0.03), (0, 0, 0.49 + k * 0.5), seam, parent=root)
    box('hatch', (0.5, 0.5, 0.06), (0.5, 0.2, 2.02), seam, parent=root)
    for z in range(6):
        box(f'rung{z}', (0.4, 0.03, 0.03), (-0.6, -0.74, 0.55 + z * 0.25), steel, parent=root)
    for x in (-0.8, -0.4):
        box(f'rail{x}', (0.03, 0.03, 1.6), (x, -0.74, 1.25), steel, parent=root)
    tube('pipe', [(0.8, -0.7, 0.6), (0.8, -0.9, 0.3), (0.8, -0.9, 0.0)], 0.04, mat('pipe', (0.9, 0.9, 0.88), rough=0.5), root, 6)


# ---------- 楼梯间（屋顶出口）：门朝 -Y ----------
def stair():
    root = empty('model')
    wall = mat('stairwall', (0.72, 0.71, 0.68), rough=0.85)
    box('room', (3.0, 2.4, 2.6), (0, 0, 1.3), wall, bevel=0.02, parent=root)
    box('roof', (3.2, 2.6, 0.14), (0, 0, 2.66), mat('roofcap', (0.3, 0.31, 0.33), rough=0.7), parent=root)
    box('door', (0.9, 0.04, 2.0), (-0.6, -1.21, 1.0), mat('door', (0.25, 0.32, 0.4), metal=0.5, rough=0.45), parent=root)
    box('knob', (0.06, 0.04, 0.06), (-0.25, -1.24, 1.0), mat('chrome', (0.9, 0.9, 0.9), metal=1, rough=0.2), parent=root)
    box('sill', (1.1, 0.3, 0.12), (-0.6, -1.32, 0.06), wall, parent=root)
    box('lamp', (0.22, 0.12, 0.12), (-0.6, -1.26, 2.25), mat('emit_lampw', (1, 0.9, 0.7), emit=(1, 0.85, 0.6), strength=4), parent=root)
    box('vent', (0.6, 0.04, 0.4), (0.8, -1.21, 1.8), mat('grill', (0.08, 0.08, 0.09), rough=0.6), parent=root)
    box('exit', (0.42, 0.03, 0.16), (-0.6, -1.23, 2.1), mat('emit_exit', (0.1, 0.5, 0.2), emit=(0.1, 1, 0.4), strength=3), parent=root)


# ---------- 冷凝机组：顶上两台风扇 ----------
def condenser():
    root = empty('model')
    body = mat('condbody', (0.78, 0.79, 0.77), metal=0.3, rough=0.45)
    box('base', (1.8, 1.0, 0.1), (0, 0, 0.05), mat('steel', (0.35, 0.36, 0.38), metal=0.7, rough=0.45), parent=root)
    box('unit', (1.7, 0.95, 1.0), (0, 0, 0.6), body, bevel=0.02, parent=root)
    grill = mat('grill', (0.08, 0.08, 0.09), rough=0.6)
    for x in (-0.42, 0.42):
        lathe(f'fan{x}', [(0, 1.1), (0.38, 1.1), (0.38, 1.16), (0.33, 1.18), (0, 1.18)], (x, 0, 0), grill, 20, root)
    for k in range(9):
        box(f'fin{k}', (0.012, 0.96, 0.6), (-0.8 + k * 0.2, 0, 0.55), grill, parent=root)


def dish():
    root = empty('model')
    steel = mat('steel', (0.35, 0.36, 0.38), metal=0.7, rough=0.45)
    lathe('mast', [(0, 0), (0.04, 0), (0.04, 1.1), (0, 1.1)], material=steel, seg=8, parent=root)
    d = lathe('dish', [(0, 0), (0.15, 0.01), (0.3, 0.05), (0.42, 0.12), (0.4, 0.13), (0.28, 0.07), (0.14, 0.03), (0, 0.02)], (0, -0.1, 1.15), mat('dishw', (0.92, 0.92, 0.9), rough=0.4), 24, root)
    d.rotation_euler = (math.radians(-70), 0, 0)
    tube('arm', [(0, -0.12, 1.12), (0, -0.4, 1.25), (0, -0.55, 1.3)], 0.012, steel, root, 4)
    box('lnb', (0.06, 0.08, 0.06), (0, -0.56, 1.3), mat('lnb', (0.2, 0.2, 0.2), rough=0.5), parent=root)


def antenna():
    root = empty('model')
    steel = mat('steel', (0.35, 0.36, 0.38), metal=0.7, rough=0.45)
    lathe('mast', [(0, 0), (0.05, 0), (0.03, 6.0), (0, 6.0)], material=steel, seg=8, parent=root)
    for k, z in enumerate((3.6, 4.4, 5.2)):
        box(f'x{k}', (1.4 - k * 0.3, 0.03, 0.03), (0, 0, z), steel, parent=root)
    box('beacon', (0.1, 0.1, 0.1), (0, 0, 6.05), mat('emit_beacon', (0.5, 0, 0), emit=(1, 0.05, 0.05), strength=8), parent=root)
    for a in (0, 2.1, 4.2):
        tube(f'guy{a}', [(0, 0, 3.0), (math.cos(a) * 1.5, math.sin(a) * 1.5, 0)], 0.006, steel, root, 2)


ALL = {'bd_ac': ac, 'bd_vsign': vsign, 'bd_tank': tank, 'bd_stair': stair, 'bd_condenser': condenser, 'bd_dish': dish, 'bd_antenna': antenna}

if __name__ == '__main__':
    names = [a for a in sys.argv[1:] if a in ALL] or list(ALL)
    for n in names:
        build(n, ALL[n])
