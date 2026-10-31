# v1.2 新道具模型：生日蛋糕桌、便当饮料应援桌、喇叭、气球拱门、投影灯、灯牌
# 运行：/tmp/bvenv/bin/python tools/blender/props2.py [名字...]
import sys, os, math, random
sys.path.insert(0, os.path.dirname(__file__))
from lib import *
from shops import imp, proto, dup, _proto


def table(root, w=1.6, d=0.7, h=0.75, cloth=(0.95, 0.95, 0.95)):
    """折叠桌 + 桌布。"""
    cm = mat('cloth_table', cloth, rough=0.9)
    box('top', (w, d, 0.04), (0, 0, h), cm, bevel=0.01, parent=root)
    box('skirt', (w, 0.01, h - 0.15), (0, -d / 2, h - (h - 0.15) / 2), cm, parent=root)
    leg = mat('leg', (0.2, 0.2, 0.22), metal=0.6, rough=0.4)
    for sx in (-1, 1):
        for sy in (-1, 1):
            cyl(f'leg{sx}{sy}', 0.018, h, (sx * (w / 2 - 0.08), sy * (d / 2 - 0.08), h / 2), leg, parent=root)


def cake():
    root = empty('model'); _proto.clear()
    table(root, 1.2, 0.7, cloth=(1.0, 0.85, 0.9))
    imp('props', 'polyhaven_strawberry_chocolate_cake', size=0.5, loc=(0, 0.05, 0.77), parent=root, limit=1500)
    # 立牌（运行时贴字）
    box('sign_card', (0.5, 0.01, 0.32), (0.38, -0.1, 0.95), mat('card', (1, 1, 1), rough=0.6), parent=root).rotation_euler = (math.radians(-12), 0, 0)
    for i, x in enumerate((-0.45, -0.3)):
        imp('props', 'polypizza_gift_box', size=0.22, loc=(x, 0.1, 0.77), rz=i * 0.6, parent=root, limit=300)


def lunch():
    root = empty('model'); _proto.clear(); rnd = random.Random(3)
    table(root, 1.8, 0.75, cloth=(0.9, 0.95, 1.0))
    bento = proto('props', 'kenney_styrofoam_dinner', 0.22)
    cup = proto('props', 'kenney_cup_coffee', 0.14)
    for i in range(6):
        dup(bento, (-0.7 + i * 0.28, 0.12, 0.77), rnd.uniform(-0.1, 0.1), root)
        dup(cup, (-0.7 + i * 0.28, -0.18, 0.77), 0, root)
    box('sign_card', (0.9, 0.01, 0.4), (0, -0.39, 0.5), mat('card', (1, 1, 1), rough=0.6), parent=root)
    imp('props', 'polyhaven_cardboard_box_01', height=0.35, loc=(1.15, 0.1, 0), parent=root, limit=300)
    imp('props', 'polyhaven_cardboard_box_01', height=0.35, loc=(1.15, 0.1, 0.35), rz=0.3, parent=root, limit=300)
    for o in _proto.values(): bpy.data.objects.remove(o, do_unlink=True)


def megaphone():
    root = empty('model')
    imp('props', 'polyhaven_Megaphone_01', size=0.42, loc=(0, 0, 0), parent=root, limit=1500)


def balloon():
    """气球拱门：两根柱子 + 一道拱，彩色光面气球（材质名 paint 运行时按战队色重染）。"""
    root = empty('model'); rnd = random.Random(5)
    cols = [mat('paint', (1, 1, 1), rough=0.25, coat=0.6), mat('balloon_w', (0.95, 0.95, 0.95), rough=0.25, coat=0.6), mat('balloon_g', (0.95, 0.8, 0.3), metal=0.7, rough=0.25)]
    R, n = 2.2, 26
    for i in range(n + 1):
        a = math.pi * i / n
        x, z = math.cos(a) * R, math.sin(a) * R + 0.4
        for j in range(3):
            off = Vector((rnd.uniform(-0.12, 0.12), rnd.uniform(-0.18, 0.18), rnd.uniform(-0.1, 0.1)))
            sphere(f'b{i}_{j}', 0.17 + rnd.uniform(-0.02, 0.03), (x + off.x, off.y, z + off.z), cols[(i + j) % 3], seg=12, rings=8, scale=(1, 1, 1.15), parent=root)
    for sx in (-1, 1):
        box(f'base{sx}', (0.35, 0.35, 0.2), (sx * R, 0, 0.1), mat('weight', (0.15, 0.15, 0.15), rough=0.6), parent=root)
    box('sign_card', (1.6, 0.02, 0.45), (0, -0.05, R + 0.15), mat('card', (1, 1, 1), rough=0.6), parent=root)


def projector():
    """投影灯：三脚架 + 灯箱，镜头发光。"""
    root = empty('model')
    blk = mat('proj', (0.08, 0.08, 0.09), metal=0.5, rough=0.4)
    box('body', (0.4, 0.55, 0.3), (0, 0, 1.3), blk, bevel=0.03, parent=root)
    cyl('lens', 0.11, 0.12, (0, -0.33, 1.32), mat('emit_lens', (1, 1, 1), emit=(1, 0.95, 0.85), strength=4), 'Y', 24, parent=root)
    for k in range(3):
        a = k * 2 * math.pi / 3
        o = cyl(f'leg{k}', 0.02, 1.25, (math.cos(a) * 0.25, math.sin(a) * 0.25, 0.6), blk, parent=root)
        o.rotation_euler = (math.sin(a) * 0.35, -math.cos(a) * 0.35, 0)


def lightboard():
    """LED 灯牌：手持杆 + 发光板（sign_board 运行时贴字，夜里发光）。"""
    root = empty('model')
    cyl('stick', 0.018, 1.6, (0, 0, 0.8), mat('stick', (0.15, 0.15, 0.15), rough=0.5), parent=root)
    box('frame', (0.92, 0.05, 0.38), (0, 0, 1.75), mat('lbframe', (0.08, 0.08, 0.1), metal=0.4, rough=0.4), bevel=0.02, parent=root)
    box('sign_board', (0.86, 0.01, 0.32), (0, -0.03, 1.75), mat('emit_board', (1, 1, 1), emit=(1, 1, 1), strength=1.5), parent=root)


ALL = {'pr_cake': cake, 'pr_lunch': lunch, 'pr_megaphone': megaphone, 'pr_balloon': balloon, 'pr_projector': projector, 'pr_lightboard': lightboard}

if __name__ == '__main__':
    names = [a for a in sys.argv[1:] if a in ALL] or list(ALL)
    for n in names:
        build(n, ALL[n], max_len=0.6)
