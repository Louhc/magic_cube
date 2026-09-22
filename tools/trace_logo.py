# -*- coding: utf-8 -*-
"""把站标（「六面」那张位图）描成矢量，输出 logo.svg。

为什么不用现成工具：环境里没有 potrace / inkscape / cv2 / skimage，只有 numpy + PIL，
所以这里自己走一遍「边界提取 -> 闭环 -> 简化」：

1. 二值化（默认亮度 < 140 算墨）；
2. 沿像素边界取所有「内/外相邻」的边，首尾相接成闭环 —— 得到的是整数坐标的
   阶梯轮廓，外轮廓和洞都在这套闭环里（洞是反向的，SVG 用 evenodd 就不用管方向）；
3. 对每个闭环做 RDP 简化（默认 1.0px）：直边塌成两点，圆角保留成几段折线；
4. 按 x 分成两个字，各出一个 <path>（六 / 面 分开才好上两种颜色）。

输出的 viewBox 就是墨迹包围盒，所以字标外侧没有多余留白。
自检：把描出来的多边形用 PIL 填回位图，和原图算 IoU（一般 > 0.99），
低于 0.98 会直接报错 —— 免得描歪了还悄悄发出去。

用法：
    python3 tools/trace_logo.py 原图.png logo.svg [--tol 1.0] [--thresh 140]
"""
import argparse
import sys

import numpy as np
from PIL import Image, ImageDraw

sys.setrecursionlimit(100000)


def mask_of(path, thresh):
    a = np.asarray(Image.open(path).convert('RGB')).astype(int)
    return a.mean(2) < thresh


def boundary_loops(ink):
    """像素边界 -> 闭环列表（每项是 [(x, y), ...]，整数格点）。"""
    h, w = ink.shape
    seg = {}                                    # 起点 -> 终点

    def add(x0, y0, x1, y1):
        seg[(x0, y0)] = (x1, y1)

    # 上下相邻不同 -> 一条水平边；方向约定：墨在下（上边界）朝 +x，墨在上朝 -x
    for i in range(h + 1):
        up = ink[i - 1] if i > 0 else np.zeros(w, bool)
        dn = ink[i] if i < h else np.zeros(w, bool)
        for j in np.nonzero(up != dn)[0]:
            if dn[j]:
                add(j, i, j + 1, i)
            else:
                add(j + 1, i, j, i)
    # 左右相邻不同 -> 一条竖直边
    for j in range(w + 1):
        lf = ink[:, j - 1] if j > 0 else np.zeros(h, bool)
        rt = ink[:, j] if j < w else np.zeros(h, bool)
        for i in np.nonzero(lf != rt)[0]:
            if rt[i]:
                add(j, i + 1, j, i)
            else:
                add(j, i, j, i + 1)

    loops = []
    while seg:
        start = next(iter(seg))
        loop = [start]
        cur = seg.pop(start)
        while cur != start:
            loop.append(cur)
            cur = seg.pop(cur)
        loops.append(loop)
    return loops


def _rdp(pts, tol):
    """RDP：pts 是开折线。"""
    if len(pts) < 3:
        return pts
    a = np.asarray(pts, float)
    p0, p1 = a[0], a[-1]
    d = p1 - p0
    n = np.hypot(*d)
    if n == 0:
        dist = np.hypot(*(a - p0).T)
    else:
        rel = a - p0
        dist = np.abs(d[0] * rel[:, 1] - d[1] * rel[:, 0]) / n
    i = int(dist.argmax())
    if dist[i] <= tol:
        return [pts[0], pts[-1]]
    return _rdp(pts[:i + 1], tol)[:-1] + _rdp(pts[i:], tol)


def simplify(loop, tol):
    """闭环简化：从最远的两点切开，各跑一遍 RDP 再合起来。"""
    a = np.asarray(loop, float)
    p0 = a[0]
    i = int(np.hypot(*(a - p0).T).argmax())
    left = _rdp(loop[:i + 1], tol)
    right = _rdp(loop[i:] + [loop[0]], tol)
    out = left[:-1] + right[:-1]
    return out


def raster(loops, shape):
    """把闭环按 evenodd 填回位图，用来和原图对 IoU。"""
    im = Image.new('1', (shape[1], shape[0]), 0)
    d = ImageDraw.Draw(im)
    for lp in loops:                            # 逐个 XOR == evenodd
        one = Image.new('1', (shape[1], shape[0]), 0)
        ImageDraw.Draw(one).polygon([tuple(p) for p in lp], fill=1)
        im = Image.fromarray(np.logical_xor(np.asarray(im, bool), np.asarray(one, bool)))
    return np.asarray(im, bool)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('src')
    ap.add_argument('out')
    ap.add_argument('--tol', type=float, default=1.0)
    ap.add_argument('--thresh', type=float, default=140)
    ap.add_argument('--split', type=float, default=None, help='两个字的分界 x（默认按空隙自动找）')
    args = ap.parse_args()

    ink = mask_of(args.src, args.thresh)
    ys, xs = np.nonzero(ink)
    x0, x1, y0, y1 = int(xs.min()), int(xs.max()) + 1, int(ys.min()), int(ys.max()) + 1
    loops = boundary_loops(ink)
    loops = [simplify(lp, args.tol) for lp in loops]

    # 分界：找两条比字宽还大的竖直空白带，取中间
    if args.split is None:
        col = ink.any(0)
        runs, cur = [], None
        for i, v in enumerate(col):
            if v and cur is None:
                cur = i
            elif not v and cur is not None:
                runs.append((cur, i - 1)); cur = None
        if cur is not None:
            runs.append((cur, len(col) - 1))
        if len(runs) != 2:
            raise SystemExit('找不到两个字（列方向有 %d 段），用 --split 指定分界' % len(runs))
        split = (runs[0][1] + runs[1][0]) / 2.0
    else:
        split = args.split

    groups = [[], []]                           # [六, 面]
    for lp in loops:
        cx = sum(p[0] for p in lp) / len(lp)
        groups[0 if cx < split else 1].append(lp)

    # 自检：填回去比 IoU
    got = raster([lp for g in groups for lp in g], ink.shape)
    iou = (got & ink).sum() / float((got | ink).sum())
    print('简化后节点 %d / %d，IoU %.4f' % (len(groups[0][0]) if groups[0] else 0,
                                        sum(len(l) for g in groups for l in g), iou))
    if iou < 0.98:
        raise SystemExit('IoU 太低（%.4f），描歪了' % iou)

    def d_of(g):
        out = []
        for lp in g:
            pts = lp + [lp[0]]
            out.append('M' + ' '.join('%g %g' % (round(p[0] - x0, 2), round(p[1] - y0, 2))
                                      for p in pts) + 'Z')
        return ''.join(out)

    svg = (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 %d %d" '
        'role="img" aria-label="六面">\n'
        '  <!-- 由 tools/trace_logo.py 从位图描出；nav.js 里内联的是同样两条 d，'
        '改图请重跑脚本并同步 -->\n'
        '  <path class="g-a" fill="currentColor" d="%s"/>\n'
        '  <path class="g-b" fill="currentColor" d="%s"/>\n'
        '</svg>\n' % (x1 - x0, y1 - y0, d_of(groups[0]), d_of(groups[1])))
    open(args.out, 'w', encoding='utf-8').write(svg)
    print('%s: %dx%d, %d 字节' % (args.out, x1 - x0, y1 - y0, len(svg)))


if __name__ == '__main__':
    main()
