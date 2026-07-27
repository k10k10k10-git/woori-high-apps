# 인수인계 — 2026-07-27 20:20 (에이전트 중립 — GPT/Claude 공용)

## 지금 하던 일 (한 문장)

행정(retreat-app)의 품질 부채 2건(현장등록 해제 오조작 방지 + 공용 확인창 접근성)을 수정·배포 완료했고, 다음 후보는 남은 모달 10개의 a11y 보강 또는 IGuard 피드백 설문이다.

## 완료된 것 (커밋 해시와 함께)

- `2cf9360 행정: 현장등록 해제 확인창과 공용 확인창 접근성 보강` — **푸시·배포·buildId 대조까지 완료**.
  - **ⓐ 현장등록 해제 확인창**: 체크인 칩이 토글이라 등록된 학생을 확인하려고 눌렀다가 해제되는 오조작이 가능했다. 등록(미등록→등록)은 현장 속도를 위해 그대로 두고 **해제일 때만** `uiConfirm`을 거치게 했다. 경로 2개 모두 적용: `OnSiteRegistrationTab.tsx`의 `toggleRegistration`(검색 패널), `toggleFromRightPanel`(반별 칩 — 기존 감사에서 누락됐던 경로).
  - 판정 단일 원천은 `retreat-app/src/lib/onSiteRoster.ts`의 순수 함수 `willUnregisterOnSite(entry)`이며 `toggleOnSiteCheckIn` 트랜잭션 분기(미등록→등록 / 등록→해제 / `isOnSite`는 토글 안 함)와 기준이 같다. 회귀 테스트 3개: `onSiteRoster.test.ts`의 `describe("willUnregisterOnSite")`.
  - **ⓑ 공용 확인창 a11y**: `src/context/UIContext.tsx`의 confirm에 `role="dialog"`·`aria-modal`·`aria-labelledby`(메시지 연결)·**ESC=취소**·**Tab 포커스 트랩**·**열기 전 포커스 복원**을 넣고 초기 포커스를 안전 기본값인 **취소** 버튼에 둔다. 모든 `uiConfirm()` 호출이 함께 개선된다.
  - 문서 동반 갱신: `retreat-app/CLAUDE.md` 패턴 7(확인창을 기준 구현으로 명시 + 미보강 파일 목록)·패턴 3f(등록 즉시/해제 확인 규칙), `LEARNINGS.md`(인증 벽 뒤 공용 UI 검증법).

### 저장소·운영 배포 상태 (실측 2026-07-27 20:1x)

- `HEAD == origin/main == 2cf9360e15b50b4c00ab3c843662c3d536504828`.
- retreat-app: Vercel Production `● Ready`(44초), `https://retreat-app-theta.vercel.app/api/version` buildId = `2cf9360…` **대조 일치**.
- iguard-app: 모노레포 push로 함께 재배포됨, `https://iguard-app.vercel.app/api/version` buildId = `2cf9360…` **대조 일치**. IGuard 소스 변경은 없다(이번 변경은 `retreat-app/` 안에서만).
- 검증: retreat-app `tsc` 0 errors · 테스트 **27파일 235개 통과**(232→+3) · `lint` 0 errors/기존 경고 9 · `build` 성공. iguard-app `tsc` 0 errors(이번 세션 재실측), 테스트 25파일 193개 통과(직전 세션 기록).
- DB 직접 쓰기와 Firebase Rules 변경·배포는 **없었다**.
- 작업 트리 미추적 항목 `.agents/`, `outputs/`, `rayquaza-v2-upgrade/`, `tmp/`는 과거 운영 산출물·도구 아티팩트다. 임의 커밋·삭제하지 않는다.

## 미완인 것 — 정확한 다음 단계

- [ ] **남은 모달 a11y 보강 (권장 다음 작업)**: `role="dialog"`가 없는 오버레이가 아직 10개 파일에 있다 — `GroupsTab` · `RoomsTab` · `TeachersTab` · `CarpoolTab` · `MedicalLogTab` · `NotesTab` · `SuppliesTab` · `CancellationTab` · `OnSiteRegistrationTab`(현장추가 모달) · `AutoAssignPreviewModal`. 기준 구현은 `src/context/UIContext.tsx`. 현황 재확인 명령:
  ```bash
  cd retreat-app && for f in $(grep -rl 'fixed inset-0' src/); do grep -q 'role="dialog"' "$f" || echo "$f"; done
  ```
