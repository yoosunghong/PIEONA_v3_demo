export const galaxyNpcs=Object.freeze([
  {id:'a7110000-0000-4000-8000-000000000001',nickname:'피오나',theme:'rose',color:'#ff8fc9',count:8,level:12},
  {id:'a7110000-0000-4000-8000-000000000002',nickname:'루나',theme:'ocean',color:'#9c9cff',count:6,level:10},
  {id:'a7110000-0000-4000-8000-000000000003',nickname:'토리',theme:'sage',color:'#baffca',count:7,level:8},
  {id:'a7110000-0000-4000-8000-000000000004',nickname:'모아',theme:'sunset',color:'#ffda94',count:5,level:9},
]);
export const galaxyNpc=id=>galaxyNpcs.find(npc=>npc.id===id);

// An account's constellation stays stable across visits, searches and level changes.
export function seededRandom(seed){let n=2166136261;for(const c of String(seed))n=Math.imul(n^c.charCodeAt(0),16777619);return()=>{n+=0x6D2B79F5;let t=Math.imul(n^n>>>15,1|n);t^=t+Math.imul(t^t>>>7,61|t);return((t^t>>>14)>>>0)/4294967296;};}
export function constellationFor(id,count){
  const random=seededRandom(id),points=count>0?[{x:90,y:103}]:[];
  // The plaza is the central owned star; the remaining destinations branch around it.
  for(let i=1;i<count;i++){
    let candidate,best,score=-1;
    for(let attempt=0;attempt<24;attempt++){
      const angle=random()*Math.PI*2,r=Math.sqrt(random());
      candidate={x:90+Math.cos(angle)*r*68,y:103+Math.sin(angle)*r*80};
      const distance=points.length?Math.min(...points.map(p=>Math.hypot(p.x-candidate.x,p.y-candidate.y))):1;
      if(distance>score){score=distance;best=candidate;}
    }points.push(best);
  }
  // A minimum spanning tree produces organic branches without disconnected stars.
  const edges=[],connected=new Set(points.length?[0]:[]);
  while(connected.size<points.length){let best,distance=Infinity;for(const a of connected)for(let b=0;b<points.length;b++){if(connected.has(b))continue;const d=Math.hypot(points[a].x-points[b].x,points[a].y-points[b].y);if(d<distance){distance=d;best=[a,b];}}edges.push(best);connected.add(best[1]);}
  return {points,edges};
}

export function galaxyLayout(users,viewerId){
  const anchors=[[31,25],[63,28],[17,55],[59,67],[42,15],[74,19],[85,37],[79,51],[91,57],[22,78],[40,83],[59,86],[13,34],[44,70],[71,78],[27,40]];
  const sorted=[...users].sort((a,b)=>Number(!!b.isNpc)-Number(!!a.isNpc)||Number(b.id===viewerId)-Number(a.id===viewerId)||a.id.localeCompare(b.id));
  let index=0;
  return sorted.map(user=>{const own=user.id===viewerId;const slot=index++,base=anchors[slot%anchors.length],layer=Math.floor(slot/anchors.length);const random=seededRandom(user.id);return {...user,x:own?40:base[0]+(layer?(random()-.5)*8:0),y:own?52:base[1]+(layer?(random()-.5)*8:0),color:galaxyNpc(user.id)?.color||['#8cbaff','#d99aff','#9ff5ee','#ffb1c9'][Math.floor(random()*4)],...constellationFor(user.id,user.starCount)};});
}
