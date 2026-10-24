# Oracle 1GB 인스턴스 — 부하 테스트 준비 및 SSH 진단

2026-10-24 완료. **SSH를 복구하고 원래 Oracle 인스턴스에서 10명 부하 테스트를 실행했다.** [실제 측정 결과](oracle-load-test-results-2026-10-24.md)를 참조한다. 아래 로컬 스모크 검증과 실제 서버 측정은 구분한다.

## 확인된 서버와 접속 문제

- 콘솔: 춘천 ap-chuncheon-1, VM.Standard.E2.1.Micro, RAM 1GB, Ubuntu 22.04.
- 지정된 illova_oracle 키는 기존 직렬 콘솔 연결의 키와 일치하지만 ubuntu 일반 SSH 접속에서는 거부된다.
- OCI 메타데이터의 최초 SSH 키는 RSA 2048비트, 주석 `ssh-key-2026-06-04`, 지문 `SHA256:hiRVp6ntjlrTjypi7jEXnEB0Ohfg0q9EsbSBhhcUluE`이다.
- 지정된 키는 RSA 4096비트이며 최초 키와 다르다. 사용자 폴더, D드라이브의 주요 키 파일 후보와 정확한 이름 검색, 휴지통 메타데이터, 해당 IP의 PuTTY 세션 설정에서 원본 경로를 찾지 못했다. 파일이 아카이브·외장 장치·다른 PC에 있는 가능성은 남는다.
- 기존 직렬 콘솔 접속 성공. 정상 재부팅 후에도 GRUB 복구 메뉴가 표시되지 않아 임시 복구 서버 방식으로 전환했다.
- Oracle Run Command는 Enabled로 표시되지만 plugin not present이며 읽기 전용 진단도 응답하지 않았다.
- 부팅 로그에 기존 P4 Server 서비스가 확인된다. 복구와 부하 테스트에서 해당 서비스 및 데이터 보존이 필요하다.

## 완료된 복구와 실제 측정

별도 승인을 받아 무료 E2 Micro 임시 서버와 50GB 디스크를 만들었다. 기존 Ubuntu 서버를 정상 종료하고 원본 100GB 디스크를 데이터 디스크로 연결했다. 루트 파일시스템 UUID 및 Ubuntu 계정을 읽기 전용으로 검증한 결과 SSH 파일 권한은 정상이었고 최초 키만 등록돼 있었다.

`deploy/recover-oracle-ssh.sh`로 원래 authorized_keys를 `authorized_keys.before-illova-20261024T124731Z`에 보존하고 지정된 illova_oracle 공개키만 추가했다. 디스크를 언마운트하고 원래 인스턴스에 되돌린 뒤 지정 키로 ubuntu SSH 로그인을 확인했다. 암호·방화벽·P4 데이터는 변경하지 않았다.

원래 서버에서 Node 24.22.1을 사용자 전용 테스트 폴더에 설치하고, 신규 테스트 DB로 10명 이동 60초 → 4명 이동+배구 3경기 180초 → 배구 5경기 180초를 실행했다. 오류·연결 끊김·추가 OOM kill은 모두 0이었다. 앱 최대 RSS는 208.9MiB, 최소 시스템 가용 RAM은 394.7MiB였다. 기존 스왑 2GB를 유지했다. 자세한 지연·CPU·제한은 측정 결과 문서에 기록했다.

테스트 프로세스와 SSH 터널은 종료했다. 재실행용 앱·격리 Node·테스트 DB·로그는 서버의 `/home/ubuntu/illova-load-test-20261024`에 남겨 두었다. 기존 P4 서비스가 활성 상태임을 재확인했다. 승인받아 임시 복구 인스턴스 및 전용 50GB 볼륨을 삭제했고, 원래 인스턴스 RUNNING·원본 100GB 볼륨 보존·임시 볼륨 TERMINATED를 OCI에서 확인했다. 공개 도메인으로 서비스를 전환하지는 않았다.

## 준비된 도구와 로컬 검증

- `scripts/load-test-oracle.mjs`: 별도 PC에서 10개 테스트 계정으로 인증된 WebSocket 연결, 같은 마을 이동, 혼합 부하, 배구 5경기 동시 실행.
- `deploy/load-test-server.mjs`: 기존 DB가 있으면 실행을 거부하는 전용 서버. 별도 SQLite DB를 사용하고 Gemini를 비활성화한다. 2초 간격으로 앱 RSS·CPU·이벤트 루프 지연, Linux 전체 가용 메모리·스왑·OOM 카운터를 기록한다.
- 로컬 PC에서 단계별 2초 스모크 검증 완료: 10개 계정, 이동, 3경기+4명 이동, 5경기 동시 진행. API/게임 입력 오류 및 접속 끊김 0. 짧은 검증이며 RAM 1GB 적합성 판정에 사용할 수 없다.

## SSH 복구 후 실행

새 전용 작업 폴더에 앱 소스·의존성과 위 도구를 설치한다. 기존 운영 폴더나 DB를 덮어쓰지 않는다. 서버의 기존 서비스·메모리·스왑·디스크 상태를 먼저 기록하고 Node.js 22.13+를 확인한다. 테스트는 실제 CPU 할당을 유지하고 메모리 부족 시 중단한다. 서비스 정지·방화벽 공개는 필요 없다.

서버에서 새 경로를 지정한다:

```bash
LOAD_TEST_DATABASE="$HOME/illova-load-test/runs/NEW_RUN/test.sqlite" \
LOAD_TEST_PORT=5300 \
node deploy/load-test-server.mjs
```

PC의 별도 터미널에서 SSH 터널을 유지한다:

```powershell
ssh -N -L 5300:127.0.0.1:5300 -i SERVER_KEY ubuntu@SERVER_IP
```

PC에서 클라이언트 부하를 생성한다:

```powershell
node scripts/load-test-oracle.mjs --url=http://127.0.0.1:5300 --allow-test-accounts=yes --phase-seconds=180 --output=artifacts/oracle-load-test.json
```

실행은 10명 이동 60초, 4명 이동+6명 배구 180초, 10명 배구 180초로 구성된다. 배구는 2명 정원이므로 최대 5경기를 만든다. 종료된 경기는 기록 저장 후 새 경기를 시작한다. 입력 ACK·health API·이동 수신 지연과 스냅샷 수, 실패·연결 끊김을 기록한다. 이동 메시지는 서버의 throttle 및 volatile 전달 대상이어서 송신 수와 수신 수가 일치하지 않을 수 있다. 수신 수와 지연을 함께 해석한다.

완료 후 서버 테스트 프로세스만 SIGTERM으로 정지하고 해당 run 폴더의 `server-metrics.jsonl`을 PC로 가져온다. 클라이언트는 서버와 다른 PC에서 실행해야 앱 메모리와 부하 생성기 메모리를 혼동하지 않는다. PID/서비스 상태와 OOM 로그도 확인한다.

판정에는 각 단계의 실제 메시지 처리량·p95/p99 또는 최대 지연·오류율·최저 가용 RAM·스왑 입출력·OOM 여부가 필요하다. 수 분 테스트는 장시간 메모리 증가나 지속 CPU 제한을 증명하지 못하므로, 첫 통과 후 더 긴 soak 테스트가 필요하다. 이 시나리오는 서버 동기화와 DB 동작을 측정하며 브라우저 GPU/FPS, 10명의 모델 파일 동시 다운로드, Gemini 동시 요청, 공용 HTTPS 프록시 비용은 별도 측정 대상이다.
