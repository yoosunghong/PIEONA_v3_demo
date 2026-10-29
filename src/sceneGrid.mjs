import * as THREE from 'three';

export function editorGridStyle(mood){
  const ground=new THREE.Color(mood.ground);
  const luminance=.2126*ground.r+.7152*ground.g+.0722*ground.b;
  const candidates=[{color:0x102238,opacity:.96},{color:0xf3f6ff,opacity:.9}];
  const contrast=style=>{const mixed=ground.clone().lerp(new THREE.Color(style.color),style.opacity),value=.2126*mixed.r+.7152*mixed.g+.0722*mixed.b;return (Math.max(luminance,value)+.05)/(Math.min(luminance,value)+.05);};
  return candidates.sort((a,b)=>contrast(b)-contrast(a))[0];
}
