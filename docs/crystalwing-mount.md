# Crystalwing 아기용 비행 탈것

기존 Luna 아기용 펫의 표시 모델을 사용자 제공 `Meshy_AI_Crystalwing_Wyrmling_1024102253_texture.fbx`로 교체했다. 원본의 색상·노멀·거칠기·금속성 텍스처를 사용한다. 기존 `survey-dragon-v1` 보상 소유권과 전용 둥지는 유지한다.

## 사용

- 캐릭터 변경·꾸미기 → 내 플레이어 → 탈것 → 아기용 · 비행. 같은 화면에서 아기용 색상을 선택한다.
- 마을에서는 내 아기용 가까이에서 F 또는 화면의 탑승 버튼으로 타며, 탑승 중 F로 내린다. PC에서는 WASD·방향키, 모바일에서는 지면을 터치해 이동한다.
- 비행 고도는 고정이다. 캐릭터 기준점에서 1.5만큼 떠서 아기용 몸통이 서 있는 플레이어의 머리 높이에 온다. 탑승 중 점프로 고도를 추가하지 않는다.
- 미탑승 아기용은 마을 안을 날아다니며, 하차 시 플레이어 옆에 나타난다. 탑승 중에는 별도 아기용을 숨겨 중복 표시를 막는다. 방문자에게도 탑승 외형과 이동을 동기화한다.
- 벤치·낚시 등 앉는 동작에서는 탈것을 숨기고 기존 자세를 복원한다. 기존 강아지·고양이·토끼 펫은 별도로 유지한다. 이전 아기용 펫 선택은 일반 펫으로 표시하고 아기용 보상은 독립된 탈것으로 제공한다.

## 리깅과 자산

- 15,584 triangles, UV 경계 분리 후 18,460 vertices.
- 16본: 몸통·머리, 꼬리 2개, 좌우 날개 2개씩, 네 다리의 상부·발.
- 정규화된 최대 4개 본 가중치. 각 인스턴스의 스켈레톤은 독립적이다.
- `resource/crystalwing/crystalwing-rigged.blend`: 텍스처를 포함한 편집용 리깅과 반복 Flight 액션.
- `public/models/crystalwing/crystalwing-rigged.glb`: 스킨·텍스처·Flight 액션을 포함한 교환용 모델.
- `src/crystalwingSkin.json`, `src/crystalwingDragon.mjs`: 같은 가중치로 브라우저에서 날개·꼬리·다리 동작을 적용한다.
- `src/dragonRide.mjs`: 네 플레이어 모델의 탑승 자세와 비행 이동. 모션 감소 설정에서는 고정 공중 자세를 유지한다.

재생성:

```powershell
& 'C:\Program Files\Blender Foundation\Blender 5.2\blender.exe' --background --factory-startup --python scripts/rig-crystalwing.py -- '<FBX와 텍스처가 있는 폴더>'
node scripts/render-survey-rewards.mjs http://127.0.0.1:5173/
```

이미지 생성과 `scripts/verify-crystalwing.mjs`는 Playwright가 필요하며 `PLAYWRIGHT_MODULE`, `CHROME_EXECUTABLE` 환경변수로 설치 경로를 지정할 수 있다. 후자는 실제 사용자 DB를 건드리지 않는 메모리 서버에서 F 탑승·하차와 이동을 검사하고 `tmp/crystalwing-qa/`에 화면 및 리깅 이미지를 저장한다.
