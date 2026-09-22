/* 点公式图看大图（nav.js 最后那一段 + nav.css 的 .ltbox + theme.css 的 --overlay）。
   脚本是**实时从 nav.js 抽取**的（不存副本，避免测试和源码不同步），
   配一个极简 DOM 桩跑一遍：点图 -> 弹遮罩、取哪张图、怎么关、焦点还去哪儿。
   用法: node test/lightbox.js                                        */
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.join(__dirname, '..');
const navJs = fs.readFileSync(path.join(ROOT, 'nav.js'), 'utf8');
const navCss = fs.readFileSync(path.join(ROOT, 'nav.css'), 'utf8');
const themeCss = fs.readFileSync(path.join(ROOT, 'theme.css'), 'utf8');

let pass = 0, fail = 0;
const ok = (name, cond, extra) => {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? '  -> ' + extra : '')); }
};
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');

console.log('[1] 从 nav.js 里抽出「点图看大图」那一段');
let block = '';
{
  const start = navJs.indexOf('/* ---------- 公式图片点开看大图');
  const end = navJs.lastIndexOf('})();') + 5;
  ok('nav.js 里有这一段，而且是文件最后一段（抽取才成立）',
    start > 0 && end > start && navJs.slice(end).trim() === '',
    'start=' + start + ' end=' + end);
  block = navJs.slice(start, end);
}

