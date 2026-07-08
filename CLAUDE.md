# 워크스페이스 공통 규칙 (4개 앱 모노레포)

이 저장소는 Firebase 프로젝트 `woori-high`를 공유하는 4개 앱을 담는다. 상세 지도는 `AGENTS.md`, `DB_OWNERSHIP.md`, `OPERATIONS.md`, 각 앱의 `CLAUDE.md`를 먼저 읽을 것.

## 🔒 DB 안전 4문답 — 모든 작업 시작 시 먼저 답할 것

어떤 작업이든(코드 수정·조사·문서화 포함) 실행에 들어가기 전에 반드시 다음 4가지를 짧게 먼저 답한다:

1. **Firebase DB 데이터를 변경하는가?** (운영 DB 직접 쓰기는 사용자 명시 승인 + 사전 스냅샷 백업 없이는 금지)
2. **실제 배포를 실행하는가?** (`npx vercel --prod` 등 — 사용자가 요청했거나 /ship 절차일 때만)
3. **Firebase Rules 배포가 포함되는가?** (답은 항상 "아니오"여야 함 — Rules 배포 원천은 `고등부 학생 출석부/database.rules.json` 하나뿐. retreat-app/iguard-app의 `DO_NOT_DEPLOY.database.rules.json`은 보관용)
4. **조심해야 할 DB 경로는 무엇인가?** (예: 다른 앱 소유 노드, `retreatsPrivate/*` 민감 데이터, 전체 덮어쓰기 노드)

이 4문답 없이 작업을 시작하지 말 것. 사용자가 별도 안전 헤더를 붙이지 않아도 항상 적용된다.

## 데이터 소유권 요약

| 앱 | 소유 (쓰기 가능) | 다른 앱 노드 |
|---|---|---|
| 학생 출석부 | `classes/`, `attendance/`, `admins`, Rules 배포 | — |
| retreat-app | `retreats/{id}` 행정 데이터, `retreatsPrivate/{id}`, `retreatAdmins` | `classes/` 읽기 전용 |
| iguard-app | `retreats/{id}/iguard/*`, `iguardMembers/Roles/Pending` | 행정 노드 전부 **읽기 전용** |
| 교사·스탭 출석부 | `staff_*` | — (여름수련회 이후까지 작업 보류) |

- 전체 덮어쓰기(`set`) 노드는 기존 백업 패턴(`backupNodeBeforeOverwrite` 등) 유지. 단일 경로 업데이트 우선.
- 민감 데이터(환불계좌·의료일지·주민번호·시트 raw)는 `retreatsPrivate/{id}/` 아래에만.

## 🔁 회귀 검증 규칙 — "고쳤다 → 재발" 루프 차단

버그 수정 시:
1. **수정 완료를 주장하기 전에** 해당 플로우를 실제로 구동해 확인한다(`/verify` 또는 dev 서버에서 재현 절차 반복). "코드상 고쳐졌을 것"이라는 보고 금지.
2. 순수 로직 버그면 **회귀 테스트 1개를 같은 커밋에 포함**한다(과거 사례: 특이사항 초기화 버그가 3개 세션에 걸쳐 5회 재보고됨 — 테스트가 있었으면 1회로 끝났음).
3. 배포가 필요한 수정은 **배포가 Ready 된 뒤에만** 사용자에게 확인을 요청한다. 배포 전 확인 요청이 "여전히 동일해" 헛루프의 주 원인이었다.

## 배포

- 배포·커밋·푸시·Ready 확인은 `/ship` 스킬 절차를 따른다.
- retreat-app은 GitHub push 자동배포가 미작동한 이력이 있음 — push 후 `npx vercel ls`로 반드시 확인 (상세: retreat-app/CLAUDE.md).
- 배포 전 `npx tsc --noEmit` 0 errors + `npm test` 통과 필수.
