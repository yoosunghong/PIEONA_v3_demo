import test from 'node:test';
import assert from 'node:assert/strict';
import {createExploration,enterExploration,returnExploration,interactExploration,commandExploration,tickExploration,walkable,INITIAL_NODES} from '../shared/exploration.mjs';
import {startOutdoorTrip,observeOutdoorCompletion,observeOutdoorMove,outdoorPersona} from '../shared/outdoorTraits.mjs';

test('outdoor summary uses session deltas, direct evidence and an idempotent return',()=>{
 const s=createExploration(1000,true);s.position={x:-3.7,z:3.5};interactExploration(s,'mushroom-1','PLAYER',2000,()=>.99);
 observeOutdoorCompletion(s,{id:'rock-proof',type:'stone'},true);returnExploration(s,3000);
 assert.equal(s.lastExpedition.items.mushroom,1);assert.equal(s.lastExpedition.items.wood,0);
 assert.equal(s.outdoorProfile.values.curiosity,51);assert.equal(s.outdoorProfile.values.persistence,51);assert.equal(s.outdoorProfile.values.cooperation,51);
 const summary=structuredClone(s.lastExpedition);returnExploration(s,4000);assert.deepEqual(s.lastExpedition,summary);assert.equal(s.outdoorProfile.values.persistence,51);
});
test('idle and AI delegated work do not invent personal traits',()=>{
 const s=createExploration(0);Object.assign(s.companion,{enabled:true,profile:{id:'friend'},x:3,z:1.6});commandExploration(s,'GATHER_WOOD',null,0);
 for(let t=250;t<=6000;t+=250)tickExploration(s,t,()=>.99);returnExploration(s,7000);
 assert.ok(s.inventory.wood>0);assert.ok(s.lastExpedition.traits.every(t=>t.delta===0));
});
test('same resource cannot be farmed for unlimited tendencies; daily cap spans trips and content',()=>{
 const s=createExploration(1000);
 for(let i=0;i<20;i++)observeOutdoorCompletion(s,{id:'same-rock',type:'stone'});
 returnExploration(s,2000);assert.equal(s.outdoorProfile.values.persistence,51);
 enterExploration(s,3000);startOutdoorTrip(s,3000,'sea');for(let i=0;i<10;i++)observeOutdoorCompletion(s,{id:`sea-${i}`,type:'stone'});
 returnExploration(s,4000);assert.equal(s.lastExpedition.content,'sea');assert.equal(s.outdoorProfile.values.persistence,53);
 enterExploration(s,5000);observeOutdoorCompletion(s,{id:'last-rock',type:'stone'});returnExploration(s,6000);assert.equal(s.lastExpedition.traits.find(t=>t.key==='persistence').delta,0);
 enterExploration(s,86400000);observeOutdoorCompletion(s,{id:'next-day',type:'stone'});returnExploration(s,86401000);assert.equal(s.outdoorProfile.values.persistence,54);
});
test('newly traversed areas and variety explain curiosity; failed escape preserves net inventory',()=>{
 const s=createExploration(0);for(let i=0;i<4;i++){s.position={x:i*6,z:10};observeOutdoorMove(s);}s.inventory.wood=3;
 returnExploration(s,1000,true);assert.equal(s.lastExpedition.fainted,true);assert.equal(s.lastExpedition.items.wood,3);assert.equal(s.lastExpedition.traits[0].delta,1);
});
test('persona overlay is bounded, preserves speech and does not mutate approved persona',()=>{
 const p={curiosity:.5,activity:.5,sociability:.5,kindness:.5,speechStyle:'짧은 존댓말'},before=structuredClone(p),effective=outdoorPersona(p,{values:{curiosity:100,persistence:100,courage:100,cooperation:100}});
 assert.equal(effective.curiosity,.6);assert.equal(effective.activity,.6);assert.equal(effective.sociability,.6);assert.equal(effective.speechStyle,p.speechStyle);assert.deepEqual(p,before);
});
test('expanded forest resources are accessible on both riverbanks and companion consumes full movement budget',()=>{
 assert.ok(walkable(-25,18));assert.ok(walkable(24,-24));for(const n of INITIAL_NODES)assert.ok(walkable(n.x,n.z),n.id);
 const s=createExploration(0);Object.assign(s.companion,{enabled:true,profile:{id:'friend'},mode:'FOLLOW',x:-10,z:5});s.position={x:-1,z:5};tickExploration(s,1000,()=>.99);assert.ok(s.companion.x>-7,JSON.stringify(s.companion));
});
