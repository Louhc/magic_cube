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

const PAGES = ['index.html', 'editor.html', 'f2l.html', 'oll.html', 'pll.html'];

console.log('[1] 五个页面都在');
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

console.log('\n结果: ' + pass + ' 通过, ' + fail + ' 失败');
process.exit(fail ? 1 : 0);
