# PSS 실제 Gemini 전수 검증 결과

2026-10-27 · gemini-3-flash-preview · 실제 빌드 앱/Edge 156.0.4314.42 · 합성 대화만 외부 전송

실제 Gemini 분석 2회·이벤트 대사 생성 2회가 성공했다. 차분한 존댓말 Persona A에서 다정하고 장난스러운 반말 Persona B로 승인·업데이트한 전 과정을 실제 브라우저 UI로 검증했다. 이전 선불 크레딧 소진(HTTP 402)은 결제 후 해소되었다.

Registry 41개 / 활성 7개 / 미지원 34개. 두 버전의 실제 LLM 생성 대사 42개 모두 스키마·정적 경로·게임플레이 실행·UI·일반 선택·강제 선택 100%. 실제 게임 실행 영수증 131개, 브라우저 UI 검사·스크린샷 131개. 일반 게임 이벤트 중 추가 LLM 호출은 없었다.

전체 회귀: 373개 중 370 PASS, 0 FAIL, 기존 배포 테스트 3 SKIP. 별도 Fixture 검증도 42개 전부 PASS. 물리 휴대전화·원격 CI·운영 배포는 이번 테스트 범위에 포함하지 않는다.

각 행의 증거는 실제 UI 스크린샷이다. JSON에는 전체 소스 경로, 실행 ID와 증거 목록을 보존했다. 생활 활동은 정상 Socket/HTTP 게임 경로를 통해 발생시키며, 출력 함수를 직접 호출하지 않는다.

