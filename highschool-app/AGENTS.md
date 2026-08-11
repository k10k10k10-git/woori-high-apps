# highschool-app Agent Guide

고등부 학기 사역, 수련회 행정, 이가드 현장 운영을 한 도메인에서 제공하는 통합 Next.js 앱입니다.

작업 전 `../CLAUDE.md`, `../DB_OWNERSHIP.md`, `../OPERATIONS.md`, 이 디렉터리의 `CLAUDE.md`를 읽습니다.

## 데이터 경계

- 학기: `semesters/*`, `semestersPrivate/*`
- 수련회 행정: `retreats/{id}/*`, `retreatsPrivate/{id}/*`
- 이가드: `retreats/{id}/iguard/*`
- 공통 명단 `classes/{year}`는 원칙상 읽기 전용. 예외는 통합관리자의 `registerNewFriendInRoster` 신규 학생 단건 추가와, 그 결정적 `nf_` 학생만 사전 백업·연결 검증 후 `classes`·해당 `attendance`·새친구 기록에서 원자 삭제하고 `trash`에 사본을 남기는 `removeNewFriendFromRoster`뿐이다.
- Rules 배포 원천은 오직 `../고등부 학생 출석부/database.rules.json`

통합 앱은 기존 경로와 스키마를 그대로 사용합니다. 도메인 간 소유 경계를 넘는 쓰기나 전체 노드 덮어쓰기를 추가하지 않습니다.

## 코드 구조

- `src/app/semester/[id]`: 학기 운영 화면
- `src/app/retreat/[id]`: 수련회 행정 화면
- `src/app/retreat/[id]/field`: 이가드 현장 화면
- `src/features/semester`: 학기 데이터·유틸리티 (`applicant.ts` = appKey·표기 규칙, `EditContext.tsx` = 편집 잠금)
- `src/features/iguard`: 이가드 데이터·유틸리티·인증
- `src/features/portal`: 통합 홈 + **권한 계약**(`accessPolicy.ts`, `roleAssign.ts`, `applyRole.ts`), 전역 헤더, 팀원 관리(`TeamModal.tsx`)
- `src/lib/paths.ts`: 공통/행정 Firebase 경로 단일 원천

## 권한 — 6단계 역할 (2026-08-06)

역할·영역 표와 저장 위치는 `CLAUDE.md`의 "권한" 절과 루트 `AGENTS.md`가 같은 내용을 담는다. 코드 규칙만 요약하면:

- 화면 게이트는 `canAccessPortalArea` / `canEditPortalArea` / `iguardScope` / `canManageRoles`만 쓴다. `role === "staff"` 같은 직접 비교 금지.
- 역할 판정은 `resolveMinistryRole`(순수) 하나 — 통합 `AuthContext`와 이가드 `AuthContext`가 공유한다. 두 컨텍스트는 `role`만 노출하고 예전 `accessLevel`/`iguardAccessLevel`은 없다.
- 역할 배정 쓰기는 `planRoleAssignment`(순수, 부여→해제) → `applyRoleSteps`(실행). UI에서 `addRetreatAdmin`·`approveIguardMember`를 직접 부르지 않는다.
- 학기 화면 편집 잠금은 `useSemesterCanEdit()`. 새 저장 컨트롤을 추가하면 이 값으로 `disabled` 또는 미렌더 처리한다.
- PIN 우회(`RetreatPinGate`)는 통합관리자(`canManageRoles`)만. 이가드 전체 권한(`iguardScope === "all"`)으로 넓히지 않는다.

## 화면 셸 규칙

- 사이트 제목·계정·로그아웃·상단 메뉴는 `GlobalPortalHeader` 하나만 담당한다. 하위 화면에 제목 줄을 다시 만들지 않는다(중복 제목 금지 — `/retreats`·`/field`에서 실제로 겹쳤다).
- 상단 메뉴는 학기 중 사역 / 주일 사역 / 방학 중 사역 / 사역 가이드 / 사이트 건의사항 순서이며, 방학 중 사역이 수련회 행정팀·이가드팀 드롭다운으로 갈라진다. 우측 계정 영역의 학생 통합검색은 기능 메뉴가 아니라 기존 DB에서 인물 기록을 읽기 전용으로 파생한다.
- 학기 중 사역은 `훈련·사역팀`만 학기별로 관리한다. `행정·바나바`는 독립 `주일 사역` 영역이며, 새친구·등록 현황·처리 대기·행정 변동 사항을 학기 구분 없이 보여준다.
- 통합 브랜드 색: 학기·수련회 행정·이가드 모두 `globals.css`의 미드나이트 인디고·코발트·틸 토큰을 공유한다. `.semester-scope`와 `.iguard-scope`는 배경·최소 높이만 제공하며 도메인별 원색으로 토큰을 재정의하지 않는다. 상태 의미(정상·검토·위험)에만 에메랄드·앰버·로즈를 사용한다.
- effect 안에서 `setState`를 직접 호출하지 않는다(eslint `react-hooks/set-state-in-effect`). 탭 유효성처럼 파생 가능한 값은 렌더 중 계산한다(`SemesterClient`의 `activeTab` 참고).

## 학기 사역 계약 (2026-08-06)

