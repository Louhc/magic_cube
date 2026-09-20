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
  const listed = [...nav.matchAll(/\['([^']+\.html)'/g)].map(m => m[1]);
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
    /\.ghribbon\{[^}]*top:var\(--nav-h, 42px\)[^}]*right:0[^}]*overflow:hidden/.test(html) &&
    !/\.topnav\{padding-right/.test(html));
  ok('45° 斜贴', /\.ghribbon a\{[^}]*transform:rotate\(45deg\)/.test(html));
  ok('内容是 octocat 图标 + 英文',
    /class="ghribbon"[\s\S]{0,400}?<svg viewBox="0 0 16 16"/.test(html) &&
    /class="ghribbon"[\s\S]{0,1200}?>Fork me on GitHub<\/a>/.test(html) &&
    !/[\u4e00-\u9fa5]/.test((html.match(/class="ghribbon"[\s\S]{0,1200}?<\/a>/) || [''])[0]));
  ok('GitHub 经典黑白配色',
    /\.ghribbon a\{[^}]*background:#24292f[^}]*color:#fff/.test(html) &&
    /html\[data-theme="dark"\] \.ghribbon a\{background:#f0f6fc;color:#24292f\}/.test(html));
}

console.log('\n[5] 导航样式表存在且定义了当前页高亮');
{
  const css = fs.readFileSync(path.join(ROOT, 'nav.css'), 'utf8');
  ok('nav.css 有 .topnav 与选中态', /\.topnav\{/.test(css) && /\.topnav a\.on\{/.test(css));
  ok('nav.css 给编辑器的全高布局让了高度',
    /body > \.app\{height:calc\(100% - var\(--nav-h\)\)\}/.test(css), '缺少 .app 高度补偿');
}

console.log('\n[6] 回到顶部按钮');
{
  const js = fs.readFileSync(path.join(ROOT, 'nav.js'), 'utf8');
  const css = fs.readFileSync(path.join(ROOT, 'nav.css'), 'utf8');
  ok('nav.css 定义了 .totop', /\.totop\{/.test(css));
  ok('按钮是纯图标（无可见文字）', /textContent = '\\u2191'/.test(js),
    '按钮文字不是 ↑');
  ok('滚动事件驱动显隐', /\.totop\.on/.test(css) && /classList\.toggle\('on'/.test(js));
  const withBtn = [...js.matchAll(/\['([^']+)',\s*'[^']*',\s*1\]/g)].map(m => m[1]);
  ok('只有三个公式页需要它（' + withBtn.join(',') + '）',
    withBtn.join(',') === 'f2l.html,oll.html,pll.html', withBtn.join(','));
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
    imgs.includes('f2l-01a-512x515.png') && imgs.includes('f2l-21b-512x515.png'),
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
      addEventListener(t, fn) { (this._h = this._h || {})[t] = fn; },
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
      addEventListener(t, fn) { (this._h = this._h || {})[t] = fn; }
    };
    const pending = [];
    const ctx = {
      console, clearTimeout() {},
      // defer=true 时把回调攒起来，好检查「蓝框到位前 / 到位后」两个阶段
      setTimeout(fn) { pending.push(fn); if (!opts.defer) fn(); return 0; },
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
      ctx, body, links, store, pill: links.children[0], pending,
      linkAt: i => links.children[i + 1],       // [0] 是 .pill
      active: links.children.find(c => c.className === 'on'),
      domReady: () => { if (doc._h && doc._h.DOMContentLoaded) doc._h.DOMContentLoaded(); },
      click: doc._h.click
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

  // 结构：.links 里有个 .pill，排在最前面（垫在链接下面）
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
    const c = fire(r.linkAt(6));                 // PLL，当前页是 OLL
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
    const from = r.active, to = r.linkAt(6);
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
        'translate(' + r.linkAt(1).offsetLeft + 'px,' + r.linkAt(1).offsetTop + 'px)',
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
        'translate(' + r.linkAt(2).offsetLeft + 'px,' + r.linkAt(2).offsetTop + 'px)',
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
    const c = fire(r.linkAt(6));
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
    ok('当前项底色改由 .pill 提供（链接自身不再画背景）',
      /\.topnav a\.on\{color:#fff\}/.test(css) && !/\.topnav a\.on\{background/.test(css));
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
  // editor.html 的 :root 基础配色是深色（别的页都是浅色，靠 [data-theme="dark"] 覆盖），
  // 而它的预设脚本原来只写 dark 分支 —— 白天时 data-theme 不设，页面就落到深色底：
  // 于是「切到编辑器会莫名其妙变成黑夜」。
  // 这里对每个页面真跑一遍 <head> 里的预设脚本，算出实际生效的 --bg，再核对三档存档。
  const vm = require('vm');

  const headThemeScript = h => {
    const head = h.slice(0, h.indexOf('</head>'));
    return [...head.matchAll(/<script>([\s\S]*?)<\/script>/g)]
      .map(m => m[1]).filter(b => b.includes('cube-theme')).join('\n');
  };
  const bgOf = (h, key) => {
    const re = key === ':root'
      ? /:root\{[^}]*?--bg:\s*(#[0-9a-fA-F]{6})/
      : new RegExp('html\\[data-theme="' + key + '"\\]\\{[^}]*?--bg:\\s*(#[0-9a-fA-F]{6})');
    const m = h.match(re);
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
    const bg = (t ? bgOf(h, t) : null) || bgOf(h, ':root');
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

console.log('\n结果: ' + pass + ' 通过, ' + fail + ' 失败');
process.exit(fail ? 1 : 0);
