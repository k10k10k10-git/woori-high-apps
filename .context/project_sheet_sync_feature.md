---
name: project-sheet-sync-feature
description: 학생 출석부 구글시트 동기화 기능 — AdminTab의 SheetSyncSection (2026-06-25)
metadata: 
  node_type: memory
  type: project
  originSessionId: 4ec60dbf-98b2-4148-8aa0-c0a86ffa92d9
---

학생 출석부 앱에 구글 시트 → Firebase 동기화 기능 추가 (2026-06-25).

- `src/lib/sheetSync.ts` — xlsx export 페치, 탭 파싱, 변경 plan, payload 생성 (순수 로직)
- `src/components/tabs/SheetSyncSection.tsx` — AdminTab의 "새해 진급 처리" 아래 UI + 미리보기
- 시트 URL은 `config/sheetSync` (admin 전용) 에 저장

**동작 원리:**
- 한 부 = 스프레드시트 1개. 반 = 탭 1개, 탭 이름 "{학년}-{반}  {교사}T" (예 "1-1  김태훈T"). 비반 탭(전체학생명단 등) 자동 무시.
- xlsx export(`?format=xlsx`)로 전체 탭 한 번에 페치 (CSV gid 열거 불필요). 학생 1명=4행(이름/전화/주소/빈줄), 출석마크 "0"=출석.
- 출석 cellKey는 `getSundaysForYear`로 컬럼→evKey 매핑. **빈칸→결석(X)은 "이미 지난 일요일"에만** 적용(미래는 미입력).
- 학생 매칭: 이름(접미사 제거) 기준. **동명이인은 반이동 오탐 가능** — 미리보기의 '반 이동' 목록을 반드시 검토.
- 적용: classes/{year}/{ck}/students 전체 교체(사진은 이름매칭으로 보존), attendance는 셀 단위 병합(미래/미매핑 셀 보존). 시트가 명단·출석의 원천.

**Why:** 매주 출석/명단 갱신을 수동 요청 대신 관리자가 직접 동기화하기 위함. classes/attendance는 가장 핵심 노드라 반드시 미리보기 후 적용하도록 게이트.

**How to apply:** 매칭 정확도 개선이 필요하면 이름+생년월일 복합키로 업그레이드 검토. 동기화 관련 버그 시 sheetSync.ts의 컬럼 매핑/4행 구조 파싱 확인.

관련: [[project-db-ownership-doc]], [[feedback-db-safety-first]]
