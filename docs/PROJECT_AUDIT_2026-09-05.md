# 프로젝트·에이전트 가이드 점검 — 2026-09-05

기준 커밋: `dcc54c743a916522ecb945ec6bb762a5561ecde0`와 작업 시작 당시 미커밋 변경.
요청 범위: 현재 프로젝트와 파일 점검, `AGENTS.md` 갱신.
운영 DB 접근·쓰기, Rules 변경·배포, 서비스 배포는 수행하지 않았다.

## 범위와 확인 방법

**전체 파일 목록을 점검하고 주요 코드·설정·계약을 대조했다. 모든 파일의 모든 실행 경로를 검증한 것은 아니다.**

| 시작 시점 파일 목록 | 수 |
|---|---:|
| Git 추적 파일 | 584 |
| 통합 앱 | 467 |
| 학생 출석 앱 | 92 |
| 루트·운영 도구·문서·CI 등 | 25 |
| Git ignore를 제외한 미추적 파일 포함 | 589 |
| 위 589개 중 UTF-8 텍스트 / 바이너리 | 584 / 5 |

근거 명령은 `git ls-files -z`, `git ls-files -co --exclude-standard -z`, `rg --files --hidden`이다. 목록의 텍스트를 읽어 충돌 마커·JSON 형식을 기계 검사하고, 앱별 인증·권한·DB·라우트·프로그램 준비·출석·동기화·테스트·설정과 운영 도구를 직접 검토했다. 엄격한 JSON 파일 16개는 파싱 성공했고 주석을 허용하는 `tsconfig.json` 2개는 이 검사에서 제외했다. 두 앱의 `package.json` 의존성 선언은 각 lockfile의 루트 선언과 일치했다. 충돌 마커는 없었다.

`node_modules`, `.next`, `out`, `.git` 내부, 인증 세션·Chrome 프로필, 비밀값과 개인정보 산출물은 소스 전수 리뷰 대상에 포함하지 않았다. `outputs`·루트 `tmp`·`graphify-out`은 목록·크기를 확인했고 개인정보 원문은 열지 않았다. `.auth` 생성 JS는 기본 lint가 포함해 버리는 문제를 확인했다. 로컬 데모 설정은 비밀값을 출력하지 않고 활성 여부만 확인했다. 신규 패키지 설치나 의존성 수정은 하지 않았다.

기존 graphify는 `e88d265f85243203e496b5704d95de903696d38c` 기준으로 현재 HEAD와 달랐다. 색인에 있는 `workspace apps access policy auth program ownership verify`로 조회해 관련 파일을 찾았고 실제 코드로 재확인했다. 그래프는 재생성하지 않았으며 조회 결과는 예산 때문에 일부 생략되어 완전성 근거로 사용하지 않았다.

## 검증 결과

| 대상 | 명령 | 결과 |
|---|---|---|
| 통합 앱 | `npm test` | 107파일, **846개 통과** |
| 통합 앱 | `npx tsc --noEmit` | 통과 |
| 통합 앱 | `npm run build` | 성공 (`next build --webpack`) |
| 통합 앱 | `npm run lint` | 실패: **29 errors / 427 warnings**, `.auth/chrome-profile`의 Chrome 생성 JS 포함 |
| 통합 앱 | `npm run lint -- --ignore-pattern '.auth/**'` | **0 errors / 0 warnings**, 종료 0 |
| 학생 앱 | `npm test` | 10파일, **130개 통과** |
| 학생 앱 | `npx tsc --noEmit` | 통과 |
| 학생 앱 | `npm run build` | 정적 빌드 성공 |
| 학생 앱 | `npm run lint` | **0 errors / 30 warnings**, 종료 0 |
| 로컬 도구 | `node --check agent-os/server.js`, `node --check scripts/verify-all.mjs` | 통과 |
| 문서 변경 | `git diff --check`, Markdown 링크·현재 계약의 파일/명령 대조 | 통과 |

합계 **117개 테스트 파일·976개 테스트 통과**. 기본 통합 lint는 실패했으므로 “전체 품질 관문 통과”라고 보고하지 않는다. 루트 `npm run verify`를 직접 실행하지 않고 앱별 대응 명령을 실행했다. 같은 앱의 후속 검증은 타입 검사와 build를 순차 실행한다.

