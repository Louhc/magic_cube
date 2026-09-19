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
    /\.layer\{/.test(html) && /transition:transform/.test(html));
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
      set textContent(v) { this._t = v; }, get textContent() { return this._t || ''; },
      set disabled(v) {} };
    return e;
  };
  const els = { alg: mkEl('input', "R U R' U'") };
  const ctx = { console, navigator: {}, window: {}, setTimeout, clearTimeout,
    localStorage: { getItem: () => null, setItem() {} }, CubeSim: S,
    document: { getElementById: id => els[id] || (els[id] = mkEl('div')),
                documentElement: mkEl('html'), createElement: mkEl,
                body: { appendChild() {} }, addEventListener() {} } };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  const src = fs.readFileSync(path.join(__dirname, '..', 'calc.html'), 'utf8')
    .match(/<script>([\s\S]*?)<\/script>/g).map(x => x.replace(/<\/?script>/g, ''))
    .filter(x => x.includes('M3'))[0];
  let threw = null;
  try { vm.runInContext(src, ctx); } catch (e) { threw = e; }
  ok('脚本执行不报错', !threw, threw && threw.message);
  if (threw) { console.log('\n结果: ' + pass + ' 通过, ' + fail + ' 失败'); process.exit(1); }
  ok('无错误提示', !els.err.textContent, els.err.textContent);
  ok('公式被解析成 4 步', (els.moves.innerHTML.match(/data-k/g) || []).length === 4);
  ok('停在末尾（4 / 4）', els.pos.textContent === '4 / 4', els.pos.textContent);

  const html = els.cube.innerHTML;
  const pos = [...html.matchAll(/data-pos="([^"]+)"/g)].map(m => m[1]);
  ok('画出 26 个小方块', pos.length === 26, String(pos.length));
  ok('每个小方块 6 个面（26×6=156）', (html.match(/<i /g) || []).length === 156);
  ok('朝外的贴纸 54 张', (html.match(/class="on /g) || []).length === 54);

  // 画出来的颜色必须和模拟器算出来的一致 —— 这是页面正确性的核心
  const COLOR = { U: '#FFE600', D: '#F4F4F4', F: '#00A651', B: '#0051BA', R: '#C41E3A', L: '#FF8C1A' };
  const N2 = { px: '1,0,0', nx: '-1,0,0', py: '0,1,0', ny: '0,-1,0', pz: '0,0,1', nz: '0,0,-1' };
  const got = {};
  for (const m of html.matchAll(/data-pos="([^"]+)"[^>]*>([\s\S]*?)<\/div>/g)) {
    got[m[1]] = {};
    for (const x of m[2].matchAll(/class="on (\w+)"[^>]*background:(#[0-9A-Fa-f]{6})/g)) {
      got[m[1]][N2[x[1]]] = x[2];
    }
  }
  const st = S.apply(S.solved(), "R U R' U'");
  let bad = 0, n = 0;
  for (const k of Object.keys(st)) {
    const [p, nn] = k.split('|'); n++;
    if (((got[p] || {})[nn]) !== COLOR[st[k]]) bad++;
  }
  ok('54 张贴纸配色与模拟器一致', bad === 0 && n === 54, '核对 ' + n + ' 张，' + bad + ' 张不符');
}

console.log('\n结果: ' + pass + ' 通过, ' + fail + ' 失败');
process.exit(fail ? 1 : 0);
