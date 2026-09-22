# -*- coding: utf-8 -*-
"""校验公式合集页里的公式与图是否真的对得上。

要解决的问题：公式本身可能是对的，但**图上的摆法**和公式要求的摆法不一致 ——
照图摆好直接做公式会做错。这类错误光看图和公式都发现不了，必须算。

做法：
  1. 从 oll.html / pll.html 里读出每条 [编号, 公式]
  2. 用 cubesim 把公式**逆运算**作用在复原魔方上，得到它解的局面
  3. 从同名图里读出签名（顶面 9 格 + 侧边 12 条划线／12 条色带）
  4. 比对 —— 只有分毫不差才算「照图摆好就能用」

注意：差一步 AUF 也算**对不上**。那意味着照图摆好直接做会做错。

用法:
    python3 tools/verify.py                 # 校验仓库里的 oll.html / pll.html
    python3 tools/verify.py --find 16 oll    # OLL 16 有没有别的写法
    python3 tools/verify.py --find T  pll    # PLL T（编号用字母）
"""
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import cubesim as sim
import signature as S

# 24 种"复原态"预算好，判定就是一次集合查询
_SOLVED_FORMS = {tuple(sorted(sim.apply(sim.solved(), r).items())) for r in sim.ROTS}


def solved_rot(st):
    """是否复原（允许整体旋转）—— 含 y/x 的公式做完会留下旋转"""
    return tuple(sorted(st.items())) in _SOLVED_FORMS

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def clean(alg):
    """第三方公式库里有 [z'] 这类注释，也有全角符号"""
    a = re.sub(r'\[[^\]]*\]', ' ', alg)
    return a.replace('\u2019', "'").replace('\uff07', "'")


def sigs(alg, kind):
    """公式的签名 + 它的 4 个 AUF 旋转"""
    try:
        st = sim.case_of(clean(alg), kind)
    except Exception:
        return None
    if st is None:
        return None
    f = sim.sig_str if kind == 'oll' else sim.pll_sig
    out, cur = [], st
    for _ in range(4):
        out.append(f(cur))
        cur = sim.turn(cur, 'U', 1)
    return out


def load_algset(path):
    s = open(path, encoding='utf-8').read()
    s = re.sub(r'^var algSet\s*=\s*', '', s.strip()).rstrip(';')
    s = re.sub(r',(\s*[\]\}])', r'\1', s)
    return json.loads(s)


def lib_algs(libfile):
    out = []
    for c in load_algset(libfile)['cases']:
        for a in c['algs']:
            out.append((c['id'], c.get('name', ''), a['alg']))
            for v in a.get('vars', []) or []:
                out.append((c['id'], c.get('name', ''), v['alg']))
    return out


def img_name(kind, ident, tone=''):
    """编号 -> 图文件名。OLL 是 1..57（补零），PLL 是 Aa..Z。

    OLL 有昼夜两套图（白天紫顶 / 夜晚黄顶），tone 传 'day' / 'night'；
    PLL 只有一套，tone 留空。"""
    f = ident if not ident.isdigit() else ident.zfill(2)
    mid = ('-' + tone) if tone else ''
    return '%s-%s%s-256x256.png' % (kind, f, mid)


def page_data(page):
    """从页面里读出 [(编号, 主公式, [[备选公式, AUF], ...])]

       生成器输出的是合法 JSON（键带引号），所以这里直接解析 ——
       早先我用正则硬啃，会把备选列表里的 ["公式","U"] 也当成一行，
       解析出的公式和 AUF 全错位。
    """
    h = open(page, encoding='utf-8').read()
    m = re.search(r'var SECTIONS = (\[.*?\n\]);', h, re.S)
    if not m:
        return []
    out = []
    for sec in json.loads(m.group(1)):
        for r in sec.get('rows', []):
            alts = [tuple(a) for a in (r[2] if len(r) > 2 else [])]
            # 同一个格子里可能有好几条写法（用换行分隔），要逐条校验 ——
            # 拼在一起会变成一条无效公式
            for line in str(r[1]).split('\n'):
                if line.strip():
                    out.append((str(r[0]), line.strip(), alts))
    return out