- 접수 원칙: 훈련 신청이 사역팀 지원의 전제. 예외는 고3 2학기·스탭. 판정은 `src/features/semester/intakeRule.ts`(순수)만 사용한다.
- `trainingOnly`는 `deriveTrainingOnly`가 파생한다. 출석·수료 명단은 `roster.ts`(훈련 명단 = 훈련 반 배정자 전원 + 레거시 `trainingOnly`).
- 회차 유형 변환은 `sessionKind.ts`. 출석 만점에서 빠지는 유형은 휴강뿐이다.
- 훈련 반: `semesters/{sid}/trainingClasses/{id}`. 삭제는 `trainingClass.ts`의 루트 다중 경로 update(신청자 `trainingClassId`까지 정리).
- `.input`은 레이어 밖 규칙이라 `width:100%`가 유틸리티를 이긴다 — 폭은 감싼 div로, 높이는 `h-*` 금지.

## 검증

```bash
npx tsc --noEmit
npm test
npm run build
```

독립 `retreat-app`·`iguard-app`은 기능 동등성 확인과 사용자 승인 후 2026-08-05 제거했습니다. 복구 태그는 `pre-legacy-app-removal-2026-08-05`입니다.

## 2026-08-09에 굳힌 계약 (되돌리지 말 것)

- **로드 오류 배너는 `lib/useLoadErrors.ts` 하나로만.** 실패를 경로별로 모아 전부 나열하고, `scope`(대상 id·계정 uid) 변경 시 렌더 중 파생으로 초기화한다. 단일 `loadError` 문자열로 되돌리면 동시 실패 중 마지막 하나만 보여 원인을 잘못 짚는다(실제로 두 번 오진했다). ⚠ Firebase RTDB는 **한 번 거부된 리스너를 규칙이 바뀌어도 재시도하지 않는다** — 권한을 열어도 그 탭은 새로고침 전까지 실패 상태다.
- **수련회 PIN 잠금은 `features/portal/useRetreatPinGate.ts` 하나로만.** 잠금은 `retreats/{id}/iguard/accessLock` 한 노드라 **행정·이가드 어느 쪽에서 잠가도 양쪽이 잠긴다.** 화면마다 구독을 새로 짜면 한쪽만 잠기는 사고가 난다. PIN 우회는 통합관리자만.
- **인원체크 키에 배열 인덱스를 넣지 않는다.** `features/iguard/lib/checklistKeys.ts`의 `stableMemberId`(`{kind}:{ownerId}:{name}`)만 쓴다. 운영 DB에 구형 인덱스 키가 남아 있으므로 판정·해제는 반드시 `memberCheckKeys`/`isMemberChecked`를 거친다(신형·구형 동시 인식, 쓰기는 신형만).
- **스탭/학생 구분은 `features/semester/roster.ts` 한 곳.** `isStaffApplication`·`splitStudentsAndStaff`·`completionRoster`. 수료 명단에서 교사·스탭을 빼는 것은 `completionRoster`가 담당한다(출석 명단은 스탭도 포함).
- **삭제는 짝이 되는 노드를 함께.** 수련회는 `lib/retreatRemoval.ts`(`retreats` + `retreatsPrivate`), 팀·훈련 반은 `curriculum`까지. 한쪽만 지우면 화면에서 접근 불가능한 고아가 남는다.
- **전체 덮어쓰기 복구는 사전 백업 성공을 확인한 뒤에만** — `backupNodeBeforeOverwrite`의 반환값을 검사한다(`if (!backedUp) throw`). 스로틀된 상시 저장 백업만 예외.
- **인앱 브라우저 탈출은 `features/iguard/lib/inAppBrowser.ts`만.** 화면에 복제하지 말 것 — 복제본에는 "이동 주소 ≠ 현재 주소" 불변식과 세션 1회 가드가 빠져 무한 리로드가 났다.
- **`.input`은 `globals.css`의 `@layer` 밖 규칙이라 Tailwind 유틸리티를 이긴다.** `h-*`로 높이를 고정하면 글자가 잘리고, `w-*`·`text-*`·`px-*`는 무시된다. 폭은 **감싼 div**로, 글꼴은 **인라인 style**로 준다.
- 남은 `set-state-in-effect` 9건은 의도적으로 남긴 것이 대부분이다: `ExecutionViews` 3건은 `staffPicked`/`userPicked` ref 가드 자동 선택(루트 CLAUDE.md 실수 13이 **처방한** 패턴), `LodgingMapView` 2건은 레이아웃·팝오버, `useRetreatData`·`RetreatsHome`은 로딩/fetch. 나머지 2건(`ScheduleSheetEditor`·`SettingsTab`)만 draft 동기화라 `key` 부여로 정리 가능하다.

## 핵심 코드 패턴

