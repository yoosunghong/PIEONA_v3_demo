import test from 'node:test';
import assert from 'node:assert/strict';
import {harness} from './runtimeHarness.mjs';
import {validateChain} from '../server/chainDictionary.mjs';

test('six-player chain uses actual profiles, private limited hints, validated reactions and five rounds',async()=>{
  let time=Date.now();const h=await harness({socialClock:()=>time});
  try{
    const users=[];for(let i=0;i<6;i++){const u=await h.register('chain_party_'+i);users.push(u);h.runtime.store.run('UPDATE users SET nickname=?,appearance=? WHERE id=?','친구'+i,JSON.stringify({character:i%2?'luna':'tori',color:i%2?'#ffaabb':'#aabbff'}),u.id);await h.connect(u,users[0].id);}
    const [a,b]=users,room=(await h.request(`/villages/${a.id}/duels`,a,{kind:'wordchain'})).body.room;
    assert.equal((await h.request(`/duels/${room.id}/start`,a,{})).status,409);
    for(const u of users.slice(1))assert.equal((await h.request(`/duels/${room.id}/join`,u,{})).status,200);
    assert.equal((await h.request(`/duels/${room.id}/start`,b,{})).status,403);
    const start=await h.request(`/duels/${room.id}/start`,a,{});assert.equal(start.status,200);
    assert.equal(start.body.room.players.length,6);assert.equal(start.body.room.rounds,5);assert.equal(start.body.room.round,1);
    assert.equal(start.body.room.players[0].nickname,'친구0');assert.equal(start.body.room.players[1].appearance.character,'luna');
    assert.equal(start.body.room.deadline-start.body.room.startedAt,15000);
    assert.equal((await h.request(`/duels/${room.id}/hint`,a,{})).status,409);time+=3500;
    assert.equal((await h.request(`/duels/${room.id}/hint`,b,{})).status,409);
    const hints=[];for(let i=0;i<3;i++){const result=await h.request(`/duels/${room.id}/hint`,a,{});assert.equal(result.status,200);hints.push(result.body.hint);assert.equal(validateChain(result.body.hint,[]),null);assert.equal(result.body.room.players[0].hintsLeft,2-i);assert.equal(result.body.room.used.length,0);assert.ok(!JSON.stringify(result.body.room).includes('hintWords'));}
    assert.equal(new Set(hints).size,3);assert.equal((await h.request(`/duels/${room.id}/hint`,a,{})).status,409);
    assert.equal((await h.request(`/duels/${room.id}/reaction`,b,{emoji:'<script>'})).status,400);
    const reaction=await h.request(`/duels/${room.id}/reaction`,b,{emoji:'👏'});assert.equal(reaction.status,200);assert.equal(reaction.body.room.reactions[b.id].emoji,'👏');
    assert.equal((await h.request(`/duels/${room.id}/reaction`,b,{emoji:'😊'})).status,429);
    const words=['바다','다리','리본','본부','부엉이','이슬'];
    for(let i=0;i<words.length;i++){const result=await h.request(`/duels/${room.id}/action`,users[i],{text:words[i]});assert.equal(result.status,200,words[i]);assert.equal(result.body.room.players[i].score,1);assert.equal(result.body.room.turn,(i+1)%6);}
    const state=(await h.request(`/villages/${a.id}/duels`,a)).body.rooms[0];assert.equal(state.round,2);assert.equal(state.used.length,6);assert.equal(state.log[3].playerId,users[3].id);
    const hint=await h.request(`/duels/${room.id}/hint`,b,{});assert.equal(hint.status,409);
    const scored=await h.request(`/duels/${room.id}/action`,a,{text:'슬기'});assert.equal(scored.status,200);
    assert.equal((await h.request(`/duels/${room.id}/action`,a,{text:'기차'})).status,409);
    // Timeouts skip turns, preserve used words and finish the fifth round exactly once.
    for(let i=0;i<30;i++){time+=16000;h.runtime.wordGames.tick();}
    const finished=(await h.request(`/villages/${a.id}/duels`,a)).body.rooms[0];assert.equal(finished.status,'finished');assert.equal(finished.round,5);assert.equal(finished.winner,a.id);assert.equal(finished.used.length,7);
    const total=()=>h.runtime.store.one('SELECT COUNT(*) n FROM social_game_records WHERE id=?',room.id).n;
    assert.equal(total(),6);h.runtime.wordGames.tick();assert.equal(total(),6);
    assert.equal((await h.request(`/duels/${room.id}/hint`,a,{})).status,409);
  }finally{await h.close();}
});

test('leaving during a chain turn skips the departed player and waiting hosts transfer',async()=>{
  let time=Date.now();const h=await harness({socialClock:()=>time});
  try{
    const users=[];for(let i=0;i<4;i++){const u=await h.register('chain_leave_'+i);users.push(u);await h.connect(u,users[0].id);}
    const [a,b,c,d]=users,r=(await h.request(`/villages/${a.id}/duels`,a,{kind:'wordchain'})).body.room;
    for(const u of [b,c,d])await h.request(`/duels/${r.id}/join`,u,{});
    await h.request(`/duels/${r.id}/leave`,a,{});
    let room=(await h.request(`/villages/${a.id}/duels`,b)).body.rooms[0];assert.equal(room.hostId,b.id);
    await h.request(`/duels/${r.id}/start`,b,{});time+=3500;
    await h.request(`/duels/${r.id}/leave`,b,{});
    room=(await h.request(`/villages/${a.id}/duels`,c)).body.rooms[0];assert.equal(room.status,'playing');assert.equal(room.players[room.turn].id,c.id);assert.equal(h.runtime.wordGames.busy(b.id),false);
    assert.equal((await h.request(`/duels/${r.id}/action`,b,{text:'바다'})).status,403);
    assert.equal((await h.request(`/duels/${r.id}/action`,c,{text:'바다'})).status,200);
    await h.request(`/duels/${r.id}/leave`,d,{});
    room=(await h.request(`/villages/${a.id}/duels`,c)).body.rooms[0];assert.equal(room.status,'finished');assert.equal(room.winner,c.id);
  }finally{await h.close();}
});
