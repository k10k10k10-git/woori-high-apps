---
name: project-session-2026-06-23
description: "2026-06-23 운영 안정화 세션 — DB계약, Rules, 경로중앙화, 모바일UX, 에러처리, 컴포넌트분할, 조배정 개선"
metadata: 
  node_type: memory
  type: project
  originSessionId: 4ec60dbf-98b2-4148-8aa0-c0a86ffa92d9
---

2026-06-23 대규모 운영 안정화 세션에서 완료한 작업 목록.

**DB 계약 안정화:**
- DB_OWNERSHIP.md 생성 — 4개 앱의 모든 Firebase 경로 소유권/의존관계 지도
- Firebase Rules 단일화 — 학생 앱만 배포용, 나머지 DO_NOT_DEPLOY
- paths.ts 도입 (행정+이가드) — DB 경로 문자열 중앙화
- 행정↔이가드 계약 테스트 19개 — contract.test.ts

**코드 품질:**
- 에러 처리 보강 — 이가드 subscribe onError 콜백, 학생 앱 토스트 에러
- 행정 앱 전탭 에러 처리 통일 — 15개 탭 모두 동일 패턴
- 미사용 API Route 제거 — 학생 앱 api/ai 삭제
- 컴포넌트 분할 — 이가드 ScheduleView(1665→5파일), 행정 AutoAssignPanel(1051→4파일)
- 의존성 업데이트 — Next.js 16.2.9, Firebase 12.15.0

**UI/UX:**
- 행정 사이트 모바일 전체 개선 — 헤더, 탭바, 통계카드, 테이블, 폼
- 학생 앱 모바일 반응형 CSS 160줄+ 추가
- ParticipantsTab 테이블 가로 표시 (whitespace-nowrap)

**기능 추가:**
- 조배정 알고리즘에 maxGroupSize 제한 + 조수 자동 계산
- 알고리즘 UI 정리 — 기본 적용(설명만)/선택 적용(체크박스) 2박스 분리
- 이가드 조스탭 외 인원 팝오버에서 조스탭 섹션 숨김

**문서:**
- OPERATIONS.md — 배포/백업/복구/장애대응 운영 절차서

**Why:** 기능 추가보다 운영 안정화가 우선이었고, DB가 4개 앱의 공유 API 역할을 하는데 계약이 없었음.

**How to apply:** 이후 기능 추가 시 DB_OWNERSHIP.md와 paths.ts를 먼저 확인. 배포는 OPERATIONS.md 절차 따름.
