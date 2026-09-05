<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# 학생 출석부 에이전트 가이드

이 문서는 `attendance-app/`에 적용된다. 작업 전 `../CLAUDE.md`의 안전 규칙과 `../.claude/HANDOFF.md`, 앱 `CLAUDE.md`를 읽는다. 공유 데이터 변경은 `../DB_OWNERSHIP.md`, 배포·복구는 `../OPERATIONS.md`도 확인한다. 안전 규칙은 루트 매뉴얼이 우선하며, 구조·동작 설명이 오래됐으면 실제 코드·설정과 대조해 보고한다.

## 현재 구조와 시작점

- **Next.js App Router + React + TypeScript PWA**다. `next.config.ts`의 `output: 'export'`로 `out/`를 만들고 Firebase Hosting에 배포한다. 운영 주소는 `https://woori-high.web.app`이다.
- `src/app/layout.tsx` → `AppProvider` → `AppShell`이 공통 레이아웃이다. `/`는 일반 관리자에게 `/dashboard`, 교사·데모에게 `/attendance`를 연다. `/dashboard`·`/attendance`·`/manage`·`/stats`·`/overall`·`/admin`은 화면 컴포넌트의 래퍼다. 서버 API 라우트는 현재 없다.
- 인증은 **Firebase 이메일·비밀번호 로그인**이다. 통합 앱의 Google OAuth 설명을 이 앱에 적용하지 않는다. `AppShell`이 인증 게이트를 운영하고 `useAuth.ts`는 로그인·로그아웃 함수를 제공한다.
- 활성 서비스는 이 앱과 `../highschool-app/`이다. 수련회·이가드·학기 기능은 통합 앱의 모듈이며, 제거된 독립 앱을 새 의존 대상으로 만들지 않는다.

| 영역 | 먼저 볼 파일 | 유지할 계약 |
|---|---|---|
| 공유 상태·반 선택 | `src/store/AppContext.tsx`, `src/components/ClassTabBar.tsx` | reducer action과 기존 selector 사용 |
| 인증·데이터 구독 | `src/components/AppShell.tsx`, `src/components/DataLoadGate.tsx`, `src/hooks/useFirebaseData.ts` | 현재 인증·revision의 응답만 적용, 세 원장 준비 후 페이지 표시, 지속 오류·명시 재시도, 교사 본인 반 범위 |
| 관리자 셸·주간 현황 | `src/components/admin/`, `src/lib/adminNavigation.ts`, `src/utils/adminDashboard.ts` | 일반 관리자만 진입, 기존 구독 재사용, 입력 업무와 출석 통계의 분모 구분 |
| 출석·통계 | `src/components/tabs/AttendanceTab.tsx`, `src/utils/attendanceEntry.ts`, `src/utils/attendanceWorkflow.ts`, `src/utils/dates.ts` | KST 주일·행사 제외·역할별 날짜 범위·장결 분리 |
| 학생 명단 | `src/components/modals/`, `src/components/tabs/ManageTab.tsx` | 학생 단일 경로 쓰기·personId·행정 이력 |
| 시트 동기화 | `src/lib/sheetSync.ts`, `src/components/tabs/SheetSyncSection.tsx` | 미리보기와 payload 분리, 출석·SID 보존 |
| 계정·교사·전체 현황 | `src/components/tabs/AdminTab.tsx`, `src/components/tabs/overall/` | 출석부 권한과 플랫폼 권한 구분 |
| 공용 처리 | `src/utils/personId.ts`, `adminChange.ts`, `export.ts`, `image.ts`, `chartSetup.ts`, `dbError.ts` | 기존 순수 함수 재사용·민감값 최소화 |
| 스타일·PWA | `src/app/globals.css`, `src/components/admin/*.css`, `public/sw.js`, `public/manifest.json` | 관리자 스타일 범위·CSS 변수·모바일 화면·캐시 제외 목록 |

`src/lib/db.ts`가 DB SDK와 초기화 객체를 노출하는 진입점이다. 컴포넌트·훅은 `@/lib/db`를 사용하고 `firebase/database`를 직접 import하지 않는다. 인증용 `auth`는 `src/lib/firebase/client.ts`에서 가져온다. 현재 경로는 대부분 기존 호출부에 있으며, 이 앱에 존재하지 않는 `paths.ts`나 통합 앱의 `snapToList`를 이미 사용하는 것으로 가정하지 않는다.

