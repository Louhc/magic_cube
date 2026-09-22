/* 教程步骤图的几何：把「模拟器局面」变成 cube.js 那套三面投影的多边形数据。
 *
 * 为什么不让 cube.js 直接出 SVG、再拿 ImageMagick 栅格化：环境里 ImageMagick 的
 * 内置 SVG 渲染器画不了这种图（出来是一团糊的），所以改成「node 出几何 JSON →
 * python 用 PIL 超采样画 PNG」，和 test 里那套对拍用的投影是同一份代码。
 *
 * 用法：
 *   node tools/tutorial_geometry.js --alg "R U R'" --out /tmp/a.json
 *   node tools/tutorial_geometry.js --state '<CubeSim 状态数组>' --out ...
 *
 * 输出的 JSON：{ size:{w,h}, cells:[{fill, frame:[[x,y]…], sticker:[[x,y]…]}…] }
 * frame 是整格（塑料壳），sticker 是内缩倒角后的贴纸轮廓 —— 和页面里
 * .cubie i / .cubie i.on::after 一个意思。
 */
'use strict';
const fs = require('fs');
const path = require('path');
const S = require(path.join(__dirname, '..', 'cubesim.js'));
const Cube = require(path.join(__dirname, '..', 'cube.js'));

/* 模型坐标 -> cube.js 坐标的旋转：U->上(+z)、F->左前(-x)、R->右前(-y)。
   这样 cube.js 那三个槽位（top/left/right）看到的正好是标准的 U/F/R 三面。 */
const M = [[0, 0, -1], [-1, 0, 0], [0, 1, 0]];
const Mt = M[0].map((_, j) => M.map(r => r[j]));
const ap = (m, v) => m.map(r => r[0] * v[0] + r[1] * v[1] + r[2] * v[2]);

// cube.js 的槽位 + 行列 -> 它在自己坐标系里的格位（下标）与法向
function cubePos(face, row, col) {
  if (face === 'top') return [[col, 2 - row, 2], [0, 0, 1]];
  if (face === 'left') return [[0, 2 - col, 2 - row], [-1, 0, 0]];
  return [[col, 0, 2 - row], [0, -1, 0]];              // right
}
const FACES_S = { U: [0, 1, 0], D: [0, -1, 0], F: [0, 0, 1], B: [0, 0, -1], R: [1, 0, 0], L: [-1, 0, 0] };
// 模型（位置, 法向）-> 面 + facelet 下标（行优先）
function faceletIdx(pos, n) {
  const f = Object.keys(FACES_S).find(k => FACES_S[k].every((v, i) => v === n[i]));
  const [x, y, z] = pos;
  let r, c;
  if (f === 'U') { c = x + 1; r = 1 - z; }
  else if (f === 'D') { c = x + 1; r = z + 1; }
  else if (f === 'F') { c = x + 1; r = 1 - y; }
  else if (f === 'B') { c = 1 - x; r = 1 - y; }
  else if (f === 'R') { r = 1 - y; c = 1 - z; }
  else { r = 1 - y; c = z + 1; }
  return { f: f, idx: r * 3 + c };
}
const KEY = { U: 'yellow', D: 'white', F: 'red', B: 'orange', R: 'green', L: 'blue' };

// CubeSim 状态 -> cube.js 的三面状态（top=U / left=F / right=R）
function drawerState(sim) {
  const fl = S.facelets(sim);
  const out = { top: [], left: [], right: [] };
  ['top', 'left', 'right'].forEach(slot => {
    for (let row = 0; row < 3; row++) {
      out[slot][row] = [];
      for (let col = 0; col < 3; col++) {
        const pn = cubePos(slot, row, col);
        // cube.js 下标 -> 以立方体中心为原点的模型坐标
        const pm = ap(Mt, [pn[0][0] - 1, pn[0][1] - 1, pn[0][2] - 1]).map(Math.round);
        const nm = ap(Mt, pn[1]).map(Math.round);
        const g = faceletIdx(pm, nm);
        out[slot][row][col] = KEY[fl[g.f][g.idx]];
      }
    }
  });
  return out;
}

function main() {
  const argv = process.argv.slice(2);
  const arg = k => { const i = argv.indexOf(k); return i < 0 ? null : argv[i + 1]; };
  const alg = arg('--alg');
  const hasAlg = argv.indexOf('--alg') >= 0;      // --alg "" 是「复原态」，也算给了
  const stateFile = arg('--state');
  const out = arg('--out');
  if (!out || (!hasAlg && !stateFile)) {
    console.error("用法: node tools/tutorial_geometry.js --alg \"R U R'\" --out a.json");
    process.exit(2);
  }
  let sim;
  if (stateFile) sim = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
  else sim = S.apply(S.solved(), alg || '');
  const st = drawerState(sim);
  const built = Cube.buildStickers(st, Cube.DEFAULT_CFG);
  fs.writeFileSync(out, JSON.stringify({
    size: built.size,
    cells: built.cells.map(c => ({
      fill: c.fill, frame: c.frame, sticker: c.sticker
    }))
  }));
  console.log(out + ': ' + built.cells.length + ' 格');
}

main();