- [ ] **IGuard 피드백 설문** (수련회 2026-07-24~26 종료 후 대기 중): 실사용 스탭 대상 **익명 Google Form**. 이름·이메일 미수집, 약 5분 내 응답 분량. 기능별 평가는 `선형 배율` 대신 아래 6지 **객관식**을 권장(선형 배율에는 `사용하지 않음`을 넣을 수 없다): `매우 어려웠다 / 어려웠다 / 보통이었다 / 쉬웠다 / 매우 쉬웠다 / 사용하지 않았다`. 사용자가 선형 배율을 고수하면 `1 라벨=매우 어려웠다`, `5 라벨=매우 쉬웠다`로 두고 필수 질문을 해제하도록 안내. 다음 요청은 문항 다듬기·폼 작성 지원·응답 분석일 가능성이 높다.
- [ ] **사용자 운영 확인(코드 아님)**: 배포된 현장 등록 탭에서 이미 등록된 칩을 눌러 `"…등록을 해제하시겠습니까?"`가 뜨는지 확인. **확인창에서 취소를 누르면 DB에 아무것도 쓰이지 않으므로** 이 방법으로 안전하게 검증할 수 있다.

## 미커밋 변경 (있다면 파일별 요약)

- 없음. 이 인수인계 파일 자체를 제외하면 작업 트리는 깨끗하고 `origin/main`과 동일하다.

## 막힌 것 / 사용자 답변 대기 중인 질문

- 없음. 직전 질문("HANDOFF 갱신할까요?")에 사용자가 갱신을 지시해 이 문서를 쓰는 중이다.

## 이 작업의 함정 (이번 세션에서 배운 것)

- **인증 벽 뒤 UI 검증**: `uiConfirm` 같은 전역 공용 UI는 호출 지점이 전부 Google OAuth 뒤라 헤드리스로 못 지나간다. `retreat-app/src/app/<임시라우트>/page.tsx`에 `useUI()`만 쓰는 최소 페이지를 만들어 dev 서버에서 구동 검증하고 **끝나면 삭제**한다(삭제 확인은 `npm run build` 라우트 목록 + `git status` 두 곳). 상세는 `LEARNINGS.md` 2026-07-27 항목.
- **Next.js App Router는 `_`로 시작하는 폴더를 private folder로 보고 라우팅에서 제외한다** → `__a11y-check`로 만들면 404. `tmp-a11y-check`처럼 밑줄로 시작하지 않는 이름을 쓸 것(실제로 밟았다).
- **모달 키 처리는 `document`의 capture 리스너로**. 오버레이 `div`의 `onKeyDown`은 포커스가 모달 안에 있을 때만 동작해서, 포커스가 밖이면 ESC가 먹지 않는다. 기존 `FormGuideModal.tsx`가 이 방식이라 같은 약점이 있다.
- **`setState` 업데이터 안에서 promise resolve 같은 부수효과 금지**. Next 기본값으로 StrictMode가 켜져 있어 업데이터가 두 번 실행된다. `handleConfirm`은 `confirmResolveRef`로 업데이터 밖에서 resolve한다.
- **파괴적 확인창에 backdrop 클릭 닫기를 넣지 말 것**. 실수 클릭으로 닫히면 확인창의 의미가 없다.
- 기존 감사 보고서의 범위를 그대로 믿지 말 것 — 이번에 ⓐ는 보고된 1개 경로 외에 `toggleFromRightPanel`이, ⓑ는 1개 파일 외에 10개 파일이 추가로 발견됐다.

## 검증 상태

- **tsc**: retreat-app 0 errors / iguard-app 0 errors (둘 다 이번 세션 재실측)
- **테스트**: retreat-app 27파일 235개 통과 / iguard-app 25파일 193개 통과
- **lint**: retreat-app 0 errors, 경고 9개(기존 baseline과 동일 — 신규 경고 없음)
- **배포**: retreat-app `● Ready` + buildId `2cf9360…` 대조 일치 / iguard-app buildId 동일 대조 일치

### 최신 IGuard UI 변경

