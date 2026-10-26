// Local-only visual regression harness; all account data lives in memory.
import {createRequire} from 'node:module';
import {writeFileSync,mkdirSync} from 'node:fs';
import {createApp} from '../server/app.mjs';
import {openStore} from '../server/store.mjs';
import {SURVEY_REWARD} from '../shared/surveyRewards.mjs';
import {surveyVersion} from '../shared/survey.mjs';
import {createServer} from 'vite';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
process.env.PUBLIC_ORIGIN='http://127.0.0.1:5186';
const runtime=createApp({testing:true,store:openStore(':memory:')});
await new Promise(resolve=>runtime.server.listen(0,'127.0.0.1',resolve));
const backend=`http://127.0.0.1:${runtime.server.address().port}`;
const vite=await createServer({configFile:false,server:{host:'127.0.0.1',port:5186,strictPort:true,proxy:{'/api':backend,'/resource':backend,'/socket.io':{target:backend,ws:true}}}});
await vite.listen();
const browser=await chromium.launch({headless:true,...(process.env.CHROME_EXECUTABLE?{executablePath:process.env.CHROME_EXECUTABLE}:{}),args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
mkdirSync('tmp/crystalwing-qa',{recursive:true});
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 page.on('response',async r=>{if(r.url().endsWith('/api/me/mount')){const body=await r.json();console.log('mount response',r.status(),body.error||body.user?.appearance.ride);}});
 await page.goto('http://127.0.0.1:5186/');
 const registered=await page.evaluate(async()=>{const r=await fetch('/api/auth/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:'crystal_visual',password:'local-preview-password'})});return r.json();});
 const uid=registered.user.id;
 await page.evaluate(id=>localStorage.setItem('pieona.tutorial.v1.'+id,'seen'),uid);
 runtime.store.run('UPDATE users SET nickname=?,balance=? WHERE id=?','비행 테스트','[1,2,3,4,5,6]',uid);
 runtime.store.run('INSERT INTO account_rewards(user_id,reward_id) VALUES(?,?)',uid,SURVEY_REWARD);
 runtime.store.run('INSERT OR REPLACE INTO survey_participation(user_id,completed,version) VALUES(?,?,?)',uid,1,surveyVersion);
 await page.reload();await page.waitForTimeout(4500);
 if(await page.getByRole('button',{name:'건너뛰기',exact:true}).count())await page.getByRole('button',{name:'건너뛰기',exact:true}).click();
 const result=await page.evaluate(async()=>{const me=(await (await fetch('/api/me')).json()).user;return (await fetch('/api/me/world',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({appearance:{...me.appearance,ride:'babyDragon',petColor:'#e8efff'}})})).status;});
 if(result!==200)throw new Error('Cannot equip dragon: '+result);
 await page.reload();await page.waitForTimeout(4500);
 await page.getByRole('button',{name:'내 마을 걷기',exact:true}).click();await page.waitForTimeout(1800);
 await page.screenshot({path:'tmp/crystalwing-qa/mounted-world.png'});
 await page.keyboard.press('f');await page.waitForFunction(async()=>(await (await fetch('/api/me')).json()).user.appearance.ride==='none',null,{timeout:20000});
 const dismounted=await page.evaluate(async()=>(await (await fetch('/api/me')).json()).user.appearance.ride);
 if(dismounted!=='none')throw new Error('F did not dismount: '+dismounted);
 await page.getByRole('button',{name:'F 아기용 타고 비행',exact:true}).waitFor({state:'visible',timeout:20000});
 await page.keyboard.press('f');await page.waitForFunction(async()=>(await (await fetch('/api/me')).json()).user.appearance.ride==='babyDragon',null,{timeout:20000});
 const remounted=await page.evaluate(async()=>(await (await fetch('/api/me')).json()).user.appearance.ride);
 if(remounted!=='babyDragon')throw new Error('F did not remount: '+remounted);
 await page.keyboard.down('w');await page.waitForTimeout(800);await page.keyboard.up('w');await page.waitForTimeout(500);
 await page.screenshot({path:'tmp/crystalwing-qa/flying-world.png'});
 // Inspect the deformed skin and saddle without world scenery obscuring the anatomy.
 const images=await page.evaluate(async()=>{
  const THREE=await import('/node_modules/three/build/three.module.js');
  const {loadAsset}=await import('/src/avatar.js');const {clone}=await import('/node_modules/three/examples/jsm/utils/SkeletonUtils.js');
  const {createDragonRide}=await import('/src/dragonRide.mjs');
  const renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.setSize(1000,800);renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;
  const scene=new THREE.Scene();scene.background=new THREE.Color('#eaf3fc');scene.add(new THREE.HemisphereLight('#ffffff','#98a7bd',2.5));const light=new THREE.DirectionalLight('#ffffff',3);light.position.set(3,6,4);scene.add(light);
  const avatar=clone(await loadAsset('pio'));avatar.scale.setScalar(2.65/new THREE.Box3().setFromObject(avatar).getSize(new THREE.Vector3()).y);const b=new THREE.Box3().setFromObject(avatar),c=b.getCenter(new THREE.Vector3());avatar.position.set(-c.x,-b.min.y,-c.z);
  const root=new THREE.Group();root.position.y=1.89;root.add(avatar);scene.add(root);const ride=createDragonRide(avatar);
  const camera=new THREE.PerspectiveCamera(38,1.25,.1,100);camera.position.set(5,4.2,8);camera.lookAt(0,3,0);
  const grid=new THREE.GridHelper(12,12,'#a6b6c9','#cbd9e8');scene.add(grid);
  await new Promise(r=>setTimeout(r,1200));const images={};
  for(const [name,dt] of [['saddle',0],['wing-down',.28],['wing-up',.56]]){ride.update(dt,true);renderer.render(scene,camera);images[name]=renderer.domElement.toDataURL('image/png').split(',')[1];}
  renderer.dispose();return images;
 });
 for(const [name,data] of Object.entries(images))writeFileSync('tmp/crystalwing-qa/'+name+'.png',Buffer.from(data,'base64'));
 if(errors.length)throw new Error(errors.join('\n'));
 console.log('PASS: browser mount, F dismount/remount, WASD flight, textures and three rig views');
}finally{await browser.close();await vite.close();await runtime.close();}
