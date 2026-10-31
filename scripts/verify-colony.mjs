import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {chromium} from 'playwright';
import * as THREE from 'three';
import {harness} from '../tests/runtimeHarness.mjs';
import {prepareAvatar} from '../tests/pssGameplay.mjs';
import {galaxyNpcs} from '../shared/galaxy.mjs';

const h=await harness({port:3198,publicOrigin:'http://127.0.0.1:3198',colonyRandom:()=>0}),base=`http://127.0.0.1:${h.runtime.server.address().port}`;
let browser;const errors=[];
try{
  const u=await prepareAvatar(h,'colony_visual'),store=h.runtime.store;
  const village=JSON.parse(store.one('SELECT village FROM users WHERE id=?',u.id).village);
  village.items||=[];village.items.push({id:'visual-robot',type:'miningRobot',x:3,z:-1,rotation:0});
  store.run('UPDATE users SET village=? WHERE id=?',JSON.stringify(village),u.id);h.runtime.colony.syncRobots(u.id,village);
  store.run('INSERT INTO inventory_entries VALUES(?,?,?)',u.id,'FLOWER',3);
  browser=await chromium.launch({headless:true,channel:process.platform==='win32'?'msedge':undefined});
  const context=await browser.newContext({viewport:{width:1654,height:951},reducedMotion:'reduce'});
  await context.addCookies([{name:'pieona_session',value:u.cookie.split('=')[1],url:base}]);
  await context.addInitScript(({uid,slot})=>{localStorage.setItem('pieona.tutorial.v1.'+uid,'seen');localStorage.setItem('illova.card.seen.'+uid+'.'+slot,slot+':1');localStorage.setItem('pieona.peopleCollapsed','true');localStorage.setItem('pieona.bgm.v1',JSON.stringify({enabled:false,volume:0}));},{uid:u.id,slot:u.activeSlot});
  const page=await context.newPage();page.setDefaultTimeout(25000);page.on('pageerror',e=>errors.push(e.message));
  mkdirSync('artifacts/colony',{recursive:true});await page.goto(base+'/?view=village');await page.locator('.scene-loading').waitFor({state:'hidden'});await page.waitForTimeout(1600);
  // Click the robot's visible body in world space using the public village camera pose.
  const rect=await page.locator('.scene-canvas canvas').boundingBox(),camera=new THREE.PerspectiveCamera(38,rect.width/rect.height,.1,180);
  camera.position.set(11,17,14);camera.lookAt(0,0,0);camera.updateMatrixWorld();const point=new THREE.Vector3(3,.8,-1).project(camera);
  await page.mouse.click(rect.x+(point.x+1)*rect.width/2,rect.y+(1-point.y)*rect.height/2);
  await page.getByRole('dialog',{name:'채광 로봇 상태'}).waitFor();await page.waitForTimeout(800);await page.screenshot({path:'artifacts/colony/robot.png'});
  await page.getByRole('button',{name:'별 교류 닫기'}).click();
  store.run('INSERT INTO social_game_records VALUES(?,?,?,?,?,?,?)',randomUUID(),u.id,u.id,'chain',10,'{}',new Date().toISOString());
  await page.getByRole('button',{name:/개척 · 편지/}).click();
  await Promise.all([page.waitForResponse(r=>r.url().endsWith('/api/me/colony/claim')),page.getByRole('button',{name:'핵 1개로 내 별로 만들기'}).click()]);
  await page.getByRole('button',{name:'핵 1개로 내 별로 만들기'}).waitFor({state:'hidden'});
  await page.getByRole('heading',{name:'보유한 개척별'}).waitFor();await page.screenshot({path:'artifacts/colony/discovery.png'});
  const star=store.one('SELECT star_id FROM colony_stars WHERE owner_id=?',u.id).star_id;
  await page.getByRole('button',{name:'별 교류 닫기'}).click();await page.getByRole('button',{name:'내 별 보기',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('.star-atlas')?.dataset.phase==='open');
  assert.equal(await page.locator('.star-marker').count(),4);await page.getByRole('button',{name:'초록별 · C 선택',exact:true}).click();await page.screenshot({path:'artifacts/colony/owned-atlas.png'});
  await page.getByRole('button',{name:'초록별 · C로 이동',exact:true}).click();await page.locator('.farm-screen').waitFor();await page.locator('.star-atlas').waitFor({state:'hidden'});
  await page.getByRole('button',{name:'별 지도로 돌아가기',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.star-atlas')?.dataset.phase==='open');await page.getByRole('button',{name:'광장별 선택',exact:true}).click();await page.getByRole('button',{name:'광장별로 이동',exact:true}).click();await page.locator('.star-atlas').waitFor({state:'hidden'});
  await page.getByRole('button',{name:/개척 · 편지/}).click();await page.getByRole('button',{name:'피오나 · 호감 0',exact:true}).click();await page.locator('.colony-npc-actions').waitFor();await page.locator('.colony-npc-actions').getByRole('button',{name:'대화하기',exact:true}).click();
  const panel=page.getByRole('dialog',{name:'NPC 교류'});await panel.getByRole('button',{name:'대화하기',exact:true}).click();await panel.getByText('꽃',{exact:true}).waitFor();
  await panel.getByLabel('줄 아이템').selectOption('FLOWER');await panel.getByRole('button',{name:'올린 아이템 건네기'}).click();await panel.getByText(/별의 핵 1개를 받았어요/).waitFor();await page.screenshot({path:'artifacts/colony/npc-trade.png'});
  await panel.getByRole('button',{name:/내 권리를 주장/}).click();assert.equal(store.one('SELECT status FROM colony_letters WHERE star_id=?',star).status,'kept');
  // A separate contested-star fixture exercises the actual defense screen.
  const letterId=randomUUID();store.run('INSERT INTO colony_letters VALUES(?,?,?,?,?,?,?,?)',letterId,u.id,galaxyNpcs[0].id,star,'초록별',1,'attacking',Date.now()+1);
  await panel.getByRole('button',{name:'대화하기',exact:true}).click();await panel.getByRole('button',{name:'별 방어하기',exact:true}).click();await page.getByRole('button',{name:'포탑 1',exact:true}).click();await panel.getByText('격추 1 / 12',{exact:true}).waitFor();await page.screenshot({path:'artifacts/colony/defense.png'});
  await page.setViewportSize({width:390,height:844});await page.screenshot({path:'artifacts/colony/mobile.png'});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.reload();await page.getByRole('button',{name:/개척 · 편지/}).click();await page.getByRole('button',{name:'포탑 2',exact:true}).waitFor();
  await page.getByRole('button',{name:'별 교류 닫기'}).click();await page.getByRole('button',{name:'내 별 보기',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.star-atlas')?.dataset.phase==='open');await page.getByRole('button',{name:'광장별 선택',exact:true}).click();await page.getByRole('button',{name:'광장별로 이동',exact:true}).click();await page.locator('.star-atlas').waitFor({state:'hidden'});await page.getByRole('heading',{name:'검증 아바타의 광장별',exact:true}).waitFor();
  assert.deepEqual(errors,[]);console.log('Colony browser flow passed: robot click/focus, discovery/claim, dynamic atlas/farm travel, NPC visit/wish/trade/persuasion, defense/fire/reload and mobile layout.');
}finally{await browser?.close();await h.close();if(errors.length)console.log('PAGE ERRORS',errors);}