## DB 소유권과 권한

작업 시작 시 루트 매뉴얼의 DB 안전 4문답에 답한다. 운영 DB 직접 쓰기는 명시 승인과 사전 스냅샷이 필요하다. 문서 점검이나 코드 검증을 운영 DB 쓰기 승인으로 간주하지 않는다. 운영 앱 구현·수정은 2026-09-05 상시 승인에 따라 검증·PR 검토·에이전트 병합·Hosting 운영 배포까지 진행하며 재승인을 요청하지 않는다. 조사·리뷰·문서만 요청한 작업과 사용자 배포 보류는 제외한다. DB·Rules·계정/권한 변경은 루트의 별도 승인 경계를 유지한다.

| 이 앱이 관리하는 경로 | 용도·교차 앱 영향 |
|---|---|
| `classes/{year}`, `attendance/{year}`, `events/{year}` | 학생·반·출석·행사 원장. 통합 앱의 주일 사역·학기 접수·수련회/현장 조회가 소비하므로 키와 형태 변경은 교차 앱 검토 대상 |
| `admins`, `attendanceAdmins`, `userRoles`, `teacherClasses` | `admins`는 플랫폼 전권, `attendanceAdmins`는 출석부 전용. 로그인과 교사 반 권한은 이메일이 일치하는 `userRoles/{emailKey}`가 원천이며 `teacherClasses/{uid}`는 관리자만 쓰는 레거시 매핑 |
| `teacherStaff/{year}`, `teacherSpecial/{year}`, `teacherExtra/{year}` | 통합 앱도 읽는 스탭·교사 명단. 제거된 `staff_*` 노드와 다름 |
| `teacherAdditional/{year}`, `teacherPhones/{year}` | 출석부 관리자용 교사 정보. `teacherPhones`는 현재 앱에서 읽기만 함 |
| `suggestions/{year}`, `trash/{year}`, `config/sheetSync`, `config/studentMoveLocks/{year}/{classKey}/{ownerUid}/{operationId}`, `config/studentMoveCommits/{year}/{fromCk}/{toCk}/{sid}/{ownerUid}/{operationId}` | 반별 건의사항, 삭제 복구본, 시트 주소 설정, 학생 이동 중 양쪽 반 쓰기를 막는 작업별 잠금과 지연 요청 재실행을 막는 불변 commit marker. 통합 앱 사이트 요청함과 별개 |

- 교사는 `classes/{year}/{ck}`·`attendance/{year}/{ck}` 자기 반만, 관리자는 해당 연도 전체를 구독한다. `loadUserRole()`은 이메일 키의 `userRoles`를 읽고 화면 선택만 맞추며 로그인 중 DB를 쓰지 않는다. Rules도 같은 레코드의 이메일·`role=teacher`·부·학년·반을 직접 검사한다.
- `teacherClasses/{uid}` 자기 쓰기와 권한 판정은 2026-09-05 제거했다. 이 레거시 노드는 관리자만 읽고 쓸 수 있으며 교사 권한을 다시 연결하지 않는다. 교사의 명단 변경 UI는 열려 있지 않고, 출석 쓰기는 본인 반의 실제 명단에 존재하는 학생 한 명과 잠금이 없는 반에만 허용한다.
- `database.rules.json`과 `firebase.json`은 공유 RTDB 규칙의 유일한 배포 원천이다. 일반 작업에서는 변경 필요성을 보고하고 루트 안전 규칙의 명시 예외 확인 없이 수정·배포하지 않는다. 2026-09-05 감사 후속 작업은 사용자가 그 예외를 확인했다.
- `userRoles/{emailKey}`의 이메일 기반 자기조회, `retreatAdmins`·`iguardMembers`·`iguardRoles`의 `$uid` 자기조회를 제거하지 않는다. 제거하면 로그인·역할 판정이 막힌다.
- 교사 개인정보 노드를 `auth != null` 전체 읽기로 넓히지 않는다. `events`의 인증 사용자 읽기는 개인정보가 없는 행사 용도로 유지한다. `iguardRoles` 저장값은 `staff`/`team`뿐이다.
- 통합 앱의 새친구 단건 등록 및 검증된 되돌리기는 공유 쓰기 예외다. `nf_` ID·동일 학생 확인·비공개 사전 백업·원자 update를 유지한다. 되돌리기는 해당 학생의 `classes`·`attendance`와 `trash` 복구본까지 한정한다. 허용 역할은 통합 앱 `accessPolicy.ts`와 실제 Rules를 함께 확인하고, 이 예외를 범용 명단 쓰기로 확대하지 않는다.

