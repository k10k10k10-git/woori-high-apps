# Repository Agent Guide

This workspace contains four active apps that share the Firebase Realtime Database project `woori-high`. The former `retreat-app` and `iguard-app` codebases were merged into `highschool-app` and removed on 2026-08-05; restore tags are listed below.

**This file is a summary. The authoritative operating manual is the root `CLAUDE.md` (Korean) — read it first; if this file and `CLAUDE.md` disagree, `CLAUDE.md` wins.**

**Continuing prior work?** Read `.claude/HANDOFF.md` first — it captures the latest session's state, what's done/pending, and gotchas.

## DB Safety 4 Questions — answer before starting ANY task

Before any work (including code changes, investigation, or documentation), answer these four in a fixed 4-line block at the top of your first response:

> **DB 안전 4문답:** ① DB writes: none *(if any: paths, count, backup plan)* ② Deployment: none *(if any: which app)* ③ Rules deployment: no ④ Paths to watch: none *(if any: path and why)*

Rules for the answers: production DB writes require explicit user approval plus a snapshot backup; Rules deployment must always be "no" (single source: `attendance-app/database.rules.json`); deployment only when requested or as part of the /ship procedure.

Also: after solving any non-trivial problem, run the `extract-approach` skill before moving on (learning law — see root `CLAUDE.md`).

Before changing code, always check whether the change can affect Firebase paths shared by another app. If a task touches data shape, database paths, Firebase Rules, imports/sync, or deployment, explain the DB impact first.

## Apps

| Path | Purpose | Main DB ownership |
|---|---|---|
| `highschool-app/` | Unified semester, retreat admin, and on-site app — production URL `https://woorihigh-app.vercel.app` (the old `highschool-app-flame.vercel.app` still points at the same deployment) | `semesters/*`, `retreats/{id}/*`, `retreatsPrivate/{id}`, `retreatAdmins`, `retreats/{id}/iguard/*`, `iguard*` |
| `attendance-app/` | Student attendance PWA | `classes/`, `attendance/`, `events/`, `admins`, `teacherClasses` |

Read these first for cross-app work:

- `DB_OWNERSHIP.md`
- `OPERATIONS.md`
- The relevant app's `CLAUDE.md` and `AGENTS.md`

## Roles and permissions (unified app, since 2026-08-06)

`highschool-app` has six ministry roles. The single source of truth is `highschool-app/src/features/portal/accessPolicy.ts`; the required table is frozen by `accessPolicy.test.ts`. Never compare role strings in components — call `canAccessPortalArea` / `canEditPortalArea` / `iguardScope` / `canManageRoles`.

| Role (ko) | Semester | Retreat admin | iGuard field | Assign roles | Stored as |
|---|---|---|---|---|---|
| 통합관리자 (super admin) | edit | edit | all tabs | yes | `admins/{uid} = true` |
| 교역자 (pastor) | edit | edit | all tabs | no | `retreatAdmins/{uid}.role = "pastor"` |
| 팀장 (team lead) | edit | edit | all tabs | no | `.role = "leader"` |
| 행정팀 (admin team) | edit | edit | execution tabs only | no | `.role = "adminTeam"` (legacy entries with no `role` count as this) |
| 이가드팀 (iGuard team) | none | none | all tabs | no | `iguardMembers/{uid}` + `iguardRoles/{uid} = "team"` |
| 스탭 (staff) | read only | none | execution tabs only | no | `iguardMembers/{uid}` + `iguardRoles/{uid} = "staff"` |

- Roles are expressed with **existing** DB nodes and one optional field, so no Firebase Rules change was needed. Do not invent a new roles node: new nodes have no `.read`/`.write` in the rules and are rejected immediately, and rules can only be deployed from the student app.
- `iguardRoles` has a `.validate` that accepts only `"staff"` / `"team"`. Never write other values there.
- Role judgement lives in one pure function, `resolveMinistryRole`. The root `src/context/AuthContext.tsx` performs authentication and role reads once; `src/features/iguard/context/AuthContext.tsx` is a compatibility adapter over that root state.
- Role writes go through `roleAssign.planRoleAssignment` (pure, grants before revokes) then `applyRole.applyRoleSteps` (execution). Do not call the underlying DB functions from UI code.
- Resolved 2026-08-08: staff read of `semesters` now works — `iguardMembers` was added to the `semesters` `.read` rule and deployed from the student app. `.write` is still `admins`/`retreatAdmins` only, and `semestersPrivate` (contacts) stays admin-side only on purpose.

## Read access was tightened on 2026-08-09 — do not widen it back

Several nodes used to be readable by **any signed-in Google account** (no role at all), exposing 40 teachers' phone numbers and birthdates plus 51 account records. Two deploys fixed this:

- `teacherStaff`, `teacherSpecial`, `teacherExtra` → `admins` / `attendanceAdmins` / `retreatAdmins` / `iguardMembers` (the semester intake screen and retreat rosters read these).
- `teacherAdditional`, `teacherPhones` → `admins` / `attendanceAdmins` only.
- `userRoles` → list read is admin-only; **each record keeps a self-read rule** (`data.child('email').val() === auth.token.email`) because `loadUserRole` reads `userRoles/{emailKey}` to decide login. Remove it and every homeroom teacher is locked out.
- `retreatAdmins`, `iguardMembers`, `iguardRoles` → list read is role holders only, and **each keeps `$uid` self-read** (`auth.uid === $uid`). The root AuthContext reads the signed-in user's uid from these three; on failure the `catch` sets role `"none"`, so removing self-read locks out every non-admin.
- `staff_*` → removed from Rules on 2026-08-12 together with the teacher/staff app (0 records, never deployed).
- `events` stays `auth != null` on purpose — month/day/label only, no personal data.

`attendance-app/__tests__/rulesContract.test.ts` pins all of this. Run it before touching rules.

## Firebase Safety Rules

- Rules deployment source is only `attendance-app/database.rules.json`.
- Do not deploy rules from `highschool-app`; it consumes the student app's rules and data contracts.
- Do not write across app ownership boundaries.
- Keep sensitive retreat data under `retreatsPrivate/{id}`.
- For `highschool-app`, use its path helpers for database paths when adding or changing paths.
- Prefer single-path updates over full-node overwrites. Full overwrites require explicit backup/restore patterns where already established.

## Verification

Use the app-local commands unless the task says otherwise:

```bash
npm test
npx tsc --noEmit
npm run build
```

Deployment is not part of routine edits unless explicitly requested. If production deployment is requested, follow `OPERATIONS.md`.

Because every screen sits behind Google OAuth, headless browsers cannot verify logged-in pages. Confirm a deployment by comparing `curl -s https://woorihigh-app.vercel.app/api/version` (`buildId`) with `git rev-parse HEAD`, and check `npx vercel ls` shows Production `Ready`. For destructive flows, test with one dummy row that matches nothing, read the confirmation count, then **cancel** — never press the real confirm button. Details in `LEARNINGS.md`.

If a `*.vercel.app` alias you just created answers `302` with `location: .../sso-api?...`, that is Deployment Protection, not an app bug: register it with `npx vercel domains add <subdomain>.vercel.app <projectId>` and re-check with curl.

## App Priority

Current priority is student attendance and `highschool-app`. The teacher/staff attendance app is deferred unless the user explicitly asks for it.

## Legacy recovery

- State immediately before removing the standalone retreat and iGuard apps: `pre-legacy-app-removal-2026-08-05`
- State before the unified app migration: `pre-unified-apps-2026-08-05`
- The Firebase RTDB data was not deleted or migrated. Only the two legacy deployments, Hosting sites, and local source directories were removed.
