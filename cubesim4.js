/* 四阶魔方模拟器（浏览器端）。
 *
 * 和 cubesim.js 是同一套模型：每张贴纸记「3D 坐标 + 法向」，转动时旋转这些坐标
 * 与法向，再由坐标反查回各面位置。只是格子数换成 4：
 * 坐标是 -1.5 / -0.5 / 0.5 / 1.5（一格边长算 1），最外面那层是 ±1.5。
 *
 * 【为什么单独一份】三阶那份被计算器 / 练习页和一大堆测试盯着（还和
 * tools/cubesim.py 逐张贴纸对拍），不敢顺手改成「N 阶通用」。所以这里照它的做法
 * 另写一份，两份互相对拍：**只动外层 / 宽转 / 整体转的公式，八个角块的结果必须
 * 和三阶完全一样**（角块的行为和棱、中心无关）—— 见 test/cubesim4.js。
 *
 * 动作（四阶的行话）：
 *   R U F …   外层（最外面那一层）
 *   Rw / r    宽转 = 外面两层（两个写法等价）
 *   2R 3R …   从某个面数第 N 层：2R = 右边第二层（里面那层），3L = 左面数第三层
 *   x y z     整体转
 * 三阶的 M / E / S 在四阶上没有「正中间那一层」，不认。
 *
 * 用法：
 *   CubeSim4.facelets(CubeSim4.apply(CubeSim4.solved(), "Rw U2 Rw'"))  ->  {U:[16],...}
 */
