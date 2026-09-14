# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 프로젝트 개요

분당우리교회 고등부 출석 관리 PWA. Firebase Realtime Database를 백엔드로 사용하는 Next.js App Router 앱이며, Firebase Hosting에 정적 배포된다.

동일한 Firebase 프로젝트(`woori-high`)를 공유하는 운영 앱은 2개다:
- **이 앱** (`woori-attendance-next`) — 학생 출석부 (`classes/`, `attendance/`, `events/` 경로 소유)
- **`highschool-app` 통합 플랫폼** — 학기·주일·수련회 행정·이가드 현장 기능. 학생 명단과 출석을 읽고, `canWriteStudentRoster`가 허용한 새친구 단건 등록·검증된 되돌리기만 제한적으로 쓴다.

## 개발 명령어

```bash
npm run dev          # 개발 서버 (localhost:3000)
npm run build        # 정적 빌드 → out/ 폴더
npm test             # Vitest 단위 테스트 실행 (vitest run)
npm run test:watch   # Vitest 워치 모드
firebase deploy --only hosting   # 빌드 + SW 캐시 이름 갱신 + Firebase 배포
firebase deploy --only database  # 보안 규칙만 배포
```

배포 시 `firebase.json`의 predeploy가 정적 build를 먼저 실행한 뒤 `tools/update-cache-version.js out/sw.js`로 **배포 산출물의** `CACHE_NAME`에 밀리초 단위 고유 버전을 넣는다. 원천 `public/sw.js`는 수정하지 않으며, 같은 날 재배포해도 캐시 이름이 달라져 기존 사용자 화면에 업데이트 배너가 표시된다.

## 테스트

### 2026-09-14 예방 점검 후 데이터 보호

- 진급은 `buildPromotionPayload`의 미리보기 스냅샷을 `commitSheetSync`에 전달한다. 목적지 반 잠금 후 전체 명단·해당 연도 출석이 미리보기와 같은지 검사하고 변경되면 중단한다. 명시 교체는 기존 반 복구 사본과 명단·감사를 한 PATCH로 저장하며, 다른 인물/고아 출석의 SID 충돌은 교체 선택과 무관하게 거부한다.
- 같은 반 시트 행도 이름만으로 연결하지 않는다. 생년 또는 본인 전화 근거가 있고 두 필드에 충돌 없는 유일 후보만 사용한다. 식별 불확실/동점은 `ambiguous`이며 `buildSyncPayload`와 적용 버튼 모두 반영을 차단한다. 다른 반 매칭도 강한 식별 근거와 기존 2필드 조건을 함께 요구한다.
- 학생 수정은 원장 키를 id로 정규화하고 열린 시점의 personId와 다르면 중단한다. personId 없는 레거시는 편집 필드 스냅샷이 바뀌면 자동 병합하지 않는다. 표시용 번호 재계산은 신원 변경으로 취급하지 않는다.
- 이동 잠금 소유 UID도 일반 명단·출석 쓰기가 거부된다. Rules는 잠금 없는 일반 저장 또는 소유 잠금을 같은 원자 요청에서 해제하는 확정만 허용한다. 기존 이동의 불변 commit marker 검사도 유지한다. 서버 검사이므로 같은 계정의 다른 탭·기기·통합 앱에도 적용된다.
- 진급·시트 배치는 각 반의 `config/rosterBatchCommits` 불변 표식을 함께 보낸다. 사전 잠금이 사라지거나 표식이 이미 존재하면 서버가 전체 PATCH를 거절하므로, 연결 종료 후 늦게 도착하는 요청도 명단을 덮지 않는다. 표식은 삭제하지 않는다.
- 회귀: `promotion.test.ts`, `sheetSyncCommit.test.ts`, `sheetSync.test.ts`, `studentPersistence.test.ts`, 관리 모달 렌더 테스트. 실제 Rules는 `run-attendance-contracts.mjs`, 정상/충돌 진급과 이동 중 같은 계정 REST 경합은 `run-attendance-browser.mjs`의 Chromium·모바일 WebKit에서 검증한다. 운영 데이터에 합성 레코드를 쓰지 않는다.

### 목양 리포트 (2026-09-09)

- 등반 정착 카드의 `lastPresent`는 첫 4회·8회와 같은 등반일~기준 주일 범위에서만 구한다. 연도 전체 `row.lastPresent`를 카드에 사용하지 않는다. 기록 없음·등반일 누락·출석부 미연결을 구별한다. 연속 결석·이번 주 요약은 결석 횟수순과 마지막 출석 최신순·오래된순을 선택할 수 있으며 날짜 정렬에서 기록 없음은 마지막에 둔다. 두 탭은 정렬 선택을 공유하고 집계 인원은 바뀌지 않는다.

- **2026-09-09 권한 부여 요청**: `attendanceAdmins/{uid}=true`인 실제 출석부 관리자에게 `semesters/{sid}/newFriends` 읽기를 추가한다. `config/pastoralReport/blockedDemoUid`의 문자열이 존재하고 본인 UID와 달라야 하며 공용 데모는 제외한다. 이 설정 쓰기는 `admins` 전권만 허용한다. 학기 상위·다른 하위·비공개·새친구 쓰기 권한은 추가하지 않는다. 아래의 기존 권한 오류 fallback은 네트워크 오류·설정 누락에 대비해 유지한다.

- 일반 관리자 전용 `/pastoral`은 새친구 정착현황 / 연속 결석 / 이번 주 요약을 제공한다. 교사·공용 데모는 `adminNavigation.ts`와 컴포넌트 진입에서 차단한다.
- `pastoralReport.ts`는 현재 연도 기존 classes/attendance/events를 재사용한다. KST 기준 경과 정상 주일만 선택하며, X가 연속 3회 이상일 때만 결석 목록에 표시한다. 미입력·출석은 연속 계산을 끊고 행사 주일은 제외한다. 장결은 별도 필터이며 주간 연락 대상은 일반 학생이다. 최근 출석 직전 3회가 X인 학생을 출석 회복으로 표시한다.
- 새친구는 `pastoralFriends.ts`에서 `semesters/{year}-1/newFriends`, `{year}-2/newFriends`, `{year}-sunday/newFriends`만 구독한다. 기존 Rules 읽기 권한을 유지하고 semestersPrivate를 읽지 않는다. 조회 실패 시 재시도를 표시하고 등반 완료 여부를 확인할 수 없는 명단·집계를 숨긴다. `nf_` ID만으로 등반 완료를 추정하지 않는다.
- 2026-09-09 기준 보완: 통합 앱의 완료 계약과 동일하게 `rosterSync` 또는 과거 `giftDate`가 있는 학생만 정착현황·주간 새친구 집계에 포함한다. 첫 4회·8회는 유효한 기존 giftDate 또는 rosterSync.syncedAt의 KST 날짜부터 정상 주일을 계산하고 미입력 수를 함께 표시한다. 등반일이 없으면 접수일로 대체하지 않고 확인 필요로 표시한다. 기준 주일 이후 등반은 제외한다. rosterSync의 반·학생 ID 또는 현재 연도의 유일한 personId만 연결하고 이름으로 합치지 않는다. 등록 자료의 한 경로라도 실패하면 부분 집계를 전체로 표시하지 않는다.
- 연락처는 기존 출석부 학생 phone/pphone만 전화 링크로 제공한다. 새로운 저장·내보내기·자동 연락은 없다. 인증 세대·연도 전환 시 원장 연결 상태를 폐기하고 이전 구독 응답을 무시한다.
- 회귀 검사는 `pastoralReport.test.ts`, `PastoralReport.render.test.tsx`, `adminNavigation.test.ts`. 합성 브라우저 재현은 `outputs/pastoral-report-20260909/start-fixture.mjs`이며 환경값·운영 SDK를 차단한다.