### 통합 포털에서도 도메인 권한과 DB 소유권을 합치지 않기 (2026-08-05)
- **접근법**: 1→ `semester-app`, `retreat-app`, `iguard-app`의 라우트를 `highschool-app/src/app` 아래로 편입한다. 2→ 기존 `semesters/*`, `retreats/{id}/*`, `retreats/{id}/iguard/*` 경로는 그대로 둔다. 3→ 공통 `AuthContext`에서 행정 `accessLevel`과 이가드 `iguardAccessLevel`을 별도 값으로 읽는다. 4→ 통합 홈은 두 권한 중 하나가 있으면 열되, 링크와 메뉴는 각 도메인 권한으로 다시 제한한다. 5→ 타입 검사·전체 테스트·프로덕션 빌드와 비로그인 PC·375px 화면을 확인한다.
- **판단 질문**: 기존 DB를 새 통합 노드로 복사하거나 행정 승인과 이가드 승인을 하나의 `accessLevel`로 합치지 않는다. 전자는 롤백과 앱별 소유권을 깨고, 후자는 이가드 전용 스탭에게 행정·학기 화면을 잘못 열 수 있기 때문이다. 레거시 앱 삭제 뒤에도 이 계약과 복구 태그를 유지한다.
- **재사용 규칙**: 여러 운영 앱을 한 웹페이지로 합칠 때는 먼저 라우트·인증 진입점·배포 단위만 합치고, 저장 경로와 권한 판정은 원래 도메인별로 분리한 채 화면 노출만 조합한다.

### 통합 홈의 개인 담당은 이가드 큐카드 계산 규칙을 재사용하기 (2026-08-05)
- **접근법**: 1→ `src/features/iguard/lib/staffIdentity.ts`, `personalDuty.ts`, `defaultSegment.ts`, `groupStaffNames.ts`의 기존 식별·담당 계산 함수를 재사용한다. 2→ `src/features/portal/myRetreatMinistry.ts`에서 조스탭·자유 텍스트 담당·구조화 포스트를 하나의 읽기 전용 결과로 합친다. 3→ `src/features/portal/useMyRetreatMinistry.ts`는 필요한 기존 경로만 좁게 구독하고 수련회 또는 권한이 바뀌면 이전 상태를 먼저 비운다. 4→ 실제 로그인 계정으로 이가드 개인 큐카드와 포털 결과를 대조하고 375px 화면까지 확인한다.
- **판단 질문**: 포털 전용 담당 노드를 새로 저장하거나 이름 포함 검색을 별도로 구현하지 않는다. 새 노드는 기존 큐카드와 불일치할 수 있고, 단순 포함 검색은 동명이인·접미사(`sf`) 때문에 오배정될 수 있기 때문이다.
- **재사용 규칙**: 다른 화면에 개인화된 운영 정보를 요약할 때는 원본 도메인의 식별·정렬·담당 계산 함수를 순수 함수로 재사용하고, 새 저장값 대신 기존 데이터의 읽기 전용 파생 결과를 보여준다.

### 메뉴 숨김과 직접 URL 접근에 같은 권한 계약 적용하기 (2026-08-05, 2026-08-06 6역할로 확장)
- **접근법**: 1→ `src/features/portal/accessPolicy.ts`에 홈·학기·수련회 행정·이가드 현장의 접근 규칙을 순수 함수로 둔다. 2→ 통합 홈의 메뉴/링크와 각 상세 라우트의 진입 가드가 같은 함수를 사용하게 한다. 3→ 이가드 전용 계정이 `/retreat/[id]`를 직접 열었을 때 DB 읽기를 시작하기 전에 차단하고 `/retreat/[id]/field`로 갈 수 있게 한다. 4→ 미승인·이가드 스탭·이가드팀·행정팀·전체 관리자 조합을 표 기반 테스트로 고정한다.
- **판단 질문**: 메뉴만 숨기고 Firebase Rules에만 의존하지 않는다. Rules는 최종 보안 경계이지만, 직접 URL 진입 후 권한 없는 구독/읽기를 시도하면 사용자에게 오류 화면을 보이고 권한 경계도 불명확해지기 때문이다.
- **재사용 규칙**: 권한별로 메뉴를 나누는 통합 앱에서는 같은 순수 접근 정책을 링크 생성과 라우트 진입 모두에 적용하고, 권한 없는 DB 읽기보다 앞서 차단한다.

### 팀원 화면은 통합하되 기존 권한 저장 계약은 분리 유지하기 (2026-08-05, 2026-08-06 갱신)
- **접근법**: 1→ `src/features/portal/TeamModal.tsx`(구 `UnifiedTeamModal.tsx`)에서 `admins`, `retreatAdmins`, `retreatPending`, `iguardMembers`, `iguardRoles`, `iguardPending`을 각각 기존 DB 함수로 읽는다. 2→ UID를 기준으로 관리자·이가드 멤버와 승인 요청을 화면에서만 합치고, 역할은 `resolveMinistryRole`로 판정해 한 개의 드롭다운으로 보여준다. 3→ 쓰기는 `planRoleAssignment`가 계산한 최소 단계만 각 도메인 함수로 실행한다(부여 → 해제 순서라 중간에 권한이 0이 되는 순간이 없다). 4→ `src/features/portal/GlobalPortalHeader.tsx` 한 곳에서만 모달을 열고 홈 본문의 중복 버튼은 두지 않는다. 5→ 권한 버튼을 누르지 않는 읽기 전용 점검과 타입 검사·전체 테스트·빌드로 검증한다.
- **판단 질문**: 통합 팀원 노드를 새로 만들거나 `retreatAdmins`와 `iguardMembers`를 한 번에 덮어쓰지 않는다. 새 노드는 Rules에 규칙이 없어 거부되고 기존 앱과 이중 진실을 만들며, 전체 덮어쓰기는 일부 권한만 수정해도 다른 도메인의 승인 상태를 손상시킬 수 있기 때문이다. 자기 자신의 역할은 UI에서 잠근다 — 통합관리자가 스스로를 강등해 잠기는 사고를 막는다.
- **재사용 규칙**: 여러 앱의 권한 관리 UI를 합칠 때는 UID 기반 읽기 모델만 합치고, 쓰기는 "필요한 변경만 계산하는 순수 함수 + 경로별 최소 단위 실행"으로 분리한다.