var CubeSim4 = (function () {
  'use strict';

  var N = 4;
  var MAX = (N - 1) / 2;                   // 1.5：最外面那一层的坐标
  var COORD = [];
  for (var i = 0; i < N; i++) COORD.push(i - MAX);

  var FACES = { U: [0, 1, 0], D: [0, -1, 0], F: [0, 0, 1],
                B: [0, 0, -1], R: [1, 0, 0], L: [-1, 0, 0] };
  var FACE_KEYS = ['U', 'R', 'F', 'D', 'L', 'B'];

  /* 从某个面看，第 r 行第 c 列那格的坐标。排法和 cubesim.js 的 slotsOf 逐字对应，
     只是把里面的 1 换成 MAX、把「第几个」换成 COORD[第几个]。 */
  function slotsOf(face) {
    var out = [];
    for (var r = 0; r < N; r++) {
      for (var c = 0; c < N; c++) {
        var p;
        if (face === 'U')      p = [COORD[c],  MAX,  COORD[r]];   // 第 0 行贴 B 侧
        else if (face === 'D') p = [COORD[c], -MAX, -COORD[r]];
        else if (face === 'F') p = [COORD[c], -COORD[r],  MAX];
        else if (face === 'B') p = [-COORD[c], -COORD[r], -MAX];
        else if (face === 'R') p = [ MAX, -COORD[r], -COORD[c]];
        else                   p = [-MAX, -COORD[r],  COORD[c]];
        out.push({ face: face, r: r, c: c, p: p });
      }
    }
    return out;
  }

  var SLOTS = [];
  FACE_KEYS.forEach(function (f) { SLOTS = SLOTS.concat(slotsOf(f)); });

  function key(p, n) { return p[0] + ',' + p[1] + ',' + p[2] + '|' + n[0] + ',' + n[1] + ',' + n[2]; }

  function solved() {
    var st = {};
    SLOTS.forEach(function (s) { st[key(s.p, FACES[s.face])] = s.face; });
    return st;
  }

  // 各动作的坐标变换（顺时针看该面）—— 和 cubesim.js 逐字相同
  var ROT = {
    U: function (p) { return [-p[2], p[1], p[0]]; },
    D: function (p) { return [p[2], p[1], -p[0]]; },
    F: function (p) { return [p[1], -p[0], p[2]]; },
    B: function (p) { return [-p[1], p[0], p[2]]; },
    R: function (p) { return [p[0], p[2], -p[1]]; },
    L: function (p) { return [p[0], -p[2], p[1]]; }
  };

  /* 层判据统一写成「离这个面几个格子」：外层 d=0，里面第 n 层 d=n-1。
     四阶每个面有 4 层，所以里面能数的只有 2、3 两层（1 就是那个面本身）。 */
  function layer(axis, sign, d) {
    var want = sign * (MAX - d);
    return function (p) { return p[axis] === want; };
  }
  /* 宽转 = 外面两层。判据是「离这个面不到两个格子」：
     从这一面数，坐标是 sign * p[axis]，最外面那层等于 MAX ——
     所以 MAX - sign * p[axis] <= 1。（写成 sign * (MAX - p[axis]) 会让 L/D/B
     那三个方向把整块魔方都框进去，宽转就成了整体转。） */
  function wide(axis, sign) {
    return function (p) { return MAX - sign * p[axis] <= 1; };
  }

  var MOVES = {
    U: [ROT.U, layer(1, 1, 0)], D: [ROT.D, layer(1, -1, 0)],
    F: [ROT.F, layer(2, 1, 0)], B: [ROT.B, layer(2, -1, 0)],
    R: [ROT.R, layer(0, 1, 0)], L: [ROT.L, layer(0, -1, 0)],
    u: [ROT.U, wide(1, 1)], d: [ROT.D, wide(1, -1)],
    f: [ROT.F, wide(2, 1)], b: [ROT.B, wide(2, -1)],
    r: [ROT.R, wide(0, 1)], l: [ROT.L, wide(0, -1)],
    x: [ROT.R, function () { return true; }],
    y: [ROT.U, function () { return true; }],
    z: [ROT.F, function () { return true; }]
  };
  // 里面的单层：2R（右面数第二层）/ 3R / 2L / 3L …（四阶每个方向两层）
  ['R', 'L', 'U', 'D', 'F', 'B'].forEach(function (face) {
    var ax = { R: 0, L: 0, U: 1, D: 1, F: 2, B: 2 }[face];
    var sign = (face === 'R' || face === 'U' || face === 'F') ? 1 : -1;
    for (var d = 1; d <= N - 2; d++) MOVES[(d + 1) + face] = [ROT[face], layer(ax, sign, d)];
  });
  var ALIAS = { Rw: 'r', Lw: 'l', Uw: 'u', Dw: 'd', Fw: 'f', Bw: 'b' };

  function turn(st, mv, times) {
    if (!MOVES[mv]) throw new Error('不认识的动作: ' + mv);
    var rot = MOVES[mv][0], inLayer = MOVES[mv][1];
    var t = ((times || 1) % 4 + 4) % 4;
    for (var k = 0; k < t; k++) {
      var next = {};
      for (var kk in st) {
        if (!st.hasOwnProperty(kk)) continue;
        var parts = kk.split('|');
        var p = parts[0].split(',').map(Number), n = parts[1].split(',').map(Number);
        if (inLayer(p)) {
          var np = rot(p), nn = rot(n);
          next[key(np, nn)] = st[kk];
        } else {
          next[kk] = st[kk];
        }
      }
      st = next;
    }
    return st;
  }

  /* 公式 -> [{mv, times}]。
     比三阶多一种写法：前面带个数字表示「从某个面数第几层」，2R / 3L / 2U' 这样。
     2 和撇允许任意顺序（原表里有 U'2 这种写法）。 */
  function parse(alg) {
    var out = [], s = String(alg || '').replace(/\s+/g, ''), i = 0;
    while (i < s.length) {
      if (s[i] === '(' || s[i] === ')') { i++; continue; }
      var mv;
      if (/[2-9]/.test(s[i])) {
        var d = s[i], f = s[i + 1];
        if (!MOVES[d + f]) throw new Error('不认识的动作: ' + d + (f || ''));
        mv = d + f;
        i += 2;
      } else if (ALIAS[s.substr(i, 2)]) { mv = ALIAS[s.substr(i, 2)]; i += 2; }
      else if (MOVES[s[i]]) { mv = s[i]; i++; }
      else throw new Error('不认识的动作: ' + s[i]);
      var times = 1, prime = false;
      for (var k = 0; k < 2; k++) {
        if (s[i] === '2') { times = 2; i++; }
        else if (s[i] === "'") { prime = !prime; i++; }
      }
      out.push({ mv: mv, times: prime ? -times : times });
    }
    return out;
  }

  function steps(alg) { return parse(alg); }

  function apply(st, alg) {
    parse(alg).forEach(function (m) { st = turn(st, m.mv, m.times); });
    return st;
  }

  /* 按面取值：{U:[16], R:[16], …}，每面行优先（16 = 4×4） */
  function facelets(st) {
    var out = {};
    FACE_KEYS.forEach(function (f) { out[f] = []; });
    SLOTS.forEach(function (s) {
      out[s.face][s.r * N + s.c] = st[key(s.p, FACES[s.face])];
    });
    return out;
  }

  function clone(st) {
    var out = {};
    for (var k in st) if (st.hasOwnProperty(k)) out[k] = st[k];
    return out;
  }

  function stateKey(st) {
    return Object.keys(st).sort().map(function (k) { return k + ':' + st[k]; }).join(';');
  }

  /* ---------- 净旋转：公式做完后整体转了多少 ---------- */
  // 24 种整体旋转（x/y/z 序列），去重后正好 24 个。生成方式照抄 cubesim.js。
  var ROTS = (function () {
    var seen = {}, out = [];
    function visit(s) {
      s = s.trim();
      var k = stateKey(apply(solved(), s));
      if (!seen[k]) { seen[k] = 1; out.push(s); }
    }
    var frontier = [''];
    for (var depth = 0; depth < 3; depth++) {
      var nxt = [];
      frontier.forEach(function (s) {
        ['x', 'y', 'z'].forEach(function (mv) {
          [1, 2, 3].forEach(function (t) {
            nxt.push(s + ' ' + mv + (t === 1 ? '' : t === 2 ? '2' : "'"));
          });
        });
      });
      frontier = nxt;
    }
    visit('');
    frontier.forEach(visit);
    return out;
  })();

  /* 公式的净旋转（'' 表示没有）。
     四阶没有固定的中心块（一个面的四块中心自己也会被面转带着走），所以没法像三阶
     那样「看中心块转到哪」—— 改成：把公式作用在复原态上，看它是不是**整体转过的
     复原态**，和 24 种整体旋转逐一比对。公式本身把角块 / 棱块搅开了（绝大多数公式
     都这样）就返回 ''，也就是不做朝向补偿。 */
  function netRotation(alg) {
    var want = stateKey(apply(solved(), alg));
    for (var i = 0; i < ROTS.length; i++) {
      if (stateKey(apply(solved(), ROTS[i])) === want) return ROTS[i];
    }
    return '';
  }

  return {
    N: N, COORD: COORD, solved: solved, clone: clone, turn: turn,
    parse: parse, steps: steps, apply: apply, facelets: facelets,
    FACES: FACES, SLOTS: SLOTS, ROTS: ROTS, netRotation: netRotation
  };
})();

if (typeof module !== 'undefined' && module.exports) { module.exports = CubeSim4; }
