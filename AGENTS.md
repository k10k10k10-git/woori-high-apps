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
| `highschool-app/` | Unified semester, retreat admin, and on-site app | `semesters/*`, `retreats/{id}/*`, `retreatsPrivate/{id}`, `retreatAdmins`, `retreats/{id}/iguard/*`, `iguard*` |
| `고등부 학생 출석부/` | Student attendance PWA | `classes/`, `attendance/`, `events/`, `admins`, `teacherClasses` |
| `semester-app/` | Semester ministry and training hub | `semesters/`, `semestersPrivate/` |
| `고등부 교사·스탭 출석부/` | Teacher/staff attendance app | `staff_*` paths only |

Read these first for cross-app work:

- `DB_OWNERSHIP.md`
- `OPERATIONS.md`
- The relevant app's `CLAUDE.md` and `AGENTS.md`

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

## App Priority

Current priority is student attendance and `highschool-app`. The teacher/staff attendance app is deferred unless the user explicitly asks for it.

## Legacy recovery

- State immediately before removing the standalone retreat and iGuard apps: `pre-legacy-app-removal-2026-08-05`
- State before the unified app migration: `pre-unified-apps-2026-08-05`
- The Firebase RTDB data was not deleted or migrated. Only the two legacy deployments, Hosting sites, and local source directories were removed.
