# PSS 전수 검증 결과

2026-10-27 · fixture (not LLM) · 실제 빌드 앱/Edge 156.0.4314.42 · 고정 시계/난수

전체 373개 테스트: 370 PASS, 0 FAIL, 기존 배포 테스트 3 SKIP. 별도 실제 Gemini 통합 테스트: HTTP 402로 1 FAIL. 전체 완료 상태가 아니다.

Registry 41개 / 활성 7개 / 미지원 34개. 두 버전의 42개 Fixture 대사 모두 스키마·정적 경로·게임플레이 실행·UI·일반 선택·강제 선택 100%. 실제 게임 실행 영수증 131개, 브라우저 UI 검사·스크린샷 131개.

각 행의 증거는 실제 UI 스크린샷이다. JSON에는 모든 소스 경로, 실행 ID와 전체 증거 목록이 있다. HTTP 직접 호출로 출력 함수를 검사한 결과는 이 UI 커버리지에 포함하지 않았다.

| Event ID | Variant / Version | Static | Gameplay | UI | Natural | Forced | Status | 증거 |
|---|---|---|---|---|---|---|---|---|
| fishing.start | fishing.start.1 / v1 | Yes | Yes | Yes | Yes | Yes | PASS | [화면](../../artifacts/pss/fixture/v1-natural-fishing-start-2-7265673e-6e40-4516-81ac-ad11f5b5e017.png) |
| fishing.start | fishing.start.2 / v1 | Yes | Yes | Yes | Yes | Yes | PASS | [화면](../../artifacts/pss/fixture/v1-natural-fishing-start-1-a36c4c25-4052-4151-88f4-c11e37f01d86.png) |
| fishing.start | fishing.start.3 / v1 | Yes | Yes | Yes | Yes | Yes | PASS | [화면](../../artifacts/pss/fixture/v1-natural-fishing-start-3-bb40a5f4-0e12-417b-b67f-8910e43c99d4.png) |
| fishing.result.success | fishing.result.success.1 / v1 | Yes | Yes | Yes | Yes | Yes | PASS | [화면](../../artifacts/pss/fixture/v1-natural-fishing-result-success-2-38eb9627-fb65-47a6-8fe7-00b408e3bde1.png) |
| fishing.result.success | fishing.result.success.2 / v1 | Yes | Yes | Yes | Yes | Yes | PASS | [화면](../../artifacts/pss/fixture/v1-natural-fishing-result-success-1-76428e58-d99f-4ae4-90ea-dbe3984dd57a.png) |
| fishing.result.success | fishing.result.success.3 / v1 | Yes | Yes | Yes | Yes | Yes | PASS | [화면](../../artifacts/pss/fixture/v1-natural-fishing-result-success-3-39afc45e-d69d-4728-a0ac-8ea17b0925b1.png) |
| fishing.result.failure | fishing.result.failure.1 / v1 | Yes | Yes | Yes | Yes | Yes | PASS | [화면](../../artifacts/pss/fixture/v1-natural-fishing-result-failure-1-25c4522b-a979-47f9-81d7-402b63eafb16.png) |
| fishing.result.failure | fishing.result.failure.2 / v1 | Yes | Yes | Yes | Yes | Yes | PASS | [화면](../../artifacts/pss/fixture/v1-natural-fishing-result-failure-2-e1cf815d-a5dd-43eb-90d2-6be0f4b8af00.png) |
| fishing.result.failure | fishing.result.failure.3 / v1 | Yes | Yes | Yes | Yes | Yes | PASS | [화면](../../artifacts/pss/fixture/v1-natural-fishing-result-failure-3-5e2736e6-0c6c-422e-b04c-df8f2c2e1057.png) |
| fishing.result.rare | fishing.result.rare.1 / v1 | Yes | Yes | Yes | Yes | Yes | PASS | [화면](../../artifacts/pss/fixture/v1-natural-fishing-result-rare-2-67ae4977-eba5-4fb0-bd1b-f4e7f93caf77.png) |
| fishing.result.rare | fishing.result.rare.2 / v1 | Yes | Yes | Yes | Yes | Yes | PASS | [화면](../../artifacts/pss/fixture/v1-natural-fishing-result-rare-3-ab2c05f6-5039-42f1-83f0-c897eae56f0b.png) |
| fishing.result.rare | fishing.result.rare.3 / v1 | Yes | Yes | Yes | Yes | Yes | PASS | [화면](../../artifacts/pss/fixture/v1-natural-fishing-result-rare-1-9106ec69-de95-45f9-bcff-fc0b80371cba.png) |
| garden.plant.complete | garden.plant.complete.1 / v1 | Yes | Yes | Yes | Yes | Yes | PASS | [화면](../../artifacts/pss/fixture/v1-natural-garden-plant-complete-2-c25b5c7c-fa12-4c84-a17b-8a544bb98343.png) |
| garden.plant.complete | garden.plant.complete.2 / v1 | Yes | Yes | Yes | Yes | Yes | PASS | [화면](../../artifacts/pss/fixture/v1-natural-garden-plant-complete-1-6cbf094e-fcb8-48ad-8b0c-ce00cccf7463.png) |
| garden.plant.complete | garden.plant.complete.3 / v1 | Yes | Yes | Yes | Yes | Yes | PASS | [화면](../../artifacts/pss/fixture/v1-natural-garden-plant-complete-3-3bd6c73a-09a3-4b7c-8c42-cd57e26023ec.png) |
| garden.harvest.complete | garden.harvest.complete.1 / v1 | Yes | Yes | Yes | Yes | Yes | PASS | [화면](../../artifacts/pss/fixture/v1-natural-garden-plant-complete-3-5289bce8-76b8-4dd8-9eeb-7f8944e96984.png) |
| garden.harvest.complete | garden.harvest.complete.2 / v1 | Yes | Yes | Yes | Yes | Yes | PASS | [화면](../../artifacts/pss/fixture/v1-natural-garden-plant-complete-2-ec782260-abfc-4622-b075-ecfa96a94bc1.png) |
| garden.harvest.complete | garden.harvest.complete.3 / v1 | Yes | Yes | Yes | Yes | Yes | PASS | [화면](../../artifacts/pss/fixture/v1-forced-garden-plant-complete-1-bdfae060-c573-4c01-8488-12f5aed9eef5.png) |
| cooking.complete | cooking.complete.1 / v1 | Yes | Yes | Yes | Yes | Yes | PASS | [화면](../../artifacts/pss/fixture/v1-natural-cooking-complete-2-093ed82d-8d72-458f-9b48-dcb7f17a2a16.png) |
| cooking.complete | cooking.complete.2 / v1 | Yes | Yes | Yes | Yes | Yes | PASS | [화면](../../artifacts/pss/fixture/v1-natural-cooking-complete-1-402cc805-0a02-44f2-816b-7fc4c3a485dc.png) |
| cooking.complete | cooking.complete.3 / v1 | Yes | Yes | Yes | Yes | Yes | PASS | [화면](../../artifacts/pss/fixture/v1-natural-cooking-complete-3-6cac401e-5212-4a0d-8f12-026199ee6463.png) |
| fishing.start | fishing.start.1 / v2 | Yes | Yes | Yes | Yes | Yes | PASS | [화면](../../artifacts/pss/fixture/v2-natural-fishing-start-2-6a224b24-cfa1-443b-bb94-950a8a7756c5.png) |
| fishing.start | fishing.start.2 / v2 | Yes | Yes | Yes | Yes | Yes | PASS | [화면](../../artifacts/pss/fixture/v2-natural-fishing-start-1-607e496b-e120-4445-a534-1841189c34f2.png) |
| fishing.start | fishing.start.3 / v2 | Yes | Yes | Yes | Yes | Yes | PASS | [화면](../../artifacts/pss/fixture/v2-natural-fishing-start-3-66de7a9c-cfa7-438f-91be-d919faec286f.png) |
| fishing.result.success | fishing.result.success.1 / v2 | Yes | Yes | Yes | Yes | Yes | PASS | [화면](../../artifacts/pss/fixture/v2-natural-fishing-result-success-2-a5db788c-3985-4404-809f-f355c93e2d63.png) |
| fishing.result.success | fishing.result.success.2 / v2 | Yes | Yes | Yes | Yes | Yes | PASS | [화면](../../artifacts/pss/fixture/v2-natural-fishing-result-success-1-912a16d4-6905-4d32-883e-a6b27a0ddb37.png) |
| fishing.result.success | fishing.result.success.3 / v2 | Yes | Yes | Yes | Yes | Yes | PASS | [화면](../../artifacts/pss/fixture/v2-natural-fishing-result-success-3-5eecb8bf-fdda-480a-9d09-3cc5fb42ddd3.png) |
| fishing.result.failure | fishing.result.failure.1 / v2 | Yes | Yes | Yes | Yes | Yes | PASS | [화면](../../artifacts/pss/fixture/v2-natural-fishing-result-failure-2-2c8d6a07-d809-4f8c-b3a6-919e328227c4.png) |
| fishing.result.failure | fishing.result.failure.2 / v2 | Yes | Yes | Yes | Yes | Yes | PASS | [화면](../../artifacts/pss/fixture/v2-natural-fishing-result-failure-1-bfdbad78-fa50-4547-aad2-47cd9ce5da1d.png) |
| fishing.result.failure | fishing.result.failure.3 / v2 | Yes | Yes | Yes | Yes | Yes | PASS | [화면](../../artifacts/pss/fixture/v2-natural-fishing-result-failure-3-98af7f93-3637-4233-a84f-1737ac93e80b.png) |
| fishing.result.rare | fishing.result.rare.1 / v2 | Yes | Yes | Yes | Yes | Yes | PASS | [화면](../../artifacts/pss/fixture/v2-natural-fishing-result-rare-3-a8afbd21-708f-4e94-a041-181160267f58.png) |
| fishing.result.rare | fishing.result.rare.2 / v2 | Yes | Yes | Yes | Yes | Yes | PASS | [화면](../../artifacts/pss/fixture/v2-natural-fishing-result-rare-2-5a12ff2e-a609-432b-b562-7b3a5c8a3470.png) |
| fishing.result.rare | fishing.result.rare.3 / v2 | Yes | Yes | Yes | Yes | Yes | PASS | [화면](../../artifacts/pss/fixture/v2-natural-fishing-result-rare-1-4016b0ab-4771-4719-8c63-93430ba974bd.png) |
| garden.plant.complete | garden.plant.complete.1 / v2 | Yes | Yes | Yes | Yes | Yes | PASS | [화면](../../artifacts/pss/fixture/v2-natural-garden-plant-complete-2-dc7a2e4a-f3cd-44e4-920f-e1edebe2af7c.png) |
| garden.plant.complete | garden.plant.complete.2 / v2 | Yes | Yes | Yes | Yes | Yes | PASS | [화면](../../artifacts/pss/fixture/v2-natural-garden-plant-complete-1-03aa00c1-4fbb-4937-95bd-4043341391ed.png) |
| garden.plant.complete | garden.plant.complete.3 / v2 | Yes | Yes | Yes | Yes | Yes | PASS | [화면](../../artifacts/pss/fixture/v2-natural-garden-plant-complete-3-3fc0417c-3e6d-4235-bee5-602d6d216f49.png) |
| garden.harvest.complete | garden.harvest.complete.1 / v2 | Yes | Yes | Yes | Yes | Yes | PASS | [화면](../../artifacts/pss/fixture/v2-natural-garden-plant-complete-3-d250966a-e110-4879-af55-4c002e2ef492.png) |
| garden.harvest.complete | garden.harvest.complete.2 / v2 | Yes | Yes | Yes | Yes | Yes | PASS | [화면](../../artifacts/pss/fixture/v2-natural-garden-plant-complete-2-d09a4a26-af37-428a-99ac-87cf353af9e4.png) |
| garden.harvest.complete | garden.harvest.complete.3 / v2 | Yes | Yes | Yes | Yes | Yes | PASS | [화면](../../artifacts/pss/fixture/v2-forced-garden-plant-complete-1-28a4feff-f654-4381-b9cb-a39f8dfaea10.png) |
| cooking.complete | cooking.complete.1 / v2 | Yes | Yes | Yes | Yes | Yes | PASS | [화면](../../artifacts/pss/fixture/v2-natural-cooking-complete-2-a4892a8e-fe1d-4510-8d9f-b98aba603d15.png) |
| cooking.complete | cooking.complete.2 / v2 | Yes | Yes | Yes | Yes | Yes | PASS | [화면](../../artifacts/pss/fixture/v2-natural-cooking-complete-1-e6c2c7f7-3265-4319-8162-20ad133c4fb7.png) |
| cooking.complete | cooking.complete.3 / v2 | Yes | Yes | Yes | Yes | Yes | PASS | [화면](../../artifacts/pss/fixture/v2-natural-cooking-complete-3-f3cb4d77-77b6-4221-aa98-27f3cfb0ccea.png) |

[기계 판독 JSON](coverage.json) · [CSV](coverage.csv) · [요약](summary.json) · [실제 Gemini 실패](gemini.json) · [아키텍처·미완료 항목](../persona-script-system.md)
