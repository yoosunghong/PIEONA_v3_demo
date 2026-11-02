import test from 'node:test';
import assert from 'node:assert/strict';
import {harness} from './runtimeHarness.mjs';
import {communityPlacements,CHALKBOARD_ID,POLLBOX_ID} from '../shared/communityObjects.mjs';
import {villageScenery} from '../shared/scenery.mjs';
import {villageSign,signPlacementItem} from '../shared/sign.mjs';
import {villageGuestbook,guestbookPlacementItem} from '../shared/guestbook.mjs';
import {canPlaceDecoration} from '../src/villageEditorState.mjs';

test('community objects have usable default placements and the editor protects their space',()=>{
  const village={},objects=[...villageScenery(village),signPlacementItem(villageSign(village)),guestbookPlacementItem(villageGuestbook(village)),...communityPlacements(village)];
  for(const object of communityPlacements(village)){
    assert.equal(canPlaceDecoration(objects,object.x,object.z,object.id),true,object.id);
    assert.equal(canPlaceDecoration(objects,object.x,object.z),false);
  }
});

test('poll box and board placement persist, rotate, store and reject invalid/colliding placements',async()=>{
  const h=await harness();try{
    const owner=await h.register('board_host'),village=owner.village;
    const [poll,board]=communityPlacements(village);
    let objects=[...villageScenery(village),signPlacementItem(villageSign(village)),guestbookPlacementItem(villageGuestbook(village)),poll,board];
    const placements={};
    for(const [key,object,rotation] of [['pollbox',poll,2],['chalkboard',board,1]]){
      let next;
      for(const dx of [.25,-.25,.5,-.5,1,-1,1.5,-1.5,2,-2])if(canPlaceDecoration(objects,object.x+dx,object.z,object.id)){next={x:object.x+dx,z:object.z,rotation};break;}
      assert.ok(next,'a movable nearby cell exists for '+key);
      placements[key]=next;objects=objects.map(item=>item.id===object.id?{...item,...next}:item);
    }
    let result=await h.request('/me/world',owner,{village:placements},'PATCH');assert.equal(result.status,200,JSON.stringify(result.body));
    assert.equal(result.body.user.village.pollbox.rotation,2);assert.equal(result.body.user.village.chalkboard.rotation,1);
    assert.equal(result.body.user.village.pollbox.x,placements.pollbox.x);assert.equal(result.body.user.village.chalkboard.x,placements.chalkboard.x);
    for(const key of ['pollbox','chalkboard'])assert.equal((await h.request('/me/world',owner,{village:{[key]:{x:20,z:0}}},'PATCH')).status,400);
    assert.equal((await h.request('/me/world',owner,{village:{pollbox:{x:placements.chalkboard.x,z:placements.chalkboard.z}}},'PATCH')).status,400);
    result=await h.request('/me/world',owner,{village:{pollbox:{hidden:true},chalkboard:{hidden:true}}},'PATCH');assert.equal(result.status,200);assert.equal(result.body.user.village.pollbox.hidden,true);
    assert.deepEqual(communityPlacements(result.body.user.village).map(i=>i.id),[POLLBOX_ID,CHALKBOARD_ID]);
  }finally{await h.close();}
});

test('owner and visitors append shared drawings without overwriting, retries deduplicate and only owner can clear',async()=>{
  const h=await harness();try{
    const owner=await h.register('chalk_owner'),visitor=await h.register('chalk_guest');
    const path=`/villages/${owner.id}/chalkboard`,stroke={tool:'draw',color:'#fffaf4',size:5,points:[[.1,.2],[.4,.5]]};
    assert.equal((await h.request(path)).status,401);
    const socket=await h.connect(visitor,owner.id),changed=new Promise(resolve=>socket.once('chalkboard:changed',resolve));
    const first={strokes:[stroke],revision:0,requestId:crypto.randomUUID()};
    assert.equal((await h.request(path,owner,first)).status,200);
    assert.equal((await changed).villageId,owner.id);
    assert.equal((await h.request(path,owner,first)).body.strokes.length,1);
    const second={...first,requestId:crypto.randomUUID(),strokes:[{...stroke,color:'#fa91b5'}]};
    assert.equal((await h.request(path,visitor,second)).body.strokes.length,2);
    assert.equal((await h.request(path,visitor)).body.strokes.length,2);
    assert.equal((await h.request(path,visitor,{revision:0},'DELETE')).status,403);
    assert.equal((await h.request(path,visitor,{...second,requestId:crypto.randomUUID(),strokes:[{...stroke,points:[[2,0]]}]})).status,400);
    assert.equal((await h.request(path,owner,{revision:0},'DELETE')).body.revision,1);
    assert.equal((await h.request(path,visitor,{...second,requestId:crypto.randomUUID()})).status,409);
    assert.equal((await h.request(path,visitor,{...second,revision:1,requestId:crypto.randomUUID()})).status,200);
    await h.request('/me',owner,{settings:{allowVisitors:false}},'PATCH');
    assert.equal((await h.request(path,visitor)).status,403);
  }finally{await h.close();}
});


test('chalkboard accepts a large drawing batch above the old request and stroke limits',async()=>{
  const h=await harness();try{
    const owner=await h.register('chalk_large');
    const path=`/villages/${owner.id}/chalkboard`;
    const strokes=Array.from({length:120},()=>({tool:'draw',color:'#fffaf4',size:5,points:Array.from({length:20},(_,i)=>[i/20,.5])}));
    assert.ok(JSON.stringify(strokes).length>20000);
    const result=await h.request(path,owner,{strokes,revision:0,requestId:crypto.randomUUID()});
    assert.equal(result.status,200);
    assert.deepEqual((await h.request(path,owner)).body.strokes,strokes);
  }finally{await h.close();}
});