### 역할을 늘릴 때 Rules 대신 기존 노드 조합으로 표현하기 (2026-08-06)
- **접근법**: 1→ 요구된 역할×영역 표를 `src/features/portal/accessPolicy.test.ts`에 먼저 옮겨 계약으로 고정한다. 2→ `../고등부 학생 출석부/database.rules.json`을 읽어 기존 노드 중 무엇을 확장할 수 있는지 확인한다 — `retreatAdmins/{uid}`는 객체이고 `.validate`가 없어 `role` 필드 추가가 자유롭고, `iguardRoles`는 `staff`/`team`만 허용한다. 3→ 다른 앱이 그 노드를 어떻게 읽는지 grep으로 증명한다(`semester-app`은 `!= null` 존재 확인만 → 필드 추가 호환). 4→ 판정은 순수 함수 1개, 쓰기는 계획+실행 분리. 5→ Rules로만 가능한 잔여 항목(스탭의 `semesters` 읽기)은 코드를 완성한 뒤 스니펫과 함께 `.claude/HANDOFF.md`에 블로커로 남긴다.
- **판단 질문**: `portalRoles/{uid}` 같은 새 노드를 만들지 않았다 — Rules에 `.read`/`.write`가 없어 즉시 권한 거부이고, Rules 배포 원천은 학생 앱 하나뿐이라 이 앱에서 열 수 없다. 화면에서 역할 문자열을 직접 비교하지도 않았다 — 권한이 늘 때마다 전 컴포넌트를 다시 훑어야 한다.
- **재사용 규칙**: 권한 모델 확장은 (1) 표를 테스트로 고정 → (2) Rules 파일을 읽고 "기존 노드 + 옵션 필드"로 표현 → (3) 다른 앱의 읽기 방식으로 호환 증명 → (4) Rules 필요한 부분만 블로커로 인수인계, 순서로 진행한다.

### 접수 대상에 학생 아닌 인원을 추가할 때 키 규칙을 먼저 분리하기 (2026-08-06)
- **접근법**: 1→ 기존 appKey가 `{부번호}_{학생ID}`라 다른 명단의 ID가 그대로 들어오면 2부 학생과 충돌할 수 있음을 확인한다. 2→ 키·표기·정렬 규칙을 `src/features/semester/applicant.ts`(순수)로 옮기고 스탭만 `s_` 접두어를 쓰게 한 뒤 `applicant.test.ts`로 충돌 없음을 고정한다. 3→ 스탭 명단은 `teacherStaff/{year}`를 **읽기 전용**으로만 쓰고(`paths.teacherStaffByYear`), 실패해도 학생 접수가 계속되게 보조 원천으로 분리해 에러를 따로 표시한다. 4→ 학년·반이 없는 인원은 `describeApplicant`로 "스탭"만 표기해 `0-0` 같은 값이 화면에 새지 않게 한다.
- **판단 질문**: `makeAppKey`의 기존 학생 규칙을 바꾸지 않았다 — 이미 저장된 신청·출석·수료 키가 전부 어긋난다. `teacherStaff`에 쓰기 함수를 만들지도 않았다(교사·스탭 출석부 앱 소유).
- **재사용 규칙**: 기존 명단 기반 기능에 다른 출처의 인원을 넣을 때는 키 생성 규칙을 순수 모듈로 먼저 떼어내고 접두어로 namespace를 나눈 뒤, 새 출처는 실패해도 기존 흐름이 살아 있는 보조 원천으로 붙인다.

### 훈련 전용 신청과 민감 상세정보를 기존 저장 경로에서 안전하게 분리하기 (2026-08-06)
- **접근법**: 1→ `src/features/semester/roster.ts`에서 취소자를 먼저 제외하고 `team`과 `training` 명단을 명시적으로 나눈다(2026-08-06 훈련 반 도입으로 scope 이름이 `training`으로 바뀌었다). 2→ 출석·수료 화면은 두 명단을 탭으로 전환하되 기존 `attendance`, `completion` 경로와 신청자 키를 그대로 쓴다. 3→ 팀 상세 화면은 공개 신청 정보(`semesters/*/applications`)와 연락처·지원 동기(`semestersPrivate/*/applicationsPrivate`)를 신청자 ID로 결합한다. 4→ 비공개 경로는 `useSemesterCanEdit()` 권한에서만 구독하고 조회 전용 사용자는 값이 렌더되지 않게 한다. 5→ 순수 명단 필터를 표 기반 테스트로 고정하고 로그인된 실제 화면에서 두 명단 탭과 상세 펼침을 확인한다.
- **판단 질문**: 훈련 전용 인원을 별도 DB 노드로 복제하지 않는다 — 출석과 수료의 진실이 두 군데로 갈라지고 기존 키 기반 집계가 깨지기 때문이다. 공개 신청 노드로 연락처·지원 동기를 옮기지도 않는다 — 민감정보 경계가 무너진다.
- **재사용 규칙**: 같은 신청자 집합에서 운영 목적별 명단이 필요하면 새 저장소를 만들지 말고 순수 필터로 뷰를 나누며, 민감정보는 기존 private 경로를 권한 있는 화면에서만 ID로 결합한다.

