/* 四阶模拟器（cubesim4.js）+ 计算器的四阶模式。
 *
 * 四阶那份模型是照着 cubesim.js 另写的（三阶那份被一大堆测试盯着，不敢动），
 * 所以这里最要紧的是**和 3×3 对拍**：只动外层 / 宽转 / 整体转的公式，
 * 八个角块的结果必须和三阶一模一样（角块的行为与棱、中心无关）。
 * 另外把计算器里那张动画表（M4）拿出来，逐个动作核对「哪些位置在这一层」
 * 和模型完全一致 —— 状态由模型算、动画由页面那张表转，两边差一层就会「跳一下」。
 */
const fs = require('fs');
const path = require('path');
const S4 = require(path.join(__dirname, '..', 'cubesim4.js'));
const S3 = require(path.join(__dirname, '..', 'cubesim.js'));

let pass = 0, fail = 0;
const ok = (n, c, x) => { c ? pass++ : fail++; console.log((c ? '  \u2713 ' : '  \u2717 ') + n + (c ? '' : '  -> ' + x)); };

const MAX = 1.5;                       // 四阶最外面那一层的坐标
const NALL = ['1,0,0', '-1,0,0', '0,1,0', '0,-1,0', '0,0,1', '0,0,-1'];
const ALLPOS = [];
for (const x of S4.COORD) for (const y of S4.COORD) for (const z of S4.COORD) ALLPOS.push([x, y, z]);
const ROTS = {
  U: p => [-p[2], p[1], p[0]], D: p => [p[2], p[1], -p[0]],
  F: p => [p[1], -p[0], p[2]], B: p => [-p[1], p[0], p[2]],
  R: p => [p[0], p[2], -p[1]], L: p => [p[0], -p[2], p[1]]
};
const BASE4 = { U: 'U', D: 'D', R: 'R', L: 'L', F: 'F', B: 'B',
                u: 'U', d: 'D', r: 'R', l: 'L', f: 'F', b: 'B',
                x: 'R', y: 'U', z: 'F' };
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
// 位置上的贴纸（键 + 标签）拼成一个签名：用来判断「这一步动了哪些位置」
const sig = (st, pos) => {
  const p = pos.join(',');
  return Object.keys(st).filter(k => k.split('|')[0] === p).sort().map(k => k + '=' + st[k]).join(';');
};
/* 判断「这一步动了哪些位置」时不能拿颜色当标签：复原态里同一个面的中心四块
   颜色一样，它们在面内转一圈，按颜色看「什么都没变」。所以另做一份**每张贴纸
   一个独一无二标签**的复原态，转完谁的标签变了就是谁动了。 */
const UNIQ = (function () {
  var sol = S4.solved(), out = {}, n = 0;
  Object.keys(sol).sort().forEach(function (k) { out[k] = 'u' + (n++); });
  return out;
})();
const moved = mv => {
  const b = S4.turn(S4.clone(UNIQ), mv, 1);
  return ALLPOS.filter(p => sig(UNIQ, p) !== sig(b, p)).map(p => p.join(',')).sort();
};
// 八个角块的贴纸：四阶坐标是 ±1.5，三阶是 ±1
const corners4 = st => {
  const out = {};
  Object.keys(st).forEach(k => {
    const p = k.split('|')[0].split(',').map(Number);
    if (p.every(v => Math.abs(v) === MAX)) out[k] = st[k];
  });
  return out;
};
const corners3 = st => {
  const out = {};
  Object.keys(st).forEach(k => {
    const p = k.split('|')[0].split(',').map(Number);
    if (p.every(v => v !== 0)) out[k] = st[k];
  });
  return out;
};
// 四阶的角块坐标换成三阶的（±1.5 -> ±1），才能逐张贴纸比
const to3 = st => {
  const out = {};
  Object.keys(corners4(st)).forEach(k => {
    const [p, n] = k.split('|');
    out[p.split(',').map(v => Number(v) / MAX).join(',') + '|' + n] = st[k];
  });
  return out;
};

