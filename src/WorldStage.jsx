import React,{useLayoutEffect,useRef,useState} from 'react';
import Scene from './Scene';

// The same canvas stays mounted while its viewport expands from the home panel.
export default function WorldStage({editing,...sceneProps}){
  const stage=useRef(),[frame,setFrame]=useState(null);
  useLayoutEffect(()=>{
    const anchor=stage.current?.parentElement;if(!anchor)return;
    const measure=()=>{
      if(editing){
        const mobile=innerWidth<=700,left=mobile?0:Math.min(490,Math.max(350,innerWidth*.2925))-100;
        setFrame({left,top:0,width:innerWidth-left,height:innerHeight-(mobile?(innerHeight<=650?185:220):0)});
      }else{
        const rect=anchor.getBoundingClientRect();setFrame({left:rect.left,top:rect.top,width:rect.width,height:rect.height});
      }
    };
    measure();const observer=new ResizeObserver(measure);observer.observe(anchor);window.addEventListener('resize',measure);
    return()=>{observer.disconnect();window.removeEventListener('resize',measure);};
  },[editing]);
  return <div ref={stage} className={'persistent-world-stage'+(frame?' is-positioned':'')+(editing?' is-editing':'')} style={frame||{visibility:'hidden'}}><Scene {...sceneProps}/></div>;
}