### 다른 앱의 원장으로 집계할 때 불완전 조회 구분 (2026-09-09)
- **접근법**: `DB_OWNERSHIP.md`와 기존 Rules를 대조 → `pastoralFriends.ts`에서 세 공개 새친구 경로만 구독 → 모두 준비된 경우에만 집계 → 하나라도 실패하면 등록 자료를 비우고 제한·재시도 표시 → `PastoralReport`를 인증 revision·연도 키로 재생성해 이전 응답 폐기.
- **판단 질문**: 출석부 admin 역할을 통합 앱 새친구 조회 권한으로 간주하지 않았다. 최초 구현은 출석부 연결 명단을 제한 표시했지만, 2026-09-09 등반 완료 학생만 표시하도록 요구가 구체화되어 이 대체 명단을 제거했다. 완료일 없이 정착 상태를 추정하지 않는다.
- **재사용 규칙**: 다중 원장 집계는 전체 준비·실패·부분 범위를 구분하고, 읽기 실패를 0명 또는 정상으로 표현하지 않는다.

### 정착 리포트의 대상과 관찰 시작점을 실제 완료 계약에 맞추기 (2026-09-09)
- **접근법**: 통합 앱 `deriveNewFriendRosterProgress()`와 취소 payload를 대조 → 완료 표식과 완료일만 공개 원장에서 투영 → `buildPastoralReport()`에서 대상 필터와 관찰 시작일을 함께 적용 → 미완료·취소·날짜 누락·KST 경계·주간 요약을 회귀 검사한다.
- **판단 질문**: 등록 결정이나 `nf_` 접두어는 등반 완료 증거가 아니므로 단독으로 사용하지 않는다. 등반 이후 정착을 묻는 지표에 접수일부터의 출석을 섞지 않고, 기존 giftDate 완료 기록은 유지한다.
- **재사용 규칙**: 단계 완료 이후의 지표는 원본 앱의 완료·취소 계약과 시작 시점을 동시에 확인하고, 명단·분모·요약·오류 대체 목록을 같은 기준으로 바꾼다.

Vitest 기반 단위 테스트. 설정 파일은 `vitest.config.ts`이며 `@/` alias가 `./src`로 해석된다.

테스트 파일 위치: `__tests__/`
- `calcStats.test.ts` — `calcStats()` 출석 통계 계산 함수 테스트
- `dates.test.ts` — `evKey()`, `getSundaysForYear()`, `buildHolidayRanges()`, `emailToKey()`, `escapeHTML()`, `sortAndRenumber()` 등 날짜/유틸 함수 테스트
- `firebaseDataLifecycle.test.ts` — 계정·연도·재조회 세대 전환, 원장 준비·오류 상태, 오래된 구독·역할 응답 차단
- `chartSetup.test.ts` — Chart.js 동시 로딩 공유, 실패 후 재시도, 화면 해제 뒤 콜백 차단
- `yearRollover.test.ts` — KST 연도 전환과 마지막 예약 타이머 해제
- `adminNavigation.test.ts` — 관리자 첫 진입·직접 링크 보존, 교사·공용 데모의 관리자 화면 제한
- `adminDashboard.test.ts` — 주간 현황·검색·정렬, 장결 포함 출석 통계와 장결 제외 입력 업무의 분모 구분
- `attendanceEntry.test.ts` — 관리자 선택 날짜 전달, 행사·잘못된 키 복구, 교사·데모의 최근 4회 제한

새 유틸 함수를 추가하거나 변경할 때는 `__tests__/`에 대응하는 테스트를 작성한다.

## 아키텍처

### 디렉토리 구조

```
src/
  app/                       # Next.js App Router 라우트 (각 탭의 단순 래퍼)
    layout.tsx
    page.tsx                 # 일반 관리자 → /dashboard, 교사·데모 → /attendance
    dashboard/page.tsx        # → OverallTab (통합 전체 현황)
    attendance/page.tsx       # useSearchParams 사용 탭을 Suspense로 감쌈
    manage/page.tsx
    stats/page.tsx
    overall/page.tsx
    admin/page.tsx
  components/
    AppShell.tsx             # 인증 게이트, 역할별 셸, Toast, UpdateBanner
    ClassTabBar.tsx          # 반 선택 탭 바 (공유 컴포넌트, role="tablist")
    ErrorBoundary.tsx
    FirebaseDataLoader.tsx   # onValue 구독 담당, 렌더링 없음
    DataLoadGate.tsx         # 세 원장 준비 확인, 지속 오류·지연 안내와 재시도
    ChartLoadState.tsx       # 차트 모듈 로딩·실패·재시도 표시
    LoginScreen.tsx
    TabNav.tsx
    Toast.tsx
    TopBar.tsx
    UpdateBanner.tsx
    admin/
      AdminWorkspace.tsx     # 관리자 사이드바·연도·연결 상태·반 필터
      AdminDashboard.tsx     # 주간 입력 현황·반 검색·선택 날짜로 출석부 이동
      AdminIcon.tsx
      admin-workspace.css    # 관리자 셸 범위 스타일
      admin-dashboard.css    # 관리자 대시보드 범위 스타일
    modals/
      AddClassModal.tsx
      AttModal.tsx
      HistoryModal.tsx       # createPortal → document.body (iOS Safari 대응)
      MoveStudentModal.tsx
      RosterModal.tsx
      StudentModal.tsx
      TeacherModal.tsx
      TrashModal.tsx
    tabs/
      AttendanceTab.tsx
      ManageTab.tsx
      StatTab.tsx
      AdminTab.tsx
      OverallTab.tsx         # 통합 전체 현황 (주간 출석·연간 추이/명단/건의사항)
      overall/               # OverallTab 서브 컴포넌트
        OverallDashboard.tsx   # 출석 통계 차트 + 반별 출석률 테이블
        TeacherManagement.tsx  # 교사 명단 관리 (부장/회계/행정, 담임 추가정보)
        StudentListSection.tsx # 전체 학생 명단 내보내기 (CSV/XLSX/PDF)
        SuggestionsSection.tsx # 교사 건의사항 조회·삭제
  hooks/
    useAuth.ts
    useFirebaseData.ts
    useChartJs.ts            # 차트 로딩 상태·재시도·effect 해제 공용 처리
  lib/firebase/
    client.ts
  store/
    AppContext.tsx            # useReducer 전역 상태 + 셀렉터 함수
  types/
    index.ts
  utils/
    adminDashboard.ts        # 원장 기반 주간 현황 순수 모델
    attendanceEntry.ts       # 역할별 편집 주일과 URL·수동 날짜 선택
    chartSetup.ts            # Chart.js 공유 초기화 (중복 등록 방지)
    dates.ts                 # 날짜·주일·출석 키 계산
    yearRollover.ts          # 실제 KST 달력 연도 변경 감지·타이머 종료
    export.ts                # CSV/XLSX/PDF 내보내기 공유 유틸
    image.ts                 # 학생 사진 압축 (캔버스 리사이즈, 320px·JPEG 0.72)
    toast.ts
  lib/
    adminNavigation.ts       # 관리자 메뉴·진입·화면 접근 정책
    sheetSync.ts              # 구글 시트 → Firebase 동기화 로직 (장결자 감지 포함)
__tests__/                   # Vitest 단위 테스트
  calcStats.test.ts
  dates.test.ts
vitest.config.ts
database.rules.json          # Firebase RTDB 보안 규칙 (운영 앱 2개의 단일 Rules 원천)
```

### 라우팅 vs. 탭 구조

Next.js App Router 라우트(`/dashboard`, `/attendance`, `/manage`, `/stats`, `/overall`, `/admin`)는 해당 화면 컴포넌트를 렌더링하는 래퍼다. `AppShell`은 일반 관리자에게 `AdminWorkspace`를, 교사와 공용 데모에게 기존 `TopBar`·`TabNav` 셸을 보여 준다. 인증과 데이터 구독은 공통이다.

