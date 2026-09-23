/* 交互校验：用极简 DOM 桩真跑 editor.html 的内联脚本。
   脚本是**实时从 editor.html 抽取**的，不存副本，避免测试和源码不同步。
   用法: node test/interaction.js                                   */
const fs = require('fs'), path = require('path'), vm = require('vm');
const Cube = require(path.join(__dirname, '..', 'cube.js'));

/* ---------------- 极简 DOM 桩 ---------------- */
const downloads = [], objectURLs = [];
function mkStyle(){ const o = {}; o.setProperty = (k, v) => { o[k] = v; }; return o; }
function mkClass(){ const s = new Set(); return {
  add:(...c)=>c.forEach(x=>s.add(x)), remove:(...c)=>c.forEach(x=>s.delete(x)),
  contains:c=>s.has(c),
  toggle:(c,f)=>{ if(f===undefined){ s.has(c)?s.delete(c):s.add(c); } else { f?s.add(c):s.delete(c); } } }; }
function El(tag){
  const e = {
    tagName:(tag||'div').toUpperCase(), children:[], dataset:{}, style:mkStyle(),
    classList:mkClass(), _html:'', _text:'', title:'', value:'', disabled:false, _ev:{},
    _attrs:{},
    // 真实 DOM 的 appendChild 是"移动"节点，桩也得这样，
    // 否则"提到最上层"这类断言测出来的是假象
    appendChild(c){
      if (c.parentNode && c.parentNode.children) {
        const i = c.parentNode.children.indexOf(c);
        if (i >= 0) c.parentNode.children.splice(i, 1);
      }
      this.children.push(c); c.parentNode = this; return c;
    },
    removeChild(c){
      const i = this.children.indexOf(c);
      if (i >= 0) this.children.splice(i, 1);
      c.parentNode = null; return c;
    },
    setAttribute(k,v){ this._attrs[k] = String(v); },
    getAttribute(k){ return Object.prototype.hasOwnProperty.call(this._attrs,k) ? this._attrs[k] : null; },
    removeAttribute(k){ delete this._attrs[k]; },
    addEventListener(t,f){ (this._ev[t]=this._ev[t]||[]).push(f); },
    querySelector(sel){
      return sel === 'svg' ? fakeSvg : El('div');   // 单例，测试才能查到挂上去的节点
    },
    closest(){ return null; },
    contains(){ return false; },
    getBoundingClientRect(){ return {left:300,top:200,width:60,height:60}; },
    getContext(){ return { fillStyle:'', drawImage(){}, fillRect(){} }; },
    toBlob(cb, mime){ cb(new Blob(['raster-bytes'], { type: mime || 'image/png' })); },
    click(){ if(this.download) downloads.push(this.download); },
    remove(){}, select(){}, focus(){},
    offsetWidth: 40, offsetHeight: 24, offsetLeft: 0, offsetTop: 0,
  };
  Object.defineProperty(e,'innerHTML',{get(){return this._html;},set(v){this._html=v;}});
  // 真实 DOM 里 textContent 会把子节点的文字拼起来，桩也得这样，
  // 否则 "按钮文字对不对" 这类断言测不出东西
  Object.defineProperty(e,'textContent',{
    get(){ return this.children.length ? this.children.map(c => c.textContent).join('') : this._text; },
    set(v){ this._text = String(v); this.children.length = 0; }
  });
  return e;
}
function Blob(parts, opts){ this.parts = parts || []; this.type = (opts||{}).type; }
const reg = {}, docEv = {};
let dropTarget = null;                 // 测试里指定"松手时指针落在哪个槽位"
/* 假的 <svg>：拖拽要把屏幕坐标换算成用户坐标（viewBox 4x4 铺满 400x400 → 1 单位 = 100px） */
const fakeSvg = El('svg');
fakeSvg._attrs.viewBox = '0 0 4 4';
fakeSvg.getBoundingClientRect = () => ({ left: 0, top: 0, width: 400, height: 400 });
const document = {
  documentElement: El('html'),          // 主题挂在 <html data-theme> 上
  elementFromPoint: () => dropTarget,
  getElementById: id => reg[id] || (reg[id] = El('div')),
  createElement: t => El(t),
  createElementNS: (ns, t) => El(t),
  addEventListener: (t,f) => { (docEv[t]=docEv[t]||[]).push(f); },
  querySelector: () => El('div'),
  body: { appendChild(){} },
};
const store = { 'cube-theme': 'dark', 'cube-zoom-v1': '1.5' };
const ctx = {
  Cube, document, console, setTimeout, clearTimeout, Blob, store,
  FileReader: function () {
    this.readAsArrayBuffer = b => {
      const src = b && b.parts && b.parts[0];
      const bytes = typeof src === 'string'
        ? Uint8Array.from(src, c => c.charCodeAt(0)) : new Uint8Array(0);
      this.result = bytes.buffer;
      if (this.onload) this.onload();       // 同上：同步触发，整条路径才测得到
    };
  },
  window:{ innerWidth:1280, innerHeight:820, addEventListener(){} },
  // 编辑器的明暗跟着全站共用的 cube-theme 走。这里模拟「用户选的是夜晚」，
  // 下面的断言都在这个前提下成立；「存档是白天」的情况由 test/links.js [15] 盯着。
  // store 会记下页面写进去的东西 —— 持久化那几条断言要读它。
  // 另外预置一个 cube-zoom-v1=1.5：验证开机时能把上次的缩放读回来。
  localStorage:{ getItem: k => (k in store ? store[k] : null),
                 setItem: (k, v) => { store[k] = String(v); },
                 removeItem: k => { delete store[k]; } },
  navigator:{}, parseFloat, parseInt, Math, JSON, Object, Array, Set, String,
  URL:{ createObjectURL(b){ objectURLs.push(b); return 'blob:fake'; }, revokeObjectURL(){} },
  // 真实 Image 的 onload 是异步的，但这里同步触发就能把整条导出路径测完
  Image: function () {
    const self = this;
    Object.defineProperty(this, 'src', {
      set(v) { self._src = v; if (self.onload) self.onload(); },
      get() { return self._src; }
    });
  },
};
ctx.globalThis = ctx;
vm.createContext(ctx);
const html = fs.readFileSync(path.join(__dirname, '..', 'editor.html'), 'utf8');
// 页面的内联脚本不止一段了（head 里还有一段「首次绘制前定主题」），
// 取最长的那段 —— 那才是主逻辑
const inline = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)]
  .map(m => m[1]).sort((a, b) => b.length - a.length)[0];
console.log('(已从 editor.html 实时抽取内联脚本 ' + inline.length + ' 字节)');

/* 桩不解析 HTML，所以把 <input> 的初始 value / checked 从真实标记里读出来灌进去。
   这样"默认文件名是 cube""默认尺寸 1080"这类断言才是有效的 ——
   如果哪天 HTML 里的默认值被改错，测试会直接挂。 */
{
  const re = /<input\b[^>]*>/g;
  let m, n = 0;
  while ((m = re.exec(html))) {
    const tag = m[0];
    const id = (tag.match(/\bid="([^"]+)"/) || [])[1];
    if (!id) continue;
    const type = (tag.match(/\btype="([^"]+)"/) || [])[1] || 'text';
    const val = (tag.match(/\bvalue="([^"]*)"/) || [])[1];
    const el = document.getElementById(id);
    if (val !== undefined) el.value = val;
    if (type === 'checkbox') el.checked = /\bchecked\b/.test(tag);
    n++;
  }
  console.log('(已从 HTML 灌入 ' + n + ' 个 input 的初始值)');
}
// #modebar 的按钮写在 HTML 里，桩也要补出来，否则模式切换没法点
{
  const mb = document.getElementById('modebar');
  const re2 = /<button data-mode="([^"]+)"/g;
  let m2;
  while ((m2 = re2.exec(html))) {
    const b = El('button');
    b.dataset.mode = m2[1];
    b.textContent = m2[1].toUpperCase();
    // 模拟真实排布：三个按钮并排、宽度一致，药丸才对得上
    b.offsetWidth = 40;
    b.offsetLeft = mb.children.length * 42;
    mb.appendChild(b);
  }
  console.log('(已补出 ' + mb.children.length + ' 个模式按钮)');
}
vm.runInContext(inline, ctx, {filename:'editor.html:inline'});

/* ---------------- 断言工具 ---------------- */
let pass = 0, fail = 0;
function check(name, cond, extra){
  if(cond){ pass++; console.log('  \u2713 ' + name); }
  else { fail++; console.log('  \u2717 ' + name + (extra !== undefined ? '  -> ' + extra : '')); }
}
const svg = () => reg['host']._html;
function fillOf(id){
  const m = svg().match(new RegExp('<g class="cell" data-id="' + id + '">[\\s\\S]*?<polygon class="sticker"[^>]*fill="(#[0-9A-Fa-f]{6})"'));
  return m ? m[1] : null;
}
const YEL='#FFE600', RED='#C00000', GRN='#00B050', GRY='#C0C0C0', WHT='#FFFFFF';
function fireClick(id){
  const g = { dataset:{id}, classList:mkClass() };
  reg['host']._ev.click[0]({ target:{ closest:s => s==='.cell' ? g : null }, preventDefault(){}, stopPropagation(){} });
}
function fireCtx(id){
  const g = { dataset:{id}, classList:mkClass() };
  reg['host']._ev.contextmenu[0]({ target:{ closest:s => s==='.cell' ? g : null }, preventDefault(){}, stopPropagation(){} });
}
function fireDot(key){
  const d = reg['ring'].children.find(x => x.dataset.key === key);
  if(!d) throw new Error('找不到色点 ' + key);
  d._ev.click[0]({ stopPropagation(){} });
}
function fireKey(key, opts){
  docEv.keydown[0](Object.assign({key, target:{tagName:'BODY'}, ctrlKey:false, shiftKey:false, metaKey:false, preventDefault(){}}, opts||{}));
}
const ringOn = () => reg['ring'].classList.contains('on');
const curDots = () => reg['ring'].children.filter(d => d.classList.contains('cur')).map(d => d.dataset.key);
/* 注意：空心格是 fill="none"，所以不能只匹配 #RRGGBB ——
   否则正则会长到下一个格子的 fill 上去，测出假的颜色 */
