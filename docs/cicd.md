# 로컬 → GitHub Actions → Oracle 자동 배포

저장소: `yoosunghong/PIEONA_v3_demo`. 운영 브랜치: `main`. 워크플로: `.github/workflows/oracle-cicd.yml`.

## 운영 도메인

새 운영 주소는 `https://play.illova.app`이다. 등록 기관은 Porkbun이며 DNS는 Cloudflare 무료 플랜을 사용한다. `illova.app` 네임서버는 `lilith.ns.cloudflare.com`, `rommy.ns.cloudflare.com`이다. `play`는 프록시된 CNAME으로 기존 터널 `0339e6c9-1d85-46c4-8b78-c4aecd4ef7fe.cfargotunnel.com`을 가리킨다.

`/etc/pieona/tunnel.yml`에는 새 호스트와 기존 `pieona.yoosung.dev`를 모두 유지한다. 운영 환경의 `PUBLIC_ORIGIN`과 GitHub variable `ORACLE_PUBLIC_URL`은 `https://play.illova.app`을 사용한다. 계정·SQLite·릴리스·터널 UUID는 그대로 사용하며, 서로 다른 도메인 간 로그인 쿠키와 브라우저 로컬 설정은 이전되지 않아 한 번 다시 로그인해야 한다.

기존 주소의 이동은 **yoosung.dev → Rules → Redirect Rules → PIEONA to ILLOVA play**에서 관리한다. 조건은 `(http.host eq "pieona.yoosung.dev")`, 대상은 `concat("https://play.illova.app", http.request.uri.path)`, 상태 코드는 301이며 Preserve query string을 켠다. 다른 yoosung.dev 서비스에는 적용하지 않는다. 2026-10-28 새 주소의 HTTPS 인증서·health·Socket.IO를 확인한 후 규칙을 활성화했다. HTTP와 HTTPS의 `/village?invite=domain-migration` 요청이 모두 `https://play.illova.app/village?invite=domain-migration`으로 301 이동함을 확인했고, 앱 내 브라우저에서도 기존 주소에서 새 로그인 화면으로 이동하는 것을 확인했다. 기존 도메인의 DNS와 인증서도 유지해야 이전 HTTPS 링크가 정상 이동한다.

2026-10-28 이전 설정 백업은 Oracle의 `/etc/pieona/tunnel.yml.before-illova-20261028`, `/etc/pieona/pieona.env.before-illova-20261028`에 보관한다. env 백업은 비밀값을 포함하므로 공개하거나 Git에 추가하지 않는다. `deploy/Caddyfile`은 직접 Caddy로 배포할 때의 예제이며 현재 운영 터널에서는 사용하지 않는다.

## 평소 작업

1. 로컬에서 개발하고 변경 내용을 확인한다.
2. GitHub Desktop 또는 Git으로 커밋한다. `.env`, SQLite DB, 로그, `tmp`, `artifacts`는 제외된다.
3. main에 push하거나 PR을 main으로 merge한다.
4. GitHub **Actions → Oracle CI/CD**에서 검증 및 배포 결과를 확인한다.

파일을 저장하는 것만으로 운영 서버가 바뀌지는 않는다. 커밋·푸시된 버전만 배포한다. 같은 main 커밋을 다시 배포하려면 **Actions → Oracle CI/CD → Run workflow → main**을 사용한다. PR은 검증만 실행하고 운영 서버에 접근하지 않는다.

PC 개발은 `start-local.bat`을 사용한다. 최초 전환 후 이 PC의 Git 제외 파일 `data/cloudflare/production-on-oracle.json`이 공개 터널의 중복 실행을 막는다. 기존 start-server도 로컬 모드로 실행되며, npm run tunnel은 안내 후 종료한다. 다른 PC로 개발 환경을 복사할 때도 운영 터널 자격증명을 복사·실행하지 않는다. 로컬로 운영을 되돌릴 때는 먼저 클라우드 터널을 정지하고 최신 DB를 복원한 뒤 이 표식 파일을 이동해 로컬 터널을 재개한다.

## 자동으로 실행하는 작업

