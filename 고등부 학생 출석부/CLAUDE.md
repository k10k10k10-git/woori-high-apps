# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 프로젝트 개요

분당우리교회 고등부 출석 관리 PWA. Firebase Realtime Database를 백엔드로 사용하는 Next.js App Router 앱이며, Firebase Hosting에 정적 배포된다.

동일한 Firebase 프로젝트(`woori-high`)를 공유하는 앱이 4개 있다:
- **이 앱** (`woori-attendance-next`) — 학생 출석부 (`classes/`, `attendance/`, `events/` 경로 사용)
- **수련회 행정 사이트** — 동일한 `classes/`, `attendance/` 경로를 공유하므로 이 앱의 변경이 수련회 앱에도 반영됨
- **수련회 이가드 사이트** — `retreats/`, `iguard*`, `prepMilestones/` 경로 사용
- **교사/스탭 앱** (`woori-staff-nextjs`) — `staff_members/`, `staff_attendance/` 등 `staff_` prefix 경로를 따로 사용

## 개발 명령어

```bash
npm run dev          # 개발 서버 (localhost:3000)
npm run build        # 정적 빌드 → out/ 폴더
npm test             # Vitest 단위 테스트 실행 (vitest run)
npm run test:watch   # Vitest 워치 모드
firebase deploy --only hosting   # 빌드 + SW 캐시 이름 갱신 + Firebase 배포
firebase deploy --only database  # 보안 규칙만 배포
```

배포 시 predeploy 훅이 자동으로 `public/sw.js`의 `CACHE_NAME`을 오늘 날짜(KST)로 갱신한다(`woori-att-YYYYMMDD`). SW 캐시 이름이 바뀌면 기존 사용자 화면에 업데이트 배너가 표시된다.

## 테스트

Vitest 기반 단위 테스트. 설정 파일은 `vitest.config.ts`이며 `@/` alias가 `./src`로 해석된다.

테스트 파일 위치: `__tests__/`
- `calcStats.test.ts` — `calcStats()` 출석 통계 계산 함수 테스트
- `dates.test.ts` — `evKey()`, `getSundaysForYear()`, `buildHolidayRanges()`, `emailToKey()`, `escapeHTML()`, `sortAndRenumber()` 등 날짜/유틸 함수 테스트

새 유틸 함수를 추가하거나 변경할 때는 `__tests__/`에 대응하는 테스트를 작성한다.

## 아키텍처

### 디렉토리 구조

```
src/
  app/                       # Next.js App Router 라우트 (각 탭의 단순 래퍼)
    layout.tsx
    page.tsx                 # → /attendance 로 리다이렉트
    attendance/page.tsx
    manage/page.tsx
    stats/page.tsx
    overall/page.tsx
    admin/page.tsx
    api/ai/route.ts
  components/
    AppShell.tsx             # 인증 게이트, TopBar, TabNav, Toast, UpdateBanner
    ClassTabBar.tsx          # 반 선택 탭 바 (공유 컴포넌트, role="tablist")
    ErrorBoundary.tsx
    FirebaseDataLoader.tsx   # onValue 구독 담당, 렌더링 없음
    LoginScreen.tsx
    TabNav.tsx
    Toast.tsx
    TopBar.tsx
    UpdateBanner.tsx
    modals/
      AddClassModal.tsx
      AttModal.tsx
      HistoryModal.tsx       # createPortal → document.body (iOS Safari 대응)
      MoveStudentModal.tsx
      RosterModal.tsx
      StudentModal.tsx
      TeacherModal.tsx
      TrashModal.tsx
    tabs/
      AttendanceTab.tsx
      ManageTab.tsx
      StatTab.tsx
      AdminTab.tsx
      OverallTab.tsx         # 서브 페이지 라우터 (대시보드/교사·학생 명단/건의사항)
      overall/               # OverallTab 서브 컴포넌트
        OverallDashboard.tsx   # 출석 통계 차트 + 반별 출석률 테이블
        TeacherManagement.tsx  # 교사 명단 관리 (부장/회계/행정, 담임 추가정보)
        StudentListSection.tsx # 전체 학생 명단 내보내기 (CSV/XLSX/PDF)
        SuggestionsSection.tsx # 교사 건의사항 조회·삭제
  hooks/
    useAuth.ts
    useFirebaseData.ts
  lib/firebase/
    client.ts
  store/
    AppContext.tsx            # useReducer 전역 상태 + 셀렉터 함수
  types/
    index.ts
  utils/
    chartSetup.ts            # Chart.js 공유 초기화 (중복 등록 방지)
    dates.ts                 # 날짜·주일·출석 키 계산
    export.ts                # CSV/XLSX/PDF 내보내기 공유 유틸
    image.ts                 # 학생 사진 압축 (캔버스 리사이즈, 320px·JPEG 0.72)
    toast.ts
  lib/
    sheetSync.ts              # 구글 시트 → Firebase 동기화 로직 (장결자 감지 포함)
__tests__/                   # Vitest 단위 테스트
  calcStats.test.ts
  dates.test.ts
vitest.config.ts
database.rules.json          # Firebase RTDB 보안 규칙 (4개 앱 공유!)
```

