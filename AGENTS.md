# 저장소 에이전트 가이드

Firebase 프로젝트 `woori-high`를 공유하는 **운영 앱 2개**와 로컬 운영 도구를 관리한다. 구조 대조일: **2026-09-05**. 전체 운영 매뉴얼은 [CLAUDE.md](CLAUDE.md)이며 이 파일은 작업 진입점이다.

## 작업 시작과 문서 우선순위

1. 루트 `CLAUDE.md` → `.claude/HANDOFF.md`의 해당 작업 최신 날짜·사용자 결정·미완 사항 → 대상 앱의 `CLAUDE.md`와 `AGENTS.md` 순서로 읽는다. 인수인계 중간의 오래된 “현재 상태” 표를 오늘의 상태로 간주하지 않는다.
2. 공통 데이터는 `DB_OWNERSHIP.md`, 배포·복구는 `OPERATIONS.md`, 도구 함정은 `LEARNINGS.md`, 프로젝트 연혁은 `docs/HISTORY.md`를 확인한다.
3. **운영 안전 규칙은 루트 `CLAUDE.md`가 우선한다.** 과거 문서의 앱 수·함수명·명령·권한 설명이 현재 코드와 다르면 코드와 계약 테스트로 사실을 확인한다. 낡은 문장으로 안전 규칙을 완화하지 않는다.
4. `git status --short`로 기존 변경을 확인하고 보존한다. 탐색은 `rg --files`와 `rg`부터 시작한다. 기존 `graphify-out/graph.json`은 `built_at_commit`과 HEAD를 비교하고 실제 소스로 재확인한다.

## DB 안전 4문답 — 조사·문서화도 예외 없음

첫 응답 첫머리에 아래 4줄을 쓰고 실제 범위에 맞게 답한다.

> **DB 안전 4문답:** ① DB 쓰기: 없음 (있으면 경로·건수·백업 계획)
> ② 배포: 없음 (있으면 대상 앱)
> ③ Rules 배포: 아니오
> ④ 주의 경로: 없음 (있으면 경로와 이유)

- 운영 DB 직접 쓰기는 **사용자의 명시 승인 + 사전 스냅샷**이 있어야 한다. 조사·문서 수정·로컬 테스트 요청은 운영 데이터 변경 승인이 아니다.
- Rules 변경 필요성은 보고만 한다. 직접 수정·배포하지 않는다. 유일한 원천은 `attendance-app/database.rules.json`이며 `firebase.json`도 학생 앱에만 있다.
- 코드 수정 전에 공유 Firebase 경로 영향을 확인한다. 데이터 형태·경로·동기화·임포트·배포를 다루면 먼저 영향 경로와 읽는 앱을 설명한다. 두 앱 이상이 읽는 데이터 형태 변경은 `DB_OWNERSHIP.md`의 해당 행을 근거로 사용자 확인을 받는다.
- 화면을 여는 행위가 항상 읽기 전용은 아니다. 학생 앱의 로그인·연도 변경 자동 정리와 휴지통 조회 자동 삭제는 2026-09-05 제거했으며 다시 넣지 않는다. 통합 앱 알림 확인·요청 흐름에는 자동 쓰기가 있으므로 DB 무쓰기 QA에서는 effect·구독·인증 후처리를 먼저 확인한다.

## 프로젝트 지도

| 위치 | 역할 | 주된 소유 경로 / 진입점 |
|---|---|---|
| `highschool-app/` | Next.js 통합 플랫폼: 학기·주일, 수련회 행정, 프로그램 준비, 이가드 현장 | `semesters/*`, `semestersPrivate/*`, `retreats/{id}/*`, `retreatsPrivate/{id}/*`, `retreatAdmins`, `iguard*`, `prepMilestones/*` |
| `attendance-app/` | Next.js 정적 내보내기 기반 학생 출석 PWA | `classes/`, `attendance/`, `events/`, `userRoles`, `admins`, `attendanceAdmins`, `teacher*`, `trash/`, `suggestions/`; 공유 Rules 원천 |
| `agent-os/` | 로컬 대시보드와 Claude 작업 실행기 | `AgentOS.command`, `server.js`, `skills.json`; 운영 앱이 아님 |
| `scripts/verify-all.mjs` | 두 앱 품질 검사 후 Agent OS 회귀 테스트 실행 | 루트 `npm run verify` |
| `.github/workflows/` | CI | 통합·학생 앱 품질 검사와 Agent OS 보안 회귀 테스트 |
| `.claude/`, `.agents/` | 인수인계·로컬 스킬·설정 | `.claude/HANDOFF.md`가 인수인계의 유일한 원천; `.agents/`는 Codex용 변형이며 중복으로 삭제하지 않음 |
| `docs/`, `LEARNINGS.md` | 이관 이력·감사·재사용할 교훈 | [속도·안정성 보강](docs/SPEED_STABILITY_REVIEW_2026-09-05.md), [최적화 점검](docs/PROJECT_OPTIMIZATION_2026-09-05.md), [앞선 감사](docs/PROJECT_AUDIT_2026-09-05.md) |
| `outputs/`, `tmp/`, `graphify-out/` | 최종 산출물·중간물·재생성 가능한 코드 그래프 | 소스·운영 데이터 원천으로 취급하지 않음 |