function ollCell(id){
  const m = svg().match(new RegExp('<g class="cell" data-id="' + id + '">[\\s\\S]*?<polygon[^>]*fill="([^"]+)"'));
  return m ? m[1] : null;
}
const lastSvgBlob = () => { const b = objectURLs[objectURLs.length-1]; return b && b.parts ? b.parts[0] : ''; };

console.log('\n[1] 初始化');
check('渲染出 27 个 cell', (svg().match(/<g class="cell"/g)||[]).length === 27);
check('色圈建了 7 个点（6 色 + 清）', reg['ring'].children.length === 7, reg['ring'].children.length);
check('色圈初始收起', !ringOn());
check('右侧已无颜色矩阵面板', !html.includes('id="mats"') && !/颜色矩阵/.test(html));

console.log('\n[2] 默认配色（逐格核对参考图）');
const EXPECT_DEFAULT = {
  top:   [[GRY,GRY,GRY], [GRY,YEL,GRY], [GRY,GRY,GRY]],
  left:  [[GRY,GRY,GRY], [RED,RED,GRY], [RED,RED,GRY]],
  right: [[GRY,GRY,GRY], [GRY,GRN,GRN], [GRY,GRN,GRN]],
};
{
  const wrong = [];
  for (const f of ['top','left','right'])
    for (let r=0;r<3;r++) for (let c=0;c<3;c++){
      const got = fillOf(`${f}-${r}-${c}`);
      if (got !== EXPECT_DEFAULT[f][r][c])
        wrong.push(`${f}-${r}-${c} 期望${EXPECT_DEFAULT[f][r][c]} 实际${got}`);
    }
  check('27 格全部与参考图一致', wrong.length === 0, wrong.join(' / '));
  check('顶面只有中心黄', fillOf('top-1-1') === YEL && fillOf('top-0-1') === GRY);
  check('左面红块在 rows1-2 / cols0-1', fillOf('left-1-0')===RED && fillOf('left-1-1')===RED &&
        fillOf('left-2-0')===RED && fillOf('left-2-1')===RED);
  check('左面 col2 保持灰', fillOf('left-1-2')===GRY && fillOf('left-2-2')===GRY);
  check('右面绿块在 rows1-2 / cols1-2', fillOf('right-1-1')===GRN && fillOf('right-1-2')===GRN &&
        fillOf('right-2-1')===GRN && fillOf('right-2-2')===GRN);
  check('右面 col0 保持灰', fillOf('right-1-0')===GRY && fillOf('right-2-0')===GRY);
}

console.log('\n[3] 点格子 -> 就地开圈');
fireClick('top-0-0');
check('色圈打开', ringOn());
check('锚点已设置', /px$/.test(reg['ring'].style.left||'') && /px$/.test(reg['ring'].style.top||''));
check('该格高亮 is-sel', /<g class="cell" data-id="top-0-0">/.test(svg()));
check('圈里标出当前色 = 灰', curDots().join() === 'gray', curDots().join());

console.log('\n[4] 选色');
fireDot('red');
check('top-0-0 变红', fillOf('top-0-0') === RED, fillOf('top-0-0'));
check('选完自动收起', !ringOn());

console.log('\n[5] 撤销 / 重做');
fireKey('z',{ctrlKey:true});
check('Ctrl+Z 撤销回灰', fillOf('top-0-0') === GRY, fillOf('top-0-0'));
fireKey('z',{ctrlKey:true,shiftKey:true});
check('Ctrl+Shift+Z 重做回红', fillOf('top-0-0') === RED, fillOf('top-0-0'));

console.log('\n[6] 右键直接清除');
fireCtx('left-1-1');
check('左面中心被清成灰', fillOf('left-1-1') === GRY, fillOf('left-1-1'));

console.log('\n[7] 收起行为');
fireClick('right-0-1'); const opened = ringOn();
fireKey('Escape'); check('Esc 收起', opened && !ringOn());
fireClick('top-1-0'); fireClick('top-1-0'); check('点同一格收起', !ringOn());
fireClick('top-1-0'); fireClick('top-1-2'); check('点别格保持打开', ringOn());
check('当前色跟随到新格（灰）', curDots().join() === 'gray', curDots().join());

console.log('\n[8] 键盘直接改选中格');
fireKey('3'); check('按 3 改成黄', fillOf('top-1-2') === YEL, fillOf('top-1-2'));
fireKey('0'); check('按 0 清除', fillOf('top-1-2') === GRY, fillOf('top-1-2'));

console.log('\n[9] 相机 / 样式 恢复默认');
reg['elev'].value = '1.20'; reg['elev']._ev.input[0]({});
reg['gap'].value = '0.28';  reg['gap']._ev.input[0]({});
reg['shading'].checked = true; reg['shading']._ev.change[0]({});
check('俯角已改到 1.20', reg['elev'].value == 1.2, reg['elev'].value);
check('边框已改到 0.28', reg['gap'].value == 0.28, reg['gap'].value);
reg['rst-cam']._ev.click[0]({});
check('相机复位后 elev 滑块回到 0.6', reg['elev'].value == 0.6, reg['elev'].value);
check('相机复位后 elev 标签同步', reg['elev-v'].textContent === '0.60', reg['elev-v'].textContent);
reg['rst-style']._ev.click[0]({});
check('样式复位后 gap 滑块回到 0.10', reg['gap'].value == 0.1, reg['gap'].value);
check('样式复位后明暗关掉', reg['shading'].checked === false);
check('相机复位不影响样式之外的？(dist 仍为默认)', reg['dist'].value == 14, reg['dist'].value);

console.log('\n[10] 导出：文件名 / 尺寸 / 预设 / 背景');
check('默认文件名是 cube', reg['exname'].value === 'cube', reg['exname'].value);
check('默认尺寸是 512', reg['exsize'].value == 512, reg['exsize'].value);
check('预设为 64/128/256/512/1024（图标 -> 网页展示）',
  reg['expresets'].children.map(b => b.textContent).join(',') === '64,128,256,512,1024',
  reg['expresets'].children.map(b => b.textContent).join(','));
check('默认尺寸命中对应预设', reg['expresets'].children[3].classList.contains('on'));
check('实时提示显示完整文件名', /cube-512x\d+\.png/.test(reg['exhint']._html || ''), reg['exhint']._html);
reg['expresets'].children[4]._ev.click[0]({});
check('点预设 1024 生效', reg['exsize'].value == 1024, reg['exsize'].value);
check('点预设后提示同步', /-1024x\d+\.png/.test(reg['exhint']._html || ''), reg['exhint']._html);
reg['expresets'].children[0]._ev.click[0]({});
check('点预设 64（小图标档）生效', reg['exsize'].value == 64, reg['exsize'].value);
check('64 档提示同步', /-64x\d+\.png/.test(reg['exhint']._html || ''), reg['exhint']._html);

reg['exname'].value = 'my-cube';
reg['exsize'].value = '2000';
reg['exbg'].checked = true;
downloads.length = 0; objectURLs.length = 0;
reg['btn-svg']._ev.click[0]({});
check('导出文件名 = 名字 + 宽x高', /^my-cube-2000x\d+\.svg$/.test(downloads[0]), downloads[0]);
{
  const s = lastSvgBlob();
  const dims = downloads[0].match(/-(\d+)x(\d+)\.svg$/);
  check('文件名里的尺寸与 SVG 宽高一致',
    dims && s.includes('width="' + dims[1] + '"') && s.includes('height="' + dims[2] + '"'),
    downloads[0] + ' vs ' + (s.match(/<svg[^>]*>/)||[''])[0].slice(0,70));
  check('SVG 宽度按尺寸写入 2000', /<svg[^>]*width="2000"/.test(s));
  check('勾了白底 -> 有背景 rect', /<rect[^>]*fill="#ffffff"/.test(s));
}
reg['exbg'].checked = false;
downloads.length = 0; objectURLs.length = 0;
reg['btn-svg']._ev.click[0]({});
check('取消白底 -> 无背景 rect', !/<rect[^>]*fill="#ffffff"/.test(lastSvgBlob()));
check('取消白底后文件名不变格式', /^my-cube-2000x\d+\.svg$/.test(downloads[0]), downloads[0]);
reg['exsize'].value = '99999';
downloads.length = 0; objectURLs.length = 0;
reg['btn-svg']._ev.click[0]({});
check('超大尺寸被夹到上限 8000', /<svg[^>]*width="8000"/.test(lastSvgBlob()), (lastSvgBlob().match(/<svg[^>]*>/)||[''])[0].slice(0,60));
check('夹住后文件名也用 8000', /^my-cube-8000x\d+\.svg$/.test(downloads[0]), downloads[0]);
reg['exsize'].value = '5';
downloads.length = 0; objectURLs.length = 0;
reg['btn-svg']._ev.click[0]({});
check('过小尺寸被夹到下限 16', /<svg[^>]*width="16"/.test(lastSvgBlob()), (lastSvgBlob().match(/<svg[^>]*>/)||[''])[0].slice(0,60));
check('夹住后文件名也用 16', /^my-cube-16x\d+\.svg$/.test(downloads[0]), downloads[0]);
reg['exsize'].value = '1200';
reg['exname'].value = 'a/b:c*d';
reg['exname']._ev.input[0]({});
check('文件名里的非法字符被替换', reg['exname'].value === 'a-b-c-d', reg['exname'].value);

