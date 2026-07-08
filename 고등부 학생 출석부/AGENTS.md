<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Student Attendance App Agent Guide

This app is the source of truth for student/class/attendance data and the only deployment source for Firebase Realtime Database Rules.

Read `CLAUDE.md`, `../DB_OWNERSHIP.md`, and `../OPERATIONS.md` before significant changes.

## Database Ownership

This app owns:

- `classes/{year}`
- `attendance/{year}`
- `events/{year}`
- `admins`
- `teacherClasses`
- `userRoles`
- `teacherStaff/{year}`
- `teacherSpecial/{year}`
- `teacherExtra/{year}`
- `teacherAdditional/{year}`
- `teacherPhones/{year}`
- `suggestions/{year}`
- `trash/{year}`

`classes/{year}` is shared read-only by the retreat admin app, IGuard app, and teacher/staff attendance app. Treat shape changes as cross-app breaking changes.

## Firebase Rules

- `database.rules.json` here is the single production source for `woori-high` Rules.
- Run `firebase deploy --only database` only from this app, and only when explicitly requested.
- Other apps' `DO_NOT_DEPLOY.database.rules.json` files are not deployable sources.
- Keep read permissions for `retreatAdmins` and `iguardMembers` where required by retreat apps.

## Required Patterns

- Use `AppContext` reducer actions for shared UI/state.
- Teacher users must only subscribe to their own class; admins subscribe to all classes.
- `loadUserRole` must await `teacherClasses/{uid}` writes before class subscriptions because Rules read that path.
- Do not overwrite an entire class student list for ordinary edits. Update only `classes/{year}/{ck}/students/{sid}`.
- `RosterModal` is the intentional full-replace exception.
- Do not compute and persist student numbering on every save; `sortAndRenumber()` handles display order.
- Compress student photos with `compressImage()` before storing base64.
- Preserve service worker exclusions for Firebase, Google APIs, `/_next/`, `/__nextjs`, and RSC payload files.

## Commands

```bash
npm test
npx tsc --noEmit
npm run build
```

Hosting deploy is `firebase deploy --only hosting`. Rules deploy is `firebase deploy --only database`, but only when explicitly requested.
