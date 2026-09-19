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
  PAGES.forEach(function (p) {
    var a = document.createElement('a');
    a.href = p[0];
    a.textContent = p[1];
    if (p[0] === here) {
      a.className = 'on';
      a.setAttribute('aria-current', 'page');
    }
    links.appendChild(a);
  });

  var nav = document.createElement('nav');
  nav.className = 'topnav';
  nav.appendChild(brand);
  nav.appendChild(links);

  document.body.insertBefore(nav, document.body.firstChild);

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
