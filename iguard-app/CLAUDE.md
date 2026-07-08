# iguard-app — 수련회 이동가이드(이가드) 사이트

교회 고등부 수련회의 **현장 이동 동선, 인원체크, 식사 순서, 버스 배정, 자리배치, 스탭 동선 매트릭스** 등을 실시간으로 관리하는 모바일 우선 웹앱.
행정 사이트(retreat-app)가 관리하는 참가자/조편성/방배정 데이터를 읽기 전용으로 소비하고, 이가드 고유 데이터(`iguard/*` 네임스페이스)만 쓴다.

---

## 기술 스택

| 항목 | 내용 |
|---|---|
| 프레임워크 | Next.js 16.1.7 (App Router) |
| UI | React 19, Tailwind CSS 4 |
| 언어 | TypeScript 5 (strict mode) |
| 데이터베이스 | Firebase Realtime Database (프로젝트: `woori-high`) |
| 인증 | Firebase Auth (Google OAuth) |
| 테스트 | Vitest 3 |
| 배포 | Vercel |
| 의존성 | firebase, next, react, react-dom (4개, 최소화 유지) |

---

## 디렉터리 구조

```
src/
├── app/
│   ├── page.tsx                    # 홈 (수련회 목록 + 준비 일정 캘린더, 행사 날짜 최신순 정렬, md 기준 모바일/데스크탑 분기)
│   ├── PrepCalendar.tsx            # 준비 일정 캘린더 (마일스톤·수련회 기간 표시) — 기간은 전체 수련회 합쳐서 표시
│   ├── TeamModal.tsx               # 팀원 관리 모달 (admin 전용 — 승인/거절/역할 변경)
│   ├── UpdateBanner.tsx            # 새 배포 감지 배너 (NEXT_PUBLIC_BUILD_ID 폴링)
│   ├── api/version/route.ts        # 현재 배포 빌드 ID 반환 (UpdateBanner가 폴링)
│   ├── layout.tsx                  # RootLayout (lang="ko", viewport 설정)
│   ├── providers.tsx               # InAppBrowserGuard → AuthProvider → UIProvider 래핑
│   └── retreat/[id]/
│       ├── page.tsx                # 서버 컴포넌트 entry → IguardClient
│       ├── IguardClient.tsx        # 탭 라우터 (실행/기획/정보 3그룹, 16개 뷰)
│       ├── ChecklistView.tsx       # 인원체크 (조별 학생+교사 체크, 버스별 체크)
│       ├── RoomsView.tsx           # 조별 정보 (방배정·학생·교사 조회)
│       ├── ExecutionViews.tsx      # 개인 큐카드 + 포스트 보드 (현장 모바일용)
│       ├── ScheduleView.tsx        # 스탭 전체 큐싯 (시간블록 CRUD + 시트 임포트, src/lib/cueSheet.ts의 parseCueSheetText 사용)
│       ├── LeaderCueManageView.tsx # 조장 큐싯 관리
│       ├── PostsView.tsx           # 포스트(통제 지점) CRUD
│       ├── StaffView.tsx           # 스탭 명단 (읽기 전용, 행정 teachers 기반)
│       ├── MovementsView.tsx       # 동선 매트릭스 (스탭 × 시간블록 → 포스트 배정)
│       ├── ValidationView.tsx      # 검증 (시간 겹침, 미배정 공백, 고아 동선 경고)
│       ├── GroupStaffView.tsx      # 조스탭 배정
│       ├── MealsView.tsx           # 식사 순서 (조별 배식 순서)
│       ├── BusesView.tsx           # 버스(호차) 배정
│       ├── SeatingView.tsx         # 집회 자리배치 (구역별 조 배정)
│       ├── FairAssignButton.tsx    # 공정 배분 버튼 (식사+자리 통합 배정)
│       └── InfoViews.tsx           # 조스탭 가이드 + 준비 할일
├── hooks/
│   └── useRetreatData.ts           # 데이터 허브 — 17개 Firebase 실시간 구독 + 연결 상태(.info/connected) 중앙 관리
├── components/
│   ├── InAppBrowserGuard.tsx       # 인앱 브라우저 감지 → 외부 브라우저 유도
│   └── CenterSpinner.tsx           # 공용 로딩 스피너
├── context/
│   ├── AuthContext.tsx             # Google OAuth, AccessLevel(none/staff/team/admin) 관리
│   └── UIContext.tsx               # toast(), uiConfirm() 전역 UI (aria-live, 포커스 트랩)
└── lib/
    ├── types.ts                    # 전체 타입 (행정 읽기 전용 + 이가드 소유 구분 주석)
    ├── db.ts                       # Firebase CRUD 유일 접근 레이어 (읽기/쓰기 영역 명시 구분)
    ├── firebase.ts                 # Firebase 초기화 (db, auth, googleProvider)
    ├── snapToList.ts               # DataSnapshot → T[] 변환 헬퍼 (null/배열/원시값 안전 처리)
    ├── compat.ts                   # 행정 데이터 형태 계약 런타임 점검 (classKey, studentId, bu 검증)
    ├── fairAssign.ts               # 공정 배분 알고리즘 (식사 순서 + 집회 자리 통합 누적 점수)
    ├── groupNumber.ts              # 조 전역 번호 표시 (2부는 1부 조 수만큼 오프셋)
    ├── partialAttendance.ts        # 부분참(선복귀/후발대) 일자별 참석 공식
    └── exportUtils.ts              # printAsPDF (인쇄용 HTML → 새 창 인쇄), escapeHtml(인쇄 XSS 방지)

루트 파일:
├── DO_NOT_DEPLOY.database.rules.json  # 보관용 규칙 사본 (배포 금지 — 배포용 원천은 학생 앱)
├── vitest.config.ts                # 테스트 설정 (@ 경로 별칭)
├── vercel.json                     # Vercel 배포 설정
├── next.config.ts                  # Next.js 설정 (빈 설정)
├── eslint.config.mjs               # ESLint 설정
└── __tests__/                      # 단위 테스트 (snapToList, compat, groupNumber, partialAttendance)

scripts/                            # 일회성 마이그레이션 스크립트 (운영 DB 패치용)
backups/                            # 마이그레이션 전 백업 스냅샷
```

