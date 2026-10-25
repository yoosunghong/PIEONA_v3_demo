import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {openStore,experienceOf,publicUser} from '../server/store.mjs';
import {createExploration} from '../shared/exploration.mjs';
import {harness} from './runtimeHarness.mjs';

test('first avatar slot assignment carries recovered XP into profiles and card previews',async()=>{
  const h=await harness();
  try {
    const owner=await h.register('recovered_slot');
    h.runtime.store.run('INSERT INTO avatar_legacy_experience VALUES(?,?,?)',owner.id,'',250);
    assert.equal((await h.request('/me',owner)).body.user.level,3);
    const slots=(await h.request('/slots',owner)).body;
    assert.ok(slots.active);
    assert.equal(h.runtime.store.one('SELECT avatar_slot FROM avatar_legacy_experience WHERE owner_id=?',owner.id).avatar_slot,slots.active);
    assert.equal((await h.request('/me',owner)).body.user.levelXp,50);
    const cards=(await h.request('/avatar-cards',owner)).body;
    assert.equal(cards.slots[0].preview.level,3);
  } finally {await h.close();}
});

test('upgrade restores historical levels per avatar once and retains exploration XP',()=>{
  const dir=mkdtempSync(join(tmpdir(),'pieona-level-recovery-')),file=join(dir,'legacy.sqlite');
  let store;
  try {
    store=openStore(file);
    store.run('INSERT INTO users(id,username,password,created_at,active_slot) VALUES(?,?,?,?,?)','owner','owner','unused',new Date().toISOString(),'first');
    store.run('INSERT INTO avatar_experience VALUES(?,?,?,?)','earned-first','owner','first',820);
    store.run('INSERT INTO avatar_experience VALUES(?,?,?,?)','earned-second','owner','second',900);
    // Simulate the database from before the recovery migration existed.
    store.run("DELETE FROM data_migrations WHERE id='restore-avatar-levels-v1'");
    store.close();store=openStore(file);
    const owner=store.one('SELECT * FROM users WHERE id=?','owner');
    assert.deepEqual(experienceOf(store,owner),{xp:820,level:9,levelXp:20,nextLevelXp:100});
    assert.equal(experienceOf(store,{...owner,active_slot:'second'}).level,10);
    assert.equal(experienceOf(store,{...owner,active_slot:'new'}).level,1);
    store.db.exec('CREATE TABLE exploration_progress(owner_id TEXT PRIMARY KEY,state TEXT NOT NULL)');
    const state=createExploration();state.level=3;state.xp=23;
    store.run('INSERT INTO exploration_progress VALUES(?,?)','owner',JSON.stringify(state));
    assert.deepEqual(experienceOf(store,owner),{xp:973,level:10,levelXp:73,nextLevelXp:100});
    store.run('INSERT INTO avatar_experience VALUES(?,?,?,?)','future-chat','owner','first',1000);
    store.close();store=openStore(file);
    assert.equal(experienceOf(store,owner).xp,973);
    assert.equal(store.one('SELECT COUNT(*) n FROM avatar_legacy_experience').n,2);
    store.run('UPDATE users SET settings=? WHERE id=?',JSON.stringify({stageVisible:false}),'owner');
    const hidden=publicUser(store,store.one('SELECT * FROM users WHERE id=?','owner'),'visitor');
    assert.equal(hidden.level,null);assert.equal(hidden.levelXp,null);
    assert.equal(publicUser(store,store.one('SELECT * FROM users WHERE id=?','owner'),'owner').level,10);
  } finally {store?.close();rmSync(dir,{recursive:true,force:true});}
});
