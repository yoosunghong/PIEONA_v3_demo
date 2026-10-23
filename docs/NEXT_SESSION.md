# 다음 세션 인수인계 (2026-10-23)

## 현재 구현

AI 아바타의 명시적 이동·앉기·일어나기·보관함 왕복 운반과 Gemini 네이티브 함수 호출을 추가했다. [아바타 행동 툴](avatar-actions.md), `server/avatarTools.mjs`, `server/avatarRuntime.mjs`, `tests/avatar-actions.test.mjs`를 확인한다. 위치·재고·배치는 추가로 모델에 전송하지 않고 서버에서 검증한다. 물건은 운반 중 `avatar_carry`로 분리하며 도착·취소·복구 시 공용 보관함으로 반환한다. 서버 재시작이 필요하다.

생활 콘텐츠 Phase 1–4가 기존 Express/Socket.IO 서버, SQLite 보관함, React/Three.js 마을 및 AI 대화에 연결되어 있다. 새로 구현하지 말고 아래 문서와 테스트부터 확인한다.

- [Phase 1](life-phase1.md): 서버 판정 낚시, 계정 공용 보관함·도감, 낚시 자리와 월드 UI.
- [Phase 2](life-phase2.md): 자연어 단독/공동 낚시, 이동·중단, 실제 획득 기록 조회, 방문자 권한 및 지연 응답 보호.
- [Phase 3](life-phase3.md): 텃밭 3칸, 허브/토마토/꽃 성장, 수확, 기본 요리 4종, 실제 재료 소비, 자연어 실행.
- [Phase 4](life-phase4.md): 허용 설정 기반 자율 활동, 오프라인 일괄 정산, 자아별 관계 기억과 잊기.

기획서 원본은 세션 첨부 `C:\Users\Foryoucom\.codex\attachments\f4d6d66c-90ec-42d9-a060-c5f3d95c336e\붙여넣은 텍스트.txt`이다. 구현 세부사항과 현재 제한은 위 문서에 남겼다.

## 다음 작업 우선순위

1. **실기기와 기존 배치 후속 확인**: 2026-10-23에 서버를 실행하고 1440×1000 데스크톱·390×844 모바일 뷰포트에서 Phase 3·4 실제 UI 검증을 진행했다. 다섯 테마, 심기·요리·중단, 모바일 스크롤, 자율 낚시, 실제 부재 정산 보고, 추억 잊기를 확인하고 배치 보호·모바일 설정 정렬·마을 카드 가림·짧은 이동 키 중단을 수정했다. [상세 검증 기록](life-phase34-ui-verification.md)을 먼저 읽는다. 실제 휴대전화의 터치/소프트 키보드/회전/성능과 기존 사용자의 저장 배치에서 남은 겹침은 후속이다. 기존 배치는 자동 이동하지 않는다.
2. **실제 Gemini 반복 검증**: 실제 모델의 합성 문장 9건(애매한 요리, 부정·인용, 함께/혼자, 수량·시간 제한, 자동 요리 허용/해제)이 기대한 액션을 반환했다. UI의 실제 모델 요리 완료와 응답 도착 전 중단도 확인했다. 표본을 늘리고 장기 지연·호출 제한을 관찰한다. 키나 대화 원문을 로그에 출력하지 않는다.
3. **운영 데이터 적용 후속**: 서버 시작 전 SQLite `VACUUM INTO`로 `data/pieona-before-ui-2026-10-22T17-26-54-961Z.sqlite`를 만들었다. 기존 11개 계정 유지·생활 테이블 추가·검증 계정의 재시작 후 보관함/작물/보고/추억 유지와 DB 무결성을 확인했다. 이번에는 기존 생활 테이블이 없던 운영 DB였으므로 기존 생활 보관함 이행 사례를 검증했다고 표현하지 않는다. 실제 기존 사용자의 자아 전환·여러 탭/기기 사용은 후속이며 격리 통합 회귀에서는 통과했다. 데이터 초기화는 하지 않는다.
4. **밸런스와 운영 성능**: 현재 오프라인 최대 2시간, 낚시 80판정, 작물 18개, 요리 6개는 초기값이다. `shared/autonomy.mjs`에서 조정한다. 다수 사용자 접속 시 100ms 생활 틱의 DB 비용, 재접속 정산 지연, 이벤트/작업 영수증/보고서 보존 기간 및 로그 회전을 측정·설계한다.
5. **기획서 확장 범위**: 친구/여러 플레이어와 AI 공동 낚시, 특정 어종 획득 알림, 지속 사용자 따라가기, 장애물을 피하는 경로 탐색, 선물·판매·전시/수족관, 함께 식사 애니메이션, 취향·성격 기반 활동 선택은 별도 후속 구현이다. 명시적 이동·앉기·물건 운반은 위 아바타 행동 툴 문서의 범위로 구현했다.

## 변경 시 유지할 규칙

