import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {reconcileExplorationPosition,withinExplorationPrediction} from '../src/explorationMovement.mjs';

test('delayed movement acknowledgements preserve walking beyond the old snap distance',()=>{
 const requested={x:0,z:1.5},local={x:0,z:4};
 assert.deepEqual(reconcileExplorationPosition(local,requested,requested),local);
 assert.deepEqual(reconcileExplorationPosition(local,requested,{x:0,z:1}),{x:0,z:3.5});
});

test('a stalled connection pauses prediction before exceeding the server movement budget',()=>{
 assert.equal(withinExplorationPrediction({x:0,z:2.9},{x:0,z:0}),true);
 assert.equal(withinExplorationPrediction({x:0,z:3.1},{x:0,z:0}),false);
 assert.equal(withinExplorationPrediction({x:0,z:3.1},{x:0,z:1.5}),true);
});

test('forest reconciles movement responses and resets rejected moves instead of snapping every frame',()=>{
 const world=readFileSync(new URL('../src/explorationWorld.js',import.meta.url),'utf8');
 const view=readFileSync(new URL('../src/Exploration.jsx',import.meta.url),'utf8');
 assert.ok(!world.includes('distance(player.position,s.position)>1.8'));
 assert.match(view,/reconcileMove\(data.position,r.state.position\)/);
 assert.match(view,/resetPosition\(r.state.position\)/);
});