---

## Firebase DB 구조 — 이 앱이 사용하는 경로

### 읽기 전용 (행정 앱 소유 — 절대 쓰기 금지)

```
retreats/{retreatId}/
  name, year, startDate, endDate, createdAt  # 수련회 메타 (createdAt은 정렬용, 행정에서 기록)
  groups/                           # 조편성 (Group[])
  rooms/                            # 방배정 (Room[])
  participants/                     # 참가자 (Record<string, Participant>)
  teachers/                         # 교사/스탭 참석 현황 (TeacherAttendance[])
  partialAttendances/               # 부분참 분류 (선복귀/후발대)
  cellColors/                       # 참가자 셀 색상 (취소/불참 표시)
  periods/                          # 수련회 기간 (RetreatPeriod[]) — DB는 수련회별 소유지만
                                     #   홈 화면은 모든 수련회의 기간을 항상 합쳐서 표시(아래 패턴 8 참조)

classes/{year}/                     # 학급 명단 (classKey = "{부}-{학년}-{반}"), students에 jang?(장결자) 필드 포함 가능
admins/{uid}                        # 마스터 관리자 (true)
retreatAdmins/{uid}                 # 행정 사이트 멤버
```

### 읽기+쓰기 (이가드 소유)

```
retreats/{retreatId}/iguard/
  meals/                            # 식사 세션 (IguardMeal — 조별 배식 순서)
  schedule/                         # 타임테이블 시간 블록 (IguardScheduleBlock)
  posts/                            # 포스트(통제 지점) 정의 (IguardPost)
  movements/                        # 동선 매트릭스 (IguardMovement — 키: staffId__blockId)
  buses/                            # 버스 배정 (IguardBus)
  seating/                          # 집회 자리배치 (IguardSeating)
  attendance/                       # 인원체크 상태 ({ checked, updatedAt?, by? } — 키는 encodeURIComponent(원본키))
                                     #   checked:false = 해제 톰스톤(삭제 대신 기록 — 오프라인 낡은 체크 부활 방지)
                                     #   by = 체크/해제한 스탭 이름. 하위호환: 구버전 true/{checked:true}도 구독에서 지원
                                     #   동시 사용 안전화(패턴 15) 적용 노드
  groupStaff/                       # 조스탭 배정 (groupId → staffId[])
  guide/                            # 조스탭 가이드 (string[])
  cueSheet/                         # 큐싯 시트 연동 설정 (url, sheetId, gid 등)

iguardMembers/{uid}                 # 이가드 팀원 허용목록 ({ email, name? })
iguardRoles/{uid}                   # 역할 ("team" | "staff")
iguardPending/{uid}                 # 승인 대기 ({ email, name, requestedAt })

prepMilestones/                     # 🌐 전역 공유 — 준비 일정 (행정·이가드 양방향 읽기/쓰기)
```

