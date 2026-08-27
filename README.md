# woori-high-apps

분당우리교회 **고등부** 사역을 운영하기 위한 웹 애플리케이션 모노레포입니다.

주일 출석 관리부터 여름·겨울 수련회의 준비·현장 운영까지, 교역자·교사·스탭이 실제로 쓰는
도구들을 담고 있습니다. 상업용 제품이 아니라 한 부서의 실제 사역 현장에서 쓰이는 내부
운영 시스템이며, 학생 개인정보를 다루므로 저장소는 비공개입니다.

## 두 개의 앱

두 앱은 **하나의 Firebase 프로젝트(`woori-high`, Realtime Database)를 공유**합니다.
사람은 같은데 쓰는 화면이 다르기 때문에, DB를 나누지 않고 앱을 나눴습니다.

| | attendance-app (학생 출석부) | highschool-app (통합 플랫폼) |
|---|---|---|
| **하는 일** | 주일 예배 출석 체크와 통계 | 수련회 운영, 학기 반 편성, 주일 사역 관리 |
| **주 사용자** | 반 교사 | 교역자 · 행정팀 · 이가드팀 · 스탭 |
| **배포** | Firebase Hosting | Vercel |
| **주소** | `woori-high.web.app` | `woorihigh-app.vercel.app` |
| **규모** | 소스 약 8,900줄 | 소스 약 60,700줄 |
| **스택** | Next.js · React · Firebase · Chart.js | Next.js 16 · React 19 · Firebase · xlsx |

### highschool-app이 담고 있는 것

`src/features/` 아래 기능 단위로 나뉩니다.

- **`iguard`** — 수련회 **현장** 운영. 조 편성, 자리 배치, 버스·숙소 배정, 식사 순서,
  큐시트(진행표), 인원 체크. 수련회 당일 체육관과 버스 안에서 휴대폰으로 쓰는 화면이라
  모바일 우선으로 만들어져 있습니다.
- **`semester`** — 학기 반 편성. 신청 접수 → 반 배치 → 명단 확정.
- **`sundayWorship` / `sundayMinistry`** — 주일 자리 배치와 사역팀별 업무 기록.
- **`portal`** — 역할 기반 접근 제어. 누가 어느 화면을 보고 쓸 수 있는지 판정합니다.
- **`ministryGuide` / `landing` / `suggestions`** — 안내 문서, 첫 화면, 건의 접수.

## 이 저장소에서 가장 중요한 개념: 데이터 소유권

두 앱이 같은 DB를 쓰기 때문에, **어느 앱이 어느 경로에 쓸 수 있는지**가 이 프로젝트의
핵심 규칙입니다. 이걸 어기면 한쪽 앱이 다른 쪽의 데이터를 지웁니다.

| 앱 / 모듈 | 쓰기 가능 | 다른 앱 노드 |
|---|---|---|
| 학생 출석부 | `classes/`, `attendance/`, `admins`, `teacher*` | — |
| highschool-app 행정 | `retreats/{id}`, `retreatsPrivate/{id}`, `retreatAdmins` | `classes/` 읽기 전용 |
| highschool-app 현장(iguard) | `retreats/{id}/iguard/*`, `iguardMembers` | 행정 노드 전부 읽기 전용 |

두 가지 규칙이 특히 중요합니다.

1. **Firebase 보안 규칙(Rules)의 원천은 단 하나** — `attendance-app/database.rules.json`
   입니다. 저장소 전체에서 `database.rules.json`도 `firebase.json`도 이 앱에만 있어서,
   다른 곳에서 실수로 Rules를 배포하는 일이 구조적으로 불가능합니다.
2. **민감 정보는 `retreatsPrivate/` 아래에만** 둡니다. 환불 계좌·의료 일지 같은 것을
   `retreats/{id}` 아래 두면 현장 스탭 전원에게 노출됩니다.

전체 계약은 [`DB_OWNERSHIP.md`](DB_OWNERSHIP.md)에 있습니다.

## 시작하기

Node.js 22를 권장합니다(CI가 쓰는 버전). 각 앱은 독립적으로 설치·실행합니다.

```bash
cd highschool-app     # 또는 attendance-app
npm install
npm run dev           # http://localhost:3000
```

