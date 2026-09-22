"""生成教程页的步骤图（tools/tutorial_geometry.js + tools/tutorial_paint.py 的驱动）。

图的风格和现有 f2l/oll/pll 那批一致：三面投影、深色塑料壳、内缩倒角贴纸，
256 色调色板 PNG。这里只负责「给出教学局面」，几何和上色交给那两个脚本。

局面怎么来的：从复原态出发，直接改指定面的贴纸颜色 —— 教程图是**示意**，
要的是「一眼看懂现在该是什么样」，所以：
  · 还不该有 / 不关心的格子用 gray（和 f2l/oll 那批图一个约定，表示"先不管"）；
  · 需要整块转过来看的（比如白十字要把白面转到上面），用 CubeSim.apply(st, 'x2')。

用法:
    python3 tools/tutorial_images.py            # 出全部图到 tutorial/
    python3 tools/tutorial_images.py flower     # 只出某一张（调试用）
"""
import json
import os
import subprocess
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import cubesim as sim                     # noqa: E402
import tutorial_paint                     # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUTDIR = os.path.join(ROOT, 'tutorial')
GEOM = os.path.join(ROOT, 'tools', 'tutorial_geometry.js')


# pll.html 里 Ua 的第一个写法（第 6 步做完之后「只剩三条棱打转」就是它这个局面）
UA_FIRST_LINE = "(R U' R) (U R) (U R U' R' U' R'2)"


def painted(state, face, cells):
    """把某一面的若干格改成指定颜色（cells: {(行,列): 颜色字母}）"""
    st = dict(state)
    for (r, c), col in cells.items():
        p = [p for (rr, cc, p) in sim.face_slots(face) if (rr, cc) == (r, c)][0]
        st[(p, sim.FACES[face])] = col
    return st


def at(state, face, pos, col):
    """按**三维位置**给某一面上的一格上色。

    配方一律用这个，不用 (行,列) —— Python 这份模拟器的 face_slots 行列表述
    和 tools/tutorial_geometry.js 里那套（决定画面怎么摆）不是同一个约定，
    早先按 (行,列) 画面就把「底行」画成了「左列」。位置是物理量，两边不会打架。
    """
    st = dict(state)
    for (r, c, p) in sim.face_slots(face):
        if tuple(p) == tuple(pos):
            st[(p, sim.FACES[face])] = col
            return st
    raise KeyError('%s 上没有位置 %s 这一格' % (face, pos))


# 六个面中心的方向（也就是面法向）
NORMALS = {'U': (0, 1, 0), 'D': (0, -1, 0), 'F': (0, 0, 1), 'B': (0, 0, -1),
           'R': (1, 0, 0), 'L': (-1, 0, 0)}


def face_center(face):
    return NORMALS[face]


def bottom_edge_cell(face):
    """侧面 f 在底层的那一格（棱的侧面贴纸所在处）：把法向的 y 换成 -1"""
    n = NORMALS[face]
    return (n[0], -1, n[2])


def layer_cells(face, y):
    """侧面 f 在 y 这一层的那三个位置（左角、中、右角）"""
    return [tuple(p) for (r, c, p) in sim.face_slots(face) if p[1] == y]


CORNER_CELLS = [(0, 0), (0, 2), (2, 0), (2, 2)]
EDGE_CELLS = [(0, 1), (1, 0), (1, 2), (2, 1)]
SIDES = ('F', 'R', 'B', 'L')


def grey_all(state):
    """先把整个魔方涂成「先不管」的灰，再往上面画这一步要看的东西。

    这一步很关键：教程图是**示意图**，不是照片。像「小花」那一张，除了顶面的
    黄心和四条白棱、以及那两条棱的侧面贴纸，别的地方都不该有颜色 ——
    直接从复原态改几个格子的话，其余部分会带着复原态的颜色，
    看着就像「已经拼好了大半」，反而误导人（早先那批图就是这么错的）。
    """
    st = {}
    for (p, n) in state:
        st[(p, n)] = 'X'
    return st


def fill_face(state, face, cells):
    return painted(state, face, cells)


def build():
    """返回 [(文件名, 局面)] —— 顺序就是教程里的顺序"""
    solved = sim.solved()
    out = []

    # 1) 小花：顶面黄心 + 四条白棱（白朝上），角块先不管（灰）。
    #    侧面的颜色**故意不对齐** —— 这一步只是把白棱转到顶面，侧面配什么色都行，
    #    对齐是下一步的事（教程正文专门强调了这一点，配图也得照这个来）。
    flower = grey_all(solved)
    flower = at(flower, 'U', (0, 1, 0), 'U')
    for p in ((1, 1, 0), (-1, 1, 0), (0, 1, 1), (0, 1, -1)):
        flower = at(flower, 'U', p, 'D')
    flower = at(flower, 'F', (0, 1, 1), 'R')     # 前面顶中格给绿色（不是它中心的红）
    flower = at(flower, 'R', (1, 1, 0), 'F')     # 右面顶中格给红色
    out.append(('flower', flower))

    # 2) 白十字完成：底面白十字 + 四条白棱的侧面颜色和中心对齐；角块还不该有 -> 灰。
    #    再整体 x2 把白面转到上面，就是教程里「翻过来看底面」的样子。
    cross = grey_all(solved)
    cross = at(cross, 'D', (0, -1, 0), 'D')
    for p in ((1, -1, 0), (-1, -1, 0), (0, -1, 1), (0, -1, -1)):
        cross = at(cross, 'D', p, 'D')
    for f in SIDES:                              # 侧面：中心 + 底中格，两块同色 = 对齐
        cross = at(cross, f, face_center(f), f)
        cross = at(cross, f, bottom_edge_cell(f), f)
    out.append(('whitecross', sim.apply(cross, 'x2')))

    # 4) 第 6 步（顶层角块归位）做完的样子：顶面全黄、四个角都到位，
    #    只剩三条棱在打转 —— 就是 Ua 那个局面（拿 Ua 的逆运算从复原态退回去）。
    #    这一张是「整个魔方长这样」，不涂灰。
    out.append(('corners', sim.case_of(UA_FIRST_LINE)))

    return out


def main():
    argv = sys.argv[1:]
    outdir = OUTDIR
    if '--out' in argv:                      # 校验时输出到临时目录，别动仓库里的图
        i = argv.index('--out')
        outdir = argv[i + 1]
        del argv[i:i + 2]
    want = set(argv)
    os.makedirs(outdir, exist_ok=True)
    made = []
    for name, state in build():
        if want and name not in want:
            continue
        # 局面临时文件 -> 几何（node）-> 上色（PIL）
        with tempfile.NamedTemporaryFile('w', suffix='.json', delete=False) as f:
            json.dump({'%d,%d,%d|%d,%d,%d' % (p[0], p[1], p[2], n[0], n[1], n[2]): v
                       for (p, n), v in state.items()}, f)
            stfile = f.name
        geom = stfile + '.geom.json'
        png = os.path.join(outdir, name + '-256x258.png')
        try:
            subprocess.check_call(['node', GEOM, '--state', stfile, '--out', geom])
            tutorial_paint.paint(json.load(open(geom, encoding='utf-8')), png, 256,
                                 transparent=True)
        finally:
            for f in (stfile, geom):
                if os.path.exists(f):
                    os.remove(f)
        made.append(png)
        print('%s  %d 字节' % (png, os.path.getsize(png)))
    print('共 %d 张' % len(made))
    return 0


if __name__ == '__main__':
    sys.exit(main())
