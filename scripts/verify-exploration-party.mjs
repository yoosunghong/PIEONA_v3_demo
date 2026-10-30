import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {chromium} from 'playwright';
import {harness} from '../tests/runtimeHarness.mjs';
const h=await harness({port:43463,publicOrigin:'http://127.0.0.1:43463'}),base='http://127.0.0.1:43463';let browser;
try{
 const a=await h.register('forest_party_ui_a'),b=await h.register('forest_party_ui_b');
 h.runtime.store.run('UPDATE users SET nickname=? WHERE id=?','모모',b.id);
 await h.request('/me/world',b,{appearance:{character:'tori',hat:'beret',accessory:'bow',color:'#d994b6'}},'PATCH');
 await h.request('/friends/'+b.id,a,{});await h.request('/friends/'+a.id,b,{});
 browser=await chromium.launch({headless:true,channel:'msedge'});const contexts=await Promise.all([a,b].map(async u=>{const c=await browser.newContext({viewport:{width:1440,height:900}}),[name,value]=u.cookie.split('=');await c.addCookies([{name,value,url:base}]);return c;}));
 const [leader,friend]=await Promise.all(contexts.map(c=>c.newPage())),errors=[];for(const page of [leader,friend])page.on('pageerror',e=>errors.push(e.message));
 mkdirSync('tmp/exploration-party',{recursive:true});
 await Promise.all([leader,friend].map(p=>p.goto(base+'/explore?depart=1')));
 await leader.getByRole('button',{name:'실제 친구 초대',exact:true}).click();await leader.getByRole('button',{name:'모모 함께 탐험 초대'}).click();await leader.screenshot({path:'tmp/exploration-party/departure.png'});
 await leader.getByRole('button',{name:'친구 초대하고 출발',exact:true}).click();await friend.getByRole('dialog',{name:'친구의 숲 탐험 초대'}).waitFor({timeout:10000});await friend.screenshot({path:'tmp/exploration-party/invitation.png'});
 await friend.getByRole('button',{name:'수락하고 함께 가기',exact:true}).click();await friend.waitForURL(base+'/explore');
 for(const page of [leader,friend]){await page.locator('.exp-world canvas').waitFor();await page.locator('.exp-loading').waitFor({state:'detached',timeout:90000});}
 await leader.getByLabel('함께 탐험 중인 친구').getByText('모모',{exact:true}).waitFor();
 const position=(await h.request('/exploration',b)).body.state.position;
 await friend.keyboard.down('KeyD');await friend.waitForTimeout(1100);await friend.keyboard.up('KeyD');await friend.waitForTimeout(800);
 const after=(await h.request('/exploration',a)).body.state.party.peers.find(p=>p.id===b.id);assert.ok(after.position.x>position.x+1,JSON.stringify(after));assert.equal(after.appearance.character,'tori');
 await leader.locator('.exp-toast').waitFor({state:'detached',timeout:12000});await leader.screenshot({path:'tmp/exploration-party/together.png'});
 for(const hp of [2,1,0]){await leader.getByRole('button',{name:'나무 상호작용',exact:true}).click();await leader.waitForFunction(async expected=>{const r=await fetch('/api/exploration'),s=(await r.json()).state;return s.nodes.find(n=>n.id==='tree-1').hp===expected;},hp,{timeout:20000});if(hp)await leader.waitForTimeout(650);}
 assert.equal((await h.request('/exploration',a)).body.state.inventory.wood,2);
 await friend.getByRole('button',{name:'마을로 귀환',exact:true}).click();await friend.getByRole('dialog',{name:'탐험 결과'}).waitFor();await friend.screenshot({path:'tmp/exploration-party/summary.png'});
 await leader.getByRole('status').filter({hasText:'모모님이 마을로 돌아갔어요.'}).waitFor();assert.equal((await h.request('/exploration',a)).body.state.party.peers.length,0);
 await friend.setViewportSize({width:390,height:844});await friend.screenshot({path:'tmp/exploration-party/summary-mobile.png'});assert.equal(await friend.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 await friend.getByRole('button',{name:'마을로 돌아가기',exact:true}).click();await friend.waitForURL('**/?view=village');
 await leader.getByRole('button',{name:'마을로 귀환',exact:true}).click();await leader.getByRole('dialog',{name:'탐험 결과'}).waitFor();await leader.screenshot({path:'tmp/exploration-party/result-grown.png'});const result=(await h.request('/exploration',a)).body.state.lastExpedition;assert.equal(result.items.wood,2);assert.ok(result.traits.find(t=>t.key==='persistence').delta>0);assert.ok(result.traits.find(t=>t.key==='cooperation').delta>0);
 assert.deepEqual(errors,[]);console.log('PASS: two authenticated browsers, live invitation and acceptance, shared forest, actual appearance, socket movement, departure notice, result summary, mobile and village return; no page errors');
}finally{await browser?.close();await h.close();}
