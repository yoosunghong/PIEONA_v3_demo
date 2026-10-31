import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {chromium} from 'playwright';
import {harness} from '../tests/runtimeHarness.mjs';
import {prepareAvatar} from '../tests/pssGameplay.mjs';
import {galaxyNpcs} from '../shared/galaxy.mjs';

const h=await harness({port:43201,publicOrigin:'http://127.0.0.1:43201'}),base='http://127.0.0.1:43201';let browser;const errors=[];
try{
 const user=await prepareAvatar(h,'npc_visual');browser=await chromium.launch({headless:true,channel:process.platform==='win32'?'msedge':undefined});
 const context=await browser.newContext({viewport:{width:1440,height:960},reducedMotion:'reduce'});
 await context.addCookies([{name:'pieona_session',value:user.cookie.split('=')[1],url:base}]);
 await context.addInitScript(({id,slot})=>{localStorage.setItem('pieona.tutorial.v1.'+id,'seen');localStorage.setItem('illova.card.seen.'+id+'.'+slot,slot+':1');localStorage.setItem('pieona.peopleCollapsed','true');localStorage.setItem('pieona.bgm.v1',JSON.stringify({enabled:false,volume:0}));},{id:user.id,slot:user.activeSlot});
 const page=await context.newPage();page.setDefaultTimeout(60000);page.on('pageerror',e=>errors.push(e.message));await page.goto(base+'/?view=village');await page.locator('.scene-loading').waitFor({state:'hidden'});mkdirSync('artifacts/npc-villages',{recursive:true});
 for(const npc of galaxyNpcs){
  await page.getByRole('button',{name:'은하 지도',exact:true}).click();await page.locator('.galaxy-open').waitFor();await page.getByRole('button',{name:new RegExp('^'+npc.nickname+'의 별자리')}).click();await page.getByRole('dialog',{name:'은하 지도',exact:true}).waitFor({state:'hidden'});
  await page.getByRole('heading',{name:npc.nickname+'의 광장별',exact:true}).waitFor();await page.locator('.scene-loading').waitFor({state:'hidden'});assert.equal(await page.locator('.scene-error').count(),0);assert.equal(await page.locator('.scene-canvas canvas').getAttribute('data-village-theme'),npc.villageTheme);await page.waitForTimeout(700);await page.screenshot({path:`artifacts/npc-villages/${npc.character}.png`});
 }
 assert.deepEqual(errors,[]);console.log('NPC villages browser QA passed: all four native characters and themed villages rendered and visited without runtime errors.');
}finally{await browser?.close();await h.close();}
