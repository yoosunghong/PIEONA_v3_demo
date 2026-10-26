import {createRequire} from 'node:module';
import {writeFileSync,mkdirSync} from 'node:fs';
import {createServer} from 'vite';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const vite=await createServer({server:{host:'127.0.0.1',port:5192,strictPort:true}});
await vite.listen();
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_EXECUTABLE||'C:/Program Files/Google/Chrome/Application/chrome.exe',args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
mkdirSync('tmp/pet-model-qa',{recursive:true});
try{
  const page=await browser.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  // A blank same-origin document avoids starting the app's API connections.
  await page.route('**/pet-model-qa',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><link rel="icon" href="data:,"><title>Pet model QA</title>'}));
  await page.goto('http://127.0.0.1:5192/pet-model-qa');
  const result=await page.evaluate(async()=>{
    const THREE=await import('/node_modules/three/build/three.module.js');
    const {createCompanionPet}=await import('/src/companionPet.mjs');
    const renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.setSize(1000,800);renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;
    const scene=new THREE.Scene();scene.background=new THREE.Color('#eaf3fc');scene.add(new THREE.HemisphereLight('#ffffff','#98a7bd',2.5));
    const light=new THREE.DirectionalLight('#ffffff',3);light.position.set(3,6,4);scene.add(light);
    const camera=new THREE.PerspectiveCamera(38,1.25,.01,100),images={},metrics={};
    const pets=['dog','cat','babyDragon'].map(petType=>createCompanionPet({petType,petColor:'#efe4d2'}));
    await Promise.all(pets.flatMap(pet=>{const pending=[];pet.root.traverse(n=>{if(n.material?.map&&!n.material.map.image)pending.push(new Promise((resolve,reject)=>{const start=Date.now();const check=()=>n.material.map.image?resolve():Date.now()-start>15000?reject(new Error('Texture timeout')):setTimeout(check,30);check();}));});return pending;}));
    for(const pet of pets){
      const type=pet.root.userData.petType;scene.add(pet.root);
      const big=type==='babyDragon';camera.position.set(big?4:1.5,big?2.8:1.1,big?6:2.1);camera.lookAt(0,big?.85:.4,0);
      const frames=[];
      for(const time of [0,.3,.6]){
        pet.runMotion.update(time,true);pet.root.updateMatrixWorld(true);
        const coat=pet.root.getObjectByName('coat');coat.skeleton.update();
        const v=coat.getVertexPosition(100,new THREE.Vector3()).applyMatrix4(coat.matrixWorld);frames.push(v.toArray());
        renderer.render(scene,camera);images[`${type}-${time}`]=renderer.domElement.toDataURL('image/png').split(',')[1];
      }
      metrics[type]={frames,bones:Object.keys(pet.rig).length};scene.remove(pet.root);
    }
    renderer.dispose();return {images,metrics};
  });
  for(const [name,data] of Object.entries(result.images))writeFileSync(`tmp/pet-model-qa/${name}.png`,Buffer.from(data,'base64'));
  if(errors.length)throw new Error(errors.join('\n'));
  console.log(JSON.stringify(result.metrics,null,2));
}finally{await browser.close();await vite.close();}
