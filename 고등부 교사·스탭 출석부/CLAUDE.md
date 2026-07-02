# woori-staff-attendance — 교사/스탭 출석부

분당우리교회 고등부 교사 및 사역팀 스탭의 주일 출석을 관리하는 웹앱 (PWA).
1부/2부 교사 명단은 기존 학생 출석부 DB(`classes`)에서 실시간 동기화하고, 스탭은 사역팀별로 독립 관리한다.

---

## 기술 스택

| 항목 | 내용 |
|---|---|
| 프레임워크 | Next.js 15 (App Router) |
| UI | React 18, 순수 CSS (globals.css, CSS 변수 기반 디자인 시스템) |
| 언어 | TypeScript 5 (strict mode) |
| 데이터베이스 | Firebase Realtime Database |
| 인증 | Firebase Auth (이메일/비밀번호 로그인) |
| 상태관리 | React Context + useReducer (AppContext) |
| 배포 | Vercel (`npx vercel --prod --yes`) |
| 의존성 | firebase, next, react, react-dom (4개, 최소화 유지) |

---

## 디렉터리 구조

```
.
├── app/
│   ├── layout.tsx                  # 루트 레이아웃 (AppProvider 래핑, Noto Sans KR 폰트)
│   ├── page.tsx                    # 메인 페이지 (Auth 상태 분기 + 3개 탭 렌더링)
│   ├── globals.css                 # 전체 스타일 (CSS 변수, 컴포넌트별 클래스)
│   └── api/claude/route.ts         # Claude API Route (준비됨, 미사용)
├── components/
│   ├── LoginScreen.tsx             # 이메일/비밀번호 로그인 폼
│   ├── TopBar.tsx                  # 상단바 (연도 선택, 저장 상태 표시, 로그아웃)
│   ├── TabNav.tsx                  # 탭 네비게이션 (출석 / 통계 / 설정)
│   ├── GroupNav.tsx                # 그룹 선택 (1부 교사 / 2부 교사 / 스탭) + 사역팀 서브탭
│   ├── Toast.tsx                   # 전역 토스트 알림 (pub/sub 패턴)
│   ├── modals/
│   │   └── AttModal.tsx            # 출석 입력 모달 (O/X/T/미기록 선택)
│   └── tabs/
│       ├── AttendanceTab.tsx       # 출석 탭 (체크 뷰 + 전체 표 뷰)
│       ├── StatTab.tsx             # 통계 탭 (그룹/팀 요약 + 개인별 출석률 바)
│       └── AdminTab.tsx            # 설정 탭 (교사 동기화 현황, 스탭 멤버 CRUD, 계정 관리, 이벤트 관리)
├── hooks/
│   ├── useAuth.ts                  # doLogin (이메일/비밀번호), doLogout
│   └── useFirebaseData.ts          # Firebase 실시간 구독 훅 + CRUD 함수 (유일한 Firebase 접근 레이어)
├── lib/
│   └── firebase.ts                 # Firebase 초기화 (db, auth) — 환경변수로 설정
├── store/
│   └── AppContext.tsx              # 전역 상태 (useReducer) + calcStats, effectiveKey 헬퍼
├── types/
│   └── index.ts                    # 타입 정의 + GROUP_KEYS, STAFF_TEAMS 상수
└── utils/
    ├── dates.ts                    # KST 연도, 주일 계산, 연휴 매핑, emailToKey, sortAndRenumber
    └── toast.ts                    # 토스트 pub/sub (showToast, subscribeToast)
```

---

## Firebase DB 구조

### 이 앱이 사용하는 노드 (`staff_*` 접두어)

```
staff_members/
  {year}/
    {teamName}/                 # 사역팀명 (바나바팀, 찬양팀, 미디어팀, 예배팀, 기획디자인팀, 행정팀)
      {memberId}/
        name: string
        num: number             # 순서 번호 (정렬용)
        phone?: string

staff_attendance/
  {year}/
    {groupKey}/                 # groupKey = "part1" | "part2" | 사역팀명
      {memberId}/
        {cellKey}: "O" | "X" | "T"    # cellKey = "mi-di" (월인덱스-주일인덱스)

staff_events/
  {year}/
    {eventId}/
      month: string
      day: string
      label: string             # 특별 이벤트 (해당 주일 출석 제외)

staff_roles/
  {emailKey}/                   # emailToKey(email) — "." → "__dot__", "@" → "__at__"
    email: string
    role: "admin" | "user"
    name?: string

staff_admins/
  {uid}: true                   # admin 로그인 시 자동 기록
```

