# iguard-app Agent Guide

Mobile-first on-site move-guide app for retreat execution: attendance checks, cue cards, post board, buses, meals, seating, staff movements, and validation.

Read `CLAUDE.md`, `../DB_OWNERSHIP.md`, and `../OPERATIONS.md` before significant changes.

## Stack

- Next.js App Router, React 19, TypeScript strict mode, Tailwind CSS 4
- Firebase Realtime Database and Firebase Auth
- Tests: Vitest
- Deploy: Vercel

## Database Boundaries

Read-only admin-owned paths:

- `retreats/{id}/participants`
- `retreats/{id}/teachers`
- `retreats/{id}/groups`
- `retreats/{id}/rooms`
- `retreats/{id}/partialAttendances`
- `retreats/{id}/cellColors`
- `retreats/{id}/periods`
- `classes/{year}`
- `admins`, `retreatAdmins`

Writable IGuard-owned/shared paths:

- `retreats/{id}/iguard/*`
- `iguardMembers`
- `iguardRoles`
- `iguardPending`
- `prepMilestones`

Do not write to admin-owned retreat data. Keep the read/write separation in `src/lib/db.ts`.

## Required Patterns

- Use `src/lib/db.ts` as the Firebase access layer. Do not import Firebase directly in components.
- Use `src/lib/paths.ts` for database paths.
- All live retreat subscriptions belong in `useRetreatData`; include an `onError` path so failed subscriptions do not leave infinite spinners. The sole exception is `iguard/accessLock`: it must be checked before `useRetreatData` mounts, and the home lock badge uses the same metadata subscription.
- Use `snapToList<T>()` instead of open-coded snapshot mapping.
- For attendance checks, preserve the current safety design:
  - tapping an unchecked person is idempotent check-in (`checked: true`)
  - unchecking requires confirmation
  - writes use `runTransaction`
  - clear/uncheck leaves `checked: false` tombstones instead of removing nodes
  - `by` records who checked/unchecked
- Keep `.info/connected` offline banner visible around field-use screens.
- Use existing helpers for 24:00+ overnight schedule calculations; do not reimplement simple hour comparisons.
- Do not reset user-selected schedule/post-board state from clock ticks.
- Escape user-provided data with `escapeHtml()` before generated print HTML.
- Bus 선탑/동승 parsing must go through `src/lib/busStaff.ts`. This strips trailing `sf`, removes obvious instruction fragments and count summaries such as `스탭 0명` from cue sheets, and keeps rejected fragments out of bus headcounts and checklist members while still surfacing warnings.
- Bus auto-assignment must not be trapped by staff-only imported bus rows. If existing buses are fewer than the minimum needed for all student+teacher passengers, create the missing bus rows and preserve existing bus staff fields by `busNo`.
- Bus gender separation uses `group + gender` cohorts, never individual scattering. Read gender from admin-owned `participants`, write only `iguard/buses.assignmentMode/segments`, fail closed on missing gender, and keep legacy buses in mixed group mode.
- Formal `당일참석(day)` students join group checklists only on that day; day 1/3 students also join the matching bus assignment and bus checklist. Day 2 has no bus assignment. Legacy note-only day visits remain excluded from buses because their structured day is unknown.

## Roles

`staff` users see execution views only. `team` and `admin` can access planning and info views.

### 행정 참석정보를 버스 인원에 반영하기 (2026-07-17)

- **접근법**: 1→ 운영 `teachers`와 `partialAttendances`를 읽기 전용으로 좁게 대조해 교사 자차는 `transport`, 구버전 학생 당일참여는 `note`, 정식 당일참석은 `type+day`에 저장됨을 확인한다. 2→ `subscribeToPartialAttendances()`가 객체형 `PartialAttendanceMap`으로 `type/day/note`를 보존한다. 3→ 현장 참석은 `isPresentOnDay()`, 버스 탑승은 `isStudentBusPassengerOnDay()`로 분리한다. 4→ 정식 당일참석은 지정한 1·3일차 버스에 포함하고, 일차를 확정할 수 없는 구버전 note만 제외한다. 5→ 화면과 인쇄가 공유하는 `ChecklistView.membersForGroup()` 앞단에서 취소 학생·불참 교사를 제거하고 `studentPartialLabel()`·`teacherChecklistMeta()`로 부분참 표기를 만든다. 6→ 혼합 조·성별 묶음·조별·호차별 체크가 같은 판정을 쓰는지 회귀 테스트로 고정한다.
- **판단 질문**: 조 이름 목록만 보고 세거나 모든 당일참석을 자차로 가정해 버스에서 빼지 않는다. 전자는 행정의 불참·자차를 무시하고, 후자는 지정 일차 호차를 타야 하는 학생을 누락한다. 반대로 구조화된 `day`가 없는 구버전 메모를 임의의 호차에 넣지도 않는다. 이름이 모호한 교사를 임의 제외하거나 학생 조장에게 교사 자차 필터를 적용하지 않는다. 화면 JSX와 인쇄 HTML에서 참석 필터를 각각 구현하지 않는다. 둘이 어긋나 운영 명단이 달라질 수 있기 때문이다.
- **재사용 규칙**: 조별 현장 인원은 `isPresentOnDay()`와 `roleNamesForChecklist(..., "group")`, 단체 버스 인원은 `isStudentBusPassengerOnDay()`와 `isTeacherBusPassenger()`로 판정한다. 부분참 라벨은 `src/lib/checklistMembers.ts`의 공통 헬퍼만 사용하고, 행정 부분참 구독에서는 `type/day/note`를 함께 보존한다.

