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
│       ├── ScheduleView.tsx        # 스탭 전체 큐싯 (시간블록 CRUD + 시트 임포트)
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
│   └── useRetreatData.ts           # 데이터 허브 — 17개 Firebase 실시간 구독 중앙 관리
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
    └── exportUtils.ts              # printAsPDF (인쇄용 HTML → 새 창 인쇄)

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
  attendance/                       # 인원체크 상태 (checked: boolean)
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
