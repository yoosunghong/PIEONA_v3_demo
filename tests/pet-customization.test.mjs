import test from 'node:test';
import assert from 'node:assert/strict';
import {createApp} from '../server/app.mjs';
import {openStore} from '../server/store.mjs';

test('pet species and colors persist independently of the player and reach visitors',async()=>{
  const runtime=createApp({testing:true,store:openStore(':memory:')});
  await new Promise(resolve=>runtime.server.listen(0,'127.0.0.1',resolve));
  const url=`http://127.0.0.1:${runtime.server.address().port}`;
  async function request(path,user,body,method=body?'POST':'GET'){const r=await fetch(url+'/api'+path,{method,headers:{'Content-Type':'application/json',...(user?{Cookie:user.cookie}:{})},body:body===undefined?undefined:JSON.stringify(body)});return {status:r.status,body:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]};}
  async function register(username){const r=await request('/auth/register',null,{username,password:'pet-test-password'});assert.equal(r.status,201);return {...r.body.user,cookie:r.cookie};}
  try{
  const visitor=await register('pet_visitor');
  const {petTypes,petColors}=await import('../shared/pets.mjs');
  const user=await register('pet_style_owner');
  runtime.store.run('INSERT INTO account_rewards(user_id,reward_id) VALUES(?,?)',user.id,'survey-dragon-v1');
  const original=(await request('/me',user)).body.user.appearance;
  for(const type of petTypes.filter(p=>!p.legacy))for(const color of petColors){
    const avatarAppearance={petType:type.id,petColor:color.id};
    const saved=await request('/me/pet/appearance',user,avatarAppearance,'PATCH');assert.equal(saved.status,200);
    const reloaded=(await request('/me',user)).body.user;
    assert.equal(reloaded.avatarAppearance.petType,type.id);assert.equal(reloaded.avatarAppearance.petColor,color.id);
    assert.deepEqual(reloaded.appearance,original);
    const publicLook=(await request('/users/'+user.id,visitor)).body.user.avatarAppearance;
    assert.equal(publicLook.petType,type.id);assert.equal(publicLook.petColor,color.id);
  }
  const valid=(await request('/me',user)).body.user.avatarAppearance;
  for(const invalid of [{petType:'dragon'},{petType:'rabbit'},{petColor:'#ffffff'}])assert.equal((await request('/me/pet/appearance',user,{petType:valid.petType,petColor:valid.petColor,...invalid},'PATCH')).status,400);
  assert.deepEqual((await request('/me',user)).body.user.avatarAppearance,valid);
  runtime.store.run('UPDATE users SET avatar_appearance=? WHERE id=?',JSON.stringify({...valid,petType:'rabbit'}),user.id);
  assert.equal((await request('/me',user)).body.user.avatarAppearance.petType,'dog');
  assert.equal((await request('/users/'+user.id,visitor)).body.user.avatarAppearance.petType,'dog');
  }finally{await runtime.close();}
});
