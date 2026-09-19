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


def img_name(kind, ident):
    """编号 -> 图文件名。OLL 是 1..57（补零），PLL 是 Aa..Z"""
    f = ident if not ident.isdigit() else ident.zfill(2)
    return '%s-%s-512x512.png' % (kind, f)


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
        img = S.read(kind, os.path.join(imgdir, img_name(kind, n)))
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
    img = S.read(kind, os.path.join(imgdir, img_name(kind, ident)))
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


def main(argv):
    kind = None
    if '--find' in argv:
        i = argv.index('--find')
        ident = argv[i + 1]
        kind = argv[i + 2] if len(argv) > i + 2 else 'oll'
        return find(kind, ident, os.path.join(ROOT, kind),
                    os.path.join(ROOT, 'tools/data/%s.js' % kind))
    bad = 0
    for kind in ('oll', 'pll'):
        bad += check(kind, os.path.join(ROOT, '%s.html' % kind),
                     os.path.join(ROOT, kind),
                     os.path.join(ROOT, 'tools/data/%s.js' % kind))
        print()
    print('总计：%s' % ('全部通过 ✓' if bad == 0 else '%d 条需要处理' % bad))
    return 1 if bad else 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
