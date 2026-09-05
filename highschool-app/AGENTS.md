# highschool-app 에이전트 가이드

학기·주일 사역, 수련회 행정·프로그램 준비, 이가드 현장을 운영하는 통합 Next.js 앱입니다. 이 가이드의 현재 계약은 2026-09-05 작업 트리의 소스·설정·테스트와 대조했습니다. 검증 결과와 운영 상태는 매 작업에서 다시 확인합니다.

## 작업 시작과 적용 범위

- 루트 `../CLAUDE.md`의 안전 규칙이 우선입니다. 재개 시 `../.claude/HANDOFF.md`를 먼저 확인하고, 이 앱의 `CLAUDE.md`, 데이터 경로 작업은 `../DB_OWNERSHIP.md`, 배포·복구는 `../OPERATIONS.md`를 읽습니다.
- 첫 응답은 루트에서 정한 DB 안전 4문답으로 시작합니다. 문서 점검에도 적용됩니다. 운영 DB 직접 쓰기는 명시 승인과 사전 스냅샷 없이는 실행하지 않으며 Rules 변경·배포는 이 앱에서 수행하지 않습니다.
- `git status --short`로 기존 작업을 확인하고 사용자 수정 파일을 보존합니다. 코드·가이드 수정만으로 푸시·배포가 승인된 것으로 해석하지 않습니다. `main` 푸시는 Vercel 배포를 유발할 수 있습니다. 배포 변경은 루트 인수인계의 PR 검토·사용자 병합 결정을 따릅니다.
- 파일 점검은 `git ls-files`와 `rg --files --hidden`으로 범위를 나눈 뒤 수행합니다. `node_modules`, `.next`, `.auth`, `.env*`, coverage·브라우저 결과물은 앱 소스와 구분하고 인증값·개인정보를 출력하거나 커밋하지 않습니다.
- 현재 코드와 오래된 문서가 다르면 소스와 계약 테스트로 확인한 사실을 보고합니다. 문서 불일치를 이유로 DB나 권한을 임의 변경하지 않습니다. 아래 날짜별 학습 기록은 당시의 배경이며 현재 계약은 이 앞부분과 실제 코드입니다.

## 구조와 진입점

| 경로 | 용도·주요 코드 |
|---|---|
| `/` | `features/portal/PortalHome`; 비로그인 소개는 `features/landing` |
| `/semesters`, `/semester/[id]` | 학기 목록·신청·배치·출석·커리큘럼·운영; `features/semester` |
| `/sunday-ministry`, `/sunday-ministry/[team]` | 주일 팀 업무; `features/sundayMinistry`, `features/sundayWorship` |
| `/semester-admin` | `/sunday-ministry`로 보내는 호환 경로 |
| `/retreats`, `/retreat/[id]` | 수련회 행정; `src/lib/db/*`, `RetreatPageClient` |
| `/programs`, `/retreat/[id]/programs` | 수련회 프로그램 준비; `ProgramPreparationClient`, `lib/programPreparation.ts`, `lib/db/programs.ts` |
| `/field`, `/retreat/[id]/field` | 이가드 현장; `features/iguard`, `IguardClient` |
| `/ministry-guide`, `/suggestions` | 사역 가이드와 본인 건의사항; 각 feature의 DB 모듈 |
| `/api/version` | 배포 버전 확인용 `buildId` |

- `src/app/providers.tsx`가 공통 Provider를 조합하고 `src/context/AuthContext.tsx`가 인증·역할 조회를 담당합니다. 도메인별 인증 Provider를 다시 만들지 않습니다. `features/iguard/context/AuthContext.tsx`와 이가드 Firebase/submit-lock 래퍼는 제거됐으므로 과거 경로를 되살리지 않습니다.
- Firebase 경로는 행정 `src/lib/paths.ts`, 학기 `src/features/semester/paths.ts`, 현장 `src/features/iguard/lib/paths.ts`에서 가져옵니다. `src/lib/db.ts`는 행정 DB 함수의 배럴이며 구현은 `src/lib/db/`에 나뉩니다. 컴포넌트에 직접 Firebase 쓰기를 추가하지 않습니다.
- 테스트는 순수 로직 옆의 `*.test.ts`, 렌더 `*.render.test.tsx`, 브라우저 `e2e/*.e2e.ts`, 이관 스크립트의 `scripts/*.test.ts`로 구분합니다. `.e2e.ts`를 `.spec.ts`로 바꿔 Vitest와 중복 수집하지 않습니다.

## 권한: 학기·방학 두 축

`features/portal/accessPolicy.ts`의 `MinistryRoles = { semester, retreat }`와 `accessPolicy.test.ts`가 단일 원천입니다. 예전 단일 `role`, `resolveMinistryRole`, `canAccessPortalArea` 계약을 새 코드에 사용하지 않습니다.

- 판정은 `resolveMinistryRoles`, 영역 접근·편집은 `canAccessArea`/`canEditArea`, 주일 팀은 `canAccessSundayTeam`/`canEditSundayTeam`, 현장 탭은 `iguardScopeOf`를 사용합니다.
- 역할 배정·통합검색·출석부 반영·민감정보·삭제·PIN은 각각 `canManageRolesOf`, `searchScope`, `canWriteStudentRoster`, `canSeeSensitiveRetreat`, `canDestroySemester`/`canDestroyRetreat`, `canManageRetreatPin`으로 구분합니다. 컴포넌트에서 역할 문자열을 직접 비교하지 않습니다.
- 학기 역할은 학기·주일 화면에, 방학 역할은 행정·프로그램·현장 화면에 적용됩니다. 달력상 학기 여부로 두 축을 전환하지 않습니다.
- 주일 사역팀은 자기 팀에 접근·편집하며, 학기 행정팀은 모든 주일 팀을 조회하고 행정팀 화면만 편집합니다. 팀·탭 목록은 `featureCatalog.ts`의 `SUNDAY_MINISTRY_TEAMS`/`SUNDAY_MINISTRY_TABS`만 사용합니다. 미구현 팀의 빈 `tabs`를 임의 기능으로 채우지 않습니다.
- 방학 스탭팀장·이가드팀은 수련회 행정을 조회만 하며 민감 탭은 숨깁니다. `RetreatEditProvider`와 disabled fieldset을 유지하고, 드래그 같은 비폼 제어는 `useRetreatCanEdit()`으로 잠급니다. 학기 편집은 `useSemesterCanEdit()`을 사용합니다.
- 저장은 기존 `admins`, `retreatAdmins`, `iguardMembers`/`iguardRoles` 버킷에 두 축의 합집합으로 표현합니다. `iguardRoles` 값은 `staff`/`team`뿐이며 역할 쓰기는 `planRoleAssignment` → `applyRoleSteps`의 부여 후 해제 순서를 거칩니다. `sundayWrite` 부여도 기존 승인 DB 함수를 사용합니다.
- UI의 세부 역할 제한이 Firebase Rules의 실제 데이터 접근 범위와 같다고 가정하지 않습니다. 승인 버킷·자기 UID 읽기 규칙을 확인하고 민감정보를 UI 숨김만으로 보호하지 않습니다.

## 데이터 소유권과 변경 경계

| 경로 | 현재 쓰기 경계 |
|---|---|
| `semesters/*`, `semestersPrivate/*` | 학기·주일 모듈. 공개 신청·출석과 연락처·지원 동기·새친구 민감 상세를 분리 |
| `retreats/{id}/*` (`iguard` 제외) | 행정 원본. 현장은 명단·조·숙소·프로그램을 읽기만 함 |
| `retreatsPrivate/{id}/*` | 참가자 연락처, 취소계좌, 의료, 주민번호, 시트 raw, 준비회의 원문·결정 |
| `retreats/{id}/iguard/*` | 현장 모듈. 행정은 `groupStaff` 등을 읽기 참조 |
| `prepMilestones/*` | 공유 일정·사역 가이드·예배팀 편집 조각. `sourceSite`별 구분·필터 필수 |
| `iguardPending/{uid}/siteRequests/*` | 본인 건의사항. 접근 승인 필드와 별도 보존 |
| `classes/*`, `attendance/*`, `trash/*`, `teacher*`, `events/*` | 학생 앱 원장. 아래 새친구 단건 예외 외 읽기 전용 |

- 새 경로·데이터 형태·동기화 수정 전 양 앱의 소비자와 `../attendance-app/database.rules.json`을 읽고 영향 경로를 설명합니다. Rules 원천은 학생 앱 하나입니다.
- 새친구 출석부 반영은 **학기 통합관리자·행정팀**에게 `canWriteStudentRoster`가 허용합니다. `registerNewFriendInRoster`와 결정적 `nf_` 학생의 `cancelNewFriendPlacement`/`removeNewFriendFromRoster`만 기존 예외입니다. ID·이름·반 연결 검증, 사전 백업, 단일 학생 경로의 원자 update, `trash` 복구 사본·재조회 계약을 보존합니다. 일반 학생 수정·이동·삭제 함수로 넓히지 않습니다.
- 참가자 연락처의 쓰기 원천은 `retreatsPrivate/{id}/participantContacts/{participantKey}`입니다. 공개 참가자 키와 명단 필드는 유지하고 현장 구독·공개 캐시에 연락처를 합치지 않습니다.
- 일반 일정 구독은 사역 가이드(`isMinistryGuideMilestone`)·예배팀(`isWorshipMilestone`) 조각을 걸러야 합니다. 행정 `lib/db/shared.ts`와 현장 `features/iguard/lib/db.ts`를 함께 확인합니다.
- 건의 첨부는 Firebase Storage `site-requests/{uid}/{requestId}/attachment.jpg`에 저장하고 RTDB에는 메타데이터만 둡니다. 레거시 `dataUrl`은 읽기 호환만 유지합니다. 승인·거절은 pending 노드 전체를 지우지 않고 접근 필드만 해제하며, 건의 삭제는 Storage 파일을 먼저 정리합니다.
- 경로 단위 `update`를 우선합니다. 전체 덮어쓰기는 기존 `backupNodeBeforeOverwrite`의 성공 검사·복구 절차를 유지합니다. 수련회·학기 삭제는 공개/비공개 짝을, 팀·훈련 반 삭제는 관련 커리큘럼·신청자 참조를 함께 처리합니다.

## 실시간 읽기와 현장 안전 계약

- 지속 표시 데이터는 구독하고 닫기·계정/대상 ID 변경 시 해제합니다. 모든 새 구독은 `onError`를 전달하고 `useLoadErrors`로 경로별 실패를 표시합니다. 첫 성공·오류 응답은 `subscriptionReadiness`에서 모두 ready 처리합니다.
- 인증·역할 조회, 명시적 가져오기, 저장·삭제 직전 확인, 백업·복구·멱등성 검증은 일회성 `get`을 유지합니다. 구독 echo가 화면의 원천이므로 저장 후 같은 항목을 수동 append하지 않습니다.
- 이가드 구독은 `features/iguard/hooks/useRetreatData.ts`에 모으고 `fail(key)`를 배선합니다. 행정 원본 읽기는 현장 DB 모듈의 읽기 전용 함수로 제공하며 현장 훅에서 행정 DB 배럴을 직접 가져오지 않습니다.
- PIN은 `useRetreatPinGate` 하나와 `retreats/{id}/iguard/accessLock`을 사용합니다. 행정·프로그램·현장에 별도 잠금 노드를 만들지 않습니다.
- 인원체크는 멱등 체크·트랜잭션·톰스톤을 유지합니다. 키는 `checklistKeys.stableMemberId`; 구형 읽기·해제는 `memberCheckKeys`/`isMemberChecked`를 거칩니다. 배열 인덱스 키나 단순 토글로 되돌리지 않습니다.
- 이름·배정·시간 처리는 `studentMatcher`, `busStaff`, `scheduleTime`, `cueSheet`, `cueSelection`, `staffIdentity`, `syncParticipants`를 먼저 찾습니다. 자정 이후 시간, 동명이인, 동기화 ambiguous 보존 가드를 화면에서 재구현하지 않습니다.

## 학기·주일 계약

- 신청 전제·예외와 `trainingOnly` 파생은 `intakeRule`, 학생·스탭 분리는 `roster`/`applicant`를 사용합니다. 스탭의 `s_` 신청 키와 학생 키를 유지합니다.
- 사역팀·훈련 출석은 `attendance/team`·`attendance/training` 독립 원장입니다. 휴강만 만점에서 제외하고 다일 회차도 `sessionDate`의 `date`+`endDate`, 회차 ID 하나로 집계합니다.
- 연락처 기본값·비공개 수정값은 `rosterContact.resolvedContact`/`contactOverrideValue`로 합칩니다. 원장과 같은 값을 private에 복사해 실시간 연결을 끊지 않습니다.
- 신규 새친구는 `semesters/{year}-sunday` 작업공간에 저장하고 `meta`를 만들지 않습니다. 기존 학기별 레코드는 이동하지 않고 통합 조회합니다. 완료는 `rosterSync`이며 레거시 `giftDate` 읽기·수정 보존을 유지합니다. 접수일 `registeredDate`와 감사 시각 `createdAt`을 구분합니다.
- 인물 통합검색은 `peopleSearch`의 유형 namespace·영구 `personId`·유일한 진급선 계약을 사용합니다. 이름만으로 다른 사람을 합치거나 기존 참조 ID를 교체하지 않습니다.

## 프로그램 준비 계약

- 공개 원본은 `retreats/{id}/programs/{programId}`, 회의·결정은 `retreatsPrivate/{id}/programMeetings/{programId}`입니다. private 구독은 편집 권한자에게만 열고 공개 workspace 캐시에서 회의 원문을 제거합니다.
- `PROGRAM_SECTIONS`와 `?section=`이 내비게이션의 원천입니다. `ProgramList`의 실행 작업률과 현장 점검률을 합치지 않습니다. `tasks.status`는 `todo/doing/blocked/done`이며 기존 `done` boolean을 계속 읽습니다.
- 본문은 명시적 초안 저장, 하위 행은 경로별 저장입니다. `ProgramEditor.withoutTasks`에서 `tasks`·`meetings`·`posts`·`items`·`roles`·`competitionTeams`를 모두 제외합니다. 편집 중 원격 변경은 `shouldSyncEditorDraft`로 판정해 초안을 보존합니다.
- `posts`는 운영 방식·참가 단위·테스트 상태를 가진 진행 블록입니다. 물품·역할은 `postId`로 연결하고, `competitionTeams.groupIds`는 기본 `groups`를 읽기 참조합니다. 순서 변경은 각 `order` 필드만 원자 update하며 프로그램·조 전체를 덮어쓰지 않습니다.
- 중첩 push 키는 `programTasks` 등 읽기 함수에서 런타임 ID로 복원합니다. 결정→할 일은 `convertRetreatProgramDecisionToTask`의 결정적 ID·최신값 확인·public 작업/private 링크의 다중 경로 update를 유지합니다. 링크가 있는 작업 삭제·복원도 두 경로를 함께 처리합니다.
- `canPublishProgram`이 현장 점검 완료와 모든 실행 작업 완료를 검사하며 명시적 확인 뒤 `published`로 바꿉니다. 현장은 공개 원본에서 `published`만 목록에 보여 주고 `PublishedProgramCard`를 공용으로 사용합니다. 이 필터는 **화면 표시 조건**이며 초안의 DB 읽기를 막는 보안 규칙이 아닙니다.

## 화면·성능·접근성

- 사이트 제목·계정·메뉴는 `GlobalPortalHeader` 하나, 방학 목록·캘린더는 `VacationHome` 하나를 씁니다. 공통 홈 데이터나 개인 담당을 새 집계 노드에 복사하지 않습니다.
- `PortalViewportShell`/`ViewModeContext`의 선택 모드를 유지합니다. PC 모드는 같은 출처의 최소 1280px iframe, 모바일 미리보기는 430px iframe을 사용합니다. 프레임 경로 동기화·화면 내부 쿼리 변경으로 App Router와 인증을 다시 시작하지 않습니다. 브라우저 QA는 실제 앱 프레임을 찾아 검사합니다.
- CSS는 `globals.css` 기반·토큰, `operations-tables.css` 운영 표, `portal-surfaces.css` 공통 화면, `program-preparation.css` 프로그램, `theme-compat.css` 다크 호환, `interaction-controls.css` 상호작용으로 나눕니다. `cssArchitecture.test.ts`의 예산을 올려 실패를 숨기지 않습니다.
- `.input`은 레이어 밖 규칙이라 Tailwind 폭·글꼴·여백 유틸리티보다 우선할 수 있습니다. 폭은 감싼 요소로, 필요한 입력 높이·글꼴은 기존 컴포넌트 패턴으로 조절하고 양 테마·작은 화면에서 확인합니다. 셀 자체가 액션인 표는 `cell-action-grid`를 씁니다.
- 모달은 `OverlayShell`/`ModalScrollManager`를 통해 dialog 이름·포커스 트랩·ESC·스크롤 복구를 유지합니다. 토스트는 `aria-live`, 아이콘 버튼은 `aria-label`이 필요합니다. 렌더 계약은 `OverlayShell.render.test.tsx`가 검증합니다.
- 선택 상태는 가능한 한 렌더 중 파생하고 자동 시계 갱신이 사용자 선택을 덮지 않게 합니다. effect 안 직접 `setState`를 새로 넣어 lint 계약을 우회하지 않습니다.
- XLSX는 `loadXlsx()` 동적 import를 사용합니다. 현장의 비활성 뷰 지연 로딩, 모바일 참가자 페이지 분할, `AutoAssignNamePickers`·`classRosterModel`·`RoomComponents`·`GroupComponents`의 책임 경계를 유지합니다. 인쇄 HTML에는 `escapeHtml()`을 적용합니다.