- `iguard-app/src/app/retreat/[id]/ExecutionViews.tsx`
  - 개인 큐카드의 고정 `지금 해야 할 일 / 다음 해야 할 일` 영역에 `접기 ▲ / 펼치기 ▼` 버튼을 추가했다.
  - 기본은 펼친 상태다.
  - 접으면 상세 동선·담당 내용만 숨기고 현재/다음 일정 제목과 시간은 남긴다.
  - `aria-expanded`와 두 상세 영역을 가리키는 `aria-controls`를 연결했다.
- `iguard-app/__tests__/stickyLayout.test.ts`
  - 고정 일정 영역의 접기 상태·접근성 속성·다음 일정 상세 조건부 렌더링 계약을 회귀 테스트로 고정했다.

### 2026-07-22~24 최근 숙소 배정도 기능

- `e9ab707`: IGuard 실행 탭에 숙소 배정도 추가.
- `8d0b39d`: 실제 도면 좌표에 방 정보를 맞추고 상세를 앵커 옆 말풍선으로 변경.
- `cd366f3`: 방 배지에 반뿐 아니라 조 번호도 표시.
- `252ecfe`: 도면이 없는 별관 숙소를 실제 운영 DB 호실 기준 간이 배치도로 추가.
- 핵심 구현과 재사용 규칙은 `iguard-app/AGENTS.md`의 `정적 숙소 도면에 실시간 방배정 겹쳐 보기` 항목에 기록돼 있다.

### 아래 오래된 섹션을 읽을 때 주의

- 아래 2026-07-19의 `당일참석 Rules 블로커`는 **역사 기록이며 현재 미완료 작업이 아니다**. 이후 정식 `당일참석(day)`이 행정·IGuard의 해당 일차 조별/버스/인원체크에 반영되도록 구현됐다.
- 최신 동작은 코드와 `iguard-app/AGENTS.md`의 `Formal 당일참석(day)` 규칙을 우선한다.
- 아래의 과거 `HEAD=f557997`·`a03fba2` 및 그때의 배포 상태도 역사 기록이다. 현재 기준은 위 `2cf9360`이다.
- 아래 `2026-07-17 저녁` 섹션 이하에 나오는 buildId·`HEAD` 값은 전부 그 시점의 값이다. 배포 판단은 항상 `git rev-parse HEAD`와 운영 `/api/version`을 직접 대조해서 하고, 이 문서에 적힌 해시를 믿지 말 것.

> 새 세션은 다음 순서로 읽으세요:
> ① 루트 `AGENTS.md` → ② 루트 `CLAUDE.md` → ③ 이 문서 →
> ④ 대상 앱 `CLAUDE.md`·`AGENTS.md` → ⑤ 경로 변경은 `DB_OWNERSHIP.md` → ⑥ 배포·복구는 `OPERATIONS.md` → ⑦ 도구 함정은 `LEARNINGS.md`.
> **모든 작업 시작 전 DB 안전 4문답을 먼저 답하세요.** 여름수련회는 2026-07-24~26입니다.

## 과거 기록 — 2026-07-19 당시 상태

조편성의 기본 구조 6개를 실제 선택 규칙으로 전환한 `f557997`이 행정 운영에 배포됐고, 다음 요청인 부분참석 `당일참석` 추가는 Firebase Rules가 현재 유형과 필드를 차단해 안전 규칙에 따라 코드 수정 전 중단한 상태다.

## 과거 기록 — 저장소·배포 상태 (실측 2026-07-19)

- `HEAD == origin/main == f55799759133222f9172b08af59ce7a645ca2d2d`.
- 이 인수인계를 위한 `.claude/HANDOFF.md`만 미커밋 수정 상태. `.agents/`와 `rayquaza-v2-upgrade/`는 untracked이며 커밋 대상이 아니다.
- 운영 주소:
  - retreat-app: `https://retreat-app-theta.vercel.app` — buildId `f55799759133222f9172b08af59ce7a645ca2d2d` 대조 확인
  - iguard-app: `https://iguard-app.vercel.app`
- retreat-app 마지막 검증(`f557997`): tsc 0 · 테스트 193 통과 · build 성공 · lint 오류 0/기존 경고 9.

## 2026-07-19 최신 완료 — 조편성 기본 구조도 선택형으로 전환

