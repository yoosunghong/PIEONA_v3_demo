import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdirSync} from 'node:fs';
import {createServer} from 'vite';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const vite=await createServer({configFile:false,server:{host:'127.0.0.1',port:0},plugins:[{
  name:'community-fixture',configureServer(server){server.middlewares.use('/__community',async(req,res)=>{
    const html=`<html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><div id="root"></div><script type="module">
      import React from 'react';import {createRoot} from 'react-dom/client';
      import AvatarCards from '/src/AvatarCards.jsx';import Chalkboard,{useChalkboard} from '/src/Chalkboard.jsx';import {Modal} from '/src/Panels.jsx';
      import {createChalkboard} from '/src/chalkboardModel.js';import * as THREE from 'three';
      ${['style','theme','typography','world-play','visibility','home','tutorial','improvements','responsive','memory','capture','survey-statistics','illova-ui'].map(name=>`import '/src/${name}.css';`).join('\n')}
      const me={id:'qa',nickname:'새싹',activeSlot:'first'};
      function App(){const board=useChalkboard('qa',null);return location.search.includes('board')?React.createElement(Modal,{title:'마을 칠판',wide:true,onClose(){}},React.createElement(Chalkboard,{me,target:me,board})):React.createElement(AvatarCards,{me,target:me,notify(){},onActivate(){},onClose(){},onChat(){}});}
      const model=createChalkboard({x:0,z:0,rotation:0});const size=new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3());window.boardSize=size.toArray();
      createRoot(document.getElementById('root')).render(React.createElement(App));
    </script></body></html>`;
    res.setHeader('Content-Type','text/html');res.end(await server.transformIndexHtml('/__community/',html));
  });}
}]});
let browser;
try{
  await vite.listen();browser=await chromium.launch({headless:true,channel:'msedge'});
  const page=await browser.newPage(),errors=[];page.setDefaultTimeout(10000);page.on('pageerror',e=>{errors.push(e.message);console.error('PAGE',e.message);});page.on('console',e=>{if(e.type()==='error')console.error(e.text());});
  const card={id:'card',character:'pio',own:true,nickname:'새싹',theme:'sage',tags:['다정한 이웃','게임 친구'],summary:'대화와 마을 산책을 즐기는 친구예요.',intro:'같이 마을에서 놀아요!',level:3,tier:3,levelXp:20,nextLevelXp:100,memories:[{id:'memory',content:'오늘 마을에 놀러 온 친구와 이야기했어요.',createdAt:'2026-10-25'}]};
  await page.route('**/api/avatar-cards',route=>route.fulfill({json:{card,slots:['pio','luna','moa','tori'].map((character,i)=>({id:i?'slot-'+i:'first',active:i===0,preview:{...card,id:'slot-'+i,character,nickname:character}})),quests:[],available:1}}));
  let strokes=[],saveCount=0;
  await page.route('**/api/villages/qa/chalkboard',route=>{if(route.request().method()==='POST'){strokes.push(...route.request().postDataJSON().strokes);saveCount++;}return route.fulfill({json:{strokes,revision:0}});});
  mkdirSync('tmp/community-qa',{recursive:true});
  const base=`http://127.0.0.1:${vite.httpServer.address().port}/__community/`;
  for(const [width,height] of [[1305,900],[390,844]]){
    await page.setViewportSize({width,height});await page.goto(base);
    await page.getByRole('button',{name:'내 카드 만나기'}).click();
    assert.equal(await page.locator('.cards-workspace aside').count(),0);
    for(const character of ['pio','luna','moa','tori']){const result=await page.request.get(base.replace('/__community/','')+'/images/avatar-cards/'+character+'-profile.png');assert.equal(result.status(),200);}
    await page.locator('.cards-track').evaluate(async el=>{await Promise.all([...el.querySelectorAll('.avatar-card-art')].map(node=>new Promise((resolve,reject)=>{const image=new Image();image.onload=resolve;image.onerror=reject;image.src=getComputedStyle(node).backgroundImage.slice(5,-2);})));});
    assert.equal(await page.locator('.cards-collection .card-main-details').count(),1);
    assert.equal(await page.locator('.card-main-details').evaluate(el=>el.getBoundingClientRect().width<=document.documentElement.clientWidth),true);
    await page.screenshot({path:`tmp/community-qa/cards-${width}.png`,fullPage:true});
    await page.goto(base+'?board');await page.getByRole('button',{name:'칠판 전체 지우기',exact:true}).waitFor();
    const board=page.locator('canvas[aria-label="이웃과 함께 쓰는 칠판 그림판"]'),bounds=await board.boundingBox();
    await page.mouse.move(bounds.x+bounds.width*.25,bounds.y+bounds.height*.4);await page.mouse.down();await page.mouse.move(bounds.x+bounds.width*.65,bounds.y+bounds.height*.6,{steps:10});await page.mouse.up();
    await page.getByRole('button',{name:'낙서 저장하기',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.chalkboard-panel footer .card-pink-button')?.disabled);
    await page.screenshot({path:`tmp/community-qa/board-${width}.png`,fullPage:true});
    assert.ok((await page.evaluate(()=>window.boardSize))[0]>=3.7);
  }
  assert.equal(saveCount,2);assert.equal(strokes.length,2);assert.deepEqual(errors,[]);console.log('Desktop/mobile cards and chalkboard drawing: passed');
}finally{await browser?.close();await vite.close();}
