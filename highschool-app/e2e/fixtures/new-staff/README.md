# 신규 스탭 합성 UI 검증

`npm run test:e2e:new-staff`는 별도 Playwright 설정으로 loopback Vite 서버를 시작하고 종료한다. 운영 앱 설정, Firebase 인증, 운영 DB와 Rules에 연결하지 않는다. 패키지는 앱에 이미 설치된 런타임을 사용한다.

- 실제 `TeamWorkspace`, `TeamsHome`, `HomeStart`, `SiteHelp`, `PraiseAttendance`, `GlobalPortalHeader`, `RetreatAreaNav`, `OperationsHome`, `OperationsGate`, `OverlayShell`, `LoginButton`과 CSS를 렌더한다.
- Auth·DB 서비스 경계만 테스트에서 교체하고 운영 Firebase SDK import를 거부한다.
- 서버를 시작할 때마다 테스트가 소유한 새 임시 Vite 캐시를 만든다. 최초 dependency scan이 동적 패널의 서비스까지 탐색하도록 검증하며 기존 사용자 캐시는 삭제하거나 재사용하지 않는다. 정상 종료 시 이 실행이 만든 임시 캐시만 지운다.
- `MyPageModal`의 지연 로딩 활동 로그도 최초 dependency scan에 포함되므로 `features/activityLog/db`를 서비스 경계에서 교체한다. 실제 활동 로그 조회 UI는 이 합성 fixture의 검증 범위가 아니다. SDK 차단이 발생하면 importer 경로를 포함해 실패하고 `proof.rejected`는 빈 배열이어야 한다.
- Next의 Link·navigation·dynamic 렌더 primitive는 테스트용 anchor·router 기록·React.lazy로 대체한다. 실제 업무 UI와 권한 판정은 대체하지 않는다. Link의 `prefetch=false` 전달과 router prefetch 콜백을 검사하며, 실제 Next RSC 요청을 검증하는 것은 아니다.
- 서버는 `127.0.0.1:4179`에만 바인딩한다. CSP와 브라우저 route가 외부 통신을 차단한다.
- `/__qa__/proof.json`의 Firebase runtime module 목록이 비었는지 매 접근성 시나리오에서 확인한다.
- 출결 입력의 `execute`는 메모리 배열에만 기록한다. 취소에는 호출이 없고 최종 확인에만 기존 command가 전달되는지 검사한다.
- Chromium 390·768·1280px와 모바일 WebKit 390px에서 첫 방문·재방문·계정 전환·홈/팀 안내의 별도 완료 기억·조회자 안내·저장 차단·권한 오류 복구·준비 중 팀과 지난/예정 학기의 안내·일상 표현으로 도움말 검색·도움말에서 이전 팀 화면으로 돌아가기·로그인 오류의 친절한 안내·삭제 확인/키보드 취소·light/dark 접근성과 가로 넘침을 검사한다.
- 일반 스탭에게 전체 영역·팀·운영센터 메뉴가 보이는지, 타팀 실제 컴포넌트에서 구독이 시작되지 않는지, 권한 확인 중·오류 상태에서 이전 권한으로 구독하지 않는지 검사한다. `roleErrorAssigned`는 오류와 이전 역할이 동시에 남은 합성 경계 조건이며 운영 Auth 구현을 변경하지 않는다.
- 실제 OperationsGate에는 구독·마운트 횟수를 세는 합성 자녀를 넣는다. 이 결과는 실제 Accounts 화면이나 서버 데이터 조회 성공을 뜻하지 않는다.
- 모바일 메뉴의 Escape·포커스 복귀, 데스크톱 팀 드롭다운의 키보드 복귀, 권한 거부·운영 메뉴의 light/dark 화면도 검사한다.
- 결과 PNG와 실패 trace는 `test-results/new-staff-local/`에 저장된다.

모바일 WebKit은 iPhone 브라우저 프로필이며 실제 iPhone 기기 검증이 아니다. 이 결과는 Google 로그인, 최신 운영 계정 권한, Next 라우팅, `PortalViewportShell`의 iframe, API/RTDB 저장 성공을 증명하지 않는다. 해당 범위는 인증 가드를 유지한 운영 읽기 전용 확인 또는 별도 서버/에뮬레이터 계약 검증으로 확인한다. 이 파일은 기본 운영 Playwright 설정에서 제외된다. 합성 검증은 전용 명령 `npm run test:e2e:new-staff`로만 실행하며 loopback guard를 유지한다.
