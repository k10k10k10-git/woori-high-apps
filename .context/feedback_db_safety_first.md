---
name: feedback-db-safety-first
description: DB 안전성 확인을 모든 작업 전에 먼저 해야 함 — 사용자가 반복적으로 확인한 패턴
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 4ec60dbf-98b2-4148-8aa0-c0a86ffa92d9
---

코드 변경을 제안할 때 "DB가 꼬일 여지가 있는지"를 항상 먼저 답해야 한다.

**Why:** 이 프로젝트에서 과거에 기능 추가 시 DB 경로가 꼬여서 다른 앱이 깨진 경험이 있음. 사용자가 모든 작업 전에 "DB가 꼬일 일 있어?"를 물어보는 패턴이 반복됨 (Rules 단일화, paths 중앙화, 에러 처리, 모바일 개선, API Route 제거, 컴포넌트 분할, 의존성 업데이트 — 모든 단계에서 물어봄).

**How to apply:** 작업 제안 시 첫 문장에서 DB 영향 여부를 명시. "DB와 관련 없습니다" 또는 "이 경로에 영향이 있으니 주의가 필요합니다"를 먼저 말한 후 작업 내용 설명.

관련: [[user-dev-preferences]]
