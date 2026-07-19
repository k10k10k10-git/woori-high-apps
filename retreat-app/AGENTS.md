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
- `teachers.gender` is the explicit source for IGuard gender-separated buses. Never infer a teacher's gender from the gender of their assigned class; leave it unset until an admin selects it.
- Cancellation refund/account data stays private, while `cellColors/{studentKey}=red` is the non-sensitive marker consumed by IGuard. Save, edit, and delete both sides atomically; never expose the cancellation record itself.

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

### 파송 조장 성별 누락과 큰순 그리디가 4명 조를 남긴 문제 (2026-07-13)

- **접근법**: 1→ 운영 `autoAssignConfig`·참가자·교사 데이터를 읽기 전용으로 요약하고 동일 입력을 `runAutoAssign()`에 반복 주입해 수정 전 100회 중 99회 최소 4명을 재현한다. 2→ 파송 조장이 `total`에는 들어가지만 `maleClasses/femaleClasses`에는 빠져 실제 혼성 조를 단일 성별로 오판하는지 분리 확인한다. 3→ `gData`에 반 개수와 성별 인원 존재를 별도 필드로 두고 파송 성별은 혼성/동성에 포함하되, 혼성 조에서는 파송 조장 본인 외 같은 성별 반이 최소 하나 있도록 최종 하드 판정과 그리디 유도를 함께 둔다. 4→ `improveGroupsByWholeUnitMoves()`로 상위 그리디 후보의 비고정 반 묶음을 한 조씩 이동하며 `scoreGroups()`가 개선될 때만 채택한다. 5→ 최대 인원·빈 조·파송 본인 반·동성 동료 유지·조장 고정/붙임 불변식을 이동 전 차단하고 운영 입력 10회에서 최소 8명·최대 12명과 파송 조장 외 동성 반 포함을 확인한다.
- **판단 질문**: 반복 횟수만 늘리거나 반을 학생 단위로 쪼개지 않는다. 전자는 같은 큰순 그리디 함정을 반복해 4명 조가 거의 고정되고, 후자는 “같은 반은 같은 조” 불변식을 깨뜨린다. 파송 조장 한 명만으로 혼성을 충족했다고 보지도 않는다. 그러면 `남자 조장 1명 + 여자 11명` 같은 가혹한 구성이 하드 규칙을 통과한다. 모든 하드 위반을 점수 하나로만 교환하게 두면 최대12명이나 동성 동료 규칙을 새로 깰 수 있어 이동 전 직접 차단한다.
- **재사용 규칙**: 역할 인원이 구조 단위에서 빠질 때 인원수·성별 존재·구조 개수를 별도 상태로 모델링하고, 혼성 역할자는 혼자만 해당 성별이 되지 않도록 동성 동료 조건을 별도로 판정하며, 반 단위 그리디 편차는 고정/결합 단위를 보존하는 제한적 국소 이동으로 후처리한다.

### 조편성 공유 PDF를 부서별 한 장으로 만들기 (2026-07-13)

- **접근법**: 1→ `GroupsTab.tsx` 출력을 부서 단위로 필터링한다. 2→ 각 조를 하나의 좁은 세로 열로 바꾸고 교사→조장→학생을 빈 행 없이 배치하며, 학년·반은 `3-6`처럼 축약하고 번호·성별 열을 제거한다. 3→ 한 부서의 모든 조를 `repeat(groupCount, 1fr)` 그리드로 가로 배치하고 PDF는 `420mm × 115mm` 가로 스트립, JPG는 1600px 가로 출력으로 만든다. 4→ `retreat-app/tmp/pdfs/`에 11조·조당 14행 목업을 만들고 headless Chrome로 PDF 출력 후 `pdfinfo`와 PNG 렌더로 한 페이지·잘림·겹침·하단 여백을 확인한다.
- **판단 질문**: 큰 카드를 2열×6행으로 쌓지 않는다. 한 부서를 한눈에 비교하기 어렵고 카드의 `flex: 1`이 표 아래 불필요한 여백을 만들기 때문이다. A3 표준 높이도 사용하지 않는다. 최대 행이 15행 내외인 실제 데이터에 비해 페이지 하단이 큰 빈 공간으로 남으므로 실제 필요 높이에 5mm 여유만 더한 115mm를 사용한다.
- **재사용 규칙**: “한 이미지에 한 구역”을 표 형태로 공유할 때는 각 항목을 세로 열로 바꾸고 구역 전체를 가로로 나열하며, 페이지 높이는 표준 용지가 아니라 `최대 행 수 × 행 높이 + 헤더/푸터 + 여유`로 계산한 뒤 실제 PDF 렌더로 확인한다.

### 한 부서만 자동 재편성하면서 다른 부서의 수동 편집을 보존하기 (2026-07-14)