```
layout.tsx
  └── AppProvider (전역 상태 — useReducer)
        └── AppShell (인증 게이트, 역할별 셸, Toast, UpdateBanner)
              └── AdminWorkspace 또는 교사·데모의 TopBar / TabNav 셸
              └── FirebaseDataLoader (onValue 구독 담당, 렌더링 없음)
              └── DataLoadGate (classes·attendance·events 준비 확인)
                    └── [page] → AdminDashboard / AttendanceTab / ManageTab / StatTab / OverallTab / AdminTab
```

`OverallTab`은 내부에 자체 탭 UI(대시보드 / 교사·학생 명단 / 건의사항)를 가지며, 각 서브 페이지를 `overall/` 디렉토리의 독립 컴포넌트로 분리해 렌더링한다.

### 관리자 작업 공간과 주간 현황

- `src/lib/adminNavigation.ts`의 `canUseAdminWorkspace(role, isDemo)`는 **일반 관리자 계정만** 관리자 셸에 진입시킨다. `/dashboard`·`/overall`·`/admin`은 교사·공용 데모에게 열지 않는다. 일반 관리자의 인증 세션 첫 기본 진입은 `/dashboard`로 이동하며, 이미 선택한 작업과 `/attendance?week=…` 직접 링크는 `createAdminEntryTracker()`가 보존한다. `/admin`은 기존 계정·설정 화면이고 새 대시보드 주소는 `/dashboard`다.
- `AdminWorkspace`는 대시보드·출석 입력·학생 관리·반별 통계·전체 현황·계정·설정 메뉴와 조회 연도·연결 상태·로그아웃을 제공한다. 반 단위 화면에만 부서·학년 필터를 표시한다. `DataLoadGate`의 원장 준비 조건과 오류 재시도는 두 셸에서 동일하게 유지한다.
- `AdminDashboard`는 기존 `classes/{year}`·`attendance/{year}`·`events/{year}` 구독 결과만 계산하며 구독이나 저장 경로를 추가하지 않는다. `buildAdminDashboard()`의 기본 날짜는 최근 KST 경과 정상 주일이며, 과거 연도는 마지막 정상 주일, 미래 연도는 첫 정상 주일이다. 행사 주일은 제외하고 반·교사·학생 검색은 해당 반의 전체 현황을 반환한다.
- **출석 통계와 입력 업무는 분모가 다르다.** `studentCount`·`recorded`·`present`·`attendanceRate`는 기존 전체 현황처럼 장결자를 포함하며 출석률은 `O / (O + X)`다. 이전 `T`는 `O`로 먼저 정규화한다. 입력률·미입력 인원·완료 상태는 실제 출석 체크 대상인 일반 학생만 사용한다(`inputStudentCount`, `inputRecorded`). 일반 20명 전원 입력·장결 1명 미기록은 입력 완료다. 전원 장결 반은 `no-targets`, 빈 반은 `no-students`, 조회할 정상 주일이 없으면 `no-week`로 구분하고 입력 대기 반에 넣지 않는다.
- 대시보드에서 반을 열면 부서·학년·반·학기를 선택한 뒤 `/attendance?week={주일 키}`로 이동한다. `buildAttendanceEntry()`는 관리자의 해당 연도 정상 주일 전체와 교사·데모의 최근 4회 목록을 분리한다. URL 날짜는 허용 목록 안에서만 적용하고 행사·잘못된 키는 기본 날짜로 복구한다. 콤보의 유효한 수동 선택이 URL보다 우선하며, 출석 페이지의 `Suspense`는 `useSearchParams`를 사용하는 정적 export에 필요하다.
- 공용 데모의 자동 로그인·부서·학년·반 선택·관리자 접근 버튼 흐름은 유지한다. 관리자 셸을 만들기 위해 데모 계정의 실제 권한·환경값을 바꾸거나 별도 인증 구독을 추가하지 않는다. 화면 제한을 Firebase Rules의 새로운 보안 경계로 설명하지 않는다.

### 공유 컴포넌트

- **`ClassTabBar`**: 반 선택 UI. `role="tablist"` + `role="tab"` + `aria-selected` 적용. `AttendanceTab`, `ManageTab`, `StatTab`에서 공유한다.

### 공유 유틸리티

- **`src/utils/export.ts`**: `downloadCSV()`, `downloadXLSX()` (xlsx 라이브러리 dynamic import), `openPrintWindow()` — `StatTab`과 `StudentListSection`에서 사용.
- **`src/utils/chartSetup.ts`**: `getChart()` — Chart.js의 동시 로딩과 등록 결과를 공유하고, 실패한 Promise는 비워 다음 요청에서 다시 시도한다. `createChartLoader()`의 반환 함수는 effect cleanup에 연결해 화면 해제 뒤 성공·실패 전달을 막는다. `StatTab`과 `OverallDashboard`는 `src/hooks/useChartJs.ts`와 `ChartLoadState`로 로딩·오류·명시 재시도를 공유하며, 차트 로딩 실패 중에도 원장으로 계산한 표는 사용할 수 있다.
- **`OverallDashboard` 차트 수명**: 네 차트는 각각 자신의 입력에 의존하는 effect에서 생성·해제한다. 주차별 학년 차트의 부서 필터와 학년별 월간 출석률 차트의 부서 필터를 바꿀 때 해당 차트만 재생성한다. 반별 테이블 필터를 차트 effect에 연결하지 않는다. 출석 분모·장결 포함 기준은 기존 계산을 유지한다.

### 전역 상태 (`src/store/AppContext.tsx`)

`useReducer` 기반의 단일 Context. **모달 open/close 상태도 모두 여기서 관리**한다. 컴포넌트에서 직접 `useState`로 모달을 열지 않고 `dispatch({ type: 'OPEN_*_MODAL' })` 패턴을 사용한다.

주요 셀렉터 함수 (같은 파일에서 export):
- `isDataReady(state)` → 역할이 있고 `classes`·`attendance`·`events`가 모두 성공 응답을 받았으며 오류가 없는지 판정
- `useClassKey(state)` → 현재 선택된 반의 키 (`"1-2-3"`)
- `useClassKeys(state)` → 현재 부/학년의 반 키 목록 (교사 계정이면 본인 반만)
- `useCurrentStudents(state)` → 현재 반 학생 배열
- `calcStats(state, ck, sid)` → 한 학생의 출석 통계

**원장 세대와 편집 게이트**: 계정 역할·조회 연도 변경과 `RETRY_DATA_LOAD`는 `resetData()`를 통해 `dataRevision`을 증가시키고 이전 명단·출석·커스텀 행사·계정 목록·모달 편집 대상을 함께 비운다. 구독의 성공·오류 action 및 `AdminTab`의 `SET_ALL_USER_ROLES`는 요청 시점 revision을 전달하고, reducer가 현재 세대와 다른 응답을 거부한다. 연도 전환 시 행사 맵은 새 연도의 공휴일과 빈 커스텀 행사로 다시 계산해 이전 연도 행사 제외 조건을 남기지 않는다.

`DataLoadGate`는 세 원장의 첫 성공 응답 전이나 어느 하나의 오류가 남아 있을 때 페이지 내용을 열지 않는다. 성공한 빈 원장은 정상 응답이며, 실패를 빈 데이터의 성공으로 바꾸지 않는다. 실패한 구독은 같은 세대의 후속 콜백도 거부하고 화면의 `다시 불러오기`로 새 세대에서 구독한다. 구독 컴포넌트와 상단의 연결 상태·로그아웃·연도 선택은 게이트 밖에 유지한다. 이 처리는 클라이언트 상태만 비우며 운영 DB를 삭제하거나 Rules 권한을 바꾸지 않는다.

### Firebase 데이터 구조

**클래스 키 (ck)**: `"{part}-{grade}-{class}"` (예: `"1-2-3"` = 1부 2학년 3반)