## 검증·인증·배포

앱 폴더에서 현재 `package.json` 명령을 사용합니다. 이 앱에는 `npm run verify`가 없고 루트 검증 명령과 구분합니다.

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

- `typecheck`는 `tsc --noEmit`, build는 `next build --webpack`입니다. `npm run quality:ci`는 lint → typecheck → coverage → build를 묶습니다. Firebase 빌드 설정은 `src/lib/firebase.ts`와 CI의 `NEXT_PUBLIC_FIREBASE_*` 키를 확인하고 실제 값은 출력하지 않습니다. 환경변수 누락 실패와 소스 회귀를 구분합니다.
- 같은 앱에서 타입 검사와 build를 병렬 실행하지 않습니다. 전체 lint가 `.auth/chrome-profile` 생성 JS 때문에 실패하면 원래 실패를 기록한 뒤 `npm run lint -- --ignore-pattern '.auth/**'` 결과를 별도로 보고합니다. 인증 프로필을 삭제하거나 애플리케이션 소스 검사를 생략하지 않습니다.
- Vitest는 기본 node 환경이며 렌더 테스트 첫 줄에 `/** @vitest-environment jsdom */`을 둡니다. jsdom은 레이아웃 계산이 없어 필요할 때 `getClientRects` 등을 스텁합니다. 커버리지 하한은 `vitest.config.ts`, 성능·접근성 예산은 `lighthouserc.cjs`가 원천입니다.
- `../.github/workflows/highschool-quality.yml`은 Node 22에서 검증·Lighthouse를 실행한 뒤 별도 `authenticated-e2e` job으로 **운영 URL** smoke·axe를 실행합니다. PR 코드를 검증한 것과 운영 화면을 검사한 것을 구분해 보고합니다. `quality:ci`만으로 Lighthouse·E2E까지 통과했다고 말하지 않습니다.
- 인증 E2E는 `E2E_STORAGE_STATE`의 비어 있지 않은 세션 파일이 필요하며, CI는 `E2E_STORAGE_STATE_B64` secret을 복원합니다. `require-e2e-auth.mjs` 가드를 제거하거나 무인증 skip으로 성공 처리하지 않습니다. 실제 인증 완료와 역할·앱 프레임을 별도로 확인합니다.
- 로그인 세션이 없으면 `npm run e2e:auth`의 실제 Chrome 창에서 사람이 OAuth를 마친 뒤 재사용합니다. `storageState({ indexedDB: true })`를 유지해야 Firebase Auth가 복원됩니다. 로그인 벽 때문에 모든 헤드리스 검증이 불가능하다고 단정하지 않습니다. `.auth`, 시크릿 출력, 추적·스크린샷에 포함될 수 있는 개인정보를 공유하지 않습니다.
- Lighthouse는 로컬 공개 홈의 지표이며 인증된 전체 운영 화면을 보증하지 않습니다. 파괴적 화면 확인은 매칭되지 않는 더미 입력의 확인 건수까지만 보고 취소합니다. 기능 검증을 이유로 운영 DB 저장을 누르지 않습니다.
- 배포는 사용자 요청 또는 `/ship` 절차 때만 수행합니다. 운영 주소는 `https://woorihigh-app.vercel.app`, Vercel 프로젝트는 `highschool-app`입니다. 수동 배포가 필요하면 Root Directory 설정을 확인하고 **저장소 루트**에서 실행합니다. 배포 확인은 `/api/version`의 `buildId`와 대상 커밋, Production `Ready`를 함께 대조합니다.
- 사소하지 않은 해결은 루트 학습 법칙에 따라 `extract-approach`로 남깁니다. 테스트 수·번들 크기·CI 비밀값 유무·최신 배포 상태를 영구 사실처럼 이 가이드에 누적하지 않습니다.

## 핵심 코드 패턴

### 인증 응답 순서와 목록 갱신의 의미를 분리하기 (2026-09-05)
- **접근법**: `src/context/AuthContext.render.test.tsx`에서 A·B 계정의 응답 순서를 뒤집고 로그아웃 뒤 응답을 재현한다 → 조회 시작 시 역할을 비우고 성공·실패에 요청 세대 검사를 둔다 → `src/features/semester/semesterSubscription.test.ts`에서 출석 100회 변경의 콜백 수를 비교해 동일한 학기 metadata 전달을 억제한다.
- **판단 질문**: 역할 판정은 기존 `resolveMinistryRoles`와 자기조회 경로를 유지했다. 학기 루트 구독 분할은 DB 경로·소유권 설계가 필요하므로 화면 갱신 최적화와 함께 바꾸지 않았다.
- **재사용 규칙**: 계정이 바뀌는 비동기 조회는 성공·실패 모두 최신 요청인지 검사하고, 상위 DB 갱신을 UI에 전달하기 전에 소비하는 metadata가 실제 바뀌었는지 비교한다. 콜백 감소를 DB 전송량 감소로 보고하지 않는다.

## 날짜별 학습 기록 — 현재 지침과 구분

아래는 기존 세션의 접근법을 보존한 기록입니다. 폐기된 앱·API, 당시 역할표·환경 제약·실측 수치가 포함됩니다. 예전 `accessLevel`·단일 `role`·이가드 인증 어댑터·6역할·통합관리자만 새친구 반영 같은 문장을 현재 구현 지시로 적용하지 말고 위 계약과 현재 소스·테스트를 우선 확인합니다.


### 통합 포털에서도 도메인 권한과 DB 소유권을 합치지 않기 (2026-08-05)
- **접근법**: 1→ `semester-app`, `retreat-app`, `iguard-app`의 라우트를 `highschool-app/src/app` 아래로 편입한다. 2→ 기존 `semesters/*`, `retreats/{id}/*`, `retreats/{id}/iguard/*` 경로는 그대로 둔다. 3→ 공통 `AuthContext`에서 행정 `accessLevel`과 이가드 `iguardAccessLevel`을 별도 값으로 읽는다. 4→ 통합 홈은 두 권한 중 하나가 있으면 열되, 링크와 메뉴는 각 도메인 권한으로 다시 제한한다. 5→ 타입 검사·전체 테스트·프로덕션 빌드와 비로그인 PC·375px 화면을 확인한다.
- **판단 질문**: 기존 DB를 새 통합 노드로 복사하거나 행정 승인과 이가드 승인을 하나의 `accessLevel`로 합치지 않는다. 전자는 롤백과 앱별 소유권을 깨고, 후자는 이가드 전용 스탭에게 행정·학기 화면을 잘못 열 수 있기 때문이다. 레거시 앱 삭제 뒤에도 이 계약과 복구 태그를 유지한다.
- **재사용 규칙**: 여러 운영 앱을 한 웹페이지로 합칠 때는 먼저 라우트·인증 진입점·배포 단위만 합치고, 저장 경로와 권한 판정은 원래 도메인별로 분리한 채 화면 노출만 조합한다.

### 통합 홈의 개인 담당은 이가드 큐카드 계산 규칙을 재사용하기 (2026-08-05)
- **접근법**: 1→ `src/features/iguard/lib/staffIdentity.ts`, `personalDuty.ts`, `defaultSegment.ts`, `groupStaffNames.ts`의 기존 식별·담당 계산 함수를 재사용한다. 2→ `src/features/portal/myRetreatMinistry.ts`에서 조스탭·자유 텍스트 담당·구조화 포스트를 하나의 읽기 전용 결과로 합친다. 3→ `src/features/portal/useMyRetreatMinistry.ts`는 필요한 기존 경로만 좁게 구독하고 수련회 또는 권한이 바뀌면 이전 상태를 먼저 비운다. 4→ 실제 로그인 계정으로 이가드 개인 큐카드와 포털 결과를 대조하고 375px 화면까지 확인한다.
- **판단 질문**: 포털 전용 담당 노드를 새로 저장하거나 이름 포함 검색을 별도로 구현하지 않는다. 새 노드는 기존 큐카드와 불일치할 수 있고, 단순 포함 검색은 동명이인·접미사(`sf`) 때문에 오배정될 수 있기 때문이다.
- **재사용 규칙**: 다른 화면에 개인화된 운영 정보를 요약할 때는 원본 도메인의 식별·정렬·담당 계산 함수를 순수 함수로 재사용하고, 새 저장값 대신 기존 데이터의 읽기 전용 파생 결과를 보여준다.

### 메뉴 숨김과 직접 URL 접근에 같은 권한 계약 적용하기 (2026-08-05, 2026-08-06 6역할로 확장)
- **접근법**: 1→ `src/features/portal/accessPolicy.ts`에 홈·학기·수련회 행정·이가드 현장의 접근 규칙을 순수 함수로 둔다. 2→ 통합 홈의 메뉴/링크와 각 상세 라우트의 진입 가드가 같은 함수를 사용하게 한다. 3→ 이가드 전용 계정이 `/retreat/[id]`를 직접 열었을 때 DB 읽기를 시작하기 전에 차단하고 `/retreat/[id]/field`로 갈 수 있게 한다. 4→ 미승인·이가드 스탭·이가드팀·행정팀·전체 관리자 조합을 표 기반 테스트로 고정한다.
- **판단 질문**: 메뉴만 숨기고 Firebase Rules에만 의존하지 않는다. Rules는 최종 보안 경계이지만, 직접 URL 진입 후 권한 없는 구독/읽기를 시도하면 사용자에게 오류 화면을 보이고 권한 경계도 불명확해지기 때문이다.
- **재사용 규칙**: 권한별로 메뉴를 나누는 통합 앱에서는 같은 순수 접근 정책을 링크 생성과 라우트 진입 모두에 적용하고, 권한 없는 DB 읽기보다 앞서 차단한다.

### 팀원 화면은 통합하되 기존 권한 저장 계약은 분리 유지하기 (2026-08-05, 2026-08-06 갱신)
- **접근법**: 1→ `src/features/portal/TeamModal.tsx`(구 `UnifiedTeamModal.tsx`)에서 `admins`, `retreatAdmins`, `retreatPending`, `iguardMembers`, `iguardRoles`, `iguardPending`을 각각 기존 DB 함수로 읽는다. 2→ UID를 기준으로 관리자·이가드 멤버와 승인 요청을 화면에서만 합치고, 역할은 `resolveMinistryRole`로 판정해 한 개의 드롭다운으로 보여준다. 3→ 쓰기는 `planRoleAssignment`가 계산한 최소 단계만 각 도메인 함수로 실행한다(부여 → 해제 순서라 중간에 권한이 0이 되는 순간이 없다). 4→ `src/features/portal/GlobalPortalHeader.tsx` 한 곳에서만 모달을 열고 홈 본문의 중복 버튼은 두지 않는다. 5→ 권한 버튼을 누르지 않는 읽기 전용 점검과 타입 검사·전체 테스트·빌드로 검증한다.
- **판단 질문**: 통합 팀원 노드를 새로 만들거나 `retreatAdmins`와 `iguardMembers`를 한 번에 덮어쓰지 않는다. 새 노드는 Rules에 규칙이 없어 거부되고 기존 앱과 이중 진실을 만들며, 전체 덮어쓰기는 일부 권한만 수정해도 다른 도메인의 승인 상태를 손상시킬 수 있기 때문이다. 자기 자신의 역할은 UI에서 잠근다 — 통합관리자가 스스로를 강등해 잠기는 사고를 막는다.
- **재사용 규칙**: 여러 앱의 권한 관리 UI를 합칠 때는 UID 기반 읽기 모델만 합치고, 쓰기는 "필요한 변경만 계산하는 순수 함수 + 경로별 최소 단위 실행"으로 분리한다.

### 역할을 늘릴 때 Rules 대신 기존 노드 조합으로 표현하기 (2026-08-06)
- **접근법**: 1→ 요구된 역할×영역 표를 `src/features/portal/accessPolicy.test.ts`에 먼저 옮겨 계약으로 고정한다. 2→ `../attendance-app/database.rules.json`을 읽어 기존 노드 중 무엇을 확장할 수 있는지 확인한다 — `retreatAdmins/{uid}`는 객체이고 `.validate`가 없어 `role` 필드 추가가 자유롭고, `iguardRoles`는 `staff`/`team`만 허용한다. 3→ 다른 앱이 그 노드를 어떻게 읽는지 grep으로 증명한다(`semester-app`은 `!= null` 존재 확인만 → 필드 추가 호환). 4→ 판정은 순수 함수 1개, 쓰기는 계획+실행 분리. 5→ Rules로만 가능한 잔여 항목(스탭의 `semesters` 읽기)은 코드를 완성한 뒤 스니펫과 함께 `.claude/HANDOFF.md`에 블로커로 남긴다.
- **판단 질문**: `portalRoles/{uid}` 같은 새 노드를 만들지 않았다 — Rules에 `.read`/`.write`가 없어 즉시 권한 거부이고, Rules 배포 원천은 학생 앱 하나뿐이라 이 앱에서 열 수 없다. 화면에서 역할 문자열을 직접 비교하지도 않았다 — 권한이 늘 때마다 전 컴포넌트를 다시 훑어야 한다.
- **재사용 규칙**: 권한 모델 확장은 (1) 표를 테스트로 고정 → (2) Rules 파일을 읽고 "기존 노드 + 옵션 필드"로 표현 → (3) 다른 앱의 읽기 방식으로 호환 증명 → (4) Rules 필요한 부분만 블로커로 인수인계, 순서로 진행한다.

### 접수 대상에 학생 아닌 인원을 추가할 때 키 규칙을 먼저 분리하기 (2026-08-06)
- **접근법**: 1→ 기존 appKey가 `{부번호}_{학생ID}`라 다른 명단의 ID가 그대로 들어오면 2부 학생과 충돌할 수 있음을 확인한다. 2→ 키·표기·정렬 규칙을 `src/features/semester/applicant.ts`(순수)로 옮기고 스탭만 `s_` 접두어를 쓰게 한 뒤 `applicant.test.ts`로 충돌 없음을 고정한다. 3→ 스탭 명단은 `teacherStaff/{year}`를 **읽기 전용**으로만 쓰고(`paths.teacherStaffByYear`), 실패해도 학생 접수가 계속되게 보조 원천으로 분리해 에러를 따로 표시한다. 4→ 학년·반이 없는 인원은 `describeApplicant`로 "스탭"만 표기해 `0-0` 같은 값이 화면에 새지 않게 한다.
- **판단 질문**: `makeAppKey`의 기존 학생 규칙을 바꾸지 않았다 — 이미 저장된 신청·출석·수료 키가 전부 어긋난다. `teacherStaff`에 쓰기 함수를 만들지도 않았다(교사·스탭 출석부 앱 소유였고, 그 앱은 2026-08-12 제거됨).
- **재사용 규칙**: 기존 명단 기반 기능에 다른 출처의 인원을 넣을 때는 키 생성 규칙을 순수 모듈로 먼저 떼어내고 접두어로 namespace를 나눈 뒤, 새 출처는 실패해도 기존 흐름이 살아 있는 보조 원천으로 붙인다.

### 훈련 전용 신청과 민감 상세정보를 기존 저장 경로에서 안전하게 분리하기 (2026-08-06)
- **접근법**: 1→ `src/features/semester/roster.ts`에서 취소자를 먼저 제외하고 `team`과 `training` 명단을 명시적으로 나눈다(2026-08-06 훈련 반 도입으로 scope 이름이 `training`으로 바뀌었다). 2→ 출석 화면은 같은 신청자 키를 쓰더라도 `attendance/team`과 `attendance/training`을 별도 원장으로 구독·저장하고, 기존 `attendance/team` 기록은 사역팀 기록으로만 보존한다. 3→ 표의 점수·출석률은 현재 선택한 원장을 기준으로 계산하되 사역팀 수료와 훈련 수료 판정은 두 원장을 함께 읽어 나란히 표시한다. 4→ 팀 상세 화면은 공개 신청 정보(`semesters/*/applications`)와 연락처·지원 동기(`semestersPrivate/*/applicationsPrivate`)를 신청자 ID로 결합한다. 5→ 비공개 경로는 `useSemesterCanEdit()` 권한에서만 구독하고 조회 전용 사용자는 값이 렌더되지 않게 한다. 6→ 경로 분리·판정 분리를 순수 테스트로 고정하고 로그인된 실제 화면에서 두 명단 탭과 상세 펼침을 확인한다.
- **판단 질문**: 훈련 전용 인원을 별도 DB 노드로 복제하지 않는다 — 출석과 수료의 진실이 두 군데로 갈라지고 기존 키 기반 집계가 깨지기 때문이다. 공개 신청 노드로 연락처·지원 동기를 옮기지도 않는다 — 민감정보 경계가 무너진다.
- **재사용 규칙**: 같은 신청자 집합에서 운영 목적별 명단이 필요하면 새 저장소를 만들지 말고 순수 필터로 뷰를 나누며, 민감정보는 기존 private 경로를 권한 있는 화면에서만 ID로 결합한다.

