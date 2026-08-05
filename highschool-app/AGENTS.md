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

기능 동등성 확인이 끝나기 전에는 기존 세 앱을 삭제하거나 리다이렉트하지 않습니다.

## 핵심 코드 패턴

### 통합 포털에서도 도메인 권한과 DB 소유권을 합치지 않기 (2026-08-05)
- **접근법**: 1→ `semester-app`, `retreat-app`, `iguard-app`의 라우트를 `highschool-app/src/app` 아래로 편입한다. 2→ 기존 `semesters/*`, `retreats/{id}/*`, `retreats/{id}/iguard/*` 경로는 그대로 둔다. 3→ 공통 `AuthContext`에서 행정 `accessLevel`과 이가드 `iguardAccessLevel`을 별도 값으로 읽는다. 4→ 통합 홈은 두 권한 중 하나가 있으면 열되, 링크와 메뉴는 각 도메인 권한으로 다시 제한한다. 5→ 타입 검사·전체 테스트·프로덕션 빌드와 비로그인 PC·375px 화면을 확인한다.
- **판단 질문**: 기존 DB를 새 통합 노드로 복사하거나 행정 승인과 이가드 승인을 하나의 `accessLevel`로 합치지 않는다. 전자는 롤백과 앱별 소유권을 깨고, 후자는 이가드 전용 스탭에게 행정·학기 화면을 잘못 열 수 있기 때문이다. 기존 앱도 기능 동등성 확인 전에 삭제하지 않는다.
- **재사용 규칙**: 여러 운영 앱을 한 웹페이지로 합칠 때는 먼저 라우트·인증 진입점·배포 단위만 합치고, 저장 경로와 권한 판정은 원래 도메인별로 분리한 채 화면 노출만 조합한다.
