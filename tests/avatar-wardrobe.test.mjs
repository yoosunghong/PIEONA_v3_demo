import {defaultPetAppearance} from '../shared/pets.mjs';
import {WALK_RADIUS} from '../shared/villageSize.mjs';
import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {io} from 'socket.io-client';
import {createApp} from '../server/app.mjs';
import {openStore} from '../server/store.mjs';
import {newRun,advanceRun,runAction,jumpHeight,runScore,RUN_DURATION,RUN_EXPIRY} from '../shared/runner.mjs';
import {day} from '../server/store.mjs';
import {existsSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {decorations} from '../shared/world.mjs';
import {villageScenery,sceneryDefinitions} from '../shared/scenery.mjs';

let runtime,url,owner,visitor,third;
async function request(path,user,body,method=body?'POST':'GET'){const r=await fetch(url+'/api'+path,{method,headers:{'Content-Type':'application/json',...(user?{Cookie:user.cookie}:{})},body:body===undefined?undefined:JSON.stringify(body)});return {status:r.status,body:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]};}
async function register(username){const r=await request('/auth/register',null,{username,password:'test-password-world'});assert.equal(r.status,201);await request('/me',{cookie:r.cookie},{nickname:username},'PATCH');return {...r.body.user,cookie:r.cookie};}
before(async()=>{runtime=createApp({testing:true,store:openStore(':memory:')});await new Promise(r=>runtime.server.listen(0,'127.0.0.1',r));url=`http://127.0.0.1:${runtime.server.address().port}`;owner=await register('garden_owner');visitor=await register('garden_visitor');third=await register('garden_third');});
after(async()=>runtime.close());
const piece=()=>({id:randomUUID(),type:'planter',x:-3,z:-3.5,rotation:0});

test('player and AI wardrobes save independently, validate and reach visitors',async()=>{
  const user=await register('ai_wardrobe_owner');
  const original=(await request('/me',user)).body.user;
  const player={character:'luna',hat:'beret',accessory:'bow',color:'#d994b6'};
  const avatar={character:'tori',hat:'crown',accessory:'wings',color:'#c8a0dd'};
  assert.equal((await request('/me/world',user,{appearance:player},'PATCH')).status,200);
  assert.deepEqual((await request('/me',user)).body.user.avatarAppearance,original.avatarAppearance);
  const saved=await request('/me/world',user,{avatarAppearance:avatar,avatarCharacterLooks:{tori:avatar}},'PATCH');
  assert.equal(saved.status,200);assert.deepEqual(saved.body.user.appearance,player);
  assert.deepEqual(saved.body.user.avatarAppearance,{...defaultPetAppearance,...avatar});
  assert.deepEqual(saved.body.user.avatarCharacterLooks.tori,avatar);
  const publicUser=(await request('/users/'+user.id,visitor)).body.user;
  assert.deepEqual(publicUser.avatarAppearance,{...defaultPetAppearance,...avatar});assert.deepEqual(publicUser.appearance,player);
  assert.equal((await request('/me/world',user,{avatarAppearance:{...avatar,character:'invalid'}},'PATCH')).status,400);
  assert.equal((await request('/me/world',user,{appearance:{...player,hat:'sprout'}},'PATCH')).status,200);
  assert.deepEqual((await request('/me',user)).body.user.avatarAppearance,{...defaultPetAppearance,...avatar});
});

test('expanded village accepts furniture beyond the old boundary and rejects its new edge',async()=>{
  const user=await register('expanded_owner');
  assert.equal((await request('/me/world',user,{village:{items:[{...piece(),x:-6.8,z:0}]}},'PATCH')).status,200);
  assert.equal((await request('/me/world',user,{village:{items:[{...piece(),x:-7.1,z:0}]}},'PATCH')).status,400);
});

test('motorcycle selections persist per character and subject and are visible to visitors',async()=>{
  const user=await register('motorcycle_owner');
  const player={character:'pio',hat:'none',accessory:'scarf',color:'#88b5d7',ride:'motorcycle'};
  const avatar={...player,character:'moa',ride:'none'};
  assert.equal((await request('/me/world',user,{appearance:player,characterLooks:{pio:player},avatarAppearance:avatar},'PATCH')).status,200);
  const saved=(await request('/me',user)).body.user;
  assert.equal(saved.appearance.ride,'motorcycle');assert.equal(saved.characterLooks.pio.ride,'motorcycle');assert.equal(saved.avatarAppearance.ride,'none');
  assert.equal((await request('/users/'+user.id,visitor)).body.user.appearance.ride,'motorcycle');
  assert.equal((await request('/me/world',user,{appearance:{...player,ride:'invalid'}},'PATCH')).status,400);
  assert.equal((await request('/me/world',user,{appearance:{...player,ride:'none'},avatarAppearance:{...avatar,ride:'motorcycle'}},'PATCH')).status,200);
  assert.equal((await request('/me',user)).body.user.avatarAppearance.ride,'motorcycle');
});