### 기능을 보존한 전면 리디자인은 전역 토큰부터 교체하기 (2026-08-10)
- **접근법**: 1→ Naver·CHZZK처럼 참고할 서비스에서 색 자체보다 정보 밀도·내비게이션 대비·표면 위계를 추출한다. 2→ `src/app/globals.css`의 색·타이포·간격·그림자 토큰과 공통 버튼·입력·카드 규칙을 먼저 교체한다. 3→ `src/features/portal/GlobalPortalHeader.tsx`와 `PortalHome.tsx`로 전역 셸을 통일한 뒤 학기·행정·이가드 클라이언트에는 공통 클래스만 연결한다. 4→ Firebase 구독·저장 핸들러·권한 함수는 건드리지 않고 `npx tsc --noEmit`, `npm test`, `npm run build`, 로그인 전후 화면 검증으로 기능 회귀를 막는다.
- **판단 질문**: 각 화면에 임의 색과 인라인 스타일을 반복해서 덧칠하거나 참고 사이트의 브랜드를 그대로 복제하지 않는다. 전자는 다음 화면에서 다시 불일치가 생기고, 후자는 고등부 서비스의 정체성과 접근성을 해치기 때문이다. 시각 변경을 이유로 DB 경로·데이터 모양·권한 로직도 함께 정리하지 않는다.
- **재사용 규칙**: 여러 도메인을 품은 운영 앱을 리디자인할 때는 참고 서비스의 원리를 하나의 접근 가능한 토큰 체계로 번역하고, 공통 셸→도메인 진입점→특수 컴포넌트 순서로 적용하며 데이터 로직은 별도 변경으로 분리한다.

### 공개 소개 화면은 인증 분기 바깥에서 기존 운영 화면과 격리하기 (2026-08-11)
- **접근법**: 1→ `src/features/landing/landingContent.ts`에 PASONA 순서와 익명 데모 문구를 순수 데이터로 분리한다. 2→ `src/features/landing/LandingPage.tsx`는 기존 `LoginButton`과 `signIn`만 주입받아 공개 소개·기능 미리보기·로그인 CTA를 구성한다. 3→ `src/features/portal/PortalHome.tsx`의 비로그인 분기만 랜딩으로 교체하고 로그인 이후 권한 게이트·Firebase 구독·운영 대시보드는 그대로 둔다. 4→ 콘텐츠 테스트로 섹션 순서·민감정보 부재를 고정하고 PC·375px에서 가로 넘침과 로그인 CTA를 확인한다.
- **판단 질문**: 홍보용 데이터를 Firebase에 새로 저장하거나 기존 운영 대시보드를 랜딩 안에 복제하지 않는다 — 전자는 공개 화면 때문에 불필요한 데이터 계약을 만들고, 후자는 로그인 후 화면과 두 개의 진실을 만든다. 실제 학생·교사 정보도 예시로 쓰지 않는다.
- **재사용 규칙**: 인증형 운영 서비스에 공개 소개 페이지를 붙일 때는 비로그인 렌더 분기만 교체하고, 콘텐츠는 익명 정적 데이터로 격리하며 기존 인증·권한·DB 구독은 로그인 이후에만 실행한다.

### 통합 검색과 업무함은 권한 계약과 기존 읽기 모델에서 파생하기 (2026-08-11)
- **접근법**: 1→ `src/features/portal/featureCatalog.ts`의 학기·행정·이가드 화면 목록을 검색어 원천으로 재사용한다. 2→ `src/features/portal/portalSearchCatalog.ts`에서 `canAccessPortalArea`·`iguardScope`·`retreatEntryHref`로 역할별 검색 결과와 링크를 순수하게 계산한다. 3→ `src/features/portal/homeActions.ts`에서 기존 `prepMilestones`, 학기 `sessions`, 수련회 `periods`를 날짜순 업무로 파생한다. 4→ 새 저장 경로 없이 헤더 검색과 홈 업무함에 연결하고 역할별 표 테스트·전체 테스트·375px 로그인 화면으로 확인한다.
- **판단 질문**: 검색 인덱스나 알림함을 새 Firebase 노드로 저장하지 않는다. 검색 대상은 이미 기능 카탈로그와 목록 노드에 있고, 업무함도 기존 일정의 파생값이라 별도 저장하면 권한·완료 상태·날짜가 서로 어긋나는 두 번째 진실이 생기기 때문이다. 역할 문자열을 UI에서 직접 비교하는 방식도 사용하지 않는다.
- **재사용 규칙**: 통합 운영 앱에 검색·업무함을 추가할 때는 화면 카탈로그와 기존 일정 노드를 순수 함수로 합치고, 같은 권한 계약으로 노출과 링크를 동시에 제한하며 새 DB 인덱스는 검색 규모가 실제로 커진 뒤에만 검토한다.

