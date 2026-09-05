# 프로젝트 최적화 점검 — 2026-09-05

운영 앱 두 개와 로컬 Agent OS를 점검해 인증 경쟁 상태, 불필요한 화면 갱신·통계 계산, 오류 시 미종료와 검증 누락을 수정했다. 이번 작업은 로컬 코드·검증·문서 작업이다. 운영 DB 쓰기, Rules 수정·배포, 앱 배포는 하지 않았으며 학생 출석부 데모 설정·계정·권한을 유지했다.

이 문서는 1차 점검 기록이다. 같은 날 후속 [사용 속도·운영 안정성 보강](SPEED_STABILITY_REVIEW_2026-09-05.md)에서 아래의 지속 구독 오류 표시와 차트 import 재시도를 해결했고, 차트 재생성 횟수도 브라우저에서 측정했다. 최신 검증 수치·남은 항목은 후속 보고서를 따른다.

## 범위와 기준

- 기준: `origin/main`의 `f1e1c6511511fa8b6732a6af309814ec5b8d657e`. 작업 브랜치: `codex/project-optimization-20260905`.
- 기존 사용자 작업과 분리한 worktree에서 구현했다. 원본의 인증 E2E·인증 저장 스크립트·통합 앱 lockfile과 미추적 `.agents/`·`.gitattributes`·`.impeccable/`는 보존했다.
- 기준 커밋의 추적 파일 598개를 분류했다. 통합 앱 468개, 학생 앱 98개, Agent OS 9개, workflow 3개, 루트 검증 스크립트 1개와 공통 문서·설정이다. `git ls-files -z` 목록에 대해 텍스트 충돌 마커 0건, 엄격한 JSON 16개 파싱 성공, 두 앱 package/lockfile의 의존성 선언 일치를 확인했다. 주석을 허용하는 `tsconfig.json`은 엄격한 JSON 검사에서 제외했다.
- 구조 탐색은 기존 graphify 그래프와 실제 소스를 함께 사용했다. 그래프의 기준 커밋은 `cfca685`여서 병합된 main의 사실을 대신하지 않는다. 검색 확장어는 `subscribe data attendance stats cache search render retreat filter load auth`였다. 그래프 검색은 전체 결과가 출력되지 않아 구조 안내로만 사용했다.
- 소스 심층 검토는 인증·권한, 데이터 구독·소유권, 출석·통계, 외부 요청·로컬 실행, 검증·배포 설정을 중심으로 했다. 파일 목록 전수 확인은 모든 화면·실행 경로의 수동 검증을 의미하지 않는다. 비밀값·인증 세션·운영 개인정보는 읽지 않았다.

## 수정한 문제

| 영역 | 문제와 개선 | 확인 근거 |
|---|---|---|
| 통합 앱 인증 | 계정 전환·로그아웃 뒤 이전 역할 조회 응답이 현재 상태를 덮었다. 조회 시작 시 이전 역할을 비우고 성공·실패 모두 최신 요청인지 검사한다. 독립 권한 읽기 네 개는 함께 시작한다. | `src/context/AuthContext.render.test.tsx`: 역순 응답, 이전 성공·실패, 로그아웃, 조회 중 역할, 자기조회 거부, 구독 해제 |
| 통합 앱 학기 목록 | `semesters` 하위 출석·신청 변경도 같은 목록을 재전달해 현재 학기에 연결된 구독이 다시 만들어졌다. 목록 metadata가 같으면 후속 콜백을 생략한다. | `src/features/semester/semesterSubscription.test.ts`: 최초 목록 + 출석 100회 갱신의 콜백 **101→1회**. 제목·날짜·수료 기준·추가·삭제는 계속 전달 |
| 통합 앱 마이페이지 | 수련회 목록 첫 읽기가 실패하면 로딩이 끝나지 않았다. 오류를 표시하면서 로딩을 종료한다. | `src/features/portal/useMyPageData.render.test.tsx`: 권한 오류, 빈 목록, 오류 후 성공 처리 |
| 학생 앱 통계 | 학생별 출석 통계를 경고 목록·세 개 데이터셋·등급 집계에서 다섯 번 계산했다. `buildClassStats` 한 집계로 재사용하고 미사용 `classKeys` effect 의존성을 제거했다. | `__tests__/classStats.test.ts`: 30명×52주 fixture의 관련 셀 조회 **7,800→1,560회(80% 감소)**. 기간·행사·장결 제외·등급·명단 순서·경고 동등성 |
| Agent OS 보고서 | 외부 요청이 멈추거나 본문이 계속 오면 보고서가 끝나지 않았다. 요청마다 전체 5초·256KiB 상한을 두고 단절·상태·JSON·metadata 형태 오류를 선택 정보 없음으로 처리한다. | `http-json.test.js`, `runtime.test.js`: loopback 무응답·느린 스트림·중간 단절·초과 응답·형태 오류 |
| Agent OS 실행 완료 | 프로세스 생성 실패에서 `error` 뒤 `close`가 오면 SSE 종료와 저장이 중복됐다. 완료를 한 함수로 합치고 종료 뒤 출력은 무시한다. 비정상 종료와 브라우저 연결 종료도 처리한다. | `runtime.test.js`: 수정 전 스텁에서 종료 2회/종료 후 쓰기 1회, 수정 후 완료 1회. 실제 Claude 명령은 실행하지 않음 |
| 공통 검증 | 루트 `npm run verify`가 Agent OS 테스트를 빠뜨렸다. 두 앱 검사 뒤 도구 테스트도 실행하며 실패를 전파한다. CI도 모든 Agent OS 테스트를 실행한다. | 격리 fixture에서 도구 실패 시 exit 1·성공 문구 없음, 성공 시 exit 0. 기존 두 앱 검사 순서 유지 |

