export async function api(path,options={}){
  const response=await fetch('/api'+path,{credentials:'same-origin',...options,headers:{'Content-Type':'application/json',...options.headers},body:options.body===undefined?undefined:JSON.stringify(options.body)});
  const result=await response.json();if(!response.ok){const error=new Error(result.error||'연결을 확인해 주세요.');error.status=response.status;throw error;}return result;
}
export const levelLabel=user=>user?.level==null?'아바타 레벨 비공개':`Lv. ${user.level}`;
export const themes={sage:{name:'구름 정원',color:'#88b5d7'},rose:{name:'벚꽃 정원',color:'#cf9ab8'},ocean:{name:'달빛 정원',color:'#88badd'},sunset:{name:'노을 정원',color:'#c5a47d'}};
export const dateLabel=date=>new Date(date).toLocaleString('ko-KR',{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'});