## 학생·출석·동기화 계약

- 반 키는 `{part}-{grade}-{class}`, 출석 셀 키는 `evKey(mi, di)`의 `{월 인덱스}-{주일 인덱스}`다. 출석 값은 `O`/`X`/`T`이며 미입력 쓰기는 해당 셀을 `null`로 지운다. 한 번의 출석 입력은 `attendance/{year}/{ck}/{sid}/{weekKey}` 한 칸만 갱신한다.
- 교사는 행사·휴일을 제외한 최근 정상 주일 4회만 수정한다. 저장 중·성공·실패·재시도 안내를 보존한다. 관리자의 전체 기간 편집 범위와 구분한다.
- 대시보드에서 출석부를 열 때는 선택한 반·학기와 `/attendance?week={주일 키}`를 함께 전달한다. `buildAttendanceEntry()`는 관리자에게 선택 연도 정상 주일 전체, 교사·데모에게 최근 4회만 허용한다. 쿼리로 범위를 확대하지 않고 유효한 수동 선택이 쿼리보다 우선한다. `src/app/attendance/page.tsx`의 `Suspense`를 유지해 `useSearchParams`의 정적 빌드를 지원한다.
- `jang === true` 학생은 원본을 유지하고 일반 출석·통계·내보내기에서 분리한다. SID의 `J`만 보고 장결자로 판단하지 않는다. 화면 정렬·번호는 `sortAndRenumber()`로 처리한다.
- 관리자 주간 현황의 전체 출석 통계는 기존 전체 현황처럼 장결 기록을 포함한다. `attendanceRate = present / recorded`이며 `recorded`는 O·X·T 합계다. 입력 업무는 일반 학생의 `inputStudentCount`·`inputRecorded`로만 계산한다. 전원 장결 반(`no-targets`)·빈 반(`no-students`)·조회 주일 없음(`no-week`)을 입력 완료나 확인 필요 반으로 세지 않는다.
- 학생 수정·이동·삭제는 해당 학생 경로와 관련 경로를 루트 `update()`로 묶는다. `RosterModal`의 확인 후 명단 교체, 시트 동기화, 진급에는 현재 전체 `students` 교체 경로가 있으므로 일반 수정의 본보기로 복사하지 않는다. 전체 덮어쓰기를 추가·수정할 때는 백업·복구 범위를 먼저 검토한다.
- `personId`는 영구 연결용 선택 필드다. 기존 sid·pid·출석 참조키를 대체하지 않는다. 생성 시 `person_student_*`·`person_teacher_*`·`person_staff_*`를 구분하고, 편집·이동·진급·동기화에서는 보존한다. 학생 과거 ID 재사용은 이름·생년월일·부서·정상 진급선·연도별 유일 후보 조건을 `personId.ts`에 위임한다. 같은 연도 다른 ID와 보호자 연락처만으로 합치지 않는다.
- 관리자 학생 변경은 원본과 `classes/{year}/{ck}/adminChanges/{changeId}`를 같은 update에 기록한다. `adminChange.ts`의 `VALUE_FIELDS`에 있는 **이름·학교만** 실제 값을 남긴다. 연락처·주소·생년월일·사진은 값 없이 필드 이름과 입력/변경/삭제만 기록한다. 일반 교사 출석 입력은 이 행정 이력 대상이 아니다.
- 시트 동기화는 1부·2부를 함께 미리보기하고 `buildSyncPlan` → `buildSyncPayload`로 적용한다. 같은 반 기존 SID·사진·personId를 유지하고, 평시 명단으로 복귀한 학생은 새 payload에서 `jang`을 생략해 해제한다.
- 주일 당일 동기화는 오늘 열을 건드리지 않는다. `lastElapsedSundayUTC`와 토·일·월 회귀 테스트를 유지한다. 시트 반 이동은 기존 출석 스냅샷에서 **시트 값이 없는 칸만** 이관한 후 옛 출석 경로를 삭제한다. 스냅샷이 없으면 이관·삭제하지 않는다.
- 시트 행정 이력은 `describeSheetSyncForClass()`가 변동 없는 반에 `null`을 반환하면 남기지 않는다. `removeMissing`으로 제외되는 학생의 출석은 이관 목적지가 없어 의도적으로 보존한다. 자동 정리되지 않는 `trash/{year}/attendance`를 새로 만들지 않는다.
- 사진은 `compressImage()`로 압축하고, 인쇄 HTML에 사용자 값을 넣을 때는 `escapeHTML()`을 거친다. 내보내기·차트는 기존 `export.ts`·`chartSetup.ts`의 동적 로딩을 재사용한다.
- 계정 역할·연도·재조회가 바뀌면 `AppContext.resetData`가 원장·행사·계정 목록·편집 대상을 함께 비우고 `dataRevision`을 증가시킨다. 구독 성공·오류와 관리자 계정 목록 응답에는 요청 당시 revision을 붙인다. `DataLoadGate`의 세 원장 준비 조건을 우회해 이전 자료나 실패한 빈 자료로 편집 화면을 열지 않는다.
- `watchCalendarYear`는 실제 KST 연도 변경만 알리고 최신 예약 타이머까지 종료한다. `CALENDAR_YEAR_CHANGED`는 직전 달력 연도 조회 중에만 새해로 넘기므로, 수동 과거 연도 선택을 화면 복귀 때 덮어쓰지 않는다.