### 공유 신청자에서 업무별 출석 원장을 분리하기 (2026-08-30)
- **접근법**: 1→ `src/app/semester/[id]/AttendanceTab.tsx`의 화면 scope와 `src/features/semester/db.ts`의 저장 함수 인자를 대조해 탭만 분리되고 경로는 `attendance/team`으로 고정된 원인을 찾는다. 2→ `src/features/semester/paths.ts`에 `attendanceByScope`·`attendanceSession`·`attendanceEntry`를 만들고 모든 구독·기록·삭제에 `team | training`을 필수 전달한다. 3→ 기존 `attendance/team`은 사역팀 원장으로 그대로 두고 훈련은 `attendance/training`에서 빈 원장으로 시작한다. 4→ `completion.calcScopedCompletions`가 두 원장을 별도로 계산하고 표는 현재 원장의 점수·출석률과 양쪽 수료 판정을 함께 보여준다. 5→ 경로 계약·서로 반대인 수료 결과·비대상 축을 순수 테스트로 고정한다.
- **판단 질문**: 기존 `attendance/team` 값을 훈련 원장에 자동 복사하지 않는다 — 과거 화면에서는 두 업무를 구분해 입력할 수 없었으므로 어떤 기록이 훈련 출석인지 증명할 수 없고, 복사는 잘못된 훈련 수료 판정을 확정한다. 신청자를 업무별로 복제하지도 않는다 — 신청·배치 원장이 갈라지고 같은 사람의 후속 작업이 중복된다.
- **재사용 규칙**: 같은 엔터티를 여러 업무가 공유해도 상태의 의미가 독립적이면 `공유 엔터티 키 + 업무 scope 하위 원장`으로 저장하고, 기존 무구분 데이터는 추정 이관하지 말고 의미가 명확한 한쪽의 레거시로 보존한다.

### 기능을 보존한 전면 리디자인은 전역 토큰부터 교체하기 (2026-08-10, 2026-08-14 보강)
- **접근법**: 1→ `src/app/globals.css`, 전역 내비게이션, 대표 홈·표·모달을 함께 읽고 브랜드 토큰·정보 계층·반복 진입점을 감사한다. 2→ 색을 바꾸기 전에 타이포, 세로 리듬, 밀도, 헤더 위계를 `globals.css`의 공통 규칙으로 조정한다. 3→ 공개 랜딩의 가상 대시보드는 실제 사역 맥락 이미지와 업무 흐름 설명으로 교체하고, 로그인 홈은 중복 바로가기를 제거해 현재 사역·일정·할 일의 순서를 바로잡는다. 4→ 사역 서브헤더·고밀도 표·팀원 모달은 공통 스타일과 검색·sticky 기준점으로 특수 문제만 풀어 전체 화면을 한 상품처럼 맞춘다. 5→ 다크 모드는 첫 페인트 전에 `html[data-theme]`을 정하고, `ThemeContext`는 `useSyncExternalStore`로 DOM 테마를 읽으며, 전역 토큰 → 잔존 Tailwind 중립색 → 제품 고유 표면 순서로 덮는다. 종이 메타포처럼 밝은 배경을 보존할 요소는 별도 scope로 다시 고정한다. 6→ Firebase 구독·저장·권한을 건드리지 않고 `npx tsc --noEmit`, `npm test`, `npm run build`, 1440px·390px 브라우저 검증으로 회귀를 막는다.
- **판단 질문**: 기존 브랜드와 탐색 학습 비용이 이미 크면 전면 교체 모드를 선택하지 않는다. 각 화면에 임의 색과 인라인 스타일을 반복해서 덧칠하거나, 테마 선택을 Firebase 사용자 데이터로 저장하지도 않는다. 전자는 다음 화면에서 다시 불일치가 생기고 후자는 단말 표현 설정 때문에 새 데이터 계약·동기화 문제가 생긴다. 시각 변경을 이유로 URL·내비 문구·폼 필드·DB 경로·데이터 모양·권한 로직을 함께 정리하지 않는다.
- **재사용 규칙**: 기능 보존 리디자인은 `사전 감사 → 공통 토큰·셸 → 핵심 진입점 재구성 → 고밀도 특수 화면 보정 → 첫 페인트 테마 초기화·브라우저 로컬 저장 → URL·문구·필드 보존 감사 → 타입·테스트·빌드·PC·모바일 검증` 순으로 진행하고 데이터 로직은 별도 변경으로 분리한다.

### 공개 소개 화면은 인증 분기 바깥에서 기존 운영 화면과 격리하기 (2026-08-11)
- **접근법**: 1→ `src/features/landing/landingContent.ts`에 PASONA 순서와 익명 데모 문구를 순수 데이터로 분리한다. 2→ `src/features/landing/LandingPage.tsx`는 기존 `LoginButton`과 `signIn`만 주입받아 공개 소개·기능 미리보기·로그인 CTA를 구성한다. 3→ `src/features/portal/PortalHome.tsx`의 비로그인 분기만 랜딩으로 교체하고 로그인 이후 권한 게이트·Firebase 구독·운영 대시보드는 그대로 둔다. 4→ 콘텐츠 테스트로 섹션 순서·민감정보 부재를 고정하고 PC·375px에서 가로 넘침과 로그인 CTA를 확인한다.
- **판단 질문**: 홍보용 데이터를 Firebase에 새로 저장하거나 기존 운영 대시보드를 랜딩 안에 복제하지 않는다 — 전자는 공개 화면 때문에 불필요한 데이터 계약을 만들고, 후자는 로그인 후 화면과 두 개의 진실을 만든다. 실제 학생·교사 정보도 예시로 쓰지 않는다.
- **재사용 규칙**: 인증형 운영 서비스에 공개 소개 페이지를 붙일 때는 비로그인 렌더 분기만 교체하고, 콘텐츠는 익명 정적 데이터로 격리하며 기존 인증·권한·DB 구독은 로그인 이후에만 실행한다.

### 통합 검색과 업무함은 권한 계약과 기존 읽기 모델에서 파생하기 (2026-08-11)
- **접근법**: 1→ `src/features/portal/featureCatalog.ts`의 학기·행정·이가드 화면 목록을 검색어 원천으로 재사용한다. 2→ `src/features/portal/portalSearchCatalog.ts`에서 `canAccessPortalArea`·`iguardScope`·`retreatEntryHref`로 역할별 검색 결과와 링크를 순수하게 계산한다. 3→ `src/features/portal/homeActions.ts`에서 기존 `prepMilestones`, 학기 `sessions`, 수련회 `periods`를 날짜순 업무로 파생한다. 4→ 새 저장 경로 없이 헤더 검색과 홈 업무함에 연결하고 역할별 표 테스트·전체 테스트·375px 로그인 화면으로 확인한다.
- **판단 질문**: 검색 인덱스나 알림함을 새 Firebase 노드로 저장하지 않는다. 검색 대상은 이미 기능 카탈로그와 목록 노드에 있고, 업무함도 기존 일정의 파생값이라 별도 저장하면 권한·완료 상태·날짜가 서로 어긋나는 두 번째 진실이 생기기 때문이다. 역할 문자열을 UI에서 직접 비교하는 방식도 사용하지 않는다.
- **재사용 규칙**: 통합 운영 앱에 검색·업무함을 추가할 때는 화면 카탈로그와 기존 일정 노드를 순수 함수로 합치고, 같은 권한 계약으로 노출과 링크를 동시에 제한하며 새 DB 인덱스는 검색 규모가 실제로 커진 뒤에만 검토한다.

### 위키 운영 지식은 개인정보·정책과 분리한 정적 가이드로 옮기기 (2026-08-11)
- **접근법**: 1→ `/Users/sunghoon/Desktop/나의 비서/second-brain/wiki/`를 사역계획·예배·목양·훈련·수련회·행정·공지·특별사역으로 분류한다. 2→ 반복 가능한 운영 원칙과 체크리스트만 `src/features/ministryGuide/ministryGuideContent.ts`에 정적 데이터로 옮긴다. 3→ 연간 계획은 `가안`으로 명시하고 학생 실명·연락처·주소·가정·건강 특이사항과 미결 아이디어를 제외한다. 4→ `/ministry-guide`를 전역 메뉴·검색·홈 월별 브리핑에 연결하고 콘텐츠 계약 테스트와 전체 타입·테스트·빌드로 검증한다.
- **판단 질문**: 위키 전체를 검색 인덱스나 Firebase 노드로 복제하지 않는다. 원문에는 개인정보와 확정되지 않은 아이디어가 섞여 있고, DB에 복사하면 원문과 화면 사이에 두 번째 진실과 새 권한 계약이 생기기 때문이다. 개인별 기록과 상세 원문 링크도 일반 가이드에 노출하지 않는다.
- **재사용 규칙**: 내부 문서를 제품 기능으로 옮길 때는 `반복 가능한 원칙 / 개인정보 / 미확정 제안`으로 먼저 분류하고, 첫 범주만 출처 메모·상태 라벨을 붙인 기본 콘텐츠로 제공한다. 운영 중 수정이 필요하면 새 루트 대신 기존 권한 경계 안의 별도 namespace로 작은 덮어쓰기 조각만 저장한다.

### 공유 일정 경로에 편집 가능한 운영 가이드를 격리하기 (2026-08-13)
- **접근법**: 1→ Rules가 이미 읽기·쓰기를 허용하는 `prepMilestones` 안에서 `sourceSite=ministry-guide*`와 결정적 `mg_*` 키로 월·가이드 조각을 구분한다. 2→ 각 `note`는 기존 500자 검증을 지키도록 월, 메타, 운영 원칙, 체크리스트로 나누고 기본 정적 콘텐츠 위에만 덮어쓴다. 3→ 행정·이가드의 일반 마일스톤 구독 두 곳 모두 `isMinistryGuideMilestone`로 가이드 조각을 제외한다. 4→ 편집 화면은 개인정보 금지 안내와 필드 길이 제한을 유지하고 저장 실패를 화면에 표시한다. 5→ 파싱·병합·일정 격리와 모바일 편집 레이아웃을 테스트한다.
- **판단 질문**: 새 `ministryGuide` 최상위 노드를 만들지 않는다 — 현재 Rules에 경로가 없어 거부되고 Rules 배포 금지 원칙과 충돌한다. 모든 내용을 하나의 마일스톤 `note`에 넣지도 않는다 — 500자 검증을 넘고 한 부분 수정이 전체 덮어쓰기가 된다. 가이드 조각을 일반 일정 목록에 노출하지도 않는다.
- **재사용 규칙**: 기존 검증이 엄격한 공유 노드에 다른 편집 문서를 넣어야 하면 `명시적 source namespace → 검증 한도별 결정적 조각 → 기본값 위 덮어쓰기 → 기존 소비자 전부 필터링 → 파싱 회귀 테스트` 순서를 지킨다.

### 운영 위키에서 신규 기능 후보를 고를 때 현재 코드·DB 경계와 교차검증하기 (2026-08-11)
- **접근법**: 1→ `rg --files`와 `wc`로 위키 파일·분량을 확정하고 전체 문서를 주제별로 읽는다. 2→ 여러 해 반복된 누락·병목·수작업만 후보로 묶는다. 3→ `src/features/portal/featureCatalog.ts`, 실제 라우트, 관련 키워드 검색으로 이미 구현된 기능과 정적 가이드를 제외한다. 4→ `../DB_OWNERSHIP.md`, 배포 Rules, 각 `paths.ts`를 대조해 기존 경로 재사용·읽기 전용 파생·새 데이터 계약 필요로 나눈다. 5→ 반복 근거·사용자 영향·구현 위험으로 우선순위를 매기고 읽기 전용 최소 기능부터 제안한다.
- **판단 질문**: 위키에 나온 모든 아이디어를 기능으로 만들거나 정적 가이드 내용을 다른 화면에 복제하지 않는다. 일회성 기록·미확정 제안·개인정보는 제품 후보에서 제외하고, 새 루트 노드나 다른 앱 소유 경로 쓰기가 필요한 후보는 Rules·소유권 설계 전까지 구현안으로 확정하지 않는다.
- **재사용 규칙**: 문서 기반 기능 발굴은 `반복 문제 근거 → 현재 기능 중복 검사 → 기존 경로로 가능한 최소 단계 → 민감정보·권한 검토` 순서로 수행하고, 저장이 없어도 가치를 검증할 수 있으면 항상 읽기 전용 1단계를 먼저 둔다.

### 운영 시트를 교차 앱 업무 흐름으로 옮길 때 요청과 원장 반영을 분리하기 (2026-08-11)
- **접근법**: 1→ 원본 시트의 열·상태값·완료/미처리 건수를 개인정보 행과 분리해 집계한다. 2→ 자유 서술을 `접수 → 검토 → 승인 → 실행 → 검증` 상태와 명시적인 변동 유형으로 바꾼다. 3→ `../DB_OWNERSHIP.md`와 각 앱 `paths.ts`를 대조해 통합 사이트가 소유할 업무 기록과 학생 앱이 소유할 `classes/{year}` 실행을 나눈다. 4→ 요청과 실행 결과를 안정 ID로 연결하고, 학생 앱에서는 단일 학생 경로만 멱등적으로 갱신한 뒤 결과와 변경 전후를 기록한다. 5→ 기존 시트 이관은 매칭·중복·미처리 수를 먼저 보여주는 dry-run 뒤 스냅샷과 명시적 승인 하에 수행한다.
- **판단 질문**: `highschool-app`에서 `classes/{year}`를 직접 수정하거나 운영 시트의 연락처·가정·심방 메모를 공개 학기 노드에 복사하지 않는다. 전자는 학생 앱 소유권과 다른 소비 앱의 계약을 깨고, 후자는 민감정보 권한을 넓히며 시트와 DB 사이에 두 번째 진실을 만들기 때문이다. 두 앱이 같은 요청 레코드를 함께 수정하는 공유 쓰기 노드도 피하고 요청 원문과 실행 결과의 소유 경로를 분리한다.
- **재사용 규칙**: 다른 앱이 소유한 원장을 바꾸는 운영 시트를 제품화할 때는 통합 화면을 요청·승인 오케스트레이터로 두고, 실제 원장 변경과 검증은 소유 앱의 최소 단위 명령으로 실행하며 두 결과를 안정 ID와 감사 이력으로 연결한다.

### Functions·Rules 변경 없이 다른 앱 소유 원장에 신규 1건만 안전하게 연결하기 (2026-08-11)
- **접근법**: 1→ `../attendance-app/database.rules.json`을 확인해 `classes/{year}` 쓰기가 이미 `admins`에만 허용됨을 고정하고 `accessPolicy.canWriteStudentRoster`를 같은 계약으로 테스트한다. 2→ `features/semester/newFriend.ts`에서 새친구 ID 기반 결정적 `nf_` 학생 ID, 2주 과정·등록 결정·반배정 검증, 이름·생년월일·연락처 중복 차단을 순수 함수로 만든다. 3→ `semestersPrivate/{sid}/newFriendRosterBackups/{friendId}` 사전 스냅샷, `classes/{year}/{classKey}/students/{studentId}` 단일 신규 경로, `semesters/{sid}/newFriends/{friendId}/rosterSync` 이력을 하나의 루트 update 계획으로 만든다. 4→ 실행 뒤 생성한 학생 경로를 다시 읽어 검증하고, 재클릭은 같은 결정적 ID를 확인해 중복 생성 없이 연결만 복구한다. 5→ 출석부 반영 뒤에는 이름·부서·학년·연락처·반배정을 잠가 기존 학생 수정·이동·삭제가 학생 앱 소유로 돌아가게 한다.
- **판단 질문**: Firebase Cloud Functions를 억지로 추가하지 않았다 — `npx firebase functions:list --project woori-high --debug`에서 Functions API 비활성, Cloud Billing API에서 `billingEnabled:false`를 실측했고 Functions 배포는 Blaze 요금제 연결이 필요했기 때문이다. `retreatAdmins`에 `classes` 쓰기를 여는 Rules 변경도 하지 않았다 — 권한 범위가 행정팀 전체의 기존 학생 수정까지 넓어진다. 통합 앱에 범용 학생 수정 함수도 만들지 않고 신규·미존재 경로 추가 하나로 예외를 닫았다.
- **재사용 규칙**: 다른 앱 소유 원장에 자동 연결이 필요하지만 서버 함수·Rules 변경을 할 수 없으면, 기존 Rules가 이미 허용한 최상위 관리자에게만 `결정적 신규 ID + 중복 차단 + 비공개 사전 스냅샷 + 단일 경로 원자 추가 + 재조회 검증`을 제공하고 반영 직후 편집을 다시 소유 앱으로 잠근다.

