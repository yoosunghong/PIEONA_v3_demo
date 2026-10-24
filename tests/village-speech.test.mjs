import test from 'node:test';
import assert from 'node:assert/strict';
import {harness} from './runtimeHarness.mjs';

const answer={reply:'반가워! 오늘은 정원에서 쉬고 있어.',emotion:'happy',memories:[],provider:'local'};

test('village questions and answers reach everyone in that village, including the sender',async()=>{
  const h=await harness({generateAnswer:async()=>answer});
  try{
    const owner=await h.register('speech_owner'),guest=await h.register('speech_guest'),other=await h.register('speech_other');
    const sockets=[await h.connect(owner),await h.connect(guest,owner.id),await h.connect(other)];
    const received=sockets.map(()=>[]);sockets.forEach((socket,i)=>socket.on('village:speech',line=>received[i].push(line)));
    const c=await h.request('/conversations',guest,{targetId:owner.id,share:false,anonymous:true});
    assert.equal(c.status,201);
    const result=await h.request(`/conversations/${c.body.id}/messages`,guest,{text:'오늘 뭐 해?',villageId:owner.id});
    assert.equal(result.status,200);
    await new Promise(resolve=>setTimeout(resolve,60));
    for(const lines of received.slice(0,2)){
      assert.deepEqual(lines.map(line=>line.role),['user','assistant']);
      assert.deepEqual(lines.map(line=>line.text),['오늘 뭐 해?',answer.reply]);
      assert.deepEqual(lines.map(line=>line.userId),[guest.id,owner.id]);
      assert.ok(lines.every(line=>line.villageId===owner.id&&line.expiresAt>Date.now()));
    }
    assert.deepEqual(received[2],[]);
    // Existing records stay private even though live village speech is public.
    assert.equal(h.runtime.store.one('SELECT share FROM conversations WHERE id=?',c.body.id).share,0);
  }finally{await h.close();}
});

test('private requests do not publish and nonmembers cannot claim a village',async()=>{
  const h=await harness({generateAnswer:async()=>answer});
  try{
    const owner=await h.register('private_owner'),guest=await h.register('private_guest');
    const socket=await h.connect(owner),received=[];socket.on('village:speech',line=>received.push(line));
    const c=await h.request('/conversations',guest,{targetId:owner.id,share:false,anonymous:false});
    assert.equal((await h.request(`/conversations/${c.body.id}/messages`,guest,{text:'비공개 요청'})).status,200);
    assert.equal((await h.request(`/conversations/${c.body.id}/messages`,guest,{text:'위조한 방',villageId:owner.id})).status,409);
    await h.connect(guest);
    assert.equal((await h.request(`/conversations/${c.body.id}/messages`,guest,{text:'다른 마을',villageId:guest.id})).status,409);
    await new Promise(resolve=>setTimeout(resolve,60));assert.deepEqual(received,[]);
  }finally{await h.close();}
});

test('leaving during answer generation prevents broadcasting the answer',async()=>{
  let finish,started;
  const ready=new Promise(resolve=>{started=resolve;});
  const h=await harness({generateAnswer:()=>{started();return new Promise(resolve=>{finish=()=>resolve(answer);});}});
  try{
    const owner=await h.register('leave_owner'),guest=await h.register('leave_guest');
    const observer=await h.connect(owner),sender=await h.connect(guest,owner.id),received=[];
    observer.on('village:speech',line=>received.push(line));
    const c=await h.request('/conversations',guest,{targetId:owner.id,share:false,anonymous:false});
    assert.equal(c.status,201);
    const pending=h.request(`/conversations/${c.body.id}/messages`,guest,{text:'곧 떠날게',villageId:owner.id});
    await Promise.race([ready,pending.then(result=>{throw new Error(JSON.stringify(result));})]);await new Promise((resolve,reject)=>sender.timeout(3000).emit('village:leave',(error,result)=>error?reject(error):resolve(result)));finish();
    assert.equal((await pending).status,200);
    await new Promise(resolve=>setTimeout(resolve,60));assert.deepEqual(received.map(line=>line.role),['user']);
  }finally{await h.close();}
});
