# 신규 스탭 합성 UI 검증

`npm run test:e2e:new-staff`는 별도 Playwright 설정으로 loopback Vite 서버를 시작하고 종료한다. 운영 앱 설정, Firebase 인증, 운영 DB와 Rules에 연결하지 않는다. 패키지는 앱에 이미 설치된 런타임을 사용한다.

- 실제 `TeamWorkspace`, `TeamsHome`, `HomeStart`, `SiteHelp`, `PraiseAttendance`, `OverlayShell`, `LoginButton`과 CSS를 렌더한다.
- Auth·DB 서비스 경계만 테스트에서 교체하고 운영 Firebase SDK import를 거부한다.
- 서버는 `127.0.0.1:4179`에만 바인딩한다. CSP와 브라우저 route가 외부 통신을 차단한다.
- `/__qa__/proof.json`의 Firebase runtime module 목록이 비었는지 매 접근성 시나리오에서 확인한다.
- 출결 입력의 `execute`는 메모리 배열에만 기록한다. 취소에는 호출이 없고 최종 확인에만 기존 command가 전달되는지 검사한다.
- Chromium 390·768·1280px와 모바일 WebKit 390px에서 첫 방문·재방문·계정 전환·홈/팀 안내의 별도 완료 기억·조회자 안내·저장 차단·권한 오류 복구·준비 중 팀과 지난/예정 학기의 안내·일상 표현으로 도움말 검색·도움말에서 이전 팀 화면으로 돌아가기·로그인 오류의 친절한 안내·삭제 확인/키보드 취소·light/dark 접근성과 가로 넘침을 검사한다.
- 결과 PNG와 실패 trace는 `test-results/new-staff-local/`에 저장된다.

이 결과는 Google 로그인, 최신 운영 계정 권한, Next 라우팅, `PortalViewportShell`의 iframe, API/RTDB 저장 성공을 증명하지 않는다. 해당 범위는 인증 가드를 유지한 운영 읽기 전용 확인 또는 별도 서버/에뮬레이터 계약 검증으로 확인한다. 이 파일은 기본 운영 Playwright 설정에서 제외된다. 합성 검증은 전용 명령 `npm run test:e2e:new-staff`로만 실행하며 loopback guard를 유지한다.
