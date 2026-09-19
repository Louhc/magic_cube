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
    python3 tools/verify.py --find 04        # 去公式库里搜第 4 条能用的写法
"""
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import cubesim as sim
import signature as S

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


def page_data(page):
    """从页面里读出 [编号, 公式]（编号与公式是数据区前两项）"""
    h = open(page, encoding='utf-8').read()
    out = []
    for m in re.finditer(r'\[(\d+), "([^"]*)"', h):
        out.append((int(m.group(1)), m.group(2)))
    return out


def check(kind, page, imgdir, libfile):
    print('=== %s ===' % os.path.basename(page))
    rows = page_data(page)
    if not rows:
        print('  读不到数据')
        return 1
    bad = 0
    for n, alg in rows:
        img = S.read(kind, os.path.join(imgdir, '%s-%02d-512x512.png'
                                        % (kind, n)))
        if not alg:
            print('  %02d  留空（未填公式）' % n)
            bad += 1
            continue
        ss = sigs(alg, kind)
        if ss is None:
            print('  %02d  公式算不出合法局面 ← 公式有问题' % n)
            bad += 1
            continue
        if ss[0] == img:
            continue
        k = ss.index(img) if img in ss else None
        print('  %02d  %s' % (n, ('差 %d 步 AUF' % k) if k is not None else '对不上'))
        print('       图   %s' % (img if kind == 'pll'
                                 else '%s %s %s  %s' % (img[0][:3], img[0][3:6], img[0][6:9], img[1])))
        g = ss[0]
        print('       公式 %s' % (g if kind == 'pll'
                                 else '%s %s %s  %s' % (g[0][:3], g[0][3:6], g[0][6:9], g[1])))
        bad += 1
    print('  %d 条，%s' % (len(rows), '全部通过 ✓' if bad == 0 else '%d 条有问题' % bad))
    return bad


def find(kind, n, imgdir, libfile):
    """去公式库里搜第 n 条能用的写法"""
    img = S.read(kind, os.path.join(imgdir, '%s-%02d-512x512.png' % (kind, n)))
    print('图 %02d 的签名: %s' % (n, img))
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
        n = int(argv[i + 1])
        kind = argv[i + 2] if len(argv) > i + 2 else 'oll'
        return find(kind, n, os.path.join(ROOT, kind),
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
