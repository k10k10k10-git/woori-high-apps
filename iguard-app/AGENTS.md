# iguard-app Agent Guide

Mobile-first on-site move-guide app for retreat execution: attendance checks, cue cards, post board, buses, meals, seating, staff movements, and validation.

Read `CLAUDE.md`, `../DB_OWNERSHIP.md`, and `../OPERATIONS.md` before significant changes.

## Stack

- Next.js App Router, React 19, TypeScript strict mode, Tailwind CSS 4
- Firebase Realtime Database and Firebase Auth
- Tests: Vitest
- Deploy: Vercel

## Database Boundaries

Read-only admin-owned paths:

- `retreats/{id}/participants`
- `retreats/{id}/teachers`
- `retreats/{id}/groups`
- `retreats/{id}/rooms`
- `retreats/{id}/partialAttendances`
- `retreats/{id}/cellColors`
- `retreats/{id}/periods`
- `classes/{year}`
- `admins`, `retreatAdmins`

Writable IGuard-owned/shared paths:

- `retreats/{id}/iguard/*`
- `iguardMembers`
- `iguardRoles`
- `iguardPending`
- `prepMilestones`

Do not write to admin-owned retreat data. Keep the read/write separation in `src/lib/db.ts`.

## Required Patterns

- Use `src/lib/db.ts` as the Firebase access layer. Do not import Firebase directly in components.
- Use `src/lib/paths.ts` for database paths.
- All live retreat subscriptions belong in `useRetreatData`; include an `onError` path so failed subscriptions do not leave infinite spinners. The sole exception is `iguard/accessLock`: it must be checked before `useRetreatData` mounts, and the home lock badge uses the same metadata subscription.
- Use `snapToList<T>()` instead of open-coded snapshot mapping.
- For attendance checks, preserve the current safety design:
  - tapping an unchecked person is idempotent check-in (`checked: true`)
  - unchecking requires confirmation
  - writes use `runTransaction`
  - clear/uncheck leaves `checked: false` tombstones instead of removing nodes
  - `by` records who checked/unchecked
- Keep `.info/connected` offline banner visible around field-use screens.
- Use existing helpers for 24:00+ overnight schedule calculations; do not reimplement simple hour comparisons.
- Do not reset user-selected schedule/post-board state from clock ticks.
- Escape user-provided data with `escapeHtml()` before generated print HTML.
- Bus 선탑/동승 parsing must go through `src/lib/busStaff.ts`. This strips trailing `sf`, removes obvious instruction fragments and count summaries such as `스탭 0명` from cue sheets, and keeps rejected fragments out of bus headcounts and checklist members while still surfacing warnings.
- Bus auto-assignment must not be trapped by staff-only imported bus rows. If existing buses are fewer than the minimum needed for all student+teacher passengers, create the missing bus rows and preserve existing bus staff fields by `busNo`.
- Bus gender separation uses `group + gender` cohorts, never individual scattering. Read gender from admin-owned `participants`, write only `iguard/buses.assignmentMode/segments`, fail closed on missing gender, and keep legacy buses in mixed group mode.
- Formal `당일참석(day)` students join group checklists only on that day; day 1/3 students also join the matching bus assignment and bus checklist. Day 2 has no bus assignment. Legacy note-only day visits remain excluded from buses because their structured day is unknown.

## Roles

`staff` users see execution views only. `team` and `admin` can access planning and info views.

### 정적 숙소 도면에 실시간 방배정 겹쳐 보기 (2026-07-22, 2026-07-23 보강)

