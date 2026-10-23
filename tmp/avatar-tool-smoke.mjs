import dotenv from 'dotenv';
import {generateAnswer} from '../server/ai.mjs';
const env=dotenv.config().parsed||{};
const context={own:true,lifeActions:true,avatarTools:true,system:'너는 테스트용 한국어 게임 아바타다. 일반 대화는 JSON {reply:string,emotion:"calm",memories:[]}로 답한다.',snapshot:{nickname:'테스트',speechStyle:'담백',interests:[],personality:{}},selected:[]};
if(!env.GEMINI_API_KEY){console.log('SKIP: no configured Gemini key');process.exit(0);}
for(const [text,want] of [['나한테 와','MOVE_TO'],['벤치에 좀 앉아 줄래?','SIT_DOWN'],['보관함에서 정어리 두 마리 꺼내와','TAKE_FROM_STORAGE'],['일어나줘','STAND_UP'],['오늘 기분 어때?',null]]){
  try{const result=await generateAnswer(context,text,[],{apiKey:env.GEMINI_API_KEY,model:env.GEMINI_MODEL});const actual=result.action?.intent||null;console.log(JSON.stringify({want,actual,provider:result.provider,ok:actual===want}));if(actual!==want)process.exitCode=1;}
  catch(e){console.log(JSON.stringify({want,error:e.message,status:e.status}));process.exitCode=1;}
}