### 데이터 소유권 요약

| 노드 | 소유자 | 이가드 권한 |
|---|---|---|
| `retreats/{id}/groups`, `rooms`, `participants`, `teachers` 등 | 행정 앱 | **읽기 전용** |
| `retreats/{id}/iguard/*` | 이가드 앱 | 읽기+쓰기 |
| `prepMilestones/` | 공유 | 읽기+쓰기 |
| `iguardMembers/`, `iguardRoles/`, `iguardPending/` | 이가드 앱 | 읽기+쓰기 |
| `admins/`, `retreatAdmins/` | 행정 앱 | 읽기 전용 |

---

## 핵심 코드 패턴

### 1. useRetreatData — 17개 구독 중앙 관리 (`src/hooks/useRetreatData.ts`)

모든 Firebase 실시간 구독을 하나의 커스텀 훅에서 관리. `IguardClient`에서 호출하고, 개별 뷰에 필요한 데이터를 props로 내린다.

- 수련회 메타 구독(`subscribeToRetreat`)이 먼저 완료되어야 `retreatYear`를 알 수 있고, 이후 17개 데이터 구독이 시작됨
- `pending` Set으로 모든 구독의 첫 콜백을 추적 → 전부 도착하면 `dataLoading = false`
- cleanup에서 모든 unsubscribe 호출
- **모든 데이터 구독은 `onError` 콜백을 받는다** — `fail(key)` 핸들러가 `loadError`를 설정하고 해당 키를 `ready` 처리한다. 이게 없으면 구독 실패 시 `pending`이 안 비워져 무한 스피너가 된다(패턴 16). `db.ts`에 새 구독을 추가할 땐 시그니처에 `onError?: (error: Error) => void`를 포함하고 여기서 `fail(...)`을 넘길 것.

### 2. Auth + 접근 레벨 (`src/context/AuthContext.tsx`)

```
AccessLevel = "none" | "staff" | "team" | "admin"
```

| 레벨 | 조건 | 권한 |
|---|---|---|
| `admin` | `admins/{uid} = true` | 전체 + 팀원 관리(승인/거절) |
| `team` | `retreatAdmins/{uid}` 또는 `iguardMembers + role=team` | 실행·기획·정보 전체 편집 |
| `staff` | `iguardMembers + role=staff` | 실행 탭만 (기획·정보 숨김) |
| `none` | 미승인 | 접근 불가 (요청 화면) |

### 3. InAppBrowserGuard (`src/components/InAppBrowserGuard.tsx`)