- **접근법**: 1→ 제공된 PDF를 페이지별 고해상도 WebP로 변환해 `public/room-maps/`에 둔다. 2→ 변환 후 실제 WebP 픽셀에서 각 방 사각형의 중앙을 다시 측정하고 `src/lib/lodgingMap.ts`에 퍼센트 좌표 핫스팟으로 선언한다. PDF 원본 좌표나 다른 층의 행 좌표를 재사용하지 않는다. 3→ 행정 소유 `rooms`를 읽기 전용으로 받아 취소 학생과 숙박하지 않는 당일참석을 제외하고 반·학생·교사 요약을 만든다. 4→ `LodgingMapView.tsx`에서 원본 비율을 유지한 이미지 위에 좌표 버튼을 겹친다. 선택 상세는 `createPortal()`로 `document.body`에 렌더링하고 클릭 버튼의 `getBoundingClientRect()`를 기준으로 좌우 여백·뷰포트 상하 경계를 계산해 말풍선을 배치한다. 스크롤·리사이즈 때 다시 계산한다. 5→ 정확한 건물명+호실을 우선하고 HRD의 일반 건물명만 정원(3인실=핵심관, 2인실=인재관)으로 보강하며, 추론할 수 없는 방은 경고 목록에 남긴다. 6→ 도면이 없는 건물을 사용자가 간이 배치도로 허용하면 운영 DB에서 실제 건물명·호실을 읽기 전용으로 확인하고, `schematicZones`의 큰 구역과 모든 호실 핫스팟을 별도로 선언해 누락 없이 표시한다.
- **판단 질문**: PDF를 브라우저에서 직접 렌더링하거나 DB에 도면 좌표를 저장하지 않는다. 전자는 모바일 PDF 호환성과 오버레이 정렬이 불안정하고, 후자는 정적 UI 메타데이터 때문에 공유 DB 스키마를 늘린다. 가로 스크롤 컨테이너 안에 상세 카드를 absolute로 두지도 않는다. 끝 호실에서 잘리거나 도면 스크롤과 함께 사라지기 때문이다. 이름이 비슷한 별관이나 VIP 방을 임의의 건물로 매핑하지 않는다. 단, 사용자가 도면 없는 건물의 간이 배치도를 명시적으로 요청하면 운영 DB를 읽기 전용으로 확인해 실제 건물명·호실을 빠짐없이 고정 메타데이터로 연결한다. 그 밖의 추론 불가능한 방은 미매칭 경고로 남긴다.
- **재사용 규칙**: 정적 평면도 오버레이는 최종 웹 이미지 픽셀 기준의 상대 좌표로 측정하고, 스크롤 영역의 인접 상세 UI는 body 포털+앵커 화면 좌표+뷰포트 경계 보정으로 배치한다. 간이 배치도도 큰 구역 수와 실제 호실 수를 분리해 모든 호실을 보존한다. 운영 데이터 매칭은 정확한 키 우선·제한된 폴백·미매칭 공개의 세 단계를 유지한다.

### 행정 참석정보를 버스 인원에 반영하기 (2026-07-17)

- **접근법**: 1→ 운영 `teachers`와 `partialAttendances`를 읽기 전용으로 좁게 대조해 교사 자차는 `transport`, 구버전 학생 당일참여는 `note`, 정식 당일참석은 `type+day`에 저장됨을 확인한다. 2→ `subscribeToPartialAttendances()`가 객체형 `PartialAttendanceMap`으로 `type/day/note`를 보존한다. 3→ 현장 참석은 `isPresentOnDay()`, 버스 탑승은 `isStudentBusPassengerOnDay()`로 분리한다. 4→ 정식 당일참석은 지정한 1·3일차 버스에 포함하고, 일차를 확정할 수 없는 구버전 note만 제외한다. 5→ 화면과 인쇄가 공유하는 `ChecklistView.membersForGroup()` 앞단에서 취소 학생·불참 교사를 제거하고 `studentPartialLabel()`·`teacherChecklistMeta()`로 부분참 표기를 만든다. 6→ 혼합 조·성별 묶음·조별·호차별 체크가 같은 판정을 쓰는지 회귀 테스트로 고정한다.
- **판단 질문**: 조 이름 목록만 보고 세거나 모든 당일참석을 자차로 가정해 버스에서 빼지 않는다. 전자는 행정의 불참·자차를 무시하고, 후자는 지정 일차 호차를 타야 하는 학생을 누락한다. 반대로 구조화된 `day`가 없는 구버전 메모를 임의의 호차에 넣지도 않는다. 이름이 모호한 교사를 임의 제외하거나 학생 조장에게 교사 자차 필터를 적용하지 않는다. 화면 JSX와 인쇄 HTML에서 참석 필터를 각각 구현하지 않는다. 둘이 어긋나 운영 명단이 달라질 수 있기 때문이다.
- **재사용 규칙**: 조별 현장 인원은 `isPresentOnDay()`와 `roleNamesForChecklist(..., "group")`, 단체 버스 인원은 `isStudentBusPassengerOnDay()`와 `isTeacherBusPassenger()`로 판정한다. 부분참 라벨은 `src/lib/checklistMembers.ts`의 공통 헬퍼만 사용하고, 행정 부분참 구독에서는 `type/day/note`를 함께 보존한다.