## 데모·운영 화면 점검 주의

- 데모는 `src/lib/demo.ts`와 빌드 시 `NEXT_PUBLIC_DEMO_*` 값으로 켜진다. 공용 Firebase 계정으로 실제 로그인하며 **운영 DB와 분리된 샘플 모드가 아니다**. `attendanceAdmins` 권한을 가진 계정의 화면만 교사처럼 제한한다.
- 반 선택은 보안 경계가 아니다. `AppShell`과 `adminNavigation.ts`의 교사·데모 `/dashboard`·`/admin`·`/overall` 차단, `demoSelection`/`demoLastSelection` 구분, 관리자 로그인 의도 플래그를 유지한다. 데모 값을 보고서·로그에 출력하거나 자격정보를 커밋하지 않는다.
- `canUseAdminWorkspace(role, isDemo)`가 허용하는 일반 관리자만 `AdminWorkspace`를 사용한다. 관리자의 첫 기본 진입은 `/dashboard`로 안내하되 `createAdminEntryTracker()`가 저장한 방문과 날짜 직접 링크를 보존한다. 교사·공용 데모의 기존 `TopBar`·`TabNav`, 자동 로그인·반 선택·관리자 접근 흐름은 유지하고 새 인증 구독이나 데모 권한 변경을 추가하지 않는다.
- 2026-09-05 사용자가 데모 모드 유지를 요청해 `NEXT_PUBLIC_DEMO_MODE=1`과 기존 데모 자격정보를 복구하고 Hosting을 다시 배포했다. 운영 브라우저에서 공용 계정 자동 로그인 뒤 부서·학년·반 선택 화면이 나타나는 것을 확인했다. Firebase Auth 데모 계정과 `attendanceAdmins/{demoUid}` 레코드도 의도적으로 유지한다. 이후 종료 요청 시 플래그·공개 자격정보·Auth 계정·권한 레코드를 함께 회수하되, 운영 DB 레코드 삭제는 명시 승인과 사전 스냅샷 뒤에만 수행한다.
- `src/lib/releaseFlags.ts`의 `SHOW_ATTENDANCE_RISK_SECTIONS=false`는 임시 노출 정책이다. 문서 정리 중 임의로 켜지 않는다.
- 관리자 로그인·연도 변경만으로 오래된 `classes`·`attendance`·`events`를 정리하지 않는다. `TrashModal`도 모든 복구본을 조회만 하며, 영구 삭제는 사용자가 항목별 `삭제` → `확인`을 누른 경우에만 실행한다. 이 계약을 화면 진입 effect의 자동 쓰기로 되돌리지 않는다.

## 핵심 코드 패턴

