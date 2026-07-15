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

## Roles

`staff` users see execution views only. `team` and `admin` can access planning and info views.

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