def check(kind, page, imgdir, libfile):
    print('=== %s ===' % os.path.basename(page))
    rows = page_data(page)
    if not rows:
        print('  读不到数据')
        return 1
    bad = 0
    nalt = 0
    for n, alg, alts in rows:
        # OLL 以「夜晚（黄顶）」那版为准，白天那版单独再核一次签名
        tone = 'night' if kind == 'oll' else ''
        img = S.read(kind, os.path.join(imgdir, img_name(kind, n, tone)))
        if kind == 'oll':
            day = os.path.join(imgdir, img_name(kind, n, 'day'))
            if not os.path.exists(day) or S.read('oll', day) != img:
                print('  %-4s 白天那版（紫顶）和夜晚那版签名不一致' % n)
                bad += 1
        if not alg:
            print('  %-4s 留空（未填公式）' % n)
            bad += 1
            continue
        ss = sigs(alg, kind)
        if ss is None:
            print('  %-4s 公式算不出合法局面 ← 公式有问题' % n)
            bad += 1
            continue
        if ss[0] == img:
            # 主式对了，再逐条验备选：先做 m 步 AUF，再做公式，应当能解开
            # （页面里每条备选配的那张旋转图，就是"先转 m 步"的可视化）
            C = sim.case_of(clean(alg), kind)
            for a, m in alts:
                nalt += 1
                if not isinstance(m, int) or not (0 <= m <= 3):
                    print('  %-4s 备选 AUF 步数不合法: %r' % (n, m)); bad += 1; continue
                st = C
                for _ in range(m):
                    st = sim.turn(st, 'U', 1)
                try:
                    good = solved_rot(sim.apply(st, clean(a)))
                except Exception:
                    good = False
                if not good:
                    print('  %-4s 备选对不上（U^%d 后）: %s' % (n, m, a))
                    bad += 1
            continue
        k = ss.index(img) if img in ss else None
        print('  %-4s %s' % (n, ('差 %d 步 AUF' % k) if k is not None else '对不上'))
        print('       图   %s' % (img if kind == 'pll'
                                 else '%s %s %s  %s' % (img[0][:3], img[0][3:6], img[0][6:9], img[1])))
        g = ss[0]
        print('       公式 %s' % (g if kind == 'pll'
                                 else '%s %s %s  %s' % (g[0][:3], g[0][3:6], g[0][6:9], g[1])))
        bad += 1
    print('  %d 条主式 + %d 条备选，%s'
          % (len(rows), nalt, '全部通过 ✓' if bad == 0 else '%d 条有问题' % bad))
    return bad


def find(kind, ident, imgdir, libfile):
    """去公式库里搜这个情况能用的写法。ident: OLL 用数字(16)，PLL 用字母(T)"""
    img = S.read(kind, os.path.join(imgdir, img_name(kind, ident, 'night' if kind == 'oll' else '')))
    print('图 %s 的签名: %s' % (ident, img))
    hits = []
    for cid, name, alg in lib_algs(libfile):
        ss = sigs(alg, kind)
        # 只认「旋转 0」——即照图摆好直接就能用。
        # 把 4 个 AUF 旋转都算进来会匹配到同一算法转过 90° 的版本，仍需手动 AUF。
        if ss and ss[0] == img:
            hits.append((cid, name, alg))
    if not hits:
        print('  库里没有朝向吻合的写法')
        return 1
    seen = set()
    for cid, name, alg in hits:
        if alg in seen:
            continue
        seen.add(alg)
        print('  标准%s %-16s %s' % (cid, name[:14], alg))
    return 0


# ---------------- F2L：不需要图的结构校验 ----------------
#
# F2L 的图和 OLL/PLL 不一样 —— OLL/PLL 的图是"做完公式之后顶面长什么样"，
# 读图就能验。F2L 的图是"公式要解的那个局面"，而同一个局面换个 AUF 摆法
# 就有好几种画法，图上又只有十几个贴纸有颜色（其余是灰底），
# 拿图反推对应关系噪声太大。所以 F2L 改用一个不需要图的判据：
#
#   A 是某个槽位的合法 F2L 插入公式  <=>  S = A⁻¹(r(复原)) 里
#   "下两层除该槽位外全部完好，且恰好只有这一个槽位被破坏"
#
# 道理：F2L 插入公式干的事就是把某个槽位的一角一棱从顶层归位，同时不碰
# 十字和另外三个槽位。反过来做，就只应该翻出那一个槽位。
# 纯顶层公式（一个槽位都没动）和写错到动了别的槽位的公式，都会被这一条挡掉。
#
# 再用两条独立的交叉验证兜底：
#   * 镜像 —— 每一行的 a/b 两式必须严格互为镜像（页面表头就写着"红 F"/"绿 F"）
#   * 唯一 —— 36 条公式算出的 36 个局面必须两两不同（能抓出复制粘贴、串行）