- **접근법**: 1→ `AutoAssignScope = "all" | "1부" | "2부"`를 실행 범위로 분리한다. 2→ `runAutoAssign()`은 선택한 부서만 생성하고 `ensureEvenScopedGroupCount()`가 현재 반대 부서 조 수를 고정한 채 합산 짝수를 맞춘다. 3→ `mergeAutoAssignedGroups()`가 새 결과의 선택 부서와 현재 상태의 반대 부서를 합쳐 교사·조장·GBS·학생 수동 편집을 보존한다. 4→ 미리보기의 교체 경고와 적용 버튼에 범위를 명시하고 `autoAssign.test.ts`에서 1부/2부 생성 범위와 반대 부서 객체 보존을 검증한다.
- **판단 질문**: 두 부서를 모두 다시 계산한 뒤 한쪽 결과만 버리거나, 부분 결과를 그대로 `setGroups()` 하지 않는다. 전자는 선택하지 않은 부서 설정의 오류가 실행을 막고 불필요한 계산을 하며, 후자는 반대 부서의 기존 조 전체를 미배정 상태로 날리기 때문이다. 실행 범위는 일회성 동작이므로 `autoAssignConfig`에 영속하지 않는다.
- **재사용 규칙**: 전체 컬렉션 중 한 구획만 재생성하는 기능은 `생성 범위 제한 → 현재 반대 구획과 순수 병합 → 전체 저장` 순서로 구현하고, 전역 불변식은 보존되는 현재 구획의 실제 값까지 포함해 계산한다.

### 인쇄물에서 성별 색상과 참석 상태를 동시에 보존하기 (2026-07-14)

- **접근법**: 1→ `GroupsTab.tsx`의 PDF/JPG 공용 `buildGroupsHtml()`에서 역할행과 학생행을 분리한다. 2→ `groupPrint.ts`가 교사는 같은 부서의 참석 상태를 우선 찾아 `부분참/불참`만 이름과 분리하고, 학생은 참가자 성별을 우선하되 없으면 홀수반=남·짝수반=여로 보강한다. 3→ 조장은 `r-leader` 노랑을 최우선으로 유지하고 일반 학생은 `r-male` 파랑·`r-female` 분홍, 취소자는 기존 `r-red`를 유지한다. 4→ 좁은 조 열에서는 교사 이름과 상태를 같은 가로줄에 경쟁시키지 않고 기존 20px 행 안에서 `.teacher-name` 위, `.teacher-status` 아래로 세로 배치한다. 5→ `groupPrint.test.ts`로 동명이인 교사·상태 라벨·성별 폴백·취소 우선순위를 고정한다.
- **판단 질문**: 기존 `cellColors`를 학생 배경색으로 그대로 쓰지 않는다. `orange` 부분참과 `blue` 현장 추가가 성별을 가려 인쇄물에서 남녀 구분이 불가능해지므로, 부분참은 텍스트 배지로 남기고 배경은 성별에 맡긴다. 취소는 운영 의미가 더 강하므로 빨강과 취소선을 유지한다. 교사 이름과 상태를 접미사나 가로 flex로 두지 않는다. 전자는 상태가, 후자는 이름이 말줄임표로 가려져 실제 출력에서 한쪽 의미가 사라지기 때문이다. 행 높이를 키우는 방식도 한 장 출력 높이에 영향을 주므로 피한다.
- **재사용 규칙**: 하나의 좁은 인쇄 셀에 가변 길이 이름과 반드시 보여야 하는 상태가 함께 있고 가로 공간이 부족하면, 같은 행 높이 안에서 이름과 상태를 세로 배치하고 각각 독립된 줄임 규칙을 준다. 역할·성별·운영 상태가 함께 있으면 배경색 우선순위(역할→치명 상태→성별)를 먼저 정하고 PDF와 JPG가 같은 HTML 빌더를 공유하게 한다.

### 이름만 저장된 조 역할에서 다른 부서 동명이인의 반을 표시한 문제 (2026-07-15)

