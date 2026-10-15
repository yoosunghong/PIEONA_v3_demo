import React,{useEffect,useState} from 'react';
import {Download} from 'lucide-react';

export default function StageCapture({shot,notify,onClose}){
  const [memo,setMemo]=useState(''),[showDate,setShowDate]=useState(true),[showTime,setShowTime]=useState(true),[preview,setPreview]=useState('');
  useEffect(()=>{
    let active=true;setPreview('');const image=new Image();image.onload=()=>{
      const canvas=document.createElement('canvas');canvas.width=image.width;const scale=canvas.width/1000,footer=Math.ceil(165*scale);canvas.height=image.height+footer;
      const ctx=canvas.getContext('2d');ctx.drawImage(image,0,0);ctx.fillStyle='#f3f7fd';ctx.fillRect(0,image.height,canvas.width,footer);
      const margin=32*scale;ctx.fillStyle='#315477';ctx.font=`600 ${20*scale}px sans-serif`;
      ctx.fillText('PIEONA · '+shot.theme,margin,image.height+36*scale);
      const date=new Date(shot.at);const stamp=[showDate?date.toLocaleDateString('ko-KR'):null,showTime?date.toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit',second:'2-digit'}):null].filter(Boolean).join(' · ');
      ctx.font=`${16*scale}px sans-serif`;ctx.fillStyle='#66809d';ctx.fillText(stamp,margin,image.height+64*scale);
      ctx.fillStyle='#315477';let line='',y=image.height+96*scale;
      for(const char of memo){if(char==='\n'||ctx.measureText(line+char).width>canvas.width-margin*2){ctx.fillText(line,margin,y);line='';y+=23*scale;if(char==='\n')continue;}line+=char;}ctx.fillText(line,margin,y);
      if(active)setPreview(canvas.toDataURL('image/png'));
    };image.onerror=()=>notify('캡처 미리보기를 만들지 못했어요.');image.src=shot.image;return()=>{active=false;};
  },[shot,memo,showDate,showTime]);
  const filename=`pieona-${new Date(shot.at).toISOString().replace(/[:.]/g,'-')}.png`;
  return <div className="panel-body stage-capture"><p className="muted">지금 바라보는 마을을 사진으로 간직해요.</p>{preview?<img src={preview} alt="날짜, 시간과 메모가 포함된 마을 캡처 미리보기"/>:<p role="status">사진을 준비하고 있어요…</p>}<div className="form-row"><label className="check-row"><input type="checkbox" checked={showDate} onChange={e=>setShowDate(e.target.checked)}/>날짜 표시</label><label className="check-row"><input type="checkbox" checked={showTime} onChange={e=>setShowTime(e.target.checked)}/>시간 표시</label></div><label>이 순간의 메모 <small>{memo.length} / 80자</small><textarea maxLength={80} rows={2} value={memo} onChange={e=>setMemo(e.target.value.replace(/\r?\n/g,' '))} placeholder="오늘의 기분이나 기억하고 싶은 한마디"/></label><div className="form-row"><button className="secondary" onClick={onClose}>닫기</button>{preview?<a className="primary" href={preview} download={filename}><Download size={16}/>PNG로 저장</a>:<button className="primary" disabled>사진 준비 중…</button>}</div></div>;
}
