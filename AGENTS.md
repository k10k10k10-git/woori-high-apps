# Repository Agent Guide

This workspace contains four active apps that share the Firebase Realtime Database project `woori-high`. The former `retreat-app` and `iguard-app` codebases were merged into `highschool-app` and removed on 2026-08-05; restore tags are listed below.

**This file is a summary. The authoritative operating manual is the root `CLAUDE.md` (Korean) — read it first; if this file and `CLAUDE.md` disagree, `CLAUDE.md` wins.**

**Continuing prior work?** Read `.claude/HANDOFF.md` first — it captures the latest session's state, what's done/pending, and gotchas.

## DB Safety 4 Questions — answer before starting ANY task

Before any work (including code changes, investigation, or documentation), answer these four in a fixed 4-line block at the top of your first response:

> **DB 안전 4문답:** ① DB writes: none *(if any: paths, count, backup plan)* ② Deployment: none *(if any: which app)* ③ Rules deployment: no ④ Paths to watch: none *(if any: path and why)*

Rules for the answers: production DB writes require explicit user approval plus a snapshot backup; Rules deployment must always be "no" (single source: `고등부 학생 출석부/database.rules.json`); deployment only when requested or as part of the /ship procedure.

Also: after solving any non-trivial problem, run the `extract-approach` skill before moving on (learning law — see root `CLAUDE.md`).

Before changing code, always check whether the change can affect Firebase paths shared by another app. If a task touches data shape, database paths, Firebase Rules, imports/sync, or deployment, explain the DB impact first.

## Apps

| Path | Purpose | Main DB ownership |
|---|---|---|
| `highschool-app/` | Unified semester, retreat admin, and on-site app — production URL `https://woorihigh-app.vercel.app` (the old `highschool-app-flame.vercel.app` still points at the same deployment) | `semesters/*`, `retreats/{id}/*`, `retreatsPrivate/{id}`, `retreatAdmins`, `retreats/{id}/iguard/*`, `iguard*` |
| `고등부 학생 출석부/` | Student attendance PWA | `classes/`, `attendance/`, `events/`, `admins`, `teacherClasses` |
| `semester-app/` | Semester ministry and training hub | `semesters/`, `semestersPrivate/` |
| `고등부 교사·스탭 출석부/` | Teacher/staff attendance app | `staff_*` paths only |

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
- Role judgement lives in one pure function, `resolveMinistryRole`, shared by both AuthContexts (`src/context/AuthContext.tsx` and `src/features/iguard/context/AuthContext.tsx`).
- Role writes go through `roleAssign.planRoleAssignment` (pure, grants before revokes) then `applyRole.applyRoleSteps` (execution). Do not call the underlying DB functions from UI code.
- ⚠ Open blocker: staff read of `semesters` is still denied by the rules, so the staff role sees an error banner on semester screens. The exact rules snippet is in `.claude/HANDOFF.md` section 2-1; it must be deployed from the student app by the user. `semestersPrivate` (contacts) stays admin-side only on purpose.

## Firebase Safety Rules

- Rules deployment source is only `고등부 학생 출석부/database.rules.json`.
- Do not deploy rules from `highschool-app`; it consumes the student app's rules and data contracts.
- Do not write across app ownership boundaries.
- Keep sensitive retreat data under `retreatsPrivate/{id}`.
- For `highschool-app` and `semester-app`, use their path helpers for database paths when adding or changing paths.
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
