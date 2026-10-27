# 街道设施：路灯、红绿灯、公交站、自动售货机、电线杆、护栏、花坛、长椅、垃圾桶、护柱、消防栓、路锥
# 运行：/tmp/bvenv/bin/python tools/blender/street.py [名字...]
import sys, os, math, random
sys.path.insert(0, os.path.dirname(__file__))
from lib import *
import bmesh
from mathutils import Vector


def metal(name='metal', c=(0.18, 0.19, 0.21), rough=0.4):
    return mat(name, c, metal=0.7, rough=rough)


# ---------- 路灯：灯臂朝 +X 伸向车道，背面挂一面小旗 ----------
def lamp():
    root = empty('model')
    pm = metal('pole', (0.14, 0.15, 0.17), 0.38)
    lathe('base', [(0, 0), (0.26, 0), (0.26, 0.05), (0.21, 0.09), (0.19, 0.55), (0.15, 0.62), (0.12, 0.66), (0, 0.66)], material=mat('base', (0.09, 0.09, 0.1), metal=0.5, rough=0.5), seg=16, parent=root)
    lathe('pole', [(0, 0.6), (0.115, 0.6), (0.078, 7.0), (0.06, 7.08), (0, 7.1)], material=pm, seg=12, parent=root)
    tube('arm', [(0, 0, 6.6), (0.35, 0, 7.12), (1.0, 0, 7.26), (1.5, 0, 7.24)], 0.045, pm, root)
    box('head', (0.78, 0.34, 0.11), (1.62, 0, 7.2), mat('lamphead', (0.2, 0.21, 0.23), metal=0.6, rough=0.35), bevel=0.04, parent=root, rot=(0, math.radians(-4), 0))
    box('led', (0.62, 0.24, 0.02), (1.62, 0, 7.135), mat('emit_lamp', (1, 0.95, 0.85), emit=(1.0, 0.86, 0.64), strength=8), parent=root, rot=(0, math.radians(-4), 0))
    box('hatch', (0.02, 0.14, 0.3), (0.195, 0, 0.32), mat('hatch', (0.06, 0.06, 0.07), rough=0.6), parent=root)
    # 旗杆支架 + 小旗（两面都能贴字）
    for z in (4.0, 5.5):
        box(f'brk{z}', (0.62, 0.03, 0.03), (-0.38, 0, z), pm, parent=root)
    bm = mat('banner', (0.9, 0.9, 0.92), rough=0.7)
    plane('sign_flag', 0.5, 1.4, (-0.42, -0.012, 4.75), bm, '-Y', root)
    plane('sign_flag2', 0.5, 1.4, (-0.42, 0.012, 4.75), bm, '+Y', root)