### 버스 조별 성별 묶음 자동배정 (2026-07-17)

- **접근법**: `혼합`은 기존 조 단위를 그대로 `busAutoAssign.ts`에 넘긴다. `남녀 분리`는 `busGender.ts`에서 취소·부분참을 먼저 제외한 뒤 `조+남`, `조+여` 묶음을 만들고, 배정기가 한 호차에 단일 성별만 허용한다. 참가자 성별을 우선하고, 시트에 없는 수동 학생은 행정 조편성과 동일한 홀수반=남·짝수반=여 기준으로 보강한다. 교사는 행정 `teachers.gender` 명시값으로 같은 성별 묶음의 `teacherNames`에 넣는다. 결과는 `iguard/buses.segments`에 저장하고 호차별 체크리스트도 같은 묶음을 읽는다.
- **판단 질문**: 학생 개인을 무작위로 흩뜨리거나 성별 미확인 학생·교사를 조용히 제외하지 않는다. 교사 성별을 담당반 홀짝이나 조의 다수 학생 성별로 추론하지 않는다. 미확인 교사는 정확한 이름을 보여주고 자동배정을 중단한다. 구버전 `includeTeachers` 세그먼트는 계속 읽는다.
- **재사용 규칙**: 성별 키 정규화·묶음 생성은 `busGender.ts`, 정원 비례·예약석·단일 성별 호차 불변식은 `busAutoAssign.ts`만 사용한다.

### 수련회별 PIN 잠금 (2026-07-16)

- **접근법**: Google 로그인·팀원 승인을 유지하고, `retreats/{id}/iguard/accessLock`에 salt와 PBKDF2-SHA256 해시만 저장한다. 관리자는 우회하고, 일반 사용자는 PIN 통과 전 `IguardWorkspace`와 `useRetreatData`를 마운트하지 않는다.
- **판단 질문**: 홈 링크만 막고 직접 `/retreat/{id}` URL을 열면 들어갈 수 있지 않은가? PIN 변경 뒤 이전 탭의 해제가 계속 유효하지 않은가? 두 경우를 각각 라우트 경계와 해시 버전이 포함된 sessionStorage 키로 막는다.
- **재사용 규칙**: PIN 형식·해시·검증·세션 키는 `src/lib/accessLock.ts`만 사용한다. 이 기능은 승인 사용자 대상 앱 수준 잠금이며 현재 Firebase Rules의 계정별 데이터 ACL을 대체한다고 표현하지 않는다.

### 개인 큐카드 본인 자동 선택 (2026-07-13)

- **접근법**: `iguardMembers/{uid}.name`을 1순위, Google `displayName`을 2순위로 정규화해 행정 스탭 명단의 유일한 한 명과 연결하고, 해당 스탭을 별도 꼬리표 없이 드롭다운 맨 위에 표시한다.
- **판단 질문**: UID를 행정 `teachers`에 새로 저장하거나 이름이 같은 사람 중 하나를 임의 선택하지 않는다. 전자는 앱 소유권을 침범하고, 후자는 타인의 큐카드를 본인 것으로 보여줄 위험이 있기 때문이다.
- **재사용 규칙**: 계정-스탭 연결은 `src/lib/staffIdentity.ts`의 `findPreferredStaffId()`를 사용하고, 자동 선택 뒤 사용자 선택 보존은 `chooseCueCardStaffId()`로 판정한다.

### 큐싯 새벽 시각의 논리 일차 판정 (2026-07-13)

- **접근법**: 1→ `src/lib/cueSheet.ts`의 `resolveOvernight()`와 `parseCueSheetText()`를 확인한다. 2→ 운영 화면에서 누락된 블록이 다른 일차로 이동했는지 찾는다. 3→ 원본의 일차 구분행과 앞 블록 순서를 대조해, 새벽 시각이 전날 섹션의 연장인지 해당 섹션 마지막 일정인지 판정한다.
- **판단 질문**: `00:30~03:00`이라는 시각만 보고 무조건 `day - 1`로 옮기지 않는다. 둘째 날 섹션에서 저녁집회 뒤에 적힌 마지막 일정은 논리적으로 둘째 날이며, 시간만 24시+로 바꿔야 할 수 있기 때문이다.
- **재사용 규칙**: 큐싯의 새벽 일정 귀속은 `<05:00` 단독 조건이 아니라 일차 구분행과 같은 섹션 안의 시간 순서를 함께 사용하고, 둘째 날 마지막 `00:30~03:00`은 `2일차 24:30~27:00`으로 표현한다.

## Commands

```bash
npm test
npx tsc --noEmit
npm run build
```

Production deploy is `npx vercel --prod --yes`, but only do this when explicitly requested. This app normally auto-deploys from GitHub `main`; verify with Vercel when deployment matters.
