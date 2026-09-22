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

console.log('\n结果: ' + pass + ' 通过, ' + fail + ' 失败');
process.exit(fail ? 1 : 0);
