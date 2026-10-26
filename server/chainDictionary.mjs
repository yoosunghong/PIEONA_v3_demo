import {readFileSync} from 'node:fs';
import {chainStarts,normalizeWord,TYPING_WORDS} from '../shared/wordGames.mjs';

// Loaded once on the server. Never bundle the answer vocabulary in the client.
const nouns=new Set(readFileSync(new URL('./dictionaries/korean-nouns.txt',import.meta.url),'utf8').trim().split(/\r?\n/));
export function findChainHint(used,excluded=[]){
  const seen=new Set([...used,...excluded]),starts=used.length?chainStarts(used.at(-1).at(-1)):null;
  const matches=word=>!seen.has(word)&&(!starts||starts.includes(word[0]))&&nouns.has(word);
  return TYPING_WORDS.find(word=>word.length>=2&&matches(word))||[...nouns].find(word=>word.length<=4&&matches(word))||[...nouns].find(matches)||null;
}

export function validateChain(text,used){
  const word=normalizeWord(text);
  if(!/^[가-힣]{2,200}$/.test(word))return '한글 두 글자 이상의 명사를 입력해주세요.';
  if(used.includes(word))return '이미 사용한 단어예요.';
  if(used.length&&!chainStarts(used.at(-1).at(-1)).includes(word[0]))return `“${chainStarts(used.at(-1).at(-1)).join(' / ')}”로 시작해주세요.`;
  if(!nouns.has(word))return '국어사전에서 찾을 수 없는 명사예요.';
  return null;
}
