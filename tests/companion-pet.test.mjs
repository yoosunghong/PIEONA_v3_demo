import test from 'node:test';
import assert from 'node:assert/strict';
import {Box3,Vector3} from 'three';
import {createCompanionPet} from '../src/companionPet.mjs';
import {petTypes,petColors,petAppearance,defaultPetAppearance} from '../shared/pets.mjs';
import {sceneView} from '../src/sceneCamera.mjs';

test('legacy looks have a default pet and invalid cosmetic values cannot reach the model',()=>{
  assert.deepEqual(petAppearance({character:'pio'}),defaultPetAppearance);
  assert.deepEqual(petAppearance({petType:'unknown',petColor:'invalid'}),defaultPetAppearance);
  assert.equal(petAppearance({petType:'rabbit'}).petType,'dog');
  assert.ok(!petTypes.some(p=>p.id==='rabbit'));
});
test('imported pets preserve original rigs, bounded scale and independent animation',()=>{
  for(const {id:petType} of petTypes)for(const {id:petColor} of petColors){
    const pet=createCompanionPet({petType,petColor});
    const size=new Box3().setFromObject(pet.root).getSize(new Vector3());
    const scale=petType==='babyDragon'?5:1;
    assert.ok(size.y<1.2*scale&&size.x<(petType==='babyDragon'?1:1.1)*scale&&size.z<1.1*scale,`${petType}: ${size.toArray()}`);
    assert.equal(pet.root.getObjectByName('coat').material.color.getHexString(),petColor.slice(1));
    const coat=pet.root.getObjectByName('coat');
    assert.ok(coat.isSkinnedMesh);
    assert.equal(coat.skeleton.bones.length,petType==='babyDragon'?47:27);
    const bone=pet.rig[petType==='babyDragon'?'Bone_025':'frontleg'];
    const before=bone.quaternion.clone();pet.runMotion.update(.3,true);
    assert.ok(before.angleTo(bone.quaternion)>.001,petType+' authored animation');
    const other=createCompanionPet({petType,petColor});
    assert.notEqual(other.root.getObjectByName('coat').skeleton,coat.skeleton);
    pet.runMotion.update(.6,true);assert.ok(other.rig[bone.name].quaternion.angleTo(bone.quaternion)>.001);
    for(let i=0;i<120;i++){pet.runMotion.update(i/60,true);pet.sitMotion.update(1/60,i<60,.58);}
    pet.root.traverse(node=>assert.ok([...node.position,...node.rotation.toArray().slice(0,3)].every(Number.isFinite)));
    pet.runMotion.update(1,true,true);assert.equal(pet.sitMotion.update(0,false,.58,true),0);
    assert.equal(pet.sitMotion.active,false);
  }
});
test('walking clips stay in place and idle/reduced motion freeze the rig',()=>{
  for(const petType of ['dog','cat','babyDragon']){
    const pet=createCompanionPet({petType}),bone=pet.rig[petType==='babyDragon'?'Bone_025':'frontleg'];
    pet.runMotion.update(.2,true,true);const rest=bone.quaternion.clone();
    pet.runMotion.update(.8,true,true);assert.deepEqual(rest.toArray(),bone.quaternion.toArray());
    if(petType!=='babyDragon'){
      pet.runMotion.update(.3,true);pet.runMotion.update(.3,false);assert.deepEqual(rest.toArray(),bone.quaternion.toArray());
      const hips=pet.rig.Hips;pet.runMotion.update(0,true);const start=hips.position.clone();
      pet.runMotion.update(50,true);assert.ok(hips.position.distanceTo(start)<.1);
    }
    pet.setInteraction({kind:'pet',until:Date.now()+10000});pet.runMotion.update(1,false);
    assert.equal(pet.root.getObjectByName('affection').visible,true);
  }
});
test('pet preview camera frames the small pet without changing player portrait framing',()=>{
  assert.deepEqual(sceneView('home',{portrait:true}).target,[0,1.65,0]);
  assert.deepEqual(sceneView('home',{portrait:true,petPreview:true}).target,[0,.9,0]);
});

