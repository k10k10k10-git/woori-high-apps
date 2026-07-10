# 워크스페이스 운영 매뉴얼 (5개 앱 모노레포)

이 저장소는 분당우리교회 고등부의 Firebase 프로젝트 `woori-high`를 공유하는 5개 앱(학생 출석부·retreat·iguard·교사스탭·semester)을 담는다.
**이 문서는 "이 저장소에서 일하는 방법" 전체를 규정한다.** 개별 앱의 코드 패턴은 각 앱의 CLAUDE.md가 원천이며, 충돌 시 이 문서의 안전 규칙이 우선한다.

작업 전 읽는 순서: ① 이 문서 → ② 대상 앱의 `CLAUDE.md` → ③ 경로를 만질 거면 `DB_OWNERSHIP.md` → ④ 배포·복구는 `OPERATIONS.md` → ⑤ 도구·환경 함정과 검증 요령은 `LEARNINGS.md`.

세션 시작 시 `.claude/HANDOFF.md`가 존재하면 사용자가 시키지 않아도 먼저 읽는다 — 직전 세션의 미완 작업·함정·대기 중 질문이 거기 있다.

## 🔒 DB 안전 4문답 — 모든 작업 시작 시 먼저 답할 것

어떤 작업이든(코드 수정·조사·문서화 포함) 실행에 들어가기 전에 반드시 다음 4가지를 짧게 먼저 답한다:

1. **Firebase DB 데이터를 변경하는가?** (운영 DB 직접 쓰기는 사용자 명시 승인 + 사전 스냅샷 백업 없이는 금지)
2. **실제 배포를 실행하는가?** (`npx vercel --prod` 등 — 사용자가 요청했거나 /ship 절차일 때만)
3. **Firebase Rules 배포가 포함되는가?** (답은 항상 "아니오"여야 함 — Rules 배포 원천은 `고등부 학생 출석부/database.rules.json` 하나뿐. retreat-app/iguard-app의 `DO_NOT_DEPLOY.database.rules.json`은 보관용)
4. **조심해야 할 DB 경로는 무엇인가?** (예: 다른 앱 소유 노드, `retreatsPrivate/*` 민감 데이터, 전체 덮어쓰기 노드)

이 4문답 없이 작업을 시작하지 말 것. 사용자가 별도 안전 헤더를 붙이지 않아도 항상 적용된다.

**답변 형식(고정):** 첫 응답의 첫머리에 정확히 아래 형태로 쓴다 — 각 항목 한 줄 이내, 총 4줄을 넘기지 않는다.

> **DB 안전 4문답:** ① DB 쓰기: 없음 *(있으면: 경로·건수·백업 계획)* ② 배포: 없음 *(있으면: 대상 앱)* ③ Rules 배포: 아니오 ④ 주의 경로: 없음 *(있으면: 경로명과 이유)*

## 데이터 소유권 요약

| 앱 | 소유 (쓰기 가능) | 다른 앱 노드 |
|---|---|---|
| 학생 출석부 | `classes/`, `attendance/`, `admins`, `teacher*`, Rules 배포 | — |
| retreat-app | `retreats/{id}` 행정 데이터, `retreatsPrivate/{id}`, `retreatAdmins` | `classes/` 읽기 전용 |
| iguard-app | `retreats/{id}/iguard/*`, `iguardMembers/Roles/Pending` | 행정 노드 전부 **읽기 전용** |
| 교사·스탭 출석부 | `staff_*` | — (여름수련회 이후까지 작업 보류) |
| semester-app | `semesters/`, `semestersPrivate/` | `classes/`·`retreatAdmins` 읽기 전용 |

- 공유 쓰기 노드는 단 하나: `prepMilestones/` (행정↔이가드 양방향). 하위 문서(DB_OWNERSHIP.md·retreat-app CLAUDE.md)에 `retreats/{id}/milestones`가 공유로 적혀 있는 것은 이관 전 낡은 서술이다 — 코드(`paths.ts`) 기준으로 이 문장이 진실.
- 민감 데이터(환불계좌·의료일지·주민번호·시트 raw)는 `retreatsPrivate/{id}/` 아래에만. 이가드 멤버는 `retreats/{id}` 전체를 읽으므로 그 아래 두면 노출이다.

## 컨벤션

