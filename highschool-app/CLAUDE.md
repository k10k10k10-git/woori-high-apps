# 고등부 통합 웹페이지 운영 지침

루트 `../CLAUDE.md`가 최우선 규칙입니다. 이 문서는 통합 앱에만 해당하는 보충 지침입니다.

## 목적

학기 사역, 수련회 행정, 이가드 현장 기능을 `highschool-app` 한 코드베이스와 배포 단위로 운영합니다. 독립 `retreat-app`·`iguard-app`은 2026-08-05 제거했지만 운영 DB 경로와 데이터 형태는 그대로 유지합니다.

## 라우트

- `/`: 통합 홈
- `/ministry-guide`: 위키에서 추린 월별 사역 흐름·운영 플레이북·공지·수련회 회고
- `/semesters`, `/semester/[id]`: 학기 중 사역
- `/sunday-ministry`: 학기 구분 없는 주일 사역(행정·바나바, 새친구·학생 변동)
- `/retreats`, `/retreat/[id]`: 수련회 행정
- `/retreat/[id]/field`: 이가드 현장 운영

서비스 이름은 **분당우리교회 서현고등부**이고, 운영 주소는 `https://woorihigh-app.vercel.app` 입니다(구 `highschool-app-flame.vercel.app`도 같은 배포를 가리킵니다).

## 화면 셸 규칙

- 사이트 제목·계정·로그아웃·상단 메뉴는 `GlobalPortalHeader` 하나만 담당합니다. 하위 화면에 "수련회 행정시스템" 같은 제목 줄을 다시 만들지 않습니다(제목 2줄 중복 금지).
- 상단 메뉴는 **학기 중 사역 / 주일 사역 / 방학 중 사역 / 사역 가이드 / 사이트 건의사항** 순서입니다. 방학 중 사역은 hover·클릭 시 `수련회 행정팀`(`/retreats`)·`수련회 이가드팀`(`/field`) 드롭다운으로 갈라집니다.
- **방학 중 사역 홈은 화면 하나**입니다. 두 경로 모두 `features/portal/VacationHome.tsx`를 렌더하고, `mode`("admin"/"field")로 **수련회에 들어갔을 때의 목적지만** 달라집니다(행정 화면 / 현장 화면). 목록·수련회 기간·준비 일정 캘린더는 완전히 같은 컴포넌트를 씁니다. 각 라우트는 로그인·권한 게이트와 도메인 전용 요소(행정: 폼 가이드·삭제·브레인스토밍 / 현장: PIN 배지·현장 관리자)만 슬롯으로 넘깁니다.
- 방학 중 사역 홈의 `새 수련회`는 항상 **수련회 목록 제목 옆**에 두고, 폼 가이드·PIN 잠금·현장 관리자처럼 목록 전체에 작용하는 도구는 `VacationHome.headerActions`를 통해 **화면 우측 상단**에 둡니다. 행정·현장 라우트가 이 위치를 따로 렌더링하지 않습니다.
- 준비 일정 캘린더는 `RetreatCalendarPanel` 하나로 통일했습니다(구 `PrepCalendar` 삭제). 수련회 기간 편집은 Rules상 행정 권한이 필요하므로 `canEditPeriods`로 잠급니다 — `prepMilestones`는 이가드팀도 공유 편집합니다.
- 통합 브랜드 색: 학기·수련회 행정·이가드 모두 `globals.css`의 미드나이트 인디고·코발트·틸 토큰을 공유합니다. `.semester-scope`와 `.iguard-scope`는 배경·최소 높이만 제공하며 도메인별 원색으로 토큰을 재정의하지 않습니다. 상태 의미(정상·검토·위험)에만 에메랄드·앰버·로즈를 사용합니다.
- **수련회 PIN 잠금은 `useRetreatPinGate` 하나로만 판정합니다**(`src/features/portal/useRetreatPinGate.ts`). 잠금은 `retreats/{id}/iguard/accessLock` 한 노드에만 있으므로 **행정·이가드 어느 쪽에서 잠가도 양쪽이 잠깁니다**. 화면마다 구독을 새로 짜면 한쪽만 잠기는 사고가 납니다. 설정 UI는 공용 `AdminModal`(현장·행정 홈이 함께 씀), PIN 우회는 통합관리자만.
- **로드 실패 배너는 `useLoadErrors(scope)` 하나만 씁니다**(`src/lib/useLoadErrors.ts`). 실패를 경로별로 모아 **전부** 나열하고, `scope`(학기 id·계정 uid)가 바뀌면 렌더 중 파생으로 초기화합니다. 단일 `loadError` 문자열로 되돌리지 마세요 — 5개 구독이 동시에 거부돼도 마지막 하나만 보여 2026-08-08에 권한 공백의 원인을 두 번 잘못 짚었습니다. 저장·삭제 실패는 `actionError`로 분리합니다. ⚠ Firebase RTDB는 **한 번 거부된 리스너를 규칙이 바뀌어도 재시도하지 않습니다** — 권한을 열어도 그 탭은 새로고침(재구독) 전까지 실패 상태로 남습니다.

