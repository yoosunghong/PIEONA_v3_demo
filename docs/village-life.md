# 마을 생활

플레이어가 시설을 클릭하거나 생활 패널의 버튼을 눌러 직접 낚시·심기·수확·요리를 한다. AI 아바타는 대화와 페르소나 기억을 제공한다.

- 낚시: 해안의 빈 자리 가까이에서 E로 시작한다. 45초마다 서버에서 판정하고 획득물을 계정 보관함에 넣는다. 이동·점프·종료 버튼·마을 이탈로 중단한다.
- 텃밭: 세 밭에서 무료 씨앗을 선택한다. 허브 5분, 토마토 10분, 꽃 20분. 부재 중에도 시간에 따라 성장하며 시들지 않는다.
- 요리: 네 기본 레시피를 선택한다. 서버가 재료를 검증하고 완료 시 한 번만 소비한다. 희귀 물고기는 직접 지정해야 사용한다.
- 보관함과 도감: 계정 공용 수량, 획득 시각, 최초 발견을 표시한다.
- 작업 취소: 이동·중단·마지막 탭 이탈은 완료 전 작업을 취소한다. 재료는 완료할 때 차감한다.

## 코드

| 영역 | 파일 |
|---|---|
| 생활 상태·낚시·작업 이동 | server/life.mjs |
| 텃밭·레시피·원자적 재료 소비 | server/gardening.mjs |
| 직접 조작 요청 검증 | server/lifeActions.mjs |
| 낚시 지급 | server/lifeRewards.mjs |
| 시설 UI | src/GardenStudio.jsx, src/KitchenStudio.jsx, src/InventoryStudio.jsx |
| 펫 산책·쓰다듬기·부르기 | server/petRuntime.mjs |

기존 저장 데이터는 유지한다. 과거 운반 중이던 재고는 서버 시작 시 보관함으로 한 번만 반환하는 호환 처리를 남긴다.

검증: npm test 및 npm run build. 생활 회귀 테스트는 tests/life.test.mjs, tests/garden.test.mjs, tests/life-actions.test.mjs에서 확인한다.
