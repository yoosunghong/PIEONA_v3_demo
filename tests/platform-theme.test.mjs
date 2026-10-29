import test from 'node:test';
import assert from 'node:assert/strict';
import {harness} from './runtimeHarness.mjs';
import {villageThemes,normalizeVillageTheme} from '../shared/world.mjs';
import {DEFAULT_PLATFORM_COLOR,isPlatformColor} from '../shared/platform.mjs';

test('retired themes resolve to the Milky Way without appearing in the catalog',()=>{
  assert.deepEqual(villageThemes.map(t=>t.id),['milkyway','cafe','twilight','sunset']);
  for(const id of [undefined,'default','campfire','unknown'])assert.equal(normalizeVillageTheme(id),'milkyway');
  for(const color of ['#123456','#ABCDEF',DEFAULT_PLATFORM_COLOR])assert.ok(isPlatformColor(color));
  for(const color of ['red','#fff','url(x)',null])assert.equal(isPlatformColor(color),false);
});
test('platform color persists independently from every theme, including reload and legacy migration',async()=>{
 const h=await harness();try{
  const user=await h.register('floor_color_owner');
  const original={theme:'campfire',items:[]};h.runtime.store.run('UPDATE users SET village=? WHERE id=?',JSON.stringify(original),user.id);
  let profile=(await h.request('/me',user)).body.user;
  assert.equal(profile.village.theme,'milkyway');assert.equal(profile.village.platformColor,DEFAULT_PLATFORM_COLOR);
  let r=await h.request('/me/world',user,{village:{platformColor:'#34ABCD'}},'PATCH');assert.equal(r.status,200);assert.equal(r.body.user.village.platformColor,'#34abcd');
  for(const {id} of villageThemes){r=await h.request('/me/world',user,{village:{theme:id}},'PATCH');assert.equal(r.status,200);assert.equal(r.body.user.village.platformColor,'#34abcd');assert.equal(r.body.user.village.theme,id);}
  profile=(await h.request('/me',user)).body.user;assert.equal(profile.village.platformColor,'#34abcd');
  r=await h.request('/me/world',user,{village:{theme:'default'}},'PATCH');assert.equal(r.status,200);assert.equal(r.body.user.village.theme,'milkyway');assert.equal(r.body.user.village.platformColor,'#34abcd');
  assert.equal((await h.request('/me/world',user,{village:{platformColor:'red'}},'PATCH')).status,400);
  assert.equal((await h.request('/me/world',null,{village:{platformColor:'#ffffff'}},'PATCH')).status,401);
  assert.equal(JSON.parse(h.runtime.store.one('SELECT village FROM users WHERE id=?',user.id).village).platformColor,'#34abcd');
 }finally{await h.close();}
});
