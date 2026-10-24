import * as THREE from 'three';

// Smooth, original models shared by the live world and the reward photographs.
const mat=(color,extra={})=>new THREE.MeshStandardMaterial({color,roughness:.55,...extra});
function mesh(parent,name,geometry,material,x=0,y=0,z=0){
  const node=new THREE.Mesh(geometry,material);node.name=name;node.position.set(x,y,z);node.castShadow=true;node.receiveShadow=true;parent.add(node);return node;
}
function orb(parent,name,material,x,y,z,sx,sy,sz){mesh(parent,name,new THREE.SphereGeometry(1,32,24),material,x,y,z).scale.set(sx,sy,sz);}
function tube(parent,name,material,points,radius=.025){return mesh(parent,name,new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p))),32,radius,12,false),material);}
function horn(parent,material,x,y,z,sign=1,size=1){
  const curve=new THREE.CatmullRomCurve3([[x,y,z],[x+sign*.025*size,y+.13*size,z-.03*size],[x+sign*.08*size,y+.24*size,z-.10*size]].map(p=>new THREE.Vector3(...p)));
  const geo=new THREE.TubeGeometry(curve,20,.055*size,12,false);
  const pos=geo.attributes.position;
  for(let i=0;i<pos.count;i++){const t=Math.floor(i/13)/20,center=curve.getPointAt(t),v=new THREE.Vector3().fromBufferAttribute(pos,i).sub(center).multiplyScalar(1-t*.94).add(center);pos.setXYZ(i,v.x,v.y,v.z);}
  geo.computeVertexNormals();mesh(parent,'curved ivory horn',geo,material);
}
export {createCrystalwingDragon as createBabyDragon} from './crystalwingDragon.mjs';

