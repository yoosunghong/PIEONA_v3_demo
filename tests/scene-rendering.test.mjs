import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createSceneViewport,sceneGraphicsQuality} from '../src/sceneViewport.mjs';
import {editorGridStyle} from '../src/sceneGrid.mjs';
import {villageThemes} from '../shared/world.mjs';

function rig(){
  const events=[],renderer={setSize:(...size)=>events.push(['resize',...size])},camera={aspect:1,updateProjectionMatrix:()=>events.push(['projection'])};
  return{events,camera,viewport:createSceneViewport(renderer,camera)};
}

test('CPU-only WebGL avoids expensive shadow passes while hardware rendering keeps its quality',()=>{
  const context=name=>({getExtension:()=>({UNMASKED_RENDERER_WEBGL:1}),getParameter:()=>name});
  for(const name of ['ANGLE (Google, Vulkan SwiftShader Device)','Mesa llvmpipe (LLVM 18)','softpipe','Software Rasterizer'])assert.deepEqual(sceneGraphicsQuality(context(name),2),{software:true,shadows:false,pixelRatio:.65});
  for(const name of ['ANGLE (NVIDIA GeForce RTX)','AMD Radeon Graphics','Intel Iris Xe','Apple M3']){
    assert.deepEqual(sceneGraphicsQuality(context(name),2),{software:false,shadows:true,pixelRatio:1.75});
    assert.equal(sceneGraphicsQuality(context(name),1).pixelRatio,1);
  }
});

test('restricted renderer metadata and invalid scale values retain a usable default',()=>{
  for(const context of [{getExtension:()=>null},{getExtension(){throw Error('unavailable');}}])assert.deepEqual(sceneGraphicsQuality(context,NaN),{software:false,shadows:true,pixelRatio:1});
});
test('animated viewport notifications never clear a presented frame and coalesce before drawing',()=>{
  const {events,camera,viewport}=rig();
  viewport.resize(800,600);viewport.resize(860.2,620.2);viewport.resize(900,650);
  assert.deepEqual(events,[]);assert.equal(viewport.needsDraw,true);
  viewport.draw(()=>events.push(['draw']));
  assert.deepEqual(events,[['resize',900,650,false],['projection'],['draw']]);
  assert.equal(camera.aspect,900/650);assert.equal(viewport.needsDraw,false);
});
test('unchanged subpixel measurements and hidden zero-sized panels never clear the buffer',()=>{
  const {events,viewport}=rig();viewport.resize(800,600);viewport.draw(()=>{});events.length=0;
  for(const [w,h] of [[800.1,600.1],[800,600],[0,0],[NaN,600],[-1,600]])viewport.resize(w,h);
  assert.equal(viewport.needsDraw,false);viewport.draw(()=>events.push(['draw']));
  assert.deepEqual(events,[['draw']]);
});
test('a resize forces a complete draw even when the scene is paused or a transition reverses',()=>{
  const {events,viewport}=rig();
  for(const [w,h] of [[1000,824],[1050,850],[1030,840],[1000,824]]){
    viewport.resize(w,h);
    if(viewport.needsDraw)viewport.draw(()=>events.push(['draw']));
    assert.deepEqual(events.at(-1),['draw']);
  }
  assert.equal(events.filter(event=>event[0]==='draw').length,4);
  assert.equal(events.filter(event=>event[0]==='resize').length,4);
});
test('bright-theme grids retain contrast after alpha blending without modifying the village palette',()=>{
  const luminance=c=>.2126*c.r+.7152*c.g+.0722*c.b;
  for(const mood of villageThemes.filter(theme=>['default','cafe','sunset'].includes(theme.id))){
    const original=JSON.stringify(mood),style=editorGridStyle(mood),ground=new THREE.Color(mood.ground),line=new THREE.Color(style.color);
    const blended=ground.clone().lerp(line,style.opacity);
    assert.ok((luminance(ground)+.05)/(luminance(blended)+.05)>=3,mood.id);
    assert.equal(JSON.stringify(mood),original);
  }
});
test('night-theme grids use light lines with enough opacity to survive the darker scene',()=>{
  for(const mood of villageThemes.filter(theme=>['campfire','twilight'].includes(theme.id))){
    const style=editorGridStyle(mood),ground=new THREE.Color(mood.ground),line=new THREE.Color(style.color);
    assert.ok(line.r>ground.r&&line.g>ground.g&&line.b>ground.b,mood.id);
    assert.ok(style.opacity>=.6);
  }
});