### 버스 조별 성별 묶음 자동배정 (2026-07-17)

- **접근법**: `혼합`은 기존 조 단위를 그대로 `busAutoAssign.ts`에 넘긴다. `남녀 분리`는 `busGender.ts`에서 취소·부분참을 먼저 제외한 뒤 `조+남`, `조+여` 묶음을 만들고, 배정기가 한 호차에 단일 성별만 허용한다. 참가자 성별을 우선하고, 시트에 없는 수동 학생은 행정 조편성과 동일한 홀수반=남·짝수반=여 기준으로 보강한다. 교사는 행정 `teachers.gender` 명시값으로 같은 성별 묶음의 `teacherNames`에 넣는다. 결과는 `iguard/buses.segments`에 저장하고 호차별 체크리스트도 같은 묶음을 읽는다.
- **판단 질문**: 학생 개인을 무작위로 흩뜨리거나 성별 미확인 학생·교사를 조용히 제외하지 않는다. 교사 성별을 담당반 홀짝이나 조의 다수 학생 성별로 추론하지 않는다. 미확인 교사는 정확한 이름을 보여주고 자동배정을 중단한다. 구버전 `includeTeachers` 세그먼트는 계속 읽는다.
- **재사용 규칙**: 성별 키 정규화·묶음 생성은 `busGender.ts`, 정원 비례·예약석·단일 성별 호차 불변식은 `busAutoAssign.ts`만 사용한다.

### 수련회별 PIN 잠금 (2026-07-16)

- **접근법**: Google 로그인·팀원 승인을 유지하고, `retreats/{id}/iguard/accessLock`에 salt와 PBKDF2-SHA256 해시만 저장한다. 관리자는 우회하고, 일반 사용자는 PIN 통과 전 `IguardWorkspace`와 `useRetreatData`를 마운트하지 않는다.
- **판단 질문**: 홈 링크만 막고 직접 `/retreat/{id}` URL을 열면 들어갈 수 있지 않은가? PIN 변경 뒤 이전 탭의 해제가 계속 유효하지 않은가? 두 경우를 각각 라우트 경계와 해시 버전이 포함된 sessionStorage 키로 막는다.
- **재사용 규칙**: PIN 형식·해시·검증·세션 키는 `src/lib/accessLock.ts`만 사용한다. 이 기능은 승인 사용자 대상 앱 수준 잠금이며 현재 Firebase Rules의 계정별 데이터 ACL을 대체한다고 표현하지 않는다.

### 개인 큐카드 본인 자동 선택 (2026-07-13)

- **접근법**: `iguardMembers/{uid}.name`을 1순위, Google `displayName`을 2순위로 정규화해 행정 스탭 명단의 유일한 한 명과 연결하고, 해당 스탭을 별도 꼬리표 없이 드롭다운 맨 위에 표시한다.
- **판단 질문**: UID를 행정 `teachers`에 새로 저장하거나 이름이 같은 사람 중 하나를 임의 선택하지 않는다. 전자는 앱 소유권을 침범하고, 후자는 타인의 큐카드를 본인 것으로 보여줄 위험이 있기 때문이다.
- **재사용 규칙**: 계정-스탭 연결은 `src/lib/staffIdentity.ts`의 `findPreferredStaffId()`를 사용하고, 자동 선택 뒤 사용자 선택 보존은 `chooseCueCardStaffId()`로 판정한다.

