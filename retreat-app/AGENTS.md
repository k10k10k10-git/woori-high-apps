# retreat-app Agent Guide

Retreat admin site for participant intake, grouping, rooms, teachers, supplies, payments, medical logs, and preparation workflows.

Read `CLAUDE.md`, `../DB_OWNERSHIP.md`, and `../OPERATIONS.md` before significant changes.

## Stack

- Next.js App Router, React 19, TypeScript strict mode, Tailwind CSS 4
- Firebase Realtime Database and Firebase Auth
- Tests: Vitest
- Deploy: Vercel

## Database Boundaries

This app owns retreat admin data:

- `retreats/{id}/participants`
- `retreats/{id}/groups`
- `retreats/{id}/rooms`
- `retreats/{id}/teachers`
- `retreats/{id}/carpools`, `supplies`, `snacks`, `cellColors`, `partialAttendances`, `onSiteReg`, `mealCount`, etc.
- `retreatsPrivate/{id}/cancellations`
- `retreatsPrivate/{id}/unmatchedPayments`
- `retreatsPrivate/{id}/medicalLogs`
- `retreatsPrivate/{id}/teacherIdNumbers`
- `retreatAdmins`, `retreatPending`

It reads student-app data such as `classes/{year}` and `attendance/{year}`. Do not change those shapes without checking the student app and `DB_OWNERSHIP.md`.

The app may read `retreats/{id}/iguard/groupStaff` for display, but IGuard owns that path.

## Required Patterns

- Use `src/lib/db.ts` as the Firebase access layer. Do not import `db`, `ref`, `get`, or `set` directly inside components.
- Use `src/lib/paths.ts` for database paths.
- Use `snapToList<T>()` instead of open-coded `Object.entries(snap.val()).map(...)`.
- Do not use `saveParticipants()` to update one field. Use path-specific updates such as `updateParticipantExtra()`.
- Preserve participant `extra` during sheet sync/rematching.
- Keep `groups` and `rooms` full overwrites protected by the existing rolling backup/restore pattern.
- Escape user-provided data in generated HTML with `escapeHtml()` before `printAsPDF`, `exportAsJPG`, `rowsToHtmlTable`, or `document.write`.
- Sensitive information must stay in `retreatsPrivate/{id}`.

## UI/Architecture Notes

- Important keep-alive tabs in `RetreatPageClient.tsx`: participants, groups, rooms, roster.
- `RetreatDataContext.tsx` exists but is currently unused.
- `periods` are stored per retreat, but home/prep calendar views merge periods across all retreats. Update/delete with `period.retreatId`, not the currently selected retreat id.
- Accessibility patterns: tablist/tab/tabpanel roles, dialog `aria-modal`, icon button `aria-label`.

### 백업 스로틀이 있는 노드의 전체 삭제 (2026-07-13)

- **접근법**: 조/방 전체 삭제는 미저장 편집을 먼저 `saveGroups()`/`saveRooms()`로 저장하고, `clearGroups()`/`clearRooms()`가 `minIntervalMs=0` 강제 백업 성공을 확인한 뒤 각 소유 노드만 삭제한다.
- **판단 질문**: 일반 자동저장의 10분 백업 스로틀을 그대로 쓰거나 `rooms`·`iguard/groupStaff`를 함께 삭제하지 않는다. 전자는 삭제 직전 상태를 놓칠 수 있고, 후자는 요청 범위와 앱 소유권을 침범하기 때문이다.
- **재사용 규칙**: 전체 삭제처럼 되돌리기 어려운 동작은 백업 함수의 성공 여부를 확인해 실패 시 쓰기를 중단하고, 확인창에 유지되는 연관 데이터와 끊길 참조를 명시한다.

### 부 접두형 학생 키를 raw id로 오인해 수동 매칭 학생이 누락된 문제 (2026-07-13)

