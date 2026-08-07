# 고등부 통합 웹페이지 운영 지침

루트 `../CLAUDE.md`가 최우선 규칙입니다. 이 문서는 통합 앱에만 해당하는 보충 지침입니다.

## 목적

학기 사역, 수련회 행정, 이가드 현장 기능을 `highschool-app` 한 코드베이스와 배포 단위로 운영합니다. 독립 `retreat-app`·`iguard-app`은 2026-08-05 제거했지만 운영 DB 경로와 데이터 형태는 그대로 유지합니다.

## 라우트

- `/`: 통합 홈
- `/semesters`, `/semester/[id]`: 학기 중 사역
- `/retreats`, `/retreat/[id]`: 수련회 행정
- `/retreat/[id]/field`: 이가드 현장 운영

서비스 이름은 **분당우리교회 서현고등부**이고, 운영 주소는 `https://woorihigh-app.vercel.app` 입니다(구 `highschool-app-flame.vercel.app`도 같은 배포를 가리킵니다).

## 화면 셸 규칙

- 사이트 제목·계정·로그아웃·상단 메뉴는 `GlobalPortalHeader` 하나만 담당합니다. 하위 화면에 "수련회 행정시스템" 같은 제목 줄을 다시 만들지 않습니다(제목 2줄 중복 금지).
- 상단 메뉴는 **학기 중 사역 / 방학 중 사역** 두 항목이며, 방학 중 사역은 hover·클릭 시 `수련회 행정팀`(`/retreats`)·`수련회 이가드팀`(`/field`) 드롭다운으로 갈라집니다.
- **방학 중 사역 홈은 화면 하나**입니다. 두 경로 모두 `features/portal/VacationHome.tsx`를 렌더하고, `mode`("admin"/"field")로 **수련회에 들어갔을 때의 목적지만** 달라집니다(행정 화면 / 현장 화면). 목록·수련회 기간·준비 일정 캘린더는 완전히 같은 컴포넌트를 씁니다. 각 라우트는 로그인·권한 게이트와 도메인 전용 요소(행정: 폼 가이드·삭제·브레인스토밍 / 현장: PIN 배지·현장 관리자)만 슬롯으로 넘깁니다.
- 준비 일정 캘린더는 `RetreatCalendarPanel` 하나로 통일했습니다(구 `PrepCalendar` 삭제). 수련회 기간 편집은 Rules상 행정 권한이 필요하므로 `canEditPeriods`로 잠급니다 — `prepMilestones`는 이가드팀도 공유 편집합니다.
- 도메인별 색: 학기=초록(`.semester-scope`), 행정=스카이(기본 토큰), 이가드=보라(`.iguard-scope`). 레이아웃·컴포넌트 클래스(`card`/`input`/`btn-primary`/`table-header`)는 세 도메인이 공유합니다.

## 권한 — 6단계 역할 (단일 원천: `src/features/portal/accessPolicy.ts`)

| 역할 | 학기 중 사역 | 수련회 행정 | 이가드 현장 | 역할 배정 | DB 저장 위치 |
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
- ⚠ 스탭의 학기 조회는 Firebase Rules에서 `semesters` 읽기가 `admins`/`retreatAdmins`로 제한되어 있어 **Rules 보강 전에는 실제 데이터가 로드되지 않습니다**(에러 배너로 표시). Rules는 학생 앱에서만 배포합니다.
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
- **출석 표**(`AttendanceGrid`)의 셀은 토글이 아니다. 셀을 누르면 출석·지각·결석·지우기를 명시적으로 고른다(멱등 기록 — 실수 규칙 11).
- `.input`은 `@layer` 밖 규칙이라 `width:100%`가 유틸리티 `w-*`를 이긴다. 폭은 감싼 div로 주고, 높이는 `h-*`로 고정하지 않는다(모바일 16px 글꼴에서 글자가 잘린다).

## Firebase 안전

- 기존 앱의 경로·스키마·민감정보 분리를 그대로 유지합니다.
- 새 경로는 반드시 해당 도메인의 `paths.ts`에 먼저 추가합니다.
- `retreatsPrivate/*`, `semestersPrivate/*` 데이터가 현장 화면이나 일반 사용자에게 노출되지 않게 합니다.
- Firebase Rules는 이 앱에서 배포하지 않습니다.

## 운영 원칙

1. 기존 기능 동등성과 DB 호환 계약을 회귀 테스트로 유지합니다.
2. PC·375px과 권한별 계정으로 저장·인쇄·실시간 갱신을 검증합니다.
3. 수련회 행정·현장 모듈의 쓰기 경계와 권한 판정을 계속 분리합니다.
4. 레거시 코드 복구가 필요하면 `pre-legacy-app-removal-2026-08-05` 태그를 사용합니다.

상세 계획은 `../docs/UNIFIED_HIGHSCHOOL_MIGRATION.md`를 참고합니다.
