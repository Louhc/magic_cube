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

# 跳计算器的链接会在公式前面带一个标记（计算器据此决定怎么摆）：
#   @g: F2L 的 b 版（绿面朝前）  @s: 计时器过来的打乱  @2: 二阶公式（切到二阶模式）
# 校验公式本身时先把标记摘掉。
_PREFIX = re.compile(r'^@[a-z0-9]+:')


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
    import urllib.parse
    for m in re.finditer(r'href="calc\.html#([^"]+)"', html):
        algs.append(_PREFIX.sub('', urllib.parse.unquote(m.group(1))))
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
    # tutorial/ 里两种都有：编辑器导出的立体图 256x258、顶层俯视图 256x256
    dirs = {'f2l': (256, 258), 'oll': (256, 256), 'pll': (256, 256),
            'tutorial': (256, 258), 'tutorial-top': (256, 256)}
    refs = sorted(set(re.findall(r'src="((?:f2l|oll|pll|tutorial)/[\w.-]+\.png)"', html)))
    wrong = []
    for r in refs:
        p = os.path.join(ROOT, r)
        if not os.path.exists(p):
            wrong.append(r + ' 不存在')
            continue
        with Image.open(p) as im:
            want = dirs[r.split('/')[0]]
            if (im.size != want and not (r.startswith('tutorial/') and im.size == (256, 256))):
                wrong.append('%s %s≠%s' % (r, im.size, want))
    print('  %d 张图引用，%s' % (len(refs), '全部存在且尺寸对 ✓' if not wrong else '✗ ' + '; '.join(wrong)))
    bad += len(wrong)

    # 2b) data-shape / data-oll 的图，src 是脚本按主题现拼的，上面那轮静态 src 看不到 ——
    #     按命名规律把昼夜两版都查一遍，少了哪一版都会红（换主题时才发现的坑最烦）。
    kinds = sorted(set(re.findall(r'data-shape="([\w-]+)"', html)))
    nol = sorted(set(re.findall(r'data-oll="(\d+)"', html)))
    dyn, dynbad = [], []
    for k in kinds:
        for tone in ('day', 'night'):
            dyn.append('tutorial/shape-%s-%s-256x256.png' % (k, tone))
    for n in nol:
        for tone in ('day', 'night'):
            dyn.append('oll/oll-%s-%s-256x256.png' % (n, tone))
    for r in dyn:
        p = os.path.join(ROOT, r)
        if not os.path.exists(p):
            dynbad.append(r + ' 不存在')
        else:
            with Image.open(p) as im:
                if im.size != (256, 256):
                    dynbad.append('%s %s≠(256, 256)' % (r, im.size))
    if kinds or nol:
        print('  按主题现拼的图：%d 种形状图 + %d 个 OLL 编号 × 昼夜两版，%s'
              % (len(kinds), len(nol),
                 '都在且尺寸对 ✓' if not dynbad else '✗ ' + '; '.join(dynbad)))
    # 初级教程那四张形状图就是这四种，少一种（或者名字写错）都得报出来
    if page.endswith('tutorial-basic.html') and kinds != ['corner', 'cross', 'dot', 'line']:
        dynbad.append('第 4 步的形状图不是 dot/line/corner/cross 四种：%s' % ', '.join(kinds))
    bad += len(dynbad)

    # 3) 「图 + 公式」是不是同一个局面 —— 只查第七步那张「用两次小鱼公式」的表。
    #    这类错最隐蔽：公式没错、图也没错，就是放错了行；而且整页里图最容易被悄悄换掉。
    #    判据：把公式的局面（逆运算作用在复原魔方上）转四个 AUF，看有没有一个和图上的
    #    12 条侧面色带完全一致。图上那两张是带箭头的顶层俯视图，配色和 PLL 图一样。
    m7 = re.search(r'<th>用两次小鱼公式</th>([\s\S]*?)</table>', html)
    pairs = []
    if m7:
        pairs = re.findall(r'src="((?:f2l|oll|pll|tutorial)/[\w.-]+\.png)"[\s\S]*?'
                           r'<span class="no">([^<]*)</span>[\s\S]*?<code>([^<]+)</code>', m7.group(1))
    mism = []
    # 初级教程这张表必须还在（图或公式被删掉就该报错，而不是「0 组，通过」）
    if page.endswith('tutorial-basic.html') and len(pairs) != 2:
        mism.append('没有找到「两次小鱼」表的 2 组图与公式（找到 %d 组）' % len(pairs))
    for img, no, alg in pairs:
        st = sim.case_of(alg, 'pll')
        if st is None:
            mism.append('%s：公式局面不是合法 PLL' % alg)
            continue
        rots, cur = [], st
        for _ in range(4):
            rots.append(sim.pll_sig(cur))
            cur = sim.turn(cur, 'U', 1)
        sig = S.read_pll(os.path.join(ROOT, img))
        if sig not in rots:
            mism.append('%s 图上是 %s，公式解的是 %s' % (no or img, sig, ' / '.join(rots)))
    if pairs or page.endswith('tutorial-basic.html'):
        print('  第七步「两次小鱼」表：%d 组图与公式%s'
              % (len(pairs), '对得上 ✓' if not mism else '✗ ' + '; '.join(mism)))
    bad += len(mism)

    return bad