### 375px 현장 화면의 가독성과 밀도 함께 지키기 (2026-07-30)

- **접근법**: 1→ `IguardClient.tsx`, `ExecutionViews.tsx`, `ChecklistView.tsx`에서 12px 미만 본문과 작은 조작 영역을 먼저 찾는다. 2→ 현장 전환 탭·헤더 동작·고정 카드 접기처럼 반복해서 누르는 핵심 조작은 최소 40px, 명단 행은 48px로 올린다. 3→ 초기화·상세처럼 보조 조작은 32~36px를 유지해 한 화면 정보량을 보존한다. 4→ 임시 프리뷰를 375×812에서 열어 `innerWidth === scrollWidth`, 실제 버튼 높이, 긴 텍스트 줄바꿈을 측정하고 제거한다. 5→ `mobileReadability.test.ts`로 최소 크기 클래스가 사라지지 않게 고정한다.
- **판단 질문**: 모바일이라는 이유로 모든 카드·글자를 일괄 확대하지 않는다. 현장 화면은 빠른 스캔이 중요하므로 전체 확대는 스크롤을 늘려 오히려 사용성을 떨어뜨린다. 반대로 9~10px 보조 글자를 그대로 두거나 핵심 탭을 32px로 두지도 않는다. 실제 375px에서 읽기와 터치가 모두 불안정하기 때문이다.
- **재사용 규칙**: 375px 현장 화면은 핵심 조작 40px 이상·명단 행 48px·본문 12px 이상을 우선하고, 보조 조작만 32~36px로 남긴 뒤 실제 뷰포트의 가로 넘침과 줄바꿈을 함께 측정한다.

### 구간 모델 도입 중 기존 화면을 기본 구간으로 격리하기 (2026-07-30)

- **접근법**: 1→ 원본 `IguardMovement`는 `segmentId`, 미정 `staffId`, `slot`, `detail`, `actor`를 담는 확장 레코드로 둔다. 2→ 기존 화면 전용 `AssignedIguardMovement` 타입을 분리한다. 3→ `defaultSegment.ts`에서 segmentId 없는 레거시와 `order=0,label=전체` 기본 구간의 지정 완료 동선만 좁혀 반환한다. 4→ `useRetreatData`는 전체 레코드를 `movementRecords`, 기존 화면용 결과를 `movements`로 함께 제공한다. 5→ segments 구독도 중앙 로딩·오류 집합에 넣어 새 데이터가 도착하기 전 화면이 잘못 렌더링되지 않게 한다.
- **판단 질문**: 새 필드를 기존 화면 곳곳에서 선택적으로 처리하지 않는다. 그러면 화면마다 미정 슬롯·비기본 구간을 다르게 해석하고, 블록당 한 동선이라는 옛 가정이 조용히 깨진다. 반대로 `segments`가 비었다고 segmentId가 있는 모든 동선을 레거시로 취급하지 않는다. 구독 오류나 끊어진 참조 때 여러 구간 배정이 한 화면에 섞일 수 있기 때문이다.
- **재사용 규칙**: 공유 모델을 단계적으로 확장할 때는 원본 레코드와 구버전 화면용 좁은 타입을 분리하고, 중앙 훅 한 곳에서 명시적 기본 레코드만 어댑트한다. 참조를 찾지 못한 새 레코드는 fail closed로 숨긴다.