카카오톡, 네이버, 인스타 등 인앱 브라우저에서 Google OAuth가 차단되므로:
- 인앱 브라우저 감지 시 외부 브라우저(Chrome/Safari) 열기 시도
- Android: `intent://` URL로 Chrome 실행
- iOS: `window.location.href` 방식
- 안 열리면 안내 UI 표시 + 링크 복사 버튼

`providers.tsx`에서 최외곽 래핑: `InAppBrowserGuard → AuthProvider → UIProvider`

### 4. UIContext — toast + confirm (`src/context/UIContext.tsx`)

- `toast(message, type)`: 자동 사라짐(3.5s), `aria-live="polite"` 적용
- `uiConfirm(message)`: Promise 기반 확인 모달, 포커스 트랩 + ESC 닫기

### 5. 스탭 단일 원천 — 행정 teachers

이가드는 스탭 데이터를 **직접 생성/수정하지 않는다.** 행정의 `retreats/{id}/teachers`(bu="스탭")가 단일 원천이며, `IguardClient.teachersToStaff()`가 행정 TeacherAttendance → IguardStaff로 변환한다.

### 6. 공정 배분 알고리즘 (`src/lib/fairAssign.ts`)

식사 순서 + 집회 자리배치를 **통합 누적 점수**로 계산:
- 앞순서/앞자리를 받으면 점수가 오르고 → 다음 세션에서는 뒤로 밀림
- 시간순 전 세션을 처리하여 전체를 균등화
- seed 매개변수로 첫 세션 회전값 조절 (재실행 시 다른 공정한 배치)

### 7. 행정 데이터 형태 계약 점검 (`src/lib/compat.ts`)

행정이 classKey 형식이나 조 bu 규칙을 바꾸면 이가드가 조용히 깨지는 것을 방지. 로드 시 데이터를 검사하고 의심 신호를 경고로 표면화.

### 8. 수련회 기간(periods) — DB는 수련회별 소유, 화면은 전체 합산 표시

행정 사이트와 동일한 패턴(읽기 전용). `db.ts`의 `subscribeToAllRetreatPeriods(retreatIds, cb)`가 전체 수련회의 `periods`를 각각 구독해 merge하고, 각 기간에 소유 수련회 ID를 붙인 `RetreatPeriodWithOwner` 타입으로 반환한다. 홈 화면은 어느 수련회를 선택했든 모든 수련회의 기간을 같이 보여준다(마일스톤과 동일 패턴). `getEarliestPeriodDateByRetreat(retreatIds)`(일회성 `get()`)로 각 수련회의 가장 이른 기간 시작일을 구해, 수련회 목록을 **행사 날짜 최신순**으로 정렬한다(생성일 아님 — 수련회를 미리 등록해도 실제 행사 날짜 기준으로 정렬).

### 9. UpdateBanner — 새 배포 감지 (서비스워커 없이)

행정 사이트와 동일한 빌드 ID 폴링 방식. `next.config.ts`가 `NEXT_PUBLIC_BUILD_ID`(Vercel 커밋 SHA, 로컬은 타임스탬프)를 빌드 시점에 클라이언트 번들에 박아넣고, `/api/version`(`force-dynamic`)이 현재 배포의 빌드 ID를 반환한다. `UpdateBanner`가 5분마다 + 탭 visibility 변경 시 폴링해 불일치하면 새로고침 배너를 띄운다.

### 10. 큐싯 시트 임포트 — 날짜 구분행 오인식 주의 (`src/lib/cueSheet.ts`)

`parseCueSheetText`가 각 행이 "날짜 구분행"인지 "시간 블록 행"인지 판정할 때, **시간이 있는 행을 먼저 걸러낸 뒤에만** 날짜 마커(`parseDayCell`)를 검사해야 한다. "첫째날/둘째날" 같은 날짜 단어가 시간이 있는 행의 제목·내용에 섞여 있으면(예: "둘째날 오전 프로그램" 09:00~) 과거엔 날짜 구분행으로 오인해 그 블록 자체가 통째로 사라졌다(2026-07-06 수정). 큐싯 파싱 로직을 고칠 땐 반드시 이 순서(시간 유무 → 날짜 판정)를 유지할 것.

