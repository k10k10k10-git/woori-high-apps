# 인수인계 — 2026-08-12

> **이 파일이 인수인계의 유일한 원천이다.** `LATEST_HANDOFF.md`처럼 "더 최신"을 자처하는
> 두 번째 문서를 만들지 말 것 — 실제로는 더 오래된 문서가 자기를 최신이라 주장해
> 36커밋 전 세계관으로 세션을 시작하게 만든 사고가 있었다(2026-08-12 정리).

## 지금 상태 (한 문장)

사용자 요청은 **전부 완료·검증·배포**됐고, 남은 것은 **학생 출석부 데모 모드 정리** 하나다.

- HEAD: `8da4a19` (`정리: semester-app 제거`)
- 운영: `woorihigh-app.vercel.app` HTTP 200 (buildId `1598c4cf…`) / `woori-high.web.app` HTTP 200
- 작업 트리 깨끗 (미추적 디렉터리 `.agents/` `outputs/` `rayquaza-v2-upgrade/` `tmp/` 제외 — **`git add .` 금지**)

## 현재 운영 구조 (2026-08-12 기준)

앱은 **2개뿐**이다. 오늘 2개를 제거했다.

| 앱 | 배포 | 소유 DB |
|---|---|---|
| `highschool-app` | Vercel `woorihigh-app.vercel.app` (별칭 `highschool-app-flame`도 같은 배포) | `semesters/`·`semestersPrivate/`, `retreats/{id}` 행정, `retreatsPrivate/`, `retreatAdmins`, `iguard*`, `prepMilestones/` |
| `고등부 학생 출석부` | Firebase Hosting `woori-high.web.app` | `classes/`, `attendance/`, `events/`, `admins`, `teacher*`, `trash/`, **Rules 배포 원천** |

제거된 앱 (복구 태그는 전부 원격 푸시됨):

| 앱 | 시점 | 복구 태그 |
|---|---|---|
| `retreat-app`·`iguard-app` | 2026-08-05 | `pre-legacy-app-removal-2026-08-05` |
| `고등부 교사·스탭 출석부` | 2026-08-12 | `pre-staff-app-removal-2026-08-12` |
| `semester-app` | 2026-08-12 | `pre-semester-app-removal-2026-08-12` |

- `semester-app`은 **Vercel 프로젝트·배포 이력까지 삭제**했다(별칭 3개 먼저 끊고 → 코드 삭제 → 프로젝트 삭제). 되살리려면 새로 배포해야 한다.
- `교사·스탭 출석부`는 배포된 적이 없었고 `staff_*` 데이터도 0건이라 **Rules에서도 제거**했다.
- 두 앱 모두 **DB 데이터는 손대지 않았다** — `semesters/`는 통합 앱 학기 모듈이 계속 쓴다.

## 권한 모델 — 두 축 (2026-08-12 전면 개편)

한 사람이 **학기 역할 + 방학 역할**을 동시에 갖고, **화면이 자기 영역의 축을 골라 쓴다.** "지금이 학기인가"를 판정하는 코드는 없다.

- 학기 역할(10종) → 학기 사역·주일 사역 화면
- 방학 역할(6종) → 수련회 행정·현장 화면
- 홈·공유 일정·통합검색 → 두 축 중 열려 있는 쪽

단일 원천은 `highschool-app/src/features/portal/accessPolicy.ts`. 전체 표는 `highschool-app/CLAUDE.md`의 "권한 — 두 축 역할".

**하위호환이 이 모델의 핵심**이다. 새 필드(`semesterRole`·`retreatRole`)가 없는 기존 구성원은 레거시 `role`에서 파생해 **이전과 똑같은 권한**을 받는다. `accessPolicy.test.ts`가 이걸 회귀로 고정한다 — 여기가 깨지면 43명이 로그인해도 화면이 빈다.

## 검증 상태 (2026-08-12 실측)

| | 결과 |
|---|---|
| `highschool-app` `npx tsc --noEmit` | 0 errors |
| `highschool-app` `npm test` | 63파일 **526개 통과** |
| `고등부 학생 출석부` `npx tsc --noEmit` | 0 errors |
| `고등부 학생 출석부` `npm test` | 8파일 **102개 통과** |
| `highschool-app` lint | **10 errors** / 4 warnings (아래 "미완인 것" 참고) |

