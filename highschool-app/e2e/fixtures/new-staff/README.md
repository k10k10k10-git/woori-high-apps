# 신규 스탭 합성 UI 검증

`npm run test:e2e:new-staff`는 별도 Playwright 설정으로 loopback Vite 서버를 시작하고 종료한다. 운영 앱 설정, Firebase 인증, 운영 DB와 Rules에 연결하지 않는다. 패키지는 앱에 이미 설치된 런타임을 사용한다.

- 실제 `TeamWorkspace`, `TeamsHome`, `PortalHome`, `HomeStart`, `MyPageModal`, `ProgramPreparationClient`, `SiteHelp`, `LibraryHome`, 학기 `CurriculumTab`·`AttendanceTab`·`ArchiveTab`, `PraiseAttendance`, `GlobalPortalHeader`, `RetreatAreaNav`, `OperationsHome`, `OperationsGate`, `OverlayShell`, `LoginButton`과 앱 CSS를 렌더한다.
- Auth·DB 서비스 경계만 테스트에서 교체하고 운영 Firebase SDK import를 거부한다.
- 서버를 시작할 때마다 테스트가 소유한 새 임시 Vite 캐시를 만든다. 최초 dependency scan이 동적 패널의 서비스까지 탐색하도록 검증하며 기존 사용자 캐시는 삭제하거나 재사용하지 않는다. 정상 종료 시 이 실행이 만든 임시 캐시만 지운다.
- 새 캐시의 entry와 정적 import 변환이 끝나기 전 준비 상태는 503이고 완료 후 200이다. 준비 중 SDK import가 거부되면 서버가 실패하며 이번 실행의 임시 캐시만 정리한다. 기존 서버 대기 30초·테스트 45초·expect 8초는 유지한다.
- `features/activityLog/db`도 서비스 경계에서 교체한다. 실제 운영센터 활동 로그 조회 UI는 이 합성 fixture의 검증 범위가 아니다. SDK 차단이 발생하면 importer 경로를 포함해 실패하고 `proof.rejected`는 빈 배열이어야 한다.
- Next의 Link·navigation·dynamic·Image 렌더 primitive는 테스트용 anchor·router 기록·React.lazy·native 이미지로 대체한다. 실제 업무 UI와 권한 판정은 대체하지 않는다. Link의 `prefetch=false` 전달과 router prefetch 콜백을 검사하며, 실제 Next RSC 요청이나 이미지 최적화를 검증하는 것은 아니다.
- Router 객체는 하나로 유지하고 native History의 pushState·replaceState·popstate를 반영해 프로그램 URL 선택을 실제 컴포넌트에 전달한다. 실제 Next Router 구현 자체는 검증하지 않는다. 마이페이지 일반 링크 클릭은 실제 React capture/모달 닫기 뒤 document의 native bubble에서 fixture Link만 목적지를 기록한다. defaultPrevented·보조키·다른 버튼·target·download·외부 origin은 기록하지 않는다. 수정 키 새 탭은 native anchor 동작이며 opener 없는 새 탭도 BrowserContext의 page 이벤트로 받아 URL·기존 창 유지와 격리를 검사한다.
- 실제 프로그램은 전역 헤더와 기존 Theme/ViewMode provider까지 렌더해 운영 CSS의 sticky top:70px 위치를 반영한다. 프로그램 조회·초안·선택 판정은 실제 컴포넌트이고 새 탭 목적지의 실제 운영 화면까지 검증하는 것은 아니다.
- 서버는 `127.0.0.1:4179`에만 바인딩한다. CSP와 BrowserContext route가 외부 통신을 차단한다. 새 탭의 최초 이동도 같은 context 차단을 사용하고, 서비스 워커는 `block`으로 설정해 route를 우회하지 못하게 한다.
- `/__qa__/proof.json`의 Firebase runtime module 목록이 비었는지 매 접근성 시나리오에서 확인한다.
- 출결 입력의 `execute`는 메모리 배열에만 기록한다. 취소에는 호출이 없고 최종 확인에만 기존 command가 전달되는지 검사한다.
- 다른 서비스 쓰기도 `serviceMocks.ts`에서 메모리 기록만 남긴다. `qaState.ts`는 구독의 시작·해제와 scope를 기록하며 해제 직전에 들어온 응답을 전달해 실제 화면의 계정·세대 차단을 확인한다. 운영 API/SDK 호출은 없다.
- `heldSubscriptions`는 지정한 이름·key의 최초 응답만 보류하고 `deliver`는 해제된 구독의 늦은 응답을 전달한다. `writeFailures`는 지정한 합성 쓰기만 정해진 횟수만큼 실패시킨다. 학기 커리큘럼과 팀 목표는 합성 구독 echo로 반영한다. 실제 저장·구독 구현의 성공을 뜻하지 않는다.
- 학기 Storage도 서비스 경계에서 교체한다. 자료 삭제는 실제 UI의 `markArchiveLinkDeleting` → 파일 정리 → 레코드 삭제 순서를 메모리 호출로 확인한다. QA 전용 `sessionStorage`에 합성 자료와 `deletionPending`만 보관해 중간 실패 뒤 새로고침·자료 목록의 링크 제외·삭제 재시도를 검사한다. 실제 Storage 파일이나 운영 RTDB transaction은 실행하지 않는다.
- `보강 회귀` 접두사의 검사는 실제 학기 초안·느린 반 전환·읽기 재구독·삭제 중단 복구·마이페이지 팀 링크를 집중 확인한다. 전체 검사를 반복할 필요가 없는 영향 확인에는 `npm run test:e2e:new-staff -- --grep '보강 회귀' --project=mobile390 --project=mobile-webkit390 --project=wide1280`을 사용한다.
- Chromium 390·768·1280px와 모바일 WebKit 390px에서 첫 방문·재방문·계정 전환·홈/팀 반복 안내 제거와 업무 바로 연결·조회 권한 표시·저장 차단·권한 오류 복구·준비 중 팀과 지난/예정 학기의 안내·일상 표현으로 도움말 검색·도움말에서 이전 팀 화면으로 돌아가기·로그인 오류의 친절한 안내·삭제 확인/키보드 취소·light/dark 접근성과 가로 넘침을 검사한다.
- 일반 스탭에게 전체 영역·팀·운영센터 메뉴가 보이는지, 타팀 실제 컴포넌트에서 구독이 시작되지 않는지, 권한 확인 중·오류 상태에서 이전 권한으로 구독하지 않는지 검사한다. `roleErrorAssigned`는 오류와 이전 역할이 동시에 남은 합성 경계 조건이며 운영 Auth 구현을 변경하지 않는다.
- 실제 OperationsGate에는 구독·마운트 횟수를 세는 합성 자녀를 넣는다. 이 결과는 실제 Accounts 화면이나 서버 데이터 조회 성공을 뜻하지 않는다.
- 모바일 메뉴의 Escape·포커스 복귀, 데스크톱 팀 드롭다운의 키보드 복귀, 권한 거부·운영 메뉴의 light/dark 화면도 검사한다.
- 실제 홈의 다음 일정 세 건·접힌 전체 달력·인증 확인 중 구독/자동 이동 차단·계정 교체 뒤 늦은 응답 차단·일정 편집 취소를 확인한다. 마이페이지는 관리 탭의 운영센터 연결/권한 안내와 개인 요청 계정 경계를 확인한다. 프로그램은 수동 초안의 이동 취소·재시도·계정 변경과 조회자의 비공개 회의 구독 차단, 다섯 개에서 네 개로 줄어든 실시간 목록의 검색 해제를 확인한다. 키보드 취소/초점 복귀는 키보드로 대화상자를 연 뒤 검사해 Safari의 포인터 클릭 초점 정책과 구분한다. 이는 실시간 DB 저장, PIN 값 검증이나 자동 저장 필드 전체를 검증하는 것은 아니다.
- 결과 PNG와 실패 trace는 `test-results/new-staff-local/`에 저장된다.

모바일 WebKit은 iPhone 브라우저 프로필이며 실제 iPhone 기기 검증이 아니다. 이 결과는 Google 로그인, 최신 운영 계정 권한, Next 라우팅, `PortalViewportShell`의 iframe, API/RTDB 저장 성공을 증명하지 않는다. 해당 범위는 인증 가드를 유지한 운영 읽기 전용 확인 또는 별도 서버/에뮬레이터 계약 검증으로 확인한다. 이 파일은 기본 운영 Playwright 설정에서 제외된다. 합성 검증은 전용 명령 `npm run test:e2e:new-staff`로만 실행하며 loopback guard를 유지한다.
