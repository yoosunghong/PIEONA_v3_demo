import {petAppearance} from '../shared/pets.mjs';
import {createImportedPet} from './importedPet.mjs';

export function createCompanionPet(appearance={}){
  const {petType,petColor}=petAppearance(appearance);
  return createImportedPet(petType,petColor);
}
