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

## 핵심 코드 패턴

### 시트에서 장결자를 평시 명단으로 옮겼을 때 `jang` 해제 (2026-07-13)

- **접근법**: 1→ `src/lib/sheetSync.ts`의 `parseClassCsv()`가 번호 재시작 전 학생을 `jang:false`로 파싱하는지 확인한다. 2→ `buildSyncPayload()`가 같은 반·같은 이름을 기존 학생으로 매칭해 `S34_J…` SID와 사진을 유지하는지 확인한다. 3→ 실제 payload에 `jang`이 없음과 기존 SID 유지를 순수 로직으로 실행 검증한다.
- **판단 질문**: `S34_J…` ID가 남아 있다는 이유로 장결자라고 판단하거나 `jang:false`를 새 필드로 저장하지 않는다. 화면의 장결 구분은 SID가 아니라 `jang === true`로 하며, 동기화가 `classes/{year}/{ck}/students` 노드를 새 payload로 교체하므로 새 학생 객체에서 생략된 기존 `jang:true`는 제거된다.
- **재사용 규칙**: 시트 장결 해제 문제는 기존 SID의 `J`보다 payload 학생 객체의 `jang` 필드 유무를 검증하고, 출석 연속성을 위해 같은 반 매칭 시 SID는 교체하지 않는다.

## Commands

```bash
npm test
npx tsc --noEmit
npm run build
```

Hosting deploy is `firebase deploy --only hosting`. Rules deploy is `firebase deploy --only database`, but only when explicitly requested.
