import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {chromium} from 'playwright';
import {harness} from '../tests/runtimeHarness.mjs';
import {fixtureProvider} from '../tests/pssFixtures.mjs';
import {prepareAvatar,update} from '../tests/pssGameplay.mjs';
const h=await harness({port:43463,publicOrigin:'http://127.0.0.1:43463',personaProvider:fixtureProvider(),generateAnswer:async()=>({reply:'검증 대화',emotion:'calm',memories:[],provider:'fixture'})});let browser;
try{
 const a=await h.register('saved_forest_ui'),b=await prepareAvatar(h,'saved_forest_companion');
 const {active}=await update(h,b,'조용한 존댓말');await h.request('/friends/'+b.id,a,{});await h.request('/friends/'+a.id,b,{});
 await h.request('/exploration/return',a,{requestId:'return-before-saved-ui'});
 browser=await chromium.launch({headless:true,channel:'msedge'});const context=await browser.newContext({viewport:{width:1440,height:900}});
 const [name,value]=a.cookie.split('=');await context.addCookies([{name,value,url:'http://127.0.0.1:43463'}]);
 const page=await context.newPage();await page.goto('http://127.0.0.1:43463/explore?depart=1');await page.getByRole('button',{name:'검증 아바타 아바타와 동행'}).click();await page.getByRole('button',{name:'숲으로 출발',exact:true}).click();await page.locator('.exp-loading').waitFor({state:'detached',timeout:90000});
 const evidence=[];mkdirSync('tmp/saved-forest-ui',{recursive:true});
 for(const [task,text] of [['logging','나무'],['mining','돌'],['gathering','버섯'],['follow','따라와'],['return','복귀'],['rest','중단'],['attack','슬라임 공격']]){
  const ids=new Set();for(let i=0;i<3;i++){
   const input=page.getByRole('textbox',{name:'AI 친구 명령'});if(!await input.isVisible())await page.getByRole('button',{name:'동행 친구에게 부탁하기',exact:true}).click();
   await input.fill(text);const response=page.waitForResponse(r=>r.url().endsWith('/api/exploration/command')&&r.request().method()==='POST');await page.getByRole('button',{name:'친구에게 명령 보내기'}).click();const r=await response;assert.equal(r.status(),200);const {state}=await r.json();const line=state.dialogue;
   const expected=active.scripts.events.find(e=>e.eventId===`request.${task}.accept`);assert.ok(expected.variants.some(v=>v.id===line.variantId&&v.text===line.text));ids.add(line.variantId);
   const bubble=page.getByRole('status').filter({hasText:line.text});await bubble.waitFor({state:'visible'});assert.equal(await bubble.getByText(line.text,{exact:true}).innerText(),line.text);
   const path=`tmp/saved-forest-ui/${task}-${i}.png`;await bubble.screenshot({path});evidence.push({eventId:line.eventId,variantId:line.variantId,text:line.text,screenshot:path});
  }assert.equal(ids.size,3);console.log('PASS '+task);
 }
 writeFileSync('tmp/saved-forest-ui/evidence.json',JSON.stringify(evidence,null,2));console.log('PASS: all 21 applied forest request variants rendered through real UI commands');
}finally{await browser?.close();await h.close();}
