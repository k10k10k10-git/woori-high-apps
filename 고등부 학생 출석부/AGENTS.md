<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Student Attendance App Agent Guide

This app is the source of truth for student/class/attendance data and the only deployment source for Firebase Realtime Database Rules.

Read `CLAUDE.md`, `../DB_OWNERSHIP.md`, and `../OPERATIONS.md` before significant changes.

⚠ **Demo mode is temporary.** `src/lib/demo.ts` replaces the login screen with a class picker for a teacher trial run. It is off unless `.env.local` sets `NEXT_PUBLIC_DEMO_MODE=1` plus demo account credentials. When the trial ends, set it back to `0`, redeploy, and delete the demo account — details in `CLAUDE.md`의 "데모 모드".

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
- Preserve `personId` on every student/teacher/staff edit, move, promotion, roster replacement, and sheet sync. New records receive a type-namespaced ID; student historical reuse requires the unique name+birth+department+grade-progression rules in `src/utils/personId.ts`.
- Admin roster writes must append `classes/{year}/{ck}/adminChanges/{changeId}` in the same root multi-location update. Store field labels plus input/change/delete actions, never old/new phone or address values; teacher attendance edits are not roster audit events.
- Compress student photos with `compressImage()` before storing base64.
- Preserve service worker exclusions for Firebase, Google APIs, `/_next/`, `/__nextjs`, and RSC payload files.

## 핵심 코드 패턴

### 시트에서 장결자를 평시 명단으로 옮겼을 때 `jang` 해제 (2026-07-13)

- **접근법**: 1→ `src/lib/sheetSync.ts`의 `parseClassCsv()`가 번호 재시작 전 학생을 `jang:false`로 파싱하는지 확인한다. 2→ `buildSyncPayload()`가 같은 반·같은 이름을 기존 학생으로 매칭해 `S34_J…` SID와 사진을 유지하는지 확인한다. 3→ 실제 payload에 `jang`이 없음과 기존 SID 유지를 순수 로직으로 실행 검증한다.
- **판단 질문**: `S34_J…` ID가 남아 있다는 이유로 장결자라고 판단하거나 `jang:false`를 새 필드로 저장하지 않는다. 화면의 장결 구분은 SID가 아니라 `jang === true`로 하며, 동기화가 `classes/{year}/{ck}/students` 노드를 새 payload로 교체하므로 새 학생 객체에서 생략된 기존 `jang:true`는 제거된다.
- **재사용 규칙**: 시트 장결 해제 문제는 기존 SID의 `J`보다 payload 학생 객체의 `jang` 필드 유무를 검증하고, 출석 연속성을 위해 같은 반 매칭 시 SID는 교체하지 않는다.

### 연도별 원본 키를 유지하며 영구 personId 보존하기 (2026-08-11)

- **접근법**: 1→ `src/utils/personId.ts`에서 학생·교사·스탭 namespace ID 생성과 과거 후보 재사용을 순수 함수로 고정한다. 2→ 학생 추가·명단 교체·시트 동기화는 다른 연도의 정규화 이름+생년월일+같은 부서+정상 진급선(`학년 차이 === 연도 차이`)이 일치하고 매년 후보가 한 명뿐인 ID를 재사용하며, 편집·이동·진급은 기존 `personId`를 그대로 복사한다. 3→ 본인 연락처 변경·누락은 허용하지만 같은 연도 다른 ID가 하나라도 있으면 자동 재사용을 중단하고, 보호자 연락처는 근거로 쓰지 않는다. 4→ 교사·스탭은 기존 값을 보존하고 같은 유형의 이름+생년 또는 본인 연락처가 일치하는 유일한 과거 ID만 재사용한다. 5→ 기존 `id`·`pid`·출석 참조키를 바꾸지 않고 선택 필드 하나만 추가해 공유 앱 호환을 유지한다.
- **판단 질문**: `classes/{year}` 키를 personId로 교체하거나 새 최상위 `people` 노드를 만들지 않는다. 전자는 출석·수련회·학기 참조를 전부 끊고, 후자는 배포된 Rules에 경로가 없어 즉시 거부된다. 연락처를 필수값으로 두면 번호 변경·누락 학생의 진급선이 끊기고, 보호자 연락처만 쓰면 형제를 합칠 수 있으므로 둘 다 학생 자동 연결의 기준으로 사용하지 않는다.
- **재사용 규칙**: 연도별 학생 원장을 세로로 연결할 때는 `유형 분리 → 같은 연도 중복 차단 → 이름·생년·부서·진급선의 유일 후보 확인 → 기존 업무 키 유지 → 모든 생성·이관 경로에서 personId 보존` 순서와 회귀 테스트를 함께 적용한다.

### Rules 변경 없이 원장 수정과 교차 앱 행정 이력을 함께 보장하기 (2026-08-11)