console.log('\n[2] 真跑一遍（DOM 桩）');
{
  const mkEl = tag => {
    const e = {
      tagName: tag.toUpperCase(), children: [], _attrs: {}, _ev: {}, _text: '', src: '',
      classList: {
        _s: new Set(), add(c) { this._s.add(c); }, remove(c) { this._s.delete(c); },
        contains(c) { return this._s.has(c); }
      },
      setAttribute(k, v) { this._attrs[k] = String(v); },
      getAttribute(k) {
        return Object.prototype.hasOwnProperty.call(this._attrs, k) ? this._attrs[k] : null;
      },
      hasAttribute(k) { return Object.prototype.hasOwnProperty.call(this._attrs, k); },
      appendChild(c) { this.children.push(c); return c; },
      addEventListener(t, f) { (this._ev[t] = this._ev[t] || []).push(f); },
      fire(t, a) { (this._ev[t] || []).forEach(f => f(a || {})); },
      focus() { this._focused = true; }
    };
    Object.defineProperty(e, 'textContent',
      { get() { return e._text; }, set(v) { e._text = String(v); } });
    return e;
  };
  const doc = {
    _ev: {}, _cap: {}, documentElement: mkEl('html'), body: mkEl('body'),
    createElement: mkEl,
    addEventListener(t, f, cap) {
      (doc._ev[t] = doc._ev[t] || []).push(f);
      doc._cap[t] = !!cap;
    },
    fire(t, a) { (doc._ev[t] || []).forEach(f => f(a || {})); }
  };
  const ctx = { console, document: doc };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(block, ctx);

  const zoomImg = () => {
    const i = mkEl('img');
    i.setAttribute('data-zoom', '');
    i.src = 'oll/oll-01-day-256x256.png';
    i.alt = 'OLL 01';
    return i;
  };
  const click = (el) => {
    const e = { target: el, preventDefault() { e.defaulted = true; },
                stopPropagation() { e.stopped = true; } };
    doc.fire('click', e);
    return e;
  };

  // ① 点带 data-zoom 的图：弹遮罩，显示的就是这张
  const a = zoomImg();
  const ea = click(a);
  const box = doc.body.children[0];
  ok('点带 data-zoom 的图就弹出遮罩',
    !!box && box.className === 'ltbox' && box.classList.contains('on'));
  ok('遮罩里那张图的 src / alt 就是点的那张',
    !!box && box.children[0].src === a.src && box.children[0].alt === 'OLL 01',
    box && box.children[0].src);
  ok('遮罩上有个看得见的关闭键（× 在右上角）',
    !!box && box.children[1].className === 'ltclose' && box.children[1].textContent === '\u00d7');
  ok('开着的时候锁住页面滚动（公式表很长，不锁就是「遮罩不动、内容在跑」）',
    doc.documentElement.classList.contains('lb-open'));
  ok('焦点移到关闭键上（键盘用户不用摸黑找）',
    box.children[1]._focused === true);
  // 捕获阶段 + 不再上传：计算器公式表是「整行都能点 = 填进输入框」，
  // 点图时必须在那一行之前截住，否则「只想看一眼」会顺手改掉输入框
  ok('点图走捕获阶段，并且截住事件不让外层（整行点击）也跑',
    doc._cap.click === true && ea.stopped === true && ea.defaulted === true);

  // ② Esc 关掉，焦点回原图
  const esc = { key: 'Escape', target: {}, stopPropagation() { esc.stopped = true; } };
  doc.fire('keydown', esc);
  ok('Esc 关掉遮罩，并解锁滚动',
    !box.classList.contains('on') && !doc.documentElement.classList.contains('lb-open'));
  ok('Esc 也不往上传（看图时按 Esc 不该顺手收掉页面上别的东西）', esc.stopped === true);
  ok('关掉后焦点回到原来那张图，并补上 tabindex=-1（<img> 默认不能聚焦）',
    a._focused === true && a.getAttribute('tabindex') === '-1',
    String(a.getAttribute('tabindex')));

  // ③ 没标 data-zoom 的图：什么都不做（OLL / PLL 表格里那张大图点一下是展开其他写法）
  const plain = mkEl('img');
  plain.src = 'pll/pll-Aa-256x256.png';
  const ep = click(plain);
  ok('没标 data-zoom 的图点了完全不插手（不 preventDefault、不弹遮罩）',
    !ep.defaulted && !ep.stopped && !box.classList.contains('on'));

  // ④ 已开着的时候按 Esc 之前的那条：主题相关的图取浏览器当前显示的那张
  const b = zoomImg();
  b.currentSrc = 'oll/oll-01-night-256x256.png';       // 夜晚主题下换成了 night 版
  click(b);
  ok('取 currentSrc（OLL 有昼夜两版，要显示当前这张）',
    box.children[0].src === b.currentSrc, box.children[0].src);

  // ⑤ 点遮罩任意处（图、×、空白都算）就关
  box.fire('click', {});
  ok('点遮罩任意处都能关', !box.classList.contains('on'));

  // ⑥ 只建一个遮罩（点多少次都不会越堆越多）
  const n = doc.body.children.length;
  click(zoomImg());
  box.fire('click', {});
  ok('遮罩只建一次（反复点不会堆一堆出来）', doc.body.children.length === n, String(doc.body.children.length));

  // ⑦ 没开着的时候按 Esc：不该报错，也不该动别的
  let threw = null;
  try { doc.fire('keydown', { key: 'Escape', stopPropagation() {} }); } catch (e) { threw = e; }
  ok('没开着时按 Esc 不报错', !threw, threw && threw.message);
}