### 11. 시간 블록의 "지금" 판정 — 24시+ 표기(새벽) 처리 (`ExecutionViews.tsx`)

큐싯은 자정 넘는 일정을 `24:30~25:30` 같은 24시+ 표기로 쓰는 관행이 있다. `isNowOn`/`currentBlockFor`는 이런 블록을 **전날(day-1) 블록**으로 취급하고, 실제 시각 + 24시간을 더한 값으로 비교한다(예: 2일차 24:30~25:30 블록은 3일차 00:30 실제 시각에 "지금"으로 판정됨). 이 로직 없이 단순 시:분 비교만 하면 새벽 시간대 큐카드·포스트 보드가 전부 "일정 없음"으로 잘못 뜬다(2026-07-06 수정). 새 시간 관련 뷰를 추가할 때 이 헬퍼를 재사용할 것 — 직접 시:분 비교를 새로 짜지 말 것.

### 12. 오프라인 연결 배너 (`useRetreatData.ts` / `IguardClient.tsx`)

`.info/connected`를 구독해(`subscribeToConnection`) `IguardClient` 전역에 배너를 띄운다. 현장 와이파이가 끊긴 상태에서도 RTDB는 로컬 큐에 쓰기를 쌓고 성공한 것처럼 보이므로, 배너 없이는 인원체크·동선 변경이 조용히 유실될 수 있다(2026-07-06 추가). 새 현장용 뷰를 만들 때 이 배너가 감싸는 레이아웃 밖에 두지 말 것.

### 13. 인쇄 출력 — escapeHtml 필수 (`exportUtils.ts`)

`printAsPDF`는 조립된 HTML 문자열을 그대로 `document.write`한다. 학생 이름·특이사항 등 사용자 입력을 이스케이프 없이 삽입하면 관리자 인쇄 시 저장형 XSS가 될 수 있다(2026-07-06 수정, ChecklistView·RoomsView 적용 완료). 인쇄 HTML을 새로 조립할 때 사용자 데이터가 들어가는 자리는 반드시 `escapeHtml()`로 감쌀 것.

### 14. 버스 선탑/동승 이름 매칭 — "sf" 꼬리표 정규화 (`ChecklistView.tsx` / `BusesView.tsx`)

선탑/동승 명단은 두 소스를 합친다 — 버스배정(`iguard/buses`)의 `staff` 필드와 큐싯 notice의 "N호차: 이름, …" 줄. 큐싯 쪽엔 "박혜원sf"처럼 스탭 표시 꼬리표가 붙는 관행이 있어, `parseBusStaffNames`가 꼬리표를 떼지 않으면 두 소스의 같은 사람이 다른 사람으로 인식돼 명단에 중복 표시된다(2026-07-06 수정 — `.replace(/sf$/i, "")` 추가). 이름 비교/중복 판정 로직을 건드릴 땐 이 정규화가 유지되는지 확인할 것.

2026-07-08 보강: 파싱 기준은 `src/lib/busStaff.ts`로 공통화했다. 큐싯 선탑/동승 칸에 "부터, 이동, 카톡방에, 인원보고" 같은 안내 문장 조각이 섞여도 실제 이름만 `names`로 통과시키고, 제외된 조각은 `rejected` 경고로 표시한다. `BusesView`와 `ChecklistView`는 유효 이름만 버스 스탭 수와 호차별 체크 대상에 포함하며, `src/lib/cueSheet.ts`의 큐싯 임포트도 같은 기준으로 새 오염 데이터 저장을 막는다. 이 경로를 수정할 때는 `parseBusStaff()`/`mergeBusStaffNames()`를 재사용하고 화면별 임시 파서를 다시 만들지 말 것.