## 이번 세션에 한 일 (전부 푸시·배포됨)

1. **학기 배치 화면** — 팀 카드를 학생/교사·스탭으로 구분, 개별 ✕ 제거하고 명단 상세로 이동, 연락처를 이름 옆에 표시 (`e0a8524`)
2. **랜딩 문구** 정리 (`6576034`, `21f2a49`)
3. **권한 두 축 모델** 전면 도입 + 팀원 관리 셀렉트 2개 (`91d1f33`)
4. **수련회 행정 조회 전용 모드** — `RetreatEditProvider` + `<fieldset disabled className="contents">` 두 겹 (`c673919`)
5. **Rules 보강** — 행정팀에게 새친구 원장 반영 권한, 학생 1명 경로만 (`4670611`, `e9f063f`)
6. **역할 배지 문구 + 팀원 삭제** (`1598c4c`)
7. **정리** — 교사·스탭 앱 제거 (`7677c1e`), `staff_*` Rules 제거 (`1c482a6`), semester-app 제거 (`8da4a19`)
8. **용량 정리** — `.next` 캐시와 미사용 `node_modules` 삭제로 **4.5GB → 1.5GB**

## 미완인 것 — 정확한 다음 단계

- [ ] **(최우선) 학생 출석부 데모 모드 정리.** 지금 `NEXT_PUBLIC_DEMO_MODE=1`에 계정 정보가 채워진 채 배포돼 있다. **비밀번호가 공개 JS 번들 안에 있어 주소를 아는 누구나 전교생 개인정보에 접근할 수 있다.** 교사 테스트가 끝나면 ① Firebase 콘솔에서 `demo@woorihigh.com` 계정 삭제 + `attendanceAdmins`의 그 uid 삭제 ② `.env.local`에서 `NEXT_PUBLIC_DEMO_MODE=0` ③ `firebase deploy --only hosting`. 구조는 `고등부 학생 출석부/CLAUDE.md`의 "데모 모드" 참고.
- [ ] **lint 에러 10건** — 전부 `react-hooks/set-state-in-effect`. `ExecutionViews`(3), `LodgingMapView`(2), `RetreatsHome`, `ConnectivityBanner`, `RoomsTab`, `ScheduleSheetEditor`. **이 저장소가 실제로 사고를 낸 패턴**이다(실수 13 — 30초마다 선택이 리셋됐다). 렌더 중 파생으로 하나씩 바꿀 것.
- [ ] **화면 차단 ≠ 실제 차단 5건** — Rules는 여전히 세 버킷(`admins`/`retreatAdmins`/`iguardMembers`)만 구분한다. 화면에서만 막히는 것: 스탭팀장의 행정 조회 전용, 스탭팀장·바나바팀의 민감정보 제외, 사역팀의 "내 팀만 편집", 이가드팀의 학기 차단, **스탭 32명의 `classes` 전체 읽기**. 마지막 항목이 위험도가 가장 높다(전교생 주소·연락처).
- [ ] **(대기) 조장 큐싯 붙여넣기 경로**를 만들지 여부 — 사용자 답변 대기.
- [ ] **(대기) 훈련 반 `goal` 필드** 추가 여부 — 사용자 답변 대기.
- [ ] **(대기) `sheetClient.ts`(14줄)** 참조 0이지만 "되살릴 때만 참고"로 남겨 둠 — 삭제 여부 답변 대기.
- [ ] **(선택) 옵시디언 vault 설정** — 제외 목록에 `node_modules`·`.git`·`.next`·`out`을 넣으면 그래프 노드가 4,261개 → 63개가 된다(현재 렉의 원인).

## 로그인 벽 뒤 검증 — 에이전트가 못 하는 것

`highschool-app`은 Google OAuth라 헤드리스로 통과할 수 없다. 그래서 이번 세션에서 다음은 **사용자 확인이 필요**하다.

