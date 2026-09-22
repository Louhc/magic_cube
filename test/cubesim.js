/* 魔方计算器的模拟器校验。
 *
 * 两份实现独立写的：tools/cubesim.py（Python）和 cubesim.js（浏览器）。
 * 这里拿一批公式跑，逐张贴纸比颜色 —— 基准数据是从 Python 版固化下来的，
 * 所以之后跑测试不需要 Python。
 *
 * 用法: node test/cubesim.js
 */
const fs = require('fs');
const path = require('path');
const S = require(path.join(__dirname, '..', 'cubesim.js'));

const FACES = ['U', 'R', 'F', 'D', 'L', 'B'];
let pass = 0, fail = 0;
const ok = (n, c, x) => { c ? pass++ : fail++; console.log((c ? '  \u2713 ' : '  \u2717 ') + n + (c ? '' : '  -> ' + x)); };
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

console.log('[1] 基本不变量');
{
  ok('复原态六面各自同色',
    FACES.every(f => new Set(S.facelets(S.solved())[f]).size === 1));
  ok('任何面转 4 次回到原样',
    ['U', 'R', 'F', 'D', 'L', 'B', 'M', 'E', 'S', 'r', 'x', 'y'].every(m => {
      let st = S.solved();
      for (let i = 0; i < 4; i++) st = S.turn(st, m, 1);
      return eq(S.facelets(st), S.facelets(S.solved()));
    }));
  ok('面转不动中心块',
    ['U', 'R', 'F', 'D', 'L', 'B'].every(m => {
      const f = S.facelets(S.apply(S.solved(), m));
      return FACES.every(x => f[x][4] === x);
    }));
  ok('每个动作都改变了局面',
    ['U', 'R', 'F', 'D', 'L', 'B', 'M', 'E', 'S', 'r', 'x'].every(m =>
      !eq(S.facelets(S.apply(S.solved(), m)), S.facelets(S.solved()))));
  ok('逆运算抵消（R U R\' U\' 之后做 U R U\' R\' 复原）',
    eq(S.facelets(S.apply(S.solved(), "R U R' U' U R U' R'")), S.facelets(S.solved())));
}

console.log('\n[2] 公式解析');
{
  ok("R U R' 解析成 3 步", S.steps("R U R'").length === 3);
  ok("U'2 与 U2' 等价（原表里有这种写法）",
    eq(S.steps("U'2"), S.steps("U2'")) && S.steps("U'2")[0].times === -2);
  ok('括号与空格被忽略', S.steps("(R U) (R' U')").length === 4);
  ok('Rw 当 r 处理', S.steps('Rw')[0].mv === 'r');
  ok('看不懂的动作会抛错', (() => { try { S.steps('R Q'); return false; } catch (e) { return true; } })());
}

console.log('\n[2b] 净旋转');
{
  ok('ROTS 正好 24 种整体旋转', S.ROTS.length === 24);
  ok('无净旋转的公式返回空串',
    S.netRotation("R U R' U'") === '' && S.netRotation("(R U R')") === '');
  ok('Aa 的净旋转是 x x x（即 x\'）',
    S.netRotation("x' R2 D2 (R' U' R) D2 (R' U R')") === 'x x x');
  ok("含 y' 的公式净旋转是 x x' y'（即 y'）",
    S.netRotation("(R U R' U') y' (r' U' R U) M'") === "x x' y'");
  ok("含 y 的公式净旋转是 x x' y（即 y）",
    S.netRotation("(L F' L' F) (L' U2 L U) y (L U L')") === "x x' y");
  // 净旋转的逆能把转偏的复原态扳回标准朝向（Aa 本身还有角块置换，所以只核对中心）
  const Aa = "x' R2 D2 (R' U' R) D2 (R' U R')";
  const r2b = S.netRotation(Aa);
  const rinv2b = S.steps(r2b).slice().reverse().map(x => ({ mv: x.mv, times: -x.times }));
  let st2b = S.apply(S.solved(), Aa);
  rinv2b.forEach(x => { st2b = S.turn(st2b, x.mv, x.times); });
  const c2b = S.centers(st2b);
  ok('Aa 后补净旋转的逆，中心朝向回到标准',
    c2b.U === 'U' && c2b.F === 'F', JSON.stringify(c2b));
}

console.log('\n[3] 与 Python 版对拍（基准数据由 tools/cubesim.py 固化）');
{
  const fx = JSON.parse(fs.readFileSync(path.join(__dirname, 'cubesim.fixture.json'), 'utf8'));
  const algs = Object.keys(fx);
  ok('基准有 ' + algs.length + ' 条公式', algs.length >= 8);
  algs.forEach(a => {
    const got = S.facelets(S.apply(S.solved(), a));
    const bad = FACES.filter(f => got[f].join('') !== fx[a][f].join(''));
    ok('逐张贴纸一致: ' + a, bad.length === 0,
      bad.map(f => f + ' js=' + got[f].join('') + ' py=' + fx[a][f].join('')).join(' | '));
  });
}

console.log('\n[4] 计算器页面的关键行为');
{
  const html = fs.readFileSync(path.join(__dirname, '..', 'calc.html'), 'utf8');
  ok('引入了 cubesim.js 与 nav.js', html.includes('src="cubesim.js"') && html.includes('src="nav.js"'));
  ok('有公式输入框', /id="alg"/.test(html));
  ok('有逐步控制按钮', ['first', 'prev', 'next', 'last'].every(id => html.includes('id="' + id + '"')));
  ok('有立体魔方的舞台与立方体', /id="stage"/.test(html) && /id="cube"/.test(html));
  ok('用了 CSS 3D（perspective + preserve-3d）',
    /perspective:/.test(html) && /preserve-3d/.test(html));
  ok('转动靠 .layer 组旋转 + 过渡动画',
    /\.layer\{/.test(html) && /layer\.style\.transition\s*=/.test(html));
  ok('能拖拽转视角', /pointermove/.test(html) && /applyView/.test(html));
  ok('面转的四个角标能点（跳到那一步）', /data-k=/.test(html));
  // 逐步推进到末尾，等价于一次做完
  const st = S.solved();
  const steps = S.steps("R U R' U' F R U R' U' F'");
  let cur = st;
  steps.forEach(s => { cur = S.turn(S.clone(cur), s.mv, s.times); });
  ok('逐步推进 == 一次做完',
    eq(S.facelets(cur), S.facelets(S.apply(S.solved(), "R U R' U' F R U R' U' F'"))));
}

console.log('\n[5] 真跑一遍 calc.html 的脚本（DOM 桩）');
{
  // 这一节抓到过真 bug：页面里把间距常量命名成 S，又写成了 S.steps(...)，
  // 结果一打开就报 "S.steps is not a function"。只查结构是发现不了的。
  const vm = require('vm');
  const mkEl = (t, init) => {
    const e = { tagName: t, children: [], style: {}, dataset: {},
      classList: { add() {}, remove() {}, toggle() {} }, addEventListener() {},
      // 真 DOM 的 appendChild 会写上 parentNode —— 桩不写的话，
      // 「这个元素还在不在树里」这类判断全会误判（高亮色块会被反复重建）
      appendChild(c) { this.children.push(c); c.parentNode = this; return c; },
      querySelectorAll() { return []; }, querySelector() { return null; },
      setPointerCapture() {}, closest() { return null; }, offsetWidth: 1,
      value: init || '',
      set innerHTML(v) { this._h = v; }, get innerHTML() { return this._h || ''; },
      set textContent(v) { this._t = v; }, get textContent() { return this._t === undefined ? '' : this._t; },
      set disabled(v) {} };
    return e;
  };
  const els = { alg: mkEl('input', "R U R' U'") };
  const ctx = { console, navigator: {},
    // 页面里会挂 resize 监听，桩也得有
    window: { addEventListener() {} }, setTimeout, clearTimeout,
    localStorage: { getItem: () => null, setItem() {} }, CubeSim: S,
    location: { hash: '' },
    document: { getElementById: id => els[id] || (els[id] = mkEl('div')),
                // 这一节不需要箭头和选公式
                querySelectorAll: () => [],
                documentElement: mkEl('html'), createElement: mkEl,
                body: { appendChild() {} }, addEventListener() {} } };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  const src = fs.readFileSync(path.join(__dirname, '..', 'calc.html'), 'utf8')
    .match(/<script>([\s\S]*?)<\/script>/g).map(x => x.replace(/<\/?script>/g, ''))
    .filter(x => x.includes('M3'))[0];
  // 页面依赖 alglist.js（选公式面板的数据），先注入
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'alglist.js'), 'utf8'), ctx);
  let threw = null;
  try { vm.runInContext(src, ctx); } catch (e) { threw = e; }
  ok('脚本执行不报错', !threw, threw && (threw.message + ' @ ' + String(threw.stack).split('\n')[1]));
  if (threw) { console.log('\n结果: ' + pass + ' 通过, ' + fail + ' 失败'); process.exit(1); }
  ok('无错误提示', !els.err.textContent, els.err.textContent);
  // 现在的模型是「输入 -> 提交 -> 播放」，所以刚载入时不该有任何步骤
  ok('载入后没有步骤', (els.moves.innerHTML.match(/data-k/g) || []).length === 0);
  ok('载入后步骤区显示 —', els.pos.textContent === '\u2014', els.pos.textContent);
  ok('载入后是复原态（提交前不动魔方）', /class="on /.test(els.cube.innerHTML));

  const html = els.cube.innerHTML;
  const pos = [...html.matchAll(/data-pos="([^"]+)"/g)].map(m => m[1]);
  ok('画出 26 个小方块', pos.length === 26, String(pos.length));
  ok('每个小方块 6 个面（26×6=156）', (html.match(/<i /g) || []).length === 156);
  ok('朝外的贴纸 54 张', (html.match(/class="on /g) || []).length === 54);

  // 画出来的颜色必须和模拟器算出来的一致 —— 这是页面正确性的核心
  // 从页面读配色，别在这里抄一份 —— 否则改了配色方案，这条会误报。
  // 配色方案本身由 [8] 单独盯。
  const COLOR = {};
  for (const x of fs.readFileSync(path.join(__dirname, '..', 'calc.html'), 'utf8')
           .match(/var COLOR = \{([^}]+)\}/)[1].matchAll(/([UDFBRL]):\s*'(#[0-9A-Fa-f]{6})'/g)) {
    COLOR[x[1]] = x[2].toUpperCase();
  }
  const N2 = { px: '1,0,0', nx: '-1,0,0', py: '0,1,0', ny: '0,-1,0', pz: '0,0,1', nz: '0,0,-1' };
  const got = {};
  for (const m of html.matchAll(/data-pos="([^"]+)"[^>]*>([\s\S]*?)<\/div>/g)) {
    got[m[1]] = {};
    for (const x of m[2].matchAll(/class="on (\w+)"[^>]*--c:(#[0-9A-Fa-f]{6})/g)) {
      got[m[1]][N2[x[1]]] = x[2];
    }
  }
  const st = S.solved();                     // 载入后是复原态
  let bad = 0, n = 0;
  for (const k of Object.keys(st)) {
    const [p, nn] = k.split('|'); n++;
    if (((got[p] || {})[nn]) !== COLOR[st[k]]) bad++;
  }
  ok('54 张贴纸配色与模拟器一致', bad === 0 && n === 54, '核对 ' + n + ' 张，' + bad + ' 张不符');
}

console.log('\n[6] 六个面的贴纸必须朝外（不是陷进方块里）');
{
  // 这一节是为一个真 bug 加的：py/ny 的 rotateX 符号写反，贴纸被推进了方块
  // 内部，从外面看黄面白面整片是黑的。只查 DOM（class、颜色）发现不了 ——
  // 得把 CSS 的 transform 当矩阵算一遍，看它把 +z 推到哪。
  const html = fs.readFileSync(path.join(__dirname, '..', 'calc.html'), 'utf8');
  const rot = (axis, deg) => {
    const c = Math.cos(deg * Math.PI / 180), s2 = Math.sin(deg * Math.PI / 180);
    return axis === 'X' ? [1, 0, 0, 0, c, -s2, 0, s2, c] : [c, 0, s2, 0, 1, 0, -s2, 0, c];
  };
  const mul = (A, B) => {
    const C = new Array(9).fill(0);
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) for (let k = 0; k < 3; k++) C[i * 3 + j] += A[i * 3 + k] * B[k * 3 + j];
    return C;
  };
  const apply = (M, v) => [M[0] * v[0] + M[1] * v[1] + M[2] * v[2],
                           M[3] * v[0] + M[4] * v[1] + M[5] * v[2],
                           M[6] * v[0] + M[7] * v[1] + M[8] * v[2]];
  const I = [1, 0, 0, 0, 1, 0, 0, 0, 1];
  // 模型法向 -> 屏幕方向（CSS 的 y 朝下，所以模型的 +y 对应屏幕的 -y）
  const want = { px: [1, 0, 0], nx: [-1, 0, 0], py: [0, -1, 0], ny: [0, 1, 0], pz: [0, 0, 1], nz: [0, 0, -1] };
  const got = {};
  for (const m of html.matchAll(/\.cubie i\.(\w+)\{transform:([^}]+)\}/g)) {
    let M = I, tz = 0;
    // 推出距离现在写成 var(--half)（随舞台尺寸自适应），这里取个名义值就行 ——
    // 这一节查的是"往哪个方向推"，不是推多远
    for (const p of m[2].matchAll(/rotate([XY])\((-?\d+)deg\)|translateZ\((\d+)px\)|translateZ\(var\(--half\)\)/g)) {
      if (p[3]) tz = +p[3];
      else if (/var\(--half\)/.test(p[0])) tz = 23;
      else M = mul(M, rot(p[1], +p[2]));
    }
    got[m[1]] = apply(M, [0, 0, 1]).map(x => Math.round(x * tz));
  }
  Object.keys(want).forEach(k => {
    const w = want[k].map(x => x * 23);
    ok(k + ' 面朝外（贴纸不陷进方块）',
      got[k] && got[k].join() === w.join(), '推出 ' + JSON.stringify(got[k]) + ' 期望 ' + JSON.stringify(w));
  });
}

console.log('\n[7] 转动动画的方向必须和模拟器的移动一致');
{
  // 这是为一个真 bug 加的：状态由模拟器算（一直是对的），但动画的旋转方向
  // 来自页面里的一张表，两者差 90° —— 于是"往反方向转一下，再啪地跳到位"。
  // 用户的原话是「转动的结果是没问题的，有问题的是转动动画」。
  //
  // 模型坐标 y 朝上、CSS 的 y 朝下，两者差一次镜像，镜像会把旋转手感反转，
  // 所以每个轴的角度都要取反。
  const html = fs.readFileSync(path.join(__dirname, '..', 'calc.html'), 'utf8');
  const M3 = {};
  // 整体旋转 x/y/z 的条件写成 function () { return true; }（没有参数），
  // 所以这里 p 要可选
  for (const m of html.matchAll(/^\s{4}(\w): \['([XYZ])',\s*(-?\d+), function \((\w*)\) \{ return (.+?); \}\]/gm)) {
    M3[m[1]] = { ax: m[2], deg: +m[3], cond: m[5] };
  }
  const ALL = ['U','D','R','L','F','B','M','E','S','r','l','u','d','f','b','x','y','z'];
  const miss = ALL.filter(k => !M3[k]);
  ok('从页面里解析出全部 18 个动作', Object.keys(M3).length === 18 && miss.length === 0,
    '共 ' + Object.keys(M3).length + '，缺 ' + miss.join(','));

  const cssRot = (ax, deg, p) => {          // CSS 旋转矩阵作用在 CSS 坐标上
    const c = Math.cos(deg * Math.PI / 180), s2 = Math.sin(deg * Math.PI / 180);
    const [x, y, z] = p;
    if (ax === 'X') return [x, y * c - z * s2, y * s2 + z * c];
    if (ax === 'Y') return [x * c + z * s2, y, -x * s2 + z * c];
    return [x * c - y * s2, x * s2 + y * c, z];
  };
  // 模拟器里各动作对坐标的变换（模型坐标）
  const ROT = {
    U: p => [-p[2], p[1], p[0]], D: p => [p[2], p[1], -p[0]],
    F: p => [p[1], -p[0], p[2]], B: p => [-p[1], p[0], p[2]],
    R: p => [p[0], p[2], -p[1]], L: p => [p[0], -p[2], p[1]]
  };
  const BASE = { U: 'U', D: 'D', F: 'F', B: 'B', R: 'R', L: 'L',
                 M: 'L', E: 'D', S: 'F', r: 'R', l: 'L', u: 'U',
                 d: 'D', f: 'F', b: 'B', x: 'R', y: 'U', z: 'F' };
  // 采样点要覆盖到坐标为 0 的层（中层 M/E/S 就在那一层）
  const pts = [[1,1,1],[1,1,-1],[1,-1,1],[-1,1,1],[-1,-1,1],[1,-1,-1],[-1,1,-1],[-1,-1,-1],
               [0,1,1],[1,0,1],[1,1,0],[0,-1,-1],[-1,0,-1],[-1,-1,0]];
  const wrong = [];
  Object.keys(M3).forEach(mv => {
    const cfg = M3[mv];
    const inLayer = eval('(function(p){return ' + cfg.cond + ';})');
    const base = ROT[BASE[mv]];
    // 层里至少取 3 个点核对
    const samples = pts.filter(inLayer).slice(0, 3);
    if (!samples.length) { wrong.push(mv + '(层是空的)'); return; }
    samples.forEach(t => {
      const want = base(t).map((v, i) => i === 1 ? -v : v);      // 换到 CSS 坐标
      const got = cssRot(cfg.ax, cfg.deg, [t[0], -t[1], t[2]]);
      if (Math.abs(got[0] - want[0]) > 1e-9 || Math.abs(got[1] - want[1]) > 1e-9 ||
          Math.abs(got[2] - want[2]) > 1e-9) wrong.push(mv);
    });
  });
  ok('18 个动作的动画方向全部与模拟器一致', wrong.length === 0,
    [...new Set(wrong)].join(',') + ' 方向反了');
}

console.log('\n[8] 配色必须是标准方案（不是镜像的）');
{
  // 标准：白上 / 绿前 / 红右。竖翻成黄上，就是 黄上 / 绿前 / 橙右。
  // 之前写成 R=红，等于用了镜像方案，从右前方看就成了"橙在左、绿在右"。
  const html = fs.readFileSync(path.join(__dirname, '..', 'calc.html'), 'utf8');
  const m = html.match(/var COLOR = \{([^}]+)\}/);
  ok('页面里能读到 COLOR', !!m);
  const C = {};
  if (m) for (const x of m[1].matchAll(/([UDFBRL]):\s*'(#[0-9A-Fa-f]{6})'/g)) C[x[1]] = x[2].toUpperCase();
  const YELLOW = '#FFE600', WHITE = '#F4F4F4', RED = '#C41E3A',
        ORANGE = '#FF8C1A', GREEN = '#00A651', BLUE = '#0051BA';
  ok('F 面是红色', C.F === RED, 'F=' + C.F);
  ok('U=黄、D=白', C.U === YELLOW && C.D === WHITE, JSON.stringify(C));
  // 相对面必须配对：黄-白、红-橙、绿-蓝
  ok('红橙相对', C.F === RED && C.B === ORANGE, 'B=' + C.B);
  ok('绿蓝相对', C.R === GREEN && C.L === BLUE, 'R=' + C.R + ' L=' + C.L);
}