### 관리자 입력 업무와 전체 출석 통계의 대상을 분리하기 (2026-09-05)
- **접근법**: `src/components/tabs/AttendanceTab.tsx`의 일반 학생 입력·장결 이력 조회 대상을 확인한다 → `src/utils/adminDashboard.ts`에서 전체 `studentCount`·`recorded`와 일반 대상 `inputStudentCount`·`inputRecorded`를 따로 합산한다 → 일반 20명 전원 입력·장결 1명 미기록, 전원 장결, 장결자만 기록된 반을 `__tests__/adminDashboard.test.ts`로 검증한다 → 입력률·완료·확인 필요는 일반 대상, 출석률은 기존 장결 포함 O/(O+X+T)로 표시한다.
- **판단 질문**: 출석 통계의 분모를 그대로 입력 완료에 쓰면 화면에서 입력할 수 없는 장결 학생 때문에 반이 영구 미완료로 남는다. 이를 해결하려고 기존 전체 출석 통계에서 장결 기록까지 제외하지 않는다. 빈 반·전원 장결·조회 주일 없음도 서로 구분한다.
- **재사용 규칙**: 업무 완료율은 실제 편집 대상과 맞추고, 기존 통계 분모는 별도 필드와 회귀 테스트로 보존한다.

### 관리자 첫 진입과 출석 날짜 직접 링크를 함께 보존하기 (2026-09-05)
- **접근법**: `src/lib/adminNavigation.ts`에 일반 관리자·교사·데모의 셸과 경로 판정을 모은다 → `createAdminEntryTracker()`로 인증 세션 첫 기본 진입만 `/dashboard`로 안내한다 → 반·학기 선택과 `/attendance?week=…`를 함께 전달한다 → `src/utils/attendanceEntry.ts`에서 역할별 허용 주일 안에서 날짜를 파생하고 수동 선택을 우선한다 → `__tests__/adminNavigation.test.ts`·`attendanceEntry.test.ts`로 직접 링크·행사·교사 최근 4회 제한을 확인한다.
- **판단 질문**: 로그인 때마다 대시보드로 보내면 날짜 직접 링크와 진행 중인 출석 업무를 잃는다. URL의 주일 키를 그대로 편집 범위로 쓰면 교사·데모가 최근 4회 제한을 벗어난다. `useSearchParams`를 도입할 때는 `src/app/attendance/page.tsx`의 `Suspense`도 함께 두어 정적 export를 유지한다.
- **재사용 규칙**: 기본 첫 화면 안내·사용자가 요청한 이동·실제 편집 권한을 각각 판정하고, 화면 진입을 새 인증·운영 DB 쓰기에 연결하지 않는다.

### 통계 차트가 무관한 상태 변경에도 다시 만들어질 때 (2026-09-05)
- **접근법**: `src/components/tabs/StatTab.tsx`의 effect 의존 배열을 실제 참조와 대조한다 → 매 렌더마다 새로 만드는 미사용 `classKeys`를 제거한다 → `calcStats` 다섯 호출을 `src/utils/classStats.ts`의 한 집계로 묶고 실제 입력으로 메모한다 → `src/components/tabs/overall/OverallDashboard.tsx`의 네 차트를 입력별 effect로 나누고 각 effect가 자신의 인스턴스만 해제하게 한다 → 기존 기간별 출력·셀 접근 횟수와 부서 필터 변경 시 실제 Chart.js 생성·해제 횟수를 대조한다. 로컬 540명·52주 fixture의 차트 부서 필터 한 번 변경에서는 재생성이 네 개에서 해당 한 개로 줄었다.
- **판단 질문**: `useClassKeys`의 다른 소비처는 렌더·클릭용이라 전역 Context 재설계로 넓히지 않았다. 차트 종류·분모·옵션은 유지해 계산 재사용의 효과만 확인했다. 네 차트를 하나의 effect에 두면 작은 필터 변경도 무관한 세 차트의 해제·생성을 유발하므로 입력별 수명을 분리했다.
- **재사용 규칙**: 차트 최적화는 effect를 깨우는 참조·중복 집계·인스턴스 소유 범위를 함께 확인하고, 동일 출력과 실제 계산·생성 횟수로 검증한다. 부분 작업량 감소를 전체 화면 처리시간 감소로 보고하지 않는다.

