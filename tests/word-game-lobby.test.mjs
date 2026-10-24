import test from 'node:test';
import assert from 'node:assert/strict';
import {wordGameLobby} from '../src/wordGameLobby.mjs';

test('villagers are available even when nobody has created a duel room',()=>{
  const members=[{userId:'me'},{userId:'friend',nickname:'친구'},{userId:'friend'},{userId:'pet:friend',actorKind:'PET'},{userId:'mount:friend',actorKind:'MOUNT'}];
  for(const kind of ['typing','wordchain']){
    const lobby=wordGameLobby(members,[],'me',kind);
    assert.equal(lobby.friends.length,1);
    assert.equal(lobby.available,1);
    assert.deepEqual(lobby.waitingRooms,[]);
  }
});

test('waiting hosts are joinable despite their busy flag; other games and activities stay busy',()=>{
  const members=[{userId:'host',runnerBusy:true},{userId:'other'},{userId:'active',runnerBusy:true},{userId:'free'}];
  const rooms=[{id:'typing-room',kind:'typing',status:'waiting',players:[{id:'host'}]},{id:'chain-room',kind:'wordchain',status:'waiting',players:[{id:'other'}]}];
  const lobby=wordGameLobby(members,rooms,'me','typing');
  assert.equal(lobby.available,2);
  assert.equal(lobby.friends[0].joinable.id,'typing-room');
  assert.equal(lobby.friends[0].busy,false);
  assert.equal(lobby.friends[1].busy,true);
  assert.equal(lobby.friends[2].busy,true);
  assert.deepEqual(lobby.waitingRooms.map(room=>room.id),['typing-room']);
});

test('finishing and leaving games restores availability and removes old join buttons',()=>{
  const members=[{userId:'host',runnerBusy:false}];
  const room={id:'room',kind:'wordchain',status:'playing',players:[{id:'host'},{id:'other'}]};
  assert.equal(wordGameLobby(members,[room],'me','wordchain').available,0);
  const lobby=wordGameLobby(members,[{...room,status:'finished'}],'me','wordchain');
  assert.equal(lobby.available,1);
  assert.equal(lobby.friends[0].joinable,null);
  assert.equal(lobby.waitingRooms.length,0);
  assert.equal(wordGameLobby([],[],'me','wordchain').available,0);
});