통합 앱 신규 회귀는 수정 전 14개 중 8개가 실패했고 수정 후 전부 통과했다. 학생 앱과 Agent OS는 서로 다른 검토자가 교차 확인했다. 교차 검토 중 발견한 Vercel 비정상 metadata 처리 회귀도 수정한 뒤 재검증했다.

콜백 감소는 **DB 루트 구독의 전송량 감소가 아니다**. 학생 통계의 80%는 **해당 집계의 셀 조회 횟수**이며 전체 화면 렌더 시간이나 체감 속도 개선율이 아니다. 차트 effect의 실제 브라우저 실행 횟수는 측정하지 않았다.

## 데이터와 운영 영향

| 기존 경로 | 이번 코드 영향 | 공유 경계 |
|---|---|---|
| `admins/{uid}`, `retreatAdmins/{uid}`, `iguardMembers/{uid}`, `iguardRoles/{uid}` | 통합 앱의 기존 읽기 요청 순서와 응답 적용 시점만 변경 | 역할 판정 함수·자기조회·Rules 계약 유지 |
| `semesters/*` | 기존 루트 구독은 유지하고 동일 metadata의 UI 전달 억제 | 경로·스키마·백엔드 전송 방식 유지 |
| `classes`, `attendance`, `events` | 학생 앱이 이미 받은 메모리 데이터의 집계 재사용 | DB 읽기·쓰기·소유권·통계 기준 유지 |
| `attendanceAdmins/{demoUid}`와 데모 인증 설정 | 변경 없음 | 2026-09-05 사용자 결정대로 데모 유지 |

`DB_OWNERSHIP.md`의 소유 경로를 바꾸지 않았고 데이터 이관·동기화·Rules 수정도 없다. 검증 빌드는 CI용 더미 Firebase 설정을 사용했으므로 배포용 산출물로 쓰지 않는다. 이후 배포가 승인되면 데모 설정을 유지한 운영 환경으로 다시 빌드하고 기존 PR·병합 절차를 따른다.

## 실제 검증 결과

