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
- **판단 질문**: 기본 제공 도면은 빌드 시 변환한 WebP와 고정 좌표를 쓰되, 장소가 매번 달라지는 수련회에는 이 방식만 강제하지 않는다. 사용자가 올린 PDF는 `pdfjs-dist`로 렌더링하고 도면 파일은 Firebase Storage, 수련회별 핀 좌표는 IGuard 소유 `iguard/lodgingMaps` 아래에 저장한다. 행정 소유 `rooms/groups`에는 쓰지 않는다. 가로 스크롤 컨테이너 안에 상세 카드를 absolute로 두지도 않는다. 끝 호실에서 잘리거나 도면 스크롤과 함께 사라지기 때문이다. 이름이 비슷한 별관이나 VIP 방을 임의의 건물로 매핑하지 않는다. 단, 사용자가 도면 없는 건물의 간이 배치도를 명시적으로 요청하면 운영 DB를 읽기 전용으로 확인해 실제 건물명·호실을 빠짐없이 연결한다. 그 밖의 추론 불가능한 방은 미매칭 경고로 남긴다.
- **재사용 규칙**: 기본 정적 평면도는 최종 웹 이미지 픽셀 기준 상대 좌표를 쓰고, 새 장소 PDF는 수련회별 Storage 파일+IGuard 소유 상대 좌표 핀으로 저장한다. 두 방식 모두 같은 방 요약 함수와 body 포털 상세 UI를 재사용하며 행정 방·조 데이터는 읽기 전용으로 유지한다.

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
- **접근법**: 1→ 변환 본문을 DB와 분리한 순수 함수 `buildRetreatMigration()`으로 만들고 레거시·구조화·고아 참조·키 충돌을 테스트한다. 2→ 기본 실행은 `firebase database:get`만 사용해 운영 데이터를 읽고 `report.json`, `payload.patch.json`, `restore.patch.json`을 Git 제외 로컬 폴더에 만든다. 3→ 변환 전후 동선 수, 미해결 레거시, 참조 무결성 이슈를 수련회별로 대조한다. 4→ 실제 쓰기는 별도 확인 토큰과 사용자 승인을 요구하고, 먼저 세 노드 스냅샷을 저장한 뒤 이슈 0건일 때만 루트 multi-path update 한 번으로 실행한다. 5→ 실행 뒤에는 키가 아니라 `staffId+blockId+postId+round+note+source` 의미 필드의 다중집합을 스냅샷과 현재 DB 양방향으로 대조한다. 6→ 불일치 시 새 패치를 덧대지 않고 실행 폴더의 경로별 restore patch로 되돌린다.
- **판단 질문**: `set()`으로 `segments`나 `movements` 전체 노드를 덮지 않는다. 동시 변경을 지울 수 있고 부분 실패의 복구 범위도 커지기 때문이다. dry-run 없이 코드상 예상 건수만 보고 실행하지 않으며, 미해결 레거시를 단순히 전후 총건수에 포함해 통과시키지도 않는다. `fullyConverted`와 `issueCount`를 별도 게이트로 둔다.
- **재사용 규칙**: 운영 Firebase 형태 이관은 순수 변환 테스트 → 읽기 전용 실데이터 dry-run → 전후 건수·참조 검증 → 사용자 승인 → 노드 스냅샷 → 단일 multi-path update → 의미 필드 다중집합 대조 → 경로별 복구안 순서를 고정한다. 키 형식이 바뀌는 이관은 총건수 일치만으로 무손실을 주장하지 않는다.

### 실제 큐싯의 구간 동선을 수동 보존형으로 동기화하기 (2026-07-30)
- **접근법**: 1→ 블록 날짜와 24시+ 시각을 먼저 정규화한다. 2→ 화살표가 있는 담당 행만 명시적 구간으로 만들고, 화살표 없는 소제목은 기본 구간으로 되돌린다. 3→ 기존 역할 파서를 재사용하면서 상세·회차·행정팀 actor·미정 `sf` 슬롯을 보존한다. 4→ 교회 출발 전 기도회·등록 준비는 담당 원문과 포스트에는 남기되 현장 동선 수에서는 제외한다. 5→ 재동기화는 `source=sheet` 레코드만 갱신하고 수동 동선이나 수동 동선이 연결된 구간은 지우지 않는다. 6→ 실제 여름 큐싯 fixture로 22블록·24구간·214동선·미정 5건을 고정한다.
- **판단 질문**: 초기 파싱 결과 242건을 억지로 중복 제거하지 않는다. 차이 28건은 기도회·등록 준비라는 출발 전 담당 배정이므로 현장 동선 도메인에서 제외하되 원문 정보는 보존해야 한다. 또한 시트에서 사라진 구간이라도 수동 동선이 붙어 있으면 삭제하지 않는다.
- **재사용 규칙**: 원본 집계와 구현 집계가 다르면 먼저 도메인 경계를 원본에서 분류하고, 원문은 보존한 채 실제 fixture로 기대 건수를 잠근다. 동기화에서는 자신이 소유한 출처의 레코드만 갱신한다.

