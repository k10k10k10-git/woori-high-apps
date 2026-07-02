---
name: project-db-paths-centralized
description: Firebase DB paths centralized into paths.ts files for admin and iguard apps (2026-06-23)
metadata: 
  node_type: memory
  type: project
  originSessionId: 4ec60dbf-98b2-4148-8aa0-c0a86ffa92d9
---

Firebase DB 경로 문자열을 paths.ts 파일로 중앙화 완료 (2026-06-23).

- 행정 앱: `src/lib/paths.ts` — db.ts, AuthContext.tsx에서 사용
- 이가드 앱: `src/lib/paths.ts` — db.ts, AuthContext.tsx, ScheduleView.tsx에서 사용
- 학생 앱, 교사·스탭 앱: 아직 미적용 (학생 앱은 hooks/useFirebaseData.ts와 컴포넌트에 경로가 흩어져 있음)

**Why:** 4개 앱이 공유하는 Firebase DB에서 경로 문자열이 여러 파일에 흩어져 있어, 경로 변경 시 빠뜨리면 앱 간 꼬임이 발생했음.

**How to apply:** 새 DB 경로를 추가하거나 기존 경로를 변경할 때는 반드시 paths.ts를 먼저 수정하고, 해당 경로를 사용하는 모든 곳에서 paths 함수를 사용한다.

관련: [[project-db-ownership-doc]], [[project-firebase-rules-unified]]
