# 인수인계 — 2026-07-13 (Claude 재개용)

> 새 세션은 다음 순서로 읽으세요:
> ① 루트 `AGENTS.md` → ② 루트 `CLAUDE.md` → ③ 이 문서 →
> ④ 경로를 만지면 `DB_OWNERSHIP.md` → ⑤ 배포·복구는 `OPERATIONS.md` → ⑥ 도구 함정은 `LEARNINGS.md` → ⑦ 대상 앱 `CLAUDE.md`·`AGENTS.md`.
> **모든 작업 시작 전 DB 안전 4문답에 먼저 답하세요.** 여름수련회 7/24~26, 현재 D-11.

## 지금 하던 일 (한 문장)

Codex 전환 문서와 현장 직전 UX를 보강하고, 이가드 개인 큐카드 본인 자동 선택 및 행정 조·방 전체 삭제를 안전 백업과 함께 배포·운영 검증까지 마쳤다.

## 저장소 상태 (실측 2026-07-13)

- 배포 기준 기능 커밋과 `origin/main`은 `86d3c32`. 이 문서를 로컬 커밋한 뒤에는 로컬 main이 핸드오프 문서 커밋 1개만큼 앞선다.
- 추적 파일 작업트리 클린. `.agents/`만 untracked인 도구 아티팩트이며 커밋 대상 아님.
- 최근 커밋:
  - `86d3c32` 행정: 방 전체 삭제 안전 기능
  - `9b230d4` 행정: 조 전체 삭제 안전 기능
  - `5f760f2` 이가드: 개인 큐카드 본인 꼬리표 제거
  - `0d92985` 이가드: 개인 큐카드 본인 우선 선택
  - `bd3c3bd` 문서: semester-app 에이전트 가이드 추가
- 운영 배포:
  - retreat-app: `https://retreat-app-theta.vercel.app` — Vercel Ready, buildId=`86d3c32...`
  - iguard-app: `https://iguard-app.vercel.app` — Vercel Ready, buildId=`86d3c32...`
  - semester-app: `https://semester-app.vercel.app` — Vercel Ready, HTTP 200. 이 앱은 `/api/version`이 없어 buildId 대조 불가.
- 검증:
  - retreat-app: tsc 0 errors, 테스트 123개 통과, production build 성공
  - iguard-app: tsc 0 errors, 테스트 116개 통과, production build 성공
  - semester-app: tsc 0 errors, 테스트 5개 통과

## 이번 세션 완료 — 커밋·푸시·배포됨

### 1. 5개 앱 에이전트 문서 정리 (`bd3c3bd`)

- 루트 `AGENTS.md`를 four→five apps로 수정하고 `semester-app` 소유권(`semesters/`, `semestersPrivate/`)을 추가.
- `semester-app/AGENTS.md` 신규 작성: DB 경계, `db.ts`/`paths.ts`, 구독 에러, 수료 계산, 출석 멱등 패턴과 배포 제한 기록.

### 2. 이가드 개인 큐카드 본인 자동 선택 (`0d92985`, `5f760f2`)

- 원인: `CueCardView`가 로그인 사용자를 받지 않고 항상 첫 스탭을 초기 선택해 모두 김기영부터 보였음.
- 구현: `iguardMembers/{uid}.name` → Google `displayName` 순으로 행정 스탭 명단과 유일 매칭.
- 매칭된 본인을 자동 선택하고 드롭다운 최상단에 배치하되 별도 `(나)` 꼬리표는 표시하지 않음.
- 동명이인·불일치는 임의 선택하지 않고 가나다순 첫 항목으로 폴백. 사용자의 이후 수동 선택은 `staffPicked`/`chooseCueCardStaffId`가 보존.
- 신규 순수 로직: `iguard-app/src/lib/staffIdentity.ts`, 테스트 `staffIdentity.test.ts` 6개.
- 운영 검증: 김성훈 계정에서 첫 선택이 `김성훈`, `(나)` 없음 확인. DB 쓰기 없음.

### 3. 행정 조 전체 삭제 (`9b230d4`)

- 조편성 툴바에 `조 전체 삭제` 추가.
- 미저장 편집을 먼저 `saveGroups()`로 저장한 뒤 `clearGroups()` 실행.
- `clearGroups()`는 `minIntervalMs=0`으로 `groupsBackups` 강제 백업이 성공한 경우에만 `retreats/{id}/groups`를 삭제.
- `backupNodeBeforeOverwrite()`는 이제 `boolean`을 반환: 일반 저장은 반환값을 무시해 기존 베스트 에포트 유지, 파괴적 전체 삭제는 `false`면 중단.
- 확인창에 조 수·배정 학생 수·복구 가능·방배정/이가드 조스탭 연결 단절 가능성을 표시.
- 방배정과 이가드 소유 `retreats/{id}/iguard/groupStaff`는 삭제하지 않음.
- 운영 검증: `14개 조·배정 학생 142명` 확인창까지 열고 **취소**, 이후 `총 14조` 유지 확인. 운영 DB 쓰기 없음.

### 4. 행정 방 전체 삭제 (`86d3c32`)

- 방배정 툴바에 `방 전체 삭제` 추가.
- 미저장 편집을 먼저 `saveRooms()`로 저장한 뒤 `clearRooms()` 실행.
- `clearRooms()`는 `minIntervalMs=0`으로 `roomsBackups` 강제 백업이 성공한 경우에만 `retreats/{id}/rooms`를 삭제.
- 확인창에 방 수·배정 학생 수·복구 가능·이가드 숙소 화면 영향 표시.
- `rooms` 외 다른 노드는 삭제하지 않음.
- `groupsRooms.test.ts`가 조/방 각각 “강제 백업 후 해당 노드만 삭제”와 “백업 실패 시 삭제 금지”를 검증(총 4개).
- 운영 검증: 현재 `총 0개 방`이라 버튼이 비활성화된 정상 상태 확인. 실제 삭제·DB 쓰기는 미실시.