**학생 ID (sid)**:
- 일괄 임포트된 학생: `S{grade}{class}_{num:02d}` (예: `S23_01`, `S311_01`)
- 앱에서 추가된 학생: `s_${Date.now()}`

`personId`는 연도별 sid와 별개인 영구 인물 식별자다. 기존 sid·`pid`·출석 경로는 원칙적으로 유지하되, 2026-09-12 승인된 수동 이동의 목적지 충돌 SID 분리는 아래 이동 패턴을 따른다. 학생 추가·명단 교체·시트 동기화·진급·이동·편집에서 `person_student_*` 값을 보존한다. 다른 연도 학생은 정규화 이름·생년월일·같은 부서·정상 진급선(`학년 차이 === 연도 차이`)이 일치하고 각 연도 후보가 한 명뿐일 때 과거 ID를 재사용한다. 연락처 변경·누락은 허용하지만 같은 연도 다른 ID와 보호자 연락처 단독 일치는 분리한다. 교사·스탭 명단은 각각 `person_teacher_*`, `person_staff_*` namespace를 사용한다.

**출석 셀 키**: `evKey(mi, di)` = `"{monthIndex}-{sundayIndex}"` (예: `"0-0"` = 1월 첫 번째 주일, `"4-1"` = 5월 두 번째 주일). `mi`는 0부터 시작하는 월 인덱스, `di`는 해당 월의 주일 순번.

**출석 값 (AttValue)**: `"O"` (출석) / `"X"` (결석) / `""` (미입력). 이전 저장값 `"T"`는 읽기·이관 시 `"O"`로 정규화한다.

**Firebase DB 경로**:
```
classes/{year}/{ck}/
  teacher          string
  teacherPhoto     string
  students/{sid}/  { id, personId?, num, name, birth, phone, pphone, school, addr, photo, jang? }
                   # jang: true = 장결자(장기결석) — 구글 시트 동기화 시 자동 표시(아래 참조)
  adminChanges/{changeId}/ { changedAt, classKey, teacher, studentName, action, changeSummary, result, actor }

attendance/{year}/{ck}/{sid}/{cellKey}  → "O" | "X"  # 이전 "T"는 "O"로 정규화

events/{year}/{key}/   { month, day, label }   (관리자 등록 커스텀 이벤트)

userRoles/{emailKey}/  { role, part, grade, class, name, email }
  emailKey = email.replace('.', '__dot__').replace('@', '__at__')

trash/{year}/students/{backupKey} (학생 사본; 본문 id·ck 유지, 기존 sid 키도 호환)
trash/{year}/classes/{backupKey}  (반 사본; 본문 ck 유지, 기존 ck_ 키도 호환)

suggestions/{year}/{ck}/       (교사 건의사항)
teacherData/{year}/{part}/     (교사 명단)
teacherSpecial/{year}/{part}/  (부장/회계/행정)
teacherExtra/{year}/{part}/{ck}/  (담임 추가정보)
```

### 날짜/출석 키 계산 (`src/utils/dates.ts`)

- `getSundaysForYear(year)` → 연도의 모든 주일을 월별로 반환 (`MonthEntry[]`)
- `buildHolidayRanges(windowYears)` → 설날/추석 연휴 범위 (2024–2030 하드코딩)
- `buildEvents(...)` → 연휴 + 커스텀 이벤트를 합쳐 `EventsMap` 반환
- `evKey(mi, di)` → `"${mi}-${di}"` 형식 셀 키
- 이벤트 맵에 키가 있는 주일은 출석 통계 계산에서 제외됨

### CSS

CSS 모듈은 사용하지 않는다. 기존 공통 스타일은 `src/app/globals.css`에 있고, 관리자 전용 스타일은 `src/components/admin/admin-workspace.css`·`admin-dashboard.css`에서 `.admin-workspace`·`.admin-dashboard` 범위로 적용한다. 교사·데모의 기존 셸 스타일을 관리자 재설계로 덮어쓰지 않는다. `:root`에 CSS 변수 정의:
- 색상: `--primary` (`#9B8DD4` 보라), `--green`, `--red`, `--amber` 및 각각의 `-bg`, `-text` 변형
- 레이아웃: `--radius` (`10px`), `--radius-lg` (`16px`), `--shadow`, `--shadow-lg`
- 모달: `.modal-overlay` + `.modal-sheet` (바텀 시트), `.modal-overlay.center-modal` (중앙 다이얼로그)

컴포넌트 내 인라인 스타일에서 `var(--primary)` 등 CSS 변수를 직접 참조하는 패턴이 많다.

### 모달 패턴

대부분의 모달은 `.modal-overlay` + `.modal-sheet` 구조(하단 바텀 시트)다.

**접근성**: 모든 모달 컴포넌트에 `role="dialog"`, `aria-modal="true"`, ESC 키 닫기 핸들러가 적용되어 있다. 새 모달을 만들 때 이 패턴을 반드시 따른다:
```tsx
// 표준 모달 접근성 패턴
<div className="modal-overlay" role="dialog" aria-modal="true">
  {/* ESC 핸들러 */}
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, []);
</div>
```

적용된 모달: `StudentModal`, `HistoryModal`, `AttModal`, `AddClassModal`, `MoveStudentModal`, `TeacherModal`, `TrashModal`, `RosterModal`, `TeacherManagement` 내부 모달.

**중요 예외 — `HistoryModal`**: iOS Safari에서 `.content-area`의 `-webkit-overflow-scrolling: touch`가 stacking context를 만들어 `position: fixed` 모달이 TabNav 뒤로 갇히는 문제가 있다. 이 모달만 `createPortal(..., document.body)`로 `document.body`에 직접 렌더링한다. 같은 문제가 다른 모달에서 발생하면 동일하게 해결한다.

바텀 시트 드래그 닫기는 native `addEventListener`를 사용한다 — React 합성 이벤트의 `onTouchMove`는 passive라 `preventDefault()` 불가. `dismiss` 콜백은 `useCallback(fn, [])` (빈 deps)로 고정하고, `onClose` prop은 ref(`onCloseRef`)에 보관해 Firebase 실시간 업데이트로 인한 리렌더링 시에도 리스너가 교체되지 않도록 한다.

### 인증 및 권한

- `admin`: 모든 반 읽기/쓰기, 학생/반 추가·삭제, 계정 관리, 이벤트 등록, 진급 처리
- `teacher`: 본인 반(`part-grade-class`) 명단 조회, 출석 수정, 건의사항 작성. 학생·반 관리 UI는 관리자 전용

**관리자 권한 노드는 두 개다 (2026-08-06 분리).** `userRoles.role`은 화면 UI용이고, 실제 DB 권한은 아래 노드가 결정한다.

| 노드 | 부여 대상 | 이 앱 | 고등부 사역 플랫폼 |
|---|---|---|---|
| `admins/{uid}` | 플랫폼 통합관리자 | 전권 | 전권 + 역할 배정 + 민감정보 |
| `attendanceAdmins/{uid}` | 출석부 전용 관리자 | 전권 | **접근 불가** |

출석부만 맡는 계정에는 반드시 `attendanceAdmins`를 준다. `admins`를 주면 학기·수련회·이가드 전권과 역할 배정 권한까지 함께 간다. 두 노드 모두 **앱에서 스스로 부여할 수 없다**(기존 관리자만 쓰기 가능) — 최초 1건은 Firebase Console에서 넣고, 이후에는 기존 관리자가 추가한다. `loadUserRole`은 부여 시도를 하지 않고 보유 여부만 확인해 안내한다.

교사 권한의 단일 원천은 이메일이 일치하는 `userRoles/{emailKey}`다. Rules가 `auth.token.email`로 키를 만들고 저장된 `email`·`role=teacher`·`part-grade-class`를 함께 검사한다. `teacherClasses/{uid}`는 관리자만 쓰는 레거시 매핑이며 권한 판정과 로그인에 사용하지 않는다.

