import {petFollowStep} from '../shared/petFollow.mjs';
import {z} from 'zod';

export function createPetRuntime({app,auth,clock,villageVisitors,companions,ensureCompanion,engaged,emitVillage,emitMove,logAction}){
  let last=clock();const receipts=new Map();
  function tick(){
    const now=clock(),dt=(now-last)/1000;last=now;
    const present=new Map();
    for(const [room,members] of villageVisitors)for(const [uid,player] of members)if(!present.has(uid)||room===uid)present.set(uid,{room,player});
    for(const [uid,{room,player}] of present){
      if(engaged(uid))continue;
      const created=!companions.has(uid),pet=ensureCompanion(uid),oldRoom=pet.villageId||uid,newRoom=oldRoom!==room;
      pet.villageId=room;
      if(newRoom){pet.x=player.x+.6;pet.z=player.z-.7;pet.velocity=0;emitVillage(oldRoom);}
      const reacting=pet.interaction&&now<pet.interaction.until;
      if(reacting){pet.moving=false;pet.activityState=pet.interaction.kind==='pet'?'Petted':'Snacking';}
      else {pet.interaction=null;Object.assign(pet,petFollowStep(pet,player,dt));}
      emitMove(room,pet);if(newRoom||created)emitVillage(room);
    }
    for(const [uid,pet] of companions)if(!present.has(uid)&&!engaged(uid)){companions.delete(uid);emitVillage(pet.villageId||uid);}
    for(const [key,r] of receipts)if(now-r.at>60000)receipts.delete(key);
  }
  app.post('/api/me/pet/interactions',auth,(req,res)=>{
    const {kind,requestId,villageId}=z.object({kind:z.enum(['pet','snack']),requestId:z.string().uuid(),villageId:z.string().uuid()}).strict().parse(req.body);
    const uid=req.user.id,previous=receipts.get(uid+':'+requestId);
    if(previous){if(previous.kind!==kind||previous.villageId!==villageId)return res.status(409).json({error:'같은 요청으로 다른 행동을 할 수 없어요.'});return res.json(previous.result);}
    const pet=companions.get(uid),player=villageVisitors.get(villageId)?.get(uid);
    if(!pet||!player||(pet.villageId||uid)!==villageId)return res.status(409).json({error:'펫과 같은 마을에서 시도해 주세요.'});
    if(engaged(uid))return res.status(409).json({error:'펫이 하던 일을 마치면 교감해 주세요.'});
    if(Math.hypot(pet.x-player.x,pet.z-player.z)>2.6)return res.status(409).json({error:'펫 가까이로 이동해 주세요.'});
    if(pet.interaction&&clock()<pet.interaction.until)return res.status(409).json({error:'펫이 반응하고 있어요. 잠시 기다려 주세요.'});
    pet.velocity=0;pet.interaction={kind,startedAt:clock(),until:clock()+3000};pet.moving=false;pet.activityState=kind==='pet'?'Petted':'Snacking';
    const result={ok:true,kind,reply:kind==='pet'?'살살 쓰다듬었어요. 펫이 기분 좋게 고개를 기울여요.':'무료 펫 간식을 건넸어요. 펫이 오물오물 먹어요.'};
    receipts.set(uid+':'+requestId,{at:clock(),kind,villageId,result});logAction(uid,'pet_interaction',{kind,villageId});emitMove(villageId,pet);emitVillage(villageId);res.json(result);
  });
  return {tick};
}