console.log('\n[9] 布局：和编辑器一样（左边画布铺满，操作区在右侧）');
{
  const html = fs.readFileSync(path.join(__dirname, '..', 'calc.html'), 'utf8');
  ok('用了 .app + .stage + .panel 三段式', /\.app\{display:flex/.test(html) &&
    /<main class="stage"/.test(html) && /<aside class="panel">/.test(html));
  ok('面板宽度与编辑器一致（322px）', /\.panel\{width:322px/.test(html));
  ok('面板在右侧（左边框 + 不收缩）', /\.panel\{[^}]*flex:none/.test(html) &&
    /\.panel\{[^}]*border-left:1px solid/.test(html));
  ok('画布占满剩余空间', /\.stage\{flex:1;min-width:0/.test(html));
  ok('整页不滚动（和编辑器一致）', /body\{[^}]*overflow:hidden/.test(html));
  // 魔方要跟着舞台尺寸放大缩小，而不是写死 46px
  ok('方块尺寸走 CSS 变量 --cs', /--cs/.test(html) && /--half/.test(html));
  ok('有自适应函数并在 resize 时重算', /function fit\(\)/.test(html) &&
    /addEventListener\('resize', fit\)/.test(html));
  ok('窄屏改为上下布局', /@media \(max-width:760px\)[\s\S]*?\.app\{flex-direction:column\}/.test(html));

  // 尺寸要留出余量，别把舞台撑满 —— 撑满时边角会被裁掉，观感也太挤
  const div = +(html.match(/Math\.min\(w, h\) \/ ([\d.]+)/) || [])[1];
  ok('能读出尺寸除数（' + div + '）', div > 4, String(div));
  const spanX = 3 * 1.38 / div, spanY = 3 * 1.32 / div;   // 相对 min(w,h)
  ok('魔方投影后不超过舞台的 ' + Math.round(spanX * 100) + '%（宽）/ ' +
     Math.round(spanY * 100) + '%（高）', spanX <= 0.8 && spanY <= 0.8,
     'div=' + div);
}

console.log('\n[10] 方块必须是实心的（不能有镂空感）');
{
  // 这是为一个观感问题加的：原来把贴纸直接当成方块的六个面，
  // 贴纸是圆角方形，六个圆角面在角上拼不严 -> 角上留孔 -> 看着是镂空的。
  // 真实魔方是「实心塑料方块 + 贴在上面的圆角贴纸」，所以：
  //   1. 面本体近乎方角（圆角必须小），拼起来才严实
  //   2. 面本体必须有实心背景色（不能透出背景）
  //   3. 贴纸是叠加层（::after），不是面本身
  const html = fs.readFileSync(path.join(__dirname, '..', 'calc.html'), 'utf8');
  const body = html.match(/\.cubie i\{([^}]*)\}/);
  ok('面的样式能读到', !!body);
  const css = body ? body[1] : '';
  ok('面本体是实心的（有 background）', /background:var\(--cubie\)/.test(css), css);
  const r = css.match(/border-radius:calc\(var\(--cs\) \* ([\d.]+)\)/);
  const rad = r ? +r[1] : 1;
  ok('面本体圆角足够小（' + rad + ' <= 0.06），角上拼得严',
    rad <= 0.06, '圆角系数 ' + rad + ' 太大，角上会露孔');
  ok('贴纸是叠加层（::after）而不是面本身', /\.cubie i\.on::after\{/.test(html));
  ok('贴纸色通过 --c 传入', /style="--c:' \+ COLOR\[col\]/.test(html));
}

console.log('\n[11] 动画转的角度必须和这一步实际转的角度一致');
{
  // 这是为一个真 bug 加的：U'2 解析出 times=-2，但动画里写成
  //   times === 2 ? base*2 : times < 0 ? -base : base
  // -2 判不进第一个分支，于是只转 90°，比结果少半圈。
  // 而且 U'2 与 U2 等价，两者动画也该一样。
  const html = fs.readFileSync(path.join(__dirname, '..', 'calc.html'), 'utf8');
  const m = html.match(/var deg = ([^;]+);/);
  ok('能读到角度计算式', !!m, String(m));
  if (m) {
    const calc = new Function('step', 'base', 'return (' + m[1] + ');');
    // 角度应当等于「该动作的正向角度 × times」。
    // 正向角度取 +90 / -90 两种都试（U 与 D 的正向就是相反的）。
    const wrong = [];
    [90, -90].forEach(base => {
      [1, -1, 2, -2].forEach(times => {
        const want = base * times;
        if (Math.abs(calc({ times: times }, base) - want) > 1e-9) {
          wrong.push('base=' + base + ' times=' + times + ' -> ' + calc({ times: times }, base));
        }
      });
    });
    ok('8 组（正向角度 × times=±1/±2）角度都对', wrong.length === 0, wrong.join(', '));
    // U'2 与 U2 必须给出同样的角度（两者本来就等价）
    ok("U'2 与 U2 动画一致", Math.abs(calc({ times: -2 }, 90)) === Math.abs(calc({ times: 2 }, 90)),
      calc({ times: -2 }, 90) + ' vs ' + calc({ times: 2 }, 90));
  }
  // 时长按角度缩放，半圈转久一点
  ok('时长按角度缩放', /var dur = DUR \* Math\.abs\(deg\) \/ 90/.test(html));
}

console.log('\n[13] 练习页：显示的图形必须是「从复原态执行该公式」的结果');
{
  // 这是整页的核心语义：用户手里是拼好的魔方，做完公式应当得到这个图形。
  // 所以题目图形 = apply(solved, 公式)，
  // 而不是公式表里那张「待解局面」图（两者互为逆）。
  const html = fs.readFileSync(path.join(__dirname, '..', 'practice.html'), 'utf8');
  ok('练习页有 F2L/OLL/PLL 三个范围',
    ['f2l', 'oll', 'pll'].every(k => html.includes('data-scope="' + k + '"')));
  ok('题目图形取自 apply(solved, 公式)',
    /CubeSim\.apply\(CubeSim\.solved\(\), exec\)/.test(html), '不是从复原态算的');
  // F2L 的 b 版按「绿色为 F 面」写，等价于 y + 公式 + y'（共轭，会真的改局面）
  ok('F2L 的 b 版按 y + 公式 执行',
    /scope === 'f2l' && \/b\$\/\.test\(r\[0\]\)\) \? \('y ' \+ r\[1\]\)/.test(html),
    'b 版没有在前面加 y');
  ok('看答案会从复原态播一遍',
    /function reveal\(\)/.test(html) && /var st = CubeSim\.solved\(\);/.test(html));
  ok('导航里有练习页',
    /\['practice\.html'/.test(fs.readFileSync(path.join(__dirname, '..', 'nav.js'), 'utf8')));

  const vm5 = require('vm');
  const mk = (t) => ({ tagName: t, children: [], style: {}, dataset: {},
    classList: { _s: new Set(), add(c) { this._s.add(c); }, remove(c) { this._s.delete(c); },
      toggle(c, v) { v === undefined ? (this._s.has(c) ? this._s.delete(c) : this._s.add(c)) : (v ? this._s.add(c) : this._s.delete(c)); },
      contains(c) { return this._s.has(c); } },
    _h: {}, addEventListener(ev, fn) { (this._h[ev] = this._h[ev] || []).push(fn); },
    appendChild(c) { this.children.push(c); return c; },
    querySelectorAll() { return []; }, querySelector() { return null; },
    setPointerCapture() {}, closest() { return null; }, offsetWidth: 1,
    set innerHTML(v) { this._hh = v; }, get innerHTML() { return this._hh || ''; },
    set textContent(v) { this._t = v; }, get textContent() { return this._t === undefined ? '' : this._t; } });
  const els5 = { cube: mk('div'), stage: mk('div'), next: mk('button') };
  const scopeBtns = ['f2l', 'oll', 'pll'].map(k => { const b = mk('button'); b.dataset.scope = k; return b; });
  // st5 记下页面写进 localStorage 的东西 —— 当前抽到的是第几条，
  // 只有页面自己知道（同一个题号能收多条写法），测试得读它才判得准。
  const st5 = {};
  const ctx5 = { console, navigator: {}, window: { addEventListener() {} },
    setTimeout, clearTimeout,
    localStorage: { getItem: k => (k in st5 ? st5[k] : null),
                    setItem: (k, v) => { st5[k] = String(v); }, removeItem: k => { delete st5[k]; } },
    CubeSim: S, location: { hash: '' },
    document: { getElementById: id => els5[id] || (els5[id] = mk('div')),
                querySelectorAll: sel => sel === '#scope button' ? scopeBtns : [],
                documentElement: mk('html'), createElement: mk,
                body: { appendChild() {} }, addEventListener() {} } };
  ctx5.globalThis = ctx5;
  vm5.createContext(ctx5);
  vm5.runInContext(fs.readFileSync(path.join(__dirname, '..', 'alglist.js'), 'utf8'), ctx5);
  const page = html.match(/<script>([\s\S]*?)<\/script>/g).map(x => x.replace(/<\/?script>/g, ''))
    .filter(x => x.includes('M3'))[0];
  let err5 = null;
  try { vm5.runInContext(page, ctx5); } catch (e) { err5 = e; }
  ok('练习页脚本能跑通', !err5, err5 && err5.message);
  if (!err5) {
    ok('抽到题了（题号不是占位符）', els5.qid.textContent !== '\u2014', els5.qid.textContent);
    const C5 = {};
    for (const x of html.match(/var COLOR = \{([^}]+)\}/)[1].matchAll(/([UDFBRL]):\s*'(#[0-9A-Fa-f]{6})'/g)) {
      C5[x[2].toUpperCase()] = x[1];
    }
    const N5 = { px: '1,0,0', nx: '-1,0,0', py: '0,1,0', ny: '0,-1,0', pz: '0,0,1', nz: '0,0,-1' };
    const got5 = {};
    for (const m of els5.cube.innerHTML.matchAll(/data-pos="([^"]+)"[^>]*>([\s\S]*?)<\/div>/g)) {
      for (const x of m[2].matchAll(/class="on (\w+)"[^>]*--c:(#[0-9A-Fa-f]{6})/g)) {
        got5[m[1] + '|' + N5[x[1]]] = C5[x[2].toUpperCase()];
      }
    }
    const parts = els5.qid.textContent.split(' ');
    const kind5 = parts[0].toLowerCase();
    // 同一个题号可能收了好几条写法（题面相同、答案不同），光按题号 find
    // 只能拿到第一条 —— 抽到第二条时就误判。页面把当前是第几条写进了
    // practice-round-v1（last），照它取才对得上。
    const list5 = ctx5.ALG_LIST[kind5];
    let rec5 = null;
    try { rec5 = JSON.parse(st5['practice-round-v1'] || 'null'); } catch (e) {}
    const idx5 = rec5 && typeof rec5.last === 'number' ? rec5.last : -1;
    const row = (list5[idx5] && list5[idx5][0] === parts[1]) ? list5[idx5] : null;
    ok('存档里记的当前题号就是题面上的（' + parts[1] + ' 第 ' + idx5 + ' 条）',
      !!row && rec5.id === parts[1], rec5 && JSON.stringify(rec5).slice(0, 60));
    // b 版要按共轭执行，期望值同样处理
    const want5 = (row && kind5 === 'f2l' && /b$/.test(parts[1]))
      ? ('y ' + row[1]) : (row ? row[1] : '');
    // sameState 定义在 [12] 的块作用域里，这里自己比
    const eqState = (a, b) => {
      const ka = Object.keys(a).sort(), kb = Object.keys(b).sort();
      return ka.length === kb.length && ka.every((k, i) => k === kb[i] && a[k] === b[k]);
    };
    ok('画出来的就是 apply(solved, 公式)（题目 ' + els5.qid.textContent + '）',
      !!row && eqState(got5, S.apply(S.solved(), want5)), JSON.stringify(got5).slice(0, 60));
    // 展示一律红面为 F（执行才按 a/b 切，那是计算器的事）
    {
      const vm8 = require('vm');
      const els8 = { cube: mk('div'), stage: mk('div'), next: mk('button') };
      const btns8 = ['f2l', 'oll', 'pll'].map(k => { const b = mk('button'); b.dataset.scope = k; return b; });
      const ctx8 = { console, navigator: {}, window: { addEventListener() {} },
        setTimeout, clearTimeout, localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
        CubeSim: S, location: { hash: '' },
        document: { getElementById: id => els8[id] || (els8[id] = mk('div')),
                    querySelectorAll: sel => sel === '#scope button' ? btns8 : [],
                    documentElement: mk('html'), createElement: mk,
                    body: { appendChild() {} }, addEventListener() {} } };
      ctx8.globalThis = ctx8;
      vm8.createContext(ctx8);
      vm8.runInContext(fs.readFileSync(path.join(__dirname, '..', 'alglist.js'), 'utf8'), ctx8);
      vm8.runInContext(page, ctx8);
      (btns8[0]._h.click || []).forEach(f => f({}));       // 切到 F2L
      let sawA = null, sawB = null;
      for (let i = 0; i < 40 && (!sawA || !sawB); i++) {
        const t = els8.cube.style.transform;
        if (/b$/.test(els8.qid.textContent)) { if (!sawB) sawB = t; }
        else if (!sawA) sawA = t;
        (els8.next._h.click || []).forEach(f => f({}));
      }
      ok('展示一律默认视角（a 版 rotateY -32）', /rotateY\(-32deg\)/.test(sawA || ''), String(sawA));
      ok('展示一律默认视角（b 版 rotateY -32）', /rotateY\(-32deg\)/.test(sawB || ''), String(sawB));
    }

    // 切走再回来，题目不能变
    ok('会存本轮进度', /practice-round-v1/.test(html) && /function saveRound\(\)/.test(html));
    ok('载入时优先恢复上次那一题', /localStorage\.getItem\(ROUND_KEY\)/.test(html) &&
      /r\[0\] === d\.id/.test(html));
    {
      const vm9 = require('vm');
      const st9 = {
        'practice-scope-v1': 'oll',
        'practice-round-v1': JSON.stringify({ scope: 'oll', id: '33', bag: [5, 6], last: 33 })
      };
      const els9 = { cube: mk('div'), stage: mk('div'), next: mk('button') };
      const btns9 = ['f2l', 'oll', 'pll'].map(k => { const b = mk('button'); b.dataset.scope = k; return b; });
      const ctx9 = { console, navigator: {}, window: { addEventListener() {} },
        setTimeout, clearTimeout,
        localStorage: { getItem: k => (k in st9 ? st9[k] : null),
                       setItem: (k, v) => { st9[k] = String(v); }, removeItem: k => { delete st9[k]; } },
        CubeSim: S, location: { hash: '' },
        document: { getElementById: id => els9[id] || (els9[id] = mk('div')),
                    querySelectorAll: sel => sel === '#scope button' ? btns9 : [],
                    documentElement: mk('html'), createElement: mk,
                    body: { appendChild() {} }, addEventListener() {} } };
      ctx9.globalThis = ctx9;
      vm9.createContext(ctx9);
      vm9.runInContext(fs.readFileSync(path.join(__dirname, '..', 'alglist.js'), 'utf8'), ctx9);
      vm9.runInContext(page, ctx9);
      ok('回来时还是上次那一题（OLL 33）', els9.qid.textContent === 'OLL 33', els9.qid.textContent);
      // 局面也应当是 OLL 33 那条公式的（不是随便抽的）
      const row9 = ctx9.ALG_LIST.oll.filter(r => r[0] === '33')[0];
      const C9 = {};
      for (const x of html.match(/var COLOR = \{([^}]+)\}/)[1].matchAll(/([UDFBRL]):\s*'(#[0-9A-Fa-f]{6})'/g)) {
        C9[x[2].toUpperCase()] = x[1];
      }
      const N9 = { px: '1,0,0', nx: '-1,0,0', py: '0,1,0', ny: '0,-1,0', pz: '0,0,1', nz: '0,0,-1' };
      const got9 = {};
      for (const m of els9.cube.innerHTML.matchAll(/data-pos="([^"]+)"[^>]*>([\s\S]*?)<\/div>/g)) {
        for (const x of m[2].matchAll(/class="on (\w+)"[^>]*--c:(#[0-9A-Fa-f]{6})/g)) {
          got9[m[1] + '|' + N9[x[1]]] = C9[x[2].toUpperCase()];
        }
      }
      const want9 = S.apply(S.solved(), row9[1]);
      const same9 = (() => {
        const ka = Object.keys(got9).sort(), kb = Object.keys(want9).sort();
        return ka.length === kb.length && ka.every((k, i) => k === kb[i] && got9[k] === want9[k]);
      })();
      ok('恢复的那一题，局面也对得上', same9, JSON.stringify(got9).slice(0, 50));
    }

    // 切白天/夜晚，OLL 题图要跟着换（白天紫顶 / 夜晚黄顶）
    ok('练习页的 applyTheme 里真的调了 syncThumb（不是只定义了函数）',
      /function applyTheme\(t\) \{\s*\n\s*root\.dataset\.theme = t;\s*\n\s*syncThumb\(\);/.test(html));
    ok('题图文件名按昼夜挑（只有 OLL 有两版）',
      /kind === 'oll' \? \(document\.documentElement\.dataset\.theme === 'dark' \? '-night' : '-day'\) : ''/.test(html));
    {
      const before = els5.qimg.src;
      ok('初始是白天那版（紫顶）', /-day-/.test(before), before);
      (els5.themebtn._h.click || []).forEach(function (f) { f({}); });
      ok('点主题开关，题图当场换成夜晚那版',
        /-night-/.test(els5.qimg.src) && els5.qimg.src !== before, before + ' -> ' + els5.qimg.src);
      (els5.themebtn._h.click || []).forEach(function (f) { f({}); });
      ok('再点回来又变回白天那版', /-day-/.test(els5.qimg.src), els5.qimg.src);
    }

    // 范围选择要持久化
    ok('范围会存进 localStorage', /practice-scope-v1/.test(html) &&
      /localStorage\.setItem\(SCOPE_KEY/.test(html));
    ok('载入时读回范围', /SCOPES\.indexOf\(sv\)/.test(html));
    {
      // 预置「上次练 PLL」，打开页面应当直接是 PLL
      const vm6 = require('vm');
      const mk6 = mk;
      const st6 = { 'practice-scope-v1': 'pll' };
      const els6 = { cube: mk6('div'), stage: mk6('div'), next: mk6('button') };
      const btns6 = ['f2l', 'oll', 'pll'].map(k => { const b = mk6('button'); b.dataset.scope = k; return b; });
      const ctx6 = { console, navigator: {}, window: { addEventListener() {} },
        setTimeout, clearTimeout,
        localStorage: { getItem: k => (k in st6 ? st6[k] : null),
                       setItem: (k, v) => { st6[k] = String(v); }, removeItem: k => { delete st6[k]; } },
        CubeSim: S, location: { hash: '' },
        document: { getElementById: id => els6[id] || (els6[id] = mk6('div')),
                    querySelectorAll: sel => sel === '#scope button' ? btns6 : [],
                    documentElement: mk6('html'), createElement: mk6,
                    body: { appendChild() {} }, addEventListener() {} } };
      ctx6.globalThis = ctx6;
      vm6.createContext(ctx6);
      vm6.runInContext(fs.readFileSync(path.join(__dirname, '..', 'alglist.js'), 'utf8'), ctx6);
      vm6.runInContext(page, ctx6);
      ok('回来时范围是上次选的（pll）', /^PLL /.test(els6.qid.textContent), els6.qid.textContent);
      ok('对应的范围按钮也是选中态', btns6[2].classList.contains('on'));
    }

    // 洗牌袋：切到 PLL 连点到底，应把题库各条各出一次、无一漏掉
    (scopeBtns[2]._h.click || []).forEach(function (f) { f({}); });
    const total = ctx5.ALG_LIST.pll.length;      // 从题库动态取，加公式不用改测试
    const seen = [els5.qid.textContent];
    for (let i = 0; i < total - 1; i++) {
      (els5.next._h.click || []).forEach(function (f) { f({}); });
      seen.push(els5.qid.textContent);
    }
    // 一个题号能收多条写法（Ua / Ub / Z 等）—— 题面（图）相同，标签都是
    // 「PLL Z」，不能用标签去重。改成按"每个标签出现的次数正好等于题库里
    // 该标签的条数"来验，等价于洗牌袋覆盖了每一条。
    {
      const counts = {};
      seen.forEach(t => { counts[t] = (counts[t] || 0) + 1; });
      const expect = {};
      ctx5.ALG_LIST.pll.forEach(r => {
        const t = 'PLL ' + r[0];
        expect[t] = (expect[t] || 0) + 1;
      });
      const labels = Object.keys(expect).sort();
      ok('一轮抽出 ' + seen.length + ' 题，覆盖题库全部 ' + labels.length + ' 个标签',
        seen.length === total && labels.every(t => counts[t] === expect[t]),
        JSON.stringify(counts));
      ok('多写法的格子被抽到对应次数（Z 两条）',
        counts['PLL Z'] === 2, String(counts['PLL Z']));
      // 多写法的格子（Ua / Ub / Z）会各出现两次，单条的出现一次 ——
      // 统一成「每个标签的次数都等于题库里的条数」
      const multi = labels.filter(t => expect[t] > 1);
      ok('单条写法的标签恰好一次',
        labels.filter(t => expect[t] === 1).every(t => counts[t] === 1));
      ok('多写法的格子按条数各出现多次（' + multi.join(' ') + '）',
        multi.every(t => counts[t] === expect[t]), JSON.stringify(multi.map(t => [t, counts[t], expect[t]])));
    }
    (els5.next._h.click || []).forEach(function (f) { f({}); });
    ok('换轮时不紧接着重复上一题', els5.qid.textContent !== seen[seen.length - 1],
      seen[seen.length - 1] + ' -> ' + els5.qid.textContent);

    // 判重按【题号】算，不是按下标：一个题号能收好几条写法（OLL 13/14/29/30/34、
    // PLL Ga…/Ra/Ua/Ub/Z 都是），题号、题面（图）一模一样，只有答案不同；
    // 按下标判重就会在换轮处连出两张看起来完全一样的题。
    // 这里把随机数钉死，逼出「新一轮第一张正好和上一张同题号」的牌堆：
    // 洗牌后 bag[n-1] 只由第一个随机数决定（= floor(r*n)），让它正对上另一条同题号。
    {
      const vm7 = require('vm');
      const cases = [
        { scope: 'oll', id: '29', list: ctx5.ALG_LIST.oll },
        { scope: 'pll', id: 'Ra', list: ctx5.ALG_LIST.pll }
      ];
      cases.forEach(function (c) {
        const dup = c.list.map((r, i) => i).filter(i => c.list[i][0] === c.id);
        const n = c.list.length, from = dup[0], to = dup[1];
        ok('题号 ' + c.id + ' 确实收了多条写法（' + dup.length + ' 条）', dup.length > 1);
        if (dup.length < 2) return;
        // 存档：上一张是第 from 条，袋已抽空
        const st7 = {
          'practice-scope-v1': c.scope,
          'practice-round-v1': JSON.stringify({ scope: c.scope, id: c.id, bag: [], last: from })
        };
        const els7 = { cube: mk('div'), stage: mk('div'), next: mk('button') };
        const btns7 = ['f2l', 'oll', 'pll'].map(k => { const b = mk('button'); b.dataset.scope = k; return b; });
        const ctx7 = { console, navigator: {}, window: { addEventListener() {} },
          setTimeout, clearTimeout,
          localStorage: { getItem: k => (k in st7 ? st7[k] : null),
                          setItem: (k, v) => { st7[k] = String(v); }, removeItem: k => { delete st7[k]; } },
          CubeSim: S, location: { hash: '' },
          document: { getElementById: id => els7[id] || (els7[id] = mk('div')),
                      querySelectorAll: sel => sel === '#scope button' ? btns7 : [],
                      documentElement: mk('html'), createElement: mk,
                      body: { appendChild() {} }, addEventListener() {} } };
        ctx7.globalThis = ctx7;
        vm7.createContext(ctx7);
        vm7.runInContext('Math.random = function () { return ' + ((to + 0.5) / n) + '; };', ctx7);
        vm7.runInContext(fs.readFileSync(path.join(__dirname, '..', 'alglist.js'), 'utf8'), ctx7);
        vm7.runInContext(page, ctx7);
        const label = c.scope.toUpperCase() + ' ' + c.id;
        ok('前置条件：现在出的是 ' + label + '（第 ' + from + ' 条）',
          els7.qid.textContent === label, els7.qid.textContent);
        (els7.next._h.click || []).forEach(f => f({}));
        ok('换轮第一张不和上一张同题号（下一张本该是第 ' + to + ' 条）',
          els7.qid.textContent !== label, label + ' -> ' + els7.qid.textContent);
      });
    }
    ok('显示了公式要解决的图形（' + els5.qimg.src + '）',
      /^pll\/pll-[A-Za-z]+-256x256\.png$/.test(els5.qimg.src) &&
      fs.existsSync(path.join(__dirname, '..', els5.qimg.src)), els5.qimg.src);

  }
}

console.log('\n[11c] PLL 页的「显示颜色」开关（真跑一遍页面脚本）');
{
  const vm = require('vm');
  const mkPll = (store) => {
    const els = {}, imgs = [];
    const mkEl = (t) => {
      const e = { tagName: t, children: [], dataset: {}, _h: '', _t: '',
        style: { setProperty() {} },
        classList: { _s: new Set(), add(c) { this._s.add(c); }, remove(c) { this._s.delete(c); },
          toggle(c, v) { v === undefined ? (this._s.has(c) ? this._s.delete(c) : this._s.add(c))
                                         : (v ? this._s.add(c) : this._s.delete(c)); },
          contains(c) { return this._s.has(c); } },
        _h2: {}, addEventListener(ev, fn) { (this._h2[ev] = this._h2[ev] || []).push(fn); },
        fire(ev, a) { (this._h2[ev] || []).forEach(f => f(a || {})); },
        appendChild(c) { this.children.push(c); return c; },
        querySelectorAll() { return []; }, querySelector() { return null; },
        set innerHTML(v) { this._h = v; }, get innerHTML() { return this._h; },
        set textContent(v) { this._t = v; }, get textContent() { return this._t; } };
      return e;
    };
    // 表里每张图在真实 DOM 里是 <img data-pll="编号">；桩里按编号造出来交给 syncPllImages
    const ids = [...fs.readFileSync(path.join(__dirname, '..', 'pll.html'), 'utf8')
      .match(/var SECTIONS = (\[[\s\S]*?\n\]);/)[1].matchAll(/"([A-Za-z]{1,2})",\s*"/g)]
      .map(m => m[1]);
    [...new Set(ids)].forEach(id => { const im = mkEl('img'); im.dataset.pll = id; im.src = 'x'; imgs.push(im); });
    const ctx = { console, navigator: {}, window: { addEventListener() {} },
      setTimeout, clearTimeout,
      localStorage: { getItem: k => (k in store ? store[k] : null),
                     setItem: (k, v) => { store[k] = String(v); }, removeItem() {} },
      location: { hash: '' },
      document: { documentElement: { dataset: {} },
                  getElementById: id => els[id] || (els[id] = mkEl('div')),
                  querySelectorAll: sel => (sel.indexOf('#app img') === 0 ? imgs : []),
                  createElement: mkEl, body: { appendChild() {} }, addEventListener() {} } };
    ctx.globalThis = ctx;
    vm.createContext(ctx);
    const src = fs.readFileSync(path.join(__dirname, '..', 'pll.html'), 'utf8')
      .match(/<script>([\s\S]*?)<\/script>/g).map(x => x.replace(/<\/?script>/g, ''))
      .filter(x => x.includes('SECTIONS')).pop();
    vm.runInContext(src, ctx);
    return { els, imgs, store };
  };

  // 存档说「关掉颜色」：第一次渲染就该是无色图
  {
    const w = mkPll({ 'pll-color-v1': '0' });
    ok('存档关着颜色时，首次渲染就用无色图',
      /pll\/pll-Aa-nc-256x256\.png/.test(w.els.app.innerHTML) &&
      !/pll\/pll-Aa-256x256\.png/.test(w.els.app.innerHTML),
      (w.els.app.innerHTML.match(/pll\/pll-[\w-]+\.png/) || [])[0]);
    ok('开关本身也停在「没勾」的状态',
      w.els.showcolors.checked === false && !w.els['tg-colors'].classList.contains('on'));
    // 再打开：图片地址换回彩色那套，同时写回存档
    w.els.showcolors.checked = true;
    w.els.showcolors.fire('change', {});
    ok('打开开关后，表里每张图都换回彩色版',
      w.imgs.every(im => /pll\/pll-[\w]+-256x256\.png$/.test(im.src)) &&
      w.imgs.some(im => /pll\/pll-Aa-256x256\.png$/.test(im.src)),
      w.imgs[0].src);
    ok('打开后写回存档（pll-color-v1 = 1）', w.store['pll-color-v1'] === '1', w.store['pll-color-v1']);
    ok('打开后开关外框也亮起来', w.els['tg-colors'].classList.contains('on'));
  }
  // 存档说「关掉颜色」+「夜晚」：无色图得挑黄箭头那版。
  // 这条是补上的 —— 之前 Aa 的夜晚图其实是白天那张（深紫箭头压在深色卡片上
  // 只有 1.3:1，基本看不见），当时没有任何测试盯着"图里到底是什么颜色"。
  {
    const w = mkPll({ 'pll-color-v1': '0', 'cube-theme': 'dark' });
    ok('夜晚 + 关颜色：首屏就用黄箭头那版（-nc-night），不是白天那张',
      /pll\/pll-Aa-nc-night-256x256\.png/.test(w.els.app.innerHTML) &&
      !/pll\/pll-Aa-nc-256x256\.png/.test(w.els.app.innerHTML),
      (w.els.app.innerHTML.match(/pll\/pll-[\w-]+\.png/) || [])[0]);
    ok('21 张一个不漏，全换成 -nc-night',
      w.imgs.length >= 21 && w.imgs.every(im => /-nc-night-256x256\.png$/.test(im.src)),
      w.imgs[0].src);
    // 切回白天：换回紫箭头那版（无色白天图）
    w.els.themebtn.fire('click', {});
    ok('切回白天后换成紫箭头那版（-nc），不留 -nc-night',
      w.imgs.every(im => /-nc-256x256\.png$/.test(im.src)) &&
      !w.imgs.some(im => /-nc-night/.test(im.src)), w.imgs[0].src);
    ok('主题也写回存档（cube-theme = light）', w.store['cube-theme'] === 'light', w.store['cube-theme']);
    // 开着颜色时不分昼夜：白天夜晚共用同一张（夜晚那套彩色图已经删了）
    w.els.showcolors.checked = true;
    w.els.showcolors.fire('change', {});
    ok('开着颜色时白天/夜晚共用一张图（不会去找 -night 的彩色版）',
      w.imgs.every(im => /pll-[\w]+-256x256\.png$/.test(im.src) && !/-night|-nc/.test(im.src)),
      w.imgs[0].src);
  }
  // 存档说「开着颜色」（默认）
  {
    const w = mkPll({});
    ok('默认就是彩色（存档里没有这个键）',
      /pll\/pll-Aa-256x256\.png/.test(w.els.app.innerHTML) &&
      !/-nc-/.test(w.els.app.innerHTML));
    ok('默认勾选框是勾上的', w.els.showcolors.checked === true);
  }
}

console.log('\n[11e] 「跳计算器」链接的朝向标记：只有 F2L 的 b 版才带 @g:');
{
  // 一个真 bug：三个公式页各自抄了一份 toCalc，里面都用 /b$/ 判「是不是 F2L 的 b 版」。
  // F2L 的 b 版确实是 01b/02b，可 PLL 用字母编号 —— Ab / Gb / Jb / Nb / Rb / Ub
  // 末尾也是 b，于是这六条被当成「绿面朝前」，跳到计算器会先转个 y，
  // 摆出来的图和本站的图对不上。现在判据是显式写死的（F2L 写「数字 + b」，
  // OLL / PLL 直接 false），这一节就把三个页面真渲染一遍，逐条查链接。
  const vm = require('vm');
  const render = (page) => {
    const els = {};
    const mkEl = (t) => {
      const e = { tagName: t, children: [], dataset: {}, _h: '', _t: '', checked: true,
        style: { setProperty() {} },
        classList: { _s: new Set(), add(c) { this._s.add(c); }, remove(c) { this._s.delete(c); },
          toggle(c, v) { v ? this._s.add(c) : this._s.delete(c); }, contains(c) { return this._s.has(c); } },
        _h2: {}, addEventListener(ev, fn) { (this._h2[ev] = this._h2[ev] || []).push(fn); },
        fire(ev, a) { (this._h2[ev] || []).forEach(f => f(a || {})); },
        appendChild(c) { this.children.push(c); return c; },
        querySelectorAll() { return []; }, querySelector() { return null; },
        set innerHTML(v) { this._h = v; }, get innerHTML() { return this._h; },
        set textContent(v) { this._t = v; }, get textContent() { return this._t; } };
      return e;
    };
    const ctx = { console, navigator: {}, window: { addEventListener() {} },
      setTimeout, clearTimeout,
      localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
      location: { hash: '' },
      document: { documentElement: { dataset: {} },
                  getElementById: id => els[id] || (els[id] = mkEl('div')),
                  querySelectorAll: () => [], createElement: mkEl,
                  body: { appendChild() {} }, addEventListener() {} } };
    ctx.globalThis = ctx;
    vm.createContext(ctx);
    const src = fs.readFileSync(path.join(__dirname, '..', page), 'utf8')
      .match(/<script>([\s\S]*?)<\/script>/g).map(x => x.replace(/<\/?script>/g, ''))
      .filter(x => x.includes('SECTIONS')).pop();
    vm.runInContext(src, ctx);
    return els.app.innerHTML;
  };
  const f2l = render('f2l.html'), oll = render('oll.html'), pll = render('pll.html');

  const links = (html) => [...html.matchAll(/href="(calc\.html#[^"]*)"/g)].map(m => m[1]);
  // 正面对照：F2L 的 b 版确实带 @g:，a 版不带 —— 说明这个标记本身是对的
  ok('F2L：b 版的 ↗ 带 @g:，a 版不带（标记本身没问题）',
    links(f2l).some(h => h.indexOf('@g:') >= 0) &&
    links(f2l).some(h => h.indexOf('@g:') < 0),
    links(f2l).length + ' 条链接');
  // OLL / PLL：一条 @g: 都不许有
  [['OLL', oll], ['PLL', pll]].forEach(([name, html]) => {
    const ls = links(html);
    ok(name + '：' + ls.length + ' 条链接里一个 @g: 都没有（@g: 只属于 F2L 的 b 版）',
      ls.length >= 20 && ls.every(h => h.indexOf('@g:') < 0),
      ls.filter(h => h.indexOf('@g:') >= 0).slice(0, 3).join(' '));
  });
  // 点名那条：Nb 末尾的 b 是「第二个变体」，不是 F2L 的 b 版
  const nb = (pll.match(/Nb[\s\S]{0,800}?href="(calc\.html#[^"]*)"/) || [])[1] || '';
  ok('PLL-Nb 的 ↗ 不带 @g:（它和 F2L 的 b 版没关系）',
    !!nb && nb.indexOf('@g:') < 0, nb.slice(0, 70));
  // 源码这一层也钉住：判据必须是显式的，不许再回到 /b$/ 那种后缀猜法
  const f2lSrc = fs.readFileSync(path.join(__dirname, '..', 'f2l.html'), 'utf8');
  ok('三个页面的判据都写死了（F2L 用「数字 + b」，OLL / PLL 直接 false）',
    /var green = \/\^\\d\+b\$\//.test(f2lSrc) &&
    /var green = false;/.test(fs.readFileSync(path.join(__dirname, '..', 'oll.html'), 'utf8')) &&
    /var green = false;/.test(fs.readFileSync(path.join(__dirname, '..', 'pll.html'), 'utf8')) &&
    // 谁也不许再用「以 b 结尾」来猜
    !/var green = \/b\$\//.test(f2lSrc + oll + pll));
}

console.log('\n[11f] 跳转过来的朝向：只有 @g:（F2L 的 b 版）才补那 90°');
{
  // 另一半合同：链接带不带 @g: 由上一条测；计算器收到 @g: 要「先 y、视角补 90°」。
  // 两半合起来才是「点 ↗ 摆出来的局面和表里的图一致」——所以这半边也得有人盯着。
  const vm = require('vm');
  const calcSrc = fs.readFileSync(path.join(__dirname, '..', 'calc.html'), 'utf8')
    .match(/<script>([\s\S]*?)<\/script>/g).map(x => x.replace(/<\/?script>/g, ''))
    .filter(x => x.includes('M3'))[0];
  const boot = (hash) => {
    const els = {};
    const mkEl = (t, init) => {
      const e = { tagName: t, children: [], dataset: {}, style: {}, _h: '', _t: '',
        classList: { _s: new Set(), add(c) { this._s.add(c); }, remove(c) { this._s.delete(c); },
          toggle(c, v) { v ? this._s.add(c) : this._s.delete(c); }, contains(c) { return this._s.has(c); } },
        addEventListener() {}, appendChild(c) { this.children.push(c); return c; },
        querySelectorAll() { return []; }, querySelector() { return null; },
        setPointerCapture() {}, closest() { return null; }, offsetWidth: 1, value: init || '',
        focus() { this._focused = true; },
        set innerHTML(v) { this._h = v; }, get innerHTML() { return this._h; },
        set textContent(v) { this._t = v; }, get textContent() { return this._t === undefined ? '' : this._t; },
        set disabled(v) {} };
      return e;
    };
    const ctx = { console, navigator: {}, window: { addEventListener() {} },
      setTimeout, clearTimeout, CubeSim: S,
      performance: { getEntriesByType: () => [] },
      localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
      location: { hash },
      document: { getElementById: id => els[id] || (els[id] = mkEl('div')),
                  querySelectorAll: () => [], documentElement: mkEl('html'),
                  createElement: mkEl, body: { appendChild() {} }, addEventListener() {} } };
    ctx.globalThis = ctx;
    vm.createContext(ctx);
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'alglist.js'), 'utf8'), ctx);
    vm.runInContext(calcSrc, ctx);
    return els;
  };
  const plain = boot('#R U');            // 普通公式（OLL / PLL 都是这种）
  const green = boot('#@g:R U');         // F2L 的 b 版：绿面朝前（注意 # 也要带，
                                         // 页面会先 slice(1) 掉它再认前缀）
  const rotY = e => Number((String(e.cube.style.transform).match(/rotateY\(([-\d.]+)deg\)/) || [])[1]);
  ok('普通公式：视角不额外补转（OLL / PLL 走的就是这条）',
    Math.abs(rotY(plain)) < 1e-9 && Math.abs(rotY(plain) - (-32)) > 1e-9 || rotY(plain) === -32,
    String(plain.cube.style.transform));
  ok('@g: 公式：视角正好补 90°，魔方本身也真的先转了个 y',
    Math.abs((rotY(green) - rotY(plain)) - 90) < 1e-9 &&
    green.cube.innerHTML !== plain.cube.innerHTML,
    rotY(plain) + ' -> ' + rotY(green));
  ok('两种情况输入框里都只有公式本身（前缀不会漏进去）',
    plain.alg.value === 'R U' && green.alg.value === 'R U',
    plain.alg.value + ' / ' + green.alg.value);
}

console.log('\n[11d] 教程页：主题开关能切、写进存档（真跑一遍进阶页脚本）');
{
  const vm = require('vm');
  const mkEl = t => {
    const e = { tagName: t, dataset: {}, _h: '', _t: '', _h2: {},
      classList: { _s: new Set(), add(c) { this._s.add(c); }, remove(c) { this._s.delete(c); },
        toggle(c, v) { v ? this._s.add(c) : this._s.delete(c); }, contains(c) { return this._s.has(c); } },
      addEventListener(ev, fn) { (this._h2[ev] = this._h2[ev] || []).push(fn); },
      fire(ev, a) { (this._h2[ev] || []).forEach(f => f(a || {})); },
      setAttribute(k, v) { this['_a_' + k] = String(v); }, getAttribute(k) { return this['_a_' + k] || null; },
      appendChild(c) { return c; }, removeChild() {}, select() {}, focus() {},
      set innerHTML(v) { this._h = v; }, get innerHTML() { return this._h; },
      set textContent(v) { this._t = v; }, get textContent() { return this._t; } };
    return e;
  };
  ['tutorial-basic.html', 'tutorial-advanced.html'].forEach(page => {
    const els = {}, store = {};
    // 教程页里那四张「顶层棱形状」是脚本画进 svg[data-top] 的，桩里得先有这几个节点
    const tops = ['line', 'corner', 'dot', 'cross'].map(k => {
      const svg = mkEl('svg');
      svg.setAttribute('data-top', k);
      return svg;
    });
    // data-oll / data-shape 的图：src 是脚本按主题拼的，桩里给几个假节点好检查拼出来的名字
    const ollImgs = ['21', '27'].map(k => { const i = mkEl('img'); i.setAttribute('data-oll', k); return i; });
    const shapeImgs = ['dot', 'line', 'corner', 'cross'].map(k => {
      const i = mkEl('img'); i.setAttribute('data-shape', k); return i;
    });
    const ctx = {
      console, setTimeout, clearTimeout, navigator: {}, window: { addEventListener() {} },
      localStorage: { getItem: k => (k in store ? store[k] : null),
                      setItem: (k, v) => { store[k] = String(v); },
                      removeItem: k => { delete store[k]; } },
      document: { documentElement: { dataset: {} }, createElement: mkEl,
                  getElementById: id => els[id] || (els[id] = mkEl('div')),
                  querySelectorAll: sel => (sel === 'svg[data-top]' ? tops
                                            : sel === 'img[data-oll]' ? ollImgs
                                            : sel === 'img[data-shape]' ? shapeImgs : []),
                  addEventListener() {},
                  body: { appendChild() {}, removeChild() {} } }
    };
    ctx.globalThis = ctx;
    vm.createContext(ctx);
    const src = fs.readFileSync(path.join(__dirname, '..', page), 'utf8')
      .match(/<script>([\s\S]*?)<\/script>/g).map(x => x.replace(/<\/?script>/g, ''))
      .filter(x => x.includes('applyTheme')).pop();
    vm.runInContext(src, ctx);
    ok(page + '：开屏是白天（存档里没主题）',
      ctx.document.documentElement.dataset.theme === 'light' &&
      String(els.themebtn.title || '').indexOf('夜晚') >= 0);
    if (page === 'tutorial-basic.html') {
      ok('教程：形状图开屏拼的是白天那版（含 OLL 表同一套做法）',
        shapeImgs.every(i => i.src === 'tutorial/shape-' + i.getAttribute('data-shape') + '-day-256x256.png') &&
        ollImgs.every(i => i.src === 'oll/oll-' + i.getAttribute('data-oll') + '-day-256x256.png'),
        shapeImgs.map(i => i.src).join(' '));
    }
    els.themebtn.fire('click');
    ok(page + '：进来就记住「上次看的是这一篇」',
      store['cube-last:tutorial-basic.html'] === page, store['cube-last:tutorial-basic.html']);
    ok(page + '：点主题开关切到夜晚并写进存档',
      ctx.document.documentElement.dataset.theme === 'dark' && store['cube-theme'] === 'dark',
      ctx.document.documentElement.dataset.theme + ' / ' + store['cube-theme']);
    if (page === 'tutorial-basic.html') {
      ok('教程：切到夜晚后形状图整批换成 -night（OLL 那几张也一起换）',
        shapeImgs.every(i => i.src === 'tutorial/shape-' + i.getAttribute('data-shape') + '-night-256x256.png') &&
        ollImgs.every(i => i.src === 'oll/oll-' + i.getAttribute('data-oll') + '-night-256x256.png'),
        shapeImgs.map(i => i.src).join(' '));
    }
    if (page === 'tutorial-basic.html') {
      const h = fs.readFileSync(path.join(__dirname, '..', page), 'utf8');
      // 表格列数：除「公式记号」那张两列表，其余情况表都是两列 ——
      // 曾经多出来一个空列（放 ↗ 的），用户一眼就看出来了
      const emptyCells = (h.match(/<td><\/td>/g) || []).length;
      ok('教程：表格正文没有多出来的空单元格（表头空着的那两格是 F2L 那种双列表本来就有的）',
        emptyCells === 0, String(emptyCells));
      // 第 3 步右边那条是「绿色为 F 面」的写法：跳计算器要跟 F2L 的 b 版一样带 @g: 前缀
      ok('教程：第 3 步第二条公式带 @g: 前缀（计算器会先 y、再 y\' 回来）',
        /href="calc\.html#@g:U'%20L'%20U%20L%20U%20F%20U'%20F'"/.test(h));
      // 第 4 步的四张形状图（用户自己出的：单点 / 一字 / 拐角 / 十字）
      // 它们是分昼夜两版的，页面上只写 data-shape，src 由脚本按主题拼
      ['dot', 'line', 'corner', 'cross'].forEach(k => {
        ok('教程：形状图 data-shape="' + k + '" 用上了',
          h.includes('data-shape="' + k + '"'));
      });
      ok('教程：形状图不再写死 src（否则换主题就漏一张）',
        !/src="tutorial\/top(3|1|2)?-256x256\.png"/.test(h));
      // 打印一律白底：按主题现拼的图得在 @media print 里换回白天那版，
      // 少列一个（比如以后加了某个 OLL 编号）就是「印出来那张是黄顶的白底图」
      const printBlock = (h.match(/@media print\{([\s\S]*?)\n  \}/) || ['', ''])[1];
      const dynIds = [...h.matchAll(/data-(shape|oll)="([\w-]+)"/g)].map(m => m[1] + '=' + m[2]);
      const missing = [...new Set(dynIds)].filter(id => {
        const [k, v] = id.split('=');
        const dir = k === 'shape' ? 'tutorial/shape-' + v : 'oll/oll-' + v;
        return !printBlock.includes('content:url(' + dir + '-day-256x256.png)');
      });
      ok('教程：打印时把昼夜两版的图换回白天那版（每种都列到了）',
        missing.length === 0, missing.join(' '));
      // 第 3 步那两张插入图、第 7 步那两张 U 型图
      ok('教程：第 3 步两张插入图都在',
        h.includes('src="tutorial/middle1-256x258.png"') && h.includes('src="tutorial/middle2-256x258.png"'));
      ok('教程：第 7 步 Ua / Ub 用 PLL 页面那两张图',
        h.includes('src="pll/pll-Ua-256x256.png"') && h.includes('src="pll/pll-Ub-256x256.png"'));
      // 图下面挂说明、编号压在图左上角、点图能看大图
      ok('教程：编号角标在图上（.no 在 .box 里），说明写在图下面（.cap）',
        /<span class="box"><img[^>]*data-zoom><span class="no">/.test(h) &&
        /<\/span><span class="cap">/.test(h));
      ok('教程：表格里的图都能点开看大图（data-zoom）',
        (h.match(/<img[^>]*data-zoom/g) || []).length >= 20,
        String((h.match(/<img[^>]*data-zoom/g) || []).length));
      // 记号表退回静态那一版（不再是脚本生成的箭头图）
      ok('教程：公式记号表是静态的（没有内联 SVG 箭头）',
        /<code>x y z<\/code>/.test(h) && !/data-top|<svg class="topview"/.test(h));
      // 编号角标不能只是「有 class="no"」——样式漏掉的话它就是一段裸文字，
      // 排在图片下面，跟 OLL / PLL / F2L 页那种压在左上角的角标完全两回事。
      // 这里把四页的规则抠出来按「去空白」比对，防止哪天又各改各的。
      const badgeOf = f => {
        const m = f.replace(/\s+/g, ' ').match(/td\.pic \.no\{([^}]*)\}/);
        return m ? m[1].replace(/\s+/g, '') : null;
      };
      const badge = badgeOf(h);
      ok('教程：编号角标有样式（半透明底 + 绝对定位，不是裸文字）',
        !!badge && /position:absolute/.test(badge) && /background:var\(--badge\)/.test(badge),
        String(badge));
      ['oll.html', 'pll.html', 'f2l.html'].forEach(p => {
        const other = badgeOf(fs.readFileSync(path.join(__dirname, '..', p), 'utf8'));
        ok('教程：编号角标样式与 ' + p + ' 一致', !!badge && other === badge,
          badge + ' vs ' + other);
      });
      const one = h.replace(/\s+/g, ' ');
      ok('教程：角标挂在 .box 上（.box 得是定位父级）',
        /td\.pic \.box\{position:relative/.test(one));
      ok('教程：图下说明另起一行（.cap 是块级）',
        /\.cases \.cap\{display:block/.test(one));

      // 第 4 步那四种形状：用户要求「缩小 + 排同一行」。
      // 之前它们没有样式，四张 256px 的图竖着排，一屏都放不下。
      const shapes = (h.match(/<div class="shapes">([\s\S]*?)<\/div>/) || ['', ''])[1];
      ok('教程：第 4 步四种形状包在同一个 .shapes 里',
        (shapes.match(/<figure>/g) || []).length === 4 &&
        ['dot', 'line', 'corner', 'cross'].every(k => shapes.includes('data-shape="' + k + '"')),
        String((shapes.match(/<figure>/g) || []).length));
      ok('教程：.shapes 是 flex 且不换行（四个并排一行）',
        /\.shapes\{display:flex/.test(one) && /flex-wrap:nowrap/.test(one));
      const sw = (one.match(/\.shapes img\{width:(\d+)px;height:(\d+)px/) || []);
      ok('教程：形状图缩小了（88px，远小于原图 256px）',
        sw[1] === '88' && sw[2] === '88', sw[0]);

      // 第 4 步表里配的就是上面那两张形状图（拐角型 / 一字型），不挂 OLL 编号 ——
      // 用户点名要的：图要和自己画的形状图一致，别自作聪明加个 44 / 45 角标
      const t4 = (h.match(/<section id="s4">[\s\S]*?<\/table>/) || [''])[0];
      ok('教程：第 4 步表用形状图（拐角型 / 一字型，同一份昼夜两版的图）',
        /class="box"><img data-shape="corner"/.test(t4) &&
        /class="box"><img data-shape="line"/.test(t4));
      ok('教程：第 4 步表里不带公式编号（.no / data-oll 都没有）',
        !/class="no"/.test(t4) && !/data-oll/.test(t4));

      // 第 7 步第二张表（两次小鱼）用用户新画的两张带箭头的图 + 用户给的两条公式。
      // 局面类型算过了：top5 是 Ua、top4 是 Ub（颜色和箭头两个角度都对得上），
      // 公式也验过：R'...y' L... 正好解开 top5，L...y R'... 正好解开 top4。
      // 所以 Ua 那一行配 top5、Ub 那一行配 top4 —— 别按文件名顺序硬套。
      const rows7 = (h.match(/<thead><tr><th>情况<\/th><th>用两次小鱼公式<\/th>[\s\S]*?<\/table>/) || [''])[0];
      ok('教程：第 7 步第二张表的 Ua 行 = top5 图 + 用户给的 26 y\' 27',
        /top5-256x256\.png"[\s\S]*?<span class="no">Ua<\/span>[\s\S]*?<code>R' U' R U' R' U2 R y' L U L' U L U2 L'<\/code>/.test(rows7));
      ok('教程：第 7 步第二张表的 Ub 行 = top4 图 + 用户给的 27 y 26',
        /top4-256x256\.png"[\s\S]*?<span class="no">Ub<\/span>[\s\S]*?<code>L U L' U L U2 L' y R' U' R U' R' U2 R<\/code>/.test(rows7));
      ok('教程：第 7 步第一张表仍然用 PLL 页面那四张图（Ua/Ub/H/Z）',
        ['Ua', 'Ub', 'H', 'Z'].every(id =>
          h.includes('src="pll/pll-' + id + '-256x256.png"')));
    }
  });
}

console.log('\n[11b] 级联：主按钮真的赢了（不是被旁边那套规则抢走）');
{
  // 光看源码里「有没有那条规则」是不够的：一条更具体的相邻规则（比如
  // .ctrl button:hover:not(:disabled)）完全可能把主按钮的字色抢走 ——
  // 悬停时图标变暗、在深底上看不见，就是这么来的。这里按 CSS 的规则
  // 真算一遍：解析出所有规则 -> 按选择器匹配 -> 比特异性 -> 取声明。
  const srcAll = fs.readFileSync(path.join(__dirname, '..', 'calc.html'), 'utf8');
  let css = (srcAll.match(/<style>([\s\S]*?)<\/style>/) || ['', ''])[1]
    .replace(/\/\*[\s\S]*?\*\//g, '');
  // 先摘掉 @media / @keyframes 这些带嵌套的块（正则解析不了嵌套花括号）
  for (const at of ['@media', '@keyframes']) {
    let i;
    while ((i = css.indexOf(at)) >= 0) {
      let d = 0, j = css.indexOf('{', i);
      if (j < 0) { css = css.slice(0, i); break; }
      for (let k = j; k < css.length; k++) {
        if (css[k] === '{') d++;
        else if (css[k] === '}') { d--; if (d === 0) { css = css.slice(0, i) + css.slice(k + 1); break; } }
      }
      if (d !== 0) break;
    }
  }
  const rules = [];
  for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const decls = {};
    m[2].split(';').forEach(d => {
      const i = d.indexOf(':');
      if (i < 0) return;
      decls[d.slice(0, i).trim()] = d.slice(i + 1).trim();
    });
    rules.push({ sels: m[1].split(',').map(x => x.trim()).filter(Boolean), decls });
  }
  // 只认「后代组合 + 复合选择器（标签 / .类 / :hover / :disabled / :not(:disabled)）」，
  // 别的（伪元素、属性选择器、子代组合…）当不认识，直接跳过 —— 宁可少算，不要算错
  const tokens = comp => (comp.match(/:not\([^)]*\)|[:.][\w-]+/g) || []);
  const COMP = /^([a-zA-Z][\w-]*)?((?:[.#:][\w-]+|:not\([^)]*\))*)$/;
  const okComp = comp => COMP.test(comp) && tokens(comp).every(t =>
    t[0] === '.' || t === ':hover' || t === ':disabled' || t === ':not(:disabled)');
  const spec = sel => {
    const parts = sel.split(/\s+/);
    if (!parts.every(okComp)) return null;
    let cls = 0, el = 0;
    parts.forEach(p => {
      if (/^[a-zA-Z]/.test(p)) el++;
      tokens(p).forEach(() => { cls++; });          // .类 / :hover / :disabled / :not(...) 都算一档
    });
    return cls * 1000 + el;                        // 同一档里再比元素数就够了
  };
  const hitComp = (comp, e) => {
    const m = comp.match(COMP);
    if (!m) return false;
    if (m[1] && m[1].toLowerCase() !== e.tag) return false;
    for (const t of tokens(comp)) {
      if (t[0] === '.') { if (!e.classes.includes(t.slice(1))) return false; }
      else if (t === ':hover') { if (!e.hover) return false; }
      else if (t === ':disabled') { if (!e.disabled) return false; }
      else if (t === ':not(:disabled)') { if (e.disabled) return false; }
      else return false;
    }
    return true;
  };
  const hits = (sel, e) => {
    const parts = sel.split(/\s+/);
    if (!hitComp(parts[parts.length - 1], e)) return false;
    let i = parts.length - 2;
    for (const anc of e.parents) { if (i < 0) break; if (hitComp(parts[i], anc)) i--; }
    return i < 0;
  };
  const winner = (e, prop) => {
    let best = null, bs = -1;
    for (const r of rules) for (const sel of r.sels) {
      const sp = spec(sel);
      if (sp === null || !hits(sel, e)) continue;
      if (r.decls[prop] === undefined) continue;
      if (sp >= bs) { bs = sp; best = r.decls[prop]; }   // 同分看谁在后面
    }
    return best;
  };
  const E = (tag, classes, o) => Object.assign(
    { tag, classes: classes || [], hover: false, disabled: false, parents: [] }, o || {});
  const panel = E('div', ['panel']);
  const ctrl = E('div', ['ctrl'], { parents: [panel] });
  const play = E('button', ['play'], { parents: [ctrl] });
  const nav = E('button', [], { parents: [ctrl] });

  // 正面对照：普通步骤键必须还是共用配方那份浅渐变（说明解析器确实在工作）
  ok('级联解析器可用：普通步骤键拿到的是共用配方的浅渐变',
    /var\(--btn-bg\)/.test(winner(nav, 'background') || '') && winner(nav, 'height') === '32px',
    String(winner(nav, 'background')));
  ok('级联：主按钮的实心深色底由它自己那条规则赢',
    /linear-gradient\(180deg, var\(--primary\) 0%, var\(--primary2\) 100%\)/.test(winner(play, 'background') || ''),
    String(winner(play, 'background')));
  ok('级联：主按钮更高（40px）、圆角更小（6px）；旁边的键还是 32px',
    winner(play, 'height') === '40px' && winner(play, 'border-radius') === '6px' &&
    winner(nav, 'border-radius') === '7px',
    [winner(play, 'height'), winner(play, 'border-radius')].join(' / '));
  ok('级联：投影是主按钮自己那两层（比旁边的重）',
    /0 6px 16px var\(--primary-drop\)/.test(winner(play, 'box-shadow') || '') &&
    /0 1px 2px var\(--btn-drop\)/.test(winner(nav, 'box-shadow') || ''),
    String(winner(play, 'box-shadow')));
  // 这条就是加这一节的原因：悬停时旁边那套 .ctrl button:hover 更具体，
  // 不显式写死字色的话，图标会在深底上变成 --text（几乎看不见）
  const ph = E('button', ['play'], { parents: [ctrl], hover: true });
  const nh = E('button', [], { parents: [ctrl], hover: true });
  ok('级联：主按钮悬停时字色仍是 --primary-fg（没被步骤键的悬停规则抢走）',
    winner(ph, 'color') === 'var(--primary-fg)' && winner(ph, 'background').indexOf('--primary') > 0,
    String(winner(ph, 'color')));
  ok('级联：主按钮悬停的抬升 / 投影也是它自己那份',
    winner(ph, 'translate') === '0 -1px' && /0 11px 24px var\(--primary-drop\)/.test(winner(ph, 'box-shadow') || ''),
    String(winner(ph, 'box-shadow')));
  ok('级联：普通步骤键悬停时字色提亮成正文色',
    winner(nh, 'color') === 'var(--text)' && winner(nh, 'translate') === '0 -1px',
    String(winner(nh, 'color')));
  ok('级联：播放中主按钮带主色光环',
    /0 0 0 3px var\(--accent-glow\)/.test(
      winner(E('button', ['play', 'playing'], { parents: [ctrl] }), 'box-shadow') || ''));
  // 步骤小片：平的那一档，别被共用配方的渐变黏回去
  const chip = E('span', [], { parents: [E('div', ['moves'], { parents: [panel] })] });
  ok('级联：步骤小片是平底（--chip），没有渐变 / 投影',
    winner(chip, 'background') === 'var(--chip)' && winner(chip, 'box-shadow') == null,
    String(winner(chip, 'background')) + ' / ' + String(winner(chip, 'box-shadow')));
  // 历史：悬停底 + 当前项的字色
  const row = E('div', ['e'], { parents: [E('div', ['hist'], { parents: [panel] })] });
  const rowH = E('div', ['e'], { parents: [E('div', ['hist'], { parents: [panel] })] , hover: true});
  const rowCur = E('div', ['e', 'cur'], { parents: [E('div', ['hist'], { parents: [panel] })] });
  ok('级联：历史条目悬停浮一档；当前那一条底色浮一档 + 正文色（不再整圈主色描边）',
    winner(row, 'background') === 'var(--field)' &&
    winner(rowH, 'background') === 'var(--field-hover)' &&
    winner(rowCur, 'background') === 'var(--field-hover)' &&
    winner(rowCur, 'color') === 'var(--text)',
    [winner(rowH, 'background'), winner(rowCur, 'background')].join(' / '));
  // 走过的步骤片：`.done` 和 `:hover` 同分又排后面，光写 :hover 等于没反应
  const moveBox = E('div', ['moves'], { parents: [panel] });
  const doneChip = E('span', ['done'], { parents: [moveBox], hover: true });
  ok('级联：走过的步骤片 hover 时也是「浮起一层底 + 短投影」',
    winner(doneChip, 'background') === 'var(--chip-hover)' &&
    winner(doneChip, 'color') === 'var(--text)' &&
    /0 2px 6px var\(--btn-drop\)/.test(winner(doneChip, 'box-shadow') || ''),
    [winner(doneChip, 'background'), winner(doneChip, 'box-shadow')].join(' / '));
  // 当前那一片自己不画底/光晕：交给会滑动的那条色块（.moves .pill）
  ok('级联：当前那一片自己不画底（底和光晕交给会滑动的色块）',
    winner(E('span', ['cur'], { parents: [moveBox] }), 'background') === 'transparent' &&
    /var\(--accent-glow\)/.test(winner(E('span', ['pill'], { parents: [moveBox] }),
      'box-shadow') || ''));
  // 单步键盘是「一块键盘」：平底、没有投影 —— 别被共用那套立体配方黏回去
  const mvKey = E('button', [], { parents: [E('div', ['mv'], { parents: [panel] })] });
  ok('级联：单步键是平底（--field）、没有投影，字是正文色',
    winner(mvKey, 'background') === 'var(--field)' && winner(mvKey, 'box-shadow') === 'none' &&
    winner(mvKey, 'color') === 'var(--text)',
    String(winner(mvKey, 'background')) + ' / ' + String(winner(mvKey, 'box-shadow')));
  // 不能点的主按钮要褪成灰底、投影摘掉（不然看着还能点）
  const playOff = E('button', ['play'], { parents: [ctrl], disabled: true });
  ok('级联：不能点的播放键褪成灰底、没有投影',
    winner(playOff, 'box-shadow') === 'none' && winner(playOff, 'background') === 'var(--field)',
    String(winner(playOff, 'box-shadow')) + ' / ' + String(winner(playOff, 'background')));
}

console.log('\n[12] 提交 / 历史 / 累积（端到端，真的点提交）');
{
  // 这一节要跑动画，所以是异步的：末尾再汇总退出。
  const vm = require('vm');
  const mkEl = (t, init) => {
    const e = { tagName: t, children: [], dataset: {},
      // 页面靠 style.setProperty 写 --cs（缩放），桩得支持
      style: { setProperty(k, v) { this[k] = v; } },
      classList: { _s: new Set(), add(c) { this._s.add(c); }, remove(c) { this._s.delete(c); },
        toggle(c, v) { v === undefined ? (this._s.has(c) ? this._s.delete(c) : this._s.add(c)) : (v ? this._s.add(c) : this._s.delete(c)); },
        contains(c) { return this._s.has(c); } },
      _handlers: {},
      addEventListener(ev, fn) { (this._handlers[ev] = this._handlers[ev] || []).push(fn); },
      fire(ev, arg) { (this._handlers[ev] || []).forEach(f => f(arg || {})); },
      // 真 DOM 的 appendChild 会写上 parentNode —— 桩不写的话，
      // 「这个元素还在不在树里」这类判断全会误判（高亮色块会被反复重建）
      appendChild(c) { this.children.push(c); c.parentNode = this; return c; },
      querySelectorAll() { return []; }, querySelector() { return null; },
      setPointerCapture() {}, closest() { return null; }, offsetWidth: 1,
      // 拍照链路要用到：canvas 的 2d 上下文 + toBlob、<a download> 的 click
      getContext() { return { fillStyle: '', fillRect() {}, drawImage() {} }; },
      toBlob(cb, mime) { cb(new Blob(['png-bytes'], { type: mime || 'image/png' })); },
      click() { if (this.download) downloads.push(this.download); },
      remove() {},
      focus() { this._focused = true; },
      setAttribute(k, v) { this['_a_' + k] = String(v); },
      value: init || '',
      // 真 DOM 换 innerHTML 时旧的子节点会掉线（parentNode 变 null）——
      // 桩不照做的话，「这个元素还在树里吗」的判断会误判（高亮色块就不会重建）
      set innerHTML(v) {
        (this.children || []).forEach(c => { c.parentNode = null; });
        this._h = v;
      },
      get innerHTML() { return this._h || ''; },
      set textContent(v) { this._t = v; }, get textContent() { return this._t === undefined ? '' : this._t; },
      set disabled(v) { this._d = v; }, get disabled() { return this._d; } };
    return e;
  };
  const els = { alg: mkEl('input', 'R U') };
  els.cube = mkEl('div');
  // 舞台给个尺寸：fit() 才会真的算出 --cs（否则它一开头就 return，
  // 缩放那几条断言就没有基准值可对）
  els.stage = mkEl('div');
  els.stage.clientWidth = 600;
  els.stage.clientHeight = 600;
  /* 步骤条：桩也得有「孩子」—— chrome() 靠 children 上色，scrollStrip() 靠它找当前块。
     顺便造一套横向布局出来（块宽 30、间隔 4、可视宽 290、左端在 100），
     这样「当前步有没有被摆到视觉中心」是真能算出来核对的。 */
  const CHIP_W = 30, CHIP_GAP = 4, STRIP_W = 290, STRIP_L = 100;
  let chips = [];
  els.moves = mkEl('div');
  Object.defineProperty(els.moves, 'innerHTML', {
    get() { return this._h || ''; },
    set(v) {
      // 旧子节点要掉线（真 DOM 行为）：不然高亮色块会被误判成「还在树里」而不再重建
      (this.children || []).forEach(c => { c.parentNode = null; });
      this._h = v;
      const n = (v.match(/data-k="/g) || []).length;
      chips = [];
      for (let i = 1; i <= n; i++) {
        const c = mkEl('span');
        c.dataset.k = String(i);
        // 第 i 块相对这一条左端的位置（跟着 scrollLeft 走，和真 DOM 一致）
        c.getBoundingClientRect = () => ({
          left: STRIP_L + (i - 1) * (CHIP_W + CHIP_GAP) - els.moves.scrollLeft,
          top: 3, width: CHIP_W, height: 22 });
        // offsetLeft / offsetWidth 也摆上，而且故意扮成「offsetParent 是 body」的样子：
        // 万一有人把定位算法改回 offsetLeft，这里就会复现「永远贴最右端」那个毛病
        c.offsetLeft = 1200 + (i - 1) * (CHIP_W + CHIP_GAP);
        c.offsetWidth = CHIP_W;
        chips.push(c);
      }
      this.children = chips;
    }
  });
  els.moves.querySelector = sel =>
    (sel === 'span.cur' ? chips.filter(c => c.classList.contains('cur'))[0] : null) || null;
  els.moves.getBoundingClientRect = () => ({ left: STRIP_L, top: 0, width: STRIP_W, height: 26 });
  els.moves.clientWidth = STRIP_W;
  // 平滑滚动：把 behavior 记下来 —— 测试要确认「是滑过去，不是一跳」
  els.moves.scrollTo = function (o) { this._smooth = o.behavior; this.scrollLeft = o.left; };
  Object.defineProperty(els.moves, 'scrollWidth',
    { get() { return chips.length * (CHIP_W + CHIP_GAP); } });
  els.moves.scrollLeft = 0;
  // 六个整体旋转箭头
  els.arrows = ['x', "x'", 'y', "y'", 'z', "z'"].map(mv => {
    const b = mkEl('button');
    b.dataset.mv = mv;
    return b;
  });
  const st = {};               // 记下页面写进 localStorage 的东西（缩放持久化要查）
  const downloads = [], blobs = [];   // 拍照：记下下载的文件名和造出来的 blob
  /* 拍照要用的两个浏览器对象。按 CSS 规范实现：transform 列表从左往右相乘
     （点在最右边 → 列表里最后一个函数最先作用在点上），带 perspective 时按 w 除。 */
  const mul4 = (A, B) => A.map((r, i) => B[0].map((_, j) => r.reduce((s, v, k) => s + v * B[k][j], 0)));
  const ID4 = [[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1]];
  const DOMMatrix = function (init) {
    let m = ID4;
    const rad = d => parseFloat(d) * Math.PI / 180;
    String(init || '').replace(/([a-zA-Z]+)\(([^)]*)\)/g, (all, fn, arg) => {
      const a = rad(parseFloat(arg)), c = Math.cos(a), sn = Math.sin(a);
      let f = ID4;
      if (fn === 'rotateX') f = [[1, 0, 0, 0], [0, c, -sn, 0], [0, sn, c, 0], [0, 0, 0, 1]];
      else if (fn === 'rotateY') f = [[c, 0, sn, 0], [0, 1, 0, 0], [-sn, 0, c, 0], [0, 0, 0, 1]];
      else if (fn === 'perspective') f = [[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0], [0, 0, -1 / parseFloat(arg), 1]];
      else throw new Error('测试桩没实现 ' + fn);
      m = mul4(m, f);
      return '';
    });
    this.m = m;
  };
  DOMMatrix.prototype.transformPoint = function (p) {
    const v = [p.x, p.y, p.z, 1];
    const o = this.m.map(r => r.reduce((s, x, k) => s + x * v[k], 0));
    // 浏览器里 transformPoint **不做**透视除法（w 原样留着）。
    // 桩必须照这个来：要是桩替页面除了，页面忘了除也照样绿 —— 实测就栽在这。
    return { x: o[0], y: o[1], z: o[2], w: o[3] };
  };
  const DOMPoint = function (x, y, z) { this.x = x; this.y = y; this.z = z; };
  DOMPoint.prototype.matrixTransform = function (m) { return m.transformPoint(this); };

  const ctx = { console, navigator: {}, window: { addEventListener() {} },
    setTimeout, clearTimeout, DOMMatrix, DOMPoint,
    // 读一律给 null（等价于首次打开，不去动「恢复现场」那条路），写则记下来
    localStorage: { getItem: () => null, setItem: (k, v) => { st[k] = String(v); },
                    removeItem() {} },
    CubeSim: S,
    URL: { createObjectURL(b) { blobs.push(b); return 'blob:fake'; }, revokeObjectURL() {} },
    Blob: function (parts, o) { this.parts = parts || []; this.type = (o || {}).type; },
    Image: function () {                  // 真 Image 的 onload 是异步的，桩里同步触发
      const self = this;
      Object.defineProperty(this, 'src', {
        set(v) { self._src = v; if (self.onload) self.onload(); },
        get() { return self._src; } });
    },
    location: { hash: '' },   // 页面会读 hash 取公式
    document: { getElementById: id => els[id] || (els[id] = mkEl('div')),
                querySelectorAll: sel => sel === '.orbit button' ? els.arrows : [],
                documentElement: mkEl('html'), createElement: mkEl,
                body: { appendChild() {} },
                addEventListener(ev, fn) { (ctx._h[ev] = ctx._h[ev] || []).push(fn); } },
    _h: {} };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  const src = fs.readFileSync(path.join(__dirname, '..', 'calc.html'), 'utf8')
    .match(/<script>([\s\S]*?)<\/script>/g).map(x => x.replace(/<\/?script>/g, ''))
    .filter(x => x.includes('M3'))[0];
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'alglist.js'), 'utf8'), ctx);
  vm.runInContext(src, ctx);

  ok('起步是复原态、历史为空', String(els.hcount.textContent) === '0' &&
    els.pos.textContent === '—', els.hcount.textContent + ' / ' + els.pos.textContent);
  // reset() 会把示例公式预填进输入框，所以这里再设一次要测的公式
  els.alg.value = 'R U';

  // 解析画出来的贴纸，还原成「位置|法向 -> 颜色字母」，再和模拟器比
  const C2 = {};
  for (const x of fs.readFileSync(path.join(__dirname, '..', 'calc.html'), 'utf8')
           .match(/var COLOR = \{([^}]+)\}/)[1].matchAll(/([UDFBRL]):\s*'(#[0-9A-Fa-f]{6})'/g)) {
    C2[x[2].toUpperCase()] = x[1];
  }
  const N2 = { px: '1,0,0', nx: '-1,0,0', py: '0,1,0', ny: '0,-1,0', pz: '0,0,1', nz: '0,0,-1' };
  const readCube = () => {
    const out = {};
    for (const m of els.cube.innerHTML.matchAll(/data-pos="([^"]+)"[^>]*>([\s\S]*?)<\/div>/g)) {
      for (const x of m[2].matchAll(/class="on (\w+)"[^>]*--c:(#[0-9A-Fa-f]{6})/g)) {
        out[m[1] + '|' + N2[x[1]]] = C2[x[2].toUpperCase()];
      }
    }
    return out;
  };
  const sameState = (a, b) => {
    const ka = Object.keys(a).sort(), kb = Object.keys(b).sort();
    return ka.length === kb.length && ka.every((k, i) => k === kb[i] && a[k] === b[k]);
  };

  // 点两次提交，第二次必须接着第一次的结果往下转
  const wait = ms => new Promise(r => setTimeout(r, ms));
  (async () => {
    els.fwd.fire('click');
    await wait(1200);                     // 2 步 × (340+80)ms = 840ms，留足余量
    ok('第一次正向执行后历史有 1 条', String(els.hcount.textContent) === '1', els.hcount.textContent);
    ok('第一次提交后局面 = R U',
      sameState(readCube(), S.apply(S.solved(), 'R U')),
      JSON.stringify(readCube()).slice(0, 60));

    els.fwd.fire('click');
    await wait(1200);
    ok('第二次后历史有 2 条', String(els.hcount.textContent) === '2', els.hcount.textContent);
    ok('第二次是从上一次的结果继续（= R U R U）',
      sameState(readCube(), S.apply(S.solved(), 'R U R U')),
      JSON.stringify(readCube()).slice(0, 60));

    els.reset.fire('click');
    ok('复原后历史清空', String(els.hcount.textContent) === '0', els.hcount.textContent);
    ok('复原后回到初始态', sameState(readCube(), S.solved()));
    // 复原要把视角也带回默认（从 b 版公式跳来时视角补过 90 度）
    ok('复原会把视角带回默认（红面在左、绿面在右）',
      /function reset\(\)[\s\S]{0,700}?view\.x = VIEW\.x;[\s\S]{0,80}?view\.y = VIEW\.y;/.test(src), '复原没有重置视角');

    // ---- 反向执行 ----
    // 逆运算的关键是「顺序也要倒过来」：R U 的逆是 U' R'，不是 R' U'
    const srcText = fs.readFileSync(path.join(__dirname, '..', 'calc.html'), 'utf8');
    ok('取逆时倒序遍历（顺序也反过来）',
      /function invert\(list\)[\s\S]*?for \(var i = list\.length - 1; i >= 0; i--\)/.test(srcText));
    ok('正向 / 反向是一对按钮',
      /id="fwd"/.test(srcText) && /id="rev"/.test(srcText) &&
      /\.run button\{flex:1/.test(srcText));

    els.reset.fire('click');
    els.alg.value = 'R U';
    els.rev.fire('click');                       // 直接反向执行（不再是开关）
    await wait(1200);
    ok('反向提交后局面 = 逆（U\' R\'）',
      sameState(readCube(), S.apply(S.solved(), "U' R'")),
      JSON.stringify(readCube()).slice(0, 50));
    ok('历史里标了反向', /class="tag"/.test(els.hist.innerHTML), els.hist.innerHTML.slice(0, 80));

    // 最强的语义检查：正着做一遍、再反着做一遍，应当回到原样
    els.reset.fire('click');
    els.alg.value = "R U R' U' F";               // 5 步 -> 约 2.1s
    els.fwd.fire('click');
    await wait(2600);
    const midway = readCube();
    els.rev.fire('click');                       // 反向执行同一串
    await wait(2600);
    ok('正向做完再反向做一遍 -> 回到复原态',
      sameState(readCube(), S.solved()),
      '中途 ' + JSON.stringify(midway).slice(0, 40));

    // ---- 动作按钮：整体旋转箭头 + 单步键盘 ----
    const src2 = fs.readFileSync(path.join(__dirname, '..', 'calc.html'), 'utf8');
    // 按容器取 data-mv：现在页面上有两组动作按钮，不能整篇扫
    const mvsIn = cls => {
      const m = src2.match(new RegExp('<div class="' + cls + '">([\\s\\S]*?)</div>'));
      return m ? [...m[1].matchAll(/data-mv="([^"]+)"/g)].map(x => x[1]) : [];
    };
    const arrows = mvsIn('orbit');
    ok('有 6 个整体旋转箭头（' + arrows.join(' ') + '）', arrows.length === 6, arrows.join(','));
    ok('覆盖 x/x\' y/y\' z/z\'',
      ['x', "x'", 'y', "y'", 'z', "z'"].every(m => arrows.includes(m)), arrows.join(','));

    // 单步键盘：六个面 × 两个方向，点一下就把这一步做掉
    const FACES = ['U', 'D', 'L', 'R', 'F', 'B'];
    const keys = mvsIn('mv');
    ok('单步键盘有 12 个键（六个面 × 两个方向）：' + keys.join(' '),
      keys.length === 12, keys.join(','));
    ok('六个面都齐、顺时针 / 逆时针成对',
      FACES.every(f => keys.includes(f) && keys.includes(f + "'")), keys.join(','));
    // 用真模拟器验：每个键都必须是「一步、90°」——写错面或写错方向这里就红
    const badKey = keys.filter(k => {
      const l = S.steps(k);
      return l.length !== 1 || Math.abs(l[0].times) !== 1;
    });
    ok('每个单步键都是模拟器认得的单步（一步 90°）', badKey.length === 0, badKey.join(','));
    ok('单步键走同一套执行入口（动画 + 记进历史，kind=move）',
      /querySelectorAll\('\.mv button'\)[\s\S]{0,200}?doMove\(b\.dataset\.mv, 'move'\)/.test(src2));
    ok('整体旋转也走那个入口（kind=rotate）',
      /querySelectorAll\('\.orbit button'\)[\s\S]{0,200}?doMove\(b\.dataset\.mv, 'rotate'\)/.test(src2));
    // 一次转动 340ms，连点一串比动画快 —— 必须是排队，不能忙就丢
    ok('动画没转完时的单击会排队，而不是被丢掉',
      /if \(busy\) \{ if \(queue\.length < 16\) queue\.push\(mv\); return; \}/.test(src2) &&
      /function drainQueue\(\)/.test(src2) && /drainQueue\(\);/.test(src2));
    // 跳转过来的播放和「在框里输入 + 正向运行」必须是一条路：
    // 不另开一套「忙不忙」的规矩（否则按键行为会两样）
    ok('执行公式就是一次播放：run() 摆好步骤后交给 autoPlay()',
      !/demoActive|cancelDemo/.test(src2) && !/startLikePlay/.test(src2) &&
      /function run\(list, label, kind, rev\) \{\s*if \(!list\.length\) return;/.test(src2) &&
      /autoPlay\(afterRun\(\)\)/.test(src2) &&
      /document\.getElementById\('play'\)\.addEventListener\('click', function \(\) \{ autoPlay\(\); \}\)/.test(src2) &&
      /function submit\(kind, rev\) \{\s*if \(pausedFirst\(\)\) return;\s*if \(busy\) return;/.test(src2));
    // 顺序反过来：先把这一条记进历史（并把累积局面推到末尾），再开始播动画
    ok('先记账再播动画（hist.push 排在 autoPlay 之前，按了就有反馈）',
      /showSteps\(list, cur\);\s*\n\s*at = 0;\s*\n\s*\/\/ 先记账[\s\S]{0,200}?hist\.push\(\{ kind: kind \|\| 'alg'[\s\S]{0,200}?cur = frames\[frames\.length - 1\];[\s\S]{0,120}?autoPlay\(afterRun\(\)\);/.test(src2) &&
      // 播放键不再需要「收尾」（没有 pendingRun 这套东西了）
      !/pendingRun|finishRun/.test(src2));
    // 改动局面的按钮（提交 / 打乱 / 单步）保持「先暂停、再点一次」；
    // 导航类的（点某一步 / 点历史 / 回到开头末尾）点了就直接过去 —— 连播中也一样
    const movesClick = (src2.match(/movesEl\.addEventListener\('click', function \(e\) \{[\s\S]*?\n  \}\);/) || [''])[0];
    const histClick = (src2.match(/histEl\.addEventListener\('click', function \(e\) \{[\s\S]*?\n  \}\);/) || [''])[0];
    ok('连播中点步骤 / 点历史直接跳过去，不再只暂停一下',
      /jump\(\+el\.dataset\.k\);/.test(movesClick) && !/pausedFirst/.test(movesClick) && !/busy/.test(movesClick) &&
      /goHist\(\+el\.dataset\.i\);/.test(histClick) && !/pausedFirst/.test(histClick) &&
      // 点历史里的「复制」还是只复制，不回溯
      /if \(cp\) \{ copyHist\(\+cp\.dataset\.i, cp\); return; \}/.test(histClick));
    // 点某一步 / 点历史 = 换个位置看：必须当场把连播停掉，否则自动播放那圈
    // 会在下一步里把人拽回原处（playing 还是 true）
    ok('跳转 / 回溯都会停下连播并作废在跑的动画',
      /function jump\(k\) \{[\s\S]{0,200}?epoch\+\+;[\s\S]{0,80}?playing = false;[\s\S]{0,80}?busy = false;/.test(src2) &&
      /function goHist\(i\) \{[\s\S]{0,260}?epoch\+\+;[\s\S]{0,140}?playing = false;[\s\S]{0,60}?busy = false;/.test(src2));
    ok('复原 / 跳转会清掉排队的单步',
      /function reset\(\) \{[\s\S]{0,200}?queue\.length = 0/.test(src2) &&
      /function jump\(k\) \{[\s\S]{0,300}?queue\.length = 0/.test(src2));

    // ---- 舞台四周的旋转键：无边框的大按键，形状是折角 / 圆弧 ----
    const orbitHTML = (src2.match(/<div class="orbit">[\s\S]*?<\/div>/) || [''])[0];
    ok('旋转键是无边框的大按键（56px 命中区，没有底、没有边）',
      /\.orbit button\{[^}]*width:56px;height:56px[^}]*border:0;background:none;box-shadow:none/.test(src2));
    ok('旋转键用的是内联 SVG，不是 ↑↓⟲ 这类字符（字符在不同系统上会变 emoji）',
      (orbitHTML.match(/<svg /g) || []).length === 6 &&
      !/[\u2190-\u21ff\u27f0-\u27ff\u2b00-\u2bff]/.test(orbitHTML));
    // 折角朝哪边，必须和它标的动作对得上 —— 画反了就是真 bug
    const polyOf = cls => {
      const m = src2.match(new RegExp('<button class="' + cls + '"[\\s\\S]*?<polyline points="([^"]+)"'));
      // points="x0 y0 x1 y1 x2 y2" -> 摊平成一串数字
      return m ? m[1].trim().split(/[\s,]+/).map(Number) : null;
    };
    const pointAt = (cls, axis, want) => {
      const q = polyOf(cls);
      if (!q || q.length !== 6) return false;
      const mid = q[axis + 2], ends = [q[axis], q[axis + 4]];
      return want === 'min' ? mid < Math.min(...ends) : mid > Math.max(...ends);
    };
    ok('上翻键（x）的折角朝上', pointAt('n', 1, 'min'));
    ok('下翻键（x\'）的折角朝下', pointAt('s', 1, 'max'));
    ok('左转键（y）的折角朝左', pointAt('w', 0, 'min'));
    ok('右转键（y\'）的折角朝右', pointAt('e', 0, 'max'));
    ok('滚动的两个键画的是圆弧 + 箭头（不是折角）',
      /<button class="z1"[\s\S]*?<path\s+d="M[\d. ]+A[\d. ]+ 1 0 [\d. ]+"[\s\S]*?<polyline/.test(src2) &&
      /<button class="z2"[\s\S]*?<path\s+d="M[\d. ]+A[\d. ]+ 1 1 [\d. ]+"[\s\S]*?<polyline/.test(src2));
    ok('悬停染色并放大、按下缩一点（用 scale，不动定位用的 transform）',
      /\.orbit button:hover:not\(:disabled\)\{[^}]*color:var\(--accent-text\);scale:1\.12\}/.test(src2) &&
      /\.orbit button:active:not\(:disabled\)\{scale:\.96\}/.test(src2));
    ok('无边框按钮也有焦点圈（键盘走到它时看得见）',
      /\.orbit button:focus-visible\{[^}]*outline:2px solid var\(--accent-text\)/.test(src2));

    // ---- 面板按钮的「质感」：一份共用配方 + 三个状态 ----
    ok('面板按钮共用同一份底色配方（不再各写各的 background）',
      /\.run button, \.ctrl button, \.openpick, \.tabs button, \.phandle, \.paste\{/.test(src2) &&
      /background:linear-gradient\(180deg, var\(--btn-bg\) 0%, var\(--btn-bg2\) 100%\)/.test(src2));
    // 播放键、步骤小片、单步键盘、速度行的「默认」都不在这份配方里 ——
    // 它们各自要的是「不一样」：一屏只有一个主按钮，其余靠「没有按钮的壳」退到后面
    ok('主按钮 / 步骤小片 / 单步键盘 / 「默认」键不共用那份配方',
      !/\.ctrl button, \.play,/.test(src2) && !/\.tabs button, \.moves span,/.test(src2) &&
      !/\.tabs button, \.mv button/.test(src2) && !/\.mv button, \.phandle, \.spd \.mini/.test(src2));

    // ---- 视觉层次：主按钮、配角、更次要的字，各是一档 ----
    // 用户的要求：中间那个播放键要明显是主按钮（更大更深、投影更重、圆角更小），
    // 旁边的东西不能和它一样重。
    ok('播放键是主按钮：更高更宽、圆角更小、实心深色、投影更重',
      /\.ctrl \.play\{flex:0 0 56px;height:40px;border-radius:6px/.test(src2) &&
      /background:linear-gradient\(180deg, var\(--primary\) 0%, var\(--primary2\) 100%\)/.test(src2) &&
      /0 2px 4px var\(--primary-drop\), 0 6px 16px var\(--primary-drop\)/.test(src2) &&
      /color:var\(--primary-fg\)/.test(src2));
    ok('播放键比旁边的步骤键大一号（40 vs 32），步骤键压灰一档',
      /\.ctrl button\{flex:1;height:32px[^}]*color:var\(--muted\)/.test(src2) &&
      /\.ctrl \.play\{[^}]*height:40px/.test(src2));
    // 旁边那套 .ctrl button:hover 比 .ctrl .play 更具体 —— 样子必须在三态里都写全
    ok('主按钮的实心底 / 字色在普通、悬停、按下三态都写死了',
      /\.ctrl \.play,\s*\n\s*\.ctrl \.play:hover:not\(:disabled\),\s*\n\s*\.ctrl \.play:active:not\(:disabled\)\{color:var\(--primary-fg\);border-color:var\(--primary2\);\s*\n\s*background:linear-gradient\(180deg, var\(--primary\) 0%, var\(--primary2\) 100%\)\}/.test(src2));
    ok('播放中的光环连悬停那条也写着（不然会被旁边那套投影盖掉）',
      /\.ctrl \.play\.playing,\s*\n\s*\.ctrl \.play\.playing:hover:not\(:disabled\)\{box-shadow:/.test(src2));
    ok('播放中：主按钮套一圈主色光环',
      /\.ctrl \.play\.playing,[\s\S]{0,120}?0 0 0 3px var\(--accent-glow\)/.test(src2));
    ok('段落小标题是正文色 + 加粗 + 底下一条细线（以前和说明一个灰）',
      /\.sec > h2\{[^}]*color:var\(--text\);font-weight:700;\s*\n?\s*border-bottom:1px solid var\(--line\)/.test(src2) &&
      /\.sec > h2 \.pos\{[^}]*color:var\(--muted2\)/.test(src2));
    ok('历史：指上去有底色，当前那一条左侧一条主色指示条',
      /\.hist \.e\{[^}]*cursor:pointer/.test(src2) &&
      /\.hist \.e:hover\{background:var\(--field-hover\);border-color:var\(--line-strong\);color:var\(--text\)\}/.test(src2) &&
      /\.hist \.e\.cur::before\{content:'';position:absolute;left:-1px;top:-1px;bottom:-1px;width:3px;/.test(src2) &&
      /border-radius:7px 0 0 7px;background:var\(--accent\)\}/.test(src2));
    // 步骤条不许换行：十一二步一换行会变成「9 个 + 2 个」两行，像被挤下去的
    ok('步骤条是单行横滚（不换行）+ 当前那个自动滚进视野',
      /\.moves\{position:relative;display:flex;flex-wrap:nowrap[^}]*overflow-x:auto/.test(src2) &&
      /\.moves span\{flex:none;white-space:nowrap/.test(src2) &&
      /function scrollStrip\(\)/.test(src2) &&
      /movesEl\.scrollLeft = want/.test(src2) &&
      // 只动这一条自己的 scrollLeft：scrollIntoView 会顺手把整块面板也滚一下
      !/\.scrollIntoView\(/.test(src2) &&
      /el\.classList\.toggle\('done', k < at\);\s*\n\s*\}\);\s*\n\s*placePill\(\);\s*\n\s*scrollStrip\(\);/.test(src2) &&
      // 滑过去而不是一跳：能平滑就平滑，系统要求「减少动态效果」才瞬移
      /movesEl\.scrollTo && !noMotion\(\)/.test(src2) &&
      /scrollTo\(\{ left: want, behavior: 'smooth' \}\)/.test(src2));
    // 滚动条藏起来，改成滚轮 / 按住拖（手机横划走原生那套）
    ok('步骤条没有滚动条，靠滚轮 / 按住拖滚动',
      /\.moves\{[^}]*scrollbar-width:none/.test(src2) &&
      /\.moves::-webkit-scrollbar\{display:none/.test(src2) &&
      /movesEl\.addEventListener\('wheel'/.test(src2) &&
      /\{ passive: false \}/.test(src2) &&
      // 到头了要放行，不然鼠标停在步骤条上整块面板就滚不动了
      /if \(want === movesEl\.scrollLeft\) return;/.test(src2) &&
      /movesEl\.addEventListener\('pointerdown'/.test(src2) &&
      /movesEl\.scrollLeft = stripPan\.left - dx/.test(src2) &&
      // 拖完那一下不许当成「点某一步」
      /if \(stripDragged\) \{ stripDragged = false; return; \}/.test(src2));
    // 黄色（主色）只表示「当前 / 正在播」：历史里那个「反向执行」角标是说明，不是状态
    ok('「反向执行」角标不再用主色（黄只留给当前状态）',
      /\.hist \.e \.tag\{flex:none;background:var\(--chip-hover\);color:var\(--text\)/.test(src2) &&
      !/\.hist \.e \.tag\{[^}]*var\(--accent\)/.test(src2));
    // 速度读数是数据（正文色），「默认」是次要动作（ghost）
    ok('速度读数提到正文色，「默认」键降成 ghost',
      /\.spd \.val\{[^}]*color:var\(--text\)/.test(src2) &&
      /\.spd \.mini\{[^}]*background:none;border:1px solid var\(--line\);color:var\(--muted2\)/.test(src2));
    // 纵向节奏：空的提示行不该占着一行高度
    ok('没消息时提示行不占高度（公式和单步之间不再白空一行）',
      /\.err\{margin-top:9px;color:#c0392b;font-size:12\.5px\}/.test(src2) &&
      /\.err:empty\{margin-top:0;min-height:0\}/.test(src2) &&
      /\.sec\{margin-bottom:16px\}/.test(src2));
    ok('步骤小片 hover 时浮起一层短投影（走过的那些也一样）',
      /\.moves span:hover\{background:var\(--chip-hover\);color:var\(--text\);\s*\n?\s*box-shadow:0 2px 6px var\(--btn-drop\)\}/.test(src2) &&
      // `.done` 和 `:hover` 同分又排在后面，会把底色/字色按住 —— 必须单独再来一条
      /\.moves span\.done:hover\{background:var\(--chip-hover\);color:var\(--text\);\s*\n?\s*box-shadow:0 2px 6px var\(--btn-drop\)\}/.test(src2));
    // 「当前这一步」的高亮：一条会滑过去的色块（和顶部导航那条 .pill 一个思路）。
    // 层次是：小片自己的底（在流里）< 色块（absolute）< 小片里的字（那层 <b> 抬到 z-index:2），
    // 所以它滑过去的路上既不挡字母、也不会被别的小片遮住。
    ok('当前步骤的高亮是一条会滑的色块（不是这块灭、那块亮）',
      /\.moves \.pill\{position:absolute;[^}]*transition:left \.18s/.test(src2) &&
      /\.moves \.pill\.instant\{transition:none\}/.test(src2) &&
      /pointer-events:none/.test(src2) &&
      /\.moves span b\{position:relative;z-index:2;font-weight:inherit\}/.test(src2) &&
      /\.moves \.pill\{[^}]*z-index:1/.test(src2) &&
      /<b>' \+ mvLabel\(x\) \+ '<\/b>/.test(src2) &&
      /function placePill\(\)/.test(src2) && /function pillEl\(\)/.test(src2) &&
      // 换了一串步骤时直接落位，别从上一处飞过来
      /var pillInstant = true;/.test(src2) && /if \(pillInstant\)/.test(src2));
    ok('步骤小片是平的（没有渐变 / 投影），当前那一片的底交给色块',
      /\.moves span\{[^}]*background:var\(--chip\);border:1px solid transparent/.test(src2) &&
      /\.moves span\.done\{color:var\(--muted\);background:transparent\}/.test(src2) &&
      /\.moves span\.cur\{background:transparent;border-color:transparent;color:var\(--on-accent, #fff\)\}/.test(src2) &&
      !/\.moves span\{[^}]*linear-gradient/.test(src2));
    ok('无边框的旋转键不在那份配方里（否则会被加回底色和边框）',
      !/\\.mv button, \\.orbit button\\{/.test(src2));
    ok('凸起靠三层：顶边高光 + 底边暗边 + 落地投影',
      /inset 0 1px 0 var\(--btn-hi\), inset 0 -1px 0 var\(--btn-shade\),\s*\n\s*0 1px 2px var\(--btn-drop\)/.test(src2));
    ok('指上去抬 1px、投影变长', /translate:0 -1px;/.test(src2) &&
      /0 3px 8px var\(--btn-drop\)/.test(src2));
    ok('按下去换成内阴影（真的陷进去）', /translate:0 1px;/.test(src2) &&
      /box-shadow:inset 0 2px 5px var\(--btn-shade\)/.test(src2));
    // 环绕舞台的箭头靠 transform 定位（translateX(-50%) 之类）——
    // 抬升要是也用 transform，鼠标一指箭头就会跑位
    ok('抬升用 translate 而不是 transform（否则箭头会跑位）',
      /translate:0 -1px/.test(src2) && !/button:hover[^{]*\{[^}]*transform:translateY/.test(src2));
    ok('按钮的颜色只引用 theme.css 的 --btn-*（页面里不写死、也不重定义）',
      ['--btn-bg', '--btn-bg2', '--btn-hi', '--btn-shade', '--btn-drop']
        .every(t => src2.includes('var(' + t + ')')) &&
      !/--btn-[\w-]+\s*:/.test(src2));
    // F 浮标必须在 #cube 里面，才会跟着魔方一起转
    ok('F 面浮标在魔方内部（跟着一起转）', /class="fmark"|fmark/.test(src2) &&
      /'<div class="fmark"/.test(src2));
    // 贴在前面的中心方块上（x/y 都是 0），略靠外一点点避免和贴纸重叠打架
    ok('标牌贴在前面的中心方块上',
      /translate3d\(0, 0, calc\(var\(--cs\) \* 1\.52\)\)/.test(src2));
    ok('标牌比方块略小（0.52）', /\.fmark\{[^}]*width:calc\(var\(--cs\) \* 0\.52\)/.test(src2));
    // 底色不能透明 —— 字色等于前面那个颜色，透明底会淹没在同色贴纸里
    ok('标牌底色与贴纸区分开（塑料色，不是透明）',
      /\.fmark\{[^}]*background:var\(--cubie\)/.test(src2));
    // 「F」指的是当前朝向的前面，做完 x/y/z 会换成别的面，
    // 所以字色要取「前面中心贴纸」的颜色，不能固定写 COLOR.F
    ok('"F" 字色跟随前面中心贴纸',
      /COLOR\[state\['0,0,1\|0,0,1'\]\]/.test(src2),
      '字色没有跟随整体旋转变化');
    ok('标牌底色是魔方塑料色，CSS 里没写死别的颜色',
      /\.fmark\{[^}]*background:var\(--cubie\)/.test(src2) &&
      !/\.fmark\{[^}]*background:var\(--accent\)/.test(src2));

    // 点一下 ← （y）：局面应当等于整体左转一次，并记进历史
    els.reset.fire('click');
    const before = readCube();
    els.arrows[2].fire('click');                 // ← 是第 3 个（n s w e z1 z2）
    await wait(1200);
    ok('点箭头后局面 = 整体旋转 y',
      sameState(readCube(), S.apply(S.solved(), 'y')),
      JSON.stringify(readCube()).slice(0, 50));
    ok('整体旋转改变了 F 面的位置', !sameState(readCube(), before));
    ok('整体旋转记进了历史', String(els.hcount.textContent) === '1', els.hcount.textContent);
    ok('历史里标为旋转类', /class="e rt/.test(els.hist.innerHTML), els.hist.innerHTML.slice(0, 80));

    // 拖拽视角靠 setPointerCapture；一旦捕获，后续指针事件就重定向到舞台，
    // 按钮的 click 落不到按钮上 —— 表现就是「点了完全没反应」
    // （滚轮却照常，因为滚轮不走 pointerdown）。所以「哪些东西不该触发拖拽」
    // 这份名单必须把舞台上的**每一个**按钮都列上：箭头、缩放三键、拍照都是这么栽的。
    // 这里不写死整串选择器，而是把舞台里的按钮挨个找出来核 —— 以后再加按钮，
    // 漏进名单就是红。
    // 只在拖拽那个 pointerdown 处理函数里找 `closest('...')` ——
    // 页面里别处也用 closest（比如选公式栏的 .p），抓第一个会抓错
    const dragExempt = src => {
      const i = src.indexOf("stageEl.addEventListener('pointerdown'");
      const h = i < 0 ? '' : src.slice(i, src.indexOf('});', i));
      return (h.match(/closest\('([^']+)'\)/) || [])[1] || '';
    };
    const stageButtons = src => {
      const body = (src.match(/<main class="stage"[^>]*>([\s\S]*?)<\/main>/) || [])[1] || '';
      const spans = {};
      ['orbit', 'zoom'].forEach(k => {
        const open = body.indexOf('<div class="' + k + '">');
        spans[k] = open < 0 ? [-1, -1] : [open, body.indexOf('</div>', open)];
      });
      return (body.match(/<button[^>]*>/g) || []).map(tag => {
        const at = body.indexOf(tag);
        const cls = (tag.match(/class="([^"]*)"/) || [])[1] || '';
        const id = (tag.match(/id="([^"]*)"/) || [])[1] || '';
        const region = Object.keys(spans).find(k => at > spans[k][0] && at < spans[k][1]) || 'self';
        const need = region === 'orbit' ? '.orbit button'
                   : region === 'zoom' ? '.zoom button'
                   : /\bsnap\b/.test(cls) ? '.snap'
                   : (/\bthemebtn\b/.test(cls) || id === 'themebtn') ? '.themebtn' : null;
        return { tag: tag.slice(0, 40), need };
      });
    };
    [['calc.html', '计算器'], ['practice.html', '练习页']].forEach(([f, name]) => {
      const src = fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
      const exempt = dragExempt(src);
      const btns = stageButtons(src);
      const missing = btns.filter(b => b.need && exempt.indexOf(b.need) < 0);
      const unknown = btns.filter(b => !b.need);
      ok(name + '：舞台上的 ' + btns.length + ' 个按钮全在「不触发拖拽」名单里',
        exempt !== '' && missing.length === 0 && unknown.length === 0,
        '名单=' + exempt + ' 漏=' + missing.map(b => b.need).join(',') +
        ' 认不出=' + unknown.map(b => b.tag).join(','));
    });
    {
      const calcSrc = fs.readFileSync(path.join(__dirname, '..', 'calc.html'), 'utf8');
      const exempt = dragExempt(calcSrc);
      ok('拍照键就在名单里（它就是漏了才点了没反应）', exempt.indexOf('.snap') >= 0, exempt);
      // 真跑一遍 pointerdown：点拍照键不能开始拖拽、也不能捕获指针
      let captured = 0;
      els.stage.setPointerCapture = function () { captured++; };
      els.stage.fire('pointerdown', { pointerId: 1, clientX: 5, clientY: 5,
        target: { closest: sel => sel.indexOf('.snap') >= 0 } });
      ok('点拍照键不触发拖拽（不 setPointerCapture，click 才留得住）',
        captured === 0 && !els.stage.classList.contains('drag'), 'captured=' + captured);
      // 点魔方本身还是要能拖 —— 别为了修这个把拖拽弄没了
      els.stage.fire('pointerdown', { pointerId: 2, clientX: 5, clientY: 5,
        target: { closest: () => null } });
      ok('点魔方本身照样能拖拽（名单没有误伤）',
        captured === 1 && els.stage.classList.contains('drag'), 'captured=' + captured);
      els.stage.fire('pointerup', {});
    }
    {
      // 编辑器的捕获路径不一样：它只在抓住 .cell（方块/贴纸）时才捕获，按钮所以安全
      const ed = fs.readFileSync(path.join(__dirname, '..', 'editor.html'), 'utf8');
      const i = ed.indexOf("host.addEventListener('pointerdown'");
      const h = i < 0 ? '' : ed.slice(i, ed.indexOf('});', i));
      ok('编辑器只在抓方块时才捕获指针（舞台上的按钮不受影响）',
        h.indexOf("closest('.cell')") >= 0 &&
        h.indexOf("closest('.cell')") < h.indexOf('setPointerCapture'), h.slice(0, 60));
    }
    ok('输入框里没有默认值',
      !/id="alg"[^>]*value="/.test(fs.readFileSync(path.join(__dirname, '..', 'calc.html'), 'utf8')));

    // ---- 从公式表快速选公式 ----
    const tables = ['f2l.html', 'oll.html', 'pll.html'];
    tables.forEach(f => {
      const t = fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
      ok(f + ' 里每条公式都有「在计算器里打开」',
        /class="tocalc"/.test(t) && /calc\.html#/.test(t));
    });
    ok('刷新恢复现场、只有新导航才重置',
      /nav\.type === 'reload'/.test(src2) && /if \(hashAlg && !isReload\)/.test(src2),
      '没有区分刷新和新导航');
    ok('从公式表跳过来会先复原（不接着上次的局面）',
      /var hashAlg/.test(fs.readFileSync(path.join(__dirname, '..', 'calc.html'), 'utf8')) &&
      /if \(hashAlg && !isReload\) \{[\s\S]{0,240}?reset\(\)/.test(fs.readFileSync(path.join(__dirname, '..', 'calc.html'), 'utf8')));
    // F2L 的 b 版以绿面为 F：链接带 @g: 前缀，计算器按 y 公式 y' 填进输入框
    ok('公式表的链接会给 b 版打绿面标记',
      /@g:' \+ encodeURIComponent\(alg\)|'@g:'/.test(src2) ||
      fs.readFileSync(path.join(__dirname, '..', 'f2l.html'), 'utf8').indexOf('@g:') >= 0);
    ok('公式跳转不会动「速度 / 跳过动画」这两个设置',
      /keepDur/.test(src2) && /keepSkip/.test(src2) &&
      /if \(keepDur !== null\) DUR = keepDur;/.test(src2) &&
      /syncSpd\(\);\s*\/\/ 滑条/.test(src2) && /saveState\(\);\s*\/\/ 再把设置写回去/.test(src2));
    ok('计算器认识 @s: 前缀（打乱：直接正向执行，不先摆局面）',
      /h\.indexOf\('@s:'\) === 0/.test(src2) &&
      /setTimeout\(function \(\) \{ run\(fwd, hashAlg, 'scramble', false\); \}, 2000\)/.test(src2) &&
      /@s:' \+ encodeURIComponent\(scramble\)/.test(fs.readFileSync(path.join(__dirname, '..', 'timer.html'), 'utf8')));
    ok('计算器认识 @g: 前缀',
      /indexOf\('@g:'\) === 0/.test(src2));
    // 必须先解码再判断 —— 浏览器会把 @ 编码成 %40，否则前缀留在框里，
    // 执行时报「不认识的动作: @」
    ok('先解码 hash 再判前缀',
      src2.indexOf('decodeURIComponent(h)') < src2.indexOf("indexOf('@g:')"),
      '@g: 的判断排在了解码之前');
    // 框里填原公式；y 是真的执行一次（转一下魔方），不是写进框里
    ok('@g: 时框里填原公式（不加 y）',
      /algEl\.value = hashAlg;/.test(src2) &&
      !/algEl\.value = hashGreen \?/.test(src2));
    ok('@g: 时先无动画地执行一个 y',
      /if \(hashGreen\) \{[\s\S]{0,200}?CubeSim\.apply\(cur, 'y'\)/.test(src2));
    // 执行 y 之后视角要补同样的角度，画面才保持不变（红面在左、绿面在右）
    ok('@g: 时视角跟着补 +90（画面不变）',
      /view\.y = view\.y \+ 90;/.test(src2));
    // 点击公式跳过来：先无动画做逆（把魔方摆到要解的局面），再正向播动画
    ok('点击公式先执行逆（无动画）',
      /invert\(fwd\)\.forEach\(function \(x\) \{/.test(src2) &&
      /cur = CubeSim\.turn\(cur, x\.mv, x\.times\);/.test(src2));
    // 带整体旋转的公式（Aa 的 x'）要先把净旋转补上，摆出的局面才和图同朝向
    ok('读取公式净旋转并补上（局面与图同朝向）',
      /var r = CubeSim\.netRotation\(hashAlg\);/.test(src2) &&
      /if \(r\) cur = CubeSim\.apply\(cur, r\);/.test(src2));
    // 动画里只允许有公式本身写明的动作 —— 不能自己追加净旋转的补偿
    ok('动画里只播公式本身（不追加净旋转补偿）',
      /run\(fwd, hashAlg, 'alg', false\)/.test(src2) &&
      !/concat\(rinv\)/.test(src2) && !/playCoda/.test(src2) && !/simplify\(/.test(src2),
      '代码里还在往动画里加东西');
    ok('逆执行完再正向播一遍（动画）', /run\(fwd, hashAlg, 'alg', false\)/.test(src2));
    ok('正向播放前先停 2 秒',
      /setTimeout\(function \(\) \{ run\(fwd, hashAlg, 'alg', false\); \}, 2000\)/.test(src2));
    ok('计算器会读取 hash 里的公式',
      /location\.hash/.test(fs.readFileSync(path.join(__dirname, '..', 'calc.html'), 'utf8')));
    // 带上 hash 打开时，输入框应当被填好
    {
      const vm2 = require('vm');
      const els2 = { alg: mkEl('input', '') };
      els2.cube = mkEl('div');
      const ctx2 = { console, navigator: {}, window: { addEventListener() {} },
        setTimeout, clearTimeout, localStorage: { getItem: () => null, setItem() {} },
        CubeSim: S, location: { hash: '#' + encodeURIComponent("R U R' U' F") },
        document: { getElementById: id => els2[id] || (els2[id] = mkEl('div')),
                    querySelectorAll: () => [],
                    documentElement: mkEl('html'), createElement: mkEl,
                    body: { appendChild() {} }, addEventListener() {} } };
      ctx2.globalThis = ctx2;
      vm2.createContext(ctx2);
      vm2.runInContext(src, ctx2);
      ok('带 hash 打开时输入框已填好', els2.alg.value === "R U R' U' F", els2.alg.value);
    }
    // 真跑一遍跳转：步骤条里必须只有公式本身的步数。
    // 带整体旋转的公式（Aa 的 x'）做完朝向会转偏，补偿是「收尾动画」，
    // 不能混进步骤条 —— 混进去就会和历史里那条公式对不上（曾经多了三个 x'）。
    {
      const vm3 = require('vm');
      const N3b = { px: '1,0,0', nx: '-1,0,0', py: '0,1,0',
                    ny: '0,-1,0', pz: '0,0,1', nz: '0,0,-1' };
      const C3b = {};
      for (const x of fs.readFileSync(path.join(__dirname, '..', 'calc.html'), 'utf8')
               .match(/var COLOR = \{([^}]+)\}/)[1]
               .matchAll(/([UDFBRL]):\s*'(#[0-9A-Fa-f]{6})'/g)) {
        C3b[x[2].toUpperCase()] = x[1];
      }
      const alsrc = fs.readFileSync(path.join(__dirname, '..', 'alglist.js'), 'utf8');
      [
        ["x' R2 D2 (R' U' R) D2 (R' U R')", ''],        // Aa：带 x'
        ["(R U R' U') (R U' R') (F' U' F) (R U R')", ''], // 无净旋转
        ["(U L' U' L)y'(U' R U R')", '@g:']             // 21b：绿面 + 净旋转
      ].forEach(function (t) {
        const alg = t[0];
        const els3 = { alg: mkEl('input', '') };
        els3.cube = mkEl('div');
        const ctx3 = { console, navigator: {}, window: { addEventListener() {} },
          // 让 2 秒延时和每步动画立刻跑完，测试不用真等
          setTimeout: function (fn) { fn(); return 0; }, clearTimeout() {},
          localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
          CubeSim: S, location: { hash: '#' + t[1] + encodeURIComponent(alg) },
          document: { getElementById: id => els3[id] || (els3[id] = mkEl('div')),
                      querySelectorAll: () => [], documentElement: mkEl('html'),
                      createElement: mkEl, body: { appendChild() {} }, addEventListener() {} } };
        ctx3.globalThis = ctx3;
        vm3.createContext(ctx3);
        vm3.runInContext(alsrc, ctx3);
        vm3.runInContext(src, ctx3);
        const shown = (els3.moves.innerHTML.match(/data-k="/g) || []).length;
        const want = S.steps(alg).length;
        ok('跳转后步骤条只显示公式本身的 ' + want + ' 步（' + alg.slice(0, 16) + '）',
          shown === want, '实际 ' + shown + ' 步');
        const got3 = {};
        for (const m of els3.cube.innerHTML
                 .matchAll(/data-pos="([^"]+)"[^>]*>([\s\S]*?)<\/div>/g)) {
          for (const x of m[2].matchAll(/class="on (\w+)"[^>]*--c:(#[0-9A-Fa-f]{6})/g)) {
            got3[m[1] + '|' + N3b[x[1]]] = C3b[x[2].toUpperCase()];
          }
        }
        // 动画只播公式本身，所以结束局面 = 净旋转作用在「同朝向的复原态」上。
        // 带整体旋转的公式（Aa）就是会整体转偏 —— 这是公式本身的结果，不做补偿。
        const start3 = t[1] === '@g:' ? S.apply(S.solved(), 'y') : S.solved();
        const r3 = S.netRotation(alg);
        const wantEnd = r3 ? S.apply(start3, r3) : start3;
        ok('跳转播完后结束局面就是公式本身的结果（' + alg.slice(0, 16) + '）',
          eq(S.facelets(got3), S.facelets(wantEnd)),
          JSON.stringify(S.centers(got3)) + ' 期望 ' + JSON.stringify(S.centers(wantEnd)));
      });
      // 停 2 秒里展示的「要解的局面」必须和图片同朝向 ——
      // 净旋转只用在摆局面上。让 setTimeout 不执行动画，页面就停在这个局面上。
      {
        const vm4 = require('vm');
        const els4 = { alg: mkEl('input', '') };
        els4.cube = mkEl('div');
        const ctx4 = { console, navigator: {}, window: { addEventListener() {} },
          setTimeout: function () { return 0; }, clearTimeout() {},   // 不播动画
          localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
          CubeSim: S,
          location: { hash: '#' + encodeURIComponent("x' R2 D2 (R' U' R) D2 (R' U R')") },
          document: { getElementById: id => els4[id] || (els4[id] = mkEl('div')),
                      querySelectorAll: () => [], documentElement: mkEl('html'),
                      createElement: mkEl, body: { appendChild() {} }, addEventListener() {} } };
        ctx4.globalThis = ctx4;
        vm4.createContext(ctx4);
        vm4.runInContext(alsrc, ctx4);
        vm4.runInContext(src, ctx4);
        const got4 = {};
        for (const m of els4.cube.innerHTML
                 .matchAll(/data-pos="([^"]+)"[^>]*>([\s\S]*?)<\/div>/g)) {
          for (const x of m[2].matchAll(/class="on (\w+)"[^>]*--c:(#[0-9A-Fa-f]{6})/g)) {
            got4[m[1] + '|' + N3b[x[1]]] = C3b[x[2].toUpperCase()];
          }
        }
        const c4 = S.centers(got4);
        ok('Aa 展示的局面是黄朝上（和图片同朝向）',
          c4.U === 'U' && c4.F === 'F', JSON.stringify(c4));
      }
    }

    // ---- 选公式面板 ----
    // 三个来源按钮合并成了一个「选公式」，来源改到展开栏里切
    ok('面板里只有一个「选公式」按钮',
      /id="openpick"/.test(src2) && !/class="pick"/.test(src2));
    ok('来源按钮在展开栏里（F2L/OLL/PLL）',
      /\.tabs button/.test(src2) && ['f2l', 'oll', 'pll'].every(k => src2.includes('data-pick="' + k + '"')));
    ok('切来源时不收起整栏',
      /function syncTabs/.test(src2) && !/pickerEl\.classList\.toggle\('on', !!pickKind\)/.test(src2));
    ok('选公式是右侧独立一列（不是挤在面板下面）',
      /<aside class="picker" id="picker"/.test(src2) &&
      /\.picker\.on\{width:300px;/.test(src2) &&
      !/<div class="plist" id="plist"><\/div>\s*<\/aside>/.test(src2.slice(0, src2.indexOf('</aside>'))));
    // 必须靠宽度过渡展开，不能用 display:none 切换 —— 那样没法过渡，只能蹦
    ok('选公式列是缓慢展开（宽度过渡）',
      /transition:width \.3s/.test(src2) && /\.picker\.on\{width:300px;/.test(src2) &&
      !/\.picker\.on\{display:block\}/.test(src2));
    // 收起要顺手：栏里右上角一个 ×，外加 Esc；三个入口共用 setPicker，状态不会走岔
    ok('收起键是左边缘的竖向抽屉把手（朝右的折角，不是角落里的 ×）',
      /<button class="phandle" id="closepick"/.test(src2) &&
      /\.phandle\{position:absolute;left:0;top:50%;transform:translateY\(-50%\)/.test(src2) &&
      /class="phandle"[\s\S]{0,300}?<polyline points="9 5 16 12 9 19"/.test(src2) &&
      !/pclose/.test(src2));
    ok('把手不在滚动容器里（否则会跟着列表滚走）',
      /<\/button>\s*\n\s*<div class="inner">/.test(src2));
    ok('窄屏时把手转成顶部横条（折角跟着转 90°）',
      /\.phandle\{left:50%;top:0;transform:translateX\(-50%\);\s*\n\s*width:60px;height:18px/.test(src2) &&
      /\.phandle svg\{transform:rotate\(90deg\)\}/.test(src2));
    ok('指上去往右抽出来一点（抽屉手感）',
      /\.phandle:hover\{color:var\(--accent-text\);border-color:var\(--accent-text\);translate:2px 0\}/.test(src2));
    ok('展开键 / × / Esc 共用同一个 setPicker（不会出现状态不同步）',
      /function setPicker\(open\)/.test(src2) &&
      /openBtn\.addEventListener\('click'[\s\S]{0,120}?setPicker\(!pickerEl/.test(src2) &&
      /getElementById\('closepick'\)\.addEventListener\('click'[\s\S]{0,80}?setPicker\(false\)/.test(src2) &&
      /e\.key === 'Escape' && pickerEl\.classList\.contains\('on'\)[\s\S]{0,80}?setPicker\(false\)/.test(src2));
    ok('收起后光标回到输入框（接着敲公式）',
      /setPicker\(false\);\s*\n\s*algEl\.focus\(\)/.test(src2));
    ok('展开键报了状态（aria-expanded / aria-controls）',
      /id="openpick"[^>]*aria-controls="picker"/.test(src2) &&
      /setPicker[\s\S]{0,300}?aria-expanded/.test(src2));
    // 收起时里面那些按钮虽然看不见，键盘 Tab 还是会停过去 —— 必须 visibility:hidden，
    // 而且要等收起动画放完再藏（不然会「啪」地消失，没有过渡）
    ok('收起时 visibility:hidden，键盘不会停在看不见的按钮上',
      /\.picker\{[^}]*visibility:hidden/.test(src2) &&
      /transition:width \.3s cubic-bezier\(\.32,\.8,\.3,1\), visibility 0s linear \.3s/.test(src2) &&
      /\.picker\.on\{[^}]*visibility:visible/.test(src2));
    ok('窄屏（上下布局）也跟着改',
      /transition:max-height \.3s cubic-bezier\(\.32,\.8,\.3,1\), visibility 0s linear \.3s/.test(src2));

    // 真的点一下：× 收起 + 光标回到输入框；Esc 同样能收
    {
      const key = k => (ctx._h.keydown || []).forEach(f => f({ key: k }));
      els.picker.classList.add('on');
      // 用 getElementById 取：桩里元素是按需创建的，页面没接线时也不会崩
      ctx.document.getElementById('closepick').fire('click');
      ok('点公式表右上角的 × 就收起', !els.picker.classList.contains('on'));
      ok('收起后光标回到输入框（接着敲公式）', els.alg._focused === true);
      els.openpick.fire('click');
      ok('公式键仍能展开，并同步 aria-expanded',
        els.picker.classList.contains('on') && els.openpick['_a_aria-expanded'] === 'true');
      key('Escape');
      ok('Esc 也能收起公式表（光标不用在输入框里）',
        !els.picker.classList.contains('on') &&
        els.openpick['_a_aria-expanded'] === 'false');
    }

    // ---- 放大缩小：右下角按钮 + 舞台上滚轮 ----
    {
      const p2 = fs.readFileSync(path.join(__dirname, '..', 'practice.html'), 'utf8');
      ['calc.html', 'practice.html'].forEach((f, i) => {
        const h = i === 0 ? src2 : p2;
        ok(f + ' 有放大 / 缩小两个按钮（SVG 放大镜）',
          /<div class="zoom">[\s\S]{0,600}?id="zin"[\s\S]{0,400}?id="zout"/.test(h) &&
          (h.match(/<circle cx="10\.5" cy="10\.5" r="6\.5"\/>/g) || []).length === 2);
        // 这条是给一个真 bug 加的：位置原来写成 CS 的像素值，缩放只改 --cs，
        // 于是方块变小了、间距没变 —— 整个魔方散成一堆小方块
        ok(f + ' 小方块位置也按 --cs 算（不然缩放时尺寸和间距对不上，会散开）',
          /calc\(var\(--cs\) \* ' \+ p\[0\] \+ '\)/.test(h) &&
          /calc\(var\(--cs\) \* ' \+ \(-p\[1\]\)/.test(h) &&
          !/\(p\[0\] \* CS\)/.test(h) && !/\(p\[2\] \* CS\)/.test(h));
        ok(f + ' 缩放只改 --cs / --half，不重画（重画会打断正在转的动画）',
          /function applyZoom\(\) \{[\s\S]{0,220}?setProperty\('--cs'[\s\S]{0,120}?setProperty\('--half'/.test(h) &&
          !/function applyZoom\(\) \{[\s\S]{0,300}?paint\(/.test(h));
        ok(f + ' fit() 走 applyZoom（窗口尺寸变了也不丢缩放）',
          /CS = Math\.max\(12, Math\.min\(w, h\) \/ 6\.15\);\s*\n\s*applyZoom\(\);/.test(h));
        // 滚轮：必须 preventDefault + passive:false，否则轮子会连带把页面滚了
        ok(f + ' 舞台上滚轮能缩放，并且拦掉页面滚动',
          /stageEl\.addEventListener\('wheel', function \(e\) \{\s*\n\s*e\.preventDefault\(\);/.test(h) &&
          /\}, \{ passive: false \}\);/.test(h));
        ok(f + ' 缩放有上下限（0.5× ~ 2.5×），到顶到底按钮置灰',
          /ZMIN = 0\.5, ZMAX = 2\.5/.test(h) &&
          /Math\.max\(ZMIN, Math\.min\(ZMAX, z\)\)/.test(h) &&
          /getElementById\('zin'\)\.disabled = zoom >= ZMAX - 0\.001/.test(h) &&
          /getElementById\('zout'\)\.disabled = zoom <= ZMIN \+ 0\.001/.test(h));
        ok(f + ' 打印时不印缩放按钮',
          /@media print\{[^}]*\.zoom(,\.snap)?\{display:none\}/.test(h));
        // 这条也是给真 bug 加的：三个键原来被插到了 </main> 外面，
        // 于是 absolute 定位是相对窗口算的 —— 直接盖在右边的操作面板上
        ok(f + ' 缩放的三个键在舞台里面（不是面板上）',
          h.indexOf('<div class="zoom">') > h.indexOf('<main class="stage"') &&
          h.indexOf('<div class="zoom">') < h.indexOf('</main>'));
        ok(f + ' 有「恢复默认大小」键（和放大缩小是一组）',
          /id="zreset"[\s\S]{0,320}?恢复默认大小/.test(h) &&
          /getElementById\('zreset'\)\.addEventListener\('click', function \(\) \{ setZoom\(1\); \}\)/.test(h) &&
          /getElementById\('zreset'\)\.disabled = Math\.abs\(zoom - 1\) < 0\.001/.test(h));
        ok(f + ' 缩放会存下来（三页共用 cube-zoom-v1）',
          /var ZOOM_KEY = 'cube-zoom-v1'/.test(h) &&
          /localStorage\.setItem\(ZOOM_KEY, String\(zoom\)\)/.test(h) &&
          /zoom = loadZoom\(\);/.test(h));
        ok(f + ' 开机先读存档再 fit()（否则第一帧会按 100% 画一遍再跳）',
          h.indexOf('zoom = loadZoom();') < h.indexOf('\n  fit();'));
      });

      // 真按一下：滚轮向上放大、向下缩小，按钮到顶到底会置灰
      const cs = () => parseFloat(els.cube.style['--cs']);
      const wheel = d => els.stage.fire('wheel', { deltaY: d, preventDefault() {} });
      const base = cs();
      ok('初始 100%（--cs 就是 fit() 算出来的值）', base > 0, String(base));
      wheel(-100);
      ok('舞台上滚轮向上 = 放大（' + base + ' -> ' + cs() + '）', cs() > base);
      const up = cs();
      wheel(100); wheel(100);
      ok('滚轮向下 = 缩小', cs() < up);
      for (let k = 0; k < 40; k++) els.zin.fire('click');
      ok('一直放大封顶在 2.5×，并置灰加号',
        Math.abs(cs() / base - 2.5) < 0.01 && els.zin.disabled === true, String(cs()));
      for (let k = 0; k < 60; k++) els.zout.fire('click');
      ok('一直缩小封底在 0.5×，并置灰减号',
        Math.abs(cs() / base - 0.5) < 0.01 && els.zout.disabled === true, String(cs()));
      els.zin.fire('click');
      ok('从底线点一下加号能回来', Math.abs(cs() / base - 0.625) < 0.01, String(cs()));
      // 恢复默认大小
      for (let k = 0; k < 8; k++) els.zin.fire('click');
      ok('放大之后「恢复默认大小」键可用', els.zreset.disabled === false);
      els.zreset.fire('click');
      ok('点「恢复默认大小」回到 100%', Math.abs(cs() / base - 1) < 0.001, String(cs()));
      ok('回到 100% 后该键自己置灰', els.zreset.disabled === true);
      // 持久化：放大一步，存档里就该是 1.25
      els.zin.fire('click');
      ok('缩放写进 localStorage（cube-zoom-v1 = 1.25）',
        Math.abs(parseFloat(st['cube-zoom-v1']) - 1.25) < 0.001, st['cube-zoom-v1']);
      els.zreset.fire('click');
      ok('恢复默认也会写回存档（= 1）', Math.abs(parseFloat(st['cube-zoom-v1']) - 1) < 0.001,
        st['cube-zoom-v1']);
    }

    // ---- 输入框右端的小叉：一键清空 ----
    {
      ok('输入框右端有个清空小叉（框内定位、内联 SVG）',
        /<div class="algwrap">[\s\S]{0,260}?<button class="clr" id="clr"[\s\S]{0,160}?<svg viewBox="0 0 24 24">/.test(src2) &&
        /\.clr\{position:absolute;right:5px;top:50%/.test(src2) &&
        /#alg\{[^}]*padding:8px 28px 8px 10px/.test(src2));   // 右边留出位置，字不会压到叉上
      // 公式是这一页最核心的数据：等宽、14px、字重 500、一点字距 —— 和中文 UI 明显不同一条线
      ok('公式输入框有「编辑器」那点意思（等宽 14px / 500 / 字距 .2px）',
        /#alg\{[^}]*font:500 14px\/1\.45 ui-monospace/.test(src2) &&
        /#alg\{[^}]*letter-spacing:\.2px/.test(src2));
      const clr = ctx.document.getElementById('clr');
      els.alg.value = '';
      els.alg.fire('input', {});
      ok('输入框空的时候，小叉是灰的（点也没意义）', clr.disabled === true);
      els.alg.value = "R U";
      els.alg.fire('input', {});
      ok('有内容时小叉可用', clr.disabled === false);
      clr.fire('click');
      ok('点小叉：输入框清空、光标还在框里、小叉自己又变灰',
        els.alg.value === '' && els.alg._focused === true && clr.disabled === true,
        els.alg.value);
      // 顺带把报错状态也清掉（红框 + 提示）
      els.alg.value = 'ZZZ';
      els.alg.fire('input', {});
      els.fwd.fire('click');
      clr.fire('click');
      ok('清空时连报错状态一起清（红框、提示都不留）',
        els.alg.value === '' && !els.alg.classList.contains('bad') &&
        els.err.textContent === '' && !els.err.classList.contains('hint'),
        JSON.stringify({ v: els.alg.value, err: els.err.textContent }));
    }


    // ---- 转动速度 / 跳过动画 ----
    {
      ok('「步骤」里有速度滑条和「跳过动画」开关',
        /<input type="range" id="spd" min="80" max="800"/.test(src2) && /id="skip"/.test(src2));
      // 这条是给「看不出是个开关」改的：做成带勾选框的 .tg，而不是又一个普通按钮
      // 样式改成滑动开关（轨道 + 滑块）：一看就是「开/关」，不是又一个按钮
      ok('「跳过动画」是个滑动开关（轨道 + 滑块，勾选框藏起来但键盘可达）',
        /<label class="tg" id="tg-skip"[\s\S]{0,140}?<input type="checkbox" id="skip"> 跳过动画/.test(src2) &&
        /\.tg::before\{content:'';position:absolute;left:0;top:50%;width:36px;height:20px/.test(src2) &&
        /\.tg\.on::before\{background:var\(--accent\);border-color:var\(--accent\)\}/.test(src2) &&
        /\.tg\.on::after\{transform:translateX\(16px\)/.test(src2) &&
        /\.tg input\{position:absolute;width:1px;height:1px;margin:0;opacity:0/.test(src2) &&
        !/class="skip"/.test(src2));
      const spd = ctx.document.getElementById('spd');
      spd.value = '120';
      spd.fire('input', {});
      ok('拖速度滑条会改转动时长，并写进存档',
        els['spd-v'].textContent === '120ms' && /"dur":120/.test(st['calc-state-v1'] || ''),
        els['spd-v'].textContent + ' / ' + String(st['calc-state-v1']).slice(0, 60));
      // 速度恢复默认：小键，已经是默认值时置灰
      const rst = ctx.document.getElementById('spd-reset');
      ok('速度不是默认值时「默认」键可用，点了回到 340ms',
        rst.disabled === false &&
        /var DUR_DEFAULT = 340/.test(src2) &&
        /<input type="range" id="spd" min="80" max="800" step="20" value="340">/.test(src2));
      rst.fire('click');
      ok('点「默认」：滑条回 340ms、键自己置灰、存档也跟着回去',
        els['spd-v'].textContent === '340ms' && rst.disabled === true &&
        /"dur":340/.test(st['calc-state-v1'] || ''),
        els['spd-v'].textContent);
      spd.value = '120';
      spd.fire('input', {});                       // 再调回去，后面的测试按 120ms 算
      ok('再调开，「默认」键又可用', rst.disabled === false);

      const sk = ctx.document.getElementById('skip');
      const tgSk = ctx.document.getElementById('tg-skip');
      sk.checked = true;
      sk.fire('change', {});
      ok('勾上「跳过动画」：勾选框与外框都亮起，并写进存档',
        sk.checked === true && tgSk.classList.contains('on') &&
        /"skip":true/.test(st['calc-state-v1'] || ''));
      // 跳过动画要真的跳过：animate 直接返回、「播放 / 执行公式」直接落到末尾
      ok('跳过动画时不等 transition：animate 直接回调、播放直接落到末尾',
        /if \(skipAnim\) \{ done\(\); return; \}/.test(src2) &&
        /if \(skipAnim\) \{\s*\n\s*at = steps\.length;/.test(src2) &&
        !/function play\(list, from, onDone\)/.test(src2));
    }

    // ---- 跳过动画：提交后同步出结果，不用等 ----
    els.reset.fire('click');
    els.alg.value = "R U R'";
    els.fwd.fire('click');
    ok('开着「跳过动画」时，点提交立刻就到结果',
      String(els.hcount.textContent) === '1' &&
      sameState(readCube(), S.apply(S.solved(), "R U R'")),
      String(els.hcount.textContent) + ' / ' + JSON.stringify(readCube()).slice(0, 40));

    // ---- 历史回溯：点一条 = 回到那一步结束时的局面 ----
    {
      els.alg.value = 'U';
      els.fwd.fire('click');                       // 第 2 条
      const typed = els.alg.value;
      const N1 = String(S.steps("R U R'").length);   // 第 1 条公式有几步
      // 桩不解析 innerHTML，所以直接给个带 dataset.i 的假元素 —— 处理器只读它
      const clickHist = i => els.hist.fire('click', {
        target: { closest: s => (s === '.e' ? { dataset: { i: String(i) } } : null) } });

      clickHist(0);
      ok('点历史第 1 条：局面回到「这一条执行完」',
        sameState(readCube(), S.apply(S.solved(), "R U R'")),
        JSON.stringify(readCube()).slice(0, 48));
      ok('点历史不往输入框里填公式', els.alg.value === typed, els.alg.value);
      ok('回溯后当前那条高亮、后面那条变淡',
        /class="e cur" data-i="0"/.test(els.hist.innerHTML) &&
        /class="e after" data-i="1"/.test(els.hist.innerHTML),
        els.hist.innerHTML.slice(0, 100));
      // 第 1 条是 R U R'（3 步），摆成步骤后位置停在末尾
      ok('这一条被摆成可播放的步骤（位置停在末尾）',
        els.pos.textContent === N1 + ' / ' + N1, els.pos.textContent);
      ok('当前游标也进存档（刷新后还停在同一条）', /"histAt":0/.test(st['calc-state-v1'] || ''));

      // 播放这一条：先退回这条公式执行前的局面，再一步步播
      els.skip.checked = false;                    // 关掉跳过动画，才看得到「播」
      els.skip.fire('change', {});
      els.play.fire('click');
      ok('点播放会从这条公式的开头播起（先退回执行前）',
        els.pos.textContent === '0 / ' + N1, els.pos.textContent);
      await wait(900);
      ok('播完停在公式结束的局面',
        els.pos.textContent === N1 + ' / ' + N1 &&
        sameState(readCube(), S.apply(S.solved(), "R U R'")), els.pos.textContent);

      // 复制这一条：点复制键只复制，不回溯
      const copied = [];
      ctx.navigator.clipboard = { writeText: t => { copied.push(t); return Promise.resolve(); } };
      ctx.window.isSecureContext = true;
      const fakeCp = { dataset: { i: '1' }, classList: els.hist === undefined ? null : null };
      ok('每条历史右侧都有复制键（内联 SVG 图标，不是字符）',
        /class="cp" type="button" data-i="' \+ i \+/.test(src2) &&
        /var CP_ICON = '<svg/.test(src2) &&
        /\.hist \.e \.cp\{flex:none;margin-left:6px/.test(src2));
      {
        const mkBtn = () => {
          const st = new Set();                 // 闭包里的集合：classList 的方法 this 指向自己
          return { dataset: { i: '1' },
            classList: { add(c) { st.add(c); }, remove(c) { st.delete(c); },
                         contains(c) { return st.has(c); } } };
        };
        const btn = mkBtn();
        els.hist.fire('click', { target: { closest: s => (s === '.cp' ? btn : null) } });
        ok('点复制键：把这一条的公式送进剪贴板（' + copied.join('') + '）',
          copied.length === 1 && copied[0] === 'U', copied.join('|'));
        await wait(30);                    // 加上「闪一下」的类是写在 then 里的
        ok('复制成功后按键自己闪一下（这页没有 toast）',
          btn.classList.contains('copied'));
        ok('点复制键不会动局面/位置', els.pos.textContent === N1 + ' / ' + N1, els.pos.textContent);
      }

      ok('复制键优先于回溯判断（点它不会跳位置）',
        /var cp = e\.target\.closest \? e\.target\.closest\('\.cp'\) : null;\s*\n\s*if \(cp\) \{ copyHist/.test(src2));
      ok('复制走 clipboard API，另有一条 execCommand 退路（file:// 下没有前者）',
        /navigator\.clipboard && window\.isSecureContext/.test(src2) &&
        /document\.execCommand\('copy'\)/.test(src2));

      // 回溯之后再做新动作：后面那几条作废
      els.alg.value = 'F';
      els.fwd.fire('click');
      await wait(900);
      ok('回溯点之后做新动作，后面那几条作废', String(els.hcount.textContent) === '2',
        els.hcount.textContent);
      ok('新的一条接在回溯点后面（原来的 U 没了、变成了 F）',
        els.hist.innerHTML.includes('<span>F</span>') &&
        !els.hist.innerHTML.includes('<span>U</span>'),
        els.hist.innerHTML.slice(0, 120));
    }

    // ---- 公式框的粘贴键 ----
    {
      ok('公式框右边有粘贴键（内联 SVG 图标，不是字符）',
        /<button class="paste" id="paste" type="button"[\s\S]{0,200}?<svg viewBox="0 0 24 24">/.test(src2) &&
        /\.paste\{flex:none;width:\d+px;height:\d+px/.test(src2));
      ok('粘贴优先用 clipboard.readText，读不到才退回「本页最近复制的」+ 提示',
        /navigator\.clipboard\.readText\(\)\.then/.test(src2) &&
        /if \(use\(lastCopied\)\) return;/.test(src2) &&
        /不让读剪贴板，按 Ctrl\+V 吧/.test(src2) &&
        /\.err\.hint\{color:var\(--muted2\)\}/.test(src2));
      const pasteEl = ctx.document.getElementById('paste');
      // 上一条（复制键）刚把 'U' 记进 lastCopied，这里先给个「能读剪贴板」的环境
      ctx.navigator.clipboard.readText = () => Promise.resolve("R U R' U");
      pasteEl.fire('click');
      await wait(30);                       // readText 是异步的
      ok('点粘贴：剪贴板里的公式进了输入框（' + els.alg.value + '）',
        els.alg.value === "R U R' U", els.alg.value);
      ok('粘贴后光标落在输入框里，直接回车就能提交', els.alg._focused === true);
      // 换成「读不到剪贴板」的环境：应当退回本页复制过的那条
      ctx.navigator.clipboard.readText = undefined;
      els.alg.value = '';
      pasteEl.fire('click');
      ok('读不到剪贴板时，用本页刚复制的那条顶上', els.alg.value === 'U', els.alg.value);
    }

    ok('内容宽度固定，收起时靠外层裁剪（不会被挤扁）',
      /overflow:hidden/.test(src2) && /\.picker > \.inner\{width:300px/.test(src2));
    ok('列表项带缩略图', /function thumb\(kind, id\)/.test(src2) && /<img src="' \+ thumb/.test(src2));
    // 只填入、不执行 —— 让用户自己确认方向再按
    // F2L 的 b 版要以绿面为 F —— 选到它时视角也要跟着转
    ok('公式行带编号（才能区分 a/b）', /data-id="' \+ esc\(r\[0\]\)/.test(src2));
    ok('点某一条只填入输入框',
      /algEl\.value = el\.dataset\.alg;[\s\S]{0,400}?algEl\.focus\(\)/.test(src2) &&
      !/algEl\.value = el\.dataset\.alg;[\s\S]{0,400}?submit\('alg'/.test(src2));
    // 共享数据必须和三个公式表一致 —— 否则面板会显示过期的公式
    {
      const vm3 = require('vm');
      const c3 = {}; vm3.createContext(c3); c3.globalThis = c3;
      vm3.runInContext(fs.readFileSync(path.join(__dirname, '..', 'alglist.js'), 'utf8'), c3);
      const A = c3.ALG_LIST;
      ok('alglist 覆盖 f2l/oll/pll', ['f2l', 'oll', 'pll'].every(k => A[k] && A[k].length));
      // 逐条和页面里的公式比对
      const pages = { oll: 'oll.html', pll: 'pll.html', f2l: 'f2l.html' };
      ['oll', 'pll'].forEach(k => {
        const h = fs.readFileSync(path.join(__dirname, '..', pages[k]), 'utf8');
        const data = JSON.parse(h.match(/var SECTIONS = (\[[\s\S]*?\n\]);/)[1]);
        // 页面里同一格的多条写法（换行分隔）在 alglist 里是拆开的，这里同样拆
        const want = data.flatMap(sec => sec.rows
          .flatMap(r => String(r[1]).split('\n'))
          .filter(x => x.trim())
          .map(x => x.trim())).sort();
        const got = A[k].map(r => r[1]).sort();
        ok('alglist 的 ' + k.toUpperCase() + ' 与页面一致（' + got.length + ' 条）',
          JSON.stringify(want) === JSON.stringify(got), '条数 ' + want.length + ' vs ' + got.length);
      });
      // 缩略图必须都存在
      let missing = [];
      ['f2l', 'oll', 'pll'].forEach(k => A[k].forEach(r => {
        const id = k === 'f2l' ? r[0] : (/^\d+$/.test(r[0]) && r[0].length < 2 ? '0' + r[0] : r[0]);
        const tone = k === 'oll' ? '-day' : '';
        const f = k + '/' + k + '-' + id + tone + '-' + (k === 'f2l' ? '256x258' : '256x256') + '.png';
        if (!fs.existsSync(path.join(__dirname, '..', f))) missing.push(f);
      }));
      ok('缩略图文件都存在（' + (A.f2l.length + A.oll.length + A.pll.length) + ' 张）',
        missing.length === 0, missing.slice(0, 3).join(', '));
    }

    // ---- 自动播放 / 单步动画 ----
    // 播放键既是「播放」也是「执行公式」的入口：run() 把公式交给 autoPlay 播完
    ok('有播放按钮', /id="play"/.test(src2) && /function autoPlay\(done\)/.test(src2) &&
      /if \(done\) done\(false\)/.test(src2) && /if \(done\) done\(finished\)/.test(src2));
    // 单步必须走动画。早先重写主流程时漏了这一步，◀ ▶ 变成了瞬移。
    ok('单步走动画（stepAnimated 里调 animate）',
      /function stepAnimated\(dir, done\)[\s\S]*?animate\(\{ mv: mv\.mv/.test(src2));
    ok('◀ ▶ 通过 stepAnimated 前进/后退',
      /function stepBy\(dir\)[\s\S]*?stepAnimated\(dir/.test(src2));
    ok('自动播放一步步走到末尾',
      /function autoPlay\(done\)[\s\S]*?stepAnimated\(1, nextStep\)/.test(src2));
    ok('执行公式 = 一次播放（run 里走 autoPlay）',
      /function run\(list, label, kind, rev\)[\s\S]*?autoPlay\(afterRun\(\)\)/.test(src2));
    // 记账在按下那一下做完：历史 + 高亮 + 累积局面，然后才是动画
    ok('按下去就记账：历史 / 高亮 / cur 都先落位，再演动画',
      /histAt = hist\.length - 1;\s*\n\s*renderHist\(\);\s*\n\s*cur = frames\[frames\.length - 1\];/.test(src2));
    // 中途暂停后再按一次是「接着播」，不能再记一条（那一串按下去时已经记过了）
    ok('接着播不再重复记一条',
      /if \(key === runKey && frames\[0\] === runFirst && !busy && at > 0 && at < steps\.length\) \{\s*\n\s*playing = false;\s*\n\s*autoPlay\(afterRun\(\)\);\s*\n\s*return;/.test(src2) &&
      !/pendingRun|finishRun/.test(src2));
    // 落地阴影：不给魔方一块「地」，它看着就是飘的。
    // 不能挂在 .cube 上（preserve-3d 的容器加 filter 会塌成 flat），所以是舞台上另一块。
    ['calc.html', 'practice.html'].forEach(p => {
      const h = fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
      ok(p + '：魔方底下有一块不参与 3D 的落地阴影',
        /<div class="shadow" aria-hidden="true"><\/div>/.test(h) &&
        /\.shadow\{position:absolute;left:50%;top:50%;pointer-events:none;/.test(h) &&
        /radial-gradient\(closest-side, var\(--btn-drop\), transparent 78%\)/.test(h));
      ok(p + '：阴影的尺寸跟着 --cs 走（缩放时一起放大），所以 --cs 也挂在舞台上',
        /width:calc\(var\(--cs\) \* 3\.7\)/.test(h) &&
        /stageEl\.style\.setProperty\('--cs', cs \+ 'px'\)/.test(h) &&
        // 阴影绝不能挂到 .cube 里：那会跟着魔方一起转，还得进 3D
        /<div class="shadow"[^>]*><\/div>\s*\n\s*<div class="cube"/.test(h));
      ok(p + '：阴影没有挂在 .cube 的样式里（preserve-3d 加 filter 会塌成平面）',
        !/\.cube\{[^}]*filter/.test(h));
    });
    ok('「回到开头 / 回到结尾」始终可用（到边界也不置灰）',
      /id === 'prev' && at === 0/.test(src2) && /id === 'next' && at >= steps\.length/.test(src2));
    ok('播放键的图标放大了一点（25px，按钮是 56×40）',
      /\.ctrl \.play svg\{width:25px;height:25px/.test(src2) &&
      /\.ctrl \.play\{[^}]*height:40px/.test(src2));
    ok('播放键是图标（三角形 / 两条竖杠），播放时切成暂停',
      /var PLAY_SVG =/.test(src2) && /var PAUSE_SVG =/.test(src2) &&
      /innerHTML = playing \? PAUSE_SVG : PLAY_SVG/.test(src2) &&
      !/自动播放/.test(src2));
    ok('播放键的图标是「圆圈 + 里面的三角形」，按钮本身不画成圆的',
      /<circle cx="12" cy="12" r="9\.1" fill="none"/.test(src2) &&
      /M10 8\.3v7\.4L16\.3 12z/.test(src2) &&
      /M10\.1 8\.5v7M13\.9 8\.5v7/.test(src2) &&
      !/\.ctrl \.play\{[^}]*border-radius:50%/.test(src2));
    ok('播放键夹在「上一步」和「下一步」中间',
      /id="prev"[\s\S]{0,200}?class="play" id="play"[\s\S]{0,200}?id="next"/.test(src2));
    ok('播到底后再按自动播放会从头开始',
      /if \(at >= steps\.length\) \{\s*at = 0;\s*paint\(frames\[0\]\)/.test(src2),
      '到底后按播放没有回到开头');
    // 播放中 busy 也是 true，所以必须先判 playing，否则永远暂停不了
    {
      const i = src2.indexOf('function autoPlay');
      ok('暂停判断排在 busy 之前',
        src2.indexOf('if (playing) { playing = false', i) < src2.indexOf('if (busy || !steps.length)', i),
        'autoPlay 里先判了 busy，会导致按暂停无效');
    }
    // 播放中别的按钮不能禁用，否则点不到，也就无从「自动暂停」
    ok('播放中按钮保持可用（只有非播放的忙才锁）',
      /var lock = busy && !playing;/.test(src2) && /\.disabled = lock;/.test(src2));
    // 导航键要直接生效（只暂停等于「点了没反应」）
    ok('jump 直接跳到目标并停止播放',
      /function jump\(k\) \{[\s\S]*?playing = false;[\s\S]*?at = Math\.max/.test(src2));
    ok('jump 递增代次，作废进行中的那一步',
      /function jump\(k\) \{[\s\S]*?epoch\+\+/.test(src2) &&
      /if \(my !== epoch\)/.test(src2));
    ok('单步在连播中会先停下再走',
      /function stepBy\(dir\)[\s\S]*?if \(playing\) \{ playing = false; \}/.test(src2));
    // 会改动局面的入口保持「先暂停、再点一次」；两个例外不走这条：
    // 公式面板（开合 / 换表 / 填公式，不碰魔方）和复原（按一下就回去）
    ok('改动局面的入口（提交 / 打乱 / 单步）还是先暂停',
      /function submit\(kind, rev\) \{\s*if \(pausedFirst\(\)\) return;/.test(src2) &&
      /function scramble\(\) \{\s*if \(pausedFirst\(\)\) return;/.test(src2) &&
      /function doMove\(mv, kind\) \{[\s\S]{0,200}?if \(pausedFirst\(\)\) return;/.test(src2));
    ok('公式面板和复原不再「先暂停」',
      // 公式开合 / 换表 / 选一条：都只是面板的事
      /openBtn\.addEventListener\('click', function \(\) \{\s*\n\s*setPicker\(/.test(src2) &&
      !/openBtn[\s\S]{0,200}?pausedFirst/.test(src2) &&
      !/querySelectorAll\('\.tabs button'\)[\s\S]{0,260}?pausedFirst/.test(src2) &&
      !/pickEl\.addEventListener\('click'[\s\S]{0,400}?pausedFirst/.test(src2) &&
      // 复原：按一下就复原（播放中也一样）
      /function reset\(\) \{\s*\n\s*epoch\+\+;[\s\S]{0,200}?playing = false;\s*\n\s*busy = false;/.test(src2) &&
      !/function reset\(\) \{[\s\S]{0,200}?pausedFirst/.test(src2) &&
      !/function reset\(\) \{[\s\S]{0,200}?if \(busy\) return;/.test(src2));
    // 只有「跳到开头/末尾」和点某一步是瞬移
    ok('jump 保持瞬移（不带动画）',
      /function jump\(k\)[\s\S]*?paint\(frames\[at\]\)/.test(src2) &&
      !/function jump\(k\)[\s\S]{0,120}animate\(/.test(src2));

    // ---- 离开页面再回来，保住现场 ----
    ok('会把状态存进 localStorage', /localStorage\.setItem\(STORE/.test(src2) &&
      /var STORE = 'calc-state-v1'/.test(src2));
    ok('启动时尝试恢复', /var d = loadSaved\(\)/.test(src2));
    ok('复原会清掉存档', /localStorage\.removeItem\(STORE\)/.test(src2));
    {
      // 用一个真会存取的 localStorage 桩，预置一份存档，看能否恢复
      const vm4 = require('vm');
      const store = {};
      const saved = {
        cur: S.apply(S.solved(), "R U R' U' F"),
        hist: [{ kind: 'alg', alg: "R U R' U' F", rev: false }],
        alg: "R U R' U' F",
        steps: [{ mv: 'R', times: 1 }],
        base: S.solved()
      };
      store['calc-state-v1'] = JSON.stringify(saved);
      const els4 = { alg: mkEl('input', '') };
      els4.cube = mkEl('div');
      const ctx4 = { console, navigator: {}, window: { addEventListener() {} },
        setTimeout, clearTimeout,
        localStorage: { getItem: k => (k in store ? store[k] : null),
                       setItem: (k, v) => { store[k] = String(v); },
                       removeItem: k => { delete store[k]; } },
        CubeSim: S, location: { hash: '' },
        document: { getElementById: id => els4[id] || (els4[id] = mkEl('div')),
                    querySelectorAll: () => [],
                    documentElement: mkEl('html'), createElement: mkEl,
                    body: { appendChild() {} }, addEventListener() {} } };
      ctx4.globalThis = ctx4;
      vm4.createContext(ctx4);
      vm4.runInContext(fs.readFileSync(path.join(__dirname, '..', 'alglist.js'), 'utf8'), ctx4);
      vm4.runInContext(src, ctx4);
      ok('回来时输入框恢复了', els4.alg.value === "R U R' U' F", els4.alg.value);
      ok('回来时历史恢复了', String(els4.hcount.textContent) === '1', els4.hcount.textContent);
      // 画面上的贴纸应当等于存档里的局面
      const C3 = {};
      for (const x of fs.readFileSync(path.join(__dirname, '..', 'calc.html'), 'utf8')
               .match(/var COLOR = \{([^}]+)\}/)[1].matchAll(/([UDFBRL]):\s*'(#[0-9A-Fa-f]{6})'/g)) {
        C3[x[2].toUpperCase()] = x[1];
      }
      const N3 = { px: '1,0,0', nx: '-1,0,0', py: '0,1,0', ny: '0,-1,0', pz: '0,0,1', nz: '0,0,-1' };
      const got4 = {};
      for (const m of els4.cube.innerHTML.matchAll(/data-pos="([^"]+)"[^>]*>([\s\S]*?)<\/div>/g)) {
        for (const x of m[2].matchAll(/class="on (\w+)"[^>]*--c:(#[0-9A-Fa-f]{6})/g)) {
          got4[m[1] + '|' + N3[x[1]]] = C3[x[2].toUpperCase()];
        }
      }
      ok('回来时魔方局面恢复了', sameState(got4, saved.cur),
        JSON.stringify(got4).slice(0, 50));
    }

    // ---- 拍照：把当前局面存成 PNG ----
    {
      // 位置在右上角、和主题开关并排（左上角是「整体逆时针滚 z'」的 56px 大按键，
      // 主题开关正下方又会在舞台变矮时压到右边那个折角）
      ok('舞台右上角有拍照键（内联 SVG 相机图标，和缩放键同一套外观）',
        /<button class="snap" id="snap" type="button"[\s\S]{0,240}?<svg viewBox="0 0 24 24">/.test(src2) &&
        /\.zoom button, \.snap\{width:40px/.test(src2) &&
        /\.snap\{position:absolute;right:80px;top:14px/.test(src2) &&
        !/\.snap\{[^}]*left:14px/.test(src2));
      // 画法必须和舞台一致：同一串 transform 交给 DOMMatrix 解析、同一套 COLOR 表。
      // 用编辑器那套 cube.js 渲染是不行的 —— 它视角固定（拖过就对不上），
      // 颜色也另有一套（F 面 #C00000 vs 舞台的 #C41E3A）。
      ok('拍照是页面自己按舞台的变换画的（不再借 cube.js 的固定视角渲染）',
        !/<script src="cube\.js"><\/script>/.test(src2) &&
        /new DOMMatrix\('perspective\(/.test(src2) &&
        /rotateX\(' \+ view\.x/.test(src2) && /rotateY\(' \+ view\.y/.test(src2) &&
        !/Cube\.toSvg/.test(src2));
      ok('贴纸颜色取自页面自己的 COLOR 表（和舞台上同一个红）',
        /fill: COLOR\[cell\.col\]/.test(src2) || /COLOR\[cell\.col\]/.test(src2));
      {
        const stageP = (src2.match(/\.stage\{[^}]*perspective:\s*(\d+)px/) || [])[1];
        const snapP = (src2.match(/var SNAP_PERSP = (\d+);/) || [])[1];
        ok('拍照的透视距离就是 .stage 上的那个（' + stageP + 'px）',
          stageP && snapP && stageP === snapP, 'stage=' + stageP + ' snap=' + snapP);
      }
      // 先真的转几步再拍：复原态是「对称」的，镜不镜像、视角对不对都看不出来
      els.alg.value = "R U R'";
      els.fwd.fire('click');
      await wait(1200);
      ok('拍照前局面确实打乱了（否则下面那些对称的图看不出问题）',
        !sameState(readCube(), S.solved()), JSON.stringify(readCube()).slice(0, 40));
      downloads.length = 0; blobs.length = 0;
      ctx.document.getElementById('snap').fire('click');
      ok('点拍照会下载一张 PNG（文件名带公式和时间）',
        downloads.length === 1 && /^cube-R-U-R'-\d{8}-\d{6}\.png$/.test(downloads[0]),
        downloads.join('|'));
      ok('拍的是 toSvg 渲染出来那张（不是舞台截屏）',
        blobs.length >= 1 && /svg/.test(blobs[0].type || '') &&
        /<svg/.test(String(blobs[0].parts[0])), String(blobs.length) + ' 个 blob');
      ok('拍完给个提示（这页没有 toast，用输入框下面那行灰字）',
        /^已保存 cube-R-U-R'-\d{8}-\d{6}\.png（1024×\d+）$/.test(els.err.textContent) &&
        els.err.classList.contains('hint'), els.err.textContent);

      /* 拍出来的那张图，必须是「舞台上看到的那个视角 + 那套颜色」，而且是同一套透视。
         参照用一套照 CSS 规范手算的投影（和页面里那段实现分开写）。 */
      {
        const svg = String(blobs[0].parts[0]);
        const polys = [...svg.matchAll(/<polygon class="(\w+)" points="([^"]+)" fill="([^"]+)"\/>/g)]
          .map(m => {
            const pts = m[2].split(' ').map(t => t.split(',').map(Number));
            return { pts, fill: m[3].toUpperCase(), cls: m[1], sticker: m[1] === 'sticker',
                     x: pts.reduce((a, p) => a + p[0] / pts.length, 0),
                     y: pts.reduce((a, p) => a + p[1] / pts.length, 0) };
          });
        const drawn = polys.filter(p => p.cls === 'sticker');
        const frames = polys.filter(p => p.cls === 'frame');
        const stickerHex = new Set(Object.keys(C2));
        ok('拍出来 ' + frames.length + ' 块塑料壳 + ' + drawn.length + ' 张贴纸',
          frames.length >= 20 && drawn.length === frames.length, frames.length + ' / ' + drawn.length);
        // 塑料壳必须是「整格的直角四边形」：一旦跟着贴纸倒角，四个格子交汇处
        // 就会留下小洞 —— 舞台上洞后面是方块内部（深色）看不出来，照片后面是白底，
        // 会变成一个个白点、整块看着镂空。贴纸那边才倒角（12 个点）。
        ok('塑料壳是整格直角四边形（不留缝、不镂空）',
          frames.length > 20 && frames.every(f => f.pts.length === 4),
          [...new Set(frames.map(f => f.pts.length))].join(','));
        ok('贴纸是倒过角的轮廓（12 个点）',
          drawn.length > 20 && drawn.every(d => d.pts.length === 12),
          [...new Set(drawn.map(d => d.pts.length))].join(','));
        // 这一条正是用户报的 bug：整张图全是灰的（局面没喂进去，退回了 EMPTY 灰）
        ok('每张贴纸都是六种贴纸色之一（不是灰的塑料底）',
          drawn.length > 0 && drawn.every(p => stickerHex.has(p.fill)),
          [...new Set(drawn.map(p => p.fill))].join(' '));
        // 贴纸必须比它那格小一圈（四角往里收）：内缩写成负号时贴纸会溢出去、
        // 塑料缝没了，但中心点和面积比几乎不变，只看那两条是抓不住的
        {
          const area = pts => Math.abs(pts.reduce((acc, q, i) => {
            const r = pts[(i + 1) % pts.length];
            return acc + q[0] * r[1] - r[0] * q[1];
          }, 0)) / 2;
          const ratios = drawn.map((d, i) => area(d.pts) / area(frames[i].pts));
          const avg = ratios.reduce((a, b) => a + b, 0) / ratios.length;
          // 面内内缩 ×0.042、圆角 ×0.095：面积比应当落在 0.8 上下，
          // 而且在透视里基本不变（上一版按屏幕平均边长缩，侧面会被挤成一条线）
          ok('贴纸是往格子里面缩的（平均占格子 ' + avg.toFixed(2) + '，应 ≈0.83）',
            ratios.length > 20 && avg > 0.7 && avg < 0.92 &&
            ratios.every(r => r > 0.6 && r < 0.98),
            ratios.slice(0, 3).map(r => r.toFixed(2)).join(' '));
        }

        // 参照投影：模型 y 朝上 -> CSS y 朝下；CSS 的 rotateX(x) rotateY(y) 先转 Y 再转 X；
        // 透视除法和 .stage 的 perspective / perspective-origin 一致
        const RAD = Math.PI / 180, PERSP = 1400, VIEW = { x: -24, y: -32 };
        const OY = -0.02 * els.stage.clientHeight;
        const UV = {
          '1,0,0': [[0, 1, 0], [0, 0, 1]], '-1,0,0': [[0, 1, 0], [0, 0, -1]],
          '0,1,0': [[1, 0, 0], [0, 0, -1]], '0,-1,0': [[1, 0, 0], [0, 0, 1]],
          '0,0,1': [[1, 0, 0], [0, 1, 0]], '0,0,-1': [[1, 0, 0], [0, -1, 0]]
        };
        // 每格边长取页面当前写进 --cs 的那个值：透视强度是 cs/1400，
        // 随便拿个 60 当基准，两边透视强弱就不一样了
        const CSP = parseFloat(els.cube.style['--cs']) || 60;
        const at = v => {
          const s0 = CSP, x = v[0] * s0, y = -v[1] * s0, z = v[2] * s0;
          const x1 = x * Math.cos(VIEW.y * RAD) + z * Math.sin(VIEW.y * RAD);
          const z1 = -x * Math.sin(VIEW.y * RAD) + z * Math.cos(VIEW.y * RAD);
          const y1 = y * Math.cos(VIEW.x * RAD) - z1 * Math.sin(VIEW.x * RAD);
          const z2 = y * Math.sin(VIEW.x * RAD) + z1 * Math.cos(VIEW.x * RAD);
          const w = 1 - z2 / PERSP;
          return { x: x1 / w, y: OY + (y1 - OY) / w, z: z2 };
        };
        const H2 = {};                       // 颜色字母 -> 十六进制（C2 是反过来的）
        for (const k in C2) H2[C2[k]] = k;
        const st0 = readCube(), ref = [];
        Object.keys(st0).forEach(k => {
          const ps = k.split('|')[0].split(',').map(Number);
          const nk = k.split('|')[1], ns = nk.split(',').map(Number);
          if (at(ns).z <= 0) return;                       // 背面不画
          const c = [ps[0] + ns[0] / 2, ps[1] + ns[1] / 2, ps[2] + ns[2] / 2];
          const uv = UV[nk];
          const pts = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(sg => at([0, 1, 2].map(i =>
            c[i] + (sg[0] * uv[0][i] + sg[1] * uv[1][i]) / 2)));
          const cen = at(c);
          ref.push({ x: cen.x, y: cen.y, hex: H2[st0[k]], pts: pts.map(p => [p.x, p.y]) });
        });
        // 两张图各自缩放过，先按自己的包围盒归一化，再找最近的点配对
        const bbox = list => {
          const xs = [].concat(...list.map(p => p.pts.map(q => q[0])));
          const ys = [].concat(...list.map(p => p.pts.map(q => q[1])));
          return { x0: Math.min(...xs), y0: Math.min(...ys),
                   sc: Math.max(Math.max(...xs) - Math.min(...xs),
                                Math.max(...ys) - Math.min(...ys)) || 1 };
        };
        const norm = (list, b) => list.map(p => Object.assign({}, p, {
          hex: p.hex || p.fill,
          x: (p.x - b.x0) / b.sc, y: (p.y - b.y0) / b.sc,
          area: Math.abs(p.pts.reduce((acc, q, i) => {
            const r = p.pts[(i + 1) % p.pts.length];
            return acc + q[0] * r[1] - r[0] * q[1];
          }, 0)) / 2 / (b.sc * b.sc)
        }));
        // 归一化用「整格」那圈点（塑料壳 / 参照的格子四角）——
        // 贴纸是内缩过的，拿它当包围盒两边缩放不一致，位置会系统性偏一点
        const A = norm(drawn, bbox(frames)), B = norm(ref, bbox(ref));
        // 比透视要用同一层的东西：参照给的是「整格」四角，这边也取塑料壳那圈
        const AF = norm(frames, bbox(frames));
        ok('参照投影的可见贴纸数和拍出来的一样（' + B.length + ' 张）',
          A.length === B.length && B.length > 20, A.length + ' vs ' + B.length);
        let bad = 0, far = 0;
        B.forEach(r => {
          let best = null;
          A.forEach(a => {
            const d = Math.hypot(a.x - r.x, a.y - r.y);
            if (!best || d < best.d) best = { d, hex: a.hex };
          });
          if (!best) { bad++; return; }
          if (best.d > 0.05) far++;
          if (best.hex !== r.hex) bad++;
        });
        ok('每张贴纸的位置和颜色都和舞台视角对得上', bad === 0 && far === 0,
          '颜色不符 ' + bad + ' 张 / 位置偏差 ' + far + ' 张');

        /* 透视（近大远小）必须真的在：同一个面里，靠前的格子投影更大。
           正交投影下所有格子一样大 —— 用户就是一眼看出来的这个。
           量「最大格 / 最小格」的面积比：和参照（自己算的透视投影）比，
           并且必须明显大于 1（1.000 就说明没做透视除法）。 */
        const spread = list => Math.max(...list.map(p => p.area)) /
                              Math.min(...list.map(p => p.area));
        ok('透视生效：最大/最小格子面积比 ' + spread(AF).toFixed(3) +
           '（参照 ' + spread(B).toFixed(3) + '，正交投影是 1.000）',
          spread(AF) > 1.02 && Math.abs(spread(AF) - spread(B)) < 0.03,
          spread(AF).toFixed(3) + ' vs ' + spread(B).toFixed(3));
      }
    }

    // ---- 连播中点步骤 / 点历史 ----
    // 用户报的两条：连播中点某一步什么都不发生（busy 一挡就 return 了），
    // 点历史也只把播放停住、并不回溯。两个都是「导航」，点一下就该到位。
    const evStep = k => ({ target: { closest: s => s === 'span[data-k]' ? { dataset: { k: String(k) } } : null } });
    const evHist = i => ({ target: { closest: s => s === '.e' ? { dataset: { i: String(i) } } : null } });
    const PLAY_ICON = /M10 8\.3v7\.4/, PAUSE_ICON = /M10\.1 8\.5v7/;

    els.reset.fire('click');
    els.alg.value = "R U R' U'";
    els.fwd.fire('click');
    await wait(120);                                  // 第 1 步还在转
    ok('连播中播放键是暂停图标', PAUSE_ICON.test(els.play.innerHTML), els.play.innerHTML.slice(0, 60));
    // 先记账再播：动画才演了个头，历史里那条已经在了、而且就是「当前」那一条
    ok('按下那一刻历史已经记好并高亮成当前（不用等动画演完）',
      String(els.hcount.textContent) === '1' && /class="e cur"/.test(els.hist.innerHTML),
      els.hcount.textContent + ' / ' + els.hist.innerHTML.slice(0, 80));
    els.moves.fire('click', evStep(2));
    ok('连播中点某一步：直接跳到那一步（不是什么都不做）',
      els.pos.textContent === '2 / 4' && sameState(readCube(), S.apply(S.solved(), 'R U')),
      els.pos.textContent + ' ' + JSON.stringify(readCube()).slice(0, 40));
    ok('跳过去之后连播停下了（播放键回到三角形）',
      PLAY_ICON.test(els.play.innerHTML) && !els.play.classList.contains('playing'));
    await wait(700);                                  // 等被打断的那一圈收尾
    ok('按下就记账：动画还在演，历史里已经有这一条了',
      String(els.hcount.textContent) === '1', els.hcount.textContent);
    ok('收尾也没有把位置拽回末尾', els.pos.textContent === '2 / 4', els.pos.textContent);

    els.play.fire('click');                           // 接着从第 2 步播到底
    await wait(1400);
    ok('暂停后按播放：接着播完（不从头再转一遍）', els.pos.textContent === '4 / 4', els.pos.textContent);
    ok('接着播完的局面 = 整串公式',
      sameState(readCube(), S.apply(S.solved(), "R U R' U'")),
      JSON.stringify(readCube()).slice(0, 50));
    ok('接着播完不会再多记一条', String(els.hcount.textContent) === '1', els.hcount.textContent);

    // 「回到开头 / 回到结尾」即使已经在这一头也能点；上一步 / 下一步到边界才置灰
    els.first.fire('click');
    ok('已经在开头，「回到开头」还是能点（上一步才置灰）',
      els.first.disabled === false && els.prev.disabled === true,
      String(els.first.disabled) + ' / ' + String(els.prev.disabled));
    els.last.fire('click');
    ok('已经在结尾，「回到结尾」还是能点（下一步才置灰）',
      els.last.disabled === false && els.next.disabled === true,
      String(els.last.disabled) + ' / ' + String(els.next.disabled));

    // ---- 连播中点历史 ----
    els.alg.value = 'R U';
    els.fwd.fire('click');
    await wait(120);
    els.hist.fire('click', evHist(0));
    ok('连播中点历史：直接回到那一条结束的局面（不是只暂停）',
      els.pos.textContent === '4 / 4' &&
      sameState(readCube(), S.apply(S.solved(), "R U R' U'")),
      els.pos.textContent + ' ' + JSON.stringify(readCube()).slice(0, 40));
    await wait(700);
    ok('连播中点了历史：那一条照样在（按下时就记过了）',
      String(els.hcount.textContent) === '2', els.hcount.textContent);
    els.play.fire('click');                           // 重看这一条
    await wait(2000);
    ok('点历史后用播放键重看，不会重复记一条',
      String(els.hcount.textContent) === '2' && els.pos.textContent === '4 / 4',
      els.hcount.textContent + ' / ' + els.pos.textContent);

    // 打乱放在最后：22 步要播约 9 秒，放在前面会把后面的提交全挡在 busy 外面
    els.scramble.fire('click');
    await wait(120);
    ok('打乱会把随机公式填进输入框', els.alg.value.split(/\s+/).length >= 18, els.alg.value);

    // ---- 播放时「正在进行的步骤」要摆到步骤条的视觉中心 ----
    // 之前用 offsetLeft 算：.moves 没有定位，offsetParent 一路找到 body，
    // 算出来的位置带着整块舞台的宽度，永远被夹到最右端 —— 当前步老在边上跑。
    // 播放和点某一步走的是同一个 chrome()/scrollStrip()，所以这里点中间那一步来验。
    const stripMax = chips.length * (CHIP_W + CHIP_GAP) - STRIP_W;
    console.log('   [debug] chips=' + chips.length + ' max=' + stripMax + ' scrollLeft=' + els.moves.scrollLeft + ' clientW=' + els.moves.clientWidth + ' scrollW=' + els.moves.scrollWidth);
    const wantAt = i => Math.max(0, Math.min(stripMax,
      (i - 1) * (CHIP_W + CHIP_GAP) - (STRIP_W - CHIP_W) / 2));
    // 桩里的 classList 和 className 是两套（页面代码用的是 className = 'pill'）；
    // 找不到时给个空壳，让断言干净地失败，而不是抛异常把整节崩掉
    const pillOf = () => els.moves.children.filter(c => c.className === 'pill')[0] ||
      { style: {}, classList: { contains: () => false } };
    els.moves._smooth = null;
    els.moves.fire('click', evStep(10));
    ok('当前这一步被摆到步骤条的视觉中心（第 10 步）',
      els.moves.scrollLeft === wantAt(10), els.moves.scrollLeft + ' vs ' + wantAt(10));
    ok('而且是「滑」过去的（走 smooth），不是一跳',
      els.moves._smooth === 'smooth', String(els.moves._smooth));
    // 高亮色块：位置按这一条的 content 坐标算（和 scrollLeft 无关），大小就是那一片
    ok('高亮色块正好落在这片步骤上',
      pillOf().classList.contains('on') &&
      pillOf().style.left === ((10 - 1) * (CHIP_W + CHIP_GAP)) + 'px' &&
      pillOf().style.width === CHIP_W + 'px' && pillOf().style.height === '22px',
      [pillOf().style.left, pillOf().style.width, pillOf().style.top].join(' / '));
    // 换一步：色块要跟着挪（只查一次位置的话，就算根本不摆也看不出来）。
    // 挑中间那一步，免得把后面「不是一直被夹在最右端」那条搅了
    els.moves.fire('click', evStep(7));
    ok('换到第 7 步：色块跟着挪过去',
      pillOf().style.left === ((7 - 1) * (CHIP_W + CHIP_GAP)) + 'px',
      String(pillOf().style.left));
    ok('而且不是一直被夹在最右端（offsetLeft 那套的毛病）',
      els.moves.scrollLeft !== stripMax && els.moves.scrollLeft > 0,
      String(els.moves.scrollLeft) + ' / max=' + stripMax + ' / 步数=' + chips.length);
    els.moves.fire('click', evStep(2));
    ok('最前面几步到头了只能贴左端（不可能再居中），不是停在中段',
      els.moves.scrollLeft === 0, String(els.moves.scrollLeft));
    els.moves.fire('click', evStep(chips.length));
    ok('最后一步贴右端（同样到头了）', els.moves.scrollLeft === stripMax,
      els.moves.scrollLeft + ' vs ' + stripMax);

    // ---- 滚动条藏了，改成滚轮 / 按住拖 ----
    const docFire = (ev, a) => (ctx._h[ev] || []).forEach(f => f(a));
    els.moves.scrollLeft = 100;
    let wheelDefaulted = false;
    els.moves.fire('wheel', { deltaY: -40, deltaX: 0,
                              preventDefault() { wheelDefaulted = true; } });
    ok('滚轮往上滚 → 步骤条往左走（并吃掉事件）',
      els.moves.scrollLeft === 60 && wheelDefaulted,
      els.moves.scrollLeft + ' / preventDefault=' + wheelDefaulted);
    els.moves.scrollLeft = 0;
    wheelDefaulted = false;
    els.moves.fire('wheel', { deltaY: -40, deltaX: 0,
                              preventDefault() { wheelDefaulted = true; } });
    ok('已经在最左端就放行，让页面自己滚（不然鼠标停在条上整块面板就滚不动）',
      els.moves.scrollLeft === 0 && !wheelDefaulted, String(wheelDefaulted));
    els.moves.scrollLeft = 200;
    els.moves.fire('pointerdown', { pointerType: 'mouse', button: 0, clientX: 300 });
    docFire('pointermove', { clientX: 260 });
    ok('按住往左拖 40px → 条子往左滚 40px', els.moves.scrollLeft === 240,
      String(els.moves.scrollLeft));
    docFire('pointerup', {});
    const posBefore = els.pos.textContent;
    els.moves.fire('click', evStep(3));
    ok('拖完松手那一下不会被当成「点某一步」（位置没跳）',
      els.pos.textContent === posBefore, els.pos.textContent + ' vs ' + posBefore);
    // 触摸不接管：手机上横划走浏览器原生那套
    els.moves.scrollLeft = 150;
    els.moves.fire('pointerdown', { pointerType: 'touch', button: 0, clientX: 300 });
    docFire('pointermove', { clientX: 200 });
    ok('触摸拖动不接管（原生横滚更顺，还有惯性）', els.moves.scrollLeft === 150,
      String(els.moves.scrollLeft));
    docFire('pointerup', {});

    // ---- 播放中点「公式」/「复原」：都是按一下就有反应，不该先暂停 ----
    els.reset.fire('click');
    els.alg.value = "R U R' U' F";
    els.fwd.fire('click');
    await wait(120);                                  // 正在播
    const playing = () => PAUSE_ICON.test(els.play.innerHTML);
    ok('（前提）此刻确实在播', playing(), els.play.innerHTML.slice(0, 40));
    els.openpick.fire('click');
    ok('播放中点「公式」：面板收起来，而且没有暂停',
      els.picker.classList.contains('on') && playing(),
      'panel=' + els.picker.classList.contains('on') + ' playing=' + playing());
    els.openpick.fire('click');
    ok('再点一下又展开，照样没暂停',
      !els.picker.classList.contains('on') && playing(),
      'panel=' + els.picker.classList.contains('on') + ' playing=' + playing());
    const row = { dataset: { alg: "U R U' R'" } };
    els.plist.fire('click', { target: { closest: s => (s === '.p' ? row : null) } });
    ok('播放中点一条公式：只填进输入框，也没暂停',
      els.alg.value === "U R U' R'" && playing(),
      els.alg.value + ' / playing=' + playing());
    // 复原：一下到位（以前要先暂停、再点第二次），而且旧动画收尾时不许把画面改回去
    els.reset.fire('click');
    ok('播放中点「复原」：一下就回到复原态（历史也清了、按钮回到三角形）',
      sameState(readCube(), S.solved()) && String(els.hcount.textContent) === '0' &&
      els.pos.textContent === '—' && !playing(),
      els.pos.textContent + ' / 历史' + els.hcount.textContent);
    await wait(600);                                  // 等那圈被打断的动画收尾
    ok('复原之后那圈旧动画回来时不会把画面改回去（epoch 作废了它）',
      sameState(readCube(), S.solved()) && els.pos.textContent === '—',
      els.pos.textContent);

    console.log('\n结果: ' + pass + ' 通过, ' + fail + ' 失败');
    process.exit(fail ? 1 : 0);
  })();
}
