import test from 'node:test';
import assert from 'node:assert/strict';
import {facilityStep,isClickFacility} from '../src/lifeNavigation.mjs';
import {lifeInteractionObjects} from '../shared/lifeLayout.mjs';
import {INTERACTION_REACH} from '../shared/life.mjs';

test('click walking reaches every facility, including moved facilities, without entering the model',()=>{
  for(const village of [{},{scenery:[{id:'life-storage',x:6,z:3,rotation:1.2}]}]){
    for(const target of lifeInteractionObjects(village).filter(item=>isClickFacility(item.id))){
      let position={x:0,z:0},result;
      for(let frame=0;frame<1000;frame++){
        result=facilityStep(position,target,3.2,1/60);position=result;
        if(result.arrived)break;
      }
      assert.equal(result.arrived,true);
      const distance=Math.hypot(target.x-position.x,target.z-position.z);
      assert.ok(distance<=INTERACTION_REACH&&distance>1);
      const settled=facilityStep(position,target,3.2,10);
      assert.ok(Math.hypot(settled.x-result.x,settled.z-result.z)<1e-8);
      assert.equal(settled.arrived,true);
    }
  }
});

test('a long frame stops at reach and a nearby click opens without movement',()=>{
  const target={x:10,z:0};
  const next=facilityStep({x:0,z:0},target,6.4,10);
  assert.equal(next.arrived,true);assert.ok(next.x<target.x);
  const near=facilityStep({x:9,z:0},target,3.2,.016);
  assert.equal(near.arrived,true);assert.equal(near.x,9);
  assert.equal(isClickFacility('fishing:0'),false);
});
