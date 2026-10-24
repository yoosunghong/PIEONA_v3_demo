import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
const [clientFile,metricsFile,outputFile]=process.argv.slice(2);
if(!clientFile||!metricsFile||!outputFile)throw Error('Usage: node scripts/summarize-oracle-load-test.mjs CLIENT.json METRICS.jsonl OUTPUT.md');
const client=JSON.parse(readFileSync(clientFile,'utf8'));
const samples=readFileSync(metricsFile,'utf8').trim().split(/\r?\n/).filter(Boolean).map(line=>JSON.parse(line));
if(!samples.length)throw Error('No server measurements');
const number=v=>Number.isFinite(v)?v.toFixed(1):'—';
const values=(data,key)=>data.map(row=>row[key]).filter(Number.isFinite);
const max=(data,key)=>Math.max(...values(data,key));
const min=(data,key)=>Math.min(...values(data,key));
const mean=(data,key)=>{const v=values(data,key);return v.reduce((a,b)=>a+b,0)/v.length;};
const names={'all-moving':'10명 이동','mixed-4-moving-6-playing':'4명 이동 + 배구 3경기','all-playing-5-matches':'배구 5경기 / 10명'};
const rows=client.phases.map(phase=>{
  const start=Date.parse(phase.started),end=start+phase.actualSeconds*1000;
  const selected=samples.filter(row=>Date.parse(row.at)>=start&&Date.parse(row.at)<end);
  if(!selected.length)throw Error('No server samples for '+phase.name);
  return `| ${names[phase.name]||phase.name} | ${number(phase.actualSeconds)} | ${number(max(selected,'rssMiB'))} | ${number(min(selected,'MemAvailableMiB'))} | ${number(mean(selected,'cpuOneCorePercent'))} | ${number(phase.ackMs.p95)} | ${number(phase.healthMs.p95)} | ${number(phase.broadcastMs.p95)} | ${phase.errors} / ${phase.disconnects} |`;
});
const oom=samples.at(-1).vmstat.oom_kill-samples[0].vmstat.oom_kill;
const report=`# Oracle E2 Micro 1GB — 실제 인스턴스 부하 테스트\n\n`+
`측정 시작: ${new Date(client.started).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'})} KST\n\n`+
`종료: ${new Date(client.finished).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'})} KST. 클라이언트 상태: **${client.status}**, 기록된 오류 ${client.errors.length}건.\n\n`+
`VM.Standard.E2.1.Micro / Ubuntu 22.04 / Linux 가시 RAM ${number(samples[0].MemTotalMiB)} MiB / 기존 스왑 ${number(samples[0].SwapTotalMiB)} MiB. 기존 P4 서비스를 유지하고, 별도 폴더·신규 SQLite DB·루프백 포트의 단일 Node 24 프로세스로 측정했다. 부하 생성기는 별도 PC에서 실행했으며 공용 방화벽을 열지 않고 SSH 터널로 연결했다.\n\n`+
`| 부하 | 초 | 앱 최대 RSS MiB | 최소 시스템 가용 MiB | 앱 평균 CPU % (1코어=100) | 입력 ACK p95 ms | health p95 ms | 이동 수신 p95 ms | 오류 / 끊김 |\n`+
`|---|---:|---:|---:|---:|---:|---:|---:|---:|\n${rows.join('\n')}\n\n`+
`전체 기록의 앱 최대 RSS: **${number(max(samples,'rssMiB'))} MiB**. 최소 시스템 가용 RAM: **${number(min(samples,'MemAvailableMiB'))} MiB**. 추가 OOM kill: **${oom}**. 최대 사용 스왑: **${number(max(samples,'SwapTotalMiB')-min(samples,'SwapFreeMiB'))} MiB**. 스왑 입출력 페이지 변화: in ${samples.at(-1).vmstat.pswpin-samples[0].vmstat.pswpin}, out ${samples.at(-1).vmstat.pswpout-samples[0].vmstat.pswpout}.\n\n`+
`## 해석 범위\n\n`+
`이 테스트는 10개의 인증된 WebSocket 계정, 약 15Hz의 마을 이동 송신, 약 10Hz의 게임 입력, 서버 권위 배구 시뮬레이션·스냅샷, 경기 종료/결과 저장/재매칭을 실행했다. ACK 지연에는 네트워크 왕복과 서버 처리가 포함된다. 이동 이벤트는 throttle/volatile 전달이므로 송수신 수가 일치하지 않을 수 있다. CPU는 Node 프로세스의 CPU 시간이며 전체 VM CPU·steal time과 다르다.\n\n`+
`서버 동기화에 대한 수 분짜리 측정이다. Gemini 동시 호출, 실제 브라우저 FPS·GPU, 모델/텍스처 동시 다운로드, 공용 HTTPS 프록시, 대규모 기존 DB, 다른 종류의 미니게임, 장시간 버스트 제한·메모리 증가를 검증하지 않았다. 기존 2GB 스왑을 유지한 환경이므로 스왑 없는 1GB 서버 결과로 일반화할 수 없다.\n\n`+
`원시 자료: [클라이언트 JSON](${resolve(clientFile).replaceAll('\\','/')}), [서버 측정 JSONL](${resolve(metricsFile).replaceAll('\\','/')}).\n`;
writeFileSync(outputFile,report);
console.log(report);
