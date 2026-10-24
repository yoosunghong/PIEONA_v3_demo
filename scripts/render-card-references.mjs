import {createRequire} from 'node:module';
import {mkdirSync,writeFileSync} from 'node:fs';
import {createServer} from 'vite';
import {createApp} from '../server/app.mjs';
import {openStore} from '../server/store.mjs';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const runtime=createApp({testing:true,store:openStore(':memory:')});
await new Promise(resolve=>runtime.server.listen(0,'127.0.0.1',resolve));
const backend=`http://127.0.0.1:${runtime.server.address().port}`;
const vite=await createServer({configFile:false,server:{host:'127.0.0.1',port:0,proxy:{'/resource':backend}},plugins:[{name:'portrait-references',configureServer(server){server.middlewares.use('/__portraits',async(req,res)=>{
  res.setHeader('Content-Type','text/html');res.end(await server.transformIndexHtml('/__portraits/',`<html><body><script type="module">
    import * as THREE from 'three';import {clone} from 'three/addons/utils/SkeletonUtils.js';import {loadAsset} from '/src/avatar.js';
    window.references={};
    try{for(const character of ['pio','luna','moa','tori']){
      const model=clone(await loadAsset(character));model.updateMatrixWorld(true);
      const box=new THREE.Box3().setFromObject(model),size=box.getSize(new THREE.Vector3());model.scale.multiplyScalar(3/size.y);
      const bounds=new THREE.Box3().setFromObject(model),center=bounds.getCenter(new THREE.Vector3());model.position.set(-center.x,-bounds.min.y,-center.z);model.rotation.y=.08;
      const scene=new THREE.Scene();scene.background=new THREE.Color('#edf3ed');scene.add(model);scene.add(new THREE.HemisphereLight('#ffffff','#b6c5b6',2.4));
      const light=new THREE.DirectionalLight('#fff5e7',3);light.position.set(-3,5,6);scene.add(light);
      const renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.setSize(900,1100);renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;
      const camera=new THREE.PerspectiveCamera(32,900/1100,.1,100);camera.position.set(0,1.7,7);camera.lookAt(0,1.6,0);renderer.render(scene,camera);
      window.references[character]=renderer.domElement.toDataURL('image/png');renderer.dispose();renderer.forceContextLoss();
    }window.done=true;}catch(e){window.failure=e.stack;}
  </script></body></html>`));
});}}]});
let browser;
try{await vite.listen();browser=await chromium.launch({headless:true,channel:'msedge',args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});const page=await browser.newPage();page.on('pageerror',e=>console.error(e.message));await page.goto(`http://127.0.0.1:${vite.httpServer.address().port}/__portraits/`);await page.waitForFunction(()=>window.done||window.failure,null,{timeout:120000});const result=await page.evaluate(()=>({images:window.references,error:window.failure}));if(result.error)throw new Error(result.error);mkdirSync('tmp/card-references',{recursive:true});for(const [id,data] of Object.entries(result.images)){writeFileSync(`tmp/card-references/${id}.png`,Buffer.from(data.split(',')[1],'base64'));console.log(id+' reference saved');}}
finally{await browser?.close();await vite.close();await runtime.close();}
