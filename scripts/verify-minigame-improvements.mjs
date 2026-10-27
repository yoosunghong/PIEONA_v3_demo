import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {createServer} from 'vite';
import {chromium} from 'playwright';

const vite=await createServer({configFile:false,optimizeDeps:{include:['react','react-dom/client']},server:{host:'127.0.0.1',port:0},plugins:[{
  name:'minigame-review',configureServer(server){server.middlewares.use('/__minigames',async(req,res)=>{
    const html=`<html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module">
      import React from '/node_modules/.vite/deps/react.js';
      import ReactDOM from '/node_modules/.vite/deps/react-dom_client.js';
      import WordChainGame from '/src/WordChainGame.jsx';
      import TypingGame from '/src/TypingGame.jsx';
      import Volleyball from '/src/Volleyball.jsx';
      import {Modal} from '/src/Panels.jsx';
      import {newVolleyGame,advanceVolley} from '/shared/volleyball.mjs';
      import '/src/style.css';import '/src/theme.css';import '/src/typography.css';
      const players=[{id:'me',nickname:'나무',score:90,index:0,hintsLeft:3,appearance:{character:'pio'}},{id:'friend',nickname:'달빛',score:50,index:0,hintsLeft:3,appearance:{character:'luna'}}];
      const root=ReactDOM.createRoot(document.getElementById('root'));
      const base={id:'qa',status:'playing',hostId:'me',kind:'wordchain',players,turn:0,round:1,used:['바다'],log:[{playerId:'friend',text:'바다'}],reactions:{},startedAt:Date.now(),deadline:Date.now()+120000};
      window.volleyFixture={id:'volley-qa',roomId:'court-qa',started:base.startedAt-3500,serverTime:base.startedAt,snapshot:advanceVolley(newVolleyGame(['me','ai']),3500)};
      const listeners=new Map(),socket={connected:true,on(name,fn){listeners.set(name,fn)},off(name){listeners.delete(name)},emit(){},timeout(){return this},volatile:{emit(){},timeout(){return this}}};
      window.show=(kind,turn=0)=>{
        const room={...base,turn,words:['국제우주정거장'],deadline:base.startedAt+(kind==='typing'?60000:120000)};
        const props={room,me:players[0],text:'',setText(){},canInput:turn===0,inputRef:React.createRef(),submit(e){e.preventDefault()},connected:true,serverNow:base.startedAt,countdown:0,onLeave(){},onStart(){},onReplay(){},onHint(){},onReaction(){}};
        root.render(React.createElement(Modal,{className:'playground-modal',wide:true,onClose(){},title:'마을 놀이터'},kind==='volley'?React.createElement(Volleyball,{me:players[0],target:{id:'me'},socket,onHome(){window.didExit=true},onReward(){},notify(){}}):React.createElement(kind==='typing'?TypingGame:WordChainGame,props)));
      };window.answer=()=>{base.log=[...base.log,{playerId:'me',text:'다리'}];window.show('chain',1)};window.show('chain');
    </script></body></html>`;
    res.setHeader('Content-Type','text/html');res.end(await server.transformIndexHtml('/__minigames',html));
  });}
}]});
let browser;
try{
  await vite.listen();browser=await chromium.launch({headless:true,channel:'msedge'});
  const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/api/volley-games',async route=>route.fulfill({json:await page.evaluate(()=>window.volleyFixture)}));
  await page.route('**/api/volley-games/volley-qa/**',async route=>route.fulfill({json:await page.evaluate(()=>window.volleyFixture)}));
  await page.addInitScript(()=>{const Original=window.AudioContext;window.tones=0;if(Original)window.AudioContext=class extends Original{createOscillator(){window.tones++;return super.createOscillator()}};});
  mkdirSync('tmp/minigame-review',{recursive:true});
  for(const [width,height] of [[1440,900],[390,844],[844,390]]){
    await page.setViewportSize({width,height});await page.goto(`http://127.0.0.1:${vite.httpServer.address().port}/__minigames`);
    await page.locator('.word-chain-game.my-turn').waitFor();
    assert.equal(await page.getByRole('timer').textContent(),'02:00');
    assert.ok(await page.locator('.chain-seat.is-me.active').count());
    assert.ok(await page.locator('.chain-seat.is-me .chain-seat-bubble').textContent()==='내 차례!');
    await page.getByRole('textbox').click();await page.evaluate(()=>window.answer());
    await page.waitForFunction(()=>window.tones===3);
    await page.evaluate(()=>window.show('chain'));
    await page.screenshot({path:`tmp/minigame-review/chain-${width}.png`});
    await page.evaluate(()=>window.show('chain',1));await page.locator('.word-chain-game:not(.my-turn)').waitFor();
    assert.equal(await page.getByRole('textbox').isDisabled(),true);
    await page.evaluate(()=>window.show('typing'));await page.locator('.typing-game').waitFor();
    assert.equal(await page.getByRole('timer').textContent(),'01:00');
    assert.equal(await page.getByRole('heading',{name:'국제우주정거장'}).count(),1);
    assert.ok(await page.locator('.typing-word h3').evaluate(el=>el.getBoundingClientRect().width<=el.parentElement.clientWidth));
    await page.screenshot({path:`tmp/minigame-review/typing-${width}.png`});
    await page.evaluate(()=>window.show('volley'));await page.locator('.volley-court canvas').waitFor();
    const layout=await page.locator('.volley-game').evaluate(el=>{const r=el.getBoundingClientRect(),c=el.querySelector('canvas');return {width:r.width,height:r.height,pixels:c.width,court:el.querySelector('.volley-court').clientHeight,overflow:document.documentElement.scrollWidth>innerWidth};});
    assert.equal(layout.width,width);assert.equal(layout.height,height);assert.ok(layout.pixels>=960);assert.ok(layout.court>100);assert.equal(layout.overflow,false);
    await page.screenshot({path:`tmp/minigame-review/volley-${width}.png`});
    await page.getByRole('button',{name:'AI와 경기 시작',exact:true}).click();
    await page.locator('.volley-overlay').waitFor({state:'detached'});
    await page.screenshot({path:`tmp/minigame-review/volley-playing-${width}.png`});
    await page.getByRole('button',{name:'게임 목록으로',exact:true}).click();assert.equal(await page.evaluate(()=>window.didExit),true);
    console.log(`PASS ${width}x${height}: turn state, timers, long words, fullscreen canvas and exit`);
  }
  assert.deepEqual(errors,[]);
}finally{await browser?.close();await vite.close();}
