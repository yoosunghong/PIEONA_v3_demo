# 은하 지도

내 별 화면의 **은하 지도** 버튼으로 연다. 기존 **내 별 보기**는 내 광장별·낚시별·농장별 이동을 그대로 제공한다.

- 레벨 3 이상이며 레벨 공개를 허용한 플레이어, 내 계정, NPC 피오나·루나·토리·모아를 표시한다. 내 계정은 레벨에 관계없이 표시한다. 차단 관계는 제외하며 방문 비허용 계정은 정보만 확인할 수 있다.
- `owned_stars`가 보유 수의 기준이다. 기존·신규 계정 모두 기본 별 3개를 지급한다. NPC는 각각 8·6·7·5개를 소유하며 추가 별 이름도 저장한다. 서버 재시작 시 계정·별·경험치를 중복 지급하지 않는다. NPC는 예약된 로그인 불가 사용자명과 임의 자격 증명을 사용한다.
- 별자리 점의 수는 보유 별 수와 정확히 일치한다. 계정 ID에서 만든 난수로 위치를 유지하고 최소 신장 트리로 자연스럽게 연결한다. 플레이어를 장식용으로 만들거나 별 개수를 임의로 늘리지 않는다.
- 광장별은 각 별자리 중앙에 위치하며 별빛·후광·십자 광원이 천천히 반짝인다. 동작 줄이기에서는 정적인 빛을 유지한다.
- 휠 또는 화면의 확대·축소 버튼으로 60–240% 줌을 지원한다. 우클릭 드래그는 좌우 회전과 최대 ±30° 기울기를 조절한다. 검색창·정보 카드는 고정한다. 초기화 버튼 또는 `0` 키로 원래 시점으로 돌아오며 `+`·`−` 키도 사용할 수 있다.
- 친구 탭의 `AvatarBadge`를 그대로 사용한다. 이는 현재 꽃 모양 공통 프로필 아이콘이므로 참고 이미지의 캐릭터 얼굴과는 다르다.
- 호버·키보드 포커스로 흰색 선과 광원을 표시하고 우측 하단에 이름·레벨·경험치·실제 별 수·관계를 보여준다. 참조 이미지의 좋아요·방문자 수는 이 화면에 대응하는 실제 집계가 없으므로 가짜 숫자를 표시하지 않는다.
- 이름·소유 별 이름 검색, 친구·NPC 필터, 데스크톱 16개·모바일 6개 단위 페이지, Escape 닫기, 포커스 제한, 모바일·동작 줄이기를 지원한다.
- `galaxy:travel` 소켓은 이동 직전 세션·차단·방문 허용·레벨·활동 상태를 다시 검사한다. 승인 후 낚시·생활 작업을 종료하고 대상 광장별에 입장한다. 지도 확대 → 도착 화면 렌더링 대기 → 교차 전환으로 연결한다. 실패하면 지도에서 재시도할 수 있다.

## 그래픽

사용자 첨부의 구도·색상·성운·행성을 기준으로 전용 배경을 생성하고, 모든 별자리·이름표·정보 패널·검색창은 별도의 인터랙티브 UI로 구현했다. 픽셀 유사도 95%는 계량 검증하지 않았다. 실제 계정 수·보유 별 수와 기존 친구 프로필 아이콘을 우선해 참조와 달라지는 부분이 있다.

배경 레이어의 밝기를 42%, 채도를 50%로 낮추고 남색 음영을 추가했다. 별자리와 UI의 밝기는 유지해 배경보다 정보를 먼저 읽을 수 있도록 했다.

배경: `public/images/space/galaxy-map.png` (1672 × 941). 생성 방식: 내장 image_gen, 사용자 첨부를 스타일·구도 참조로 사용. 최종 프롬프트:

> Use case: stylized-concept. Asset type: 16:9 game galaxy map background. Reference image is a style and composition reference. Create ONLY the beautiful dark navy blue space backdrop in this reference: luminous small peach-gold spiral galaxy centered at 55% width, 50% height, fine blue and violet nebula dust in an immense tilted elliptical disc, sparse tiny distant stars, huge cropped lavender planet in bottom left corner, cropped violet planet in bottom right corner, small planets at far left upper and far right upper edges, purple clouds on outer edges. Match reference palette, composition and soft polished magical social game rendering closely. Remove ALL UI, text, avatars, name badges, constellation lines, large foreground constellation stars, question marks, pins, panels, buttons. Keep central play area deep navy with low contrast delicate blue cosmic dust so interactive constellations will read clearly on top. No typography, no interface, no icons, no watermark. Landscape 16:9.

## 검증

- `npm run build`
- `npm test`: 398 통과, 21 기존 제외, 실패 0. 이후 이동 소켓 정리: `node --test tests/galaxy.test.mjs tests/stars.test.mjs tests/multiplayer-server.test.mjs` 10 통과.
- `node scripts/verify-galaxy.mjs`: 인메모리 DB로 휠·버튼·키보드 줌과 상하한, 우클릭 회전·기울기, HUD·원경 고정, 광장별 반짝임, 실제 보유 수, 호버 정보, 검색·빈 결과·필터, NPC 방문, 모바일, Escape, 연결 오류 재시도, 방문 허용 변경 후 복구를 검증한다. 실행 환경에서 루프백 연결이 허용되어야 한다.
- 캡처: `artifacts/galaxy/desktop.png`, `rotated.png`, `hover.png`, `travel.png`, `mobile.png`. 캡처용 플레이어 8명은 임시 DB에만 생성하며 운영 데이터는 변경하지 않는다.