# ---------- 二阶 OLL：读图 ----------
# 图是 2×2 的俯视图：四个菱形小格拼成一个大菱形（前面在下边）。每格里「有彩色的
# 那一块」就是那个角的 U 贴纸 —— 白天是紫 #7E6FC7、夜晚是黄 #FFE600：
#   · 整块填满  = 这个角已经朝上（u）
#   · 靠某一边的一小条 = U 贴纸贴在那一侧的面：上 b / 下 f / 左 l / 右 r
# 判据只看「有没有彩色」（通道极差），所以昼夜两版读出来一样；
# 四格的顺序是 左上 / 右上 / 左下 / 右下。
_OLL2_TILE = [(0, 0), (1, 0), (0, 1), (1, 1)]
_OLL2_DIR = {0: 'u', 1: '?', 2: '?', 3: 'f', 4: 'l', 5: 'r'}
# 每个角「允许」的朝向：朝上，或者它自己那两张侧面（用来核对图/模型的读法没错位）
_OLL2_ALLOW = [('u', 'b', 'l'), ('u', 'b', 'r'), ('u', 'f', 'l'), ('u', 'f', 'r')]


def _oll2_img_sig(path):
    from PIL import Image

    im = Image.open(path).convert('RGBA')
    w, h = im.size
    px = im.load()

    def opaque(x, y):
        return px[x, y][3] > 60

    def colorful(x, y):
        r, g, b, a = px[x, y]
        return a > 60 and max(r, g, b) - min(r, g, b) > 60

    xs = [x for x in range(w) if any(opaque(x, y) for y in range(0, h, 2))]
    ys = [y for y in range(h) if any(opaque(x, y) for x in range(0, w, 2))]
    if not xs or not ys:
        return None
    x0, x1, y0, y1 = xs[0], xs[-1], ys[0], ys[-1]
    mx, my = (x0 + x1) / 2.0, (y0 + y1) / 2.0
    boxes = [(x0, y0, mx, my), (mx, y0, x1, my), (x0, my, mx, y1), (mx, my, x1, y1)]
    out = []
    for (bx0, by0, bx1, by1) in boxes:
        n = sx = sy = 0
        for y in range(int(by0), int(by1) + 1):
            for x in range(int(bx0), int(bx1) + 1):
                if colorful(x, y):
                    n += 1
                    sx += x
                    sy += y
        if not n:
            return None
        cx = (sx / n - bx0) / max(1.0, bx1 - bx0)
        cy = (sy / n - by0) / max(1.0, by1 - by0)
        if n > 3000:                       # 整块填满 = 朝上
            out.append('u')
        elif cy < 0.25:
            out.append('b')
        elif cy > 0.75:
            out.append('f')
        elif cx < 0.25:
            out.append('l')
        elif cx > 0.75:
            out.append('r')
        else:
            out.append('?')
    return out