# ---------- 红绿灯：灯杆在原点，横臂朝 +X，信号灯两面都有灯 ----------
def signal():
    root = empty('model')
    pm = metal('pole', (0.62, 0.63, 0.6), 0.45)
    lathe('base', [(0, 0), (0.24, 0), (0.24, 0.08), (0.18, 0.14), (0, 0.14)], material=pm, seg=16, parent=root)
    lathe('pole', [(0, 0.1), (0.13, 0.1), (0.1, 6.55), (0.07, 6.62), (0, 6.64)], material=pm, seg=12, parent=root)
    tube('arm', [(0, 0, 6.3), (2.8, 0, 6.3), (5.7, 0, 6.28)], 0.07, pm, root)
    tube('brace', [(0, 0, 5.5), (0.8, 0, 5.95), (1.8, 0, 6.28)], 0.035, pm, root)
    hx, hz = 5.05, 5.86
    dark = mat('housing', (0.05, 0.05, 0.055), rough=0.5)
    box('housing', (1.62, 0.34, 0.44), (hx, 0, hz), dark, bevel=0.05, parent=root)
    for x in (-0.55, 0.55):
        box(f'hang{x}', (0.05, 0.05, 0.25), (hx + x, 0, hz + 0.32), pm, parent=root)
    cols = {'red': (1, 0.08, 0.05), 'yellow': (1, 0.55, 0.02), 'green': (0.1, 1, 0.55)}
    for i, (nm, c) in enumerate(cols.items()):
        x = hx + (i - 1) * 0.5
        parts = []
        for s in (-1, 1):
            parts.append(cyl(f'lamp_{nm}_{s}', 0.14, 0.02, (x, s * 0.175, hz), mat('emit_' + nm, tuple(v * 0.3 for v in c), emit=c, strength=6), 'Y', 20, parent=root))
            # 遮光帽：上半圈
            v = cyl(f'visor{i}{s}', 0.175, 0.2, (x, s * 0.27, hz), dark, 'Y', 16, parent=root)
            bmv = bmesh.new(); bmv.from_mesh(v.data)
            bmesh.ops.delete(bmv, geom=[f for f in bmv.faces if f.calc_center_median().z < 0.02], context='FACES')
            bmesh.ops.solidify(bmv, geom=bmv.faces[:], thickness=0.015)
            bmv.to_mesh(v.data); bmv.free()
        join(parts, f'lamp_{nm}')
    # 路名牌（蓝底白字，运行时贴字）
    sm = mat('streetsign', (0.05, 0.2, 0.55), rough=0.5)
    box('signplate', (1.7, 0.03, 0.42), (2.5, 0, 6.62), sm, parent=root)
    plane('sign_street', 1.62, 0.36, (2.5, -0.017, 6.62), sm, '-Y', root)
    plane('sign_street2', 1.62, 0.36, (2.5, 0.017, 6.62), sm, '+Y', root)
    # 人行横道信号（杆子上）
    box('ped', (0.3, 0.26, 0.62), (0, -0.25, 3.0), dark, bevel=0.03, parent=root)
    box('ped_lens', (0.22, 0.02, 0.22), (0, -0.385, 3.14), mat('emit_pedr', (0.4, 0.02, 0.02), emit=(1, 0.1, 0.05), strength=3), parent=root)
    box('ped_lens2', (0.22, 0.02, 0.22), (0, -0.385, 2.86), mat('pedoff', (0.02, 0.06, 0.03), rough=0.3), parent=root)
    box('button', (0.12, 0.08, 0.18), (0, -0.14, 1.15), mat('btn', (0.85, 0.7, 0.1), rough=0.4), bevel=0.02, parent=root)


# ---------- 公交站：开口朝 -Y（车道），玻璃背板，长椅，灯箱广告，到站屏 ----------
def busstop():
    root = empty('model')
    fr = metal('frame', (0.2, 0.22, 0.25), 0.35)
    accent = mat('accent', (0.1, 0.45, 0.32), metal=0.3, rough=0.4)
    # 屋顶：略带弧度的板 + 前沿色带 + 灯带
    prof = [(-1.0, 2.62), (1.0, 2.66), (1.0, 2.74), (-1.0, 2.8), (-1.06, 2.72)]
    extrude_profile('roof', prof, 5.4, fr, root, bevel=0.02)
    box('fascia', (5.4, 0.06, 0.22), (0, -1.03, 2.68), accent, bevel=0.01, parent=root)
    box('lightstrip', (5.0, 0.4, 0.02), (0, -0.6, 2.61), mat('emit_white', (0.9, 0.9, 0.9), emit=(1, 0.97, 0.9), strength=3), parent=root)
    for x in (-2.55, 0, 2.55):
        box(f'post{x}', (0.09, 0.09, 2.62), (x, 0.82, 1.31), fr, parent=root)
    gl = mat('glass_clear', (0.75, 0.85, 0.9), rough=0.05)
    gl.node_tree.nodes.get('Principled BSDF').inputs['Alpha'].default_value = 0.22
    box('backglass', (5.0, 0.03, 2.0), (0, 0.84, 1.35), gl, parent=root)
    box('sideglass', (0.03, 1.45, 1.9), (-2.56, 0.1, 1.35), gl, parent=root)
    for z in (0.33, 2.36):
        box(f'rail{z}', (5.1, 0.05, 0.05), (0, 0.84, z), fr, parent=root)
    box('siderail', (0.05, 1.5, 0.05), (-2.56, 0.1, 2.32), fr, parent=root)
    # 长椅
    wood = mat('wood', (0.48, 0.3, 0.16), rough=0.65)
    for k in range(4):
        box(f'slat{k}', (2.8, 0.1, 0.04), (-0.6, 0.18 + k * 0.12, 0.48), wood, bevel=0.01, parent=root)
    for x in (-1.85, 0.65):
        box(f'leg{x}', (0.06, 0.45, 0.46), (x, 0.36, 0.23), fr, parent=root)
    # 灯箱广告（两面，运行时贴图）
    box('adbox', (1.42, 0.2, 2.2), (2.0, 0.55, 1.25), fr, bevel=0.02, parent=root)
    adm = mat('screen', (0.9, 0.9, 0.9), emit=(0.9, 0.9, 0.9), strength=1)
    plane('screen_ad', 1.26, 1.96, (2.0, 0.445, 1.27), adm, '-Y', root)
    plane('screen_ad2', 1.26, 1.96, (2.0, 0.655, 1.27), adm, '+Y', root)
    # 到站信息屏
    box('ledbox', (1.1, 0.1, 0.3), (-0.8, -0.55, 2.42), mat('ledbody', (0.05, 0.05, 0.06), rough=0.5), parent=root)
    plane('screen_led', 1.0, 0.22, (-0.8, -0.605, 2.42), mat('screen', (0.9, 0.9, 0.9)), '-Y', root)
    box('ledhang', (0.04, 0.04, 0.15), (-0.8, -0.55, 2.6), fr, parent=root)
    # 站牌杆
    lathe('stoppole', [(0, 0), (0.05, 0), (0.05, 3.0), (0, 3.0)], (-3.1, -0.7, 0), fr, 10, root)
    box('stopsign', (0.7, 0.05, 0.5), (-3.1, -0.7, 2.75), accent, bevel=0.03, parent=root)
    plane('sign_stop', 0.6, 0.4, (-3.1, -0.73, 2.75), mat('stopface', (1, 1, 1), rough=0.5), '-Y', root)
    box('floor', (5.2, 1.9, 0.04), (0, 0, 0.02), mat('tile', (0.42, 0.42, 0.44), rough=0.85), parent=root)