### 위키 운영 지식은 개인정보·정책과 분리한 정적 가이드로 옮기기 (2026-08-11)
- **접근법**: 1→ `/Users/sunghoon/Desktop/나의 비서/second-brain/wiki/`를 사역계획·예배·목양·훈련·수련회·행정·공지·특별사역으로 분류한다. 2→ 반복 가능한 운영 원칙과 체크리스트만 `src/features/ministryGuide/ministryGuideContent.ts`에 정적 데이터로 옮긴다. 3→ 연간 계획은 `가안`으로 명시하고 학생 실명·연락처·주소·가정·건강 특이사항과 미결 아이디어를 제외한다. 4→ `/ministry-guide`를 전역 메뉴·검색·홈 월별 브리핑에 연결하고 콘텐츠 계약 테스트와 전체 타입·테스트·빌드로 검증한다.
- **판단 질문**: 위키 전체를 검색 인덱스나 Firebase 노드로 복제하지 않는다. 원문에는 개인정보와 확정되지 않은 아이디어가 섞여 있고, DB에 복사하면 원문과 화면 사이에 두 번째 진실과 새 권한 계약이 생기기 때문이다. 개인별 기록과 상세 원문 링크도 일반 가이드에 노출하지 않는다.
- **재사용 규칙**: 내부 문서를 제품 기능으로 옮길 때는 `반복 가능한 원칙 / 개인정보 / 미확정 제안`으로 먼저 분류하고, 첫 범주만 출처 메모·상태 라벨을 붙인 정적 콘텐츠로 제공하며 운영 DB와 분리한다.

### 운영 위키에서 신규 기능 후보를 고를 때 현재 코드·DB 경계와 교차검증하기 (2026-08-11)
- **접근법**: 1→ `rg --files`와 `wc`로 위키 파일·분량을 확정하고 전체 문서를 주제별로 읽는다. 2→ 여러 해 반복된 누락·병목·수작업만 후보로 묶는다. 3→ `src/features/portal/featureCatalog.ts`, 실제 라우트, 관련 키워드 검색으로 이미 구현된 기능과 정적 가이드를 제외한다. 4→ `../DB_OWNERSHIP.md`, 배포 Rules, 각 `paths.ts`를 대조해 기존 경로 재사용·읽기 전용 파생·새 데이터 계약 필요로 나눈다. 5→ 반복 근거·사용자 영향·구현 위험으로 우선순위를 매기고 읽기 전용 최소 기능부터 제안한다.
- **판단 질문**: 위키에 나온 모든 아이디어를 기능으로 만들거나 정적 가이드 내용을 다른 화면에 복제하지 않는다. 일회성 기록·미확정 제안·개인정보는 제품 후보에서 제외하고, 새 루트 노드나 다른 앱 소유 경로 쓰기가 필요한 후보는 Rules·소유권 설계 전까지 구현안으로 확정하지 않는다.
- **재사용 규칙**: 문서 기반 기능 발굴은 `반복 문제 근거 → 현재 기능 중복 검사 → 기존 경로로 가능한 최소 단계 → 민감정보·권한 검토` 순서로 수행하고, 저장이 없어도 가치를 검증할 수 있으면 항상 읽기 전용 1단계를 먼저 둔다.

### 운영 시트를 교차 앱 업무 흐름으로 옮길 때 요청과 원장 반영을 분리하기 (2026-08-11)
- **접근법**: 1→ 원본 시트의 열·상태값·완료/미처리 건수를 개인정보 행과 분리해 집계한다. 2→ 자유 서술을 `접수 → 검토 → 승인 → 실행 → 검증` 상태와 명시적인 변동 유형으로 바꾼다. 3→ `../DB_OWNERSHIP.md`와 각 앱 `paths.ts`를 대조해 통합 사이트가 소유할 업무 기록과 학생 앱이 소유할 `classes/{year}` 실행을 나눈다. 4→ 요청과 실행 결과를 안정 ID로 연결하고, 학생 앱에서는 단일 학생 경로만 멱등적으로 갱신한 뒤 결과와 변경 전후를 기록한다. 5→ 기존 시트 이관은 매칭·중복·미처리 수를 먼저 보여주는 dry-run 뒤 스냅샷과 명시적 승인 하에 수행한다.
- **판단 질문**: `highschool-app`에서 `classes/{year}`를 직접 수정하거나 운영 시트의 연락처·가정·심방 메모를 공개 학기 노드에 복사하지 않는다. 전자는 학생 앱 소유권과 다른 소비 앱의 계약을 깨고, 후자는 민감정보 권한을 넓히며 시트와 DB 사이에 두 번째 진실을 만들기 때문이다. 두 앱이 같은 요청 레코드를 함께 수정하는 공유 쓰기 노드도 피하고 요청 원문과 실행 결과의 소유 경로를 분리한다.
- **재사용 규칙**: 다른 앱이 소유한 원장을 바꾸는 운영 시트를 제품화할 때는 통합 화면을 요청·승인 오케스트레이터로 두고, 실제 원장 변경과 검증은 소유 앱의 최소 단위 명령으로 실행하며 두 결과를 안정 ID와 감사 이력으로 연결한다.