### 여러 도메인의 개인 기록을 기존 키와 영구 personId로 연결하기 (2026-08-11, 2026-08-13 보강)
- **접근법**: 1→ `src/features/portal/peopleSearchDb.ts`에서 권한이 허용한 `classes`, 교사·스탭 명단, `semesters`, `retreats`를 읽고 민감 루트는 접근 정책상 허용될 때만 요청한다. 2→ 기존 연도별 ID는 연도·도메인 범위의 참조키로 유지하고 학생·교사·스탭 namespace를 분리한다. 3→ 학생은 같은 연도 이름+생년 후보가 둘이면 전부 보류하고, 다른 연도의 정규화 이름+생년월일+같은 부서+정상 진급선(`학년 차이 === 연도 차이`)이 유일할 때만 연결한다. 연락처 변경·누락은 허용하고 보호자 연락처는 근거로 쓰지 않는다. 4→ `scripts/person-id-migration.mjs` dry-run으로 충돌·변경 경로를 집계하고 영향 경로를 백업한 뒤 `/personId` 자식만 원자 update한다. 기존 `semesters/*/applications`는 같은 연도 공식 원장의 `studentId`가 유일하게 일치할 때만 백필하고 `retreats/*`·`participantsBackups`는 수정하지 않는다. 5→ 검색 프로필은 최신 출석부 이름을 대표로 쓰고 수련회 명단의 앞자리 순번을 별칭에서 제거한다. 6→ 학생↔교사↔스탭 분리, 같은 연도 중복 분리, 연락처 변경·누락 진급 결합, 대표 이름을 회귀 테스트와 로그인한 운영 검색으로 검증한다.
- **판단 질문**: 기존 `id`·`pid`를 바꾸거나 Firebase에 새 최상위 검색 인덱스·통합 프로필 노드를 만들지 않는다. 기존 키 교체는 출석·수련회·학기 참조를 끊고, 새 최상위 노드는 배포된 Rules에 경로가 없어 거부된다. 본인 연락처를 필수로 두면 번호 변경·누락 시 실제 진급선이 끊기고, 보호자 연락처를 쓰면 형제를 합칠 수 있으므로 둘 다 학생 자동 연결의 필수 근거로 삼지 않는다. 같은 연도 중복 후보는 기존 personId가 같아도 분리한다.
- **재사용 규칙**: 여러 연도·도메인의 학생 이력은 `유형 분리 → 같은 연도 이름+생년 중복 차단 → 이름·생년·부서·진급선의 유일 후보 확인 → 기존 업무 키 유지 → personId 최소 경로 재연결 → 최신 공식 원장 이름 우선` 순서로 연결한다.

### 저장 구조를 바꾸지 않고 학기 기능을 상위 업무영역으로 재구성하기 (2026-08-11)
- **접근법**: 1→ `src/features/portal/featureCatalog.ts`에 `SEMESTER_TRAINING_TABS`, `SEMESTER_ADMIN_TABS`, `SEMESTER_WORKSPACE_GROUPS`를 선언해 정보구조를 단일 원천으로 만든다. 2→ `src/app/semester/[id]/SemesterClient.tsx`에서 상위 영역(`training`/`admin`)과 하위 탭을 분리하고 새친구를 행정·바나바로 이동한다. 3→ `/semesters`와 `/semester-admin`은 같은 학기 목록을 영역별 진입점으로 재사용하고, 상세 화면은 `?area=admin`으로 깊은 링크를 유지한다. 4→ 학생 변동·처리 대기·변경 이력은 새 노드 없이 `NewFriend.rosterSync`, `deriveNewFriendStage`, `createdAt`·`updatedAt`에서 읽기 전용으로 파생한다. 5→ PC와 375px에서 드롭다운·상위 탭·하위 탭을 검증하고, 모바일의 가로 스크롤이 절대 위치 메뉴를 자르면 메뉴가 열린 동안 `.portal-nav-menu-open`으로 overflow를 해제한다.
- **판단 질문**: 화면 분류를 바꾸기 위해 기존 `semesters` 데이터를 이동하거나 `studentChanges` 같은 저장 노드를 먼저 만들지 않는다. 전자는 기존 기능과 검색의 키 계약을 깨고, 후자는 실제 입력·승인·감사 요구가 정해지기 전에 두 번째 진실을 만든다. 상단 드롭다운도 hover 전용으로 두지 않는다 — 모바일·키보드 클릭에서 열려야 하며 `onMouseEnter`와 토글 click을 같이 쓰면 첫 클릭이 다시 닫히므로 click은 명시적으로 open 상태를 쓴다.
- **재사용 규칙**: 기존 기능을 계층형 업무영역으로 재편할 때는 `카탈로그 단일 원천 → 목록 진입점 → 상세 상위영역 → 하위 탭` 순서로 URL과 화면을 맞추고, 새 데이터 계약이 필요 없는 요약은 기존 기록에서 먼저 파생해 구조를 검증한다.

### 학기별 기존 기록을 이동하지 않고 학기 비종속 주일 사역으로 통합하기 (2026-08-11)
- **접근법**: 1→ `src/features/sundayMinistry/model.ts`에서 `semesters/*/newFriends`와 `semestersPrivate/*/newFriendsPrivate`를 `storageSid + friendId` 복합키로 통합한다. 2→ 신규 저장은 `sundayWorkspaceId(year)`가 만드는 `semesters/{year}-sunday`로 보내되 `meta`를 생성하지 않아 학기 목록에서 숨긴다. 3→ `src/app/sunday-ministry/SundayMinistryClient.tsx`에서 통합 구독과 네 개 탭을 제공하고 `NewFriendsTab` 콜백으로 각 기록의 원래 `storageSid`에 수정·삭제·출석부 반영을 보낸다. 4→ `/semester-admin`과 `?area=admin` 깊은 링크는 `/sunday-ministry`로 리디렉션하고, `GlobalPortalHeader`·`PortalHome`·검색 카탈로그의 진입점을 함께 교체한다. 5→ `model.test.ts`로 학기 간 ID 충돌·비공개 정보 결합·연도별 주일 작업공간 규칙을 고정한다.
- **판단 질문**: 기존 학기별 새친구를 새 루트 노드로 이관하지 않았다. 이관은 운영 DB 쓰기·백업·Rules 설계가 필요하고 기존 사람 검색·출석부 반영 이력의 참조를 끊을 수 있다. 새 루트 `sundayMinistry/*`도 만들지 않았다 — 현재 Rules에 읽기·쓰기 계약이 없으므로 즉시 권한 거부되며 Rules 배포 금지 원칙과 충돌한다.
- **재사용 규칙**: 기존 저장 스코프보다 새 업무 화면의 생명주기가 더 길면 `기존 스코프 통합 읽기 + 충돌 없는 복합키 + 기존 Rules가 허용하는 비가시 전용 작업공간 + 레거시 URL 리디렉션`으로 이관 없이 분류 구조를 바꾼다.

### 다른 앱 원장에 자동 추가한 단건을 검증·백업 후 원자적으로 되돌리기 (2026-08-11)
- **접근법**: 1→ 원장 소유 앱 `../attendance-app/src/components/modals/StudentModal.tsx`의 삭제 계약이 `classes` 학생·해당 `attendance` 삭제와 `trash` 복구 사본임을 확인한다. 2→ `src/features/semester/newFriend.ts`에서 새친구 ID로 계산한 결정적 `nf_` 학생 ID, 저장된 연결 ID·반, 현재 학생 이름을 검증한다. 3→ 삭제 직전 학생·출석·새친구 공개/비공개 값을 `semestersPrivate/{sid}/newFriendRosterBackups/{friendId}/removals/{timestamp}`에 담고, `trash` 사본과 네 삭제 경로를 하나의 루트 update로 계획한다. 4→ `removeNewFriendFromRoster`에서 현재 레코드를 다시 읽어 연결 변경을 차단하고 실행 뒤 삭제 경로·백업·휴지통을 재조회한다. 5→ 화면은 통합관리자에게만 버튼을 보이고 학생 이름 재입력 전에는 최종 삭제 버튼을 비활성화하며, 실제 화면 검증에서는 확인창만 열고 취소한다.
- **판단 질문**: 통합 앱에 범용 학생 삭제를 열거나 `classes`만 단독 삭제하지 않는다. 전자는 학생 앱 소유권을 넘어 기존 학생까지 지울 수 있고, 후자는 출석 고아 레코드를 남긴다. 새친구 공개 기록만 먼저 지우거나 하드 삭제하지도 않는다 — 연결 근거와 복구 수단을 잃기 때문이다.
- **재사용 규칙**: 다른 앱 소유 원장에 자동 생성한 단건을 되돌릴 때는 `생성 당시 결정적 연결 검증 → 소유 앱의 삭제 계약 복제 → 민감 사전 백업 + 원장 휴지통 → 한 번의 다중 경로 update → 재조회 검증 → 이름 입력 확인` 순서를 지킨다.

### 원장 연결 취소와 원본 업무 기록 삭제를 서로 다른 명령으로 설계하기 (2026-08-11)
- **접근법**: 1→ `src/features/semester/db.ts`에서 현재 새친구와 비공개 기록을 다시 읽고 저장된 `rosterSync.studentId`·`classKey`가 화면의 연결값과 같은지 확인한다. 2→ `src/features/semester/newFriend.ts`의 순수 update 계획이 `assignedClassKey`·`giftDate`·`rosterSync`만 해제하고 새친구 공개·비공개 노드는 보존하게 한다. 3→ 출석부에 이미 반영됐다면 결정적 `nf_` 학생과 이름을 검증하고 학생·해당 출석을 `placementCancellations/{timestamp}`에 백업한 뒤 `trash`와 함께 한 번의 루트 update로 제거한다. 4→ 실행 뒤 새친구 보존·연결 필드 해제·원장 제거·백업 존재를 모두 재조회한다. 5→ UI에는 `명단·출석부 삭제`와 별도로 `등반 및 배정 취소`를 노출하고, 확인창 검증은 취소 버튼까지만 진행한다.
- **판단 질문**: 취소를 단순히 `giftDate`만 비우는 상태 변경으로 두지 않는다 — 배정 반과 출석부 연결이 남아 사용자가 다시 배정할 수 없다. 반대로 기존 `명단·출석부 삭제`를 재사용하지도 않는다 — 접수·2주 과정·등록 결정·목양 메모까지 사라져 “배정만 되돌리기”라는 업무 의미를 훼손한다.
- **재사용 규칙**: 외부 원장에 반영된 업무를 취소할 때는 `원본 업무 기록 보존 여부`를 먼저 명령 경계로 삼고, 연결만 취소하는 명령은 외부 원장 복구 절차를 실행하되 원본의 연결 필드만 해제한다.

### Rules 변경 없이 기존 사용자별 노드에 독립 요청함을 격리하기 (2026-08-13)
- **접근법**: 1→ `../attendance-app/database.rules.json`에서 `iguardPending/{uid}`가 본인 읽기·쓰기와 통합관리자 전체 읽기·쓰기를 이미 제공함을 확인한다. 2→ `src/lib/paths.ts`에 `iguardPending/{uid}/siteRequests/{requestId}` 경로를 선언하고, `src/features/suggestions/siteRequest.ts`가 접근 승인 필드와 요청 레코드를 분리해 정규화한다. 3→ `src/features/iguard/lib/db.ts`의 접근 요청 저장을 사용자 노드 전체 `set`에서 필드 `update`로 바꾸고, 승인·거절도 `email`·`name`·`requestedAt`만 제거해 `siteRequests`를 보존한다. 4→ 첨부 이미지는 `attachment.ts`에서 JPG·PNG·WEBP만 JPEG로 재인코딩하고 최대 1600px·1.2MB로 줄인 뒤 요청에 저장한다. 5→ 통합관리자만 전체 요청을 구독하고 해결 상태를 기록하며, 작성자는 로그인 시작 시 자기 요청만 한 번 읽어 `notifiedAt` 없는 해결 건을 알림 처리한다.
- **판단 질문**: 학생 출석부 전용 `suggestions/{year}/{classKey}`를 재사용하지 않는다 — 담임 반 키·권한·화면 스키마와 충돌한다. 새 최상위 `siteRequests`도 만들지 않는다 — Rules에 경로가 없어 즉시 거부되고 이 작업에서는 Rules 배포가 금지다. `iguardPending/{uid}` 전체를 사이트 요청으로 덮거나 승인 시 통째로 삭제하지도 않는다 — 접근 승인과 요청함 중 하나가 다른 하나를 유실시킨다.
- **재사용 규칙**: 새 Rules 없이 사용자별 워크플로를 추가해야 하면 `기존 노드의 읽기·쓰기 주체 일치 확인 → 의미가 다른 하위 namespace 격리 → 기존 전체 set/remove를 필드 update로 축소 → 파서에서 두 스키마 분리 → 양쪽 보존 회귀 테스트` 순서를 따른다.

### 공유 RTDB를 읽는 운영 화면을 안전하게 실시간 구독으로 통일하기 (2026-08-13)
- **접근법**: 1→ `rg`로 `useEffect` 안의 `get*`과 기존 `subscribe*`를 전수 분류한다. 2→ 화면에 계속 표시되는 `classes/{year}`, `semesters/*`, `retreats/*` 목록·상세는 각 도메인 DB 모듈의 `onValue` 구독으로 바꾸고 effect cleanup에서 unsubscribe한다. 3→ `src/features/portal/peopleSearchDb.ts`의 대형 검색 원천은 검색창이 열린 동안만 최상위 `onChildAdded`·`onChildChanged`·`onChildRemoved` 변경분을 병합한다. 4→ 구독 화면의 저장 성공 후 수동 append/delete를 제거해 Firebase echo 중복을 막고, 자동배정 dirty/ref와 저장 전 최신값·백업·검증 `get`은 유지한다. 5→ `src/features/portal/realtimeRecord.test.ts`, 전체 타입·테스트·빌드로 child 교체·삭제와 회귀를 검증한다.
- **판단 질문**: 모든 `get`을 기계적으로 `onValue`로 바꾸지 않는다. 인증·권한, 저장/삭제 직전 최신값, 백업·복구, 멱등 검증, 사용자 버튼으로 실행하는 외부 시트 가져오기는 거래 시점 스냅샷이어야 한다. 통합검색에서 10개 대형 루트를 상시 `onValue`로 열어두지도 않는다 — 화면을 닫아도 개인정보와 트래픽을 계속 소비하고 작은 변경에도 루트 전체를 다시 받기 때문이다. DB 구조·Rules·원장 쓰기 경로도 바꾸지 않는다.
- **재사용 규칙**: 공유 RTDB 화면을 실시간화할 때는 `지속 표시=구독 / 명시적 명령·거래 검증=get`으로 먼저 분류하고, 큰 루트는 화면 생명주기와 child 변경 단위로 좁히며, 구독 콜백을 표시 상태의 단일 원천으로 둔다.

### 모바일 현장 화면의 다층 내비게이션을 단계적으로 압축하기 (2026-08-14)
- **접근법**: 1→ 375px 캡처에서 전역 헤더, 업무 헤더, 실행 탭, 본문 카드, 하단 탭이 차지하는 높이와 중복 행동을 순서대로 표시한다. 2→ `GlobalPortalHeader.tsx` 모바일 헤더에는 브랜드·현재 영역·검색·더보기만 남기고 전체 메뉴와 계정 행동을 하단 시트로 옮긴다. 3→ `IguardClient.tsx` 업무 헤더에는 뒤로가기·잘린 제목·도구 메뉴만 남기고 검색과 가져오기를 도구 메뉴로 합친다. 4→ `ExecutionViews.tsx`와 `globals.css`에서 보라·파랑 장식색과 중첩 그림자를 걷어내고 에메랄드 행동색, 의미 상태색, 얇은 경계와 간격으로 계층을 다시 만든다. 5→ 하단 실행 탭은 `@phosphor-icons/react` 선 아이콘 하나로 통일하고 한 줄 라벨·52px 터치 높이를 고정한다. 6→ 모바일 검증 뒤 PC에서 문서 `scrollHeight`, `html/body overflow-y`, PageDown 이동을 다시 측정하고, 긴 sticky 운영 화면은 `@media (min-width: 901px)`에서 `html`을 명시적 `overflow-y: scroll` 컨테이너로 고정한다. 7→ 375px, PC, 다크 모드, 타입·테스트·빌드를 모두 검증한다.
- **판단 질문**: 데스크톱 메뉴 문구나 URL을 줄이거나 실행 기능 자체를 숨기지 않는다. 이는 SEO·기존 사용 습관·현장 접근 경로를 깨기 때문이다. 모바일에서 모든 행동을 계속 노출하거나 카드마다 그림자·원색을 유지하지도 않는다. 전자는 우선순위를 흐리고, 후자는 정보 구조 대신 장식이 서로 경쟁하게 만든다.
- **재사용 규칙**: 모바일 운영 화면이 복잡하면 `전역 맥락 1줄 → 업무 맥락 1줄 → 현재 그룹 탭 → 본문 → 고정 핵심 탭`의 다섯 층만 남기고, 빈도 낮은 행동을 더보기로 옮긴다. 반응형 CSS를 바꾼 뒤에는 모바일뿐 아니라 PC 루트 스크롤 높이·overflow·PageDown을 반드시 재검증한다.

