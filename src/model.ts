export type Point = {x: number; y: number};
export type Quad = [Point, Point, Point, Point];
export const patterns = ['ベーシック', '放射型', 'スパイラル', 'ジオメトリック'] as const;
export type Pattern = typeof patterns[number];
export const initialQuad = (): Quad => [
  {x:.18,y:.26}, {x:.82,y:.33}, {x:.82,y:.76}, {x:.18,y:.83},
];
export const clamp = (n: number, min=0, max=1) => Math.max(min, Math.min(max,n));
export type Photo = {uri: string; width: number; height: number};
export const webDefaults = {density:60, spokes:14, balance:50, center:{x:.5,y:.5}, color:'#F6F1FF'};
export type Design = typeof webDefaults & {
  version:1; id:string; name:string; photo:Photo|null; quad:Quad;
  widthCm:string; heightCm:string; pattern:Pattern; thread:string;
  robotPlan: {anchors:{id:string; rod:number; position:number}[]; sequence:{from:string; to:string}[]} | null;
  createdAt:string; updatedAt:string;
};
export function newDesign(pattern:Pattern=patterns[0]): Design {
  const now = new Date().toISOString();
  return {...webDefaults, version:1, id:Date.now().toString(36)+'-'+Math.random().toString(36).slice(2),
    name:'新しいデザイン', photo:null, quad:initialQuad(), widthCm:'60', heightCm:'45',
    pattern, thread:'透明糸', robotPlan:null, createdAt:now, updatedAt:now};
}
export function validQuad(q:Quad) {
  return q.every((a,i)=>{
    const b=q[(i+1)%4], c=q[(i+2)%4];
    return (b.x-a.x)*(c.y-b.y)-(b.y-a.y)*(c.x-b.x)>.001;
  });
}
// Project the design plane into the photo with a single homography.
export function project([a,b,c,d]:Quad,{x,y}:Point):Point {
  const dx=b.x-c.x, dy=b.y-c.y, ex=d.x-c.x, ey=d.y-c.y;
  const fx=a.x-b.x+c.x-d.x, fy=a.y-b.y+c.y-d.y;
  const det=dx*ey-ex*dy;
  const g=(fx*ey-ex*fy)/det, h=(dx*fy-fx*dy)/det;
  const w=1+g*x+h*y;
  return {x:(a.x+(b.x-a.x+g*b.x)*x+(d.x-a.x+h*d.x)*y)/w,
    y:(a.y+(b.y-a.y+g*b.y)*x+(d.y-a.y+h*d.y)*y)/w};
}
export function webLines(d:Design):Point[][] {
  const center=d.center;
  const mix=(p:Point,t:number)=>({x:center.x+(p.x-center.x)*t,y:center.y+(p.y-center.y)*t});
  const rim=Array.from({length:d.spokes},(_,i)=>{
    const angle=i/d.spokes*Math.PI*2;
    const a=angle+(d.balance-50)*.013*Math.sin(angle);
    const x=Math.cos(a),y=Math.sin(a);
    const edgeX=x===0?Infinity:(x>0?1-center.x:-center.x)/x;
    const edgeY=y===0?Infinity:(y>0?1-center.y:-center.y)/y;
    const t=Math.min(edgeX,edgeY);
    return {x:center.x+x*t,y:center.y+y*t};
  });
  const lines=rim.map(p=>[center,p]);
  const rings=Math.round(d.density/8);
  if(d.pattern==='放射型'){
    for(let i=1;i<=rings;i++) rim.forEach((p,j)=>{
      const t=i/(rings+1);
      const next=rim[(j+1)%rim.length];
      lines.push([mix(p,t),mix(next,t*.91)]);
    });
  } else if(d.pattern==='スパイラル'){
    if(rings) lines.push(Array.from({length:rings*rim.length+1},(_,i)=>
      mix(rim[i%rim.length],.04+.91*i/(rings*rim.length))));
  } else {
    for(let i=1;i<=rings;i++){
      const ring=rim.map((p,j)=>mix(p,i/(rings+1)*(d.pattern==='ジオメトリック'&&j%2?.76:1)));
      lines.push([...ring,ring[0]]);
    }
  }
  return lines;
}
