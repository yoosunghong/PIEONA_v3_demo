// Shared deterministic rules. The authenticated server is the authority; the
// browser also runs these rules in the explicitly labelled, isolated demo.
// Companion work requires an explicitly selected friend profile, including for old saves.
export const EXPLORATION_COMPANION_AVAILABLE=true;
export const ATTACK_FATIGUE_COST=1;
export const RESOURCE_TYPES={wood:{name:'나무',item:'wood',label:'원목',cost:2,hits:3,amount:2},stone:{name:'광석',item:'stone',label:'돌',cost:2,hits:3,amount:2},mushroom:{name:'버섯',item:'mushroom',label:'버섯',cost:1,hits:1,amount:1},rare:{name:'빛나는 버섯',item:'mushroom',label:'빛나는 버섯',cost:1,hits:1,amount:3},leaf:{name:'들꽃',item:'leaf',label:'잎사귀',cost:1,hits:1,amount:2}};
export const RECIPES=[
 {id:'bench',name:'나무 벤치',level:1,source:'wood',icon:'wood',ingredients:{wood:8},description:'숲의 온기를 담은 작은 쉼터'},
 {id:'path',name:'돌 디딤길',level:1,source:'stone',icon:'stone',ingredients:{stone:6},description:'발걸음마다 이어지는 우리만의 길'},
 {id:'planter',name:'버섯 화분',level:2,source:'mushroom',icon:'mushroom',ingredients:{mushroom:4,wood:2},description:'작은 버섯이 자라는 다정한 화분'},
 {id:'fence',name:'나무 울타리',level:2,source:'wood',icon:'wood',ingredients:{wood:6,stone:2},description:'정원을 포근하게 감싸는 울타리'},
 {id:'lantern',name:'숲 가로등',level:3,source:'stone',icon:'mushroom',ingredients:{stone:8,mushroom:4,wood:4},description:'어두운 길을 밝히는 숲의 별'},
 {id:'parasol',name:'숲 휴식 정자',level:4,source:'wood',icon:'leaf',ingredients:{wood:20,stone:12},description:'함께 나눈 이야기가 머무는 자리'}
];
export const XP_LIMITS=[50,80,120,160];
export const INITIAL_NODES=[
 ['tree-1','wood',3,0.6],['rock-1','stone',-8.2,-3.5],['mushroom-1','mushroom',-3.7,2.5],
 ['tree-2','wood',-10,-4.5],['tree-3','wood',-1,-9],['tree-4','wood',10,6],
 ['rock-2','stone',8,2],['rock-3','stone',-5,-8],['mushroom-2','mushroom',-5.7,3],
 ['mushroom-3','mushroom',-2.9,6],['rare-1','rare',-9,-7],['flower-1','leaf',1,5],
 ['slime-1','slime',-4.1,-6.4]
].map(([id,type,x,z])=>({id,type,x,z,hp:type==='slime'?3:RESOURCE_TYPES[type].hits,respawnAt:0}));
const invalid=message=>Object.assign(new Error(message),{status:400});
export const REACH=2.05, WALK_SPEED=3.3;
function companionAvailability(s){if(!EXPLORATION_COMPANION_AVAILABLE||!s.companion.profile)Object.assign(s.companion,{enabled:false,mode:'IDLE',targetId:null,nextAction:0});}
export function upgradeExploration(s){if(s.layoutVersion!==2){for(const n of s.nodes){const initial=INITIAL_NODES.find(p=>p.id===n.id);if(initial&&n.type!=='slime'){n.x=initial.x;n.z=initial.z;}}s.layoutVersion=2;}companionAvailability(s);if(s.area==='village'){s.hp=100;s.fatigue=100;}return s;}
export const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
export function walkable(x,z){return Number.isFinite(x)&&Number.isFinite(z)&&x>=-11&&x<=11&&z>=-10&&z<=8&&!(x>5.7&&z<-2.7&&!(z>-6.6&&z<-4.4));}
export function canTraverse(s,x,z){return walkable(x,z)&&!s.nodes.some(n=>n.hp>0&&['wood','stone'].includes(n.type)&&Math.hypot(n.x-x,n.z-z)<(n.type==='stone'?.8:.5));}
export function createExploration(time=Date.now(),demo=false){return {version:1,area:'forest',hp:100,fatigue:demo?68:100,level:1,xp:0,position:{x:-.5,z:2.9},companion:{x:1.1,z:4.1,mode:'IDLE',targetId:null,enabled:false,nextAction:0},nodes:INITIAL_NODES.map(n=>({...n})),inventory:demo?{wood:12,stone:8,mushroom:5,leaf:14}:{wood:0,stone:0,mushroom:0,leaf:0},blueprints:[],crafted:{},placed:[],discoveries:[],events:[],pity:0,actions:0,visited:['clearing'],lastTick:time,lastMove:time,nextAction:0,slimeAttackAt:time+2500,reply:'함께라서 더 좋은 모험. 어디부터 가볼까?',commandProvider:'local',sessionStart:time};}
function note(s,message,time,extra={}){s.events.push({id:`${time}-${s.events.length}-${s.actions}`,message,time,...extra});s.events=s.events.slice(-100);}
function xp(s,key,amount,time){if(s.discoveries.includes(key)){const date=new Date(time+9*3600000).toISOString().slice(0,10);if(s.repeatDay!==date){s.repeatDay=date;s.repeatXP=0;}if(s.level<5&&(s.repeatXP||0)<20){s.xp++;s.repeatXP=(s.repeatXP||0)+1;}}else{s.discoveries.push(key);s.xp+=amount;note(s,`첫 경험! +${amount} XP`,time,{kind:'discovery'});}while(s.level<5&&s.xp>=XP_LIMITS[s.level-1]){s.xp-=XP_LIMITS[s.level-1];s.level++;note(s,`Lv.${s.level} · 새로운 가능성이 피어났어요`,time,{kind:'level'});}if(s.level===5)s.xp=0;}
export function nearestNode(s,pos=s.position){return s.nodes.filter(n=>n.hp>0).sort((a,b)=>distance(a,pos)-distance(b,pos))[0];}
export function companionLearning(s){const own=s.observations?.player||{},friend=s.observations?.companion||{};const weight=types=>types.reduce((n,key)=>n+(own[key]||0)*8+(friend[key]||0)*2,0);return [{name:'채집의 감각',value:Math.min(100,weight(['wood','stone','mushroom','rare','leaf']))},{name:'새로운 길의 호기심',value:Math.min(100,s.discoveries.filter(k=>!k.startsWith('craft:')).length*12+Math.max(0,s.visited.length-1)*8)},{name:'함께하는 용기',value:Math.min(100,weight(['slime'])*2)}];}
function moveToward(pos,target,step,state){const d=distance(pos,target);if(d<.05)return;const ratio=Math.min(1,step/d),x=pos.x+(target.x-pos.x)*ratio,z=pos.z+(target.z-pos.z)*ratio;const allowed=(x,z)=>state?canTraverse(state,x,z):walkable(x,z);if(allowed(x,z)){pos.x=x;pos.z=z;}else if(allowed(x,pos.z))pos.x=x;else if(allowed(pos.x,z))pos.z=z;}
export const COMPANION_TASKS={GATHER_WOOD:['wood'],MINE_STONE:['stone'],FORAGE:['mushroom','rare','leaf'],ATTACK:['slime']};
export function companionPath(s,from,target,reach=1.4){
 const snap=p=>({x:Math.round(p.x*2)/2,z:Math.round(p.z*2)/2});
 const start=snap(from),key=p=>`${p.x},${p.z}`,seen=new Map([[key(start),null]]),queue=[start];
 for(let i=0;i<queue.length;i++){const p=queue[i];if(distance(p,target)<=reach){const path=[];let q=p;while(seen.get(key(q))){path.unshift(q);q=seen.get(key(q));}return path;}
  for(const [dx,dz] of [[.5,0],[-.5,0],[0,.5],[0,-.5]]){const q={x:p.x+dx,z:p.z+dz};if(!seen.has(key(q))&&canTraverse(s,q.x,q.z)){seen.set(key(q),p);queue.push(q);}}
 }return null;
}
function walkCompanion(s,target,step){const c=s.companion;
 if(!c.path?.length||distance(c.path.at(-1),target)>1.6)c.path=companionPath(s,c,target);
 const point=c.path?.[0];if(!point)return;
 if(!canTraverse(s,point.x,point.z)){c.path=null;return;}
 moveToward(c,point,step,s);if(distance(c,point)<.08)c.path.shift();
}
export function tickExploration(s,time=Date.now(),random=Math.random){companionAvailability(s);const elapsed=Math.max(0,Math.min(1,(time-s.lastTick)/1000));s.lastTick=time;if(s.area!=='forest'){s.hp=100;s.fatigue=100;return s;}
 for(const n of s.nodes)if(n.hp<=0&&n.respawnAt<=time){n.hp=n.type==='slime'?3:RESOURCE_TYPES[n.type].hits;n.respawnAt=0;}
 const c=s.companion;
 if(c.enabled&&c.mode!=='IDLE'){
  const types=COMPANION_TASKS[c.mode];
  let n=s.nodes.find(n=>n.id===c.targetId&&n.hp>0);
  if(types&&(!n||time-(c.startedAt??time)>30000)){
   const expired=n?.id;c.targetId=null;c.path=null;
   for(const candidate of s.nodes.filter(n=>n.hp>0&&types.includes(n.type)&&n.id!==expired).sort((a,b)=>distance(a,c)-distance(b,c))){
    const path=companionPath(s,c,candidate,1.6);if(path){n=candidate;c.targetId=n.id;c.path=path;c.startedAt=time;break;}
   }
   if(!c.targetId)n=null;
  }
  if(n){if(distance(c,n)>1.6)walkCompanion(s,n,elapsed*3.8);else if(time>=c.nextAction){try{interactExploration(s,n.id,'COMPANION',time,random);}catch(e){s.reply=e.message;c.mode='IDLE';c.targetId=null;c.path=null;}c.nextAction=time+900;}}
  else if(!types&&distance(c,s.position)>1.5)walkCompanion(s,s.position,elapsed*3.5);

 }
 const slime=s.nodes.find(n=>n.type==='slime');
 if(slime?.hp>0){const d=distance(slime,s.position);if(d<4.4&&d>1.15)moveToward(slime,s.position,elapsed*.75,s);else if(d>=4.4){const phase=(time-s.sessionStart)/1000;moveToward(slime,{x:-4.1+Math.sin(phase*.28)*.7,z:-6.4+Math.cos(phase*.28)*.5},elapsed*.3,s);}if(d<1.4&&time>=s.slimeAttackAt){s.hp=Math.max(0,s.hp-7);s.slimeAttackAt=time+2200;note(s,'슬라임에게 피해를 받았어요 · HP -7',time,{kind:'damage'});if(s.hp===0){for(const k of Object.keys(s.inventory))s.inventory[k]=Math.floor(s.inventory[k]*.9);returnExploration(s,time,true);}}
  if(c.enabled&&c.mode==='FOLLOW'&&d<2.2&&distance(c,slime)<2.2&&time>=c.nextAction&&s.fatigue>=ATTACK_FATIGUE_COST){interactExploration(s,slime.id,'COMPANION',time,random);c.nextAction=time+1800;}
 }
 if(s.position.x<-7&&s.position.z<-5&&!s.visited.includes('hidden')){s.visited.push('hidden');xp(s,'place:hidden',20,time);note(s,'숨겨진 반딧불 쉼터를 발견했어요',time,{kind:'discovery'});}
 return s;
}
export function moveExploration(s,position,time=Date.now()){
 if(s.area!=='forest')throw invalid('숲에 입장해 주세요.');
 if(!canTraverse(s,position.x,position.z))throw invalid('물길과 절벽, 나무와 바위를 피해 이동해 주세요.');
 const allowance=Math.min(1,Math.max(.06,(time-s.lastMove)/1000))*WALK_SPEED+.3;
 if(distance(position,s.position)>allowance)throw invalid('너무 멀리 이동했어요.');
 s.position={x:position.x,z:position.z};s.lastMove=time;return s;
}
export function interactExploration(s,nodeId,actor='PLAYER',time=Date.now(),random=Math.random){
 if(s.area!=='forest')throw invalid('숲에서 사용할 수 있어요.');
 if(actor==='COMPANION'&&(!EXPLORATION_COMPANION_AVAILABLE||!s.companion.enabled))throw invalid('AI 친구는 잠시 쉬고 있어요.');
 const n=s.nodes.find(n=>n.id===nodeId&&n.hp>0);if(!n)throw invalid('자원이 다시 자라기를 기다려 주세요.');
 if(distance(actor==='PLAYER'?s.position:s.companion,n)>REACH)throw invalid('조금 더 가까이 다가가 주세요.');
 if(actor==='PLAYER'&&time<s.nextAction)throw invalid('잠깐! 다음 동작을 준비하고 있어요.');
 const type=RESOURCE_TYPES[n.type],cost=type?.cost??ATTACK_FATIGUE_COST;if(s.fatigue<cost)throw invalid('피로도가 부족해요. 마을에서 쉬어 갈까요?');
 s.fatigue-=cost;s.nextAction=actor==='PLAYER'?time+550:s.nextAction;n.hp--;s.actions++;
 note(s,n.type==='slime'?'슬라임을 공격했어요':`${type.name} ${n.hp>0?'채집 중…':'채집 완료!'}`,time,{actor,target:n.id,kind:'hit'});
 if(n.hp>0)return s;
 n.respawnAt=time+(n.type==='slime'?45000:30000);const item=type?.item||'leaf',amount=type?.amount||3;s.inventory[item]+=amount;
 note(s,`${type?.label||'잎사귀'} +${amount}`,time,{actor,target:n.id,item,amount,kind:'loot'});
 s.observations||={player:{},companion:{}};const observed=s.observations[actor==='PLAYER'?'player':'companion'];observed[n.type]=(observed[n.type]||0)+1;
 const key=`${n.type}:first`,first=!s.discoveries.includes(key);
 if(actor==='PLAYER')xp(s,key,n.type==='slime'?15:20,time);
 s.pity++;const pool=RECIPES.filter(r=>r.level<=s.level&&!s.blueprints.includes(r.id));
 if(pool.length&&(s.pity>=16||random()<(n.type==='slime'?.07:.05)+(first&&actor==='PLAYER'?.1:0))){const matching=pool.filter(r=>r.source===(n.type==='rare'?'mushroom':n.type));const choices=matching.length?matching:pool;const r=choices[Math.min(choices.length-1,Math.floor(random()*choices.length))];s.blueprints.push(r.id);s.pity=0;note(s,`${r.name} 설계도를 발견했어요!`,time,{kind:'blueprint',recipe:r.id});}
 if(actor==='COMPANION'){s.companion.targetId=null;s.companion.path=null;}
 if(n.type==='rare')s.reply='이 장소… 처음인데 이상하게 낯설지 않아.';
 return s;
}
export function commandExploration(s,action,targetId,time=Date.now()){
 if(!EXPLORATION_COMPANION_AVAILABLE)throw invalid('AI 친구는 잠시 쉬고 있어요.');
 const c=s.companion;if(s.area!=='forest')throw invalid('숲에서 친구를 불러 주세요.');if(!c.enabled)throw invalid('AI 동행을 먼저 켜 주세요.');
 if(['FOLLOW','RETURN','IDLE'].includes(action)){c.mode=action==='RETURN'?'FOLLOW':action;c.targetId=null;c.path=null;s.reply=action==='IDLE'?'여기서 기다릴게. 필요하면 불러 줘!':'응, 네 곁에 있을게!';return s;}
 const types=COMPANION_TASKS[action];if(!types)throw invalid('나무, 돌, 버섯 채집이나 따라오기를 부탁해 줘.');
 const candidates=s.nodes.filter(n=>n.hp>0&&types.includes(n.type)&&distance(c,n)<18);
 const target=(targetId?candidates.find(n=>n.id===targetId):null)||candidates.sort((a,b)=>distance(a,c)-distance(b,c))[0];
 if(!target){c.mode=action;c.targetId=null;c.path=null;s.reply='자원이 다시 생기면 계속 모을게.';return s;}
 c.mode=action;c.targetId=target.id;c.path=null;c.startedAt=time;c.nextAction=time+350;s.reply=`${RESOURCE_TYPES[target.type]?.name||'슬라임'}${action==='ATTACK'?'을 막아 볼게!':' 찾아서 다녀올게!'} `;return s;
}
export function parseLocalCommand(text){if(/싸우지|따라|follow/i.test(text))return 'FOLLOW';if(/나한테|돌아|이리|복귀|come/i.test(text))return 'RETURN';if(/기다|멈춰|중단|대기|stay|stop/i.test(text))return 'IDLE';if(/슬라임|공격|도와|attack/i.test(text))return 'ATTACK';if(/나무|원목|벌목|wood|tree/i.test(text))return 'GATHER_WOOD';if(/돌|광석|채광|stone|rock/i.test(text))return 'MINE_STONE';if(/버섯|꽃|채집|mushroom/i.test(text))return 'FORAGE';return null;}
export function craftExploration(s,recipeId,time=Date.now()){
 if(s.area!=='village')throw invalid('마을로 돌아가서 제작해 주세요.');const r=RECIPES.find(r=>r.id===recipeId);if(!r||!s.blueprints.includes(r.id))throw invalid('먼저 설계도를 발견해 주세요.');
 if(Object.entries(r.ingredients).some(([k,v])=>(s.inventory[k]||0)<v))throw invalid('제작 재료가 조금 더 필요해요.');for(const [k,v]of Object.entries(r.ingredients))s.inventory[k]-=v;s.crafted[r.id]=(s.crafted[r.id]||0)+1;xp(s,`craft:${r.id}`,30,time);note(s,`${r.name} 제작 완료!`,time,{kind:'craft',recipe:r.id});s.reply='이걸 만드는 방법을… 원래 알고 있었던 것 같아.';return s;
}
export function returnExploration(s,time=Date.now(),fainted=false){s.area='village';s.hp=100;s.fatigue=100;s.companion.mode='IDLE';s.companion.targetId=null;s.companion.path=null;companionAvailability(s);const direct=s.events.filter(e=>e.actor==='PLAYER'&&e.kind==='loot'&&e.time>=s.sessionStart);s.reply=!s.companion.enabled?(fainted?'마을로 안전하게 돌아왔어요. 재료는 90% 보존했어요.':'마을에서 충분히 쉬었어요. HP와 피로도를 모두 회복했어요.'):fainted?'괜찮아? 마을까지 데려왔어. 재료는 90% 지켰어.':direct.length?`오늘 네가 직접 ${direct.length}번이나 재료를 모았어. 네가 고르는 모습을 기억할게.`:'숲을 함께 걸으니 좋았어. 다음에는 새로운 길로 가볼까?';note(s,s.reply,time,{kind:s.companion.enabled?'memory':'return',actor:s.companion.enabled?'COMPANION':'PLAYER'});return s;}
export function enterExploration(s,time=Date.now()){if(s.area==='village'){s.hp=100;s.fatigue=100;}s.area='forest';s.position={x:-.5,z:2.9};Object.assign(s.companion,{x:1.1,z:4.1,targetId:null,path:null,mode:s.companion.enabled?'FOLLOW':'IDLE'});companionAvailability(s);s.sessionStart=time;s.lastMove=time;s.lastTick=time;return s;}
