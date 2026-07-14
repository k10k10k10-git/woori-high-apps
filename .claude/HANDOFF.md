# 인수인계 — 2026-07-15 (Claude 재개용)

> 새 세션은 다음 순서로 읽으세요:
> ① 루트 `AGENTS.md` → ② 루트 `CLAUDE.md` → ③ 이 문서 →
> ④ 대상 앱 `CLAUDE.md`·`AGENTS.md` → ⑤ 경로 변경은 `DB_OWNERSHIP.md` → ⑥ 배포·복구는 `OPERATIONS.md` → ⑦ 도구 함정은 `LEARNINGS.md`.
> **모든 작업 시작 전 DB 안전 4문답을 먼저 답하세요.** 여름수련회는 2026-07-24~26입니다.

## 지금 상태 (한 문장)

`retreat-app`의 2부 조장 동명이인 반 표시와 교사 메모 삭제 복구 버그를 수정하고, 회귀 테스트·전체 검증·프로덕션 배포·로그인 운영 화면 확인까지 마쳤다.

## 저장소·배포 상태 (실측 2026-07-15)

- 기능 기준 `HEAD == origin/main == 127c68383ae432253cc7d8a0f11ef64adc9e5a3b`.
- 이 HANDOFF 문서를 로컬 커밋한 뒤에는 로컬 `main`이 문서 커밋 1개만큼 `origin/main`보다 앞서는 것이 정상이다. **사용자 요청 없이 push하지 말 것** — main push는 Vercel 자동배포를 일으킨다.
- 추적 파일 작업트리는 기능 커밋 기준 클린. `.agents/`만 untracked 도구 아티팩트이며 커밋 대상이 아니다.
- 운영 배포:
  - retreat-app: `https://retreat-app-theta.vercel.app`
  - iguard-app: `https://iguard-app.vercel.app`
  - 두 앱 `/api/version` buildId 모두 `127c68383ae432253cc7d8a0f11ef64adc9e5a3b`로 실측.
- 마지막 retreat-app 검증:
  - `npm test`: 18개 파일, 168개 테스트 통과
  - `npx tsc --noEmit`: 0 errors
  - `npm run build`: 성공
  - Vercel Production: Ready, 공식 주소 HTTP 200
- 이번 마지막 작업에서 운영 DB 직접 쓰기 없음, Firebase Rules 변경·배포 없음.

## 마지막 완료 작업 — 조장 동명이인과 교사 메모 삭제 (`127c683`)

### 1. 2부 조장 이준영이 `2-9`로 표시되던 버그

재현:

- 운영 조편성 15조는 2부이고 이준영 학생은 2부 2학년 3반이다.
- 기존 화면은 조장을 `이준영 2-9`로 표시했다.

원인:

- `retreat-app/src/components/tabs/GroupComponents.tsx`와 출력 로직이 `학생 이름 → id` 전역 맵을 만들었다.
- 동명이인이 있으면 나중 항목이 앞 항목을 덮어써 1부 2학년 9반 이준영을 선택할 수 있었다.

수정:

- 신규 `retreat-app/src/lib/groupRoleStudent.ts`.
- `resolveGroupRoleStudentId`/`resolveGroupRoleStudent`는 다음 우선순위로 조장·스탭 학생을 찾는다.
  1. 현재 조의 `studentIds`에 포함되고 현재 부서인 유일 후보
  2. 현재 조에 포함된 유일 후보
  3. 현재 부서의 유일 후보
  4. 전체에서 유일한 후보
- 같은 우선순위 안에서 여전히 모호하면 임의 학생을 고르지 않는다.
- 화면(`GroupComponents.tsx`)과 XLSX/PDF/JPG 출력(`GroupsTab.tsx`) 모두 동일 resolver를 사용한다.
- `groupRoleStudent.test.ts`에 타 부서 동명이인, 같은 부서 폴백, 같은 부서 모호성 회귀 테스트 3개 추가.

운영 확인:

- Chrome 로그인 세션에서 배포 후 조편성 15조를 읽기 전용 확인.
- 실제 표시: `⭐ 조장: 이준영 2-3`.
- DB 쓰기 없음.

### 2. 이미진 선생님을 부분참→전참으로 바꾸고 메모를 지워도 복구되던 버그

원인:

- `TeachersTab.handleSave`가 지울 필드를 `undefined`로 전달했다.
- 공통 `stripUndefined()`가 Firebase `update()` 전에 그 키를 제거하여, 기존 DB 값은 삭제되지 않고 그대로 남았다.
- 다시 구독하면 남은 기존 값이 화면에 복구된 것처럼 보였다.

수정:

- 신규 `retreat-app/src/lib/teacherWrite.ts`.
- `prepareTeacherUpdate()`가 **수정 payload에 명시적으로 포함된** 빈 선택 필드만 `null`로 변환한다.
- Firebase RTDB `update()`에서 `null`은 해당 자식 필드를 실제 삭제한다.
- 부분 업데이트에서 아예 전달되지 않은 필드는 보존하여 무관한 데이터를 지우지 않는다.
- 삭제 가능 필드: `note`, `arrivalInfo`, `transport`, `age`, `role`, `corps`, `lateArrival`, `programTeam`, `worship`.
- `TeachersTab.tsx` 수정 저장 경로에만 `prepareTeacherUpdate` 적용. 신규 추가 경로는 기존 동작 유지.
- `src/lib/db/teachers.ts`의 update 타입이 명시적 `null` 삭제를 허용한다.
- `teacherWrite.test.ts`에 명시적 삭제, 부분 업데이트 보존, 정상 값 보존 테스트 3개 추가.

