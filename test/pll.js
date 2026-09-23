/* PLL 模型校验（纯逻辑，不需要 DOM）
 *
 * 核心不变量：**颜色能从块的身份唯一反解出来**。
 * 这一条同时验证了整套颜色/旋转模型 —— 之前正是它抓出了
 * "角块可以放进棱位"这个模型级 bug（角块有 2 个侧面贴纸、棱块只有 1 个，
 * 混放会让多余的贴纸无处安放，颜色就失真了）。
 *
 * 用法: node test/pll.js
 */
const path = require('path');
const C = require(path.join(__dirname, '..', 'cube.js'));

let pass = 0, fail = 0;
const ok = (n, c, x) => { c ? pass++ : fail++; console.log((c ? '  \u2713 ' : '  \u2717 ') + n + (c ? '' : '  -> ' + x)); };

const slotIdx = id => C.PLL_SLOTS.findIndex(s => s.id === id);
function randPerm() {
  const p = C.pllDefault();
  for (let i = 0; i < 40; i++) C.pllSwap(p, Math.floor(Math.random() * 8), Math.floor(Math.random() * 8));
  return p;
}
/* 只看某槽位显示的颜色，反解这是哪一块 */
function decode(perm, si) {
  const slot = C.PLL_SLOTS[si], shown = {};
  C.pllSideStickers(perm).filter(s => s.slot === si).forEach(s => { shown[s.face] = s.color; });
  const hits = [];
  for (let h = 0; h < C.PLL_SLOTS.length; h++) {
    const home = C.PLL_SLOTS[h];
    if (home.kind !== slot.kind) continue;
    if (slot.faces.every(f => C.pllStickerColor(slot, home, f) === shown[f])) hits.push(h);
  }
  return hits;
}

console.log('[1] 颜色 <-> 块身份 必须一一对应');
{
  let bad = 0, n = 0;
  for (let t = 0; t < 400; t++) {
    const p = randPerm();
    for (let si = 0; si < 8; si++) { const h = decode(p, si); n++; if (h.length !== 1 || h[0] !== p[si]) bad++; }
  }
  ok('400 随机置换 × 8 槽位 = ' + n + ' 次反解全部唯一且正确', bad === 0, bad + ' 次失败');
}

console.log('\n[2] 角块只能进角位、棱块只能进棱位');
{
  const q = C.pllDefault();
  ok('角 <-> 棱 被拒绝', C.pllSwap(q, slotIdx('0-0'), slotIdx('0-1')) === false);
  ok('被拒后置换未变', C.pllIsHome(q));
  ok('角 <-> 角 允许', C.pllSwap(q, slotIdx('0-0'), slotIdx('2-2')) === true);
  ok('拖箭头头跨种类被拒绝', C.pllDragHead(q, slotIdx('0-0'), slotIdx('0-1')) === false);
}

console.log('\n[3] 箭头 = 这块该去哪');
{
  const q = C.pllDefault();
  C.pllSwap(q, slotIdx('2-2'), slotIdx('0-0'));       // 把 UFR 的块挪到 ULB
  const arr = C.pllArrows(q);
  ok('从当前槽位指向它的家',
    arr.length === 2 && arr.every(a => C.PLL_SLOTS[a.from].kind === 'corner'),
    JSON.stringify(arr.map(a => C.PLL_SLOTS[a.from].id + '->' + C.PLL_SLOTS[a.to].id)));
  ok('已复原时没有箭头', C.pllArrows(C.pllDefault()).length === 0);
}

console.log('\n[4] 拖箭头：拖哪一端，那一端就跟着走');
{
  let badHead = 0, badTail = 0;
  for (let t = 0; t < 400; t++) {
    const p1 = randPerm(); const a1 = C.pllArrows(p1); if (!a1.length) continue;
    const from = a1[0].from; let to = Math.floor(Math.random() * 8);
    if (to === from || !C.pllSameKind(from, to)) continue;
    C.pllDragHead(p1, from, to); if (p1[from] !== to) badHead++;
    const p2 = randPerm(); const a2 = C.pllArrows(p2); if (!a2.length) continue;
    const f2 = a2[0].from, home = p2[f2]; let t2 = Math.floor(Math.random() * 8);
    if (t2 === f2 || !C.pllSameKind(f2, t2)) continue;
    C.pllDragTail(p2, f2, t2); if (p2[t2] !== home) badTail++;
  }
  ok('拖头后箭头确实指向目标', badHead === 0, badHead + ' 次失败');
  ok('拖尾后那块确实落在目标槽位', badTail === 0, badTail + ' 次失败');
}