### 라우팅 vs. 탭 구조

Next.js App Router 라우트(`/attendance`, `/manage`, `/stats`, `/overall`, `/admin`)가 있지만, 각 라우트 페이지는 해당 탭 컴포넌트를 렌더링하는 단순 래퍼다. 실제 UI는 `AppShell`이 감싸는 단일 레이아웃(TopBar + TabNav + content-area) 안에서 동작한다.

```
layout.tsx
  └── AppProvider (전역 상태 — useReducer)
        └── AppShell (인증 게이트, TopBar, TabNav, Toast, UpdateBanner)
              └── FirebaseDataLoader (onValue 구독 담당, 렌더링 없음)
              └── [page] → AttendanceTab / ManageTab / StatTab / OverallTab / AdminTab
```

`OverallTab`은 내부에 자체 탭 UI(대시보드 / 교사·학생 명단 / 건의사항)를 가지며, 각 서브 페이지를 `overall/` 디렉토리의 독립 컴포넌트로 분리해 렌더링한다.

### 공유 컴포넌트

- **`ClassTabBar`**: 반 선택 UI. `role="tablist"` + `role="tab"` + `aria-selected` 적용. `AttendanceTab`, `ManageTab`, `StatTab`에서 공유한다.

### 공유 유틸리티

- **`src/utils/export.ts`**: `downloadCSV()`, `downloadXLSX()` (xlsx 라이브러리 dynamic import), `openPrintWindow()` — `StatTab`과 `StudentListSection`에서 사용.
- **`src/utils/chartSetup.ts`**: `getChart()` — Chart.js를 한 번만 등록하고 캐싱 반환. `StatTab`과 `OverallDashboard`에서 공유.

### 전역 상태 (`src/store/AppContext.tsx`)

`useReducer` 기반의 단일 Context. **모달 open/close 상태도 모두 여기서 관리**한다. 컴포넌트에서 직접 `useState`로 모달을 열지 않고 `dispatch({ type: 'OPEN_*_MODAL' })` 패턴을 사용한다.

주요 셀렉터 함수 (같은 파일에서 export):
- `useClassKey(state)` → 현재 선택된 반의 키 (`"1-2-3"`)
- `useClassKeys(state)` → 현재 부/학년의 반 키 목록 (교사 계정이면 본인 반만)
- `useCurrentStudents(state)` → 현재 반 학생 배열
- `calcStats(state, ck, sid)` → 한 학생의 출석 통계

### Firebase 데이터 구조

**클래스 키 (ck)**: `"{part}-{grade}-{class}"` (예: `"1-2-3"` = 1부 2학년 3반)

**학생 ID (sid)**:
- 일괄 임포트된 학생: `S{grade}{class}_{num:02d}` (예: `S23_01`, `S311_01`)
- 앱에서 추가된 학생: `s_${Date.now()}`

`personId`는 연도별 sid와 별개인 영구 인물 식별자다. 기존 sid·`pid`·출석 경로는 절대 교체하지 않고, 학생 추가·명단 교체·시트 동기화·진급·이동·편집에서 `person_student_*` 값을 보존한다. 교사·스탭 명단은 각각 `person_teacher_*`, `person_staff_*` namespace를 사용한다.

**출석 셀 키**: `evKey(mi, di)` = `"{monthIndex}-{sundayIndex}"` (예: `"0-0"` = 1월 첫 번째 주일, `"4-1"` = 5월 두 번째 주일). `mi`는 0부터 시작하는 월 인덱스, `di`는 해당 월의 주일 순번.

**출석 값 (AttValue)**: `"O"` (출석) / `"X"` (결석) / `"T"` (지각) / `""` (미입력)