### 계정·연도 전환 중 이전 원장과 편집 대상을 함께 차단하기 (2026-09-05)
- **접근법**: `__tests__/firebaseDataLifecycle.test.ts`에서 이전 계정·연도 콜백을 새 상태 뒤에 전달한다 → `src/store/AppContext.tsx`의 `resetData`로 원장·행사·계정 목록·모달을 함께 비우고 `dataRevision`을 증가시킨다 → `src/hooks/useFirebaseData.ts`의 구독 success/error 및 `src/components/tabs/AdminTab.tsx`의 계정 목록 조회에 요청 revision을 붙여 reducer에서 거부한다 → `DataLoadGate`는 세 원장의 성공 여부와 지속 오류로 편집 진입을 판정하고 명시 재시도로 새 구독을 연다 → `AppShell`과 `useAuth`의 역할 조회에 요청 번호·실제 UID·해제 여부 검사를 둔다 → `yearRollover.test.ts`로 실제 KST 연도 전환과 마지막 타이머 종료를 확인한다.
- **판단 질문**: unsubscribe만으로는 React effect cleanup 전 이미 도착한 이전 응답을 막을 수 없어 reducer에도 세대 검사를 둔다. 오류를 빈 원장 성공으로 바꾸거나 지연만으로 편집을 열지 않는다. `SET_YEAR`에서 이전 커스텀 행사로 새해 통계 제외 조건을 만들지 않고, 달력 연도 변경과 사용자의 과거 연도 조회를 분리한다. 이 상태 초기화는 운영 DB 삭제가 아니다.
- **재사용 규칙**: 데이터 범위가 바뀌는 화면은 `요청 취소 + 응답 적용 시 세대 확인 + 편집 대상 초기화 + 현재 원장 준비 확인`을 함께 구현하고, 실패·지연에는 복구 제어를 유지한다.

### 실패한 차트 로딩을 캐시에 고정하지 않고 다시 시도하기 (2026-09-05)
- **접근법**: `src/utils/chartSetup.ts`의 `createChartRegistry`에 모듈 로더를 주입한다 → 동시 요청과 성공 결과는 공유하되 실패한 Promise는 비운다 → `createChartLoader`가 반환하는 cleanup으로 화면 해제 뒤 성공·실패 전달을 막는다 → `src/hooks/useChartJs.ts`와 `ChartLoadState`에 오류·명시 재시도를 모은다 → `__tests__/chartSetup.test.ts`에서 실패 후 성공·동시 요청·해제·초기화 예외를 확인하고 로컬 브라우저에서 실패 안내와 키보드 재시도를 점검한다.
- **판단 질문**: 실패한 Promise를 계속 공유하면 네트워크가 돌아와도 같은 실패만 반복하므로 성공 캐시와 분리한다. 자동 무한 재시도로 오류를 숨기거나 차트 모듈 실패 때문에 이미 계산 가능한 출석 표까지 막지 않는다. 주입한 로더 실패 검증을 실제 Firebase 단절 검증으로 설명하지 않는다.
- **재사용 규칙**: 지연 로딩 자원은 `동시 요청 공유 → 성공 캐시 → 실패 캐시 해제 → 화면 수명 검사 → 사용자 재시도`를 한 계약으로 검증한다.