각 앱은 별도 `package.json`·lockfile·`node_modules`를 사용한다. 루트는 npm workspace 설치 관리자가 아니라 검증 실행기다. 스택 버전·테스트 개수는 실제 파일과 실행 결과로 확인한다.

`agent-os`의 `/api/run`은 실제 명령을 실행한다. 점검 중 실행 버튼/API를 호출하지 않는다. 서버는 IPv4 loopback에만 바인딩한다. `probe.js`가 소유자 전용 임시 파일의 프로세스별 토큰으로 HMAC 응답을 확인한 뒤, AppleScript 런처가 같은 파일을 직접 읽어 URL fragment로 브라우저에 전달한다. 정적 셸 외 모든 API는 이 토큰을 요구하며 실행 API는 Host·Origin·Fetch Metadata와 위험 작업 확인값도 검사한다. 기본 HTML·외부 스크립트·프로세스 인자·로그에 토큰을 넣거나 인라인 스크립트를 되살리지 않는다. `node --test agent-os/security.test.js`는 실제 스킬 대신 스텁으로 이 경계를 검증한다.

## 공유 DB 경계

- 쓰기는 소유 앱의 DB 모듈을 통해 수행한다. 통합 앱 경로는 `src/lib/paths.ts`, `src/features/semester/paths.ts`, `src/features/iguard/lib/paths.ts`를 사용한다. 학생 앱은 `src/lib/db.ts`를 통한 기존 경로 계약을 따른다.
- 이가드의 행정 명단(`participants`, `teachers`, `groups`, `rooms`, `programs`)은 읽기 전용이다. `iguard/groupStaff`는 행정에서도 읽으므로 역방향 영향도 확인한다. 양 모듈 공유 쓰기는 `prepMilestones/*`이며 레거시 `retreats/{id}/milestones`를 새로 사용하지 않는다.
- `classes`, `attendance`, `trash`는 학생 앱 소유다. 통합 앱에는 **`canWriteStudentRoster(roles)`가 허용하는 새친구 단건 등록·검증된 되돌리기** 예외만 있다. 현재 학기 역할 `superAdmin`·`adminTeam`이 대상이며 `src/features/semester/newFriend.ts`의 계획·검증과 `db.ts` 실행 함수를 재사용한다. 반·연도·학생 목록 전체 쓰기로 확대하지 않는다.
- 학생 앱 교사 권한의 Rules 원천은 `auth.token.email`과 `userRoles/{emailKey}`의 `email`이 일치하는 레코드다. `role=teacher`와 `part-grade-class`로 본인 반을 파생한다. `teacherClasses/{uid}`는 레거시 관리자 매핑이며 더 이상 권한 판정에 쓰지 않고 본인 쓰기도 허용하지 않는다.
- 학생 수동 반 이동은 `config/studentMoveLocks/{year}/{classKey}/{ownerUid}/{operationId}`의 양쪽 반 잠금과 `config/studentMoveCommits/{year}/{fromCk}/{toCk}/{sid}/{ownerUid}/{operationId}`의 불변 표식을 사용한다. 잠금은 최종 원자 쓰기에서 해제하지만 commit marker는 지연 요청 재실행을 막는 기록이므로 자동 삭제하지 않는다.
- 참가자 연락처·취소계좌·의료일지·주민번호·시트 원문은 `retreatsPrivate/{id}`에, 학기 연락처는 `semestersPrivate/{id}`에 둔다. 참가자 공개·비공개 명단은 같은 학생 키를 유지한다.
- 프로그램 원본은 `retreats/{id}/programs/{programId}`다. 준비회의 원문·결정은 `retreatsPrivate/{id}/programMeetings/{programId}`에만 저장하고 공개 구독·캐시·본문 저장에 섞지 않는다. 현장 화면은 `status=published`만 표시하며 이는 DB 자체의 초안 접근 차단을 뜻하지 않는다.
- 사이트 건의는 `iguardPending/{uid}/siteRequests/{requestId}`를 사용한다. 첨부 본문은 Firebase Storage `site-requests/{uid}/{requestId}/attachment.jpg`, RTDB에는 메타데이터만 둔다. 접근 승인·거절로 같은 사용자 노드의 건의사항을 지우지 않는다.
- 단일 경로 `update()`와 원자 multi-location update를 우선한다. 전체 덮어쓰기는 기존 `backupNodeBeforeOverwrite` 등 백업·복구 패턴과 함께 사용한다.