**Firebase DB 경로**:
```
classes/{year}/{ck}/
  teacher          string
  teacherPhoto     string
  students/{sid}/  { id, personId?, num, name, birth, phone, pphone, school, addr, photo, jang? }
                   # jang: true = 장결자(장기결석) — 구글 시트 동기화 시 자동 표시(아래 참조)
  adminChanges/{changeId}/ { changedAt, classKey, teacher, studentName, action, changeSummary, result, actor }

attendance/{year}/{ck}/{sid}/{cellKey}  → "O" | "X" | "T"

events/{year}/{key}/   { month, day, label }   (관리자 등록 커스텀 이벤트)

userRoles/{emailKey}/  { role, part, grade, class, name, email }
  emailKey = email.replace('.', '__dot__').replace('@', '__at__')

trash/{year}/students/{sid}    (삭제된 학생, 7일 보관)
trash/{year}/classes/{ck_}     (삭제된 반, '-' → '_')

suggestions/{year}/{ck}/       (교사 건의사항)
teacherData/{year}/{part}/     (교사 명단)
teacherSpecial/{year}/{part}/  (부장/회계/행정)
teacherExtra/{year}/{part}/{ck}/  (담임 추가정보)
```

### 날짜/출석 키 계산 (`src/utils/dates.ts`)

- `getSundaysForYear(year)` → 연도의 모든 주일을 월별로 반환 (`MonthEntry[]`)
- `buildHolidayRanges(windowYears)` → 설날/추석 연휴 범위 (2024–2030 하드코딩)
- `buildEvents(...)` → 연휴 + 커스텀 이벤트를 합쳐 `EventsMap` 반환
- `evKey(mi, di)` → `"${mi}-${di}"` 형식 셀 키
- 이벤트 맵에 키가 있는 주일은 출석 통계 계산에서 제외됨

### CSS

CSS 모듈 없음. `src/app/globals.css` 하나에 모든 스타일이 있다. `:root`에 CSS 변수 정의:
- 색상: `--primary` (`#9B8DD4` 보라), `--green`, `--red`, `--amber` 및 각각의 `-bg`, `-text` 변형
- 레이아웃: `--radius` (`10px`), `--radius-lg` (`16px`), `--shadow`, `--shadow-lg`
- 모달: `.modal-overlay` + `.modal-sheet` (바텀 시트), `.modal-overlay.center-modal` (중앙 다이얼로그)

컴포넌트 내 인라인 스타일에서 `var(--primary)` 등 CSS 변수를 직접 참조하는 패턴이 많다.

### 모달 패턴

대부분의 모달은 `.modal-overlay` + `.modal-sheet` 구조(하단 바텀 시트)다.

**접근성**: 모든 모달 컴포넌트에 `role="dialog"`, `aria-modal="true"`, ESC 키 닫기 핸들러가 적용되어 있다. 새 모달을 만들 때 이 패턴을 반드시 따른다:
```tsx
// 표준 모달 접근성 패턴
<div className="modal-overlay" role="dialog" aria-modal="true">
  {/* ESC 핸들러 */}
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, []);
</div>
```

적용된 모달: `StudentModal`, `HistoryModal`, `AttModal`, `AddClassModal`, `MoveStudentModal`, `TeacherModal`, `TrashModal`, `RosterModal`, `TeacherManagement` 내부 모달.

**중요 예외 — `HistoryModal`**: iOS Safari에서 `.content-area`의 `-webkit-overflow-scrolling: touch`가 stacking context를 만들어 `position: fixed` 모달이 TabNav 뒤로 갇히는 문제가 있다. 이 모달만 `createPortal(..., document.body)`로 `document.body`에 직접 렌더링한다. 같은 문제가 다른 모달에서 발생하면 동일하게 해결한다.

바텀 시트 드래그 닫기는 native `addEventListener`를 사용한다 — React 합성 이벤트의 `onTouchMove`는 passive라 `preventDefault()` 불가. `dismiss` 콜백은 `useCallback(fn, [])` (빈 deps)로 고정하고, `onClose` prop은 ref(`onCloseRef`)에 보관해 Firebase 실시간 업데이트로 인한 리렌더링 시에도 리스너가 교체되지 않도록 한다.

### 인증 및 권한

- `admin`: 모든 반 읽기/쓰기, 학생/반 추가·삭제, 계정 관리, 이벤트 등록, 진급 처리
- `teacher`: 본인 반(`part-grade-class`)만 출석 수정 및 학생 관리, 건의사항 작성

**관리자 권한 노드는 두 개다 (2026-08-06 분리).** `userRoles.role`은 화면 UI용이고, 실제 DB 권한은 아래 노드가 결정한다.

