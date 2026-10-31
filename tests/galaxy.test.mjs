import test from 'node:test';
import assert from 'node:assert/strict';
import {harness} from './runtimeHarness.mjs';
import {galaxyNpcs,constellationFor,galaxyLayout} from '../shared/galaxy.mjs';
import {initializeGalaxy} from '../server/galaxy.mjs';

test('galaxy uses actual ownership, level eligibility and privacy, with persistent visitable NPCs',async()=>{
 const h=await harness();try{
  const viewer=await h.register('galaxy_viewer'),low=await h.register('galaxy_low'),high=await h.register('galaxy_high'),hidden=await h.register('galaxy_hidden');
  for(const u of [high,hidden])h.runtime.store.run('INSERT INTO avatar_legacy_experience VALUES(?,?,?)',u.id,'',200);
  h.runtime.store.run('UPDATE users SET settings=? WHERE id=?',JSON.stringify({stageVisible:false}),hidden.id);
  h.runtime.store.run('INSERT INTO owned_stars VALUES(?,?,?)',high.id,'test-earned','획득한 별');
  const r=await h.request('/galaxy',viewer);assert.equal(r.status,200);
  assert.ok(r.body.users.some(u=>u.id===viewer.id));assert.ok(!r.body.users.some(u=>u.id===low.id||u.id===hidden.id));assert.equal(r.body.users.find(u=>u.id===high.id).starCount,4);
  for(const npc of galaxyNpcs){const u=r.body.users.find(u=>u.id===npc.id);assert.equal(u.nickname,npc.nickname);assert.equal(u.starCount,npc.count);assert.equal(u.isNpc,true);assert.equal(u.level,npc.level);assert.equal(u.starNames.length,u.starCount);assert.equal((await h.request('/visits',viewer,{targetId:npc.id})).status,200);}
  initializeGalaxy(h.runtime.store);assert.equal(h.runtime.store.one('SELECT COUNT(*) AS n FROM users').n,8);
  const socket=await h.connect(viewer);for(const npc of galaxyNpcs){const joined=await h.emit(socket,'galaxy:travel',{targetId:npc.id});assert.equal(joined.ok,true);assert.equal(joined.members.find(m=>m.userId===viewer.id).starId,'plaza');}
  assert.equal((await h.emit(socket,'galaxy:travel',{targetId:low.id})).ok,false);
  assert.equal((await h.emit(socket,'galaxy:travel',{targetId:hidden.id})).ok,false);
  assert.equal((await h.emit(socket,'galaxy:travel',{targetId:high.id})).ok,true);
  h.runtime.store.run('UPDATE users SET settings=? WHERE id=?',JSON.stringify({allowVisitors:false}),high.id);
  assert.equal((await h.emit(socket,'galaxy:travel',{targetId:high.id})).ok,false);
  assert.equal((await h.emit(socket,'galaxy:travel',{targetId:viewer.id})).ok,true);
  assert.equal((await h.emit(socket,'galaxy:travel',{targetId:'invalid-id'})).ok,false);
  h.runtime.store.run('INSERT INTO blocks VALUES(?,?)',high.id,viewer.id);assert.ok(!(await h.request('/galaxy',viewer)).body.users.some(u=>u.id===high.id));
  assert.equal((await h.request('/galaxy')).status,401);
 }finally{await h.close();}
});

test('constellations preserve every owned star with stable separated points and a connected graph',()=>{
 for(const count of [0,1,3,5,8,30,100]){
  const graph=constellationFor('test-player',count);assert.equal(graph.points.length,count);assert.equal(graph.edges.length,Math.max(0,count-1));assert.deepEqual(graph,constellationFor('test-player',count));
  if(count>0)assert.deepEqual(graph.points[0],{x:90,y:103},'the owned plaza is always at the constellation center');
  assert.ok(graph.points.every(p=>Number.isFinite(p.x)&&p.x>=22&&p.x<=158&&p.y>=23&&p.y<=183));
  const connected=new Set(count?[0]:[]);for(const [a,b] of graph.edges){assert.ok(connected.has(a));connected.add(b);}assert.equal(connected.size,count);
 }
 assert.notDeepEqual(constellationFor('a',5),constellationFor('b',5));
 const users=galaxyNpcs.map(n=>({...n,isNpc:true,starCount:n.count}));assert.deepEqual(galaxyLayout(users,'me'),galaxyLayout([...users].reverse(),'me'));
});
