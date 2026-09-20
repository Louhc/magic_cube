/* 三阶魔方模拟器（浏览器端）。
 *
 * 和 tools/cubesim.py 是同一套模型：给每张贴纸记「3D 坐标 + 法向」，
 * 转动时旋转受影响小块的坐标与法向，再由坐标反查回各面位置。
 * 这样不用手写 54 个 facelet 的置换表，不容易抄错。
 *
 * 两份实现会对拍（test/cubesim.js 拿同一批公式跑，逐张贴纸比颜色）。
 *
 * 用法：
 *   CubeSim.facelets(CubeSim.apply(CubeSim.solved(), "R U R'"))  ->  {U:[9],R:[9],...}
 */
var CubeSim = (function () {
  'use strict';

  var FACES = { U: [0, 1, 0], D: [0, -1, 0], F: [0, 0, 1],
                B: [0, 0, -1], R: [1, 0, 0], L: [-1, 0, 0] };
  var FACE_KEYS = ['U', 'R', 'F', 'D', 'L', 'B'];

  function slotsOf(face) {
    var out = [];
    for (var r = 0; r < 3; r++) {
      for (var c = 0; c < 3; c++) {
        var p;
        if (face === 'U')      p = [c - 1,  1, r - 1];   // 第 0 行贴 B 侧
        else if (face === 'D') p = [c - 1, -1, 1 - r];
        else if (face === 'F') p = [c - 1, 1 - r,  1];
        else if (face === 'B') p = [1 - c, 1 - r, -1];
        else if (face === 'R') p = [1, 1 - r, 1 - c];
        else                   p = [-1, 1 - r, c - 1];
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

  // 各动作的坐标变换（顺时针看该面）
  var ROT = {
    U: function (p) { return [-p[2], p[1], p[0]]; },
    D: function (p) { return [p[2], p[1], -p[0]]; },
    F: function (p) { return [p[1], -p[0], p[2]]; },
    B: function (p) { return [-p[1], p[0], p[2]]; },
    R: function (p) { return [p[0], p[2], -p[1]]; },
    L: function (p) { return [p[0], -p[2], p[1]]; }
  };
  var MOVES = {
    U: [ROT.U, function (p) { return p[1] === 1; }],
    D: [ROT.D, function (p) { return p[1] === -1; }],
    F: [ROT.F, function (p) { return p[2] === 1; }],
    B: [ROT.B, function (p) { return p[2] === -1; }],
    R: [ROT.R, function (p) { return p[0] === 1; }],
    L: [ROT.L, function (p) { return p[0] === -1; }],
    M: [ROT.L, function (p) { return p[0] === 0; }],
    E: [ROT.D, function (p) { return p[1] === 0; }],
    S: [ROT.F, function (p) { return p[2] === 0; }],
    r: [ROT.R, function (p) { return p[0] >= 0; }],
    l: [ROT.L, function (p) { return p[0] <= 0; }],
    u: [ROT.U, function (p) { return p[1] >= 0; }],
    d: [ROT.D, function (p) { return p[1] <= 0; }],
    f: [ROT.F, function (p) { return p[2] >= 0; }],
    b: [ROT.B, function (p) { return p[2] <= 0; }],
    x: [ROT.R, function () { return true; }],
    y: [ROT.U, function () { return true; }],
    z: [ROT.F, function () { return true; }]
  };
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

  /* 公式 -> [{mv, times}]。原表里有 U'2 这种写法，所以 2 和撇允许任意顺序。 */
  function parse(alg) {
    var out = [], s = String(alg || '').replace(/\s+/g, ''), i = 0;
    while (i < s.length) {
      if (s[i] === '(' || s[i] === ')') { i++; continue; }
      var mv;
      if (ALIAS[s.substr(i, 2)]) { mv = ALIAS[s.substr(i, 2)]; i += 2; }
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

  /* 按面取值：{U:[9], R:[9], F:[9], D:[9], L:[9], B:[9]}，每面行优先 */
  function facelets(st) {
    var out = {};
    FACE_KEYS.forEach(function (f) { out[f] = []; });
    SLOTS.forEach(function (s) {
      out[s.face][s.r * 3 + s.c] = st[key(s.p, FACES[s.face])];
    });
    return out;
  }

  function clone(st) {
    var out = {};
    for (var k in st) if (st.hasOwnProperty(k)) out[k] = st[k];
    return out;
  }

  /* ---------- 净旋转：公式做完后整体转了多少 ---------- */
  function centers(st) {
    return {
      U: st['0,1,0|0,1,0'], D: st['0,-1,0|0,-1,0'],
      F: st['0,0,1|0,0,1'], B: st['0,0,-1|0,0,-1'],
      R: st['1,0,0|1,0,0'], L: st['-1,0,0|-1,0,0']
    };
  }

  // 24 种整体旋转（x/y/z 序列），去重后正好 24 个 —— 用来读公式的净旋转。
  // 生成方式照抄 tools/cubesim.py 的 _all_rotations。
  var ROTS = (function () {
    var seen = {}, out = [];
    function stateKey(st) {
      return Object.keys(st).sort().map(function (k) { return k + ':' + st[k]; }).join(';');
    }
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

  // 公式的净旋转（'' 表示没有）。做法和 tools/cubesim.py 一致：
  // 看做完公式后中心块转到哪，和 24 种整体旋转逐一比对。
  function netRotation(alg) {
    var want = JSON.stringify(centers(apply(solved(), alg)));
    for (var i = 0; i < ROTS.length; i++) {
      if (JSON.stringify(centers(apply(solved(), ROTS[i]))) === want) return ROTS[i];
    }
    return '';
  }

  return {
    solved: solved, clone: clone, turn: turn, parse: parse, steps: steps,
    apply: apply, facelets: facelets, FACES: FACES, SLOTS: SLOTS,
    centers: centers, ROTS: ROTS, netRotation: netRotation
  };
})();

if (typeof module !== 'undefined' && module.exports) { module.exports = CubeSim; }