로그인 E2E·Lighthouse·커버리지·Firebase Emulator·운영 Rules 재현·최신 배포 상태·원격 시크릿은 이번에 확인하지 않았다. 로컬 빌드 성공과 운영 화면의 정상 동작을 구분한다. `rulesContract.test.ts`는 규칙 문자열 계약 검사이며 실제 보안 검증을 대체하지 않는다.

## 수정한 가이드

| 파일 | 반영 사항 |
|---|---|
| [루트 AGENTS.md](../AGENTS.md) | 운영 앱 2개, 문서 우선순위, 코드 그래프 최신성, 두 축 권한·현재 API, DB 소유권·예외·민감 경로, Agent OS 실행 경계, 검증·PR 배포·사용자 변경 보존 |
| [통합 앱 AGENTS.md](../highschool-app/AGENTS.md) | 현재 라우트·인증·capability·주일 팀 범위, 새친구 행정팀 권한, 프로그램 공개/private 저장, iframe QA·CI·인증 상태 재사용. 과거 학습 기록과 현재 지침 구분 |
| [학생 앱 AGENTS.md](../attendance-app/AGENTS.md) | Next 정적 export·이메일 로그인, DB 진입점·공유 예외, 학생 감사·personId·출석·시트 보존, 데모·자동 삭제 경로, Hosting 캐시·Vercel 빌드 생략 |

기존 파일명은 세 곳 모두 `AGENTS.md`여서 별도 `agent.md`를 만들지 않았다. 통합 앱의 날짜별 학습 기록과 Next 자동 안내 블록은 보존했다. 앱 소스·Rules·배포 설정은 수정하지 않았다. 시작 때 수정 중이던 E2E·로그인 스크립트·lockfile과 미추적 사용자 파일도 보존했다.

## 발견 사항 — 코드·Rules는 수정하지 않았음

### 높음: 반 접근 권한의 근거를 사용자가 직접 바꿀 수 있음

- 근거: `attendance-app/database.rules.json:20`은 인증 사용자의 자기 `teacherClasses/{uid}` 쓰기를 허용하고 값 검증이 없다. `:34`, `:35`, `:48`, `:49`는 그 값을 반별 학생·출석 읽기/쓰기 권한으로 사용한다.
- 코드상 영향: 승인된 교사 반과 다른 값을 기록해도 Rules가 기존 담당 반과 대조하지 않는다. 앱 UI에서 본인 반만 구독하는 것은 서버 권한 제한을 보장하지 않는다.
- 다음 조치: 권한 매핑의 신뢰 원천과 로그인 자기 쓰기 의존성을 함께 검토하고 에뮬레이터 허용/거부 테스트로 재현해야 한다. 기존 로그인 흐름을 고려하지 않은 자기 쓰기 차단은 교사 로그인을 망가뜨릴 수 있다. **운영 악용 재현·Rules 수정·배포는 하지 않았다.**

### 높음: Agent OS의 작업 실행 API에 인증·접근 제한이 없음

- 근거: `agent-os/server.js:202`의 `POST /api/run`은 인증·Origin 검사 없이 등록 스킬을 실행한다. `:140`은 Claude에 `--dangerously-skip-permissions`를 전달한다. `:220`의 listen은 호스트를 명시하지 않는다. `agent-os/skills.json:16`에는 커밋·푸시·배포 작업도 있으며 확인창은 브라우저 코드에만 있다.
- 코드상 영향: 서버에 접근 가능한 클라이언트가 등록 작업을 실행할 수 있다. 실제 프로세스 실행·네트워크 노출·방화벽 상태는 확인하지 않았다.
- 다음 조치: loopback 바인딩, 서버 측 인증·Origin 검증, 위험 작업 승인 경계를 검토한다. **서버 기동·API 실행·코드 수정은 하지 않았다.**

### 높음: 수동 반 이동 시 기존 출석을 함께 이관하지 않음

