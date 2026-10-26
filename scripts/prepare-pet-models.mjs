// Build synchronous Three.js templates for the existing scene factories. Keep
// portable GLBs alongside extracted PBR images; preserve skin bind matrices.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {fileURLToPath} from 'node:url';
const base=new URL('../',import.meta.url);
globalThis.ProgressEvent??=class ProgressEvent extends Event{constructor(type,init={}){super(type);Object.assign(this,init);}};
mkdirSync(new URL('src/petModels/',base),{recursive:true});
for(const type of ['dog','cat','babyDragon']){
  const dir=new URL(`public/models/pets/${type}/`,base),buffer=readFileSync(new URL('model.glb',dir));
  const jsonLength=buffer.readUInt32LE(12),json=JSON.parse(buffer.subarray(20,20+jsonLength));
  const binStart=20+jsonLength+8,bin=buffer.subarray(binStart);
  const material=json.materials[0],slots={map:material.pbrMetallicRoughness?.baseColorTexture,normalMap:material.normalTexture,roughnessMap:material.pbrMetallicRoughness?.metallicRoughnessTexture,metalnessMap:material.pbrMetallicRoughness?.metallicRoughnessTexture};
  const textures={};
  for(const [slot,ref] of Object.entries(slots))if(ref){
    const img=json.images[json.textures[ref.index].source],view=json.bufferViews[img.bufferView];
    const name=`${slot}.${img.mimeType==='image/jpeg'?'jpg':'png'}`;
    writeFileSync(new URL(name,dir),bin.subarray(view.byteOffset||0,(view.byteOffset||0)+view.byteLength));
    textures[slot]=`/models/pets/${type}/${name}`;
  }
  // Texture decoding belongs to the browser. The synchronous template contains
  // geometry, original skeletons, skin weights and animation tracks only.
  delete json.images;delete json.textures;delete json.samplers;json.materials=[];
  for(const mesh of json.meshes)for(const primitive of mesh.primitives)delete primitive.material;
  json.buffers=[{byteLength:bin.length,uri:`data:application/octet-stream;base64,${bin.toString('base64')}`}];
  const gltf=await new GLTFLoader().parseAsync(JSON.stringify(json),'');
  gltf.scene.animations=gltf.animations;
  const template=gltf.scene.toJSON();
  const round=(_key,value)=>typeof value==='number'?Number(value.toFixed(9)):value;
  writeFileSync(new URL(`src/petModels/${type}.json`,base),JSON.stringify({textures,model:template},round));
  console.log(type,gltf.animations.map(a=>({name:a.name,duration:a.duration,tracks:a.tracks.length})),fileURLToPath(dir));
}