| 노드 | 부여 대상 | 이 앱 | 고등부 사역 플랫폼 |
|---|---|---|---|
| `admins/{uid}` | 플랫폼 통합관리자 | 전권 | 전권 + 역할 배정 + 민감정보 |
| `attendanceAdmins/{uid}` | 출석부 전용 관리자 | 전권 | **접근 불가** |

출석부만 맡는 계정에는 반드시 `attendanceAdmins`를 준다. `admins`를 주면 학기·수련회·이가드 전권과 역할 배정 권한까지 함께 간다. 두 노드 모두 **앱에서 스스로 부여할 수 없다**(기존 관리자만 쓰기 가능) — 최초 1건은 Firebase Console에서 넣고, 이후에는 기존 관리자가 추가한다. `loadUserRole`은 부여 시도를 하지 않고 보유 여부만 확인해 안내한다.

Firebase 보안 규칙에서 `teacherClasses/{uid}` = classKey로 담당 반을 확인한다.

**읽기 권한도 본인 반으로 제한됨**: `classes`/`attendance`의 `.read`는 admin·retreatAdmins·iguardMembers(전체) + 교사는 `teacherClasses/{uid}===classKey`(본인 반만). `useFirebaseData.ts`가 교사 로그인 시 `classes/{year}/{ck}`(본인 반)만 구독하고, 관리자는 `classes/{year}` 전체를 구독한다. `loadUserRole`은 `teacherClasses/{uid}` 쓰기를 **await**해야 함 — read 규칙이 이 값을 즉시 참조하므로 구독 전에 반드시 기록돼 있어야 한다.

### Firebase 보안 규칙 (`database.rules.json`)

> **이 파일이 Firebase 프로젝트 `woori-high`의 유일한 배포용 보안 규칙 원천이다.**
> `firebase deploy --only database`는 반드시 이 프로젝트(학생 앱)에서만 실행한다.
> 다른 앱(행정, 이가드)의 rules 파일은 `DO_NOT_DEPLOY` 접두사로 보관용이며 배포에 사용하지 않는다.

주요 규칙 특이사항:
- `admins` 노드: bootstrap 조건 제거됨 — 최초 admin은 Firebase Console에서 직접 추가해야 함
- `teacherExtra` 쓰기 규칙: classKey에 하이픈(`-`)이 포함되므로 `.replace('-','_')`을 3회 체이닝하여 Firebase 경로의 `_`와 매칭 (`replace`는 첫 매치만 치환하므로 3번 호출)
- `attendanceAdmins`: 출석부 전용 관리자. 이 앱이 쓰는 21개 규칙(`classes`·`attendance`·`events`·`teacher*`·`config`·`trash`·`suggestions`·`userRoles`·`teacherClasses`)에만 OR로 포함되고, 플랫폼 노드(`retreats*`·`iguard*`·`semesters*`)와 `admins`에는 **절대 넣지 않는다** — 이게 권한 분리의 전부다.
- `classes`/`attendance`: read 규칙이 관리자(admin·attendanceAdmins·retreatAdmins·iguardMembers) 전체 + 교사는 본인 반(`teacherClasses` 매칭)만 — 행정·이가드 앱이 비관리자 계정으로 전체 `classes`를 읽으므로 단순 admin-only로 잠그면 그 앱들이 깨진다(반드시 `retreatAdmins`/`iguardMembers`도 허용목록에 포함).
- `semesters`: read는 `admins`·`retreatAdmins`·`iguardMembers`(2026-08-08 추가 — 고등부 사역 플랫폼의 "스탭=학기 조회만" 역할), **write는 `admins`·`retreatAdmins`만**. 연락처·지원 동기가 있는 `semestersPrivate`는 read/write 모두 행정 전용으로 유지한다 — 학기 쪽 새 민감 필드는 반드시 `semestersPrivate` 아래에 둔다.

### 학생 데이터 쓰기 패턴 — 단일 경로만 수정 (전체 덮어쓰기 금지)

Firebase Realtime Database SDK와 초기화 객체는 `src/lib/db.ts`에서만 노출한다. 컴포넌트와 데이터 훅은 `firebase/database` 또는 `src/lib/firebase/client.ts`의 `db`를 직접 import하지 않고 `@/lib/db`를 사용한다. 인증의 `auth`만 `src/lib/firebase/client.ts`에서 직접 가져올 수 있다.