2026-07-08 추가 보강: 큐싯에서 넘어오는 "스탭 0명", "스탭 4명" 같은 요약 라벨은 이름이 아니므로 `parseBusStaff()`에서 제외해야 한다. 이 값이 명단에 섞이면 화면에는 `선탑/동승: 스탭 0명, 최현우...`처럼 보이고, 호차별 체크 대상/스탭 카운트도 오염된다. 또한 큐싯 임포트가 선탑/동승만 있는 1호차를 먼저 만든 상태에서 버스 자동배정을 눌러도, 전체 학생+교사 수에 필요한 최소 버스 수보다 기존 호차가 적으면 부족한 호차를 새로 생성해야 한다. 기존 호차의 `staff` 필드는 `busNo` 기준으로 보존하고 `groupIds`만 자동배정 결과로 갱신한다.

### 15. 인원체크 동시 사용 안전화 (`ChecklistView.tsx` / `db.ts`)

현장에서 여러 스탭이 동시에 인원체크할 때의 사고를 막는 3중 설계(2026-07-06 적용):
- **멱등 체크(A)**: 이름 탭 = "출석 확인"(항상 `checked=true`). 여러 명이 같은 학생을 동시에/중복으로 눌러도 결과가 "출석"으로 수렴한다. **해제는 별도** — 체크된 이름을 다시 누르면 `uiConfirm`을 거친다. (기존 토글 방식은 "확인하려다 오히려 해제"돼 출석 학생이 결석 처리되던 사고가 있었음.)
- **트랜잭션 + 톰스톤(B)**: `updateIguardAttendance`는 `runTransaction`으로 `updatedAt`을 비교해, 오프라인에서 늦게 도착한 낡은 쓰기가 최신 기록을 덮지 못하게 한다(재연결 시 서버값 기준 재실행). 해제는 삭제가 아니라 `checked:false` 톰스톤을 남긴다 — 삭제하면 큐에 남은 낡은 체크가 부활할 수 있음. `clearIguardAttendance`(재점호 초기화)도 같은 이유로 톰스톤을 쓴다.
- **체크자 기록(C)**: `by` 필드에 체크/해제한 스탭 이름(`user.displayName` 폴백 `email` 앞부분)을 저장하고, 체크된 이름 옆에 표시해 숫자 대조를 가능하게 한다.

⚠ 인원체크 저장 로직을 건드릴 때: ①토글로 되돌리지 말 것(멱등 유지), ②`set`/`remove` 직접 쓰지 말고 트랜잭션·톰스톤 경로를 유지할 것, ③`by` 필드는 배포된 보안규칙이 허용함(attendance 노드에 `$other` 거부 없음)을 확인함 — 규칙 변경 시 재확인.

### 16. 구독 에러 전파 — 무한 스피너 방지 (`db.ts` / `useRetreatData.ts`)

권한 거부·규칙 변경 등으로 구독이 실패하면, `onError`가 없을 때 `pending`이 안 비워져 `dataLoading`이 영원히 `true`(에러 안내 없는 무한 스피너)로 남는다. 이를 막기 위해(2026-07-06 수정):
- `db.ts`의 데이터 구독은 세 번째 인자로 `onError?: (error: Error) => void`를 받아 `onValue`의 에러 콜백으로 넘긴다.
- `useRetreatData`의 `fail(key)` 핸들러가 `loadError`를 설정하고 `ready(key)`를 호출 → `IguardClient`의 기존 에러 배너가 즉시 뜬다.
- 새 구독을 추가할 땐 반드시 이 `onError` 파라미터를 포함하고 훅에서 `fail(...)`을 넘길 것. (참고: `loadError` state·배너 UI는 오래전부터 있었으나 정작 설정하는 코드가 없어 죽은 상태였음 — "선언만 있고 연결 안 됨"의 전형.)