## 권한 계약 — 학기와 방학의 두 축

단일 원천은 `highschool-app/src/features/portal/accessPolicy.ts`와 `accessPolicy.test.ts`다. `MinistryRoles = { semester, retreat }`로 판정하며 현재 날짜에 따라 한 축만 선택하지 않는다.

- 학기·주일은 `SemesterRole`, 수련회 행정·현장은 `RetreatRole`을 사용한다. 기존 단일 `role`만 있는 계정도 `resolveMinistryRoles()`가 호환한다.
- 인증·역할 조회는 `src/context/AuthContext.tsx`에서 수행한다. 삭제된 `src/features/iguard/context/AuthContext.tsx` 어댑터를 다시 만들거나 별도 인증 구독을 추가하지 않는다.
- UI에서 역할 문자열을 직접 비교하지 않는다. `canAccessArea`, `canEditArea`, `canAccessSundayTeam`, `canEditSundayTeam`, `iguardScopeOf`, `canManageRolesOf`, `canSeeSensitiveRetreat`, `canWriteStudentRoster` 등 해당 능력 함수를 호출한다.
- 역할 배정은 `roleAssign.ts`의 `planRoleAssignment()` → `applyRole.ts`의 `applyRoleSteps()` 순서다. 부여 후 회수 순서를 지키고 UI에서 하위 DB 함수를 직접 호출하지 않는다.
- 저장은 기존 `admins`, `retreatAdmins`, `iguardMembers`, `iguardRoles` 버킷과 선택 필드 `semesterRole`·`retreatRole`을 사용한다. `iguardRoles/{uid}`에는 **`staff` 또는 `team`만** 쓴다.
- **화면 권한과 Rules 권한은 다르다.** `retreatsPrivate`는 DB에서 `admins`·`retreatAdmins` 버킷으로 허용된다. 세밀한 역할의 읽기 전용·민감 탭 숨김을 서버 측 최소권한 보장으로 설명하지 않는다.

### 로그인에 필요한 자기조회 유지

- `userRoles/{emailKey}`의 이메일 일치 자기조회와 `retreatAdmins/{uid}`·`iguardMembers/{uid}`·`iguardRoles/{uid}`의 UID 자기조회를 제거하면 로그인 역할 판정이 막힌다.
- 교사 로그인은 `userRoles/{emailKey}` 단건을 읽고 끝나며 인증 후 `teacherClasses/{uid}`를 쓰지 않는다. Rules도 같은 `userRoles` 레코드의 이메일·역할·부·학년·반을 직접 확인하므로 로그인 쓰기 의존성을 다시 만들지 않는다.
- `teacherStaff`, `teacherSpecial`, `teacherExtra`는 역할 보유자만 읽는다. `teacherAdditional`, `teacherPhones`는 학생 앱 관리자 측만 읽는다. 임의 Google 로그인 전체에 다시 열지 않는다.
- `semesters`는 이가드 멤버도 읽지만 `semestersPrivate`는 관리자 측 전용이다. `events`는 날짜·라벨용 `auth != null` 읽기를 유지한다.
- 제거된 `staff_*` 노드와 현재 학생 앱의 `teacherStaff`를 혼동하지 않는다. 계약은 `attendance-app/__tests__/rulesContract.test.ts`로 확인한다. 테스트 통과는 Rules 수정·배포 허가가 아니다.

## 구현·검증 규칙

