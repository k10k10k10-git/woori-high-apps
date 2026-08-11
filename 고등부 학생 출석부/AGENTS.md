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
- The unified app may add one new-friend student only through its super-admin `registerNewFriendInRoster` flow. Preserve deterministic `nf_` IDs, duplicate blocking, the private pre-write snapshot, and single-student atomic updates; all existing-student edits, moves, deletes, and attendance writes remain owned here.
- `RosterModal` is the intentional full-replace exception.
- Do not compute and persist student numbering on every save; `sortAndRenumber()` handles display order.
- Preserve `personId` on every student/teacher/staff edit, move, promotion, roster replacement, and sheet sync. New records receive a type-namespaced ID; historical reuse requires the unique strong-field rules in `src/utils/personId.ts`.
- Admin roster writes must append `classes/{year}/{ck}/adminChanges/{changeId}` in the same root multi-location update. Store changed field labels, not old/new phone or address values; teacher attendance edits are not roster audit events.
- Compress student photos with `compressImage()` before storing base64.
- Preserve service worker exclusions for Firebase, Google APIs, `/_next/`, `/__nextjs`, and RSC payload files.

## 핵심 코드 패턴

### 시트에서 장결자를 평시 명단으로 옮겼을 때 `jang` 해제 (2026-07-13)

- **접근법**: 1→ `src/lib/sheetSync.ts`의 `parseClassCsv()`가 번호 재시작 전 학생을 `jang:false`로 파싱하는지 확인한다. 2→ `buildSyncPayload()`가 같은 반·같은 이름을 기존 학생으로 매칭해 `S34_J…` SID와 사진을 유지하는지 확인한다. 3→ 실제 payload에 `jang`이 없음과 기존 SID 유지를 순수 로직으로 실행 검증한다.
- **판단 질문**: `S34_J…` ID가 남아 있다는 이유로 장결자라고 판단하거나 `jang:false`를 새 필드로 저장하지 않는다. 화면의 장결 구분은 SID가 아니라 `jang === true`로 하며, 동기화가 `classes/{year}/{ck}/students` 노드를 새 payload로 교체하므로 새 학생 객체에서 생략된 기존 `jang:true`는 제거된다.
- **재사용 규칙**: 시트 장결 해제 문제는 기존 SID의 `J`보다 payload 학생 객체의 `jang` 필드 유무를 검증하고, 출석 연속성을 위해 같은 반 매칭 시 SID는 교체하지 않는다.

### 연도별 원본 키를 유지하며 영구 personId 보존하기 (2026-08-11)

- **접근법**: 1→ `src/utils/personId.ts`에서 학생·교사·스탭 namespace ID 생성과 과거 강한 필드의 유일 후보 재사용을 순수 함수로 고정한다. 2→ 학생 추가·명단 교체·시트 동기화는 과거 이름+생년월일+본인 연락처가 모두 일치하는 유일한 학생 ID를 재사용하고, 편집·이동·진급은 기존 `personId`를 그대로 복사한다. 3→ 교사·스탭 편집은 기존 값을 보존하고 새 연도 레코드는 같은 유형의 이름+생년 또는 본인 연락처가 일치하는 유일한 과거 ID만 재사용한다. 4→ 기존 `id`·`pid`·출석 참조키를 바꾸지 않고 선택 필드 하나만 추가해 공유 앱 호환을 유지한다.
- **판단 질문**: `classes/{year}` 키를 personId로 교체하거나 새 최상위 `people` 노드를 만들지 않는다. 전자는 출석·수련회·학기 참조를 전부 끊고, 후자는 배포된 Rules에 경로가 없어 즉시 거부된다. 보호자 연락처만 같은 학생도 형제일 수 있으므로 연결하지 않는다.
- **재사용 규칙**: 연도별 원장을 세로로 연결할 때는 기존 업무 키를 유지하고 선택적 유형별 `personId`만 추가하며, 생성·이관·편집의 모든 저장 경로에서 그 필드를 보존하는 테스트를 함께 둔다.

### Rules 변경 없이 원장 수정과 교차 앱 행정 이력을 함께 보장하기 (2026-08-11)

- **접근법**: 1→ `database.rules.json`과 `DB_OWNERSHIP.md`에서 학생 앱이 소유하고 통합 앱이 이미 읽을 수 있는 `classes/{year}` 계약을 확인한다. 2→ 새 최상위 이력 노드 대신 반 객체의 선택 하위 `adminChanges/{changeId}`를 정의하고 `src/utils/adminChange.ts`에서 경로·담당자·변경 필드 요약을 순수 함수로 만든다. 3→ `StudentModal`, `MoveStudentModal`, `RosterModal`, `TrashModal`, `SheetSyncSection`의 원본 변경과 감사기록을 같은 루트 다중 경로 `update()`에 넣어 둘 중 하나만 성공하는 상태를 막는다. 4→ 실제 연락처·주소 값은 이력에서 제외하고 필드 이름만 저장하며, `highschool-app/src/features/sundayMinistry/model.ts`는 모든 연도·반의 선택 하위 노드만 최신순으로 읽는다. 5→ 원장 변경 순수 테스트, 통합 수집 테스트, PC·375px 로그인 화면과 전체 빌드로 검증한다.
- **판단 질문**: 새 `adminChanges` 최상위 노드와 Rules 배포를 만들지 않는다. 새 루트는 현재 Rules에서 즉시 거부되고 규칙 단일 원천·배포 금지 계약을 넓힌다. 원본 쓰기 뒤 별도 `set()`으로 이력을 남기지도 않는다 — 네트워크 중단 시 원본만 바뀌어 누락이 생긴다. 전화번호 전후 값을 감사로그에 복제하지도 않는다 — 열람 범위와 개인정보 노출 면적만 커진다.
- **재사용 규칙**: 여러 앱이 공유 원장의 변경 이력을 필요로 하면 `기존 소유 경로의 선택 하위 노드 → 원본과 같은 원자 update → 민감값 없는 변경 항목 요약 → 소비 앱 읽기 전용 집계` 순서로 설계한다.

## Commands

```bash
npm test
npx tsc --noEmit
npm run build
```

Hosting deploy is `firebase deploy --only hosting`. Rules deploy is `firebase deploy --only database`, but only when explicitly requested.
