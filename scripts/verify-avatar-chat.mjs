import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {chromium} from 'playwright';
import {createServer} from 'node:net';
import {harness} from '../tests/runtimeHarness.mjs';
import {prepareAvatar} from '../tests/pssGameplay.mjs';

const probe=createServer();await new Promise(resolve=>probe.listen(0,'127.0.0.1',resolve));
const port=probe.address().port;await new Promise(resolve=>probe.close(resolve));
const h=await harness({port,publicOrigin:`http://127.0.0.1:${port}`,generateAnswer:async()=>({reply:'반가워! 오늘도 함께 이야기하자.',emotion:'happy',memories:[],provider:'test'})});
let browser;
try{
  const user=await prepareAvatar(h,'avatar_chat_browser');
  browser=await chromium.launch({headless:true,channel:process.platform==='win32'?'msedge':undefined});
  const context=await browser.newContext({viewport:{width:1652,height:952},reducedMotion:'reduce'});
  await context.addCookies([{name:'pieona_session',value:user.cookie.split('=')[1],url:h.base||`http://127.0.0.1:${h.runtime.server.address().port}`}]);
  await context.addInitScript(({uid,slot})=>{
    localStorage.setItem('pieona.tutorial.v1.'+uid,'seen');
    localStorage.setItem('illova.card.seen.'+uid+'.'+slot,slot+':1');
    localStorage.setItem('pieona.bgm.v1',JSON.stringify({enabled:false,volume:0}));
  },{uid:user.id,slot:user.activeSlot});
  const page=await context.newPage(),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto(`http://127.0.0.1:${h.runtime.server.address().port}/?view=village`);
  await page.locator('.scene-canvas canvas').waitFor();
  await page.locator('.scene-loading').waitFor({state:'hidden'});
  await page.waitForTimeout(1500);
  mkdirSync('artifacts/avatar-chat',{recursive:true});
  await page.screenshot({path:'artifacts/avatar-chat/initial.png'});
  assert.equal(await page.locator('.chat-dock').count(),0);
  assert.equal(await page.getByRole('button',{name:'아바타와 이야기',exact:true}).count(),0);
  const canvas=page.locator('.scene-canvas canvas'),rect=await canvas.boundingBox();
  // Scan the owner's projected central position without using application internals.
  for(const [x,y] of [[.36,.5],[.36,.46],[.4,.5],[.5,.43],[.5,.49]]){
    if(await page.locator('.avatar-chat-prompt').count())break;
    await page.mouse.click(rect.x+rect.width*x,rect.y+rect.height*y);
    await page.waitForTimeout(150);
  }
  const prompt=page.getByRole('button',{name:'대화하기',exact:false});
  await prompt.waitFor({timeout:5000});
  assert.equal(await page.locator('.chat-dock').count(),0);
  await page.screenshot({path:'artifacts/avatar-chat/selected.png'});
  await prompt.click();
  await page.waitForTimeout(1000);
  await page.screenshot({path:'artifacts/avatar-chat/opening.png'});
  await page.locator('#chat-input').waitFor();
  await page.waitForTimeout(1000);
  assert.equal(await page.locator('.avatar-chat-prompt').count(),0);
  await page.locator('#chat-input').fill('안녕!');
  await page.locator('#chat-input').press('Enter');
  await page.getByText('반가워! 오늘도 함께 이야기하자.',{exact:true}).waitFor();
  assert.equal(await page.locator('.avatar-speech,.village-speech').count(),0);
  await page.screenshot({path:'artifacts/avatar-chat/conversation.png'});
  await page.getByRole('button',{name:'대화창 끄기'}).click();
  assert.equal(await page.locator('.chat-dock').count(),0);
  await page.waitForTimeout(800);
  await page.screenshot({path:'artifacts/avatar-chat/closed.png'});
  await page.mouse.click(rect.x+rect.width*.36,rect.y+rect.height*.5);
  await prompt.waitFor();
  await prompt.click();
  await page.getByText('반가워! 오늘도 함께 이야기하자.',{exact:true}).waitFor();
  await page.setViewportSize({width:390,height:844});
  await page.getByRole('button',{name:'대화창 끄기'}).waitFor();
  const closeRect=await page.getByRole('button',{name:'대화창 끄기'}).boundingBox();
  assert.ok(closeRect.x>=0&&closeRect.x+closeRect.width<=390,'close stays accessible on mobile');
  await page.screenshot({path:'artifacts/avatar-chat/mobile.png'});
  await page.getByRole('button',{name:'대화창 끄기'}).click();
  assert.equal(await page.locator('.chat-dock').count(),0);
  assert.deepEqual(errors,[]);
  console.log('PASS: selection, explicit start, no bubbles, close, retained conversation on reopen, mobile close; no browser errors.');
}finally{await browser?.close();await h.close();}