**기존 (이 저장소가 이미 따르는 것):**
- 소통·커밋 메시지·코드 주석은 한국어. 커밋은 `영역: 요약` 형식(예: `이가드: 버스 파싱 오염 필터`), 기능 단위 1커밋.
- Firebase 접근은 각 앱 `src/lib/db.ts`(retreat-app은 `db/` 모듈+배럴)만. 경로 문자열은 `paths.ts`만. 컴포넌트에서 firebase 직접 import 금지.
- `snapToList<T>` 사용 — `Object.entries(snap.val()).map` 직접 금지.
- 의존성 최소(firebase/next/react/react-dom + retreat만 xlsx). 새 패키지 추가는 사용자 승인 필요.
- UI 색상은 파스텔(Tailwind `*-100` 계열, 예: `bg-blue-100`) 선호, 같은 의미의 자동/수동 표시는 같은 색.
- 기능 완료 = 검증 + 커밋 + 푸시 + (배포 대상이면) Ready 확인까지 한 세트(/ship).
- 모달은 포커스 트랩+ESC+`role="dialog"`, 토스트는 `aria-live`, 아이콘 버튼은 `aria-label`.

**추가 (이 매뉴얼로 명문화하는 것):**
- 재사용 우선: 이름 정규화는 `studentMatcher`, 버스 명단은 `busStaff`, 시간 판정은 `scheduleTime`, 큐싯은 `cueSheet`, classKey는 `classKey.ts`, 동기화 보존은 `syncParticipants` — **같은 목적의 함수를 새로 쓰기 전에 lib를 grep**한다.
- 새 폴더/앱 이름은 영문·공백 없음 (한글 폴더명은 Vercel Git 배포에서 Turbopack 크래시+함수명 검증 실패를 실제로 냈다).
- 조사·감사 보고서의 모든 수치는 실측(실행한 명령의 출력)이거나 "추정"으로 표기한다.
- 코드 변경이 각 앱 CLAUDE.md의 "패턴" 섹션과 관련되면 같은 커밋에서 그 문서도 갱신한다.

## ⚠ 이 코드베이스에서 저지르기 쉬운 실수 — 이름과 방지 규칙

각각 실제 사고 이력이 있거나(★) 구조상 유혹이 강한 실수다. **작업이 아래 영역을 건드리면 해당 규칙을 먼저 소리 내어 확인할 것.**

