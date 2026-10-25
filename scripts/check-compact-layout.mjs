import {createRequire} from 'node:module';
import {readFileSync, readdirSync} from 'node:fs';
import assert from 'node:assert/strict';
const {chromium}=createRequire(import.meta.url)('playwright');
const css=readFileSync(`dist/assets/${readdirSync('dist/assets').find(name=>/^index-.*\.css$/.test(name))}`,'utf8');
const nickname='안녕하세요유성입니다잘부탁드립니다';
const browser=await chromium.launch({headless:true,channel:process.env.BROWSER_CHANNEL||'msedge'});
try {
  const page=await browser.newPage({isMobile:true,hasTouch:true});
  for(const [width,height] of [[344,748],[390,700],[674,842],[853,707],[740,360],[960,400],[344,380]]) {
    await page.setViewportSize({width,height});
    await page.setContent(`<meta name="viewport" content="width=device-width, initial-scale=1"><style>${css}</style><div class="app-shell"><div class="main-shell"><header class="topbar">ILLOVA</header><div class="workspace"><div class="world-panel"><section class="chat-dock chat-side"><header><div><strong>${nickname}와의 대화</strong></div><div class="chat-actions"><button>내 마을로</button><button>새 대화</button><button>세션</button><button>접기</button></div></header><div class="chat-body"><div class="chat-messages">${Array.from({length:20},()=>`<div class="chat-line"><p>${nickname.repeat(5)}</p></div>`).join('')}</div><form class="chat-input-wrap"><input aria-label="메시지"><button class="mic">음성</button><button class="send-button">전송</button></form></div></section></div></div></div></div>`);
    const layout=await page.evaluate(()=>{
      const rect=s=>{const r=document.querySelector(s).getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,height:r.height};};
      return {input:rect('.chat-input-wrap'),dock:rect('.chat-dock'),world:rect('.world-panel'),messages:rect('.chat-messages'),overflow:document.documentElement.scrollWidth>innerWidth};
    });
    assert.ok(layout.input.height>=48,`${width}x${height}: composer height`);
    assert.ok(layout.input.bottom<=layout.dock.bottom&&layout.input.bottom<=layout.world.bottom,`${width}x${height}: composer visible`);
    assert.ok(layout.messages.bottom<=layout.input.y+1,`${width}x${height}: transcript does not cover input`);
    assert.ok(layout.dock.y>=layout.world.y&&layout.input.x>=0&&layout.input.right<=width,`${width}x${height}: fits viewport ${JSON.stringify(layout)}`);
    assert.equal(layout.overflow,false,`${width}x${height}: no horizontal overflow`);
    await page.setContent(`<meta name="viewport" content="width=device-width, initial-scale=1"><style>${css}</style><div class="modal-backdrop"><section class="modal"><header><div><span class="eyebrow">LITTLE TRACES OF CONNECTION</span><h2>아바타 대화기록</h2></div><button class="icon-button">×</button></header><div class="panel-body"><h3>${nickname.repeat(3)}</h3><div class="log-messages"><div class="message"><p>${nickname.repeat(100)}</p></div></div><div class="form-row"><button>이 대화 이어가기</button><button>내용 공유 동의</button><button>내 대화 삭제</button></div><p>대화를 시작한 방문자 본인만 가능해요.</p></div></section></div>`);
    const modal=await page.evaluate(()=>{const body=document.querySelector('.panel-body');body.scrollTop=body.scrollHeight;const r=body.getBoundingClientRect(),last=body.lastElementChild.getBoundingClientRect();return {bottom:r.bottom,last:last.bottom,overflow:body.scrollWidth>body.clientWidth};});
    assert.ok(modal.last<=modal.bottom+1&&modal.bottom<=height,`${width}x${height}: modal end reachable`);
    assert.equal(modal.overflow,false,`${width}x${height}: modal text wraps`);
    console.log(`PASS ${width}x${height}: chat composer and conversation history`);
  }
} finally {await browser.close();}