### 학생 반 이동과 화면 진입 정리를 데이터 유실 없이 다루기 (2026-09-05)
- **접근법**: `sheetSync.ts`의 출석 이관 계약을 먼저 확인한다 → 부·학년 선택 변경 때 반 선택을 초기화한다 → 원본·목적지 반의 `config/studentMoveLocks/{year}/{classKey}/{ownerUid}/{operationId}` leaf 두 개를 연도 트랜잭션으로 함께 선점한다. 두 leaf 제거는 한 `onDisconnect(yearRef).update()`로 선점 전 등록하고 선점 직후 다시 등록한다 → 서버 시간 오프셋을 확인한 뒤 원본 학생·목적지 반·양쪽 출석을 다시 읽는다 → 목적지 출석 셀을 우선해 병합하고 목적지 반이 없거나 같은 SID 학생이 있으면 중단한다 → 잠금 두 개를 `pending`으로 정확히 전환하면서 `startedAt`을 서버 보정 시각으로 갱신한다 → 종료 예약 취소 완료와 pending 소유권 재확인 뒤, 학생·출석·감사기록·두 잠금 해제·불변 `studentMoveCommits` marker를 단발 루트 REST PATCH에 묶는다 → 성공 후 부·학년·반 선택을 모두 목적지에 맞춘다 → 로그인·연도 변경 및 `TrashModal` 로드 effect에서 삭제 쓰기를 제거한다.
- **단절·복구 계약**: PATCH는 30초 뒤 중단하며 자동 재시도하지 않는다. 2xx만 즉시 성공, 4xx만 명시적 거절로 보고 exact lock을 정리한다. 예외·중단·5xx는 결과 불명확 상태이므로 pending 두 잠금을 유지한다. 다음 이동에서 서버 보정 시각 기준 10분 이상 지난 pending만 살핀다. commit marker 없음·원본 있음·목적지 SID 없음이 모두 맞으면 exact lock을 조건부 정리하고 한 번만 재선점한다. marker 있음·원본 없음·목적지 있음이면 완료로 판정해 잠금만 정리하고 화면을 목적지로 바꾼다. 나머지 혼합 상태와 `preparing`은 자동 정리하지 않는다. Firebase 연결 또는 서버 시간 오프셋을 확인할 수 없을 때도 자동 복구와 pending 전환을 하지 않는다.
- **지연 요청 차단**: commit marker는 `config/studentMoveCommits/{year}/{fromCk}/{toCk}/{sid}/{ownerUid}/{operationId}: true`에 한 번만 생성하고 자동 삭제하지 않는다. Rules가 marker 생성 시 기존 양쪽 pending lock의 owner·operation·metadata 일치를 요구해야, 오래된 잠금을 복구한 뒤 늦게 도착한 이전 PATCH 전체가 거절된다.
- **판단 질문**: 목적지 SID를 새로 만들면 기존 출석·새친구 연결이 끊길 수 있어 사용하지 않았다. 출석 충돌을 원본 값으로 덮으면 목적지 기록이 사라지므로 목적지 값을 우선했고, 휴지통 일괄 자동 정리는 기존 항목별 삭제 확인 UI가 있어 유지할 이유가 없었다.
- **재사용 규칙**: 참조 키를 유지하는 반 이동은 양쪽 최신 스냅샷과 목적지 충돌을 확인한 뒤 한 원자 payload로 처리하고, 화면 진입 effect에서는 운영 데이터 삭제를 실행하지 않는다.
- **검증 한계**: 잠금 선점·phase 전환·exact 복구·commit marker·단발 PATCH·응답 분류는 순수 회귀 테스트로 검증한다. 실제 브라우저와 RTDB 연결을 강제로 끊는 통합 시험은 운영 DB 무쓰기 범위에서 실행하지 않았다. 잠긴 동안에는 원본·목적지 반의 전체 명단·출석 쓰기가 잠시 차단된다. 같은 UID의 다른 탭은 Rules에서 이동 owner로 보이므로, 그 탭의 일반 명단·출석 쓰기까지 막지는 못한다. 잠금 전에 이미 SDK 오프라인 큐에 들어간 관리자 쓰기는 잠금 해제 후 재생될 수 있다. 교사의 늦은 출석 쓰기는 Rules에서 원본 학생 존재를 함께 요구해 거절하되 관리자 큐까지 완전히 fencing하려면 모든 관리자 쓰기에 별도 버전 계약이 필요하다. 연결 종료 예약이 한 번 실행된 직후 SDK 트랜잭션이 재연결에서 선점되고 코드가 예약을 다시 등록하기 전 다시 끊기는 매우 짧은 구간에는 `preparing` 잠금이 남을 수 있으며, 이를 시각만으로 자동 제거하지 않는다. 연도 잠금 트랜잭션 권한을 가진 신뢰 관리자의 직접 잠금 변조도 클라이언트 프로토콜만으로 차단할 수 없다.