# ---------- 自动售货机：正面 -Y，玻璃后面是一排排饮料 ----------
def vending():
    root = empty('model')
    W, D, H = 1.0, 0.78, 1.9
    body = box('cab', (W, D, H), (0, 0, H / 2), mat('paint', (0.75, 0.06, 0.08), metal=0.2, rough=0.35, coat=0.6), bevel=0.03, parent=root)
    apply_mods(body)
    cut = box('cut', (0.78, 0.4, 1.06), (-0.05, -D / 2, 1.27))
    boolean(body, cut)
    box('top', (W + 0.04, D + 0.04, 0.06), (0, 0, H + 0.02), mat('trim', (0.1, 0.1, 0.11), rough=0.5), bevel=0.015, parent=root)
    box('back', (0.76, 0.02, 1.04), (-0.05, -D / 2 + 0.19, 1.27), mat('emit_vend', (1, 1, 1), emit=(1, 0.97, 0.9), strength=1.6), parent=root)
    rnd = random.Random(3)
    palette = [(0.85, 0.1, 0.1), (0.1, 0.35, 0.85), (0.95, 0.75, 0.1), (0.1, 0.6, 0.25), (0.95, 0.95, 0.95), (0.5, 0.2, 0.6), (0.9, 0.45, 0.1)]
    for row in range(4):
        z = 0.84 + row * 0.25
        box(f'shelf{row}', (0.76, 0.16, 0.015), (-0.05, -D / 2 + 0.1, z - 0.005), mat('shelf', (0.85, 0.85, 0.85), metal=0.5, rough=0.3), parent=root)
        for i in range(6):
            c = palette[rnd.randrange(len(palette))]
            x = -0.05 - 0.3 + i * 0.12
            if rnd.random() < 0.5:
                cyl(f'can{row}{i}', 0.033, 0.12, (x, -D / 2 + 0.09, z + 0.06), mat(f'can{c}', c, metal=0.6, rough=0.3), 'Z', 12, parent=root)
            else:
                lathe(f'bot{row}{i}', [(0, 0), (0.035, 0), (0.035, 0.12), (0.015, 0.16), (0.015, 0.18), (0, 0.18)], (x, -D / 2 + 0.09, z), mat(f'pet{c}', c, rough=0.25), 10, root)
            box(f'btn{row}{i}', (0.05, 0.01, 0.025), (x, -D / 2 + 0.02, z - 0.03), mat('emit_btn', (0.3, 0.05, 0.05), emit=(1, 0.2, 0.1), strength=2), parent=root)
    gl = mat('glass_clear', (0.8, 0.88, 0.95), rough=0.03)
    gl.node_tree.nodes.get('Principled BSDF').inputs['Alpha'].default_value = 0.18
    box('glass', (0.78, 0.015, 1.06), (-0.05, -D / 2 + 0.005, 1.27), gl, parent=root)
    plane('sign_vend', 0.78, 0.3, (-0.05, -D / 2 - 0.004, 0.55), mat('signface', (1, 1, 1), rough=0.4), '-Y', root)
    box('coin', (0.14, 0.03, 0.42), (0.4, -D / 2 - 0.01, 1.05), mat('trim', (0.1, 0.1, 0.11), rough=0.5), parent=root)
    box('coinlcd', (0.1, 0.01, 0.05), (0.4, -D / 2 - 0.03, 1.2), mat('emit_lcd', (0.1, 0.3, 0.1), emit=(0.3, 1, 0.4), strength=2), parent=root)
    box('slot', (0.62, 0.06, 0.2), (-0.05, -D / 2 - 0.0, 0.2), mat('slot', (0.02, 0.02, 0.02), rough=0.6), parent=root)
    box('flap', (0.58, 0.03, 0.16), (-0.05, -D / 2 - 0.02, 0.2), mat('trim', (0.1, 0.1, 0.11), rough=0.5), parent=root)