- 작은 수정은 같은 목적끼리 로컬에서 묶어 검증한 뒤 한 번 게시한다. 수정마다 push하거나 원격 CI를 로컬 피드백 루프로 사용하지 않는다. `npm run test:ci-scope`로 CI 분류 회귀를 확인하며, 앱 검증은 아래 순서를 지킨다. 로그인·저장·권한·공통 코드·불명확한 변경은 전체 검사를 유지한다. 유형별 CI 범위와 게시 영향은 [docs/CI_COST_CONTROL.md](docs/CI_COST_CONTROL.md)를 따른다. 사용자에게 원격 CI·게시 중단 지시를 받으면 로컬 검증 결과까지만 보고한다.
- 소통·커밋 메시지·코드 주석은 한국어, 커밋은 `영역: 요약`. 같은 목적의 함수를 추가하기 전 기존 lib를 검색한다. `snapToList`의 통합 앱 단일 원천은 `src/lib/db/snapToList.ts`다.
- 구독에는 에러 콜백과 `loadError` 표시를 연결한다. 이가드 구독은 `useRetreatData`에 모으고 `fail(key)`를 배선한다. 출석·인원체크는 명시 선택·멱등 처리를 유지한다.
- 순수 로직 버그는 회귀 테스트를 함께 추가한다. 렌더 테스트는 `*.render.test.tsx`와 `@vitest-environment jsdom` docblock을 사용한다. 모달 포커스·ESC·dialog, 토스트 `aria-live`, 아이콘 버튼 이름을 확인한다.
- 앱마다 다음을 **순차** 실행한다. 루트 `npm run verify`는 두 앱에서 이 순서를 반복한 뒤 Agent OS의 모든 `*.test.js`를 실행하며 첫 실패에서 중단한다.

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

- 같은 앱에서 `tsc`와 `next build`를 병렬 실행하지 않는다(`.next/types` 경합). 문서만 바꿀 때는 링크·경로·명령 실재 여부와 `git diff --check`가 기본이고 전체 감사에서는 위 명령의 실제 결과도 기록한다.
- 통합 앱 ESLint 전역 ignore의 `.auth/**`를 유지해 Chrome 생성 JS가 기본 검사에 섞이지 않게 한다. `npm run lint` 자체가 앱 소스를 0 오류로 검사해야 하며 인증 파일을 삭제하거나 추가 명령으로 검사 범위를 줄여 통과시키지 않는다.
- 최초 Google OAuth는 사람이 로그인해야 하지만 저장된 인증 상태로 Playwright 검증은 가능하다. `E2E_STORAGE_STATE`와 CI의 `E2E_STORAGE_STATE_B64`가 필요하며 인증 가드를 생략하지 않는다. 세션 파일 존재만으로 로그인 성공을 단정하지 말고 실제 앱 화면을 확인한다. E2E는 기본적으로 운영 URL을 사용하므로 실행 전 쓰기 동작을 검토한다.
- 실제 화면·운영 상태를 확인하지 않았으면 미확인으로 표시한다. 보고서 수치는 실행 출력 근거를 남기고 범위 밖 결함은 심각도·파일 위치와 함께 “수정하지 않았음”으로 구분한다.

## 배포와 변경 보존