### 조별 GBS 장소를 단일 원천과 역방향 파생으로 관리하기 (2026-07-30)
- **접근법**: 1→ 새 편집값은 이가드 소유 `iguard/gbs/{groupId}` 한 경로에만 저장한다. 2→ 기존 행정 `group.gbs`는 새 값이 없을 때만 읽는 폴백으로 둔다. 3→ 장소별 조 목록은 별도 노드로 복제하지 않고 조별 값에서 매번 파생한다. 4→ 중앙 훅의 로딩·오류 게이트에 구독을 포함한다. 5→ 실행 조별 정보와 개인 큐카드는 같은 `effectiveGbsPlace()`를 사용하고, 개인 카드는 ID 기반 조스탭 배정과 레거시 이름 배정을 모두 해석한다.
- **판단 질문**: 장소→조 목록을 편의를 위해 저장하지 않는다. 양방향 데이터를 따로 쓰면 조 장소를 바꿀 때 한쪽만 갱신되는 불일치가 생긴다. 행정의 기존 값을 즉시 이관하거나 삭제하지도 않는다. 운영 중인 과거 데이터를 읽기 폴백으로 유지하면 새 화면을 점진적으로 도입할 수 있다.
- **재사용 규칙**: 양방향 조회가 필요한 관계는 쓰기 원천을 한 방향으로만 정하고 반대 방향은 순수 함수로 파생한다. 새 앱 소유 오버레이를 도입할 때는 `새 값 우선 → 기존 값 폴백`으로 점진 전환한다.

### 큐싯의 담당 구역을 보수적으로 구조화해 인쇄 명단 만들기 (2026-07-30)
- **접근법**: 1→ 괄호 상세 원문을 유지한 채 `건물+층 배열`로 파싱한다. 2→ `2층+별관` 같은 복수 구역은 배열로 나눈다. 3→ 방의 동 이름과 숙소 배치도 별칭, 호수 첫 자리의 층이 모두 맞을 때만 담당 호실로 포함한다. 4→ 취소·당일참석 학생은 숙박 명단 단일 판정과 동일하게 제외한다. 5→ 파싱 실패나 일치 방 0개는 버리지 않고 “구역 확인 필요”로 인쇄한다. 6→ 버스·식사·GBS·집회·호실 데이터를 순수 함수로 한 카드에 모으고, 마지막 HTML 변환에서 모든 문자열을 `escapeHtml()`로 통과시킨다.
- **판단 질문**: `남자 숙소`처럼 건물·층이 명확하지 않은 표현을 임의 방에 매칭하지 않는다. 잘못된 학생 명단을 자신 있게 인쇄하는 것이 빈 경고보다 위험하다. 아직 계약되지 않은 수찬·선교팀 학생 속성도 이름이나 메모로 추측하지 않고 미연동 상태를 드러낸다.
- **재사용 규칙**: 운영용 인쇄물은 `파싱 성공 데이터 + 확인 필요 원문`을 함께 제공하고, 원천 데이터에 없는 분류를 추론하지 않는다. 인쇄 HTML 경계에서는 화면 표시 여부와 무관하게 모든 외부 문자열을 다시 이스케이프한다.