- **접근법**: 1→ 시트 연동의 `수동 1`을 `ParticipantsTab.tsx` 집계 코드로 정의한다. 2→ `src/lib/db/students.ts`의 `getStudentsByYear()` 반환 형태를 확인해 `Record` 키와 `Student.id`가 둘 다 `"${buNum}_${rawId}"`임을 고정한다. 3→ `partialPool.ts`를 `students[studentKey]`로 조회하고 `studentMatcher.ts`는 `findStudent()`가 반환한 `s.id`를 그대로 반환한다. 4→ `studentId=null + 2_rid9 주황` 운영 조합을 `partialPool.test.ts`로 재현한다.
- **판단 질문**: `cellColors` 키에서 접두를 떼 `students[rawId]`로 조회하지 않는다. 테스트 fixture가 raw id 키를 쓰면 실제 데이터에서만 실패하는 구현을 잘못 통과시키기 때문이다.
- **재사용 규칙**: `getStudentsByYear()`를 쓰는 로직·테스트에서는 항상 `{ "2_rid9": { id: "2_rid9", ... } }` 형태를 유지하고, 셀색상·부분참 키 해석은 `resolveStudentKey()`만 사용한다.

### 본인 반 없이 파송되는 학생 조장 모델링 (2026-07-13)

- **접근법**: 1→ `AutoAssignConfigPanel.tsx`의 `중복`이 인물 중복이 아니라 앞 조장과 같은 반을 선택한 경고인지 확인한다. 2→ `autoAssignUtils.ts` Phase 0의 `assignedKeys`가 두 번째 같은 반 고정을 건너뛰면서 조장 이름과 학생 소속을 갈라놓는지 추적한다. 3→ 조장 입력에 기본 `본인반 동반`과 예외 `파송(본인반 없이)` 모드를 명시하고, 파송 조장의 `studentId`만 반 단위에서 분리해 조장 역할로만 목표 조에 둔다.
- **판단 질문**: 같은 반 두 번째 조장의 `pinnedUnitKey`만 null로 만들지 않는다. 그러면 조장 이름은 새 조에 있지만 본인 학생 레코드는 원래 반 조에 남아 두 조에 동시에 보이는 역할 중복이 생기기 때문이다. 반 전체 쪼개기를 허용하거나 이름만으로 학생을 제거하는 방식도 기존 불변식과 동명이인 안전성을 깨므로 사용하지 않는다.
- **재사용 규칙**: 조장 예외는 `LeaderEntry`에 `studentId`와 `mode: "withClass" | "sent"`로 표현하고, `sent`만 해당 학생 한 명을 ClassUnit에서 제외하며 같은 반 중복 검사는 `withClass`끼리만 하드 오류로 판정한다.

### 부별 상한을 지키며 합산 조 수를 짝수로 보정하기 (2026-07-13)

- **접근법**: 1→ `AutoAssignPanel.tsx`에서 1·2부 조 수가 독립 계산돼 합계 홀짝 검사가 없는지 확인한다. 2→ `autoAssignUtils.ts`에 부별 현재 조 수·상한·학생 수만 받는 `ensureEvenCombinedGroupCounts()`를 만든다. 3→ 합계가 홀수면 `학생 수÷조 수`가 더 큰 부서를 1조 늘리고, 양쪽이 상한이면 평균이 더 작은 부서를 1조 줄인다. 4→ 조당 최대 인원 입력은 `calculateEvenGroupCountsForMaxSize()`에서 원 조 수 계산과 짝수 보정을 한 번에 끝내고 그 값을 즉시 state에 저장한다. 5→ UI 실행부와 `runAutoAssign()`에도 같은 방어선을 두고 `autoAssign.test.ts`에 실제 `123명·111명·최대12명 → 12조·10조` 재현값을 고정한다.
- **판단 질문**: 2부를 무조건 늘리거나 홀수일 때 실행만 막지 않는다. 전자는 부별 인원 불균형과 조 수 상한을 무시하고, 후자는 조당 최대 인원 자동 계산의 결과를 사용자가 다시 수동 수정하게 만들기 때문이다. 점수 페널티로도 처리하지 않는다. 조 수는 배정 전 구조 입력이라 결과 점수로는 빈 조나 홀수 생성 자체를 안정적으로 막을 수 없다.
- **재사용 규칙**: 여러 구획의 개수 합계를 강제할 때는 배정 결과만 사후 수정하지 말고, 화면 자동 계산 단계에서 정규화한 값을 즉시 state와 표시 문구에 함께 저장하며 실행 직전·핵심 함수 내부에도 동일 방어선을 둔다. 운영 QA는 기본값뿐 아니라 규칙을 실제로 발동시키는 입력값으로 확인한다.