- 팀원 관리의 셀렉트 2개(학기/방학)와 팀원 삭제 실동작
- 스탭팀장·이가드팀 계정으로 본 행정 화면의 조회 전용 상태
- 행정팀 계정의 새친구 출석부 반영(Rules 보강 후 첫 실사용)

우회로: 임시 라우트(`src/app/zz-*`)로 컴포넌트만 fixture와 함께 띄워 레이아웃을 확인하고 **반드시 삭제**한다. 이번 세션에서 3번 썼고 전부 지웠다. 학생 출석부는 데모 모드가 켜져 있어 로그인 없이 실화면 검증이 가능하다.

## 이 작업의 함정 (다시 밟지 말 것)

1. **`.input`은 `@layer` 밖 CSS라 Tailwind 유틸리티를 이긴다.** 폭은 감싼 div, 글꼴은 인라인 style.
2. **Rules를 좁힐 때 자기조회를 지우지 말 것.** `userRoles`·`retreatAdmins`·`iguardMembers`·`iguardRoles`는 로그인 판정이 자기 레코드를 읽는다. 막으면 전원 잠긴다.
3. **인증 게이트에서 권한 없는 경로를 읽지 말 것.** `loadUserRole`의 `get(admins/{uid})` await가 프로덕션 로그인을 멈춘 적이 있다.
4. **Firebase RTDB는 거부된 리스너를 규칙이 바뀌어도 재시도하지 않는다.** 권한을 열어도 그 탭은 새로고침 전까지 실패 상태다.
5. **Rules에 새 노드를 만들지 말 것.** 규칙 없는 노드는 즉시 권한 거부. 권한 확장은 기존 노드 + 옵션 필드 조합으로.
6. **화면에서 막는 건 안전하지만, 화면에서 여는 건 Rules가 허용할 때만.** Rules가 막는 걸 화면에서 열면 "눌렀는데 실패"가 된다(행정팀 출석부 반영이 정확히 이 경우였다 — Rules를 먼저 넓히고 켰다).
7. **`fieldset disabled`의 실제 상태는 `.disabled` 속성이 아니라 `matches(':disabled')`로 확인한다.** 자식 요소의 `.disabled` 프로퍼티는 조상 fieldset을 반영하지 않아 "안 잠겼다"고 오판하기 쉽다.
8. **행정 탭에 드래그·div 클릭 편집을 추가하면 `useRetreatCanEdit()`을 반드시 쓸 것.** `<fieldset disabled>`는 폼 요소만 잠근다.
9. **effect 안에서 setState 금지.** 파생 가능한 값은 렌더 중 계산한다.
10. **출석·인원체크는 토글 금지** — 명시 선택(멱등).
11. 학생 출석부 HTML은 `cache-control: max-age=3600`이라 배포 직후 옛 화면이 보인다. 검증 시 캐시·SW를 비울 것.
12. **`git add .` 금지** — 미추적 디렉터리 4개가 딸려 들어간다. 파일을 명시해 add할 것. 한글 경로를 인자로 줄 때 실패하면 **조용히 전체 add가 취소**되므로 `git status`로 스테이징을 확인할 것(이번 세션에서 실제로 문서가 커밋에서 빠졌다).
13. **셸 작업 디렉터리는 이전 명령의 `cd`가 남는다.** 앱을 오갈 때 절대 경로를 쓰거나 `pwd`로 확인할 것(임시 파일을 엉뚱한 앱에 만든 적이 있다).

## 참고 문서

- 진입점: 루트 `CLAUDE.md`(운영 매뉴얼·안전 4문답) → 대상 앱 `CLAUDE.md` → `DB_OWNERSHIP.md` → `OPERATIONS.md` → `LEARNINGS.md`
- 권한 계약: `highschool-app/CLAUDE.md`의 "권한 — 두 축 역할"
- Rules 계약 테스트: `고등부 학생 출석부/__tests__/rulesContract.test.ts`
- Rules 배포 전 스냅샷: `고등부 학생 출석부/tmp/rules-backup/` (미추적)
- 복구 태그: `pre-legacy-app-removal-2026-08-05`, `pre-unified-apps-2026-08-05`, `pre-staff-app-removal-2026-08-12`, `pre-semester-app-removal-2026-08-12`