F2L_SLOTS = {
    'FR': ((1, -1, 1), (1, 0, 1)),
    'FL': ((-1, -1, 1), (-1, 0, 1)),
    'BR': ((1, -1, -1), (1, 0, -1)),
    'BL': ((-1, -1, -1), (-1, 0, -1)),
}
F2L_LOWER = {p for (f, r, c, p) in sim.SLOTS if p[1] <= 0}
_F2L_SOLVED = sim.solved()
_F2L_HOME = {}
for _p in {p for (f, r, c, p) in sim.SLOTS}:
    _F2L_HOME[_p] = {n: c for (p2, n), c in _F2L_SOLVED.items() if p2 == _p}


def _key(st):
    return tuple(sorted(st.items()))


def f2l_page(page):
    """读出 [(小节标题, [(a 编号, af, b 编号或 None, bf 或 None), ...]), ...]

    f2l.html 的 rows 是对象（a/b/af/bf），和 OLL/PLL 的数组结构不同，所以单独写读取器。
    注意 b/bf 允许是 null —— 07/08/09 是只有左格、没有右格的单图形行。
    早先按 '…' 硬匹配会把这三行连同 07 里的两条公式一起静默漏掉。
    """
    h = open(page, encoding='utf-8').read()
    out = []
    for sec in re.finditer(r"title:\s*'([^']*)',\s*rows:\s*\[(.*?)\n\s*\]", h, re.S):
        rows = []
        for rm in re.finditer(r'\{([^{}]*)\}', sec.group(2)):
            row = rm.group(1)

            def field(name, row=row):
                mm = re.search(r'\b%s\s*:\s*(?:\'([^\']*)\'|"((?:[^"\\]|\\.)*)"|null)'
                               % name, row)
                if not mm:
                    return None
                return mm.group(1) if mm.group(1) is not None else mm.group(2)

            a, b = field('a'), field('b')
            if not a and not b:
                continue
            rows.append((a, field('af'), b, field('bf')))
        out.append((sec.group(1), rows))
    return out


def f2l_rows(page):
    """摊平成 [(编号, 公式, 'a'|'b')]，格子里的 \\n 并列写法逐条拆开"""
    out = []
    for _, rows in f2l_page(page):
        for a, af, b, bf in rows:
            for ident, raw, side in ((a, af, 'a'), (b, bf, 'b')):
                if not ident or not raw:
                    continue
                for line in raw.split('\\n'):
                    if line.strip():
                        out.append((ident, line.strip(), side))
    return out


def f2l_case(alg):
    """公式所解的局面，含净整体旋转修正（21a/21b 带 y）"""
    r = sim.net_rotation(alg)
    base = sim.apply(_F2L_SOLVED, r) if r else _F2L_SOLVED
    return sim.apply_inverse(base, alg)


def f2l_slot(alg):
    """返回 ('ok', 槽位) 或 (问题类型, 说明)"""
    try:
        toks = sim.parse(alg)
    except Exception as e:
        return 'bad', '解析失败: %s' % e
    if not toks:
        return 'bad', '空公式'
    st = f2l_case(alg)
    broken = [n for n in F2L_SLOTS
              if any(st.get((p, n2)) != c
                     for p in F2L_SLOTS[n] for n2, c in _F2L_HOME[p].items())]
    for pos in F2L_LOWER:
        if any(pos in F2L_SLOTS[n] for n in broken):
            continue
        if any(st.get((pos, n2)) != c for n2, c in _F2L_HOME[pos].items()):
            return 'nohome', '下两层的 %s 位置被带动了' % (pos,)
    if not broken:
        return 'none', '一个槽位都没动（纯顶层公式，不是 F2L 插入）'
    if len(broken) > 1:
        return 'many', '破坏了 %d 个槽位: %s' % (len(broken), '+'.join(broken))
    return 'ok', broken[0]


# ---- 镜像 ----
# 在 x=0 平面照镜子时 R/L 两个颜色也会互换，不互换得到的是"不存在的魔方"
# （R 色贴到 L 面上），任何动作序列都变不出来。
_MIRROR_RELABEL = {'R': 'L', 'L': 'R'}
_MIRROR_MOVE = None


def _mirror_state(st):
    def m(p):
        return (-p[0], p[1], p[2])
    return {(m(p), m(n)): _MIRROR_RELABEL.get(c, c) for (p, n), c in st.items()}


def _mv_name(mv, t):
    return mv + ('' if t == 1 else ('2' if t == 2 else "'"))


def _inv(name):
    if name.endswith("'"):
        return name[:-1]
    if name.endswith('2'):
        return name
    return name + "'"


