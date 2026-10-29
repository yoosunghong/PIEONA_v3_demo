import test from 'node:test';
import assert from 'node:assert/strict';
import {newCapture,filterCaptures,captureFilename,photoFrames,photoPalettes} from '../src/captureModel.mjs';
import {villageThemes} from '../shared/world.mjs';
import {wrapCaptureText} from '../src/captureCanvas.mjs';

const make=(id,at,character='pio')=>newCapture({image:'data:image/png;base64,test',participants:[{id:'person',nickname:'새봄',appearance:{character}}]},at,id);
test('capture preserves the source, date, location and actual companion appearance',()=>{
  const photo=make('photo',100);
  assert.equal(photo.image,'data:image/png;base64,test');
  assert.equal(photo.at,100);assert.equal(photo.id,'photo');
  assert.equal(photo.frame,'botanical');assert.equal(photo.favorite,false);
  assert.equal(photo.participants[0].appearance.character,'pio');
  assert.deepEqual(photo.tags,['정원']);
});
test('album combines companion, favorite, text and date filters without mutating saved order',()=>{
  const photos=[make('older',10),{...make('newer',30,'luna'),favorite:true,title:'벚꽃과 함께',memo:'함께한 오후',tags:['봄']},make('middle',20,'luna')];
  assert.deepEqual(filterCaptures(photos).map(p=>p.id),['newer','middle','older']);
  assert.deepEqual(filterCaptures(photos,{character:'luna',favorites:true,query:' 봄 ',sort:'oldest'}).map(p=>p.id),['newer']);
  assert.deepEqual(filterCaptures(photos,{character:'luna',sort:'oldest'}).map(p=>p.id),['middle','newer']);
  assert.equal(filterCaptures(photos,{query:'오후'}).length,1);
  assert.equal(filterCaptures(photos,{query:'없는기억'}).length,0);
  assert.deepEqual(photos.map(p=>p.id),['older','newer','middle']);
});
test('all village themes have an export palette and six distinct selectable frames',()=>{
  for(const theme of villageThemes)assert.ok(photoPalettes[theme.id]?.raised);
  assert.equal(new Set(photoFrames.map(frame=>frame.id)).size,6);
});
test('PNG names sanitize filesystem characters and retain a meaningful Korean title',()=>{
  const photo={...make('photo',Date.UTC(2026,9,17)),title:'봄: 나의/마을?*'};
  assert.equal(captureFilename(photo),'ILLOVA-2026-10-17-봄 나의마을.png');
  assert.ok(captureFilename({...photo,title:'<>?'}).endsWith('별의 순간.png'));
  assert.ok(captureFilename({...photo,at:new Date(2026,9,17,0,15).getTime()}).startsWith('ILLOVA-2026-10-17-'));
});
test('PNG story wrapping retains long Korean text, explicit blank lines and emoji without truncation',()=>{
  const ctx={measureText:text=>({width:Array.from(text).length*24})};
  const text='오늘의 작은 이야기🌿'.repeat(25);
  const lines=wrapCaptureText(ctx,text,1008);
  assert.equal(lines.join(''),text);
  assert.ok(lines.every(line=>ctx.measureText(line).width<=1008));
  assert.deepEqual(wrapCaptureText(ctx,'첫째 줄\n\n마지막 줄',1008),['첫째 줄','','마지막 줄']);
});
