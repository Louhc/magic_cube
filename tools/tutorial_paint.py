"""把 tools/tutorial_geometry.js 出的几何 JSON 画成 256px 的调色板 PNG。

为什么用 PIL 而不是栅格化 SVG：环境里没有能用的 SVG 渲染器（ImageMagick 内置那个
画出来是一团糊）。PIL 的多边形没有抗锯齿，所以按 4 倍超采样画、最后缩回来 ——
和现有那批图（f2l/oll/pll）的观感一致，体积也还是几 KB。

用法:
    python3 tools/tutorial_paint.py 几何.json 输出.png [--size 256]
"""
import json
import sys

from PIL import Image, ImageDraw

SS = 4                     # 超采样倍数
PLASTIC = '#1a1a1a'        # 和教程里那批编辑器导出的图一致（cube.js 的深色框）

# 贴纸颜色：和 cube.js / 编辑器一套（U 黄 / D 白 / F 红 / B 橙 / R 绿 / L 蓝）
COLORS = {'U': '#FFE600', 'D': '#F4F4F4', 'F': '#C00000',
          'B': '#FF8C00', 'R': '#00B050', 'L': '#0070C0', 'X': '#d8d8d8'}


def paint(geom, out, size=256, transparent=False):
    cells = geom['cells']
    pts = [p for c in cells for p in c['frame']]
    xs = [p[0] for p in pts]
    ys = [p[1] for p in pts]
    x0, y0 = min(xs), min(ys)
    w, h = max(xs) - x0, max(ys) - y0
    # 正方形画布、四周留 6% 白边（和 cube.js 的 pad 一个意思）
    pad = 0.06 * max(w, h)
    # 画布按几何的自然长宽比（这套三面投影正好是 256x258 —— 和教程里
    # 编辑器导出的那批图同一个尺寸），不再硬凑正方形
    W, H = w + 2 * pad, h + 2 * pad
    scale = size * SS / W
    ox, oy = pad - x0, pad - y0
    out_w, out_h = size, max(1, round(size * H / W))

    def T(p):
        return ((p[0] + ox) * scale, (p[1] + oy) * scale)

    im = Image.new('RGBA', (out_w * SS, out_h * SS), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    for c in cells:
        d.polygon([T(p) for p in c['frame']], fill=PLASTIC)
        d.polygon([T(p) for p in c['sticker']], fill=c['fill'])
    im = im.resize((out_w, out_h), Image.LANCZOS)
    if transparent:
        # 透明底：直接存 RGBA（PNG 自带 alpha），贴纸/塑料都是不透明的
        im.save(out, optimize=True)
    else:
        bg = Image.new('RGB', im.size, 'white')
        bg.paste(im, (0, 0), im)
        bg.convert('RGB').quantize(colors=256, method=Image.FASTOCTREE).save(out, optimize=True)
    return out


def main():
    if len(sys.argv) < 3:
        print(__doc__)
        return 2
    src, dst = sys.argv[1], sys.argv[2]
    size = 256
    if '--size' in sys.argv:
        size = int(sys.argv[sys.argv.index('--size') + 1])
    geom = json.load(open(src, encoding='utf-8'))
    paint(geom, dst, size, transparent='--transparent' in sys.argv)
    import os
    print('%s  %d 字节' % (dst, os.path.getsize(dst)))
    return 0


if __name__ == '__main__':
    sys.exit(main())