`AppShell`은 인증 변경 직후 이전 역할을 비우고, 역할 조회의 성공·실패가 현재 요청 번호와 실제 `auth.currentUser` UID에 해당하는지 검사한다. `loadUserRole()`의 `isCurrent` 검사를 제거하거나 로그인 버튼의 성공 콜백만으로 앱을 열지 않는다. 로그인 성공 뒤 화면 진입은 이 인증·역할 판정의 완료를 따른다. `useAuth`의 비동기 인증 처리에도 같은 오래된 응답 차단을 유지한다.

**읽기 권한도 본인 반으로 제한됨**: `classes`/`attendance`의 `.read`는 admin·retreatAdmins·iguardMembers·attendanceAdmins에 전체 범위를 주고, 교사는 위 `userRoles` 계약으로 파생한 본인 반만 허용한다. `useFirebaseData.ts`도 교사 로그인 시 `classes/{year}/{ck}`와 같은 반 출석만 구독하며 `loadUserRole`은 DB 쓰기 없이 화면 선택을 맞춘다. 교사 출석 쓰기는 본인 반 명단에 실제로 존재하는 학생 한 명에 한정하고 학생 이동 잠금 중에는 거부한다.

### 데모 모드 (`src/lib/demo.ts`) — 교사 테스트 기간 한정, 끝나면 되돌린다

로그인 대신 **부서·학년·반을 골라** 그 반 담임처럼 보게 하는 임시 접속 방식. 화면 뒤에서 **공용 데모 계정 하나로 로그인**하고, 고른 반만 보이도록 **화면에서** 제한한다 — 보안 규칙이 모든 읽기에 인증을 요구하므로 "로그인 없음"은 불가능하다.

- 켜고 끄기: `.env.local`의 `NEXT_PUBLIC_DEMO_MODE`(`1`/`0`) + `NEXT_PUBLIC_DEMO_EMAIL`·`NEXT_PUBLIC_DEMO_PASSWORD`. **0으로 되돌리고 재배포하면 원래 로그인 화면으로 완전히 복귀**한다(다른 코드 경로를 건드리지 않는다).
- 데모 계정에는 `attendanceAdmins`를 준다. 공용 계정 하나로 여러 반을 고르는 데모는 이메일에 고정된 교사 반 권한으로 표현할 수 없으므로 전체 출석부 권한을 쓰고, 보이는 반은 데모 화면에서만 제한한다.
- 반 제한은 UI 계약일 뿐 **보안 경계가 아니다**. 그래서 `AppShell`의 `ADMIN_ONLY_PATHS`가 `/admin`·`/overall`을 셸에서 막는다 — 탭만 감추면 주소를 직접 입력해 관리 기능(진급·명단 교체·계정 관리)에 닿을 수 있고, 데모 계정은 그게 실제로 성공한다.
- 역할은 `buildDemoRole`이 만드는 `role: 'teacher'`다. `admin`으로 만들면 전체 반이 보인다. 이름에 `(데모)`가 붙어 학생 정보 수정 시 남는 `adminChanges.actor`에서 실제 담임과 구분된다.
- 현재 선택은 `demoSelection`, 직전 선택은 `demoLastSelection`에 따로 저장한다. `반 바꾸기`는 현재 선택만 비우므로 선택 화면에서 직전 반을 한 번에 다시 열 수 있다.
- ⚠ 데모 계정 정보는 정적 번들에 그대로 들어간다. 주소를 아는 사람은 누구나 쓸 수 있으므로 **테스트 종료 시 계정 삭제 + `DEMO_MODE=0` 재배포**가 한 세트다.

### 교사 출석 입력·장결 분리 (`AttendanceTab.tsx`)

- 출석 체크 화면은 행사·휴일을 제외한 오늘까지의 최근 정상 주일 4회를 제공한다. 주일 당일에는 그 날짜가 첫 기본 선택이 되고, 교사는 나머지 최근 주일을 골라 수정할 수 있다. 관리자는 기존처럼 전체 정상 주일을 수정할 수 있다.
- 저장은 기존 단일 경로 `attendance/{year}/{ck}/{sid}/{weekKey}`만 쓴다. 저장 중·실패·재시도 안내는 유지하고 성공 안내는 2초 뒤 자동으로 닫아 모바일 명단을 가리지 않는다. 새 큐 노드나 일괄 쓰기를 만들지 않는다.
- `jang === true` 학생은 일반 출석 체크·통계·내보내기에서 제외하고 별도 접이식 명단으로 보여 준다. 장결 판정은 학생 ID가 아니라 `jang` 필드만 사용한다.

### 통계 임시 노출 플래그 — 정식 버전에서 되돌린다

- 교사 테스트 기간에는 `src/lib/releaseFlags.ts`의 `SHOW_ATTENDANCE_RISK_SECTIONS = false`로 통계 탭의 `출석 등급 분포`와 `주의 학생` 영역을 숨긴다.
- 정식 버전 출시 시 이 값을 `true`로 바꾸고 재배포하면 두 영역이 기존 계산 로직과 함께 다시 표시된다.
- Firebase Hosting predeploy는 빌드가 끝난 뒤 `out/sw.js`에 밀리초 단위 고유 캐시 버전을 넣는다. 날짜 단위 버전으로 되돌리면 같은 날 재배포한 화면이 기존 서비스워커 캐시에 남는다.
- Hosting은 `cleanUrls: true`로 `/stats` 같은 경로를 해당 HTML에 직접 연결하고, HTML·Next 라우트 `*.txt`는 `no-cache`로 제공한다. 이 설정이 없으면 rewrite된 루트 문서나 한 시간 캐시된 이전 페이지 청크가 계속 보일 수 있다.

### Firebase 보안 규칙 (`database.rules.json`)

> **이 파일이 Firebase 프로젝트 `woori-high`의 유일한 배포용 보안 규칙 원천이다.**
> `firebase deploy --only database`는 반드시 이 프로젝트(학생 앱)에서만 실행한다.
> 저장소 전체에서 `database.rules.json`과 `firebase.json`은 이 앱에만 있다 — 다른 앱에는 rules 파일 자체가 없다(2026-08-28 실측). 옛 행정·이가드 앱의 `DO_NOT_DEPLOY.*` 보관 파일은 2026-08 통합 때 그 앱들과 함께 사라졌다.

주요 규칙 특이사항:
- `admins` 노드: bootstrap 조건 제거됨 — 최초 admin은 Firebase Console에서 직접 추가해야 함
- `teacherExtra` 교사 쓰기는 이메일이 일치하는 `userRoles`의 부·학년·반을 `${part}_${grade}_${class}` 형태로 조합해 경로와 비교한다. `teacherClasses` 문자열 치환 방식으로 되돌리지 않는다.
- `staff_*` 규칙은 2026-08-12 제거했다 — 교사·스탭 앱을 함께 없앴고 데이터도 0건이었다. 루트에 기본 규칙이 없어 이 경로들은 전면 거부 상태다(`teacherStaff`는 별개 노드이니 혼동 금지).
- `attendanceAdmins`: 출석부 전용 관리자. 학생 앱 노드(`classes`·`attendance`·`events`·`teacher*`·`config`·`trash`·`suggestions`·`userRoles`·`teacherClasses`)에만 포함하고, 플랫폼 노드(`retreats*`·`iguard*`·`semesters*`)와 `admins`에는 **절대 넣지 않는다**.
- `classes`/`attendance`: read 규칙이 관리자(admin·attendanceAdmins·retreatAdmins·iguardMembers) 전체 + 교사는 이메일 일치 `userRoles`에서 파생한 본인 반만 허용한다. 행정·이가드 모듈이 비통합관리자 계정으로 전체 `classes`를 읽으므로 `retreatAdmins`/`iguardMembers` 허용을 제거하지 않는다.
- `config`: 상위 `.write`를 두지 않는다. `sheetSync`와 `studentMoveLocks/{year}`만 관리자에게 열고, 불변 `studentMoveCommits`는 본인 UID의 사전 양쪽 pending lock이 정확히 일치할 때 한 번만 `true`로 만들 수 있다.
- `semesters`: read는 `admins`·`retreatAdmins`·`iguardMembers`(2026-08-08 추가 — 고등부 사역 플랫폼의 "스탭=학기 조회만" 역할), **write는 `admins`·`retreatAdmins`만**. 연락처·지원 동기가 있는 `semestersPrivate`는 read/write 모두 행정 전용으로 유지한다 — 학기 쪽 새 민감 필드는 반드시 `semestersPrivate` 아래에 둔다.

