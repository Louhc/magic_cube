/* 计时器的纯逻辑：打乱生成、时间格式化、平均成绩。
 *
 * 单独一个文件是给 test/timer.js 直接 require 用的；页面里也是普通 <script>
 * （和 cube.js / cubesim.js 一样，不是 ES module —— file:// 下模块会被 CORS 拦）。
 */
var Timer = (function () {
  'use strict';

  var FACES = ['U', 'D', 'L', 'R', 'F', 'B'];
  var AXIS = { U: 'y', D: 'y', L: 'x', R: 'x', F: 'z', B: 'z' };
  var SUFFIX = ['', "'", '2'];

  /* 随机打乱：默认 20 步。
     两条硬规矩：不让同一个面连着转两次；也不让同一根轴连着来 —— 前者会让
     「R R'」这种废步出现，后者整段读起来会退化成一次转。 */
  function scramble(n, rnd) {
    rnd = rnd || Math.random;
    n = n || 20;
    var out = [], lastFace = '', lastAxis = '';
    var guard = 0;
    while (out.length < n && guard++ < n * 100) {
      var f = FACES[Math.floor(rnd() * FACES.length)];
      if (f === lastFace || AXIS[f] === lastAxis) continue;
      out.push(f + SUFFIX[Math.floor(rnd() * SUFFIX.length)]);
      lastFace = f;
      lastAxis = AXIS[f];
    }
    return out.join(' ');
  }

  /* 毫秒 -> 秒表写法：12.34 / 1:02.34 */
  function fmt(ms) {
    if (ms === null || ms === undefined || isNaN(ms)) return '—';
    var t = Math.max(0, Math.round(ms));
    var m = Math.floor(t / 60000);
    var s = Math.floor((t % 60000) / 1000);
    var cs = Math.floor((t % 1000) / 10);
    var ss = (m && s < 10 ? '0' : '') + s;
    return (m ? m + ':' : '') + ss + '.' + (cs < 10 ? '0' : '') + cs;
  }

  /* 平均：最近 n 次，去掉最快最慢，中间取平均（ao5 / ao12 都是这么算的）。
     不够 n 次就返回 null，让界面显示「—」。 */
  function avg(solves, n) {
    if (!solves || solves.length < n) return null;
    var w = solves.slice(-n).map(function (s) { return s.ms; })
      .sort(function (a, b) { return a - b; });
    var mid = w.slice(1, w.length - 1);
    var sum = mid.reduce(function (a, b) { return a + b; }, 0);
    return sum / mid.length;
  }

  function stats(solves) {
    var list = solves || [];
    var ms = list.map(function (s) { return s.ms; });
    return {
      count: ms.length,
      best: ms.length ? Math.min.apply(null, ms) : null,
      ao5: avg(list, 5),
      ao12: avg(list, 12)
    };
  }

  /* 成绩导出成 CSV（Excel / Numbers / 记事本都能开）。
     时间给两列：看得懂的写法 + 毫秒（自己再算统计时用得上）。 */
  function q(v) {
    v = String(v === null || v === undefined ? '' : v);
    return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
  }
  function csv(solves) {
    var out = ['序号,时间,毫秒,打乱,时间戳'];
    (solves || []).forEach(function (s, i) {
      out.push([i + 1, fmt(s.ms), Math.round(s.ms), q(s.scramble),
                s.at ? new Date(s.at).toISOString() : ''].join(','));
    });
    return out.join('\n') + '\n';
  }

  return { scramble: scramble, fmt: fmt, avg: avg, stats: stats, csv: csv,
           FACES: FACES, AXIS: AXIS };
})();

if (typeof module !== 'undefined' && module.exports) { module.exports = Timer; }
