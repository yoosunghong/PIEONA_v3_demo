import {Vector2,Color,WebGLRenderTarget,MeshBasicMaterial,AdditiveBlending} from 'three';
import {OutlinePass} from 'three/addons/postprocessing/OutlinePass.js';
import {FullScreenQuad} from 'three/addons/postprocessing/Pass.js';
import {lifeDefinitions} from '../shared/lifeLayout.mjs';

export function selectedFacility(facilities,action){
  const definition=lifeDefinitions.find(item=>item.action===action);
  const root=definition&&facilities.get('scenery:'+definition.id);
  return root?.visible?root:null;
}

// Render the original scene exactly as usual, then add only the silhouette.
// Running the entire frame through OutputPass tone-maps an sRGB background that
// Three.js deliberately excludes from tone mapping in its direct render path.
export function createFacilityOutline(renderer,scene,camera,{glow=0}={}){
  let outline,edges,overlay,material,width=0,height=0;
  const size=new Vector2(),clearColor=new Color();
  return {
    render(selected){
      renderer.render(scene,camera);
      if(!selected)return;
      if(!outline){
        outline=new OutlinePass(new Vector2(1,1),scene,camera);
        outline.visibleEdgeColor.set('#ffffff');outline.hiddenEdgeColor.set('#ffffff');
        outline.edgeStrength=5;outline.edgeThickness=2;outline.edgeGlow=glow;outline.pulsePeriod=0;
        edges=new WebGLRenderTarget(1,1,{depthBuffer:false});
        material=new MeshBasicMaterial({map:edges.texture,transparent:true,blending:AdditiveBlending,depthTest:false,depthWrite:false,toneMapped:false});
        overlay=new FullScreenQuad(material);
      }
      renderer.getSize(size);
      const ratio=renderer.getPixelRatio(),w=Math.max(1,Math.floor(size.x*ratio)),h=Math.max(1,Math.floor(size.y*ratio));
      if(w!==width||h!==height){
        width=w;height=h;outline.setSize(width,height);edges.setSize(width,height);
      }
      const target=renderer.getRenderTarget(),autoClear=renderer.autoClear,alpha=renderer.getClearAlpha();renderer.getClearColor(clearColor);
      try{
        renderer.autoClear=false;renderer.setRenderTarget(edges);renderer.setClearColor(0,0);renderer.clear();
        outline.selectedObjects=[selected];outline.render(renderer,null,edges,0,false);
        renderer.setRenderTarget(target);overlay.render(renderer);
      }finally{renderer.setRenderTarget(target);renderer.setClearColor(clearColor,alpha);renderer.autoClear=autoClear;}
    },
    dispose(){outline?.dispose();edges?.dispose();material?.dispose();overlay?.dispose();},
  };
}
