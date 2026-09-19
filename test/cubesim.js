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
      appendChild(c) { this.children.push(c); return c; },
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
  ok('F2L 的 b 版按 y+公式+y\' 执行',
    /scope === 'f2l' && \/b\$\/\.test\(r\[0\]\)\) \? \('y ' \+ r\[1\] \+ " y'"\)/.test(html),
    'b 版没有做共轭');
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
  const ctx5 = { console, navigator: {}, window: { addEventListener() {} },
    setTimeout, clearTimeout, localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
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
    const row = ctx5.ALG_LIST[kind5].find(r => r[0] === parts[1]);
    // b 版要按共轭执行，期望值同样处理
    const want5 = (kind5 === 'f2l' && /b$/.test(parts[1]))
      ? ('y ' + row[1] + " y'") : row[1];
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

    // 洗牌袋：切到 PLL（21 题）连点 20 次，应把 21 题各出一次、无一重复
    (scopeBtns[2]._h.click || []).forEach(function (f) { f({}); });
    const seen = [els5.qid.textContent];
    for (let i = 0; i < 21; i++) {          // 21 次 + 初始那道 = 22 条
      (els5.next._h.click || []).forEach(function (f) { f({}); });
      seen.push(els5.qid.textContent);
    }
    // PLL 现在有 22 条，其中 Z 收了两条写法 —— 两条的题面（图）相同，
    // 所以标签都是「PLL Z」，不能用标签去重。改成按"每个标签出现的次数
    // 正好等于题库里该标签的条数"来验，等价于洗牌袋覆盖了每一条。
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
        seen.length === 22 && labels.every(t => counts[t] === expect[t]),
        JSON.stringify(counts));
      ok('Z 恰好出现两次（两条写法）', counts['PLL Z'] === 2, String(counts['PLL Z']));
      ok('其余每个标签恰好一次',
        labels.filter(t => t !== 'PLL Z').every(t => counts[t] === 1));
    }
    (els5.next._h.click || []).forEach(function (f) { f({}); });
    ok('换轮时不紧接着重复上一题', els5.qid.textContent !== seen[seen.length - 1],
      seen[seen.length - 1] + ' -> ' + els5.qid.textContent);
    ok('显示了公式要解决的图形（' + els5.qimg.src + '）',
      /^pll\/pll-[A-Za-z]+-512x512\.png$/.test(els5.qimg.src) &&
      fs.existsSync(path.join(__dirname, '..', els5.qimg.src)), els5.qimg.src);

  }
}

