import {z} from 'zod';
import {ITEM_DEFINITIONS} from '../shared/life.mjs';
import {CROPS,RECIPES,GARDEN_BEDS} from '../shared/garden.mjs';

// Validated requests from the player's garden and kitchen controls.
export const lifeActionSchema=z.object({
  intent:z.enum(['PLANT_SEED','WATER_CROP','HARVEST_CROP','COOK_FOOD']),
  quantity:z.number().int().min(1).max(99).optional(),
  actor:z.literal('PLAYER').default('PLAYER'),
  crop:z.enum(CROPS.map(c=>c.id)).optional(),plot:z.enum(GARDEN_BEDS.map(p=>p.id)).optional(),
  recipe:z.enum(RECIPES.map(r=>r.id)).optional(),fish:z.array(z.enum(ITEM_DEFINITIONS.map(i=>i.itemId))).max(3).optional(),
  plantingId:z.string().uuid().optional(),
}).strict();