### 여러 모달의 모바일 스크롤 누수를 단일 계약으로 차단하기 (2026-08-14)
- **접근법**: 1→ 로그인된 390px 화면에서 모달 전후 `body` 스타일, 문서 `scrollY`, 대화상자 위치와 `scrollHeight`를 측정한다. 2→ `rg`로 `fixed inset-0`, `role="dialog"`, `document.body.style.overflow`를 대조해 화면 수와 스크롤 잠금 구현 수의 차이를 확인한다. 3→ `src/components/ModalScrollManager.tsx`가 모든 `[aria-modal="true"]`를 감지해 iOS에서도 현재 스크롤 위치를 보존하며 `html/body`를 잠그게 한다. 4→ 새 화면은 `src/components/OverlayShell.tsx`로 포털·ESC·포커스 순환·포커스 복귀·`100dvh`·safe area·내부 스크롤을 함께 적용한다. 5→ 사람 단위 데이터는 640px 이하에서 목록으로, 비교가 필요한 수련회 표는 `overscroll-behavior-x: contain` 가로 표로 분리하고 320px·390px·430px 계약 테스트와 실제 화면으로 검증한다.
- **판단 질문**: 각 모달이 직접 `document.body.style.overflow`를 저장·복원하게 두지 않는다. 중첩 모달이나 공통 관리자가 함께 열리면 한 컴포넌트의 cleanup이 다른 모달의 잠금을 풀거나 `overflow:hidden`을 영구히 남길 수 있기 때문이다. 모든 표를 카드로 바꾸지도 않는다. 참가자 비교·행렬 편집은 열 관계가 핵심이라 가로 표를 유지하되, 새친구·등록·변동처럼 레코드 하나가 독립적인 화면만 모바일 목록으로 바꾼다.
- **재사용 규칙**: 운영 앱의 모바일 오버레이는 `aria-modal 단일 감지 → 포털 기반 공통 셸 → 배경 스크롤 잠금 → 내부 본문만 overscroll contain → 고정 헤더·푸터 → 폭별 회귀 검증` 순서로 만들고, 개별 컴포넌트의 body 스타일 조작은 금지한다.

### 전역 표 여백과 셀 줄바꿈을 분리해 고밀도 명단을 압축하기 (2026-08-14)
- **접근법**: 1→ `src/app/globals.css`의 `.card table tbody td` 전역 여백과 `src/app/retreat/[id]/ClassRosterTab.tsx`의 셀 유틸리티를 함께 확인한다. 2→ 반별 명단 표에 `class-roster-grid` 전용 클래스를 부여하고 더 높은 선택자 우선순위로 학생 셀 높이와 `padding-block`을 제한한다. 3→ 긴 이름이 좁은 열에서 두 줄이 되어 행 전체를 키우는지 실제 운영 데이터 40개 셀의 높이로 측정하고 `white-space: nowrap`을 적용한다. 4→ 390px과 1280px에서 모든 표본 행의 최소·최대 높이가 각각 26px·24px로 같은지, 상단 행동 문구가 `white-space: nowrap`인지 브라우저에서 확인한다.
- **판단 질문**: 전역 `--table-cell-y`를 줄이지 않는다. 일반 데이터 표는 읽기 여백이 필요하고 반별 명단만 열 간 비교를 위해 고밀도가 필요하기 때문이다. 모바일 반별 명단을 카드 목록으로 바꾸지도 않는다. 반과 학년을 열로 비교하고 셀 색상을 편집하는 업무 의미가 사라진다.
- **재사용 규칙**: 특정 표만 조밀해야 하면 `전역 표 규칙 실측 → 표 전용 클래스 → 더 높은 선택자 우선순위 → 셀 nowrap → 모바일·PC 실제 데이터 행 높이 측정` 순서로 해결한다.

### 회차 식별자와 출석 집계를 유지하며 다일 일정을 표현하기 (2026-08-21)
- **접근법**: 1→ `src/features/semester/types.ts`의 기존 `Session.date`와 `attendance/team/{sessionId}` 참조를 함께 확인한다. 2→ 회차를 날짜별로 복제하지 않고 같은 세션에 선택 `endDate`만 추가한다. 3→ `sessionDate.ts`에서 범위 검증·전체/축약 표기·오늘 포함 여부를 한 번만 계산한다. 4→ `SettingsTab.tsx`는 시작일·종료일을 추가·수정하고 `db.updateSessionDates`가 종료일 삭제를 `null` 최소 update로 처리한다. 5→ 출석 선택·표 머리글·커리큘럼·홈 캘린더·업무함에 같은 범위를 전달하고 단일 날짜 하위호환, 역전 차단, 둘째 날 현재 일정 판정을 테스트한다.
- **판단 질문**: 1박 2일을 이틀짜리 회차 두 개로 만들지 않는다. 회차가 둘이면 출석 만점과 수료 분모가 두 번 늘고 커리큘럼·출석 기록도 중복된다. `date`를 객체로 바꾸지도 않는다. 기존 정렬·비교·화면과 운영 DB 레코드가 문자열을 전제로 하기 때문이다.
- **재사용 규칙**: 기존 ID가 출석·수료 같은 집계 단위이면 다일 지원은 `기존 시작일 보존 → 선택 종료일 추가 → 범위 계산 공용화 → 모든 표시·현재 일정 판정에 전달 → 집계 키 불변 테스트` 순서로 확장한다.

### 다른 앱 원장값을 편집 폼 기본값으로 쓰면서 실시간 연결을 보존하기 (2026-08-21)
- **접근법**: 1→ `src/features/semester/rosterContact.ts`에서 `classes/{year}` 학생과 `teacherStaff/{year}` 스탭을 신청 `appKey` 기준 연락처 맵으로 만든다. 2→ 표시와 폼 초기값은 `semestersPrivate`의 비어 있지 않은 수정값을 먼저 쓰고 없으면 현재 원장값을 쓴다. 3→ 저장할 때 입력값이 원장 기본값과 같으면 빈 문자열로 정규화해 `applicationPrivate` 경로에서 제거하고, 실제로 달라진 값만 override로 남긴다. 4→ 배치 상세도 같은 원장 구독과 `resolvedContact`를 써 신청 화면과 우선순위를 맞춘다. 5→ 학생 본인·보호자와 스탭 연락처 키 연결, 수정값 우선, 기본값 비저장을 순수 함수 테스트로 고정한다.
- **판단 질문**: 원장 연락처를 신청 시점마다 `semestersPrivate`에 복사 저장하지 않는다. 복사본이 생기면 이후 출석부에서 번호를 수정해도 학기 화면은 오래된 값을 계속 보여 두 번째 진실이 된다. 반대로 모든 신청 비공개 값을 원장으로 덮지도 않는다. 운영자가 신청서에서 실제로 정정한 번호는 원장과 독립된 명시적 override이기 때문이다. 사역팀 지망·훈련 반은 매 학기 달라지므로 원장 기본값 연결 대상에 넣지 않는다.
- **재사용 규칙**: 읽기 전용 원장값을 다른 화면의 기본값으로 쓸 때는 `안정 키로 원장 맵 생성 → 명시적 override 우선 → 기본값과 같은 입력은 저장하지 않음 → 모든 소비 화면에서 같은 해석 함수 사용 → 원장 변경 회귀 테스트` 순서를 따른다.

### 운영 데이터가 있는 양 테마의 대비를 전역 토큰에서 교정하기 (2026-08-21)
- **접근법**: 1→ 로그인된 운영 화면의 홈·학기 배지·출석 표·수련회 반별 명단·주일·현장·가이드를 라이트와 다크에서 순회하고 computed style의 전경·실효 배경 대비를 측정한다. 2→ `src/app/globals.css`에서 작은 헤더 배지, 기본·비활성 버튼, 흐린 본문, Tailwind 상태 배경의 역할별 토큰을 분리한다. 3→ `bg-*-50/60`처럼 투명도가 다른 휴강 면과 `bg-*-200`인 명단 상태 면을 다크 재매핑에 함께 넣고 글자색도 같은 의미색 쌍으로 맞춘다. 4→ 홈 공유 캘린더는 저장 날짜를 바꾸지 않고 `homeActions.ts`에서 UTC 날짜 차를 계산해 `D-Day`·`D-N`·`D+N`만 표시한다. 5→ `themeContrastContract.test.ts`와 실제 운영 화면 재측정, 전체 타입·테스트·빌드로 회귀를 막는다.
- **판단 질문**: 보이지 않는 항목마다 인라인 색을 붙이거나 다크 전용 컴포넌트를 복제하지 않는다. 개별 덧칠은 같은 유틸리티를 쓰는 다른 탭의 문제를 남기고 테마마다 두 구현을 관리하게 된다. 디데이를 Firebase에 저장하지도 않는다. 날짜 기준 표시는 오늘 값에서 파생되어야 자정이 지나도 원본 일정과 어긋나지 않는다.
- **재사용 규칙**: 양 테마 대비 문제는 `운영 데이터 화면 순회 → computed 전경·실효 배경 측정 → 의미 토큰과 Tailwind 강도·투명도 쌍 보완 → 소스 계약 테스트 → 배포본 양 테마 재측정` 순서로 해결한다.

### 여러 권한·요청 경로를 관리자 대시보드에서 읽기 전용으로 합치기 (2026-08-21)
- **접근법**: 1→ `src/features/portal/TeamModal.tsx`와 `SiteRequestsPanel.tsx`가 이미 쓰는 `admins`, `retreatAdmins`, `retreatPending`, `iguardMembers`, `iguardPending` 구독을 확인한다. 2→ `src/features/portal/adminDashboard.ts`에서 UID 기준 권한 요청 중복 제거, 고유 팀원 수, 처리 대기 합계, 긴급 우선·오래된 순 업무함을 순수 함수로 계산한다. 3→ `AdminDashboardPanel.tsx`는 활성 탭일 때만 기존 경로를 구독하고 실제 승인·해결 쓰기는 기존 두 탭으로 이동시킨다. 4→ Firebase 연결 상태와 경로별 로드 오류를 함께 보여 주고, 순수 모델 테스트·전체 테스트·타입·빌드와 로그인된 라이트·다크 화면에서 검증한다.
- **판단 질문**: 대시보드 전용 집계 노드나 감사 로그를 새로 만들지 않는다. 현재 수치는 기존 원천에서 즉시 파생할 수 있고, 별도 저장은 새 Rules와 동기화 실패라는 두 번째 진실을 만든다. 대시보드 안에 승인·삭제 버튼도 복제하지 않는다. 파괴적 행동이 여러 진입점에 생기면 확인·오류·감사 계약이 갈라지기 때문이다.
- **재사용 규칙**: 여러 운영 도메인을 한 대시보드로 요약할 때는 `기존 구독 확인 → UID·상태 기반 순수 집계 → 활성 화면에서만 실시간 구독 → 쓰기는 원래 업무 화면으로 위임 → 연결·부분 실패를 명시` 순서를 지킨다.

### 단일 연도 편집 레코드를 연도별로 확장하면서 기존 운영값 보존하기 (2026-08-22)
- **접근법**: 1→ `src/features/ministryGuide/ministryGuidePersistence.ts`에서 기존 월별 레코드 ID와 note 스키마를 먼저 고정한다. 2→ 파서는 note의 `year`가 없으면 기준 연도 2026으로 해석하고, 읽기 모델만 `연도 → 월 → 내용`으로 확장한다. 3→ 2026년 저장은 기존 `mg_month_MM` ID를 그대로 갱신하고 다른 연도만 `mg_month_YYYY_MM` ID를 사용한다. 4→ `monthlyMinistriesForYear`는 2026년 가안만 기본값으로 제공하고 다른 연도는 빈 12개월을 반환해 계획이 자동 복제되지 않게 한다. 5→ 레거시 note 유지, 연도 간 비간섭, 다른 연도 빈 기본값을 순수 테스트로 고정한다.
- **판단 질문**: 기존 2026 레코드를 새 연도형 ID로 이관하거나 모든 연도에 2026 계획을 복제하지 않는다. 전자는 운영 DB 마이그레이션·중복 우선순위·롤백이 필요하고, 후자는 새 연도의 확정되지 않은 계획을 실제 계획처럼 보이게 만들기 때문이다.
- **재사용 규칙**: 연도 없는 운영 레코드를 연도별로 확장할 때는 `레거시 기준 연도 지정 → 읽기 모델 중첩 → 기존 연도 ID 불변 → 신규 연도만 namespaced ID → 자동 복제 금지 → 하위호환 테스트` 순서를 따른다.

### 가로 표의 고정 열은 실재하는 불투명 토큰으로 겹침을 차단하기 (2026-08-22)
- **접근법**: 1→ `src/app/globals.css`의 `.sunday-attendance-table`에서 sticky `No./이름` 열의 computed background가 투명한지 확인한다. 2→ `rg --fixed-strings -- '--color-…:' src/app/globals.css`로 참조한 CSS 변수가 실제 정의돼 있는지 검증한다. 3→ 정의되지 않은 `--color-bg-subtle`을 라이트·다크에 모두 정의된 불투명 `--color-surface-hover`로 교체한다. 4→ 이름 열에 오른쪽 경계와 약한 그림자를 추가하고 sticky 열의 z-index를 일반 날짜 셀보다 높게 유지한다. 5→ 같은 가로 표에서 범위 선택을 늘릴 때는 `attendanceWeeks`의 순수 범위 모델을 확장하고 1학기·2학기·1년 전체의 연결 관계를 테스트한다.
- **판단 질문**: 날짜 셀을 숨기거나 이름 열의 sticky 동작을 제거하지 않는다. 전자는 가로 스크롤 중 필요한 주차를 잃고, 후자는 긴 1년 표에서 학생과 출석 기록의 대응을 확인하기 어려워지기 때문이다. 존재하지 않는 새 토큰을 추가로 만들지도 않는다. 이미 양 테마에서 검증된 불투명 표면 토큰을 재사용해야 같은 문제가 다른 테마에서 반복되지 않는다.
- **재사용 규칙**: sticky 열 뒤로 내용이 비치면 `computed background 확인 → 변수 정의 존재 여부 검색 → 양 테마 불투명 표면 토큰 적용 → z-index·경계 보강 → 긴 범위 스크롤 회귀 테스트` 순서로 해결한다.

### 상위 역할 권한을 줄일 때 결합된 파생 기능을 capability별로 분리하기 (2026-08-22)
- **접근법**: 1→ `src/features/portal/accessPolicy.ts`에서 줄일 권한(`manageRoles`)과 유지할 권한(`search`, `managePin`)을 별도 capability로 확인한다. 2→ `rg "canManageRolesOf" src`로 역할 관리 판정을 재사용한 검색·PIN·현장 도구 소비자를 전수 찾는다. 3→ 팀원 관리 진입과 역할 쓰기만 `canManageRolesOf`에 남기고 `PortalSearch.tsx`는 `searchScope`, `useRetreatPinGate.ts`와 `FieldHomeClient.tsx`는 `canManageRetreatPin`을 사용한다. 4→ 승인 대기는 `NO_ROLES`로 시작해 명시적 역할 선택 전 저장을 막고, 기존 팀원의 권한 상승은 개인정보 범위 확대 확인창을 거친다. 5→ 통합관리자 단독 역할 관리, 교역자 검색 유지, PIN 운영 역할 유지, 행정팀 주일 자기 팀 편집을 `accessPolicy.test.ts`에 고정한다.
- **판단 질문**: 교역자의 `manageRoles`만 false로 바꾸고 소비자를 그대로 두지 않는다. 그렇게 하면 팀원 관리와 무관한 인물검색 연락처·수련회 PIN 우회·현장 관리자 도구까지 함께 사라진다. 반대로 UI 권한표를 세분화했다는 이유로 이 작업에서 Firebase Rules를 바꾸지도 않는다. Rules는 학생 앱 단일 원천과 별도 승인·검증 절차를 따라야 한다.
- **재사용 규칙**: 역할 권한을 축소할 때는 `변경 capability 정의 → 기존 판정 소비자 전수 검색 → 기능별 전용 capability로 분리 → 최소 승인 기본값·상승 확인 → 역할 조합 회귀 테스트` 순서로 진행한다.

### 유형 분리 규칙과 실제 역할 전환을 구분해 동일인 오진 진단하기 (2026-08-22)
- **접근법**: 1→ 검색 결과의 연도·유형 조합을 보고 `src/features/portal/peopleSearch.ts`의 `hasHardIdentityConflict`와 `scripts/person-id-migration.mjs`의 `canMergeWorker`에서 학생·교사·스탭 유형 경계를 확인한다. 2→ Firebase CLI로 `classes/{학생연도}`와 `teacherStaff/{스탭연도}`만 읽고, 로컬 파일을 만들지 않은 인메모리 스크립트로 이름·경로·personId 및 생년·본인 연락처의 존재·일치 여부만 출력한다. 3→ 같은 이름이라는 사실, 강한 식별자 일치, 기존 personId 일치, 유형 전환 가능성을 각각 분리해 보고한다. 4→ 강한 근거가 없는 사례는 자동 통합 대상이 아니라 수동 검토 대상으로 남긴다.
- **판단 질문**: 이름과 `3학년 → 2년 뒤 스탭` 흐름만으로 즉시 personId를 합치지 않는다. 동명이인을 합치면 여러 해 출석·수련회·학기 기록이 복구하기 어렵게 섞이고, 특히 스탭 원장에 생년월일이 없는 경우 역할 전환은 개연성이지 확정 근거가 아니기 때문이다. 반대로 유형이 다르다는 이유만으로 영구 분리를 정상으로 단정하지도 않는다. 실제 학생이 졸업 후 스탭이 되는 운영 생애주기가 존재한다.
- **재사용 규칙**: 학생→스탭 동일인 의심은 `유형 하드가드 확인 → 두 원장 최소 범위 읽기 → 강한 식별자 일치·충돌 분리 → 유일 후보만 자동 연결 / 나머지는 수동 검토` 순서로 판단한다.

