import {z} from 'zod';

export const EXPRESSIONS=['happy','curious','calm','thinking','excited'];
export const EMOTIONS=['neutral','happy','sad','angry','tired','excited'];
const entry=(id,trigger,preconditions,variables,outcome,action)=>({id,trigger,source:'server/life.mjs',preconditions,variables,outcome,action,active:true,runtimeState:'PLAYER life activity; owner avatar reacts privately',variants:3,output:'PersonaDialogue owner avatar bubble',reachability:'bound; verification is recorded separately'});
export const EVENT_REGISTRY=[
 entry('fishing.start','insertSession',['authenticated village member','reachable free fishing seat'],[],'start','Walk to a fishing seat and press E'),
 entry('fishing.result.success','settle',['active fishing session','45 seconds elapsed','common or uncommon catch'],['fishName'],'success','Keep fishing until a common or uncommon catch'),
 entry('fishing.result.failure','settle',['active fishing session','45 seconds elapsed','catch roll failed'],[],'failure','Keep fishing until an unsuccessful attempt'),
 entry('fishing.result.rare','settle',['active fishing session','45 seconds elapsed','rare or legendary catch'],['fishName'],'rare','Keep fishing until a rare or legendary catch'),
 entry('garden.plant.complete','tick/gardening.complete',['own village member','plant operation completed'],[],'plant','Use the garden seed control and finish the activity'),
 entry('garden.harvest.complete','tick/gardening.complete',['own village member','mature crop','harvest operation completed'],[],'harvest','Wait for a planted crop to mature and harvest it'),
 entry('cooking.complete','tick/gardening.complete',['own village member','recipe ingredients available','cook operation completed'],[],'cook','Use the kitchen recipe control and finish cooking'),
 ...['request.follow.accept','request.follow.reject','request.follow.start','request.gathering.accept','request.gathering.reject','request.gathering.working','request.mining.accept','request.mining.reject','request.mining.working','request.logging.accept','request.logging.reject','request.logging.working','request.fishing.accept','request.fishing.reject','request.fishing.working','request.rest.accept','request.rest.reject','emotion.affection.positive','emotion.affection.neutral','emotion.anger.mild','emotion.anger.strong','emotion.sadness.mild','emotion.sadness.strong','emotion.fatigue.mild','emotion.fatigue.exhausted','reaction.task.success','reaction.task.failure','reaction.discovery.common','reaction.discovery.rare','social.visit.greeting','social.visit.farewell','social.avatar.propose','social.avatar.accept','social.avatar.reject'].map(id=>({id,active:false,trigger:null,source:null,preconditions:[],variables:[],runtimeState:null,variants:0,output:null,reachability:'unsupported',reason:id.startsWith('request.')?'AI task execution is disabled; player activities do not constitute avatar acceptance':id.startsWith('emotion.')?'No normal avatar emotion state transition producer is implemented':'No PSS binding for this gameplay path'}))
];
export const ACTIVE_EVENTS=EVENT_REGISTRY.filter(e=>e.active);
export const TRAITS=['sociability','kindness','curiosity','playfulness','sensitivity','activity'];
export const personaSchema=z.object({...Object.fromEntries(TRAITS.map(k=>[k,z.number().min(0).max(1)])),speechStyle:z.string().trim().min(1).max(160),preferences:z.array(z.string().trim().min(1).max(80)).max(8)}).strict();
export const proposalSchema=z.object({persona:personaSchema,summary:z.string().trim().min(1).max(600),evidenceIds:z.array(z.string().min(1)).min(1).max(20)}).strict();
const variantSchema=z.object({id:z.string().regex(/^[a-z0-9._-]{1,100}$/),text:z.string().trim().min(1).max(100),expression:z.enum(EXPRESSIONS),outcome:z.string(),mood:z.enum(['any',...EMOTIONS]),affinity:z.enum(['any','familiar','trusted'])}).strict();
const scriptsSchema=z.object({events:z.array(z.object({eventId:z.string(),variants:z.array(variantSchema).length(3)}).strict()).length(ACTIVE_EVENTS.length)}).strict();
export function validateScripts(raw){
 const data=scriptsSchema.parse(raw),ids=new Set(),events=new Set();
 for(const group of data.events){
  const event=ACTIVE_EVENTS.find(e=>e.id===group.eventId);
  if(!event||events.has(group.eventId))throw new Error('PSS_EVENT_INVALID');events.add(group.eventId);
  if(new Set(group.variants.map(v=>v.text)).size!==3)throw new Error('PSS_DUPLICATE_TEXT');
  for(const v of group.variants){
   if(ids.has(v.id))throw new Error('PSS_DUPLICATE_VARIANT');ids.add(v.id);
   if(v.outcome!==event.outcome)throw new Error('PSS_OUTCOME_INVALID');
   const stripped=v.text.replace(/\{([a-zA-Z][a-zA-Z0-9]*)\}/g,(_,key)=>{if(!event.variables.includes(key))throw new Error('PSS_PLACEHOLDER_INVALID');return '';});
   if(/[{}<>\u0000-\u001f]/.test(stripped))throw new Error('PSS_TEXT_INVALID');
   if(event.outcome==='failure'&&/잡았|성공했|획득했|caught|succeeded/i.test(v.text)||['success','rare'].includes(event.outcome)&&/못\s*잡|실패|놓쳤|failed|did not catch/i.test(v.text))throw new Error('PSS_SEMANTIC_CONTRADICTION');
   renderVariant(v,event,Object.fromEntries(event.variables.map(key=>[key,'가'.repeat(24)])));
  }
 }
 return data;
}
export function renderVariant(variant,event,context){
 if(!context||Object.keys(context).some(k=>!event.variables.includes(k)))throw new Error('PSS_CONTEXT_INVALID');
 for(const key of event.variables)if(typeof context[key]!=='string'||!context[key].trim()||context[key].length>24||/[{}<>\u0000-\u001f]/.test(context[key]))throw new Error('PSS_CONTEXT_INVALID');
 const text=variant.text.replace(/\{(\w+)\}/g,(_,key)=>context[key]);
 if(text.length>160)throw new Error('PSS_RENDER_TOO_LONG');return text;
}
// Soft preferences order each fair bag. Nothing has zero weight or permanent exclusion.
export function selectVariant(variants,history={remaining:[],last:null},emotion='neutral',relationship={}){
 let remaining=history.remaining.filter(id=>variants.some(v=>v.id===id));
 if(!remaining.length){remaining=[...variants].sort((a,b)=>{
  const score=v=>(v.mood===emotion?2:0)+(v.affinity==='trusted'&&relationship.trust>=.6||v.affinity==='familiar'&&relationship.familiarity>=.3?1:0);
  return score(b)-score(a)||a.id.localeCompare(b.id);
 }).map(v=>v.id);if(remaining[0]===history.last)remaining.push(remaining.shift());}
 const id=remaining.shift(),selected=variants.find(v=>v.id===id);return {selected,history:{remaining,last:selected.id}};
}
