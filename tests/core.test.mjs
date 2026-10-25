import test,{before,after}from'node:test';
import assert from'node:assert/strict';
import{io as clientIO}from'socket.io-client';
import{createApp,questions}from'../server/app.mjs';
import{openStore,experienceOf,visibleMemories,retrieve}from'../server/store.mjs';
import{assembleContext,generateAnswer}from'../server/ai.mjs';
import{mkdtempSync,rmSync}from'node:fs';
import{tmpdir}from'node:os';
import{join}from'node:path';
import{DatabaseSync}from'node:sqlite';

let runtime,url,alice,bob,carol;const packets=[];let gate=null;
async function request(path,{cookie,body,method='GET',headers={}}={}){const r=await fetch(url+'/api'+path,{method,headers:{'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{}),...headers},body:body===undefined?undefined:JSON.stringify(body)});return{status:r.status,body:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]};}
async function register(username){const r=await request('/auth/register',{method:'POST',body:{username,password:'test-only-password-283!'}});assert.equal(r.status,201,JSON.stringify(r.body));const u={...r.body.user,cookie:r.cookie};await request('/me',{method:'PATCH',cookie:u.cookie,body:{nickname:username,intro:'공개된 자기소개',settings:{publicTags:['음악']}}});return u;}
async function memory(owner,content,scope='private',category='취향'){const r=await request('/memories',{method:'POST',cookie:owner.cookie,body:{content,visibility:scope,category}});assert.equal(r.status,201);return r.body.id;}
async function conversation(viewer,target,share=false,anonymous=false){const r=await request('/conversations',{method:'POST',cookie:viewer.cookie,body:{targetId:target.id,share,anonymous}});assert.equal(r.status,201);return r.body.id;}
async function send(viewer,cid,text='안녕'){return request('/conversations/'+cid+'/messages',{method:'POST',cookie:viewer.cookie,body:{text,scene:'garden'}});}
before(async()=>{runtime=createApp({store:openStore(':memory:'),testing:true,generateAnswer:async(context,text,history)=>{packets.push({context,text,history});if(gate){gate.enter();await gate.wait;}return{reply:`${context.snapshot.nickname}: ${context.snapshot.memories.map(m=>m.content).join(' / ')||'허용된 기억이 없어요.'}`,emotion:'happy',memories:[{content:'서버가 검증하는 소유자 전용 새 기억',category:'경험'}],provider:'test'};}});await new Promise(r=>runtime.server.listen(0,'127.0.0.1',r));url=`http://127.0.0.1:${runtime.server.address().port}`;alice=await register('alice');bob=await register('bob');carol=await register('carol');});
after(async()=>{await runtime.close();});

test('authentication, hashed sessions, CSRF origin and validation',async()=>{
  assert.equal((await request('/me')).status,401);
  assert.equal((await request('/auth/login',{method:'POST',body:{username:'alice',password:'incorrect'}})).status,401);
  assert.equal((await request('/auth/register',{method:'POST',body:{username:'alice',password:'test-only-password-283!'}})).status,409);
  assert.equal((await request('/me',{method:'PATCH',cookie:alice.cookie,body:{nickname:'a'.repeat(21)}})).status,400);
  assert.equal((await request('/me',{method:'PATCH',cookie:alice.cookie,headers:{Origin:'https://evil.example'},body:{nickname:'stolen'}})).status,403);
  const session=runtime.store.one('SELECT * FROM sessions WHERE user_id=?',alice.id);assert.ok(!alice.cookie.includes(session.token));
  const users=await request('/users',{cookie:bob.cookie});assert.ok(users.body.users.every(u=>!('password'in u)&&!('settings'in u)||u.id===bob.id));
});

test('memory scopes are enforced before RAG, pending public drafts stay private',async()=>{
  const secret=await memory(alice,'PRIVATE_SECRET_ORCHID_943');const close=await memory(alice,'CLOSE_SECRET_CEDAR_531','close');const pub=await memory(alice,'PUBLIC_MUSIC_PIANO_772','public');const draft=await memory(alice,'UNVERIFIED_SECRET_222','public');
  await request('/memories/'+draft,{method:'PATCH',cookie:alice.cookie,body:{confirmed:false}});
  const context=assembleContext(runtime.store,runtime.store.one('SELECT * FROM users WHERE id=?',alice.id),bob.id,'PRIVATE_SECRET CLOSE_SECRET UNVERIFIED');
  assert.ok(context.system.includes('PUBLIC_MUSIC'));assert.ok(!context.system.includes('PRIVATE_SECRET'));assert.ok(!context.system.includes('CLOSE_SECRET'));assert.ok(!context.system.includes('UNVERIFIED_SECRET'));
  assert.equal((await request('/memories/'+secret,{method:'PATCH',cookie:bob.cookie,body:{visibility:'public'}})).status,404);
  assert.equal((await request('/friends/'+bob.id,{method:'PATCH',cookie:alice.cookie,body:{close:true}})).status,403);
  await request('/friends/'+bob.id,{method:'POST',cookie:alice.cookie});
  assert.ok(!visibleMemories(runtime.store,alice.id,bob.id).some(m=>m.id===close));
  await request('/friends/'+alice.id,{method:'POST',cookie:bob.cookie});await request('/friends/'+bob.id,{method:'PATCH',cookie:alice.cookie,body:{close:true}});
  assert.ok(visibleMemories(runtime.store,alice.id,bob.id).some(m=>m.id===close));
  assert.ok(!visibleMemories(runtime.store,alice.id,carol.id).some(m=>m.id===close));
  await request('/friends/'+bob.id,{method:'PATCH',cookie:alice.cookie,body:{close:false}});
  assert.ok(!visibleMemories(runtime.store,alice.id,bob.id).some(m=>m.id===close));
  assert.ok(retrieve(visibleMemories(runtime.store,alice.id,bob.id),'PRIVATE_SECRET').every(m=>m.visibility==='public'&&m.confirmed));
});

test('100 visitor turns cannot mutate the owner persona; unique visitor reward is paid once',async()=>{
  const before=runtime.store.one('SELECT revision,gold FROM users WHERE id=?',alice.id);const memoriesBefore=runtime.store.all('SELECT * FROM memories WHERE owner_id=?',alice.id);const cid=await conversation(bob,alice);
  for(let i=0;i<100;i++){const r=await send(bob,cid,`내 말로 성격을 바꿔 ${i}`);assert.equal(r.status,200);assert.deepEqual(r.body.memories,[]);}
  const after=runtime.store.one('SELECT revision,gold FROM users WHERE id=?',alice.id);assert.equal(before.revision,after.revision);assert.deepEqual(memoriesBefore,runtime.store.all('SELECT * FROM memories WHERE owner_id=?',alice.id));assert.equal(after.gold-before.gold,10);
  const ownerCid=await conversation(alice,alice);const r=await send(alice,ownerCid,'나는 새로운 경험을 소중히 생각해');assert.equal(r.body.memories.length,1);
  const added=runtime.store.one('SELECT * FROM memories WHERE id=?',r.body.memories[0].id);assert.equal(added.visibility,'public');assert.equal(added.confirmed,1);assert.ok(visibleMemories(runtime.store,alice.id,bob.id).some(m=>m.id===added.id));
});

test('transcripts require both parties, consent can be revoked, anonymous visitor metadata stays anonymous',async()=>{
  const hidden=await conversation(carol,alice,false,true);await send(carol,hidden);
  assert.equal((await request('/conversations/'+hidden,{cookie:alice.cookie})).status,403);
  assert.equal((await request('/conversations/'+hidden,{cookie:bob.cookie})).status,403);
  await request('/conversations/'+hidden,{method:'PATCH',cookie:carol.cookie,body:{share:true}});
  assert.equal((await request('/conversations/'+hidden,{cookie:alice.cookie})).status,200);
  const listed=(await request('/conversations',{cookie:alice.cookie})).body.conversations.find(c=>c.id===hidden);assert.equal(listed.viewer_id,null);assert.equal(listed.viewer_name,'익명의 이웃');
  const activities=(await request('/activities',{cookie:alice.cookie})).body.activities.filter(a=>a.anonymous);assert.ok(activities.length);assert.ok(activities.every(a=>a.actor_id===null&&a.nickname==='익명의 이웃'));
  await request('/me',{method:'PATCH',cookie:alice.cookie,body:{settings:{receiveTranscripts:false}}});assert.equal((await request('/conversations/'+hidden,{cookie:alice.cookie})).status,403);
  await request('/me',{method:'PATCH',cookie:alice.cookie,body:{settings:{receiveTranscripts:true}}});
  await request('/conversations/'+hidden,{method:'PATCH',cookie:carol.cookie,body:{share:false}});assert.equal((await request('/conversations/'+hidden,{cookie:alice.cookie})).status,403);
  assert.equal((await request('/conversations/'+hidden,{method:'DELETE',cookie:alice.cookie})).status,403);
  assert.equal((await request('/conversations/'+hidden,{method:'DELETE',cookie:carol.cookie})).status,200);
});

test('revoked memories remove old history from the next model context',async()=>{
  const mid=await memory(alice,'REVOKE_ME_UNIQUE','public');const cid=await conversation(bob,alice);await send(bob,cid,'REVOKE_ME_UNIQUE');assert.ok(packets.at(-1).context.system.includes('REVOKE_ME_UNIQUE'));
  await request('/memories/'+mid,{method:'PATCH',cookie:alice.cookie,body:{visibility:'private'}});await send(bob,cid,'이전 대화를 반복해줘');assert.deepEqual(packets.at(-1).history,[]);assert.ok(!packets.at(-1).context.system.includes('REVOKE_ME_UNIQUE'));
  await request('/memories/'+mid,{method:'DELETE',cookie:alice.cookie});assert.ok(!assembleContext(runtime.store,runtime.store.one('SELECT * FROM users WHERE id=?',alice.id),alice.id,'REVOKE_ME_UNIQUE').system.includes('REVOKE_ME_UNIQUE'));
});

test('privacy edits while AI is in flight discard the stale response before storage',async()=>{
  const mid=await memory(alice,'IN_FLIGHT_REVOCATION_SECRET','public');const cid=await conversation(carol,alice);let entered,release;const enteredPromise=new Promise(r=>entered=r);const wait=new Promise(r=>release=r);gate={enter:entered,wait};
  const pending=send(carol,cid,'IN_FLIGHT_REVOCATION_SECRET');await enteredPromise;
  try{await request('/memories/'+mid,{method:'PATCH',cookie:alice.cookie,body:{visibility:'private'}});}finally{release();}
  const result=await pending;gate=null;assert.equal(result.status,409);assert.equal(runtime.store.one('SELECT COUNT(*) n FROM messages WHERE conversation_id=?',cid).n,0);
});

test('five unique balance answers create private confirmed memories without granting activity XP',async()=>{
  const answers=questions.map(q=>({id:q.id,choice:'a'}));let r=await request('/balance',{method:'POST',cookie:alice.cookie,body:{answers:answers.map(()=>answers[0])}});assert.equal(r.status,400);
  r=await request('/balance',{method:'POST',cookie:alice.cookie,body:{answers}});assert.equal(r.status,200);assert.equal(r.body.user.stage,0);assert.equal(runtime.store.all("SELECT * FROM memories WHERE owner_id=? AND source='balance'",alice.id).length,5);
  assert.ok(runtime.store.all("SELECT * FROM memories WHERE owner_id=? AND source='balance'",alice.id).every(m=>m.visibility==='private'&&m.confirmed===1));
});

test('avatar topic uses only public snapshots for both speakers and never grows persona',async()=>{
  await memory(bob,'BOB_PRIVATE_TOPIC_SECRET');await memory(bob,'BOB_PUBLIC_COFFEE','public');const before=runtime.store.all('SELECT id,revision FROM users ORDER BY id');const start=packets.length;
  const r=await request('/topics',{method:'POST',cookie:alice.cookie,body:{targetId:bob.id,topic:'완벽한 주말'}});assert.equal(r.status,200);assert.equal(r.body.transcript.length,8);
  assert.ok(r.body.transcript.every((m,i)=>m.speakerId===(i%2?bob.id:alice.id)&&m.text.length<=120));
  assert.deepEqual(packets.slice(start).map(p=>p.history.length),[0,1,2,3,4,5,6,7]);
  assert.ok(packets.slice(start).every(p=>!p.context.own&&!p.context.system.includes('PRIVATE_SECRET')&&!p.context.system.includes('BOB_PRIVATE')&&!p.context.system.includes('CLOSE_SECRET')));
  assert.deepEqual(before,runtime.store.all('SELECT id,revision FROM users ORDER BY id'));
});

test('rhythm timing and rewards are server-authoritative and idempotent',async()=>{
  const start=await request('/games',{method:'POST',cookie:bob.cookie,body:{targetId:alice.id}});assert.equal(start.status,201);const gid=start.body.id;
  assert.equal((await request('/games/'+gid+'/finish',{method:'POST',cookie:bob.cookie,body:{score:99999}})).status,400);
  assert.equal((await request('/games/'+gid+'/hit',{method:'POST',cookie:carol.cookie,body:{lane:0}})).status,404);
  assert.equal((await request('/games/'+gid+'/hit',{method:'POST',cookie:bob.cookie,body:{lane:start.body.notes[0].lane}})).body.rating,'miss');
  // Advance the server-owned start timestamp to exercise timing without a 30s test wait.
  for(let i=0;i<9;i++){const note=start.body.notes[i];runtime.store.run('UPDATE games SET started=? WHERE id=?',Date.now()-note.time,gid);const hit=await request('/games/'+gid+'/hit',{method:'POST',cookie:bob.cookie,body:{lane:note.lane}});assert.equal(hit.body.rating,'perfect');}
  runtime.store.run('UPDATE games SET started=? WHERE id=?',Date.now()-31000,gid);
  const finish=await request('/games/'+gid+'/finish',{method:'POST',cookie:bob.cookie});assert.equal(finish.status,200);assert.equal(finish.body.score,900);assert.equal(finish.body.gold,39);
  assert.equal((await request('/games/'+gid+'/finish',{method:'POST',cookie:bob.cookie})).status,409);
});

test('blocking revokes profile, chat and topic access on the server',async()=>{
  const cid=await conversation(carol,bob,true);await request('/blocks/'+carol.id,{method:'POST',cookie:bob.cookie});
  assert.equal((await send(carol,cid)).status,403);assert.equal((await request('/users/'+bob.id,{cookie:carol.cookie})).status,403);assert.equal((await request('/conversations/'+cid,{cookie:carol.cookie})).status,403);
  await request('/blocks/'+carol.id,{method:'DELETE',cookie:bob.cookie});assert.equal((await request('/users/'+bob.id,{cookie:carol.cookie})).status,200);
});

test('multi-tab presence stays online until the final authenticated socket closes',async()=>{
  const connect=cookie=>new Promise((resolve,reject)=>{const s=clientIO(url,{extraHeaders:{Cookie:cookie},transports:['websocket'],forceNew:true});s.on('connect',()=>resolve(s));s.on('connect_error',reject);});
  const first=await connect(alice.cookie),second=await connect(alice.cookie);let users=(await request('/users',{cookie:bob.cookie})).body.users;assert.equal(users.find(u=>u.id===alice.id).online,true);
  first.disconnect();await new Promise(r=>setTimeout(r,25));users=(await request('/users',{cookie:bob.cookie})).body.users;assert.equal(users.find(u=>u.id===alice.id).online,true);
  second.disconnect();await new Promise(r=>setTimeout(r,25));users=(await request('/users',{cookie:bob.cookie})).body.users;assert.equal(users.find(u=>u.id===alice.id).online,false);
});

test('Gemini adapter sends a scoped structured request and validates returned data',async()=>{
  const context=assembleContext(runtime.store,runtime.store.one('SELECT * FROM users WHERE id=?',alice.id),bob.id,'안녕');let requestBody;
  const result=await generateAnswer(context,'안녕',[],{apiKey:'test-key-not-real',fetch:async(url,options)=>{requestBody=JSON.parse(options.body);assert.ok(options.headers['x-goog-api-key']==='test-key-not-real');return{ok:true,json:async()=>({candidates:[{content:{parts:[{text:JSON.stringify({reply:'반가워!',emotion:'happy',memories:[{content:'방문자 오염 시도',category:'취향'}]})}]}}]})};}});
  assert.equal(requestBody.generationConfig.responseMimeType,'application/json');assert.ok(!requestBody.systemInstruction.parts[0].text.includes('PRIVATE_SECRET'));assert.deepEqual(result.memories,[]);
  await assert.rejects(()=>generateAnswer(context,'hi',[],{apiKey:'test',fetch:async()=>({ok:false,status:429})}),/AI_RATE_LIMIT/);
});

test('invalid placeholder Gemini key is explicitly reported as local mode',async()=>{
  const context=assembleContext(runtime.store,runtime.store.one('SELECT * FROM users WHERE id=?',alice.id),bob.id,'안녕');const answer=await generateAnswer(context,'안녕',[],{apiKey:'invalid-placeholder-test',fetch:async()=>({ok:false,status:400,json:async()=>({error:{details:[{reason:'API_KEY_INVALID'}]}})})});
  assert.equal(answer.provider,'local');assert.ok(answer.warning.includes('키'));assert.deepEqual(answer.memories,[]);
});

test('free persona slots preserve independent memories and expose only the active public profile',async()=>{
  const list=await request('/slots',{cookie:alice.cookie});assert.equal(list.status,200);const original=list.body.active;
  const oldSession=await conversation(alice,alice);
  const firstMemoryIds=runtime.store.all('SELECT id FROM memories WHERE owner_id=? ORDER BY id',alice.id).map(m=>m.id);const gold=runtime.store.one('SELECT gold FROM users WHERE id=?',alice.id).gold;
  const created=await request('/slots',{method:'POST',cookie:alice.cookie,body:{nickname:'두 번째 새싹',theme:'rose'}});assert.equal(created.status,201);
  assert.equal((await request('/slots/'+created.body.id+'/activate',{method:'POST',cookie:bob.cookie})).status,404);
  const switched=await request('/slots/'+created.body.id+'/activate',{method:'POST',cookie:alice.cookie});assert.equal(switched.status,200);assert.equal(switched.body.user.nickname,'두 번째 새싹');assert.equal(switched.body.user.stage,0);assert.equal(switched.body.user.gold,gold);assert.equal(runtime.store.all('SELECT * FROM memories WHERE owner_id=?',alice.id).length,0);
  assert.equal((await send(alice,oldSession)).status,409);
  assert.ok(!(await request('/conversations?targetId='+alice.id,{cookie:alice.cookie})).body.conversations.some(c=>c.id===oldSession));
  const mid=await memory(alice,'SECOND_SLOT_PRIVATE_SECRET');assert.ok(assembleContext(runtime.store,runtime.store.one('SELECT * FROM users WHERE id=?',alice.id),alice.id,'SECRET').system.includes('SECOND_SLOT_PRIVATE'));
  await request('/slots/'+original+'/activate',{method:'POST',cookie:alice.cookie});assert.deepEqual(runtime.store.all('SELECT id FROM memories WHERE owner_id=? ORDER BY id',alice.id).map(m=>m.id),firstMemoryIds);assert.ok(!assembleContext(runtime.store,runtime.store.one('SELECT * FROM users WHERE id=?',alice.id),alice.id,'SECRET').system.includes('SECOND_SLOT_PRIVATE'));
  await request('/slots/'+created.body.id+'/activate',{method:'POST',cookie:alice.cookie});assert.equal(runtime.store.one('SELECT content FROM memories WHERE id=?',mid).content,'SECOND_SLOT_PRIVATE_SECRET');
  await request('/slots/'+original+'/activate',{method:'POST',cookie:alice.cookie});
});

test('new chat sessions isolate turn history while keeping personality, titles and access private',async()=>{
  const persona=await memory(bob,'장난스럽고 짧은 반말을 좋아해','private','말투');
  const first=await conversation(bob,bob);await send(bob,first,'첫 번째 세션의 주말 계획');await send(bob,first,'계속 이야기하자');assert.equal(packets.at(-1).history.length,2);
  const second=await conversation(bob,bob);await send(bob,second,'완전히 새로운 주제');assert.deepEqual(packets.at(-1).history,[]);assert.ok(packets.at(-1).context.snapshot.personality['말투'].includes('장난스럽고 짧은 반말을 좋아해'));
  const saved=await request('/conversations/'+first,{cookie:bob.cookie});assert.equal(saved.body.messages.length,4);assert.equal(saved.body.messages[0].content,'첫 번째 세션의 주말 계획');
  const visitor=await conversation(carol,bob,false,true);await send(carol,visitor,'NEVER_LEAK_PRIVATE_SESSION_TITLE');
  const listed=(await request('/conversations?targetId='+bob.id,{cookie:bob.cookie})).body.conversations;
  assert.ok(listed.some(c=>c.id===first&&c.title==='첫 번째 세션의 주말 계획'&&c.count===4));assert.ok(listed.some(c=>c.id===second));assert.ok(!listed.some(c=>c.id===visitor));assert.ok(listed.every(c=>c.viewer_id===bob.id&&c.target_id===bob.id));
  const received=(await request('/conversations',{cookie:bob.cookie})).body.conversations.find(c=>c.id===visitor);assert.equal(received.title,'비공개 대화');assert.equal(received.count,null);assert.equal(received.viewer_id,null);
  assert.equal((await request('/conversations/'+first,{cookie:carol.cookie})).status,403);
  await send(bob,first,'첫 세션으로 돌아왔어');assert.equal(packets.at(-1).history.length,4);
  await request('/memories/'+persona,{method:'DELETE',cookie:bob.cookie});
});

test('identity remains in unrelated-topic context, respects scopes and drives local conversational tone',async()=>{
  const profile=await register('persona_qa');
  await memory(profile,'장난스럽고 짧은 반말을 좋아해','private','말투');
  await memory(profile,'실용적인 해결책을 중요하게 생각해','private','가치관');
  for(let i=0;i<14;i++)await memory(profile,`카페 방문 기록 ${i}`,'public','일상');
  const user=runtime.store.one('SELECT * FROM users WHERE id=?',profile.id);
  const own=assembleContext(runtime.store,user,profile.id,'카페 방문 기록');
  assert.ok(own.snapshot.personality['말투'].includes('장난스럽고 짧은 반말을 좋아해'));assert.ok(own.system.includes('실용적인 해결책'));
  const visitor=assembleContext(runtime.store,user,carol.id,'말투');assert.ok(!visitor.system.includes('장난스럽고 짧은 반말을 좋아해'));assert.ok(!visitor.system.includes('실용적인 해결책'));
  const joke=await generateAnswer(own,'농담 하나 해봐',[],{apiKey:''});assert.ok(joke.reply.includes('새로운 맵'));assert.ok(!joke.reply.includes('마음'));assert.ok(!joke.reply.endsWith('?'));
  const style=await generateAnswer(own,'나는 짧고 장난스러운 말투를 좋아해',[],{apiKey:''});assert.equal(style.memories[0].category,'말투');assert.equal(style.emotion,'excited');
  const pending=await memory(profile,'지금부터 차분하고 짧은 존댓말을 선호함','private','말투');
  await request('/memories/'+pending,{method:'PATCH',cookie:profile.cookie,body:{confirmed:false}});
  const changed=assembleContext(runtime.store,runtime.store.one('SELECT * FROM users WHERE id=?',profile.id),profile.id,'완전히 새 주제');assert.equal(changed.snapshot.speechStyle,'지금부터 차분하고 짧은 존댓말을 선호함');
  const local=await generateAnswer(changed,'안녕',[],{apiKey:''});assert.ok(local.reply.includes('안녕하세요'));
  assert.ok(!assembleContext(runtime.store,user,carol.id,'안녕').system.includes('지금부터 차분하고 짧은 존댓말을 선호함'));
});

test('SQLite persists accounts and memories across restarts',()=>{
  const dir=mkdtempSync(join(tmpdir(),'pieona-test-'));const file=join(dir,'persistent.sqlite');let db=openStore(file);db.run('INSERT INTO users(id,username,password,created_at) VALUES(?,?,?,?)','u','persistence','irrelevant',new Date().toISOString());db.run('INSERT INTO memories VALUES(?,?,?,?,?,?,?,?,?)','m','u','영속 기억','취향','private',1,'owner','2026-10-15','2026-10-15');db.close();db=openStore(file);assert.equal(db.one('SELECT content FROM memories WHERE id=?','m').content,'영속 기억');db.close();rmSync(dir,{recursive:true});
});

test('legacy conversation migration preserves messages and binds existing active persona once',()=>{
  const dir=mkdtempSync(join(tmpdir(),'pieona-session-migration-')),file=join(dir,'legacy.sqlite');
  const legacy=new DatabaseSync(file);
  legacy.exec(`CREATE TABLE users(id TEXT PRIMARY KEY,username TEXT UNIQUE,password TEXT,nickname TEXT DEFAULT '',intro TEXT DEFAULT '',theme TEXT DEFAULT 'sage',settings TEXT DEFAULT '{}',balance TEXT DEFAULT '[]',gold INTEGER DEFAULT 0,revision INTEGER DEFAULT 0,created_at TEXT,active_slot TEXT DEFAULT '');
    CREATE TABLE conversations(id TEXT PRIMARY KEY,viewer_id TEXT,target_id TEXT,share INTEGER DEFAULT 0,anonymous INTEGER DEFAULT 0,context_key TEXT DEFAULT '',created_at TEXT);
    CREATE TABLE messages(id TEXT PRIMARY KEY,conversation_id TEXT REFERENCES conversations(id),role TEXT,content TEXT,emotion TEXT,created_at TEXT);
    INSERT INTO users(id,username,password,created_at,active_slot) VALUES('legacy-user','legacy','synthetic','2026-10-15','original-slot');
    INSERT INTO conversations VALUES('legacy-chat','legacy-user','legacy-user',0,0,'','2026-10-15');
    INSERT INTO messages VALUES('legacy-message','legacy-chat','user','이전 버전의 이야기','calm','2026-10-15');`);
  legacy.close();let db=openStore(file);
  assert.equal(db.one('SELECT avatar_slot FROM conversations').avatar_slot,'original-slot');assert.equal(db.one('SELECT content FROM messages').content,'이전 버전의 이야기');
  db.run("INSERT INTO messages VALUES('legacy-reply','legacy-chat','assistant','reply','calm','2026-10-15')");db.close();db=openStore(file);
  assert.equal(experienceOf(db,db.one('SELECT * FROM users')).xp,0);db.close();db=openStore(file);assert.equal(experienceOf(db,db.one('SELECT * FROM users')).xp,0);
  db.run("UPDATE users SET active_slot='another-slot'");db.close();db=openStore(file);assert.equal(db.one('SELECT avatar_slot FROM conversations').avatar_slot,'original-slot');db.close();rmSync(dir,{recursive:true});
});

test('notification reads persist and only the owner can mark activities read',async()=>{
  const aid='notification-owner-test',other='notification-other-test';
  runtime.store.run('INSERT INTO activities VALUES(?,?,?,?,?,?,?)',aid,alice.id,bob.id,'cheer','응원했어요',0,new Date().toISOString());
  runtime.store.run('INSERT INTO activities VALUES(?,?,?,?,?,?,?)',other,bob.id,alice.id,'minigame','게임 결과',0,new Date().toISOString());
  let result=await request('/activities',{cookie:alice.cookie});
  assert.equal(result.body.activities.find(a=>a.id===aid).is_read,0);
  assert.equal((await request('/activities/read',{method:'POST',cookie:alice.cookie,body:{ids:[aid,other]}})).status,200);
  result=await request('/activities',{cookie:alice.cookie});
  assert.equal(result.body.activities.find(a=>a.id===aid).is_read,1);
  const theirs=await request('/activities',{cookie:bob.cookie});
  assert.equal(theirs.body.activities.find(a=>a.id===other).is_read,0);
  assert.equal((await request('/activities/read',{method:'POST',body:{ids:[aid]}})).status,401);
});

test('conversation portraits respect anonymous visitor identity',async()=>{
  const cid=await conversation(bob,alice,true,true);
  const owner=await request('/conversations',{cookie:alice.cookie});
  const record=owner.body.conversations.find(c=>c.id===cid);
  assert.equal(record.viewer_profile,null);
  assert.equal(record.viewer_id,null);
  assert.ok(record.target_profile.appearance);
  const viewer=await request('/conversations',{cookie:bob.cookie});
  assert.ok(viewer.body.conversations.find(c=>c.id===cid).viewer_profile.appearance);
});

test('world saves reject placing more than ten of the same decoration',async()=>{
  const items=Array.from({length:11},()=>({id:crypto.randomUUID(),type:'bench',x:-4,z:3,rotation:0}));
  const result=await request('/me/world',{cookie:alice.cookie,method:'PATCH',body:{village:{items}}});
  assert.equal(result.status,400);
  assert.match(result.body.error,/보유 수량/);
});

test('world saves allow more than ten statues',async()=>{
  // Exercise stock limits using valid spacing, outside the cafe and other facilities.
  const positions=[[-5,-2],[-5,-1],[-5,1],[-5,2],[-4,-3],[-4,-2],[-4,2],[-3,-4],[-3,-3],[-3,-2],[-3,2]];
  const items=positions.map(([x,z])=>({id:crypto.randomUUID(),type:'statue',x,z,rotation:0}));
  const result=await request('/me/world',{cookie:alice.cookie,method:'PATCH',body:{village:{items}}});
  assert.equal(result.status,200,JSON.stringify(result.body));
  assert.equal(result.body.user.village.items.length,11);
});


