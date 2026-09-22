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


def painted(state, face, cells):
    """把某一面的若干格改成指定颜色（cells: {(行,列): 颜色字母}）"""
    st = dict(state)
    for (r, c), col in cells.items():
        p = [p for (rr, cc, p) in sim.face_slots(face) if (rr, cc) == (r, c)][0]
        st[(p, sim.FACES[face])] = col
    return st


def build():
    """返回 [(文件名, 局面)] —— 顺序就是教程里的顺序"""
    solved = sim.solved()
    out = []

    # 1) 认识魔方 / 记号：复原态的三面图（HTML 再往图上标 U/F/R）
    out.append(('basic-notation', solved))

    # 2) 小花：顶面黄心 + 四条白棱，别的先不管（灰）
    flower = painted(solved, 'U', {(0, 1): 'U', (1, 0): 'U', (1, 2): 'U', (2, 1): 'U',
                                   (0, 0): 'X', (0, 2): 'X', (2, 0): 'X', (2, 2): 'X'})
    out.append(('basic-flower', flower))

    # 3) 白十字：白棱都到了底面（侧面颜色和中心对齐），角块还不该有 -> 灰
    #    再从底下看：整体 x2，白面转到上面，正好是教程里「白十字朝下」的样子
    cross = painted(solved, 'D', {(0, 1): 'D', (1, 0): 'D', (1, 2): 'D', (2, 1): 'D',
                                  (0, 0): 'X', (0, 2): 'X', (2, 0): 'X', (2, 2): 'X'})
    out.append(('basic-cross', sim.apply(cross, 'x2')))

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
        png = os.path.join(outdir, name + '-256x256.png')
        try:
            subprocess.check_call(['node', GEOM, '--state', stfile, '--out', geom])
            tutorial_paint.paint(json.load(open(geom, encoding='utf-8')), png, 256)
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