두 앱 모두 Firebase 설정을 환경변수로 받습니다. `.env.local`을 만들고 Firebase 콘솔의
웹 앱 설정값을 넣으세요 (이 파일은 커밋되지 않습니다).

```
NEXT_PUBLIC_FIREBASE_API_KEY=...
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=...
NEXT_PUBLIC_FIREBASE_DATABASE_URL=...
NEXT_PUBLIC_FIREBASE_PROJECT_ID=...
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=...
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=...
NEXT_PUBLIC_FIREBASE_APP_ID=...
NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID=...
```

## 검증과 배포

푸시 전에 통과해야 하는 기준입니다.

```bash
npm run typecheck     # tsc --noEmit, 0 errors
npm run test          # highschool-app 727건 / 학생 출석부 130건
npm run build
```

저장소 루트에서 `npm run verify`를 실행하면 두 앱의 lint·test·build를 한 번에 돌립니다.

배포는 앱마다 다릅니다.

```bash
# highschool-app → Vercel
npx vercel --prod

# 학생 출석부 → Firebase Hosting (predeploy가 서비스워커 캐시명을 갱신)
npx firebase deploy --only hosting
```

배포 후 `curl -s https://woorihigh-app.vercel.app/api/version`의 `buildId`를
`git rev-parse HEAD`와 대조해 실제로 반영됐는지 확인합니다. 절차 전체는
[`OPERATIONS.md`](OPERATIONS.md)에 있습니다.

## 저장소 구조

```
highschool-app/          통합 플랫폼 (Vercel)
  src/features/          기능 모듈 — iguard, semester, portal, sunday*
  src/lib/               공용 유틸 (경로 헬퍼, 이름 정규화, 시간 판정)
attendance-app/       주일 출석부 (Firebase Hosting)
  database.rules.json    ← Firebase 보안 규칙의 유일한 원천
docs/                    통합 이관 기록 (2026-08 앱 통합 당시 런북)
agent-os/                로컬 운영 대시보드
scripts/verify-all.mjs   두 앱 일괄 검증
```

## 문서 지도

이 저장소는 문서를 코드와 함께 관리합니다. 작업 성격에 따라 읽는 순서가 정해져 있습니다.

| 문서 | 언제 읽나 |
|---|---|
| [`CLAUDE.md`](CLAUDE.md) | **먼저 읽는 문서.** 작업 규칙, 안전 절차, 자주 저지르는 실수 15가지 |
| [`DB_OWNERSHIP.md`](DB_OWNERSHIP.md) | DB 경로를 건드리기 전 |
| [`OPERATIONS.md`](OPERATIONS.md) | 배포하거나 장애를 복구할 때 |
| [`LEARNINGS.md`](LEARNINGS.md) | 도구·환경이 예상과 다르게 굴 때 |
| 각 앱의 `CLAUDE.md` | 그 앱의 코드 패턴 (해당 앱 코드 수정 시) |

## 이 코드베이스의 규칙 몇 가지

읽다 보면 눈에 띌 만한, 의도적인 선택들입니다.

- **한국어로 씁니다.** 커밋 메시지, 주석, 문서 전부. 커밋은 `영역: 요약` 형식입니다
  (예: `이가드: 버스 파싱 오염 필터`).
- **DB 경로 문자열을 컴포넌트에 쓰지 않습니다.** 각 앱의 `paths.ts`만 사용합니다.
- **순수 로직 버그를 고칠 때는 회귀 테스트를 같은 커밋에 넣습니다.** 같은 버그가 테스트
  없이 세 세션에 걸쳐 다섯 번 재발한 적이 있어서 생긴 규칙입니다.
- **의존성을 최소로 유지합니다.** firebase / next / react 외에는 꼭 필요한 것만 씁니다.
- **되돌리기 어려운 작업 전에는 태그를 남깁니다.** `pre-*-removal-*` 태그들이 그것입니다.

## 이력

2026년 7월 시작. 처음에는 앱이 여러 개(`retreat-app`, `iguard-app`, `semester-app`,
교사·스탭 출석부)로 나뉘어 있었으나, 같은 사람이 같은 수련회를 위해 네 개의 주소를
오가야 하는 문제가 있어 2026년 8월 `highschool-app` 하나로 통합했습니다. 통합 당시의
판단과 절차는 `docs/UNIFIED_*.md`에 남아 있고, 통합 직전 시점은 git 태그로 보존돼
있습니다.