console.log('[1] 四阶模型的基本形状');
{
  const sol = S4.solved();
  const positions = new Set(Object.keys(sol).map(k => k.split('|')[0]));
  ok('96 张贴纸（6 面 × 16）', Object.keys(sol).length === 96, String(Object.keys(sol).length));
  const fl = S4.facelets(sol);
  ok('每面 16 格、行优先', ['U', 'R', 'F', 'D', 'L', 'B'].every(f => fl[f].length === 16) &&
    fl.U.every(c => c === 'U') && fl.F.every(c => c === 'F'), Object.keys(fl).join(','));
  // 64 个小方块里有 8 个是「里面」的（三个坐标都是 ±0.5），它们一张贴纸都不该有
  ok('56 个带贴纸的位置（64 减去里面那 8 个）', positions.size === 56, String(positions.size));
  const inner = ALLPOS.filter(p => p.every(v => Math.abs(v) !== MAX)).map(p => p.join(','));
  ok('里面那 8 块一张贴纸都没有', inner.length === 8 && inner.every(p => !positions.has(p)),
    inner.join(' '));
  // 贴纸必须长在朝外的那个面上：法向和「这个位置朝外的方向」一致
  const bad = Object.keys(sol).filter(k => {
    const [p, n] = k.split('|');
    const pv = p.split(',').map(Number), nv = n.split(',').map(Number);
    return ![0, 1, 2].every(i => nv[i] === 0 || Math.sign(pv[i]) === nv[i]);
  });
  ok('每张贴纸都朝着外面（法向和位置的外侧对上）', bad.length === 0, bad.slice(0, 3).join(' '));
  ok('每个位置上的贴纸数正好是「朝外的面数」（角 3 / 棱 2 / 心 1）',
    ALLPOS.every(p => {
      const n = sig(sol, p) ? sig(sol, p).split(';').length : 0;
      return n === p.filter(v => Math.abs(v) === MAX).length;
    }));
}

console.log('\n[2] 动作：转四次回原位、转一遍再反着转也回原位');
{
  const sol = S4.solved();
  const moves = ['R', 'U', 'F', 'L', 'D', 'B', 'r', 'u', 'f', 'l', 'd', 'b',
                 '2R', '3R', '2L', '3L', '2U', '3U', '2D', '3D', '2F', '3F', '2B', '3B',
                 'x', 'y', 'z'];
  const four = moves.filter(m => {
    let st = sol;
    for (let i = 0; i < 4; i++) st = S4.turn(st, m, 1);
    return !eq(st, sol);
  });
  ok('27 个动作转四次都回到原位', four.length === 0, four.join(' '));
  const twice = moves.filter(m => {
    const one = S4.turn(S4.turn(S4.clone(sol), m, 1), m, 1);
    return !eq(S4.turn(S4.clone(sol), m, 2), one);
  });
  ok('再转两下等于转两下（times 的算法对得上）', twice.length === 0, twice.join(' '));
  const undone = moves.filter(m => {
    const a = S4.turn(S4.clone(sol), m, 1);
    return !eq(S4.turn(S4.clone(a), m, -1), sol);
  });
  ok('转一下再反着转回去就复原', undone.length === 0, undone.join(' '));
  ok('Rw 和 r 是一回事（宽转的两种写法）',
    eq(S4.apply(S4.solved(), 'Rw U2 Rw2'), S4.apply(S4.solved(), 'r U2 r2')));
  ok('宽转 = 外层 + 里面那层（Rw = R + 2R）',
    eq(S4.apply(S4.solved(), 'Rw'), S4.apply(S4.apply(S4.solved(), 'R'), '2R')));
  ok('2R 和 3L 指的是同一层（从右边数第二层 = 从左边数第三层）', eq(moved('2R'), moved('3L')));
  ok('一个面转完，这一面 16 张贴纸还是这 16 个位置（只是换了排列）',
    eq(moved('R'), ALLPOS.filter(p => p[0] === MAX).map(p => p.join(',')).sort()),
    moved('R').join(' '));
}

console.log('\n[3] 认得的写法 / 不认的写法');
{
  const good = ['R', "R'", 'R2', 'R2\'', 'Rw', "Rw'", 'Rw2', 'r', 'r2', "2R'", '2R2',
                '3L', 'Uw', 'x', "y'", 'z2', "(R U R' U')"];
  const bad = [];
  good.forEach(a => { try { S4.steps(a); } catch (e) { bad.push(a + '(' + e.message + ')'); } });
  ok('这些写法都认得（含 Rw / r / 2R / 3L / 整体转）', bad.length === 0, bad.join(' '));
  const should = ['M', 'E', 'S', "M'", '4R', '2Rw', '5U', '1R'];
  const missed = should.filter(a => {
    try { S4.steps(a); return false; } catch (e) { return true; }
  });
  ok('三阶的 M/E/S 和没有的层（4R / 2Rw）都会报错', missed.length === should.length,
    should.filter(a => missed.indexOf(a) < 0).join(' '));
  ok('公式解析出的步数对得上（Rw2 U2 2R Uw\' = 4 步）',
    S4.steps("Rw2 U2 2R Uw'").length === 4, String(S4.steps("Rw2 U2 2R Uw'").length));
}