console.log('\n[5] 拖方块与拖箭头尾等价（两条路径同一结果）');
{
  let same = 0, total = 0;
  for (let t = 0; t < 200; t++) {
    const p1 = randPerm(), p2 = C.clonePll(p1);
    const arr = C.pllArrows(p1); if (!arr.length) continue;
    const from = arr[0].from; let to = Math.floor(Math.random() * 8);
    if (to === from || !C.pllSameKind(from, to)) continue;
    C.pllDragTail(p1, from, to); C.pllSwap(p2, from, to);
    total++; if (p1.join() === p2.join()) same++;
  }
  ok('一致（' + same + '/' + total + '）', same === total);
}

console.log('\n[6] 无论怎么操作，置换始终合法（8 个不重复的家）');
{
  let bad = 0;
  for (let t = 0; t < 400; t++) {
    const p = randPerm();
    for (let k = 0; k < 12; k++) {
      const a = Math.floor(Math.random() * 8), b = Math.floor(Math.random() * 8);
      (k % 2 ? C.pllDragHead : C.pllDragTail)(p, a, b);
    }
    if (new Set(p).size !== 8) bad++;
  }
  ok('随机操作 12 次后仍合法', bad === 0, bad + ' 次失败');
}

console.log('\n[7] 箭头端点：独占一格就落在格心，同格多端点则留缝');
{
  const c = C.PLL_CFG, pitch = c.cell + c.gap, board = 3 * pitch - c.gap, pad = c.pad * board;
  const cen = i => [pad + C.PLL_SLOTS[i].col * pitch + c.cell / 2,
                    pad + C.PLL_SLOTS[i].row * pitch + c.cell / 2];
  const off = a => [Math.hypot(a.p1[0] - cen(a.from)[0], a.p1[1] - cen(a.from)[1]),
                    Math.hypot(a.p2[0] - cen(a.to)[0], a.p2[1] - cen(a.to)[1])];

  // A. 互换 = 一根双头箭头，两端各占一格 -> 精确落在格心（0 缩进）
  const q = C.pllDefault(); C.pllSwap(q, 0, 7);
  const one = C.buildPll(q).arrows;
  ok('互换的双头箭头两端精确落在格心（没有别的端点抢）',
    one.length === 1 && off(one[0])[0] < 1e-6 && off(one[0])[1] < 1e-6,
    JSON.stringify(off(one[0]).map(v => +v.toFixed(3))));

  // B. 三循环 = 每个格心落 2 个端点（前一根的尾 + 后一根的头）->
  //    各缩 joinGap，避免头尾叠在一起
  const p = C.pllDefault(); p[0] = 2; p[2] = 7; p[7] = 0;
  const arr = C.buildPll(p).arrows;
  const want = c.cell * c.joinGap;
  const bad = arr.filter(a => off(a).some(v => Math.abs(v - want) > 1e-6));
  ok('三循环每个端点都按 joinGap(' + want + ') 缩进', arr.length === 3 && bad.length === 0,
    bad.length + ' 个端点没缩对');

  // C. 直接量"会不会紧挨着"：同一格上的任意两个端点之间必须有间隙。
  //    之前没有 joinGap 时这里会是 0 —— 前一根的圆头尾直接压在后一根的三角头上。
  const at = {};
  arr.forEach(a => {
    (at[a.from] = at[a.from] || []).push(a.p1);
    (at[a.to] = at[a.to] || []).push(a.p2);
  });
  let minD = Infinity, junction = 0;
  Object.keys(at).forEach(k => {
    const q2 = at[k];
    if (q2.length > 1) junction++;
    for (let i = 0; i < q2.length; i++) for (let j = i + 1; j < q2.length; j++) {
      minD = Math.min(minD, Math.hypot(q2[i][0] - q2[j][0], q2[i][1] - q2[j][1]));
    }
  });
  ok('每处连接（' + junction + ' 处）的两个端点都分开了，最小间距 ' + minD.toFixed(3),
    junction === 3 && minD > 0.1, '最小间距 ' + minD.toFixed(3));
}

console.log('\n[8] 互换成环 = 一根双头箭头（不是两根平行的）');
{
  let bad = 0, n = 0, heads = 0;
  for (let i = 0; i < 8; i++) for (let j = i + 1; j < 8; j++) {
    if (!C.pllSameKind(i, j)) continue;
    const p = C.pllDefault(); C.pllSwap(p, i, j);
    const arr = C.buildPll(p).arrows;
    n++;
    if (arr.length !== 1 || !arr[0].both) { bad++; continue; }
    const grp = (C.toPllSvg(p, { showColors: false })
      .match(/<g class="pllarrow"[\s\S]*?<\/g>/) || [''])[0];
    if ((grp.match(/<polygon /g) || []).length === 2) heads++;
  }
  ok('全部同类互换对（' + n + ' 对）都只画一根箭头', n > 0 && bad === 0, bad + ' 对不是');
  ok('双头箭头两端都画了头', heads === n, heads + '/' + n);
}

