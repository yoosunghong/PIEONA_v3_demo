export const ROBOT_BATTERY_MS=60*60_000;
export const ROBOT_CYCLE_MS=60_000;
export const DEFENSE_DURATION_MS=20_000;
export const persuasionChance=affinity=>Math.min(.95,.2+Math.max(0,affinity)*.0075);
export const STAR_TYPES=[
  {id:'green',name:'초록별',color:'#8cce99',stat:'작물 성장 속도',unit:'%',scene:'farm'},
  {id:'red',name:'붉은별',color:'#f09883',stat:'광물 생산량',unit:'%',scene:'plaza'},
  {id:'blue',name:'푸른별',color:'#80c6ef',stat:'희귀 물고기 확률',unit:'%p',scene:'fishing'},
];
export const STAR_GRADES=[{id:'C',bonus:10,cost:1},{id:'B',bonus:20,cost:2},{id:'A',bonus:35,cost:3},{id:'S',bonus:50,cost:5}];
export const discoveryChance=players=>Math.min(1,.2+Math.max(1,players)*.1);
export const starType=id=>STAR_TYPES.find(t=>id?.startsWith('found-'+t.id+'-'));
export const starScene=id=>starType(id)?.scene||id;
export const starDetails=star=>{const type=STAR_TYPES.find(t=>t.id===star.type)||starType(star.id);return {...type,...star,name:star.name||`${type?.name||'별'} · ${star.grade}`,caption:type?`${type.stat} +${star.bonus}${type.unit}${star.occupied?' · NPC 점령 중':''}`:star.caption};};
export const COLONY_ITEMS=[
  {itemId:'IRON_ORE',name:'철광석',icon:'⛏️',description:'채광 로봇이 수집한 광물.',category:'resource'},
  {itemId:'STAR_CORE',name:'별의 핵',icon:'💠',description:'발견한 별을 소유하는 데 사용하는 자원.',category:'resource'},
].map(item=>({...item,rarity:'uncommon',stackable:true,unit:'개',usage:'NPC 교류 · 별 개척'}));
export const NPC_WISHES=[['FLOWER','HERB'],['STAR_RAY','SARDINE'],['IRON_ORE','TOMATO'],['APPLE','STRAWBERRY']];