### Functions·Rules 변경 없이 다른 앱 소유 원장에 신규 1건만 안전하게 연결하기 (2026-08-11)
- **접근법**: 1→ `../고등부 학생 출석부/database.rules.json`을 확인해 `classes/{year}` 쓰기가 이미 `admins`에만 허용됨을 고정하고 `accessPolicy.canWriteStudentRoster`를 같은 계약으로 테스트한다. 2→ `features/semester/newFriend.ts`에서 새친구 ID 기반 결정적 `nf_` 학생 ID, 2주 과정·등록 결정·반배정 검증, 이름·생년월일·연락처 중복 차단을 순수 함수로 만든다. 3→ `semestersPrivate/{sid}/newFriendRosterBackups/{friendId}` 사전 스냅샷, `classes/{year}/{classKey}/students/{studentId}` 단일 신규 경로, `semesters/{sid}/newFriends/{friendId}/rosterSync` 이력을 하나의 루트 update 계획으로 만든다. 4→ 실행 뒤 생성한 학생 경로를 다시 읽어 검증하고, 재클릭은 같은 결정적 ID를 확인해 중복 생성 없이 연결만 복구한다. 5→ 출석부 반영 뒤에는 이름·부서·학년·연락처·반배정을 잠가 기존 학생 수정·이동·삭제가 학생 앱 소유로 돌아가게 한다.
- **판단 질문**: Firebase Cloud Functions를 억지로 추가하지 않았다 — `npx firebase functions:list --project woori-high --debug`에서 Functions API 비활성, Cloud Billing API에서 `billingEnabled:false`를 실측했고 Functions 배포는 Blaze 요금제 연결이 필요했기 때문이다. `retreatAdmins`에 `classes` 쓰기를 여는 Rules 변경도 하지 않았다 — 권한 범위가 행정팀 전체의 기존 학생 수정까지 넓어진다. 통합 앱에 범용 학생 수정 함수도 만들지 않고 신규·미존재 경로 추가 하나로 예외를 닫았다.
- **재사용 규칙**: 다른 앱 소유 원장에 자동 연결이 필요하지만 서버 함수·Rules 변경을 할 수 없으면, 기존 Rules가 이미 허용한 최상위 관리자에게만 `결정적 신규 ID + 중복 차단 + 비공개 사전 스냅샷 + 단일 경로 원자 추가 + 재조회 검증`을 제공하고 반영 직후 편집을 다시 소유 앱으로 잠근다.

### 여러 도메인의 개인 기록을 기존 키와 영구 personId로 연결하기 (2026-08-11)
- **접근법**: 1→ `src/features/portal/peopleSearchDb.ts`에서 권한이 허용한 `classes`, 교사·스탭 명단, `semesters`, `retreats`를 읽고 민감 루트는 접근 정책상 허용될 때만 요청한다. 2→ 기존 연도별 ID는 연도·도메인 범위의 참조키로 유지하고, 학생·교사·스탭 레코드의 선택적 `personId`를 유형별 namespace로 최우선 판정한다. 3→ 아직 personId가 없는 학생은 다른 연도의 이름·생년월일·본인 연락처가 모두 일치할 때만 연결하고, 같은 연도 다른 ID와 보호자 연락처 단독 일치는 분리한다. 4→ `scripts/person-id-migration.mjs`의 개인정보 비출력 dry-run으로 충돌을 집계하고 영향 루트 JSON을 백업한 뒤 원장 `/personId` 자식 경로만 다중 update한다. 기존 `semesters/*/applications`는 이름이 아니라 같은 연도 공식 원장의 `studentId`가 유일하게 일치하는 학생·스탭 신청만 해당 personId로 백필한다. 5→ 학생↔스탭 분리, 연도별 동일 학생 결합, 같은 연도 동명이인 분리, 공식 스탭 명단↔학기 사역 결합을 회귀 테스트와 로그인한 운영 검색으로 검증한다.
- **판단 질문**: 기존 `id`·`pid`를 바꾸거나 Firebase에 새 최상위 검색 인덱스·통합 프로필 노드를 만들지 않는다. 기존 키 교체는 출석·수련회·학기 참조를 끊고, 새 최상위 노드는 배포된 Rules에 경로가 없어 거부된다. 이름 또는 보호자 연락처만으로 연결하지 않고, 자동 판정이 모호한 그룹은 서로 다른 personId로 남긴다.
- **재사용 규칙**: 여러 연도·도메인의 인물 이력을 잇는 작업은 `기존 업무 키 보존 → 유형별 personId 선택 필드 → 강한 필드의 유일 후보만 이관 → 충돌은 분리 → 생성·수정·진급·동기화 전 경로에서 personId 보존` 순서로 구현한다.