### 읽기 전용으로 사용하는 노드 (학생 출석부 앱 소유)

```
classes/
  {year}/
    {classKey}/                 # "{부}-{학년}-{반}" (예: "1-2-3")
      teacher: string           # ← 이 값으로 1부/2부 교사 명단 자동 구성
```

> 1부/2부 교사는 `classes/{year}` 에서 teacher 필드를 실시간 구독하여 자동으로 가져온다.
> 교사 명단을 직접 수정하려면 학생 출석부 앱에서 담임을 변경해야 한다.

---

## 공유 Firebase 프로젝트 (`woori-high`)

이 앱은 동일 Firebase 프로젝트를 4개 사이트가 공유한다:

| 사이트 | DB 네임스페이스 |
|---|---|
| **고등부 학생 출석부** | `classes/`, `attendance/`, `admins/`, `teacherClasses/` |
| **고등부 교사·스탭 출석부** (이 앱) | `staff_members/`, `staff_attendance/`, `staff_events/`, `staff_roles/`, `staff_admins/` |
| **수련회 행정 사이트** | `retreats/`, `retreatsPrivate/`, `retreatAdmins/`, `retreatPending/` |
| **수련회 이가드 사이트** | `retreats/{id}/iguard/`, `iguardMembers/`, `iguardRoles/`, `iguardPending/` |

- 각 앱은 자기 네임스페이스(`staff_*`)에만 쓰기하고, 다른 앱의 노드에 쓰지 말 것.
- `classes/` 노드는 학생 출석부 앱이 소유 — 이 앱은 **읽기 전용**으로만 사용.

### database.rules.json 경고

> **이 프로젝트에는 database.rules.json 파일이 없다.**
> Firebase 보안 규칙은 **고등부 학생 출석부** 레포의 `database.rules.json`에서 관리하며,
> `firebase deploy --only database`도 그 레포에서 실행한다.
> `staff_*` 관련 보안 규칙을 수정해야 할 경우 반드시 학생 출석부 레포에서 작업하고,
> 다른 앱의 규칙을 덮어쓰지 않도록 콘솔 현재 규칙과 대조해야 한다.

---

## 핵심 코드 패턴

### 1. AppContext useReducer 패턴

전역 상태를 `useReducer`로 관리. 모든 상태 변경은 `dispatch({ type, payload })` 액션으로만 수행.

```typescript
// store/AppContext.tsx
const { state, dispatch } = useApp();

// 액션 예시
dispatch({ type: 'SET_TAB', payload: 'att' });
dispatch({ type: 'SET_GROUP', payload: 'staff' });
dispatch({ type: 'SET_STAFF_TEAM', payload: '찬양팀' });
dispatch({ type: 'SET_YEAR', payload: 2026 });  // → months, events 자동 재계산
```

### 2. 그룹 키 (effectiveKey)

교사는 `"part1"` / `"part2"`, 스탭은 사역팀명(`"바나바팀"` 등)을 키로 사용.
`effectiveKey(state)` 헬퍼가 현재 선택된 그룹/팀에 따른 실제 키를 반환.

```typescript
const gk = effectiveKey(state);
// curGroup === 'staff' → curStaffTeam 반환 ("찬양팀" 등)
// curGroup === 'part1' | 'part2' → 그대로 반환
```

### 3. Firebase 실시간 구독 (useFirebaseData)

`hooks/useFirebaseData.ts`의 `useFirebaseData()` 훅이 `onValue`로 4개 노드를 구독:
- `classes/{year}` → 1부/2부 교사 명단 (읽기 전용)
- `staff_members/{year}/{team}` → 사역팀별 스탭 멤버 (6개 팀 각각)
- `staff_attendance/{year}` → 출석 데이터
- `staff_events/{year}` → 커스텀 이벤트

연도(`curYear`) 변경 시 구독 해제 후 재구독.

### 4. 인증 흐름

```
이메일/비밀번호 입력 → Firebase Auth signIn
  → onAuthStateChanged 감지
    → loadUserRole: staff_roles/{emailKey} 조회
      → 존재하면 role(admin/user) 로드 → 앱 진입
      → 없으면 '권한이 부여되지 않은 계정' 에러 → 로그아웃
```

