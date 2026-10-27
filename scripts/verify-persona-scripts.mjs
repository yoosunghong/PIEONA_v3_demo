import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdirSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {createServer} from 'node:net';
import dotenv from 'dotenv';
import {harness} from '../tests/runtimeHarness.mjs';
import {prepareAvatar,say,gameplay} from '../tests/pssGameplay.mjs';
import {fixtureProvider} from '../tests/pssFixtures.mjs';
import {createPersonaProvider} from '../server/pssProvider.mjs';
import {ACTIVE_EVENTS,validateScripts} from '../shared/personaScripts.mjs';
import {scriptCoverage} from '../shared/pssCoverage.mjs';

const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const live=process.argv.includes('--live'),mode=live?'gemini':'fixture',directory=resolve('artifacts/pss',mode);mkdirSync(directory,{recursive:true});
if(live){const env=dotenv.config({quiet:true}).parsed||{};for(const key of ['GEMINI_API_KEY','GEMINI_MODEL'])if(Object.hasOwn(env,key))process.env[key]=env[key];}
let time=Date.parse('2026-10-27T00:00:00Z'),rolls=[],forced=null,generationCalls=0,analysisCalls=0,browser,h,page;
const provider=live?createPersonaProvider():fixtureProvider(),generate=provider.generate,analyze=provider.analyze;
provider.generate=async p=>{generationCalls++;return generate(p);};provider.analyze=async p=>{analysisCalls++;return analyze(p);};
const uiEvidence=[],errors=[],versions=[],staticEvidence={},checkpoints=[],providerErrors=[];
const source=readFileSync('server/life.mjs','utf8');
for(const e of ACTIVE_EVENTS){assert.ok(source.includes(`'${e.id}'`),e.id);staticEvidence[e.id]={trigger:e.trigger,source:e.source,playerAction:e.action,preconditions:e.preconditions,pipeline:'production life action -> PSS persisted selection -> owner socket -> main.jsx PersonaDialogue -> rendered DOM',test:'scripts/verify-persona-scripts.mjs: gameplay cases from registry'};}
try{
 const probe=createServer();await new Promise(r=>probe.listen(0,'127.0.0.1',r));const port=probe.address().port;await new Promise(r=>probe.close(r));
 h=await harness({port,publicOrigin:`http://127.0.0.1:${port}`,personaProvider:provider,lifeClock:()=>time,lifeRandom:()=>rolls.shift()??0,generateAnswer:async()=>({reply:'합성 검증 대화예요.',emotion:'calm',memories:[],provider:'synthetic-fixture'}),pssForceVariant:({eventId,variants})=>forced?.eventId===eventId?variants[forced.index].id:null});
 h.advance=ms=>{time+=ms;h.runtime.life.tick();};
 const u=await prepareAvatar(h,'pss_browser_'+mode),socket=await h.connect(u),paths=gameplay(h,u,socket,v=>rolls=v);
 const base=`http://127.0.0.1:${h.runtime.server.address().port}`;
 browser=await chromium.launch({headless:true,channel:process.env.PSS_BROWSER_CHANNEL||(process.platform==='win32'?'msedge':undefined)});
 const context=await browser.newContext({viewport:{width:1365,height:900},reducedMotion:'reduce'});
 await context.addCookies([{name:'pieona_session',value:u.cookie.split('=')[1],url:base}]);
 page=await context.newPage();page.setDefaultTimeout(20000);page.on('pageerror',e=>errors.push(e.message));
 page.on('response',async r=>{if(r.url().includes('/pss')&&r.status()>=400){const error={status:r.status(),body:await r.text()};providerErrors.push(error);console.log('PSS API failure',error.status,error.body);}});
 await page.addInitScript(({uid,slot})=>{localStorage.setItem('pieona.tutorial.v1.'+uid,'seen');localStorage.setItem('illova.card.seen.'+uid+'.'+slot,slot+':1');localStorage.setItem('pieona.bgm.v1',JSON.stringify({enabled:false,volume:0}));},{uid:u.id,slot:u.activeSlot});
 await page.goto(base+'/?view=village');await page.getByRole('button',{name:'Avatar Update',exact:true}).waitFor();
 async function inspectPending(label){
  const expected=h.runtime.store.all('SELECT id,line FROM pss_executions WHERE displayed_at IS NULL ORDER BY rowid').map(r=>JSON.parse(r.line)).filter(l=>l.version===h.runtime.personaScripts.current(u.id).version);
  for(const execution of expected){
   const bubble=page.locator(`.pss-dialogue[data-execution-id="${execution.id}"]`);await bubble.waitFor({state:'visible'});
   const actual=await bubble.locator('p').innerText();assert.equal(actual,execution.text);assert.ok(!actual.includes('{'));
   const layout=await bubble.evaluate(el=>{const b=el.getBoundingClientRect(),p=el.querySelector('p');return {visible:b.width>0&&b.height>0&&b.left>=0&&b.right<=innerWidth&&b.top>=0&&b.bottom<=innerHeight,unclipped:p.scrollWidth<=p.clientWidth+1&&p.scrollHeight<=p.clientHeight+1,viewport:[innerWidth,innerHeight]};});
   assert.ok(layout.visible,label+' offscreen');assert.ok(layout.unclipped,label+' clipped');
   await page.waitForFunction(async id=>{const r=await fetch('/api/me/pss/dialogues');const data=await r.json();return !data.lines.some(l=>l.id===id);},execution.id);
   const screenshot=`${label.replaceAll('.','-')}-${execution.id}.png`;await page.screenshot({path:join(directory,screenshot)});
   uiEvidence.push({executionId:execution.id,variantId:execution.variantId,...layout,textMatches:true,screenshot});
   await bubble.getByRole('button',{name:'다음 활동 대사'}).click();
  }
 }
 async function updateThroughUI(text){
  console.log(`[${mode}] starting persona update ${versions.length+1}`);
  await say(h,u,text);await page.getByRole('button',{name:'Avatar Update',exact:true}).click();
  await page.locator('.pss-consent input').check();await page.getByRole('button',{name:'대화로 성향 분석',exact:true}).click();
  const approval=page.getByRole('button',{name:'성향 승인 · 대사 생성',exact:true}),alert=page.locator('.pss-update [role="alert"]');
  await approval.or(alert).first().waitFor({timeout:120000});if(await alert.count())throw new Error(await alert.innerText());
  await page.screenshot({path:join(directory,`persona-proposal-${versions.length+1}.png`)});
  await page.getByRole('button',{name:'성향 승인 · 대사 생성',exact:true}).click();
  await page.getByRole('button',{name:'검증된 버전 적용',exact:true}).or(alert).first().waitFor({timeout:120000});if(await alert.count())throw new Error(await alert.innerText());
  await page.screenshot({path:join(directory,`script-comparison-${versions.length+1}.png`),fullPage:true});
  await page.getByRole('button',{name:'검증된 버전 적용',exact:true}).click();
  await page.waitForFunction(()=>!document.querySelector('.pss-comparison'));
  const active=(await h.request('/me/pss',u)).body;validateScripts(active.scripts);assert.ok(active.version>versions.length);
  versions.push({ownerId:u.id,slot:u.activeSlot,...active});
  await page.getByRole('button',{name:'닫기',exact:true}).click();await page.locator('.pss-update').waitFor({state:'detached'});
 }
 for(const text of ['나는 조용하고 차분한 존댓말이 좋아. 혼자 산책하는 편이야.','이제는 친구들과 활기차게 놀고 싶어. 다정하고 장난스러운 반말로 이야기해 줘.']){
  await updateThroughUI(text);const version=versions.at(-1).version;
  for(const event of ACTIVE_EVENTS){
   assert.equal(typeof paths.cases[event.id],'function',event.id);
   for(const selection of ['natural','forced'])for(let index=0;index<3;index++){
    forced=selection==='forced'?{eventId:event.id,index}:null;
    await paths.cases[event.id]();await inspectPending(`v${version}-${selection}-${event.id}-${index+1}`);
   }forced=null;
   console.log(`[${mode}] v${version} ${event.id}: 3 natural + 3 forced gameplay/UI paths`);
  }
  assert.equal(generationCalls,version);checkpoints.push({version,generationCalls,analysisCalls,noRuntimeLLMCalls:true});
 }
 assert.notDeepEqual(versions[0].persona,versions[1].persona);assert.notDeepEqual(versions[0].scripts,versions[1].scripts);
 // Reconnection uses saved active scripts; all unacknowledged lines are recovered by HTTP.
 await page.reload();await page.getByRole('button',{name:'Avatar Update',exact:true}).waitFor();await paths.start();await inspectPending('reconnect');
 const rollback=await h.request('/me/pss/rollback',u,{version:1});assert.equal(rollback.status,200);await paths.start();await inspectPending('rollback');
 // A real mobile viewport exercises the full UI with the restored version.
 await page.setViewportSize({width:390,height:844});await paths.start();await inspectPending('mobile-restored');
 await page.screenshot({path:join(directory,'mobile-village.png'),fullPage:true});
 assert.deepEqual(errors,[]);
 const executions=h.runtime.store.all('SELECT line FROM pss_executions').map(r=>JSON.parse(r.line));
 const report={createdAt:new Date().toISOString(),provider:provider.name,seed:0,clockStart:'2026-10-27T00:00:00Z',browser:await browser.version(),mode,checkpoints,...scriptCoverage(versions,executions,uiEvidence,staticEvidence),errors,versions,executions,uiEvidence};
 writeFileSync(join(directory,'coverage.json'),JSON.stringify(report,null,2));
 const columns=['eventId','variantId','version','staticReachable','runtimeExecuted','uiDisplayed','forcedSelection','naturalSelection','status'];
 writeFileSync(join(directory,'coverage.csv'),[columns.join(','),...report.rows.map(r=>columns.map(k=>JSON.stringify(r[k])).join(','))].join('\n'));
 writeFileSync(join(directory,'coverage.md'),`# PSS ${mode} gameplay/UI verification\n\n${report.generatedScriptVariants} variants; static ${report.reachabilityCoverage*100}%; gameplay ${report.runtimeExecutionCoverage*100}%; UI ${report.uiDisplayCoverage*100}%; natural selector ${report.variantSelectionCoverage*100}%.\n\n| Event | Variant | Static | Gameplay | UI | Forced | Natural | Status |\n|---|---|---|---|---|---|---|---|\n${report.rows.map(r=>`| ${r.eventId} | ${r.localVariantId} v${r.version} | ${r.staticReachable} | ${r.runtimeExecuted} | ${r.uiDisplayed} | ${r.forcedSelection} | ${r.naturalSelection} | ${r.status} |`).join('\n')}\n\nScreenshots and execution IDs are linked per row in coverage.json.\n`);
 assert.equal(report.failedScripts.length,0,JSON.stringify(report.failedScripts));for(const file of ['failure.json','failure.png'])rmSync(join(directory,file),{force:true});console.log(JSON.stringify({mode,variants:report.generatedScriptVariants,ui:report.uiVerifiedVariants,natural:report.naturalSelectionVariants,forced:report.forcedSelectionVariants,errors:report.errors.length,generationCalls,report:join(directory,'coverage.json')}));
}catch(e){
 await page?.screenshot({path:join(directory,'failure.png'),fullPage:true}).catch(()=>{});
 const executions=h?.runtime.store.all('SELECT line FROM pss_executions').map(r=>JSON.parse(r.line))||[];
 const failed={createdAt:new Date().toISOString(),mode,status:'FAILED',error:e.message,stack:e.stack,generationCalls,analysisCalls,providerErrors,versions,uiEvidence,errors,dom:await page?.locator('body').innerText().catch(()=>null)};
 writeFileSync(join(directory,'failure.json'),JSON.stringify(failed,null,2));
 writeFileSync(join(directory,'coverage.json'),JSON.stringify({...scriptCoverage(versions,executions,uiEvidence,staticEvidence),...failed,failedTests:1},null,2));throw e;
}
finally{await browser?.close();await h?.close();}
