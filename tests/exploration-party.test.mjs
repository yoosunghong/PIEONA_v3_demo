import nodeTest from 'node:test';
const test=(name,fn)=>nodeTest(name,{skip:'Forest gameplay retired; replaced by stars.test.mjs'},fn);
import assert from 'node:assert/strict';
import {harness} from './runtimeHarness.mjs';
import {createExploration} from '../shared/exploration.mjs';
const seed=(h,u,s)=>h.runtime.store.run('INSERT INTO exploration_progress VALUES(?,?) ON CONFLICT(owner_id) DO UPDATE SET state=excluded.state',u.id,JSON.stringify(s));
async function friends(h,a,b){await h.request('/friends/'+b.id,a,{});await h.request('/friends/'+a.id,b,{});}
async function invite(h,a,b){const r=await h.request('/exploration/invite',a,{friendId:b.id});assert.equal(r.status,200,JSON.stringify(r.body));return r.body.id;}
async function accept(h,b,id){const r=await h.request('/exploration/invitations/'+id,b,{accept:true});assert.equal(r.status,200,JSON.stringify(r.body));}

test('only invited accepted friends can join; accepting and harvesting cannot duplicate rewards',async()=>{
 let time=1000;const h=await harness({explorationClock:()=>time});try{
  const a=await h.register('party_leader'),b=await h.register('party_friend'),c=await h.register('party_stranger');await friends(h,a,b);
  assert.equal((await h.request('/exploration/invite',a,{friendId:c.id})).status,403);
  const id=await invite(h,a,b);assert.equal((await h.request('/exploration/invitations/'+id,c,{accept:true})).status,409);await accept(h,b,id);
  assert.equal((await h.request('/exploration/invitations/'+id,b,{accept:true})).status,409);
  for(const u of [a,b]){const s=(await h.request('/exploration',u)).body.state;s.position={x:-3.7,z:3.5};seed(h,u,s);}
  time+=1000;const body={requestId:'party-harvest-once',targetId:'mushroom-1'};
  const harvest=await h.request('/exploration/interact',a,body);assert.equal(harvest.status,200,JSON.stringify(harvest.body));
  assert.equal((await h.request('/exploration/interact',b,{...body,requestId:'party-no-duplicate'})).status,400);
  const peer=(await h.request('/exploration',b)).body.state;assert.equal(peer.nodes.find(n=>n.id==='mushroom-1').hp,0);assert.equal(peer.inventory.mushroom,0);assert.equal(peer.party.peers[0].id,a.id);assert.equal(peer.party.peers[0].inventory,undefined);
  const result=await h.request('/exploration/return',a,{requestId:'party-return-once'});assert.equal(result.body.state.lastExpedition.items.mushroom,1);assert.equal(result.body.state.outdoorProfile.values.cooperation,51);
  assert.equal((await h.request('/exploration',b)).body.state.party.peers.length,0);
 }finally{await h.close();}
});
test('return emits a leave notice and a disconnected participant times out without ending the other player trip',async()=>{
 let time=1000;const h=await harness({explorationClock:()=>time});try{
  const a=await h.register('party_notice_a'),b=await h.register('party_notice_b');await friends(h,a,b);await accept(h,b,await invite(h,a,b));const socket=await h.connect(a);
  const notice=new Promise(resolve=>socket.once('exploration:left',resolve));await h.request('/exploration/return',b,{requestId:'notice-return-001'});assert.equal((await notice).nickname,b.nickname);
  await accept(h,b,await invite(h,a,b));time+=16001;const s=(await h.request('/exploration',a)).body.state;assert.equal(s.area,'forest');assert.equal(s.party.peers.length,0);
  assert.equal(h.runtime.store.one('SELECT 1 FROM exploration_members WHERE owner_id=?',b.id),undefined);
 }finally{await h.close();}
});
test('expired invitation and blocked peers cannot access a forest party',async()=>{
 let time=1000;const h=await harness({explorationClock:()=>time});try{const a=await h.register('party_privacy_a'),b=await h.register('party_privacy_b');await friends(h,a,b);const id=await invite(h,a,b);time+=60001;assert.equal((await h.request('/exploration/invitations/'+id,b,{accept:true})).status,409);
  await accept(h,b,await invite(h,a,b));await h.request('/blocks/'+a.id,b,{});const s=(await h.request('/exploration',a)).body.state;assert.equal(s.party.peers.length,0);
 }finally{await h.close();}
});
test('trait return is persisted by avatar slot and request retries cannot apply it twice',async()=>{
 const h=await harness();try{const u=await h.register('outdoor_persist'),s=createExploration();s.outdoorTrip.completed={'tree-1':'wood'};seed(h,u,s);
  const body={requestId:'traits-return-once'},r=await h.request('/exploration/return',u,body);assert.equal(r.status,200);assert.equal(r.body.state.outdoorProfile.values.persistence,51);
  await h.request('/exploration/return',u,body);const profile=(await h.request('/me/outdoor-traits',u)).body.profile;assert.equal(profile.values.persistence,51);
  const active=h.runtime.personaScripts.current(u.id);assert.ok(active.persona.activity>.5);
  const stranger=await h.register('outdoor_private');assert.equal((await h.request('/me/outdoor-traits',stranger)).body.profile.values.persistence,50);
 }finally{await h.close();}
});
test('socket snapshots and movement require an authenticated session and server speed validation',async()=>{
 const h=await harness();try{const u=await h.register('outdoor_socket'),socket=await h.connect(u),snapshot=await h.emit(socket,'exploration:sync',{});assert.equal(snapshot.ok,true);
 const invalid=await h.emit(socket,'exploration:move',{requestId:'socket-teleport-01',position:{x:24,z:18}});assert.equal(invalid.ok,false);assert.match(invalid.error,/멀리/);
 }finally{await h.close();}
});

