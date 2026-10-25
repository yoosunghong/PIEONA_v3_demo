import {createExploration,upgradeExploration,XP_LIMITS} from '../shared/exploration.mjs';

export const EXPLORATION_DEMO_KEY='illova.exploration.demo.v1';
export const villageUrl=demo=>demo?'/?view=village&demo=1':'/?view=village';
export const villageView=search=>new URLSearchParams(search).get('view')==='village';
export const demoVillageView=search=>villageView(search)&&new URLSearchParams(search).get('demo')==='1';
export const explorationDeparture=search=>new URLSearchParams(search).get('depart')==='1';

// The anonymous exploration returns to the same village UI as account players,
// with a local profile. This adapter never grants server credentials or rewards.
export function demoVillageUser(storage){
 let progress;try{progress=JSON.parse(storage.getItem(EXPLORATION_DEMO_KEY));}catch{}
 progress=upgradeExploration(progress?.version===1?progress:createExploration(Date.now(),true));
 const look={character:'pio',hat:'crown',accessory:'none',color:'#88b5d7'};
 return {id:'local-exploration-demo',nickname:'유성',username:'local-demo',intro:'숲과 마을을 둘러보는 중',theme:'sage',gold:0,level:progress.level,xp:XP_LIMITS.slice(0,progress.level-1).reduce((sum,n)=>sum+n,0)+progress.xp,levelXp:progress.xp,nextLevelXp:XP_LIMITS[progress.level-1]||0,stage:progress.level-1,activeSlot:'local-exploration-demo',balance:[{id:'demo',choice:'a'}],rewards:[],tags:[],appearance:look,avatarAppearance:{...look,petType:'dog',petColor:'#fff5e7'},characterLooks:{pio:look},avatarCharacterLooks:{pio:look},village:{theme:'default',items:progress.placed.map((type,i)=>({id:'demo-crafted-'+i,type,x:Math.cos(i*2.4)*4,z:Math.sin(i*2.4)*4,rotation:0}))},settings:{scene:'garden',publicTags:[],allowVisitors:false,allowTopics:false,receiveTranscripts:false,stageVisible:true,questionFrequency:'never',speechStyle:'편안하게'},allowVisitors:false,allowTopics:false,receiveTranscripts:false,createdAt:new Date().toISOString()};
}

export function createDemoVillageRequest(storage){
 return async function request(path,options={}){
  if(path==='/me'&&(!options.method||options.method==='GET'))return {user:demoVillageUser(storage),ai:'local'};
  if(path==='/users')return {users:[]};
  if(path==='/survey/status')return {eligible:false,completed:true,deferred:true};
  if(path==='/me/conversation')return {conversation:null};
  if(path==='/me/questions/arrival')return {question:null};
  if(path==='/questions')return {daily:[]};
  throw Object.assign(new Error('이 기능은 로그인 후 사용할 수 있어요. 숲 탐험과 공방은 체험 모드에서도 이용할 수 있어요.'),{status:403});
 };
}