console.log('\n[9] 线段端点必须收在箭头头里面');
{
  // 线段用圆头端点，若和箭头尖重合，圆头会从尖外鼓出半个线宽 —— 看着"头没包住线"
  const p = C.pllDefault(); p[0] = 2; p[2] = 7; p[7] = 0;
  const svg = C.toPllSvg(p, { showColors: false });
  const grps = svg.match(/<g class="pllarrow"[\s\S]*?<\/g>/g) || [];
  const hl = C.PLL_CFG.head * C.PLL_CFG.cell;
  let bad = 0, pairs = 0;
  grps.forEach(t => {
    const m = t.match(/x1="([-\d.]+)" y1="([-\d.]+)" x2="([-\d.]+)" y2="([-\d.]+)"/);
    const pts = (t.match(/points="([^"]+)"/) || [])[1];
    if (!m || !pts) return;
    pairs++;
    const p2 = [+m[3], +m[4]];
    const tip = pts.trim().split(/\s+/)[0].split(',').map(Number);
    const d = Math.hypot(p2[0] - tip[0], p2[1] - tip[1]);
    if (d < hl * 0.5) bad++;            // 缩进不足，圆头会露出来
  });
  ok('每根箭头的线尾都缩进箭头头里（' + pairs + ' 根）', pairs === 3 && bad === 0, bad + ' 根没缩够');
}

