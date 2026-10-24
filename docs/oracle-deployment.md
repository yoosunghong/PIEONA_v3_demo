# Oracle Cloud 배포 — Ubuntu 24.04, 단일 서버

운영 자동 배포는 [CI/CD 안내](cicd.md)를 따른다. 아래는 별도의 신규 서버를 수동 설치하는 방법이다. 이미 CI/CD를 구성한 서버에 수동 install.sh를 적용하지 않는다.

현재 PC에서 빌드하고 Ubuntu ARM64 또는 AMD64 서버에서 실행한다. Node.js 22.13 이상(권장 24 LTS), npm, Caddy, systemd가 필요하다. 설치 스크립트는 서버·DNS·방화벽을 변경하거나 서비스를 시작하지 않는다. 실제 서버 사양 및 SSH 정보는 아직 확인하지 않았다.

## 1. PC에서 배포 묶음 만들기

```powershell
npm ci
npm run package:oracle
tar -tzf artifacts/pieona-oracle.tar.gz
scp artifacts/pieona-oracle.tar.gz ubuntu@SERVER_IP:~/
```

`SERVER_IP`와 아래 도메인은 실제 값으로 교체한다. 비공개 키 파일이 필요하면 scp/ssh에 `-i KEY_PATH`를 추가한다. 묶음에는 현재 작업 디렉터리의 server/shared와 최신 빌드 및 resource가 포함된다. 미커밋 변경도 포함되므로 배포 전 검토한다. `.env`, 데이터, 로그, Windows node_modules는 포함하지 않는다. 배포 묶음 자체도 비공개로 보관한다. 이미지·모델 때문에 전송 크기가 클 수 있다.

## 2. Ubuntu 준비

Node 공식 배포판 또는 신뢰하는 패키지 관리자로 Node.js 24 LTS와 npm을 설치한다. Node는 `/usr/bin/node`에서 실행되어야 한다. 다른 경로를 사용한다면 install.sh 및 서비스의 ExecStart를 함께 수정한다. Ubuntu 기본 nodejs 패키지는 버전이 낮을 수 있으므로 반드시 확인한다.

```bash
node --version
npm --version
node --input-type=module -e 'import {DatabaseSync} from "node:sqlite"; new DatabaseSync(":memory:").close()'
```

