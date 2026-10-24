import {cookingInputs,COOK_TIME_MS} from '../shared/cooking.mjs';
import {villageLife} from '../shared/lifeLayout.mjs';
import {id} from './store.mjs';
import {CROPS,RECIPES,GARDEN_BEDS,cropState} from '../shared/garden.mjs';
import {ALL_ITEMS,ITEM_DEFINITIONS} from '../shared/life.mjs';

const fail=message=>{throw Object.assign(new Error(message),{status:409});};
const describe=items=>items.map(i=>{const d=ALL_ITEMS.find(d=>d.itemId===i.itemId);return `${d.name} ${i.quantity}${d.unit}`;}).join(', ');
export function createGardening(store,clock,{recover=true}={}){
  store.db.exec(`CREATE TABLE IF NOT EXISTS garden_plots(owner_id TEXT NOT NULL REFERENCES users(id),plot_id TEXT NOT NULL,crop_id TEXT,planted_at INTEGER,ready_at INTEGER,planting_id TEXT,planted_by TEXT,PRIMARY KEY(owner_id,plot_id));
    CREATE TABLE IF NOT EXISTS life_operations(id TEXT PRIMARY KEY,owner_id TEXT NOT NULL REFERENCES users(id),request_id TEXT NOT NULL,actor TEXT NOT NULL,actor_name TEXT NOT NULL,avatar_slot TEXT,intent TEXT NOT NULL,input TEXT NOT NULL,plan TEXT NOT NULL,status TEXT NOT NULL,started_at INTEGER NOT NULL,completed_at INTEGER,result TEXT,UNIQUE(owner_id,request_id));
    CREATE UNIQUE INDEX IF NOT EXISTS life_pending_operation ON life_operations(owner_id,actor) WHERE status='pending';
    CREATE TABLE IF NOT EXISTS garden_reservations(owner_id TEXT NOT NULL,plot_id TEXT NOT NULL,operation_id TEXT NOT NULL REFERENCES life_operations(id),PRIMARY KEY(owner_id,plot_id));
    CREATE TABLE IF NOT EXISTS inventory_changes(id TEXT PRIMARY KEY,operation_id TEXT NOT NULL REFERENCES life_operations(id),owner_id TEXT NOT NULL REFERENCES users(id),item_id TEXT NOT NULL,quantity INTEGER NOT NULL,timestamp INTEGER NOT NULL,UNIQUE(operation_id,item_id));`);
  if(recover)store.transaction(()=>{store.run("UPDATE life_operations SET status='cancelled',completed_at=?,result=? WHERE status='pending'",clock(),JSON.stringify({ok:false,reply:'서버가 다시 시작되어 작업을 중단했어. 재료는 사용하지 않았어.'}));store.run('DELETE FROM garden_reservations');});
  const inventory=uid=>store.all('SELECT item_id AS itemId,quantity FROM inventory_entries WHERE owner_id=? AND quantity>0',uid);
  function plots(uid){return GARDEN_BEDS.map(b=>{const p=store.one('SELECT crop_id AS cropId,planted_at AS plantedAt,ready_at AS readyAt,planting_id AS plantingId,planted_by AS plantedBy FROM garden_plots WHERE owner_id=? AND plot_id=?',uid,b.id)||{cropId:null};return {id:b.id,...p,state:cropState(p,clock()),reserved:!!store.one('SELECT 1 FROM garden_reservations WHERE owner_id=? AND plot_id=?',uid,b.id)};});}
  function recipePlan(uid,action){
    const recipe=RECIPES.find(r=>r.id===action.recipe);if(!recipe)fail('만들 요리를 골라 줘. 생선구이, 허브 생선구이, 해산물 모둠, 토마토 샐러드를 만들 수 있어.');
    const bag=new Map(inventory(uid).map(i=>[i.itemId,i.quantity]));let selected=action.fish||[];
    if(recipe.fishCount){
      if(!selected.length){
        // Never spend rare/special fish implicitly. Explicit fish selection may use them.
        const common=ITEM_DEFINITIONS.filter(i=>['common','uncommon'].includes(i.rarity)&&(bag.get(i.itemId)||0)>0);
        selected=recipe.distinctFish?common.slice(0,recipe.fishCount).map(i=>i.itemId):common.slice(0,1).map(i=>i.itemId);
      }
      if(selected.length!==recipe.fishCount||recipe.distinctFish&&new Set(selected).size!==recipe.fishCount)fail(recipe.distinctFish?'서로 다른 물고기 3종이 필요해. 희귀·특별 물고기는 요리 화면에서 직접 골라 줘.':'사용할 물고기 1마리가 필요해. 희귀·특별 물고기는 요리 화면에서 직접 골라 줘.');
    }else if(selected.length)fail('이 요리에는 물고기를 사용하지 않아.');
    const quantity=action.quantity||1,inputs=cookingInputs(recipe,selected,quantity);
    for(const input of inputs)if((bag.get(input.itemId)||0)<input.quantity)fail(`${ALL_ITEMS.find(i=>i.itemId===input.itemId).name} 재료가 부족해.`);
    return {recipeId:recipe.id,inputs,outputs:[{itemId:recipe.id,quantity}],durationMs:COOK_TIME_MS*quantity,target:villageLife(JSON.parse(store.one('SELECT village FROM users WHERE id=?',uid).village)).kitchen.approach};
  }
  function plan(uid,action){
    if(action.intent==='COOK_FOOD')return recipePlan(uid,action);
    const all=plots(uid);
    if(action.intent==='PLANT_SEED'){
      const crop=CROPS.find(c=>c.id===action.crop);if(!crop)fail('허브, 토마토, 꽃 중 심을 씨앗을 알려 줘. 씨앗은 무료야.');
      const plot=action.plot?all.find(p=>p.id===action.plot):all.find(p=>p.state==='Empty'&&!p.reserved);
      if(!plot||plot.state!=='Empty'||plot.reserved)fail('비어 있는 텃밭이 없어. 수확하거나 진행 중인 작업을 마친 뒤 심어 줘.');
      return {cropId:crop.id,plots:[{id:plot.id,plantingId:null}],inputs:[],outputs:[],target:villageLife(JSON.parse(store.one('SELECT village FROM users WHERE id=?',uid).village)).beds.find(b=>b.id===plot.id).approach};
    }
    if(action.intent!=='HARVEST_CROP')fail('지원하지 않는 텃밭 작업이야.');
    const selected=all.filter(p=>(!action.plot||p.id===action.plot)&&(!action.crop||p.cropId===action.crop)&&p.state==='Ready'&&!p.reserved);
    if(!selected.length)fail('지금 수확할 수 있는 작물이 없어. 아직 자라는 중이거나 다른 작업이 진행 중이야.');
    if(action.plantingId&&selected[0].plantingId!==action.plantingId)fail('작물이 바뀌었어. 텃밭을 새로 확인해 줘.');
    const sums=new Map();for(const p of selected)sums.set(p.cropId,(sums.get(p.cropId)||0)+1);
    return {plots:selected.map(p=>({id:p.id,plantingId:p.plantingId})),inputs:[],outputs:[...sums].map(([itemId,quantity])=>({itemId,quantity})),target:villageLife(JSON.parse(store.one('SELECT village FROM users WHERE id=?',uid).village)).beds.find(b=>b.id===selected[0].id).approach};
  }
  function find(uid,key){return store.one('SELECT * FROM life_operations WHERE owner_id=? AND request_id=?',uid,key);}
  function existing(uid,key,action,actor){const op=find(uid,key);if(op&&(op.input!==JSON.stringify(action)||op.actor!==actor))fail('같은 요청 번호로 다른 작업을 실행할 수 없어.');return op;}
  function prepare(uid,key,action,actor){
    const duplicate=existing(uid,key,action,actor);if(duplicate)return duplicate;
    let op;
    store.transaction(()=>{
      if(store.one("SELECT 1 FROM life_operations WHERE owner_id=? AND actor=? AND status='pending'",uid,actor))fail('진행 중인 생활 작업을 마치거나 중단해 줘.');
      const planned=plan(uid,action),user=store.one('SELECT nickname,active_slot FROM users WHERE id=?',uid),sid=id();
      store.run("INSERT INTO life_operations(id,owner_id,request_id,actor,actor_name,avatar_slot,intent,input,plan,status,started_at) VALUES(?,?,?,?,?,?,?,?,?,'pending',?)",sid,uid,key,actor,user.nickname,user.active_slot,action.intent,JSON.stringify(action),JSON.stringify(planned),clock());
      for(const plot of planned.plots||[])store.run('INSERT INTO garden_reservations VALUES(?,?,?)',uid,plot.id,sid);
      op=find(uid,key);
    });return op;
  }
  function cancel(op,reply='작업을 중단했어. 재료는 사용하지 않았어.'){
    store.transaction(()=>{store.run("UPDATE life_operations SET status='cancelled',completed_at=?,result=? WHERE id=? AND status='pending'",clock(),JSON.stringify({ok:false,reply}),op.id);store.run('DELETE FROM garden_reservations WHERE operation_id=?',op.id);});
  }
  function complete(op){
    const current=store.one('SELECT * FROM life_operations WHERE id=?',op.id);if(current.status!=='pending')return JSON.parse(current.result);
    const planned=JSON.parse(current.plan),uid=current.owner_id;let result;
    try{store.transaction(()=>{
      if(current.intent==='PLANT_SEED'){
        const p=planned.plots[0],crop=CROPS.find(c=>c.id===planned.cropId),prior=store.one('SELECT crop_id FROM garden_plots WHERE owner_id=? AND plot_id=?',uid,p.id);
        if(prior?.crop_id)fail('그 텃밭에는 이미 작물이 있어.');
        store.run('INSERT INTO garden_plots VALUES(?,?,?,?,?,?,?) ON CONFLICT(owner_id,plot_id) DO UPDATE SET crop_id=excluded.crop_id,planted_at=excluded.planted_at,ready_at=excluded.ready_at,planting_id=excluded.planting_id,planted_by=excluded.planted_by',uid,p.id,crop.id,clock(),clock()+crop.growMs,id(),current.actor_name);
        result={ok:true,reply:`${Number(p.id.split(':')[1])+1}번 텃밭에 ${crop.name} 씨앗을 심었어. ${crop.growMs/60000}분 뒤 수확할 수 있어.`,items:[]};
      }else{
        for(const p of planned.plots||[]){const changed=store.run('UPDATE garden_plots SET crop_id=NULL,planted_at=NULL,ready_at=NULL,planting_id=NULL,planted_by=NULL WHERE owner_id=? AND plot_id=? AND planting_id=? AND ready_at<=?',uid,p.id,p.plantingId,clock());if(!changed.changes)fail('수확할 작물 상태가 바뀌었어. 다시 확인해 줘.');}
        for(const input of planned.inputs){const changed=store.run('UPDATE inventory_entries SET quantity=quantity-? WHERE owner_id=? AND item_id=? AND quantity>=?',input.quantity,uid,input.itemId,input.quantity);if(!changed.changes)fail('작업하는 동안 재료가 부족해졌어. 재료를 확인하고 다시 시도해 주세요.');}
        for(const output of planned.outputs)store.run('INSERT INTO inventory_entries VALUES(?,?,?) ON CONFLICT(owner_id,item_id) DO UPDATE SET quantity=quantity+excluded.quantity',uid,output.itemId,output.quantity);
        for(const item of [...planned.inputs.map(i=>({...i,quantity:-i.quantity})),...planned.outputs])store.run('INSERT INTO inventory_changes VALUES(?,?,?,?,?,?)',id(),current.id,uid,item.itemId,item.quantity,clock());
        result={ok:true,reply:current.intent==='COOK_FOOD'?`${describe(planned.inputs)}를 사용해서 ${describe(planned.outputs)}를 만들었어. 보관함에 넣었어.`:`${describe(planned.outputs)}를 수확해서 보관함에 넣었어.`,items:planned.outputs,consumed:planned.inputs};
      }
      store.run("UPDATE life_operations SET status='completed',completed_at=?,result=? WHERE id=?",clock(),JSON.stringify(result),current.id);store.run('DELETE FROM garden_reservations WHERE operation_id=?',current.id);
    });}catch(e){if(!e.status)throw e;result={ok:false,reply:e.message};store.transaction(()=>{store.run("UPDATE life_operations SET status='failed',completed_at=?,result=? WHERE id=?",clock(),JSON.stringify(result),current.id);store.run('DELETE FROM garden_reservations WHERE operation_id=?',current.id);});}
    return result;
  }
  function snapshot(uid){const last=store.one("SELECT intent,actor,actor_name AS actorName,completed_at AS completedAt,result FROM life_operations WHERE owner_id=? AND status IN ('completed','failed','cancelled') ORDER BY completed_at DESC,rowid DESC LIMIT 1",uid);return {plots:plots(uid),crops:CROPS,recipes:RECIPES,lastResult:last?{...last,result:JSON.parse(last.result)}:null};}
  return {plots,snapshot,plan,prepare,existing,complete,cancel};
}