| 검사 | 결과 |
|---|---|
| 통합 앱 lint → typecheck → test → build | 모두 통과. lint 0 errors/0 warnings, **110파일 860테스트** |
| 학생 앱 lint → typecheck → test → build | 모두 통과. lint 0 errors/**24 warnings**, **14파일 168테스트**, 정적 내보내기 성공 |
| Agent OS 최종 `node --test agent-os/*.test.js` | **35테스트 통과**, 실패·skip 0. 실제 명령·운영 API 호출 없음 |
| 통합 앱 CI 커버리지 | 통과. Statements 74.63%, Branches 68.07%, Functions 73.64%, Lines 77.04%. 설정된 측정 대상 기준 |
| 통합 앱 로컬 공개 홈 Lighthouse | 설정된 assertion 전부 통과. 성능 **97**, 접근성·권장사항·SEO **100** |
| Lighthouse 지표 | FCP 531ms, LCP 1,099ms, Speed Index 1,220ms, TBT 24ms, CLS 0. 데스크톱 1회 측정 |
| 문서·변경 검사 | 새 참조 경로 확인, `git diff --check` 통과 |

루트 검증은 두 앱과 당시 Agent OS 27개 테스트를 통과했고, 도구 추가 보강 뒤 최종 35개 테스트를 별도로 다시 실행했다. 앱 소스는 그 사이 변경하지 않았다. 커버리지와 Lighthouse는 저장소 CI 명령으로 추가 확인했다. Lighthouse는 기존 서버와 섞이지 않도록 별도 loopback 포트에서 CI용 더미 설정으로 빌드한 앱을 실행했다.

운영 로그인·인증 후 화면 E2E, 실제 Firebase 권한 거부·네트워크 단절, 모바일 실기기 성능, 라이브 배포 상태는 이번 작업에서 확인하지 않았다. 인수인계에 기록된 `E2E_STORAGE_STATE_B64` 미설정 상태도 이번에 변경하지 않았으며 인증 가드를 우회하지 않았다.

## 남은 항목 — 수정하지 않았음

| 우선순위 | 위치 | 확인한 내용과 다음 판단 |
|---|---|---|
| 높음: 의존성 검토 | 두 앱 `package-lock.json` | 설치본 audit 결과는 아래와 같다. 런타임 도달 가능성과 업데이트 호환성을 확인한 뒤 별도 의존성 변경으로 처리한다. 패키지·lockfile은 이번에 바꾸지 않았다. |
| 보통: 오류 인지 | `attendance-app/src/hooks/useFirebaseData.ts:54` | 구독 취소·권한 오류는 일시 토스트로만 알려 영속 `loadError`가 없다. 오류 후 빈 데이터·이전 데이터와 구별할 상태 표시가 필요하다. 운영 오류 재현은 하지 않았다. |
| 보통: 집계 의미 | `attendance-app/src/components/tabs/overall/OverallDashboard.tsx:48` | 전체 통계는 장결 학생을 포함하지만 반 통계는 제외한다. 일반 출석 1명+장결 결석 1명 fixture는 각각 50%/100%다. 의도된 분모인지 사용자 확인 후 일치 여부를 결정해야 한다. |
| 보통: 차트 오류 복구 | `attendance-app/src/utils/chartSetup.ts:14`, `attendance-app/src/components/tabs/StatTab.tsx:97` | 동적 import가 실패하면 거절된 promise를 유지하고 재시도 UI가 없다. 실패 캐시 해제와 화면 복구 흐름이 필요하다. |
| 보통: 실제 사용자 흐름 검증 | `.github/workflows/highschool-quality.yml` | 인증 E2E는 유효한 세션을 준비하고 쓰기 부작용을 검토한 뒤 실행해야 한다. 로컬 단위·렌더 테스트와 공개 홈 Lighthouse가 인증 후 전체 화면을 보증하지 않는다. |
| 낮음: 코드 정리 | 학생 앱 lint 출력 | 기존 any·미사용 변수·Hook 의존성·이미지/폰트 경고 24개. 일괄 자동 수정이나 규칙 비활성화로 숨기지 않았다. |

의존성 수치는 2026-09-05 `npm audit --json` 및 `npm audit --omit=dev --json`의 설치본 결과다. 패키지 경고 개수이며 서로 독립적인 운영 취약점 개수로 해석하지 않는다.

| 앱 | 전체 audit | 운영 의존성만 |
|---|---|---|
| 통합 앱 | 15건: high 8, moderate 5, low 2 | 보고된 취약점 0건 |
| 학생 앱 | 10건: high 8, moderate 1, low 1 | 6건: `next`, `nanoid`, `postcss`, `sharp`, `xlsx` high / `protobufjs` moderate |

학생 앱은 정적 Hosting이므로 Next 서버·이미지 최적화 서버의 운영 실행 여부를 서버 앱과 구분해야 한다. `xlsx`는 현재 `src/utils/export.ts`의 내보내기에 사용하지만 audit의 자동 수정판이 없어 교체·호환성 검토가 남는다. 통합 앱의 개발 의존성에는 Lighthouse 체인의 경고가 있으며 audit가 `@lhci/cli` 0.1.0으로의 주요 버전 변경을 제안해 무조건적인 `audit fix --force`는 적용하지 않았다. 운영 의존성 audit 0건은 전체 보안 결함 0개를 뜻하지 않는다.

현재 변경은 로컬 브랜치에 준비했다. 운영 반영 여부와 최신 작업 인수인계는 루트 `.claude/HANDOFF.md`를 따른다.

## 실행 출력 발췌

```text
Test Files  110 passed (110)
Tests  860 passed (860)
✖ 24 problems (0 errors, 24 warnings)
Test Files  14 passed (14)
Tests  168 passed (168)

highschool-app: npm run test:coverage
Statements   : 74.63% ( 4239/5680 )
Branches     : 68.07% ( 3075/4517 )
Functions    : 73.64% ( 1252/1700 )
Lines        : 77.04% ( 3420/4439 )

node --test agent-os/*.test.js
ℹ tests 35
ℹ pass 35
ℹ fail 0
ℹ skipped 0
```
