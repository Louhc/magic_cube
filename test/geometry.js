const Cube = require('../cube.js');
const fs = require('fs');

function polyArea(p){ let a=0; for(let i=0;i<p.length;i++){const q=p[(i+1)%p.length]; a+=p[i][0]*q[1]-q[0]*p[i][1];} return Math.abs(a)/2; }
function pointInPoly(pt, poly){
  let inside=false;
  for(let i=0,j=poly.length-1;i<poly.length;j=i++){
    const xi=poly[i][0], yi=poly[i][1], xj=poly[j][0], yj=poly[j][1];
    if(((yi>pt[1])!==(yj>pt[1])) && (pt[0] < (xj-xi)*(pt[1]-yi)/(yj-yi)+xi)) inside=!inside;
  }
  return inside;
}

const state = Cube.cloneState(Cube.DEFAULT_STATE);
const cfg = Object.assign({}, Cube.DEFAULT_CFG);
const built = Cube.buildStickers(state, cfg);

console.log('cells:', built.cells.length);
console.log('size : w=%s h=%s', built.size.w.toFixed(3), built.size.h.toFixed(3));

// sticker polygons should be simple (positive area) and non-degenerate
let degen = built.cells.filter(c => polyArea(c.sticker) < 1e-6).length;
console.log('degenerate stickers:', degen);

// frames must tile the silhouette exactly
const frameSum = built.cells.reduce((s,c)=>s+polyArea(c.frame),0);
// silhouette = convex hull of all frame points
const pts = built.cells.flatMap(c=>c.frame);
const hull = [];
{
  const P = pts.slice().sort((a,b)=>a[0]-b[0]||a[1]-b[1]);
  const cross=(o,a,b)=>(a[0]-o[0])*(b[1]-o[1])-(a[1]-o[1])*(b[0]-o[0]);
  const lower=[],upper=[];
  for(const p of P){ while(lower.length>=2&&cross(lower[lower.length-2],lower[lower.length-1],p)<=0) lower.pop(); lower.push(p);}
  for(let i=P.length-1;i>=0;i--){const p=P[i]; while(upper.length>=2&&cross(upper[upper.length-2],upper[upper.length-1],p)<=0) upper.pop(); upper.push(p);}
  hull.push(...lower.slice(0,-1),...upper.slice(0,-1));
}
const hullArea = polyArea(hull);
console.log('frame area sum = %s   hull area = %s   diff = %s',
  frameSum.toFixed(4), hullArea.toFixed(4), Math.abs(frameSum-hullArea).toFixed(6));

// random point coverage: 1 = inside, 2 = overlap
let rng = 12345; const rand=()=>{rng=(rng*1103515245+12345)&0x7fffffff; return rng/0x7fffffff;};
let cov=0, over=0, inside=0;
for(let i=0;i<200000;i++){
  const x=rand()*built.size.w, y=rand()*built.size.h;
  let n=0; for(const c of built.cells) if(pointInPoly([x,y],c.frame)) n++;
  if(n>0) inside++; if(n>1) over++;
}
console.log('random coverage -> covered:',inside,' overlap:',over);

// sticker must sit inside its own frame
let outside=0;
for(const c of built.cells) for(const p of c.sticker) if(!pointInPoly(p,c.frame)) outside++;
console.log('sticker vertices outside own frame:', outside);

// every cell has a distinct id and a valid color key
const ids=new Set(built.cells.map(c=>c.id));
const badColor=built.cells.filter(c=>!Cube.HEX[c.colorKey]);
console.log('unique ids:', ids.size, ' bad color keys:', badColor.length);

fs.writeFileSync('/tmp/stickers.json', JSON.stringify({built, hue:Cube.toSvg(state,cfg).length}));
console.log('svg bytes:', Cube.toSvg(state,cfg).length);
