import {villageScenery} from './scenery.mjs';

export const BENCH_REACH=1.45;
// Seat tops and local facing match the actual meshes, including the built-in rotation.
export function villageBenches(village={}){
  const scenery=villageScenery(village).filter(item=>/^scenery:bench-\d+$/.test(item.id));
  return [...scenery,...(village.items||[]).filter(item=>item.type==='bench')].filter(item=>!item.hidden).map(item=>{
    const builtIn=item.type==='scenery';
    return {id:item.id,x:item.x,z:item.z,height:builtIn?.47:.68,rotation:(item.rotation||0)*Math.PI/2+(builtIn?(item.id.endsWith('-0')?.5:-.5):0)};
  });
}
export function nearestBench(benches,position,members=[],viewerId){
  let nearest=null,distance=BENCH_REACH;
  for(const bench of benches){
    if(members.some(member=>member.userId!==viewerId&&member.seatId===bench.id))continue;
    const next=Math.hypot(bench.x-position.x,bench.z-position.z);
    if(next<=distance){nearest=bench;distance=next;}
  }
  return nearest;
}
export function benchExit(bench){
  const x=bench.x+Math.sin(bench.rotation)*.95,z=bench.z+Math.cos(bench.rotation)*.95;
  const factor=Math.min(1,5.8/Math.hypot(x,z));
  return {x:x*factor,z:z*factor};
}
export function benchCameraView(bench){
  const angle=bench.rotation+.38;
  return {position:[bench.x+Math.sin(angle)*6.2,bench.height+2.8,bench.z+Math.cos(angle)*6.2],target:[bench.x,bench.height+.9,bench.z]};
}
export function benchInteractionKey(event){
  if(event.repeat||event.defaultPrevented||event.isComposing||event.ctrlKey||event.metaKey||event.altKey)return false;
  if(event.target?.isContentEditable||event.target?.closest?.('input,textarea,select,[role="textbox"]'))return false;
  return event.code==='KeyC'||(!event.code&&event.key?.toLowerCase()==='c');
}