### 운영 동선 마이그레이션을 dry-run과 경로별 복구로 잠그기 (2026-07-30)
- **접근법**: 1→ 변환 본문을 DB와 분리한 순수 함수 `buildRetreatMigration()`으로 만들고 레거시·구조화·고아 참조·키 충돌을 테스트한다. 2→ 기본 실행은 `firebase database:get`만 사용해 운영 데이터를 읽고 `report.json`, `payload.patch.json`, `restore.patch.json`을 Git 제외 로컬 폴더에 만든다. 3→ 변환 전후 동선 수, 미해결 레거시, 참조 무결성 이슈를 수련회별로 대조한다. 4→ 실제 쓰기는 별도 확인 토큰과 사용자 승인을 요구하고, 먼저 세 노드 스냅샷을 저장한 뒤 이슈 0건일 때만 루트 multi-path update 한 번으로 실행한다. 5→ 불일치 시 새 패치를 덧대지 않고 실행 폴더의 경로별 restore patch로 되돌린다.
- **판단 질문**: `set()`으로 `segments`나 `movements` 전체 노드를 덮지 않는다. 동시 변경을 지울 수 있고 부분 실패의 복구 범위도 커지기 때문이다. dry-run 없이 코드상 예상 건수만 보고 실행하지 않으며, 미해결 레거시를 단순히 전후 총건수에 포함해 통과시키지도 않는다. `fullyConverted`와 `issueCount`를 별도 게이트로 둔다.
- **재사용 규칙**: 운영 Firebase 형태 이관은 순수 변환 테스트 → 읽기 전용 실데이터 dry-run → 전후 건수·참조 검증 → 사용자 승인 → 노드 스냅샷 → 단일 multi-path update → 경로별 복구안 순서를 고정한다.

### 실제 큐싯의 구간 동선을 수동 보존형으로 동기화하기 (2026-07-30)
- **접근법**: 1→ 블록 날짜와 24시+ 시각을 먼저 정규화한다. 2→ 화살표가 있는 담당 행만 명시적 구간으로 만들고, 화살표 없는 소제목은 기본 구간으로 되돌린다. 3→ 기존 역할 파서를 재사용하면서 상세·회차·행정팀 actor·미정 `sf` 슬롯을 보존한다. 4→ 교회 출발 전 기도회·등록 준비는 담당 원문과 포스트에는 남기되 현장 동선 수에서는 제외한다. 5→ 재동기화는 `source=sheet` 레코드만 갱신하고 수동 동선이나 수동 동선이 연결된 구간은 지우지 않는다. 6→ 실제 여름 큐싯 fixture로 22블록·24구간·214동선·미정 5건을 고정한다.
- **판단 질문**: 초기 파싱 결과 242건을 억지로 중복 제거하지 않는다. 차이 28건은 기도회·등록 준비라는 출발 전 담당 배정이므로 현장 동선 도메인에서 제외하되 원문 정보는 보존해야 한다. 또한 시트에서 사라진 구간이라도 수동 동선이 붙어 있으면 삭제하지 않는다.
- **재사용 규칙**: 원본 집계와 구현 집계가 다르면 먼저 도메인 경계를 원본에서 분류하고, 원문은 보존한 채 실제 fixture로 기대 건수를 잠근다. 동기화에서는 자신이 소유한 출처의 레코드만 갱신한다.

### 큐싯 새벽 시각의 논리 일차 판정 (2026-07-13)

- **접근법**: 1→ `src/lib/cueSheet.ts`의 `resolveOvernight()`와 `parseCueSheetText()`를 확인한다. 2→ 운영 화면에서 누락된 블록이 다른 일차로 이동했는지 찾는다. 3→ 원본의 일차 구분행과 앞 블록 순서를 대조해, 새벽 시각이 전날 섹션의 연장인지 해당 섹션 마지막 일정인지 판정한다.
- **판단 질문**: `00:30~03:00`이라는 시각만 보고 무조건 `day - 1`로 옮기지 않는다. 둘째 날 섹션에서 저녁집회 뒤에 적힌 마지막 일정은 논리적으로 둘째 날이며, 시간만 24시+로 바꿔야 할 수 있기 때문이다.
- **재사용 규칙**: 큐싯의 새벽 일정 귀속은 `<05:00` 단독 조건이 아니라 일차 구분행과 같은 섹션 안의 시간 순서를 함께 사용하고, 둘째 날 마지막 `00:30~03:00`은 `2일차 24:30~27:00`으로 표현한다.

## Commands

```bash
npm test
npx tsc --noEmit
npm run build
```

Production deploy is `npx vercel --prod --yes`, but only do this when explicitly requested. This app normally auto-deploys from GitHub `main`; verify with Vercel when deployment matters.
