# highschool-app Agent Guide

고등부 학기 사역, 수련회 행정, 이가드 현장 운영을 한 도메인에서 제공하는 통합 Next.js 앱입니다.

작업 전 `../CLAUDE.md`, `../DB_OWNERSHIP.md`, `../OPERATIONS.md`, 이 디렉터리의 `CLAUDE.md`를 읽습니다.

## 데이터 경계

- 학기: `semesters/*`, `semestersPrivate/*`
- 수련회 행정: `retreats/{id}/*`, `retreatsPrivate/{id}/*`
- 이가드: `retreats/{id}/iguard/*`
- 공통 명단 `classes/{year}` 등은 읽기 전용
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
- 상단 메뉴는 학기 중 사역 / 방학 중 사역 두 개이고, 방학 중 사역이 수련회 행정팀·이가드팀 드롭다운으로 갈라진다.
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
