# GitHub Actions 사용량 절감

기준: main `10ff2cf518aa8f9b065b5f9e4bc7ff83272b5a3b` (PR120). 기존 `ubuntu-24.04` 고정과 `cancel-in-progress`를 유지한다. 이 문서의 변경은 통합 앱 워크플로와 로컬 작업 순서에 한정하며, 학생 앱·Rules·찬양/회계 에뮬레이터·Agent OS의 기존 검사를 제거하지 않는다.

## 로컬에서 묶어서 검증하기

1. `git status --short`로 기존 변경을 확인하고 작업 브랜치에서 같은 목적의 수정을 묶는다. 작은 수정마다 push하지 않는다.
2. 루트 `npm run test:ci-scope`를 실행한다. 대상 앱에서 `npm run lint` → `npm run typecheck` → `npm test` → `npm run build`를 순서대로 실행한다. 전체 감사는 루트 `npm run verify`를 사용한다. 같은 앱의 typecheck와 build를 병렬 실행하지 않는다.
3. 통합 앱 게시 전에는 `npm run test:coverage`, 빌드 후 `node scripts/check-praise-runtime.mjs`, `npm run quality:lighthouse`도 확인한다. UI 변경은 `npm run test:e2e:new-staff`와 `npx playwright test --config=playwright.admin-finance.config.ts`로 격리된 합성 데이터를 검증한다. 실제 운영 인증/DB 저장 검증을 뜻하지 않는다.
4. 실패를 해결하고 같은 목적의 변경을 한 번 게시한다. 사용자 지시가 로컬 전용이면 검증 결과까지만 보고하며 push·PR·병합·배포를 실행하지 않는다. `[skip ci]`나 테스트 삭제·실패 무시로 사용량을 줄이지 않는다.

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

이 수치는 과거 한 실행을 적용한 추정치다. 새 원격 CI를 실행하지 않았으므로 실제 절감률·월 총절감액은 미측정이다. 워크플로 자체 변경인 이번 게시에는 보수적 전체 검사가 실행된다. 기존 월 포함량이 소진된 상태라 게시 전 비용 결정을 별도로 해야 한다. main 보호 규칙 조회는 GitHub API HTTP 403(비공개 저장소 기능의 요금제 제한)으로 확인하지 못했다. 기존 job 이름은 그대로 보존한다.
