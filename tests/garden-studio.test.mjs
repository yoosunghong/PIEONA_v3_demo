import test from 'node:test';
import assert from 'node:assert/strict';
import {gardenSeeds,gardenTime,gardenPlotView} from '../src/gardenView.mjs';

test('garden seed filters use only crops supported by the game',()=>{
  assert.deepEqual(gardenSeeds().map(c=>c.id),['HERB','TOMATO','FLOWER','STRAWBERRY','APPLE']);
  assert.deepEqual(gardenSeeds('vegetable').map(c=>c.id),['HERB','TOMATO']);
  assert.deepEqual(gardenSeeds('flower').map(c=>c.id),['FLOWER']);
  assert.deepEqual(gardenSeeds('tree'),[]);
  assert.deepEqual(gardenSeeds('special'),[]);
});
test('growth follows water count and only watering availability follows the server boundary',()=>{
 const plot={cropId:'HERB',plantedAt:1000,waterCount:0,lastWateredAt:null};
 const halfway=gardenPlotView(plot,151000);assert.equal(halfway.progress,0);assert.equal(halfway.countdown,'02:30');assert.equal(halfway.stage,1);
 assert.equal(gardenPlotView(plot,300999).canWater,false);assert.equal(gardenPlotView(plot,301000).canWater,true);assert.equal(gardenPlotView(plot,1000000).state,'Growing');
 assert.equal(gardenPlotView({...plot,waterCount:1,lastWateredAt:301000},301001).stage,2);
 const ready=gardenPlotView({...plot,waterCount:3,lastWateredAt:901000},901001);assert.equal(ready.state,'Ready');assert.equal(ready.stage,3);assert.equal(ready.progress,1);assert.equal(ready.canWater,false);
 assert.deepEqual(gardenPlotView({cropId:null},1000),{crop:null,state:'Empty',progress:0,seconds:0,countdown:'--:--'});
});

test('garden display clock preserves server offset instead of using client wall time',()=>{
  assert.equal(gardenTime({serverTime:100000,receivedAt:500000},502000),102000);
  assert.equal(gardenTime({serverTime:100000,receivedAt:500000},499000),100000);
  assert.equal(gardenTime({},123000),123000);
});