- **접근법**: 1→ 2부 조장 이준영이 `2-9`로 표시되지만 해당 조에는 2부 `2학년 3반`이 있는 재현 화면을 기준으로 `GroupCard`의 `Object.fromEntries(name → id)`를 추적한다. 2→ `groupRoleStudent.ts`에서 같은 이름 후보를 모아 현재 `group.studentIds` 소속 → 현재 `group.bu` → 전역 유일 이름 순으로만 확정한다. 3→ `GroupComponents.tsx`의 조장/스탭 제거와 표시뿐 아니라 `GroupsTab.tsx`의 XLSX·PDF·JPG 역할 행도 같은 함수를 사용한다. 4→ 1부 `2-9`·2부 `2-3` 동명이인과 같은 부서 내 모호성 회귀 테스트를 고정한다.
- **판단 질문**: 전역 이름 맵에서 마지막 학생을 고르거나 화면에만 `2부` 필터를 덧붙이지 않는다. 이름 키는 부서 간 충돌하고, 화면만 고치면 내보내기에는 잘못된 반이 계속 남는다. 같은 부서에도 동명이인이 여러 명이고 조 소속 ID 단서가 없으면 임의 선택하지 않고 반 표시를 생략한다.
- **재사용 규칙**: 데이터가 역할 이름만 보존하더라도 표시·삭제 시에는 `소유 컨테이너의 ID 목록 → 컨테이너 구획 → 전역 유일값` 순으로 복원하고, 복원 함수를 모든 출력 경로가 공유하게 한다.

### 교사 메모 삭제가 stripUndefined 뒤 기존 DB 값으로 복구된 문제 (2026-07-15)

- **접근법**: 1→ `TeachersTab.handleSave()`의 부분참→전참 payload가 `arrivalInfo/transport`를 `undefined`로 만드는지 확인한다. 2→ `db/core.ts`의 `stripUndefined()`가 해당 키를 업데이트에서 제거해 Firebase의 이전 값이 남는 흐름을 추적한다. 3→ `teacherWrite.ts`의 `prepareTeacherUpdate()`가 수정 폼에 명시적으로 포함된 빈 `note/arrivalInfo/transport` 등만 `null`로 바꿔 RTDB 삭제로 전달한다. 4→ 키가 아예 없는 출석부 원본 부분 업데이트는 보존하고, 빈 값 삭제·누락 키 보존·유효값 유지 테스트를 고정한다.
- **판단 질문**: `stripUndefined()` 자체를 null 변환으로 바꾸거나 모든 누락 필드를 일괄 삭제하지 않는다. 전자는 저장소 전체 의미를 바꾸고, 후자는 교사 불러오기가 이름·부·반만 갱신할 때 수련회별 참석 정보까지 지운다. 빈 문자열을 남겨 삭제처럼 보이게 하지 않고 DB 노드 자체를 `null`로 제거한다.
- **재사용 규칙**: Firebase 부분 업데이트에서 `undefined`는 “삭제”가 아니라 “요청에서 제외”다. 폼이 비운 필드는 명시적 `null`, 호출자가 보내지 않은 필드는 보존으로 구분하는 도메인별 변환 함수를 둔다.

### 고정처럼 보이던 배정 구조를 실제 선택 규칙으로 전환 (2026-07-18)

- **접근법**: 1→ `src/lib/autoAssignConfig.ts`의 `RuleFlags`·기본값·구버전 정규화를 같이 늘린다. 2→ `AutoAssignPanel.tsx`의 조 수 사전계산과 `autoAssignUtils.ts`의 배정·점수·후처리를 각 플래그로 실제 분기한다. 3→ 반을 학생 단위로 나눌 때 원래 `classKey`와 학생별 성별을 보존한다. 4→ `autoAssign.test.ts`와 `autoAssignConfig.test.ts`로 구버전 기본값·명시적 `false`·규칙 조합을 고정한다.
- **판단 질문**: 체크박스 UI만 노출하거나 학생 단위 변환 시 반 식별자를 버리지 않는다. 전자는 끈 규칙이 결과에 남아 UI가 거짓말하고, 후자는 반 관계·담임·파송 제외 판정을 깨뜨린다.
- **재사용 규칙**: 자동배정 규칙을 선택형으로 바꿀 때는 UI, 저장 정규화, 사전계산, 핵심 배정, 최종 점수, 후처리, 구버전 테스트를 한 변경 묶음으로 다룬다.

### 부분참 유형 추가 후 저장됐지만 다시 사라져 보인 문제 (2026-07-19)
- **접근법**: 1→ `PartialAttendanceTab.tsx`의 저장 payload에 `type/day`가 들어가는지 확인한다. 2→ 학생 한 명 저장 뒤 공통 읽기 계층 `src/lib/db/retreatOps.ts`의 목록 조회·실시간 구독·단건 조회 필터를 모두 추적한다. 3→ 세 경로가 공유하는 `isPartialAttendanceType()`을 `src/lib/partialAttendanceType.ts`에 두고 `선복귀·후발대·당일참석`을 한 목록으로 관리한다. 4→ 새 유형과 알 수 없는 값의 허용 여부를 단위 테스트로 고정한다.
- **판단 질문**: 저장 함수를 다시 쓰거나 운영 DB를 직접 보정하지 않는다. 쓰기는 성공했지만 구버전 읽기 필터가 새 유형을 폐기한 문제이므로, DB 보정은 이미 저장된 올바른 레코드를 오히려 훼손할 수 있다. 화면 한 곳만 고치지도 않는다. 실시간 구독·단건 조회 소비자는 계속 당일참석을 놓치기 때문이다.
- **재사용 규칙**: enum 성격의 DB 값을 추가할 때는 타입·Rules·쓰기뿐 아니라 목록 조회, 실시간 구독, 단건 조회, 정렬/집계와 모든 소비 앱의 허용 필터를 함께 검색하고 하나의 공유 허용 목록으로 회귀 테스트한다.

