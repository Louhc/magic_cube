# -*- coding: utf-8 -*-
"""三阶魔方模拟器（贴纸「坐标 + 法向」模型）。

用途：把一条公式**逆运算作用在复原魔方上**，得到它解的局面，再与公式合集页
里的图比对，确认「照图摆好、直接做这条公式」能不能真的解掉。

为什么不用手写 54 个 facelet 的置换表：那样每个动作都要手抄四组循环，
容易抄错且难核对。这里改成给每张贴纸记 (3D 坐标, 法向)，转动时旋转受影响
小块的坐标与法向，再由坐标反查回各面位置 —— 几何直观，出错也容易看出来。
"""

FACES = {'U': (0, 1, 0), 'D': (0, -1, 0), 'F': (0, 0, 1),
         'B': (0, 0, -1), 'R': (1, 0, 0), 'L': (-1, 0, 0)}


def face_slots(face):
    """该面 9 张贴纸的 (行, 列) -> 3D 坐标，按标准 Kociemba 排布。

    要点：U 面第 0 行贴 B 侧（后），第 2 行贴 F 侧（前）。
    这里的行/列方向必须和公式页里图片的取样方向一致，否则比对会整体错位。
    """
    out = []
    for r in range(3):
        for c in range(3):
            if face == 'U':   p = (c - 1,  1, r - 1)
            elif face == 'D': p = (c - 1, -1, 1 - r)
            elif face == 'F': p = (c - 1, 1 - r,  1)
            elif face == 'B': p = (1 - c, 1 - r, -1)
            elif face == 'R': p = (1, 1 - r, 1 - c)
            else:             p = (-1, 1 - r, c - 1)      # L
            out.append((r, c, p))
    return out


SLOTS = [(f, r, c, p) for f in 'URFDLB' for (r, c, p) in face_slots(f)]


def solved():
    """facelet[(坐标, 法向)] = 颜色字母"""
    return {(p, FACES[f]): f for f, r, c, p in SLOTS}


# ---------------- 各动作的坐标变换（顺时针看该面） ----------------
def rot_U(p): x, y, z = p; return (-z, y, x)
def rot_D(p): x, y, z = p; return (z, y, -x)
def rot_F(p): x, y, z = p; return (y, -x, z)
def rot_B(p): x, y, z = p; return (-y, x, z)
def rot_R(p): x, y, z = p; return (x, z, -y)
def rot_L(p): x, y, z = p; return (x, -z, y)


MOVES = {
    'U': (rot_U, lambda p: p[1] == 1),   'D': (rot_D, lambda p: p[1] == -1),
    'F': (rot_F, lambda p: p[2] == 1),   'B': (rot_B, lambda p: p[2] == -1),
    'R': (rot_R, lambda p: p[0] == 1),   'L': (rot_L, lambda p: p[0] == -1),
    # 中层：与同向的面同转
    'M': (rot_L, lambda p: p[0] == 0),   'E': (rot_D, lambda p: p[1] == 0),
    'S': (rot_F, lambda p: p[2] == 0),
    # 双层
    'r': (rot_R, lambda p: p[0] >= 0),   'l': (rot_L, lambda p: p[0] <= 0),
    'u': (rot_U, lambda p: p[1] >= 0),   'd': (rot_D, lambda p: p[1] <= 0),
    'f': (rot_F, lambda p: p[2] >= 0),   'b': (rot_B, lambda p: p[2] <= 0),
    # 整体旋转
    'x': (rot_R, lambda p: True),        'y': (rot_U, lambda p: True),
    'z': (rot_F, lambda p: True),
}
ALIAS = {'Rw': 'r', 'Lw': 'l', 'Uw': 'u', 'Dw': 'd', 'Fw': 'f', 'Bw': 'b'}


def turn(st, mv, times=1):
    rot, inlayer = MOVES[mv]
    for _ in range(times % 4):
        st = {(rot(p), rot(n)) if inlayer(p) else (p, n): col
              for (p, n), col in st.items()}
    return st


def parse(alg):
    """公式串 -> [(动作, 次数)]。忽略空格/括号。

    原表里有 U'2、L'2 这种写法（撇在 2 前），所以 2 和 ' 允许任意顺序。
    """
    out, i, s = [], 0, alg.replace(' ', '')
    while i < len(s):
        if s[i] in '()':
            i += 1
            continue
        if i + 1 < len(s) and s[i:i + 2] in ALIAS:
            mv = ALIAS[s[i:i + 2]]; i += 2
        elif s[i] in MOVES:
            mv = s[i]; i += 1
        else:
            raise ValueError('看不懂的动作: %r (在 %s)' % (s[i], alg))
        times, prime = 1, False
        for _ in range(2):
            if i < len(s) and s[i] == '2':
                times = 2; i += 1
            elif i < len(s) and s[i] == "'":
                prime = not prime; i += 1
        out.append((mv, -times if prime else times))
    return out