### 학생 데이터 쓰기 패턴 — 단일 경로만 수정 (전체 덮어쓰기 금지)

#### 충돌 학생 ID 분리와 재접속 결과 확인 (2026-09-12)
- **접근법**: `MoveStudentModal.tsx`에서 명단·출석 충돌 학생에만 새 push key를 선택한다 → 양쪽 반 잠금 안에서 원본 동일인·빈 목적지·중복 personId를 재검사한다 → `studentMove.ts`에서 목적지 출석 병합을 거부하고 학생·출석·이력·commit을 함께 저장한다 → 목적지 ID를 인코딩한 작업 키로 응답 유실·재접속을 확인한다.
- **판단 질문**: 부서 없는 시트 SID가 같아도 같은 학생이 아니다. 명단이 없어도 출석이 남은 슬롯은 재사용하지 않는다. Rules 필드는 변경하지 않으며 구버전 작업 복구를 유지한다. 영구 ID 없는 충돌 학생은 자동 이동하지 않는다. 과거 피해 복구·구버전 쓰기·같은 UID의 직접 쓰기 차단은 별도 경계다.
- **재사용 규칙**: `studentMove*.test.ts`와 `e2e/student-move.browser.spec.mjs`에서 기존 명단·출석 불변, 새 ID 이관, 단발 요청·응답 유실을 검사한다. 통합 앱의 과거 신청 키를 바꾸지 말고 personId로 현재 원장을 확인한다.

Firebase Realtime Database SDK와 초기화 객체는 `src/lib/db.ts`에서만 노출한다. 컴포넌트와 데이터 훅은 `firebase/database` 또는 `src/lib/firebase/client.ts`의 `db`를 직접 import하지 않고 `@/lib/db`를 사용한다. 인증의 `auth`만 `src/lib/firebase/client.ts`에서 직접 가져올 수 있다.

`StudentModal`(저장/삭제), `MoveStudentModal`(이동)은 반 전체 명단(`classes/{year}/{ck}/students`)을 통째로 `set()`하지 않고, 항상 **해당 학생 1명의 경로만** 갱신한다. 이동은 원본·목적지 반의 `config/studentMoveLocks/{year}/{classKey}/{ownerUid}/{operationId}` leaf 두 개를 연도 트랜잭션으로 함께 선점한다. 연결 종료 시 두 leaf만 지우는 단일 예약을 선점 전과 직후에 등록한 다음 원본 학생·목적지 반·양쪽 출석을 다시 읽는다. 충돌 학생은 사전에 새 목적지 SID를 선택하고, 잠금 안에서 선택한 SID의 명단·출석이 비었는지 재검사한다. 다른 학생의 출석과 병합하지 않는다. 서버 보정 시각으로 두 잠금을 `pending` 전환하고 종료 예약 취소와 pending 소유권 재확인을 마친 뒤, Firebase SDK 재연결 쓰기 큐가 없는 루트 REST PATCH를 30초 제한으로 정확히 한 번만 보낸다. 이 payload에는 학생·출석·감사기록·두 잠금 해제와 `config/studentMoveCommits/{year}/{fromCk}/{toCk}/{sid}/{ownerUid}/{operationId}: true`를 함께 넣는다. commit marker는 오래된 요청이 잠금 정리 후 늦게 도착해 재실행되는 것을 Rules에서 거절하기 위한 불변 기록이므로 자동 삭제하지 않는다:
```typescript
// ✅ 올바른 방법 — 단일 학생 경로만 갱신
await update(ref(db), { [`classes/${year}/${ck}/students/${id}`]: newStudent });

// ❌ 금지 — 반 전체를 덮어씀, 동시 편집 시 다른 사람의 변경이 사라짐
await set(ref(db, `classes/${year}/${ck}/students`), allStudentsObj);
```
2xx만 즉시 성공이고 4xx 거절은 exact lock을 정리한다. 예외·30초 중단·5xx는 서버 반영 여부가 불명확하므로 pending 잠금을 유지한다. 다음 이동은 서버 보정 시각으로 10분 이상 지난 pending에 한해 commit marker와 원본·목적지 학생 상태가 정확히 미반영 또는 완료 상태일 때만 조건부 정리한다. 혼합 상태와 `preparing`, Firebase 연결 또는 서버 시간 오프셋 미확인은 자동 정리하지 않는다. 프로세스 종료로 남은 pending도 같은 절차를 따른다. 실제 네트워크 단절 통합 시험은 운영 DB 무쓰기 검증에서 실행하지 않았다. 같은 UID의 다른 탭은 Rules에서 owner로 판정되므로 해당 탭의 일반 명단·출석 쓰기까지 차단하지 못한다. 잠금 전에 SDK 오프라인 큐에 들어간 관리자 쓰기가 잠금 해제 후 재생되는 경우까지 막으려면 모든 관리자 쓰기에 별도 버전 계약이 필요하다.

관리자 명단 변경은 이동의 단발 루트 REST PATCH 또는 기존 루트 `update()` payload에 `classes/{year}/{ck}/adminChanges/{changeId}`도 함께 넣는다. 원본 변경만 성공하고 행정 이력이 빠지는 상태를 만들지 않는다.

감사기록의 값 노출 범위는 `adminChange.ts`의 **`VALUE_FIELDS`가 유일한 기준**이다. 여기 든 필드(`name`·`school`)만 `학교 「한빛고」 → 「서현고」`처럼 실제 값을 남기고, 나머지(생년월일·본인/보호자 연락처·주소·사진)는 `보호자 연락처 변경`처럼 필드 이름과 작업만 남긴다. **연락처·주소를 `VALUE_FIELDS`에 넣지 않는다** — 이 기록은 통합 플랫폼의 행정 변동 사항에 그대로 노출돼, 목록을 보는 사람 누구나 학생·보호자 연락처를 평문으로 보게 된다. 학교·이름은 반 명단에서 이미 보이는 값이라 새로 드러나는 정보가 없다. 값은 **자르지 않는다** — 표시 쪽(`SundayMinistryTabs.tsx`의 `ChangeSummary`)이 접었다 펴므로 기록은 온전해야 한다. `__tests__/adminChange.test.ts`가 이 경계를 지킨다. 일반 교사 출석 입력은 이 행정 이력 대상이 아니다.

번호(`num`)는 저장 시점에 계산하지 않는다 — 읽을 때 `sortAndRenumber()`가 항상 재계산하므로 저장값이 어긋나도 자동 보정된다. `RosterModal`(명단 일괄 교체)만 예외 — 사용자가 명시적으로 "교체"를 확인한 뒤 루트 `update()`에서 `students` 전체 값과 감사기록을 함께 반영한다.

통합 앱의 새친구 탭은 `canWriteStudentRoster(roles)`가 허용하는 학기 역할 `superAdmin`·`adminTeam`에 한해 신규 학생 1명을 같은 단일 경로 규칙으로 추가하거나 검증된 되돌리기를 실행할 수 있다. `highschool-app/src/features/semester/db.ts`의 전용 함수만 예외이며, 결정적 `nf_` 학생 ID·동명이인 차단·대상 반 확인·비공개 사전 스냅샷·새친구 반영 이력과의 원자 update를 유지한다. 그 밖의 학생 수정·이동·삭제와 출석 쓰기는 계속 이 앱만 담당한다.

