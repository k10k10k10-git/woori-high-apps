# GitHub Actions 사용량 절감

기준: main `10ff2cf518aa8f9b065b5f9e4bc7ff83272b5a3b` (PR120). 기존 `ubuntu-24.04` 고정과 `cancel-in-progress`를 유지한다. 이 문서의 변경은 통합 앱 워크플로와 로컬 작업 순서에 한정하며, 학생 앱·Rules·찬양/회계 에뮬레이터·Agent OS의 기존 검사를 제거하지 않는다.

2026-11-01 읽기 전용 재확인에서도 원격 main은 같은 SHA였다. 이전 로컬 `f426fa5`와 충돌이 없어 CI 구현을 유지한다. 아직 원격에는 적용하지 않았다.

## 로컬에서 묶어서 검증하기

1. `git status --short`로 기존 변경을 확인하고 작업 브랜치에서 같은 목적의 수정을 묶는다. 작은 수정마다 push하지 않는다.
2. 루트 `npm run test:ci-scope`를 실행한다. 대상 앱에서 `npm run lint` → `npm run typecheck` → `npm test` → `npm run build`를 순서대로 실행한다. 전체 감사는 루트 `npm run verify`를 사용한다. 같은 앱의 typecheck와 build를 병렬 실행하지 않는다.
3. 통합 앱 게시 전에는 `npm run test:coverage`, 빌드 후 `node scripts/check-praise-runtime.mjs`, `npm run quality:lighthouse`도 확인한다. UI 변경은 `npm run test:e2e:new-staff`와 `npx playwright test --config=playwright.admin-finance.config.ts`로 격리된 합성 데이터를 검증한다. 실제 운영 인증/DB 저장 검증을 뜻하지 않는다.
4. 실패를 해결하고 같은 목적의 변경을 한 번 게시한다. 사용자 지시가 로컬 전용이면 검증 결과까지만 보고하며 push·PR·병합·배포를 실행하지 않는다. `[skip ci]`나 테스트 삭제·실패 무시로 사용량을 줄이지 않는다.

위 순서는 이 저장소의 기본 작업 방식이다. 일반 코드·로그인·저장·권한 검사는 그대로 유지한다. 수정 중에는 관련 로컬 검사로 피드백을 받고, 같은 목적의 변경을 묶은 뒤 게시 전 전체 기준을 검증한다. 이 작업만으로 다른 저장소나 전역 설정을 변경하지 않는다.

## 통합 앱의 검사 분류

`scripts/ci-scope.mjs`가 PR의 merge-base→head, push의 before→after 전체 변경 목록을 읽는다. rename은 삭제+추가로 검사하고 300개 파일 제한을 쓰지 않는다. 삭제도 검사한다. 빈 목록·SHA 누락·비교 실패·수동 실행·merge queue·허용 목록 밖의 새 경로는 전체 검사로 돌아간다.

| 변경 | PR 품질 검사 | main 품질 검사 | 합성 브라우저 |
|---|---|---|---|
| 루트/문서 폴더의 Markdown, 앱 최상위 Markdown, `.claude/HANDOFF.md` | 분류 회귀·변경 형식 검사 | 동일 | 불필요 |
| 통합 앱 `src/**/*.test.ts(x)` | 전체 | 핵심 검사 | 불필요 |
| 기존 스탭 E2E 4파일만 | 전체 | 핵심 검사 | 스탭 묶음, 기존 4개 화면 환경 모두 |
| 회계 E2E 파일만 | 전체 | 핵심 검사 | 회계 묶음, 기존 4개 화면 환경 모두 |
| 통합 앱 `src/**/*.module.css` | 전체 | 핵심 검사 | 스탭+회계 모두 |
| TS/TSX 실행 코드, 로그인·저장·권한·공통 전역 CSS, 의존성, 설정, 공유 fixture, Rules, CI 스크립트, 미분류 경로 | 전체 | 전체 | 스탭+회계 모두 |

- **전체 품질 검사:** lint → typecheck → 전체 단위/렌더 테스트+coverage 임계값 → build → production API 비로그인 401 → Lighthouse. PR의 실행 코드 품질 기준은 유지한다.
- **main 핵심 검사:** lint → typecheck → 전체 단위/렌더 테스트 → build → production API 비로그인 401. 위 허용 목록에 한해서 PR과 중복되는 coverage 계측·Lighthouse만 줄인다. 검사 대상 테스트 자체는 줄이지 않는다.
- 여러 종류가 섞이면 검사 범위를 합치고, 전체 검사 경로가 하나라도 있으면 전체다. 일반 UI TSX도 저장/권한 영향 여부를 경로만으로 확정할 수 없어 전체다. CSS Module의 전역 선택자 가능성 때문에 두 UI 묶음을 유지한다.
- 학생 앱 실행 코드와 Agent OS는 기존 별도 워크플로가 검사하며 통합 앱 무거운 검사는 생략한다. 공유 `attendance-app/database.rules.json`은 통합 앱도 전체 검사한다. 다른 워크플로의 기존 path 필터와 필수 검사 설정은 이번에 변경하지 않는다.

## 필수 검사와 배포 안전

