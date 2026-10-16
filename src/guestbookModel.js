import * as THREE from 'three';

// Original procedural asset: a little open book on a wooden village lectern.
export function createVillageGuestbook(book){
  const root=new THREE.Group();root.userData.action='guestbook';
  const wood=new THREE.MeshStandardMaterial({color:'#966d58',roughness:.88});
  const trim=new THREE.MeshStandardMaterial({color:'#cfad78',roughness:.65});
  const cover=new THREE.MeshStandardMaterial({color:'#537f8c',roughness:.8});
  const paper=new THREE.MeshStandardMaterial({color:'#fff1d7',roughness:1});
  const ink=new THREE.MeshStandardMaterial({color:'#a9a498',roughness:1});
  const ribbon=new THREE.MeshStandardMaterial({color:'#d78e9e',roughness:.8});
  function box(w,h,d,mat,x,y,z,parent=root){const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat);mesh.position.set(x,y,z);mesh.castShadow=true;mesh.receiveShadow=true;parent.add(mesh);return mesh;}
  box(.85,.14,.7,wood,0,.07,0);box(.18,1.05,.18,wood,0,.65,0);box(.3,.09,.3,trim,0,1.06,0);
  const reading=new THREE.Group();reading.position.set(0,1.52,0);reading.rotation.x=-.42;root.add(reading);
  box(1.68,1.02,.1,wood,0,0,-.08,reading);
  for(const side of [-1,1]){
    const leaf=new THREE.Group();leaf.position.x=side*.4;leaf.rotation.y=side*.12;reading.add(leaf);
    box(.8,.98,.055,cover,0,0,0,leaf);box(.72,.9,.065,paper,0,.015,.055,leaf);
    for(let line=0;line<6;line++)box(.48-(line%3)*.06,.013,.005,ink,0,.29-line*.105,.092,leaf);
  }
  box(.045,1.02,.025,trim,0,0,.1,reading);box(.08,.4,.018,ribbon,.47,-.4,.12,reading);
  if(typeof document!=='undefined'){
    const canvas=document.createElement('canvas');canvas.width=512;canvas.height=128;
    const ctx=canvas.getContext('2d');ctx.fillStyle='#fff1d7';ctx.fillRect(0,0,512,128);ctx.fillStyle='#486b77';ctx.font='bold 68px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('방명록',256,67);
    const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
    const label=new THREE.Mesh(new THREE.PlaneGeometry(.9,.225),new THREE.MeshStandardMaterial({map:texture,roughness:1}));label.position.set(0,.78,.13);root.add(label);
  }
  root.position.set(book.x,.15,book.z);root.rotation.y=book.rotation*Math.PI/2;return root;
}