- Ubuntu GitHub runner / Node 24에서 `npm ci`, 프런트엔드 빌드, 전체 테스트 및 배포 묶음 검사를 수행한다.
- PSS UI 검증은 소프트웨어 WebGL로 실행하며(실제 CPU 렌더러 사용 여부도 검증), 마을 모델·텍스처 로딩이 완료된 뒤 실제 버튼을 조작한다. PSS 모달과 별도 게임·농장 화면 뒤의 마을 렌더링은 중지한다. SwiftShader/llvmpipe 등 CPU 렌더러에서는 마을의 drawing buffer 배율을 0.65로 제한하고 그림자를 끄며, 배경 그리기를 초당 최대 5회로 제한한다. 입력·시뮬레이션은 매 프레임 갱신하고 화면 크기 변경과 명시적 이미지 캡처는 즉시 그린다. 일반 GPU는 기존 해상도·그림자·프레임 빈도를 유지한다. 모든 대사 실행의 DOM 검사를 유지하면서 동일 Variant·텍스트·뷰포트의 중복 이미지 캡처는 재사용한다. 움직임 줄이기 설정을 사용한 CPU 렌더러에서 활동 대사를 읽는 동안에는 마지막 마을 프레임을 유지하고 대사 DOM·표시 기록·버튼 처리를 계속한다. 대사가 닫히면 3D 갱신을 재개하며 뷰포트 변경과 명시적 캡처는 계속 그린다. 검증은 이 중지·재개 상태도 확인한다. Chromium은 headless shell만 설치하고 설치 단계는 8분, 전체 UI 검증은 10분, 검증 job 전체는 30분으로 제한한다. 이벤트별 소요 시간을 로그에 기록한다. 실패 진단 JSON·스크린샷은 기존처럼 runner의 `artifacts/pss/fixture`에 생성하며 외부 artifact 업로드는 구성하지 않는다.
- 검증을 통과한 동일 커밋을 빌드해 전송한다. GitHub Actions artifact 저장소에 대용량 모델을 누적하지 않도록 배포 job에서 다시 빌드한다.
- 배포 키는 서버의 `deploy FULL_SHA` 강제 명령만 허용한다. 관리자 셸, 포트 포워딩, 임의 sudo는 허용하지 않는다. 서버 호스트 키도 고정해 검증한다.
- 서버는 업로드 크기·압축 해제 경로·링크·특수 파일·매니페스트 SHA를 검사하고, 별도 릴리스 디렉터리에서 production 의존성을 설치한다. 1GB 서버에서는 프런트엔드를 빌드하지 않는다.
- 단일 앱 프로세스를 정지하고 SQLite 스냅샷 및 무결성 검사를 수행한다. current 링크를 전환하고 앱을 시작한다.
- `/api/health`의 `ok`와 **배포한 커밋 SHA**가 일치해야 성공한다. 다른 버전의 서버가 살아 있는 것으로 검사를 통과할 수 없다.
- 새 앱이 시작되지 않거나 health 검사를 통과하지 못하면 이전 코드와 배포 직전 DB를 함께 복원하고, 워크플로는 실패로 표시한다. 실패한 DB도 backups에 보존한다.
- 서버에는 최근 릴리스 3개를 보관한다. 배포는 GitHub concurrency와 서버 flock으로 직렬화한다.
- `ORACLE_PUBLIC_URL`이 설정돼 있으면 공개 HTTPS 주소도 같은 SHA를 제공하는지 확인한다. 이 최종 검사는 DNS·터널 경로 검사이며, 이 검사만 실패한 경우 이미 정상인 서버의 DB를 자동 복원하지 않는다.

게임 상태와 접속자는 메모리에 있으므로 배포 시 연결 및 진행 중인 게임이 끊길 수 있다. 계정·인벤토리 등 영구 데이터는 SQLite에 유지된다. 서버 여러 프로세스/PM2 cluster를 켜지 않는다.

## 서버 구성

