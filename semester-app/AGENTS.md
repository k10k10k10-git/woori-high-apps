# semester-app Agent Guide

Internal semester ministry and training hub for intake, team assignment, attendance, completion, curriculum, and archive workflows.

**Compatibility app.** The live semester ministry screens are in `highschool-app` (`/semesters`, `/semester/[id]`). This app now redirects `/` and `/semester/:path*` to `https://woorihigh-app.vercel.app` (see `next.config.ts`). Build new semester features in `highschool-app`, not here; retiring this app needs separate user approval. Note that `highschool-app` has moved ahead of this app: six ministry roles with read-only access for the staff role, staff members (`teacherStaff/{year}`) as intake targets with an `s_` appKey prefix, and student/guardian phone numbers in `applicationsPrivate`. Port those here only if the user asks.

Read `CLAUDE.md`, `../DB_OWNERSHIP.md`, and `../OPERATIONS.md` before significant changes.

## Stack

- Next.js App Router, React 19, TypeScript strict mode, Tailwind CSS 4
- Firebase Realtime Database and Firebase Auth
- Tests: Vitest
- Deploy: Vercel

## Database Boundaries

This app owns:

- `semesters/{sid}`
- `semestersPrivate/{sid}/applicationsPrivate`

It reads these paths without owning them:

- `classes/{year}`
- `admins`
- `retreatAdmins`

Do not add write functions for read-only paths. Keep application motives, phone numbers, and other sensitive intake data under `semestersPrivate/{sid}`.

## Required Patterns

- Use `src/lib/db.ts` as the Firebase access layer. Do not import Firebase directly in components.
- Use `src/lib/paths.ts` as the only source for database path strings.
- Prefer path-specific `update()` and `remove()` operations. Do not add full-node overwrite functions.
- Keep shared semester subscriptions in `SemesterClient.tsx`. Tab-local subscriptions must pass `onError` and expose a load error instead of leaving an infinite spinner.
- Use `calcCompletion()` from `src/lib/completion.ts` for completion decisions. Do not persist a separate completion result.
- Keep attendance changes idempotent and explicit; do not turn status buttons into toggles.
- Derive the student roster year from the semester id and treat `classes/{year}` as read-only.
- Preserve the application key format `{buNum}_{studentId}` through `makeAppKey()`.

## Commands

```bash
npm test
npx tsc --noEmit
npm run build
```

Production deploy is `npx vercel --prod --yes`, but only do this when explicitly requested. Git auto-deploy is not connected for this app, so pushing does not deploy it. Firebase Rules must only be changed or deployed from `../고등부 학생 출석부/database.rules.json` and never from this app.