### 운영 큐싯을 앱에서 동시성 안전하게 편집하고 구조만 복제하기 (2026-07-30)
- **접근법**: 1→ `ScheduleView.tsx`에서 블록·구간·동선 레코드를 각각 편집하는 UI로 나눈다. 2→ 단순 필드 변경은 해당 레코드의 `update()`, 담당자·포스트 변경처럼 자연키가 바뀌는 동선은 루트 multi-path update로 이전 키 삭제와 새 키 생성을 원자 처리한다. 3→ 구조 복제는 `structureClone.ts`의 순수 변환에서 블록·구간·포스트·자리/식사 틀·가이드만 남기고 사람·담당자·자유 메모·조 배정을 제거한다. 4→ 실행 직전 대상의 구조 노드가 하나라도 차 있으면 중단하고, 빈 대상에만 한 번의 multi-path update를 실행한다. 5→ 구글 시트 가져오기는 초기 자료 이관용으로 낮추고 지속 편집은 앱을 단일 작업 화면으로 삼는다.
- **판단 질문**: 시간표·구간·동선 목록 전체를 `set()`으로 덮지 않는다. 여러 스탭이 동시에 편집할 때 다른 사람의 변경을 지울 수 있기 때문이다. 과거 수련회를 통째로 복사하지도 않는다. 담당자·인원체크·버스·GBS·PIN은 새 행사에서 반드시 다시 결정해야 하며, 자유 메모에는 행사 고유 정보가 섞인다. 대상에 일부 데이터가 있으면 병합을 추측하지 않고 복제를 중단한다.
- **재사용 규칙**: 운영 목록 편집은 레코드 단위 update와 자연키 변경용 원자 교체를 사용하고, 템플릿 복제는 순수 허용 목록 변환 → 대상 공백 검사 → 단일 multi-path update 순서로만 실행한다.

### 큐카드 현재 일정은 행사 날짜와 시각으로만 자동 판정하기 (2026-07-30)
- **접근법**: 1→ `ExecutionViews.tsx`에서 행사 기간으로 논리 일차를 결정한다. 2→ 현재 시각을 24시+ 표기까지 정규화해 `currentBlockFor()`에 전달한다. 3→ `지금 여기`·`진행 중` 버튼과 `actualStart` 우선 계산을 제거한다. 4→ 행사 종료 뒤에는 현재 일정만 비우고 전체 기록 목록과 선택한 스탭은 보존한다. 5→ 수동 진행 API는 과거 데이터 호환을 위해 DB 계층에 남기되 화면에서는 호출하지 않는다.
- **판단 질문**: 운영자가 눌러야 하는 진행 마커를 현재 일정의 필수 원천으로 두지 않는다. 누락·오조작 때 모든 스탭의 큐카드가 잘못된 블록에 고정되기 때문이다. 반대로 행사가 끝났다는 이유로 전체 큐싯 기록까지 숨기지도 않는다.
- **재사용 규칙**: 현재/다음 일정은 행사 날짜+논리 시각의 순수 파생값으로 만들고, 전체 기록과 사용자 선택은 현재 시각 필터와 분리한다.

### 시트형 담당 입력으로 포스트와 자동 동선을 동기화하기 (2026-07-30)
- **접근법**: 1→ `ScheduleSheetEditor.tsx`의 담당 셀 저장 뒤 `syncIguardScheduleOwner()`를 호출한다. 2→ 기존 `parseOwnerSegments()`로 `장소: 담당자` 행을 구간·포스트·동선으로 파싱한다. 3→ 없는 장소는 `source=sheet` 포스트로 추가하고 이름을 실제 스탭 ID로 해석한다. 4→ `reconcileSegmentSheetMovements()`로 `source=sheet` 동선만 교체한다. 5→ 사이트에서 만든 수동 포스트·수동 동선은 그대로 보존하고, 포스트 화면은 같은 레코드를 시트형 표로 직접 편집한다.
- **판단 질문**: 담당 셀을 자유 텍스트로만 저장해 실행 화면과 포스트 현황이 비어 있게 두지 않는다. 반대로 동기화할 때 전체 `posts`·`movements` 노드를 덮지도 않는다. 다른 사용자의 수동 배정과 동시에 편집한 데이터를 지울 수 있기 때문이다.
- **재사용 규칙**: 시트형 입력을 구조 데이터로 반영할 때는 파서 재사용 → 누락된 자동 레코드 생성 → 자동 출처만 조정 순서를 지키고 수동 출처는 절대 삭제하지 않는다.

