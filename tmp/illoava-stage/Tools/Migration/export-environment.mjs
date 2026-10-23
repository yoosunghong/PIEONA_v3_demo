import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {pathToFileURL} from 'node:url';

const source=path.resolve(process.argv[2]||'../PIEONA_v3_prototype');
const target=path.resolve(process.argv[3]||'.');
const load=p=>import(pathToFileURL(path.join(source,p)).href);
const THREE=await load('node_modules/three/build/three.module.js');
const {createDecoration}=await load('src/worldAssets.js');
const {decorations,villageThemes}=await load('shared/world.mjs');
const {createGardenDetails}=await load('src/gardenDetails.js');
const {createLifeWorld}=await load('src/lifeWorld.js');
const {createVillageGuestbook}=await load('src/guestbookModel.js');
const {registerScenery:registerSceneryObject,registerGardenDetails}=await load('src/sceneryObjects.js');
const sceneSource=fs.readFileSync(path.join(source,'src/Scene.jsx'),'utf8');
const begin=sceneSource.indexOf('    const materials=[];const geometries=[];');
const end=sceneSource.indexOf('    const particleGeo=',begin);
if(begin<0||end<begin)throw Error('Scene extraction boundaries changed; review source before exporting.');
const world=new THREE.Scene();
const build=new Function('THREE','world','mood','palette','createDecoration','createLifeWorld','createGardenDetails','registerSceneryObject','registerGardenDetails',sceneSource.slice(begin,end));
build(THREE,world,villageThemes[0],{accent:0xc2ddec,flowers:0xe4d4ec},createDecoration,createLifeWorld,createGardenDetails,registerSceneryObject,registerGardenDetails);
const library=[];
for(const item of decorations)library.push({id:item.id,category:item.category,root:createDecoration(item.id)});
library.push({id:'village',category:'scene',root:world});
library.push({id:'guestbook',category:'other',root:createVillageGuestbook({x:0,z:0,rotation:0})});
library.push({id:'life-area',category:'scene',root:createLifeWorld().root});
const meshes=[],materials=[],geometryIds=new Map(),materialIds=new Map();
const rounded=v=>Math.round(v*1e6)/1e6;
function geometry(g){
  if(geometryIds.has(g.uuid))return geometryIds.get(g.uuid);
  if(!g.attributes.normal)g.computeVertexNormals();
  const id=meshes.length;geometryIds.set(g.uuid,id);
  meshes.push({name:'mesh_'+id,positions:Array.from(g.attributes.position.array,rounded),normals:Array.from(g.attributes.normal.array,rounded),uv:g.attributes.uv?Array.from(g.attributes.uv.array,rounded):[],indices:g.index?Array.from(g.index.array):Array.from({length:g.attributes.position.count},(_,i)=>i)});return id;
}
function material(m){
  const data={color:[m.color.r,m.color.g,m.color.b,m.opacity??1],emission:m.emissive?[m.emissive.r*m.emissiveIntensity,m.emissive.g*m.emissiveIntensity,m.emissive.b*m.emissiveIntensity]:[0,0,0],roughness:m.roughness??1,metallic:m.metalness??0,doubleSided:m.side===THREE.DoubleSide,unlit:!!m.isMeshBasicMaterial};
  const key=JSON.stringify(data);if(materialIds.has(key))return materialIds.get(key);
  const id=materials.length;materialIds.set(key,id);materials.push(data);return id;
}
let omittedLines=0;
const assets=library.map(({id,category,root})=>{
  root.updateMatrixWorld(true);const nodes=[],lights=[];
  root.traverse(o=>{
    if(o.isLine||o.isPoints){omittedLines++;return;}
    let visible=true;for(let p=o;p;p=p.parent)visible=visible&&p.visible;
    if(o.isPointLight){lights.push({position:o.getWorldPosition(new THREE.Vector3()).toArray(),color:[o.color.r,o.color.g,o.color.b],intensity:o.intensity,range:o.distance});return;}
    if(!o.isMesh)return;
    if(Array.isArray(o.material))throw Error('Multi-material geometry requires explicit group handling: '+o.name);
    function node(matrix,index){const p=new THREE.Vector3(),q=new THREE.Quaternion(),s=new THREE.Vector3();matrix.decompose(p,q,s);nodes.push({name:o.name||`${id}_${nodes.length}`,mesh:geometry(o.geometry),material:material(o.material),position:p.toArray().map(rounded),rotation:q.toArray().map(rounded),scale:s.toArray().map(rounded),visible,instance:index});}
    if(o.isInstancedMesh){for(let i=0;i<o.count;i++){const m=new THREE.Matrix4();o.getMatrixAt(i,m);node(o.matrixWorld.clone().multiply(m),i);}}
    else node(o.matrixWorld,-1);
  });
  if(nodes.length===0)throw Error('Empty asset '+id);
  return {id,category,nodes,lights};
});
const sources=['src/Scene.jsx','src/worldAssets.js','src/gardenDetails.js','src/lifeWorld.js','src/guestbookModel.js','src/sceneryObjects.js','shared/world.mjs','shared/scenery.mjs','shared/life.mjs','shared/garden.mjs'];
const provenance=sources.map(file=>({file,sha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(source,file))).digest('hex')}));
const output={version:1,coordinateSystem:'Three.js RH Y-up',meshes,materials,assets};
const out=path.join(target,'Assets/ILLOAVA/SourceData');fs.mkdirSync(out,{recursive:true});
fs.writeFileSync(path.join(out,'environment.json'),JSON.stringify(output));
const report={generatedAt:new Date().toISOString(),source,provenance,decorationCount:decorations.length,assetCount:assets.length,meshCount:meshes.length,materialCount:materials.length,nodeCount:assets.reduce((n,a)=>n+a.nodes.length,0),omittedLines,limitations:['Fishing line Line primitives are omitted; rods and bobbers retained.','Ambient particles and browser canvas text are not mesh assets.','Gameplay and animated prop behavior are not migrated by static geometry export.'],assets:assets.map(a=>({id:a.id,nodes:a.nodes.length}))};
fs.mkdirSync(path.join(target,'Docs/Validation'),{recursive:true});fs.writeFileSync(path.join(target,'Docs/Validation/environment-export.json'),JSON.stringify(report,null,2));
if(decorations.length!==21||assets.length!==24)throw Error('Unexpected catalogue size');
console.log(JSON.stringify({...report,provenance:undefined,assets:undefined},null,2));
