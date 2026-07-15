# 인수인계 — 2026-07-16 (Claude 재개용)

> 새 세션은 다음 순서로 읽으세요:
> ① 루트 `AGENTS.md` → ② 루트 `CLAUDE.md` → ③ 이 문서 →
> ④ 대상 앱 `CLAUDE.md`·`AGENTS.md` → ⑤ 경로 변경은 `DB_OWNERSHIP.md` → ⑥ 배포·복구는 `OPERATIONS.md` → ⑦ 도구 함정은 `LEARNINGS.md`.
> **모든 작업 시작 전 DB 안전 4문답을 먼저 답하세요.** 여름수련회는 2026-07-24~26입니다.

## 지금 상태 (한 문장)

IGuard에 Google 로그인·팀원 승인 위에 수련회별 PIN 잠금과 관리자 우회를 추가했고, 이후 행정 사이트 방배정 출력 개선까지 포함한 최신 `main`이 두 운영 앱에 배포되어 있다.

## 저장소·배포 상태 (실측 2026-07-16)

- 기능 기준 `HEAD == origin/main == 70f4a50a17ca941f5e7986b8b5392689a1d64bbf`.
- 이 HANDOFF 문서를 로컬 커밋한 뒤에는 로컬 `main`이 문서 커밋 1개만큼 `origin/main`보다 앞서는 것이 정상이다. **사용자 요청 없이 push하지 말 것** — `main` push는 Vercel 자동 배포를 일으킨다.
- 추적 파일 작업트리는 기능 커밋 기준 클린. `.agents/`만 untracked 도구 아티팩트이며 커밋 대상이 아니다.
- 운영 주소:
  - retreat-app: `https://retreat-app-theta.vercel.app`
  - iguard-app: `https://iguard-app.vercel.app`
- 두 앱 `/api/version`의 buildId가 모두 `70f4a50a17ca941f5e7986b8b5392689a1d64bbf`인 것을 확인했다.
- 마지막 IGuard 기능 검증:
  - `npm test`: 13개 파일, 124개 테스트 통과
  - `npx tsc --noEmit`: 성공
  - `npm run build`: 성공
  - `npm run lint`: 오류 0개, 기존 경고 11개
  - 운영 관리자 로그인 화면에서 `🔐 관리자` 버튼과 PIN 관리 모달을 읽기 전용 확인
- 이번 PIN 작업과 인수인계 작업에서 운영 DB 직접 쓰기 없음, Firebase Rules 변경·배포 없음.

## 마지막 핵심 완료 작업 — IGuard 수련회별 PIN 잠금 (`ad6b559`)

### 요구사항과 동작

- 기존 Google 로그인과 팀원 승인 절차는 그대로 유지한다.
- 승인된 일반 팀원이 잠긴 수련회에 접근하면 전체 화면 PIN 입력 단계가 먼저 나온다.
- 관리자는 PIN 입력 없이 우회한다.
- 목록 상단에서 `🔐 관리자`가 `👥 팀원 관리` 왼쪽에 표시된다.
- 관리자 모달에서 수련회별 PIN 설정·변경·해제가 가능하다.
- 현재 운영에서 확인한 여름·겨울 수련회는 모두 `공개` 상태다. 아직 실제 PIN을 저장하지 않았다.

### 구현 위치

- `iguard-app/src/lib/accessLock.ts`
  - 숫자 PIN 4~8자리, UI에서는 6자리 이상 권장
  - PIN 원문은 저장하지 않고 PBKDF2-SHA256, 무작위 16바이트 salt, 120,000회 반복 결과만 저장
  - sessionStorage 해제 키에 pinHash 접두를 포함해 PIN 변경 시 기존 브라우저 해제가 자동 무효화
- `iguard-app/src/lib/types.ts`: `IguardAccessLock` 타입
- `iguard-app/src/lib/paths.ts`: `iguardAccessLock` 경로 헬퍼
- `iguard-app/src/lib/db.ts`: 단일·전체 잠금 구독, 저장, 삭제
- `iguard-app/src/app/AdminModal.tsx`: 관리자 전용 PIN 관리 모달
- `iguard-app/src/app/page.tsx`: 관리자 버튼과 잠금 상태 배지
- `iguard-app/src/app/retreat/[id]/RetreatPinGate.tsx`: PIN 입력 게이트
- `iguard-app/src/app/retreat/[id]/IguardClient.tsx`: 관리자 우회 및 일반 사용자 접근 경계
- `iguard-app/__tests__/accessLock.test.ts`: PIN 생성·검증·세션 키 회귀 테스트 4개

### DB 경로와 데이터 흐름

- 잠금 데이터 경로: `retreats/{id}/iguard/accessLock`.
- IGuard 소유 경로이며 `DB_OWNERSHIP.md`에도 반영했다.
- 일반 사용자는 잠금 구독이 끝나고 PIN이 검증되기 전에는 `IguardWorkspace`가 마운트되지 않는다. 따라서 내부 `useRetreatData` 구독도 시작되지 않는다.
- 잠금 읽기에 실패하면 공개로 간주하지 않고 실패 폐쇄(fail-closed)한다.
- 관리자가 PIN을 설정하면 해당 수련회 노드 한 곳에 운영 DB 쓰기가 발생한다. 에이전트는 이 쓰기를 수행하지 않았다.

### 중요한 보안 범위

