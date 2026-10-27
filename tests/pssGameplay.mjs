import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {FISHING_PERIOD} from '../shared/life.mjs';
import {villageLife} from '../shared/lifeLayout.mjs';
import {balanceQuestions} from '../shared/onboarding.mjs';

export async function prepareAvatar(h,name='pss_owner'){
 const u=await h.register(name);
 h.runtime.store.run('UPDATE users SET nickname=? WHERE id=?','검증 아바타',u.id);
 const r=await h.request('/balance',u,{answers:balanceQuestions.map(q=>({id:q.id,choice:'a'}))});assert.equal(r.status,200);
 return {...r.body.user,cookie:u.cookie};
}
export async function say(h,u,text){const c=await h.request('/conversations',u,{targetId:u.id});assert.equal(c.status,201);const r=await h.request(`/conversations/${c.body.id}/messages`,u,{text});assert.equal(r.status,200,JSON.stringify(r.body));return c.body.id;}
export async function update(h,u,text){
 await say(h,u,text);const p=await h.request('/me/pss/propose',u,{consent:true});assert.equal(p.status,200,JSON.stringify(p.body));
 const body={proposalId:p.body.proposalId},g=await h.request('/me/pss/generate',u,body);assert.equal(g.status,200,JSON.stringify(g.body));
 const a=await h.request('/me/pss/apply',u,body);assert.equal(a.status,200,JSON.stringify(a.body));return {proposal:p.body,preview:g.body,active:a.body};
}
export function gameplay(h,u,socket,setRolls){
 const layout=()=>villageLife(JSON.parse(h.runtime.store.one('SELECT village FROM users WHERE id=?',u.id).village));
 async function moveToSeat(){const anchor=layout().anchors.find(a=>!a.hidden);socket.emit('village:move',{villageId:u.id,x:anchor.x,z:anchor.z,rotation:0,moving:false,seatId:null,jumpStarted:0});await h.emit(socket,'village:join',{villageId:u.id});return anchor;}
 async function start(){if(h.runtime.life.active(u.id))await h.emit(socket,'life:stop',{});const anchor=await moveToSeat(),r=await h.emit(socket,'life:start',{anchorId:anchor.id});assert.equal(r.ok,true,JSON.stringify(r));}
 async function catchFish(rolls){if(!h.runtime.life.active(u.id))await start();setRolls(rolls);h.advance(FISHING_PERIOD);}
 async function job(action){const r=await h.request('/me/life/actions',u,{requestId:randomUUID(),action});assert.equal(r.status,200,JSON.stringify(r.body));h.advance(20000);assert.equal(h.runtime.life.snapshot(u.id).task,null);}
 async function stop(){if(h.runtime.life.active(u.id))await h.emit(socket,'life:stop',{});}
 const plot=()=>h.runtime.life.snapshot(u.id).garden.plots[0];
 async function clearPlot(){const p=plot();if(p.cropId){h.advance(20*60000);await job({intent:'HARVEST_CROP',plot:p.id});}}
 const cases={
  'fishing.start':start,
  'fishing.result.success':()=>catchFish([0,0,0]),
  'fishing.result.failure':()=>catchFish([.99]),
  'fishing.result.rare':()=>catchFish([0,.96,0]),
  'garden.plant.complete':async()=>{await stop();await clearPlot();await job({intent:'PLANT_SEED',crop:'HERB',plot:plot().id});},
  'garden.harvest.complete':async()=>{await stop();if(!plot().cropId)await job({intent:'PLANT_SEED',crop:'HERB',plot:plot().id});h.advance(5*60000);await job({intent:'HARVEST_CROP',plot:plot().id});},
  'cooking.complete':async()=>{await stop();await start();await catchFish([0,0,0]);await stop();await job({intent:'COOK_FOOD',recipe:'GRILLED_FISH'});}
 };
 return {cases,start,stop,moveToSeat,job};
}
