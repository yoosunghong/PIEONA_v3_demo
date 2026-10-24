import test from 'node:test';
import assert from 'node:assert/strict';
import {Box3,Vector3} from 'three';
import {createCompanionPet} from '../src/companionPet.mjs';
import {petTypes,petColors,petAppearance,defaultPetAppearance} from '../shared/pets.mjs';
import {sceneView} from '../src/sceneCamera.mjs';

test('legacy looks have a default pet and invalid cosmetic values cannot reach the model',()=>{
  assert.deepEqual(petAppearance({character:'pio'}),defaultPetAppearance);
  assert.deepEqual(petAppearance({petType:'unknown',petColor:'invalid'}),defaultPetAppearance);
});
test('pet variants keep their intended scale and recognizable species features',()=>{
  for(const {id:petType} of petTypes)for(const {id:petColor} of petColors){
    const pet=createCompanionPet({petType,petColor});
    const size=new Box3().setFromObject(pet.root).getSize(new Vector3());
    const scale=petType==='babyDragon'?5:1;
    assert.ok(size.y<1.2*scale&&size.x<(petType==='babyDragon'?1:.6)*scale&&size.z<1*scale,`${petType}: ${size.toArray()}`);
    assert.equal(pet.root.getObjectByName('coat').material.color.getHexString(),petColor.slice(1));
    assert.ok(pet.root.getObjectByName(petType==='babyDragon'?'dragon wing':petType==='dog'?'floppy ear':petType==='cat'?'pointed ear':'long ear'));
    for(let i=0;i<120;i++){pet.runMotion.update(i/60,true);pet.sitMotion.update(1/60,i<60,.58);}
    pet.root.traverse(node=>assert.ok([...node.position,...node.rotation.toArray().slice(0,3)].every(Number.isFinite)));
    pet.runMotion.update(1,true,true);assert.equal(pet.sitMotion.update(0,false,.58,true),0);
    assert.equal(pet.sitMotion.active,false);
  }
});
test('pet preview camera frames the small pet without changing player portrait framing',()=>{
  assert.deepEqual(sceneView('home',{portrait:true}).target,[0,1.65,0]);
  assert.deepEqual(sceneView('home',{portrait:true,petPreview:true}).target,[0,.9,0]);
});

