# NPC 별과 차분한 우주 테마

## NPC

| 이웃 | 실제 캐릭터 모델 | 색상·별 분위기 | 고정 대화 성향 |
| --- | --- | --- | --- |
| 피오나 | 피오 (`pio`) | 초록색 바닥·식물, 청록 오로라 | 무뚝뚝하고 표현이 서툰 츤데레 |
| 루나 | 루나 (`luna`) | 푸른색 바닥·수정·분수, 은하수 | 발랄하고 도전적인 말괄량이 |
| 토리 | 토리 (`tori`) | 주황색 바닥·피크닉·꽃 조명, 노을 | 밝은 몽상가 |
| 모아 | 모아 (`moa`) | 갈색 바닥·단정한 벤치·편지함, 황혼 | 까칠하고 직설적이지만 모욕하지 않음 |

서버 시작 시 고정 NPC ID만 이전한다. 기존 기본 피오 외형을 해당 캐릭터로 교체하고, 색상·스카프·별 바닥·배경·장식·소개·공개 성향 태그를 적용한다. 일반 플레이어의 데이터와 NPC 방문 기록·방명록 설정은 보존한다. 같은 정의로 재시작하면 revision과 보유 별을 중복 갱신하지 않는다.

마을에는 기존 플레이어용 FBX 캐릭터가 상주하고 각자의 말투로 첫 인사를 한다. 실제 AI의 시스템 프롬프트에 고정 성향을 넣고 로컬 체험 응답에도 같은 성향을 적용한다. 방문자가 성격을 바꾸거나 소유자 기억으로 학습시킬 수 없다. 기본 프롬프트와 로컬 대화에서 정원·피어남 표현을 제거하고 일로바(ILLOVA)·별·광장별·별의 기억 기록으로 바꿨다.

## 아웃라인

선택 전후에 동일한 기본 렌더링 경로를 유지한다. 선택된 물체의 외곽선만 별도 투명 버퍼에 그린 후 더한다. sRGB 배경을 화면 전체 `OutputPass`로 다시 톤 매핑하던 경로를 제거했다. 노출·감마·배경 대비를 바꾸지 않는다.

`node scripts/verify-outline-colors.mjs`는 두 해상도와 픽셀 비율 1·1.5에서 실제 WebGL 픽셀을 비교한다. 네 경우 모두 배경의 변경 픽셀 0, 선택 해제 후 원래 프레임과의 오차 0을 확인했다.

## 배경 생성

내장 image_gen으로 새로 생성했다. 황혼 파일은 변경하지 않았다. 원본 리소스를 덮어쓰지 않고 다음 파일을 사용한다.

- `public/images/space/milky-way-quiet-v1.png`
- `public/images/space/aurora-quiet-v1.png`
- `public/images/space/solar-dusk-quiet-v1.png`

세 요청의 최종 프롬프트는 아래 공통 문장에서 `{theme}`를 각각 치환한 것이다.

> Game background environment, landscape 16:9. A quiet minimal spacious stylized outer space sky for ILLOVA's small floating star village. {theme}. Smooth atmospheric gradients, calm and understated, low contrast, ample empty negative space especially the entire center and lower half for a foreground 3D village. Beautiful polished soft illustration with subtle depth. NOT dramatic, no ornate detail, no bright central spiral galaxy, no explosive nebula, no saturated neon, no dense sparkles, no foreground planets, no structures, no characters, no typography, no interface, no watermark. Colors and highlights should be modest and restful. The dark background should never dominate foreground characters.

은하수: `very subtle distant soft lavender Milky Way haze across the upper third, sparse tiny stars, restrained midnight navy and slate blue`

오로라: `one faint smooth desaturated sage teal aurora ribbon along the upper edge, sparse tiny stars, deep navy and muted teal`

태양 노을: `a very distant small soft warm sun glow near the far upper right, a gentle muted peach dusk haze near the horizon, deep navy and dusty mauve, sparse tiny stars`

## 검증

- `npm run build` 통과.
- `npm test`: 405 통과, 21 기존 제외, 실패 0.
- `node scripts/verify-galaxy.mjs`: 우클릭 평면 이동, 줌, 광장별, 검색·모바일·NPC 방문 검증 통과.
- `node scripts/verify-outline-colors.mjs`: 아웃라인과 배경 픽셀 비교 통과.
- `node scripts/verify-npc-villages.mjs`: 네 캐릭터 모델·별 테마·방문 화면 렌더링 통과.
- 화면: `artifacts/npc-villages/{pio,luna,tori,moa}.png`. 임시 인메모리 DB만 사용한다.