`StudentModal`(저장/삭제), `MoveStudentModal`(이동)은 반 전체 명단(`classes/{year}/{ck}/students`)을 통째로 `set()`하지 않고, 항상 **해당 학생 1명의 경로만** `update()`한다:
```typescript
// ✅ 올바른 방법 — 단일 학생 경로만 갱신
await update(ref(db), { [`classes/${year}/${ck}/students/${id}`]: newStudent });

// ❌ 금지 — 반 전체를 덮어씀, 동시 편집 시 다른 사람의 변경이 사라짐
await set(ref(db, `classes/${year}/${ck}/students`), allStudentsObj);
```
관리자 명단 변경은 같은 루트 `update()`에 `classes/{year}/{ck}/adminChanges/{changeId}`도 함께 넣는다. 원본 변경만 성공하고 행정 이력이 빠지는 상태를 만들지 않으며, 감사기록에는 연락처·주소의 실제 이전/이후 값 대신 변경된 필드 이름만 저장한다. 일반 교사 출석 입력은 이 행정 이력 대상이 아니다.

번호(`num`)는 저장 시점에 계산하지 않는다 — 읽을 때 `sortAndRenumber()`가 항상 재계산하므로 저장값이 어긋나도 자동 보정된다. `RosterModal`(명단 일괄 교체)만 예외 — 사용자가 명시적으로 "교체"를 확인한 뒤 루트 `update()`에서 `students` 전체 값과 감사기록을 함께 반영한다.

통합 앱의 새친구 탭은 현재 Rules가 허용하는 통합관리자(`admins`)에 한해 신규 학생 1명을 같은 단일 경로 규칙으로 추가할 수 있다. `highschool-app/src/features/semester/db.ts`의 `registerNewFriendInRoster`만 예외이며, 결정적 `nf_` 학생 ID·동명이인 차단·대상 반 확인·비공개 사전 스냅샷·새친구 반영 이력과의 원자 update를 유지한다. 기존 학생 수정·이동·삭제와 출석 쓰기는 계속 이 앱만 담당한다.

### 학생 사진 (`src/utils/image.ts`)

`StudentModal`에서 사진 업로드 시 `compressImage()`로 캔버스 리사이즈(최대 320px)·JPEG 압축(품질 0.72) 후 base64로 저장한다. `classes/{year}` 전체를 4개 앱이 `onValue`로 구독하므로, 압축 없이 원본을 저장하면 트리 전체 로딩이 무거워진다.

### 로딩 게이트 타임아웃 (`AppShell.tsx`)

Firebase `onAuthStateChanged` 콜백이 끝내 오지 않으면(캐시/네트워크 문제 등) 무한 스피너 상태가 될 수 있다. `authState === 'loading'`이 12초 넘게 지속되면 스피너 대신 "새로고침" 버튼을 보여준다.

### PWA / 서비스 워커 (`public/sw.js`)

- 캐시 전략: 네트워크 우선, 실패 시 캐시 폴백
- 다음 URL은 SW를 통하지 않고 통과시킨다: `firebase`, `googleapis`, `gstatic`, `/_next/`, `/__nextjs`, `__next.` (RSC 페이로드 파일)
- 새 버전 감지: activate 이벤트에서 이전 캐시 삭제 후 모든 클라이언트에 `{ type: 'NEW_VERSION' }` 메시지 전송 → `AppShell`이 수신해 `UpdateBanner` 표시

### 구글 시트 동기화 (`src/lib/sheetSync.ts`) — 장결자(장기결석) 처리

관리자 탭의 "구글 시트 동기화" 기능은 출석부 시트 → Firebase로 명단·출석을 일괄 반영한다. 시트의 반 탭은 평시 학생(번호 1..N) 다음 **번호가 1로 재시작**하며 장결자 명단이 이어지는 구조 — `parseClassCsv`가 번호 역행(`num < prevNum`)을 감지해 그 이후 학생을 `jang: true`로 표시한다. 장결자 sid는 평시 학생과 번호가 겹치므로 `S{학년}{반}_J{NN}`(J 접두사)으로 충돌을 피한다.

`buildSyncPayload`가 `jang: true`를 Firebase에 함께 기록하며, 수련회 행정 사이트의 신청자 취합 화면(`ClassRosterTab`)이 이 필드를 읽어 장결자를 별도 구역으로 분리 표시한다. 1부·2부를 반드시 함께 동기화해야 부 간 이동 학생이 정확히 잡히는 점은 기존과 동일.

### 외부 데이터 임포트

스프레드시트 → Firebase 일괄 임포트가 필요할 때는 `~/.config/configstore/firebase-tools.json`의 Firebase CLI access token을 사용해 RTDB REST API(`{DB_URL}/{path}.json?access_token={token}`)로 직접 쓴다. `firebase deploy`로 이미 인증된 상태라면 별도 서비스 계정 없이 가능하다.