- 근거: `attendance-app/src/components/modals/MoveStudentModal.tsx:34`의 원자 update에는 원래 반 학생 삭제·새 반 학생 추가·감사기록만 있다. `src/components/tabs/AttendanceTab.tsx:127`은 `attData[ck][sid]`로 출석을 읽는다.
- 코드상 영향: 학생을 옮겨도 기존 출석은 옛 반 키에 남아 새 반 화면에서 보이지 않는다. 출석이 삭제됐다고 단정할 수는 없다. 시트 동기화에는 별도 출석 이관 경로가 있지만 수동 이동에는 없다.
- 다음 조치: 기존 출석과 목적지 값 충돌을 보존하는 단건 이동 계획·회귀 테스트를 설계한다. **운영 이동·데이터 복구·코드 수정은 하지 않았다.**

### 높음: 관리자 화면의 자동 정리는 DB 무쓰기 QA와 양립하지 않음

- 근거: `attendance-app/src/components/AppShell.tsx:230`은 로그인·선택 연도 변경 시 `cleanupOldYears()`를 호출한다. `src/hooks/useFirebaseData.ts:166`은 선택 연도 ±5년 밖의 `classes`·`attendance`·`events`에 `set(null)`을 시도한다. `src/components/modals/TrashModal.tsx:68`은 열 때 7일 지난 복구본을 삭제한다.
- 영향: 확인 버튼을 누르지 않아도 쓰기가 시도된다. 연도 정리는 일부 연도 루트 쓰기가 Rules에서 거부될 수 있어 실제 삭제 성공·삭제 건수는 미확인이다. 휴지통 만료 정리는 현재 구현된 동작이며 그 정책 변경 여부는 별도 결정이다.
- 다음 조치: 운영 화면으로 읽기 전용 QA를 하기 전에 자동 쓰기 흐름을 점검하고 로컬 fixture를 사용한다. **해당 화면을 열거나 데이터 정리를 실행하지 않았다.**

### 보통: 기본 lint가 로컬 로그인 프로필까지 검사함

`highschool-app/eslint.config.mjs`에 `.auth/**` 제외가 없다. 기본 명령은 Chrome 생성 JS에서 456건을 보고했고 그 경로만 제외하면 오류·경고가 사라졌다. 가이드에 진단 명령을 기록했으며 ESLint 설정·인증 프로필은 수정하지 않았다. 기본 lint 및 이를 호출하는 루트 verify의 로컬 실패는 남아 있다.

### 보통: 접근성 E2E가 인증된 화면인지 검증하지 않음

`highschool-app/e2e/accessibility.e2e.ts:9`는 페이지 이동 뒤 로그인 완료·역할·실제 앱 프레임을 확인하지 않고 axe를 실행한다. `scripts/require-e2e-auth.mjs:5`는 파일의 존재·크기만 검사한다. 만료 세션으로 로그인 화면을 검사하고도 접근성 테스트가 통과할 수 있다. 브라우저로 재현하지 않았고 테스트 코드는 수정하지 않았다.

### 보통: 운영 문서와 도구에 과거 구조가 남음

- `OPERATIONS.md:56`의 “staff_* Rules가 남아 있다”는 현재 Rules의 제거 상태와 다르다. `:148`, `:153`의 즉시 Rules 재배포 지침은 루트 `CLAUDE.md`의 보고·배포 금지 안전 규칙보다 우선하지 않는다.
- `highschool-app/CLAUDE.md`, `DB_OWNERSHIP.md`, 학기 경로 주석에 제거된 인증 래퍼·옛 주일 팀 범위·새친구 통합관리자 전용 문장이 남아 있다. 현행 `accessPolicy.ts`와 Rules를 함께 확인해야 한다.
- `attendance-app/CLAUDE.md`에는 존재하지 않는 `api/ai/route.ts`와 옛 SW 갱신 설명이 남아 있다. 현재 `firebase.json`의 predeploy는 build 후 `out/sw.js`를 갱신한다.
- `agent-os/server.js:75`, `:114`와 화면·스킬 설정은 제거된 `semester-app`을 계속 참조한다.
- `.claude/HANDOFF.md`는 날짜별 누적 기록이며 중간의 “현재 상태”가 최신은 아니다. 최근 사용자 결정과 실제 Git·소스를 대조한다.

이번에는 `AGENTS.md`의 진입 지침을 교정하고 위 원본 문서·도구는 수정하지 않았다.

