import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {harness} from './runtimeHarness.mjs';
import {openStore} from '../server/store.mjs';
import {ACTIVE_EVENTS,LIFE_EVENTS,REQUEST_EVENTS,EVENT_REGISTRY,validateScripts,selectVariant,renderVariant} from '../shared/personaScripts.mjs';
import {PERSONA_A,PERSONA_B,fixtureScripts,fixtureProvider} from './pssFixtures.mjs';
import {prepareAvatar,say,update,gameplay} from './pssGameplay.mjs';
import {createPersonaProvider} from '../server/pssProvider.mjs';
import {assembleContext} from '../server/ai.mjs';
import {scriptCoverage} from '../shared/pssCoverage.mjs';

const answer=async()=>({reply:'테스트 대화예요.',emotion:'calm',memories:[],provider:'fixture'});
test('all active registry events have production source hooks, gameplay cases and UI wiring; forest requests are bound to saved scripts',()=>{
 const source=readFileSync(new URL('../server/life.mjs',import.meta.url),'utf8'),ui=readFileSync(new URL('../src/main.jsx',import.meta.url),'utf8');
 for(const e of LIFE_EVENTS){assert.ok(source.includes(`'${e.id}'`),e.id);assert.ok(e.preconditions.length);assert.ok(e.trigger);assert.equal(e.variants,3);}
 assert.equal(ACTIVE_EVENTS.length,14);assert.equal(REQUEST_EVENTS.length,7);assert.equal(EVENT_REGISTRY.find(e=>e.id==='request.logging.accept').active,true);assert.equal(EVENT_REGISTRY.find(e=>e.id==='request.follow.start').active,false);
 assert.ok(ui.includes('<PersonaDialogue'));assert.ok(ui.includes('<PersonaUpdate'));assert.ok(!source.includes('NODE_ENV'));assert.ok(!source.includes('generateAnswer'));
});
test('strict validation rejects missing/unsupported/duplicate events, IDs, malformed variables, expressions and contradictory outcomes',()=>{
 validateScripts(fixtureScripts(PERSONA_A));
 for(const mutate of [s=>s.events.pop(),s=>s.events[0].eventId='request.follow.start',s=>s.events[1].eventId=s.events[0].eventId,s=>s.events[0].variants[0].id=s.events[1].variants[0].id,s=>s.events[0].variants[0].text='',s=>s.events[0].variants[0].text='x'.repeat(101),s=>s.events[0].variants[0].text='{fishName}',s=>s.events[1].variants[0].text='{bad}',s=>s.events[0].variants[0].text='안녕 {',s=>s.events[0].variants[0].expression='angry-animation',s=>s.events[0].variants[0].outcome='success',s=>s.events[2].variants[0].text='물고기를 잡았어!',s=>s.events[1].variants[0].text='실패했어',s=>s.events[0].variants[0].weight=0]){const s=fixtureScripts(PERSONA_A);mutate(s);assert.throws(()=>validateScripts(s,{requireAll:true}));}
 assert.throws(()=>renderVariant({text:'{fishName}'},ACTIVE_EVENTS[1],{fishName:'<script>'}));
 const expanded=fixtureScripts(PERSONA_A);expanded.events[1].variants[0].text='{fishName}'.repeat(9);assert.throws(()=>validateScripts(expanded),/PSS_RENDER_TOO_LONG/);
});
test('fair selector covers every variant over repeated emotion/relationship states without forcing and avoids consecutive repeats',()=>{
 const variants=fixtureScripts(PERSONA_A).events[0].variants;
 for(const emotion of ['neutral','happy','sad','angry','tired','excited'])for(const trust of [0,.5,1]){
  let history,prev;const ids=[];for(let i=0;i<30;i++){const p=selectVariant(variants,history,emotion,{trust,familiarity:trust});assert.notEqual(p.selected.id,prev);prev=p.selected.id;history=p.history;ids.push(prev);}
  assert.equal(new Set(ids).size,3);for(const v of variants)assert.equal(ids.filter(id=>id===v.id).length,10);
 }
});
test('both personas traverse every production gameplay event and every natural/forced variant without runtime generation',async()=>{
 let rolls=[],forced=null,calls=0;const provider=fixtureProvider(),generate=provider.generate;provider.generate=async p=>{calls++;return generate(p);};
 const h=await harness({generateAnswer:answer,personaProvider:provider,lifeRandom:()=>rolls.shift()??0,pssForceVariant:({eventId,variants})=>forced?.eventId===eventId?variants[forced.index].id:null});
 try{const u=await prepareAvatar(h),socket=await h.connect(u),paths=gameplay(h,u,socket,v=>rolls=v);
  for(const [version,text] of [[1,'조용한 존댓말을 좋아해요'],[2,'다정하고 장난스러운 반말을 좋아해요']]){
   const r=await update(h,u,text);assert.equal(r.active.version,version);assert.equal(r.active.scripts.events.length,14);
   for(const e of LIFE_EVENTS){assert.equal(typeof paths.cases[e.id],'function',e.id);
    const before=h.runtime.store.all('SELECT id FROM pss_executions').length;
    for(let i=0;i<3;i++)await paths.cases[e.id]();
    const rows=h.runtime.store.all('SELECT * FROM pss_executions WHERE owner_id=? AND version=? AND event_id=?',u.id,version,e.id).filter(r=>!JSON.parse(r.line).forced);
    assert.equal(new Set(rows.map(r=>r.variant_id)).size,3,e.id);assert.ok(h.runtime.store.all('SELECT id FROM pss_executions').length>before);
    for(let i=0;i<3;i++){forced={eventId:e.id,index:i};await paths.cases[e.id]();const last=h.runtime.store.one('SELECT line FROM pss_executions WHERE event_id=? ORDER BY rowid DESC LIMIT 1',e.id);assert.equal(JSON.parse(last.line).localVariantId,r.active.scripts.events.find(g=>g.eventId===e.id).variants[i].id);assert.equal(JSON.parse(last.line).forced,true);}forced=null;
   }
   assert.equal(calls,version);
  }
  assert.equal(h.runtime.store.all('SELECT * FROM pss_versions').length,2);
  assert.equal(h.runtime.store.all('SELECT * FROM pss_executions WHERE displayed_at IS NOT NULL').length,0,'socket delivery alone is not UI proof');
  const rollback=await h.request('/me/pss/rollback',u,{version:1});assert.equal(rollback.status,200);assert.deepEqual(rollback.body.persona,PERSONA_A);
 }finally{await h.close();}
});
test('approval, auth, owner isolation, failed generation, cancellation and stale evidence preserve the old version',async()=>{
 const provider=fixtureProvider();const h=await harness({generateAnswer:answer,personaProvider:provider});
 try{const u=await prepareAvatar(h),other=await prepareAvatar(h,'pss_other');assert.equal((await h.request('/me/pss')).status,401);await update(h,u,'조용한 말투');
  assert.equal((await h.request('/me/pss/propose',u,{})).status,400);
  await say(h,u,'다정한 장난 말투');let p=await h.request('/me/pss/propose',u,{consent:true}),body={proposalId:p.body.proposalId};
  assert.equal((await h.request('/me/pss/apply',u,body)).status,409);assert.equal((await h.request('/me/pss/generate',other,body)).status,404);
  provider.generate=async()=>({events:[]});assert.equal((await h.request('/me/pss/generate',u,body)).status,400);assert.equal((await h.request('/me/pss',u)).body.version,1);
  p=await h.request('/me/pss/propose',u,{consent:true});body={proposalId:p.body.proposalId};await say(h,u,'새로운 대화');assert.equal((await h.request('/me/pss/generate',u,body)).status,409);
  p=await h.request('/me/pss/propose',u,{consent:true});body={proposalId:p.body.proposalId};assert.equal((await h.request('/me/pss/cancel',u,body)).status,200);assert.equal((await h.request('/me/pss/generate',u,body)).status,409);
  assert.equal((await h.request('/me/pss',other)).body.version,0);
 }finally{await h.close();}
});
test('SQLite restart retains scripts, fair selection, pending dialogue and rollback; avatars and display acknowledgments are isolated',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'pss-persistence-')),filename=join(dir,'test.sqlite');let h,rolls=[];
 try{h=await harness({store:openStore(filename),generateAnswer:answer,personaProvider:fixtureProvider(),lifeRandom:()=>rolls.shift()??0});
  const u=await prepareAvatar(h),other=await prepareAvatar(h,'pss_saved_other'),s=await h.connect(u),paths=gameplay(h,u,s,v=>rolls=v);await update(h,u,'조용한 말투');await paths.start();
  const first=h.runtime.store.one('SELECT * FROM pss_executions'),line=JSON.parse(first.line);
  assert.equal((await h.request('/me/pss/display',other,{executionId:line.id})).status,409);assert.equal((await h.request('/me/pss/dialogues',other)).body.lines.length,0);
  await h.close();h=await harness({store:openStore(filename),generateAnswer:answer,personaProvider:fixtureProvider()});assert.equal((await h.request('/me/pss',u)).body.version,1);
  assert.equal((await h.request('/me/pss/dialogues',u)).body.lines[0].id,line.id);
  assert.equal((await h.request('/me/pss/display',u,{executionId:line.id})).status,200);assert.equal((await h.request('/me/pss/dialogues',u)).body.lines.length,0);
  await update(h,u,'다정한 장난 말투');assert.equal((await h.request('/me/pss/rollback',u,{version:1})).status,200);
  const slot=await h.request('/slots',u,{nickname:'다른 자아'});assert.equal(slot.status,201);assert.equal((await h.request(`/slots/${slot.body.id}/activate`,u,{})).status,200);assert.equal((await h.request('/me/pss',u)).body.version,0);
  assert.equal((await h.request(`/slots/${u.activeSlot}/activate`,u,{})).status,200);assert.equal((await h.request('/me/pss',u)).body.version,1);
 }finally{await h?.close();rmSync(dir,{recursive:true,force:true});}
});
test('Gemini adapter sends only authorized structured generation requests and explicitly fails without a key',async()=>{
 await assert.rejects(()=>createPersonaProvider({apiKey:''}).generate(PERSONA_A),/PSS_LLM_KEY_REQUIRED/);
 let request;const p=createPersonaProvider({apiKey:'synthetic-test-key',fetch:async(url,init)=>{request={url,body:JSON.parse(init.body)};return {ok:true,json:async()=>({candidates:[{content:{parts:[{text:JSON.stringify(fixtureScripts(PERSONA_A))}]}}]})};}});
 validateScripts(await p.generate(PERSONA_A));assert.ok(request.url.startsWith('https://generativelanguage.googleapis.com/'));assert.equal(request.body.generationConfig.responseMimeType,'application/json');assert.equal(request.body.tools,undefined);
});
test('normal state branches reject impossible requests and special fish use the rare reaction; retries do not duplicate speech',async()=>{
 let rolls=[];const h=await harness({generateAnswer:answer,personaProvider:fixtureProvider(),lifeRandom:()=>rolls.shift()??0});
 try{const u=await prepareAvatar(h),s=await h.connect(u),paths=gameplay(h,u,s,v=>rolls=v);await update(h,u,'차분한 말투');
  assert.equal((await h.emit(s,'life:start',{anchorId:'missing'})).ok,false);assert.equal(h.runtime.store.all('SELECT * FROM pss_executions').length,0);
  await paths.start();assert.equal((await h.emit(s,'life:start',{anchorId:'fishing:1'})).ok,true);assert.equal(h.runtime.store.all('SELECT * FROM pss_executions').length,1);
  h.advance(44999);assert.equal(h.runtime.store.all('SELECT * FROM pss_executions').length,1);rolls=[0,.995,0];h.advance(1);
  const rare=JSON.parse(h.runtime.store.one('SELECT line FROM pss_executions ORDER BY rowid DESC LIMIT 1').line);assert.equal(rare.eventId,'fishing.result.rare');assert.ok(rare.text.includes('별빛가오리')||!rare.text.includes('{'));
  await paths.stop();const before=h.runtime.store.all('SELECT * FROM pss_executions').length;
  const rejected=await h.request('/me/life/actions',u,{requestId:crypto.randomUUID(),action:{intent:'HARVEST_CROP'}});assert.equal(rejected.status,409);assert.equal(h.runtime.store.all('SELECT * FROM pss_executions').length,before);
  const body={requestId:crypto.randomUUID(),action:{intent:'PLANT_SEED',crop:'HERB'}};assert.equal((await h.request('/me/life/actions',u,body)).status,200);
  assert.equal((await h.emit(s,'life:start',{anchorId:'fishing:1'})).ok,false);h.advance(20000);assert.equal((await h.request('/me/life/actions',u,body)).status,200);h.advance(20000);
  assert.equal(h.runtime.store.all("SELECT * FROM pss_executions WHERE event_id='garden.plant.complete'").length,1);
 }finally{await h.close();}
});
test('transaction failure rolls back selection, inventory and speech before any socket publication',async()=>{
 const h=await harness({generateAnswer:answer,personaProvider:fixtureProvider(),lifeRandom:()=>0});
 try{const u=await prepareAvatar(h),s=await h.connect(u),paths=gameplay(h,u,s,()=>{});await update(h,u,'차분한 말투');await paths.start();const received=[];s.on('pss:dialogue',l=>received.push(l));
  h.runtime.store.db.exec("CREATE TRIGGER reject_settlement BEFORE UPDATE OF settled_at ON life_sessions WHEN NEW.attempts>OLD.attempts BEGIN SELECT RAISE(ABORT,'pss atomic test'); END");
  assert.throws(()=>h.advance(45000),/pss atomic test/);assert.equal(h.runtime.store.all('SELECT * FROM pss_executions').length,1);assert.equal(h.runtime.store.all('SELECT * FROM acquisition_events').length,0);assert.equal(h.runtime.store.all("SELECT * FROM pss_selector WHERE event_id='fishing.result.success'").length,0);
  await new Promise(r=>setTimeout(r,30));assert.equal(received.length,0);h.runtime.store.db.exec('DROP TRIGGER reject_settlement');h.advance(0);assert.equal(h.runtime.store.all('SELECT * FROM pss_executions').length,2);
 }finally{await h.close();}
});
test('approved persona enters owner chat only; an in-flight evidence change is rejected and invalid output remains auditable',async()=>{
 const provider=fixtureProvider(),h=await harness({generateAnswer:answer,personaProvider:provider});
 try{const u=await prepareAvatar(h),other=await prepareAvatar(h,'pss_privacy'),applied=await update(h,u,'차분한 말투'),target=h.runtime.store.one('SELECT * FROM users WHERE id=?',u.id);
  assert.deepEqual(assembleContext(h.runtime.store,target,u.id,'산책').snapshot.approvedPersona,applied.active.persona);assert.equal(assembleContext(h.runtime.store,target,other.id,'산책').snapshot.approvedPersona,undefined);
  let release,started;const ready=new Promise(r=>started=r);provider.analyze=()=>{started();return new Promise(r=>release=r);};const pending=h.request('/me/pss/propose',u,{consent:true});await ready;
  h.runtime.store.run('UPDATE users SET revision=revision+1 WHERE id=?',u.id);release({persona:PERSONA_B,summary:'합성 제안',evidenceIds:[h.runtime.store.one("SELECT id FROM messages WHERE role='user' ORDER BY rowid DESC LIMIT 1").id]});assert.equal((await pending).status,409);assert.equal((await h.request('/me/pss',u)).body.version,1);
  provider.analyze=fixtureProvider().analyze;provider.generate=async()=>fixtureScripts(PERSONA_A);const p=await h.request('/me/pss/propose',u,{consent:true});provider.generate=async()=>({events:[{eventId:'missing',variants:[{id:'rejected-line'}]}]});assert.equal((await h.request('/me/pss/generate',u,{proposalId:p.body.proposalId})).status,400);
  const report=(await h.request('/me/pss/coverage',u)).body;assert.equal(report.generatedScriptVariants,42);assert.equal(report.rejectedGenerationCandidates.length,1);assert.equal(report.rejectedGenerationCandidates[0].outputRetained,true);
 }finally{await h.close();}
});
test('coverage never removes generated unreachable variants from the denominator and never equates socket delivery with UI display',()=>{
 const scripts=fixtureScripts(PERSONA_A);scripts.events.push({eventId:'unsupported',variants:[{...scripts.events[0].variants[0],id:'orphan'}]});
 const v={ownerId:'owner',slot:'slot',version:1,scripts},report=scriptCoverage([v],[]);assert.equal(report.generatedScriptVariants,43);assert.equal(report.uiDisplayCoverage,0);assert.equal(report.unreachableScripts.length,43);assert.equal(report.invalidScripts.length,43);assert.equal(report.failedScripts.length,43);
});