## 이전 세션에서 완료된 주요 기능

1. **semester-app 신규(5번째 앱)** 생성·배포 — 학기 훈련·사역팀 관리. Rules(`semesters`/`semestersPrivate`)는 학생 앱 원천에서 배포 완료.
2. **행정 조편성 반 붙임 관계** (`aff94ec`) — union-find 결합, 분리 관계와 모순 검증.
3. **이가드 큐싯 새벽 일정 정규화** (`17abe82`) — 24시+ 표기, blockKey 절대분 키, additive 재임포트.
4. **행정 부분참석 탭 개편** (`f634fa9`) — 주황 표시 학생과 지정 학생의 합집합만 표시.
5. **이가드 심층 QA 후속** (`07d6bc6`, `51ce838`) — 순간이동 오탐, 달력, 빈 상태, 자정넘김, 하단 탭바, 연식 라벨.
6. **행정 장결자 색칠 버그** (`aa4632b`) — 신청한 장결자를 매칭 풀에 포함.

## 미완 — 정확한 다음 단계

### A. 사용자만 할 수 있는 수련회 전 운영 작업

- [ ] **시트 데이터 정리 후 이가드 재임포트**
  1. 3일차 귀가 버스 선탑/동승 칸을 문장이 아닌 이름 목록으로 정리
  2. 순간이동 13건 중 밤 시간대 같은 사람·다른 포스트 담당이 의도인지 확인
  3. 조장 큐싯 시트 탭 존재와 이름 확인
  4. 이가드 기획 → 스탭 전체 큐싯 → 시트에서 불러오기 → 시트 반영
- [ ] **버스 자동배정 실행** + **행정에서 방배정 입력**. 2026-07-13 운영 실측상 현재 방은 0개.
- [ ] **semester-app Firebase 승인 도메인 추가**: Firebase Console → Authentication → Settings → Authorized domains → `semester-app.vercel.app`. 미등록 시 Google 로그인 불가.

### B. 다음 에이전트가 사용자 승인 후 할 수 있는 작업

- [ ] **행정 사이트 리허설 QA** — 현장등록·의료일지·부분참석·인쇄/엑셀(XSS) 중심. 이가드는 심층 QA 완료, 행정 전체 탭 QA는 미실시.
- [ ] **권한별 화면 검증** — 지금까지 admin 계정 위주. staff role 계정으로 실행 탭만 노출되는지 확인하려면 스탭 테스트 계정 필요.
- [ ] **semester-app code-review 높음 2건**
  1. 팀 삭제 시 배치 학생이 AssignTab 어디에도 보이지 않는 유령 상태
  2. SettingsTab이 마운트 시 meta를 캡처해 저장 시 최신 completionRule을 덮을 가능성
- [ ] 필요하면 조·방 전체 삭제의 **실제 복구 리허설**. 운영 삭제 실행은 사용자 명시 승인 + 직전 스냅샷 후에만.

## 미커밋 변경

없음. `.agents/`만 도구 아티팩트로 untracked이며 무시할 것. 로컬 main의 핸드오프 문서 커밋은 미푸시 상태가 정상이다. push하면 retreat·iguard가 자동 재배포되므로 사용자 요청 없이 push하지 말 것.

## 막힌 것 / 사용자 답변 대기

- 다음 작업 선택 대기. 운영 DB 직접 쓰기, 실제 전체 삭제, Rules 변경은 승인 없이 실행 금지.

## 함정과 재사용 규칙

- **main push는 retreat-app과 iguard-app을 둘 다 자동 배포한다.** 한 앱만 바뀌어도 2026-07-13 실측상 두 앱 모두 HEAD `86d3c32`로 새 Production이 생성됐다. push 후 두 앱의 `npx vercel ls`를 확인할 것.
- **semester-app은 Git 자동배포 미연결**이며 `/api/version` 라우트도 없다. 배포는 앱 폴더에서 수동 CLI, 검증은 Vercel Ready + HTTP 200으로 구분한다.
- **조/방 전체 삭제는 일반 `saveGroups([])`/`saveRooms([])`로 구현하지 말 것.** 10분 백업 스로틀 때문에 직전 상태를 놓칠 수 있다. 반드시 `clearGroups()`/`clearRooms()` 사용.
- **조 삭제는 연관 노드를 같이 지우지 않는다.** 방배정과 이가드 `groupStaff`는 남아 기존 조 ID 연결이 끊길 수 있으며 확인창이 이를 고지한다.
- **파괴적 라이브 검증은 확인창까지만 열고 취소한다.** 이번 세션도 조 삭제는 확인창 확인 후 취소했고, 방 삭제는 0개라 비활성 상태만 확인했다.
- 브라우저 새 탭은 로그인 세션이 없을 수 있다. 로그인 불가 시 자격증명을 입력하지 말고 `/api/version` buildId 대조로 배포를 확정한다.
- Google Sheets는 이름박스 셀 점프(`A40` 입력+Enter)로 읽고, 일반 스크롤/PageDown에 의존하지 않는다 (`LEARNINGS.md`).

## 다음 세션 첫 확인 명령

```bash
git status --short --branch
git log -5 --oneline
curl -fsS https://retreat-app-theta.vercel.app/api/version
curl -fsS https://iguard-app.vercel.app/api/version
```

예상 운영 buildId: `86d3c32d7f4949fcf6931d30a3cde73533b6f0d7`. 로컬 HEAD는 이 문서 커밋 때문에 다를 수 있다.