# ---------- 电线杆（首尔街头最有辨识度的东西）：横担沿 X ----------
def utilpole():
    root = empty('model')
    concrete = mat('concrete', (0.56, 0.55, 0.52), rough=0.92)
    lathe('pole', [(0, 0), (0.17, 0), (0.13, 9.0), (0, 9.02)], material=concrete, seg=12, parent=root)
    arm = metal('arm', (0.3, 0.31, 0.33), 0.5)
    box('arm1', (1.9, 0.1, 0.1), (0, 0, 8.4), arm, parent=root)
    box('arm2', (1.3, 0.1, 0.1), (0, 0, 7.6), arm, parent=root)
    for z0, x0 in ((8.4, 0.6), (7.6, 0.4)):
        tube(f'brace{z0}', [(-x0, 0, z0 - 0.05), (0, 0, z0 - 0.55), (x0, 0, z0 - 0.05)], 0.018, arm, root)
    por = mat('porcelain', (0.9, 0.9, 0.86), rough=0.25)
    ins = [(0, 0), (0.05, 0), (0.05, 0.02), (0.03, 0.03), (0.055, 0.06), (0.03, 0.07), (0.055, 0.1), (0.03, 0.11), (0.04, 0.14), (0, 0.15)]
    for x, z in ((-0.8, 8.45), (0, 8.45), (0.8, 8.45), (-0.5, 7.65), (0.5, 7.65)):
        lathe(f'ins{x}{z}', ins, (x, 0, z), por, 10, root)
    # 变压器
    tm = mat('transformer', (0.45, 0.47, 0.46), metal=0.4, rough=0.5)
    lathe('trans', [(0, 0), (0.24, 0), (0.25, 0.04), (0.25, 0.66), (0.22, 0.72), (0.06, 0.76), (0, 0.76)], (0, 0.44, 6.6), tm, 18, root)
    for k in range(6):
        a = k / 6 * math.pi * 2
        box(f'fin{k}', (0.02, 0.06, 0.5), (math.cos(a) * 0.27, 0.44 + math.sin(a) * 0.27, 6.95), tm, parent=root, rot=(0, 0, a))
    box('tbrk', (0.08, 0.3, 0.08), (0, 0.22, 7.2), arm, parent=root)
    box('tbrk2', (0.08, 0.3, 0.08), (0, 0.22, 6.75), arm, parent=root)
    for k in range(3):
        lathe(f'bush{k}', ins, ((k - 1) * 0.12, 0.44, 7.36), por, 8, root)
    # 脚钉
    for k in range(10):
        z = 2.4 + k * 0.45
        s = 1 if k % 2 else -1
        box(f'step{k}', (0.28, 0.025, 0.025), (s * 0.14, 0, z), arm, parent=root)
    # 底部黄黑反光套 + 贴的小广告
    y = mat('stripe_y', (0.95, 0.72, 0.05), rough=0.5)
    k = mat('stripe_k', (0.03, 0.03, 0.03), rough=0.5)
    for i in range(4):
        lathe(f'wrap{i}', [(0, 0), (0.178, 0), (0.178, 0.2), (0, 0.2)], (0, 0, 0.4 + i * 0.2), y if i % 2 == 0 else k, 12, root)
    for i, (c, z, a) in enumerate((((0.95, 0.95, 0.9), 1.75, -0.4), ((0.98, 0.85, 0.2), 1.45, 0.3), ((0.6, 0.85, 0.95), 2.05, 0.1))):
        box(f'flyer{i}', (0.22, 0.012, 0.3), (math.sin(a) * 0.165, -math.cos(a) * 0.165, z), mat(f'flyer{i}', c, rough=0.8), parent=root, rot=(0, 0, a))


