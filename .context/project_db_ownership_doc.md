---
name: project-db-ownership-doc
description: DB_OWNERSHIP.md created at project root documenting all Firebase path ownership across 4 apps
metadata: 
  node_type: memory
  type: project
  originSessionId: 4ec60dbf-98b2-4148-8aa0-c0a86ffa92d9
---

`DB_OWNERSHIP.md` 문서를 프로젝트 루트에 생성 (2026-06-23). 4개 앱의 모든 Firebase 경로에 대해 소유/읽기/쓰기/영향 범위를 기록.

핵심 의존관계:
- `classes/{year}`: 학생 앱 소유, 3개 앱이 읽음 (가장 높은 꼬임 위험)
- `retreats/{id}/participants`: 행정 소유, 이가드가 읽음
- `retreats/{id}/teachers`: 행정 소유, 이가드가 읽음
- `retreats/{id}/iguard/groupStaff`: 이가드 소유, 행정이 읽음 (역방향 의존)

**Why:** 기능 추가 시 어떤 경로가 다른 앱에 영향을 주는지 파악하기 위해.

**How to apply:** 기능 추가 전 이 문서를 확인하고, 새 경로가 추가되면 문서를 업데이트한다.

관련: [[project-db-paths-centralized]], [[project-firebase-rules-unified]]
