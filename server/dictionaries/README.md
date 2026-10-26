# 끝말잇기 판정 사전

`korean-nouns.txt`는 국립국어원 표준국어대사전의 2018-11-13 표제어를
공개한 [korean-word-game/db](https://github.com/korean-word-game/db)의
[kr_korean.csv](https://drive.google.com/open?id=1PdzYubqcPKAIsHRtWZEFdQ1m4-fba6Oj)에서
추출한 명사 263,893개입니다. 최신 온라인 사전과 차이가 있을 수 있습니다.
뜻풀이, 예문, 미디어는 포함하지 않습니다. 원 제공자는 낱말·품사 자료의
자유로운 가공 및 재배포를 명시하고 있습니다.

가공: 품사가 `명사`인 항목만 선택, 사전의 붙임표 제거, 공백·`^`가 있는
구 및 접사 제외, 현대 한글 2–200글자 제한, 중복 제거 및 정렬.
서버만 읽으며 클라이언트 번들이나 목록 조회 API로 제공하지 않습니다.

재생성: 다운로드한 ZIP 파일(파일명이 csv여도 실제 형식은 ZIP)을 인자로
`python scripts/import-chain-dictionary.py <archive>`를 실행합니다.
원본 ZIP SHA-256:
`d0fcbbee6b0db0d0e1a7af4ba66f3d7b0960d6eeddaa2d54db5462237fc19b8d`