### 당일참석을 한쪽 식사 경계로 표현해 다른 날짜 식수가 남은 문제 (2026-07-19)
- **접근법**: 1→ `MealCountTab.tsx`의 개인 조정이 `첫 식사 이후` 또는 `마지막 식사 이전` 한쪽 경계만 표현하는지 확인한다. 2→ `mealCountPeople.ts`에서 수련회 기간의 가장 이른 시작일에 일차를 더해 실제 날짜를 계산한다. 3→ 당일참석 학생은 저장된 개인 경계 설정과 분리해 지정 날짜의 끼니에만 포함하고 나머지 날짜 끼니에서 자동 차감한다. 4→ 1~3일차 날짜 매핑과 2일차 앞뒤 끼니 제외를 단위 테스트로 고정한다.
- **판단 질문**: 2일차 당일참석을 후발대나 선복귀 중 하나로 치환하지 않는다. 한쪽 경계만 적용하면 수련회 전반부 또는 후반부 식사에 계속 남는다. 날짜별 인원 계산이 없는 조편성·방배정·현장등록까지 일괄 변경하지도 않는다.
- **재사용 규칙**: 특정 날짜에만 유효한 참석 상태는 도착·복귀 한쪽 경계로 근사하지 말고 `일차 → 실제 날짜 → 해당 날짜 슬롯만 포함`으로 계산하며, 날짜별 소비 화면에만 적용한다.

### 여러 하드 제약을 지키는 방배정을 적용 전 미리보기로 최적화하기 (2026-07-19, 보강)
- **접근법**: 1→ `Room`의 동·정원·성별을 변경하지 않는 빈 방 셸로 복제한다. 2→ `roomAutoAssign.ts`에서 교역자·음향·의료 전용 방을 먼저 예약하고, 학생을 `부-학년-반-성별` 묶음으로 만들어 같은 반이 쓰는 방을 단일 `동|정원` 프로필에서만 고른다. 3→ 반 방 수는 `학생+담당 교사` 합계로 계산하고 교사를 먼저 넣되 방마다 학생 한 자리를 남긴 뒤, 사용한 모든 방에 자기 반 학생을 최소 한 명씩 배치한다. 일반 스탭만 남은 침상에 채우고 미배정 담당 교사는 성인 방이나 다른 반 방으로 우회시키지 않는다. 4→ 미배정·정원 초과·성별 누락·담당 반 불일치·반 프로필 혼용은 하드 오류로 적용을 막고, 30개 시드 결과 중 빈 침상·사용 방 수가 가장 적은 유효안을 선택한다. 5→ `RoomAutoAssignPreviewModal.tsx`에서 결과를 검토한 뒤에만 기존 `saveRooms()` 백업 저장 경로로 적용한다.
- **판단 질문**: 학생을 먼저 정원까지 채운 뒤 담당 교사를 남는 방에 넣지 않는다. 학생 수가 정원의 배수이면 교사가 학생 없는 추가 방에 홀로 남을 수 있기 때문이다. 담당 교사를 일반 성인처럼 다른 반 방이나 스탭 방에 우회 배정하지도 않는다. 사람을 한 명씩 가장 빈 방에 넣거나 모든 조건을 가중치 점수로만 교환하면 같은 반·동일 건물/정원·특수인원 전용 방을 깨거나 낮은 점수와 맞바꿔 미배정을 허용할 수 있다. 교사 성별이나 외부인원 성별은 이름·담당 반으로 추측하지 않고, 함께 잘 수 없는 성별 조합은 미리보기에서 차단한다.
- **재사용 규칙**: 역할자가 반드시 자기 구조 단위 구성원과 함께 있어야 하면 `전체 정원 계산에 역할자 포함 → 역할자 방마다 구성원 자리 예약 → 각 방에 구성원 최소 1명 선배치 → 최종 소속 검증` 순으로 구현하고, 불가능한 조합은 우회 배정하지 말고 하드 오류로 노출한다.

## Commands

```bash
npm test
npx tsc --noEmit
npm run build
```

Production deploy is `npx vercel --prod --yes`, but only do this when explicitly requested. `retreat-app` Git auto-deploy has been unreliable, so verify deployment status with Vercel after pushes.
