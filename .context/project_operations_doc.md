---
name: project-operations-doc
description: OPERATIONS.md 운영 절차서 — 배포/백업/복구/장애대응/권한관리 문서
metadata: 
  node_type: memory
  type: project
  originSessionId: 4ec60dbf-98b2-4148-8aa0-c0a86ffa92d9
---

`OPERATIONS.md`를 프로젝트 루트에 생성 (2026-06-23). 운영 절차 전체를 문서화.

포함 내용: 앱별 배포 방법, 배포 전 체크리스트, 백업/복구 절차, 장애 대응, 민감정보 위치, 관리자 권한 부여, 새 수련회 생성 흐름.

배포 현황:
- 학생 앱: Firebase Hosting (`firebase deploy --only hosting`)
- 행정 앱: Vercel (`npx vercel --prod`), URL: retreat-app-theta.vercel.app
- 이가드 앱: Vercel (`npx vercel --prod`)
- 교사·스탭 앱: 미배포 (여름수련회 이후 진행 예정)

**Why:** 앱이 4개라 배포/복구 방법이 기억에만 의존하면 실수 가능.

**How to apply:** 배포나 운영 관련 질문 시 이 문서를 참조.

관련: [[project-db-ownership-doc]]