| Event ID | Variant / Version | Static | Gameplay | UI | Natural | Forced | Status | 증거 |
|---|---|---|---|---|---|---|---|---|
| fishing.start | fishing_start_01 / v1 | Yes | Yes | Yes | Yes | Yes | PASS | [화면](../../artifacts/pss/gemini/v1-natural-fishing-start-1-53d455cc-eb04-469f-b699-0cec6c2ab848.png) |
| fishing.start | fishing_start_02 / v1 | Yes | Yes | Yes | Yes | Yes | PASS | [화면](../../artifacts/pss/gemini/v1-natural-fishing-start-2-d7ffa25f-4d4f-436c-835f-27647a0e3909.png) |
| fishing.start | fishing_start_03 / v1 | Yes | Yes | Yes | Yes | Yes | PASS | [화면](../../artifacts/pss/gemini/v1-natural-fishing-start-3-c613f073-d641-49a3-a258-9e7e726cef73.png) |
| fishing.result.success | fish_success_01 / v1 | Yes | Yes | Yes | Yes | Yes | PASS | [화면](../../artifacts/pss/gemini/v1-natural-fishing-result-success-1-0a549800-7760-412c-89bc-2667cedaa6bc.png) |
| fishing.result.success | fish_success_02 / v1 | Yes | Yes | Yes | Yes | Yes | PASS | [화면](../../artifacts/pss/gemini/v1-natural-fishing-result-success-2-c51f8b5c-3ade-4849-9938-dde9227bc7bc.png) |
| fishing.result.success | fish_success_03 / v1 | Yes | Yes | Yes | Yes | Yes | PASS | [화면](../../artifacts/pss/gemini/v1-natural-fishing-result-success-3-1011729b-6244-4afd-8bbc-3feaa6aff211.png) |
| fishing.result.failure | fish_fail_01 / v1 | Yes | Yes | Yes | Yes | Yes | PASS | [화면](../../artifacts/pss/gemini/v1-natural-fishing-result-failure-1-f3231313-65aa-46b3-93bc-0c0a49bb213f.png) |
| fishing.result.failure | fish_fail_02 / v1 | Yes | Yes | Yes | Yes | Yes | PASS | [화면](../../artifacts/pss/gemini/v1-natural-fishing-result-failure-2-0e3bbeb2-a8c6-4b87-9d98-24d65807101b.png) |
| fishing.result.failure | fish_fail_03 / v1 | Yes | Yes | Yes | Yes | Yes | PASS | [화면](../../artifacts/pss/gemini/v1-natural-fishing-result-failure-3-cd38b828-4768-41d9-8d6e-c50cdab2cde0.png) |
| fishing.result.rare | fish_rare_01 / v1 | Yes | Yes | Yes | Yes | Yes | PASS | [화면](../../artifacts/pss/gemini/v1-natural-fishing-result-rare-1-f1a91e6f-2714-43c4-b8e0-925d10a42f92.png) |
| fishing.result.rare | fish_rare_02 / v1 | Yes | Yes | Yes | Yes | Yes | PASS | [화면](../../artifacts/pss/gemini/v1-natural-fishing-result-rare-2-27e47d3a-f9ce-45b3-95e3-d7d599ec9f50.png) |
| fishing.result.rare | fish_rare_03 / v1 | Yes | Yes | Yes | Yes | Yes | PASS | [화면](../../artifacts/pss/gemini/v1-natural-fishing-result-rare-3-73141c3e-f8d3-4d6f-b831-aafcf4fbe04c.png) |
| garden.plant.complete | garden_plant_01 / v1 | Yes | Yes | Yes | Yes | Yes | PASS | [화면](../../artifacts/pss/gemini/v1-natural-garden-plant-complete-1-48bd8989-dae8-415c-b2e5-3c68d49f8234.png) |
| garden.plant.complete | garden_plant_02 / v1 | Yes | Yes | Yes | Yes | Yes | PASS | [화면](../../artifacts/pss/gemini/v1-natural-garden-plant-complete-2-4e09f189-6fda-48c5-b96b-6cfcd4e86da5.png) |
| garden.plant.complete | garden_plant_03 / v1 | Yes | Yes | Yes | Yes | Yes | PASS | [화면](../../artifacts/pss/gemini/v1-natural-garden-plant-complete-3-545402b8-fd9e-4302-9a97-c0bfee71fd53.png) |
| garden.harvest.complete | garden_harvest_01 / v1 | Yes | Yes | Yes | Yes | Yes | PASS | [화면](../../artifacts/pss/gemini/v1-natural-garden-plant-complete-2-d8280875-c6bc-4132-87a1-caea6d54a95f.png) |
| garden.harvest.complete | garden_harvest_02 / v1 | Yes | Yes | Yes | Yes | Yes | PASS | [화면](../../artifacts/pss/gemini/v1-natural-garden-plant-complete-3-5aaf3ed8-22d0-4c06-b967-d11980eb2cf0.png) |
| garden.harvest.complete | garden_harvest_03 / v1 | Yes | Yes | Yes | Yes | Yes | PASS | [화면](../../artifacts/pss/gemini/v1-forced-garden-plant-complete-1-ac402f4a-1cdb-4bd3-bba7-89b21e59bc38.png) |
| cooking.complete | cook_complete_01 / v1 | Yes | Yes | Yes | Yes | Yes | PASS | [화면](../../artifacts/pss/gemini/v1-natural-cooking-complete-1-9423f55d-31e0-4b4f-bbfe-bd9db229e30b.png) |
| cooking.complete | cook_complete_02 / v1 | Yes | Yes | Yes | Yes | Yes | PASS | [화면](../../artifacts/pss/gemini/v1-natural-cooking-complete-2-f6522ccb-2875-47d4-97b5-ff64a5219c01.png) |
| cooking.complete | cook_complete_03 / v1 | Yes | Yes | Yes | Yes | Yes | PASS | [화면](../../artifacts/pss/gemini/v1-natural-cooking-complete-3-8d31817b-fe04-41f7-9e68-733c6c8e5730.png) |
| fishing.start | fish_start_01 / v2 | Yes | Yes | Yes | Yes | Yes | PASS | [화면](../../artifacts/pss/gemini/v2-natural-fishing-start-1-2d9108fd-c59a-471e-802c-155ae7442681.png) |
| fishing.start | fish_start_02 / v2 | Yes | Yes | Yes | Yes | Yes | PASS | [화면](../../artifacts/pss/gemini/v2-natural-fishing-start-2-8f4a396e-bab0-42f3-b2dd-4e78ed99cc83.png) |
| fishing.start | fish_start_03 / v2 | Yes | Yes | Yes | Yes | Yes | PASS | [화면](../../artifacts/pss/gemini/v2-natural-fishing-start-3-7cf528f7-15b5-4e7c-a995-f0e07a8d7e71.png) |
| fishing.result.success | fish_success_01 / v2 | Yes | Yes | Yes | Yes | Yes | PASS | [화면](../../artifacts/pss/gemini/v2-natural-fishing-result-success-1-d5780e32-88ce-4c77-a3b5-b8879b6eb74a.png) |
| fishing.result.success | fish_success_02 / v2 | Yes | Yes | Yes | Yes | Yes | PASS | [화면](../../artifacts/pss/gemini/v2-natural-fishing-result-success-2-71bd4d0c-91db-460f-9ec1-14a8d95f87cb.png) |
| fishing.result.success | fish_success_03 / v2 | Yes | Yes | Yes | Yes | Yes | PASS | [화면](../../artifacts/pss/gemini/v2-natural-fishing-result-success-3-556f7eae-306d-431a-bd97-57cd4b386c0c.png) |
| fishing.result.failure | fish_fail_01 / v2 | Yes | Yes | Yes | Yes | Yes | PASS | [화면](../../artifacts/pss/gemini/v2-natural-fishing-result-failure-1-8bd5267b-7bbe-4e1e-bf17-ca327a40402b.png) |
| fishing.result.failure | fish_fail_02 / v2 | Yes | Yes | Yes | Yes | Yes | PASS | [화면](../../artifacts/pss/gemini/v2-natural-fishing-result-failure-2-4a290b5c-0969-451c-b6e2-edfc785b3265.png) |
| fishing.result.failure | fish_fail_03 / v2 | Yes | Yes | Yes | Yes | Yes | PASS | [화면](../../artifacts/pss/gemini/v2-natural-fishing-result-failure-3-5a91414a-36b1-445b-b1d3-572899a2c733.png) |
| fishing.result.rare | fish_rare_01 / v2 | Yes | Yes | Yes | Yes | Yes | PASS | [화면](../../artifacts/pss/gemini/v2-natural-fishing-result-rare-1-6995f38c-069c-4c32-8c5b-e4ef07e10ca7.png) |
| fishing.result.rare | fish_rare_02 / v2 | Yes | Yes | Yes | Yes | Yes | PASS | [화면](../../artifacts/pss/gemini/v2-natural-fishing-result-rare-2-9ac10d7f-5d5e-4777-864c-1ad5025a7b27.png) |
| fishing.result.rare | fish_rare_03 / v2 | Yes | Yes | Yes | Yes | Yes | PASS | [화면](../../artifacts/pss/gemini/v2-natural-fishing-result-rare-3-c246cb4c-f8b3-491a-aaa7-f5f58455063a.png) |
| garden.plant.complete | garden_plant_01 / v2 | Yes | Yes | Yes | Yes | Yes | PASS | [화면](../../artifacts/pss/gemini/v2-natural-garden-plant-complete-1-e1aee38a-f564-489a-99a3-cbe159354d50.png) |
| garden.plant.complete | garden_plant_02 / v2 | Yes | Yes | Yes | Yes | Yes | PASS | [화면](../../artifacts/pss/gemini/v2-natural-garden-plant-complete-2-7800c0c4-7fde-4a2d-82b9-ef19829daf35.png) |
| garden.plant.complete | garden_plant_03 / v2 | Yes | Yes | Yes | Yes | Yes | PASS | [화면](../../artifacts/pss/gemini/v2-natural-garden-plant-complete-3-953a1e36-7ea3-4b3c-ade8-cfe5efc8375e.png) |
| garden.harvest.complete | garden_harvest_01 / v2 | Yes | Yes | Yes | Yes | Yes | PASS | [화면](../../artifacts/pss/gemini/v2-natural-garden-plant-complete-2-345928e0-2b2f-4bb4-97aa-d3473cfbce6d.png) |
| garden.harvest.complete | garden_harvest_02 / v2 | Yes | Yes | Yes | Yes | Yes | PASS | [화면](../../artifacts/pss/gemini/v2-natural-garden-plant-complete-3-db90794e-3aea-4b00-996a-ea4e004188db.png) |
| garden.harvest.complete | garden_harvest_03 / v2 | Yes | Yes | Yes | Yes | Yes | PASS | [화면](../../artifacts/pss/gemini/v2-forced-garden-plant-complete-1-99caa43b-d4ef-4340-a634-42e970486d30.png) |
| cooking.complete | cook_complete_01 / v2 | Yes | Yes | Yes | Yes | Yes | PASS | [화면](../../artifacts/pss/gemini/v2-natural-cooking-complete-1-a60f2c4a-350d-497a-82e3-2e3c4d933e5e.png) |
| cooking.complete | cook_complete_02 / v2 | Yes | Yes | Yes | Yes | Yes | PASS | [화면](../../artifacts/pss/gemini/v2-natural-cooking-complete-2-3313e089-c970-4296-92aa-7b567531c023.png) |
| cooking.complete | cook_complete_03 / v2 | Yes | Yes | Yes | Yes | Yes | PASS | [화면](../../artifacts/pss/gemini/v2-natural-cooking-complete-3-49adaf05-f9a2-4b71-965f-7fce34d10a36.png) |

[기계 판독 JSON](coverage.json) · [CSV](coverage.csv) · [요약](summary.json) · [Gemini 결과](gemini.json) · [기존 Fixture 검증](fixture-coverage.md) · [이전 402 진단](gemini-initial-402.json) · [아키텍처·검증 범위](../persona-script-system.md)
