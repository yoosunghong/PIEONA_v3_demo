import {GARDEN_BEDS,KITCHEN} from './garden.mjs';
import {WALK_RADIUS} from './villageSize.mjs';

export const STORAGE={id:'storage',x:-1.75,z:4.65};
export const FISHING_ANCHORS=[-1.35,-.45,.45,1.35].map((x,i)=>({id:`fishing:${i}`,x,z:6.3,height:.58,rotation:0}));
export const lifeDefinitions=[
  {id:'life-storage',name:'보관함',x:STORAGE.x,z:STORAGE.z,action:STORAGE.id},
  ...GARDEN_BEDS.map((bed,i)=>({id:`life-garden-${i}`,name:`텃밭 ${i+1}`,x:bed.x,z:bed.z,action:bed.id})),
  {id:'life-kitchen',name:'요리대',x:KITCHEN.x,z:KITCHEN.z,action:KITCHEN.id},
  {id:'life-fishing',name:'낚시터',x:0,z:6.3,action:'fishing'},
];
export const isLifeScenery=id=>lifeDefinitions.some(def=>id===def.id||id==='scenery:'+def.id);
export function villageLife(village={}){
  function transform(object,id){
    const def=lifeDefinitions.find(def=>def.id===id),saved=village.scenery?.find(item=>item.id===id);
    const rotation=(saved?.rotation||0)*Math.PI/2,c=Math.cos(rotation),s=Math.sin(rotation);
    const point=p=>({x:(saved?.x??def.x)+(p.x-def.x)*c+(p.z-def.z)*s,z:(saved?.z??def.z)-(p.x-def.x)*s+(p.z-def.z)*c});
    return {...object,...point(object),rotation:(object.rotation||0)+rotation,...(object.approach?{approach:point(object.approach)}:{})};
  }
  return {storage:transform(STORAGE,'life-storage'),beds:GARDEN_BEDS.map((bed,i)=>transform(bed,`life-garden-${i}`)),kitchen:transform(KITCHEN,'life-kitchen'),anchors:FISHING_ANCHORS.map(anchor=>({...transform(anchor,'life-fishing'),approach:transform({...anchor,z:5.1},'life-fishing')}))};
}
export function lifeInteractionObjects(village={}){const {storage,beds,kitchen,anchors}=villageLife(village);return [storage,...beds,kitchen,...anchors];}

export function lifeFootprint(village={},id=null){
  const {storage,beds,kitchen,anchors}=villageLife(village);
  return [
    [storage,'scenery:life-storage',.75],
    [kitchen,'scenery:life-kitchen',.9],
    ...beds.map((bed,i)=>[bed,`scenery:life-garden-${i}`,.8]),
    ...anchors.map(anchor=>[anchor,'scenery:life-fishing',.6]),
  ].filter(([,key])=>!id||key===id).flatMap(([point,key,radius])=>[
    {...point,id:key,radius},...(point.approach?[{...point.approach,id:key,radius:.6}]:[]),
  ]);
}
export function validLifePlacement(village,id,objects=[]){
  return lifeFootprint(village,id).every(point=>{
    const distance=Math.hypot(point.x,point.z);
    return distance<=WALK_RADIUS&&distance>=2.85&&!objects.some(other=>other.id!==id&&!other.hidden&&Math.hypot(other.x-point.x,other.z-point.z)<point.radius);
  });
}
