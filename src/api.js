export async function api(path,options={}){
  const response=await fetch('/api'+path,{credentials:'same-origin',...options,headers:{'Content-Type':'application/json',...options.headers},body:options.body===undefined?undefined:JSON.stringify(options.body)});
  const result=await response.json();if(!response.ok){const error=new Error(result.error||'연결을 확인해 주세요.');error.status=response.status;throw error;}return result;
}
export const stageNames=['새싹 준비 중','첫 성향이 피어남','나를 알아가는 중','나를 닮아가는 중','개성이 활짝 핌'];
export const themes={sage:{name:'구름 정원',color:'#88b5d7'},rose:{name:'벚꽃 정원',color:'#cf9ab8'},ocean:{name:'달빛 정원',color:'#88badd'},sunset:{name:'노을 정원',color:'#c5a47d'}};
export const dateLabel=date=>new Date(date).toLocaleString('ko-KR',{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'});
