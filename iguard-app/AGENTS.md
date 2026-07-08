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
- All live retreat subscriptions belong in `useRetreatData`; include an `onError` path so failed subscriptions do not leave infinite spinners.
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

## Commands

```bash
npm test
npx tsc --noEmit
npm run build
```

Production deploy is `npx vercel --prod --yes`, but only do this when explicitly requested. This app normally auto-deploys from GitHub `main`; verify with Vercel when deployment matters.