### 보통: 학생 앱 CI와 데모 종료 상태는 별도 확인 필요

현재 GitHub workflow는 통합 앱 경로만 대상으로 하며 학생 앱 자동 품질 관문이 없다. 학생 앱은 로컬 명령으로 검증했다. 로컬 데모 플래그와 계정 설정은 남아 있지만 운영 활성 상태·과거 종료 계획의 완료 여부는 미확인이다. 데모 계정·권한·환경변수·배포는 변경하지 않았다.

## 후속 작업 우선순위

1. 반 권한 매핑과 Agent OS 실행 권한의 경계를 별도 보안 작업으로 검토한다.
2. 수동 반 이동의 출석 보존을 회귀 테스트와 함께 고친다.
3. 자동 삭제 정책·기본 lint·인증 E2E·오래된 운영 문서를 각각 필요한 범위에서 정리한다.

이 목록은 발견 기록이다. 운영 DB 수정·Rules 변경·배포를 승인하거나 실행한 기록이 아니다.

## 후속 보강 상태 — 2026-09-05 (PR·배포 전)

위 발견 기록은 점검 당시의 사실로 보존한다. 이후 같은 작업 브랜치에서 다음 코드·문서 보강을
완료했지만, 운영 DB 쓰기와 서비스 배포는 실행하지 않았다.

- 학생 앱의 로그인·연도 변경 자동 정리와 휴지통 조회 자동 삭제를 제거했다. 휴지통 영구 삭제는
  항목별 삭제와 확인을 누른 경우에만 실행한다.
- 수동 반 이동은 원본·목적지 반을 함께 잠그고 최신 학생·반·출석을 다시 읽은 뒤 목적지 출석 셀을
  우선해 병합한다. 학생·출석·감사기록·잠금 해제·불변 commit marker를 한 번의 루트 PATCH에
  묶고, 결과 불명확 시 잠금을 유지한다. 10분이 지난 pending은 서버 보정 시각과 marker·양쪽
  학생 상태가 정확히 일치할 때만 조건부로 정리한다.
- Agent OS는 loopback 바인딩, 요청 인증, Host·Origin 검사, 토큰 안전 전달, 안전/위험 실행 분리,
  위험 작업의 서버 측 1회 승인과 출력 이스케이프를 적용했다.
- 통합 앱 기본 lint가 `.auth` Chrome 생성 파일을 제외하도록 고쳤고, 접근성 E2E가 실제 인증된
  라우트 프레임을 확인하도록 보강했다. 학생 앱과 Agent OS 전용 CI도 추가했다.
- 오래된 운영 문서와 앱 설명을 현재 두 앱·권한·배포 구조에 맞췄다. 기존 사용자 미커밋 파일은
  보존했으며 이 작업의 커밋 대상에 포함하지 않는다.

코드 보강 후 통합 앱은 lint·typecheck·107파일 846테스트·production build를 통과했다. 학생 앱은
lint 0 errors(기존 warnings만)·typecheck·13파일 162테스트·정적 build를 통과했고, Agent OS는
문법 검사와 20개 보안 테스트를 통과했다. 저장된 인증 상태를 쓰는 운영 E2E와 실제 RTDB 연결 단절
시험은 자동 쓰기 가능성을 배제하지 못해 실행하지 않았다.

변경 전 라이브 Rules는 읽기 전용으로 `attendance-app/tmp/rules-backup/`에 백업했으며 당시 리포 원천과
SHA-256이 일치했다. 사용자가 루트 안전 규칙의 예외를 확인한 뒤 `teacherClasses` 자기 쓰기 제거,
이메일이 일치하는 `userRoles` 기반 교사 권한, 학생 이동 dual lock과 불변 commit marker 검증,
`config` 상위 쓰기 제거를 실제 `attendance-app/database.rules.json`, 38개 Rules 계약 테스트,
교사 로그인 코드에 반영했고 Firebase Rules dry-run을 통과했다. 라이브 `userRoles`는 개인정보를
출력하지 않고 집계해 교사 50명 전원의 이메일 키와 부·학년·반 문자열 형태가 새 조건에 맞음을
확인했다. 운영 DB 직접 쓰기와
Rules·Hosting·Vercel 배포는 아직 수행하지 않았다.