### 코드 완료와 운영 전환 완료를 분리하기 (2026-07-30)
- **접근법**: 1→ 단계별 커밋·자동 테스트·DB 이관 결과를 코드 완료 근거로 모은다. 2→ 로그인 후 모바일·동시편집·인쇄·오프라인 검증은 별도 리허설 게이트로 둔다. 3→ 초보 제작자 관찰처럼 자동화할 수 없는 성공 기준은 미완료 상태를 숨기지 않고 담당자·통과 조건을 적는다. 4→ 스프레드시트 중단 조건과 치명 결함 롤백 조건을 배포 전에 선언한다. 5→ `main` push가 운영 배포인 저장소에서는 코드가 준비돼도 최종 배포 승인을 별도로 받는다.
- **판단 질문**: 테스트와 빌드가 통과했다고 “운영 전환 완료”로 부르지 않는다. 반대로 사람 검증이 남았다는 이유로 이미 검증된 코드·마이그레이션 결과까지 미완료로 뭉개지도 않는다. 코드, 데이터, 사람 검증, 배포를 네 개의 독립 상태로 보고 각각 근거를 남긴다.
- **재사용 규칙**: 운영 앱의 출시 체크리스트는 자동 검증 결과, 승인된 데이터 변경과 복구안, 사람만 할 수 있는 검증, 배포 승인 상태를 분리한다. 사람 검증 전에도 시험 배포는 가능하지만, 기존 운영 수단을 폐기하는 전환은 관찰 테스트와 리허설 통과 뒤에만 한다.

### 구조화된 큐싯을 시트형 행 편집기로 평탄화하기 (2026-07-30)
- **접근법**: 1→ `ScheduleView.tsx`의 시간 블록·구간·포스트·담당자 저장 경계를 먼저 확인한다. 2→ `ScheduleSheetEditor.tsx`에서 블록의 시간·구분·내용·자유 담당·특이사항만 한 행에 배치한다. 3→ `scheduleSheet.ts`로 기존 구간·동선 레코드를 포스트별 읽기 요약으로 파생한다. 4→ 구조화 편집기는 삭제하지 않고 우측 상세 패널에 넣는다. 5→ 행 이탈과 `⌘/Ctrl+Enter`에서 기존 `updateIguardScheduleBlock()`만 호출하고, 상세 패널을 열기 전에도 현재 행 저장을 완료한다. 6→ `ResizeObserver`로 고정 스탭 명단의 실제 높이를 CSS 변수에 전달해 열·일차 헤더가 겹치지 않게 한다.
- **판단 질문**: 작성 경험을 시트처럼 만들기 위해 `schedule`, `segments`, `movements`를 새 통합 레코드로 바꾸지 않는다. 데이터 이관과 교차 화면 회귀 위험이 크고, 기존 구조는 현장 큐카드·포스트 현황에 이미 필요하다. 또한 모든 구조 입력을 기본 행에 펼치지 않는다. 초보 작성자가 자주 쓰는 필드와 가끔 쓰는 구조 설정의 인지 부하가 다시 합쳐지기 때문이다.
- **재사용 규칙**: 복잡한 구조화 데이터의 작성 UI를 단순화할 때는 저장 모델을 바꾸기보다 “빈번한 필드의 평탄한 기본 화면 + 기존 구조의 읽기 요약 + 드물게 여는 상세 패널”로 구성하고, 모든 쓰기는 기존 레코드 단위 API를 재사용한다.

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

### 종료된 행사에서도 전체 큐싯 흐름과 선택 상태를 보존하기 (2026-07-30)

