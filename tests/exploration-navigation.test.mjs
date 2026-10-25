import test from 'node:test';
import assert from 'node:assert/strict';
import {villageUrl,villageView,demoVillageView,explorationDeparture,createDemoVillageRequest,EXPLORATION_DEMO_KEY} from '../src/explorationNavigation.mjs';
import {createExploration,returnExploration} from '../shared/exploration.mjs';

test('account and guest returns both select the original village view',()=>{
 for(const demo of [false,true]){const destination=new URL(villageUrl(demo),'http://localhost');assert.equal(destination.pathname,'/');assert.equal(villageView(destination.search),true);assert.equal(demoVillageView(destination.search),demo);}
 assert.equal(demoVillageView('?demo=1'),false);
 assert.equal(explorationDeparture(''),false);assert.equal(explorationDeparture('?depart=1'),true);assert.equal(explorationDeparture('?view=village'),false);
});

test('guest village profile retains exploration level and crafted decorations without changing progress',async()=>{
 const s=createExploration();s.level=2;s.xp=10;s.placed=['bench'];s.inventory.wood=9;s.fatigue=1;returnExploration(s);
 const saved=JSON.stringify(s),storage={getItem:key=>key===EXPLORATION_DEMO_KEY?saved:null},request=createDemoVillageRequest(storage);
 const {user}=await request('/me');assert.equal(user.nickname,'유성');assert.equal(user.level,2);assert.equal(user.levelXp,10);assert.equal(user.village.items[0].type,'bench');assert.equal(storage.getItem(EXPLORATION_DEMO_KEY),saved);
 const snapshot=await request('/me');user.village.items.length=0;assert.equal(snapshot.user.village.items.length,1);
});

test('guest village requests allow loading the existing UI but cannot authorize server mutations',async()=>{
 const request=createDemoVillageRequest({getItem:()=>null});
 assert.deepEqual((await request('/users')).users,[]);assert.equal((await request('/survey/status')).eligible,false);assert.equal((await request('/me/conversation')).conversation,null);
 await assert.rejects(request('/me/world',{method:'PATCH',body:{gold:999999}}),e=>e.status===403);
 await assert.rejects(request('/auth/login',{method:'POST'}),e=>e.status===403);
});