console.log('\n[11] 危险操作可撤销');
reg['btn-clear']._ev.click[0]({});
check('全部清灰', fillOf('top-1-1') === GRY, fillOf('top-1-1'));
fireKey('z',{ctrlKey:true});
check('撤销恢复整盘（中心仍是黄）', fillOf('top-1-1') === YEL, fillOf('top-1-1'));
reg['btn-reset']._ev.click[0]({});
check('恢复默认配色后左面中心是红', fillOf('left-1-1') === RED, fillOf('left-1-1'));

console.log('\n[12] OLL 模式（朝向 + 边框候选线 + 配色方案）');
const mb = reg['modebar'].children;
/* OLL 实心格是**固定色**，白天夜晚一样；只有描边和候选灰跟主题走 */
const OLL_ON   = '#7E6FC7';      // 默认方案「紫」
const OLL_LINE_DARK  = '#C8D0DC';   // 夜晚描边
const OLL_LINE_LIGHT = '#1A1A1A';   // 白天描边
const OLL_GHOST = '#6E7A8A';     // 候选位灰 · 夜晚
const OLL_OFF   = 'none';        // 空心格：透明
/* sel=true 只看被选中的深色线；false 只看浅灰候选位；不传则全部 */
function bars(sel){
  return (svg().match(/<line class="bar" data-face="[A-Z]" data-cell="[\d-]+" data-sel="[01]"/g) || [])
    .filter(t => sel === undefined || t.includes('data-sel="' + (sel ? 1 : 0) + '"'))
    .map(t => t.match(/data-face="([A-Z])" data-cell="([\d-]+)"/).slice(1).join('@'))
    .sort().join(' ');
}
/* 所有划线的颜色（不管选中与否）——用来断言"整体是否透明" */
function allBarStrokes(){
  return [...new Set((svg().match(/<line class="bar"[^>]*>/g) || [])
    .map(t => (t.match(/stroke="([^"]+)"/) || [])[1]))];
}
/* 划线的浓度 —— 候选位被调淡就体现在这里 */
function barOpacities(sel){
  return [...new Set((svg().match(/<line class="bar"[^>]*>/g) || [])
    .filter(t => sel === undefined || t.includes('data-sel="' + (sel ? 1 : 0) + '"'))
    .map(t => (t.match(/opacity="([^"]+)"/) || [])[1]))];
}
/* 选中 / 浅灰 的划线分别用了什么颜色 */
function barStrokes(sel){
  return [...new Set((svg().match(/<line class="bar"[^>]*>/g) || [])
    .filter(t => t.includes('data-sel="' + (sel ? 1 : 0) + '"'))
    .map(t => (t.match(/stroke="([^"]+)"/) || [])[1]))];
}
const N_CELL = 9, N_SLOT = 12;      // 9 格；候选位 = 4 棱×1 + 4 角×2

mb[1]._ev.click[0]({});
check('OLL 标签高亮', mb[1].classList.contains('on'));
check('画出 9 个 OLL 格', (svg().match(/<g class="cell"/g) || []).length === N_CELL);
check('实心格用方案色', ollCell('oll-0-0') === OLL_ON, ollCell('oll-0-0'));
check('边框划线默认就是可见的（12 个都在）', bars(false).split(' ').length === N_SLOT, bars(false));
check('外框是灰色', barStrokes(false).join() === OLL_GHOST, barStrokes(false).join());
check('候选位被调淡（opacity ' + Cube.OLL_CFG.barDim + '），选中位更实（' + Cube.OLL_CFG.barOn + '）',
  barOpacities(false).join() === String(Cube.OLL_CFG.barDim) &&
  (bars(true) === '' || barOpacities(true).join() === String(Cube.OLL_CFG.barOn)),
  barOpacities(false).join() + ' / ' + barOpacities(true).join());
check('开关默认是开的', reg['ollbars'].checked === true);
check('OLL 配色段可见', reg['sec-oll'].style.display !== 'none');
check('OLL 下隐藏相机', reg['sec-cam'].style.display === 'none', reg['sec-cam'].style.display);
check('OLL 下隐藏样式', reg['sec-style'].style.display === 'none', reg['sec-style'].style.display);
check('恢复按钮文案切换', reg['btn-reset'].textContent === '恢复默认朝向', reg['btn-reset'].textContent);

// 棱块：2 态
fireClick('oll-0-1');
check('棱块点一下 -> 空心', ollCell('oll-0-1') === OLL_OFF, ollCell('oll-0-1'));
check('棱块点一下 -> B 位变深色', bars(true) === 'B@0-1', bars(true));
check('棱块点一下 -> 其余仍是浅灰', bars(false).split(' ').length === N_SLOT - 1, bars(false));
fireClick('oll-0-1');
check('棱块再点 -> 回到朝上', ollCell('oll-0-1') === OLL_ON && bars(true) === '', bars(true));

// 角块：3 态；选了 B 则同角的 L 变灰，反之亦然
fireClick('oll-0-0');
check('角块第 1 态 -> B 侧深色', ollCell('oll-0-0') === OLL_OFF && bars(true) === 'B@0-0', bars(true));
check('角块选 B 后，同一角的 L 仍是浅灰', bars(false).includes('L@0-0'), bars(false));
fireClick('oll-0-0');
check('角块第 2 态 -> L 侧深色', ollCell('oll-0-0') === OLL_OFF && bars(true) === 'L@0-0', bars(true));
check('角块改选 L 后，B 变回浅灰',
  !bars(true).includes('B@0-0') && bars(false).includes('B@0-0'), bars(false));
fireClick('oll-0-0');
check('角块第 3 态 -> 回到朝上', ollCell('oll-0-0') === OLL_ON && bars(true) === '', bars(true));

fireClick('oll-1-1');
check('中心块点不动', ollCell('oll-1-1') === OLL_ON && bars(true) === '', bars(true));

// 点格子循环：角块三态走一遍
fireClick('oll-0-2');
check('角块点第 1 下 -> B 侧', ollCell('oll-0-2') === OLL_OFF && bars(true) === 'B@0-2', bars(true));
fireClick('oll-0-2');
check('角块点第 2 下 -> R 侧，B 变浅灰',
  bars(true) === 'R@0-2' && bars(false).includes('B@0-2'), bars(true) + ' | ' + bars(false));
fireClick('oll-0-2');
check('角块点第 3 下 -> 回到朝上', ollCell('oll-0-2') === OLL_ON && bars(true) === '', bars(true));

// 棱块两态
fireClick('oll-1-0');
check('棱块点一下 -> L 侧', bars(true) === 'L@1-0', bars(true));

// 右键设回朝上
reg['host']._ev.contextmenu[0]({ target:{ closest:x => x==='.cell' ? {dataset:{id:'oll-1-0'},classList:mkClass()} : null },
                                 preventDefault(){}, stopPropagation(){} });
check('右键 -> 设回朝上', ollCell('oll-1-0') === OLL_ON && bars(true) === '', bars(true));

// 锁住这次修的两个 bug
// 关掉开关应该回到全透明
reg['ollbars'].checked = false; reg['ollbars']._ev.change[0]({});
check('关掉开关 -> 全部透明', allBarStrokes().join() === 'transparent', allBarStrokes().join());
reg['ollbars'].checked = true; reg['ollbars']._ev.change[0]({});

check('空心格整块可点（pointer-events=all）',
  /<polygon class="sticker" pointer-events="all"/.test(svg()));
check('边框线不再抢点击（没有 barhit，且 bar 自身 pointer-events:none）',
  !/barhit/.test(svg()) && /class="bar"[^>]*pointer-events="none"/.test(svg()));

// 复刻参考图的 OLL 7：深色线 5 条，位置逐条一致
reg['btn-reset']._ev.click[0]({});
fireClick('oll-0-0');                        // ULB -> B
fireClick('oll-0-2'); fireClick('oll-0-2');  // UBR -> R
fireClick('oll-1-2');                        // UR  -> R
fireClick('oll-2-1');                        // UF  -> F
fireClick('oll-2-2');                        // UFR -> F
check('OLL 7 图形 = 空实空/实实空/实空空',
  ollCell('oll-0-0') === OLL_OFF && ollCell('oll-0-1') === OLL_ON && ollCell('oll-0-2') === OLL_OFF &&
  ollCell('oll-1-0') === OLL_ON && ollCell('oll-1-1') === OLL_ON && ollCell('oll-1-2') === OLL_OFF &&
  ollCell('oll-2-0') === OLL_ON && ollCell('oll-2-1') === OLL_OFF && ollCell('oll-2-2') === OLL_OFF);
check('OLL 7 选中线与参考图逐条一致（5 条）',
  bars(true) === 'B@0-0 F@2-1 F@2-2 R@0-2 R@1-2', bars(true));
check('选中划线颜色 = 方块涂色',
  barStrokes(true).join() === OLL_ON, barStrokes(true).join());
check('浅灰位不受影响', barStrokes(false).join() === OLL_GHOST, barStrokes(false).join());
check('OLL 7 另外 7 个候选位保持浅灰',
  bars(false).split(' ').length === N_SLOT - 5 && !/B@0-0|F@2-1|F@2-2|R@0-2|R@1-2/.test(bars(false)), bars(false));

// 配色方案
/* 按 key 找色卡：以前写的是下标，删掉一个方案后全部错位，
   结果"切到黄色"实际切到了深紫。 */
const schemeBtn = key => reg['schemes'].children.find(b => b.dataset.key === key);
check('色卡数量与方案数一致', reg['schemes'].children.length === Cube.OLL_SCHEMES.length,
  reg['schemes'].children.length + ' vs ' + Cube.OLL_SCHEMES.length);
check('默认方案高亮的是 ' + Cube.OLL_DEFAULT_SCHEME,
  schemeBtn(Cube.OLL_DEFAULT_SCHEME).classList.contains('on'));
// 色卡必须真有颜色，而且要跟 OLL_SCHEMES 这个源头对得上 ——
// 之前方案字段从 on 改成 day/night 时这里读的是旧字段，取到 undefined，
// 六个色卡全成了空白框，而当时的测试只看 .on class，完全没发现。
check('六个色卡都设了真实颜色',
  Cube.OLL_SCHEMES.every((sc, i) => /^#[0-9A-Fa-f]{6}$/.test(reg['schemes'].children[i].style.background || '')),
  reg['schemes'].children.map(b => b.style.background).join(' '));
check('色卡颜色 = 方案的固定色',
  Cube.OLL_SCHEMES.every((sc, i) => reg['schemes'].children[i].style.background === sc.on),
  reg['schemes'].children.map(b => b.style.background).join(' '));
check('F2L / OLL / PLL 用的黄色是同一个',
  Cube.HEX.yellow === Cube.OLL_SCHEMES.filter(sc => sc.key === 'yellow')[0].on &&
  Cube.HEX.yellow === Cube.PLL_FACE_COLORS.U,
  'F2L ' + Cube.HEX.yellow +
  ' / OLL ' + Cube.OLL_SCHEMES.filter(sc => sc.key === 'yellow')[0].on +
  ' / PLL ' + Cube.PLL_FACE_COLORS.U);
check('已无「石板」方案（和默认色太接近）',
  !Cube.OLL_SCHEMES.some(sc => sc.zh === '石板'), Cube.OLL_SCHEMES.map(sc => sc.zh).join(','));
check('色卡不放文字（名字只在悬停提示里）',
  reg['schemes'].children.every(b => !b.textContent), reg['schemes'].children.map(b => b.textContent).join('|'));
check('悬停提示是方案名',
  Cube.OLL_SCHEMES.every((sc, i) => reg['schemes'].children[i].title === sc.zh),
  reg['schemes'].children.map(b => b.title).join(' '));
schemeBtn('yellow')._ev.click[0]({});
check('切到黄色方案后实心格变黄',
  ollCell('oll-1-1') === Cube.OLL_SCHEMES.filter(sc => sc.key === 'yellow')[0].on,
  ollCell('oll-1-1'));
check('切方案不影响线的位置', bars(true) === 'B@0-0 F@2-1 F@2-2 R@0-2 R@1-2', bars(true));
check('换配色后选中划线跟着变（黄）',
  barStrokes(true).join() === Cube.OLL_SCHEMES.filter(sc => sc.key === 'yellow')[0].on,
  barStrokes(true).join());
check('浅灰候选位不跟着变', barStrokes(false).join() === OLL_GHOST, barStrokes(false).join());
schemeBtn(Cube.OLL_DEFAULT_SCHEME)._ev.click[0]({});
check('切回默认方案', ollCell('oll-1-1') === OLL_ON, ollCell('oll-1-1'));

fireKey('z', {ctrlKey:true});
check('OLL 也能撤销（回退最后一步 2-2）', ollCell('oll-2-2') === OLL_ON, ollCell('oll-2-2'));
fireKey('z', {ctrlKey:true, shiftKey:true});
check('OLL 也能重做', ollCell('oll-2-2') === OLL_OFF, ollCell('oll-2-2'));

reg['exname'].value = 'oll-case'; reg['exsize'].value = '256';
downloads.length = 0; objectURLs.length = 0;
reg['btn-svg']._ev.click[0]({});
check('OLL 导出文件名带尺寸', /^oll-case-256x\d+\.svg$/.test(downloads[0]), downloads[0]);
check('OLL 导出的 SVG 含 9 格 + 12 个候选位',
  (lastSvgBlob().match(/<g class="cell"/g) || []).length === N_CELL &&
  (lastSvgBlob().match(/<line class="bar"/g) || []).length === N_SLOT,
  (lastSvgBlob().match(/<line class="bar"/g) || []).length + ' bars');

// 导出白底时应自动用"白天"那套墨，否则浅墨画在白底上看不见
reg['exbg'].checked = true;  reg['exsize'].value = '256';
downloads.length = 0; objectURLs.length = 0;
reg['btn-svg']._ev.click[0]({});
check('白底导出 -> 描边用深色', new RegExp('stroke="' + OLL_LINE_LIGHT + '"').test(lastSvgBlob()));
check('白底导出 -> 实心格仍是方案色', /fill="#7E6FC7"/.test(lastSvgBlob()));
reg['exbg'].checked = false;
downloads.length = 0; objectURLs.length = 0;
reg['btn-svg']._ev.click[0]({});
check('透明底导出（夜晚）-> 描边用浅色', new RegExp('stroke="' + OLL_LINE_DARK + '"').test(lastSvgBlob()));
check('透明底导出 -> 实心格还是同一个方案色', /fill="#7E6FC7"/.test(lastSvgBlob()));

console.log('\n[13] 白天 / 夜晚模式');
check('存档是夜晚时用夜晚（编辑器以前无视存档，永远是深色）',
  document.documentElement.dataset.theme === 'dark', document.documentElement.dataset.theme);
check('按钮不放文字，只有图标', !/[\u4e00-\u9fa5]/.test(reg['themebtn'].textContent || ''));
check('夜晚模式：页面只管 data-theme，不再自己往按钮里塞图标',
  document.documentElement.dataset.theme === 'dark' &&
  !/[\u2600\u263e]/.test(reg['themebtn']._html || ''),
  reg['themebtn']._html);
check('按钮有 tooltip 说明', /白天/.test(reg['themebtn'].title), reg['themebtn'].title);
reg['themebtn']._ev.click[0]({});
check('切到白天', document.documentElement.dataset.theme === 'light', document.documentElement.dataset.theme);
check('白天：色卡颜色不变（固定色）',
  Cube.OLL_SCHEMES.every((sc, i) => reg['schemes'].children[i].style.background === sc.on),
  reg['schemes'].children.map(b => b.style.background).join(' '));
check('白天模式：页面同样不碰按钮内容（图标由 nav.js 统一注入）',
  document.documentElement.dataset.theme === 'light' &&
  !/[\u2600\u263e]/.test(reg['themebtn']._html || ''),
  reg['themebtn']._html);
check('白天 tooltip 指向夜晚', /夜晚/.test(reg['themebtn'].title), reg['themebtn'].title);
check('白天：实心格和夜晚同色（这就是本次要修的）',
  ollCell('oll-1-1') === OLL_ON, ollCell('oll-1-1'));
check('白天：选中划线也是同一个方案色', barStrokes(true).join() === OLL_ON, barStrokes(true).join());
check('白天：描边换成深色', /stroke="#1A1A1A"/.test(svg()));
check('白天：候选位外框换成浅灰', barStrokes(false).join() === '#B9C0CA', barStrokes(false).join());
check('空心格始终透明', ollCell('oll-0-0') === OLL_OFF, ollCell('oll-0-0'));
reg['themebtn']._ev.click[0]({});
check('切回夜晚', document.documentElement.dataset.theme === 'dark');
check('切回后实心格不变（仍同色）', ollCell('oll-1-1') === OLL_ON, ollCell('oll-1-1'));

console.log('\n[14] PLL 模式');
const mb3 = reg['modebar'].children;
const pllCells = () => (svg().match(/<g class="cell"/g) || []).length;
const pllBars = () => (svg().match(/class="pllbar"/g) || []).length;
const pllArrows = () => (svg().match(/class="pllarrow"/g) || []).length;
const pllArrowSet = () => (svg().match(/<g class="pllarrow" data-from="([\d-]+)" data-to="([\d-]+)"/g) || [])
  .map(t => t.match(/data-from="([\d-]+)" data-to="([\d-]+)"/).slice(1).join('->')).sort().join(' ');

/* 槽位中心 -> 屏幕坐标（桩里 viewBox 0 0 4 4 铺满 400x400，所以 1 用户单位 = 100px） */
function slotClient(id){
  const c = Cube.PLL_CFG, pitch = c.cell + c.gap;
  const i = Cube.PLL_SLOT_BY_ID[id];
  if (i === undefined) return { x: 200, y: 200 };   // 中心格不是槽位，给个中间值就行
  const sl = Cube.PLL_SLOTS[i];
  return { x: (c.pad + sl.col * pitch + c.cell / 2) * 100,
           y: (c.pad + sl.row * pitch + c.cell / 2) * 100 };
}
function fireDown(opts){
  const t = { closest: sel => (sel === '.cell' && opts.cell) ? opts.cell : null };
  const p = opts.at || { x: 0, y: 0 };
  reg['host']._ev.pointerdown[0]({ target: t, preventDefault(){},
                                   clientX: p.x, clientY: p.y, pointerId: 1 });
}
function fireMove(x, y){
  reg['host']._ev.pointermove[0]({ clientX: x, clientY: y });
}
function fireUp(slotId){
  dropTarget = slotId ? { dataset: { slot: slotId } } : null;
  reg['host']._ev.pointerup[0]({ clientX: 0, clientY: 0 });
}
function dragPiece(fromId, toId){
  fireDown({ cell: { dataset: { slot: fromId }, classList: mkClass() }, at: slotClient(fromId) });
  fireUp(toId);
}
/* 箭头用的颜色（线） */
function arrowColors(){
  return [...new Set((svg().match(/<g class="pllarrow"[\s\S]*?<\/g>/g) || [])
    .map(t => (t.match(/stroke="([^"]+)"/) || [])[1]))];
}

mb3[2]._ev.click[0]({});
check('PLL 标签高亮', mb3[2].classList.contains('on'));
check('画出 9 格网格', pllCells() === 9);
check('侧面颜色 12 条划线', pllBars() === 12);
check('已复原时没有箭头', pllArrows() === 0);
check('PLL 段可见', reg['sec-pll'].style.display !== 'none');
check('PLL 下隐藏 OLL 配色', reg['sec-oll'].style.display === 'none');
check('PLL 下隐藏相机/样式', reg['sec-cam'].style.display === 'none' && reg['sec-style'].style.display === 'none');
check('还原按钮文案', reg['btn-reset'].textContent === '还原为已复原', reg['btn-reset'].textContent);
check('「全部清除」在 PLL 下隐藏', reg['btn-clear'].style.display === 'none');
check('导出按钮变成 PNG/SVG/JPEG/ICO',
  ['btn-png', 'btn-svg', 'btn-jpg', 'btn-ico'].every(id => reg[id]) &&
  !reg['btn-copy-json'] && !reg['btn-copy-py'],
  Object.keys(reg).filter(k => /^btn-/.test(k)).join(','));

// —— 抓起来跟着走：这是"拖拽感"的核心 ——
const svgFake = El('svg');
const grabbed = El('g'); grabbed.dataset.slot = '2-2';
svgFake.appendChild(grabbed);
svgFake.appendChild(El('g'));            // 后面再挂一个，才测得出"提到最上层"
const c22 = slotClient('2-2');
fireDown({ cell: grabbed, at: c22 });
check('按下立刻抓住（标记 dragging）', grabbed.classList.contains('dragging'));
check('抓住的格子在 DOM 里被提到最后（画在最上层）',
  grabbed.parentNode && grabbed.parentNode.children.indexOf(grabbed) === grabbed.parentNode.children.length - 1);
fireMove(c22.x + 115, c22.y + 230);        // 往右下拖 1.15 / 2.30 用户单位
check('方块跟着指针走（写了 transform）',
  /^translate\(1\.150,2\.300\)$/.test(grabbed.getAttribute('transform') || ''),
  grabbed.getAttribute('transform'));
check('松开前不会改数据', pllArrows() === 0, pllArrows());
fireUp('1-0');                              // 角块 -> 棱位，非法
check('非法落点：方块回原位、数据不变',
  grabbed.getAttribute('transform') === null && pllArrows() === 0 && !grabbed.classList.contains('dragging'));

// 拖方块：两个角块对调
dragPiece('2-0', '0-2');
check('拖方块后出现 1 根箭头', pllArrows() === 1, pllArrows());
check('互换画成一根双头箭头（不是两根平行的）',
  /data-both="1"/.test(svg()) && pllArrowSet() === '0-2->2-0', pllArrowSet());
check('双头箭头两端都有头（2 个三角）',
  (svg().match(/<g class="pllarrow"[\s\S]*?<\/g>/)[0].match(/<polygon /g) || []).length === 2);

// —— 箭头颜色：和 OLL 配色同一套色卡 ——
const acEls = reg['arrowcolors'].children;
check('箭头默认是深紫 #4C4263', arrowColors().join() === '#4C4263', arrowColors().join());
check('箭头颜色色卡数量与预设一致', acEls.length === Cube.PLL_ARROW_COLORS.length,
  acEls.length + ' vs ' + Cube.PLL_ARROW_COLORS.length);
check('每张色卡都用了预设色',
  Cube.PLL_ARROW_COLORS.every((c, i) => acEls[i].style.background === c.on),
  acEls.map(b => b.style.background).join(' '));
check('色卡同样不放文字，名字在悬停提示里',
  acEls.every(b => !b.textContent) &&
  Cube.PLL_ARROW_COLORS.every((c, i) => acEls[i].title === c.zh));
check('默认高亮的是深紫那张', acEls[0].classList.contains('on'));
{
  const ink = Cube.PLL_ARROW_COLORS.findIndex(c => c.key === 'ink');
  acEls[ink]._ev.click[0]({});
  check('点色卡 -> 箭头颜色立刻变', arrowColors().join() === '#1A1A1A', arrowColors().join());
  check('高亮跟着换（同一时刻只有一张亮）',
    acEls[ink].classList.contains('on') && !acEls[0].classList.contains('on'),
    acEls.map(b => b.classList.contains('on') ? '1' : '0').join(''));
  acEls[0]._ev.click[0]({});            // 切回深紫
  check('切回深紫', arrowColors().join() === '#4C4263', arrowColors().join());
}

// —— 配色段的改动 ——
check('段名已从「OLL 配色」改为「配色」',
  /<h2>配色<\/h2>/.test(html) && !/<h2>OLL 配色<\/h2>/.test(html));
check('配色色卡不含文字',
  Cube.OLL_SCHEMES.every((sc, i) => !reg['schemes'].children[i].textContent));

// —— 拖拽：只拖方块 ——
check('拖方块就能改排列（不需要切模式）', pllArrows() === 1, pllArrows());

fm: {
  // 同类约束
  const before = pllArrowSet();
  dragPiece('0-0', '0-1');            // 角块 -> 棱位，应被拒
  check('角块拖进棱位被拒绝', pllArrowSet() === before, pllArrowSet());
  fireDown({ cell: El('g'), at: { x: 200, y: 200 } });   // 中心格没有 data-slot
  fireUp('0-0');
  check('中心格拖不动', pllArrowSet() === before, pllArrowSet());
  break fm;
}

// 显示开关
const arrowsBefore = pllArrows();
reg['pllcolor'].checked = false; reg['pllcolor']._ev.change[0]({});
check('关掉颜色 -> 划线消失', pllBars() === 0, pllBars());
check('关掉颜色 -> 箭头还在', pllArrows() === arrowsBefore, pllArrows());
check('关掉颜色 -> 格子不填色', !/fill="#FFE600"/.test(svg()));
reg['pllcolor'].checked = true; reg['pllcolor']._ev.change[0]({});
check('打开颜色 -> 划线回来', pllBars() === 12, pllBars());

// 撤销 / 还原
fireKey('z', {ctrlKey:true});
check('PLL 能撤销', pllArrowSet() !== '2-0->0-0', pllArrowSet());
reg['btn-reset']._ev.click[0]({});
check('还原为已复原 -> 没有箭头', pllArrows() === 0, pllArrows());

// 导出
dragPiece('2-2', '0-0');
reg['exname'].value = 'pll-case'; reg['exsize'].value = '512'; reg['exbg'].checked = true;
downloads.length = 0; objectURLs.length = 0;
reg['btn-svg']._ev.click[0]({});
check('PLL 导出文件名带尺寸', /^pll-case-512x\d+\.svg$/.test(downloads[0]), downloads[0]);
check('导出的 SVG 含网格 + 划线 + 箭头',
  (lastSvgBlob().match(/<g class="cell"/g) || []).length === 9 &&
  (lastSvgBlob().match(/class="pllbar"/g) || []).length === 12 &&
  (lastSvgBlob().match(/class="pllarrow"/g) || []).length >= 1);

// —— JPEG / ICO ——
{
  reg['exname'].value = 'icon'; reg['exsize'].value = '256';
  reg['exbg'].checked = false;               // JPEG 不支持透明，应忽略这个开关强制白底
  downloads.length = 0; objectURLs.length = 0;
  reg['btn-jpg']._ev.click[0]({});
  check('JPEG 文件名带尺寸', /^icon-256x\d+\.jpg$/.test(downloads[0]), downloads[0]);
  check('JPEG 用 image/jpeg 编码',
    objectURLs.some(b => b && b.type === 'image/jpeg'),
    objectURLs.map(b => b && b.type).join(','));
  check('SVG 原始字节仍按 svg 生成（喂给光栅化用）',
    objectURLs.some(b => b && b.type === 'image/svg+xml;charset=utf-8'));

  downloads.length = 0; objectURLs.length = 0;
  reg['btn-ico']._ev.click[0]({});
  check('ICO 文件名带尺寸', /^icon-256x\d+\.ico$/.test(downloads[0]), downloads[0]);
  const ico = objectURLs.find(b => b && b.type === 'image/x-icon');
  check('ICO 用 image/x-icon', !!ico);
  if (ico) {
    const head = ico.parts[0], dv = new DataView(head.buffer);
    const png = ico.parts[1];
    check('ICO 目录头正确（reserved=0 / type=1 / count=1）',
      dv.getUint16(0, true) === 0 && dv.getUint16(2, true) === 1 && dv.getUint16(4, true) === 1);
    check('ICO 尺寸记 256（256 在 ICO 里写作 0）',
      head[6] === 0 && head[7] === 0 && dv.getUint16(12, true) === 32 && dv.getUint16(10, true) === 1);
    check('ICO 负载长度与偏移对得上',
      dv.getUint32(14, true) === png.length && dv.getUint32(18, true) === 22 && png.length > 0,
      dv.getUint32(14, true) + ' vs ' + png.length);
  }

  // 尺寸封顶：图标超过 256 没意义
  reg['exsize'].value = '1024';
  downloads.length = 0; objectURLs.length = 0;
  reg['btn-ico']._ev.click[0]({});
  check('ICO 尺寸封顶到 256', /^icon-256x\d+\.ico$/.test(downloads[0]), downloads[0]);

  // 恢复
  reg['exname'].value = 'cube'; reg['exsize'].value = '512'; reg['exbg'].checked = true;
}

// —— 「白色背景」开关对四种格式的影响 ——
// ICO 是 32 位带 alpha 的，支持透明，所以必须尊重这个开关；
// 只有 JPEG 需要强制白底（它根本没有 alpha 通道）。
{
  const svgFed = () => {
    const b = objectURLs.find(x => x && x.type === 'image/svg+xml;charset=utf-8');
    return b ? b.parts[0] : '';
  };
  const hasBg = () => /fill="#ffffff"/.test(svgFed());
  const run = id => { downloads.length = 0; objectURLs.length = 0; reg[id]._ev.click[0]({}); };
  reg['exname'].value = 'bg'; reg['exsize'].value = '256';

  reg['exbg'].checked = false;
  run('btn-svg'); check('不勾白底：SVG 没有背景矩形', !hasBg());
  run('btn-png'); check('不勾白底：PNG 没有背景矩形', !hasBg());
  run('btn-ico'); check('不勾白底：ICO 也没有背景矩形（它支持透明，不该被强制）', !hasBg());
  run('btn-jpg'); check('不勾白底：JPEG 仍强制白底（没有 alpha 通道）', hasBg());

  reg['exbg'].checked = true;
  run('btn-ico'); check('勾上白底：ICO 才有背景矩形', hasBg());
  run('btn-png'); check('勾上白底：PNG 有背景矩形', hasBg());

  reg['exname'].value = 'cube'; reg['exsize'].value = '512';
}

// —— 网页图标 ——
{
  const m = html.match(/<link[^>]*rel="icon"[^>]*>/);
  check('页面声明了 favicon', !!m, m ? m[0] : '没有 <link rel="icon">');
  if (m) {
    const href = (m[0].match(/href="([^"]+)"/) || [])[1];
    check('favicon 指向目录下的 .ico', /\.ico$/.test(href || ''), href);
    check('favicon 文件确实存在',
      fs.existsSync(path.join(__dirname, '..', href)), href);
  }
}

// —— 操作区的排版 ——
// btns 是两列网格；如果有按钮带跨列的类，它前面的按钮右边会空一格，
// 后面的按钮被挤到下一行。所以网格里那四个必须是普通 act；
// 「参数恢复默认」是另起一行的整行按钮（act wide），它在网格外面。
{
  const sec = html.match(/<h2>操作<\/h2>[\s\S]*?<\/section>/);
  check('找得到操作区', !!sec);
  if (sec) {
    const grid = (sec[0].match(/<div class="btns">([\s\S]*?)<\/div>/) || [])[1] || '';
    const btns = grid.match(/<button[^>]*>/g) || [];
    check('网格里是 4 个按钮', btns.length === 4, btns.length + ' 个');
    check('网格里四个按钮都只带 act（没有跨列独占整行的）',
      btns.every(t => (t.match(/class="([^"]*)"/) || [])[1] === 'act'),
      btns.map(t => (t.match(/class="([^"]*)"/) || [])[1]).join(' | '));
    check('按钮顺序：恢复 / 清除 / 撤销 / 重做',
      ['btn-reset', 'btn-clear', 'btn-undo', 'btn-redo'].every((id, i) => btns[i].includes(id)),
      btns.map(t => (t.match(/id="([^"]*)"/) || [])[1]).join(','));
    check('网格外面还有整行的「参数恢复默认」', /id="btn-params"/.test(sec[0]) &&
      /class="act wide"/.test(sec[0]) && /button\.act\.wide\{width:100%/.test(html));
  }
}

console.log('\n[15] 模式互不干扰');
mb[0]._ev.click[0]({});
check('切回 F2L 是 3D 视图（27 格）', (svg().match(/<g class="cell"/g) || []).length === 27);
check('F2L 下相机恢复显示', reg['sec-cam'].style.display !== 'none', reg['sec-cam'].style.display);
check('F2L 下样式恢复显示', reg['sec-style'].style.display !== 'none', reg['sec-style'].style.display);
check('F2L 下隐藏 OLL 配色段', reg['sec-oll'].style.display === 'none', reg['sec-oll'].style.display);
check('F2L 配色没被 OLL 改动影响', fillOf('top-1-1') === YEL, fillOf('top-1-1'));
mb[1]._ev.click[0]({});
check('切回 OLL 朝向保留（仍是完整 OLL 7）',
  ollCell('oll-0-0') === OLL_OFF && bars(true) === 'B@0-0 F@2-1 F@2-2 R@0-2 R@1-2', bars(true));
mb[0]._ev.click[0]({});


/* ---------------- 放大缩小 + 模式持久化 ---------------- */
{
  // 这三个键必须挂在画布容器里：absolute 定位相对的是最近的定位祖先，
  // 挂到外面就会相对窗口算，直接盖到右边面板上
  check('缩放的三个键在画布容器里（不在右侧面板上）',
    html.indexOf('class="zoom"') > html.indexOf('class="stage-inner"') &&
    html.indexOf('class="zoom"') < html.indexOf('class="hint"'));
  check('画布上有放大 / 缩小 / 恢复默认大小三个键',
    !!reg['zin'] && !!reg['zout'] && !!reg['zreset'] &&
    /<div class="zoom">[\s\S]*?id="zin"[\s\S]*?id="zout"[\s\S]*?id="zreset"/.test(html));
  check('三个键都是无边框的图标键（不是实心方按钮）',
    /\.zoom button\{[^}]*border:0;background:none/.test(html) &&
    /\.zoom button svg\{[^}]*stroke:currentColor/.test(html));
  // 缩放值写在 #host 的 CSS 变量上：render() 会整个换掉 svg，写在 svg 上会被冲掉
  check('缩放挂在 #host 的 --zoom 上，svg 只是 scale 它',
    /#host svg\{[^}]*transform:scale\(var\(--zoom,1\)\)/.test(html) &&
    /function applyZoom\(\) \{ host\.style\.setProperty\('--zoom', zoom\); \}/.test(html));
  // 桩里预置了 cube-zoom-v1=1.5，开机应当读回来
  check('开机读回上次的缩放（存档 1.5×）',
    reg['host'].style['--zoom'] === 1.5, String(reg['host'].style['--zoom']));

  const wheel = d => reg['stage']._ev.wheel[0]({ deltaY: d, preventDefault(){} });
  wheel(-100);
  check('画布上滚轮向上 = 放大', reg['host'].style['--zoom'] > 1.5, String(reg['host'].style['--zoom']));
  for (let i = 0; i < 6; i++) wheel(100);
  check('滚轮向下 = 缩小', reg['host'].style['--zoom'] < 1.5, String(reg['host'].style['--zoom']));

  reg['zreset']._ev.click[0]({});
  check('点「恢复默认大小」回到 100%', reg['host'].style['--zoom'] === 1, String(reg['host'].style['--zoom']));
  check('已经是 100% 时这个键置灰', reg['zreset'].disabled === true);
  reg['zreset'].disabled = false;
  reg['zin']._ev.click[0]({});
  check('放大后恢复键重新可用', reg['zreset'].disabled === false);
  check('缩放写进存档（三页共用一个键）',
    Math.abs(parseFloat(store['cube-zoom-v1']) - 1.25) < 0.001, store['cube-zoom-v1']);
  check('放大到顶 / 缩到底会置灰对应那颗键',
    /getElementById\('zin'\)\.disabled = zoom >= ZMAX - 0\.001/.test(html) &&
    /getElementById\('zout'\)\.disabled = zoom <= ZMIN \+ 0\.001/.test(html));

  // 模式持久化：切一下就写进编辑器自己的存档，开机再从存档读
  mb[2]._ev.click[0]({});                       // PLL
  check('切模式写进 cube-editor-v1',
    (JSON.parse(store['cube-editor-v1'] || '{}') || {}).mode === 'pll', store['cube-editor-v1']);
  check('开机用的是存档里的模式（不是写死 f2l）',
    /setMode\(savedMode\(savedEditor\), false\)/.test(html) &&
    /function savedMode\(d\)/.test(html) && /function loadEditor\(\)/.test(html));
  mb[0]._ev.click[0]({});                       // 切回 F2L，别影响后面的收尾
  check('切回去也写存档',
    (JSON.parse(store['cube-editor-v1'] || '{}') || {}).mode === 'f2l', store['cube-editor-v1']);
}


/* ---------------- 二阶模式（2×2 OLL / 2×2 PBL） ---------------- */
{
  check('模式条有五个按钮（F2L / OLL / PLL / 2×2 OLL / 2×2 PBL）',
    mb.length === 5 && mb.map(b => b.dataset.mode).join() === 'f2l,oll,pll,oll2,pbl2',
    mb.map(b => b.dataset.mode).join());
  check('模式条竖排（五个按钮一列）',
    /\.modebar\{[^}]*flex-direction:column/.test(html));

  // 切到 2×2 OLL：4 格 + 8 条划线，点格子循环朝向
  mb[3]._ev.click[0]({});
  const count = (re) => (svg().match(re) || []).length;
  check('2×2 OLL：画 4 格', count(/class="cell"/g) === 4, count(/class="cell"/g));
  check('2×2 OLL：8 条侧面划线', count(/<line class="bar"/g) === 8, count(/<line class="bar"/g));
  check('2×2 OLL：这一节显示 OLL 的配色 / 划线选项',
    reg['sec-oll'].style.display !== 'none' && reg['sec-pll'].style.display === 'none');
  {
    // 这里不能直接用 fillOf：空心格的 fill 是 "none"，那个正则找不到就会
    // 顺着往下匹配到**下一格**的色值。按 </g> 截出这一格再看它的 fill。
    const cellFill = id => {
      const m = svg().match(new RegExp('<g class="cell" data-id="' + id + '">([\\s\\S]*?)</g>'));
      const f = m && m[1].match(/<polygon class="sticker"[^>]*fill="([^"]+)"/);
      return f ? f[1] : null;
    };
    const before = cellFill('oll-0-0');
    fireClick('oll-0-0');
    check('2×2 OLL：点格子把这一角翻到侧面（实心 -> 空心）',
      cellFill('oll-0-0') === 'none' && before !== 'none',
      before + ' -> ' + cellFill('oll-0-0'));
    fireCtx('oll-0-0');
    check('2×2 OLL：右键设回朝上', cellFill('oll-0-0') === before, cellFill('oll-0-0'));
  }

  // 切到 2×2 PBL：上下两层各 4 格；拖同一层的两块 = 对调
  mb[4]._ev.click[0]({});
  check('2×2 PBL：画两层共 8 格',
    count(/<g class="cell"/g) === 8 &&
    count(/<g class="cell"[^>]*data-layer="u"/g) === 4 &&
    count(/<g class="cell"[^>]*data-layer="d"/g) === 4,
    count(/<g class="cell"/g));
  check('2×2 PBL：复原态没有箭头', count(/class="pllarrow"/g) === 0);
  check('2×2 PBL：这一节只留"箭头颜色"（不做配色）',
    reg['sec-pll'].style.display !== 'none' &&
    reg['h-pllcolor'].style.display === 'none' &&
    reg['pllcolor-row'].style.display === 'none' &&
    reg['sec-oll'].style.display === 'none');
  check('2×2 PBL：提示改成拖同一层的两块',
    /同一层/.test(reg['hint']._html || ''), reg['hint']._html);
  check('2×2 PBL：清除键藏起来（清理不了"换位"）', reg['btn-clear'].style.display === 'none');
  // 同一层换两块 -> 一根双头箭头
  fireDown({ cell: { dataset: { slot: 'u0', layer: 'u' }, classList: mkClass() }, at: { x: 0, y: 0 } });
  fireUp('u1');
  check('2×2 PBL：拖同一层的两块 -> 对调（一根双头箭头）',
    count(/class="pllarrow"/g) === 1 && /data-both="1"/.test(svg()), count(/class="pllarrow"/g));
  // 跨层不给落
  fireDown({ cell: { dataset: { slot: 'u1', layer: 'u' }, classList: mkClass() }, at: { x: 0, y: 0 } });
  fireUp('d1');
  check('2×2 PBL：跨层不换（还是只有那根箭头）',
    count(/class="pllarrow"/g) === 1, count(/class="pllarrow"/g));
  reg['btn-reset']._ev.click[0]({});
  check('2×2 PBL：还原为已复原 -> 箭头清空', count(/class="pllarrow"/g) === 0);

  // 倾斜度可调：滑条只在 2×2 PBL 里出现，拖动会立刻反映到图上并存档
  check('2×2 PBL：面板里有「倾斜」滑条（默认 1）',
    reg['h-pblskew'].style.display !== 'none' && reg['pblskew-row'].style.display !== 'none' &&
    String(reg['pblskew'].value) === '1', String(reg['pblskew'].value));
  const sizeOf = () => {
    const m = svg().match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/);
    return m ? [ +m[1], +m[2] ] : null;
  };
  const tall = sizeOf();
  reg['pblskew'].value = '0';
  reg['pblskew']._ev.input[0]({});
  const flat = sizeOf();
  check('2×2 PBL：倾斜调到 0 -> 变成正上方俯视（更窄更高）',
    flat && tall && flat[0] < tall[0] && flat[1] > tall[1],
    JSON.stringify([tall, flat]));
  check('2×2 PBL：倾斜值写进存档',
    JSON.parse(store['cube-editor-v1'] || '{}').opts.pbl2Skew === 0,
    String(JSON.parse(store['cube-editor-v1'] || '{}').opts.pbl2Skew));
  reg['pblskew'].value = '1';
  reg['pblskew']._ev.input[0]({});

  // 间距滑条：上层的下边到下层上边的距离（单位 = 格子宽）
  check('2×2 PBL：面板里有「间距」滑条（默认 0.14 格）',
    reg['pblgap-row'].style.display !== 'none' && String(reg['pblgap'].value) === '0.14',
    String(reg['pblgap'].value));
  const heights = () => {
    const m = svg().match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/);
    return m ? +m[2] : null;
  };
  const h0 = heights();
  reg['pblgap'].value = '0.9';
  reg['pblgap']._ev.input[0]({});
  check('2×2 PBL：间距调大 -> 整张图变高',
    heights() > h0 + 0.3, h0 + ' -> ' + heights());
  check('2×2 PBL：间距写进存档',
    JSON.parse(store['cube-editor-v1'] || '{}').opts.pbl2Gap === 0.9,
    String(JSON.parse(store['cube-editor-v1'] || '{}').opts.pbl2Gap));
  reg['pblgap'].value = '0.14';
  reg['pblgap']._ev.input[0]({});

  // 箭头色预设：最后一个是"黄"（夜里那套无色图的箭头色）
  check('箭头色预设六选一，最后一个是黄 #FFE600',
    /PLL_ARROW_COLORS = \[[\s\S]*?key: 'yellow'[\s\S]*?HEX\.yellow[\s\S]*?\];/.test(
      fs.readFileSync(path.join(__dirname, '..', 'cube.js'), 'utf8')) &&
    Cube.PLL_ARROW_COLORS.length === 6 &&
    Cube.PLL_ARROW_COLORS[5].on === Cube.HEX.yellow, Cube.PLL_ARROW_COLORS[5].key);
  // 恢复默认：倾斜 / 间距回到参考图那套
  check('2×2 PBL：有「恢复默认」按钮（默认就是参考图那套）',
    /<h2 id="h-pblskew"[^>]*>2×2 PBL<button class="mini" id="rst-pbl"/.test(html) &&
    Cube.PBL2_CFG.skew === 1 && Cube.PBL2_CFG.layerGap === 0.14);
  reg['pblskew'].value = '0.3'; reg['pblskew']._ev.input[0]({});
  reg['pblgap'].value = '1.10'; reg['pblgap']._ev.input[0]({});
  reg['rst-pbl']._ev.click[0]({});
  check('2×2 PBL：点恢复默认 -> 倾斜 1.00 / 间距 0.14',
    String(reg['pblskew'].value) === '1' && String(reg['pblgap'].value) === '0.14',
    reg['pblskew'].value + ' / ' + reg['pblgap'].value);
  check('2×2 PBL：恢复默认也写进存档',
    JSON.parse(store['cube-editor-v1'] || '{}').opts.pbl2Skew === 1 &&
    JSON.parse(store['cube-editor-v1'] || '{}').opts.pbl2Gap === 0.14);
  check('2×2 PBL：切走之后倾斜滑条收起来',
    (mb[0]._ev.click[0]({}), reg['pblskew-row'].style.display === 'none'));

  // 存档：两个新模式的编辑内容都要存下来
  const saved2 = JSON.parse(store['cube-editor-v1'] || 'null');
  check('存档里有 2×2 的 oll2 / pbl2 快照',
    !!(saved2 && saved2.snap && saved2.snap.oll2 && saved2.snap.pbl2),
    JSON.stringify(saved2 && saved2.snap && Object.keys(saved2.snap)));
  mb[0]._ev.click[0]({});
}

/* ---------------- 模式栏的滑动药丸（和导航栏同款） ---------------- */
{
  check('模式栏里有一个滑动的小方块（不是按钮自己画的底色）',
    /<div class="modebar" id="modebar">\s*\n\s*<span class="mpill"/.test(html) &&
    /\.mpill\{position:absolute[^}]*transition:transform \.18s/.test(html));
  check('选中态由药丸提供，按钮不再自己画背景',
    /\.modebar button\.on\{color:var\(--on-accent, #fff\)\}/.test(html) &&
    !/\.modebar button\.on\{[^}]*background/.test(html) &&
    !/\.modebar button:hover\{[^}]*background/.test(html));
  check('按钮压在药丸上面（z-index）',
    /\.modebar button\{position:relative;z-index:1/.test(html));
  // 字色比药丸晚一步变（导航栏踩过的坑：先变色就会在白底上闪一下）
  check('字色跟着药丸走（选中晚 180ms 变、失去选中立刻变灰）',
    /\.modebar button\{[^}]*transition:color \.18s ease \.18s/.test(html) &&
    /\.modebar button:not\(\.on\)\{transition-delay:0s\}/.test(html));
  check('模式按钮的底色走主题变量（不再是写死的灰蓝）',
    /\.modebar button\{[^}]*color:var\(--muted\)/.test(html) && !/#7f8fa4/.test(html));

  // 点第二个（OLL）→ 药丸应当滑到它上面
  mb[1]._ev.click[0]({});
  check('切模式时药丸滑到选中那一格',
    reg['mpill'].style.transform === 'translate(' + mb[1].offsetLeft + 'px,' + mb[1].offsetTop + 'px)' &&
    reg['mpill'].style.width === mb[1].offsetWidth + 'px',
    reg['mpill'].style.transform);
  mb[0]._ev.click[0]({});
  check('滑回去也对',
    reg['mpill'].style.transform === 'translate(' + mb[0].offsetLeft + 'px,' + mb[0].offsetTop + 'px)',
    reg['mpill'].style.transform);
  check('首次定位不播动画（开机时药丸不该从左边飞过来）',
    /setMode\(savedMode\(savedEditor\), false\)/.test(html) &&
    /function placeMPill\(el, animate\)/.test(html));
}

/* ---------------- 三个模式的编辑状态持久化 ---------------- */
{
  // 先在这个实例里清空 F2L，看存档有没有跟上
  reg['btn-clear']._ev.click[0]({});
  const saved = JSON.parse(store['cube-editor-v1'] || 'null');
  check('改动会写进存档（mode + snap + opts）',
    !!saved && saved.mode === 'f2l' && !!saved.snap && !!saved.snap.f2l &&
    !!saved.snap.oll && !!saved.snap.pll && !!saved.opts,
    JSON.stringify(saved && Object.keys(saved)));
  // state 是嵌套的（外层可能是对象或数组），摊平了看
  const flat = a => (Array.isArray(a) ? a : Object.values(a))
    .reduce((acc, r) => acc.concat(r && typeof r === 'object' ? flat(r) : r), []);
  const f2lVals = flat(saved.snap.f2l || []);
  check('存档里就是刚清空后的 F2L 局面（全部是灰）',
    f2lVals.length > 0 && f2lVals.every(v => v === Cube.EMPTY),
    f2lVals.filter(v => v !== Cube.EMPTY).length + ' 个不是灰');
  check('存档里带着各项选项（cfg / OLL 方案与划线 / PLL 开关与箭头色）',
    !!saved.opts.cfg && !!saved.opts.scheme &&
    typeof saved.opts.showOllBars === 'boolean' &&
    typeof saved.opts.pllShowColors === 'boolean' && !!saved.opts.pllArrowKey,
    JSON.stringify(saved.opts && Object.keys(saved.opts)));

  // 换一个全新的上下文、灌一份手写的存档再跑一遍 = 模拟刷新
  const arrowKey = Cube.PLL_ARROW_COLORS[1].key;
  const schemeOn = Cube.ollScheme('yellow').on;
  const ollGrid = Cube.cloneOll(Cube.DEFAULT_OLL);
  // 注意 OLL 的取值语义：0 = 已朝向（实心），非 0 = 未朝向（空心）。
  // 默认全 0，所以种子要反过来 —— 只留 [0][0] 实心，其余全设成未朝向。
  ollGrid.forEach((row, i) => row.forEach((_, j) => { ollGrid[i][j] = 1; }));
  ollGrid[0][0] = 0;
  const store2 = { 'cube-editor-v1': JSON.stringify({
    mode: 'oll',
    snap: { f2l: Cube.cloneState(Cube.DEFAULT_STATE), oll: ollGrid, pll: Cube.pllDefault() },
    opts: { cfg: Object.assign({}, Cube.DEFAULT_CFG, { elev: 1.2 }), scheme: 'yellow',
            showOllBars: false, pllShowColors: false, pllArrowKey: arrowKey,
            export: { name: 'my-cube', size: 256, bg: false } }
  }) };
  const reg2 = {};
  const doc2 = {
    documentElement: El('html'), elementFromPoint: () => null,
    getElementById: id => reg2[id] || (reg2[id] = El('div')),
    createElement: t => El(t), createElementNS: (ns, t) => El(t),
    addEventListener() {}, querySelector: () => El('div'), body: { appendChild(){} },
  };
  const ctx2 = { Cube, document: doc2, console, setTimeout, clearTimeout, Blob,
    FileReader: ctx.FileReader,
    window: { innerWidth: 1280, innerHeight: 820, addEventListener(){} },
    localStorage: { getItem: k => (k in store2 ? store2[k] : null),
                   setItem: (k, v) => { store2[k] = String(v); } },
    navigator: {}, parseFloat, parseInt, Math, JSON, Object, Array, Set, String,
    URL: ctx.URL, Image: ctx.Image };
  ctx2.globalThis = ctx2;
  vm.createContext(ctx2);
  // 模式按钮也补出来（和上面主上下文一样）
  {
    const mb2 = doc2.getElementById('modebar');
    const re = /<button data-mode="([^"]+)"/g; let m;
    while ((m = re.exec(html))) {
      const b = El('button');
      b.dataset.mode = m[1];
      b.offsetWidth = 40;
      b.offsetLeft = mb2.children.length * 42;
      mb2.appendChild(b);
    }
  }
  // 输入框默认值也要灌进去（编辑器启动时会读）
  {
    const re = /<input\b[^>]*>/g; let m;
    while ((m = re.exec(html))) {
      const tag = m[0], id = (tag.match(/\bid="([^"]+)"/) || [])[1];
      if (!id) continue;
      const el = doc2.getElementById(id);
      const v = (tag.match(/\bvalue="([^"]*)"/) || [])[1];
      if (v !== undefined) el.value = v;
      if (/\bchecked\b/.test(tag)) el.checked = true;
    }
  }
  vm.runInContext(inline, ctx2, { filename: 'editor.html:reload' });

  const svg2 = reg2['host'].innerHTML || '';
  check('重新打开后模式还是 OLL',
    reg2['modebar'].children[1].classList.contains('on'),
    reg2['modebar'].children.map(b => b.classList.contains('on')).join());
  const fills2 = [...new Set((svg2.match(/fill="([^"]+)"/g) || []))].join(' ');
  check('重新打开后 OLL 的编辑还在，而且用的是存档里的黄色方案',
    svg2.includes(schemeOn) && /class="cell"/.test(svg2),
    'schemeOn=' + schemeOn + ' | fills: ' + fills2);
  check('重新打开后 OLL 划线开关读回来了',
    reg2['ollbars'].checked === false && !reg2['tg-bars'].classList.contains('on'),
    'checked=' + reg2['ollbars'].checked + ' 高亮=' + reg2['tg-bars'].classList.contains('on'));
  check('重新打开后 PLL 显示颜色开关读回来了',
    reg2['pllcolor'].checked === false && !reg2['tg-pllcolor'].classList.contains('on'));
  check('重新打开后相机滑块读回来了（cfg.elev = 1.2）',
    parseFloat(reg2['elev'].value) === 1.2, String(reg2['elev'].value));
  check('重新打开后导出参数也读回来了（文件名 / 尺寸 / 白底）',
    reg2['exname'].value === 'my-cube' && String(reg2['exsize'].value) === '256' &&
    reg2['exbg'].checked === false && !reg2['tg-bg'].classList.contains('on'),
    reg2['exname'].value + ' / ' + reg2['exsize'].value + ' / ' + reg2['exbg'].checked);
  check('重新打开时药丸也摆好了（不带动画）',
    /placeMPill\(syncModeButtons\(\), animate !== false\)/.test(html));
}

/* ---------------- 一键「参数恢复默认」 ---------------- */
{
  // 默认值要和标记里的 value / checked 对得上（测试盯着，免得两边走偏）
  check('导出默认值和标记一致（cube / 512 / 勾上白底）',
    /var EX_DEFAULT = \{ name: 'cube', size: 512, bg: true \}/.test(html) &&
    /id="exname" value="cube"/.test(html) && /id="exsize" value="512"/.test(html) &&
    /id="exbg" checked/.test(html));

  // 先把各项参数都改一遍
  reg['elev'].value = '1.2';
  reg['elev']._ev.input[0]({});
  reg['exname'].value = 'zzz';
  reg['exname']._ev.input[0]({});
  reg['exsize'].value = '256';
  reg['exsize']._ev.input[0]({});
  reg['exbg'].checked = false;
  reg['exbg']._ev.change[0]({});
  mb[2]._ev.click[0]({});                  // 切到 PLL 才能动箭头色
  reg['arrowcolors'].children[1]._ev.click[0]({});
  mb[0]._ev.click[0]({});                  // 切回 F2L
  const dirty = JSON.parse(store['cube-editor-v1'] || 'null');
  const dex = (dirty.opts && dirty.opts.export) || {};
  check('改过的参数（含导出文件名/尺寸/白底）都会写进存档',
    dirty.opts.cfg.elev === 1.2 && dirty.opts.pllArrowKey === Cube.PLL_ARROW_COLORS[1].key &&
    dex.name === 'zzz' && dex.size === 256 && dex.bg === false,
    JSON.stringify(dex));
  const snapBefore = JSON.stringify(dirty.snap);

  // 一键恢复
  reg['btn-params']._ev.click[0]({});
  check('参数恢复默认：相机回到出厂值',
    parseFloat(reg['elev'].value) === Cube.DEFAULT_CFG.elev, String(reg['elev'].value));
  check('参数恢复默认：OLL 配色回到默认方案、划线开关回到默认',
    schemeBtn(Cube.OLL_DEFAULT_SCHEME).classList.contains('on') &&
    reg['ollbars'].checked === Cube.OLL_CFG.showBars &&
    reg['tg-bars'].classList.contains('on') === !!Cube.OLL_CFG.showBars);
  check('参数恢复默认：PLL 显示颜色回到勾上', reg['pllcolor'].checked === true &&
    reg['tg-pllcolor'].classList.contains('on'));
  check('参数恢复默认：箭头色回到默认一粒',
    reg['arrowcolors'].children[0].classList.contains('on') &&
    !reg['arrowcolors'].children[1].classList.contains('on'));
  check('参数恢复默认：导出参数回到 cube / 512 / 白底',
    reg['exname'].value === 'cube' && String(reg['exsize'].value) === '512' &&
    reg['exbg'].checked === true && reg['tg-bg'].classList.contains('on'));
  const after = JSON.parse(store['cube-editor-v1'] || 'null');
  check('恢复默认之后存档里也是默认值',
    after.opts.cfg.elev === Cube.DEFAULT_CFG.elev && after.opts.export.name === 'cube' &&
    after.opts.pllArrowKey === Cube.PLL_DEFAULT_ARROW,
    JSON.stringify({ elev: after.opts.cfg.elev, name: after.opts.export.name }));
  check('「参数恢复默认」不动画面内容（快照没变）',
    JSON.stringify(after.snap) === snapBefore);
}

console.log('\n结果: ' + pass + ' 通过, ' + fail + ' 失败');
process.exit(fail ? 1 : 0);