- **접근법**: 1→ `src/lib/cueCardTimeline.ts`에서 현재/다음 고정 카드의 행사 단계와 하단 목록 범위를 분리한다. 2→ 행사 전만 남은 일정으로 좁히고 행사 중·종료 후에는 정렬된 전체 일정 22개를 반환한다. 3→ `src/app/retreat/[id]/ExecutionViews.tsx`에서 블록별 동선을 단일 값이 아닌 배열로 모아 같은 시각의 복수 배치를 모두 렌더링한다. 4→ 개인 큐카드와 `BadgeCardsView.tsx`의 스탭 선택을 각각 수련회별 `localStorage` 키로 저장한다. 5→ `src/lib/badgeCard.ts`가 일정·포스트를 입력받아 인쇄와 화면에 같은 전체 타임라인을 파생하게 한다. 6→ 종료 상태, 복수 동선, 탭 왕복 뒤 선택 유지 여부를 테스트와 로컬 브라우저에서 확인한다.
- **판단 질문**: 종료 후 현재/다음 일정이 없다는 이유로 하단 전체 큐싯까지 비우지 않는다. 운영 회고와 인쇄에는 과거 일정이 계속 필요하다. 또한 매 clock tick이나 데이터 재구독 때 첫 스탭을 다시 선택하지 않고, 저장된 ID가 실제 명단에 있을 때만 복원한다. 명찰카드에 숙소 담당 학생·특정 조건 학생을 계속 넣어 정보량을 늘리지 않고 사용자가 요청한 버스·식사·GBS·집회·전체 일정만 남긴다.
- **재사용 규칙**: “현재 상태”와 “전체 기록”을 같은 필터로 계산하지 말고, 사용자 선택은 시간·구독 파생 state와 분리해 행사별 저장 키로 보존한다.

### 여러 일차 시간표의 지속시간을 빈 칸 없이 그리기 (2026-07-30)

- **접근법**: 1→ `src/lib/scheduleOverview.ts`에서 모든 블록의 시작·종료를 전역 시간 경계로 수집한다. 2→ 각 블록이 몇 개 경계 구간을 덮는지 계산해 `rowSpans`와 `coveredDays`를 만든다. 3→ `ScheduleOverviewView.tsx`는 시작 행에서만 셀을 만들고 다음 행들은 건너뛰어 HTML `rowSpan`으로 합친다. 4→ 카드 자체에는 원래 시작~종료를 표시해 경계가 추가돼도 실제 일정을 왜곡하지 않는다. 5→ 07:30~09:00 블록이 08:30 경계를 지나도 하나의 셀로 남는 회귀 테스트를 둔다.
- **판단 질문**: 30분 고정 슬롯이나 시작 시각만 있는 행 목록을 사용하지 않는다. 다른 일차의 시작 시각이 중간에 끼면 긴 일정이 빈 셀로 끊기기 때문이다. 전역 경계를 없애 일차별 표를 따로 만들지도 않는다. 세 일차를 가로로 비교하는 개요 목적이 사라진다.
- **재사용 규칙**: 여러 트랙의 간트형 표는 모든 시작·종료를 경계로 합치고, 각 항목의 지속시간을 `rowSpan`으로 표현해 시작점 전용 렌더링과 덮인 셀 생략을 함께 구현한다.

### 개인 큐카드의 역할과 공동 담당자 명단을 분리하기 (2026-07-30)

- **접근법**: 1→ `ExecutionViews.tsx`가 선택한 스탭 이름이 포함된 담당 원문만 수집한다. 2→ `src/lib/personalDuty.ts`에서 `장소·역할: 담당자들` 형식을 파싱해 콜론 앞 역할만 추출한다. 3→ 현재·다음·한눈에 보기 모두 같은 역할 배열을 표시한다. 4→ `badgeCard.ts`는 포스트·메모에 붙은 공동 담당자 명단을 제거한 뒤 선택 스탭의 일정만 인쇄한다. 5→ 실제 운영 데이터에서 역할명이 보이고 다른 이름이 숨겨지는지 브라우저와 단위 테스트로 확인한다.
- **판단 질문**: 선택한 스탭 이름이 원문에 있다는 이유로 그 줄 전체를 개인 카드에 노출하지 않는다. 공동 담당자 명단이 다시 섞여 “본인만 보기”가 깨지고 역할도 한눈에 드러나지 않기 때문이다. 담당 원문 자체를 DB에서 바꾸지도 않고 표시 경계에서만 개인화한다.
- **재사용 규칙**: 공동 배정 원문을 개인 화면에 보여줄 때는 먼저 대상 포함 여부를 판정하고, `역할: 인명 목록`을 역할 데이터와 인명 데이터로 나눈 뒤 역할만 렌더링한다.

### 행사별 숙소 PDF를 자동 분석하고 관리·열람 화면을 분리하기 (2026-07-30)

