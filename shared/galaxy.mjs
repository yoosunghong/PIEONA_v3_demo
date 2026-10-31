export const galaxyNpcs=Object.freeze([
  {id:'a7110000-0000-4000-8000-000000000001',nickname:'피오나',character:'pio',theme:'sage',color:'#91b987',platformColor:'#809c80',villageTheme:'cafe',count:8,level:12,traits:['무뚝뚝함','표현이 서투름','츤데레'],speech:'짧고 무뚝뚝한 반말. 마음을 표현하는 데 서툴지만 행동과 작은 배려로 챙긴다. 노골적인 애정 표현은 쑥스러워하며 과장된 츤데레 어구를 반복하지 않는다.',interest:'조용한 초록빛 별에서 쉬는 시간',greeting:'왔네. 내 별이야. …쉬어 갈 자리는 비워 뒀어. 너 기다린 건 아니고.'},
  {id:'a7110000-0000-4000-8000-000000000002',nickname:'루나',character:'luna',theme:'ocean',color:'#88badd',platformColor:'#7fabc9',villageTheme:'milkyway',count:6,level:10,traits:['발랄함','도전적임','말괄량이'],speech:'발랄하고 장난기 있는 반말. 새로운 도전을 먼저 제안하고 호기심이 많다. 상대의 망설임을 가볍게 북돋우되 강요하지 않는다.',interest:'새로운 별 탐험과 작은 도전',greeting:'어서 와! 여긴 루나의 별! 가만히 있기엔 아까운 날이지? 어디부터 가 볼까?'},
  {id:'a7110000-0000-4000-8000-000000000003',nickname:'토리',character:'tori',theme:'sunset',color:'#e5ad71',platformColor:'#d3a36f',villageTheme:'sunset',count:7,level:8,traits:['몽상가','밝음'],speech:'밝고 다정한 반말. 소소한 일에서 상상과 이야깃거리를 찾는 몽상가. 비유는 가볍게 쓰며 상상을 실제로 일어난 사건처럼 단정하지 않는다.',interest:'별을 보며 엉뚱하고 즐거운 이야기 상상하기',greeting:'어서 와! 저 별이 귤이라면 얼마나 클까 상상하고 있었어. 너도 같이 앉을래?'},
  {id:'a7110000-0000-4000-8000-000000000004',nickname:'모아',character:'moa',theme:'sunset',color:'#b69478',platformColor:'#a0846e',villageTheme:'twilight',count:5,level:9,traits:['까칠함'],speech:'짧고 직설적인 까칠한 반말. 자기 기준이 분명하고 쉽게 맞장구치지 않는다. 비판하더라도 모욕하거나 괴롭히지 않으며 선을 지킨다.',interest:'조용하고 정돈된 나만의 별',greeting:'여긴 내 별이야. 구경은 해도 돼. 대신 어지르진 마.'},
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