### 새로고침에 흔들리지 않는 한국 날짜 기반 홈 문구 순환하기 (2026-08-22)
- **접근법**: 1→ `src/features/portal/dailyMinistryMessage.ts`에 확정된 응원 문구와 말씀을 각각 읽기 전용 목록으로 둔다. 2→ `Intl.DateTimeFormat`의 `Asia/Seoul` 시간대로 `YYYY-MM-DD` 키를 만든다. 3→ 날짜를 UTC 일련번호로 바꿔 응원·말씀 인덱스를 결정하고, 홈 진입 시 `useState`로 그날의 키를 고정한다. 4→ 한국식 전체 이름의 성만 안전하게 덜어내는 별도 순수 함수를 만들고 판단하기 어려운 이름은 원문을 보존한다. 5→ 같은 날 안정성, 한국 자정 전환, 제외 문구, 복성·외국 이름을 순수 테스트로 고정한다.
- **판단 질문**: `Math.random()`으로 새로고침마다 문구를 바꾸거나 문구 선택 결과를 Firebase에 저장하지 않는다. 전자는 같은 날 화면이 흔들리고, 후자는 매일 바뀌는 표시값 때문에 불필요한 DB 쓰기와 새 권한 계약이 생긴다. 브라우저 로컬 날짜도 사용하지 않는다. 해외 접속이나 서버 렌더링 위치에 따라 한국 교회 운영 날짜와 어긋날 수 있기 때문이다.
- **재사용 규칙**: 매일 바뀌되 같은 날 안정적이어야 하는 화면 문구는 `확정 목록 → 기준 시간대 날짜 키 → 결정적 일련번호 인덱스 → 세션 중 날짜 고정 → 자정·제외값 회귀 테스트` 순서로 구현하고 DB에는 저장하지 않는다.

### 동일인 조회에서 중복 원본을 지우지 않고 대표 기록 하나로 합치기 (2026-08-22)
- **접근법**: 1→ `src/features/portal/peopleSearch.ts`에서 원본 수련회 참가 행이 프로필의 `PersonRecord`로 바뀌는 경계를 찾는다. 2→ 기존 동일인 판정이 끝난 프로필 내부에서만 `retreat:{retreatId}:participant:*` 신청·배정 카드를 수련회별로 묶는다. 3→ 한국어·ISO 신청일, 신청 상태, 필드 수 순으로 대표 카드를 고른다. 4→ 대표 카드에 없는 필드만 이전 중복 카드에서 보충하고 단체티·차량·취소·의료 같은 다른 제목은 건드리지 않는다. 5→ 최신 상태 우선, 이전 필드 보존, 한 카드 결과를 `peopleSearch.test.ts`로 고정한다.
- **판단 질문**: `retreats/{id}/participants` 원본 중복 행을 삭제하거나 이름만으로 수련회 기록을 합치지 않는다. 전자는 운영 이력과 백업을 손상시키고 DB 쓰기 승인이 필요하며, 후자는 동명이인의 기록을 섞을 수 있다. 한 수련회의 모든 카드를 무조건 하나로 합치지도 않는다. 신청·단체티·차량·취소·의료는 서로 다른 업무 기록이기 때문이다.
- **재사용 규칙**: 검색·감사 화면에서 같은 원본이 여러 카드로 보이면 `기존 동일인 판정 뒤로 통합 시점 이동 → 도메인 ID와 기록 종류로 그룹화 → 최신 대표 선택 → 누락 필드만 보충 → 원본 무쓰기 회귀 테스트` 순서로 해결한다.

### 역할별 마이페이지를 새 집계 노드 없이 권한별 읽기 모델로 구성하기 (2026-08-22)
- **접근법**: 1→ `src/features/portal/accessPolicy.ts`의 capability와 기존 학기·주일·수련회·이가드 구독 함수를 역할별 입력표로 정리한다. 2→ `src/features/portal/myPageDashboard.ts`에서 노출 모듈, 일정 종류, 개인 신청 후보, 출석 요약을 순수 함수로 계산하고 역할 조합 테스트를 먼저 고정한다. 3→ `src/features/portal/useMyPageData.ts`는 접근 가능한 경로만 활성 탭에서 실시간 구독하고, 개인 신청·수련회 담당은 정규화한 이름의 유일 후보일 때만 연결한다. 4→ `MyPageModal.tsx`는 모든 계정에 대시보드·내 사역·내 요청을 제공하되 팀원 관리·전체 요청사항은 기존 관리 capability가 있는 계정에만 붙인다. 5→ 양 테마·모바일 밀도와 연결 실패·빈 상태를 표시하고 타입·전체 테스트·빌드·로그인 운영 화면으로 확인한다.
- **판단 질문**: 역할별 대시보드 결과를 Firebase에 새로 저장하거나 화면 컴포넌트에서 역할 문자열을 직접 비교하지 않는다. 새 집계 노드는 원본과 어긋나는 두 번째 진실과 Rules 변경을 만들고, 직접 비교는 역할 정책 변경 때 일부 화면만 잘못 열릴 수 있기 때문이다. 이름이 같은 후보가 여러 명인 경우도 자동 연결하지 않는다. 개인 업무를 다른 사람에게 보여 주는 것보다 미연결 상태를 명시하는 편이 안전하다.
- **재사용 규칙**: 여러 역할에 개인화 화면을 추가할 때는 `capability 표 작성 → 순수 파생 모델과 역할 조합 테스트 → 허용 경로만 실시간 구독 → 개인 연결은 유일 후보만 → 관리 쓰기는 기존 전용 탭에 위임 → 빈 상태·부분 실패·양 테마 검증` 순서를 따른다.

### 로그인 운영 앱의 E2E를 단위 테스트와 충돌 없이 추가하기 (2026-08-22)
- **접근법**: 1→ `playwright.config.ts`에서 인증 상태를 코드에 넣지 않고 `E2E_STORAGE_STATE` 파일 경로로만 받는다. 2→ 인증 파일이 없으면 로그인 시나리오를 명시적으로 skip하고, 있으면 홈·학기·주일·수련회·가이드의 페이지 오류와 문서 가로 넘침을 PC·모바일 프로젝트에서 검사한다. 3→ 오버레이는 열기·ESC 닫기 뒤 `ModalScrollManager`가 `body.position`을 복구했는지 확인한다. 4→ Playwright 파일은 `e2e/*.e2e.ts`와 `testMatch`로 격리하고 Vitest의 `*.test.ts`·`*.spec.ts` 탐색에 포함시키지 않는다. 5→ `npx playwright test --list`, 전체 Vitest, 타입, lint, production build를 차례로 실행한다.
- **판단 질문**: Google OAuth 토큰이나 쿠키를 저장소에 커밋하지 않고, 인증이 없는 CI에서 로그인 테스트를 억지로 통과시키지 않는다. E2E 파일을 `*.spec.ts`로 만들지도 않는다 — 이 저장소의 Vitest 기본 탐색과 겹쳐 Playwright의 `test.describe`가 Vitest 프로세스에서 실행된다. 브라우저 검증을 이유로 운영 DB의 저장 버튼도 누르지 않는다.
- **재사용 규칙**: 인증형 Next.js 운영 앱의 E2E는 `외부 storage state 주입 → 미설정 skip → PC·모바일 핵심 경로 smoke → 오버레이 스크롤 복구 → *.e2e.ts로 러너 격리 → 단위·타입·lint·build 동시 검증` 순서를 지킨다.

### 브라우저 온라인 추정값 대신 실제 저장 서버 연결로 경고하기 (2026-08-22)
- **접근법**: 1→ `src/app/ConnectivityBanner.tsx`의 `navigator.onLine` 초기값·이벤트와 `src/lib/db/core.ts`의 Firebase `.info/connected` 구독을 대조한다. 2→ 배너 판정을 `.info/connected` 하나로 옮기고 첫 연결의 일시적인 `false`는 3초 유예한다. 3→ `src/lib/connectivity.ts`에 연결·유예·복구 안내를 순수 상태 전이로 분리한다. 4→ 초기 false, 유예 내 연결, 지속 단절, 재연결 안내 종료를 `connectivity.test.ts`로 고정한다. 5→ 전체 테스트·lint·타입·production build와 배포본 버전을 확인한다.
- **판단 질문**: `navigator.onLine`과 Firebase 연결을 단순 AND로 묶지 않는다. 브라우저 값은 네트워크 어댑터·캐시·확장 프로그램 상태에 따라 실제 저장 가능 여부와 다를 수 있고, AND 조건은 Firebase가 정상이어도 거짓 오프라인을 유지한다. Firebase의 첫 `false`도 즉시 경고하지 않는다. SDK 연결 수립 중 정상적으로 잠깐 발생할 수 있기 때문이다.
- **재사용 규칙**: 저장 실패 경고는 `실제 저장 서버 연결 구독 → 초기 false 유예 → 순수 상태 전이 테스트 → 단절 지속 시에만 경고 → 실제 경고 뒤 재연결 안내` 순서로 구현하고 브라우저의 `navigator.onLine`은 보조 진단값으로만 사용한다.

### 여러 머리글 행이 있는 표에서 열 역할을 nth-child로 지정하지 않기 (2026-08-22)
- **접근법**: 1→ 로그인된 학기 출석표에서 `getBoundingClientRect()`로 날짜 머리글 폭을 전부 측정해 9/5만 142px이고 나머지는 50px임을 확인한다. 2→ `src/app/operations-tables.css`의 이름 열 규칙 `:nth-child(2)`가 두 번째 머리글 행의 두 번째 날짜에도 적용되는지 대조한다. 3→ `AttendanceGrid.tsx`의 이름 열에 `attendance-name-cell`, 날짜 머리글과 상태 셀에 `attendance-session-cell` 역할 클래스를 붙인다. 4→ 이름 열 142px과 모든 회차 열 52px을 역할 클래스에만 적용하고 범용 nth-child 선택자를 제거한다. 5→ 소스 계약 테스트와 배포된 운영 화면의 실제 열 폭을 다시 측정한다.
- **판단 질문**: 9/5 하나만 `nth-child` 예외로 덮거나 표 전체 폭을 줄이지 않는다. 날짜 순서가 바뀌면 같은 버그가 다른 회차로 이동하고, 표 폭 조정은 이름 열 선택자가 다른 머리글 행에 누출되는 직접 원인을 해결하지 못하기 때문이다.
- **재사용 규칙**: `rowSpan`·`colSpan`·여러 `tr`이 있는 표의 열 폭은 `nth-child`가 아니라 의미 기반 열 클래스로 지정하고, 수정 전후 모든 머리글의 실제 폭을 배열로 측정한다.

### effect 안 setState를 순수 함수로 걷어낼 때 React Compiler에 막히지 않기 (2026-08-22)
- **접근법**: 1→ `react-hooks/set-state-in-effect`가 걸린 자리에서 "무엇을 정하는 결정인가"를 한 문장으로 적고 그 판정만 `src/features/iguard/lib/cueSelection.ts`처럼 순수 함수로 뺀다. 2→ 컴포넌트는 `const day = resolveSelectedDay(days, pickedDay, curDay)`처럼 **렌더 중 파생**으로 부른다. 3→ `npx eslint <파일>`을 돌리면 이번에는 `react-hooks/preserve-manual-memoization`이 뜬다 — 그 파생값을 dep로 쓰는 아래쪽 `useMemo`에서 "This dependency may be modified later"가 난다. 4→ 파생값 자체를 `useMemo(() => resolveSelectedDay(days, pickedDay, curDay), [days, pickedDay, curDay])`로 감싸면 사라진다. 5→ `npx tsc --noEmit`·`npx vitest run`·`npx eslint .`을 차례로 돌려 0을 확인한다.
- **판단 질문**: 순수 함수 추출을 포기하고 로직을 컴포넌트에 인라인으로 되돌리지 않는다. 컴파일러가 통과시킨다는 이유로 테스트 불가능한 자리에 ★ 사고 이력 로직을 두는 것이 실제 위험이고, `useMemo` 한 겹이 그 대가로 충분히 싸다. `eslint-disable`로 덮지도 않는다 — 이 규칙은 메모이제이션이 실제로 깨졌다는 신호라 끄면 렌더 성능이 조용히 나빠진다. localStorage 복원처럼 서버 렌더에 값이 없는 경우까지 억지로 렌더 파생으로 바꾸지 않는다(하이드레이션 불일치). 그때는 effect를 쓰되 판정만 순수 함수에 위임한다.
- **재사용 규칙**: React Compiler가 켜진 이 저장소에서 순수 함수를 추출하면 **그 반환값이 다른 `useMemo`의 dep로 들어가는 순간 함께 `useMemo`로 감싼다** — 컴파일러는 외부 함수 안을 못 보므로 인자로 넘긴 배열이 변형될 수 있다고 보수적으로 판단한다.

### 저장 스키마를 유지한 채 주차 번호와 공유 일정 분류를 화면에서 파생하기 (2026-08-22)
- **접근법**: 1→ `src/features/semester/sessionKind.ts`의 `sessionWeekLabel`에서 현재 행까지 휴강이 아닌 세션만 세어 `n주차`를 만들고 휴강 행은 번호 대신 `휴강`을 반환한다. 2→ 설정·커리큘럼은 같은 함수를 써서 번호가 어긋나지 않게 한다. 3→ `src/features/portal/SharedMinistryCalendar.tsx`에 화면 분류와 기존 `sourceSite` 문자열의 양방향 매핑을 한곳에 선언한다. 4→ 일정 추가·수정 모달에서 고등부 메인·훈련·주일·수련회 행정·이가드를 명시적으로 선택하고 기존 `prepMilestones/{id}/sourceSite`에 저장한다. 5→ 휴강 전후 연속 번호와 분류별 sourceSite 왕복을 순수 테스트로 고정한다.
- **판단 질문**: 휴강 세션을 삭제하거나 세션 ID·출석 경로를 다시 매기지 않는다. 기존 출석·커리큘럼은 세션 ID를 참조하므로 번호 때문에 원본을 바꾸면 참조가 끊긴다. 일정 분류용 새 Firebase 노드나 Rules도 만들지 않는다. `prepMilestones.sourceSite`가 이미 40자 문자열을 허용하고 있어 별도 스키마는 두 번째 진실만 만든다.
- **재사용 규칙**: 운영 순번에서 제외할 기록이 생기면 `원본 순서·ID 유지 → 표시 번호만 순수 파생 → 모든 소비 화면에서 같은 함수 재사용`하고, 공유 레코드 분류는 새 경로보다 기존 discriminator 필드의 중앙 매핑을 먼저 확장한다.

### Playwright에서 Firebase 로그인 세션을 실제 저장소까지 보존하기 (2026-08-24)
- **접근법**: 1→ `scripts/save-e2e-auth.mjs`로 수동 Google 로그인 뒤 로그아웃 버튼이 나타나는지 기다린다. 2→ Firebase Auth가 세션을 쿠키가 아니라 IndexedDB에 저장하는지 확인한다. 3→ `context.storageState({ path, indexedDB: true })`로 쿠키·localStorage와 IndexedDB를 함께 저장한다. 4→ 생성된 `.auth/user.json`은 gitignore 상태를 유지하고 `E2E_STORAGE_STATE=.auth/user.json npm run test:e2e:smoke`로 PC·모바일 스모크를 실행한다. 5→ 인증 파일이 없거나 만료됐을 때는 실패를 숨기지 말고 다시 수동 로그인해 갱신한다.
- **판단 질문**: 로그인 성공 후 쿠키만 복사하거나 운영 계정 토큰을 환경변수·저장소에 넣지 않는다. Firebase 세션의 실제 원천인 IndexedDB가 빠지면 새 브라우저 컨텍스트는 다시 비로그인 상태가 되고, 토큰을 코드로 다루면 운영 계정 비밀이 유출될 수 있다.
- **재사용 규칙**: Firebase Auth 기반 Playwright 인증은 `수동 로그인 감지 → storageState의 IndexedDB 포함 → 인증 파일 gitignore → 실제 스모크 실행 → 만료 시 재생성` 순서로 다룬다.

