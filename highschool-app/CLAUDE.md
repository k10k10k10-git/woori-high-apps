# 고등부 통합 웹페이지 운영 지침

루트 `../CLAUDE.md`가 최우선 규칙입니다. 이 문서는 통합 앱에만 해당하는 보충 지침입니다.

## 목적

학기 사역, 수련회 행정, 이가드 현장 기능을 `highschool-app` 한 코드베이스와 배포 단위로 운영합니다. 독립 `retreat-app`·`iguard-app`은 2026-08-05 제거했지만 운영 DB 경로와 데이터 형태는 그대로 유지합니다.

## 라우트

- `/`: 통합 홈
- `/semesters`, `/semester/[id]`: 학기 중 사역
- `/retreats`, `/retreat/[id]`: 수련회 행정
- `/retreat/[id]/field`: 이가드 현장 운영

## 권한

- `admins/{uid}`: 전체 관리자
- `retreatAdmins/{uid}`: 학기·행정 접근
- `iguardMembers/{uid}`, `iguardRoles/{uid}`: 이가드 접근

행정 권한과 이가드 권한을 합쳐서 판정하지 않습니다. 이가드 전용 사용자는 통합 홈과 현장 화면에만 접근하고 학기·행정 화면은 사용할 수 없어야 합니다.

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