- **접근법**: 1→ `src/lib/lodgingPdf.ts`에서 PDF 텍스트와 파일명으로 행정 방배정의 건물명을 점수 매칭한다. 2→ PDF 텍스트 항목의 좌표와 호실 번호를 연결하고, 한 PDF에 여러 건물이 있으면 건물 표제 좌표에 가까운 동명 호실을 선택한다. 3→ 인식한 페이지·호실 좌표를 기존 `iguard/lodgingMaps` 메타데이터에 저장하고 미인식 호실만 수동 보정한다. 4→ Storage 업로드는 진행률과 60초 타임아웃을 제공해 무한 “적용 중” 상태를 막는다. 5→ 실행 탭은 `숙소 안내` 읽기 전용, 기획 탭은 `배치도 관리` 업로드·삭제·핀 편집 화면으로 분리한다.
- **판단 질문**: 새 장소마다 기존 건물명을 강제로 고르게 하지 않는다. 파일 내용과 행정 방배정이 더 정확한 원천이다. 반대로 PDF 이미지만 저장하고 좌표를 매번 추론하지 않는다. 자동 인식 결과를 저장해야 모든 현장 사용자가 같은 배치를 즉시 보며, 인식 실패만 관리자가 보정할 수 있다.
- **재사용 규칙**: 행사마다 바뀌는 도면은 `파일 분석 → 운영 데이터명 매칭 → 좌표 저장 → 미인식 수동 보정`으로 처리하고, 현장 열람 화면에서는 업로드·삭제 같은 변경 기능을 노출하지 않는다.

### 개인 운영카드의 긴 목록을 A4 한 장에 배치하기 (2026-07-30)

- **접근법**: 1→ `src/lib/badgeCard.ts`에서 인쇄 데이터를 섹션별 항목 수와 반복 구조로 분해한다. 2→ 21개 GBS 장소는 `1~10조 / 11~21조`처럼 연속 구간 두 열로 나누고, 22개 일정은 일차별 세 열 카드로 바꾼다. 3→ 모든 셀 문자열은 기존 `escapeHtml()` 경계를 유지한다. 4→ 실제 항목 수와 긴 담당 문구를 넣은 HTML을 Headless Chrome으로 A4 PDF로 출력한다. 5→ `pdfinfo`로 A4·1페이지를 확인하고 `pdftoppm` PNG를 눈으로 검사해 마지막 일정까지 보이는지 확인한다.
- **판단 질문**: 전체 카드 글자 크기를 일괄 축소하거나 `overflow:hidden`으로 넘치는 내용을 감추지 않는다. 둘 다 인쇄물의 핵심 정보가 읽히지 않거나 잘린 사실을 숨긴다. GBS를 홀짝으로 교차 배치하지도 않는다. 현장에서 조 번호를 훑을 때 연속된 순서가 더 빠르기 때문이다.
- **재사용 규칙**: A4 인쇄물에서 긴 반복 목록이 세로 공간을 소진하면 글자를 먼저 줄이지 말고, 의미 있는 연속 묶음과 일차·범주를 기준으로 폭을 활용한 다열 구조로 바꾼 뒤 실제 PDF 1페이지 렌더링까지 확인한다.

### 검증 화면에서 오류·미배치·업무량을 분리하기 (2026-07-30)

- **접근법**: 1→ `src/app/retreat/[id]/ValidationView.tsx`의 항목을 운영 불변식 위반, 배정 완결성, 설명 통계로 분류한다. 2→ 겹치는 다른 장소 배정과 명단 불일치만 실제 오류로 남긴다. 3→ 동선 0회 스탭은 미배치 섹션에 따로 모은다. 4→ `src/lib/staffAssignmentStats.ts`에서 스탭별 실제 동선 수와 서로 다른 일정 수를 집계해 배정된 스탭만 많은 순서로 보여준다. 5→ 일부 일정은 의도적으로 조와 함께 움직일 수 있으므로 담당자가 없는 일정 자체는 경고에서 제외한다.
- **판단 질문**: 전체 평균의 80% 같은 임의 기준으로 “과부하”를 판정하지 않는다. 행사마다 일정 수와 역할 밀도가 달라 같은 숫자의 의미가 달라지고, 사용자가 확인하려는 사실은 상대적 낙인이 아니라 실제 배정 횟수이기 때문이다. 미배치 스탭을 횟수 표에 다시 0회로 중복 노출하지도 않는다.
- **재사용 규칙**: 운영 검증 화면은 `실제 불변식 오류 → 미배치 상태 → 사실 기반 업무량 통계` 순으로 분리하고, 의도 가능한 공백이나 상대적 임계값을 오류 문구로 만들지 않는다.

