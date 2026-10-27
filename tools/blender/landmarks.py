# 地标建筑：两栋战队总部（T0、HWL）和竞技场入口
# 原点在楼底中心，正面朝 -Y（导出后 +Z）。材质 facade = 运行时换成楼面贴图（UV 按 12m×22.4m 一格），
# emit_team = 运行时换成战队色的发光条，paint = 战队色的实体构件。
# 运行：/tmp/bvenv/bin/python tools/blender/landmarks.py [名字...]
import sys, os, math
sys.path.insert(0, os.path.dirname(__file__))
from lib import *


def common():
    return dict(
        fac=mat('facade', (0.5, 0.5, 0.5), rough=0.4),
        team=mat('emit_team', (0.3, 0.02, 0.02), emit=(1, 0.05, 0.08), strength=4),
        glass=mat('glass_lobby', (0.05, 0.06, 0.07), metal=0.6, rough=0.08),
        warm=mat('emit_lobby', (1, 0.9, 0.75), emit=(1, 0.82, 0.6), strength=1.4),
        steel=mat('steel', (0.18, 0.19, 0.21), metal=0.8, rough=0.3),
        stone=mat('stone', (0.62, 0.62, 0.6), rough=0.6),
        dark=mat('darkpanel', (0.04, 0.04, 0.045), metal=0.4, rough=0.35),
    )


def lobby(m, root, W, D, H, recess, cols, col_r=0.35):
    """两层高的玻璃大堂：后墙暖光，前面一排柱子。"""
    box('lobbyglass', (W - 2 * recess, 0.08, H - 0.3), (0, -D / 2 + recess, H / 2), m['glass'], parent=root)
    box('lobbylight', (W - 2 * recess - 1, 0.05, H - 1.2), (0, -D / 2 + recess + 3.0, H / 2), m['warm'], parent=root)
    box('lobbyfloor', (W, recess + 0.5, 0.1), (0, -D / 2 + recess / 2, 0.05), m['stone'], parent=root)
    for k in range(int((W - 2 * recess) / 2.5) + 1):   # 玻璃竖框
        x = -W / 2 + recess + k * 2.5
        box(f'mull{k}', (0.08, 0.14, H - 0.3), (x, -D / 2 + recess - 0.05, H / 2), m['steel'], parent=root)
    for i in range(cols):
        x = -W / 2 + 2.5 + i * (W - 5) / (cols - 1)
        cyl(f'col{i}', col_r, H, (x, -D / 2 + 0.6, H / 2), m['stone'], 'Z', 16, parent=root)


# ---------- T0 总部：黑色玻璃塔，正面竖向鳍片，斜贯立面的战队色光带，顶部悬挑光环 ----------
def t0():
    m = common()
    root = empty('model')
    W, D, H, L = 30.0, 20.0, 62.0, 8.0
    lobby(m, root, W, D, L, 2.0, 6)
    # 大堂上方的塔身（侧面 + 背面用楼面贴图）
    uvbox('tower', (W, D, H - L), (0, 0, L + (H - L) / 2), m['fac'], parent=root, faces='sides')
    box('lobbycore', (W - 4.2, D - 4.2, L), (0, 1.0, L / 2), m['dark'], parent=root)
    box('roof', (W, D, 0.3), (0, 0, H + 0.15), m['dark'], parent=root)
    # 正面竖向鳍片
    for k in range(13):
        x = -W / 2 + 0.6 + k * (W - 1.2) / 12
        box(f'fin{k}', (0.28, 1.0, H - L - 1.0), (x, -D / 2 - 0.5, L + (H - L) / 2 - 0.5), m['steel'], parent=root)
    # 每 4 层一道横向黑色钢带
    for k in range(5):
        z = L + 3 + k * 12.8
        box(f'band{k}', (W + 0.4, 1.3, 0.5), (0, -D / 2 - 0.45, z), m['dark'], parent=root)
    # 斜光带：从左下到右上
    a = math.atan2(H - L - 14, W)
    box('slash', (math.hypot(W, H - L - 14) + 2, 0.3, 0.7), (0, -D / 2 - 1.05, L + (H - L) / 2 - 2), m['team'], parent=root, rot=(0, -a, 0))
    # 顶部悬挑光环
    for y in (-D / 2 - 1.5, D / 2 + 1.5):
        box(f'haloX{y}', (W + 3, 0.6, 1.2), (0, y, H + 2.0), m['dark'], parent=root)
        box(f'haloXl{y}', (W + 3, 0.62, 0.15), (0, y, H + 1.35), m['team'], parent=root)
    for x in (-W / 2 - 1.5, W / 2 + 1.5):
        box(f'haloY{x}', (0.6, D + 3, 1.2), (x, 0, H + 2.0), m['dark'], parent=root)
        box(f'haloYl{x}', (0.62, D + 3, 0.15), (x, 0, H + 1.35), m['team'], parent=root)
    for x in (-W / 2 + 1, W / 2 - 1):
        for y in (-D / 2 + 1, D / 2 - 1):
            box(f'post{x}{y}', (0.4, 0.4, 2.0), (x, y, H + 1.0), m['steel'], parent=root)
    # 入口雨棚 + 筒灯
    box('canopy', (16, 5.5, 0.35), (0, -D / 2 - 2.5, L + 0.2), m['dark'], bevel=0.05, parent=root)
    for k in range(6):
        cyl(f'dl{k}', 0.18, 0.03, (-6.25 + k * 2.5, -D / 2 - 3.5, L), m['warm'], 'Z', 12, parent=root)
    box('canopyedge', (16.1, 0.12, 0.12), (0, -D / 2 - 5.25, L + 0.2), m['team'], parent=root)
    # 楼顶设备
    box('plant', (10, 8, 3), (2, 2, H + 1.5), m['dark'], parent=root)
    cyl('mast', 0.15, 10, (-8, 4, H + 5), m['steel'], 'Z', 8, parent=root)


