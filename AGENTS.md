# Repository Agent Guide

This workspace contains four related apps that share the Firebase Realtime Database project `woori-high`.

Before changing code, always check whether the change can affect Firebase paths shared by another app. If a task touches data shape, database paths, Firebase Rules, imports/sync, or deployment, explain the DB impact first.

## Apps

| Path | Purpose | Main DB ownership |
|---|---|---|
| `고등부 학생 출석부/` | Student attendance PWA | `classes/`, `attendance/`, `events/`, `admins`, `teacherClasses` |
| `retreat-app/` | Retreat admin site | `retreats/{id}` admin data, `retreatsPrivate/{id}`, `retreatAdmins` |
| `iguard-app/` | On-site move-guide app | `retreats/{id}/iguard/*`, `iguardMembers`, `iguardRoles`, `iguardPending` |
| `고등부 교사·스탭 출석부/` | Teacher/staff attendance app | `staff_*` paths only |

Read these first for cross-app work:

- `DB_OWNERSHIP.md`
- `OPERATIONS.md`
- The relevant app's `CLAUDE.md` and `AGENTS.md`

## Firebase Safety Rules

- Rules deployment source is only `고등부 학생 출석부/database.rules.json`.
- Do not deploy rules from `retreat-app` or `iguard-app`; their `DO_NOT_DEPLOY.database.rules.json` files are archival only.
- Do not write across app ownership boundaries.
- Keep sensitive retreat data under `retreatsPrivate/{id}`.
- For `retreat-app` and `iguard-app`, use `src/lib/paths.ts` for database paths when adding or changing paths.
- Prefer single-path updates over full-node overwrites. Full overwrites require explicit backup/restore patterns where already established.

## Verification

Use the app-local commands unless the task says otherwise:

```bash
npm test
npx tsc --noEmit
npm run build
```

Deployment is not part of routine edits unless explicitly requested. If production deployment is requested, follow `OPERATIONS.md`.

## App Priority

Current priority is student attendance, `retreat-app`, and `iguard-app`. The teacher/staff attendance app is deferred until after summer retreat work unless the user explicitly asks for it.
