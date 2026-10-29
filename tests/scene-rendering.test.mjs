import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createSceneViewport,sceneGraphicsQuality,sceneFrameDue} from '../src/sceneViewport.mjs';
import {editorGridStyle} from '../src/sceneGrid.mjs';
import {villageThemes} from '../shared/world.mjs';

function rig(){
  const events=[],renderer={setSize:(...size)=>events.push(['resize',...size])},camera={aspect:1,updateProjectionMatrix:()=>events.push(['projection'])};
  return{events,camera,viewport:createSceneViewport(renderer,camera)};
}

test('CPU rasterization has a frame budget while GPU frames and resize draws remain immediate',()=>{
  for(const software of [false,true]){
    let lastDraw=-1,draws=0,updates=0;
    for(let frame=0;frame<60;frame++){
      updates++;const time=frame/60;
      if(sceneFrameDue(software,lastDraw,time)){lastDraw=time;draws++;}
    }
    assert.equal(updates,60);
    assert.equal(draws,software?5:60);
  }
  assert.equal(sceneFrameDue(true,1,1.01,true),true);
  assert.equal(sceneFrameDue(true,1,1.01),false);
});

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
test('editor grid retains contrast against user-selected platform colors in every theme',()=>{
 const luminance=c=>.2126*c.r+.7152*c.g+.0722*c.b;
 for(const theme of villageThemes)for(const color of ['#000000','#ffffff','#9296ae','#8aa88c','#8bb3c9','#7e889b']){
   const mood={...theme,ground:color},original=JSON.stringify(mood),style=editorGridStyle(mood),ground=new THREE.Color(color),blended=ground.clone().lerp(new THREE.Color(style.color),style.opacity),a=luminance(ground),b=luminance(blended);
   assert.ok((Math.max(a,b)+.05)/(Math.min(a,b)+.05)>=3,theme.id+' '+color);assert.equal(JSON.stringify(mood),original);
 }
});
