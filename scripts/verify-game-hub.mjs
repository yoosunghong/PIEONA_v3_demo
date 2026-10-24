// Isolated browser regression for the playground; no account or server data is changed.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdirSync} from 'node:fs';
import {createServer} from 'vite';

const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const vite=await createServer({configFile:false,server:{host:'127.0.0.1',port:0},plugins:[{
  name:'game-hub-fixture',configureServer(server){server.middlewares.use('/__game-hub',async(req,res,next)=>{
    if(req.url!=='/'){next();return;}
    const html=`<html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><div id="root"></div><script type="module">
      import React from '/node_modules/.vite/deps/react.js';
      import ReactDOM from '/node_modules/.vite/deps/react-dom_client.js';
      import GameHub from '/src/GameHub.jsx';
      import {Modal} from '/src/Panels.jsx';
      ${['style','theme','typography','world-play','visibility','home','tutorial','improvements','responsive','memory','capture','survey-statistics','illova-ui'].map(name=>`import '/src/${name}.css';`).join('\n')}
      const socket={connected:true,on(){},off(){},emit(){}};
      const root=ReactDOM.createRoot(document.getElementById('root'));
      window.updateMembers=(members)=>root.render(React.createElement(Modal,{className:'playground-modal',wide:true,title:'마을 놀이터',eyebrow:'A LITTLE MOMENT OF PLAY',description:'이웃들과 함께 즐길 미니게임 방을 만들어 보세요!',onClose(){}},React.createElement(GameHub,{target:{id:'qa',nickname:'새싹'},me:{id:'qa'},socket,members,notify(){},onReward(){},onLeaveRace(){}})));
      window.qaMembers=[{userId:'qa'},{userId:'friend',nickname:'같이 놀 친구'},{userId:'active',nickname:'낚시하는 친구',runnerBusy:true},{userId:'pet:friend',actorKind:'PET'},{userId:'mount:friend',actorKind:'MOUNT'}];
      window.updateMembers(window.qaMembers);
    </script></body></html>`;
    res.setHeader('Content-Type','text/html');res.end(await server.transformIndexHtml('/__game-hub/',html));
  });}
}]});
let browser;
try{
  await vite.listen();
  browser=await chromium.launch({headless:true,...(process.env.CHROME_EXECUTABLE?{executablePath:process.env.CHROME_EXECUTABLE}:{channel:'msedge'})});
  const page=await browser.newPage(),errors=[];
  page.on('pageerror',error=>{errors.push(error.message);console.error(error.message);});
  await page.route('**/api/villages/qa/duels',route=>route.fulfill({json:{rooms:[]}}));
  mkdirSync('tmp/game-hub-qa',{recursive:true});
  for(const [width,height] of [[1305,864],[1024,768],[390,844]]){
    await page.setViewportSize({width,height});
    await page.goto(`http://127.0.0.1:${vite.config.server.port||vite.httpServer.address().port}/__game-hub/`);
    await page.locator('.playground-card').first().waitFor();
    assert.equal(await page.locator('.playground-card').count(),6);
    assert.equal(await page.locator('.playground-card.selected').count(),0);
    assert.equal(await page.locator('.playground-selected-game').count(),0);
    const layout=await page.locator('.game-hub').evaluate(hub=>{
      const [catalog,room]=[...hub.children].map(el=>el.getBoundingClientRect());
      const cards=hub.querySelector('.playground-cards').getBoundingClientRect();
      return {children:hub.children.length,catalogWidth:catalog.width,catalogHeight:catalog.height,cardsHeight:cards.height,separate:room.left>=catalog.right||room.top>=catalog.bottom,overflow:document.documentElement.scrollWidth>innerWidth};
    });
    assert.equal(layout.children,2);assert.ok(layout.separate);assert.ok(layout.catalogWidth>150);assert.ok(layout.catalogHeight>300);assert.ok(layout.cardsHeight>300);assert.equal(layout.overflow,false);
    await page.screenshot({path:`tmp/game-hub-qa/catalog-${width}.png`,fullPage:true});
    await page.getByRole('button',{name:'말놀이',exact:true}).click();
    assert.equal(await page.locator('.playground-card').count(),2);
    for(const title of ['두근두근 타자 대결','도란도란 끝말잇기']){
      await page.getByRole('button',{name:new RegExp(title)}).click();
      await page.getByRole('heading',{name:title,exact:true}).waitFor();
      await page.getByText('마을 친구 2명 · 함께할 수 있는 친구 1명',{exact:true}).waitFor();
      await page.getByText('같이 놀 친구',{exact:true}).waitFor();
      await page.evaluate(()=>window.updateMembers([]));
      await page.getByText('마을 친구 0명 · 함께할 수 있는 친구 0명',{exact:true}).waitFor();
      await page.evaluate(()=>window.updateMembers(window.qaMembers));
      await page.getByText('마을 친구 2명 · 함께할 수 있는 친구 1명',{exact:true}).waitFor();
      await page.screenshot({path:`tmp/game-hub-qa/word-lobby-${title.includes('타자')?'typing':'chain'}-${width}.png`,fullPage:true});
      await page.getByRole('button',{name:'게임 목록으로',exact:true}).click();
      assert.equal(await page.locator('.playground-card').count(),6);
    }
    await page.getByRole('button',{name:/별빛 리듬 음표/}).click();
    assert.equal(await page.locator('.playground-selected-game h3').textContent(),'별빛 리듬');
    assert.equal(await page.getByRole('button',{name:/혼자 플레이/}).getAttribute('aria-pressed'),'true');
    await page.getByRole('button',{name:/구름 달리기 하늘/}).click();
    assert.equal(await page.locator('.playground-selected-game h3').textContent(),'구름 달리기');
    await page.screenshot({path:`tmp/game-hub-qa/selected-${width}.png`,fullPage:true});
    console.log(`PASS ${width}x${height}: six cards, layout, word-game navigation, game selection`);
  }
  assert.deepEqual(errors,[]);
}finally{await browser?.close();await vite.close();}