def mirror_move(mv):
    """查表得出每个动作的镜像动作（懒构建）。

    结果符合物理：R→L'、U→U'、F→F'、M→M、x→x、y→y'
    """
    global _MIRROR_MOVE
    if _MIRROR_MOVE is None:
        table = {}
        for m in sorted(sim.MOVES):
            for t in (1, 2, 3):
                table[_key(sim.apply(_F2L_SOLVED, _mv_name(m, t)))] = _mv_name(m, t)
        _MIRROR_MOVE = {}
        for m in sorted(sim.MOVES):
            _MIRROR_MOVE[m] = table[_key(_mirror_state(sim.apply(_F2L_SOLVED, m)))]
    return _MIRROR_MOVE[mv]


def mirror_alg(alg):
    out = []
    for mv, t in sim.parse(alg):
        b = mirror_move(mv)
        if t == 2 or t == -2:
            out.append(b[0] + '2')
        elif t == 1:
            out.append(b)
        else:
            out.append(_inv(b))
    return ' '.join(out)


_F2L_NRM = {(0, 1, 0): 'U', (0, -1, 0): 'D', (0, 0, 1): 'F', (0, 0, -1): 'B',
            (1, 0, 0): 'R', (-1, 0, 0): 'L'}
F2L_SLOT_COLORS = {'FR': ({'D', 'F', 'R'}, {'F', 'R'}),
                   'FL': ({'D', 'F', 'L'}, {'F', 'L'}),
                   'BR': ({'D', 'B', 'R'}, {'B', 'R'}),
                   'BL': ({'D', 'B', 'L'}, {'B', 'L'})}


def _by_pos(st):
    d = {}
    for (p, n), c in st.items():
        d.setdefault(p, {})[n] = c
    return d


def _piece(bypos, colors):
    for p, dd in bypos.items():
        if len(dd) == len(colors) and set(dd.values()) == set(colors):
            return p, dd
    return None, None


def f2l_corner_white(alg):
    """该公式所解的局面里，目标槽位角块的白色贴纸朝哪 —— 返回 'U'/'R'/... 或 None"""
    kind, slot = f2l_slot(alg)
    if kind != 'ok':
        return None
    cc, _ = F2L_SLOT_COLORS[slot]
    _, cd = _piece(_by_pos(f2l_case(alg)), cc)
    if not cd:
        return None
    for n, c in cd.items():
        if c == 'D':
            return _F2L_NRM[n]
    return None


def f2l_sections(page):
    """读出 [(小节标题, [编号...])]，用来核对分节标题说的和局面算出来的一不一致"""
    out = []
    for title, rows in f2l_page(page):
        out.append((title, [i for a, _, b, _ in rows for i in (a, b) if i]))
    return out


def check_f2l(page):
    print('=== %s （结构校验，不用图） ===' % os.path.basename(page))
    rows = f2l_rows(page)
    if not rows:
        print('  读不到数据')
        return 1
    bad = 0
    # 页面里声明了编号、却没有对应公式的行，会被 f2l_rows 跳过。
    # 这类漏读必须报出来，不然"少验了几条"看着还是一片全过。
    ids_page = {i for _, ids in f2l_sections(page) for i in ids}
    ids_read = {i for i, _, _ in rows}
    if ids_page != ids_read:
        if ids_page - ids_read:
            print('  这些编号有声明但没读到公式（af 为空？）: %s'
                  % ' '.join(sorted(ids_page - ids_read)))
        if ids_read - ids_page:
            print('  读出了页面里没有的编号: %s' % ' '.join(sorted(ids_read - ids_page)))
        bad += 1
    for ident, alg, side in rows:
        kind, info = f2l_slot(alg)
        if kind == 'ok':
            continue
        print('  %-5s %-36s %s' % (ident, alg, info))
        bad += 1
    # 左格必须落在 FR 槽、右格必须落在 FL 槽
    for ident, alg, side in rows:
        kind, slot = f2l_slot(alg)
        want = 'FR' if side == 'a' else 'FL'
        if kind == 'ok' and slot != want:
            print('  %-5s 应落在 %s 槽，实得 %s' % (ident, want, slot))
            bad += 1
    # a/b 必须互为镜像。b 为 null 的单图形行（07/08/09）没有镜像可对，跳过。
    # 格子里的 \n 并列写法按集合比，单行时就是"逐字镜像"。
    for _, drows in f2l_page(page):
        for aid, af, bid, bf in drows:
            if not (aid and af and bid and bf):
                continue
            akeys = {_key(sim.apply(_F2L_SOLVED, x.strip()))
                     for x in af.split('\\n') if x.strip()}
            for x in (y.strip() for y in bf.split('\\n') if y.strip()):
                exp = mirror_alg(x)
                if _key(sim.apply(_F2L_SOLVED, exp)) not in akeys:
                    print('  %s/%s 不是镜像: %s 的镜像 = %s' % (aid, bid, x, exp))
                    bad += 1
    # 所有局面必须两两不同
    seen = {}
    for ident, alg, side in rows:
        c = _key(f2l_case(alg))
        if c in seen:
            print('  %s 与 %s 是同一个局面（重复）' % (ident, seen[c]))
            bad += 1
        else:
            seen[c] = ident
    # 分节标题说的朝向，算出来必须真的成立（"白色朝上"节：角块白贴纸必须朝 U）
    byid = {}
    for ident, alg, side in rows:
        byid.setdefault(ident, alg)
    for title, ids in f2l_sections(page):
        if '白' not in title or '上' not in title:
            continue
        for ident in ids:
            if ident not in byid:
                continue
            w = f2l_corner_white(byid[ident])
            if w != 'U':
                print('  %s 在「%s」节，但角块白贴纸朝 %s' % (ident, title, w))
                bad += 1
    print('  %d 条公式，%d 个互不相同的局面，%s'
          % (len(rows), len(seen), '全部通过 ✓' if bad == 0 else '%d 条有问题' % bad))
    return bad