운영 확인과 남은 1회 작업:

- 현재 운영 이미진 행은 `전참`이지만, 구버전 저장 때 DB에 남은 부분참 일정과 메모가 아직 표시된다.
- 운영 DB 직접 수정 승인이 없어서 에이전트가 행을 저장하거나 데이터를 삭제하지 않았다.
- **배포된 새 코드에서 이미진 행 수정 화면을 열고 메모·부분참 값을 비운 상태로 한 번 저장하면 기존 필드가 실제 삭제되며 이후 복구되지 않는다.**
- 이 작업은 사용자가 UI에서 수행하거나, 에이전트가 수행하려면 운영 DB 쓰기 승인 + 사전 스냅샷이 필요하다.

## 최근 완료된 조편성·인쇄 기능 (모두 main·배포 반영)

아래는 이전 HANDOFF(`86d3c32`) 이후 핵심 커밋이다.

- `7be2788` 이가드: 자정 이후 일정을 논리 일차에 유지.
- `2a60ecd` 행정: 조장 기본은 본인반 동반, 체크된 조장만 파송.
- `e33d650`, `f98ceb5` 행정: 1·2부 합산 조 수를 짝수로 자동 보정하고 UI에 즉시 반영.
- `8e20201` 행정: 파송 조장만 있는 빈 조 방지, 모든 조 최소 1개 반 배정.
- `dd9778e` 행정: 조장·파송·고려 관계·조편성 규칙 설정 저장.
- `9eb32bf` 행정: 자동 조편성 소수 조(예: 4명) 균형 보정.
- `9d4c9db` 행정: 파송 조장이 조 내 유일한 동성이 되지 않도록 보정.
- `cdbd1a3`, `0043ba2` 행정: 조편성 PDF/JPG를 부서별 한 장, 가로 스트립 형태로 압축.
- `e2ebea4` 행정: 인쇄 학생 성별 색상과 조장 노란색 표시, 교사 참석 상태 표시.
- `bc0d075`, `cbf9a24` 행정: 인쇄 교사 부분참/불참 상태와 이름이 말줄임 없이 보이도록 개선.
- `b4979bc` 행정: 전체·1부만·2부만 자동 조편성 범위 선택.
- `6bd8345` 행정: 식수 계산에서 학생 원장 `students[접두형 id]` 폴백.
- `4b02b56` 행정: 부분참 수동 매칭에서 접두형 학생 키 조회 수정.
- `b2c8e54` 공통: 데이터 정합성과 검증 체계 보강.

## 다음 단계

### 사용자가 바로 확인할 것

- [ ] 교사 참석 → 이미진 수정 → 전참 유지, 메모·부분참 일정 비움 → 저장.
- [ ] 저장 후 탭을 이동했다 돌아와도 메모·일정이 다시 나타나지 않는지 확인.
- [ ] 필요하면 조편성 PDF/JPG에서 15조 조장 이준영이 `2-3`으로 출력되는지 확인. 출력도 동일 resolver를 사용한다.

### 다음 에이전트 작업 후보

- [ ] 사용자 확인에서 이미진 값이 다시 복구되면, **추측 수정 금지**. 저장 payload와 해당 교사 레코드 구독 결과를 읽기 전용으로 추적하고 같은 실패가 3회면 에스컬레이션 규칙 6 적용.
- [ ] 행정 사이트 리허설 QA: 현장등록·의료일지·부분참석·인쇄/엑셀(XSS) 중심.
- [ ] 권한별 화면 검증: 지금까지 admin 계정 위주. staff role 테스트 계정 필요.
- [ ] semester-app code-review 높음 2건:
  1. 팀 삭제 시 배치 학생이 AssignTab 어디에도 보이지 않는 유령 상태
  2. SettingsTab이 마운트 시 meta를 캡처해 최신 completionRule을 덮을 가능성
- [ ] 시트 데이터 정리 후 이가드 재임포트, 버스 자동배정, 행정 방배정 입력은 운영 담당자 확인 후 진행.

## DB·배포 안전 메모

- 운영 DB 쓰기는 사용자 명시 승인과 사전 스냅샷 없이는 금지.
- Firebase Rules 배포는 항상 금지. 원천은 `고등부 학생 출석부/database.rules.json` 하나뿐이다.
- retreat-app 소유 범위는 `retreats/{id}`, `retreatsPrivate/{id}`, `retreatAdmins`; `classes/`는 읽기 전용.
- main push는 retreat-app과 iguard-app 양쪽에 자동 Production 배포를 생성할 수 있다. 문서만 바뀌어도 사용자 요청 없이 push하지 않는다.
- `.agents/`는 도구 아티팩트로 계속 무시한다.
- 배포 완료 판단은 Vercel Ready와 공식 `/api/version` buildId=`git rev-parse HEAD` 대조 후에만 한다.

## 다음 세션 첫 확인 명령

```bash
git status --short --branch
git log -8 --oneline
curl -fsS https://retreat-app-theta.vercel.app/api/version
curl -fsS https://iguard-app.vercel.app/api/version
```

기능 기준 예상 buildId는 `127c68383ae432253cc7d8a0f11ef64adc9e5a3b`다. 로컬 HEAD는 이 HANDOFF 문서 커밋 때문에 한 커밋 더 앞설 수 있다.