# ---------- 中央护栏：沿 X 长 3.8 米 ----------
def rail():
    root = empty('model')
    wm = mat('railwhite', (0.85, 0.86, 0.84), metal=0.3, rough=0.45)
    for x in (-1.9, 1.9):
        box(f'post{x}', (0.08, 0.08, 0.98), (x, 0, 0.49), wm, bevel=0.01, parent=root)
        box(f'cap{x}', (0.1, 0.1, 0.03), (x, 0, 0.99), mat('railcap', (0.15, 0.15, 0.16), rough=0.5), parent=root)
    tube('top', [(-1.9, 0, 0.92), (1.9, 0, 0.92)], 0.03, wm, root)
    box('bottom', (3.8, 0.04, 0.05), (0, 0, 0.16), wm, parent=root)
    for i in range(19):
        x = -1.8 + i * 0.2
        cyl(f'bar{i}', 0.011, 0.76, (x, 0, 0.54), wm, 'Z', 6, parent=root)
    refl = mat('reflector', (1.0, 0.75, 0.05), rough=0.3)
    box('refl', (0.4, 0.06, 0.16), (0, 0, 0.68), refl, bevel=0.01, parent=root)


# ---------- 花坛：沿 X 长 1.6 米 ----------
def planter():
    root = empty('model')
    stone = mat('stone', (0.44, 0.43, 0.41), rough=0.9)
    pb = box('box', (1.6, 0.7, 0.5), (0, 0, 0.25), stone, bevel=0.03, parent=root)
    apply_mods(pb)
    boolean(pb, box('cut', (1.48, 0.58, 0.4), (0, 0, 0.55)))
    box('soil', (1.48, 0.58, 0.04), (0, 0, 0.42), mat('soil', (0.12, 0.08, 0.05), rough=1), parent=root)
    rnd = random.Random(5)
    leaf = mat('leaf', (0.2, 0.36, 0.14), rough=0.8)
    for i in range(7):
        x = -0.6 + i * 0.2 + rnd.uniform(-0.04, 0.04)
        sph = sphere(f'bush{i}', 0.24 + rnd.uniform(0, 0.08), (x, rnd.uniform(-0.08, 0.08), 0.62 + rnd.uniform(0, 0.08)), leaf, 14, 9, (1, 0.9, 0.85), root)
        jitter(sph, 0.022, rnd)
    for i in range(9):
        c = rnd.choice([(0.95, 0.3, 0.45), (1, 0.85, 0.2), (0.95, 0.95, 0.95), (0.7, 0.35, 0.85)])
        sphere(f'fl{i}', 0.05, (rnd.uniform(-0.65, 0.65), rnd.uniform(-0.25, -0.1), rnd.uniform(0.75, 0.88)), mat(f'fl{c}', c, rough=0.6), 6, 4, (1, 1, 0.7), root)


def jitter(o, amt, rnd):
    for v in o.data.vertices:
        v.co += Vector((rnd.uniform(-amt, amt), rnd.uniform(-amt, amt), rnd.uniform(-amt, amt)))


# ---------- 长椅：坐面朝 -Y ----------
def bench():
    root = empty('model')
    wood = mat('wood', (0.48, 0.3, 0.16), rough=0.65)
    iron = metal('iron', (0.1, 0.1, 0.11), 0.45)
    for k in range(4):
        box(f'seat{k}', (1.8, 0.09, 0.045), (0, -0.2 + k * 0.11, 0.45), wood, bevel=0.012, parent=root)
    for k in range(3):
        box(f'back{k}', (1.8, 0.09, 0.04), (0, 0.24 + k * 0.025, 0.6 + k * 0.12), wood, bevel=0.012, parent=root, rot=(math.radians(-75), 0, 0))
    for x in (-0.75, 0.75):
        extrude_profile(f'side{x}', [(-0.26, 0), (-0.2, 0), (-0.2, 0.42), (0.2, 0.42), (0.24, 0.0), (0.3, 0.0), (0.28, 0.44), (0.36, 0.9), (0.31, 0.92), (0.22, 0.47), (-0.26, 0.47)], 0.05, iron, root, x0=x - 0.025)
        box(f'arm{x}', (0.06, 0.5, 0.04), (x, -0.05, 0.68), iron, bevel=0.01, parent=root)
        box(f'armpost{x}', (0.04, 0.04, 0.22), (x, -0.27, 0.57), iron, parent=root)