1. **소유권 침범** — 이가드 코드에서 `groups`/`teachers` 등 행정 노드에 쓰기. → 규칙: 쓰기 전 위 소유권 표 확인. iguard db.ts의 "읽기 전용 영역" 주석 밖에 쓰기 함수를 추가하지 않는다.
2. **전체 덮어쓰기 유실** ★ — `set()`으로 노드 전체 저장 → 동시 편집·오프라인 큐가 데이터를 지움. → 규칙: 단일 경로 `update()` 우선. 전체 set이 불가피하면(배열 순서) `backupNodeBeforeOverwrite` 패턴을 반드시 동반.
3. **"고쳤을 것" 보고** ★ — 코드만 보고 수정 완료 선언, 배포 전 사용자에게 확인 요청 → "여전히 동일해" 루프. → 규칙: 아래 품질 기준의 버그 수정 체크리스트를 전부 통과하기 전에 "고쳤다"고 말하지 않는다.
4. **회귀 테스트 생략** ★ — 특이사항 초기화 버그가 테스트 없이 3세션/5회 재발했다. → 규칙: 순수 로직 버그는 회귀 테스트 1개를 **같은 커밋**에 포함.
5. **Rules 오배포** — retreat/iguard 폴더에서 `firebase deploy --only database`. → 규칙: Rules는 학생 앱에서만. 다른 앱의 rules 파일명이 `DO_NOT_DEPLOY.*`인 이유다.
6. **구독 onError 누락** ★ — 새 onValue 구독에 에러 콜백이 없으면 권한 오류 시 무한 스피너. → 규칙: 모든 구독 함수는 `onError?: (e: Error) => void`를 받고, 훅/컴포넌트는 loadError에 배선한다(iguard 패턴 16).
7. **시간 비교 재발명** ★ — 큐싯의 `24:30~25:30`(자정 넘김) 표기를 단순 시:분 비교로 처리 → 새벽에 전부 "일정 없음". → 규칙: `iguard-app/src/lib/scheduleTime.ts`의 `isNowOn`/`currentBlockFor`만 사용.
8. **큐싯 파싱 순서 변경** ★ — 날짜 마커 검사를 시간 검사보다 먼저 하면 "둘째날 오전 프로그램" 행이 통째로 사라진다. → 규칙: `cueSheet.ts` 수정 시 "시간 유무 → 날짜 판정" 순서 유지, `scheduleUtils.test.ts` D2가 지킨다.
9. **이름 매칭 재구현** ★ — sf 꼬리표·학번 접두어 처리를 화면마다 새로 짜면 같은 사람이 두 명으로 보인다. → 규칙: `normalizeName`/`stripSuffix`/`parseBusStaff`만 사용. UnmatchedPaymentsTab의 로컬 `strip`은 의미가 달라 통합 금지(주석 참조).
10. **동기화 보존 가드 제거** ★ — `syncFromSheet`의 ambiguous 충돌 가드를 지우면 특이사항이 엉뚱한 사람에게 영구 복사된다(실제 12명 오염). → 규칙: `syncParticipants.ts`를 통해서만 수정, `syncParticipants.test.ts` A2가 지킨다.
11. **인원체크를 토글로 회귀** ★ — 탭=토글로 바꾸면 "확인하려다 해제" 사고 재발. → 규칙: 멱등 체크 + 트랜잭션 + 톰스톤(iguard 패턴 15) 유지. `set`/`remove` 직접 쓰기 금지.
12. **민감정보 위치 실수** — 취소계좌·의료·주민번호를 `retreats/{id}` 아래 저장. → 규칙: 신규 민감 필드는 무조건 `paths.ts`의 retreatsPrivate 계열로.
13. **시계 tick이 사용자 선택을 덮음** ★ — `clock.time` 의존 effect에서 선택 상태를 setState하면 30초마다 리셋. → 규칙: 자동 선택 effect에는 `userPicked`/`blockPicked` ref 가드(iguard 패턴 17).
14. **useRetreatData 밖 구독** — 이가드에서 컴포넌트가 직접 구독을 추가. → 규칙: 모든 이가드 구독은 이 훅에만 추가하고 `fail(key)`를 배선.
15. **인쇄 HTML XSS** ★ — 사용자 입력을 `printAsPDF` HTML에 그대로 삽입. → 규칙: 인쇄/내보내기 HTML의 사용자 데이터는 전부 `escapeHtml()`.

## 품질 기준 — 산출물별 체크리스트 (형용사 금지, 전부 확인 가능)

**버그 수정** (하나라도 못 하면 "수정 완료"라고 보고하지 않는다):
- [ ] 재현 절차를 먼저 기록했다 (입력 → 기대 → 실제)
- [ ] 원인을 파일:줄로 특정하고 한 문장으로 설명했다
- [ ] 순수 로직이면 회귀 테스트 1개가 같은 커밋에 있다
- [ ] `/verify` 또는 dev 서버에서 해당 플로우를 실제 구동해 확인했다
- [ ] 대상 앱 `npx tsc --noEmit` 0 errors + `npm test` 전체 통과
- [ ] 배포가 필요하면 Ready 확인 **후에만** 사용자에게 확인 요청

로그인 벽 뒤 프로덕션 화면 검증이 필요할 때(dev preview는 Google OAuth 헤드리스 통과 불가): ① 배포 확정은 `/api/version`의 buildId를 `git rev-parse HEAD`와 대조, ② 파괴적 플로우는 "매칭 안 되는 더미 1행 입력 → 확인창 카운트 확인 → **취소**"로 DB 무쓰기 검증. 실제 확정 버튼은 절대 누르지 않는다(상세: `LEARNINGS.md`).

**기능 추가**:
- [ ] 4문답 + 영향 경로(paths.ts 함수명)를 작업 전에 보고했다
- [ ] 새 DB 경로는 paths.ts에 먼저 추가하고, 소유권 표/DB_OWNERSHIP.md에 반영했다
- [ ] 로드 실패 시 에러 배너가 뜬다 (loadError 패턴) — 무한 스피너 경로 없음
- [ ] 현장용(모바일) 화면이면 375px 뷰포트에서 확인했다
- [ ] 관련 앱 CLAUDE.md 갱신이 같은 커밋에 있다

**리팩토링**:
- [ ] 계획을 먼저 제시하고 승인받았다 (/refactor-plan 형식)
- [ ] 1항목 = 1커밋, 함수 이동은 본문 무변경
- [ ] 테스트 없는 대상은 특성화 테스트를 먼저 깔았다
- [ ] 기준 검증(tsc + 전체 테스트 + 필요 시 build)이 항목마다 통과

