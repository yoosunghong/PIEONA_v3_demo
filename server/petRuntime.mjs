import {petWanderStep} from '../shared/petWander.mjs';
import {WALK_RADIUS} from '../shared/villageSize.mjs';
import {z} from 'zod';

export function createPetRuntime({app,auth,clock,villageVisitors,pets,ensurePet,emitVillage,emitMove,logAction,dragonState=()=>null,random=Math.random}){
  let last=clock();const receipts=new Map();
  function tick(){
    const now=clock(),dt=(now-last)/1000;last=now;
    const present=new Map();
    for(const [room,members] of villageVisitors){
      if(!members.size)continue;
      // The owner's resident pet remains here while visitors are in the village.
      present.set(`resident:${room}`,{uid:room,room,player:members.get(room)||null});
      for(const [uid,player] of members)if(uid!==room&&(!present.has(uid)))present.set(uid,{uid,room,player});
    }
    for(const [key,value] of [...present]){
      const state=dragonState(value.uid);
      if(state?.available&&!state.riding)present.set(`mount:${key}`,{...value,mount:true});
    }
    for(const [key,{uid,room,player,mount}] of present){
      const created=!pets.has(key),pet=ensurePet(uid,key,room),oldRoom=pet.villageId||uid,newRoom=oldRoom!==room;
      if(mount){pet.actorKind='MOUNT';pet.userId=`mount:${uid}`;}
      if(mount&&created&&player){pet.x=player.x+.6;pet.z=player.z-.7;pet.nextWander=now+12000;}
      pet.villageId=room;
      if(newRoom){pet.x=player.x+.6;pet.z=player.z-.7;pet.destination=null;emitVillage(oldRoom);}
      const reacting=pet.interaction&&now<pet.interaction.until;
      if(reacting){pet.moving=false;pet.activityState='Petted';}
      else {
        pet.interaction=null;
        if(!pet.destination&&now>=(pet.nextWander||0)){
          const angle=random()*Math.PI*2,radius=1+random()*(WALK_RADIUS-2);
          pet.destination={x:Math.cos(angle)*radius,z:Math.sin(angle)*radius};pet.nextWander=now+5000+random()*6000;
        }
        Object.assign(pet,petWanderStep(pet,dt));
      }
      emitMove(room,pet);if(newRoom||created)emitVillage(room);
    }
    for(const [uid,pet] of pets)if(!present.has(uid)){pets.delete(uid);emitVillage(pet.villageId||uid);}
    for(const [key,r] of receipts)if(now-r.at>60000)receipts.delete(key);
  }
  app.post('/api/me/pet/interactions',auth,(req,res)=>{
    const {kind,requestId,villageId}=z.object({kind:z.enum(['pet','call']),requestId:z.string().uuid(),villageId:z.string().uuid()}).strict().parse(req.body);
    const uid=req.user.id,previous=receipts.get(uid+':'+requestId);
    if(previous){if(previous.kind!==kind||previous.villageId!==villageId)return res.status(409).json({error:'같은 요청으로 다른 행동을 할 수 없어요.'});return res.json(previous.result);}
    const pet=[...pets.values()].find(p=>p.ownerId===uid&&p.villageId===villageId),player=villageVisitors.get(villageId)?.get(uid);
    if(!pet||!player||(pet.villageId||uid)!==villageId)return res.status(409).json({error:'펫과 같은 마을에서 시도해 주세요.'});
    if(kind==='pet'&&Math.hypot(pet.x-player.x,pet.z-player.z)>2.6)return res.status(409).json({error:'펫 가까이로 이동해 주세요.'});
    if(pet.interaction&&clock()<pet.interaction.until)return res.status(409).json({error:'펫이 반응하고 있어요. 잠시 기다려 주세요.'});
    if(kind==='pet'){pet.interaction={kind,startedAt:clock(),until:clock()+3000};pet.moving=false;pet.activityState='Petted';}
    else{const radius=Math.hypot(player.x,player.z),scale=radius>WALK_RADIUS-1?(WALK_RADIUS-1)/radius:1;pet.destination={x:player.x*scale+.4,z:player.z*scale};pet.nextWander=clock()+8000;}
    const result={ok:true,kind,reply:kind==='pet'?'살살 쓰다듬었어요. 펫이 기분 좋게 고개를 기울여요.':'펫을 불렀어요. 내 쪽으로 다가와요.'};
    receipts.set(uid+':'+requestId,{at:clock(),kind,villageId,result});logAction(uid,'pet_interaction',{kind,villageId});emitMove(villageId,pet);emitVillage(villageId);res.json(result);
  });
  return {tick};
}
