import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {ALL_ITEMS} from '../shared/life.mjs';
import {galaxyNpcs,galaxyNpc} from '../shared/galaxy.mjs';
import {STAR_TYPES,STAR_GRADES,NPC_WISHES,discoveryChance,ROBOT_BATTERY_MS,ROBOT_CYCLE_MS,DEFENSE_DURATION_MS,persuasionChance} from '../shared/colony.mjs';
const fail=message=>{throw Object.assign(new Error(message),{status:409});};
export function installColony({app,store,auth,villageVisitors,onChange=()=>{},clock=Date.now,random=Math.random}){
  store.db.exec(`CREATE TABLE IF NOT EXISTS colony_discovery(owner_id TEXT PRIMARY KEY,star TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS colony_stars(owner_id TEXT NOT NULL,star_id TEXT NOT NULL,type TEXT NOT NULL,grade TEXT NOT NULL,bonus INTEGER NOT NULL,cost INTEGER NOT NULL,PRIMARY KEY(owner_id,star_id));
    CREATE TABLE IF NOT EXISTS colony_games(game_id TEXT NOT NULL,owner_id TEXT NOT NULL,kind TEXT NOT NULL,processed INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(game_id,owner_id,kind));
    CREATE TABLE IF NOT EXISTS colony_defenses(id TEXT PRIMARY KEY,owner_id TEXT NOT NULL,letter_id TEXT NOT NULL,started INTEGER NOT NULL,last_shot INTEGER NOT NULL DEFAULT 0,hits TEXT NOT NULL DEFAULT '[]',status TEXT NOT NULL DEFAULT 'active');
    CREATE UNIQUE INDEX IF NOT EXISTS colony_one_defense ON colony_defenses(owner_id) WHERE status='active';
    CREATE TABLE IF NOT EXISTS colony_grants(owner_id TEXT PRIMARY KEY);
    CREATE TABLE IF NOT EXISTS colony_robots(owner_id TEXT NOT NULL,item_id TEXT NOT NULL,started INTEGER NOT NULL,settled INTEGER NOT NULL,runtime INTEGER NOT NULL DEFAULT 0,collected INTEGER NOT NULL DEFAULT 0,active INTEGER NOT NULL DEFAULT 1,PRIMARY KEY(owner_id,item_id));
    CREATE TABLE IF NOT EXISTS colony_relations(owner_id TEXT NOT NULL,npc_id TEXT NOT NULL,affinity INTEGER NOT NULL DEFAULT 0,revealed INTEGER NOT NULL DEFAULT 0,talked INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(owner_id,npc_id));
    CREATE TABLE IF NOT EXISTS colony_letters(id TEXT PRIMARY KEY,owner_id TEXT NOT NULL,npc_id TEXT NOT NULL,star_id TEXT NOT NULL,star_name TEXT NOT NULL,cost INTEGER NOT NULL,status TEXT NOT NULL,created INTEGER NOT NULL);
    CREATE TRIGGER IF NOT EXISTS colony_game_finished AFTER UPDATE OF finished ON games WHEN NEW.finished=1 AND OLD.finished=0 BEGIN INSERT OR IGNORE INTO colony_games(game_id,owner_id,kind) VALUES(NEW.id,NEW.user_id,'game'); END;
    CREATE TRIGGER IF NOT EXISTS colony_social_finished AFTER INSERT ON social_game_records BEGIN INSERT OR IGNORE INTO colony_games(game_id,owner_id,kind) VALUES(NEW.id,NEW.user_id,'social'); END;`);
  const columns=new Set(store.all('PRAGMA table_info(colony_robots)').map(c=>c.name));
  if(!columns.has('total_runtime'))store.db.exec('ALTER TABLE colony_robots ADD COLUMN total_runtime INTEGER NOT NULL DEFAULT 0');
  const grant=(uid,item,quantity)=>store.run('INSERT INTO inventory_entries VALUES(?,?,?) ON CONFLICT(owner_id,item_id) DO UPDATE SET quantity=quantity+excluded.quantity',uid,item,quantity);
  function spend(uid,item,quantity){if(!store.run('UPDATE inventory_entries SET quantity=quantity-? WHERE owner_id=? AND item_id=? AND quantity>=?',quantity,uid,item,quantity).changes)fail('보유 자원이 부족해요.');}
  function ensure(uid){if(store.run('INSERT OR IGNORE INTO colony_grants VALUES(?)',uid).changes)grant(uid,'STAR_CORE',3);}
  function settleRobots(uid){
    for(const r of store.all('SELECT * FROM colony_robots WHERE owner_id=? AND active=1',uid)){
      const elapsed=Math.max(0,Math.min(clock()-r.settled,ROBOT_BATTERY_MS-r.runtime)),runtime=r.runtime+elapsed;
      const cycles=Math.floor(runtime/ROBOT_CYCLE_MS)-Math.floor(r.runtime/ROBOT_CYCLE_MS);
      const bonus=bestBonus(store,uid,'red'),quantity=cycles+Math.floor(Math.floor(runtime/ROBOT_CYCLE_MS)*bonus/100)-Math.floor(Math.floor(r.runtime/ROBOT_CYCLE_MS)*bonus/100);
      if(quantity)grant(uid,'IRON_ORE',quantity);
      store.run('UPDATE colony_robots SET settled=?,runtime=?,total_runtime=total_runtime+?,collected=collected+? WHERE owner_id=? AND item_id=?',clock(),runtime,elapsed,quantity,uid,r.item_id);
    }
  }
  function syncRobots(uid,village){store.transaction(()=>{
    settleRobots(uid);
    const items=(village.items||[]).filter(i=>i.type==='miningRobot'&&!i.hidden),ids=new Set(items.map(i=>i.id));
    for(const r of store.all('SELECT item_id FROM colony_robots WHERE owner_id=?',uid))if(!ids.has(r.item_id))store.run('UPDATE colony_robots SET active=0 WHERE owner_id=? AND item_id=?',uid,r.item_id);
    for(const item of items){store.run('INSERT OR IGNORE INTO colony_robots(owner_id,item_id,started,settled) VALUES(?,?,?,?)',uid,item.id,clock(),clock());store.run('UPDATE colony_robots SET active=1,settled=? WHERE owner_id=? AND item_id=?',clock(),uid,item.id);}
  });}
  function processGames(uid){
    for(const row of store.all('SELECT * FROM colony_games WHERE owner_id=? AND processed=0 ORDER BY rowid',uid)){
      store.run('UPDATE colony_games SET processed=1 WHERE game_id=? AND owner_id=? AND kind=?',row.game_id,uid,row.kind);
      // One independent roll per participant, and at most one outstanding discovery.
      let players=1;
      if(row.kind==='social')players=store.one('SELECT COUNT(*) n FROM social_game_records WHERE id=?',row.game_id).n;
      else {const g=store.one('SELECT * FROM games WHERE id=?',row.game_id);players=store.one('SELECT COUNT(*) n FROM games WHERE target_id=? AND kind=? AND started=?',g.target_id,g.kind,g.started).n;}
      grant(uid,'STAR_CORE',1);
      if(store.one('SELECT 1 FROM colony_discovery WHERE owner_id=?',uid)||random()>=discoveryChance(players))continue;
      const type=STAR_TYPES[Math.min(2,Math.floor(random()*3))],roll=random(),grade=STAR_GRADES[roll<.5?0:roll<.8?1:roll<.95?2:3];
      const star={...type,...grade,id:'found-'+type.id+'-'+randomUUID(),type:type.id,grade:grade.id,players,chance:discoveryChance(players)};
      store.run('INSERT INTO colony_discovery VALUES(?,?)',uid,JSON.stringify(star));
    }
  }
  function snapshot(uid){return store.transaction(()=>{
    ensure(uid);processGames(uid);settleRobots(uid);settleDefense(uid);
    return {serverTime:clock(),discovery:JSON.parse(store.one('SELECT star FROM colony_discovery WHERE owner_id=?',uid)?.star||'null'),
      inventory:store.all('SELECT item_id AS itemId,quantity FROM inventory_entries WHERE owner_id=? AND quantity>0',uid),
      stars:store.all("SELECT star_id AS id,type,grade,bonus,cost,EXISTS(SELECT 1 FROM colony_letters l WHERE l.owner_id=s.owner_id AND l.star_id=s.star_id AND l.status='occupied') AS occupied FROM colony_stars s WHERE owner_id=?",uid),
      defense:defenseView(uid),
      robots:store.all('SELECT item_id AS id,started,runtime,total_runtime AS totalRuntime,collected,active FROM colony_robots WHERE owner_id=? AND active=1',uid).map(r=>({...r,battery:Math.max(0,Math.ceil(100*(1-r.runtime/ROBOT_BATTERY_MS)))})),
      npcs:galaxyNpcs.map((npc,i)=>{const r=store.one('SELECT * FROM colony_relations WHERE owner_id=? AND npc_id=?',uid,npc.id);return {id:npc.id,name:npc.nickname,affinity:r?.affinity||0,persuasionChance:persuasionChance(r?.affinity||0),wishlist:NPC_WISHES[i].slice(0,r?.revealed||0)};}),
      letters:store.all('SELECT * FROM colony_letters WHERE owner_id=? ORDER BY created DESC LIMIT 30',uid)};
  });}
  const present=(uid,npc)=>{if(!galaxyNpc(npc)||!villageVisitors.get(npc)?.has(uid))fail('NPC의 별로 찾아가서 이야기해 주세요.');};
  app.get('/api/me/colony',auth,(req,res)=>res.json(snapshot(req.user.id)));
  app.post('/api/me/colony/claim',auth,(req,res)=>{
    const uid=req.user.id;store.transaction(()=>{
      ensure(uid);const row=store.one('SELECT star FROM colony_discovery WHERE owner_id=?',uid);if(!row)fail('발견한 별이 없어요.');
      const star=JSON.parse(row.star);if(req.body?.starId!==star.id)fail('발견한 별을 다시 확인해 주세요.');spend(uid,'STAR_CORE',star.cost);
      store.run('INSERT INTO owned_stars VALUES(?,?,?)',uid,star.id,star.name+' · '+star.grade);
      store.run('INSERT INTO colony_stars VALUES(?,?,?,?,?,?)',uid,star.id,star.type,star.grade,star.bonus,star.cost);
      store.run('DELETE FROM colony_discovery WHERE owner_id=?',uid);
      if(random()<.4){const npc=galaxyNpcs[Math.min(3,Math.floor(random()*4))];store.run('INSERT INTO colony_letters VALUES(?,?,?,?,?,?,?,?)',randomUUID(),uid,npc.id,star.id,star.name,star.cost,'pending',clock());}
    });res.json(snapshot(uid));
  });
  app.post('/api/me/colony/discard',auth,(req,res)=>{store.run("DELETE FROM colony_discovery WHERE owner_id=? AND json_extract(star,'$.id')=?",req.user.id,z.string().parse(req.body.starId));res.json(snapshot(req.user.id));});
  app.post('/api/me/colony/robots/:id/recharge',auth,(req,res)=>{const uid=req.user.id;store.transaction(()=>{settleRobots(uid);if(!store.one('SELECT 1 FROM colony_robots WHERE owner_id=? AND item_id=? AND active=1',uid,req.params.id))fail('배치된 로봇을 선택해 주세요.');spend(uid,'IRON_ORE',5);store.run('UPDATE colony_robots SET runtime=0,settled=? WHERE owner_id=? AND item_id=?',clock(),uid,req.params.id);});res.json(snapshot(uid));});
  app.post('/api/npcs/:id/talk',auth,(req,res)=>{const uid=req.user.id,npc=req.params.id;present(uid,npc);let reply;store.transaction(()=>{
    store.run('INSERT OR IGNORE INTO colony_relations(owner_id,npc_id) VALUES(?,?)',uid,npc);
    const r=store.one('SELECT * FROM colony_relations WHERE owner_id=? AND npc_id=?',uid,npc),wishes=NPC_WISHES[galaxyNpcs.findIndex(n=>n.id===npc)];
    const gain=!r.talked||clock()-r.talked>=60_000?1:0;
    store.run('UPDATE colony_relations SET revealed=MIN(2,revealed+1),affinity=MIN(1000,affinity+?),talked=CASE WHEN ?=1 THEN ? ELSE talked END WHERE owner_id=? AND npc_id=?',gain,gain,clock(),uid,npc);
    const letter=store.one('SELECT * FROM colony_letters WHERE owner_id=? AND npc_id=? ORDER BY created DESC LIMIT 1',uid,npc);
    reply=letter?.status==='occupied'?'내 우주선이 그 별을 점령했지. 되찾고 싶다면 탈환전을 해 봐.':letter?.status==='attacking'?'네 주장은 받아들이지 않을 거야. 우주선을 보내겠다!':letter?.status==='defended'?'네가 우주선을 막아낸 일을 기억하고 있어. 이번에는 네 별로 인정할게.':letter?.status==='pending'?`그 별은 내가 눈여겨보던 곳이야. 양보해 주면 핵 ${letter.cost*2}개를 줄게.`:letter?.status==='ceded'?'별을 양보해 준 일, 기억하고 있어. 고마워!':letter?.status==='kept'?'그 별을 소중히 가꾸고 싶다고 했지. 네 선택을 기억해.':`요즘 ${ALL_ITEMS.find(i=>i.itemId===wishes[Math.min(r.revealed,1)])?.name}을 찾고 있어. 선물해 주면 기쁠 것 같아!`;
  });res.json({...snapshot(uid),reply});});
  app.post('/api/npcs/:id/trade',auth,(req,res)=>{const uid=req.user.id,npc=req.params.id;present(uid,npc);const {itemId,quantity}=z.object({itemId:z.string(),quantity:z.number().int().min(1).max(99)}).parse(req.body);
    if(!ALL_ITEMS.some(i=>i.itemId===itemId))fail('거래할 아이템을 확인해 주세요.');
    let reward;store.transaction(()=>{const wishes=NPC_WISHES[galaxyNpcs.findIndex(n=>n.id===npc)],wanted=wishes.includes(itemId);spend(uid,itemId,quantity);reward={itemId:wanted?'STAR_CORE':'IRON_ORE',quantity:wanted?Math.min(5,quantity):quantity};grant(uid,reward.itemId,reward.quantity);
      store.run('INSERT OR IGNORE INTO colony_relations(owner_id,npc_id) VALUES(?,?)',uid,npc);store.run('UPDATE colony_relations SET affinity=MIN(1000,affinity+?) WHERE owner_id=? AND npc_id=?',(wanted?5:1)*quantity,uid,npc);
    });res.json({...snapshot(uid),reward,reply:'고마워! 내가 고른 보답도 받아 줘.'});});
  app.post('/api/me/colony/letters/:id/resolve',auth,(req,res)=>{const uid=req.user.id,{choice}=z.object({choice:z.enum(['cede','keep'])}).parse(req.body);store.transaction(()=>{
    const letter=store.one("SELECT * FROM colony_letters WHERE id=? AND owner_id=? AND status='pending'",req.params.id,uid);if(!letter)fail('이미 해결한 편지예요.');present(uid,letter.npc_id);
    if(choice==='cede'){
      if(!store.run('DELETE FROM owned_stars WHERE owner_id=? AND star_id=?',uid,letter.star_id).changes)fail('소유한 별이 아니에요.');
      store.run('DELETE FROM colony_stars WHERE owner_id=? AND star_id=?',uid,letter.star_id);store.run('INSERT INTO owned_stars VALUES(?,?,?)',letter.npc_id,letter.star_id,letter.star_name);grant(uid,'STAR_CORE',letter.cost*2);
      for(const member of villageVisitors.get(uid)?.values()||[])if(member.starId===letter.star_id)member.starId='plaza';
    }
    store.run('UPDATE colony_letters SET status=? WHERE id=?',choice==='cede'?'ceded':random()<persuasionChance(store.one('SELECT affinity FROM colony_relations WHERE owner_id=? AND npc_id=?',uid,letter.npc_id)?.affinity||0)?'kept':'attacking',letter.id);
  });res.json(snapshot(uid));});
  function letterFor(uid,id){const l=store.one('SELECT * FROM colony_letters WHERE id=? AND owner_id=?',id,uid);if(!l)fail('편지를 찾을 수 없어요.');return l;}
  function defenseView(uid){const d=store.one("SELECT * FROM colony_defenses WHERE owner_id=? AND status='active'",uid);if(!d)return null;return {id:d.id,letterId:d.letter_id,started:d.started,duration:DEFENSE_DURATION_MS,hits:JSON.parse(d.hits),ships:Array.from({length:15},(_,i)=>({id:i,lane:i%3,spawn:i*1000,arrives:i*1000+6000}))};}
  function settleDefense(uid){const d=store.one("SELECT * FROM colony_defenses WHERE owner_id=? AND status='active'",uid);if(!d||clock()<d.started+DEFENSE_DURATION_MS)return;
    const won=JSON.parse(d.hits).length>=12;store.run('UPDATE colony_defenses SET status=? WHERE id=?',won?'won':'lost',d.id);
    store.run('UPDATE colony_letters SET status=? WHERE id=?',won?'defended':'occupied',d.letter_id);onChange(uid);
  }
  app.post('/api/me/colony/letters/:id/defense',auth,(req,res)=>{const uid=req.user.id;store.transaction(()=>{settleDefense(uid);const l=letterFor(uid,req.params.id);
    if(!['attacking','occupied'].includes(l.status))fail('방어전 또는 탈환전이 필요하지 않아요.');
    if(store.one("SELECT 1 FROM colony_defenses WHERE owner_id=? AND status='active'",uid))fail('이미 전투가 진행 중이에요.');
    store.run('INSERT INTO colony_defenses(id,owner_id,letter_id,started) VALUES(?,?,?,?)',randomUUID(),uid,l.id,clock());
  });res.json(snapshot(uid));});
  app.post('/api/me/colony/defense/:id/fire',auth,(req,res)=>{const uid=req.user.id,{lane}=z.object({lane:z.number().int().min(0).max(2)}).parse(req.body);store.transaction(()=>{settleDefense(uid);
    const d=store.one("SELECT * FROM colony_defenses WHERE id=? AND owner_id=? AND status='active'",req.params.id,uid);if(!d)fail('진행 중인 전투가 없어요.');
    if(clock()-d.last_shot<350)fail('포탑이 재충전 중이에요.');const elapsed=clock()-d.started,hits=JSON.parse(d.hits);
    const target=Array.from({length:15},(_,i)=>i).find(i=>i%3===lane&&!hits.includes(i)&&elapsed>=i*1000&&elapsed<i*1000+6000);
    if(target!==undefined)hits.push(target);store.run('UPDATE colony_defenses SET hits=?,last_shot=? WHERE id=?',JSON.stringify(hits),clock(),d.id);
  });res.json(snapshot(uid));});
  function available(uid,id){settleDefense(uid);return !!store.one("SELECT 1 FROM owned_stars s WHERE owner_id=? AND star_id=? AND NOT EXISTS(SELECT 1 FROM colony_letters l WHERE l.owner_id=s.owner_id AND l.star_id=s.star_id AND l.status IN ('occupied','attacking'))",uid,id);}
  // Existing placed robots are adopted once; moving one keeps its battery and production history.
  for(const u of store.all("SELECT id,village FROM users WHERE username NOT LIKE '@galaxy:%'"))syncRobots(u.id,JSON.parse(u.village));
  return {snapshot,syncRobots,available};
}
export function bestBonus(store,uid,type){if(!store.one("SELECT 1 FROM sqlite_master WHERE name='colony_stars'"))return 0;return store.one("SELECT MAX(bonus) bonus FROM colony_stars s WHERE owner_id=? AND type=? AND NOT EXISTS(SELECT 1 FROM colony_letters l WHERE l.owner_id=s.owner_id AND l.star_id=s.star_id AND l.status IN ('occupied','attacking'))",uid,type)?.bonus||0;}