### 학생 사진 (`src/utils/image.ts`)

`StudentModal`에서 사진 업로드 시 `compressImage()`로 캔버스 리사이즈(최대 320px)·JPEG 압축(품질 0.72) 후 base64로 저장한다. `classes/{year}` 전체를 학생 앱과 통합 앱의 여러 화면이 `onValue`로 구독하므로, 압축 없이 원본을 저장하면 트리 전체 로딩이 무거워진다.

### 로딩 게이트 타임아웃 (`AppShell.tsx`)

Firebase `onAuthStateChanged` 콜백이 끝내 오지 않으면(캐시/네트워크 문제 등) 무한 스피너 상태가 될 수 있다. `authState === 'loading'`이 12초 넘게 지속되면 스피너 대신 "새로고침" 버튼을 보여준다.

인증 후 원장 대기는 `DataLoadGate`가 별도로 담당한다. 12초 이상 응답이 없으면 지연 안내와 `다시 불러오기`를 표시하고, 명시적인 구독 실패는 즉시 지속 오류로 표시한다. 단순 네트워크 단절을 권한 거부와 동일하게 처리하지 않는다.

### 달력 연도와 조회 연도 (`src/utils/yearRollover.ts`)

`watchCalendarYear()`는 KST 자정 예약과 화면 복귀 시 실제 달력 연도의 변화를 확인하며, `stop()`은 마지막으로 예약한 타이머까지 해제한다. `CALENDAR_YEAR_CHANGED`는 사용자가 직전 달력 연도를 보고 있을 때만 새해로 넘긴다. 수동으로 선택한 과거 조회 연도를 화면 복귀나 자정 검사만으로 현재 연도로 되돌리지 않는다.

### PWA / 서비스 워커 (`public/sw.js`)

- 캐시 전략: 네트워크 우선, 실패 시 캐시 폴백
- 다음 URL은 SW를 통하지 않고 통과시킨다: `firebase`, `googleapis`, `gstatic`, `/_next/`, `/__nextjs`, `__next.` (RSC 페이로드 파일)
- 새 버전 감지: activate 이벤트에서 이전 캐시 삭제 후 모든 클라이언트에 `{ type: 'NEW_VERSION' }` 메시지 전송 → `AppShell`이 수신해 `UpdateBanner` 표시

### 구글 시트 동기화 (`src/lib/sheetSync.ts`) — 장결자(장기결석) 처리

관리자 탭의 "구글 시트 동기화" 기능은 출석부 시트 → Firebase로 명단·출석을 일괄 반영한다. 시트의 반 탭은 평시 학생(번호 1..N) 다음 **번호가 1로 재시작**하며 장결자 명단이 이어지는 구조 — `parseClassCsv`가 번호 역행(`num < prevNum`)을 감지해 그 이후 학생을 `jang: true`로 표시한다. 장결자 sid는 평시 학생과 번호가 겹치므로 `S{학년}{반}_J{NN}`(J 접두사)으로 충돌을 피한다.

`buildSyncPayload`가 `jang: true`를 Firebase에 함께 기록하며, 통합 플랫폼 수련회 행정 모듈의 신청자 취합 화면(`ClassRosterTab`)이 이 필드를 읽어 장결자를 별도 구역으로 분리 표시한다. 1부·2부를 반드시 함께 동기화해야 부 간 이동 학생이 정확히 잡히는 점은 기존과 동일.

**주일 당일에는 그날 열을 건드리지 않는다.** 시트의 빈칸은 `lastElapsedSundayUTC` 이하인 날짜 열에서만 결석(X)으로 기록된다. 이 경계가 하루만 밀려도 출석이 통째로 뒤집힌다 — 예전에는 요일 수만큼만 되감아 일요일에는 오늘 자신이 기준이 됐고, 그 상태로 동기화하면 **아직 시트에 옮겨 적지 않은 그날 앱 입력이 전부 결석으로 덮였다**(2026-08-23 교사 테스트 중 발견). 일요일이면 7일을 되감아 직전 주일을 기준으로 삼는다. `__tests__/sheetSync.test.ts`의 "주일 당일 동기화"가 토·일·월 세 경계를 지킨다.

**반 이동 학생의 출석 기록은 이관하고 옛 경로를 지운다.** 반이 바뀌면 새 반 기준 sid를 새로 받으므로 `attendance/{year}/{옛반}/{옛sid}`가 아무도 참조하지 않는 고아로 남던 문제가 있었다. `buildSyncPlan`·`buildSyncPayload`는 `attendance/{year}` 스냅샷을 선택 인자로 받아, **시트에 값이 없는 칸만** 새 경로로 옮긴 뒤 옛 경로를 `null`로 지운다. 시트가 원본이므로 시트에 값이 있는 칸은 덮지 않으며, 대체되는 칸 수는 미리보기의 `출석 기록 이관`에 그대로 노출한다(관리자가 적용 전에 확인). 출석 스냅샷을 넘기지 않으면 삭제도 이관도 하지 않는다 — `__tests__/sheetSync.test.ts`의 "반 이동 시 옛 반 출석 기록 이관·정리"가 이 계약을 지킨다.

⚠ 휴지통에 백업하지 않는다. `TrashModal`은 `trash/{year}/students`·`classes`만 복원할 수 있으므로 `trash/{year}/attendance`를 만들면 복원 경로가 없는 새 더미가 생겨 고아를 옮기는 것에 그친다. 이관 자체가 보존 수단이다. 휴지통 조회는 삭제를 실행하지 않으며 영구 삭제는 사용자의 항목별 확인 뒤에만 수행한다.

**행정 변동 사항에는 실제로 사람이 바뀐 반만 기록한다.** 예전에는 동기화할 때마다 모든 반에 `신규 0명 · 이동 0명`을 남겨 목록이 아무 일도 없었던 기록으로 찼다. `describeSheetSyncForClass(plan, ck, removeMissing)`가 반 하나의 기록을 만들고 **변동이 없으면 `null`을 돌려 기록 자체를 만들지 않는다**. 변동으로 세는 것은 신규·전입·전출·제외 네 가지이며, 전출까지 세는 이유는 받는 반에만 남기면 사람이 빠진 반이 아무 기록 없이 조용히 줄어들기 때문이다. 제외는 `removeMissing`을 켠 동기화에서만 생긴다. 이름은 변경내용 칸에 적고(5명 초과면 `외 N명`) 좁은 학생 칸에는 건수만 둔다. `__tests__/sheetSync.test.ts`의 "행정 변동 사항 - 시트 동기화 기록"이 이 계약을 지킨다.

**`removeMissing`(시트에 없는 학생 삭제)으로 빠지는 학생의 출석은 아직 정리하지 않는다** — 이관할 목적지가 없어 지우면 순수 손실이라 의도적으로 남겨 둔 상태다.

### 외부 데이터 임포트

스프레드시트 → Firebase 일괄 임포트가 필요할 때는 `~/.config/configstore/firebase-tools.json`의 Firebase CLI access token을 사용해 RTDB REST API(`{DB_URL}/{path}.json?access_token={token}`)로 직접 쓴다. `firebase deploy`로 이미 인증된 상태라면 별도 서비스 계정 없이 가능하다.