export function createDragonNest(){
  const root=new THREE.Group();root.name='Crystal cradle nest';root.userData.generated=true;
  const stone=mat('#b2a7a4'),stoneLight=mat('#d7c9bd'),wood=mat('#94705c'),woodLight=mat('#c39973'),leaf=mat('#85a57a'),leafDark=mat('#5d846a'),cream=mat('#fff0d2'),cushion=mat('#ddd9f8'),gold=mat('#d5ac65',{metalness:.5,roughness:.3}),crystal=mat('#a5c9ff',{metalness:.25,roughness:.2,emissive:'#729fef',emissiveIntensity:.38}),glow=mat('#ffe4a1',{emissive:'#ffc96c',emissiveIntensity:.65});
  mesh(root,'stone foundation',new THREE.CylinderGeometry(.66,.72,.15,48),stone,0,.075,0);
  mesh(root,'moss island',new THREE.CylinderGeometry(.66,.68,.05,48),leafDark,0,.17,0);
  mesh(root,'woven outer rim',new THREE.TorusGeometry(.49,.12,16,64),woodLight,0,.31,0).rotation.x=Math.PI/2;
  for(let j=0;j<3;j++){
    const weave=[];for(let i=0;i<=96;i++){const a=i*Math.PI*2/96,r=.515+Math.sin(a*12+j*Math.PI*2/3)*.035;weave.push([Math.cos(a)*r,.31+Math.cos(a*12+j*Math.PI*2/3)*.038,Math.sin(a)*r]);}
    tube(root,'braided willow nest',j===1?wood:woodLight,weave,.022);
  }
  orb(root,'velvet cushion',cushion,0,.29,0,.48,.09,.46);
  orb(root,'soft cushion center',cream,0,.34,.015,.37,.06,.35);
  for(let i=0;i<12;i++){
    const a=i*Math.PI/6;orb(root,'padded cushion petal',cream,Math.cos(a)*.40,.37,Math.sin(a)*.39,.105,.10,.10);
  }
  // Two organic intertwined branches, open at the front like the reference.
  for(let j=0;j<2;j++){
    const points=[];
    for(let i=0;i<=32;i++){const a=i/32*Math.PI;points.push([Math.cos(a)*(.57+j*.035)+Math.sin(a*7)*.018,.30+Math.sin(a)*1.02, -.25+j*.075+Math.cos(a*6)*.022]);}
    tube(root,'living wood arch',j?woodLight:wood,points,j?.047:.085);
  }
  for(let i=0;i<10;i++){
    const a=i/9*Math.PI;const x=Math.cos(a)*.60,y=.32+Math.sin(a)*1.04;
    for(const sign of [-1,1]){const foliage=mesh(root,'ivy leaf',new THREE.SphereGeometry(1,12,8),i%2?leaf:leafDark,x+sign*.065,y+sign*.04,-.26);foliage.scale.set(.095,.035,.05);foliage.rotation.z=sign*.55;}
  }
  // A climbing vine and small branches give the arch a living, uneven silhouette.
  const vine=[];for(let i=0;i<=60;i++){const a=i/60*Math.PI;vine.push([Math.cos(a)*.60+Math.sin(a*12)*.045,.30+Math.sin(a)*1.02+Math.cos(a*12)*.035,-.18+Math.cos(a*12)*.055]);}
  tube(root,'climbing ivy vine',leafDark,vine,.018);
  for(let i=0;i<14;i++){
    const a=.15+i/13*(Math.PI-.30),x=Math.cos(a)*.59,y=.30+Math.sin(a)*1.03;
    const sign=x>0?1:-1;
    tube(root,'woodland twig',wood,[[x,y,-.22],[x+sign*.10,y+.06,-.21],[x+sign*.13,y+.14,-.23]],.016);
    for(let j=0;j<3;j++){
      const l=mesh(root,'woodland pointed leaf',new THREE.SphereGeometry(1,12,8),j%2?leafDark:leaf,x+sign*(.09+j*.027),y+.09+j*.03,-.18-j*.02);l.scale.set(.085,.022,.038);l.rotation.z=sign*(.6+j*.4);
    }
  }
  for(const [x,y,z,s] of [[-.51,.48,-.15,.20],[-.62,.43,-.07,.12],[.52,.39,.03,.19],[.60,.38,-.04,.11],[-.26,1.28,-.25,.20],[-.39,1.24,-.25,.12]]){
    const shard=mesh(root,'luminous crystal',new THREE.OctahedronGeometry(1),crystal,x,y,z);shard.scale.set(s*.38,s,s*.38);shard.rotation.z=-x*.25;
  }
  for(const x of [-.43,.43]){
    tube(root,'lantern chain',gold,[[x,.98,-.19],[x,.88,-.19],[x,.76,-.19]],.009);
    const lantern=mesh(root,'warm lantern',new THREE.OctahedronGeometry(.09),glow,x,.69,-.19);lantern.scale.set(.6,1,.6);
    for(const offset of [-.045,.045])tube(root,'lantern frame',gold,[[x,.79,-.19],[x+offset,.69,-.15],[x,.59,-.19]],.008);
  }
  tube(root,'hanging moon chain',gold,[[0,1.33,-.22],[0,1.14,-.22]],.009);
  const moon=mesh(root,'moon charm',new THREE.TorusGeometry(.065,.015,8,24,Math.PI*1.5),gold,0,1.08,-.22);moon.rotation.z=.6;
  for(let i=0;i<18;i++){
    const a=i*Math.PI*2/18,x=Math.cos(a)*.63,z=Math.sin(a)*.60;
    const rock=mesh(root,'ring stone',new THREE.DodecahedronGeometry(.10,0),i%2?stone:stoneLight,x,.13,z);rock.scale.set(1,.7,1);
    if(i%3===0){orb(root,'garden leaf',leaf,x,.24,z,.10,.035,.065);for(let j=0;j<5;j++){const b=j*Math.PI*2/5;orb(root,'little blossom',i%2?cream:cushion,x+Math.cos(b)*.032,.265,z+Math.sin(b)*.032,.024,.012,.025);}orb(root,'flower center',gold,x,.274,z,.015,.012,.015);}
  }
  for(const sign of [-1,1])for(let i=0;i<4;i++){
    const x=sign*(.47+i*.04),z=.15+i*.11;
    for(let j=0;j<3;j++){const l=mesh(root,'fern leaf',new THREE.SphereGeometry(1,12,8),j%2?leaf:leafDark,x+(j-1)*.035,.22+i*.014+j*.025,z);l.scale.set(.034,.11,.018);l.rotation.z=(j-1)*.55;}
  }
  const water=mat('#a8dce8',{transparent:true,opacity:.8,roughness:.18,metalness:.15});
  tube(root,'tiny waterfall',water,[[.23,.23,.49],[.24,.17,.62],[.26,.05,.70]],.045);
  for(const [x,z] of [[.26,.71],[.19,.70],[.29,.68]])orb(root,'waterfall foam',cream,x,.045,z,.032,.018,.025);
  // Small front steps and a translucent ribbon of water.
  for(let i=0;i<2;i++)mesh(root,'front stone step',new THREE.CylinderGeometry(.24,.26,.07,32),stoneLight,0,.10-i*.04,.58+i*.13).scale.z=.5;
  return root;
}