## 권한 — 6단계 역할 (단일 원천: `src/features/portal/accessPolicy.ts`)

| 역할 | 학기·주일 사역 | 수련회 행정 | 이가드 현장 | 역할 배정 | DB 저장 위치 |
|---|---|---|---|---|---|
| 통합관리자 | 수정 | 수정 | 전체 | ✅ | `admins/{uid} = true` |
| 교역자 | 수정 | 수정 | 전체 | — | `retreatAdmins/{uid}.role = "pastor"` |
| 팀장 | 수정 | 수정 | 전체 | — | `retreatAdmins/{uid}.role = "leader"` |
| 행정팀 | 수정 | 수정 | 실행탭만 | — | `retreatAdmins/{uid}.role = "adminTeam"` (role 없는 레거시도 동일) |
| 이가드팀 | ✕ | ✕ | 전체 | — | `iguardMembers/{uid}` + `iguardRoles/{uid} = "team"` |
| 스탭 | 조회만 | ✕ | 실행탭만 | — | `iguardMembers/{uid}` + `iguardRoles/{uid} = "staff"` |

- 화면 게이트는 `canAccessPortalArea` / `canEditPortalArea` / `iguardScope` / `canManageRoles`만 사용합니다. 컴포넌트에서 역할 문자열을 직접 비교하지 않습니다.
- 역할 판정은 `resolveMinistryRole`(순수) 하나로, 통합 `AuthContext`와 이가드 `AuthContext`가 같은 결론을 냅니다.
- 역할 배정 쓰기는 `roleAssign.planRoleAssignment`(순수·테스트) → `applyRole.applyRoleSteps`(실행) 경로만 사용합니다. 부여를 먼저, 해제를 나중에 실행합니다.
- 학기 화면의 편집 잠금은 `features/semester/EditContext`의 `useSemesterCanEdit()`으로만 판단합니다.
- 스탭의 학기 **조회**는 2026-08-08 Rules 보강으로 열렸습니다 — `semesters` `.read`에 `iguardMembers`가 추가됐습니다. `.write`는 계속 `admins`/`retreatAdmins`만이고, 연락처가 있는 `semestersPrivate`는 **행정 전용 그대로**입니다. 즉 스탭은 `semesters/*`(명단·팀·훈련 반·회차·출석·커리큘럼)를 읽지만 저장은 못 합니다. Rules는 학생 앱에서만 배포합니다.
- 행정 권한과 이가드 권한의 **쓰기 경계**는 계속 분리합니다. 이가드팀 계정은 통합 홈과 현장 화면만 사용합니다.

## 학기 사역 계약 (2026-08-06)

