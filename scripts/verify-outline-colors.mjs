import assert from 'node:assert/strict';
import {readFile,mkdir} from 'node:fs/promises';
import {resolve,sep} from 'node:path';
import {chromium} from 'playwright';
import {harness} from '../tests/runtimeHarness.mjs';

const h=await harness(),base=`http://127.0.0.1:${h.runtime.server.address().port}`;let browser;
try{
 browser=await chromium.launch({headless:true,channel:process.platform==='win32'?'msedge':undefined});const page=await browser.newPage({viewport:{width:640,height:480}});
 const workspace=resolve('.');await page.route('**/__outline/**',async route=>{
  const path=resolve(workspace,decodeURIComponent(new URL(route.request().url()).pathname.slice('/__outline/'.length)));
  const allowed=path===resolve('src/facilityOutline.mjs')||[resolve('shared'),resolve('node_modules/three')].some(prefix=>path.startsWith(prefix+sep));
  if(!allowed)return route.abort();await route.fulfill({contentType:'text/javascript',body:await readFile(path)});
 });
 await page.route('**/__outline_qa',route=>route.fulfill({contentType:'text/html',body:`<!doctype html><html><head><script type="importmap">{"imports":{"three":"/__outline/node_modules/three/build/three.module.js","three/addons/":"/__outline/node_modules/three/examples/jsm/"}}</script></head><body><script type="module">
 import * as THREE from 'three';import {createFacilityOutline} from '/__outline/src/facilityOutline.mjs';
 const renderer=new THREE.WebGLRenderer({preserveDrawingBuffer:true,antialias:false});renderer.setSize(256,192);renderer.setPixelRatio(1);renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.12;document.body.appendChild(renderer.domElement);
 const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(40,256/192,.1,20);camera.position.z=5;
 const texture=new THREE.DataTexture(new Uint8Array([62,105,160,255,125,85,115,255,25,65,92,255,160,134,88,255]),2,2);texture.colorSpace=THREE.SRGBColorSpace;texture.needsUpdate=true;scene.background=texture;scene.backgroundIntensity=.8;
 const mesh=new THREE.Mesh(new THREE.SphereGeometry(.65,24,16),new THREE.MeshStandardMaterial({color:'#88bc83'}));scene.add(mesh,new THREE.HemisphereLight(0xffffff,0x303050,2));const outline=createFacilityOutline(renderer,scene,camera);
 const gl=renderer.getContext(),pixels=()=>{const data=new Uint8Array(256*192*4);gl.readPixels(0,0,256,192,gl.RGBA,gl.UNSIGNED_BYTE,data);return data;};
 const cases=[];for(const ratio of [1,1.5]){renderer.setPixelRatio(ratio);for(const size of [[256,192],[300,210]]){renderer.setSize(...size);camera.aspect=size[0]/size[1];camera.updateProjectionMatrix();
 const read=()=>{const width=gl.drawingBufferWidth,height=gl.drawingBufferHeight,data=new Uint8Array(width*height*4);gl.readPixels(0,0,width,height,gl.RGBA,gl.UNSIGNED_BYTE,data);return{width,height,data};};
 outline.render(null);const before=read();outline.render(mesh);const after=read();outline.render(null);const restored=read();let changed=0,outside=0,restoreError=0;
 for(let y=0;y<before.height;y++)for(let x=0;x<before.width;x++){const index=(y*before.width+x)*4,diff=Math.max(...[0,1,2].map(c=>Math.abs(before.data[index+c]-after.data[index+c])));if(diff>1)changed++;if((x<before.width*.25||x>before.width*.75||y<before.height*.2||y>before.height*.8)&&diff>1)outside++;for(let c=0;c<3;c++)restoreError=Math.max(restoreError,Math.abs(before.data[index+c]-restored.data[index+c]));}
 cases.push({ratio,size,changed,outside,restoreError,toneMapping:renderer.toneMapping,exposure:renderer.toneMappingExposure});}}
 window.outlineQA=cases;outline.dispose();
 </script></body></html>`}));
 await page.goto(base+'/__outline_qa');await page.waitForFunction(()=>window.outlineQA);const cases=await page.evaluate(()=>window.outlineQA);
 for(const result of cases){assert.ok(result.changed>0,'the outline is visible');assert.equal(result.outside,0,'background pixels retain their colors');assert.equal(result.restoreError,0,'deselection restores the exact frame');assert.equal(result.exposure,1.12);}
 await mkdir('artifacts/galaxy',{recursive:true});await page.screenshot({path:'artifacts/galaxy/outline-color-qa.png'});console.log('Outline pixel QA passed:',JSON.stringify(cases));
}finally{await browser?.close();await h.close();}
