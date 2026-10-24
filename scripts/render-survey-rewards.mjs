import {createRequire} from 'node:module';
import {mkdirSync,writeFileSync} from 'node:fs';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({headless:true,...(process.env.CHROME_EXECUTABLE?{executablePath:process.env.CHROME_EXECUTABLE}:{}),args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try{
const page=await browser.newPage({viewport:{width:800,height:800}});
page.on('pageerror',e=>console.error(e.message));
await page.goto(process.argv[2]||'http://127.0.0.1:5173/');
await page.waitForLoadState('domcontentloaded');
const images=await page.evaluate(async()=>{
 const THREE=await import('/node_modules/three/build/three.module.js');
 const {createBabyDragon,createDragonNest}=await import('/src/dragonModels.mjs');
 const renderer=new THREE.WebGLRenderer({alpha:true,antialias:true,preserveDrawingBuffer:true});renderer.setSize(720,640);renderer.setPixelRatio(1);renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.12;renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
 const scene=new THREE.Scene();scene.add(new THREE.HemisphereLight('#eaefff','#ba9d83',2));
 const sun=new THREE.DirectionalLight('#fff4e8',3.4);sun.position.set(-3,5,5);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);sun.shadow.normalBias=.015;scene.add(sun);
 const fill=new THREE.DirectionalLight('#b5c9ff',1.7);fill.position.set(3,3,-3);scene.add(fill);
 const ground=new THREE.Mesh(new THREE.PlaneGeometry(200,200),new THREE.ShadowMaterial({opacity:.12}));ground.rotation.x=-Math.PI/2;ground.receiveShadow=true;scene.add(ground);
 const camera=new THREE.OrthographicCamera(-1,1,1,-1,.01,100),result={};
 const variants=[['dragon-lumi','#e8efff'],['dragon-kai','#78635f'],['dragon-nero','#b4dfc0'],['dragon-piyo','#f5bdce'],['dragon-zero','#514475'],['dragon-nest',null]];
 for(const [name,color] of variants){
 const model=color?createBabyDragon(color).root:createDragonNest();scene.add(model);
 await new Promise((resolve,reject)=>{const started=performance.now();function check(){let ready=true;model.traverse(o=>{for(const m of o.material?(Array.isArray(o.material)?o.material:[o.material]):[])for(const key of ['map','normalMap','roughnessMap','metalnessMap'])if(m[key]&&!m[key].image?.complete)ready=false;});if(ready)resolve();else if(performance.now()-started>30000)reject(new Error('Texture load timeout'));else setTimeout(check,30);}check();});
 const bounds=new THREE.Box3().setFromObject(model),center=bounds.getCenter(new THREE.Vector3()),size=bounds.getSize(new THREE.Vector3());
 const fit=Math.max(size.y*.62,size.x*.52,size.z*.55);camera.left=-fit*720/640;camera.right=fit*720/640;camera.top=fit;camera.bottom=-fit;camera.position.copy(center).add(new THREE.Vector3(color?.9:1.8,color?.6:1.25,4));camera.lookAt(center);camera.updateProjectionMatrix();
 renderer.render(scene,camera);result[name]=renderer.domElement.toDataURL('image/png').split(',')[1];
 scene.remove(model);
 }
 renderer.dispose();return result;
});
mkdirSync('public/images/rewards',{recursive:true});
for(const [name,data] of Object.entries(images)){writeFileSync('public/images/rewards/'+name+'.png',Buffer.from(data,'base64'));console.log(name);}
}finally{await browser.close();}