### 데모 모드를 자격정보 없이 종료하고 정적 배포를 검증하는 법 (2026-09-05)
- **접근법**: 1→ `.env.local`에서 `NEXT_PUBLIC_DEMO_MODE`뿐 아니라 공개 빌드용 데모 이메일·비밀번호도 비운다. 2→ 배포용 Git worktree에는 git에서 제외된 `.env.local`이 없으므로 원본 파일을 복제하거나 출력하지 말고 존재와 대상 소스 일치부터 확인한 뒤 소유자 전용 파일 또는 심볼릭 링크로 빌드에만 연결한다. 3→ `NEXT_PUBLIC_*` 값을 바꾼 뒤에는 생성물 `.next/`와 `out/`을 제거하고 완전 재빌드해 이전 상수가 캐시에 남지 않게 한다. 4→ 알려진 데모 이메일이 새 `out/`에 없는지 확인하고 Hosting을 배포한다. 5→ 라이브 `sw.js`의 캐시 이름·SHA를 로컬 산출물과 대조하고, 캐시를 우회한 운영 첫 화면이 반 선택 데모가 아니라 일반 로그인인지 실제 브라우저로 확인한다.
- **판단 질문**: 플래그만 0으로 두고 데모 자격정보를 남기지 않았다. `NEXT_PUBLIC_*`는 클라이언트 번들 상수이므로 비활성 분기라도 값이 산출물에 포함될 수 있고, 기존 빌드 캐시가 공개 환경 변경을 재사용하면 소스 설정과 배포 번들이 다를 수 있다. 프런트 비활성화를 Auth 계정·`attendanceAdmins` 권한 회수로 간주하지도 않았다. 후자는 운영 데이터 변경이므로 별도 승인과 스냅샷이 필요하다.
- **재사용 규칙**: 공개 빌드 환경으로 임시 계정을 종료할 때는 `플래그 해제 + 공개 자격정보 제거 + 생성물 완전 재빌드 + 번들 문자열 검사 + 라이브 SW 대조 + 실제 첫 화면 확인`을 한 세트로 수행하고, 계정·권한 회수는 별도 운영 변경으로 끝까지 추적한다.

## 검증과 배포

명령은 `attendance-app/`에서 실행한다. 현재 설치 버전과 지원 범위는 `package.json`·lockfile·로컬 Next 문서로 확인한다.

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

- 테스트는 `__tests__/`의 Vitest 순수 로직·파일 계약 테스트다. `rulesContract.test.ts`는 규칙 문자열 계약 검사이며 Firebase Emulator의 실제 허용/거부 테스트가 아니다. 테스트 통과를 로그인 화면·운영 권한 검증으로 보고하지 않는다.
- 관련 변경은 `sheetSync`·`personId`·`adminChange`·`attendanceWorkflow`·`cacheVersion` 회귀 테스트로 확인한다. UI 변경은 모바일과 PC 화면도 확인하되 위 운영 자동 쓰기 함정을 먼저 검토한다.
- 2026-09-05 점검: **10파일 130개 테스트 통과**, 타입 검사·정적 빌드 성공, lint **0 errors / 30 warnings**. 이 숫자는 당시 측정값이며 후속 작업은 새 실행 결과를 보고한다.
- 배포 요청이 있을 때만 `firebase deploy --only hosting`을 사용한다. predeploy는 **빌드 → `out/sw.js` 캐시명에 밀리초 버전 반영** 순서다. 추적 파일 `public/sw.js`를 배포마다 수정하지 않는다.
- `firebase.json`의 `cleanUrls`, HTML·라우트 `.txt`·`sw.js` no-cache 헤더, `AppShell`의 `updateViaCache: 'none'`·`registration.update()`를 유지한다. 서비스워커의 Firebase·Google API·`/_next/`·`/__nextjs`·RSC 제외 목록도 보존한다.
- Vercel은 배포 대상이 아니다. `vercel.json`의 `ignoreCommand: "exit 0"`는 연결된 Vercel 프로젝트의 불필요한 빌드를 건너뛰는 보호다. `npm start`의 `next start`도 정적 export 운영 서버로 사용하지 않는다.
- 앱 `CLAUDE.md`·기본 `README.md`에 남은 독립 앱 수, `api/ai/route.ts`, 날짜 단위 `public/sw.js` 갱신, Vercel 배포 설명은 현재 파일과 다르다. 해당 설명을 근거로 제거된 구조를 복원하지 않는다.
- `.env*`·`node_modules/`·`.next/`·`out/`·`*.tsbuildinfo`는 소스 변경에 포함하지 않는다. `tmp/rules-backup/`의 기존 규칙 백업은 보존한다. 비직관적 문제 해결 후에는 루트 `extract-approach` 학습 규칙을 따른다.
