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

- **접근법**: 조 전체 삭제는 미저장 편집을 먼저 `saveGroups()`로 저장하고, `clearGroups()`가 `minIntervalMs=0` 강제 백업 성공을 확인한 뒤 `retreats/{id}/groups`만 삭제한다.
- **판단 질문**: 일반 자동저장의 10분 백업 스로틀을 그대로 쓰거나 `rooms`·`iguard/groupStaff`를 함께 삭제하지 않는다. 전자는 삭제 직전 상태를 놓칠 수 있고, 후자는 요청 범위와 앱 소유권을 침범하기 때문이다.
- **재사용 규칙**: 전체 삭제처럼 되돌리기 어려운 동작은 백업 함수의 성공 여부를 확인해 실패 시 쓰기를 중단하고, 확인창에 유지되는 연관 데이터와 끊길 참조를 명시한다.

## Commands

```bash
npm test
npx tsc --noEmit
npm run build
```

Production deploy is `npx vercel --prod --yes`, but only do this when explicitly requested. `retreat-app` Git auto-deploy has been unreliable, so verify deployment status with Vercel after pushes.