- 커밋/배포: `f557997` (`행정: 조편성 기본 구조 규칙 선택 지원`), Vercel Production Ready 및 운영 `/api/version` 일치 확인.
- 기존 `항상 적용되는 기본 구조` 6개를 체크박스로 전환: `keepSameClass`, `inferGenderByClass`, `excludeNonClassTeachers`, `ensureNonEmptyGroups`, `ensureEvenGroupCount`, `optimizeResults`.
- UI만 바꾸지 않고 `AutoAssignPanel.tsx`의 조 수 사전계산과 `autoAssignUtils.ts`의 배정·점수·교사 분산·후처리를 모두 규칙별로 실제 분기.
- 구버전 `autoAssignConfig` 문서에 새 플래그가 없으면 모두 `true`로 보정해 기존 동작을 유지. 사용자가 `설정 저장`을 누를 때만 `retreats/{id}/autoAssignConfig` 문서에 선택값 기록.
- `keepSameClass=false`+성별 추론 해제 조합에서 학생별 신청 성별이 유지되도록 `ClassUnit.genders` 보존. 회귀 테스트가 구버전 기본값·명시적 false·규칙 조합을 보호.
- 학습 메모: `retreat-app/AGENTS.md` 하단 `고정처럼 보이던 배정 구조를 실제 선택 규칙으로 전환`.

## 2026-07-19 조사 — `현장 추가 등록`의 현재 반영 범위

- `OnSiteRegistrationTab.handleAddWalkIn()`→`addWalkIn()`이 `retreats/{id}/onSiteReg/{pushKey}`에 `isOnSite=true`, 이름·부·학년·반·성별·시간만 저장.
- 현장등록 반별 명단에는 즉시 `registered=true`로 보이고 `현장추가 N명`으로 별도 표시되지만, 기존 `등록/전체` 진행률에는 포함되지 않음.
- `onSiteReg` 구독은 현재 현장등록 탭만 사용. `participants`에 추가하지 않아 시트 연동·신청자 취합·조편성·방배정·식수·부분참·이가드에는 반영 안 됨.
- 여행자 보험 학생은 `InsuranceTab.tsx`가 Google Sheet의 주민번호 열을 직접 읽으므로 현장추가에는 반영 안 됨.
- 이 조사에서 코드·DB 수정 없음.

## 과거 기록 — 당시 부분참석 `당일참석` 블로커 (이후 해결됨)

- 사용자 요청: 행정 부분참석 탭에 `당일참석`을 추가하고 식수 계산·이가드 인원체크/버스 등 다른 소비처에도 반영.
- **코드 수정 전 중단함**. 배포 Rules의 `retreats/$retreatId/partialAttendances/$studentKey` 검증은 `type` 값을 `선복귀|후발대`로만 제한하고 `$other.validate=false`로 새 필드도 차단한다. 따라서 `당일참석` 유형과 날짜/식사 범위 필드를 정식 저장하려면 Rules 변경이 필수.
- 루트 안전 규칙상 에이전트는 Rules를 수정·배포하지 않는다. Rules 원천은 `고등부 학생 출석부/database.rules.json` 하나뿐이며 retreat/iguard의 `DO_NOT_DEPLOY` 파일은 사용 금지.
- 구조 결정이 추가로 필요: `당일참석`은 적어도 참석 날짜, 첫 참석 식사, 마지막 참석 식사, 버스 탑승 여부를 구조화해야 식수·버스·인원체크가 정확해짐. 메모 문자열 파싱 회피.
- 다음 에이전트는 반드시 DB 안전 4문답 후 진행. Rules 변경/배포 없이 코드만 준비할지, 운영 담당자가 Rules를 먼저 허용할지 사용자 결정 대기.

## 2026-07-17 저녁 완료 — 카풀 자동완성 + 기도문자 명단

- `3d264e2` 행정: 카풀 추가/수정 모달의 학생 이름에 자동완성(이름 검색 → 부/학년/반 후보 클릭 → 자동 입력). 의료일지의 자동완성을 `NameAutocomplete.tsx` 공용 컴포넌트로 추출해 두 탭이 공유. 손으로 적은 연락처는 안 덮음.
- **기도문자 학부모 명단(운영 산출물, 코드 아님)**: 운영 DB 읽기 전용 + 신청 시트 CSV를 조인해 1·2일차 저녁집회 참석자 239명(본대 228·선복귀 7·후발대 4)의 학부모 연락처 정리. `~/Downloads/수련회_기도문자_명단.xlsx`(+csv, 번호 txt 3종). 취소 2명(이주윤·최신재) 제외, 연락처 누락 0(시트 236·출석부 폴백 3). 부분참 판정은 사용자가 구두 확정(곽예인 토저녁~일=후발대, 홍다인/김현채/김민하 토집회까지, 김태린G 금집회까지, 강주아/민지후 토집회까지).
  - ⚠ 이때 발견: **1부 정예은 동명이인 2명**(3-2, 1-6) — 시트 학부모 번호를 이름만으로 매칭하면 오배정된다. 학년·반까지 대조해야 함. 시트 전수 검사 결과 이 한 쌍뿐.
  - 참고: participants에는 학부모 번호(pPhone)가 사실상 비어 있음 — 시트 파서가 부모님 연락처 열을 추출하지 않고, 출석부 폴백도 DB 필드명이 `pphone`(소문자)라 sync의 `ms?.pPhone`이 못 읽는 잠재 이슈(카풀 자동완성의 학부모 자동입력이 비는 이유). 고치려면 별도 작업.
