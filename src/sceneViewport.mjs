// CPU renderers need a smaller buffer and no shadow pass to keep UI input responsive.
export function sceneGraphicsQuality(gl,pixelRatio=1){
  let renderer='';
  try{const info=gl.getExtension('WEBGL_debug_renderer_info');if(info)renderer=String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)||'');}catch{}
  const software=/swiftshader|llvmpipe|softpipe|software rasterizer/i.test(renderer);
  return {software,shadows:!software,pixelRatio:Math.min(Number.isFinite(pixelRatio)&&pixelRatio>0?pixelRatio:1,software?.65:1.75)};
}

// Keep simulation/input updates on RAF; only limit costly CPU rasterization.
export function sceneFrameDue(software,lastDraw,time,needsDraw=false){
  return !software||needsDraw||time-lastDraw>=.2;
}

// Defer buffer resizing until a draw so a cleared canvas is never presented.
export function createSceneViewport(renderer,camera,{getFieldOfView}={}){
  let pending=null,current=null;
  return{
    resize(width,height){
      if(!Number.isFinite(width)||!Number.isFinite(height)||width<=0||height<=0)return;
      const size={width:Math.max(1,Math.round(width)),height:Math.max(1,Math.round(height))};
      pending=current?.width===size.width&&current?.height===size.height?null:size;
    },
    get needsDraw(){return pending!==null;},
    draw(render){
      let projectionChanged=false;
      if(pending){
        current=pending;pending=null;
        renderer.setSize(current.width,current.height,false);
        camera.aspect=current.width/current.height;projectionChanged=true;
      }
      const fov=getFieldOfView?.();
      if(Number.isFinite(fov)&&fov>0&&fov<180&&camera.fov!==fov){camera.fov=fov;projectionChanged=true;}
      if(projectionChanged)camera.updateProjectionMatrix();
      render();
    }
  };
}