### 파송 조장만 있는 조를 실제 반이 배정된 조로 오인한 문제 (2026-07-13)

- **접근법**: 1→ 미리보기의 `조장 1명 + 배정 없음`을 파송 조장 전용 상태로 분류한다. 2→ `autoAssignUtils.ts`의 `tryAssign()`에서 파송 조장이 `gData.total`은 1로 만들지만 `unitKeys`·남녀 반 수는 0인 비대칭을 추적한다. 3→ 혼성 첫 반 판정을 `total > 0`이 아니라 `unitKeys.length > 0`으로 바꾸고, 반 0개 조에 `EMPTY_GROUP_SPREAD_GUIDE`를 준다. 4→ `scoreGroups()`에서 반 0개를 하드 위반으로 판정하고, 조 수 상한을 원 반 수가 아닌 `buildAffinityBundles()` 결과 수까지 반영한다. 5→ `autoAssign.test.ts`에 파송+혼성 및 붙임 번들 상한 회귀를 고정한다.
- **판단 질문**: 파송 조장을 `total`에서 빼지 않는다. 그러면 최대 인원·인원 균형 계산에서 실제 학생 한 명이 누락된다. 혼성 하드 규칙을 약화하거나 파송 조장 본인 반 제외를 풀지도 않는다. 문제는 파송 학생의 존재가 아니라 “실제 반이 이미 배정됐는가”를 학생 수로 대신 판정한 데 있다.
- **재사용 규칙**: 역할 인원과 구조 단위가 분리되는 모델에서는 `studentIds/total`로 반·팀·방 존재를 추정하지 말고, 구조 전용 키 목록(`unitKeys`)을 기준으로 빈 상태·성별 구성·최소 단위 수를 판정한다.

### 자동 조편성 입력 설정을 수련회별로 저장하기 (2026-07-13)

- **접근법**: 1→ `AutoAssignPanel.tsx` state를 실행 결과(`groups`)와 다시 쓸 입력 설정으로 분류한다. 2→ 완료된 조 수·규칙·조장/파송·고려 관계만 `retreats/{id}/autoAssignConfig` 버전 문서로 만들고 `src/lib/paths.ts`와 `src/lib/db/autoAssignConfig.ts`를 통해 명시적 저장한다. 3→ `normalizeAutoAssignConfig()`로 누락 필드·구버전 조장 모드를 보정한 뒤 패널 진입 시 한 번 복원한다. 4→ `retreatId` 변경 시 state와 미완성 선택기를 먼저 초기화해 다른 수련회의 값이 섞이지 않게 한다. 5→ 정규화 회귀 테스트와 전체 테스트·타입 검사·프로덕션 빌드로 검증한다.
- **판단 질문**: `groups` 안에 설정을 섞거나 입력할 때마다 자동 저장하지 않는다. 전자는 이가드가 소비하는 결과 데이터의 형태와 소유 경계를 오염시키고, 후자는 미완성 선택기와 연속 입력까지 운영 DB에 과도하게 기록한다. 관계 목록에 추가되기 전의 임시 선택기도 저장하지 않는다.
- **재사용 규칙**: 관리 화면 설정은 결과 노드와 분리된 버전 문서로 저장하고, 완료된 state만 명시적 저장하며, 로드는 정규화한 뒤 대상 ID 전환 초기화와 함께 수행한다.

## Commands

```bash
npm test
npx tsc --noEmit
npm run build
```

Production deploy is `npx vercel --prod --yes`, but only do this when explicitly requested. `retreat-app` Git auto-deploy has been unreliable, so verify deployment status with Vercel after pushes.