def apply(st, alg):
    for mv, t in parse(alg):
        st = turn(st, mv, t)
    return st


def apply_inverse(st, alg):
    """逆序 + 取负次数"""
    for mv, t in reversed(parse(alg)):
        st = turn(st, mv, -t)
    return st


def sig(st):
    """局面签名 = (顶面 9 位黄, 侧边 12 位划线)。

    12 位按 上(B)3 + 左(L)3 + 右(R)3 + 下(F)3 —— 与 OLL 图里边框划线的
    位置顺序一一对应。
    """
    top = [1 if st.get((p, FACES['U'])) == 'U' else 0
           for f, r, c, p in SLOTS if f == 'U']

    def bar(r, c, face):
        # 该位置的小块未必有朝 face 的贴纸（角块只有 3 张）-> 记 0（不画划线）
        p = [q for (ff, rr, cc, q) in SLOTS if ff == 'U' and rr == r and cc == c][0]
        return 1 if st.get((p, FACES[face])) == 'U' else 0

    bars = ([bar(0, c, 'B') for c in range(3)] +
            [bar(r, 0, 'L') for r in range(3)] +
            [bar(r, 2, 'R') for r in range(3)] +
            [bar(2, c, 'F') for c in range(3)])
    return top, bars


def sig_str(st):
    t, b = sig(st)
    return ''.join(map(str, t)), ''.join(map(str, b))


def pll_sig(st):
    """PLL 签名 = 12 条侧面色带的面字母，顺序同上（上/左/右/下）。

    在合法 PLL 局面下这四个字母必然各出现 3 次 —— 可用来判断图是否合法。
    """
    def at(r, c):
        return [q for (f, rr, cc, q) in SLOTS if f == 'U' and rr == r and cc == c][0]
    s = ''
    for c in range(3): s += st.get((at(0, c), FACES['B']), '-')
    for r in range(3): s += st.get((at(r, 0), FACES['L']), '-')
    for r in range(3): s += st.get((at(r, 2), FACES['R']), '-')
    for c in range(3): s += st.get((at(2, c), FACES['F']), '-')
    return s


# ---------------- 24 种整体旋转 ----------------
def _all_rotations():
    seen, out, seqs = set(), [], ['']
    for _ in range(3):
        new = []
        for s in seqs:
            for mv in ('x', 'y', 'z'):
                for t in (1, 2, 3):
                    suf = '' if t == 1 else ('2' if t == 2 else "'")
                    new.append(s + ' ' + mv + suf)
        seqs = new
    for s in [''] + seqs:
        st = apply(solved(), s.strip())
        key = tuple(sorted(((p, n), c) for (p, n), c in st.items()))
        if key in seen:
            continue
        seen.add(key); out.append(s.strip())
    return out


ROTS = _all_rotations()


def _centers(st):
    return {f: st[(p, FACES[f])] for f, r, c, p in SLOTS if (r, c) == (1, 1)}


def net_rotation(alg):
    """公式的净整体旋转。

    含 x'/y 的公式净效果是一个整体旋转 r，所以它解的局面不是 A⁻¹(复原)，
    而是 A⁻¹(r(复原))。r 可以从**中心块**读出来 —— 面转永远不动中心块。
    不修正的话，一大半带旋转的 PLL 会被误判成「对不上」。
    """
    want = _centers(apply(solved(), alg))
    for rs in ROTS:
        if _centers(apply(solved(), rs)) == want:
            return rs
    return ''


def is_pure_last_layer(st):
    """整层朝向正确 —— PLL 的局面就该长这样"""
    for (f, r, c, p) in SLOTS:
        if f == 'U' and st.get((p, FACES['U'])) != 'U': return False
        if f == 'D' and st.get((p, FACES['D'])) != 'D': return False
    return True


def f2l_solved(st):
    """下两层已复原 —— OLL 的局面就该长这样（顶面本来就是乱的）。

    注意侧面第 0 行属于顶层，要查的是第 1、2 行。
    """
    for (f, rr, cc, p) in SLOTS:
        if f == 'U':
            continue
        if f == 'D':
            if st.get((p, FACES['D'])) != 'D': return False
        elif rr >= 1:
            if st.get((p, FACES[f])) != f: return False
    return True


def case_of(alg, kind='pll'):
    """该公式所解的局面（顶层朝上）；不合法返回 None。

    kind='pll' 要求整层朝向正确；kind='oll' 只要求下两层已复原。
    """
    r = net_rotation(alg)
    base = apply(solved(), r) if r else solved()
    st = apply_inverse(base, alg)
    ok = is_pure_last_layer(st) if kind == 'pll' else f2l_solved(st)
    return st if ok else None