- 이 기능은 승인 팀원의 공유 링크·실수 접근을 한 단계 더 막는 **앱 수준 접근 게이트**다.
- 현재 Firebase Rules는 승인 팀원에게 `retreats` 읽기를 허용하고, 팀 역할 사용자는 `iguard` 부모 아래 쓰기가 가능하다. 그러므로 PIN만으로 Firebase 데이터 자체가 사용자별 ACL로 격리되는 것은 아니다.
- Google 로그인·팀원 승인을 대체하지 않으며, 데이터베이스 보안 경계라고 과장하면 안 된다.
- 이 패턴과 한계는 `iguard-app/CLAUDE.md` 패턴 20과 `iguard-app/AGENTS.md`의 `수련회별 PIN 잠금 (2026-07-16)`에 기록했다.

### 운영 확인

- 배포 당시 운영 Chrome 관리자 세션에서 헤더의 `🔐 관리자` 버튼과 모달을 확인했다.
- 모달에 수련회 2개가 표시되고 둘 다 `공개`였으며, PIN 저장 버튼은 값이 없을 때 비활성화됐다.
- 저장·해제 버튼은 누르지 않아 DB 쓰기는 없었다.
- 일반 팀원 계정으로 잠금 진입을 끝까지 검증하지는 못했다.

## 이후 반영된 retreat-app 개선 (현재 HEAD 포함)

- `c3af8d9`: 신청자 취합 합계에 남녀 인원 표시.
- `e83e5e3`: 방배정에서 배정만 비우기 버튼 추가.
- `81cc704`: 조편성 XLSX 그리드, 방배정 도면 인쇄, 조 인원에 조장 포함.
- `b92d666`: 방배정 도면에 조·부서·학년·반 정보 표기.
- `70f4a50`: 방배정 도면 정보 줄 세로 중앙 정렬.
- `127c683`: 2부 조장 동명이인 반 표시와 교사 메모 삭제 복구 버그 수정.
  - 운영에서 이준영 조장은 `2-3`으로 정상 표시되는 것을 확인했다.
  - 이미진 선생님의 구버전 저장 잔여값은 새 코드에서 메모·부분참 값을 비운 뒤 UI로 한 번 저장해야 실제 삭제된다. 에이전트는 운영 DB를 직접 수정하지 않았다.

## 다음 단계

### 사용자가 바로 할 수 있는 운영 작업

- [ ] IGuard 관리자 계정으로 `🔐 관리자`를 열어 잠글 수련회의 PIN을 설정한다.
  - 이 작업은 `retreats/{id}/iguard/accessLock` 한 노드에 운영 DB 쓰기를 발생시킨다.
- [ ] 일반 팀원 계정으로 해당 수련회 진입 시 PIN 게이트가 뜨고, 오답 거부·정답 통과·새로고침 후 세션 유지가 되는지 확인한다.
- [ ] 교사 참석에서 이미진 행을 열어 전참을 유지하고 메모·부분참 값을 비운 뒤 한 번 저장하여 과거 잔여값을 삭제한다.

### 다음 에이전트 작업 후보

- [ ] 일반 팀원 또는 staff role 테스트 계정이 제공되면 PIN 잠금과 권한별 화면을 읽기 위주로 검증한다.
- [ ] PIN을 더 강한 데이터 보안 경계로 만들려면 현재 Rules·데이터 모델 한계를 먼저 설계 검토한다. **Rules 배포는 하지 않는다.**
- [ ] 이미진 값이 새 저장 뒤에도 복구되면 추측 수정 금지. 저장 payload와 해당 교사 레코드 구독 결과를 읽기 전용으로 추적한다.
- [ ] 행정 사이트 리허설 QA: 현장등록·의료일지·부분참석·인쇄/엑셀(XSS) 중심.
- [ ] semester-app code-review 높음 2건:
  1. 팀 삭제 시 배치 학생이 AssignTab 어디에도 보이지 않는 유령 상태
  2. SettingsTab이 마운트 시 meta를 캡처해 최신 completionRule을 덮을 가능성
- [ ] 시트 데이터 정리 후 IGuard 재임포트, 버스 자동배정, 행정 방배정 입력은 운영 담당자 확인 후 진행.

## DB·배포 안전 메모

- 운영 DB 쓰기는 사용자 명시 승인과 사전 스냅샷 없이는 금지.
- Firebase Rules 배포는 항상 금지. 원천은 `고등부 학생 출석부/database.rules.json` 하나뿐이다.
- retreat-app 소유 범위는 `retreats/{id}`, `retreatsPrivate/{id}`, `retreatAdmins`; `classes/`는 읽기 전용.
- IGuard의 신규 PIN 경로는 `retreats/{id}/iguard/accessLock`이다.
- `main` push는 retreat-app과 iguard-app 양쪽에 자동 Production 배포를 생성할 수 있다. 문서만 바뀌어도 사용자 요청 없이 push하지 않는다.
- `.agents/`는 도구 아티팩트로 계속 무시한다.
- 배포 완료 판단은 Vercel Ready와 공식 `/api/version` buildId=`git rev-parse HEAD` 대조 후에만 한다.

## 다음 세션 첫 확인 명령

```bash
git status --short --branch
git log -10 --oneline
curl -fsS https://retreat-app-theta.vercel.app/api/version
curl -fsS https://iguard-app.vercel.app/api/version
```

기능 기준 배포 buildId는 `70f4a50a17ca941f5e7986b8b5392689a1d64bbf`다. 로컬 HEAD는 이 HANDOFF 문서 커밋 때문에 한 커밋 더 앞서는 것이 정상이다.