def _oll2_model_sig(alg):
    """把公式「倒着做一遍」得到它要解的局面，再读四个角各自的 U 贴纸朝哪边。

    朝向用的就是模型里的法向：朝上 u / 指后 b（俯视图的上边）/ 指前 f / 指左 l / 指右 r。
    四格的顺序和读图那边一致（左上 = 左后那个角，前面画在下边）。
    """
    st = sim.apply_inverse(sim.solved(), alg)
    out = []
    for (x, z) in _OLL2_MODEL_TILE:
        p = (x, 1, z)
        face = None
        for f in 'UDFBRL':
            if st.get((p, sim.FACES[f])) == 'U':
                face = f
                break
        if face is None:
            return None
        out.append({'U': 'u', 'B': 'b', 'F': 'f', 'L': 'l', 'R': 'r'}[face])
    return out


# 俯视图里前面画在下边：左后 / 右后 / 左前 / 右前
_OLL2_MODEL_TILE = [(-1, -1), (1, -1), (-1, 1), (1, 1)]
# 视角顺时针转 90°：块跟着转，朝后的贴纸变成朝右
_OLL2_CW = {'u': 'u', 'b': 'r', 'r': 'f', 'f': 'l', 'l': 'b'}


def _oll2_rot(sig):
    return [_OLL2_CW[d] for d in [sig[2], sig[0], sig[3], sig[1]]]


def check_oll2(page):
    """二阶 OLL 页：7 条公式和 7 张图必须指的是同一个情况。

    判据和别的公式页一样，是**算出来**的：把公式倒着做一遍得到它要解的局面，
    读四个角的 U 贴纸朝哪边；图上也读同样四格。两边只允许差一个 AUF（整体转
    0/90/180/270 度）—— 差的要是别的，就说明「照图摆好做这条公式」是错的。
    """
    from PIL import Image

    html = open(page, encoding='utf-8').read()
    bad = 0

    # 1) 表里的「图 + 公式」（编号是图左上角的角标，不进表格文本）
    rows = re.findall(r'<img data-oll2="([\w-]+)"[\s\S]{0,400}?<code>([^<]+)</code>', html)
    ids = re.findall(r'<img data-oll2="([\w-]+)"', html)   # 打印规则里也有一份
    badges = re.findall(r'<span class="no">([^<]+)</span>', html)
    if len(rows) != 7 or len(ids) != 7 or len(badges) != 7:
        print('  ✗ 表里应有 7 行（图 + 公式 + 角标），实际 %d 行 / %d 张图 / %d 个角标'
              % (len(rows), len(ids), len(badges)))
        return bad + 1
    print('  表里 %d 行：%s' % (len(rows), ' '.join(c for c, _ in rows)))
    print('  编号角标：%s' % ' '.join(badges))

    # 2) 每个情况：昼夜两版图都在、尺寸 256x256，而且图上的朝向和公式算出来的一致
    want_oriented = {'h': 0, 'pi': 0, 'antisune': 1, 'sune': 1, 'l': 2, 't': 2, 'u': 2}
    sigs = {}
    for cid, alg in rows:
        day = os.path.join(ROOT, '2x2oll', '%s_day-256x256.png' % cid)
        night = os.path.join(ROOT, '2x2oll', '%s_night-256x256.png' % cid)
        miss = [os.path.basename(x) for x in (day, night) if not os.path.exists(x)]
        if miss:
            print('  ✗ %-9s 缺图：%s' % (cid, '、'.join(miss)))
            bad += 1
            continue
        with Image.open(day) as im:
            if im.size != (256, 256):
                print('  ✗ %-9s 白天那版不是 256x256（%s）' % (cid, im.size))
                bad += 1
                continue
        try:
            sim.parse(alg)
        except Exception as e:                     # noqa: BLE001
            print('  ✗ %-9s 公式解析失败：%s' % (cid, e))
            bad += 1
            continue

        got_img = _oll2_img_sig(day)
        got_mod = _oll2_model_sig(alg)
        if got_img is None or got_mod is None:
            print('  ✗ %-9s 图或局面读不出来（图 %s / 模型 %s）' % (cid, got_img, got_mod))
            bad += 1
            continue
        sigs[cid] = got_mod

        # 每个角只能是「朝上」或者它自己那两张侧面 —— 读错位置的话这条会先炸
        wrong_faces = [i for i in range(4)
                       if got_img[i] not in _OLL2_ALLOW[i] or got_mod[i] not in _OLL2_ALLOW[i]]
        # 图上和算出来的，只允许差一个整体转（AUF）
        rots = [got_mod]
        for _ in range(3):
            rots.append(_oll2_rot(rots[-1]))
        auf = rots.index(got_img) if got_img in rots else -1
        n_up = got_mod.count('u')
        okrow = (not wrong_faces) and auf >= 0 and n_up == want_oriented.get(cid, n_up)
        print('  %-9s %-28s 公式 %s  图 %s  AUF %s  %s' %
              (cid, alg, ''.join(got_mod), ''.join(got_img),
               ('%d×90°' % auf) if auf >= 0 else '对不上',
               '✓' if okrow else '✗' +
               ('，贴纸落在了不该在的面上：%s' % wrong_faces if wrong_faces else '') +
               ('，朝上的角应有 %d 个' % want_oriented[cid] if n_up != want_oriented.get(cid) else '')))
        if not okrow:
            bad += 1

    # 3) 7 个情况两两不同（差一个 AUF 也算同一个）—— 同一个情况抄了两遍会在这儿露出来
    canon = {}
    for cid, sig in sigs.items():
        rots = [sig]
        for _ in range(3):
            rots.append(_oll2_rot(rots[-1]))
        canon[cid] = min(''.join(r) for r in rots)
    dup = len(set(canon.values())) != len(canon)
    print('  7 个情况的朝向（按 AUF 归一）：%s %s'
          % (' '.join('%s=%s' % (k, v) for k, v in sorted(canon.items())),
             '✗ 有重复' if dup else '✓'))
    if dup:
        bad += 1

    # 4) 图：7 种 × 昼夜两版都在（白天那版上面逐张核过，这里只数夜晚那版）
    missing_night = [cid for cid, _ in rows
                     if not os.path.exists(os.path.join(ROOT, '2x2oll', '%s_night-256x256.png' % cid))]
    print('  图：7 种 × 昼夜两版 %s' % ('都在 ✓' if not missing_night else '✗ ' + '、'.join(missing_night)))
    bad += len(missing_night)
    return bad