### 17. 현장용 뷰의 시계 tick vs 사용자 선택 (`ExecutionViews.tsx`)

`useClock()`은 30초마다 `clock.time`을 갱신한다. 이 값을 의존성으로 갖는 `useEffect`가 사용자 선택 상태를 `setState`하면, **30초마다 사용자의 선택이 자동값으로 리셋된다.** 포스트 현황(PostBoardView)에서 사용자가 고른 시간 블록이 30초 뒤 첫 블록(1일차 기도회)으로 되돌아가던 버그가 이것이었다(2026-07-06 수정). 
- 자동 선택 effect에는 **"사용자가 직접 골랐으면 유지"** 가드(`blockPicked` ref)를 두고, 일자(`day`)가 바뀔 때만 플래그를 리셋해 당일 자동 스냅을 살린다(일자 탭의 `userPicked` 패턴과 동일).
- 시계에 의존하는 계산·표시(`isNowOn`, `currentBlockFor`, 시각 표시)는 문제없다 — `setState`로 사용자 선택을 덮어쓰는 effect만 주의. 새 현장용 뷰에 "선택 상태 + 자동 추종"을 넣을 땐 이 패턴을 따를 것.

---

## API 라우트

### `GET /api/sheet-import` (`src/app/api/sheet-import/route.ts`)

구글 시트 CSV를 서버에서 프록시로 가져옴 (브라우저 직접 fetch는 CORS/307 리다이렉트 문제).

**인증**: Firebase ID 토큰 검증 (Google OAuth2 tokeninfo 엔드포인트 사용, Admin SDK 없음)
- `Authorization: Bearer <idToken>` 헤더 필수
- `aud`가 Firebase 프로젝트 ID와 일치해야 함

**SSRF 방어**:
- 시트 ID: `/^[a-zA-Z0-9_-]+$/` 검증
- GID: `/^\d+$/` 검증
- 고정 도메인(`docs.google.com`)만 접근

**응답**:
- 성공: `{ csv: string }`
- 비공개 시트: HTML 응답 감지 → 403 + 공개 설정 안내

---

## 개발 & 배포

```bash
# 개발 서버
npm run dev

# TypeScript 타입 체크
npx tsc --noEmit

# Lint
npm run lint

# 테스트 실행
npm test              # vitest run (단일 실행)
npm run test:watch    # vitest (watch 모드)

# 프로덕션 배포 (Vercel)
npx vercel --prod --yes
```

이 프로젝트는 GitHub main 브랜치 push 시 Vercel 자동배포가 정상 트리거된다(2026-07-06 확인). 같은 모노레포의 `retreat-app`은 자동배포가 안 되는 경우가 있었으니, 두 앱을 동시에 고칠 땐 각각 `npx vercel ls`로 배포 여부를 따로 확인할 것.

### 환경변수 (`.env.local`)

```
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_DATABASE_URL=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=
NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID=
```

---

## 테스트 (`__tests__/`)

Vitest 기반, `@` 경로 별칭 설정 완료 (`vitest.config.ts`).

| 파일 | 대상 | 내용 |
|---|---|---|
| `snapToList.test.ts` | `snapToList` | null/배열/원시값/빈 객체/정상 맵 변환 |
| `compat.test.ts` | `checkAdminCompat` | 파싱 이상, 학생ID 불일치 비율, bu 값 검증 |
| `groupNumber.test.ts` | `groupDisplayName` | 1부/2부 전역 번호, 커스텀 이름 |
| `partialAttendance.test.ts` | `isPresentOnDay` | 본대/선복귀/후발대 일자별 참석 |

---

## 접근성 패턴

