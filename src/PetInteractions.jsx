import React,{useState} from 'react';
import {Heart,Smile,X} from 'lucide-react';
import {api} from './api';
import './pet-interactions.css';

export default function PetInteractions({villageId,onClose,notify}){
  const [pending,setPending]=useState(false),[message,setMessage]=useState('가까이에서 작은 친구와 교감해 보세요.');
  async function interact(kind){
    if(pending)return;setPending(true);
    try{const result=await api('/me/pet/interactions',{method:'POST',body:{kind,villageId,requestId:crypto.randomUUID()}});setMessage(result.reply);notify(result.reply);}
    catch(error){setMessage(error.message);}
    finally{setPending(false);}
  }
  return <section className="pet-interactions" role="dialog" aria-label="펫과 교감하기"><header><strong>작은 친구와 교감하기</strong><button aria-label="펫 상호작용 닫기" onClick={onClose}><X size={18}/></button></header><p role="status" aria-live="polite">{message}</p><div><button disabled={pending} onClick={()=>interact('pet')}><Heart size={18}/>쓰다듬기</button><button disabled={pending} onClick={()=>interact('snack')}><Smile size={18}/>간식 주기</button></div><small>펫 간식은 무료예요. 보관함의 음식은 사용하지 않아요.</small></section>;
}