| 경로/계정 | 용도 |
|---|---|
| `/opt/pieona/current` | 현재 릴리스 링크 |
| `/opt/pieona/releases/FULL_SHA` | 배포 버전 |
| `/opt/pieona/runtime` | 공식 체크섬을 검증한 Node 24 |
| `/etc/pieona/pieona.env` | Gemini·공개 origin 등 운영 설정, root 600 |
| `/etc/pieona/deploy.json` | root가 관리하는 배포 대상·명령 설정 |
| `/etc/pieona/tunnel.yml` | 공개 도메인의 로컬 origin 경로 |
| `/etc/pieona/tunnel-credentials.json` | root 600 터널 자격증명, GitHub에 저장하지 않음 |
| `/usr/local/libexec/pieona-*` | root 소유 고정 배포/DB helper |
| `/var/lib/pieona/pieona.sqlite` | 운영 DB, 앱 사용자 전용 |
| `/var/lib/pieona/backups` | 배포 전 백업과 실패한 DB 보존 |
| `/opt/pieona/deployments.jsonl` | 배포·자동 복원 기록 |
| `pieona` | 앱 실행 계정 |
| `pieona-deploy` | 릴리스 수신 계정, 앱 시작·정지/고정 DB helper만 sudo 허용 |

기존 P4 서비스와 운영 디스크는 별도이며 앱 배포에서 변경하지 않는다. DB 경로는 고정 경로를 사용한다. DB 경로를 바꾸려면 서비스 환경과 root-owned DB helper를 함께 변경해야 한다. 서버 env 파일에 모델·키 등을 바꾸면 `sudo systemctl restart pieona`가 필요하다. 앱 디렉터리에 `.env`를 만들지 않는다.

`pieona-tunnel.service`는 별도 DynamicUser와 systemd LoadCredential로 실행하며, 앱 사용자에게 터널 파일을 공개하지 않는다. 앱만 재시작할 때 터널은 유지된다. 터널 설정 변경 시 `sudo systemctl restart pieona-tunnel`을 사용한다.

## GitHub 설정

- Secret `ORACLE_DEPLOY_KEY`: 전용 개인키. 관리자 키와 Gemini 키는 저장하지 않는다.
- Variables `ORACLE_DEPLOY_HOST`, `ORACLE_DEPLOY_USER`, `ORACLE_KNOWN_HOSTS`, `ORACLE_PUBLIC_URL`.
- 워크플로 토큰은 contents:read만 사용한다. 공식 checkout/setup-node Actions는 커밋 SHA로 고정한다.
- 저장소 쓰기 권한은 운영 앱 배포 권한과 연결되므로 신뢰하는 사람에게만 부여한다. 원하면 저장소의 main 보호 규칙에서 PR과 `verify` 통과를 요구한다. GitHub 요금제에 따라 비공개 저장소의 보호 기능 제공 여부가 다르다.

## 상태 확인과 장애 대응

```bash
sudo systemctl status pieona
sudo journalctl -u pieona -n 100 --no-pager
curl --fail http://127.0.0.1:3000/api/health
cat /opt/pieona/deployments.jsonl
```

API 키나 대화 원문을 GitHub 로그에 넣지 않는다. 배포 전 DB 백업은 서버 디스크에만 있으므로 별도 비공개 저장소에도 복사한다. 백업은 자동 삭제하지 않으며 사용량을 주기적으로 확인한다.

정상 배포 후 코드를 되돌릴 때는 main에서 해당 변경을 revert하고 push해 새로운 검증·배포를 실행한다. 오래된 코드와 현재 DB 스키마의 호환성을 확인한다. 수동 DB 복원은 스냅샷 이후 데이터를 잃을 수 있어 별도 판단이 필요하다.

배포 전용 키를 교체할 때는 GitHub Secret과 `/home/pieona-deploy/.ssh/authorized_keys`를 함께 갱신한다. 배포 제어 프로그램·sudoers·서비스 정의를 바꾸는 경우 운영자 SSH로 `deploy/bootstrap-cicd.sh`를 다시 적용해야 한다. 앱 배포 키는 이 root 설정을 갱신할 권한이 없다.

## 최초 전환

클라우드 앱을 먼저 검증한 뒤, 로컬 서비스를 정지하고 최신 DB 스냅샷을 이전한다. Cloudflare Tunnel 자격증명은 서버에만 복사하며 GitHub에 넣지 않는다. 같은 named tunnel을 PC와 클라우드에서 동시에 운영하면 서로 다른 DB로 트래픽이 분산될 수 있으므로, 최종 전환 시 로컬 tunnel을 먼저 정지한다. 공개 `/api/health`의 revision이 GitHub main SHA와 같은지 확인한다.