test('a host can invite three friends who are not friends with one another; the fifth player cannot join',async()=>{
 const h=await harness();try{const host=await h.register('party_four_host'),guests=[];for(let i=0;i<4;i++){const u=await h.register('party_four_guest'+i);await friends(h,host,u);guests.push(u);}
  for(const guest of guests.slice(0,3))await accept(h,guest,await invite(h,host,guest));
  for(const guest of [host,...guests.slice(0,3)])assert.equal((await h.request('/exploration',guest)).body.state.party.peers.length,3);
  assert.equal((await h.request('/exploration/invite',host,{friendId:guests[3].id})).status,409);
 }finally{await h.close();}
});

test('switching avatar slots during a trip preserves the starting avatar learning and isolates the new avatar',async()=>{
 const h=await harness();try{const u=await h.register('outdoor_slot_owner'),first=(await h.request('/slots',u)).body.active,s=createExploration();s.outdoorSlot=first;s.outdoorTrip.completed={'rock-1':'stone'};seed(h,u,s);
  const other='outdoor-secondary-slot',snapshot=JSON.parse(h.runtime.store.one('SELECT snapshot FROM avatar_slots WHERE id=?',first).snapshot);snapshot.nickname='새로운 자아';h.runtime.store.run('INSERT INTO avatar_slots VALUES(?,?,?,?)',other,u.id,JSON.stringify(snapshot),new Date().toISOString());assert.equal((await h.request('/slots/'+other+'/activate',u,{})).status,200);
  const returned=await h.request('/exploration/return',u,{requestId:'slot-original-return'});assert.equal(returned.body.state.outdoorSlot,first);
  assert.equal((await h.request('/me/outdoor-traits',u)).body.profile.values.persistence,50);
  await h.request('/slots/'+first+'/activate',u,{});assert.equal((await h.request('/me/outdoor-traits',u)).body.profile.values.persistence,51);
 }finally{await h.close();}
});

test('creating the first avatar slot migrates legacy outdoor learning and the pending trip',async()=>{
 const h=await harness();try{const u=await h.register('outdoor_legacy_slot'),s=createExploration();s.outdoorSlot='';seed(h,u,s);h.runtime.store.run("UPDATE users SET active_slot='' WHERE id=?",u.id);const profile={values:{curiosity:52,persistence:51,courage:50,cooperation:50},day:'',daily:{}};h.runtime.store.run('INSERT INTO outdoor_profiles VALUES(?,?,?)',u.id,'',JSON.stringify(profile));
  const first=(await h.request('/slots',u)).body.active;assert.ok(first);assert.equal((await h.request('/me/outdoor-traits',u)).body.profile.values.persistence,51);assert.equal(JSON.parse(h.runtime.store.one('SELECT state FROM exploration_progress WHERE owner_id=?',u.id).state).outdoorSlot,first);
 }finally{await h.close();}
});
