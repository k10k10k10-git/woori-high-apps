# 고등부 출석부

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

분당우리교회 서현고등부의 담임 교사와 출석부 관리자. 교사는 담당 반의 출석을 기록하고, 관리자는 반·학생·계정과 전체 출석을 관리한다. 이 구분은 기존 앱과 역할 계약을 따른다.

## Product Purpose

주일 출석을 기록하고 반별 상황을 확인하는 학생 출석 PWA다. 기존 명단과 실시간 출석 원장을 재사용한다.

## Capabilities and Constraints

- 정적 Next.js 앱을 Firebase Hosting에 배포한다. Firebase 프로젝트 `woori-high`는 통합 앱과 공유한다.
- 교사와 관리자의 데이터 접근 범위, 장결 분리, 행사 제외, 최근 주일 입력 계약을 유지한다.
- 사용자의 2026-09-05 결정에 따라 공용 데모 모드를 유지한다. 데모의 실제 DB 권한과 교사처럼 보이는 화면 제한은 다른 계약이다.
- 데이터·Rules·배포 안전 기준은 루트 `CLAUDE.md`, `DB_OWNERSHIP.md`, `OPERATIONS.md`가 원천이다.
- 운영 데이터와 가상 미리보기 데이터를 혼동하지 않는다. 검증 화면에는 가상 데이터임을 표시한다.

## Brand Commitments

사용자는 2026-09-05 관리자 로그인 후 화면을 만들면서 Linear의 UI/UX를 참고하도록 요청했다. 한국어 업무 용어와 기존 출석부 명칭을 사용한다. 교사·데모 화면의 기존 사용 흐름은 유지한다.

## Evidence on Hand

실제 동작은 `src/components/AppShell.tsx`, `src/store/AppContext.tsx`, `src/components/tabs/AttendanceTab.tsx`와 `src/lib/demo.ts`에서 확인한다. 원장 소유권·권한은 앱 매뉴얼과 Rules 계약 테스트에서 확인한다.
