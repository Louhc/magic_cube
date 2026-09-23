/* 计时器的纯逻辑测试：打乱、时间格式、平均。
   用法: node test/timer.js */
const T = require('../timer.js');

let pass = 0, fail = 0;
const ok = (n, c, x) => { c ? pass++ : fail++; console.log((c ? '  \u2713 ' : '  \u2717 ') + n + (c ? '' : '  -> ' + x)); };

console.log('[1] 打乱');
{
  const ms = [];
  for (let k = 0; k < 200; k++) ms.push(T.scramble(20));
  const wrong = [], sameFace = [], sameAxis = [];
  ms.forEach(s => {
    const m = s.split(' ');
    if (m.length !== 20 || !m.every(x => /^[UDLRFB][2']?$/.test(x))) wrong.push(s);
    for (let i = 1; i < m.length; i++) {
      if (m[i][0] === m[i - 1][0]) sameFace.push(s);
      if (T.AXIS[m[i][0]] === T.AXIS[m[i - 1][0]]) sameAxis.push(s);
    }
  });
  ok('200 次打乱都是 20 步、字母合法', wrong.length === 0, wrong[0]);
  ok('没有同一个面连着转', sameFace.length === 0, sameFace[0]);
  ok('没有同一根轴连着转', sameAxis.length === 0, sameAxis[0]);
  // 固定随机源 -> 结果可复现（页面里用 Math.random，测试里换成确定序列）
  const lcg = seed => () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  ok('给同一串随机数，打乱结果一样',
    T.scramble(20, lcg(7)) === T.scramble(20, lcg(7)), T.scramble(20, lcg(7)));
  ok('给不同随机数，结果不同（不是写死的）',
    T.scramble(20, lcg(7)) !== T.scramble(20, lcg(99)));
}

console.log('\n[2] 时间格式');
ok('12.34 秒', T.fmt(12340) === '12.34', T.fmt(12340));
ok('1:02.34', T.fmt(62340) === '1:02.34', T.fmt(62340));
ok('个位数补零（3.04）', T.fmt(3040) === '3.04', T.fmt(3040));
ok('没成绩显示 —', T.fmt(null) === '—' && T.fmt(undefined) === '—');

console.log('\n[3] 平均（ao5 / ao12：去掉最快最慢，中间取平均）');
{
  const mk = a => a.map(x => ({ ms: x, scramble: '' }));
  ok('不够 5 次没有 ao5', T.avg(mk([1, 2, 3, 4]), 5) === null);
  ok('ao5 = 中间三个的平均', T.avg(mk([10, 20, 30, 40, 1000]), 5) === 30,
    T.avg(mk([10, 20, 30, 40, 1000]), 5));
  ok('ao12 同理（取最近的 12 次）',
    T.avg(mk([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 100]), 12) === 6.5,
    T.avg(mk([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 100]), 12));
  ok('超过 12 次只算最近 12 次',
    T.avg(mk([500, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 100]), 12) === 7.5,
    T.avg(mk([500, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 100]), 12));
  const st = T.stats(mk([10, 20, 30, 40, 50]));
  ok('stats 一次给出次数 / 最快 / ao5 / ao12',
    st.count === 5 && st.best === 10 && st.ao5 === 30 && st.ao12 === null,
    JSON.stringify(st));
}

/* ---------- 页面交互（用最小 DOM 桩把 timer.html 的内联脚本真跑一遍） ---------- */
console.log('\n[3b] 导出 CSV');
{
  const rows = T.csv([
    { ms: 12340, scramble: "R U R' U'", at: Date.UTC(2026, 8, 21, 6, 45, 41) },
    { ms: 62340, scramble: 'R2, U2 B', at: null }
  ]).split('\n');
  ok('第一行是表头', rows[0] === '序号,时间,毫秒,打乱,时间戳', rows[0]);
  ok('每条成绩一行：编号 / 可读时间 / 毫秒', rows[1].indexOf('1,12.34,12340,') === 0, rows[1]);
  ok('打乱里有逗号时整格加引号（CSV 转义）',
    rows[2].indexOf('2,1:02.34,62340,"R2, U2 B"') === 0, rows[2]);
  ok('时间戳是 ISO（没有就留空）',
    /2026-09-21T06:45:41/.test(rows[1]) && rows[2].endsWith(','), rows[2]);
  ok('空成绩只有表头', T.csv([]).split('\n').length === 2);
}

console.log('\n[4] 计时器页面的按键流程');
{
  const fs = require('fs');
  const path = require('path');
  const vm = require('vm');
  const ROOT = path.join(__dirname, '..');

  const mk = t => {
    const e = { tagName: t, dataset: {}, style: {}, _h: '', _t: '', _h2: {},
      classList: { _s: new Set(), add(c) { this._s.add(c); }, remove(c) { this._s.delete(c); },
        toggle(c, v) { v ? this._s.add(c) : this._s.delete(c); }, contains(c) { return this._s.has(c); } },
      addEventListener(ev, fn) { (this._h2[ev] = this._h2[ev] || []).push(fn); },
      fire(ev, a) { (this._h2[ev] || []).forEach(f => f(a || {})); },
      appendChild(c) { return c; }, removeChild() {},
      setAttribute(k, v) { this['_a_' + k] = String(v); }, getAttribute(k) { return this['_a_' + k] || null; },
      select() {}, focus() {},
      set innerHTML(v) { this._h = v; }, get innerHTML() { return this._h; },
      set textContent(v) { this._t = v; }, get textContent() { return this._t; } };
    return e;
  };
  const els = {}, store = {}, copied = [];
  let now = 1000, frame = 0;
  const ctx = { console, setTimeout, clearTimeout,
    performance: { now: () => now },
    requestAnimationFrame: () => (frame = 1), cancelAnimationFrame: () => (frame = 0),
    localStorage: { getItem: k => (k in store ? store[k] : null),
                    setItem: (k, v) => { store[k] = String(v); }, removeItem(k) { delete store[k]; } },
    navigator: { clipboard: { writeText: t => { copied.push(t); return Promise.resolve(); } } },
    document: { documentElement: { dataset: {} }, createElement: mk,
      getElementById: id => els[id] || (els[id] = mk('div')),
      addEventListener(ev, fn) { (ctx._d = ctx._d || {}); (ctx._d[ev] = ctx._d[ev] || []).push(fn); },
      body: { appendChild() {}, removeChild() {} } } };
  ctx.window = ctx;
  ctx.isSecureContext = true;                 // 页面按 https 走 navigator.clipboard
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'timer.js'), 'utf8'), ctx);
  const src = fs.readFileSync(path.join(ROOT, 'timer.html'), 'utf8')
    .match(/<script>([\s\S]*?)<\/script>/g).map(x => x.replace(/<\/?script>/g, ''))
    .filter(x => x.includes('cube-timer-v1')).pop();
  let ran = true;
  try { vm.runInContext(src, ctx); } catch (e) { ran = false; console.log('  （页面脚本没跑起来: ' + e.message + '）'); }
  ok('timer.html 的内联脚本能在桩里跑起来', ran);

  const key = (type, extra) => (ctx._d[type] || []).forEach(f =>
    f(Object.assign({ preventDefault() {}, code: 'Space', key: ' ', repeat: false }, extra || {})));
  // 存档现在是 { solves: [...], scramble: '...' }（老格式是纯数组）
  const solves = () => {
    try {
      const d = JSON.parse(store['cube-timer-v1'] || 'null');
      return Array.isArray(d) ? d : ((d && d.solves) || []);
    } catch (e) { return []; }
  };

  if (ran) {
    // —— 还没开始计时，顶部那条打乱就能复制 / 送进计算器 ——
    ok('顶部打乱条上有「复制」和「计算器」两个入口',
      /\.scr \.ico/.test(fs.readFileSync(path.join(ROOT, 'timer.html'), 'utf8')) &&
      /id="scr-copy"/.test(fs.readFileSync(path.join(ROOT, 'timer.html'), 'utf8')));
    const href0 = els['scr-calc'].getAttribute('href');
    const scr0 = els.scr.textContent;
    ok('顶部的 ↗ 指向计算器，带的就是当前这条打乱',
      decodeURIComponent(String(href0).replace(/^calc\.html#@s:/, '')) === scr0, href0);
    els['scr-copy'].fire('click');
    ok('点顶部的复制：当前打乱被复制走并给了提示',
      copied.indexOf(scr0) >= 0 && /已复制/.test(els.hint.textContent), copied[copied.length - 1]);
    els.newscr.fire('click');                               // 换一个打乱
    const href1 = els['scr-calc'].getAttribute('href');
    ok('换打乱立刻进存档（切页/刷新回来还是这一条）',
      (() => { try { return JSON.parse(store['cube-timer-v1']).scramble === els.scr.textContent; }
               catch (e) { return false; } })(), (store['cube-timer-v1'] || '').slice(0, 80));
    ok('换打乱之后，↗ 的链接跟着换（指向新的那条）',
      els.scr.textContent !== scr0 &&
      decodeURIComponent(String(href1).replace(/^calc\.html#@s:/, '')) === els.scr.textContent, href1);

    key('keydown');                                        // 按住
    ok('按住空格：进入预备（变绿）', els.pad.classList.contains('ready'));
    key('keyup');                                          // 松开 -> 开始
    ok('松开：开始计时', els.pad.classList.contains('run'));

    now = 4500;                                            // 跑了 3.5 秒
    key('keydown');                                        // 再按 -> 应该停
    ok('再按一下：停下并记一次成绩（不是重新开始）',
      !els.pad.classList.contains('run') && solves().length === 1 &&
      els.time.textContent === '3.50', els.time.textContent + ' / ' + solves().length);
    key('keyup');
    ok('停的那一下松手，不会再开跑',
      !els.pad.classList.contains('run') && solves().length === 1);

    // —— 用户报的那个 bug：计时中点「清空」 ——
    key('keydown'); key('keyup');                          // 重新开始
    now = 9000;
    els.clear.fire('click');                               // 计时中点清空
    const tAfter = els.time.textContent;
    ok('计时中点清空：计时真的停了（显示归零、成绩清空）',
      tAfter === '0.00' && solves().length === 0 && !els.pad.classList.contains('run'), tAfter);
    now = 20000;                                            // 再等一会儿
    ok('清空之后计时不会偷偷继续跑', els.time.textContent === '0.00', els.time.textContent);

    key('keydown'); key('keyup');                           // 清空后还能正常重新开始
    now = 23500;
    key('keydown');
    ok('清空后重新计时照常工作（20000 -> 23500，记 3.50）',
      els.time.textContent === '3.50' && solves().length === 1, els.time.textContent);

    // —— 每行右边的三个小图标：复制打乱 / 在计算器里打开 / 删掉这条 ——
    key('keyup');                                          // 上一轮停下的那次松手
    now = 26000; key('keydown'); key('keyup');             // 再来一次，凑两条
    now = 29000; key('keydown'); key('keyup');
    ok('列表里两条记录', solves().length === 2, String(solves().length));
    const rows = () => (els.list.innerHTML.match(/class="row/g) || []).length;
    ok('列表渲染出两行', rows() === 2, els.list.innerHTML.slice(0, 80));

    const firstScr = solves()[0].scramble;
    els.list.fire('click', { target: { closest: () => ({ getAttribute: k => (k === 'data-copy' ? '0' : null) }) } });
    ok('点复制：把这条的打乱复制走了',
      copied[copied.length - 1] === firstScr, copied[copied.length - 1]);
    ok('复制后给个提示', /已复制/.test(els.hint.textContent), els.hint.textContent);

    els.list.fire('click', { target: { closest: () => ({ getAttribute: k => (k === 'data-del' ? '0' : null) }) } });
    ok('点删除：只删掉这一条（另一条还在）',
      solves().length === 1 && solves()[0].scramble !== firstScr && rows() === 1,
      solves().length + ' 条');

    const link = (els.list.innerHTML.match(/href="calc\.html#[^"]*"/) || [])[0];
    const page = fs.readFileSync(path.join(ROOT, 'timer.html'), 'utf8');
    ok('成绩里的 ↗ 也是「打乱」前缀（@s:，让计算器直接执行）',
      !!link && /href="calc\.html#@s:/.test(link), link);
    ok('当前打乱进了存档（切页/刷新不换题）',
      (() => { try { return JSON.parse(store['cube-timer-v1']).scramble === els.scr.textContent; }
               catch (e) { return false; } })(),
      (store['cube-timer-v1'] || '').slice(0, 90));
    ok('有「保存成绩」按钮，点了导出 CSV（Blob + <a download>）',
      /id="save"/.test(page) && /Timer\.csv\(solves\)/.test(page) &&
      /text\/csv/.test(page) && /a\.download = name/.test(page));
    ok('没有成绩时保存会给个提示而不是下空文件',
      /if \(!solves\.length\) \{ flash\('还没有成绩'\)/.test(page));
    ok('回来时会读存档里的打乱接着用（而不是无条件新生成）',
      /raw\.scramble/.test(page) && /if \(scramble\) \{/.test(page));
    ok('每行的 ↗ 指向计算器，并且带上这条打乱（URL 编码过）',
      !!link && /^href="calc\.html#@s:/.test(link) &&
      decodeURIComponent(link.replace(/^href="calc\.html#@s:/, '').replace(/"$/, '')) === solves()[0].scramble,
      link);
  }
}

console.log('\n[5] 三阶 / 二阶 / 四阶（打乱 + 成绩分阶）');
{
  // 三套打乱：步数和写法照 WCA 那套
  const s3 = T.scrambleFor('3').split(' ');
  ok('三阶：20 步、六个面', s3.length === 20 && s3.every(x => /^[UDLRFB][2']?$/.test(x)),
    s3.slice(0, 4).join(' '));
  const s2 = T.scrambleFor('2').split(' ');
  ok('二阶：11 步、只写 U / R / F（另外三个面等于整体转）',
    s2.length === 11 && s2.every(x => /^[URF][2']?$/.test(x)), s2.join(' '));
  const s4 = T.scrambleFor('4').split(' ');
  ok('四阶：40 步，写法是「面 + 可选的 w + 可选的后缀」',
    s4.length === 40 && s4.every(x => /^[UDLRFB]w?[2']?$/.test(x)), s4.slice(0, 5).join(' '));
  ok('四阶真的一半左右是宽转（光转外层搅不动里面那两层）',
    s4.filter(x => x[1] === 'w').length >= 8, s4.filter(x => x[1] === 'w').length + ' 步宽转');
  {
    // 同一串随机数 -> 三套都可复现；而且四阶的宽转是按「面」判重的（R 和 Rw 不挨着）
    const lcg = seed => () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
    ok('三套打乱都可复现（给同一串随机数结果一样）',
      T.scrambleFor('2', lcg(5)) === T.scrambleFor('2', lcg(5)) &&
      T.scrambleFor('4', lcg(5)) === T.scrambleFor('4', lcg(5)) &&
      T.scrambleFor('3', lcg(5)) === T.scramble(20, lcg(5)));
    ok('不认识的阶数当三阶', T.scrambleFor('9', lcg(3)) === T.scramble(20, lcg(3)));
    let sameFace = 0;
    for (let k = 0; k < 60; k++) {
      const m = T.scrambleFor('4', lcg(k + 1)).split(' ');
      for (let i = 1; i < m.length; i++) if (m[i][0] === m[i - 1][0]) sameFace++;
    }
    ok('四阶打乱里没有同一个面连着来（R 和 Rw 算同一个面）', sameFace === 0, String(sameFace));
  }

  /* 页面：模式栏在左上角、换阶数换一套打乱和一套成绩 */
  const fs = require('fs');
  const path = require('path');
  const vm = require('vm');
  const ROOT = path.join(__dirname, '..');
  const page = fs.readFileSync(path.join(ROOT, 'timer.html'), 'utf8');

  const mk = t => {
    const e = { tagName: t, dataset: {}, style: {}, _h: '', _t: '', _h2: {},
      classList: { _s: new Set(), add(c) { this._s.add(c); }, remove(c) { this._s.delete(c); },
        toggle(c, v) { v ? this._s.add(c) : this._s.delete(c); }, contains(c) { return this._s.has(c); } },
      addEventListener(ev, fn) { (this._h2[ev] = this._h2[ev] || []).push(fn); },
      fire(ev, a) { (this._h2[ev] || []).forEach(f => f(a || {})); },
      appendChild(c) { return c; }, removeChild() {},
      setAttribute(k, v) { this['_a_' + k] = String(v); }, getAttribute(k) { return this['_a_' + k] || null; },
      select() {}, focus() {},
      set innerHTML(v) { this._h = v; }, get innerHTML() { return this._h; },
      set textContent(v) { this._t = v; }, get textContent() { return this._t; } };
    return e;
  };
  const els = {}, store = {};
  let now = 1000;
  const ctx = { console, setTimeout, clearTimeout,
    performance: { now: () => now },
    requestAnimationFrame: () => 1, cancelAnimationFrame: () => {},
    localStorage: { getItem: k => (k in store ? store[k] : null),
                    setItem: (k, v) => { store[k] = String(v); }, removeItem(k) { delete store[k]; } },
    navigator: {}, document: { documentElement: { dataset: {} }, createElement: mk,
      getElementById: id => els[id] || (els[id] = mk('div')),
      addEventListener(ev, fn) { (ctx._d = ctx._d || {}); (ctx._d[ev] = ctx._d[ev] || []).push(fn); },
      body: { appendChild() {}, removeChild() {} } } };
  ctx.window = ctx;
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'timer.js'), 'utf8'), ctx);
  vm.runInContext(page.match(/<script>([\s\S]*?)<\/script>/g)
    .map(x => x.replace(/<\/?script>/g, '')).filter(x => x.includes('cube-timer-v1')).pop(), ctx);

  const key = (type, extra) => (ctx._d[type] || []).forEach(f =>
    f(Object.assign({ preventDefault() {}, code: 'Space', key: ' ', repeat: false }, extra || {})));
  const doc = () => { try { return JSON.parse(store['cube-timer-v1'] || 'null'); } catch (e) { return null; } };
  const run = ms => { key('keydown'); key('keyup'); now += ms; key('keydown'); key('keyup'); };

  const hdr = (page.match(/<header>[\s\S]*?<\/header>/) || [''])[0];
  ok('模式栏在打乱框左边、和它并排（竖着一摞，和计算器那块同一套样子）',
    /<div class="scrrow">\s*<div class="modebar" id="modebar">[\s\S]{0,700}?<div class="scr">/.test(page) &&
    /\.scrrow\{display:flex;align-items:stretch/.test(page) &&
    /\.modebar\{position:relative;display:flex;flex-direction:column/.test(page) &&
    !/modebar/.test(hdr) &&                                  // 已经从页头挪走了
    /id="mode2"/.test(page) && /id="mode4"/.test(page));
  ok('打乱框里「换一个」和旁边两个图标一样垂直居中（没带成绩栏那个 .bar 的上边距）',
    /<button class="go" id="newscr"/.test(page) && !/class="bar" id="newscr"/.test(page) &&
    /\.scr \.go\{/.test(page) && /\.scr\{[^}]*align-items:center/.test(page));
  ok('默认三阶：打乱 20 步、↗ 带 @s:',
    els.scr.textContent.split(' ').length === 20 &&
    /^calc\.html#@s:/.test(els['scr-calc'].getAttribute('href')),
    els.scr.textContent.slice(0, 30));
  run(3500);
  ok('三阶记一条成绩', String(els['s-last'].textContent) === '3.50' && doc().solves.length === 1,
    String(els['s-last'].textContent));

  els.mode2.fire('click');
  ok('切二阶：打乱换成 11 步、只写 U R F',
    els.scr.textContent.split(' ').length === 11 &&
    els.scr.textContent.split(' ').every(x => /^[URF][2']?$/.test(x)), els.scr.textContent);
  ok('切二阶：↗ 的标记变成 @2s:',
    /^calc\.html#@2s:/.test(els['scr-calc'].getAttribute('href')),
    els['scr-calc'].getAttribute('href'));
  ok('切二阶：成绩榜是空的（三阶那些成绩不混过来）',
    els['s-last'].textContent === '—' && els['s-best'].textContent === '—' &&
    /还没有成绩/.test(els.count.textContent));
  run(1200);
  ok('二阶记一条（1.20）', String(els['s-last'].textContent) === '1.20',
    String(els['s-last'].textContent));

  els.mode4.fire('click');
  ok('切四阶：打乱 40 步、带宽转、↗ 带 @4s:',
    els.scr.textContent.split(' ').length === 40 &&
    els.scr.textContent.split(' ').some(x => x[1] === 'w') &&
    /^calc\.html#@4s:/.test(els['scr-calc'].getAttribute('href')), els.scr.textContent.slice(0, 40));
  ok('切四阶：成绩榜也是空的', /还没有成绩/.test(els.count.textContent));

  els.mode3.fire('click');
  ok('「换一个」/ 模式栏之外：三个按钮按 二阶 / 三阶 / 四阶 排，默认高亮三阶',
    (() => {
      const i2 = page.indexOf('id="mode2"'), i3 = page.indexOf('id="mode3"');
      const i4 = page.indexOf('id="mode4"');
      return i2 >= 0 && i2 < i3 && i3 < i4 && /id="mode3"[^>]*class="on"/.test(page);
    })());
  ok('切回三阶：刚才那条 3.50 还在（成绩按阶数分开存）',
    String(els['s-last'].textContent) === '3.50' && doc().solves.length === 1 &&
    doc().mode === '3', String(els['s-last'].textContent));
  ok('存档里三套都在（当前那一阶在顶层，别的塞在 saves 里）',
    doc().solves.length === 1 && doc().saves && doc().saves['2'] &&
    doc().saves['2'].solves.length === 1 && Array.isArray(doc().saves['4'].solves) &&
    doc().saves['2'].scramble.split(' ').length === 11,
    JSON.stringify(Object.keys(doc().saves || {})));
  ok('成绩行里的 ↗ 也带当前阶数的标记',
    /href="calc\.html#@s:/.test(els.list.innerHTML) &&
    /href="calc\.html#@s:/.test(els.list.innerHTML) === /^calc\.html#@s:/.test(els['scr-calc'].getAttribute('href')),
    (els.list.innerHTML.match(/href="calc\.html#[^"]*"/) || [])[0]);
}

console.log('\n[6] 阶数会记住：打开时是上次离开那一阶，第一次打开才是三阶');
{
  const fs = require('fs');
  const path = require('path');
  const vm = require('vm');
  const ROOT = path.join(__dirname, '..');
  const page = fs.readFileSync(path.join(ROOT, 'timer.html'), 'utf8');
  const mk = t => {
    const e = { tagName: t, dataset: {}, style: {}, _h: '', _t: '', _h2: {},
      classList: { _s: new Set(), add(c) { this._s.add(c); }, remove(c) { this._s.delete(c); },
        toggle(c, v) { v ? this._s.add(c) : this._s.delete(c); }, contains(c) { return this._s.has(c); } },
      addEventListener(ev, fn) { (this._h2[ev] = this._h2[ev] || []).push(fn); },
      fire(ev, a) { (this._h2[ev] || []).forEach(f => f(a || {})); },
      appendChild(c) { return c; }, removeChild() {},
      setAttribute(k, v) { this['_a_' + k] = String(v); }, getAttribute(k) { return this['_a_' + k] || null; },
      select() {}, focus() {},
      set innerHTML(v) { this._h = v; }, get innerHTML() { return this._h; },
      set textContent(v) { this._t = v; }, get textContent() { return this._t; } };
    return e;
  };
  // 存档：上次停在四阶（顶层那套是四阶的），二阶也有一套；三阶那套在 saves 里
  const old = {
    mode: '4',
    solves: [{ ms: 45120, scramble: 'Rw U2 Rw2 F', at: 1 }],
    scramble: 'Rw U2 Rw2 F',
    saves: {
      '2': { solves: [{ ms: 3210, scramble: "R U F'", at: 2 }], scramble: "R U F'" },
      '3': { solves: [{ ms: 9870, scramble: 'R U R', at: 3 }], scramble: 'R U R' }
    }
  };
  const els = {}, store = { 'cube-timer-v1': JSON.stringify(old), 'cube-timer-mode-v1': '4' };
  const ctx = { console, setTimeout, clearTimeout, performance: { now: () => 1000 },
    requestAnimationFrame: () => 1, cancelAnimationFrame: () => {},
    localStorage: { getItem: k => (k in store ? store[k] : null),
                    setItem: (k, v) => { store[k] = String(v); }, removeItem(k) { delete store[k]; } },
    navigator: {}, document: { documentElement: { dataset: {} }, createElement: mk,
      getElementById: id => els[id] || (els[id] = mk('div')),
      addEventListener() {}, body: { appendChild() {}, removeChild() {} } } };
  ctx.window = ctx;
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'timer.js'), 'utf8'), ctx);
  vm.runInContext(page.match(/<script>([\s\S]*?)<\/script>/g)
    .map(x => x.replace(/<\/?script>/g, '')).filter(x => x.includes('cube-timer-v1')).pop(), ctx);
  const doc = () => JSON.parse(store['cube-timer-v1']);
  ok('打开时就是上次离开时那一阶（这里存档记的是四阶）',
    els.mode4.classList.contains('on') && !els.mode3.classList.contains('on') &&
    els.scr.textContent === 'Rw U2 Rw2 F', els.scr.textContent.slice(0, 30));
  ok('四阶那套成绩接着用（45.12 那条）',
    String(els['s-last'].textContent) === '45.12' && /共 1 次/.test(els.count.textContent),
    String(els['s-last'].textContent));
  els.mode3.fire('click');
  ok('切三阶：三阶那条 9.87 也在（成绩一条没丢），打乱换成三阶那条',
    String(els['s-last'].textContent) === '9.87' && els.scr.textContent === 'R U R',
    String(els['s-last'].textContent));
  els.mode2.fire('click');
  ok('切二阶：3.21 那条也在', String(els['s-last'].textContent) === '3.21',
    String(els['s-last'].textContent));
  ok('切换之后就写进存档（下次打开停在二阶）', doc().mode === '2' &&
    doc().solves[0].ms === 3210 && doc().saves['3'].solves[0].ms === 9870 &&
    doc().saves['4'].solves[0].ms === 45120, JSON.stringify(doc().saves || {}));
  els.mode3.fire('click');
  ok('切回三阶：存档里三套都留着（顶层是三阶，别的在 saves 里）',
    (() => {
      const d = doc();
      return d.mode === '3' && d.solves.length === 1 && d.solves[0].ms === 9870 &&
             d.saves['4'] && d.saves['4'].solves[0].ms === 45120 &&
             d.saves['2'] && d.saves['2'].solves[0].ms === 3210;
    })(), JSON.stringify(doc().saves || {}));

  // 第一次打开（什么存档都没有）：默认三阶
  {
    const els2 = {}, store2 = {};
    const ctx2 = { console, setTimeout, clearTimeout, performance: { now: () => 1000 },
      requestAnimationFrame: () => 1, cancelAnimationFrame: () => {},
      localStorage: { getItem: k => (k in store2 ? store2[k] : null),
                      setItem: (k, v) => { store2[k] = String(v); }, removeItem(k) { delete store2[k]; } },
      navigator: {}, document: { documentElement: { dataset: {} }, createElement: mk,
        getElementById: id => els2[id] || (els2[id] = mk('div')),
        addEventListener() {}, body: { appendChild() {}, removeChild() {} } } };
    ctx2.window = ctx2;
    ctx2.globalThis = ctx2;
    vm.createContext(ctx2);
    vm.runInContext(fs.readFileSync(path.join(ROOT, 'timer.js'), 'utf8'), ctx2);
    vm.runInContext(page.match(/<script>([\s\S]*?)<\/script>/g)
      .map(x => x.replace(/<\/?script>/g, '')).filter(x => x.includes('cube-timer-v1')).pop(), ctx2);
    ok('第一次打开（还没有存档）：默认三阶、打乱 20 步、↗ 带 @s:',
      els2.mode3.classList.contains('on') && !els2.mode2.classList.contains('on') &&
      !els2.mode4.classList.contains('on') &&
      els2.scr.textContent.split(' ').length === 20 &&
      /^calc\.html#@s:/.test(els2['scr-calc'].getAttribute('href')),
      els2.scr.textContent.slice(0, 30));
    ok('第一次打开就把阶数（三阶）写进存档了',
      (() => { try { return JSON.parse(store2['cube-timer-v1']).mode === '3'; }
               catch (e) { return false; } })());
  }
}

console.log('\n结果: ' + pass + ' 通过, ' + fail + ' 失败');
process.exit(fail ? 1 : 0);