### 공개 참가자 키를 유지하며 연락처만 비공개 경로로 옮기기 (2026-08-24)
- **접근법**: 1→ `retreats/{id}/participants/{participantKey}`를 이가드·조편성·방배정의 공개 원장으로 유지하고 `phone`·`pPhone`만 민감 필드로 식별한다. 2→ 같은 키의 `retreatsPrivate/{id}/participantContacts/{participantKey}`를 비공개 쓰기 원천으로 추가한다. 3→ `participantPrivacy.ts`에서 공개 값과 연락처를 분리하고, 과도기 읽기는 비공개 값을 우선하되 공개 레거시 값으로 폴백한다. 4→ 전체 저장·단건 수정·재매칭·옛 백업 복구를 루트 원자 update로 바꾸고, 공개 백업 복구가 연락처를 다시 노출하지 않게 재분리한다. 5→ 운영 이관은 읽기 전용 스냅샷에서 업데이트 계획과 충돌을 먼저 만들고, 정확한 경로 수 승인 뒤 현재 노드 스냅샷·원자 update·재검증 순서로 실행하며 기존 백업은 건드리지 않는다.
- **판단 질문**: participant key를 새로 발급하거나 공개 참가자 전체를 private로 옮기지 않는다. 키가 바뀌면 조·방·부분참·이가드 참조가 끊기고, 전체를 숨기면 현장 운영이 명단을 읽지 못한다. 옛 공개 백업의 연락처를 일괄 삭제하지도 않는다. 사용자 요청상 기존 수련회 기록과 백업은 보존해야 하고, 복구 경계에서 공개 재노출만 차단하면 된다.
- **재사용 규칙**: 공유 원장의 일부 필드만 민감해졌다면 `공유 키 불변 → 민감 필드만 같은 키의 private sibling으로 분리 → private 우선·legacy 폴백 → 모든 쓰기·복구에서 원자 분리 → 스냅샷 dry-run과 승인 후 이관` 순서를 따른다.

### 실시간 요청함의 첨부 본문을 Rules 변경 없이 Storage로 분리하기 (2026-08-24)
- **접근법**: 1→ `database.rules.json`에서 `iguardPending/{uid}` 전체만 권한이 열려 있어 같은 RTDB 부모 아래 다른 하위 경로로 옮겨도 관리자 루트 구독이 첨부를 계속 내려받는지 확인한다. 2→ 앱이 이미 쓰는 Firebase Storage를 재사용해 `site-requests/{uid}/{requestId}/attachment.jpg`에 축소 JPEG 본문을 업로드한다. 3→ RTDB `siteRequests/{requestId}/attachment`에는 이름·크기·Storage 경로·다운로드 주소만 저장하고, 정규화 시 요청 소유자·요청 ID 경로와 Firebase Storage 도메인을 검증한다. 4→ 분리 전 `dataUrl`은 읽기 호환만 유지하고 새 전송은 Storage 업로드 뒤 RTDB 저장, RTDB 저장 실패 시 파일 정리 순서로 실행한다. 5→ 요청 삭제는 파일을 먼저 지운 뒤 요청 레코드를 지워 다운로드 토큰이 남는 고아 파일을 피하고, 기존 첨부 건수를 읽기 전용으로 확인해 실제 이관 필요 여부를 결정한다.
- **판단 질문**: 첨부를 `iguardPending/{uid}/siteRequestAttachments` 형제 경로로만 옮기지 않는다. 통합관리자의 `iguardPending` 루트 구독은 그 형제까지 통째로 받아 트래픽·메모리 문제가 그대로다. 새 RTDB 최상위 경로도 만들지 않는다. 새 Rules가 필요하고 이 저장소에서는 Rules 수정·배포가 금지다. 기존 base64를 계속 요청 레코드에 저장하지도 않는다. 작은 상태 변경마다 대형 문자열이 반복 전송된다.
- **재사용 규칙**: RTDB 실시간 목록에 대형 파일이 섞이면 `현재 구독 조상 경로 확인 → 같은 부모 이동이 실제 분리인지 판정 → 기존 Storage 권한·SDK 재사용 → RTDB에는 검증된 메타데이터만 저장 → 레거시 읽기 호환과 실패 정리 → 삭제 시 파일 우선 정리` 순서를 따른다.

### 실제 모바일과 PC 수동 모바일 미리보기를 하나의 화면 상태로 유지하기 (2026-08-26)
- **접근법**: 1→ 실제 휴대폰 전용 정보구조가 이미 `isViewportMobile`·`isMobileView` 분기로 존재하는지 먼저 찾는다. 2→ `PortalViewportShell`에서 PC가 명시적으로 모바일 모드를 고른 경우에만 바깥에 `PC버전/모바일버전 → 테마 → 마이페이지` 제어를 남긴다. 3→ 현재 URL을 같은 출처의 430px iframe으로 열어 iframe 자체가 모바일 미디어 쿼리와 모바일 JS 분기를 실행하게 한다. 4→ iframe 안에서는 원래 `GlobalPortalHeader`, 알림, 모달, 각 업무 화면을 그대로 렌더링하고 별도 모바일 마크업을 복제하지 않는다. 5→ iframe 경로를 바깥 router와 동기화해 PC 보기로 돌아가도 현재 업무 화면을 유지한다. 6→ 430px 프레임 폭, 실제 모바일 헤더, PC↔모바일 왕복, 본문 스크롤을 브라우저에서 실측한다.
- **판단 질문**: 데스크톱 DOM의 폭만 430px로 줄이고 반응형 유틸리티를 CSS로 하나씩 되돌리지 않는다. 미디어 쿼리는 바깥 브라우저 폭을 계속 보고 일부 컴포넌트는 실제 뷰포트 상태로 JSX를 고르므로, 이런 방식은 휴대폰 화면이 아니라 데스크톱과 모바일이 섞인 세 번째 화면을 만든다. 모바일 UI를 별도 컴포넌트 트리로 복제하지도 않는다. 실제 휴대폰과 미리보기의 수정 시점이 갈라진다. 같은 출처 iframe은 기존 Firebase Auth·로컬 설정을 재사용하고 실제 모바일 코드 경로를 그대로 실행하므로 이 요구에 맞는 의도적인 격리 경계다.
- **재사용 규칙**: 데스크톱에서 실제 모바일 앱을 미리 보여 줄 때는 `기존 모바일 정보구조 확인 → 바깥 PC 제어와 안쪽 앱 셸 분리 → same-origin 고정 뷰포트 iframe → URL·테마 상태 동기화 → 실제 휴대폰 헤더·스크롤·왕복 QA` 순서를 따른다.

### 사용자가 고른 PC 화면을 브라우저 너비와 분리하기 (2026-08-27)
- **접근법**: 1→ `ViewModeContext.tsx`에서 저장 모드와 `matchMedia` 결과를 합쳐 모바일을 강제하는 지점을 찾는다. 2→ 저장값이 없을 때만 실제 뷰포트로 최초 모드를 정하고, 이후 `isMobileView`는 저장된 선택만 보게 한다. 3→ `PortalViewportShell.tsx`의 PC 모드는 넓은 창부터 같은 출처의 최소 1280px iframe 하나로 실행해 900px 경계에서 React 트리와 문서를 교체하지 않는다. 4→ `__portalFrame=desktop` 쿼리와 iframe name으로 내부 재귀를 막고 바깥 URL 동기화에서는 표식을 제거한다. 5→ iframe `src`를 자식 컴포넌트의 최초 state로 고정해 내부 이동을 바깥 router가 따라가도 재로딩하지 않는다. 6→ 빠른 왕복 리사이즈에서 프레임 개수·종류·내부 URL 불변을 실측한다.
- **판단 질문**: React의 `isMobileView`만 바꾸고 CSS 미디어 쿼리를 그대로 두지 않는다. 그러면 JSX는 PC인데 CSS는 모바일인 혼합 화면이 된다. 900px에서 기존 DOM과 iframe을 조건부 교체하지도 않는다. CSS가 먼저 모바일로 바뀌고 새 iframe이 로드되면서 모바일 화면과 흰 화면이 순서대로 번쩍인다. 모든 모바일 미디어 쿼리에 `data-view-mode` 예외를 덧붙이는 방식도 누락 위험과 `!important`를 계속 늘린다.
- **재사용 규칙**: 명시적 보기 모드가 반응형 자동 전환보다 우선하고 리사이즈 깜빡임도 없어야 하면 `최초 기본값과 지속 선택 분리 → 모드 진입부터 단일 고정 뷰포트 사용 → 내부 프레임 재귀 차단 → URL 표식 제거·src 재로딩 차단 → 빠른 왕복 리사이즈 실측` 순서로 구현한다.

### 같은 작업 화면의 URL 상태를 로딩 없이 동기화하기 (2026-09-01)
- **접근법**: 1→ `ProgramPreparationClient.tsx`에서 클릭 직후 스켈레톤이 뜨는 경로를 `router.push`·`router.replace`와 Firebase 구독 의존성으로 나눠 추적한다. 2→ `program`·`section`처럼 같은 클라이언트 화면의 선택은 Next 공식 Native History API인 `window.history.pushState`·`replaceState`로 바꿔 `useSearchParams`와 공유 URL은 유지한다. 3→ `PortalViewportShell.tsx`의 iframe→바깥 주소 동기화도 History API로 바꿔 외부 서버 라우트 탐색이 프레임을 가리지 않게 한다. 4→ 계약 테스트에서 로컬 선택 구간에 Next router 호출이 없고 프레임 동기화가 `replaceState`를 쓰는지 고정한다. 5→ lint·typecheck·전체 테스트·production build 뒤 실제 프로그램 탭을 연속 전환해 구독과 스켈레톤이 유지되는지 확인한다.
- **판단 질문**: URL 쿼리를 React 로컬 state로만 옮기지 않는다. 새로고침·링크 공유·브라우저 뒤로가기에 현재 프로그램을 보존해야 한다. Firebase 구독의 준비 상태를 억지로 캐시하지도 않는다. 이 문제에서는 구독 의존성이 `retreatId`로 안정적이었고, 같은 페이지 쿼리에 서버 탐색을 건 것이 실제 원인이었다.
- **재사용 규칙**: 같은 App Router 화면 안의 탭·정렬·선택이 쿼리만 바꾸는데 로딩 경계가 깜빡이면 `구독 의존성 확인 → 로컬 작업 상태와 실제 경로 이동 분리 → Native History API 적용 → iframe 바깥 동기화까지 같은 원칙 적용 → URL 보존·무재탐색 계약 테스트` 순서를 따른다.

### 탭처럼 오가는 형제 화면에서 인증·경로 로딩을 반복하지 않기 (2026-09-01)
- **접근법**: 1→ 로그인된 운영 화면에서 `행정 → 이가드` 진입 시간을 재고 내부 탭 전환과 형제 경로 이동을 분리한다. 2→ `src/features/iguard/context/AuthContext.tsx`의 두 번째 `onAuthStateChanged`와 역할 DB 조회가 경로 진입마다 다시 시작되는지 확인한다. 3→ 이가드 컨텍스트를 루트 `AuthContext` 상태를 전달하는 어댑터로 바꿔 레거시 import 경계는 유지하되 인증은 한 번만 수행한다. 4→ `IguardClient.tsx`의 `view` 쿼리는 Native History API로 갱신해 22개 실시간 구독을 유지한다. 5→ `RetreatAreaNav.tsx`가 행정·프로그램·이가드 형제 경로를 마운트·포인터 진입·포커스 시 prefetch하도록 해 실제 경로 전환 전에 RSC를 준비한다. 6→ PC 고정 보기의 `PortalViewportShell`이 프레임 URL을 `window.history.replaceState`로 바꾸면 Next가 바깥 라우터까지 다시 탐색해 iframe을 숨긴다. `History.prototype.replaceState.call`로 주소창만 갱신하고, `__portalFrame`을 제외한 경로끼리 비교해 같은 프레임 문서를 다시 로드하지 않는다. 7→ RSC prefetch만으로 Firebase 첫 응답 로딩은 없어지지 않으므로 `retreatWorkspaceCache.ts`와 이가드 데이터 허브에 5분 메모리 스냅샷을 두고, 권한 확인 뒤 직전 정상 화면을 즉시 복원하면서 구독을 다시 연결한다. 8→ 행정 하위 탭은 방문한 것만 keep-alive해 재방문 시 구독·입력 상태를 보존하되 열지 않은 탭은 구독하지 않는다. 9→ 별도 인증 조회 부재·무재탐색 탭·세 경로 prefetch·고정 프레임 유지·스냅샷 복원·전 탭 방문 유지 계약을 테스트로 고정하고 실제 운영 화면에서 재측정한다.
- **판단 질문**: 행정·프로그램·이가드를 React 로컬 탭 하나로 합치거나 모든 이가드 데이터를 다른 화면에서 미리 구독하지 않는다. 세 영역은 권한·정보구조·쓰기 경계가 달라 경로를 유지해야 하고, 무조건적인 데이터 프리로드는 불필요한 개인정보 읽기와 22개 장기 리스너를 만든다. 캐시는 서버 모듈 전역이 아니라 현재 브라우저 탭의 `window`에만 두고, 인증·영역 권한을 통과한 뒤 렌더하며 짧은 TTL 뒤 실시간 구독이 즉시 덮어쓰게 한다. 로딩 문구만 CSS로 숨기지도 않는다. 인증과 서버 경로 탐색이 실제로 반복되는 동안 숨기면 빈 화면만 남는다.
- **재사용 규칙**: 형제 경로가 탭처럼 보이는데 전환 때마다 전면 로딩이 뜨면 `실제 경로 이동/내부 상태 분리 → 중첩 인증 Provider 제거 또는 전역 상태 어댑트 → 내부 쿼리는 History API → 고정 iframe 바깥 URL 동기화가 App Router를 깨우는지 확인 → 형제 경로는 권한 범위 안에서 prefetch → 방문 화면만 stale-while-revalidate 캐시·keep-alive → 인증·프레임·구독 재시작 여부를 운영 화면에서 측정` 순서를 따른다.

### 실시간 운영 화면의 로딩·대용량 UI·CI를 한 번에 품질 경계로 묶기 (2026-08-27)
- **접근법**: 1→ `src/lib/subscriptionReadiness.ts`에서 여러 Firebase 구독의 첫 성공·오류 응답을 모두 준비 완료로 합치고 `WorkspaceSkeleton`을 준비 전 화면에 둔다. 2→ `RetreatParticipantMobileList.tsx`는 `pagination.ts`로 40명씩 자르고 `interaction-controls.css`의 `content-visibility:auto`를 더해 DOM과 페인트를 함께 제한한다. 3→ 800줄 이상 화면은 이름 선택기·순수 명단 모델·방 카드 같은 책임 단위로 분리하고 `componentBoundaries.test.ts`와 특성 테스트로 정렬·표기 계약을 고정한다. 4→ `exportUtils.loadXlsx()`의 동적 import로 무거운 XLSX 런타임을 내보내기 시점까지 미루고 빌드 manifest에서 별도 chunk 생성을 확인한다. 5→ CSS를 기반·운영표·테마 호환·상호작용 파일로 나누고 `cssArchitecture.test.ts`로 파일 크기와 `!important` 예산을 고정한다. 6→ `.github/workflows/highschool-quality.yml`에 lint·typecheck·coverage·build·Lighthouse·인증 smoke·axe를 순서대로 연결하고 인증 파일 누락은 `scripts/require-e2e-auth.mjs`가 즉시 실패하게 한다.
- **판단 질문**: 모든 `get`을 구독으로 바꾸거나 스켈레톤을 시간 지연으로 끄지 않는다. 전자는 거래 검증과 명시적 명령까지 장기 리스너로 만들고, 후자는 네트워크 오류에서 빈 화면을 정상처럼 보이게 한다. 모바일 명단 전체를 숨김 CSS로만 처리하지 않고 실제 배열을 페이지 단위로 잘라 DOM 수를 제한한다. XLSX를 앱 시작 시 정적 import하거나 로그인 E2E를 인증 파일 없을 때 skip하지 않는다. 둘 다 번들·CI가 정상인 것처럼 보이게 하는 거짓 통과다.
- **재사용 규칙**: 실시간 운영 앱의 전면 품질 개선은 `첫 응답 준비 게이트 → 실제 렌더 수 제한 → 책임 경계 분리와 특성 테스트 → 무거운 기능 지연 로딩 → CSS 호환층 격리 → 인증 누락까지 실패하는 CI 관문` 순서로 진행한다.