- **접근법**: 1→ `database.rules.json`과 `DB_OWNERSHIP.md`에서 학생 앱이 소유하고 통합 앱이 이미 읽을 수 있는 `classes/{year}` 계약을 확인한다. 2→ 새 최상위 이력 노드 대신 반 객체의 선택 하위 `adminChanges/{changeId}`를 정의하고 `src/utils/adminChange.ts`에서 경로·담당자·변경 필드 요약을 순수 함수로 만든다. 3→ `StudentModal`, `MoveStudentModal`, `RosterModal`, `TrashModal`, `SheetSyncSection`의 원본 변경과 감사기록을 같은 루트 다중 경로 `update()`에 넣어 둘 중 하나만 성공하는 상태를 막는다. 4→ 실제 연락처·주소 값은 이력에서 제외하고 필드 이름만 저장하며, `highschool-app/src/features/sundayMinistry/model.ts`는 모든 연도·반의 선택 하위 노드만 최신순으로 읽는다. 5→ 원장 변경 순수 테스트, 통합 수집 테스트, PC·375px 로그인 화면과 전체 빌드로 검증한다.
- **판단 질문**: 새 `adminChanges` 최상위 노드와 Rules 배포를 만들지 않는다. 새 루트는 현재 Rules에서 즉시 거부되고 규칙 단일 원천·배포 금지 계약을 넓힌다. 원본 쓰기 뒤 별도 `set()`으로 이력을 남기지도 않는다 — 네트워크 중단 시 원본만 바뀌어 누락이 생긴다. 전화번호 전후 값을 감사로그에 복제하지도 않는다 — 열람 범위와 개인정보 노출 면적만 커진다.
- **재사용 규칙**: 여러 앱이 공유 원장의 변경 이력을 필요로 하면 `기존 소유 경로의 선택 하위 노드 → 원본과 같은 원자 update → 민감값 없는 변경 항목 요약 → 소비 앱 읽기 전용 집계` 순서로 설계한다.

### 같은 날 Firebase Hosting 재배포가 이전 화면으로 남는 문제 (2026-08-13)

- **접근법**: 1→ 운영 `https://woori-high.web.app/sw.js`와 `public/sw.js`의 `CACHE_NAME`을 비교한다. 2→ 날짜만 쓰는 `tools/update-cache-version.js`를 배포마다 다른 밀리초 버전으로 바꾸고, 추적 파일이 더러워지지 않도록 `firebase.json` predeploy를 `npm run build → out/sw.js 버전 교체` 순서로 실행한다. 3→ `/sw.js`에 `no-cache, no-store, must-revalidate` 헤더를 적용하고 `AppShell.tsx` 등록에 `updateViaCache: 'none'`과 `registration.update()`를 연결한다. 4→ `/`, `/attendance`, `/stats` 응답의 ETag가 모두 같으면 rewrite가 `index.html`을 돌려주는지 확인하고, `cleanUrls: true`와 HTML·Next 라우트 `*.txt`의 `no-cache`를 적용한다. 5→ 같은 날짜의 두 캐시 버전 교체 테스트와 운영 주소의 ETag·헤더·실제 DOM으로 재검증한다.
- **판단 질문**: 사용자에게 강력 새로고침만 안내하거나 날짜 문자열을 유지하지 않는다. 전자는 다음 배포에도 반복되고, 후자는 같은 날 여러 번 배포하면 새 서비스워커의 install/activate와 `NEW_VERSION` 알림이 발생하지 않는다. 서비스워커만 고치고 HTML·`*.txt`의 기본 `max-age=3600`을 남기지도 않는다 — Next 클라이언트 라우팅은 이 이전 문서가 가리키는 낡은 청크를 계속 불러온다. `public/sw.js`에 매번 타임스탬프를 직접 쓰지도 않는다 — 배포할 때마다 추적 파일이 불필요하게 변경되므로 빌드 산출물 `out/sw.js`만 수정한다.
- **재사용 규칙**: PWA 배포 후 화면이 그대로면 `운영 sw.js 캐시 이름 → 화면 경로별 ETag → HTML·라우트 txt 캐시 헤더 → cleanUrls/rewrite 우선순위 → 실제 브라우저 DOM` 순서로 확인하고, 캐시 버전은 배포마다 고유하게 만든다.

### 데모 출석 피드백을 DB 계약 없이 업무 흐름으로 바꾸기 (2026-08-25)
- **접근법**: 1→ `src/utils/attendanceWorkflow.ts`에서 행사 제외 최근 정상 주일·장결 분리·미입력·연속 결석을 순수 함수로 고정한다. 2→ `AttendanceTab.tsx`는 교사에게 최근 4회만 선택·수정하게 하고 모든 쓰기를 기존 학생 1명/주일 1칸 `set()`으로 모아 저장 중·완료·실패·재시도를 표시한다. 3→ `jang === true` 학생을 기본 출석·통계·내보내기에서 제외하고 별도 이력 목록으로 둔다. 4→ `demoSelection`과 `demoLastSelection`을 분리해 반 바꾸기 뒤 직전 반 바로가기를 유지한다. 5→ 390px·1280px 실제 데모 화면과 전체 테스트·타입·빌드로 검증한다.
- **판단 질문**: 과거 출석 수정 요청 때문에 교사 권한용 새 DB 큐·노드나 Rules를 만들지 않는다. 기존 `attendance/{year}/{ck}/{sid}/{weekKey}`가 교사 본인 반 쓰기를 이미 허용하므로 화면에서 최근 4회만 제한하면 된다. 장결자를 삭제하거나 출석 원본을 옮기지 않고 표시·집계에서만 분리한다.
- **재사용 규칙**: 현장 피드백은 `기존 단일 경로 계약 유지 → 최근 업무 범위만 UI에서 허용 → 저장 결과를 지속 표시 → 예외 대상은 원본 보존한 채 파생 목록으로 분리 → 순수 파생 테스트와 실화면 검증` 순서로 반영한다.

## Commands

```bash
npm test
npx tsc --noEmit
npm run build
```

Hosting deploy is `firebase deploy --only hosting`. Rules deploy is `firebase deploy --only database`, but only when explicitly requested.
