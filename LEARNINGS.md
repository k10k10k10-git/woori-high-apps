# 학습 메모 — 풀이 접근법 기록

> `extract-approach` 스킬이 채우는 파일. 앱 코드 패턴 교훈은 각 앱 CLAUDE.md에, 여기는 워크스페이스·도구·환경 교훈만.

### 서명 없는 .app을 바탕화면 실행기로 쓰면 게이트키퍼가 간헐 차단한다 (2026-07-08)
- **접근법**: ① osacompile로 만든 .app이 `open` 시 error -10810으로 간헐 실패 → ② `spctl -a -vv <앱>`으로 검증하니 `rejected`(ad-hoc 서명이 원인) 확인 → ③ .app을 버리고 이미 검증된 셸 스크립트(`AgentOS.command`)에 Finder 별칭을 걸어 대체 → ④ 서버 kill 후 별칭 open을 3회 반복해 재현성 확인.
- **판단 질문**: xattr 격리 해제(`xattr -cr`)나 codesign 재서명은 하지 않았다 — 격리 속성이 없는데도 rejected였고(원인은 서명 자체), 재서명은 Apple Developer 계정 없이는 근본 해결이 아니며 macOS 업데이트마다 재발 위험이 있어서. lsregister 재등록은 일시적으로만 통했다(신뢰 불가).
- **재사용 규칙**: 이 맥에서 더블클릭 실행기가 필요하면 .app 번들을 만들지 말고 `.command` 스크립트 + Finder 별칭(`make new alias file`)을 쓸 것 — 게이트키퍼 대상이 아니라서 안정적이다.