console.log('\n[4] 和 3×3 对拍：角块必须一模一样');
{
  // 角块只和「外层 / 宽转 / 整体转」有关，和几阶没关系 ——
  // 这是这份四阶模型最硬的一条对照：三阶那份是逐张贴纸跟 Python 版对过的
  const ALGS = ['R U R\' U\'', "F R U R' U' F'", "Rw U2 Rw'", "r u2 l'",
                'x y z\'', 'R2 F2 D2 L B\'', "Uw Rw' Fw2 Dw'", 'y2 R U R\' F R F\'',
                "L' U' L U L F' L' F", "R U R' U R U2 R'"];
  const bad = [];
  ALGS.forEach(a => {
    const c4 = to3(S4.apply(S4.solved(), a)), c3 = corners3(S3.apply(S3.solved(), a));
    if (!eq(Object.keys(c4).sort(), Object.keys(c3).sort())) {
      bad.push(a + '(键不一样)');
      return;
    }
    Object.keys(c4).forEach(k => { if (c4[k] !== c3[k]) bad.push(a + ' ' + k); });
  });
  ok(ALGS.length + ' 条只动外层 / 宽转 / 整体转的公式，八个角块和三阶逐张贴纸一致',
    bad.length === 0, [...new Set(bad)].slice(0, 3).join(' | '));
  // 里面那两层不碰角块
  const inner = ['2R', '3L', '2U', "3F'", '2D2'];
  const bad2 = inner.filter(m => {
    const c = corners4(S4.apply(S4.solved(), m));
    return !eq(c, corners4(S4.solved()));
  });
  ok('里面那两层（2R / 3L / 2U…）一张角块贴纸都不动', bad2.length === 0, bad2.join(' '));
  ok('整体转 x 就是「所有块都跟着转」：八个角块换了一轮',
    !eq(corners4(S4.apply(S4.solved(), 'x')), corners4(S4.solved())));
}

console.log('\n[5] 打乱 / 反演：颜色分布不变量');
{
  const SOL = S4.solved();
  const count = st => {
    const c = {};
    Object.keys(st).forEach(k => { c[st[k]] = (c[st[k]] || 0) + 1; });
    return c;
  };
  ok('复原态每种颜色各 16 张', eq(count(SOL), { U: 16, R: 16, F: 16, D: 16, L: 16, B: 16 }),
    JSON.stringify(count(SOL)));
  // 四阶那套打乱写法（外层 + 宽转，和计算器的「打乱」键一样）
  const faces = ['U', 'D', 'R', 'L', 'F', 'B'], suff = ['', "'", '2'];
  let seed = 12345;
  const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  const scr = [];
  for (let i = 0; i < 40; i++) {
    const f = faces[Math.floor(rnd() * 6)];
    scr.push(f + (rnd() < 0.5 ? 'w' : '') + suff[Math.floor(rnd() * 3)]);
  }
  const alg = scr.join(' ');
  let st = SOL;
  scr.forEach(s => { st = S4.turn(st, S4.steps(s)[0].mv, S4.steps(s)[0].times); });
  ok('40 步打乱（一半带宽转）后颜色分布还是每种 16 张', eq(count(st), count(SOL)),
    JSON.stringify(count(st)));
  ok('打乱之后确实乱了（不是碰巧复原）', !eq(st, SOL) && !eq(S4.facelets(st), S4.facelets(SOL)));
  // 反演：把每一步倒过来、取反，应当回到复原态
  const inv = S4.steps(alg).slice().reverse().map(x => ({ mv: x.mv, times: -x.times }));
  let back = st;
  inv.forEach(x => { back = S4.turn(back, x.mv, x.times); });
  ok('整条公式取逆执行能回到复原态', eq(back, SOL));
}

console.log('\n[6] 净旋转：四阶没有固定的中心块，只看「是不是整体转过的复原态」');
{
  const isRot = a => {
    const want = S4.apply(S4.solved(), a);
    return S4.ROTS.some(r => eq(S4.apply(S4.solved(), r), want));
  };
  ok('24 种整体旋转都认得出来（不含恒等的那条，它的净旋转就是空）',
    S4.ROTS.length === 24 && S4.ROTS.every(r => {
      const n = S4.netRotation(r);
      return r === '' ? n === '' : (n !== '' && isRot(n));
    }), String(S4.ROTS.length));
  ok('整体转 x 的净旋转就是「转了个 x」（角度一致）',
    eq(S4.apply(S4.solved(), S4.netRotation('x')), S4.apply(S4.solved(), 'x')));
  ok('只转外层的普通公式净旋转是空（不做朝向补偿）',
    S4.netRotation("Rw U2 Rw'") === '' && S4.netRotation("R U R' U'") === '');
}