- Google OAuth 미사용. 이메일/비밀번호 인증만 사용.
- `staff_roles`에 이메일이 등록되어 있어야 로그인 가능.
- admin은 설정 탭 접근 가능, user는 출석/통계 탭만 사용.

### 5. 토스트 알림 (pub/sub)

```typescript
import { showToast } from '@/utils/toast';

showToast('저장되었습니다', 'success');  // 'error' | 'success' | 'info'
```

`Toast` 컴포넌트가 `subscribeToast`로 구독하여 2.5초간 표시.

### 6. 사역팀 목록 (상수)

```typescript
// types/index.ts
export const STAFF_TEAMS = ['바나바팀', '찬양팀', '미디어팀', '예배팀', '기획디자인팀', '행정팀'] as const;
```

팀 추가/변경 시 이 상수만 수정하면 UI 전체에 반영.

---

## 개발 & 배포

```bash
# 개발 서버
npm run dev

# TypeScript 타입 체크 (배포 전 필수)
npx tsc --noEmit

# 프로덕션 배포
npx vercel --prod --yes
```

### 환경변수 (.env.local)

```
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_DATABASE_URL=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=
```

---

## 절대 하지 말 것

1. **`useFirebaseData.ts` 외부에서 Firebase 직접 import 금지**
   ```typescript
   // AdminTab.tsx는 예외적으로 staff_roles, staff_events에 직접 접근
   // 그 외 컴포넌트는 반드시 useFirebaseData.ts 함수를 통해 접근

   // ❌ 금지 (일반 컴포넌트)
   import { db } from '@/lib/firebase';
   import { set, ref } from 'firebase/database';

   // ✅ 반드시 훅/함수 사용
   import { saveAttToFirebase, addStaffMember } from '@/hooks/useFirebaseData';
   ```

2. **`classes/` 노드에 쓰기 금지**
   → 교사 명단은 학생 출석부 앱이 소유. 이 앱은 읽기 전용으로만 구독.

3. **다른 앱의 DB 네임스페이스에 쓰기 금지**
   → `staff_*` 접두어가 붙은 노드에만 쓰기. `attendance/`, `retreats/` 등 접근 금지.

4. **TypeScript 에러 있는 상태로 배포 금지**
   → 배포 전 `npx tsc --noEmit`으로 0 errors 확인 필수.

5. **불필요한 패키지 추가 금지**
   → 현재 의존성 4개(firebase, next, react, react-dom) 최소화 유지.
   → 새 패키지 추가 전 기존 라이브러리로 해결 가능한지 먼저 검토.

6. **`database.rules.json` 파일을 이 레포에 생성하거나 firebase deploy 실행 금지**
   → 보안 규칙은 학생 출석부 레포에서 관리.

---

## 탭 구조

| 탭 | 컴포넌트 | 기능 |
|---|---|---|
| 출석 (`att`) | `AttendanceTab` | 이번 주 체크 뷰 (버튼 토글) + 전체 표 뷰 (월별 테이블) |
| 통계 (`stat`) | `StatTab` | 그룹/팀별 출석률 요약 카드 + 개인별 출석률 바 차트 |
| 설정 (`admin`) | `AdminTab` | 교사 동기화 현황, 스탭 멤버 CRUD(팀 이동 포함), 계정 관리, 이벤트 관리 |

- 설정 탭은 `role: 'admin'`인 사용자만 접근 가능.

---

## 그룹 구조

```
1부 교사 (part1)    ← classes DB에서 자동 동기화
2부 교사 (part2)    ← classes DB에서 자동 동기화
스탭 (staff)        ← 사역팀별 하위 탭
  ├── 바나바팀
  ├── 찬양팀
  ├── 미디어팀
  ├── 예배팀
  ├── 기획디자인팀
  └── 행정팀
```

---

## 최근 변경 사항

- 스탭 멤버 팀 이동 기능: `moveStaffMemberToTeam()` — 출석 기록도 함께 이동
- 커스텀 이벤트: 특별 이벤트(수련회 등) 등록 시 해당 주일 출석 집계에서 제외
- 연휴 자동 처리: 설/추석 연휴 주일은 자동으로 이벤트 표시 (2024~2030년 하드코딩)
- CSS 변수 기반 디자인 시스템: 보라색 계열 테마 (`--blue: #9B8DD4`)
