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
PLASTIC = '#16181c'        # 和 theme.css 的 --cubie / cube.js 的深色框一致


def paint(geom, out, size=256):
    cells = geom['cells']
    pts = [p for c in cells for p in c['frame']]
    xs = [p[0] for p in pts]
    ys = [p[1] for p in pts]
    x0, y0 = min(xs), min(ys)
    w, h = max(xs) - x0, max(ys) - y0
    # 正方形画布、四周留 6% 白边（和 cube.js 的 pad 一个意思）
    pad = 0.06 * max(w, h)
    side = max(w, h) + 2 * pad
    scale = size * SS / side
    ox = (side - w) / 2 - x0
    oy = (side - h) / 2 - y0

    def T(p):
        return ((p[0] + ox) * scale, (p[1] + oy) * scale)

    im = Image.new('RGB', (size * SS, size * SS), 'white')
    d = ImageDraw.Draw(im)
    for c in cells:
        d.polygon([T(p) for p in c['frame']], fill=PLASTIC)
        d.polygon([T(p) for p in c['sticker']], fill=c['fill'])
    im = im.resize((size, size), Image.LANCZOS)
    # 和现有那批图一样：256 色
    im.convert('RGB').quantize(colors=256, method=Image.FASTOCTREE).save(out, optimize=True)
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
    paint(geom, dst, size)
    import os
    print('%s  %d 字节' % (dst, os.path.getsize(dst)))
    return 0


if __name__ == '__main__':
    sys.exit(main())