# ---------- 垃圾桶（一般 / 可回收两格）：正面 -Y ----------
def trashbin():
    root = empty('model')
    body = mat('binbody', (0.32, 0.36, 0.38), metal=0.5, rough=0.4)
    for i, (x, c) in enumerate(((-0.25, (0.1, 0.4, 0.75)), (0.25, (0.15, 0.55, 0.25)))):
        b = box(f'bin{i}', (0.46, 0.42, 0.95), (x, 0, 0.475), body, bevel=0.03, parent=root)
        apply_mods(b)
        boolean(b, box('cut', (0.3, 0.2, 0.1), (x, -0.21, 0.78)))
        box(f'lid{i}', (0.48, 0.44, 0.05), (x, 0, 0.97), mat(f'lid{c}', c, rough=0.5), bevel=0.015, parent=root)
        box(f'label{i}', (0.32, 0.01, 0.18), (x, -0.215, 0.5), mat(f'lab{c}', c, rough=0.5), parent=root)
        box(f'hole{i}', (0.28, 0.02, 0.08), (x, -0.13, 0.78), mat('hole', (0.01, 0.01, 0.01), rough=1), parent=root)


def bollard():
    root = empty('model')
    lathe('b', [(0, 0), (0.12, 0), (0.12, 0.7), (0.105, 0.76), (0.06, 0.8), (0, 0.81)], material=metal('bol', (0.16, 0.17, 0.18), 0.4), seg=16, parent=root)
    lathe('band', [(0, 0), (0.123, 0), (0.123, 0.07), (0, 0.07)], (0, 0, 0.58), mat('reflector', (1.0, 0.75, 0.05), rough=0.3), 16, root)


def hydrant():
    root = empty('model')
    red = mat('hred', (0.75, 0.05, 0.04), metal=0.3, rough=0.4)
    lathe('h', [(0, 0), (0.2, 0), (0.2, 0.06), (0.14, 0.1), (0.13, 0.62), (0.15, 0.66), (0.12, 0.74), (0.07, 0.8), (0.03, 0.86), (0, 0.86)], material=red, seg=18, parent=root)
    for s in (-1, 1):
        cyl(f'noz{s}', 0.055, 0.12, (s * 0.18, 0, 0.5), red, 'X', 12, parent=root)
        cyl(f'cap{s}', 0.06, 0.03, (s * 0.245, 0, 0.5), mat('hcap', (0.8, 0.8, 0.78), metal=1, rough=0.3), 'X', 6, parent=root)
    lathe('top', [(0, 0), (0.135, 0), (0.135, 0.04), (0, 0.04)], (0, 0, 0.63), mat('hyel', (0.95, 0.75, 0.05), rough=0.4), 18, root)


def cone():
    root = empty('model')
    box('base', (0.4, 0.4, 0.04), (0, 0, 0.02), mat('conebase', (0.05, 0.05, 0.05), rough=0.8), bevel=0.02, parent=root)
    lathe('c', [(0, 0.04), (0.15, 0.04), (0.035, 0.72), (0, 0.72)], material=mat('orange', (1.0, 0.28, 0.02), rough=0.5), seg=18, parent=root)
    for z0, z1 in ((0.3, 0.38), (0.48, 0.55)):
        r0, r1 = 0.15 - (z0 - 0.04) / 0.68 * 0.115 + 0.003, 0.15 - (z1 - 0.04) / 0.68 * 0.115 + 0.003
        lathe(f'band{z0}', [(0, z0), (r0, z0), (r1, z1), (0, z1)], material=mat('white', (0.95, 0.95, 0.95), rough=0.3), seg=18, parent=root)


ALL = {
    'st_lamp': lamp, 'st_signal': signal, 'st_busstop': busstop, 'st_vending': vending, 'st_pole': utilpole,
    'st_rail': rail, 'st_planter': planter, 'st_bench': bench, 'st_bin': trashbin, 'st_bollard': bollard,
    'st_hydrant': hydrant, 'st_cone': cone,
}

if __name__ == '__main__':
    names = [a for a in sys.argv[1:] if a in ALL] or list(ALL)
    for n in names:
        build(n, ALL[n])
