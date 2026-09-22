/* 链接检查：五个页面互相跳转，任何一个文件名写错都会静默失效 ——
   页面照常打开，只是点进去 404。所以这里把每个内部链接都对着磁盘查一遍。
 *
 * 用法: node test/links.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
const ok = (n, c, x) => { c ? pass++ : fail++; console.log((c ? '  \u2713 ' : '  \u2717 ') + n + (c ? '' : '  -> ' + x)); };

// 从磁盘自动发现，而不是写死清单 —— 加页面不用改测试，
// 但"某页没接进导航"仍然会被下面的交叉核对抓住。
const PAGES = fs.readdirSync(ROOT).filter(f => f.endsWith('.html')).sort();

console.log('[1] 磁盘上的页面都在（' + PAGES.length + ' 个）');
PAGES.forEach(p => ok(p + ' 存在', fs.existsSync(path.join(ROOT, p))));

console.log('\n[2] 页面里的每个内部链接都指向真实文件');
{
  const bad = [];
  let n = 0;
  PAGES.forEach(p => {
    const html = fs.readFileSync(path.join(ROOT, p), 'utf8');
    const re = /(?:href|src)="([^"]+)"/g;
    let m;
    while ((m = re.exec(html))) {
      const url = m[1];
      if (/^(https?:|mailto:|data:|#|javascript:)/.test(url)) continue;   // 外部/锚点
      // 页面里有 JS 拼路径的写法（src="' + IMG(n) + '"），不是真实链接
      if (/['+()\s]/.test(url)) continue;
      n++;
      const file = url.split('#')[0].split('?')[0];
      if (!file) continue;
      if (!fs.existsSync(path.join(ROOT, file))) bad.push(p + ' -> ' + url);
    }
  });
  ok('检查了 ' + n + ' 条内部链接', bad.length === 0, bad.join(' | '));
}

console.log('\n[3] 导航条覆盖全部页面');
{
  const nav = fs.readFileSync(path.join(ROOT, 'nav.js'), 'utf8');
  // 只从 PAGES 那张表里取（表里除了入口页，还有「同一个入口管的其它页」）
  const table = nav.slice(nav.indexOf('var PAGES = ['), nav.indexOf('];', nav.indexOf('var PAGES = [')));
  const listed = [...table.matchAll(/'([\w-]+\.html)'/g)].map(m => m[1]);
  ok('nav.js 列了 ' + listed.length + ' 个页面', listed.length === PAGES.length, listed.join(','));
  ok('nav.js 与磁盘上的页面完全一致',
    PAGES.every(p => listed.includes(p)) && listed.every(p => PAGES.includes(p)),
    'nav: ' + listed.join(',') + ' / 磁盘: ' + PAGES.join(','));
}

console.log('\n[4] 五个页面都接入了导航');
PAGES.forEach(p => {
  const html = fs.readFileSync(path.join(ROOT, p), 'utf8');
  ok(p + ' 引入了 nav.css 与 nav.js',
    html.includes('href="nav.css"') && html.includes('src="nav.js"'));
});

console.log('\n[4b] 首页的 GitHub 纸带');
{
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const m = html.match(/class="ghribbon"><a href="([^"]+)"/);
  ok('首页有 GitHub 纸带', !!m, '没找到 .ghribbon');
  ok('指向本仓库、新窗口打开',
    !!m && /^https:\/\/github\.com\/Louhc\/magic_cube\/?$/.test(m[1]) &&
    /class="ghribbon"[\s\S]{0,300}?target="_blank"/.test(html) &&
    /class="ghribbon"[\s\S]{0,300}?rel="noopener"/.test(html),
    m && m[1]);
  // 位置：贴在导航条【下面】，不能压住导航栏；也不该再让导航让内边距
  ok('贴在导航条下方（不覆盖导航栏）',
    /\.ghribbon\{[^}]*top:var\(--nav-h, 63px\)[^}]*right:0[^}]*overflow:hidden/.test(html) &&
    !/\.topnav\{padding-right/.test(html));
  ok('45° 斜贴', /\.ghribbon a\{[^}]*transform:rotate\(45deg\)/.test(html));
  ok('内容是 octocat 图标 + 英文',
    /class="ghribbon"[\s\S]{0,400}?<svg viewBox="0 0 16 16"/.test(html) &&
    /class="ghribbon"[\s\S]{0,1200}?>Fork me on GitHub<\/a>/.test(html) &&
    !/[\u4e00-\u9fa5]/.test((html.match(/class="ghribbon"[\s\S]{0,1200}?<\/a>/) || [''])[0]));
  ok('GitHub 经典黑白配色',
    /\.ghribbon a\{[^}]*background:#24292f[^}]*color:#fff/.test(html) &&
    /html\[data-theme="dark"\] \.ghribbon a\{background:#f0f6fc;color:#24292f\}/.test(html));
  ok('悬浮时加阴影，且阴影有过渡',
    /\.ghribbon a\{[^}]*box-shadow:[^;}]+[^}]*transition:background \.12s, box-shadow/.test(html) &&
    /\.ghribbon a:hover\{[^}]*box-shadow:/.test(html));
  // 夜里的底色是深的，黑色阴影压上去看不见 —— 得换成白色光晕
  ok('夜里悬浮靠光晕（黑阴影在深色底上等于没有）',
    /html\[data-theme="dark"\] \.ghribbon a:hover\{[^}]*box-shadow:[^}]*#ffffff/.test(html));
}

console.log('\n[5] 导航样式表存在且定义了当前页高亮');
{
  const css = fs.readFileSync(path.join(ROOT, 'nav.css'), 'utf8');
  ok('nav.css 有 .topnav 与选中态', /\.topnav\{/.test(css) && /\.topnav a\.on\{/.test(css));
  ok('nav.css 给编辑器的全高布局让了高度',
    /body > \.app\{height:calc\(100% - var\(--nav-h\)\)\}/.test(css), '缺少 .app 高度补偿');
  // 导航条高度和字号（和面板里的字号配一配）；用到兜底值的地方必须和它对得上
  const navH = (css.match(/:root\{\s*--nav-h:\s*(\d+)px/) || [])[1];
  ok('导航条高度是 63px（原来 42px 的 1.5 倍）', navH === '63', navH);
  ok('导航文字 14px（原 13px + 1）',
    /\.topnav\{[\s\S]*?font:14px\/1 system-ui/.test(css));
  const fallbacks = [];
  PAGES.forEach(p => {
    const h = fs.readFileSync(path.join(ROOT, p), 'utf8');
    [...h.matchAll(/var\(--nav-h,\s*(\d+)px\)/g)].forEach(m => fallbacks.push(p + ':' + m[1]));
  });
  ok('用到 --nav-h 兜底值的地方（' + fallbacks.length + ' 处）和它本身对得上',
    fallbacks.length > 0 && fallbacks.every(x => x.split(':')[1] === navH),
    fallbacks.join(' '));
}

console.log('\n[6] 回到顶部按钮');
{
  const js = fs.readFileSync(path.join(ROOT, 'nav.js'), 'utf8');
  const css = fs.readFileSync(path.join(ROOT, 'nav.css'), 'utf8');
  ok('nav.css 定义了 .totop', /\.totop\{/.test(css));
  ok('按钮是纯图标（无可见文字）', /textContent = '\\u2191'/.test(js),
    '按钮文字不是 ↑');
  ok('滚动事件驱动显隐', /\.totop\.on/.test(css) && /classList\.toggle\('on'/.test(js));
  // 第三项是 1 表示要「回到顶部」；后面还可能跟「同一个入口管的其它页」
  const withBtn = [...js.matchAll(/\['([^']+)',\s*'[^']*',\s*1[,\]]/g)].map(m => m[1]);
  ok('长页才需要它：三个公式页 + 教程（' + withBtn.slice().sort().join(',') + '）',
    withBtn.slice().sort().join(',') ===
      'f2l.html,oll.html,pll.html,tutorial-basic.html', withBtn.join(','));
}

console.log('\n[7] 三个公式页都有分节计数与编号角标');
{
  // 只做静态检查：确认样式和渲染代码都还在。
  // 真渲染另由 test/interaction.js 那套 DOM 桩覆盖（那是给编辑器用的）。
  ['f2l.html', 'oll.html', 'pll.html'].forEach(p => {
    const h = fs.readFileSync(path.join(ROOT, p), 'utf8');
    ok(p + ' 样式里有 .cnt 与 .no',
      /section > h2 \.cnt\{/.test(h) && /td\.pic \.no\{/.test(h));
    ok(p + ' 渲染时会输出计数与编号',
      /class="cnt"/.test(h) && /class="no"/.test(h));
  });
}

console.log('\n[8] F2L 角标：显示去掉前导 0，文件名不动');
{
  // 角标是给人看的、文件名是给磁盘的，两者不能一起改 ——
  // 所以这里同时盯住「角标没有 0 开头」和「文件名仍带 0」。
  const h = fs.readFileSync(path.join(ROOT, 'f2l.html'), 'utf8');
  ok('角标做了去前导 0', /name\.replace\(\/\^0\+\//.test(h));
  ok('文件名仍用原名（未被去 0 波及）', /IMG\(name\)/.test(h));
  const imgs = fs.readdirSync(path.join(ROOT, 'f2l'))
    .filter(f => f.endsWith('.png'));
  ok('磁盘上仍是 01a 这种命名（' + imgs.length + ' 张）',
    imgs.includes('f2l-01a-256x258.png') && imgs.includes('f2l-21b-256x258.png'),
    imgs.slice(0, 3).join(','));
}

console.log('\n[9] 页面数据必须是合法 JSON（备用公式就挂在里面）');
{
  // 生成器早期漏了两处尾逗号（分节一层、行一层），json 解析直接报错。
  // 这里盯住：能解析、结构对、AUF 标注合法。
  for (const p of ['oll.html', 'pll.html']) {
    const h = fs.readFileSync(path.join(ROOT, p), 'utf8');
    const m = h.match(/var SECTIONS = (\[[\s\S]*?\n\]);/);
    ok(p + ' 有 SECTIONS 数据段', !!m);
    if (!m) continue;
    let data;
    try { data = JSON.parse(m[1]); } catch (e) {
      ok(p + ' 数据是合法 JSON', false, e.message); continue;
    }
    ok(p + ' 数据是合法 JSON', true);
    const rows = data.flatMap(s2 => s2.rows);
    const ids = rows.map(r => r[0]);
    ok(p + ' 每行是 [编号, 公式] 或 [编号, 公式, 备选]',
      rows.every(r => (r.length === 2 || r.length === 3) && typeof r[0] === 'string' && typeof r[1] === 'string'),
      JSON.stringify(rows.find(r => !(r.length === 2 || r.length === 3)) || ''));
    // 同一情况可以收多条写法（PLL 的 Z 收了两条），所以只查编号非空
    ok(p + ' 编号齐全（' + ids.length + ' 条，去重 ' + new Set(ids).size + '）',
      ids.every(x => typeof x === 'string' && x.length > 0));
    const ms = rows.flatMap(r => (r[2] || []).map(a => a[1]));
    const okAuf = ms.every(m => Number.isInteger(m) && m >= 0 && m <= 3);
    ok(p + ' 备选 AUF 步数合法（' + ms.length + ' 条）', okAuf, ms.filter(m => !(Number.isInteger(m) && m >= 0 && m <= 3)).join(','));
    const alts = rows.flatMap(r => r[2] || []);
    ok(p + ' 备选不重复主式',
      rows.every(r => (r[2] || []).every(a => a[0].replace(/\s|\(|\)/g, '') !== r[1].replace(/\s|\(|\)/g, ''))));
  }
}

console.log('\n[11] 公式表的单元格不能用 display:flex');
{
  // 为一个真 bug 加的：给公式加「↗」链接时写了 td.f{display:flex}，
  // 单元格不再是 table-cell，行高和列宽全乱。
  ['f2l.html', 'oll.html', 'pll.html'].forEach(p => {
    const h = fs.readFileSync(path.join(ROOT, p), 'utf8');
    const bad = [...h.matchAll(/(td[\w.-]*\{[^}]*display:\s*flex[^}]*\})/g)].map(m => m[1]);
    ok(p + ' 的 td 没用 flex', bad.length === 0, bad.join(' | '));
    ok(p + ' 仍是正常表格（有 colgroup 或 table-layout）',
      /<colgroup>/.test(h) || /table-layout/.test(h));
  });
}

console.log('\n[11b] 「在计算器里打开」的按钮：图标要真、平时要淡');
{
  // 原来是个 ↗ 文字符号套个边框，看着像表格里掉了个框。现在是内联 SVG 图标
  // （跟着 currentColor 走，白天/夜晚不用各写一套）+ 固定大小的圆钮。
  ['f2l.html', 'oll.html', 'pll.html'].forEach(p => {
    const h = fs.readFileSync(path.join(ROOT, p), 'utf8');
    const icon = h.match(/var CALC_ICON = ('(?:[^'\\]|\\.)*'(?:\s*\+\s*'(?:[^'\\]|\\.)*')*);/);
    const svg = icon ? [...icon[1].matchAll(/'((?:[^'\\]|\\.)*)'/g)].map(m => m[1]).join('') : '';
    ok(p + ' 的按钮是内联 SVG 图标', /^<svg [^>]*viewBox="0 0 24 24"/.test(svg) &&
      /stroke="currentColor"/.test(svg) && /fill="currentColor"/.test(svg), svg.slice(0, 40));
    ok(p + ' 的图标是完整闭合的 XML', /<\/svg>$/.test(svg) &&
      (svg.match(/</g) || []).length === (svg.match(/>/g) || []).length, svg.slice(-12));
    ok(p + ' 的图标带了无障碍名字（title + aria-label）',
      /" title="' \+ tip/.test(h) && /" aria-label="' \+ tip/.test(h));
    ok(p + ' 的按钮不再用 ↗ 文字符号', !/[\u2197]/.test(h) &&
      /'" aria-label="' \+ tip \+ '">' \+ CALC_ICON/.test(h));
    // 一个表格里几十个这种钮，常亮会抢公式的戏：默认淡，指到行/钮才实心
    ok(p + ' 的按钮默认压暗（opacity:.55）', /a\.tocalc\{[^}]*opacity:\.55/.test(h));
    ok(p + ' 指到那一行时按钮亮起', /tr:hover a\.tocalc,a\.tocalc:hover,a\.tocalc:focus-visible\{opacity:1\}/.test(h));
    ok(p + ' 钮本身悬浮时填成 accent 实心、文字用 --on-accent（黄底压白字看不清）',
      /a\.tocalc:hover,a\.tocalc:focus-visible\{color:var\(--on-accent, #fff\);background:var\(--accent\)/.test(h));
    ok(p + ' 触屏（没有 hover）时不做淡出，按钮常亮',
      /@media \(hover:none\)\{a\.tocalc\{opacity:1\}\}/.test(h));
    ok(p + ' 打印时不印按钮', /@media print\{[\s\S]*?a\.tocalc\{display:none\}/.test(h));
  });
}

console.log('\n[12] 每个页面的内联脚本都必须能通过语法检查');
{
  // 为一个真事故加的：生成器里的转义被多吃了一层，oll.html / pll.html
  // 的内联脚本里出现了一个真换行，两个页面直接白屏 —— 而当时所有测试都通过，
  // 因为没有任何一条真的去解析这些脚本。用 new Function 做语法检查即可。
  PAGES.forEach(p => {
    const h = fs.readFileSync(path.join(ROOT, p), 'utf8');
    const blocks = [...h.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
    if (!blocks.length) return;                       // 没有内联脚本就跳过
    let err = null;
    blocks.forEach((b, i) => {
      try { new Function(b); } catch (e) { err = '第 ' + (i + 1) + ' 段: ' + e.message; }
    });
    ok(p + ' 的内联脚本语法正确（' + blocks.length + ' 段）', !err, err);
  });
}

console.log('\n[13] 切页不该闪：主题要预设、导航条要早注入');
{
  // 为主题闪烁加的两条：
  // 主题原来在页面渲染完之后才设 -> 先用浅色画一遍再翻深色，看着就是一闪。
  // nav.js 原来在 body 末尾 -> 内容先渲染再被挤下去 42px。
  PAGES.forEach(p => {
    const h = fs.readFileSync(path.join(ROOT, p), 'utf8');
    const head = h.slice(0, h.indexOf('</head>'));
    ok(p + ' 在 head 里预设主题（首次绘制前）',
      /localStorage\.getItem\('cube-theme'\)/.test(head) &&
      /dataset\.theme/.test(head), 'head 里没有预设主题的脚本');
    const body = h.slice(h.indexOf('<body>'));
    const navAt = body.indexOf('src="nav.js"');
    ok(p + ' 的 nav.js 在 body 开头注入（不产生位移）',
      navAt >= 0 && navAt < 200, 'nav.js 位置 ' + navAt);
    ok(p + ' 只引用一次 nav.js', (h.match(/src="nav\.js"/g) || []).length === 1);
  });

  // 公式表的图是懒加载的：不给 aspect-ratio 的话，加载完成前高度为 0，
  // 加载后整行被撑高 —— 切页时又是一次跳动
  ['f2l.html', 'oll.html', 'pll.html'].forEach(p => {
    const h = fs.readFileSync(path.join(ROOT, p), 'utf8');
    ok(p + ' 给图片预留了高度（aspect-ratio）',
      /td\.pic img\{[^}]*aspect-ratio/.test(h), '没有 aspect-ratio，加载时行高会跳');
  });
}

console.log('\n[14] 导航高亮框：会滑动的 .pill');
{
  // 换页时「当前页」那个蓝框要滑到点击的那一项，而不是原地跳过去。
  // 光看正则看不出对不对，这里用 DOM 桩真跑一遍 nav.js。
  const vm = require('vm');
  const nav = fs.readFileSync(path.join(ROOT, 'nav.js'), 'utf8');
  const SEL = '.topnav .links a[href]';

  // 桩里的「布局」：元素依次往右排，好让 placePill 算出不同位置
  let seq = 0;
  function el(tag) {
    const e = {
      tagName: tag, children: [], dataset: {}, style: {},
      className: '', textContent: '', href: '', value: '',
      offsetLeft: (seq++) * 48, offsetTop: 0, offsetWidth: 40, offsetHeight: 30,
      classList: {
        _s: new Set(),
        add(c) { this._s.add(c); },
        remove(c) { this._s.delete(c); },
        contains(c) { return this._s.has(c); },
        toggle(c, on) {
          if (on === undefined) { this._s.has(c) ? this._s.delete(c) : this._s.add(c); }
          else if (on) { this._s.add(c); } else { this._s.delete(c); }
        }
      },
      appendChild(c) { this.children.push(c); return c; },
      insertBefore(c) { this.children.unshift(c); return c; },
      setAttribute(k, v) { this[k] = v; },
      getAttribute(k) { return this[k]; },
      addEventListener(t, fn) { (this._e = this._e || {});
                              (this._e[t] = this._e[t] || []).push(fn); },
      querySelectorAll() { return []; }, querySelector() { return null; },
      closest() { return null; }
    };
    return e;
  }

  function run(page, opts) {
    opts = opts || {};
    seq = 0;
    const body = el('body');
    const store = Object.assign({}, opts.store || {});
    const doc = {
      body, documentElement: el('html'), createElement: el,
      getElementById: () => null, querySelectorAll: () => [],
      readyState: 'loading',          // 让 nav.js 走 DOMContentLoaded 那条路
      addEventListener(t, fn) { (this._e = this._e || {});
                              (this._e[t] = this._e[t] || []).push(fn); }
    };
    const pending = [], observers = [];
    const ctx = {
      console, clearTimeout() {},
      // 换主题时 nav.js 会盯着 data-theme（切换期间给 <html> 挂 theme-anim），
      // 桩里记下回调，测试里手动触发
      MutationObserver: function (cb) { this.observe = () => observers.push(cb); },
      // defer=true 时把回调攒起来，好检查「蓝框到位前 / 到位后」两个阶段
      setTimeout(fn) { pending.push(fn); if (!opts.defer) fn(); return 0; },
      // 导航里「教程」入口要读 localStorage 找上次看的那一篇
      localStorage: { getItem: k => (k in store ? store[k] : null),
                      setItem: (k, v) => { store[k] = String(v); },
                      removeItem: k => { delete store[k]; } },
      sessionStorage: { getItem: k => (k in store ? store[k] : null),
                        setItem: (k, v) => { store[k] = String(v); },
                        removeItem: k => { delete store[k]; } },
      window: { addEventListener() {}, pageYOffset: 0,
                matchMedia: () => ({ matches: !!opts.reduce }) },
      document: doc, location: { pathname: '/' + page, href: '' }, navigator: {}
    };
    ctx.globalThis = ctx;
    vm.createContext(ctx);
    vm.runInContext(nav, ctx);
    const navEl = body.children[0];
    const links = navEl.children[1];            // [0] 是 brand
    return {
      ctx, body, links, store, pill: links.children[0], pending, observers,
      linkAt: i => links.children[i + 1],       // [0] 是 .pill
      // 导航项会变多，测试里一律按文字找，别写下标
      linkTo: t => links.children.find(c => String(c.textContent).indexOf(t) >= 0),
      active: links.children.find(c => c.className === 'on'),
      domReady: () => (doc._e.DOMContentLoaded || []).forEach(fn => fn()),
      click: e => (doc._e.click || []).forEach(fn => fn(e))
    };
  }

  function fire(target, extra) {
    let prevented = false;
    const e = Object.assign({
      button: 0, defaultPrevented: false,
      preventDefault() { prevented = true; },
      target: { closest: sel => (sel === 'a[href]' ? target : null) }
    }, extra || {});
    return { e, got: () => prevented };
  }

  /* 换主题：变量每帧都在变，元素自己那些「悬停变色」的过渡会被每帧重启 ——
     主页卡片的边框就会抖一下。所以切换期间要给 <html> 挂 theme-anim，
     让元素的过渡让路（规则在 theme.css），走完再摘掉。 */
  {
    const r = run('oll.html', { defer: true });
    ok('nav.js 盯着 data-theme 的变化', r.observers.length === 1, String(r.observers.length));
    if (r.observers[0]) r.observers[0]();
    ok('切主题时给 <html> 挂 theme-anim',
      r.ctx.document.documentElement.classList.contains('theme-anim'));
    r.pending.forEach(fn => fn());
    ok('变量过渡走完（260ms）就摘掉，不一直压着元素的过渡',
      !r.ctx.document.documentElement.classList.contains('theme-anim'));
  }

  // 结构：.links 里有个 .pill，排在最前面（垫在链接下面）
  /* 「回到顶部」按钮：长页才有；一个入口管好几页时，每一页都要有 */
  {
    const has = r => r.body.children.some(c => c.className === 'totop');
    ok('教程进阶页也有「回到顶部」（它和初级共用一个导航入口）', has(run('tutorial-advanced.html')));
    ok('教程初级页有', has(run('tutorial-basic.html')));
    ok('计算器这种非长页没有', !has(run('calc.html')));
    const css = fs.readFileSync(path.join(ROOT, 'nav.css'), 'utf8');
    const totopBox = css.slice(css.indexOf('.totop{'), css.indexOf('}', css.indexOf('.totop{')));
    ok('按钮是带圆角的正方形（不是圆的）',
      /border-radius:11px/.test(totopBox) && !/border-radius:50%/.test(totopBox), totopBox.slice(0, 90));
  }

  /* 一个入口管好几页（教程初级 / 进阶）：导航要跳到「上次看的那一篇」 */
  {
    const a = run('oll.html', { store: { 'cube-last:tutorial-basic.html': 'tutorial-advanced.html' } });
    ok('看过进阶之后，导航里「教程」指向进阶页',
      (a.linkTo('教程').href || '').indexOf('tutorial-advanced.html') >= 0, a.linkTo('教程').href);
    const b = run('oll.html');
    ok('没看过就默认初级页',
      (b.linkTo('教程').href || '').indexOf('tutorial-basic.html') >= 0, b.linkTo('教程').href);
  }

  const r0 = run('oll.html');
  ok('.links 里有 .pill', !!r0.pill && r0.pill.className === 'pill',
    r0.pill && r0.pill.className);
  ok('.pill 是 .links 的第一个子节点（垫在链接下面）', r0.links.children[0] === r0.pill);
  ok('当前页那一项带着 .on', !!r0.active, '没找到 .on');
  ok('开屏就把蓝框摆到当前项上（位置 = 该项的 offset）',
    !!r0.active && r0.pill.style.transform ===
      'translate(' + r0.active.offsetLeft + 'px,' + r0.active.offsetTop + 'px)',
    r0.pill.style.transform + ' vs ' + (r0.active && r0.active.offsetLeft));
  ok('开屏定位时关掉过渡（否则会看到它从左上角滑过来）',
    /pill\.style\.transition = 'none'/.test(nav));
  ok('窗口尺寸变化后重新对位',
    /window\.addEventListener\('resize'[\s\S]{0,80}?placePill/.test(nav));

  // 点别的导航项：蓝框滑过去，滑完再跳
  {
    const r = run('oll.html');
    const before = r.pill.style.transform;
    const c = fire(r.linkTo('PLL'));              // 当前页是 OLL，点 PLL
    r.click(c.e);
    ok('点别的导航项：蓝框滑过去（transform 变了）',
      c.got() && r.pill.style.transform !== before,
      before + ' -> ' + r.pill.style.transform);
    ok('点别的导航项：滑完才跳页', r.ctx.location.href === 'pll.html',
      r.ctx.location.href);
  }
  // 文字颜色必须和蓝框同步 —— 否则蓝框一走，旧项的白字留在浅底上就看不见了，
  // 看着就像「框先滑过去、字过一会儿才冒出来」
  {
    const r = run('oll.html', { defer: true });
    const from = r.active, to = r.linkTo('PLL');
    const c = fire(to);
    r.click(c.e);
    ok('点下去：旧项立刻褪回灰字',
      !from.classList.contains('on'), [...from.classList._s].join(','));
    ok('点下去：新项先不变白字（蓝框还没到，白字在浅底上看不见）',
      !to.classList.contains('on'), [...to.classList._s].join(','));
    r.pending.forEach(fn => fn());
    ok('蓝框到位后：新项才变白字',
      to.classList.contains('on'), [...to.classList._s].join(','));
    ok('蓝框到位后才跳页', r.ctx.location.href === 'pll.html', r.ctx.location.href);
  }
  // 点当前项：不拦（浏览器照常处理）
  {
    const r = run('oll.html');
    const c = fire(r.active);
    r.click(c.e);
    ok('点当前项：不拦、也不动蓝框', !c.got());
  }
  // 下面这些也都不该拦
  [['ctrl+点击（新标签）', { ctrlKey: true }],
   ['shift+点击', { shiftKey: true }],
   ['中键', { button: 1 }]].forEach(([name, extra]) => {
    const r = run('oll.html');
    const c = fire(r.linkAt(0), extra);
    r.click(c.e);
    ok('不拦：' + name, !c.got());
  });
  // 站内链接（首页那六张卡片、公式表的 ↗）都走同一套：
  // 内容淡出 + 蓝框滑到目标页对应的那一项
  {
    const r = run('index.html', { defer: true });
    const card = el('a');
    card.setAttribute('href', 'editor.html');
    const c = fire(card);
    r.click(c.e);
    ok('点首页卡片：拦下来，内容先淡出',
      c.got() && r.body.classList.contains('nav-fade'),
      'preventDefault=' + c.got() + ' 类=' + [...r.body.classList._s].join(','));
    ok('点首页卡片：蓝框滑到对应那一项（编辑器）',
      r.pill.style.transform ===
        'translate(' + r.linkTo('编辑器').offsetLeft + 'px,' + r.linkTo('编辑器').offsetTop + 'px)',
      r.pill.style.transform);
    r.pending.forEach(fn => fn());
    ok('内容淡完才跳页', r.ctx.location.href === 'editor.html', r.ctx.location.href);
  }
  // 公式表的 ↗：calc.html#公式 也走同一套，蓝框还要滑到「计算器」
  {
    const r = run('oll.html', { defer: true });
    const jump = el('a');
    jump.setAttribute('href', 'calc.html#R_U_R');
    const c = fire(jump);
    r.click(c.e);
    ok('点公式的 ↗：拦下来，内容先淡出',
      c.got() && r.body.classList.contains('nav-fade'),
      'preventDefault=' + c.got() + ' 类=' + [...r.body.classList._s].join(','));
    ok('点公式的 ↗：蓝框滑到「计算器」',
      r.pill.style.transform ===
        'translate(' + r.linkTo('计算器').offsetLeft + 'px,' + r.linkTo('计算器').offsetTop + 'px)',
      r.pill.style.transform);
    r.pending.forEach(fn => fn());
    ok('跳页时 # 里的公式没丢', r.ctx.location.href === 'calc.html#R_U_R',
      r.ctx.location.href);
  }
  // 目标页不在导航表里：照样淡出，只是蓝框无处可去
  {
    const r = run('index.html', { defer: true });
    const other = el('a');
    other.setAttribute('href', 'elsewhere.html');
    const before = r.pill.style.transform;
    const c = fire(other);
    r.click(c.e);
    ok('目标不在导航表里：仍然淡出，蓝框不动',
      c.got() && r.body.classList.contains('nav-fade') &&
      r.pill.style.transform === before,
      'preventDefault=' + c.got() + ' 蓝框=' + r.pill.style.transform);
  }
  // 当前页的锚点（比如站在 calc.html 上点 calc.html#...）交给浏览器
  {
    const r = run('calc.html');
    const self = el('a');
    self.setAttribute('href', 'calc.html#R_U');
    const c = fire(self);
    r.click(c.e);
    ok('当前页的锚点链接：不拦', !c.got());
  }
  // 点到不是链接的地方：一点影响都没有
  {
    const r = run('index.html');
    let prevented = false;
    r.click({ button: 0, defaultPrevented: false,
              preventDefault() { prevented = true; },
              target: { closest: () => null } });
    ok('点到非链接区域：不受影响',
      !prevented && !r.body.classList.contains('nav-fade'));
  }
  // 直接打开 / 刷新：没有标记，内容不淡（否则每次开页都白闪一下）
  {
    const r = run('index.html');
    ok('直接打开：内容不淡', !r.body.classList.contains('nav-fade'),
      [...r.body.classList._s].join(','));
  }
  // 带标记打开：先隐着，等 DOM 好了再淡进来
  {
    const r = run('pll.html', { defer: true,
      store: { 'cube-nav-fade': JSON.stringify({ t: Date.now() }) } });
    ok('带标记打开：先挂上 .nav-fade（首次绘制前就把内容隐掉，才不闪）',
      r.body.classList.contains('nav-fade'), [...r.body.classList._s].join(','));
    r.domReady();
    ok('DOM 好了：摘掉 .nav-fade，内容淡进来',
      !r.body.classList.contains('nav-fade'), [...r.body.classList._s].join(','));
    ok('标记用完即删（刷新不再淡）',
      !('cube-nav-fade' in r.store), JSON.stringify(r.store));
  }
  // 过期标记不认（导航被中途取消时不残留）
  {
    const r = run('pll.html',
      { store: { 'cube-nav-fade': JSON.stringify({ t: Date.now() - 9000 }) } });
    ok('过期标记（>3 秒）不淡入', !r.body.classList.contains('nav-fade'),
      [...r.body.classList._s].join(','));
  }
  // 系统设了「减少动态效果」：既不滑也不淡，直接跳
  {
    const r = run('oll.html', { reduce: true });
    const c = fire(r.linkTo('PLL'));
    r.click(c.e);
    ok('「减少动态效果」：不拦、不滑、不淡',
      !c.got() && !r.body.classList.contains('nav-fade'),
      'preventDefault=' + c.got() + ' 类=' + [...r.body.classList._s].join(','));
  }
  // 样式得配齐，否则类/内联样式都白设
  {
    const css = fs.readFileSync(path.join(ROOT, 'nav.css'), 'utf8');
    ok('.links 是定位参照（position:relative）',
      /\.topnav \.links\{[^}]*position:relative/.test(css));
    ok('.pill 绝对定位 + 有 transform 过渡',
      /\.topnav \.pill\{[^}]*position:absolute[^}]*transition:transform/.test(css));
    ok('链接压在方块上面（z-index:1）',
      /\.topnav a\{[^}]*z-index:1/.test(css));
    ok('当前项底色改由 .pill 提供（链接自身不再画背景，字色跟着 --on-accent）',
      /\.topnav a\.on\{color:var\(--on-accent, #fff\)\}/.test(css) &&
      !/\.topnav a\.on\{background/.test(css));
    ok('悬停不再加背景（否则会盖在蓝框上、看着发灰）',
      /\.topnav a:hover\{color:var\(--text, #222\)\}/.test(css) &&
      !/\.topnav a:hover\{[^}]*background/.test(css));
    ok('尊重 prefers-reduced-motion', /prefers-reduced-motion/.test(css));
    ok('链接变色的时长和 .pill 滑动一致（看着才像同一件事）',
      /\.topnav a\{[^}]*transition:background \.12s, color \.18s/.test(css) &&
      /\.topnav \.pill\{[^}]*transition:transform \.18s/.test(css));
    ok('nav.css 有内容淡出/淡入，且导航条不参与',
      /body > \*:not\(\.topnav\)\{transition:opacity/.test(css) &&
      /body\.nav-fade > \*:not\(\.topnav\)\{opacity:0\}/.test(css) &&
      !/body\.nav-fade\{[^}]*opacity/.test(css));
    ok('减少动态效果时内容也不淡（别把内容真藏起来）',
      /prefers-reduced-motion: reduce\)\{[\s\S]{0,240}?body\.nav-fade > \*:not\(\.topnav\)\{opacity:1\}/.test(css));
  }
}

console.log('\n[15] 各页的明暗底色约定必须一致');
{
  // 颜色变量现在都在 theme.css 里（七页共用一份），所以这里读的是它。
  // 这一节仍然对每个页面真跑一遍 <head> 里的预设脚本，算出实际生效的 --bg，
  // 再核对三档存档 —— 脚本、属性、变量三者得对上，缺一处就会「切页面变配色」。
  const vm = require('vm');
  const themeCss = fs.readFileSync(path.join(ROOT, 'theme.css'), 'utf8');

  const headThemeScript = h => {
    const head = h.slice(0, h.indexOf('</head>'));
    return [...head.matchAll(/<script>([\s\S]*?)<\/script>/g)]
      .map(m => m[1]).filter(b => b.includes('cube-theme')).join('\n');
  };
  // 注意 (?:^|\n)：theme.css 的打印块里也有「:root,html[data-theme="dark"]{」，
  // 不锚行首就会读到打印那套白底
  const bgOf = key => {
    const re = key === ':root'
      ? /(?:^|\n):root\{[^}]*?--bg:\s*(#[0-9a-fA-F]{6})/
      : new RegExp('(?:^|\\n)html\\[data-theme="' + key + '"\\]\\{[^}]*?--bg:\\s*(#[0-9a-fA-F]{6})');
    const m = themeCss.match(re);
    return m ? m[1] : null;
  };
  const isDark = hex => {
    const n = parseInt(hex.slice(1), 16);
    return ((n >> 16 & 255) + (n >> 8 & 255) + (n & 255)) / 3 < 128;
  };
  function effective(h, stored) {
    const el = { dataset: {} };
    const ctx = { document: { documentElement: el },
                  localStorage: { getItem: k => (k === 'cube-theme' ? stored : null) } };
    ctx.globalThis = ctx;
    vm.createContext(ctx);
    vm.runInContext(headThemeScript(h), ctx);
    const t = el.dataset.theme;
    // data-theme 没设时，生效的是 :root 的基础值
    const bg = (t ? bgOf(t) : null) || bgOf(':root');
    return { theme: t || '(未设)', bg: bg, dark: isDark(bg) };
  }

  PAGES.forEach(p => {
    const h = fs.readFileSync(path.join(ROOT, p), 'utf8');
    [['没存档（站点的默认）', null, false],
     ['存档为 light', 'light', false],
     ['存档为 dark', 'dark', true]].forEach(([name, store, wantDark]) => {
      const e = effective(h, store);
      ok(p + ' ' + name + '时是' + (wantDark ? '夜晚' : '白天'),
        e.dark === wantDark, '实际 --bg=' + e.bg + ' theme=' + e.theme);
    });
  });

  // 预设脚本只管「首次绘制前」；主脚本里的 theme 变量也得读同一个存档，
  // 否则会先按存档画好、再被主脚本覆盖回去（editor.html 原来就只认深色）
  {
    const h = fs.readFileSync(path.join(ROOT, 'editor.html'), 'utf8');
    ok('editor.html 主脚本的 theme 也读 cube-theme',
      /var theme = 'light';[\s\S]{0,200}?localStorage\.getItem\('cube-theme'\)/.test(h));
    ok('editor.html 切换主题会写回 cube-theme（和别的页共用同一个键）',
      /function applyTheme[\s\S]{0,260}?localStorage\.setItem\('cube-theme', theme\)/.test(h));
  }
}

console.log('\n[16] 调色板：两套主题都在 theme.css 里，层次和对比度都得站得住');
{
  // 换配色只需要改 theme.css 一个文件，所以这里读的也是它。
  // 盯的是「关系」而不是具体色号 —— 卡面要比页面亮、正文压卡面要够清楚、
  // --on-accent 压在 accent 实心底上要够清楚……色号本身随便换。
  const css = fs.readFileSync(path.join(ROOT, 'theme.css'), 'utf8');
  function lum(hex) {
    const ch = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
      .map(c => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)));
    return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
  }
  function contrast(a, b) {
    const s = [lum(a), lum(b)].sort((m, n) => n - m);
    return (s[0] + 0.05) / (s[1] + 0.05);
  }
  const vars = re => {
    const m = css.match(re);
    if (!m) return null;
    const out = {};
    [...m[1].matchAll(/(--[\w-]+)\s*:\s*(#[0-9a-fA-F]{6,8})/g)]
      .forEach(x => { out[x[1]] = x[2].toLowerCase(); });
    return out;
  };
  const light = vars(/(?:^|\n):root\{([\s\S]*?)\n\}/);
  const dark = vars(/(?:^|\n)html\[data-theme="dark"\]\{([\s\S]*?)\n\}/);
  ok('theme.css 里有白天和夜晚两套变量', !!light && !!dark);

  if (light && dark) {
    // 两套必须给出同一批变量名 —— 少一个，那一套主题下就会掉回浏览器默认值
    ok('两套主题定义的变量名完全一致',
      Object.keys(light).sort().join() === Object.keys(dark).sort().join(),
      '只在一套里有的：' + Object.keys(light).filter(k => !dark[k])
        .concat(Object.keys(dark).filter(k => !light[k])).sort().join(' '));
    ok('--accent-text 默认跟着 --accent（只有当「当底」和「当文字」要分两档时才覆盖）',
      /--accent-text\s*:\s*var\(--accent\)/.test(css));

    [['白天', light, ['#eef1ff', '#d2daff', '#aac4ff', '#b1b2ff'], '#d2daff', '#3a3f73'],
     ['夜晚', dark, ['#222831', '#393e46', '#ffd369', '#eeeeee'], '#222831', '#eeeeee']
    ].forEach(([name, v, PALETTE, wantBg, wantText]) => {
      const surface = v['--card'] || v['--panel'];
      const at = v['--accent-text'] || v['--accent'];   // accent 当文字用的那一档
      const missing = PALETTE.filter(c => !Object.values(v).includes(c));
      ok(name + '：指定的四色都用上了', missing.length === 0, '缺 ' + missing.join(' '));
      ok(name + '：页面底是 ' + wantBg, v['--bg'] === wantBg, v['--bg']);
      ok(name + '：卡面比页面亮一档（卡片才分得出来）',
        lum(surface) > lum(v['--bg']), 'bg=' + v['--bg'] + ' 卡面=' + surface);
      // 计算器 / 练习 / 编辑器里，占满屏的是舞台不是 --bg
      ok(name + '：舞台不比卡面亮',
        !v['--stage'] || lum(v['--stage']) <= lum(surface),
        '舞台=' + v['--stage'] + ' 卡面=' + surface);
      ok(name + '：正文是 ' + wantText, v['--text'] === wantText, v['--text']);
      ok(name + '：正文压卡面够清楚（' + contrast(v['--text'], surface).toFixed(1) + ':1）',
        contrast(v['--text'], surface) >= 7, '正文=' + v['--text'] + ' on ' + surface);
      // 次要文字（表头、说明、图上的编号）—— 最容易糊的就是这一档
      ok(name + '：次要文字压卡面够清楚（' + contrast(v['--muted'], surface).toFixed(1) + ':1）',
        contrast(v['--muted'], surface) >= 4.5, 'muted=' + v['--muted'] + ' on ' + surface);
      // accent 当底、上面压 --on-accent 的字（药丸、标签、选中的按钮…）
      ok(name + '：--on-accent 压 accent 实心底够清楚（' +
        contrast(v['--on-accent'], v['--accent']).toFixed(1) + ':1）',
        contrast(v['--on-accent'], v['--accent']) >= 4.5,
        'on-accent=' + v['--on-accent'] + ' on ' + v['--accent']);
      ok(name + '：accent 当文字压卡面够清楚（' + contrast(at, surface).toFixed(1) + ':1）',
        contrast(at, surface) >= 4.5, 'accent=' + at + ' on ' + surface);
      ok(name + '：accent 当文字压页面底不算糊（' + contrast(at, v['--bg']).toFixed(1) + ':1）',
        contrast(at, v['--bg']) >= 3, 'accent=' + at + ' on ' + v['--bg']);
      ok(name + '：描边色和卡面不是一个色（不然表格没有边）',
        v['--line'] !== surface && v['--line-strong'] !== surface);
      // 主按钮（计算器的播放键）：实心底 + 上面的图标 + 更重的投影，
      // 三样都得从卡面上「跳出来」，不然当不成主按钮
      ok(name + '：主按钮的图标压得住它的底色（' +
        contrast(v['--primary-fg'], v['--primary2']).toFixed(1) + ':1）',
        contrast(v['--primary-fg'], v['--primary2']) >= 3,
        'primary-fg=' + v['--primary-fg'] + ' on primary2=' + v['--primary2']);
      ok(name + '：主按钮比卡面重（' + contrast(v['--primary2'], surface).toFixed(1) + ':1）',
        contrast(v['--primary2'], surface) >= 3 && lum(v['--primary2']) !== lum(surface),
        'primary2=' + v['--primary2'] + ' on ' + surface);
      ok(name + '：主按钮上下两端有色差（才看得出是「有厚度」的实心块）',
        lum(v['--primary']) !== lum(v['--primary2']),
        'primary=' + v['--primary'] + ' primary2=' + v['--primary2']);
    });
  }
}

console.log('\n[16b] 换配色只改 theme.css 一处');
{
  // 「以后想调颜色更方便」就靠这一节守着：颜色变量只许在 theme.css 里定义。
  // 谁在自己页面里又写一套 --bg，改一处就会漏掉一页。
  PAGES.forEach(p => {
    const h = fs.readFileSync(path.join(ROOT, p), 'utf8');
    ok(p + ' 链了 theme.css', /<link rel="stylesheet" href="theme\.css">/.test(h));
    const first = Math.min(...['theme.css', 'nav.css', '<style>']
      .map(x => h.indexOf(x)).filter(i => i >= 0));
    ok(p + ' 的 theme.css 排在 nav.css 和页面 <style> 之前（页面要能盖住它）',
      h.indexOf('theme.css') === first,
      'theme.css@' + h.indexOf('theme.css') + ' 最早@' + first);
    const style = h.slice(h.indexOf('<style>'), h.indexOf('</style>'));
    const own = [...style.matchAll(/(--[\w-]+)\s*:\s*[^;{}]*#[0-9a-fA-F]{3,8}/g)].map(m => m[1]);
    ok(p + ' 页面里没有自己定义颜色变量', own.length === 0, own.join(' '));
  });
  // 打印也是一套配色，同样归 theme.css —— 速查表打印出来要白底黑字，
  // 而且得压得住夜晚那套（:root 压不过 html[data-theme="dark"]，所以两个选择器都列上）
  const css = fs.readFileSync(path.join(ROOT, 'theme.css'), 'utf8');
  ok('theme.css 里带打印用的白底黑字，且能压过夜晚那套',
    /@media print\{[\s\S]*?:root,html\[data-theme="dark"\]\{[\s\S]*?--bg:#fff/.test(css));
  // 三个「面板」页（计算器 / 练习 / 编辑器）共用同一套版式语言：
  // 小标题都是正文色 + 加粗 + 底下一道细线。谁偷偷改回灰的，并排一看就不一样了。
  ['calc.html', 'practice.html', 'editor.html'].forEach(p => {
    const h = fs.readFileSync(path.join(ROOT, p), 'utf8');
    ok(p + ' 的小标题和别的面板页同一档（正文色 + 加粗 + 细线）',
      /\.sec > h2\{[^}]*color:var\(--text\);font-weight:700;[^}]*border-bottom:1px solid var\(--line\)/.test(h));
  });
  ['f2l.html', 'oll.html', 'pll.html'].forEach(p => {
    const h = fs.readFileSync(path.join(ROOT, p), 'utf8');
    const pr = h.slice(h.indexOf('@media print'));
    ok(p + ' 的打印块只管版式，不再自己写颜色', !/--[\w-]+\s*:\s*#/.test(pr));
  });
}

console.log('\n[16c] 白天/夜晚切换：颜色能插值，整页淡过去');
{
  const css = fs.readFileSync(path.join(ROOT, 'theme.css'), 'utf8');
  const root = css.match(/(?:^|\n):root\{([\s\S]*?)\n\}/)[1];
  const names = [...root.matchAll(/(--[\w-]+)\s*:\s*[^;]+;/g)].map(m => m[1]);
  ok('theme.css 里的颜色变量数得出来（' + names.length + ' 个）', names.length > 30, names.length);

  // 自定义属性默认是「字符串替换」，不能插值 —— 必须注册成颜色型，切换才能淡过去
  const reg = {};
  [...css.matchAll(/@property\s+(--[\w-]+)\s*\{\s*syntax:\s*'<color>'\s*;\s*inherits:\s*true\s*;\s*initial-value:\s*([^;]+);/g)]
    .forEach(m => { reg[m[1]] = m[2].trim(); });
  const missing = names.filter(n => !reg[n]);
  ok('每个颜色变量都注册成 @property <color>', missing.length === 0, missing.join(' '));
  const withVar = Object.keys(reg).filter(n => /var\(/.test(reg[n]));
  ok('initial-value 都是实打实的颜色（@property 里不解析 var()）',
    withVar.length === 0, withVar.join(' '));

  // 过渡挂在 :root 上，并且尊重系统的「减少动态效果」
  const rm = css.match(/@media \(prefers-reduced-motion: no-preference\)\{\s*:root\{([\s\S]*?)\n  \}/);
  ok('过渡挂在 :root 上，并受 prefers-reduced-motion 保护', !!rm);
  const inTrans = rm ? rm[1] : '';
  // 1px 的细线故意不参与过渡（逐帧重绘 + 分数像素比 = 边框闪）——
  // 这份名单是故意的，写死在这里；其它颜色一个都不许漏
  const NO_ANIM = ['--line', '--line-strong', '--kbd-line', '--toast-line'];
  const noTrans = names.filter(n => inTrans.indexOf(n + ' ') < 0);
  ok('除了 1px 细线那 ' + NO_ANIM.length + ' 个，其它颜色都在过渡列表里（' +
     (names.length - NO_ANIM.length) + ' 项）',
    noTrans.length === NO_ANIM.length && noTrans.every(n => NO_ANIM.includes(n)),
    noTrans.join(' '));
  ok('细线那 ' + NO_ANIM.length + ' 个确实没进过渡列表（边框不会再逐帧重绘）',
    NO_ANIM.every(n => inTrans.indexOf(n + ' ') < 0) &&
    /画成 1px 线的那几个颜色故意不参与过渡/.test(css));
  ok('时长是 240ms 这一档（再长就像「页面在变色」了）',
    /--bg 240ms ease/.test(inTrans) && !/--bg \d{4,}ms/.test(inTrans));

  // 元素自己的过渡（比如主页卡片 .card{transition:border-color .14s}）会和变量过渡打架：
  // 变量每帧都在变 → 元素那条约每帧重启一次 → 边框看着抖一下。
  // 所以切换期间要有一条把它们全关掉的规则，但要放行主题开关里的滑块。
  ok('切换期间关掉元素自己的过渡（放行主题开关滑块 .tk）',
    /html\.theme-anim \*:not\(\.tk\)[^{]*\{\s*transition:\s*none !important/.test(css) &&
    /html\.theme-anim \*:not\(\.tk\)::before/.test(css) &&
    /html\.theme-anim \*:not\(\.tk\)::after/.test(css));
  const navJs = fs.readFileSync(path.join(ROOT, 'nav.js'), 'utf8');
  ok('nav.js 用 MutationObserver 盯 data-theme，挂/摘 theme-anim',
    /new MutationObserver\(/.test(navJs) &&
    /attributeFilter:\s*\['data-theme'\]/.test(navJs) &&
    /classList\.add\('theme-anim'\)/.test(navJs) &&
    /classList\.remove\('theme-anim'\)/.test(navJs));
  ok('摘掉的时机比变量过渡（240ms）稍晚一点',
    /\}, 260\)/.test(navJs));

  // 首屏不能补一段动画：head 里的脚本要在首次样式计算前把 data-theme 定好
  // （首次样式计算不触发 transition，所以只要定得够早，打开页面就是「已到位」的样子）
  PAGES.forEach(p => {
    const h = fs.readFileSync(path.join(ROOT, p), 'utf8');
    const head = h.slice(0, h.indexOf('</head>'));
    ok(p + ' 在 head 里就定好主题（首屏不会补一段变色动画）',
      /dataset\.theme\s*=/.test(head) && /localStorage\.getItem\('cube-theme'\)/.test(head));
  });
}

console.log('\n[17] 白天 / 夜晚开关（滑动式，七页共用一份标记和样式）');
{
  const nav = fs.readFileSync(path.join(ROOT, 'nav.js'), 'utf8');
  const css = fs.readFileSync(path.join(ROOT, 'nav.css'), 'utf8');

  ok('nav.js 给 #themebtn 注入标记（滑块 + 两端图标）',
    /getElementById\('themebtn'\)/.test(nav) &&
    /'<span class="tk"><\/span>'/.test(nav) &&
    /class="ti sun"/.test(nav) && /class="ti moon"/.test(nav));
  ok('图标是内联 SVG（字符图标在不同系统上会变成 emoji）',
    /sun: '<svg/.test(nav) && /moon: '<svg/.test(nav) &&
    !/[\u2600\u263e]/.test(nav));
  ok('等 DOM 好了再注入（#themebtn 在 nav.js 后面才解析到）',
    /document\.addEventListener\('DOMContentLoaded', buildThemeSwitch\)/.test(nav));
  ok('开关带 role=switch，并同步 aria-checked',
    /setAttribute\('role', 'switch'\)/.test(nav) && /aria-checked/.test(nav));

  ok('nav.css 画轨道（药丸）',
    /body \.themebtn\{[^}]*width:56px[^}]*border-radius:14px/.test(css));
  ok('nav.css 画滑块，并按 data-theme 滑到两端',
    /\.themebtn \.tk\{[^}]*border-radius:50%/.test(css) &&
    /html\[data-theme="dark"\] body \.themebtn \.tk\{[^}]*transform:translateX\(28px\)/.test(css));
  ok('两端图标压在滑块上面（两边都看得见）',
    /\.themebtn \.ti\{[^}]*position:absolute/.test(css) &&
    /\.themebtn \.sun\{left:2px/.test(css) && /\.themebtn \.moon\{right:2px\}/.test(css));
  ok('当前那一边的图标亮、另一边留灰',
    /html\[data-theme="dark"\] body \.themebtn \.sun\{color:var\(--muted/.test(css) &&
    /html\[data-theme="dark"\] body \.themebtn \.moon\{color:var\(--on-accent/.test(css));
  // 夜晚的滑块是 accent 色，上面的月亮得用 --on-accent ——
  // 否则「亮底压亮字」，月亮会看不见（换主题色时最容易踩的一脚）
  ok('夜晚滑块用 accent，月亮图标用 --on-accent（一对）',
    /html\[data-theme="dark"\] body \.themebtn \.tk\{[^}]*background:var\(--accent/.test(css));

  // 各页只保留定位，尺寸/底色这些都交给 nav.css —— 免得七份各写一套互相打架
  PAGES.forEach(p => {
    const h = fs.readFileSync(path.join(ROOT, p), 'utf8');
    const m = h.match(/\.themebtn\{([^}]*)\}/);
    ok(p + ' 的 .themebtn 只保留定位',
      !!m && !/width|height|background|border|border-radius/.test(m[1]),
      m && m[1].trim());
    ok(p + ' 的按钮里没有写死的图标字符',
      !/<button class="themebtn"[^>]*>[^<]*[\u2600\u263e]/.test(h));
  });
}

console.log('\n[18] 站名');
{
  // 站名散在两个地方：首页 <title>/<h1>，以及 nav.js 里的导航条品牌名。
  // 改名时很容易只改一处，所以在这里对一下。
  const idx = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const nav = fs.readFileSync(path.join(ROOT, 'nav.js'), 'utf8');
  const brand = (nav.match(/brand\.textContent = '([^']+)'/) || [])[1];
  // h1 里两个字是分开上色的，所以要把标签剥掉再比
  const h1 = ((idx.match(/<h1>([\s\S]*?)<\/h1>/) || [])[1] || '')
    .replace(/<[^>]*>/g, '').trim();
  ok('首页标题就是站名（' + h1 + '）', !!h1 && h1 === '六面', h1);
  ok('导航条品牌名和首页标题一致（都是「' + brand + '」）',
    brand === h1 && brand === '六面', '品牌名=' + brand + ' 标题=' + h1);
  ok('首页 <title> 也是站名',
    new RegExp('<title>' + (brand || '') + '</title>').test(idx), brand);
  ok('站名里不再有旧名「工具箱」',
    !/工具箱/.test(idx) && !/工具箱/.test(nav));
}


console.log('\n[19] 公式页的打印按钮');
{
  // 这三页本来就是打印用的；按钮只是省得用户去找浏览器的打印菜单。
  ['f2l.html', 'oll.html', 'pll.html'].forEach(p => {
    const h = fs.readFileSync(path.join(ROOT, p), 'utf8');
    ok(p + ' 头部有打印按钮（内联 SVG 打印机图标，不是字符）',
      /<button class="printbtn" id="printbtn"[\s\S]{0,400}?<svg[\s\S]{0,700}?<\/svg><\/button>/.test(h) &&
      !/[\u2399\u2b1a]/.test(h));
    ok(p + ' 点了调 window.print()',
      /getElementById\('printbtn'\)\.addEventListener\('click', function \(\) \{ window\.print\(\); \}\)/.test(h));
    // 打印出来当然不能再印这个按钮（主题开关也一样）
    ok(p + ' 打印时不印按钮',
      /@media print\{[\s\S]*?\.themebtn,\.printbtn(,\.opts)?\{display:none\}/.test(h));
    // 摆在主题开关左边，别叠上去
    ok(p + ' 和主题开关并排、互不重叠',
      /\.themebtn\{position:absolute;right:16px;top:16px\}/.test(h) &&
      /\.printbtn\{position:absolute;right:80px;top:16px/.test(h));
    // 打印那套配色由 theme.css 统一给白底黑字，页面里不应该再写回颜色
    ok(p + ' 打印样式没把配色写死回页面', !/--[\w-]+\s*:\s*#/.test(h.slice(h.indexOf('@media print'))));
  });
console.log('\n[19b] 打印分页：表格接着排，标题不当孤儿');
{
  // 原来是 section{break-inside:avoid} + overflow:hidden：整张表成了不可拆分的一块，
  // 这一页装不下就整节推到下一页，PLL 那种只有一个标题的页首也会被孤零零留在上一页。
  ['f2l.html', 'oll.html', 'pll.html'].forEach(p => {
    const h = fs.readFileSync(path.join(ROOT, p), 'utf8');
    const pr = h.slice(h.indexOf('@media print'));
    ok(p + ' 的表格能跨页接着排（卡片不再整块不可拆分）',
      /section\{break-inside:auto;overflow:visible/.test(pr) &&
      !/section\{break-inside:avoid/.test(pr));
    ok(p + ' 只禁止「一行被劈开」，标题不落在页尾',
      /tr\{break-inside:avoid\}/.test(pr) &&
      /header\{[^}]*break-after:avoid\}/.test(pr) &&
      /section > h2\{[^}]*break-after:avoid/.test(pr));
    ok(p + ' 打印时不留正文那 60px 底部空白', /main\{padding:0\}/.test(pr));
    ok(p + ' 打印时表格框线加粗、公式文字调大',
      /table\{border:2px solid #333\}/.test(pr) && /th,td\{border:1px solid #333\}/.test(pr) &&
      /code\{font-size:15px;font-weight:600\}/.test(pr));
  });
  const f2l = fs.readFileSync(path.join(ROOT, 'f2l.html'), 'utf8');
  ok('F2L 的红/绿 F 表头换页后重复（<thead> + table-header-group）',
    /<thead>/.test(f2l) && /thead\{display:table-header-group\}/.test(f2l));
  const rest = ['oll.html', 'pll.html'].map(p => fs.readFileSync(path.join(ROOT, p), 'utf8'));
  ok('OLL/PLL 没有表头行，不需要 table-header-group',
    rest.every(h => !/<thead>/.test(h)) && rest.every(h => !/table-header-group/.test(h)));
}

  // 导航条是 nav.js 注入的，公式页自己的打印规则管不到它 ——
  // 不藏的话速查表打出来最上面会多一条彩色横条
  const navCss = fs.readFileSync(path.join(ROOT, 'nav.css'), 'utf8');
  ok('打印时导航条和回到顶部都不印（nav.css 统一管，七页共用）',
    /@media print\{ \.topnav, \.totop\{display:none\} \}/.test(navCss));
}


console.log('\n[19c] 教程页：公式都能送进计算器，进阶页的 OLL 步骤图跟昼夜换');
{
  ['tutorial-basic.html', 'tutorial-advanced.html'].forEach(p => {
    const h = fs.readFileSync(path.join(ROOT, p), 'utf8');
    const n = (h.match(/class="tocalc"/g) || []).length;
    // 每条公式一个 ↗，链接里带 hash；计算器只认 calc.html#...
    ok(p + ' 有 ' + n + ' 条公式带 ↗（都指向 calc.html#）',
      n >= 7 && n === (h.match(/href="calc\.html#/g) || []).length);
    ok(p + ' 点公式能复制（<code> + copied 态 + toast）',
      /document\.addEventListener\('click'/.test(h) && /closest\('code'\)/.test(h) &&
      /classList\.add\('copied'\)/.test(h) && /id="toast"/.test(h));
    ok(p + ' 打印时把按钮 / ↗ / toast 都藏起来', /@media print\{[\s\S]*?display:none/.test(h));
    ok(p + ' 打印时正文左右留白（不贴纸边）',
      /@media print\{[\s\S]*?main\{padding:0 12mm/.test(h));
    const pr = h.slice(h.indexOf('@media print'));
    ok(p + ' 打印美化：卡片改成细分隔线、步骤号画成描边小方块',
      /section\{margin:0;padding:4mm 0 0;border:0;border-top:1px solid #ccc/.test(pr) &&
      /\.n\{display:inline-grid;width:auto;min-width:6mm/.test(pr) &&
      /border:1px solid #666/.test(pr));
    ok(p + ' 打印美化：字号 / 图宽 / 公式框都按纸面调过',
      /body\{background:#fff;color:#000;font-size:10\.5pt/.test(pr) &&
      /\.one img\{width:46mm\}/.test(pr) &&
      /code\{font-size:11pt;font-weight:600/.test(pr));
    ok(p + ' 右边步骤目录落在「回到顶部」按钮上方',
      /\.steps\{right:18px;bottom:calc\(18px \+ 40px \+ 14px\)/.test(h));
    ok(p + ' 右边目录会标识当前看到哪一步（滚动高亮）',
      /querySelectorAll\('\.steps a\[href\^="#"\]'\)/.test(h) &&
      /classList\.toggle\('on', i === best\)/.test(h));
  });
  // 教程页的配图是编辑器导出的 256x258（透明底，和 f2l 那批同规格），
  // 逐张核对存在 + 尺寸，别出现「引了一张不在的图」
  const imgs = [];
  ['tutorial-basic.html', 'tutorial-advanced.html'].forEach(p => {
    const h = fs.readFileSync(path.join(ROOT, p), 'utf8');
    (h.match(/src="tutorial\/[\w.-]+\.png"/g) || []).forEach(m => {
      const f = m.slice(5, -1);
      if (imgs.indexOf(f) < 0) imgs.push(f);
    });
  });
  const bad = imgs.filter(f => {
    const b = fs.readFileSync(path.join(ROOT, f));
    return b.readUInt32BE(16) !== 256 || b.readUInt32BE(20) !== 258;
  });
  ok('教程配图 ' + imgs.length + ' 张都在、都是 256x258', imgs.length >= 5 && bad.length === 0,
    bad.slice(0, 3).join(' '));
}

console.log('\n[20] OLL 图的昼夜两版 + 图片尺寸/体积');
{
  // 白天紫顶、夜晚黄顶：两张图除了顶面颜色完全一样，页面按主题挑
  const oll = fs.readFileSync(path.join(ROOT, 'oll.html'), 'utf8');
  ok('OLL 页按主题挑图（白天 day / 夜晚 night）',
    /var tone = document\.documentElement\.dataset\.theme === 'dark' \? 'night' : 'day';/.test(oll) &&
    /return 'oll\/oll-' \+ f \+ '-' \+ tone \+ '-256x256\.png';/.test(oll));
  ok('切主题时把已经画出来的图也换掉（否则要刷新才对）',
    /function syncOllImages\(\)/.test(oll) &&
    /root\.dataset\.theme = t;\s*\n\s*syncOllImages\(\);/.test(oll) &&
    /data-oll="' \+ esc\(n\)/.test(oll));
  // 练习页 / 计算器选公式栏里的 OLL 缩略图也一样
  ['practice.html', 'calc.html'].forEach(p => {
    const h = fs.readFileSync(path.join(ROOT, p), 'utf8');
    ok(p + ' 的 OLL 缩略图也分昼夜两版',
      /kind === 'oll' \? \(?document\.documentElement\.dataset\.theme === 'dark' \? '-night' : '-day'\)?/.test(h));
  });

  // 图片本身：尺寸、存在、体积
  const pngSize = f => {
    const b = fs.readFileSync(f);
    return { w: b.readUInt32BE(16), h: b.readUInt32BE(20), bytes: b.length };
  };
  const dirs = { f2l: [256, 258], oll: [256, 256], pll: [256, 256] };
  let total = 0, big = [], wrong = [], missing = [];
  Object.keys(dirs).forEach(k => {
    const [w, h] = dirs[k];
    fs.readdirSync(path.join(ROOT, k)).filter(f => f.endsWith('.png')).forEach(f => {
      const p = path.join(ROOT, k, f);
      const d = pngSize(p);
      total += d.bytes;
      if (d.w !== w || d.h !== h) wrong.push(f + '=' + d.w + 'x' + d.h);
      if (d.bytes > 40 * 1024) big.push(f + '=' + Math.round(d.bytes / 1024) + 'KB');
    });
  });
  ok('三种图的尺寸分别是 256x258 / 256x256 / 256x256', wrong.length === 0, wrong.slice(0, 3).join(' '));
  ok('单张都不超过 40KB（现在是 3~13KB）', big.length === 0, big.slice(0, 3).join(' '));
  ok('全部图片合计 < 1.5MB（512 那版是 5.2MB）',
    total < 1.5 * 1024 * 1024, (total / 1048576).toFixed(2) + 'MB');
  // OLL 两版成对存在
  const ollImgs = fs.readdirSync(path.join(ROOT, 'oll')).filter(f => f.endsWith('.png'));
  const days = ollImgs.filter(f => f.includes('-day-')).length;
  const nights = ollImgs.filter(f => f.includes('-night-')).length;
  ok('OLL 昼夜两版各 57 张（共 ' + ollImgs.length + ' 张）',
    days === 57 && nights === 57, days + ' / ' + nights);
  // 引用的文件都得在
  const refs = new Set();
  ['f2l.html', 'oll.html', 'pll.html', 'practice.html', 'calc.html', 'index.html'].forEach(p => {
    const h = fs.readFileSync(path.join(ROOT, p), 'utf8');
    (h.match(/(?:f2l|oll|pll)\/[\w.-]+\.png/g) || []).forEach(m => refs.add(m));
  });
  const miss = [...refs].filter(r => !fs.existsSync(path.join(ROOT, r)));
  ok('页面里引用的图片都存在（' + refs.size + ' 个引用）', miss.length === 0, miss.slice(0, 3).join(' '));
}


console.log('\n[21] PLL 页的「显示颜色」开关 + 无色图');
{
  const pll = fs.readFileSync(path.join(ROOT, 'pll.html'), 'utf8');
  // 样式是「滑动开关」：一条轨道 + 一个滑块（和主题开关同一套语言）。
  // 真勾选框藏起来（视觉由 .on 决定），但 Tab 还能走到、:focus-within 给焦点圈。
  ok('PLL 页标题下有个「显示颜色」开关（滑动开关：轨道 + 滑块）',
    /<label class="tg" id="tg-colors"[\s\S]{0,160}?<input type="checkbox" id="showcolors" checked> 显示颜色/.test(pll) &&
    /\.tg::before\{content:'';position:absolute;left:0;top:50%;width:36px;height:20px/.test(pll) &&
    /\.tg\.on::after\{transform:translateX\(16px\)/.test(pll) &&
    /\.tg input\{position:absolute;width:1px;height:1px;margin:0;opacity:0/.test(pll) &&
    /\.tg:focus-within::before\{outline:2px solid var\(--accent-text\)/.test(pll));
  ok('关掉时用另一套图（文件名带 -nc-）',
    /var nc = showColors \? '' : \(document\.documentElement\.dataset\.theme === 'dark' \? '-nc-night' : '-nc'\);/.test(pll) &&
    /return 'pll\/pll-' \+ f \+ nc \+ '-256x256\.png';/.test(pll));
  // 显示颜色时只有一张图（箭头压在黄色顶面上，白天夜里都看得清）——
  // 曾经多生成过一套彩色夜晚版，是多余的，磁盘上不该再有
  ok('彩色版不分昼夜：磁盘上没有「彩色夜晚」图',
    !/var nc = showColors \? \(/.test(pll) &&
    fs.readdirSync(path.join(ROOT, 'pll'))
      .filter(f => /-night-256x256\.png$/.test(f) && !/-nc-night-/.test(f)).length === 0);
  ok('开关摆在右上角，主题按钮下面（和计算器的相机同一竖列）',
    /\.opts\{position:absolute;right:16px;top:56px;display:flex;justify-content:flex-end\}/.test(pll) &&
    /\.themebtn\{position:absolute;right:16px;top:16px\}/.test(pll) &&
    /<div class="opts">[\s\S]{0,220}?id="showcolors"/.test(pll));
  // 持久化：先读存档决定首次渲染，切开关再写回去
  ok('开关状态存在 pll-color-v1，先读存档再渲染',
    /var COLOR_KEY = 'pll-color-v1';/.test(pll) &&
    /showColors = localStorage\.getItem\(COLOR_KEY\) !== '0';/.test(pll) &&
    pll.indexOf('localStorage.getItem(COLOR_KEY)') < pll.indexOf('document.getElementById(\'app\')')) ;
  ok('切开关会写回存档',
    /localStorage\.setItem\(COLOR_KEY, showColors \? '1' : '0'\)/.test(pll));
  ok('切开关不重画整张表，只换图片地址',
    /function syncPllImages\(\)[\s\S]{0,200}?querySelectorAll\('#app img\[data-pll\]'\)/.test(pll) &&
    /data-pll="' \+ esc\(n\)/.test(pll));
  // 无色图分昼夜，所以切主题也得把已画出来的图换掉
  ok('切主题时无色图跟着换成夜晚黄箭头那版',
    /function applyTheme\(t\)[\s\S]{0,140}?syncPllImages\(\);/.test(pll) &&
    /root\.dataset\.theme = t;\s*\n\s*syncPllImages\(\);/.test(pll));
  ok('打印时不印这个开关', /@media print\{[\s\S]*?\.themebtn,\.printbtn,\.opts\{display:none\}/.test(pll));

  // 图片：每个 PLL 编号三张 —— 彩色 / 无色白天（紫箭头）/ 无色夜晚（黄箭头）
  const src = pll.match(/var SECTIONS = (\[[\s\S]*?\n\]);/);
  const ids = [...(src ? src[1] : '').matchAll(/"([A-Za-z]{1,2})",\s*"/g)].map(m => m[1]);
  const uniq = [...new Set(ids)];
  const miss = [], wrong = [];
  uniq.forEach(id => {
    ['', '-nc', '-nc-night'].forEach(v => {
      const f = 'pll/pll-' + id + v + '-256x256.png';
      if (!fs.existsSync(path.join(ROOT, f))) miss.push(f);
      else {
        const b = fs.readFileSync(path.join(ROOT, f));
        if (b.readUInt32BE(16) !== 256 || b.readUInt32BE(20) !== 256) {
          wrong.push(f + '=' + b.readUInt32BE(16) + 'x' + b.readUInt32BE(20));
        }
      }
    });
  });
  ok('每个 PLL 编号都有三版：彩色 + 无色白天 + 无色夜晚（' + uniq.length + ' × 3 张）',
    uniq.length >= 21 && miss.length === 0, miss.slice(0, 3).join(' '));
  ok('三版尺寸都是 256x256', wrong.length === 0, wrong.slice(0, 3).join(' '));
  // 磁盘上不能有多余的图（旧版 512 的、彩色夜晚的），数量正好 21 × 3
  const allPng = fs.readdirSync(path.join(ROOT, 'pll')).filter(f => f.endsWith('.png'));
  ok('pll/ 下正好 ' + (uniq.length * 3) + ' 张图，没有多余旧图',
    allPng.length === uniq.length * 3 &&
    allPng.every(f => /^pll-[A-Za-z]{1,2}(-nc(-night)?)?-256x256\.png$/.test(f)),
    allPng.length + ' 张');
  // 无色版应当明显更"轻"：颜色去掉后不透明像素少得多
  const ncDir = allPng.filter(f => f.includes('-nc'));
  ok('磁盘上有 ' + (uniq.length * 2) + ' 张无色图（白天+夜晚），单张都很小（约 5KB）',
    ncDir.length === uniq.length * 2 &&
    ncDir.every(f => fs.statSync(path.join(ROOT, 'pll', f)).size < 12 * 1024),
    ncDir.length + ' 张');
  // 夜晚那 21 张必须是黄箭头版 —— 和白天那版像素不同，否则等于没换
  const same = uniq.filter(id => {
    const a = fs.readFileSync(path.join(ROOT, 'pll/pll-' + id + '-nc-256x256.png'));
    const b = fs.readFileSync(path.join(ROOT, 'pll/pll-' + id + '-nc-night-256x256.png'));
    return a.equals(b);
  });
  ok('无色夜晚版和白天版确实不一样（换了箭头颜色）', same.length === 0, same.slice(0, 3).join(' '));

  /* 光看文件名和体积看不出"图根本没换色"——Aa 的夜晚图就曾经是白天那张，
     页面照常打开、测试全绿。所以这里自己把 PNG 解开，核箭头到底是什么颜色。
     这批图都是 8 位调色板 PNG（216 张全是），解码只要几十行。 */
  const zlib = require('zlib');
  const decodePng = file => {
    const b = fs.readFileSync(path.join(ROOT, file));
    let p = 8, w = 0, h = 0, bd = 0, ct = 0, plte = null, trns = null;
    const idat = [];
    while (p + 8 <= b.length) {
      const len = b.readUInt32BE(p), type = b.toString('ascii', p + 4, p + 8);
      const data = b.slice(p + 8, p + 8 + len);
      if (type === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); bd = data[8]; ct = data[9]; }
      else if (type === 'PLTE') plte = data;
      else if (type === 'tRNS') trns = data;
      else if (type === 'IDAT') idat.push(data);
      p += 12 + len;
    }
    if (bd !== 8 || ct !== 3) throw new Error(file + ': 不是 8 位调色板 PNG (' + bd + '/' + ct + ')');
    const raw = zlib.inflateSync(Buffer.concat(idat));
    const idx = Buffer.alloc(w * h);
    for (let y = 0; y < h; y++) {
      const ft = raw[y * (w + 1)];
      const line = raw.slice(y * (w + 1) + 1, y * (w + 1) + 1 + w);
      for (let x = 0; x < w; x++) {
        const a = x ? idx[y * w + x - 1] : 0;
        const bb = y ? idx[(y - 1) * w + x] : 0;
        const c = (x && y) ? idx[(y - 1) * w + x - 1] : 0;
        let v = line[x];
        if (ft === 1) v += a;
        else if (ft === 2) v += bb;
        else if (ft === 3) v += (a + bb) >> 1;
        else if (ft === 4) {
          const q = a + bb - c, pa = Math.abs(q - a), pb = Math.abs(q - bb), pc = Math.abs(q - c);
          v += (pa <= pb && pa <= pc) ? a : (pb <= pc ? bb : c);
        } else if (ft !== 0) throw new Error(file + ': 未知行过滤器 ' + ft);
        idx[y * w + x] = v & 255;
      }
    }
    // 按 RGBA 数颜色；alpha 取 tRNS（没写就是全不透明）
    const counts = new Map();
    for (let i = 0; i < idx.length; i++) {
      const k = idx[i], o = k * 3;
      const alpha = trns && k < trns.length ? trns[k] : 255;
      const key = plte[o] + ',' + plte[o + 1] + ',' + plte[o + 2] + ',' + alpha;
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    return { w, h, counts };
  };
  const hueSat = (r, g, b) => {
    const mx = Math.max(r, g, b) / 255, mn = Math.min(r, g, b) / 255, d = mx - mn;
    let h = 0;
    if (d) {
      if (mx === r / 255) h = ((g - b) / 255 / d) % 6;
      else if (mx === g / 255) h = (b - r) / 255 / d + 2;
      else h = (r - g) / 255 / d + 4;
      if (h < 0) h += 6;
      h *= 60;
    }
    return [h, mx ? d / mx : 0];
  };
  // 无色图的箭头紫（hue 235~290, S>0.2）/ 夜晚换成的 #FFE600 / 彩色版顶面的黄
  const tally = file => {
    const { counts } = decodePng(file);
    let purple = 0, night = 0, top = 0;
    counts.forEach((n, k) => {
      const v = k.split(',').map(Number);
      if (v[3] <= 128) return;
      const hs = hueSat(v[0], v[1], v[2]);
      if (hs[0] >= 235 && hs[0] <= 290 && hs[1] > 0.2) purple += n;
      if (v[0] === 255 && v[1] === 230 && v[2] === 0) night += n;
      if (v[0] >= 250 && v[1] >= 225 && v[1] <= 235 && v[2] <= 10) top += n;
    });
    return { purple, night, top };
  };
  const purpleBad = [], nightBad = [], pairBad = [], topBad = [];
  uniq.forEach(id => {
    const day = tally('pll/pll-' + id + '-nc-256x256.png');
    const nit = tally('pll/pll-' + id + '-nc-night-256x256.png');
    const col = tally('pll/pll-' + id + '-256x256.png');
    if (day.purple < 500 || day.night) purpleBad.push(id + ':' + day.purple + '紫/' + day.night + '黄');
    if (nit.night < 500 || nit.purple) nightBad.push(id + ':' + nit.night + '黄/' + nit.purple + '紫');
    if (day.purple !== nit.night) pairBad.push(id + ':' + day.purple + '≠' + nit.night);
    if (col.top < 5000) topBad.push(id + ':' + col.top);
  });
  ok('无色白天版：箭头确实还是紫的、一点黄都没有（' + uniq.length + ' 张）',
    purpleBad.length === 0, purpleBad.slice(0, 3).join(' '));
  ok('无色夜晚版：箭头确实是 #FFE600、一个紫像素都没有',
    nightBad.length === 0, nightBad.slice(0, 3).join(' '));
  ok('夜晚版就是把白天版那些紫像素原样染黄（逐张计数一一对应）',
    pairBad.length === 0, pairBad.slice(0, 3).join(' '));
  ok('彩色版顶面还是黄的（没被无色那套规则误伤）',
    topBad.length === 0, topBad.slice(0, 3).join(' '));
}

console.log('\n[22] 计算器舞台：四周的按钮互不重叠');
{
  /* 舞台四角一共摆着 9 个浮动按钮：主题开关、拍照，四个方向的整体旋转折角
     （n/s/w/e），两个滚转（z1/z2），右下角还有一摞放大缩小。
     它们全是 position:absolute，谁跟谁叠上只能靠算 —— 拍照键最早摆在左上角,
     正好压在「整体逆时针滚 z'」那个 56px 的大按键上。这里按 CSS 声明的
     位置把矩形算出来，两两核一遍。 */
  const calc = fs.readFileSync(path.join(ROOT, 'calc.html'), 'utf8');
  // 抠出 <style>，再把 @media 整块和注释删掉（打印那块的 .snap{display:none}
  // 会盖住真正的定位规则，注释里也可能有花括号）
  const strip = t => {
    let out = '', i = 0;
    while (i < t.length) {
      if (t.startsWith('@media', i)) {
        let j = t.indexOf('{', i), depth = 0;
        if (j < 0) break;
        for (; j < t.length; j++) {
          if (t[j] === '{') depth++;
          else if (t[j] === '}' && --depth === 0) { j++; break; }
        }
        i = j;
      } else if (t[i] === '/' && t[i + 1] === '*') {
        const j = t.indexOf('*/', i + 2);
        i = j < 0 ? t.length : j + 2;
      } else out += t[i++];
    }
    return out;
  };
  const css = strip(calc.slice(calc.indexOf('<style>'), calc.indexOf('</style>')));
  // 同一个选择器可能出现在好几条规则里（.snap 的定位和宽高就分在两处），
  // 按 CSS 的规矩合并：后面的同名属性盖前面。取值时也要取最后一条。
  const rules = {};
  for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    m[1].split(',').forEach(sel => {
      const k = sel.trim();
      rules[k] = rules[k] === undefined ? m[2] : rules[k] + ';' + m[2];
    });
  }
  const decl = (sel, prop) => {
    if (rules[sel] === undefined) throw new Error('calc.html 里找不到规则 ' + sel);
    const all = [...rules[sel].matchAll(new RegExp('(?:^|;)\\s*' + prop + '\\s*:\\s*([^;]+)', 'g'))];
    return all.length ? all[all.length - 1][1].trim() : null;
  };
  const val = (sel, prop, base) => {
    const v = decl(sel, prop);
    if (v === null) return null;
    return /%$/.test(v) ? parseFloat(v) / 100 * base : parseFloat(v);
  };
  const size = sel => {
    const w = parseFloat(decl(sel, 'width')), h = parseFloat(decl(sel, 'height'));
    if (!(w > 0) || !(h > 0)) throw new Error(sel + ' 的宽高没读出来');
    return [w, h];
  };
  const rect = (sel, w, h, W, H) => {
    const tf = decl(sel, 'transform') || '';
    const l = val(sel, 'left', W), r = val(sel, 'right', W);
    const t = val(sel, 'top', H), b = val(sel, 'bottom', H);
    let x = l !== null ? l : W - r - w;
    let y = t !== null ? t : H - b - h;
    if (/translateX\(-50%\)/.test(tf)) x -= w / 2;
    if (/translateY\(-50%\)/.test(tf)) y -= h / 2;
    return { sel, x, y, w, h };
  };
  // 主题开关的宽高在 nav.css（body .themebtn），页面里只有位置
  const [obW, obH] = size('.orbit button');
  const zoomBtns = ((calc.match(/<div class="zoom">([\s\S]*?)<\/div>/) || [])[1] || '')
    .match(/<button/g) || [];
  const [zbW, zbH] = size('.zoom button');
  const items = [
    ['.themebtn', 56, 28],                       // nav.css: body .themebtn
    ['.snap', ...size('.snap')],
    ['.orbit .n', obW, obH], ['.orbit .s', obW, obH],
    ['.orbit .w', obW, obH], ['.orbit .e', obW, obH],
    ['.orbit .z1', obW, obH], ['.orbit .z2', obW, obH],
    // 右下角那摞是 grid：n 个按钮 + (n-1) 个 gap
    ['.zoom', zbW, zoomBtns.length * zbH + Math.max(0, zoomBtns.length - 1) *
      parseFloat(decl('.zoom', 'gap'))],
  ];
  ok('舞台上的浮动按钮都认得出来（主题开关/拍照/6 个整体旋转/缩放那摞）',
    items.length === 9 && zoomBtns.length === 3, items.length + ' 个, 缩放 ' + zoomBtns.length + ' 个');
  const overlap = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w &&
                           a.y < b.y + b.h && b.y < a.y + a.h;
  // 舞台宽高：页面右侧固定 322px 面板，所以常见桌面是「窗口宽-322」；
  // 窄屏（<760px）会变成上下排，舞台占满宽度。
  // 注：舞台高低于 ~350px 时，左右两个折角（.w/.e，竖着居中）和右下角那摞
  // 缩放本身就会挤上（老问题，和拍照键无关），所以这里只核 ≥360px 的尺寸；
  // 拍照键单独再核一遍小尺寸（它在右上角，不会碰到中间那两个）。
  const sizes = [[1200, 800], [900, 640], [760, 560], [640, 420], [560, 360]];
  const bad = [], snapBad = [];
  const all = sizes.concat([[438, 360], [380, 320], [520, 260], [360, 240]]);
  all.forEach(([W, H]) => {
    const rs = items.map(([sel, w, h]) => rect(sel, w, h, W, H));
    for (let i = 0; i < rs.length; i++) {
      for (let j = i + 1; j < rs.length; j++) {
        if (!overlap(rs[i], rs[j])) continue;
        const pair = [rs[i].sel, rs[j].sel].sort().join('×');
        if (sizes.some(([w2, h2]) => w2 === W && h2 === H)) bad.push(W + '×' + H + ' ' + pair);
        if (pair.indexOf('.snap') >= 0) snapBad.push(W + '×' + H + ' ' + pair);
      }
    }
  });
  ok('常见舞台尺寸（' + sizes.length + ' 种）下四周按钮两两不叠',
    bad.length === 0, bad.slice(0, 3).join(' | '));
  // 这次报的就是这个：拍照键压在「整体逆时针滚 z'」上
  ok('拍照键在任何尺寸下都不和别的按钮叠（连更小的舞台也算）',
    snapBad.length === 0, snapBad.slice(0, 3).join(' | '));
  // 这条是这次的 bug 本身：拍照键摆在左上角 = 压在 z1（整体逆时针滚）上
  ok('拍照键在右上角和主题开关并排（不再压着「整体逆时针滚 z\'」）',
    /\.snap\{position:absolute;right:80px;top:14px/.test(calc) &&
    !/\.snap\{[^}]*left:14px/.test(calc));
  ok('拍照键打印时不印', /@media print\{ \.themebtn,\.panel,\.orbit,\.zoom,\.snap\{display:none\} \}/.test(calc));
}

console.log('\n结果: ' + pass + ' 通过, ' + fail + ' 失败');
process.exit(fail ? 1 : 0);
