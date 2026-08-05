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
- `src/features/semester`: 학기 데이터·유틸리티
- `src/features/iguard`: 이가드 데이터·유틸리티·인증
- `src/features/portal`: 통합 홈
- `src/lib/paths.ts`: 공통/행정 Firebase 경로 단일 원천

## 검증

```bash
npx tsc --noEmit
npm test
npm run build
```

독립 `retreat-app`·`iguard-app`은 기능 동등성 확인과 사용자 승인 후 2026-08-05 제거했습니다. 복구 태그는 `pre-legacy-app-removal-2026-08-05`입니다.

## 핵심 코드 패턴

### 통합 포털에서도 도메인 권한과 DB 소유권을 합치지 않기 (2026-08-05)
- **접근법**: 1→ `semester-app`, `retreat-app`, `iguard-app`의 라우트를 `highschool-app/src/app` 아래로 편입한다. 2→ 기존 `semesters/*`, `retreats/{id}/*`, `retreats/{id}/iguard/*` 경로는 그대로 둔다. 3→ 공통 `AuthContext`에서 행정 `accessLevel`과 이가드 `iguardAccessLevel`을 별도 값으로 읽는다. 4→ 통합 홈은 두 권한 중 하나가 있으면 열되, 링크와 메뉴는 각 도메인 권한으로 다시 제한한다. 5→ 타입 검사·전체 테스트·프로덕션 빌드와 비로그인 PC·375px 화면을 확인한다.
- **판단 질문**: 기존 DB를 새 통합 노드로 복사하거나 행정 승인과 이가드 승인을 하나의 `accessLevel`로 합치지 않는다. 전자는 롤백과 앱별 소유권을 깨고, 후자는 이가드 전용 스탭에게 행정·학기 화면을 잘못 열 수 있기 때문이다. 레거시 앱 삭제 뒤에도 이 계약과 복구 태그를 유지한다.
- **재사용 규칙**: 여러 운영 앱을 한 웹페이지로 합칠 때는 먼저 라우트·인증 진입점·배포 단위만 합치고, 저장 경로와 권한 판정은 원래 도메인별로 분리한 채 화면 노출만 조합한다.

### 통합 홈의 개인 담당은 이가드 큐카드 계산 규칙을 재사용하기 (2026-08-05)
- **접근법**: 1→ `src/features/iguard/lib/staffIdentity.ts`, `personalDuty.ts`, `defaultSegment.ts`, `groupStaffNames.ts`의 기존 식별·담당 계산 함수를 재사용한다. 2→ `src/features/portal/myRetreatMinistry.ts`에서 조스탭·자유 텍스트 담당·구조화 포스트를 하나의 읽기 전용 결과로 합친다. 3→ `src/features/portal/useMyRetreatMinistry.ts`는 필요한 기존 경로만 좁게 구독하고 수련회 또는 권한이 바뀌면 이전 상태를 먼저 비운다. 4→ 실제 로그인 계정으로 이가드 개인 큐카드와 포털 결과를 대조하고 375px 화면까지 확인한다.
- **판단 질문**: 포털 전용 담당 노드를 새로 저장하거나 이름 포함 검색을 별도로 구현하지 않는다. 새 노드는 기존 큐카드와 불일치할 수 있고, 단순 포함 검색은 동명이인·접미사(`sf`) 때문에 오배정될 수 있기 때문이다.
- **재사용 규칙**: 다른 화면에 개인화된 운영 정보를 요약할 때는 원본 도메인의 식별·정렬·담당 계산 함수를 순수 함수로 재사용하고, 새 저장값 대신 기존 데이터의 읽기 전용 파생 결과를 보여준다.

### 메뉴 숨김과 직접 URL 접근에 같은 권한 계약 적용하기 (2026-08-05)
- **접근법**: 1→ `src/features/portal/accessPolicy.ts`에 홈·학기·수련회 행정·이가드 현장의 접근 규칙을 순수 함수로 둔다. 2→ 통합 홈의 메뉴/링크와 각 상세 라우트의 진입 가드가 같은 함수를 사용하게 한다. 3→ 이가드 전용 계정이 `/retreat/[id]`를 직접 열었을 때 DB 읽기를 시작하기 전에 차단하고 `/retreat/[id]/field`로 갈 수 있게 한다. 4→ 미승인·이가드 스탭·이가드팀·행정팀·전체 관리자 조합을 표 기반 테스트로 고정한다.
- **판단 질문**: 메뉴만 숨기고 Firebase Rules에만 의존하지 않는다. Rules는 최종 보안 경계이지만, 직접 URL 진입 후 권한 없는 구독/읽기를 시도하면 사용자에게 오류 화면을 보이고 권한 경계도 불명확해지기 때문이다.
- **재사용 규칙**: 권한별로 메뉴를 나누는 통합 앱에서는 같은 순수 접근 정책을 링크 생성과 라우트 진입 모두에 적용하고, 권한 없는 DB 읽기보다 앞서 차단한다.

### 팀원 화면은 통합하되 기존 권한 저장 계약은 분리 유지하기 (2026-08-05)
- **접근법**: 1→ `src/features/portal/UnifiedTeamModal.tsx`에서 `retreatAdmins`, `retreatPending`, `iguardMembers`, `iguardRoles`, `iguardPending`을 각각 기존 DB 함수로 읽는다. 2→ UID를 기준으로 관리자·이가드 멤버와 승인 요청을 화면에서만 합친다. 3→ 행정·학기 승인과 이가드 역할 변경은 각 도메인의 기존 승인·삭제 함수를 호출한다. 4→ `src/features/portal/GlobalPortalHeader.tsx` 한 곳에서 모달을 열고 기존 행정·이가드 전용 팀원 버튼과 중복 모달을 제거한다. 5→ 권한 버튼을 누르지 않는 읽기 전용 브라우저 점검과 타입 검사·전체 테스트·빌드로 검증한다.
- **판단 질문**: 통합 팀원 노드를 새로 만들거나 `retreatAdmins`와 `iguardMembers`를 한 번에 덮어쓰지 않는다. 새 노드는 기존 앱·Rules와 이중 진실을 만들고, 전체 덮어쓰기는 일부 권한만 수정해도 다른 도메인의 승인 상태를 손상시킬 수 있기 때문이다.
- **재사용 규칙**: 여러 앱의 권한 관리 UI를 합칠 때는 UID 기반 읽기 모델만 합치고, 쓰기는 원래 경로별 최소 단위 함수로 분리하여 기존 Rules와 앱 호환성을 유지한다.