**배포**: /ship 절차 그대로 (검증 → 커밋·푸시 → `npx vercel ls` Ready 폴링 → 보고). 예외 없음.

**조사·감사 보고**: 수치는 실행 출력 근거 첨부, 추측은 "추정" 표기, 심각도(치명/높음/보통) 분류, "수정하지 않았음" 명시.

## 불확실할 때 — 에스컬레이션 규칙

**즉시 중단하고 물어본다 (선조치 금지):**
1. 운영 DB 쓰기가 필요해 보일 때 → 대상 경로·건수·스냅샷 백업 계획을 제시하고 승인 대기.
2. Rules 변경이 필요해 보일 때 → 항상 보고만. 학생 앱 rules라도 직접 수정·배포하지 않는다.
3. 두 앱 이상이 읽는 노드의 **데이터 형태**를 바꿔야 할 때 → DB_OWNERSHIP.md의 영향 행을 인용해 보고.
4. `rm -rf`·force push·노드 삭제 등 되돌리기 어려운 명령 → 실행 전 확인.
5. 사용자 지시가 이 문서의 안전 규칙과 충돌할 때 → 충돌을 한 문장으로 명시하고 1회 확인 (통과되면 그대로 수행).

**스스로 진행하되 방식이 정해져 있는 경우:**
6. 같은 실패(테스트·빌드·버그)를 3회 고치지 못하면 → 시도 내역을 정리해 보고하고 방향을 물어본다. 4회째 무단 시도 금지.
7. 모르는 값(경로·수치·설정)은 추정하지 말고 명령을 실행해 실측한다. 실측 불가면 "미확인"으로 표기.
8. 문서(CLAUDE.md·메모리)와 코드가 다르면 **코드가 진실** — 코드 기준으로 진행하고, 문서 갱신을 같은 커밋에 포함하거나 발견 메모로 보고.
9. 계획에 없는 개선이 눈에 띄면 수행하지 말고 "발견 메모"로만 보고.

## 학습 법칙 (learning law)

**사소하지 않은 문제를 해결할 때마다, 다음 작업으로 넘어가기 전에 `extract-approach` 스킬을 실행한다.** 물어보지 않고 알아서 실행한다 — 학습 메모 없는 해결책은 미완성 작업이다(a solution without its learnings note is unfinished work). "사소하지 않음"의 기준: 3회 이상 시도 / 비직관적 원인 / 우회로 발견 / 도구·환경의 함정. 저장 위치와 형식은 `.claude/skills/extract-approach/SKILL.md`를 따른다.

## 배포

- 배포·커밋·푸시·Ready 확인은 `/ship` 스킬 절차를 따른다.
- retreat-app 자동배포는 2026-07-08 정상 확인됨(과거 미작동은 07-06 세팅 전 증상). `OPERATIONS.md`의 07-06 "자동배포 안 잡힘" 경고는 낡은 서술이니 따르지 말 것 — 이 문장이 최신. 그래도 push 후 `npx vercel ls`로 Ready 확인 (상세: retreat-app/CLAUDE.md).
- 학생 앱은 Firebase Hosting(`firebase deploy --only hosting`, predeploy가 SW 캐시명 갱신). 교사·스탭 앱은 미배포·작업 보류.
- 배포 전 `npx tsc --noEmit` 0 errors + `npm test` 통과 필수.

## 스킬 지도 (반복 작업은 손으로 하지 말 것)

| 상황 | 스킬 |
|---|---|
| 검증→커밋→푸시→배포 Ready 확인 | `/ship [retreat\|iguard\|all]` |
| 버그 신고 접수 | `/bugfix <증상>` — 재현→원인→수정+회귀테스트→verify까지 한 흐름 |
| 운영 DB 정합성 의심(특이사항 오염 등) | `/db-audit` — 읽기 전용 진단, 복구는 승인 후 |
| 세션 마무리/재개 | `/handoff` (저장) · `/handoff resume` (이어서) |
| 리허설 QA / 출시전 감사 / 리팩토링 계획 | `/retreat-qa` · `/launch-audit` · `/refactor-plan` |
| 로컬 대시보드·원클릭 실행 | `agent-os/AgentOS.command` (바탕화면 "에이전트 OS") |
