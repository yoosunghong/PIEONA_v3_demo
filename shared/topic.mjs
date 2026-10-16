// Keep a turn readable as a speech bubble, even if a provider ignores the prompt.
export function shortTopicTurn(value){
  const text=String(value||'').replace(/\s+/g,' ').trim();
  const sentences=text.match(/[^.!?。！？]+[.!?。！？]+[”’"']*|[^.!?。！？]+$/g)||[];
  const short=sentences.slice(0,2).join('').trim();
  if(short.length<=120)return short||'잠깐, 무슨 말을 할지 생각하고 있었어요.';
  const boundary=short.slice(0,117).lastIndexOf(' ');
  return short.slice(0,boundary>70?boundary:117).trim()+'…';
}
export const topicTurnDelay=text=>Math.max(3500,Math.min(11000,String(text).length*85+1500));