def check_pbl2(page):
    """二阶 PBL 页：公式能解析 + 每条公式的「换法」和它标的名称对得上 + 昼夜两版图都在。

    图上画的是箭头，读图反推换法要另写一套识别（还得容忍画法），所以换个判据：
    **把公式作用在复原的魔方上，直接读上下两层角块的置换**。
    三阶和二阶的角块行为完全一样，所以拿三阶模拟器算就行（这几条公式里没有 M/S/E）。

    情况那格是短编号：a = 换相邻两个角（Adj）、d = 换对角两个角（Diag）；
    两个字母是「上层 / 下层」，只写一个（a / d）表示另一层已经排好。
    图上怎么摆是画的时候定的（可能差一个 AUF），
    所以只核对**两层的换法组合**和**角块有没有被翻**，不核对谁上谁下。
    """
    import urllib.parse

    html = open(page, encoding='utf-8').read()
    bad = 0

    # 1) 公式：页面里送进计算器的那些链接（都该带 @2: —— 二阶公式要在二阶模式里播）
    links = [urllib.parse.unquote(m.group(1))
             for m in re.finditer(r'href="calc\.html#([^"]+)"', html)]
    noflag = [x for x in links if not x.startswith('@2:')]
    print('  跳计算器的链接：%d 条，带 @2: 的 %d 条 %s'
          % (len(links), len(links) - len(noflag), '✓' if not noflag else '✗ ' + '; '.join(noflag)))
    bad += len(noflag)
    algs = [_PREFIX.sub('', x) for x in links]
    broken = []
    for a in sorted(set(algs)):
        try:
            sim.parse(a)
        except Exception as e:                       # noqa: BLE001
            broken.append('%s (%s)' % (a, e))
    print('  %d 条公式（%d 个不同），解析失败 %d 条 %s'
          % (len(algs), len(set(algs)), len(broken), '✓' if not broken else '✗ ' + '; '.join(broken)))
    bad += len(broken)

    # 2) 图：data-pbl2 的图是脚本按主题拼的，昼夜两版都要在（大小 256x197）
    ids = sorted(set(re.findall(r'data-pbl2="([\w-]+)"', html)))
    missing = []
    for i in ids:
        for tone in ('day', 'night'):
            r = '2x2pbl/%s_%s-256x197.png' % (i, tone)
            if not os.path.exists(os.path.join(ROOT, r)):
                missing.append(r + ' 不存在')
    print('  图：%d 种 × 昼夜两版 %s' % (len(ids), '都在 ✓' if not missing else '✗ ' + '; '.join(missing)))
    bad += len(missing)

    # 3) 语义：公式的换法要和名称对得上
    # 编号是图左上角的角标（dd / ad / aa / a / d），所以按「图 + 公式」解析，
    # 角标那一份也数一遍：两者必须一一对应，别漏画或画错
    rows = re.findall(r'<img data-pbl2="([\w-]+)"[\s\S]{0,400}?<code>([^<]+)</code>', html)
    badges = re.findall(r'<span class="no">([^<]+)</span>', html)
    if len(rows) != 5 or badges != [c for c, _ in rows]:
        print('  ✗ 表里应有 5 行（图 + 公式 + 角标），实际 %d 行，角标 %s'
              % (len(rows), ' '.join(badges) or '（没有）'))
        return bad + 1
    print('  编号角标：%s' % ' '.join(badges))

    solved = sim.solved()
    faces = [sim.FACES[f] for f in 'UDFBRL']

    def stickers(st, p):
        return ''.join(sorted(st[(p, n)] for n in faces if (p, n) in st))

    # 复原态里每个角位上的三张贴纸 -> 「这块是谁」
    home = {}
    for y in (1, -1):
        for x in (1, -1):
            for z in (1, -1):
                home[stickers(solved, (x, y, z))] = (x, y, z)

    # 情况那一格写的是短编号：a = 相邻两个角换、d = 对角两个角换。
    # 两个字母就是「上层 / 下层」，只写一个 = 另一层已经排好了。
    LETTER = {'a': 'adjacent', 'd': 'diagonal'}
    checks = 0
    for name, alg in rows:
        label = name.strip().lower()
        expect = [LETTER[c] for c in label if c in LETTER]
        if not expect or len(expect) > 2 or len(label) != len(expect):
            print('  ✗ 情况那格认不出来：%r（只认 a / d，最多两个字母）' % name)
            bad += 1
            continue
        if len(expect) == 1:                     # 只写一个 = 有一面已经排好
            expect.append('solved')
        expect = sorted(expect)
        st = sim.apply(sim.solved(), alg)
        got, twisted = {}, []
        for y in (1, -1):
            key = 'U' if y == 1 else 'D'
            ref = [(x, y, z) for x in (1, -1) for z in (1, -1)]
            perm = []
            for p in ref:
                perm.append(ref.index(home[stickers(st, p)]))
                # 角块朝向：顶层那块的 U 贴纸必须朝上、底层朝下（AUF 不影响这条）
                want = sim.FACES['U'] if y == 1 else sim.FACES['D']
                if st.get((p, want)) != ('U' if y == 1 else 'D'):
                    twisted.append('%s%s' % (key, p))
            moved = [i for i in range(4) if perm[i] != i]
            if not moved:
                got[key] = 'solved'
            elif len(moved) == 2:
                a, b = moved
                shared = sum(1 for i in (0, 2) if ref[a][i] == ref[b][i])
                got[key] = 'adjacent' if shared == 1 else 'diagonal'
            else:
                got[key] = '%d 个角动了' % len(moved)

        pair = sorted(got.values())
        okrow = pair == expect and not twisted
        print('  %-12s %-36s 上层 %-9s 下层 %-9s %s'
              % (label, alg, got['U'], got['D'],
                 '✓' if okrow else '✗ 期望 ' + ' + '.join(expect) +
                 ('' if not twisted else '，角块被翻了：' + ', '.join(twisted))))
        if not okrow:
            bad += 1
        checks += 1
    print('  %d 条公式：换法、角块朝向和名称%s' % (checks, '都对得上 ✓' if bad == 0 else '有对不上的 ✗'))
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
    print('=== pbl2.html（二阶 PBL） ===')
    bad += check_pbl2(os.path.join(ROOT, 'pbl2.html'))
    print()
    bad += check_oll2(os.path.join(ROOT, 'oll2.html'))
    print()
    print('总计：%s' % ('全部通过 ✓' if bad == 0 else '%d 条需要处理' % bad))
    return 1 if bad else 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