- **접수 원칙**: 훈련(`trainingClassId`)을 신청해야 사역팀(`choice1`)에 지원할 수 있다. 예외는 **고3 2학기와 스탭**. 판정은 `features/semester/intakeRule.ts`(순수)만 사용하고 화면에서 조건을 재구현하지 않는다.
- `trainingOnly`는 계속 저장하되 `deriveTrainingOnly`로 파생한다 — 출석·수료 명단(`roster.ts`)이 쓰는 기존 계약이라 직접 세팅하지 않는다.
- **훈련 명단**은 훈련 반 배정자 전원이다(사역팀을 겸하는 사람 포함). 레거시 `trainingOnly=true`도 훈련 신청으로 흡수한다.
- **회차 유형**은 `sessionKind.ts`로만 변환한다. 저장 스키마(`type`/`label`)는 그대로이고, **출석 집계(만점)에서 빠지는 것은 `휴강`뿐**이다(`completion.regularSessions`).
- 훈련 반 삭제는 `trainingClass.ts`의 루트 다중 경로 update로 신청자 참조까지 함께 정리한다(팀 삭제와 같은 패턴).
- **학기 삭제**(`removeSemester`)는 `semesters/{sid}`와 `semestersPrivate/{sid}`를 한 번의 루트 update로 지운다. 되돌릴 수 없으므로 화면에서 **학기 ID를 직접 입력받아** 확인한 뒤에만 호출한다.
- **수련회 생성**은 행정·이가드 공용 컴포넌트 `features/portal/NewRetreatButton.tsx` 하나만 쓴다. `retreats/{id}`가 공유 노드라 어느 화면에서 만들어도 양쪽 목록에 나타난다. 쓰기는 행정 db(`@/lib/db`)가 담당하고 버튼은 `canEditPortalArea("retreat-admin")`로 게이트한다.
- **교사·스탭 접수**는 학생과 다른 경로다: 훈련·지망 없이 사역팀에 바로 배정한다(`intakeRule.isStaffApplicant`). 저장 시 `teamId`를 직접 채우고 `choice1/2`·`trainingClassId`는 비운다.
- **배치·커리큘럼은 두 축**이다: 사역팀(`teams`)과 훈련 반(`trainingClasses`). 커리큘럼은 `curriculum/{id}` 한 맵을 공유한다(두 축의 id가 겹치지 않는다). 훈련 반에는 `goal`이 없으므로 학기 목표 박스는 사역팀에서만 보인다.
- **홈 공유 캘린더**의 "공유 일정"은 `prepMilestones`다. 추가·수정·삭제는 Rules와 같게 스탭을 제외하고 열어 둔다(`canEditPortalArea("retreat-admin") || iguardScope === "all"`).
- **사역 가이드**는 정적 운영 지식 화면이다. 위키 원문 중 반복 가능한 운영 원칙만 `features/ministryGuide/ministryGuideContent.ts`에 옮기며 Firebase를 읽거나 쓰지 않는다. 연간 계획은 반드시 `가안`으로 표시하고, 학생 실명·연락처·주소·가정·건강 특이사항과 미결 아이디어는 넣지 않는다.
- **주일 사역의 새친구 탭**은 학기 선택 없이 모든 `semesters/*/newFriends`를 통합 조회한다. 기존 학기별 기록은 이동하지 않고, 신규 기록만 학기가 아닌 연도별 내부 작업공간 `semesters/{year}-sunday/newFriends`와 `semestersPrivate/{year}-sunday/newFriendsPrivate`에 저장한다. 이 작업공간은 `meta`를 두지 않아 학기 목록에 나타나지 않는다. 행정팀은 접수·2주 과정·등록 결정·반배정을 관리하고, `classes/{year}` 반영은 현재 Rules와 일치하게 통합관리자만 `registerNewFriendInRoster`를 호출한다. 이 함수는 새친구 ID 기반 결정적 학생 ID, 중복 차단, 대상 반 확인, 비공개 사전 스냅샷, 단일 학생 경로+반영 이력의 원자 update와 재조회 검증을 유지한다. 반영된 새친구 삭제도 통합관리자만 가능하며, `removeNewFriendFromRoster`가 결정적 `nf_` ID·현재 이름·연결 반을 재검증하고 학생·해당 출석·새친구 공개/비공개 기록을 원자 삭제한다. 삭제 직전 전체 사본은 `newFriendRosterBackups/{friendId}/removals/{timestamp}`에, 학생 복구 사본은 `trash/{year}/students/{studentId}`에 남기고 결과를 재조회한다. 일반적인 `classes`·`attendance` 쓰기 함수로 넓히지 않는다.
- 큐싯 **구글 시트 연동은 2026-08-07 제거**했다(표 붙여넣기만 사용). `iguard/cueSheet` 노드와 db 함수는 남아 있지만 화면에서 쓰지 않는다 — 되살릴 때만 참고한다.
- **인원체크 키에 배열 인덱스를 넣지 않는다** — `checklistKeys.ts`의 `stableMemberId`(`{kind}:{ownerId}:{name}`)만 쓴다. 인덱스를 넣으면 행사 중 한 명이 불참 처리될 때 뒤 사람들의 체크가 통째로 어긋난다. 운영 DB에는 구형 인덱스 키가 남아 있으므로 판정·해제는 반드시 `memberCheckKeys`/`isMemberChecked`를 거친다(신형·구형 동시 인식, 쓰기는 신형만).
- **삭제는 짝이 되는 노드를 반드시 함께 지운다** — 수련회는 `buildRetreatRemovalUpdates`(`retreats` + `retreatsPrivate`), 팀·훈련 반은 `curriculum`까지. 한쪽만 지우면 화면에서 접근 불가능한 고아가 남는다(민감정보면 더 심각).
- **전체 덮어쓰기 복구는 사전 백업 성공을 확인한 뒤에만** — `backupNodeBeforeOverwrite`의 반환값을 반드시 검사한다(`if (!backedUp) throw`). 스로틀된 상시 저장 백업만 예외다.
- **출석 표**(`AttendanceGrid`)의 셀은 토글이 아니다. 셀을 누르면 출석·지각·결석·지우기를 명시적으로 고른다(멱등 기록 — 실수 규칙 11).
- `.input`은 `@layer` 밖 규칙이라 `width:100%`가 유틸리티 `w-*`를 이긴다. 폭은 감싼 div로 주고, 높이는 `h-*`로 고정하지 않는다(모바일 16px 글꼴에서 글자가 잘린다).

## Firebase 안전

- 기존 앱의 경로·스키마·민감정보 분리를 그대로 유지합니다. `classes`·`attendance`·`trash` 쓰기는 위 새친구 신규 학생 단건과 그 결정적 `nf_` 학생의 검증된 되돌리기 외에는 추가하지 않습니다.
- 새 경로는 반드시 해당 도메인의 `paths.ts`에 먼저 추가합니다.
- `retreatsPrivate/*`, `semestersPrivate/*` 데이터가 현장 화면이나 일반 사용자에게 노출되지 않게 합니다.
- Firebase Rules는 이 앱에서 배포하지 않습니다.

## 운영 원칙

1. 기존 기능 동등성과 DB 호환 계약을 회귀 테스트로 유지합니다.
2. PC·375px과 권한별 계정으로 저장·인쇄·실시간 갱신을 검증합니다.
3. 수련회 행정·현장 모듈의 쓰기 경계와 권한 판정을 계속 분리합니다.
4. 레거시 코드 복구가 필요하면 `pre-legacy-app-removal-2026-08-05` 태그를 사용합니다.

상세 계획은 `../docs/UNIFIED_HIGHSCHOOL_MIGRATION.md`를 참고합니다.