통합 앱 워크플로는 PR마다 시작한다. 워크플로 수준 path 필터로 필수 검사가 누락되면 Pending으로 남을 수 있기 때문이다. `verify`·`new-staff-ui` 이름은 유지하며, 가벼운 변경도 실제 분류 회귀 검사를 거친 뒤 완료된다. 두 job은 `always()`로 분류 job의 실패·취소를 명시적인 실패로 전파한다. 테스트 실패를 무시하거나 성공으로 바꾸는 설정은 없다. [GitHub의 필수 검사 설명](https://docs.github.com/en/pull-requests/how-tos/merge-and-close-pull-requests/troubleshooting-required-status-checks)을 따른다.

main의 `production-version`은 품질·합성 UI 성공 후 배포 SHA를 확인한다. 마지막 한 커밋만 비교하던 로직 대신 push 전체 범위를 사용한다. 앱 내 문서만 바뀌어도 기존 Vercel 변경 감지상 새 배포가 생기므로 SHA 확인은 유지한다. 앱 밖만 바뀌면 새 배포를 기다리지 않는다.

운영 인증 E2E는 기존처럼 **수동 main 실행에만** 인증 상태를 복원하며 배포 SHA 확인·인증 가드를 유지한다. PR에는 운영 인증 상태를 제공하지 않는다. 결제·예산·권한·Rules 설정은 변경하지 않는다.

## 절감 근거와 제한

[기존 main 실행 40048591135](https://github.com/k10k10k10-git/woori-high-apps/actions/runs/40048591135)의 API 시각 차이는 `verify` 339초, `new-staff-ui` 1,878초, 배포 확인 10초로 합계 약 **37.1 runner분**이다. UI job 안에서 스탭 묶음 1,700초, 회계 묶음 71초, 브라우저 설치 55초였다. 청구 반올림을 적용한 값은 아니다.

- 앱 문서만 변경: 기존 두 무거운 job의 약 36.95분을 가벼운 3개 job의 실행 시간으로 대체한다. 실제 순절감은 새 runner 준비 시간을 뺀 값이다.
- 단위/렌더 테스트만 변경: 브라우저 job의 약 31.3분을 가벼운 완료 job으로 대체한다. main에서는 coverage 계측 차이와 Lighthouse 16초도 줄지만, 전체 테스트 실행 시간은 남는다.
- 회계 E2E만 변경: 스탭 묶음 약 28.3분을 PR과 main 각각에서 피할 수 있다. 스탭 E2E만 변경하면 회계 묶음 약 1.2분이 대상이다.
- CSS Module만 변경: 두 UI 묶음은 모두 유지하므로 main의 coverage 계측 차이와 Lighthouse 정도만 줄인다.
- 로그인·저장·권한·일반 TSX·공통/미분류 변경은 기존 전체 검사와 동일하고 분류 job 비용이 추가된다. **PR120과 같은 일반 UI TSX 변경을 자동으로 반값으로 줄이는 설계는 아니다.**

이 수치는 과거 한 실행을 적용한 추정치다. 새 원격 CI를 실행하지 않았으므로 실제 절감률·월 총절감액은 미측정이다. 워크플로 자체 변경인 이번 게시에는 보수적 전체 검사가 실행된다. 기존 job 이름은 그대로 보존한다. 이 브랜치 전체를 PR로 게시하면 통합 앱 전체 검사와 `scripts/verify-all.mjs` 변경에 따른 Agent OS 검사가 대상이며 main 병합 후에도 전체 검사한다. 앱 폴더 밖만 변경하므로 기존 Vercel 변경 감지가 유지되면 새 앱 배포는 생략한다.

## 당월 비용 확인과 게시 제한

- 2026-10-24의 월 포함량 소진은 당시 기록이며 11월 잔여량을 뜻하지 않는다. 월이 바뀌면 당월 계정 사용량·예산·초과 사용 허용 상태를 새로 읽기 전용으로 확인한다.
- 2026-11-01 조회: 이 저장소의 당일/당월 Actions 실행은 0건이었다. 이것만으로 계정 전체의 남은 포함량을 산출할 수 없다. 다른 저장소 사용량, 플랜·청구 기간·반올림·추가 청구 상태는 별도 정보다.
- `GET /users/k10k10k10-git/settings/billing/usage/summary?year=2026&month=11`은 HTTP 404였고 `gh`가 `user` scope 필요를 안내했다. 계정 플랜 필드도 제공되지 않았다. 따라서 현재 Actions 잔여량·예산·초과 사용 허용 여부는 **미확인**이다. 인증 scope를 늘리거나 다른 토큰으로 재시도하지 않았다. [사용량 API의 읽기 권한 안내](https://docs.github.com/en/rest/billing/usage#get-billing-usage-summary-for-a-user)를 참고한다.
- 소유자가 개인 계정이므로 조직 전용 예산 API로 개인 예산을 추정하지 않는다. [예산 API](https://docs.github.com/en/rest/billing/budgets)는 조직/기업 대상을 문서화하며, 개인 예산·초과 사용 상태는 로그인한 개인 Billing 화면에서 별도 읽기 확인이 필요하다. 설정을 변경하지 않는다.
- 기존 main 보호 규칙 조회의 HTTP 403은 미확인 상태로 유지하며 새 권한 증거 없이 재시도하지 않았다. 필수 검사 이름·실패 전파·검사 기준·보호 설정을 약화하지 않는다.
- 이번 범위는 로컬 적용·검증과 원격 읽기다. push·PR 생성 제안은 상위 대화에서 자동 검토에 거부돼 별도 확인 중이며 실행하지 않는다. 우회 게시·원격 검사 실행·merge·deploy·결제/예산/권한 변경도 하지 않는다.

## 로컬 Git 환경

2026-11-01 Mac의 `/usr/bin/git`은 Xcode `CoreDevice`/`Mercury` 라이브러리의 `_XPCTypeBool` 불일치로 실행에 실패했다. 설치된 `/Library/Developer/CommandLineTools/usr/bin/git`은 정상 실행됐다. 이 환경에서는 명령 단위로 `PATH=/Library/Developer/CommandLineTools/usr/bin:$PATH npm run test:ci-scope`처럼 사용한다. 시스템 `xcode-select`나 설치 상태는 변경하지 않는다. 기존 비교·형식 검사와 실패 전파는 유지한다.
