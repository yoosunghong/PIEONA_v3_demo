export const photoFrames = [
  {id:'botanical',name:'초록 잎사귀',symbol:'🌿'},
  {id:'blossom',name:'벚꽃 편지',symbol:'🌸'},
  {id:'starlight',name:'별빛 조각',symbol:'✦'},
  {id:'seaside',name:'바다의 선물',symbol:'🐚'},
  {id:'scrapbook',name:'여행 스크랩',symbol:'🎞'},
  {id:'classic',name:'순백의 기록',symbol:'▧'},
];

export const photoPalettes = {
  default:{paper:'#f2f8fc',raised:'#fcfeff',soft:'#e4eff6',accent:'#567d9b',ink:'#304c68',muted:'#6e879b',line:'#cfdfeb'},
  cafe:{paper:'#f5ecdf',raised:'#fffaf1',soft:'#eee0cd',accent:'#88704d',ink:'#574637',muted:'#967f69',line:'#dfcdb6'},
  campfire:{paper:'#29374d',raised:'#35445c',soft:'#40516a',accent:'#edc28d',ink:'#fff4e4',muted:'#c6cedc',line:'#596b83'},
  twilight:{paper:'#45435e',raised:'#54516e',soft:'#615d7d',accent:'#dbcbf6',ink:'#f7f0ff',muted:'#d0c7e0',line:'#817998'},
  sunset:{paper:'#f9e6dc',raised:'#fff6ee',soft:'#f1d4c6',accent:'#a66750',ink:'#704c40',muted:'#9b7464',line:'#e4bfae'},
};

export function newCapture({image,themeId='default',theme='정원',location,participants=[]},at=Date.now(),id=globalThis.crypto.randomUUID()){
  return {id,image,at,themeId,theme,location:location||theme+' 마을',title:'우리 마을의 작은 순간',memo:'',tags:[theme],participants,frame:'botanical',favorite:false,showDate:true,showTime:false};
}

export function filterCaptures(photos,{character='all',favorites=false,query='',sort='newest'}={}){
  const search=query.trim().toLocaleLowerCase();
  return photos.filter(photo=>(!favorites||photo.favorite)&&(character==='all'||photo.participants.some(p=>(p.appearance?.character||'pio')===character))&&(!search||[photo.title,photo.memo,photo.location,...photo.tags].join(' ').toLocaleLowerCase().includes(search))).sort((a,b)=>sort==='oldest'?a.at-b.at:b.at-a.at);
}

export function captureFilename(photo){
  const title=photo.title.replace(/[<>:"/\\|?*\u0000-\u001f]/g,'').trim().slice(0,60)||'마을의 순간';
  return `PIEONA-${photoDate(photo.at,'-')}-${title}.png`;
}

export function photoDate(at,separator='. '){
  const date=new Date(at);
  return [date.getFullYear(),String(date.getMonth()+1).padStart(2,'0'),String(date.getDate()).padStart(2,'0')].join(separator);
}