console.log('\n[12] 提交 / 历史 / 累积（端到端，真的点提交）');
{
  // 这一节要跑动画，所以是异步的：末尾再汇总退出。
  const vm = require('vm');
  const mkEl = (t, init) => {
    const e = { tagName: t, children: [], style: {}, dataset: {},
      classList: { _s: new Set(), add(c) { this._s.add(c); }, remove(c) { this._s.delete(c); },
        toggle(c, v) { v === undefined ? (this._s.has(c) ? this._s.delete(c) : this._s.add(c)) : (v ? this._s.add(c) : this._s.delete(c)); },
        contains(c) { return this._s.has(c); } },
      _handlers: {},
      addEventListener(ev, fn) { (this._handlers[ev] = this._handlers[ev] || []).push(fn); },
      fire(ev, arg) { (this._handlers[ev] || []).forEach(f => f(arg || {})); },
      appendChild(c) { this.children.push(c); return c; },
      querySelectorAll() { return []; }, querySelector() { return null; },
      setPointerCapture() {}, closest() { return null; }, focus() {}, offsetWidth: 1,
      value: init || '',
      set innerHTML(v) { this._h = v; }, get innerHTML() { return this._h || ''; },
      set textContent(v) { this._t = v; }, get textContent() { return this._t === undefined ? '' : this._t; },
      set disabled(v) { this._d = v; }, get disabled() { return this._d; } };
    return e;
  };
  const els = { alg: mkEl('input', 'R U') };
  els.cube = mkEl('div');
  // 六个整体旋转箭头
  els.arrows = ['x', "x'", 'y', "y'", 'z', "z'"].map(mv => {
    const b = mkEl('button');
    b.dataset.mv = mv;
    return b;
  });
  const ctx = { console, navigator: {}, window: { addEventListener() {} },
    setTimeout, clearTimeout, localStorage: { getItem: () => null, setItem() {} },
    CubeSim: S,
    location: { hash: '' },   // 页面会读 hash 取公式
    document: { getElementById: id => els[id] || (els[id] = mkEl('div')),
                querySelectorAll: sel => sel === '.orbit button' ? els.arrows : [],
                documentElement: mkEl('html'), createElement: mkEl,
                body: { appendChild() {} }, addEventListener() {} } };
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

    // ---- 整体旋转箭头 ----
    const src2 = fs.readFileSync(path.join(__dirname, '..', 'calc.html'), 'utf8');
    const arrows = [...src2.matchAll(/data-mv="([^"]+)"/g)].map(m => m[1]);
    ok('有 6 个整体旋转箭头（' + arrows.join(' ') + '）', arrows.length === 6, arrows.join(','));
    ok('覆盖 x/x\' y/y\' z/z\'',
      ['x', "x'", 'y', "y'", 'z', "z'"].every(m => arrows.includes(m)), arrows.join(','));
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

    // 箭头要能点：拖拽视角的 pointerdown 必须放过它们。
    // 否则 setPointerCapture 会把后续指针事件重定向到舞台，click 落不到按钮上
    // —— 这正是「箭头毫无反应」的原因。
    ok('拖拽视角时放过箭头按钮',
      /closest\('\.orbit button, \.themebtn'\)/.test(fs.readFileSync(path.join(__dirname, '..', 'calc.html'), 'utf8')));
    ok('输入框里没有默认值',
      !/id="alg"[^>]*value="/.test(fs.readFileSync(path.join(__dirname, '..', 'calc.html'), 'utf8')));

    // ---- 从公式表快速选公式 ----
    const tables = ['f2l.html', 'oll.html', 'pll.html'];
    tables.forEach(f => {
      const t = fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
      ok(f + ' 里每条公式都有「在计算器里打开」',
        /class="tocalc"/.test(t) && /calc\.html#/.test(t));
    });
    ok('从公式表跳过来会先复原（不接着上次的局面）',
      /var hashAlg/.test(fs.readFileSync(path.join(__dirname, '..', 'calc.html'), 'utf8')) &&
      /if \(hashAlg\) \{[\s\S]{0,200}?reset\(\)/.test(fs.readFileSync(path.join(__dirname, '..', 'calc.html'), 'utf8')));
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

    // ---- 选公式面板 ----
    // 三个来源按钮合并成了一个「选公式」，来源改到展开栏里切
    ok('面板里只有一个「选公式」按钮',
      /id="openpick"/.test(src2) && !/class="pick"/.test(src2));
    ok('来源按钮在展开栏里（F2L/OLL/PLL）',
      /\.tabs button/.test(src2) && ['f2l', 'oll', 'pll'].every(k => src2.includes('data-pick="' + k + '"')));
    ok('切来源时不收起整栏',
      /function syncTabs/.test(src2) && !/pickerEl\.classList\.toggle\('on', !!pickKind\)/.test(src2));
    ok('选公式是右侧独立一列（不是挤在面板下面）',
      /<aside class="picker" id="picker">/.test(src2) &&
      /\.picker\.on\{width:300px\}/.test(src2) &&
      /<aside class="picker" id="picker">/.test(src2) &&
      !/<div class="plist" id="plist"><\/div>\s*<\/aside>/.test(src2.slice(0, src2.indexOf('</aside>'))));
    // 必须靠宽度过渡展开，不能用 display:none 切换 —— 那样没法过渡，只能蹦
    ok('选公式列是缓慢展开（宽度过渡）',
      /transition:width \.3s/.test(src2) && /\.picker\.on\{width:300px\}/.test(src2) &&
      !/\.picker\.on\{display:block\}/.test(src2));
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
        const want = data.flatMap(sec => sec.rows.map(r => r[1])).sort();
        const got = A[k].map(r => r[1]).sort();
        ok('alglist 的 ' + k.toUpperCase() + ' 与页面一致（' + got.length + ' 条）',
          JSON.stringify(want) === JSON.stringify(got), '条数 ' + want.length + ' vs ' + got.length);
      });
      // 缩略图必须都存在
      let missing = [];
      ['f2l', 'oll', 'pll'].forEach(k => A[k].forEach(r => {
        const id = k === 'f2l' ? r[0] : (/^\d+$/.test(r[0]) && r[0].length < 2 ? '0' + r[0] : r[0]);
        const f = k + '/' + k + '-' + id + '-' + (k === 'f2l' ? '512x515' : '512x512') + '.png';
        if (!fs.existsSync(path.join(__dirname, '..', f))) missing.push(f);
      }));
      ok('缩略图文件都存在（' + (A.f2l.length + A.oll.length + A.pll.length) + ' 张）',
        missing.length === 0, missing.slice(0, 3).join(', '));
    }

    // ---- 自动播放 / 单步动画 ----
    ok('有自动播放按钮', /id="play"/.test(src2) && /function autoPlay\(\)/.test(src2));
    // 单步必须走动画。早先重写主流程时漏了这一步，◀ ▶ 变成了瞬移。
    ok('单步走动画（stepAnimated 里调 animate）',
      /function stepAnimated\(dir, done\)[\s\S]*?animate\(\{ mv: mv\.mv/.test(src2));
    ok('◀ ▶ 通过 stepAnimated 前进/后退',
      /function stepBy\(dir\)[\s\S]*?stepAnimated\(dir/.test(src2));
    ok('自动播放一步步走到末尾',
      /function autoPlay\(\)[\s\S]*?stepAnimated\(1, nextStep\)/.test(src2));
    ok('播放中按钮变暂停', /playing \? '暂停' : '自动播放'/.test(src2));
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
    ok('其他动作入口会先暂停播放',
      (src2.match(/pausedFirst\(\)/g) || []).length >= 6,
      '只有 ' + (src2.match(/pausedFirst\(\)/g) || []).length + ' 处');
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

    // 打乱放在最后：22 步要播约 9 秒，放在前面会把后面的提交全挡在 busy 外面
    els.scramble.fire('click');
    await wait(120);
    ok('打乱会把随机公式填进输入框', els.alg.value.split(/\s+/).length >= 18, els.alg.value);

    console.log('\n结果: ' + pass + ' 通过, ' + fail + ' 失败');
    process.exit(fail ? 1 : 0);
  })();
}