### 저장 구조를 바꾸지 않고 학기 기능을 상위 업무영역으로 재구성하기 (2026-08-11)
- **접근법**: 1→ `src/features/portal/featureCatalog.ts`에 `SEMESTER_TRAINING_TABS`, `SEMESTER_ADMIN_TABS`, `SEMESTER_WORKSPACE_GROUPS`를 선언해 정보구조를 단일 원천으로 만든다. 2→ `src/app/semester/[id]/SemesterClient.tsx`에서 상위 영역(`training`/`admin`)과 하위 탭을 분리하고 새친구를 행정·바나바로 이동한다. 3→ `/semesters`와 `/semester-admin`은 같은 학기 목록을 영역별 진입점으로 재사용하고, 상세 화면은 `?area=admin`으로 깊은 링크를 유지한다. 4→ 학생 변동·처리 대기·변경 이력은 새 노드 없이 `NewFriend.rosterSync`, `deriveNewFriendStage`, `createdAt`·`updatedAt`에서 읽기 전용으로 파생한다. 5→ PC와 375px에서 드롭다운·상위 탭·하위 탭을 검증하고, 모바일의 가로 스크롤이 절대 위치 메뉴를 자르면 메뉴가 열린 동안 `.portal-nav-menu-open`으로 overflow를 해제한다.
- **판단 질문**: 화면 분류를 바꾸기 위해 기존 `semesters` 데이터를 이동하거나 `studentChanges` 같은 저장 노드를 먼저 만들지 않는다. 전자는 기존 기능과 검색의 키 계약을 깨고, 후자는 실제 입력·승인·감사 요구가 정해지기 전에 두 번째 진실을 만든다. 상단 드롭다운도 hover 전용으로 두지 않는다 — 모바일·키보드 클릭에서 열려야 하며 `onMouseEnter`와 토글 click을 같이 쓰면 첫 클릭이 다시 닫히므로 click은 명시적으로 open 상태를 쓴다.
- **재사용 규칙**: 기존 기능을 계층형 업무영역으로 재편할 때는 `카탈로그 단일 원천 → 목록 진입점 → 상세 상위영역 → 하위 탭` 순서로 URL과 화면을 맞추고, 새 데이터 계약이 필요 없는 요약은 기존 기록에서 먼저 파생해 구조를 검증한다.

### 학기별 기존 기록을 이동하지 않고 학기 비종속 주일 사역으로 통합하기 (2026-08-11)
- **접근법**: 1→ `src/features/sundayMinistry/model.ts`에서 `semesters/*/newFriends`와 `semestersPrivate/*/newFriendsPrivate`를 `storageSid + friendId` 복합키로 통합한다. 2→ 신규 저장은 `sundayWorkspaceId(year)`가 만드는 `semesters/{year}-sunday`로 보내되 `meta`를 생성하지 않아 학기 목록에서 숨긴다. 3→ `src/app/sunday-ministry/SundayMinistryClient.tsx`에서 통합 구독과 네 개 탭을 제공하고 `NewFriendsTab` 콜백으로 각 기록의 원래 `storageSid`에 수정·삭제·출석부 반영을 보낸다. 4→ `/semester-admin`과 `?area=admin` 깊은 링크는 `/sunday-ministry`로 리디렉션하고, `GlobalPortalHeader`·`PortalHome`·검색 카탈로그의 진입점을 함께 교체한다. 5→ `model.test.ts`로 학기 간 ID 충돌·비공개 정보 결합·연도별 주일 작업공간 규칙을 고정한다.
- **판단 질문**: 기존 학기별 새친구를 새 루트 노드로 이관하지 않았다. 이관은 운영 DB 쓰기·백업·Rules 설계가 필요하고 기존 사람 검색·출석부 반영 이력의 참조를 끊을 수 있다. 새 루트 `sundayMinistry/*`도 만들지 않았다 — 현재 Rules에 읽기·쓰기 계약이 없으므로 즉시 권한 거부되며 Rules 배포 금지 원칙과 충돌한다.
- **재사용 규칙**: 기존 저장 스코프보다 새 업무 화면의 생명주기가 더 길면 `기존 스코프 통합 읽기 + 충돌 없는 복합키 + 기존 Rules가 허용하는 비가시 전용 작업공간 + 레거시 URL 리디렉션`으로 이관 없이 분류 구조를 바꾼다.

### 다른 앱 원장에 자동 추가한 단건을 검증·백업 후 원자적으로 되돌리기 (2026-08-11)
- **접근법**: 1→ 원장 소유 앱 `../고등부 학생 출석부/src/components/modals/StudentModal.tsx`의 삭제 계약이 `classes` 학생·해당 `attendance` 삭제와 `trash` 복구 사본임을 확인한다. 2→ `src/features/semester/newFriend.ts`에서 새친구 ID로 계산한 결정적 `nf_` 학생 ID, 저장된 연결 ID·반, 현재 학생 이름을 검증한다. 3→ 삭제 직전 학생·출석·새친구 공개/비공개 값을 `semestersPrivate/{sid}/newFriendRosterBackups/{friendId}/removals/{timestamp}`에 담고, `trash` 사본과 네 삭제 경로를 하나의 루트 update로 계획한다. 4→ `removeNewFriendFromRoster`에서 현재 레코드를 다시 읽어 연결 변경을 차단하고 실행 뒤 삭제 경로·백업·휴지통을 재조회한다. 5→ 화면은 통합관리자에게만 버튼을 보이고 학생 이름 재입력 전에는 최종 삭제 버튼을 비활성화하며, 실제 화면 검증에서는 확인창만 열고 취소한다.
- **판단 질문**: 통합 앱에 범용 학생 삭제를 열거나 `classes`만 단독 삭제하지 않는다. 전자는 학생 앱 소유권을 넘어 기존 학생까지 지울 수 있고, 후자는 출석 고아 레코드를 남긴다. 새친구 공개 기록만 먼저 지우거나 하드 삭제하지도 않는다 — 연결 근거와 복구 수단을 잃기 때문이다.
- **재사용 규칙**: 다른 앱 소유 원장에 자동 생성한 단건을 되돌릴 때는 `생성 당시 결정적 연결 검증 → 소유 앱의 삭제 계약 복제 → 민감 사전 백업 + 원장 휴지통 → 한 번의 다중 경로 update → 재조회 검증 → 이름 입력 확인` 순서를 지킨다.
