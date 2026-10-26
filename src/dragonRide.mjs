import {createBabyDragon} from './dragonModels.mjs';
import {createRidePose,createMotorcycleRide} from './motorcycle.mjs';
import {DRAGON_FLIGHT_HEIGHT,DRAGON_SPEED,dragonMounted} from '../shared/dragonMount.mjs';

export function createDragonRide(avatar,color='#e8efff'){
  const dragon=createBabyDragon(color),root=avatar.parent;
  root.add(dragon.root);
  const pose=createRidePose(avatar,{seat:dragon.mountSeat,footY:.31,handY:1.14,spread:.44});
  let time=0;
  return {dragon,flight:true,speed:DRAGON_SPEED,height:DRAGON_FLIGHT_HEIGHT,update(dt,moving,riding=true,reduced=false){
    time+=dt;dragon.root.visible=riding;pose.update(riding);
    const bob=dragon.runMotion.update(time,moving,reduced);
    dragon.root.position.y=bob;
    if(riding)avatar.position.y+=bob;
  }};
}

export function createAvatarRide(avatar,look={}){
  return dragonMounted(look)?createDragonRide(avatar,look.petColor):look.ride==='motorcycle'?createMotorcycleRide(avatar,look.color):null;
}
