import {Vector2} from 'three';
import {EffectComposer} from 'three/addons/postprocessing/EffectComposer.js';
import {RenderPass} from 'three/addons/postprocessing/RenderPass.js';
import {OutlinePass} from 'three/addons/postprocessing/OutlinePass.js';
import {OutputPass} from 'three/addons/postprocessing/OutputPass.js';
import {lifeDefinitions} from '../shared/lifeLayout.mjs';

export function selectedFacility(facilities,action){
  const definition=lifeDefinitions.find(item=>item.action===action);
  const root=definition&&facilities.get('scenery:'+definition.id);
  return root?.visible?root:null;
}

// Allocate render targets only after a facility is selected. OutlinePass uses
// the complete object silhouette, keeping internal mesh edges out of the halo.
export function createFacilityOutline(renderer,scene,camera){
  let composer,outline,renderPass,outputPass,width=0,height=0,pixelRatio=0;
  const size=new Vector2();
  return {
    render(selected){
      if(!selected){renderer.render(scene,camera);return;}
      if(!composer){
        composer=new EffectComposer(renderer);
        renderPass=new RenderPass(scene,camera);composer.addPass(renderPass);
        outline=new OutlinePass(new Vector2(1,1),scene,camera);
        outline.visibleEdgeColor.set('#ffffff');outline.hiddenEdgeColor.set('#ffffff');
        outline.edgeStrength=5;outline.edgeThickness=2;outline.edgeGlow=0;outline.pulsePeriod=0;
        composer.addPass(outline);outputPass=new OutputPass();composer.addPass(outputPass);
      }
      renderer.getSize(size);
      const ratio=renderer.getPixelRatio();
      if(size.x!==width||size.y!==height||ratio!==pixelRatio){
        width=size.x;height=size.y;pixelRatio=ratio;composer.setPixelRatio(ratio);composer.setSize(width,height);
      }
      outline.selectedObjects=[selected];composer.render();
    },
    dispose(){renderPass?.dispose();outline?.dispose();outputPass?.dispose();composer?.dispose();},
  };
}