### 긴 큐싯 편집값을 내부 스크롤 없이 전부 노출하기 (2026-07-31)

- **접근법**: 1→ `src/app/retreat/[id]/ScheduleSheetEditor.tsx`의 내용·담당·특이사항 입력을 공통 `AutoGrowTextarea`로 바꾼다. 2→ 값이나 창 너비가 바뀔 때 높이를 `auto`로 초기화한 뒤 `scrollHeight + (offsetHeight - clientHeight)`로 다시 계산해 테두리까지 포함한 실제 높이를 맞춘다. 3→ `overflow-hidden resize-none`으로 내부 스크롤과 수동 높이 차이를 없애고, 공통 `.input`의 글자 크기 덮어쓰기는 `!text-[11px]`로 명시한다. 4→ 담당·동선 요약의 `slice()`와 `truncate`를 제거해 모든 줄을 줄바꿈으로 펼친다. 5→ 로그인된 연습 화면에서 모든 textarea의 `scrollHeight <= clientHeight`, `overflowY=hidden`, 실제 글자 크기 11px을 전수 측정한다.
- **판단 질문**: 고정 `min-height`만 계속 늘리지 않는다. 데이터가 더 길어지면 다시 내부 스크롤이 생기고, 짧은 칸은 필요 이상으로 커진다. `height = scrollHeight`만 적용하지도 않는다. 전역 `box-sizing: border-box`에서 테두리만큼 실제 내용 높이가 2px 부족해질 수 있다. 담당 요약을 “외 N개”로 접어 화면 높이를 줄이지 않는다. 이 화면의 우선순위는 페이지 길이보다 전체 내용의 즉시 확인이다.
- **재사용 규칙**: 긴 운영 텍스트를 한눈에 보여야 하는 편집 화면은 고정 높이와 셀 내부 스크롤 대신 콘텐츠 자동 높이, 테두리 보정, 실제 computed style 및 `scrollHeight/clientHeight` 전수 검증을 사용한다.

### 실시간 구독 편집값과 파생 동선을 원자적으로 동기화하기 (2026-07-31)

- **접근법**: 1→ 저장 시작 시 `committedRef`와 입력 스냅샷을 비교해 담당 변경 여부를 `await` 전에 고정한다. 2→ 블록 저장 뒤 고정한 판정값으로 구조화 동선 동기화를 실행한다. 3→ 이미 원문만 저장된 불일치는 담당 칸이 포커스를 잃을 때 담당 동기화를 한 번 더 강제해 복구한다. 4→ 저장 중 사용자가 다른 칸을 편집하면 최신 `draftRef`를 덮어쓰지 않고 변경 상태를 유지한다. 5→ 출처 필드가 없던 구버전 자동 동선은 `포스트명: 담당자` 메모가 현재 포스트·담당자와 모두 일치할 때만 임시 `source=sheet`로 승격해 교체한다. 6→ 명시적 `source=manual` 동선은 그대로 보존하고 회귀 테스트로 고정한다.
- **판단 질문**: 비동기 저장이 끝난 뒤 실시간 구독이 갱신한 `committedRef`와 다시 비교하지 않는다. 실제 변경이 이미 반영돼 “변경 없음”으로 오판할 수 있기 때문이다. 원문 담당이 이미 새 이름이면 단순 값 비교만으로는 기존 구조화 동선 불일치를 찾을 수 있으므로 담당 칸 이탈을 명시적 재동기화 경계로 쓴다. 출처가 없는 모든 옛 동선을 자동 소유로 간주하지도 않는다. 사용자가 직접 만든 수동 동선을 지울 위험이 있으므로 포스트와 담당 메모가 정확히 대응하는 레코드만 교체한다.
- **재사용 규칙**: 실시간 구독 상태를 기준으로 파생 데이터를 함께 저장할 때는 변경 판정을 첫 `await` 전에 스냅샷으로 고정하고, 기존 불일치의 재동기화 진입점을 따로 둔다. 비동기 완료 시에는 저장한 스냅샷과 현재 초안을 다시 비교해 새 입력을 보존하며, 소유권 메타데이터가 없는 레거시는 의미 필드의 보수적 일치 검증을 통과한 항목만 자동 데이터로 승격한다.
