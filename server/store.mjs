import {normalizeVillageTheme} from '../shared/world.mjs';
import {galaxyNpc} from '../shared/galaxy.mjs';
import {platformColor} from '../shared/platform.mjs';
import {defaultPetAppearance,petAppearance} from '../shared/pets.mjs';
import {dragonMounted,dragonMountColor} from '../shared/dragonMount.mjs';
import {SURVEY_REWARD} from '../shared/surveyRewards.mjs';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import {createHash} from 'node:crypto';

export const id = () => randomUUID();
export const now = () => new Date().toISOString();
export const day = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' });
export function openStore(filename = './data/pieona.sqlite') {
  if (filename !== ':memory:') mkdirSync(dirname(resolve(filename)), { recursive: true });
  const db = new DatabaseSync(filename);
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY, username TEXT UNIQUE NOT NULL, password TEXT NOT NULL,
      nickname TEXT NOT NULL DEFAULT '', intro TEXT NOT NULL DEFAULT '', theme TEXT NOT NULL DEFAULT 'sage',
      settings TEXT NOT NULL DEFAULT '{}', balance TEXT NOT NULL DEFAULT '[]', gold INTEGER NOT NULL DEFAULT 0,
      revision INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS memories (
      id TEXT PRIMARY KEY, owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      content TEXT NOT NULL, category TEXT NOT NULL, visibility TEXT NOT NULL DEFAULT 'private',
      confirmed INTEGER NOT NULL DEFAULT 0, source TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS memories_owner ON memories(owner_id);
    CREATE TABLE IF NOT EXISTS chalkboards (
      owner_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, strokes TEXT NOT NULL DEFAULT '[]', revision INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS chalkboard_requests (
      owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, request_id TEXT NOT NULL, author_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, PRIMARY KEY(owner_id,request_id,author_id)
    );
    CREATE TABLE IF NOT EXISTS guestbook_entries (
      id TEXT PRIMARY KEY, owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      author_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, content TEXT NOT NULL,
      anonymous INTEGER NOT NULL DEFAULT 0, visibility TEXT NOT NULL DEFAULT 'public', created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS guestbook_owner ON guestbook_entries(owner_id,created_at DESC,id DESC);
    CREATE TABLE IF NOT EXISTS friendships (owner_id TEXT NOT NULL REFERENCES users(id), friend_id TEXT NOT NULL REFERENCES users(id), status TEXT NOT NULL DEFAULT 'pending', close INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(owner_id, friend_id));
    CREATE TABLE IF NOT EXISTS blocks (owner_id TEXT NOT NULL REFERENCES users(id), blocked_id TEXT NOT NULL REFERENCES users(id), PRIMARY KEY(owner_id, blocked_id));
    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY, viewer_id TEXT NOT NULL REFERENCES users(id), target_id TEXT NOT NULL REFERENCES users(id),
      share INTEGER NOT NULL DEFAULT 0, anonymous INTEGER NOT NULL DEFAULT 0, context_key TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS conversations_viewer ON conversations(viewer_id,target_id);
    CREATE TABLE IF NOT EXISTS messages (id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE, role TEXT NOT NULL, content TEXT NOT NULL, emotion TEXT NOT NULL DEFAULT 'calm', created_at TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS messages_conversation ON messages(conversation_id,created_at);
    CREATE TABLE IF NOT EXISTS activities (id TEXT PRIMARY KEY, owner_id TEXT NOT NULL REFERENCES users(id), actor_id TEXT NOT NULL REFERENCES users(id), type TEXT NOT NULL, detail TEXT NOT NULL DEFAULT '', anonymous INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS notification_reads (activity_id TEXT PRIMARY KEY REFERENCES activities(id) ON DELETE CASCADE);
    CREATE TABLE IF NOT EXISTS rewards (user_id TEXT NOT NULL REFERENCES users(id), actor_id TEXT NOT NULL, type TEXT NOT NULL, day TEXT NOT NULL, amount INTEGER NOT NULL, PRIMARY KEY(user_id, actor_id, type, day));
    CREATE TABLE IF NOT EXISTS games (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), target_id TEXT NOT NULL REFERENCES users(id), notes TEXT NOT NULL, hits TEXT NOT NULL DEFAULT '[]', started INTEGER NOT NULL, finished INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS topic_sessions (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), target_id TEXT NOT NULL REFERENCES users(id), topic TEXT NOT NULL, transcript TEXT NOT NULL, created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS events (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), name TEXT NOT NULL, detail TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS events_user_name ON events(user_id,name);
    CREATE TABLE IF NOT EXISTS reports (id TEXT PRIMARY KEY, reporter_id TEXT NOT NULL REFERENCES users(id), target_id TEXT NOT NULL REFERENCES users(id), reason TEXT NOT NULL, created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS avatar_slots (id TEXT PRIMARY KEY, owner_id TEXT NOT NULL REFERENCES users(id), snapshot TEXT NOT NULL, created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS avatar_cards (slot_id TEXT NOT NULL REFERENCES avatar_slots(id),owner_id TEXT NOT NULL REFERENCES users(id),audience TEXT NOT NULL,tier INTEGER NOT NULL,signature TEXT NOT NULL,analysis TEXT NOT NULL,updated_at TEXT NOT NULL,PRIMARY KEY(slot_id,audience));
    CREATE TABLE IF NOT EXISTS avatar_quest_rewards (owner_id TEXT NOT NULL REFERENCES users(id),quest_id TEXT NOT NULL,slot_id TEXT,created_at TEXT NOT NULL,PRIMARY KEY(owner_id,quest_id));
    CREATE TABLE IF NOT EXISTS friend_memory_reads (viewer_id TEXT NOT NULL REFERENCES users(id),owner_id TEXT NOT NULL REFERENCES users(id),signature TEXT NOT NULL,PRIMARY KEY(viewer_id,owner_id));
    CREATE TABLE IF NOT EXISTS social_game_records (id TEXT NOT NULL,user_id TEXT NOT NULL REFERENCES users(id),village_id TEXT NOT NULL REFERENCES users(id),kind TEXT NOT NULL,score INTEGER NOT NULL,result TEXT NOT NULL,created_at TEXT NOT NULL,PRIMARY KEY(id,user_id));
    CREATE TABLE IF NOT EXISTS village_polls (id TEXT PRIMARY KEY,owner_id TEXT NOT NULL REFERENCES users(id),question TEXT NOT NULL,option_a TEXT NOT NULL,option_b TEXT NOT NULL,stake INTEGER NOT NULL,max_votes INTEGER NOT NULL,deadline INTEGER NOT NULL,status TEXT NOT NULL DEFAULT 'open',result TEXT,created_at TEXT NOT NULL);
    CREATE UNIQUE INDEX IF NOT EXISTS village_poll_open ON village_polls(owner_id) WHERE status='open';
    CREATE TABLE IF NOT EXISTS village_ballots (poll_id TEXT NOT NULL REFERENCES village_polls(id),user_id TEXT NOT NULL REFERENCES users(id),slot_id TEXT NOT NULL,nickname TEXT NOT NULL,choice TEXT NOT NULL,reason TEXT NOT NULL,provider TEXT NOT NULL,stake INTEGER NOT NULL,payout INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL,PRIMARY KEY(poll_id,user_id));
    CREATE TABLE IF NOT EXISTS survey_participation (user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, completed INTEGER NOT NULL DEFAULT 0, deferred_until INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS survey_responses (id TEXT PRIMARY KEY, version INTEGER NOT NULL, answers TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS account_rewards (user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, reward_id TEXT NOT NULL, PRIMARY KEY(user_id,reward_id));
  `);
  // Legacy participation is retained, but cannot count as completion of a new questionnaire.
  if(!db.prepare('PRAGMA table_info(survey_participation)').all().some(c=>c.name==='version'))db.exec('ALTER TABLE survey_participation ADD COLUMN version INTEGER NOT NULL DEFAULT 0');
  // Existing participants receive the same permanent reward, without linking anonymous answers.
  db.prepare('INSERT OR IGNORE INTO account_rewards(user_id,reward_id) SELECT user_id,? FROM survey_participation WHERE completed=1').run(SURVEY_REWARD);
  if(!db.prepare('PRAGMA table_info(users)').all().some(c=>c.name==='active_slot'))db.exec("ALTER TABLE users ADD COLUMN active_slot TEXT NOT NULL DEFAULT ''");
  if(!db.prepare('PRAGMA table_info(users)').all().some(c=>c.name==='survey_role'))db.exec("ALTER TABLE users ADD COLUMN survey_role TEXT NOT NULL DEFAULT 'user' CHECK(survey_role IN ('user','manager','admin'))");
  // The requested existing account is pinned to its immutable ID, never a mutable nickname.
  db.prepare("UPDATE users SET survey_role='admin' WHERE id=? AND username=? AND survey_role<>'admin'").run('a5a056ab-e1e6-42e6-833f-3a61f31fe05e','hys8623');
  if(!db.prepare('PRAGMA table_info(games)').all().some(c=>c.name==='anonymous'))db.exec('ALTER TABLE games ADD COLUMN anonymous INTEGER NOT NULL DEFAULT 0');
  for(const column of ['village','appearance','character_looks','avatar_appearance','avatar_character_looks'])if(!db.prepare('PRAGMA table_info(users)').all().some(c=>c.name===column))db.exec(`ALTER TABLE users ADD COLUMN ${column} TEXT NOT NULL DEFAULT '{}'`);
  db.exec("UPDATE users SET avatar_appearance=appearance WHERE avatar_appearance='{}'; UPDATE users SET avatar_character_looks=character_looks WHERE avatar_character_looks='{}'");
  if(!db.prepare('PRAGMA table_info(games)').all().some(c=>c.name==='kind'))db.exec("ALTER TABLE games ADD COLUMN kind TEXT NOT NULL DEFAULT 'rhythm'");
  if(!db.prepare('PRAGMA table_info(games)').all().some(c=>c.name==='score'))db.exec('ALTER TABLE games ADD COLUMN score INTEGER');
  // Backfill completed rhythm rounds, including rounds without a gold reward.
  db.prepare("SELECT id,hits FROM games WHERE finished=1 AND kind='rhythm' AND score IS NULL").all().forEach(g=>db.prepare('UPDATE games SET score=? WHERE id=?').run(JSON.parse(g.hits).reduce((n,h)=>n+(h.rating==='perfect'?100:65),0),g.id));
  if(!db.prepare('PRAGMA table_info(conversations)').all().some(c=>c.name==='avatar_slot')){
    db.exec("ALTER TABLE conversations ADD COLUMN avatar_slot TEXT NOT NULL DEFAULT ''; UPDATE conversations SET avatar_slot=COALESCE((SELECT active_slot FROM users WHERE users.id=conversations.target_id),'')");
  }
  // Persist awards independently of deletable conversation history.
  db.exec(`CREATE TABLE IF NOT EXISTS avatar_experience (message_id TEXT PRIMARY KEY, owner_id TEXT NOT NULL REFERENCES users(id), avatar_slot TEXT NOT NULL, amount INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS avatar_experience_owner ON avatar_experience(owner_id,avatar_slot);`);
  // Freeze the pre-discovery awards once. Future chats and server restarts must
  // not add new chat XP, and deleted conversations must not erase earned levels.
  db.exec(`CREATE TABLE IF NOT EXISTS data_migrations (id TEXT PRIMARY KEY);
    CREATE TABLE IF NOT EXISTS avatar_legacy_experience (
      owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      avatar_slot TEXT NOT NULL, xp INTEGER NOT NULL, PRIMARY KEY(owner_id,avatar_slot));
    BEGIN IMMEDIATE;
    INSERT OR IGNORE INTO avatar_experience
      SELECT m.id,c.target_id,c.avatar_slot,10 FROM messages m JOIN conversations c ON c.id=m.conversation_id
      WHERE m.role='assistant' AND NOT EXISTS (SELECT 1 FROM data_migrations WHERE id='restore-avatar-levels-v1');
    INSERT INTO avatar_legacy_experience
      SELECT owner_id,avatar_slot,SUM(amount) FROM avatar_experience
      WHERE NOT EXISTS (SELECT 1 FROM data_migrations WHERE id='restore-avatar-levels-v1') GROUP BY owner_id,avatar_slot;
    INSERT OR IGNORE INTO data_migrations VALUES ('restore-avatar-levels-v1');
    COMMIT;`);
  db.exec(`CREATE TABLE IF NOT EXISTS owned_stars(owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,star_id TEXT NOT NULL,name TEXT NOT NULL,PRIMARY KEY(owner_id,star_id));
    INSERT OR IGNORE INTO owned_stars SELECT id,'plaza','광장별' FROM users;
    INSERT OR IGNORE INTO owned_stars SELECT id,'fishing','낚시별' FROM users;
    INSERT OR IGNORE INTO owned_stars SELECT id,'farm','농장별' FROM users;
    CREATE TRIGGER IF NOT EXISTS grant_initial_stars AFTER INSERT ON users BEGIN
      INSERT INTO owned_stars VALUES(NEW.id,'plaza','광장별');
      INSERT INTO owned_stars VALUES(NEW.id,'fishing','낚시별');
      INSERT INTO owned_stars VALUES(NEW.id,'farm','농장별');
    END;`);
  let transactionDepth=0,savepointId=0;
  return {
    db,
    one: (sql, ...args) => db.prepare(sql).get(...args),
    all: (sql, ...args) => db.prepare(sql).all(...args),
    run: (sql, ...args) => db.prepare(sql).run(...args),
    transaction(fn) {
      const nested=transactionDepth>0,name=`life_sp_${++savepointId}`;
      db.exec(nested?`SAVEPOINT ${name}`:'BEGIN IMMEDIATE');transactionDepth++;
      try { const result=fn();db.exec(nested?`RELEASE ${name}`:'COMMIT');return result; }
      catch(e){db.exec(nested?`ROLLBACK TO ${name}; RELEASE ${name}`:'ROLLBACK');throw e;}
      finally{transactionDepth--;}
    },
    close: () => db.close()
  };
}

export const defaultSettings = { allowVisitors: true, receiveTranscripts: true, allowTopics: true, stageVisible: true, questionFrequency: 'daily', questionTopic: '일상', publicTags: [], speechStyle: '다정하고 편안하게', scene: 'garden' };
export const settingsOf = user => ({ ...defaultSettings, ...JSON.parse(user.settings) });
export function experienceOf(store,user) {
  // Keep the original 100-XP character levels, including earned historical XP.
  // Forest levels are a separate progression; their cumulative XP adds to it.
  const exists=store.one("SELECT 1 FROM sqlite_master WHERE type='table' AND name='exploration_progress'");
  const row=exists&&store.one('SELECT state FROM exploration_progress WHERE owner_id=?',user.id);
  const progress=row?JSON.parse(row.state):{level:1,xp:0},limits=[50,80,120,160];
  const legacy=store.one('SELECT xp FROM avatar_legacy_experience WHERE owner_id=? AND avatar_slot=?',user.id,user.active_slot||'')?.xp||0;
  const xp=legacy+limits.slice(0,progress.level-1).reduce((sum,n)=>sum+n,0)+progress.xp;
  return {xp,level:Math.floor(xp/100)+1,levelXp:xp%100,nextLevelXp:100};
}
export function stageOf(store,user) { return experienceOf(store,user).level-1; }
export function isBlocked(store, a, b) {
  return !!store.one('SELECT 1 FROM blocks WHERE (owner_id=? AND blocked_id=?) OR (owner_id=? AND blocked_id=?)', a, b, b, a);
}
export function visibleMemories(store, targetId, viewerId) {
  if (targetId === viewerId) return store.all('SELECT * FROM memories WHERE owner_id=? ORDER BY created_at DESC', targetId);
  if (isBlocked(store, targetId, viewerId)) return [];
  const close = store.one("SELECT 1 FROM friendships WHERE owner_id=? AND friend_id=? AND status='accepted' AND close=1", targetId, viewerId);
  return store.all(`SELECT * FROM memories WHERE owner_id=? AND confirmed=1 AND (visibility='public' ${close ? "OR visibility='close'" : ''}) ORDER BY created_at DESC`, targetId);
}
export function publicUser(store, user, viewerId, online = new Set()) {
  const own = user.id === viewerId;
  const rewards=store.all('SELECT reward_id FROM account_rewards WHERE user_id=?',user.id).map(row=>row.reward_id);
  const s = settingsOf(user);
  const relation = store.one('SELECT status,close FROM friendships WHERE owner_id=? AND friend_id=?', viewerId, user.id);
  const incoming = store.one("SELECT status FROM friendships WHERE owner_id=? AND friend_id=? AND status='pending'", user.id, viewerId);
  const permitted=own?[]:visibleMemories(store,user.id,viewerId).filter(m=>m.confirmed);
  const memorySignature=createHash('sha256').update(JSON.stringify(permitted.map(m=>[m.id,m.content,m.updated_at,m.visibility]))).digest('hex');
  const memoryRead=own?null:store.one('SELECT signature FROM friend_memory_reads WHERE viewer_id=? AND owner_id=?',viewerId,user.id);
  const result = {
    isNpc:!!galaxyNpc(user.id),
    starCount:store.one('SELECT COUNT(*) AS count FROM owned_stars WHERE owner_id=?',user.id).count,
    id: user.id, nickname: own ? user.nickname : user.nickname || '이름을 기다리는 새싹', intro: user.intro, theme: user.theme,
    ...(own?{rewards}:{}),
    avatarAppearance: {...defaultPetAppearance,hat:'none',accessory:'none',color:'#88b5d7',...(user.avatar_appearance==='{}'?JSON.parse(user.appearance):JSON.parse(user.avatar_appearance))},
    village: {...{items:[],...JSON.parse(user.village)},theme:normalizeVillageTheme(JSON.parse(user.village).theme),platformColor:platformColor(JSON.parse(user.village))}, appearance: {hat:'none',accessory:'none',color:'#88b5d7',...JSON.parse(user.appearance)},
    stage: own || s.stageVisible ? stageOf(store, user) : null,
    ...((own || s.stageVisible) ? experienceOf(store,user) : {level:null,xp:null,levelXp:null,nextLevelXp:null}),
    tags: s.publicTags, online: online.has(user.id), allowVisitors: s.allowVisitors,
    memoryUpdated:relation?.status==='accepted'&&permitted.length>0&&memoryRead?.signature!==memorySignature,
    allowTopics: s.allowTopics, receiveTranscripts: s.receiveTranscripts,
    scene: s.scene, relation: relation?.status || null, close: !!relation?.close, incoming: !!incoming,
    createdAt: user.created_at
  };
  if(dragonMounted(result.appearance))result.appearance.petColor=dragonMountColor(result.appearance,result.avatarAppearance);
  if(result.avatarAppearance.petType==='babyDragon')result.avatarAppearance.petType='dog';
  Object.assign(result.avatarAppearance,petAppearance(result.avatarAppearance));
  if (own) Object.assign(result, { username: user.username, surveyRole: user.survey_role, gold: user.gold, settings: s, balance: JSON.parse(user.balance), revision: user.revision, activeSlot:user.active_slot, characterLooks:JSON.parse(user.character_looks), avatarCharacterLooks:JSON.parse(user.avatar_character_looks) });
  return result;
}
// Small-corpus lexical RAG. Scope is applied BEFORE retrieval; no shared vector index or cache.
export function retrieve(memories, query, limit = 10) {
  const grams = text => new Set((text.toLowerCase().match(/[\p{L}\p{N}]+/gu) || []).flatMap(w => w.length < 3 ? [w] : [w, ...Array.from({ length: w.length - 1 }, (_, i) => w.slice(i, i + 2))]));
  const q = grams(query);
  return memories.map((m, i) => ({ ...m, score: [...grams(m.content)].filter(w => q.has(w)).length * 3 + (m.confirmed ? 1 : 0) + 1 / (i + 1) })).sort((a,b) => b.score - a.score).slice(0, limit);
}
