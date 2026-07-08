# Teacher/Staff Attendance App Agent Guide

Teacher and ministry-team staff Sunday attendance app. This project is currently lower priority until after summer retreat work unless the user explicitly asks for it.

Read `CLAUDE.md`, `../DB_OWNERSHIP.md`, and `../OPERATIONS.md` before significant changes.

## Stack

- Next.js App Router, React 18, TypeScript strict mode
- Firebase Realtime Database and Firebase Auth
- Email/password auth, not Google OAuth
- State: React Context + reducer

## Database Boundaries

This app owns only `staff_*` paths:

- `staff_members/{year}`
- `staff_attendance/{year}`
- `staff_events/{year}`
- `staff_roles`
- `staff_admins`

It reads `classes/{year}` from the student attendance app to build 1부/2부 teacher lists. Do not write to `classes/`, `attendance/`, `retreats/`, or any retreat-owned paths.

This project does not own Firebase Rules. Do not create `database.rules.json` here and do not deploy Rules from this app.

## Required Patterns

- Use `AppContext` reducer actions for shared state.
- Use `effectiveKey(state)` to resolve the current attendance group key.
- Keep Firebase subscriptions centralized in `hooks/useFirebaseData.ts`.
- General components should use functions from `useFirebaseData.ts` rather than importing Firebase directly. `AdminTab.tsx` has limited existing exceptions for `staff_roles` and `staff_events`.
- `classes/{year}` is read-only.
- New staff teams should be added through the `STAFF_TEAMS` constant.
- Keep dependencies minimal: firebase, next, react, react-dom.

## Commands

```bash
npx tsc --noEmit
npm run build
```

There is no mature test suite or deployment setup yet. Treat errors, accessibility, and deployment hardening as future work unless requested.
