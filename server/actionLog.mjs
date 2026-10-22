// Log event metadata only. Never serialize request bodies, chat/memory text,
// passwords, cookies, survey answers or arbitrary caller-provided fields.
const fields=new Set(['actor','intent','itemId','quantity','attempts','caught','operationId','sessionId','villageId','kind','score','gold','enabled','offline','recipe','reportId','fishAttempts','harvests','cooks','ok','provider']);
export function createActionLogger(write=line=>console.log(line),clock=Date.now){
  return (playerId,action,detail={})=>{
    const data={time:new Date(clock()).toISOString(),player:playerId||'anonymous',action};
    for(const [key,value] of Object.entries(detail))if(fields.has(key)&&(value===null||typeof value==='boolean'||typeof value==='number'&&Number.isFinite(value)||typeof value==='string'))data[key]=typeof value==='string'?value.slice(0,100):value;
    // Operational logging must never break a gameplay transaction.
    try{write(`[action] ${JSON.stringify(data)}`);}catch{}
  };
}