- 마지막 IGuard 기능 검증:
  - `npm test`: 17개 파일, 141개 테스트 통과
  - `npx tsc --noEmit`: 성공
  - `npm run build`: 성공
  - `npm run lint`: 오류 0개, 기존 경고 11개
  - 운영 수련회 `-Ov_SQVKmfIcnPSlPGDC`의 조 22개를 읽기 전용 감사했고, 조장 22명 모두 각 조 `studentIds`에 포함됨을 확인
- 최근 버스·명단 작업과 인수인계 작업에서 운영 DB 직접 쓰기 없음, Firebase Rules 변경·배포 없음.

## 2026-07-17 최근 완료 — 버스·조별 명단 정합성

### 배포된 커밋

- `5b18069`: 행정 교사 참석과 학생 부분참 정보를 버스 인원에 반영.
  - 교사는 `status=불참` 또는 `transport=자차/자가용/개인차량`이면 **호차별 버스 명단**에서 제외.
  - 학생은 선복귀·후발대 일차 규칙과 `note`의 `당일참여/당일참석`을 적용.
- `6561620`: IGuard 조별정보에 `iguard/groupStaff`의 조스탭 배정 표시.
- `e4f07fd`: 자차 교사는 호차별에서는 제외하되, 이동수단과 무관한 **조별 현장 점호**에는 포함.
- `7183688`: 큐싯의 `N호차 짐 하차 보조 스탭` 문구를 선탑/동승 명단으로 오인하지 않도록 파서 수정.
- `784c85d`: `cellColors=red`인 취소 학생을 조스탭 화면, 조별 인원체크, 버스 자동배정·호차별 인원에서 제외.
  - `cellColors` 키가 unique key(`2_S32_01`)이거나 raw ID(`S32_01`)인 경우를 모두 지원.
- `feaebbb`: 조장을 교사 명단에 재추가하던 중복 제거.
  - 조장은 행정 `groups[].studentIds`에 이미 포함된 학생이므로 학생으로 한 번만 집계.
  - 호차별 화면의 교사 수·총원과 `· 교사` 꼬리표가 함께 바로잡힘.

### 핵심 코드

- `iguard-app/src/lib/busParticipation.ts`
  - `isCancelledStudent`, `isStudentBusPassengerOnDay`, `isTeacherBusPassenger`가 공통 참석 판정의 단일 원천.
- `iguard-app/src/lib/checklistMembers.ts`
  - 조별/호차별 교사 명단을 분기하며 조장은 반환하지 않음.
- `iguard-app/src/lib/cueSheet.ts`, `src/lib/busStaff.ts`
  - 큐싯 선탑/동승 추출과 문장 조각 필터의 단일 원천.
- `iguard-app/src/app/retreat/[id]/ChecklistView.tsx`
  - 조별·호차별 명단과 요약 인원 구성.
- `iguard-app/src/app/retreat/[id]/BusesView.tsx`
  - 버스 자동배정 인원 계산.
- 회귀 테스트: `busParticipation.test.ts`, `checklistMembers.test.ts`, `busStaff.test.ts`.

### 현재 유지된 버스 자동배정 정책 — 다음 작업에서 혼동 금지

