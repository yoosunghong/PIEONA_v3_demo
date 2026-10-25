// Resizing a WebGL drawing buffer clears its contents. Defer resize notifications
// until the next draw so the browser can never present that cleared buffer.
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