console.log('\n[3] 样式：遮罩的样子和颜色都在共用文件里');
{
  ok('nav.css 有遮罩（全屏、铺满、最上层）',
    /\.ltbox\{\s*position:fixed;\s*inset:0;\s*z-index:\d+;/.test(navCss));
  ok('nav.css：图下面垫一层卡面色（PNG 是透明底的，压深色遮罩上描边会糊）',
    /\.ltbox img\{[\s\S]*?background:var\(--card, #fff\)/.test(navCss));
  ok('nav.css：指上去是放大镜 + 浮一圈边（公式图上本来没别的提示）',
    /img\[data-zoom\]\{cursor:zoom-in;/.test(navCss) &&
    /img\[data-zoom\]:hover\{box-shadow:0 0 0 2px var\(--line-strong/.test(navCss));
  ok('nav.css：遮罩上是缩小光标（点一下就是关）',
    /\.ltbox\{[\s\S]*?cursor:zoom-out/.test(navCss));
  ok('nav.css：开着的时候锁滚动', /html\.lb-open\{overflow:hidden\}/.test(navCss));
  ok('nav.css：打印不印遮罩', /@media print\{ \.ltbox\{display:none\} \}/.test(navCss));
  ok('nav.css：系统开了「减少动态效果」就不做缩放动画',
    /@media \(prefers-reduced-motion: reduce\)\{ \.ltbox, \.ltbox img\{transition:none\} \}/.test(navCss));

  // 颜色归 theme.css：两套主题都要有、都得是「半透明的」、还得进过渡列表
  const lightRoot = themeCss.match(/(?:^|\n):root\{([\s\S]*?)\n\}/)[1];
  const darkRoot = themeCss.match(/(?:^|\n)html\[data-theme="dark"\]\{([\s\S]*?)\n\}/)[1];
  ok('theme.css：白天有一套遮罩颜色（带透明度）',
    /--overlay:#[0-9a-fA-F]{8}/.test(lightRoot) && /--overlay-fg:#[0-9a-fA-F]{6}/.test(lightRoot),
    lightRoot.match(/--overlay[^;]*;/g));
  ok('theme.css：夜晚也有一套',
    /--overlay:#[0-9a-fA-F]{8}/.test(darkRoot) && /--overlay-fg:#[0-9a-fA-F]{6}/.test(darkRoot));
  ok('遮罩颜色注册成 @property 并进了过渡列表（换主题时跟着淡过去）',
    /@property --overlay \{[^}]*initial-value: #2a2f5ec7; \}/.test(themeCss) &&
    /--overlay 240ms ease/.test(themeCss) && /--overlay-fg 240ms ease/.test(themeCss));
}

console.log('\n[4] 哪些图能点开：能点的都标了，点击有别的用途的没标');
{
  ok('计算器：公式表里那张 30px 的缩略图标了（整行点击 = 填公式，点图改成看图）',
    /'<img src="' \+ thumb\(pickKind, r\[0\]\) \+ '" alt="" loading="lazy" data-zoom>'/.test(read('calc.html')));
  ok('练习页：题目那张图标了',
    /id="qimg" alt="要解决的图形" data-zoom/.test(read('practice.html')));
  ok('F2L 公式表：那一列图标了',
    /'<td class="pic"><span class="box"><img src="' \+ IMG\(name\) \+ '" data-zoom alt="/.test(read('f2l.html')));
  ['oll.html', 'pll.html'].forEach(p => {
    const h = read(p);
    // 原来表格里那张图点一下是「展开这一条的其他写法」——那套连数据带代码都没有了
    // （数据里早就只有 [编号, 公式] 两个元素），所以这张图现在也能点开看大图
    ok(p + '：表格里那张公式图标了 data-zoom（看大图）',
      /class="pic"><span class="box"><img src="' \+ IMG\(n\) \+ '" data-zoom data-(oll|pll)=/.test(h));
    ok(p + '：「展开其他写法」那套死代码清干净了（数据里早就没有备选公式）',
      !/has-alts|class="alts"|tr\.open/.test(h) && !/row\(n, alg, alts\)/.test(h) &&
      /forEach\(function \(r\) \{ html \+= row\(r\[0\], r\[1\]\); \}\)/.test(h));
  });
  ok('放大镜那套是共用文件里的（各页只管标 data-zoom，不用各写一遍脚本）',
    ['calc.html', 'practice.html', 'f2l.html', 'oll.html', 'pll.html']
      .every(p => /src="nav\.js"/.test(read(p))));
}

console.log('\n结果: ' + pass + ' 通过, ' + fail + ' 失败');
process.exit(fail ? 1 : 0);
