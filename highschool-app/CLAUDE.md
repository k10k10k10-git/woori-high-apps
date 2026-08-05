# 고등부 통합 웹페이지 운영 지침

루트 `../CLAUDE.md`가 최우선 규칙입니다. 이 문서는 통합 앱에만 해당하는 보충 지침입니다.

## 목적

학기 사역, 수련회 행정, 이가드 현장 기능을 `highschool-app` 한 코드베이스와 배포 단위로 운영합니다. 독립 `retreat-app`·`iguard-app`은 2026-08-05 제거했지만 운영 DB 경로와 데이터 형태는 그대로 유지합니다.

## 라우트

- `/`: 통합 홈
- `/semesters`, `/semester/[id]`: 학기 중 사역
- `/retreats`, `/retreat/[id]`: 수련회 행정
- `/retreat/[id]/field`: 이가드 현장 운영

운영 주소는 `https://woorihigh-app.vercel.app` 입니다(구 `highschool-app-flame.vercel.app`도 같은 배포를 가리킵니다).

## 화면 셸 규칙

- 사이트 제목·계정·로그아웃·상단 메뉴는 `GlobalPortalHeader` 하나만 담당합니다. 하위 화면에 "수련회 행정시스템" 같은 제목 줄을 다시 만들지 않습니다(제목 2줄 중복 금지).
- 상단 메뉴는 **학기 중 사역 / 방학 중 사역** 두 항목이며, 방학 중 사역은 hover·클릭 시 `수련회 행정팀`·`수련회 이가드팀` 드롭다운으로 갈라집니다.
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