- **모달 포커스 트랩**: `TeamModal`, `UIContext.ConfirmDialog`에서 Tab 키 순환 + ESC 닫기 + 이전 포커스 복원
- **`role="dialog"` + `aria-modal="true"` + `aria-label`**: 모든 모달에 적용
- **Toast `aria-live="polite"`**: 토스트 컨테이너에 `role="status"` + `aria-live` 적용
- **아이콘 `aria-hidden="true"`**: 장식 아이콘에 적용, 텍스트로 의미 전달
- **뷰포트 고정**: 모바일 현장 사용 기준, `maximumScale: 1`

---

## 탭 구조 (IguardClient.tsx)

| 그룹 | 뷰 키 | 탭 이름 | 접근 |
|---|---|---|---|
| **실행** (현장·모바일) | `check` | 인원체크 | 전체 |
| | `rooms` | 조별 정보 | 전체 |
| | `cue` | 개인 큐카드 | 전체 |
| | `board` | 포스트 현황 | 전체 |
| **기획** (PC) | `schedule` | 스탭 전체 큐싯 | team/admin |
| | `leadercue` | 조장 큐싯 | team/admin |
| | `posts` | 포스트 편집 | team/admin |
| | `staff` | 스탭 | team/admin |
| | `movements` | 동선 매트릭스 | team/admin |
| | `validate` | 데이터 검증 | team/admin |
| | `groupstaff` | 조스탭 배정 | team/admin |
| | `meals` | 식사순서 | team/admin |
| | `buses` | 버스배정 | team/admin |
| | `seating` | 집회자리 | team/admin |
| **정보** | `guide` | 조스탭 가이드 | team/admin |
| | `todos` | 준비 할일 | team/admin |

`staff` 역할은 **실행 그룹만** 볼 수 있음 (기획·정보 숨김).

---

## 절대 하지 말 것

1. **행정 소유 노드에 쓰기 금지**
   - `groups`, `rooms`, `participants`, `teachers`, `partialAttendances`, `cellColors`, `periods` 등은 행정 앱이 소유
   - 이가드는 `retreats/{id}/iguard/*`, `iguardMembers`, `iguardRoles`, `iguardPending`, `prepMilestones`에만 쓴다
   - `db.ts` 파일 상단의 "읽기 전용 영역" / "쓰기 가능 영역" 구분을 반드시 지킬 것

2. **컴포넌트에서 Firebase 직접 import 금지**
   ```typescript
   // 금지
   import { db } from "@/lib/firebase";
   import { get, ref } from "firebase/database";

   // 반드시 db.ts 함수만 사용
   import { subscribeToGroups } from "@/lib/db";
   ```

3. **Object.entries(snap.val()).map(...) 직접 사용 금지** → `snapToList<T>(snap)` 사용

4. **불필요한 패키지 추가 금지**
   - 현재 의존성 4개(firebase, next, react, react-dom) 최소화 유지
   - 새 패키지 추가 전 기존 라이브러리로 해결 가능한지 먼저 검토

5. **TypeScript 에러 있는 상태로 배포 금지**
   - 배포 전 `npx tsc --noEmit` 으로 0 errors 확인 필수

6. **useRetreatData 훅 밖에서 새 구독 추가 금지**
   - 모든 Firebase 구독은 `useRetreatData`에서 중앙 관리
   - 새 구독이 필요하면 반드시 이 훅에 추가

---

## WARNING: 공유 Firebase 프로젝트

이 앱은 **`woori-high` Firebase 프로젝트를 4개 앱이 공유**한다.

- **Rules 배포는 학생 앱(`고등부 학생 출석부/database.rules.json`)에서만 실행한다.**
- 이 앱의 `DO_NOT_DEPLOY.database.rules.json`은 보관용 사본이며 배포에 사용하지 않는다.
- 규칙 변경이 필요하면 학생 앱의 `database.rules.json`을 수정하고 학생 앱에서 배포한다.
- `retreatsPrivate/` 노드에는 민감 데이터(환불계좌, 의료일지 등)가 있으며 이가드 멤버는 접근 불가
