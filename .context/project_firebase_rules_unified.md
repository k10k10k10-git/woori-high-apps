---
name: project-firebase-rules-unified
description: Firebase Rules unified to single source at student app database.rules.json (2026-06-23)
metadata: 
  node_type: memory
  type: project
  originSessionId: 4ec60dbf-98b2-4148-8aa0-c0a86ffa92d9
---

Firebase Rules 배포용 원천을 학생 앱(`고등부 학생 출석부/database.rules.json`) 하나로 단일화 (2026-06-23).

- 행정 앱: `DO_NOT_DEPLOY.database.rules.json`으로 이름 변경, `firebase.json`에서 학생 앱 rules 참조
- 이가드 앱: `DO_NOT_DEPLOY.database.rules.json`으로 이름 변경, `firebase.json` 없음

**Why:** 이가드 rules가 `retreats` 전체에 `auth != null` 읽기를 허용하고 `staff_*` 규칙이 없어서, 잘못 배포되면 권한이 풀리는 운영 사고 위험이 있었음.

**How to apply:** Rules 변경이 필요하면 학생 앱의 `database.rules.json`을 수정하고, 학생 앱 폴더에서 `firebase deploy --only database`를 실행한다.

관련: [[project-db-ownership-doc]]
