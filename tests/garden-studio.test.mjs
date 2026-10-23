import test from 'node:test';
import assert from 'node:assert/strict';
import {gardenSeeds,gardenTime,gardenPlotView} from '../src/gardenView.mjs';

test('garden seed filters use only crops supported by the game',()=>{
  assert.deepEqual(gardenSeeds().map(c=>c.id),['HERB','TOMATO','FLOWER']);
  assert.deepEqual(gardenSeeds('vegetable').map(c=>c.id),['HERB','TOMATO']);
  assert.deepEqual(gardenSeeds('flower').map(c=>c.id),['FLOWER']);
  assert.deepEqual(gardenSeeds('tree'),[]);
  assert.deepEqual(gardenSeeds('special'),[]);
});
test('garden growth and countdown change together at the server harvest boundary',()=>{
  const plot={cropId:'HERB',plantedAt:1000,readyAt:301000};
  const halfway=gardenPlotView(plot,151000);
  assert.equal(halfway.state,'Growing');assert.equal(halfway.progress,.5);assert.equal(halfway.countdown,'02:30');
  assert.equal(gardenPlotView(plot,300999).countdown,'00:01');
  const ready=gardenPlotView(plot,301000);
  assert.equal(ready.state,'Ready');assert.equal(ready.progress,1);assert.equal(ready.countdown,'00:00');
  assert.equal(gardenPlotView(plot,1000000).progress,1);
  assert.equal(gardenPlotView(plot,0).progress,0);
  assert.deepEqual(gardenPlotView({cropId:null},1000),{crop:null,state:'Empty',progress:0,seconds:0,countdown:'--:--'});
});
test('garden display clock preserves server offset instead of using client wall time',()=>{
  assert.equal(gardenTime({serverTime:100000,receivedAt:500000},502000),102000);
  assert.equal(gardenTime({serverTime:100000,receivedAt:500000},499000),100000);
  assert.equal(gardenTime({},123000),123000);
});