### 시트 SID와 복원 트랜잭션의 보존 계약 (2026-09-08)
- **접근법**: 기존 학생·출석 SID를 먼저 예약한다 → 미리보기의 목적지 ID와 원본 연결을 고정한다 → 일부 시트만 가져온 이동은 전출 학생 한 명의 명단·출석을 원자 payload로 정리한다 → 반 잠금 후 미리보기와 최신 원장을 대조하고 단발 REST PATCH를 사용한다. 일반 학생 편집과 복원은 반 트랜잭션에서 최신값을 확인한다.
- **판단 질문**: 반복 GET은 서버 조건부 커밋이 아니다. 같은 UID의 다른 탭, 잠금 전 오프라인 큐, 늦은 PATCH의 완전 차단에는 Rules·버전 계약이 필요하다. 결과가 불명확한 동기화는 재적용하거나 잠금을 자동 삭제하지 않는다. 복원 후 휴지통 정리가 실패해도 복원 원장을 되돌리지 않는다.
- **재사용 규칙**: 저장 함수가 소유하지 않는 `jang`·`personId`·연결 표식은 보존하고, 조건부 복원은 대상 생성과 충돌 검사를 같은 트랜잭션에서 수행한다.

### 관리 폼의 입력·초점·삭제 사본 보존 (2026-09-08)
- **접근법**: 학생·교사·반 추가·일괄 명단·휴지통을 `ManagementDialog`에 연결한다 → 저장 실패는 폼 안에 남기고 입력을 보존한다 → 저장 중 중복 실행과 닫기를 막는다 → 배경 inert를 layout effect에서 먼저 해제하고 `useModalFocus`의 정리에서 열기 버튼으로 돌아간다. 수정 필드는 열 때 값과 최신값을 비교하고 미수정 필드는 보존한다.
- **판단 질문**: 모달의 외형만 렌더하면 실제 portal·배경 초점·sticky 하단 가림을 놓친다. 같은 학생 ID를 삭제본 키로 쓰면 다른 반과 반복 삭제가 충돌한다. 복원 성공 뒤 정리 실패를 전체 실패로 되돌리지 않으며, 복원 완료 표식도 키뿐 아니라 사본 본문과 대조한다.
- **재사용 규칙**: `src/utils/trash.ts`의 작업별 키를 쓰고, 레거시 사본은 실제 저장 키를 유지한다. `ManagementFlows.render.test.tsx`로 입력 보존·중복 방지·복원 후 정리 재시도·초점 복구를 확인하고 실제 컴포넌트 브라우저에서 320/375px와 확대를 검사한다.

### 일괄 명단은 기존 ID를 보존한 계획으로 저장 (2026-09-08)
- **접근법**: `parseRosterInput`에서 CSV/탭 목록을 읽는다 → `planRosterImport`로 기존 명단 유지·추가를 기본 계획으로 만든다 → 동명이인은 생년월일·연락처의 유일한 일치를 요구한다 → 교체는 기존 반 사본을 휴지통에 보관한다 → 미리보기 반 스냅샷과 같은 원장에만 transaction으로 반영한다.
- **판단 질문**: 전체 학생에게 새 ID를 부여하면 출석·장결·personId 연결을 잃는다. 이름만으로 기존 학생을 합치지 않는다. 일괄 입력은 기존 학생의 개인정보 수정 통로로 사용하지 않는다. 교체에서 제외된 학생의 출석은 삭제하지 않으며, 반 사본은 같은 반이 없는 경우에만 복원된다.
- **재사용 규칙**: 입력·모드 변경 시 미리보기를 폐기하고, 백업 실패나 최신 원장 충돌에서는 창과 입력을 유지한다. `__tests__/rosterImport.test.ts`와 관리 폼 렌더 테스트가 이 계약을 지킨다.

### 출석을 보존하는 삭제·복원과 SDK 트랜잭션 캐시 (2026-09-08)
- **접근법**: `lib/rosterRecovery.ts`에서 기존 형태의 복구 사본을 먼저 저장한다 → `classes/{year}/{classKey}` 트랜잭션에서 대상 학생 또는 반 전체가 사전값과 같은지 검증한다 → 명단만 제거하고 `attendance`는 유지한다 → 기존 ID로 명단 복원 시 남아 있는 출석을 다시 연결한다. 사본 저장 이후 명시적 충돌은 이번 사본만 정리하고, 응답 불명확은 사본을 보존한다.
- **판단 질문**: 이미 삭제된 과거 출석을 재생성하거나 공유 trash 형태를 확장하지 않는다. 남은 출석을 과거 사본으로 덮지 않는다. `get()` 직후라도 활성 구독이 없으면 SDK 트랜잭션 첫 콜백이 null일 수 있어 기존 학생을 없다고 오판했다. `lib/db.ts`의 공통 runTransaction은 onValue 최초 응답부터 완료까지 구독을 유지한다.
- **재사용 규칙**: 콜드 캐시·삭제 후 교사 쓰기 거절·학생/반 복원·두 관리자 동시 복원을 `node scripts/run-attendance-contracts.mjs`로 검증한다. Java 21과 Firebase CLI가 필요하며 demo-attendance-recovery/127.0.0.1:19017 외 주소는 거절한다. 새 삭제는 출석을 보관하지만 과거 삭제본의 출석 존재는 별도 확인한다.

### 같은 브라우저 탭의 시트 동기화와 일반 저장 분리 (2026-09-08)
- **접근법**: `utils/browserWriteLock.ts`에서 동일 출처 Web Locks를 사용한다 → 일반 set/update/remove/runTransaction은 공유 잠금, commitSheetSync 전체는 배타 잠금으로 감싼다 → 이미 배타 잠금을 잡은 프로토콜의 내부 트랜잭션만 syncProtocolDb를 사용한다 → ifAvailable로 지연 저장을 큐에 쌓지 않고 명시 재시도를 안내한다.
- **판단 질문**: UID가 같다는 이유로 다른 탭의 저장을 안전하다고 간주하지 않는다. Web Locks는 같은 출처·브라우저 범위이므로 다른 기기, 구버전 클라이언트, 직접 SDK 요청, 서버 Rules fencing을 대체하지 않는다. 잠금 미지원 브라우저의 동기화는 중단하고 일반 저장은 유지한다.
- **재사용 규칙**: 새 원장 쓰기는 lib/db를 사용한다. 동기화 중 발생한 출석 오류는 입력 의도와 재시도를 유지하고 다른 탭 작업이 끝나면 사용자가 다시 저장한다.

### 출석 셀의 조건부 저장과 격리 인증 검증 (2026-09-09)
- **접근법**: `lib/attendanceSave.ts`에서 최신 값과 ETag를 조회한다 → 화면의 사전값과 다르면 중단한다 → 같은 ETag로 한 번만 PUT한다 → 412 충돌·권한 거절·전송 결과 불명을 분리한다 → `useAttendanceSave`가 원래 사전값과 연도·데이터 세대를 재시도에도 유지한다. 같아진 저장값은 추가 쓰기 없이 완료한다.
- **판단 질문**: SDK의 무조건 set이나 자동 트랜잭션 재시도 대신 단발 REST 조건부 저장으로 같은 셀의 다른 기기 쓰기를 보호했다. 이 보호는 학생 명단·출석 전체의 원자성이나 구버전 쓰기 차단, 서버 Rules 권한 축소를 의미하지 않는다. 화면 세대가 바뀌면 이전 응답과 재시도를 적용하지 않는다.
- **재사용 규칙**: `node scripts/run-attendance-browser.mjs`는 고정 loopback Auth·DB 에뮬레이터와 전용 Vite 별칭으로 실제 LoginScreen·AppShell·역할 조회·출석 컴포넌트를 실행한다. Next 탐색만 테스트 어댑터다. Chrome·WebKit에서 사전값 충돌, GET/PUT 사이의 412, 저장 응답 유실과 명시 재시도를 검사한다. `npm run build`의 `tools/check-production-boundary.mjs`가 테스트 주소·자격정보의 운영 번들 혼입을 차단한다. 운영 인증 정보는 PR에 전달하지 않는다.

출석 화면은 `useAttendanceSave`(저장), `useSuggestions`(건의 구독·초안), `attendanceExport`(CSV/XLSX/PDF)로 책임을 나눈다. `globals.css`는 `styles/tokens → entry → layout → widgets → teacher → responsive` 순서의 진입점이며 선언 순서를 바꾸지 않는다.
