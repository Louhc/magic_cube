/* 顶部导航条：把标记注入到 <body> 最前面。样式见 nav.css。
   以后加页面只改下面这一张表。

   为什么用脚本注入而不是各页抄一份：每个页面抄一份、改一处得改多处，
   漏一个就会出现「某个页面导航不全」。这里只有一份。

   注意要用普通 <script src>（不是 ES 模块）—— file:// 下双击打开时，
   ES 模块会被 CORS 拦掉。 */
(function () {
  'use strict';

  // [文件名, 导航文字, 需要「回到顶部」, 这一组还有哪几页]
  // 第三项给长表格页用 —— 那几页要翻很久才到底。
  // 第四项写 [[文件, 二级目录里的名字], …]（**含第一页**，第一页排最前）：
  // 鼠标停在导航项上会展开成一条二级目录；写成一串文件名也行（那就显示文件名）。
  var PAGES = [
    ['index.html',  '首页'],
    ['editor.html', '编辑器'],
    ['calc.html',   '计算器'],
    // 教程初级 / 进阶共用一个入口，悬停展开「二级目录」
    ['tutorial-basic.html', '教程', 1,
     [['tutorial-basic.html', '初级 · 层先法'], ['tutorial-advanced.html', '进阶 · CFOP']]],
    ['practice.html', '练习'],
    ['timer.html', '计时器'],
    // 三阶那三套公式（F2L / OLL / PLL）也是分页 + 一个入口，悬停展开二级目录
    ['f2l.html',    '三阶公式', 1,
     [['f2l.html', 'F2L · 39 种'], ['oll.html', 'OLL · 57 种'], ['pll.html', 'PLL · 21 种']]],
    // 二阶那两套公式分两页，导航条上合成一个入口（页内左边还有一条目录互相切）
    ['oll2.html',   '二阶公式', 0,
     [['oll2.html', 'OLL · 7 种'], ['pbl2.html', 'PBL · 5 种']]]
  ];

  /* 一个导航项管哪几页：统一成 [[文件, 名字], …]（含第一页）。
     没写第四项的入口就是「一页一组」—— 也就不展开二级目录。 */
  function groupOf(p) {
    if (!p[3]) return [[p[0], p[1]]];
    var out = [].concat(p[3]).map(function (g) {
      var a = [].concat(g);
      return a.length > 1 ? [a[0], a[1]] : [a[0], a[0]];
    });
    if (!out.some(function (g) { return g[0] === p[0]; })) out.unshift([p[0], p[1]]);
    return out;
  }

  // 当前页文件名；直接访问目录（结尾是 /）时按首页算
  var here = location.pathname.split('/').pop().toLowerCase();
  if (!here) here = 'index.html';

  // 文档还在解析就先等 DOMContentLoaded，否则直接跑。
  // nav.js 挂在 <body> 开头，页面自己的东西（header 里的站标、首页那些卡片）
  // 这时候还没解析到 —— 要碰它们的活儿都得走这里。
  function ready(fn) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn);
    else fn();
  }

  /* 一个入口管好几页时（教程：初级 / 进阶），跳到上次看的那一篇。
     导航条上那个入口和首页那张教程卡片共用这一条规则，别各写一份。 */
  function lastOf(page) {
    var entry = null;
    for (var i = 0; i < PAGES.length; i++) if (PAGES[i][0] === page) entry = PAGES[i];
    if (!entry) return page;
    var files = groupOf(entry).map(function (g) { return g[0]; });
    if (files.length < 2) return page;
    try {
      var last = localStorage.getItem('cube-last:' + entry[0]);
      if (files.indexOf(last) >= 0) return last;
    } catch (e) {}
    return page;
  }


  /* ---------- 站标 ----------
     导航条里只放图形（「六面」两字的字标），不放文字。矢量源是 logo.svg，
     下面两条 d 和那边必须一模一样 —— test/links.js 会把两边抠出来逐字比，
     改了图没同步会红。分成两条 path 是为了分开上色（六用主色、面用正文色，
     首页那个大标题也是同一份图）；颜色走 CSS 变量（见 nav.css / index.html），
     所以昼夜两套主题自动跟着变，不用第二份图。旁边没有文字，所以挂 aria-label。 */
  var SITE = '六面魔方工具箱';
  var LOGO_A = 'M243 0 327 0 338 6 338 8 341 10 344 16 344 87 346 93 351 97 557 97 564 99 576 107 583 120 584 153 582 161 578 168 572 174 570 174 567 177 556 180 30 180 18 177 8 170 1 156 1 122 5 112 12 104 28 97 217 97 223 93 225 88 225 17 229 9 234 4 243 0ZM144 219 234 219 242 223 246 228 248 234 247 245 125 489 116 497 102 502 17 501 11 498 2 488 0 481 2 467 4 466 14 444 16 443 33 408 35 407 50 376 52 375 61 355 63 354 72 334 74 333 82 315 84 314 92 296 94 295 101 279 103 278 127 230 136 222 144 219ZM346 219 436 219 445 223 452 230 466 260 468 261 484 295 486 296 507 340 509 341 561 446 563 447 574 469 574 486 567 496 554 502 472 502 458 496 450 488 439 466 439 463 427 441 427 438 417 420 417 417 403 391 403 388 386 356 386 353 333 248 331 242 332 231 339 222 346 219Z';
  var LOGO_B = 'M647 9 1186 9 1198 14 1203 19 1208 28 1209 61 1204 73 1198 79 1190 83 962 84 955 88 952 97 944 112 944 117 948 120 1154 120 1167 124 1181 136 1182 140 1185 143 1188 155 1188 469 1185 480 1180 486 1180 488 1171 496 1156 502 663 502 648 496 639 487 634 475 634 154 637 144 641 137 650 128 661 122 669 120 816 120 822 117 829 103 829 100 833 94 834 88 830 84 643 83 634 78 627 69 625 63 625 30 628 22 634 15 647 9ZM751 193 743 196 738 204 738 424 744 434 751 437 1058 437 1064 435 1068 431 1070 427 1070 202 1066 196 1060 193 876 193 872 195 868 201 868 226 870 231 874 234 993 234 1006 238 1014 245 1018 254 1018 390 1014 398 1009 403 998 408 814 408 806 405 804 402 801 401 801 399 798 397 795 391 794 386 794 199 792 198 792 196 786 193 751 193ZM876 289 873 290 869 295 870 356 874 359 880 360 924 360 940 358 943 354 943 294 937 289 876 289Z';
  var logoHTML = '<svg viewBox="0 0 1209 502" aria-hidden="true" focusable="false">' +
    '<path class="g-a" d="' + LOGO_A + '"/>' +
    '<path class="g-b" d="' + LOGO_B + '"/></svg>';

  var brand = document.createElement('a');
  brand.className = 'brand';
  brand.href = 'index.html';
  brand.setAttribute('aria-label', SITE);
  brand.innerHTML = logoHTML;

  var links = document.createElement('span');
  links.className = 'links';
  var activeLink = null;
  /* 二级目录（悬停 / 键盘聚焦时展开）：一项管好几页的入口才有。
     它排在主链接**后面**（做个兄弟节点，而不是套一层盒子）——
     套盒子会动到 .pill 量位置的坐标；主链接直接挂在 .links 下最省事。
     展开时用 JS 把它对齐到这一项下面（.links 是 position:relative，绝对定位以它为基准），
     鼠标从主链接挪到目录上有 140ms 的缓冲，不然中间那一线空隙会把目录收掉。 */
  var openSub = null;
  function closeSub(sub) { if (sub) sub.classList.remove('on'); }
  function hideSoon(sub) {
    if (!sub) return;
    clearTimeout(sub._t);
    sub._t = setTimeout(function () { closeSub(sub); }, 140);
  }
  function showSub(link, sub) {
    if (!sub) return;
    clearTimeout(sub._t);
    if (openSub && openSub !== sub) closeSub(openSub);
    openSub = sub;
    sub.classList.add('on');
    // 先量宽度再对齐到这一项下面；太靠右就往左收一点，别顶出屏幕
    sub.style.left = '0px';
    var lx = link.offsetLeft, box = links.clientWidth || 0, w = sub.offsetWidth || 0;
    if (box && lx + w > box) lx = Math.max(0, box - w);
    sub.style.left = lx + 'px';
    sub.style.minWidth = link.offsetWidth + 'px';
    link.setAttribute('aria-expanded', 'true');
  }
  function bindSub(link, sub) {
    link._sub = sub;
    link.setAttribute('aria-haspopup', 'true');
    link.setAttribute('aria-expanded', 'false');
    function open() { showSub(link, sub); }
    function shut() { link.setAttribute('aria-expanded', 'false'); hideSoon(sub); }
    link.addEventListener('mouseenter', open);
    link.addEventListener('mouseleave', function () { hideSoon(sub); });
    link.addEventListener('focus', open);
    link.addEventListener('blur', shut);
    sub.addEventListener('mouseenter', open);
    sub.addEventListener('mouseleave', shut);
  }

  PAGES.forEach(function (p) {
    var a = document.createElement('a');
    a.textContent = p[1];
    // 一个入口管好几页时（教程的初级 / 进阶、二阶公式的 OLL / PBL），
    // 跳到上次看的那一篇
    var group = groupOf(p);
    a.href = lastOf(p[0]);
    // 「这个入口管哪几页」记在链接上：点卡片 / 点 ↗ 跳过去时，
    // 蓝框要能找到对应的那一项（见下面点链接那段）
    a._pages = group.map(function (g) { return g[0]; });
    if (a._pages.indexOf(here) >= 0) {
      a.className = 'on';
      a.setAttribute('aria-current', 'page');
      activeLink = a;
    }
    links.appendChild(a);
    // 二级目录：和主链接一起挂在 .links 下
    if (group.length > 1) {
      var sub = document.createElement('span');
      sub.className = 'sub';
      sub.setAttribute('role', 'group');
      sub.setAttribute('aria-label', p[1] + '的目录');
      group.forEach(function (g) {
        var s2 = document.createElement('a');
        s2.textContent = g[1];
        s2.href = g[0];
        // 和主链接同一组：点二级目录里的链接时，蓝框也要滑到这个入口上
        s2._pages = a._pages;
        if (g[0] === here) s2.className = 'on';
        sub.appendChild(s2);
      });
      links.appendChild(sub);
      bindSub(a, sub);
    }
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

  /* 页面里想要同一个站标的地方（首页那个大标题）只写 <span data-logo></span>，
     由这里统一填进去 —— 一个字标不在几个文件里各存一份，改图只改上面那两条 d。

     首页那张教程卡片整张可点：卡片里埋一个铺满的 <a class="stretch" data-last="…">，
     这里按「上次看的那一篇」把 href 定下来（和导航条上那个入口同一条规则）——
     点下去的效果（蓝框滑过去 + 内容淡出）由下面拦截站内链接那段统一负责。

     两件事都得等 DOM 解析完：这个脚本在 <body> 开头，跑的时候它们还没解析到
     （首页的站标曾经就是这么丢的：页面上只剩下面那行「— 魔方工具箱 —」）。 */
  function fillLogos() {
    Array.prototype.forEach.call(document.querySelectorAll('[data-logo]'), function (el) {
      el.innerHTML = logoHTML;
    });
  }
  function resolveLastLinks() {
    Array.prototype.forEach.call(document.querySelectorAll('[data-last]'), function (el) {
      el.setAttribute('href', lastOf(el.getAttribute('data-last')));
    });
  }
  ready(function () {
    fillLogos();
    resolveLastLinks();
  });

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

  var PILL_MS = 180;              // 和 nav.css 里 .pill 的过渡时长对齐
  var FADE_MS = 180;              // 和 nav.css 里内容淡出/淡入的时长对齐
  var FADE_KEY = 'cube-nav-fade';

  // —— 进场：上一页点了站内链接才淡入；直接打开 / 刷新 / 后退都不淡
  (function () {
    var raw = null;
    try {
      raw = sessionStorage.getItem(FADE_KEY);
      sessionStorage.removeItem(FADE_KEY);
    } catch (e) { return; }
    if (!raw || noMotion()) return;
    var fresh = false;
    try {
      var d = JSON.parse(raw);
      fresh = !!d && typeof d.t === 'number' && Date.now() - d.t < 3000;
    } catch (e) { return; }
    if (!fresh) return;
    // nav.js 就在 <body> 开头，这里的类在内容解析、首次绘制之前就落下了，
    // 所以不会先亮一下再淡下去（那才是"闪一下"）。
    document.body.classList.add('nav-fade');
    var show = function () {
      void document.body.offsetHeight;    // 先把「隐着」结算掉，淡入的过渡才会跑
      document.body.classList.remove('nav-fade');
    };
    ready(show);
  })();

  // —— 出场：点站内页面链接，先把动画演完再跳页
  document.addEventListener('click', function (e) {
    // 新标签打开、中键、拖拽之类交给浏览器自己处理
    if (e.defaultPrevented || e.button !== 0 ||
        e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    var a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
    if (!a) return;
    var href = a.getAttribute('href') || '';
    // 只认站内页面；允许带 # —— 公式表的 ↗ 就是 calc.html#...
    var m = /^([\w-]+\.html)(#[\s\S]*)?$/.exec(href);
    if (!m) return;
    var page = m[1].toLowerCase();
    if (page === here) return;                        // 就是当前页（含页内锚点）
    if (noMotion()) return;                           // 减少动态效果：直接跳

    // 目标页在导航表里的话，蓝框就滑到对应那一项 ——
    // 这样点公式表的 ↗ 跳到计算器时，蓝框也会滑到「计算器」。
    var hit = null;
    for (var i = 0; i < links.children.length; i++) {
      var li = links.children[i];
      if (!li.tagName || String(li.tagName).toUpperCase() !== 'A') continue;
      // 链接自己记着「这个入口管哪几页」：点「教程 · 进阶」时蓝框也要滑到
      // 「教程」那一项（那一项的 href 是上次看的那一篇，直接比 href 比不到）
      var owns = li._pages || [(li.getAttribute('href') || '').toLowerCase()];
      if (owns.indexOf(page) >= 0) { hit = li; break; }
    }

    e.preventDefault();
    // ① 蓝框滑过去。旧项立刻褪回灰字 —— 蓝框一走，白字留在浅底上就看不见了；
    //    新项等蓝框到位再变白。
    if (hit && hit !== activeLink) {
      if (activeLink) activeLink.classList.remove('on');
      placePill(hit, true);
      setTimeout(function () { activeLink = hit; hit.classList.add('on'); }, PILL_MS);
    }
    // ② 导航条下面的内容淡出，淡完再跳（导航条自己不淡）
    try { sessionStorage.setItem(FADE_KEY, JSON.stringify({ t: Date.now() })); } catch (err) {}
    document.body.classList.add('nav-fade');
    setTimeout(function () { location.href = href; }, FADE_MS);
  });

  // 长表格页：右下角一个纯图标的「回到顶部」，滚过一屏才出现
  // 「长页」标志看的是入口那一行；一个入口管好几页时（教程初级/进阶），
  // 每一页都得有按钮，所以 extras 也要算进来
  var me = PAGES.filter(function (p) {
    return groupOf(p).some(function (g) { return g[0] === here; });
  })[0];
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

  /* ---------- 白天 / 夜晚开关的标记 ----------
     各页共用一份：各页只管切 <html data-theme>，按钮长什么样交给这里
     和 nav.css（滑块位置也是纯 CSS 按 data-theme 定的）。
     要填的 #themebtn 在各页 <body> 里，nav.js 这会儿还没解析到，所以等 DOM 好了再填。 */
  var THEME_SVG = {
    sun: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"' +
         ' stroke-linecap="round"><circle cx="12" cy="12" r="4.4"/>' +
         '<path d="M12 2.2v2.6M12 19.2v2.6M2.2 12h2.6M19.2 12h2.6' +
         'M5.1 5.1l1.9 1.9M17 17l1.9 1.9M18.9 5.1L17 7M7 17l-1.9 1.9"/></svg>',
    moon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"' +
          ' stroke-linecap="round" stroke-linejoin="round">' +
          '<path d="M20.2 14.7A8.6 8.6 0 1 1 9.3 3.8a6.9 6.9 0 0 0 10.9 10.9z"/></svg>'
  };
  /* 换主题时，页面里那些「悬停变色」的小过渡会和变量本身的过渡打架：
     变量在 240ms 里逐帧变，元素的 border-color/color 过渡就被每帧重启一次，
     看着像抖了一下（主页那六张卡片的边框最明显）。
     所以切换期间给 <html> 挂个 theme-anim，让元素自己的过渡让路（规则在 theme.css），
     变量那条过渡照走 —— 页面照样是淡过去的。
     用 MutationObserver 盯 data-theme：回调是微任务，在下一帧渲染之前跑，
     所以这一类一定赶在「新颜色第一次参与样式计算」之前挂上。 */
  (function watchThemeSwitch() {
    var el = document.documentElement, timer = 0;
    if (typeof MutationObserver !== 'function' || !el || !el.classList) return;
    new MutationObserver(function () {
      el.classList.add('theme-anim');
      clearTimeout(timer);
      timer = setTimeout(function () { el.classList.remove('theme-anim'); }, 260);
    }).observe(el, { attributes: true, attributeFilter: ['data-theme'] });
  })();

  function buildThemeSwitch() {
    var b = document.getElementById('themebtn');
    if (!b || (b.querySelector && b.querySelector('.tk'))) return;   // 没有 / 已填过
    b.innerHTML = '<span class="tk"></span>' +
                  '<span class="ti sun">' + THEME_SVG.sun + '</span>' +
                  '<span class="ti moon">' + THEME_SVG.moon + '</span>';
    b.setAttribute('role', 'switch');
    b.setAttribute('aria-label', '白天 / 夜晚');
    var sync = function () {
      b.setAttribute('aria-checked',
        document.documentElement.dataset.theme === 'dark' ? 'true' : 'false');
    };
    sync();
    // 各页自己的点击处理注册得更早、会先跑，所以这里读到的是刚切完的状态
    b.addEventListener('click', sync);
  }
  ready(buildThemeSwitch);
})();

/* ---------- 公式图片点开看大图 ----------
   页面上那些公式图小的只有 30px（计算器的公式表），大的也就 100~200px，
   想看清楚就得点开。做法：给图片加一个 data-zoom 属性（各页生成的标记里写），
   这里用一个**事件委托**接住整页的点击 —— 图是页面渲染过程中才生成的，
   一个个挂监听既啰嗦又容易漏。

   为什么不做成「点哪儿都能放大」：首页那几张卡片里的图在 <a> 里，点一下是跳页；
   编辑器里也有自己的图片交互。抢别人的点击不如让各页自己标 —— 标了才放大。

   遮罩样式在 nav.css（.ltbox）；颜色走 theme.css 的 --overlay / --overlay-fg。
   关掉：点遮罩任意处（图上也行）/ Esc / 右上角的 ×；关掉后焦点回到原来那张图，
   键盘用户不会「丢在原地」。 */
(function () {
  'use strict';

  var box = null, pic = null, closeBtn = null, opener = null;

  function build() {
    box = document.createElement('div');
    box.className = 'ltbox';
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-modal', 'true');
    box.setAttribute('aria-label', '查看图片（点任意处或按 Esc 关闭）');
    pic = document.createElement('img');
    pic.alt = '';
    closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'ltclose';
    closeBtn.setAttribute('aria-label', '关闭');
    closeBtn.textContent = '\u00d7';                 // ×
    box.appendChild(pic);
    box.appendChild(closeBtn);
    document.body.appendChild(box);
    // 遮罩上点哪儿都关（图、×、空白都算）
    box.addEventListener('click', close);
  }

  function open(src) {
    if (!box) build();
    // 主题相关的图（OLL 有昼夜两版）要显示当前这张：currentSrc 是浏览器真选中的那个，
    // 懒加载还没轮到它的时候是空的，退回 src
    pic.src = src.currentSrc || src.src;
    pic.alt = src.alt || '';
    opener = src;
    box.classList.add('on');
    document.documentElement.classList.add('lb-open');
    if (closeBtn.focus) closeBtn.focus();
  }

  function close() {
    if (!box || !box.classList || !box.classList.contains('on')) return;
    box.classList.remove('on');
    document.documentElement.classList.remove('lb-open');
    // 焦点还给原来那张图：它是 <img>，得让它能被程序聚焦
    if (opener && opener.focus) {
      if (!opener.hasAttribute('tabindex')) opener.setAttribute('tabindex', '-1');
      opener.focus();
    }
    opener = null;
  }

  /* 挂在**捕获**阶段：计算器的公式表是「整行都能点 = 把这条公式填进输入框」，
     只在 document 的冒泡阶段接是来不及的 —— 那一行的处理已经先跑完了，
     结果「只想看一眼图」会顺手把输入框改掉。捕获阶段拦下 + 不再往上传，
     点图就只是看图。 */
  document.addEventListener('click', function (e) {
    var t = e.target;
    if (!t || t.tagName !== 'IMG' || !t.hasAttribute || !t.hasAttribute('data-zoom')) return;
    e.preventDefault();
    if (e.stopPropagation) e.stopPropagation();
    open(t);
  }, true);

  /* Esc 也走捕获：看图时按 Esc 只关图，不要再把页面自己的东西（比如计算器
     那个展开着的公式表）一起收掉 */
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape' && e.key !== 'Esc') return;
    if (!box || !box.classList.contains('on')) return;
    if (e.stopPropagation) e.stopPropagation();
    close();
  }, true);
})();
