import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {harness} from './runtimeHarness.mjs';
import {openStore} from '../server/store.mjs';
import {surveyQuestions,surveyVersion} from '../shared/survey.mjs';
import {SURVEY_REWARD} from '../shared/surveyRewards.mjs';
import {remainingDecoration} from '../shared/world.mjs';
import {villageCatalog} from '../src/villageCatalog.mjs';
import {villageScenery} from '../shared/scenery.mjs';
import {villageSign} from '../shared/sign.mjs';
import {villageGuestbook} from '../shared/guestbook.mjs';

const answers=()=>Object.fromEntries(surveyQuestions.filter(q=>q.type!=='text').map(q=>[q.id,q.type==='rating'?3:{selected:[0]}]));
const look={petType:'babyDragon',petColor:'#e8efff'};
test('submission grants one permanent reward, rejects forged pets and nests, and persists cosmetics and placement',async()=>{
  const h=await harness();
  try{
    const user=await h.register('dragon_reward'),visitor=await h.register('dragon_visitor');
    const nest={id:randomUUID(),type:'dragonNest',x:-3,z:-3.5,rotation:0};
    assert.deepEqual((await h.request('/me',user)).body.user.rewards,[]);
    assert.equal((await h.request('/me/pet/appearance',user,look,'PATCH')).status,403);
    const avatarAppearance={...look,hat:'none',accessory:'none',color:'#88b5d7'};
    assert.equal((await h.request('/me/world',user,{avatarAppearance},'PATCH')).status,403);
    assert.equal((await h.request('/me/world',user,{avatarCharacterLooks:{pio:avatarAppearance}},'PATCH')).status,403);
    assert.equal((await h.request('/me/world',user,{village:{items:[{...nest,hidden:true}]}},'PATCH')).status,403);
    assert.equal((await h.request('/survey/defer',user,{})).status,200);
    assert.deepEqual((await h.request('/me',user)).body.user.rewards,[]);
    const invalid=answers();delete invalid.q1;
    assert.equal((await h.request('/feedback',user,{version:surveyVersion,answers:invalid})).status,400);
    assert.equal(h.runtime.store.one('SELECT COUNT(*) n FROM account_rewards').n,0);
    const results=await Promise.all([1,2].map(()=>h.request('/feedback',user,{version:surveyVersion,answers:answers()})));
    assert.deepEqual(results.map(r=>r.status).sort(),[201,409]);
    assert.equal(h.runtime.store.one('SELECT COUNT(*) n FROM account_rewards WHERE user_id=?',user.id).n,1);
    assert.equal(h.runtime.store.one('SELECT COUNT(*) n FROM survey_responses').n,1);
    const rewarded=(await h.request('/me',user)).body.user;
    assert.deepEqual(rewarded.rewards,[SURVEY_REWARD]);
    assert.equal(villageCatalog([],rewarded.rewards).find(i=>i.id==='dragonNest').remaining,1);
    for(const petColor of ['#e8efff','#514475','#b4dfc0','#f5bdce','#78635f'])assert.equal((await h.request('/me/pet/appearance',user,{...look,petColor},'PATCH')).status,200);
    assert.equal((await h.request('/me/world',user,{village:{items:[nest]}},'PATCH')).status,200);
    // A browser sends the whole editor snapshot. Its trig results may differ
    // from Node by a few ULPs; untouched, overlapping default scenery must stay valid.
    const scenery=villageScenery({}).map(({id,x,z,rotation,hidden=false})=>({id:id.slice(8),x:x+1e-14,z:z-1e-14,rotation,hidden}));
    const sign=(({x,z,rotation,hidden=false})=>({x,z,rotation,hidden}))(villageSign({}));
    const guestbook=(({x,z,rotation,hidden=false})=>({x,z,rotation,hidden}))(villageGuestbook({}));
    assert.equal((await h.request('/me/world',user,{village:{items:[nest],scenery,sign,guestbook}},'PATCH')).status,200);
    assert.equal((await h.request('/me/world',user,{village:{items:[nest,{...nest,id:randomUUID(),x:-4.5,hidden:true}]}},'PATCH')).status,400);
    const publicUser=(await h.request('/users/'+user.id,visitor)).body.user;
    assert.equal(publicUser.avatarAppearance.petType,'dog');
    assert.equal(publicUser.village.items[0].type,'dragonNest');
    assert.equal(publicUser.rewards,undefined);
    const stored={...nest,hidden:true};
    assert.equal((await h.request('/me/world',user,{village:{items:[stored]}},'PATCH')).status,200);
    assert.equal(remainingDecoration([stored],'dragonNest',rewarded.rewards),1);
    const logged=await h.request('/auth/login',null,{username:user.username,password:'village-test-password'});
    assert.deepEqual(logged.body.user.rewards,[SURVEY_REWARD]);assert.equal(logged.body.user.avatarAppearance.petType,'dog');
    assert.deepEqual(logged.body.user.village.items,[stored]);
  }finally{await h.close();}
});
test('unearned nest stock is zero and storage cannot duplicate the one earned nest',()=>{
  assert.equal(remainingDecoration([],'dragonNest'),0);
  assert.equal(remainingDecoration([],'dragonNest',[SURVEY_REWARD]),1);
  assert.equal(remainingDecoration([{type:'dragonNest'}],'dragonNest',[SURVEY_REWARD]),0);
  assert.equal(remainingDecoration([{type:'dragonNest',hidden:true}],'dragonNest',[SURVEY_REWARD]),1);
});
test('existing survey participants are backfilled once across database restarts and questionnaire versions',()=>{
  const folder=mkdtempSync(join(tmpdir(),'illova-dragon-')),path=join(folder,'test.sqlite');let store;
  try{
    store=openStore(path);
    for(const [userId,completed] of [['complete',1],['pending',0]]){
      store.run('INSERT INTO users(id,username,password,created_at) VALUES(?,?,?,?)',userId,userId,'test','2026-10-24');
      store.run('INSERT INTO survey_participation(user_id,completed,version) VALUES(?,?,?)',userId,completed,surveyVersion-1);
    }
    store.close();store=openStore(path);
    assert.deepEqual(store.all('SELECT * FROM account_rewards').map(r=>({...r})),[{user_id:'complete',reward_id:SURVEY_REWARD}]);
    store.run('UPDATE survey_participation SET completed=0,version=? WHERE user_id=?',surveyVersion,'complete');
    store.close();store=openStore(path);assert.equal(store.one('SELECT COUNT(*) n FROM account_rewards').n,1);
  }finally{store?.close();rmSync(folder,{recursive:true,force:true});}
});
