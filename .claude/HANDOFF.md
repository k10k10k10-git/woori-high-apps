# 인수인계 — 2026-07-17 저녁 (에이전트 중립 — GPT/Claude 공용)

> 새 세션은 다음 순서로 읽으세요:
> ① 루트 `AGENTS.md` → ② 루트 `CLAUDE.md` → ③ 이 문서 →
> ④ 대상 앱 `CLAUDE.md`·`AGENTS.md` → ⑤ 경로 변경은 `DB_OWNERSHIP.md` → ⑥ 배포·복구는 `OPERATIONS.md` → ⑦ 도구 함정은 `LEARNINGS.md`.
> **모든 작업 시작 전 DB 안전 4문답을 먼저 답하세요.** 여름수련회는 2026-07-24~26입니다.

## 지금 상태 (한 문장)

카풀 이름 자동완성(`3d264e2`)까지 배포된 최신 `main`이 운영 중이고, 기도문자 학부모 명단(운영 산출물, `~/Downloads`)을 전달했으며, 행정 QA 발견 2건(현장등록 해제 무확인·모달 a11y)이 수정 대기다.

## 저장소·배포 상태 (실측 2026-07-17 저녁)

- `HEAD == origin/main == 3d264e2` (카풀 자동완성). **이 시점 기준 미푸시 문서 커밋 없음** — 이 HANDOFF 갱신 커밋 이후에는 로컬이 1커밋 앞서는 게 정상. **사용자 요청 없이 push하지 말 것** — `main` push는 Vercel 자동 배포를 일으킨다.
- 추적 파일 작업트리는 클린. `.agents/`만 untracked 도구 아티팩트이며 커밋 대상이 아니다.
- 운영 주소:
  - retreat-app: `https://retreat-app-theta.vercel.app` — buildId `3d264e2` 대조 확인
  - iguard-app: `https://iguard-app.vercel.app`
- retreat-app 마지막 검증(3d264e2): tsc 0 · 테스트 178 통과 · lint 오류 0/경고 10.

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

IGuard 버스·명단 기능의 마지막 변경 커밋은 `feaebbb`이고, 이후 모노레포 push로 현재 IGuard 운영 `/api/version` buildId는 `3d264e2cbba2be319ed3954f24f3ad75edc6a79d`다. 로컬 HEAD는 이 HANDOFF 문서 커밋 때문에 한 커밋 더 앞서는 것이 정상이다.
