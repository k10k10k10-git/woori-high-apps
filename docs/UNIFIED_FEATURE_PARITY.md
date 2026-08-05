# 통합 고등부 앱 기능·테스트 동등성 목록

기준일: 2026-08-05

통합 앱: `highschool-app`

원칙: 기존 Firebase 경로와 저장 형태는 이동·변환하지 않고, 화면과 배포 단위만 통합한다.

## 1. 통합 진입·권한

- 통합 홈: 현재 학기, 현재 수련회, 전체 일정, 내 담당 사역
- 학기 목록·관리자 학기 생성: `/semesters`
- 수련회 목록·관리자 수련회 생성: `/retreats`
- 이가드 센터: `/field`
  - Google 로그인
  - 이가드 접근 요청과 승인 대기
  - 관리자 팀원 승인·역할 관리
  - 수련회별 PIN 잠금과 관리자 우회
  - 공용 준비 일정
- 수련회 현장: `/retreat/[id]/field`
- 권한 원천: `admins`, `retreatAdmins`, `iguardMembers`, `iguardRoles`
- 직접 URL과 홈 메뉴가 같은 접근 정책을 적용한다.

## 2. 학기 중 사역 — 기존 `semester-app`

| 화면 | 기능 |
|---|---|
| 접수 | 훈련·사역팀 신청 접수와 신청자 확인 |
| 배치 | 신청자 사역팀 배치, 팀 제거 시 참조 정리 |
| 출석 | 회차별 출석 처리와 현황 집계 |
| 수료 | 훈련·사역팀 수료 기준 계산과 결과 확인 |
| 커리큘럼 | 사역팀별 커리큘럼 작성·관리 |
| 아카이브 | 학기 자료 보관 |
| 설정 | 학기·팀·회차 설정과 임시 편집 상태 보호 |

기존 테스트 3개와 통합 이전 테스트 3개:

- `completion.test.ts`: 수료 기준과 계산
- `settingsDraft.test.ts`: 설정 임시 변경 보호
- `teamRemoval.test.ts`: 팀 삭제 시 신청 데이터 정합

## 3. 방학 중 사역 행정 — 기존 `retreat-app`

5개 그룹, 17개 탭이며 기존 인덱스 0~16을 그대로 유지한다.

- 명단: 신청 접수, 반별 명단, 입금 대조, 취소·환불
- 편성: 조편성, 방배정, 교사 참석
- 이동·참석: 부분 참석, 카풀·자차
- 물품·비용: 여행자 보험, 단체티, 구매 물품, 물품 재고, 식사 인원
- 현장: 현장 등록, 건강 특이사항, 의료 일지

기존 테스트 32개와 통합 이전 테스트 32개:

- 자동 편성·설정: `autoAssign`, `autoAssignConfig`, `assignmentBoard`, `groupsGrid`
- 방배정: `roomAutoAssign`, `roomAutoAssignConfig`, `roomLabel`, `db/groupsRooms`
- 신청·명단·동기화: `db/participants`, `syncParticipants`, `studentMatcher`, `partialPool`, `partialAttendanceType`
- 취소·보험·현장·식사: `cancellationRoster`, `insuranceRoster`, `onSiteRoster`, `mealCountPeople`
- 학급·색상·통계: `classKey`, `rosterColor`, `rosterStats`, `paymentColorKey`
- 조번호·조장·인쇄: `groupNumber`, `groupRoleStudent`, `groupPrint`, `exportUtils`
- 교사: `teacherGender`, `teacherTableSort`, `teacherWrite`
- 공통 계약: `constants`, `sheetsParser`, `useSubmitLock`, `retreatTabs`

## 4. 방학 중 사역 현장 — 기존 `iguard-app`

### 실행 5개

- 개인 큐카드
- 포스트 현황
- 조별 정보
- 숙소 안내
- 인원체크

### 기획 14개

- 전체 개요
- 스탭 전체 큐싯
- 조장 큐싯
- 포스트 편집
- 스탭
- 동선 매트릭스
- 데이터 검증
- 조스탭 배정
- GBS 장소
- 명찰카드
- 식사순서
- 버스배정
- 집회자리
- 숙소 배치도

### 정보 2개

- 조스탭 가이드
- 준비 할일

기존 테스트 42개:

- 접근·호환·계약: `accessLock`, `compat`, `contract`, `inAppBrowser`
- 큐싯·시간·구간: `cueCardTimeline`, `cueSheetSegments`, `defaultSegment`, `scheduleEditorInfrastructure`, `scheduleOverview`, `scheduleProgress`, `scheduleReconcile`, `scheduleSheet`, `scheduleTime`, `scheduleUtils`, `segmentInfrastructure`, `segmentMigration`, `structureClone`
- 동선·담당: `movementReconcile`, `personalDuty`, `staffAssignmentStats`, `staffIdentity`, `fairAssign`, `snapToList`, `validationTeleport`
- 버스: `busCapacity`, `busGender`, `busParticipation`, `busStaff`
- 조·명단·인원체크: `checklistLayout`, `checklistMembers`, `groupNumber`, `groupStaffNames`, `partialAttendance`, `personIndex`
- 현장 출력·표시: `badgeCard`, `lodgingMap`, `mealOrder`, `roomsMealLayout`, `gbsPlaces`, `mobileReadability`, `planningUi`, `stickyLayout`

## 5. 통합 전환 검증 게이트

### 자동 검증

- 네 앱 각각 `npx tsc --noEmit`
- 네 앱 각각 `npm test`
- 네 앱 각각 `npm run build`
- 통합 기능 카탈로그 테스트가 학기 7개, 행정 17개, 현장 21개 화면과 진입 경로를 고정

### 읽기 전용 운영 대조

- 같은 사용자로 기존 앱과 통합 앱의 학기·수련회 목록 수 비교
- 같은 수련회에서 참가자·조·방·교사·부분 참석·이가드 스탭·버스·큐싯 수 비교
- 통합 홈의 현재 항목·전체 일정·내 담당 사역이 원본 경로와 일치하는지 비교
- 관리자, 행정 전용, 이가드 전용 계정의 메뉴와 직접 URL 접근을 각각 확인

### 쓰기 리허설 — 별도 승인 후

- 테스트용 학기 또는 수련회의 단일 필드만 변경
- 변경 전 해당 노드 스냅샷 저장
- 기존 앱과 통합 앱에서 같은 결과 확인
- 즉시 원복하고 재조회

## 6. 전환·롤백

- 새 통합 도메인을 먼저 배포하고 빌드 ID와 주요 경로를 확인한다.
- 기존 세 주소는 안정화 기간 동안 삭제하지 않고 새 주소로 임시 리다이렉트한다.
- 오류 시 리다이렉트를 제거하면 기존 앱으로 즉시 복귀할 수 있다.
- 안정화 기간과 운영자 확인이 끝난 뒤에만 기존 Vercel 프로젝트와 소스를 종료한다.
- 기존 앱 삭제 전 Git 태그를 남겨 언제든 복원할 수 있게 한다.
