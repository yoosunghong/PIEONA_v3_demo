import React,{useLayoutEffect,useRef,useState} from 'react';
import Scene from './Scene';

// The same canvas stays mounted while its viewport expands from the home panel.
export default function WorldStage({editing,guestbookFocused=false,...sceneProps}){
  const stage=useRef(),[frame,setFrame]=useState(null);
  useLayoutEffect(()=>{
    const anchor=stage.current?.parentElement;if(!anchor)return;
    const measure=()=>{
      if(editing){
        const mobile=innerWidth<=700,left=mobile?0:Math.min(490,Math.max(350,innerWidth*.2925))-100;
        setFrame({left,top:0,width:innerWidth-left,height:innerHeight-(mobile?(innerHeight<=650?185:220):0)});
      }else if(guestbookFocused){
        const rect=anchor.getBoundingClientRect();
        // Keep the zoomed book visible beside the desktop panel or above the mobile sheet.
        setFrame(innerWidth<=700?{left:0,top:0,width:innerWidth,height:innerHeight*.24}:{left:rect.left,top:rect.top,width:Math.max(180,Math.min(rect.width,innerWidth-534-rect.left)),height:rect.height});
      }else{
        const rect=anchor.getBoundingClientRect();setFrame({left:rect.left,top:rect.top,width:rect.width,height:rect.height});
      }
    };
    measure();const observer=new ResizeObserver(measure);observer.observe(anchor);window.addEventListener('resize',measure);
    return()=>{observer.disconnect();window.removeEventListener('resize',measure);};
  },[editing,guestbookFocused]);
  return <div ref={stage} className={'persistent-world-stage'+(frame?' is-positioned':'')+(editing?' is-editing':'')} style={frame||{visibility:'hidden'}}><Scene {...sceneProps}/></div>;
}