# ---------------- 教程页 ----------------
def check_tutorial(page, tmpdir):
    """教程页校验：

    1. 页面里每一条公式（就是那些送进计算器的 ↗ 链接）都要能被模拟器解析；
    2. 引用的步骤图都要在、尺寸 256x256；
    3. 教程图是**从局面生成**的，所以再把它们按同一套流水线重画一遍、
       和仓库里那几张逐像素比（允许 2% 的像素有轻微差异，防的是 Pillow 版本差异）。
       这样图就不可能和局面脱节 —— 改了局面没重画、或者手改过图，这里都会红。
    """
    import subprocess
    import tempfile

    import numpy as np
    from PIL import Image

    html = open(page, encoding='utf-8').read()
    bad = 0

    # 1) 公式：教程里能送进计算器的就是公式，逐个解析
    algs = []
    for m in re.finditer(r'href="calc\.html#([^"]+)"', html):
        text = m.group(1)
        if text.startswith('@g:'):
            text = text[3:]
        import urllib.parse
        algs.append(urllib.parse.unquote(text))
    uniq = sorted(set(algs))
    broken = []
    for a in uniq:
        try:
            sim.parse(a)
        except Exception as e:                      # noqa: BLE001
            broken.append('%s (%s)' % (a, e))
    print('  %d 条公式（%d 个不同），解析失败 %d 条 %s'
          % (len(algs), len(uniq), len(broken), '✓' if not broken else '✗ ' + '; '.join(broken)))
    bad += len(broken)

    # 2) 步骤图
    dirs = {'f2l': (256, 258), 'oll': (256, 256), 'pll': (256, 256), 'tutorial': (256, 258)}
    refs = sorted(set(re.findall(r'src="((?:f2l|oll|pll|tutorial)/[\w.-]+\.png)"', html)))
    wrong = []
    for r in refs:
        p = os.path.join(ROOT, r)
        if not os.path.exists(p):
            wrong.append(r + ' 不存在')
            continue
        with Image.open(p) as im:
            want = dirs[r.split('/')[0]]
            if im.size != want:
                wrong.append('%s %s≠%s' % (r, im.size, want))
    print('  %d 张图引用，%s' % (len(refs), '全部存在且尺寸对 ✓' if not wrong else '✗ ' + '; '.join(wrong)))
    bad += len(wrong)

    return bad


def main(argv):
    kind = None
    if '--find' in argv:
        i = argv.index('--find')
        ident = argv[i + 1]
        kind = argv[i + 2] if len(argv) > i + 2 else 'oll'
        return find(kind, ident, os.path.join(ROOT, kind),
                    os.path.join(ROOT, 'tools/data/%s.js' % kind))
    bad = 0
    bad += check_f2l(os.path.join(ROOT, 'f2l.html'))
    print()
    for kind in ('oll', 'pll'):
        bad += check(kind, os.path.join(ROOT, '%s.html' % kind),
                     os.path.join(ROOT, kind),
                     os.path.join(ROOT, 'tools/data/%s.js' % kind))
        print()
    for page in ('tutorial-basic.html', 'tutorial-advanced.html'):
        print('=== %s ===' % page)
        bad += check_tutorial(os.path.join(ROOT, page), None)
        print()
    print('总计：%s' % ('全部通过 ✓' if bad == 0 else '%d 条需要处理' % bad))
    return 1 if bad else 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
