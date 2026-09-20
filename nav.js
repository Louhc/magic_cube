/* 顶部导航条：把标记注入到 <body> 最前面。样式见 nav.css。
   以后加页面只改下面这一张表。

   为什么用脚本注入而不是各页抄一份：五个页面要抄五份、改一处得改五处，
   漏一个就会出现「某个页面导航不全」。这里只有一份。

   注意要用普通 <script src>（不是 ES 模块）—— file:// 下双击打开时，
   ES 模块会被 CORS 拦掉。 */
(function () {
  'use strict';

  // [文件名, 导航文字, 需要「回到顶部」]
  // 第三项给长表格页用 —— 那几页要翻很久才到底。
  var PAGES = [
    ['index.html',  '首页'],
    ['editor.html', '编辑器'],
    ['calc.html',   '计算器'],
    ['practice.html', '练习'],
    ['f2l.html',    'F2L 公式', 1],
    ['oll.html',    'OLL 公式', 1],
    ['pll.html',    'PLL 公式', 1]
  ];

  // 当前页文件名；直接访问目录（结尾是 /）时按首页算
  var here = location.pathname.split('/').pop().toLowerCase();
  if (!here) here = 'index.html';

  var brand = document.createElement('span');
  brand.className = 'brand';
  brand.textContent = '魔方工具箱';

  var links = document.createElement('span');
  links.className = 'links';
  var activeLink = null;
  PAGES.forEach(function (p) {
    var a = document.createElement('a');
    a.href = p[0];
    a.textContent = p[1];
    if (p[0] === here) {
      a.className = 'on';
      a.setAttribute('aria-current', 'page');
      activeLink = a;
    }
    links.appendChild(a);
  });

  // 当前页的蓝框做成一整块 .pill，垫在链接下面 —— 换页时让它滑过去
  var pill = document.createElement('span');
  pill.className = 'pill';
  links.insertBefore(pill, links.firstChild);

  var nav = document.createElement('nav');
  nav.className = 'topnav';
  nav.appendChild(brand);
  nav.appendChild(links);

  document.body.insertBefore(nav, document.body.firstChild);

  /* ---------- 当前页的蓝框 ----------
     链接自己不再画背景，背景统一由 .links 里这个绝对定位的圆角方块提供。
     点别的导航项时先让它滑过去（transform/width/height 有过渡），滑完再跳页；
     新页加载时它已经在正确位置，看上去就是蓝框从一项滑到了另一项。 */
  function placePill(el, animate) {
    if (!el) { pill.style.display = 'none'; return; }
    pill.style.display = '';
    if (!animate) pill.style.transition = 'none';
    pill.style.width = el.offsetWidth + 'px';
    pill.style.height = el.offsetHeight + 'px';
    pill.style.transform = 'translate(' + el.offsetLeft + 'px,' + el.offsetTop + 'px)';
    if (!animate) {
      void pill.offsetWidth;          // 逼一次重排，免得初始定位也被当成动画
      pill.style.transition = '';
    }
  }
  function noMotion() {
    try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; }
    catch (e) { return false; }
  }

  placePill(activeLink, false);
  // 窗口变化 / 字体加载完，链接尺寸会变，重新对一次位（不带动画）
  window.addEventListener('resize', function () { placePill(activeLink, false); });
  window.addEventListener('load', function () { placePill(activeLink, false); });

  var PILL_MS = 180;              // 和 nav.css 里 .pill / 链接变色的过渡时长对齐

  document.addEventListener('click', function (e) {
    // 新标签打开、中键、拖拽之类交给浏览器自己处理
    if (e.defaultPrevented || e.button !== 0 ||
        e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    var a = e.target && e.target.closest ? e.target.closest('.topnav .links a[href]') : null;
    if (!a || a === activeLink) return;               // 不是导航项 / 就是当前项
    if (noMotion()) return;                           // 减少动态效果：直接跳

    e.preventDefault();
    // 旧项立刻褪回灰字 —— 蓝框一走，白字留在浅底上就看不见了，
    // 之前看着像「框滑走了、字才没了」就是这个原因。
    if (activeLink) activeLink.classList.remove('on');
    placePill(a, true);                               // 蓝框滑过去
    // 等蓝框到位再给它白字，然后跳页 —— 新页上它本来就是当前项
    setTimeout(function () {
      activeLink = a;
      a.classList.add('on');
      location.href = a.href;
    }, PILL_MS);
  });

  // 长表格页：右下角一个纯图标的「回到顶部」，滚过一屏才出现
  var me = PAGES.filter(function (p) { return p[0] === here; })[0];
  if (me && me[2]) {
    var top = document.createElement('button');
    top.type = 'button';
    top.className = 'totop';
    top.textContent = '\u2191';                 // ↑
    top.title = '回到顶部';
    top.setAttribute('aria-label', '回到顶部');
    top.addEventListener('click', function () {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
    document.body.appendChild(top);
    var sync = function () {
      top.classList.toggle('on',
        (window.pageYOffset || document.documentElement.scrollTop || 0) > 320);
    };
    window.addEventListener('scroll', sync, { passive: true });
    sync();
  }
})();