아키텍처에 맞는 Node를 설치한다(`uname -m`: aarch64=ARM64, x86_64=AMD64). Caddy는 [공식 Ubuntu 설치 안내](https://caddyserver.com/docs/install#debian-ubuntu-raspbian)에 따라 설치한다.

Oracle 인스턴스의 공인 IP에 연결할 DNS A 레코드를 준비한다. 기존 `pieona.yoosung.dev`가 Cloudflare Tunnel을 가리킨다면 먼저 별도 테스트 서브도메인으로 검증하고, 마지막에 기존 터널 레코드를 새 IP로 전환한다. 최초 검증은 DNS only 레코드를 권장한다. 실제 IPv6 구성이 없으면 AAAA 레코드를 추가하지 않는다.

OCI NSG/Security List와 Ubuntu 호스트 방화벽 양쪽에서 TCP 80/443을 허용한다. SSH 22는 관리자 IP 범위만 허용하고 기존 SSH 규칙은 유지한다. 3000은 열지 않는다. 방화벽 규칙 전체 삭제나 초기화는 하지 않는다. [OCI 네트워크 및 호스트 방화벽 설명](https://docs.oracle.com/en-us/iaas/Content/Security/Reference/compute_security.htm).

## 3. 설치 및 설정

```bash
mkdir -p ~/pieona-release
tar -xzf ~/pieona-oracle.tar.gz -C ~/pieona-release
cd ~/pieona-release
sudo bash deploy/install.sh
sudoedit /etc/pieona/pieona.env
```

`PUBLIC_ORIGIN=https://실제도메인`은 마지막 `/` 없이 설정한다. `GEMINI_API_KEY`를 서버에서 직접 입력한다. `HOST=127.0.0.1`, `PORT=3000`, `COOKIE_SECURE=true`, 절대 경로 DATABASE_PATH는 유지한다. 비밀값은 Git이나 배포 묶음에 넣지 않는다. 키가 비어 있으면 로컬 체험 모드가 된다. `/opt/pieona/app/.env`는 만들지 않는다.

## 4. 기존 데이터 이전

최종 이전 시 PC 서비스를 종료하여 이후 데이터가 갈라지지 않도록 한다. 종료는 `scripts/stop.ps1` 또는 기존 실행 창 종료로 수행한다. 실행 중인 SQLite 본체만 복사하면 WAL 데이터가 누락될 수 있으므로 스냅샷 도구를 사용한다. 실제 `.env`의 DATABASE_PATH가 기본 경로와 다르면 아래 원본 경로를 바꾼다.

PC:

```powershell
node deploy/backup-db.mjs data/pieona.sqlite artifacts/migration.sqlite
scp artifacts/migration.sqlite ubuntu@SERVER_IP:~/migration.sqlite
```

서버에서 **최초 시작 전**:

```bash
sudo test ! -e /var/lib/pieona/pieona.sqlite && sudo install -o pieona -g pieona -m 600 ~/migration.sqlite /var/lib/pieona/pieona.sqlite
```

기존 대상 DB가 있으면 덮어쓰지 말고 서비스를 정지한 뒤 백업·복원 절차로 처리한다. 데이터 이전을 생략하면 새 DB로 시작한다. 스냅샷에는 계정·대화 등 개인정보가 있으므로 안전하게 보관하고, 전송용 복사본은 이전 확인 후 정리한다. 이전한 DB는 코드의 자동 마이그레이션을 거치므로 첫 시작 직전 백업을 보관한다.

## 5. HTTPS 및 시작

`deploy/Caddyfile`의 `play.example.com`을 실제 도메인으로 바꾼다. 이미 다른 사이트를 운영하는 Caddy가 있다면 해당 사이트 블록만 기존 설정에 병합한다. 기존 설정을 통째로 덮어쓰지 않는다.

신규 Caddy 서버인 경우:

```bash
sudo cp /etc/caddy/Caddyfile /etc/caddy/Caddyfile.before-pieona
sudo install -m 644 deploy/Caddyfile /etc/caddy/Caddyfile
sudo caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
sudo systemctl enable --now pieona
curl --fail http://127.0.0.1:3000/api/health
sudo systemctl reload caddy
curl --fail https://실제도메인/api/health
```

Caddy는 인증서 발급과 HTTP→HTTPS 전환 및 WebSocket 프록시를 처리한다. [자동 HTTPS](https://caddyserver.com/docs/automatic-https), [WebSocket 프록시](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy). 도메인의 DNS 및 80/443 접근이 정상이어야 한다. Caddy는 같은 호스트의 loopback으로 앱에 연결하므로 기존 Express trust proxy 설정과 호환된다.

## 6. 이전 완료 확인

- `/api/health`: ok=true, Gemini 키를 넣었다면 기대한 AI 모드 확인.
- 기존 계정 로그인, 보관함·설문·마을·기억 확인.
- PC와 휴대폰 등 별도 브라우저 두 개로 각각 다른 계정 로그인. 같은 마을에서 이동·채팅 및 미니게임을 함께 실행.
- 개발자 도구 Network에서 Socket.IO 연결 및 WebSocket upgrade 확인(정상 polling fallback 여부도 확인).
- HTTPS 쿠키 로그인 유지, 새로고침, 모델·텍스처 로딩, Gemini 대화 확인.
- `sudo systemctl restart pieona` 후 재접속과 데이터 유지 확인. 재시작 중 접속·진행 중 게임은 끊어진다.
- 위 검증 후 기존 도메인을 전환하고 PC 서버·터널을 종료한다. 동일 DB를 양쪽 서버에서 독립 운영하지 않는다.

단일 Node 프로세스만 실행한다. 인메모리 마을/접속/초대 상태가 있어 PM2 cluster나 여러 서버로 단순 복제하면 안 된다. 실제 동접 한도는 부하 테스트 전에는 보장하지 않는다. 무료 인스턴스 유휴 회수 및 Gemini 별도 요금도 고려한다.

## 7. 운영·백업·업데이트·복원

```bash
sudo systemctl status pieona
sudo journalctl -u pieona -n 100 --no-pager
sudo journalctl -u caddy -n 50 --no-pager
# 로그가 디스크를 채우지 않도록 현재 journal 사용량 확인 및 보존 한도 설정 검토
sudo journalctl --disk-usage
sudo -u pieona /usr/bin/node /opt/pieona/app/deploy/backup-db.mjs /var/lib/pieona/pieona.sqlite /var/lib/pieona/backups/manual-20261024.sqlite
```

백업마다 새 파일명을 사용한다. 도구는 기존 파일을 덮어쓰지 않으며 integrity_check를 수행한다. 정기적으로 실행하고 인스턴스 밖의 비공개 저장소에도 복사한다. 이 도구는 백업 보존·자동 삭제를 수행하지 않는다.

업데이트: PC에서 새 묶음 생성 → 서버의 새 빈 release 폴더에 압축 해제 → 유지보수 시간에 `sudo systemctl stop pieona` → DB 스냅샷과 `/opt/pieona/app`의 이전 버전 보관 → 새 release에서 `sudo bash deploy/install.sh` → `sudo systemctl start pieona` → 상태·멀티플레이 검증. 설정과 DB는 app 폴더 밖에 있어 유지된다. 설치 실패 시 서비스를 재시작하지 말고 원인을 해결하거나 이전 앱으로 복원한다.

복원: 서비스를 정지한 상태에서 현재 DB와 `-wal`/`-shm` 파일을 별도 보관하고 활성 경로에서 모두 이동한 뒤, 검증된 스냅샷을 원래 DB 이름으로 복사하고 소유권 pieona:pieona·권한 600을 적용한다. 스키마가 변경되었다면 동일 시점의 앱 버전도 함께 복원한다. 복원 시 스냅샷 이후 데이터는 사라지므로 반드시 별도 보관한다.

이 문서와 배포 파일은 준비 단계다. 실제 OCI 설치, DNS 전환, TLS 발급, ARM 서버 실행 및 인터넷 멀티플레이 검증은 서버 접속 후 수행해야 한다.