- **2026-09-05 사용자 상시 승인:** 운영 앱의 구현·수정 요청은 검증 → 변경 파일별 커밋·작업 브랜치 푸시 → PR 생성·검토 → **에이전트 병합 → 대상 앱 운영 배포·확인**까지 포함한다. 같은 범위의 병합·배포를 다시 승인받지 않는다. 2026-09-02의 ‘사용자가 PR을 병합’ 결정은 이 승인으로 대체됐다.
- ‘배포하지 마’, ‘로컬만’, ‘PR까지만’ 같은 사용자 제한은 우선한다. 조사·리뷰·문서 점검·로컬 실험만 요청받은 작업은 운영 배포 대상이 아니다. 운영 DB 직접 쓰기·Rules·계정/권한 변경은 이 상시 승인에 포함되지 않으며 기존 별도 승인·백업 경계를 유지한다.
- PR 검토와 실제 품질 검사를 생략하지 않는다. 실패 원인과 미검증 범위를 구분해 보고하며 인증 가드 제거·테스트 삭제로 통과시키지 않는다. 코드 회귀·실제 배포 실패는 해결하고 진행한다. 기존 인증 정보 미등록을 실제 E2E 성공으로 표시하지 않는다.
- 이 저장소에서는 오래된 `/ship`의 직접 `main` 푸시·작업 브랜치 금지나 `/handoff`의 마무리 재확인보다 위 PR 기반 상시 승인 흐름이 우선한다. 다른 저장소에도 쓰는 전역 명령 파일은 임의 수정하지 않는다.
- `highschool-app`은 Vercel 프로젝트 `highschool-app`으로 배포되며 `main` 푸시가 자동 배포를 유발한다. **앱 내부 `AGENTS.md` 변경도 앱 경로 변경**이므로 문서라고 무조건 배포가 생략되는 것은 아니다. 검증·문서 수정 요청만으로 푸시하지 않는다.
- 수동 Vercel 배포는 승인된 경우 저장소 루트에서 실행한다. 운영 확인은 `/api/version`의 `buildId`와 배포 대상 커밋 SHA 대조, Production `Ready` 확인이다. CLI 인증·네트워크 제약은 세션마다 확인하며 과거 원격 환경의 실패를 현재 사실로 단정하지 않는다.
- 통합 앱 운영 주소: `https://woorihigh-app.vercel.app`. 구 별칭 `highschool-app-flame.vercel.app`은 기존 링크 보호용이다.
- 학생 앱 운영 주소: `https://woori-high.web.app`. `attendance-app/`에서 정적 build 후 승인된 `firebase deploy --only hosting`을 사용한다. `vercel.json`의 `ignoreCommand: exit 0`은 학생 앱 Vercel 빌드를 생략한다. Hosting predeploy는 `out/sw.js` 캐시 버전을 갱신한다.
- 2026-09-05 감사 보강은 PR #6 병합 커밋 `a20a790`으로 운영 반영됐다. 배포 직전 Rules를 `tmp/rules-backup/`에 다시 백업하고 기존 운영본과 일치함을 확인한 뒤 **Rules → 라이브 Rules 대조 → Hosting** 순서로 배포했으며, 라이브 Rules와 소스가 일치한다. 통합 앱도 `/api/version`의 `buildId`가 같은 병합 SHA이고 Vercel Production `Ready`임을 확인했다. 이후 Rules 변경도 같은 백업·대조·중단 절차를 반복한다.
- 2026-09-05 사용자가 학생 앱 데모 모드 유지를 요청해 당시 공용 데모 로그인과 반 선택을 복구했다. 2026-09-23 보안 개편에서는 `NEXT_PUBLIC_DEMO_MODE=1`과 반 선택을 유지하되 가상 학생·출석만 브라우저 안에서 다루며, 공개 이메일·비밀번호와 운영 DB 데모 쓰기를 제거한다. 새 Hosting 화면을 확인한 뒤 과거 데모의 `attendanceAdmins/{demoUid}` 1건을 백업·회수하고 해당 Firebase Auth 계정을 비활성화해야 출시가 완료된다. 이 두 운영 변경은 각각 실제 상태를 재조회해 확인하고, 과거 공개 자격정보를 다시 빌드에 넣거나 계정을 재활성화하지 않는다.
- 스테이징은 변경 파일을 명시한다. `git add .`·`git add -A`로 사용자 작업·미추적 파일을 섞지 않는다. `.env*`, `.auth/`, `.vercel/`, 인증 상태·토큰·운영 스냅샷은 출력·커밋하지 않는다.
- `tmp/{작업명}-{날짜}` 중간물과 운영 DB 스냅샷은 해당 작업 후 정리한다. `tmp/rules-backup/`은 보존 예외다. 기존 다른 작업의 산출물을 임의 삭제하지 않는다. `outputs/`에는 최종 산출물·재생성 스크립트만 둔다.
- 사소하지 않은 문제 해결 뒤 `extract-approach`를 실행한다. 워크스페이스·도구 교훈은 `LEARNINGS.md`, 앱 코드 교훈은 해당 스킬이 지정한 앱 패턴 섹션에 남긴다.

## 제거된 앱 복구

| 상태 | 복구 태그 |
|---|---|
| 통합 전 | `pre-unified-apps-2026-08-05` |
| 독립 retreat·iguard 제거 전 | `pre-legacy-app-removal-2026-08-05` |
| 교사·스탭 출석부 제거 전 | `pre-staff-app-removal-2026-08-12` |
| 독립 semester-app 제거 전 | `pre-semester-app-removal-2026-08-12` |

교사·스탭 출석부와 `semester-app`은 보류 중인 운영 앱이 아니라 제거된 코드다. 학기·수련회 데이터는 통합 앱이 계속 사용한다. 앱 복원은 운영 데이터·Rules·배포 복원을 자동 승인하지 않는다.
