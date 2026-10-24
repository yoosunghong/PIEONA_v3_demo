import * as THREE from 'three';

export function editorGridStyle(mood){
  const ground=new THREE.Color(mood.ground);
  const luminance=.2126*ground.r+.7152*ground.g+.0722*ground.b;
  return (luminance>.45||mood.id==='default')?{color:0x253e5e,opacity:.92}:{color:0xe5ecff,opacity:.66};
}