console.log('\n[7] 计算器的四阶动画表（M4）必须和模型一层不差');
{
  const html = fs.readFileSync(path.join(__dirname, '..', 'calc.html'), 'utf8');
  const i = html.indexOf('var M4 = {');
  const body = i < 0 ? '' : html.slice(i, html.indexOf('\n  };', i));
  const M4 = {};
  for (const m of body.matchAll(/^\s{4}'?([\w]+)'?: \['([XYZ])',\s*(-?\d+), function \((\w*)\) \{ return (.+?); \}\]/gm)) {
    M4[m[1]] = { ax: m[2], deg: +m[3], cond: m[5] };
  }
  ok('从页面里解析出 27 个四阶动作', Object.keys(M4).length === 27, String(Object.keys(M4).length));
  // 层的判据：模型里「这一步动了哪些位置」必须和页面那张表选出来的完全一样。
  // 只比画面上看得见的那 56 个位置 —— 里面那 8 块没有贴纸，画面上也不存在
  //（宽转的 32 个位置里有 4 个就是这种），拿它们比会把两边都算岔。
  const PAINTED = ALLPOS.filter(p => sig(UNIQ, p) !== '').map(p => p.join(','));
  const isPainted = k => PAINTED.indexOf(k) >= 0;
  const predOf = mv => {
    const inLayer = eval('(function(p){return ' + M4[mv].cond + ';})');
    return ALLPOS.filter(inLayer).map(p => p.join(',')).sort();
  };
  const wrongLayer = [];
  Object.keys(M4).forEach(mv => {
    if (!eq(predOf(mv).filter(isPainted), moved(mv))) wrongLayer.push(mv);
  });
  ok('每个动作「转哪一层」都和模型一致（差一层动画就会跳一下）',
    wrongLayer.length === 0, wrongLayer.join(' '));
  // 方向：模型坐标 y 朝上、CSS 的 y 朝下，差一次镜像 —— 角度全部取反才对
  const cssRot = (ax, deg, p) => {
    const c = Math.cos(deg * Math.PI / 180), s2 = Math.sin(deg * Math.PI / 180);
    const [x, y, z] = p;
    if (ax === 'X') return [x, y * c - z * s2, y * s2 + z * c];
    if (ax === 'Y') return [x * c + z * s2, y, -x * s2 + z * c];
    return [x * c - y * s2, x * s2 + y * c, z];
  };
  const wrongDir = [];
  Object.keys(M4).forEach(mv => {
    const cfg = M4[mv];
    const inLayer = eval('(function(p){return ' + cfg.cond + ';})');
    const base = ROTS[BASE4[mv.replace(/^\d/, '')]];
    const samples = ALLPOS.filter(inLayer).slice(0, 3);
    if (!samples.length) { wrongDir.push(mv + '(层是空的)'); return; }
    samples.forEach(t => {
      const want = base(t).map((v, k) => k === 1 ? -v : v);      // 换到 CSS 坐标
      const got = cssRot(cfg.ax, cfg.deg, [t[0], -t[1], t[2]]);
      if (Math.abs(got[0] - want[0]) > 1e-9 || Math.abs(got[1] - want[1]) > 1e-9 ||
          Math.abs(got[2] - want[2]) > 1e-9) wrongDir.push(mv);
    });
  });
  ok('27 个动作的动画方向都和模型一致', wrongDir.length === 0,
    [...new Set(wrongDir)].join(',') + ' 方向反了');
  // 层的「大小」也要对：外层 16 个位置、宽转 32 个（两层）、里面那层 16 个
  const wideBad = ['r', 'l', 'u', 'd', 'f', 'b'].filter(mv => predOf(mv).length !== 32);
  ok('宽转那一层是 32 个位置（外面两层）', wideBad.length === 0, wideBad.join(' '));
  const outerBad = ['R', 'L', 'U', 'D', 'F', 'B'].filter(mv => predOf(mv).length !== 16);
  ok('外层动作只动 16 个位置', outerBad.length === 0, outerBad.join(' '));
  const innerBad = ['2R', '3L', '2U', '3F', '2D', '3B'].filter(mv => predOf(mv).length !== 16);
  ok('里面那一层也是 16 个位置（一层就是一层）', innerBad.length === 0, innerBad.join(' '));
}

console.log('\n结果: ' + pass + ' 通过, ' + fail + ' 失败');
process.exit(fail ? 1 : 0);