- AI는 허용된 구조화 액션만 실행한다. 방문자는 소유자의 생활 행동·인벤토리·관계 기억을 사용할 수 없다.
- 보상은 서버에서만 판정한다. 식재료는 작업 완료 시 원자적으로 소비한다. 희귀/특별 물고기는 자동 요리에 사용하지 않는다.
- 자율 활동은 기본 꺼짐이다. 요리는 정확한 레시피 허용이 있어야 한다. 명시적 중단은 자동 재시작도 막는다.
- 오프라인 정산은 부재 구간당 한 번, 출발 당시 정책으로 처리한다. 보상·소비·기억·보고서·체크포인트는 한 트랜잭션에 저장한다. 서버 재시작 시 마지막 실제 지급 이후부터 계산한다.
- 관계 기억은 실제 공동 참여/첫 발견/첫 수확·요리만 기록한다. 자아 슬롯 간 공유하지 않는다. 잊은 사건을 재생성하지 않는다.
- 익명 설문 답변에는 사용자 ID·닉네임·작성 시각을 연결하지 않는다. 로그에 요청 본문·비밀번호·쿠키·대화/기억 원문을 남기지 않는다.

## 코드와 검증 시작점

| 영역 | 파일 |
| --- | --- |
| 생활 실시간 실행·HTTP/Socket.IO | `server/life.mjs` |
| 자연어 해석·액션 스키마 | `server/lifeActions.mjs`, `server/ai.mjs` |
| 텃밭·요리 트랜잭션 | `server/gardening.mjs`, `shared/garden.mjs` |
| 자율 선택·오프라인 정산 | `server/autonomy.mjs`, `shared/autonomy.mjs` |
| 사실 기억·공통 낚시 지급 | `server/lifeMemories.mjs`, `server/lifeRewards.mjs` |
| UI·월드 | `src/Life.jsx`, `src/life.css`, `src/lifeWorld.js`, `src/Scene.jsx` |
| 저장소·중첩 트랜잭션 | `server/store.mjs` |

Node 22.13 이상을 사용한다. `npm test`는 실제 HTTP/Socket.IO와 메모리/임시 SQLite를 사용하는 전체 회귀 검증이다. `npm run build`로 프런트엔드를 확인한다. 집중 검증은 `node --test --test-concurrency=1 tests/autonomy.test.mjs tests/garden.test.mjs tests/life-actions.test.mjs tests/life.test.mjs`이다.

2026-10-23 UI 후속 수정 후 최종 검증은 **회귀 249개 + Windows 실행기 3개, 합계 252개 통과**, 프로덕션 빌드 성공이다. 최신 로그는 `test-results/phase34-full-regression.log`, `test-results/phase34-launcher.log`, `test-results/phase34-build.log`다. 회귀와 실행기 검증은 별도 프로세스로 실행했다. `tests/action-log.test.mjs`는 실제 게임 서버의 낚시·심기·수확·요리·오프라인 지급 로그와 민감 필드 제외를 검증한다. `tests/windows-launcher.test.mjs`는 임시 디렉터리의 실제 배치파일/PowerShell/감독 프로세스에 경량 HTTP 서버와 터널 대역을 연결해 CMD 종료, PowerShell 강제 종료, 서버 오류 종료에서 하위 프로세스 전체가 사라지는지 검사한다. 실제 Cloudflare 외부 연결 상태와 GUI의 X 버튼 클릭 자체를 자동화한 검증은 아니다.

실행기는 Windows Job Object와 부모 CMD 감시를 사용한다. 같은 프로젝트의 중복 실행은 Mutex로 막는다. 콘솔에 표시되는 행동 로그는 파일에도 누적되며, 시작 실패/터널 종료 시 해당 실행 세션을 함께 종료한다. 초기 검증에서 프로세스 시작 지연이 확인되어 서버 준비 대기 한도를 90초로 두었다. 테스트 로그는 Git에 포함하지 않는 `test-results/final-regression.log`, `test-results/launcher-lifecycle.log`, `test-results/final-build.log`에 남겼다.

`start-server.bat`는 운영 빌드/서버/터널 실행용이다. 창을 열어 둬야 서비스가 유지된다. 로컬 전용 실행은 `start-server.bat -NoTunnel`, 기존 빌드 재사용은 `-SkipBuild`를 추가한다. 개발 HMR은 `npm run dev`로 별도 실행한다. 기본 서버 포트는 3000이며 `.env`의 PORT를 따른다. 이전 3012 탭은 임시 미리보기였으므로 실행 여부를 별도로 확인한다.

이번 사용자 요청에 따라 최신 로컬 서버를 `http://127.0.0.1:3000`에 실행해 두었다. Cloudflare 터널은 시작하지 않았다. 다음 세션에서는 실행 여부부터 확인하고, 과거 세션의 종료 요청을 현재 작업에 소급하지 않는다. `.env`, `data/`, `logs/`, `dist/`, `test-results/`는 Git에 포함하지 않는다.
