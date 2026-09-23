/* ============================================================
 * cube.js —— 魔方渲染核心（唯一实现）
 *
 * 浏览器和 Node 共用这一份代码：
 *   - 浏览器：<script src="cube.js"> 之后用全局 Cube
 *   - Node  ：require('./cube.js') 做几何校验
 *
 * 注意这里刻意用经典脚本而不是 ES module：ES module 在 file:// 下
 * 会被 CORS 拦掉，双击 index.html 就白屏了。经典脚本没这个问题。
 * ============================================================ */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Cube = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var CUBE = 3;                                  // 魔方占 x,y,z ∈ [0,3]
  var CENTER = [CUBE / 2, CUBE / 2, CUBE / 2];

  // ---------------- 颜色 ----------------
  // 全部 7 种颜色。gray 表示"未定义/空"，它是取消上色后的落点，
  // 但**不作为可选画笔**出现在调色板里，所以下面单独筛出 PALETTE。
  var COLORS = [
    { key: 'red',    hex: '#C00000', py: 'COLOR_RED',    zh: '红' },
    { key: 'orange', hex: '#FF8C00', py: 'COLOR_ORANGE', zh: '橙' },
    { key: 'yellow', hex: '#FFE600', py: 'COLOR_YELLOW', zh: '黄' },
    { key: 'white',  hex: '#FFFFFF', py: 'COLOR_WHITE',  zh: '白' },
    { key: 'green',  hex: '#00B050', py: 'COLOR_GREEN',  zh: '绿' },
    { key: 'blue',   hex: '#0070C0', py: 'COLOR_BLUE',   zh: '蓝' },
    { key: 'gray',   hex: '#C0C0C0', py: 'COLOR_GRAY',   zh: '灰' }
  ];
  // 调色板里可选的画笔颜色（不含 gray）
  var PALETTE = COLORS.filter(function (c) { return c.key !== 'gray'; });
  var EMPTY = 'gray';                  // "空"状态用的颜色 key

  var HEX = {}, PYNAME = {}, ZH = {};
  COLORS.forEach(function (c) { HEX[c.key] = c.hex; PYNAME[c.key] = c.py; ZH[c.key] = c.zh; });

  // ---------------- 三个可见面 ----------------
  // 相机在 (-1,-1,+elev) 方向，所以可见面是 顶面 z=3、左面 x=0、右面 y=0。
  // origin 是该面"左上角"小方块的顶点，u = 向右一格，v = 向下一格。
  // 约定：colors[row][col] 直接就是第 row 行、第 col 列。
  var FACES = {
    top:   { origin: [0, 3, 3], u: [1, 0, 0],  v: [0, -1, 0], shade: 1.00 },
    left:  { origin: [0, 3, 3], u: [0, -1, 0], v: [0, 0, -1], shade: 0.90 },
    right: { origin: [0, 0, 3], u: [1, 0, 0],  v: [0, 0, -1], shade: 0.68 }
  };
  var FACE_ORDER = ['left', 'right', 'top'];     // 绘制顺序
  var FACE_ZH = { top: '顶面 U', left: '左面 L', right: '右面 R' };

  // 默认配色（与参考图一致）：
  //   顶面只有中心黄；左面外侧 2×2 红；右面外侧 2×2 绿；其余留灰
  //   约定：row 从上到下，col 从左到右
  var DEFAULT_STATE = {
    top:   [['gray', 'gray', 'gray'], ['gray', 'yellow', 'gray'],  ['gray', 'gray',  'gray']],
    left:  [['gray', 'gray', 'gray'], ['red',  'red',    'gray'],  ['red',  'red',   'gray']],
    right: [['gray', 'gray', 'gray'], ['gray', 'green',  'green'], ['gray', 'green', 'green']]
  };

  var DEFAULT_CFG = {
    elev: 0.6,       // 相机方向的 z 分量：越小俯角越低、顶面越扁
    dist: 14.0,      // 相机距离：越小透视越强
    gap: 0.10,       // 黑色边框宽度 ÷ 小方块边长
    radius: 0.10,    // 贴纸圆角 ÷ 小方块边长
    shading: false,  // 明暗
    pad: 0.06        // 画面留白比例
  };

  // ---------------- 向量工具 ----------------
  function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
  function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  function cross(a, b) {
    return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  }
  function normalize(a) {
    var n = Math.sqrt(dot(a, a)) || 1;
    return [a[0] / n, a[1] / n, a[2] / n];
  }
  function dist2(a, b) { return Math.hypot(a[0] - b[0], a[1] - b[1]); }

  /* 针孔相机。project([x,y,z]) -> [屏x, 屏y]，屏 y 向上。
     屏幕坐标 = 焦距 * 相机坐标 / 深度 —— 有 /depth 才有近大远小。 */
  function makeProjector(elev, dist) {
    var dir = normalize([-1, -1, elev]);
    var eye = [
      CENTER[0] + dir[0] * dist,
      CENTER[1] + dir[1] * dist,
      CENTER[2] + dir[2] * dist
    ];
    var forward = normalize(sub(CENTER, eye));
    var right = normalize(cross(forward, [0, 0, 1]));
    var up = cross(right, forward);
    var focal = dist;
    return function (p) {
      var v = sub(p, eye);
      var depth = dot(v, forward);          // 相机前方距离，恒 > 0
      return [focal * dot(v, right) / depth, focal * dot(v, up) / depth];
    };
  }

  // 两条直线的交点：A + t*dA 与 B + s*dB
  function lineIntersect(A, dA, B, dB) {
    var det = dA[1] * dB[0] - dA[0] * dB[1];
    if (Math.abs(det) < 1e-12) return [A[0], A[1]];
    var rx = B[0] - A[0], ry = B[1] - A[1];
    var t = (ry * dB[0] - rx * dB[1]) / det;
    return [A[0] + dA[0] * t, A[1] + dA[1] * t];
  }

  /* 把凸四边形按"每条边各自内缩一段距离"缩进来。
     offs[i] 是第 i 条边（pts[i] -> pts[i+1]）的内缩量。
     之所以要能按边分别给，是因为外沿那条边要缩得比内部边多一半，
     这样最外圈黑边才和内部网格一样粗。 */
  function insetQuad(pts, offs) {
    var n = pts.length;
    var cx = 0, cy = 0;
    pts.forEach(function (p) { cx += p[0]; cy += p[1]; });
    cx /= n; cy /= n;

    var lines = pts.map(function (p, i) {
      var q = pts[(i + 1) % n];
      var dx = q[0] - p[0], dy = q[1] - p[1];
      var len = Math.hypot(dx, dy) || 1;
      dx /= len; dy /= len;
      var nx = -dy, ny = dx;
      // 法线指向四边形内部（质心那一侧）
      var mx = (p[0] + q[0]) / 2, my = (p[1] + q[1]) / 2;
      if ((cx - mx) * nx + (cy - my) * ny < 0) { nx = -nx; ny = -ny; }
      var o = offs[i];
      return { A: [p[0] + nx * o, p[1] + ny * o], d: [dx, dy] };
    });

    return pts.map(function (_, i) {
      var a = lines[(i - 1 + n) % n], b = lines[i];
      return lineIntersect(a.A, a.d, b.A, b.d);
    });
  }

  // 圆角多边形：每个角用二次贝塞尔过渡，采样成折线
  // （折线形式让 SVG 和校验脚本可以用同一份顶点）
  function roundedPoints(pts, radius, segs) {
    segs = segs || 6;
    var out = [], n = pts.length;
    for (var i = 0; i < n; i++) {
      var prev = pts[(i - 1 + n) % n], cur = pts[i], next = pts[(i + 1) % n];
      var l1 = dist2(prev, cur), l2 = dist2(next, cur);
      var d1x = (prev[0] - cur[0]) / (l1 || 1), d1y = (prev[1] - cur[1]) / (l1 || 1);
      var d2x = (next[0] - cur[0]) / (l2 || 1), d2y = (next[1] - cur[1]) / (l2 || 1);
      var r = Math.min(radius, l1 / 2, l2 / 2);
      var ax = cur[0] + d1x * r, ay = cur[1] + d1y * r;
      var bx = cur[0] + d2x * r, by = cur[1] + d2y * r;
      for (var s = 0; s <= segs; s++) {
        var t = s / segs, mt = 1 - t;
        out.push([
          mt * mt * ax + 2 * mt * t * cur[0] + t * t * bx,
          mt * mt * ay + 2 * mt * t * cur[1] + t * t * by
        ]);
      }
    }
    return out;
  }

  function shadeColor(hex, f) {
    var r = parseInt(hex.slice(1, 3), 16),
        g = parseInt(hex.slice(3, 5), 16),
        b = parseInt(hex.slice(5, 7), 16);
    function m(v) { return Math.max(0, Math.min(255, Math.round(v * f))); }
    return '#' + [m(r), m(g), m(b)]
      .map(function (v) { return v.toString(16).padStart(2, '0'); }).join('');
  }

  /* 算出所有贴纸的多边形。
     坐标已翻成 SVG 的 y 向下，并平移成从 (0,0) 起、四周留 pad。
     返回 { cells, silhouette, size } */
  function buildStickers(state, userCfg) {
    var cfg = Object.assign({}, DEFAULT_CFG, userCfg || {});
    var project = makeProjector(cfg.elev, cfg.dist);
    function P(p) { var s = project(p); return [s[0], -s[1]]; }

    var raw = [];
    FACE_ORDER.forEach(function (face) {
      var def = FACES[face];
      for (var row = 0; row < 3; row++) {
        for (var col = 0; col < 3; col++) {
          // 小方块四角的三维坐标 -> 屏幕坐标
          function V(cc, rr) {
            return P([
              def.origin[0] + cc * def.u[0] + rr * def.v[0],
              def.origin[1] + cc * def.u[1] + rr * def.v[1],
              def.origin[2] + cc * def.u[2] + rr * def.v[2]
            ]);
          }
          var frame = [V(col, row), V(col + 1, row), V(col + 1, row + 1), V(col, row + 1)];
          var key = (state[face] && state[face][row] && state[face][row][col]) || 'gray';
          var hex = HEX[key] || HEX.gray;
          raw.push({
            face: face, row: row, col: col,
            id: face + '-' + row + '-' + col,
            frame: frame,
            colorKey: key,
            fill: cfg.shading ? shadeColor(hex, def.shade) : hex
          });
        }
      }
    });

    // 归一化到 (0,0) 起
    var all = [];
    raw.forEach(function (c) { all = all.concat(c.frame); });
    var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    all.forEach(function (p) {
      if (p[0] < minX) minX = p[0];
      if (p[0] > maxX) maxX = p[0];
      if (p[1] < minY) minY = p[1];
      if (p[1] > maxY) maxY = p[1];
    });
    var w = maxX - minX, h = maxY - minY;
    var padPx = cfg.pad * Math.max(w, h);
    function T(p) { return [p[0] - minX + padPx, p[1] - minY + padPx]; }

    var cells = raw.map(function (c) {
      var f = c.frame.map(T);
      var lens = f.map(function (p, i) { return dist2(p, f[(i + 1) % 4]); });
      var L = (lens[0] + lens[1] + lens[2] + lens[3]) / 4;

      // 边 i: f[i] -> f[i+1]
      //   i=0 是 row   这条边（row==0 时在魔方外沿）
      //   i=1 是 col+1 这条边（col==2 时在外沿）
      //   i=2 是 row+1 这条边（row==2 时在外沿）
      //   i=3 是 col   这条边（col==0 时在外沿）
      var edgeIsBoundary = [c.row === 0, c.col === 2, c.row === 2, c.col === 0];
      // 外沿缩 gap，内部边只缩 gap/2 —— 因为内部缝隙由两侧各出一半
      var offs = edgeIsBoundary.map(function (b) { return (b ? cfg.gap : cfg.gap / 2) * L; });

      return {
        face: c.face, row: c.row, col: c.col, id: c.id,
        colorKey: c.colorKey, fill: c.fill,
        frame: f,
        sticker: roundedPoints(insetQuad(f, offs), cfg.radius * L)
      };
    });

    return {
      cells: cells,
      size: { w: w + padPx * 2, h: h + padPx * 2 }
    };
  }

  function ptsAttr(pts) {
    return pts.map(function (p) { return p[0].toFixed(3) + ',' + p[1].toFixed(3); }).join(' ');
  }

  /* 生成 SVG 字符串。浏览器显示和导出走的是同一个函数。 */
  function toSvg(state, userCfg, opts) {
    opts = opts || {};
    var cfg = Object.assign({}, DEFAULT_CFG, userCfg || {});
    var built = buildStickers(state, cfg);
    var s = built.size;
    var out = ['<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' +
      s.w.toFixed(3) + ' ' + s.h.toFixed(3) + '" width="' + s.w.toFixed(3) +
      '" height="' + s.h.toFixed(3) + '" shape-rendering="geometricPrecision">'];
    if (opts.background) {
      out.push('<rect width="' + s.w.toFixed(3) + '" height="' + s.h.toFixed(3) +
        '" fill="' + opts.background + '"/>');
    }
    built.cells.forEach(function (c) {
      out.push('<g class="cell" data-id="' + c.id + '">');
      out.push('<polygon class="frame" points="' + ptsAttr(c.frame) + '" fill="#1A1A1A"/>');
      out.push('<polygon class="sticker" points="' + ptsAttr(c.sticker) + '" fill="' + c.fill + '"/>');
      out.push('</g>');
    });
    out.push('</svg>');
    return out.join('');
  }

  /* 导出成能粘回 legacy/f2l.py 的 Python 代码 */
  function toPython(state) {
    function face(name) {
      var rows = state[name].map(function (r) {
        return '        [' + r.map(function (k) {
          return (PYNAME[k] || PYNAME.gray).padEnd(12);
        }).join(', ') + ']';
      });
      return '    ' + name + '_colors = [\n' + rows.join(',\n') + '\n    ]';
    }
    return face('top') + '\n\n' + face('left') + '\n\n' + face('right');
  }

  function toJSON(state) {
    return JSON.stringify({ top: state.top, left: state.left, right: state.right }, null, 2);
  }

  function cloneState(state) { return JSON.parse(JSON.stringify(state)); }

  /* ============================================================
   * OLL 模式：顶层俯视图（3x3）+ 边框短线
   *
   * 模型（用参考图的 OLL 7 / OLL 27 反推出来的）：
   *   每个非中心块记录它的**黄色贴纸朝向哪个面**：
   *     棱块 2 态：U（朝上） / 唯一的那个侧面
   *     角块 3 态：U（朝上） / 两个侧面之一
   *   格子：朝上 -> 实心，否 -> 空心
   *   短线：没朝上的块，黄色会从某个侧面露出来，就在那条边上画一段线
   *
   *   验证：OLL 7 参考图有 5 条短线，而它未朝上的块正好 5 个（3 角 + 2 棱）；
   *         OLL 27（Sune）有 3 条，未朝上的正好 3 个角。每个未朝向的块恰好一条。
   *
   *   坐标同样是 SVG 的 y 向下。U=上 F=前 R=右 B=后 L=左。
   * ============================================================ */
  // 每个位置的黄色贴纸可能朝向的面，数组顺序 = 点击时的循环顺序
  var OLL_FACES = [
    [['U', 'B', 'L'], ['U', 'B'],      ['U', 'B', 'R']],
    [['U', 'L'],      ['U'],           ['U', 'R']],
    [['U', 'F', 'L'], ['U', 'F'],      ['U', 'F', 'R']]
  ];

  var DEFAULT_OLL = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0]
  ];

  var OLL_CFG = {
    showBars: true,   // 显示边框划线（灰色空心框）
    cell: 1,          // 一格边长
    gap: 0.17,        // 格间距
    radius: 0.20,     // 圆角（占边长比例）
    line: 0.055,      // 格子描边粗细
    bar: 0.075,       // 划线粗细（实心线段）
    barGhost: 0.0585, // 候选位细一点（= bar * 0.78）
    barLen: 0.60,     // 划线长度（占边长比例）
    barOff: 0.085,    // 距格子边缘的距离（原来就是 gap*0.5）
    barOn: 0.85,      // 选中划线的浓度
    barDim: 0.5,      // 候选划线的浓度——调淡的就是它
    pad: 0.13         // 四周留白（占棋盘比例，刚好放得下划线）
  };

  // OLL 配色方案：**每个方案就是一个固定颜色**，白天夜晚都长一样。
  //
  // 为什么是中间调而不是参考图那种深紫：空心格是透明的，实心格直接落在画布底色上。
  // 参考图的深紫 #4C4263 在浅底上很好看，但放在夜晚的深底上几乎和背景融掉
  // （只靠描边撑着）。中间调在白底和深底上都能读，所以主体用中间调，
  // 参考图那个深紫单独留一个选项（白底/导出时最佳）。
  var OLL_SCHEMES = [
    { key: 'violet', zh: '紫',   on: '#7E6FC7' },
    { key: 'indigo', zh: '靛蓝', on: '#4F7BC4' },
    { key: 'green',  zh: '绿',   on: '#3E9E6D' },
    { key: 'red',    zh: '红',   on: '#B94A5C' },
    // 黄色必须和 F2L / PLL 的顶面黄一致 —— 直接引用同一个常量，别再各写各的
    { key: 'yellow', zh: '黄',   on: HEX.yellow },
    { key: 'ink',    zh: '深紫', on: '#4C4263' }   // 参考图那色，白底最佳
  ];
  var OLL_DEFAULT_SCHEME = 'violet';

  // 每种主题下的描边色和"候选位"灰
  var OLL_INK = {
    light: { line: '#1A1A1A', ghost: '#B9C0CA' },
    dark:  { line: '#C8D0DC', ghost: '#6E7A8A' }
  };

  function ollScheme(key) {
    for (var i = 0; i < OLL_SCHEMES.length; i++) if (OLL_SCHEMES[i].key === key) return OLL_SCHEMES[i];
    return OLL_SCHEMES[0];
  }
  function ollIsDark(theme) { return theme !== 'light'; }
  /* 实心格 / 空心格 / 描边 / 候选灰，一次算齐 */
  function ollPalette(theme, key) {
    var sc = ollScheme(key), ink = OLL_INK[ollIsDark(theme) ? 'dark' : 'light'];
    return {
      scheme: sc, dark: ollIsDark(theme),
      on: sc.on,                            // 固定：不随主题变
      off: 'none',                         // 空心格透明，两种底色下都成立
      line: ink.line, ghost: ink.ghost
    };
  }

  // faces 省略时就是三阶那张表；2x2 传自己的表进来（见下面 二阶 那一段）
  function ollFacesAt(r, c, faces) { return (faces || OLL_FACES)[r][c]; }
  function ollIsCenter(r, c, faces) { return ollFacesAt(r, c, faces).length === 1; }
  function ollIsOriented(oll, r, c) { return !oll[r] || oll[r][c] === 0; }

  // 点一下：在"黄色朝向哪个面"之间循环；中心块只有 U 一种，点不动
  function cycleOll(oll, r, c, faces) {
    var n = ollFacesAt(r, c, faces).length;
    if (n < 2) return false;
    oll[r][c] = (oll[r][c] + 1) % n;
    return true;
  }

  // 全部设为某一个状态：oriented=true 全朝上，false 全指向第一个侧面
  function ollAll(oriented, faces) {
    var tb = faces || OLL_FACES;
    return tb.map(function (row, r) {
      return row.map(function (_, c) { return ollIsCenter(r, c, tb) ? 0 : (oriented ? 0 : 1); });
    });
  }

  function cloneOll(oll) { return oll.map(function (r) { return r.slice(); }); }

  function buildOll(oll, userCfg, faces) {
    var tb = faces || OLL_FACES;
    var n = tb.length;
    var g = Object.assign({}, OLL_CFG, userCfg || {});
    var pal = ollPalette(g.theme, g.scheme);
    var pitch = g.cell + g.gap;
    var board = n * pitch - g.gap;
    var pad = g.pad * board;
    var cells = [], bars = [];

    for (var r = 0; r < n; r++) {
      for (var c = 0; c < n; c++) {
        var x = pad + c * pitch, y = pad + r * pitch;
        var cx = x + g.cell / 2, cy = y + g.cell / 2;
        var rect = [[x, y], [x + g.cell, y], [x + g.cell, y + g.cell], [x, y + g.cell]];
        var faces = ollFacesAt(r, c, tb);
        var idx = ollIsCenter(r, c, tb) ? 0 : ((oll[r] && oll[r][c]) || 0);
        if (idx >= faces.length) idx = 0;
        var on = idx === 0;

        cells.push({
          row: r, col: c, id: 'oll-' + r + '-' + c,
          center: ollIsCenter(r, c, tb), on: on, face: faces[idx],
          pts: roundedPoints(rect, g.radius * g.cell, 5),
          fill: on ? pal.on : pal.off
        });

        // 每个能放黄色的侧面画一条线段：选中的用实心格颜色，其余用浅灰
        // （黄色只有一个面，选了别的就变淡）
        if (!ollIsCenter(r, c, tb)) {
          var half = g.barLen * g.cell / 2;
          var off = g.barOff;
          for (var k = 1; k < faces.length; k++) {
            var f = faces[k];
            var p1, p2;
            if (f === 'B')      { p1 = [cx - half, y - off];          p2 = [cx + half, y - off]; }
            else if (f === 'F') { p1 = [cx - half, y + g.cell + off]; p2 = [cx + half, y + g.cell + off]; }
            else if (f === 'L') { p1 = [x - off, cy - half];          p2 = [x - off, cy + half]; }
            else                { p1 = [x + g.cell + off, cy - half]; p2 = [x + g.cell + off, cy + half]; }
            bars.push({
              id: 'bar-' + r + '-' + c + '-' + f, row: r, col: c, face: f,
              selected: (!on && idx === k),
              p1: p1, p2: p2
            });
          }
        }
      }
    }
    return { cells: cells, bars: bars, cfg: g, pal: pal, scheme: pal.scheme,
             size: { w: board + pad * 2, h: board + pad * 2 } };
  }

  function toOllSvg(oll, userCfg, opts, faces) {
    opts = opts || {};
    var b = buildOll(oll, userCfg, faces);
    var g = b.cfg, w = b.size.w, h = b.size.h;
    var out = ['<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + w.toFixed(3) + ' ' + h.toFixed(3) +
      '" width="' + w.toFixed(3) + '" height="' + h.toFixed(3) + '" shape-rendering="geometricPrecision">'];
    if (opts.background) {
      out.push('<rect width="' + w.toFixed(3) + '" height="' + h.toFixed(3) + '" fill="' + opts.background + '"/>');
    }
    b.cells.forEach(function (c) {
      out.push('<g class="cell" data-id="' + c.id + '">');
      // pointer-events="all"：空心格是 fill="none"，默认只有描边能点，
      // 格子中间是死区。加上它整格都可点。
      out.push('<polygon class="sticker" pointer-events="all" points="' + ptsAttr(c.pts) +
        '" fill="' + c.fill + '" stroke="' + b.pal.line + '" stroke-width="' +
        g.line.toFixed(4) + '" stroke-linejoin="round"/>');
      out.push('</g>');
    });
    // 划线只是显示，不参与点击（曾经给它加过加粗热区，结果抢走了格子边缘的点击）。
    // 实心线段；候选位用药水淡一档，免得 12 条候选把 5 条有效信息淹掉。
    b.bars.forEach(function (bar) {
      var col = !g.showBars ? 'transparent' : (bar.selected ? b.pal.on : b.pal.ghost);
      out.push('<line class="bar" data-face="' + bar.face + '" data-cell="' + bar.row + '-' + bar.col +
        '" data-sel="' + (bar.selected ? 1 : 0) + '"' +
        ' x1="' + bar.p1[0].toFixed(3) + '" y1="' + bar.p1[1].toFixed(3) +
        '" x2="' + bar.p2[0].toFixed(3) + '" y2="' + bar.p2[1].toFixed(3) +
        '" stroke="' + col + '" stroke-width="' +
        (!g.showBars ? g.barGhost : (bar.selected ? g.bar : g.barGhost)).toFixed(4) +
        '" stroke-linecap="round" opacity="' + (bar.selected ? g.barOn : g.barDim) +
        '" pointer-events="none"/>');
    });
    out.push('</svg>');
    return out.join('');
  }

  /* ============================================================
   * PLL 模式：顶层俯视图 + 侧面颜色划线 + 置换箭头
   *
   * 数据只有一份：8 个块**各自在哪个槽位**（一个置换 perm）。
   * 颜色和箭头都从它推导出来，所以"拖方块"和"拖箭头"不可能不一致 ——
   * 不存在两份需要同步的状态。
   *
   *   箭头 = 这块该去哪：从它现在的位置指向它的家
   *   划线 = 该块侧面贴纸的颜色，画在对应那条边外侧
   *
   * 块的旋转：绕 U 轴顺时针走 Δ 步（面序 F→L→B→R），贴纸的面 f -> (f+Δ) mod 4。
   * 这条是从参考图反推并逐格验算过的。
   * ============================================================ */

  // 面 → 颜色（标准西式配色把魔方翻成黄顶：U黄 F蓝 R红 B绿 L橙）
  var PLL_FACE_COLORS = {
    U: HEX.yellow, F: HEX.blue, R: HEX.red, B: HEX.green, L: HEX.orange
  };
  var PLL_SIDE_ORDER = ['F', 'L', 'B', 'R'];        // 顺时针；下标就是"面序"
  function pllFaceIdx(f) { return PLL_SIDE_ORDER.indexOf(f); }

  // 8 个槽位。ang = 绕 U 轴的顺时针角序：
  //   棱块正好在整数角上（F=0 L=1 B=2 R=3）
  //   角块在两角之间，用 UFR=0 UFL=1 ULB=2 UBR=3 表示
  var PLL_SLOTS = [
    { id: '0-0', row: 0, col: 0, ang: 2, kind: 'corner', faces: ['L', 'B'] },  // ULB
    { id: '0-1', row: 0, col: 1, ang: 2, kind: 'edge',   faces: ['B'] },       // UB
    { id: '0-2', row: 0, col: 2, ang: 3, kind: 'corner', faces: ['B', 'R'] },  // UBR
    { id: '1-0', row: 1, col: 0, ang: 1, kind: 'edge',   faces: ['L'] },       // UL
    { id: '1-2', row: 1, col: 2, ang: 3, kind: 'edge',   faces: ['R'] },       // UR
    { id: '2-0', row: 2, col: 0, ang: 1, kind: 'corner', faces: ['F', 'L'] },  // UFL
    { id: '2-1', row: 2, col: 1, ang: 0, kind: 'edge',   faces: ['F'] },       // UF
    { id: '2-2', row: 2, col: 2, ang: 0, kind: 'corner', faces: ['F', 'R'] }   // UFR
  ];
  var PLL_SLOT_BY_ID = {};
  PLL_SLOTS.forEach(function (sl, i) { sl.idx = i; PLL_SLOT_BY_ID[sl.id] = i; });

  var PLL_CFG = {
    // 网格：格间距 / 圆角 / 留白比例都与 OLL 取同一个值，
    // 这样两个视图总尺寸相同，缩放后格子看起来一样大
    cell: 1, gap: 0.17, radius: 0.20,
    // 侧面颜色划线：粗细 / 距离 / 长度都与 OLL 一致
    bar: 0.075, barLen: 0.60, barOff: 0.085,
    // 箭头：照第一份示例。线比原来粗一点，头比原来**明显更细长**
    // （原来 headW=0.52 是个钝三角，示例图里是细长的尖头）
    arrow: 0.07, head: 0.30, headW: 0.34,
    // 两端缩进。0 = 从格心到格心（示例图就是这样）。
    // 之前是 0.30 / 0.34，箭头只剩格心距的 45%，头尖悬在半路，看着像"在中间"。
    tailIn: 0, headIn: 0,
    // 同一格上若落了两个以上箭头端点（前一根的尾 + 后一根的头），
    // 各自往回缩这么多，免得头尾叠在一起
    joinGap: 0.15,
    pad: 0.13                           // 与 OLL 同比例（占棋盘比例）
  };

  // 箭头颜色预设。箭头画在黄色格子上（也会横穿格子之间的缝），
  // 所以都用深色 —— 浅色在黄底上会糊掉。
  var PLL_ARROW_COLORS = [
    { key: 'violet',  zh: '深紫', on: '#4C4263' },
    { key: 'ink',     zh: '墨黑', on: '#1A1A1A' },
    { key: 'navy',    zh: '藏蓝', on: '#2B4C8C' },
    { key: 'forest',  zh: '墨绿', on: '#2A5F45' },
    { key: 'crimson', zh: '深红', on: '#9E2B3A' },
    // 黄：和 PLL「无色夜间」那版箭头同一个黄（HEX.yellow）。
    // 注意它压不到黄色格子上 —— 要把「显示颜色」关掉（格子透明）才好看，
    // 也就是夜晚那套无色图的用法。
    { key: 'yellow',  zh: '黄',   on: HEX.yellow }
  ];
  var PLL_DEFAULT_ARROW = 'violet';
  function pllArrowColorOf(key) {
    for (var i = 0; i < PLL_ARROW_COLORS.length; i++) {
      if (PLL_ARROW_COLORS[i].key === key) return PLL_ARROW_COLORS[i].on;
    }
    return PLL_ARROW_COLORS[0].on;
  }

  function pllDefault() { return PLL_SLOTS.map(function (_, i) { return i; }); }
  function clonePll(perm) { return perm.slice(); }

  /* 位置 <-> 家的换算 */
  function pllPosOf(perm, home) { return perm.indexOf(home); }

  /* 某槽位上、某个侧面看到的颜色。delta 是这块从家转到这里走的顺时针步数 */
  function pllStickerColor(slot, home, face) {
    var delta = ((slot.ang - home.ang) % 4 + 4) % 4;
    var src = ((pllFaceIdx(face) - delta) % 4 + 4) % 4;
    return PLL_FACE_COLORS[PLL_SIDE_ORDER[src]];
  }

  /* 三个操作，全部只动这一个置换 —— 这就是"一致性"的全部来源。
     注意角块只能进角位、棱块只能进棱位：角块有 2 个侧面贴纸、棱块只有 1 个，
     混放会让多余的那个贴纸无处安放，颜色直接失真。
     （这条是被"从颜色反解块的身份"那个不变量测试逼出来的。） */
  function pllSameKind(a, b) { return PLL_SLOTS[a].kind === PLL_SLOTS[b].kind; }

  // 把 a、b 两个槽位上的块对调；非同类的拒绝
  function pllSwap(perm, a, b) {
    if (a === b || !pllSameKind(a, b)) return false;
    var t = perm[a]; perm[a] = perm[b]; perm[b] = t;
    return true;
  }
  // 拖箭头尾：这块现在挪到 to —— 等价于对调 a 和 to
  function pllDragTail(perm, from, to) { return pllSwap(perm, from, to); }
  // 拖箭头头：让"该去 from 家"这件事改成"该去 to" —— 把 to 家的那块搬到 from 槽位来
  function pllDragHead(perm, from, to) {
    if (!pllSameKind(from, to)) return false;
    return pllSwap(perm, from, pllPosOf(perm, to));
  }

  /* 箭头：每个不在自己家的块，从当前槽位指向它的家 */
  function pllArrows(perm) {
    var out = [];
    for (var i = 0; i < perm.length; i++) if (perm[i] !== i) out.push({ from: i, to: perm[i] });
    return out;
  }

  function pllSideStickers(perm) {
    var out = [];
    for (var i = 0; i < PLL_SLOTS.length; i++) {
      var slot = PLL_SLOTS[i], home = PLL_SLOTS[perm[i]];
      for (var k = 0; k < slot.faces.length; k++) {
        var f = slot.faces[k];
        out.push({
          slot: i, row: slot.row, col: slot.col, face: f,
          color: pllStickerColor(slot, home, f)
        });
      }
    }
    return out;
  }

  function pllIsHome(perm) { for (var i = 0; i < perm.length; i++) if (perm[i] !== i) return false; return true; }

  /* 箭头几何：每个不在自己家的块，从当前槽位指向它的家。
     slots 是这一层的槽位表，centerOf(i) 给第 i 个槽位的格心（屏幕坐标）——
     三阶 PLL 和二阶 PBL 都用这一份，免得两处箭头推导各写一遍。
     互换成环的两块只画**一根双头箭头**（两头都有头）。
     曾经画成两根平行的单向箭头，各自偏 0.16 —— 结果它们的头尾挤在一起，
     看着像连成一条，很难看；而且"到底哪个方向"本来也没有意义。 */
  function pllArrowGeom(perm, slots, centerOf, g) {
    var arrows = [], done = {};
    var raw = pllArrows(perm).filter(function (a) {
      if (done[a.from]) return false;
      var mutual = (perm[a.to] === a.from);
      if (mutual) done[a.to] = true;
      return true;
    });
    // 数一下每个格心上落了多少个箭头端点
    var ends = {};
    raw.forEach(function (a) {
      ends[a.from] = (ends[a.from] || 0) + 1;     // 这根箭头的尾
      ends[a.to] = (ends[a.to] || 0) + 1;         // 这根箭头的头
    });
    raw.forEach(function (a) {
      var mutual = (perm[a.to] === a.from);
      var p1 = centerOf(a.from), p2 = centerOf(a.to);
      var dx = p2[0] - p1[0], dy = p2[1] - p1[1], L = Math.hypot(dx, dy) || 1;
      var ux = dx / L, uy = dy / L;
      // 该格上不止一个端点就回缩，留出缝
      var gm = ends[a.from] > 1 ? g.cell * g.joinGap : 0;
      var gn = ends[a.to] > 1 ? g.cell * g.joinGap : 0;
      p1 = [p1[0] + ux * gm, p1[1] + uy * gm];
      p2 = [p2[0] - ux * gn, p2[1] - uy * gn];
      arrows.push({ from: a.from, to: a.to, p1: p1, p2: p2, both: mutual });
    });
    return arrows;
  }

  function buildPll(perm, userCfg) {
    var g = Object.assign({}, PLL_CFG, userCfg || {});
    var showColors = g.showColors !== false;
    var pitch = g.cell + g.gap;
    var board = 3 * pitch - g.gap;
    var pad = g.pad * board;            // 和 OLL 一样按棋盘比例留白
    var paint = g.paint || { line: '#1A1A1A', ghost: '#6E7A8A', text: '#FFFFFF', accent: '#C8D0DC' };

    function cellPts(row, col) {
      var x = pad + col * pitch, y = pad + row * pitch;
      var rect = [[x, y], [x + g.cell, y], [x + g.cell, y + g.cell], [x, y + g.cell]];
      return roundedPoints(rect, g.radius * g.cell, 5);
    }

    var cells = [];
    for (var r = 0; r < 3; r++) {
      for (var c = 0; c < 3; c++) {
        var isCenter = (r === 1 && c === 1);
        cells.push({
          row: r, col: c, center: isCenter,
          pts: cellPts(r, c),
          fill: (showColors && isCenter) || (showColors && !isCenter) ? PLL_FACE_COLORS.U : 'none',
          stroke: paint.line
        });
      }
    }
    if (!showColors) cells.forEach(function (cl) { cl.fill = 'none'; });

    // 侧面颜色划线
    var bars = [];
    if (showColors) {
      pllSideStickers(perm).forEach(function (st) {
        var x = pad + st.col * pitch, y = pad + st.row * pitch;
        var cx = x + g.cell / 2, cy = y + g.cell / 2;
        var half = g.barLen * g.cell / 2, off = g.barOff;
        var p1, p2;
        if (st.face === 'B')      { p1 = [cx - half, y - off];          p2 = [cx + half, y - off]; }
        else if (st.face === 'F') { p1 = [cx - half, y + g.cell + off]; p2 = [cx + half, y + g.cell + off]; }
        else if (st.face === 'L') { p1 = [x - off, cy - half];          p2 = [x - off, cy + half]; }
        else                      { p1 = [x + g.cell + off, cy - half]; p2 = [x + g.cell + off, cy + half]; }
        bars.push({ slot: st.slot, face: st.face, color: st.color, p1: p1, p2: p2 });
      });
    }

    var arrows = pllArrowGeom(perm, PLL_SLOTS, function (i) {
      var sl = PLL_SLOTS[i];
      return [pad + sl.col * pitch + g.cell / 2, pad + sl.row * pitch + g.cell / 2];
    }, g);

    return {
      cells: cells, bars: bars, arrows: arrows, cfg: g, paint: paint,
      size: { w: board + pad * 2, h: board + pad * 2 }
    };
  }

  /* 箭头头：细长的实心三角。wRatio 是"半宽 / 长"，示例图看起来比默认更瘦 */
  function arrowHead(p, q, size, wRatio) {
    var dx = q[0] - p[0], dy = q[1] - p[1];
    var L = Math.hypot(dx, dy) || 1;
    var ux = dx / L, uy = dy / L;
    var bx = q[0] - ux * size, by = q[1] - uy * size;
    var nx = -uy, ny = ux;
    var h = size * (wRatio || 0.5);
    return [[q[0], q[1]], [bx + nx * h, by + ny * h], [bx - nx * h, by - ny * h]];
  }

  function toPllSvg(perm, userCfg, opts) {
    opts = opts || {};
    var b = buildPll(perm, userCfg);
    var g = b.cfg, pal = b.paint, w = b.size.w, h = b.size.h;
    var out = ['<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + w.toFixed(3) + ' ' + h.toFixed(3) +
      '" width="' + w.toFixed(3) + '" height="' + h.toFixed(3) + '" shape-rendering="geometricPrecision">'];
    if (opts.background) out.push('<rect width="' + w.toFixed(3) + '" height="' + h.toFixed(3) + '" fill="' + opts.background + '"/>');

    // 网格
    b.cells.forEach(function (c) {
      // 3x3 里只有 8 格是块，中间那格是 U 面中心、不参与置换
      var si = slotIdx(c.row, c.col);
      out.push('<g class="cell" data-id="pll-' + c.row + '-' + c.col + '" data-slot="' +
        (si >= 0 ? PLL_SLOTS[si].id : 'center') + '"' + (si < 0 ? ' data-center="1"' : '') + '>');
      out.push('<polygon class="sticker" pointer-events="all" points="' + ptsAttr(c.pts) +
        '" fill="' + c.fill + '" stroke="' + c.stroke + '" stroke-width="' +
        (g.arrow * 0.9).toFixed(4) + '" stroke-linejoin="round"/>');
      out.push('</g>');
    });

    // 侧面颜色划线
    b.bars.forEach(function (bar) {
      out.push('<line class="pllbar" data-slot="' + PLL_SLOTS[bar.slot].id + '" data-face="' + bar.face +
        '" x1="' + bar.p1[0].toFixed(3) + '" y1="' + bar.p1[1].toFixed(3) +
        '" x2="' + bar.p2[0].toFixed(3) + '" y2="' + bar.p2[1].toFixed(3) +
        '" stroke="' + bar.color + '" stroke-width="' + g.bar.toFixed(4) +
        '" stroke-linecap="round" pointer-events="none"/>');
    });

    // 箭头
    b.arrows.forEach(function (a) {
      var p1 = a.p1, p2 = a.p2;
      var dx = p2[0] - p1[0], dy = p2[1] - p1[1];
      var L = Math.hypot(dx, dy) || 1;
      var ux = dx / L, uy = dy / L;
      var tailGap = g.cell * (g.tailIn || 0), headGap = g.cell * (g.headIn || 0);
      var s = [p1[0] + ux * tailGap, p1[1] + uy * tailGap];
      var e = [p2[0] - ux * headGap, p2[1] - uy * headGap];
      var hl = g.cell * g.head;
      // 线段比箭头尖**缩回来**，圆头端点就被三角完全盖住了。
      // 否则圆头会从尖外鼓出半个线宽，看着"头没包住线"。
      var inset = hl * 0.8;
      var ls = a.both ? [s[0] + ux * inset, s[1] + uy * inset] : s;
      var le = [e[0] - ux * inset, e[1] - uy * inset];
      out.push('<g class="pllarrow" data-from="' + PLL_SLOTS[a.from].id + '" data-to="' + PLL_SLOTS[a.to].id +
        '" data-both="' + (a.both ? 1 : 0) + '">');
      out.push('<line x1="' + ls[0].toFixed(3) + '" y1="' + ls[1].toFixed(3) +
        '" x2="' + le[0].toFixed(3) + '" y2="' + le[1].toFixed(3) +
        '" stroke="' + pal.head + '" stroke-width="' + g.arrow.toFixed(4) +
        '" stroke-linecap="round" pointer-events="none"/>');
      out.push('<polygon points="' + ptsAttr(arrowHead(s, e, hl, g.headW)) +
        '" fill="' + pal.head + '" pointer-events="none"/>');
      if (a.both) {                                 // 双头：另一端也补一个头，指向起点
        out.push('<polygon points="' + ptsAttr(arrowHead(e, s, hl, g.headW)) +
          '" fill="' + pal.head + '" pointer-events="none"/>');
      }
      out.push('</g>');
    });
    out.push('</svg>');
    return out.join('');
  }

  function slotIdx(r, c) {
    for (var i = 0; i < PLL_SLOTS.length; i++) if (PLL_SLOTS[i].row === r && PLL_SLOTS[i].col === c) return i;
    return -1;
  }

  function ollToJSON(oll, faces) {
    var tb = faces || OLL_FACES;
    var named = tb.map(function (row, r) {
      return row.map(function (_, c) { return ollFacesAt(r, c, tb)[oll[r][c]] || 'U'; });
    });
    return JSON.stringify({ oll: oll, faces: named }, null, 2);
  }



  /* ============================================================
   * 二阶（2x2）：2x2 只有角块，所以
   *   OLL（顶面朝向）= 四个角各自朝哪，和上面同一个渲染器，只是格子表换成 2x2；
   *   PBL（上下两层排序）= 每层 4 个角怎么换，样式照 2x2 教程那种
   *   「两个空网格 + 双向箭头」—— 不做配色，只看换哪几个角。
   * ============================================================ */

  // 2x2 顶视图：每个角能朝向的面，数组顺序 = 点击时的循环顺序
  var OLL2_FACES = [
    [['U', 'B', 'L'], ['U', 'B', 'R']],
    [['U', 'F', 'L'], ['U', 'F', 'R']]
  ];
  var DEFAULT_OLL2 = [[0, 0], [0, 0]];

  function oll2All(oriented) { return ollAll(oriented, OLL2_FACES); }
  function cycleOll2(oll, r, c) { return cycleOll(oll, r, c, OLL2_FACES); }
  function buildOll2(oll, cfg) { return buildOll(oll, cfg, OLL2_FACES); }
  function toOll2Svg(oll, cfg, opts) { return toOllSvg(oll, cfg, opts, OLL2_FACES); }

  /* 每层 4 个角槽位。ang = 绕 U 轴的顺时针角序（和三阶 PLL 的角块同一套：
     UFR=0 UFL=1 ULB=2 UBR=3），faces = 这个角朝外的两个面。 */
  var PBL2_SLOTS = [
    { id: '0-0', row: 0, col: 0, ang: 2, faces: ['L', 'B'] },   // ULB
    { id: '0-1', row: 0, col: 1, ang: 3, faces: ['B', 'R'] },   // UBR
    { id: '1-0', row: 1, col: 0, ang: 1, faces: ['F', 'L'] },   // UFL
    { id: '1-1', row: 1, col: 1, ang: 0, faces: ['F', 'R'] }    // UFR
  ];
  PBL2_SLOTS.forEach(function (sl, i) { sl.idx = i; });

  // 两层：u 在上、d 在下（和 2x2 教程那张图的排法一致）
  var PBL2_LAYERS = ['u', 'd'];
  var PBL2_CFG = Object.assign({}, PLL_CFG, {
    showColors: false,     // 不带配色：只有网格 + 箭头
    gap: 0.08,             // 线稿网格：格子挨得紧一些（PLL 那 0.17 是给立体贴纸留缝的）
    radius: 0.06,          // 圆角也要小（PLL 那 0.20 是给立体贴纸的）
    // 两层之间的间距：**上面那层的下边**到**下面那层的上边**的距离，
    // 单位是"格子宽"（行方向 1 格 = 1）。和倾斜度无关 —— 调斜度不会把这个距离改掉。
    layerGap: 0.14,
    /* 倾斜：把平面网格映射到画面。0 = 正上方俯视（两个正方形网格），
       1 = 2x2 教程那种斜着的两层。
       教程那图里**前后边（行方向）是水平的**，只有左右边（列方向）斜着：
       列方向往下 1、往左 1.04，并且只占 0.75 的高度（贴纸那种压扁的比例）。
       照片上看着有点歪是拍摄角度，不是画法。 */
    skew: 1
  });
  // 从教程图上量出来的（按"格的宽"归一）：行方向 (1, 0) 完全水平，
  // 列方向每往下 1 往左 0.21、并且只占 0.39 的高度 —— 格子是扁的，
  // 斜度不大，照片上那种"歪"是拍摄角度。
  var PBL2_SKEW = { u: [1, 0], v: [-0.21, 0.39] };

  function pbl2Default() {
    return { u: PBL2_SLOTS.map(function (_, i) { return i; }),
             d: PBL2_SLOTS.map(function (_, i) { return i; }) };
  }
  function pbl2Clone(st) { return { u: st.u.slice(), d: st.d.slice() }; }
  function pbl2IsHome(st) {
    return PBL2_LAYERS.every(function (k) {
      return st[k].every(function (home, i) { return home === i; });
    });
  }
  // 把某一层上的两个角对调（拖方块 = 换这两块）
  function pbl2Swap(st, layer, a, b) {
    var perm = st[layer];
    if (!perm || a === b || a < 0 || b < 0 || a >= perm.length || b >= perm.length) return false;
    var t = perm[a]; perm[a] = perm[b]; perm[b] = t;
    return true;
  }
  function pbl2Arrows(st, layer) { return pllArrows(st[layer]); }

  function buildPbl2(st, userCfg) {
    var g = Object.assign({}, PBL2_CFG, userCfg || {});
    var paint = g.paint || { line: '#1A1A1A', ghost: '#6E7A8A', text: '#FFFFFF', accent: '#C8D0DC' };
    var skew = (g.skew == null) ? PBL2_CFG.skew : g.skew;
    var pitch = g.cell + g.gap;
    var board = 2 * pitch - g.gap;                 // 一层棋盘的边长（平面坐标里）

    /* 平面坐标 -> 画面：行方向跟着 u，列方向跟着 v（都由 skew 缩放） */
    var uy = PBL2_SKEW.u[1] * skew;
    var vx = PBL2_SKEW.v[0] * skew;
    var vy = 1 - (1 - PBL2_SKEW.v[1]) * skew;
    function map(p) { return [p[0] + p[1] * vx, p[0] * uy + p[1] * vy]; }

    /* 一层：4 个格子 + 4 个格心（都映射过），坐标以这一层自己的左上角为原点 */
    function layerGeom(perm) {
      var cells = [], centres = [];
      for (var r = 0; r < 2; r++) {
        for (var c = 0; c < 2; c++) {
          var x = c * pitch, y = r * pitch;
          var rect = [[x, y], [x + g.cell, y], [x + g.cell, y + g.cell], [x, y + g.cell]].map(map);
          cells.push({ row: r, col: c, pts: roundedPoints(rect, g.radius * g.cell, 5) });
        }
      }
      PBL2_SLOTS.forEach(function (sl) {
        centres.push(map([sl.col * pitch + g.cell / 2, sl.row * pitch + g.cell / 2]));
      });
      var ys = [], xs = [];
      cells.forEach(function (c) { c.pts.forEach(function (p) { xs.push(p[0]); ys.push(p[1]); }); });
      return { cells: cells, centres: centres,
               box: { x0: Math.min.apply(null, xs), x1: Math.max.apply(null, xs),
                      y0: Math.min.apply(null, ys), y1: Math.max.apply(null, ys) } };
    }

    var gears = PBL2_LAYERS.map(function (layer) { return layerGeom(st[layer]); });
    var hLayer = gears[0].box.y1 - gears[0].box.y0;            // 一层斜着之后的高
    // 两层的间距直接按"格"给（g.cell = 1 格宽），所以和倾斜度无关：
    // 行方向水平（u=[1,0]）时，一层的下边和另一层的上边都是水平的，
    // 这个间距就是两条边之间的垂直距离。
    var gapY = g.layerGap * g.cell;
    var offs = [0, hLayer + gapY];
    var allX = [], allY = [];
    gears.forEach(function (gear, li) {
      var dx = gears[0].box.x0 - gear.box.x0, dy = offs[li] - gear.box.y0;
      gear.cells.forEach(function (c) { c.pts = c.pts.map(function (p) { return [p[0] + dx, p[1] + dy]; }); });
      gear.centres = gear.centres.map(function (p) { return [p[0] + dx, p[1] + dy]; });
      gear.cells.forEach(function (c) { c.pts.forEach(function (p) { allX.push(p[0]); allY.push(p[1]); }); });
    });

    // 整体留白（画面单位）—— 斜过来之后按包围盒算，比按棋盘比例稳
    var w0 = Math.max.apply(null, allX) - Math.min.apply(null, allX);
    var pad = g.pad * w0;
    var tx = pad - Math.min.apply(null, allX), ty = pad - Math.min.apply(null, allY);
    var cells = [], arrows = [];
    gears.forEach(function (gear, li) {
      gear.cells.forEach(function (c, ci) {
        var slot = ci;                                          // 0..3，和 PBL2_SLOTS 同序
        cells.push({
          layer: PBL2_LAYERS[li], row: c.row, col: c.col,
          id: 'pbl2-' + PBL2_LAYERS[li] + '-' + c.row + '-' + c.col,
          slot: PBL2_LAYERS[li] + slot,
          pts: c.pts.map(function (p) { return [p[0] + tx, p[1] + ty]; }),
          fill: g.showColors ? PLL_FACE_COLORS.U : 'none',
          stroke: paint.line
        });
      });
      var ctr = gear.centres;
      pllArrowGeom(st[PBL2_LAYERS[li]], PBL2_SLOTS, function (i) { return ctr[i]; }, g)
        .forEach(function (a) {
          arrows.push({ layer: PBL2_LAYERS[li], from: a.from, to: a.to,
                        p1: [a.p1[0] + tx, a.p1[1] + ty], p2: [a.p2[0] + tx, a.p2[1] + ty],
                        both: a.both });
        });
    });

    var wOut = w0 + pad * 2;
    var hOut = (Math.max.apply(null, allY) - Math.min.apply(null, allY)) + pad * 2;
    return {
      cells: cells, arrows: arrows, cfg: g, paint: paint,
      size: { w: wOut, h: hOut }
    };
  }

  function toPbl2Svg(st, userCfg, opts) {
    opts = opts || {};
    var b = buildPbl2(st, userCfg);
    var g = b.cfg, pal = b.paint, w = b.size.w, h = b.size.h;
    var out = ['<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + w.toFixed(3) + ' ' + h.toFixed(3) +
      '" width="' + w.toFixed(3) + '" height="' + h.toFixed(3) + '" shape-rendering="geometricPrecision">'];
    if (opts.background) out.push('<rect width="' + w.toFixed(3) + '" height="' + h.toFixed(3) + '" fill="' + opts.background + '"/>');
    b.cells.forEach(function (c) {
      out.push('<g class="cell" data-id="' + c.id + '" data-layer="' + c.layer +
        '" data-slot="' + c.slot + '">');
      out.push('<polygon class="sticker" pointer-events="all" points="' + ptsAttr(c.pts) +
        '" fill="' + c.fill + '" stroke="' + c.stroke + '" stroke-width="' +
        (g.arrow * 0.9).toFixed(4) + '" stroke-linejoin="round"/>');
      out.push('</g>');
    });
    b.arrows.forEach(function (a) {
      var p1 = a.p1, p2 = a.p2;
      var dx = p2[0] - p1[0], dy = p2[1] - p1[1];
      var L = Math.hypot(dx, dy) || 1;
      var ux = dx / L, uy = dy / L;
      var s0 = [p1[0] + ux * g.cell * (g.tailIn || 0), p1[1] + uy * g.cell * (g.tailIn || 0)];
      var e0 = [p2[0] - ux * g.cell * (g.headIn || 0), p2[1] - uy * g.cell * (g.headIn || 0)];
      var hl = g.cell * g.head, inset = hl * 0.8;
      var ls = a.both ? [s0[0] + ux * inset, s0[1] + uy * inset] : s0;
      var le = [e0[0] - ux * inset, e0[1] - uy * inset];
      out.push('<g class="pllarrow" data-layer="' + a.layer + '" data-from="' + a.layer + a.from +
        '" data-to="' + a.layer + a.to + '" data-both="' + (a.both ? 1 : 0) + '">');
      out.push('<line x1="' + ls[0].toFixed(3) + '" y1="' + ls[1].toFixed(3) +
        '" x2="' + le[0].toFixed(3) + '" y2="' + le[1].toFixed(3) +
        '" stroke="' + pal.head + '" stroke-width="' + g.arrow.toFixed(4) +
        '" stroke-linecap="round" pointer-events="none"/>');
      out.push('<polygon points="' + ptsAttr(arrowHead(s0, e0, hl, g.headW)) +
        '" fill="' + pal.head + '" pointer-events="none"/>');
      if (a.both) {
        out.push('<polygon points="' + ptsAttr(arrowHead(e0, s0, hl, g.headW)) +
          '" fill="' + pal.head + '" pointer-events="none"/>');
      }
      out.push('</g>');
    });
    out.push('</svg>');
    return out.join('');
  }

  return {
    CUBE: CUBE,
    COLORS: COLORS, PALETTE: PALETTE, EMPTY: EMPTY, HEX: HEX, PYNAME: PYNAME, ZH: ZH,
    FACES: FACES, FACE_ORDER: FACE_ORDER, FACE_ZH: FACE_ZH,
    DEFAULT_STATE: DEFAULT_STATE, DEFAULT_CFG: DEFAULT_CFG,
    makeProjector: makeProjector, insetQuad: insetQuad, roundedPoints: roundedPoints,
    shadeColor: shadeColor, buildStickers: buildStickers, toSvg: toSvg,
    toPython: toPython, toJSON: toJSON, cloneState: cloneState,
    OLL_CFG: OLL_CFG, OLL_INK: OLL_INK, OLL_FACES: OLL_FACES, OLL_SCHEMES: OLL_SCHEMES,
    OLL_DEFAULT_SCHEME: OLL_DEFAULT_SCHEME,
    PLL_CFG: PLL_CFG, PLL_SLOTS: PLL_SLOTS, PLL_FACE_COLORS: PLL_FACE_COLORS,
    PLL_SLOT_BY_ID: PLL_SLOT_BY_ID,
    PLL_ARROW_COLORS: PLL_ARROW_COLORS, PLL_DEFAULT_ARROW: PLL_DEFAULT_ARROW,
    pllArrowColorOf: pllArrowColorOf,
    pllDefault: pllDefault, clonePll: clonePll, pllSameKind: pllSameKind, pllPosOf: pllPosOf, pllSwap: pllSwap,
    pllDragTail: pllDragTail, pllDragHead: pllDragHead, pllArrows: pllArrows,
    pllSideStickers: pllSideStickers, pllStickerColor: pllStickerColor, pllIsHome: pllIsHome, buildPll: buildPll, toPllSvg: toPllSvg,
    ollPalette: ollPalette, ollIsDark: ollIsDark,
    DEFAULT_OLL: DEFAULT_OLL, ollScheme: ollScheme, ollFacesAt: ollFacesAt,
    ollIsCenter: ollIsCenter, ollIsOriented: ollIsOriented, cycleOll: cycleOll,
    ollAll: ollAll, cloneOll: cloneOll, buildOll: buildOll, toOllSvg: toOllSvg,
    ollToJSON: ollToJSON,
    OLL2_FACES: OLL2_FACES, DEFAULT_OLL2: DEFAULT_OLL2,
    oll2All: oll2All, cycleOll2: cycleOll2, buildOll2: buildOll2, toOll2Svg: toOll2Svg,
    PBL2_SLOTS: PBL2_SLOTS, PBL2_LAYERS: PBL2_LAYERS, PBL2_CFG: PBL2_CFG, PBL2_SKEW: PBL2_SKEW,
    pbl2Default: pbl2Default, pbl2Clone: pbl2Clone, pbl2IsHome: pbl2IsHome,
    pbl2Swap: pbl2Swap, pbl2Arrows: pbl2Arrows,
    buildPbl2: buildPbl2, toPbl2Svg: toPbl2Svg
  };
});