### 고밀도 운영 UI의 심각도 문제를 공통 상호작용 계약으로 수정하기 (2026-08-28)
- **접근법**: 1→ `rg`와 계약 테스트로 클릭 가능한 `div`/`span`, 40px 미만 제어, `transition-all`, 이모지·직접 SVG, 중단할 수 없는 모달 진입 애니메이션을 찾는다. 2→ 비표준 클릭 요소를 `button`/`Link`/키보드 조작 가능한 표 셀로 바꾸고, `interaction-controls.css`에 데스크톱 40px·코스 포인터 44px 타겟을 고정한다. 3→ 상태 전환은 변경 속성만 명시하고, 모달은 완전한 진입·종료 계약을 구현하지 않을 경우 진입 키프레임을 제거한다. 4→ 아이콘은 `@phosphor-icons/react`, 미디어 경계는 `.media-outline`, 출석 비활성 대비는 `.attendance-status-choice`로 단일화한다. 5→ 계약 테스트·lint·typecheck·전체 테스트·프로덕션 빌드 뒤 로그인된 라이트·다크, PC·모바일 화면을 실측한다.
- **판단 질문**: 모든 제어를 44px로 키우거나 전역 `button`을 덮지 않는다. 마우스 기반 고밀도 표는 40px를 유지하고 코스 포인터에서만 44px로 확장해 밀도와 터치 안전을 같이 지킨다. 상호작용 요소 안에 다른 버튼을 중첩하지 않고 카드 진입 `Link`와 삭제 `button`을 형제로 분리한다. 전체 이모지를 기계적으로 없애지 않고 실행 제어·상태 표시의 포잉 표면부터 단일화한다.
- **재사용 규칙**: 고밀도 운영 UI의 상호작용 감사는 `의미 요소 → 타겟 40/44px → 명시적 전환 속성 → 아이콘·미디어·대비 토큰 → 계약 테스트 → 양 테마·양 뷰포트 실측` 순서로 수행한다.

### 운영 요약 수치는 원본 화면의 모집단·제외 규칙을 그대로 재사용하기 (2026-08-29)
- **접근법**: 1→ `src/features/portal/retreatPrepStatus.ts`의 요약 수치와 `GroupsTab.tsx`·`RoomsTab.tsx`의 실제 `allUnassigned` 파생식을 나란히 비교한다. 2→ 신청 레코드를 직접 세지 않고 `studentId`를 중복 제거한다. 3→ `assignmentBoard.ts`의 `findLateRegistrantIds`·`excludeAssignedStudents`·`findUnassignedStudentIds`·`findDayAttendanceIds`를 요약에서도 재사용해 취소자·후기 신청자·당일참석 규칙을 맞춘다. 4→ 요약 컴포넌트가 학생 원장·셀 색·부분참도 실시간 구독하게 한다. 5→ 중복 신청·취소·당일참석·후기 신청 조합을 `retreatPrepStatus.test.ts`로 고정한다.
- **판단 질문**: 화면에 표시된 차이만 상수 보정하거나 참가자 레코드 수에서 임의로 빼지 않는다. 조편성은 당일참석자를 포함하고 방배정은 제외하며, 취소·후기 신청도 실시간으로 바뀌므로 임시 산술은 다음 변경에서 다시 어긋난다. 요약 전용 집계 노드도 만들지 않는다. 원본 화면과 다른 두 번째 진실이 된다.
- **재사용 규칙**: 운영 화면의 요약·배지·대시보드 숫자는 `상세 화면의 실제 모집단 식별 → 고유 ID 중복 제거 → 같은 제외·포함 순수 함수 재사용 → 필요한 원천을 함께 구독 → 엣지 조합 회귀 테스트` 순서로 구현한다.

### Firebase 중첩 목록의 push 키를 화면 ID로 복원하기 (2026-08-29)
- **접근법**: 1→ `src/lib/db/programs.ts`처럼 `push()`한 중첩 경로에 값만 저장하면 자식 데이터 안에는 키가 없다는 점을 확인한다. 2→ 최상위 `snapToList`가 프로그램 ID만 복원하고 `program.tasks` 같은 중첩 객체의 키는 복원하지 않는지 대조한다. 3→ `src/lib/programPreparation.ts`의 `programTasks`에서 `Object.entries(tasks)`를 사용해 각 Firebase 객체 키를 런타임 `task.id`로 주입한다. 4→ 할 일 생성 순 정렬뿐 아니라 값 안에 `id`가 없는 실제 저장 형태에서도 `first`·`later` 키가 ID로 복원되는 회귀 테스트를 추가한다. 5→ 토글·삭제 함수가 복원된 ID로 정확한 `retreats/{id}/programs/{programId}/tasks/{taskId}` 한 건만 쓰는지 타입·테스트·빌드로 확인한다.
- **판단 질문**: 생성 시 push 키를 값 안에 중복 저장하거나 기존 레코드를 일괄 이관하지 않는다. 키와 필드가 어긋나는 두 번째 진실을 만들고 운영 DB 마이그레이션까지 필요해진다. `Object.values()` 결과의 `id`가 항상 있다고 가정하지도 않는다. 타입은 통과해도 실제 Firebase 스냅샷에는 값 내부 ID가 없어 수정·삭제가 `undefined` 경로로 실패한다.
- **재사용 규칙**: RTDB 객체형 중첩 목록을 배열로 렌더링할 때는 `Object.entries → 객체 키를 런타임 ID로 주입 → 그 ID로 쓰기 경로 구성 → 값 내부 ID 없는 fixture로 회귀 테스트` 순서를 지킨다.

### 운영 필드를 제거할 때 완료 판정과 과거 레코드를 함께 보존하기 (2026-08-30)
- **접근법**: 1→ `rg "giftDate|등반 선물 전달일|등반 확인" src`로 입력칸뿐 아니라 `deriveNewFriendStage`·처리 대기·마이페이지·인물조회 소비자를 전수 찾는다. 2→ `src/app/semester/[id]/NewFriendsTab.tsx`에서 선물일 입력·표시만 제거하고 기존 `giftDate`는 수정 저장 때 그대로 전달해 과거 값을 지우지 않는다. 3→ 신규 완료 기준은 이미 검증되는 `rosterSync`로 바꾸되 과거 `giftDate` 레코드도 완료로 읽어 마이그레이션 없이 호환한다. 4→ 수정 가능한 업무 날짜 `registeredDate`를 감사 시각 `createdAt`과 분리하고, 누락된 기존 레코드는 한국 시간 기준 생성일을 화면 폴백으로 사용한다. 5→ 선택 옵션 순서·한국 자정 경계·표 열 순서·선물일 입력 부재·과거 완료 판정을 회귀 테스트로 고정한다.
- **판단 질문**: 화면에서 입력칸만 숨기지 않는다. 그렇게 하면 신규 레코드는 `giftDate`를 만들 방법이 없어 영구 처리 대기로 남는다. 기존 `giftDate`를 일괄 삭제하거나 `createdAt`을 수정 가능한 등록일로 재사용하지도 않는다. 전자는 운영 이력을 손상시키고, 후자는 생성 감사 시각의 의미를 잃는다.
- **재사용 규칙**: 운영 필드를 폐기할 때는 `전체 소비자 검색 → 새 업무 기준 지정 → 과거 값 읽기 호환·쓰기 보존 → 감사 시각과 수정 날짜 분리 → 상태·시간대·UI 계약 테스트` 순서로 처리한다.

### 연간 새친구 시트를 현재 출석부와 대조해 멱등 이관하기 (2026-08-30)
- **접근법**: 1→ `scripts/new-friend-sheet-migration.mjs`에서 시트 27열을 공개 `semesters/2026-sunday/newFriends`와 민감 `semestersPrivate/2026-sunday/newFriendsPrivate`로 나눈다. 2→ 기존 새친구는 이름과 생년·본인/보호자 연락처로 병합하고, 현재 출석부는 같은 이름 후보 중 식별값이 하나 이상 일치하며 충돌이 없는 유일 후보만 `rosterSync`로 연결한다. 3→ 부서·학년 미입력은 명시 반배정이나 유일한 표시 후보로만 보완하고 근거 부족 후보는 연결하지 않은 채 `[이관 확인]` 메모를 남긴다. 4→ 행 번호·이름·등록일 해시의 결정적 ID, 현재 원장 스냅샷, owned-path 검사, 루트 원자 PATCH, 경로별 재조회 검증, 재실행 0경로를 차례로 확인한다. 5→ RTDB 지역 URL은 `https://woori-high-default-rtdb.asia-southeast1.firebasedatabase.app`을 쓰고 빈 private 객체는 계획에서 제외한다.
- **판단 질문**: 이름만 같은 학생을 자동 등반 처리하거나 `classes/2026`에 새로 쓰지 않는다. 동명이인을 잘못 연결하면 출석·반배정 이력이 다른 학생에게 붙고, 학생 원장은 학생 앱 소유이기 때문이다. 시트의 보류·미등록이 현재 출석부의 강한 동일인과 충돌할 때는 현재 등록 상태를 쓰되 원본 상태를 메모로 보존한다.
- **재사용 규칙**: 외부 연간 원장을 운영 DB로 옮길 때는 `전체 열 분류 → 기존 레코드 강한 병합 → 현재 원장 강한 동일인만 연결 → 결정적 ID dry-run → 직전 스냅샷 → 소유 경로 원자 update → 경로별 재검증 → 재실행 0건`을 완료해야 한다.

### 협업형 운영 편집기는 저장 경계와 파생 지표의 단일 원천을 함께 감사하기 (2026-08-30, 2026-09-01 보강)
- **접근법**: 1→ `src/app/retreat/[id]/programs/ProgramEditor.tsx`와 `ProgramSections.tsx`를 대조해 본문 명시 저장과 하위 행 즉시 저장 경계를 구분한다. 2→ 수동 저장 안내를 각 섹션에 반복하지 않고 변경 중에만 작은 화면에서도 보이는 상단 sticky 도크를 노출하며, `ProgramAutosaveField`는 행 저장 상태를 입력 가까이 표시한다. 3→ `src/lib/programPreparation.ts`의 각 준비 기준이 `section`뿐 아니라 실제 DOM `targetId`를 반환하게 하고, 클릭하면 관련 details를 펼친 뒤 정확한 미완료 입력으로 스크롤·포커스한다. 4→ 게임 카드의 자유 입력 `materials`·`staffRoles`와 구조화된 `items`·`roles`처럼 같은 업무 사실을 두 번 받는 입력을 찾는다. 5→ `ProgramRunOfShow.tsx`에서 진행 블록 순서·시간·장소·담당을 훑고 위·아래 이동은 `src/lib/db/programs.ts`의 root multi-path update로 각 `order` 필드만 바꾼다. 6→ 현장 공유를 상태 셀렉트에서 분리하고 준비율 100%·명시적 확인 뒤에만 `status=published`를 저장하며, 준비 미리보기와 이가드는 공용 `PublishedProgramCard`를 사용한다. 7→ RTDB 로컬 구독 이벤트가 update Promise보다 먼저 올 수 있으므로 자기 저장 시작 시 dirty를 내리고 실패 때만 복구해 원격 충돌 오인을 막는다. 8→ uncontrolled `defaultValue`·모바일 표·작은 높이 저장·다크모드 미리보기를 계약 테스트와 1280px·390px 비파괴 QA로 고정한다.
- **판단 질문**: 색·간격만 먼저 다듬거나 모든 입력을 하나의 큰 저장 버튼에 묶지 않는다. 전자는 이중 원천과 원격 덮어쓰기를 감추고, 후자는 여러 사람이 다른 행을 편집할 때 전체 맵 충돌을 되살린다. 준비 항목이 탭만 열고 사용자가 다시 찾아다니게 하지 않으며, 현장 미리보기용 별도 마크업·복사 노드도 만들지 않는다. 순서 변경을 위해 `posts` 전체를 덮어쓰면 동시에 수정한 블록 내용을 지울 수 있다. 준비율도 이름만 있는 게임·담당자 없는 역할·수량 없는 물품만으로 100%가 되게 세지 않는다.
- **재사용 규칙**: 실시간 협업 편집기 감사에서는 `입력 표면 전수 목록 → 저장 단위를 시각·상태로 분리 → 미완료 행동을 정확한 입력 ID로 연결 → 순서 변경은 order 필드만 원자 update → 표시 컴포넌트 공용화 → 자기 저장과 원격 구독 구분 → 모바일 작은 높이·양 테마·복구 QA → 파생 지표 완결성` 순서로 확인한다.

### 고정 유형 대신 운영 방식과 참가 단위를 분리해 가변 프로그램을 모델링하기 (2026-08-31)
- **접근법**: 1→ `src/lib/types.ts`의 기존 `RetreatProgramPost`를 새 컬렉션으로 교체하지 않고 순서형 진행 블록으로 해석해 `operationMode`와 `participationMode` 선택 필드를 추가한다. 2→ 여러 기본 조를 묶는 연합팀은 `retreats/{id}/programs/{programId}/competitionTeams`에만 저장하고 `groups`는 읽기 참조로 유지한다. 3→ `src/lib/programPreparation.ts`에서 기본 조를 쪼개지 않는 인원수 기반 균등 배치를 순수 함수로 계산한다. 4→ `ProgramCompetitionTeamsSection.tsx`는 자동 배치 결과를 미리보기 상태로 먼저 보여 주고 사용자가 적용할 때만 프로그램 하위 경로를 원자 update한다. 5→ 현장 공유 화면은 같은 프로그램 원본에서 블록 순서·운영 방식·연합팀과 기본 조 이름을 읽어 보여 주며, 구버전 블록은 안전한 기본 운영 방식으로 계속 읽는다. 6→ DB 경로 계약 테스트, 균등 배치 테스트, 1280px·390px 렌더, 전체 테스트·타입·린트·빌드로 확인한다.
- **판단 질문**: 프로그램 전체를 `MC형/코스형/조별형` 중 하나로 고정하거나 수련회 기본 `groups`를 연합팀으로 덮어쓰지 않는다. 한 프로그램 안에서도 진행 방식이 섞이고 수련회마다 참가 구성이 달라 전자는 불필요한 필드를 강제하며, 후자는 숙소·인원체크·이가드의 참조를 깨뜨린다. 자동 균등 배치도 계산 즉시 저장하지 않는다. 대량 재배치는 사람이 팀 맥락을 확인한 뒤 적용해야 한다.
- **재사용 규칙**: 운영 시나리오가 매번 달라지는 기능은 `기존 반복 단위를 순서형 블록으로 재해석 → 행동 방식과 참가 구조를 직교 축으로 분리 → 기준 원장은 참조만 하고 기능 전용 매핑 저장 → 대량 자동화는 미리보기 후 원자 적용 → 레거시 기본값과 현장 읽기 호환 테스트` 순서로 구현한다.

### 사후 문서형 화면을 실시간 준비 작업 공간으로 바꾸기 (2026-09-02)
- **접근법**: 1→ `src/app/retreat/[id]/programs/ProgramList.tsx`에서 프로그램 수·문서 완성률 대신 기한 지남·막힘·담당 없음과 모든 프로그램의 다음 작업을 먼저 파생한다. 2→ `src/lib/programPreparation.ts`에서 기존 `done` boolean을 읽는 `programTaskStatus`와 `todo/doing/blocked/done` 기반 `programTaskProgress`를 만들고, 문서·현장 점검률과 실행 작업률을 분리한다. 3→ 새 프로그램은 `createProgramFromTemplate`이 기존 `posts` 안에 운영 방식별 시작 블록만 만들게 해 이후 혼합 구성을 제한하지 않는다. 4→ `ProgramTaskBoard.tsx`를 상세 첫 화면에 두고 담당·기한·관련 블록·막힌 이유를 행 단위 저장한다. 5→ 회의 원문은 공개 `retreats`가 아니라 `retreatsPrivate/{retreatId}/programMeetings/{programId}/{meetingId}/decisions/{decisionId}`에 두고 편집 권한자만 별도 구독하며, 공개 캐시에는 넣지 않는다. `convertRetreatProgramDecisionToTask`는 결정적 작업 ID와 최신값 사전 확인 뒤 public 작업·private 링크를 root multi-location update로 함께 반영한다. 6→ `ProgramRunOfShow.tsx`에서 블록별 `testStatus`·`blocker`를 역할·물품과 함께 보여 준다. 7→ `withoutTasks`와 `updateRetreatProgram`에서 `tasks`뿐 아니라 `meetings`·`posts`·`items`·`roles`·`competitionTeams`를 본문 payload에서 제외하고 구버전 레코드 fixture·경로 계약·전체 빌드로 호환을 검증한다.
- **판단 질문**: 별도 칸반 앱이나 준비 현황 집계 노드를 만들지 않는다. 원본과 상태가 갈라지고 Rules까지 늘어난다. 문서 준비율 하나로 작업 진행을 대신하지도 않는다. 규칙을 다 썼어도 담당·기한이 없으면 실행되지 않으며, 반대로 작업이 끝나도 현장 공유에 필요한 입력은 별도 확인해야 한다. 기존 자유 입력 회의록과 새 구조를 동시에 새 입력으로 노출하지 않고, 값이 있는 과거 기록만 이관용 상세 문서로 남긴다. 프로그램 본문을 `set`하거나 하위 맵을 포함한 `update`로 저장하지 않는다. 실시간 협업 중 다른 사람의 행 추가를 통째로 지울 수 있다.
- **재사용 규칙**: 사후 정리 화면을 준비 도구로 바꿀 때는 `다가오는 행동을 목록 첫 화면으로 → 실행 상태와 산출물 점검을 별도 파생 → 기존 반복 구조를 채우는 선택형 템플릿 → 담당·기한·막힘을 원본 가까이에 → 회의 결정은 원자적으로 작업 연결 → 하위 컬렉션을 본문 저장에서 완전 제외 → 레거시 읽기 호환과 전체 회귀 테스트` 순서를 따른다.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
