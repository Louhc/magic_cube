# -*- coding: utf-8 -*-
"""从公式合集页的图里读出「签名」，用于和公式算出的局面比对。

图是应用导出的 SVG 光栅化结果，几何固定，所以按比例取样即可：
    cell=1  gap=0.17  pad=0.13*board   导出为正方形
"""
from PIL import Image

CELL, GAP = 1.0, 0.17
BOARD = 3 * (CELL + GAP) - GAP
PAD = 0.13 * BOARD
TOTAL = BOARD + 2 * PAD
PITCH = CELL + GAP
BAR_OFF = 0.085


def make_sampler(size):
    k = size / TOTAL
    return lambda x, y: (int(round(x * k)), int(round(y * k)))


def is_yellow(p):
    r, g, b = p[:3]
    return r > 200 and g > 170 and b < 120


def face_of(p):
    """PLL 侧面色带 -> 面字母。配色：U黄 F蓝 R红 B绿 L橙"""
    r, g, b = p[:3]
    if r > 200 and g > 200 and b < 120: return 'U'
    if b > 120 and r < 110 and g < 140: return 'F'
    if r > 140 and g < 110 and b < 110: return 'R'
    if g > 110 and r < 130 and b < 130: return 'B'
    if r > 190 and 110 < g < 190 and b < 110: return 'L'
    return '?'


def cell_center(r, c):
    return (PAD + c * PITCH + CELL / 2, PAD + r * PITCH + CELL / 2)


def bar_pt(face, i):
    """face: B(上) L(左) R(右) F(下)，i = 0..2"""
    if face == 'B': return (PAD + i * PITCH + CELL / 2, PAD - BAR_OFF)
    if face == 'F': return (PAD + i * PITCH + CELL / 2, PAD + BOARD + BAR_OFF)
    if face == 'L': return (PAD - BAR_OFF, PAD + i * PITCH + CELL / 2)
    return (PAD + BOARD + BAR_OFF, PAD + i * PITCH + CELL / 2)


def read_oll(path):
    """OLL 图 -> (顶面 9 位黄, 侧边 12 位划线)"""
    im = Image.open(path).convert('RGB')
    px = make_sampler(im.width)
    top = ''.join('1' if is_yellow(im.getpixel(px(*cell_center(r, c)))) else '0'
                  for r in range(3) for c in range(3))
    bars = ''
    for face in 'BLRF':
        for i in range(3):
            bars += '1' if is_yellow(im.getpixel(px(*bar_pt(face, i)))) else '0'
    return top, bars


def read_pll(path):
    """PLL 图 -> 12 条侧面色带的面字母"""
    im = Image.open(path).convert('RGB')
    px = make_sampler(im.width)
    out = ''
    for face in 'BLRF':
        for i in range(3):
            out += face_of(im.getpixel(px(*bar_pt(face, i))))
    return out


def read(kind, path):
    return read_oll(path) if kind == 'oll' else read_pll(path)


if __name__ == '__main__':
    import sys, glob, re, os
    d = sys.argv[1] if len(sys.argv) > 1 else '.'
    kind = 'oll' if 'oll' in os.path.basename(d.rstrip('/')) else 'pll'
    for f in sorted(glob.glob(os.path.join(d, '*.png'))):
        n = int(re.search(r'-(\d+)-', f).group(1))
        v = read(kind, f)
        if kind == 'oll':
            print('%02d  %s %s %s   %s' % (n, v[0][0:3], v[0][3:6], v[0][6:9], v[1]))
        else:
            print('%02d  %s' % (n, v))