# ---------- HWL 总部：浅色办公楼，战队色竖鳍片 + 大雨棚 + 退台楼顶 ----------
def hwl():
    m = common()
    root = empty('model')
    W, D, H, L = 30.0, 20.0, 44.0, 6.0
    team = mat('paint', (1.0, 0.42, 0.05), metal=0.3, rough=0.4)
    lobby(m, root, W, D, L, 1.6, 7, 0.3)
    box('lobbycore', (W - 3.4, D - 3.4, L), (0, 0.8, L / 2), m['dark'], parent=root)
    uvbox('body', (W, D, 34), (0, 0, L + 17), m['fac'], parent=root, faces='sides')
    box('roof1', (W, D, 0.3), (0, 0, L + 34 + 0.15), m['stone'], parent=root)
    uvbox('top', (W - 8, D - 6, 6), (0, 1.5, L + 34 + 3), m['fac'], parent=root, faces='sides')
    box('roof2', (W - 8, D - 6, 0.3), (0, 1.5, L + 40 + 0.15), m['stone'], parent=root)
    # 楼层石材横线
    for k in range(12):
        box(f'ledge{k}', (W + 0.2, 0.25, 0.2), (0, -D / 2 - 0.12, L + k * 3.2), m['stone'], parent=root)
    # 战队色竖鳍片（带发光条）
    for i in range(-3, 4):
        x = i * 4.4
        box(f'fin{i}', (0.6, 1.2, H + 2), (x, -D / 2 - 0.6, (H + 2) / 2), team, bevel=0.05, parent=root)
        box(f'finled{i}', (0.15, 0.08, H - 4), (x, -D / 2 - 1.22, H / 2 + 1), m['team'], parent=root)
    # 大雨棚
    box('canopy', (21, 5.5, 0.5), (0, -D / 2 - 2.6, L - 0.4), team, bevel=0.08, parent=root)
    for k in range(7):
        cyl(f'dl{k}', 0.18, 0.03, (-7.5 + k * 2.5, -D / 2 - 3.5, L - 0.66), m['warm'], 'Z', 12, parent=root)
    for x in (-9.5, 9.5):
        cyl(f'cpost{x}', 0.18, L - 0.6, (x, -D / 2 - 4.8, (L - 0.6) / 2), m['steel'], 'Z', 12, parent=root)
    # 楼顶战队色框
    box('crownF', (W - 6, 0.5, 2.4), (0, -D / 2 + 3.3, H + 3.4), team, parent=root)
    box('crownL', (W - 6, 0.12, 0.2), (0, -D / 2 + 3.0, H + 2.4), m['team'], parent=root)


# ---------- 竞技场入口：巨幕外框 + 发光雨棚 + 两根立柱（放在大屏楼前面，原点在楼前地面） ----------
SCREEN_Z = 18.37   # 大屏中心高度（游戏里 = 楼高 × 0.55）


def arena():
    m = common()
    m['team'] = mat('emit_team', (0.0, 0.2, 0.3), emit=(0.15, 0.88, 1.0), strength=4)
    root = empty('model')
    zc = SCREEN_Z
    for s in (-1, 1):   # 大屏外框（屏幕本身由游戏生成，16×9）
        box(f'fside{s}', (0.6, 0.8, 10.2), (s * 8.3, -0.2, zc), m['dark'], parent=root)
        box(f'fsideL{s}', (0.12, 0.82, 9.8), (s * 8.62, -0.2, zc), m['team'], parent=root)
        box(f'ftop{s}', (17.2, 0.8, 0.6), (0, -0.2, zc + s * 4.8), m['dark'], parent=root)
        box(f'ftopL{s}', (17.0, 0.82, 0.12), (0, -0.2, zc + s * 5.12), m['team'], parent=root)
    box('canopy', (16, 3.6, 0.4), (0, -1.8, 5.3), m['dark'], bevel=0.06, parent=root)
    box('canopyL', (16.1, 0.14, 0.14), (0, -3.6, 5.3), m['team'], parent=root)
    for k in range(6):
        cyl(f'dl{k}', 0.2, 0.03, (-6.25 + k * 2.5, -2.2, 5.08), m['warm'], 'Z', 12, parent=root)
    for s in (-1, 1):
        box(f'pylon{s}', (1.0, 1.0, 5.0), (s * 9.4, -3.0, 2.5), m['dark'], bevel=0.05, parent=root)
        box(f'pylonL{s}', (1.02, 1.02, 0.18), (s * 9.4, -3.0, 4.7), m['team'], parent=root)
        plane(f'sign_pylon{s}', 0.8, 3.4, (s * 9.4, -3.51, 2.3), mat('screen', (1, 1, 1), emit=(0.6, 0.6, 0.6)), '-Y', root)


ALL = {'lm_t0': t0, 'lm_hwl': hwl, 'lm_arena': arena}

if __name__ == '__main__':
    names = [a for a in sys.argv[1:] if a in ALL] or list(ALL)
    for n in names:
        build(n, ALL[n], max_len=3.0)
