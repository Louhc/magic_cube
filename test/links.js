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
    /class="ghribbon"[\s\S]{0,200}?target="_blank"/.test(html) &&
    /class="ghribbon"[\s\S]{0,200}?rel="noopener"/.test(html),
    m && m[1]);
  ok('斜贴在右上角（旋转 45° + 裁剪框 overflow:hidden）',
    /\.ghribbon\{[^}]*top:0[^}]*right:0[^}]*overflow:hidden/.test(html) &&
    /\.ghribbon a\{[^}]*transform:rotate\(45deg\)/.test(html));
  ok('导航条让出右内边距（否则会被纸带压住）',
    /\.topnav\{padding-right:\d+px\}/.test(html));
}

console.log('\n[5] 导航样式表存在且定义了当前页高亮');{
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

console.log('\n结果: ' + pass + ' 通过, ' + fail + ' 失败');
process.exit(fail ? 1 : 0);