- `BusesView.tsx`의 `RESERVED_STAFF_SEATS = 3`은 **현재 그대로 유지**되어 있다.
- 사용자가 한때 “스탭자리 남기지 말고 배정”을 요청했지만 곧바로 “기존작업 취소”를 요청했고, 해당 변경은 완전히 되돌렸다.
- 따라서 자동배정은 현재도 정원 비례 균등을 우선하고 가능하면 호차당 스탭석 3석을 남긴다. 이 정책을 다시 바꾸려면 새 사용자 지시를 받아 별도 설계·회귀 테스트 후 진행한다.
- `retreats/{id}/groups`, `teachers`, `cellColors`, `partialAttendances`는 행정 앱 소유이므로 IGuard에서 읽기만 한다.

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

- [ ] IGuard를 강력 새로고침한 뒤 호차별 화면에서 조장이 `교사`가 아니라 학생으로 한 번만 표시되는지 확인한다.
- [ ] 취소 학생이 조별 명단·조별 인원체크·호차별 인원에서 빠졌는지 확인한다.
- [ ] `7183688` 이전에 이미 가져온 큐싯 데이터에는 과거 오인된 선탑/동승 값이 남을 수 있다. 필요한 경우 큐싯을 다시 가져와 파서를 재적용한다. 에이전트가 운영 DB 재가져오기를 실행하지는 않았다.
- [ ] IGuard 관리자 계정으로 `🔐 관리자`를 열어 잠글 수련회의 PIN을 설정한다.
  - 이 작업은 `retreats/{id}/iguard/accessLock` 한 노드에 운영 DB 쓰기를 발생시킨다.
- [ ] 일반 팀원 계정으로 해당 수련회 진입 시 PIN 게이트가 뜨고, 오답 거부·정답 통과·새로고침 후 세션 유지가 되는지 확인한다.
- [ ] 교사 참석에서 이미진 행을 열어 전참을 유지하고 메모·부분참 값을 비운 뒤 한 번 저장하여 과거 잔여값을 삭제한다.

### 다음 에이전트 작업 후보

- [ ] 위 호차별·취소자 화면 검증에서 여전히 이상하면 추측 수정하지 말고 해당 조의 `groups[].studentIds/leader/teachers`, `cellColors`, `partialAttendances`를 읽기 전용으로 대조한다.
- [ ] 버스 8호차 생성 문제를 다시 다룰 경우 현재 `RESERVED_STAFF_SEATS=3` 유지 상태와 정원 비례 균등 점수식을 먼저 재현한다. 사용자의 새 지시 없이 예약석 정책을 변경하지 않는다.
- [ ] 일반 팀원 또는 staff role 테스트 계정이 제공되면 PIN 잠금과 권한별 화면을 읽기 위주로 검증한다.
- [ ] PIN을 더 강한 데이터 보안 경계로 만들려면 현재 Rules·데이터 모델 한계를 먼저 설계 검토한다. **Rules 배포는 하지 않는다.**
- [ ] 이미진 값이 새 저장 뒤에도 복구되면 추측 수정 금지. 저장 payload와 해당 교사 레코드 구독 결과를 읽기 전용으로 추적한다.
- [x] 행정 사이트 리허설 QA (2026-07-17 코드 레벨 완료): 의료일지 통과(삭제 confirm·retreatsPrivate·이스케이프), 부분참석은 partialPool 테스트 6개로 보호, 인쇄/엑셀 XSS 전 표면 통과. **발견 2건 보고됨(미수정)**: ①현장등록 등록 해제가 확인창 없는 토글(이가드 인원체크에서 실사고 났던 "확인하려다 해제" 유형, OnSiteRegistrationTab의 toggleOnSiteCheckIn 경로) ②현장추가 모달에 role="dialog"/ESC/포커스트랩 없음(컨벤션 위반). 수정은 사용자 선택 대기.
- [x] semester-app code-review 높음 2건 → **해소 확정(2026-07-17 검증)**: ①팀 삭제 유령화는 db.ts:99의 buildTeamRemovalUpdates(다중 경로 원자 update)+삭제 전 영향 인원 경고로, ②설정 덮어쓰기는 settingsDraft(dirty 추적, syncSettingsDraft가 편집 중 meta 미반영)로 해결. 테스트 10개 통과.
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

⚠ (역사 기록) IGuard 버스·명단 기능의 마지막 변경 커밋은 `feaebbb`이고, 2026-07-17 당시 IGuard 운영 `/api/version` buildId는 `3d264e2cbba2be319ed3954f24f3ad75edc6a79d`였다. **현재 값이 아니다** — 최신 기준은 이 문서 맨 위의 `2cf9360`이다.