console.log('\n[10] 二阶（2×2）：OLL / PBL');
{
  // --- OLL：2x2 只有四个角 ---
  const o = C.oll2All(true), bo = C.buildOll2(o, {});
  ok('2×2 OLL：4 格 + 8 条划线（每个角两条）',
    bo.cells.length === 4 && bo.bars.length === 8,
    bo.cells.length + ' 格 / ' + bo.bars.length + ' 线');
  ok('2×2 OLL：没有中心格（四格都能点）', bo.cells.every(c => !c.center));
  ok('2×2 OLL：点一下循环朝向，三轮回到朝上', (() => {
    const a = C.oll2All(true), v = [];
    for (let i = 0; i < 3; i++) { C.cycleOll2(a, 0, 0); v.push(a[0][0]); }
    return v.join() === '1,2,0';
  })());
  ok('2×2 OLL：全部设为未朝向 = 四角都指向侧面',
    JSON.stringify(C.oll2All(false)) === '[[1,1],[1,1]]', JSON.stringify(C.oll2All(false)));
  const so = C.toOll2Svg(o, {});
  ok('2×2 OLL 的 SVG：4 格 + 8 条线',
    (so.match(/class="cell"/g) || []).length === 4 &&
    (so.match(/<line class="bar"/g) || []).length === 8);

  // --- PBL：上下两层各 4 个角 ---
  const home = C.pbl2Default(), b0 = C.buildPbl2(home, {});
  ok('2×2 PBL：两层共 8 格（每层 2×2）',
    b0.cells.length === 8 && b0.cells.filter(c => c.layer === 'u').length === 4 &&
    b0.cells.filter(c => c.layer === 'd').length === 4);
  ok('2×2 PBL：复原态没有箭头', b0.arrows.length === 0, String(b0.arrows.length));
  const yU = Math.max.apply(null, b0.cells.filter(c => c.layer === 'u')
    .map(c => Math.max.apply(null, c.pts.map(p => p[1]))));
  const yD = Math.min.apply(null, b0.cells.filter(c => c.layer === 'd')
    .map(c => Math.min.apply(null, c.pts.map(p => p[1]))));
  ok('2×2 PBL：D 层整块排在 U 层下面（和教程那张图的排法一致）', yD > yU, yU + ' / ' + yD);
  ok('2×2 PBL：不做配色（格子不填色）', b0.cells.every(c => c.fill === 'none'));

  // 参考图那几种情况：换两块 = 一根双头箭头
  // 网格是斜的，所以"横/竖"要按倾斜后的两个基向量来判方向
  const dirOf = a => {
    const dx = a.p2[0] - a.p1[0], dy = a.p2[1] - a.p1[1], L = Math.hypot(dx, dy) || 1;
    return [dx / L, dy / L];
  };
  const unit = v => { const L = Math.hypot(v[0], v[1]) || 1; return [v[0] / L, v[1] / L]; };
  const near = (a, b) => Math.abs(a[0] - b[0]) < 0.02 && Math.abs(a[1] - b[1]) < 0.02;
  const ROW = unit(C.PBL2_SKEW.u), COL = unit(C.PBL2_SKEW.v);

  const adj = { u: [1, 0, 2, 3], d: [1, 0, 2, 3] }, ba = C.buildPbl2(adj, {});
  ok('2×2 PBL：上下层各换前两邻角 -> 两根双头箭头（沿"行"方向）',
    ba.arrows.length === 2 && ba.arrows.every(a => a.both) &&
    ba.arrows.map(a => a.layer).sort().join() === 'd,u' &&
    ba.arrows.every(a => near(dirOf(a), ROW)),
    JSON.stringify(ba.arrows.map(a => [a.layer, a.from, a.to, dirOf(a)])));
  const bd = C.buildPbl2({ u: [3, 1, 2, 0], d: [0, 1, 2, 3] }, {});
  ok('2×2 PBL：只换一对对角 -> 一根斜的双头箭头（既不沿行也不沿列）',
    bd.arrows.length === 1 && bd.arrows[0].both &&
    !near(dirOf(bd.arrows[0]), ROW) && !near(dirOf(bd.arrows[0]), COL),
    JSON.stringify(bd.arrows.map(dirOf)));
  const bv = C.buildPbl2({ u: [0, 1, 2, 3], d: [2, 1, 0, 3] }, {});
  ok('2×2 PBL：换同一列两块 -> 沿"列"方向的箭头',
    bv.arrows.length === 1 && near(dirOf(bv.arrows[0]), COL),
    JSON.stringify(bv.arrows.map(dirOf)));

  // 倾斜度可调（编辑器里那根滑条）
  const flat = C.buildPbl2(adj, { skew: 0 });
  ok('2×2 PBL：skew=0 时是正上方俯视（行方向水平）',
    flat.arrows.every(a => Math.abs(a.p1[1] - a.p2[1]) < 1e-6) &&
    Math.abs(flat.size.w - flat.size.h * 0.5) < 0.6,
    flat.size.w + 'x' + flat.size.h);
  // 两层的间距（上层的下边 -> 下层的上边）可以单独设，而且和倾斜度无关
  const layerBox = (b, layer) => {
    const ys = [];
    b.cells.filter(c => c.layer === layer).forEach(c => c.pts.forEach(p => ys.push(p[1])));
    return [Math.min.apply(null, ys), Math.max.apply(null, ys)];
  };
  [0, 0.14, 0.6].forEach(gap => {
    const b = C.buildPbl2(adj, { skew: 1, layerGap: gap });
    const u = layerBox(b, 'u'), d = layerBox(b, 'd');
    ok('2×2 PBL：间距 ' + gap + ' 格 = 上层下边到下层上边的距离',
      Math.abs((d[0] - u[1]) - gap) < 1e-6, (d[0] - u[1]).toFixed(4));
  });
  ok('2×2 PBL：间距和倾斜度无关（斜度变了间距不动）', (() => {
    const a1 = C.buildPbl2(adj, { skew: 0.2, layerGap: 0.3 });
    const a2 = C.buildPbl2(adj, { skew: 1.2, layerGap: 0.3 });
    const g1 = layerBox(a2, 'd')[0] - layerBox(a2, 'u')[1];
    const g0 = layerBox(a1, 'd')[0] - layerBox(a1, 'u')[1];
    return Math.abs(g0 - 0.3) < 1e-6 && Math.abs(g1 - 0.3) < 1e-6;
  })());

  const st1 = C.buildPbl2(adj, { skew: 1 }), st2 = C.buildPbl2(adj, { skew: 1.4 });
  ok('2×2 PBL：倾斜越大，两层叠起来越矮、越宽',
    st2.size.h < st1.size.h && st2.size.w > st1.size.w,
    JSON.stringify([st1.size, st2.size]));

  // 只动一层
  const st = C.pbl2Default();
  ok('2×2 PBL：换两块只动那一层',
    C.pbl2Swap(st, 'u', 0, 1) && st.u.join() === '1,0,2,3' && st.d.join() === '0,1,2,3',
    JSON.stringify(st));
  ok('2×2 PBL：越界的下标不动手', C.pbl2Swap(st, 'u', 0, 9) === false && st.u.join() === '1,0,2,3');
  ok('2×2 PBL：clone 是深拷贝', (() => {
    const c2 = C.pbl2Clone(st); c2.u[0] = 3; return st.u[0] === 1;
  })());

  const sp = C.toPbl2Svg(adj, {});
  ok('2×2 PBL 的 SVG：每格带 data-layer / data-slot（编辑器靠它找落点）',
    (sp.match(/<g class="cell"[^>]*data-layer="u"/g) || []).length === 4 &&
    (sp.match(/<g class="cell"[^>]*data-layer="d"/g) || []).length === 4 &&
    /data-slot="u0"/.test(sp) && /data-slot="d3"/.test(sp),
    (sp.match(/<g class="cell"[^>]*>/g) || []).slice(0, 2).join(' '));
  ok('2×2 PBL 的 SVG：互换成环画成一根双头箭头（data-both=1）',
    (sp.match(/data-both="1"/g) || []).length === 2, sp.match(/data-both="1"/g));
}

console.log('\n结果: ' + pass + ' 通过, ' + fail + ' 失败');
process.exit(fail ? 1 : 0);
