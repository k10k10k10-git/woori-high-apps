# 인수인계 — 2026-08-13

> **이 파일이 인수인계의 유일한 원천이다.** `LATEST_HANDOFF.md`처럼 "더 최신"을 자처하는
> 두 번째 문서를 만들지 말 것 — 실제로는 더 오래된 문서가 자기를 최신이라 주장해
> 36커밋 전 세계관으로 세션을 시작하게 만든 사고가 있었다(2026-08-12 정리).

## 2026-08-13 오후 최신 작업 — 사이트 건의 요청함

- 사용자 요청대로 `사이트 건의사항`의 `공유`를 **`전송`**으로 바꾸고, 첨부 이미지와 함께 통합관리자 요청함에 쌓이도록 구현·검증·배포했다. 기능 커밋은 `149bcb9` (`건의: 관리자 요청함과 해결 알림 구현`).
- 통합관리자 헤더의 `팀원 관리`는 **마이페이지**로 바뀌었고, `팀원 관리`·`요청사항` 두 탭을 제공한다. 교역자는 기존 권한대로 별도 팀원 관리만 연다.
- 요청함은 새 Rules 없이 `iguardPending/{uid}/siteRequests/{requestId}`를 사용한다. 작성자는 자기 요청만, 통합관리자는 전체 요청만 읽고 쓴다. 학생 출석부의 담임 전용 `suggestions/{year}/{classKey}`와는 완전히 별개다.
- 기존 이가드 접근 승인과 같은 사용자 노드를 쓰므로 `requestIguardAccess`는 전체 `set` 대신 접근 필드만 `update`하고, 승인·거절도 `email`·`name`·`requestedAt`만 제거한다. `siteRequests`를 절대 함께 지우지 않는다. `pendingAccess.test.ts`가 요청함 전용 사용자와 접근 승인 사용자를 분리하는 계약을 고정한다.
- 첨부는 JPG·PNG·WEBP만 받고 브라우저에서 JPEG, 최대 1600px·1.2MB로 재인코딩한다. 요청 상세에서 미리보기·다운로드할 수 있다.
- 통합관리자가 `해결 완료`를 누르면 `resolvedAt`·`resolvedBy`·선택 해결 메모가 저장된다. 작성자는 **다음 로그인 시작 시** `notifiedAt` 없는 자기 해결 요청을 읽어 `요청한 건의사항이 해결되었습니다` 토스트를 한 번 받고 `notifiedAt`을 남긴다.
- 검증: 변경 파일 ESLint 통과, `highschool-app` 65파일 **530개 테스트 통과**, `npx tsc --noEmit` 통과, `npm run build` 성공. QA에서 전송·해결 버튼은 누르지 않아 운영 DB 직접 쓰기는 없었고 Rules 배포도 없었다.
- 다음 에이전트는 요청함 작업을 이어서 수정할 때 `highschool-app/CLAUDE.md`의 마이페이지 계약과 `highschool-app/AGENTS.md`의 “Rules 변경 없이 기존 사용자별 노드에 독립 요청함을 격리하기”를 먼저 읽는다.

## 지금 상태 (한 문장)

사용자 요청은 **전부 완료·검증·배포**됐고, 남은 것은 **학생 출석부 데모 모드 정리** 하나다.

- 최신 기능 커밋: `149bcb9` (`건의: 관리자 요청함과 해결 알림 구현`) — 이 문서 갱신 커밋이 바로 뒤에 붙는다.
- 운영: `woorihigh-app.vercel.app` HTTP 200 (buildId `1598c4cf…`) / `woori-high.web.app` HTTP 200
- 브랜치는 `main` 하나뿐 (병합 완료된 `codex/unified-highschool`·`refactor/2026-07-plan`을 2026-08-13 삭제)
- 작업 트리 깨끗 (미추적 `.agents/` `outputs/` `tmp/` + 학생 앱 `tmp/` 제외 — **`git add .` 금지**)
- 폴더 1.5GB (8/12 아침 4.5GB에서 정리)

## 현재 운영 구조 (2026-08-13 기준)

앱은 **2개뿐**이다. 8/12에 2개를 제거했다.

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
9. **인수인계 단일화** — 낡은 `LATEST_HANDOFF.md` 삭제, 이 문서로 통합 (`9c13f30`)
10. **작업 산출물 정리 + 규칙 명문화** (`3c59487`) — 아래 별도 항목 참고

## 2026-08-13 작업 산출물 정리 (전체 구조 전수 조사 결과)

코드는 건강한데 **주변부가 쌓여 있었다.** 세션마다 백업·중간물·완성품이 생기는데 지우는 주체가 없었다.

**개인정보 정리 (가장 컸던 건)** — `tmp/`에 전화번호 평문 **2,401건**과 전교생 명단 393KB가 무기한 방치돼 있었다.

| 위치 | 내용 | 처리 |
|---|---|---|
| `tmp/db-backups/person-id-*/` | `classes.json`(전교생 이름·생년월일·연락처·주소) 등 마이그레이션 **이전** 스냅샷 6개 | 삭제 |
| `tmp/prayer-sms-update/` | `classes2026.json`(전화 1,194건)·`analysis.json`(969건)·`participants.json`(238건) | 삭제 |

삭제 전에 **원본이 운영 DB에 살아 있음**을 확인했다 — 백업은 personId 없는 *이전* 스냅샷이고 운영은 *이후* 상태로 검증을 마쳤다. 감사 기록(`updates.json` 1,933건, 개인정보 필드 0건)은 남기고 `README.md`로 무엇을 왜 지웠는지 적었다.

**그 밖에**
- `tmp/` 중간물 삭제 **65MB → 424KB**. 재생성 스크립트 12개는 `outputs/*/build-scripts/`로 옮겨 결과물 옆에 뒀다.
- 루트 `.vercel` 제거 — 2026-08-05에 삭제된 `iguard-app`을 가리키고 있었다.
- `scripts/verify-all.mjs` 수정 — 없는 앱 2개를 순회해 `npm run verify`가 즉시 실패했다.
- `rayquaza-v2-upgrade/`(126파일, Codex 데스크톱 펫 프로젝트)를 `~/Desktop/`으로 이동. 고등부와 무관한데 옵시디언 노트 63개 중 29개를 차지했다.
- 병합 완료된 브랜치 2개 삭제(고유 커밋 0개 확인 후).
- 루트 `CLAUDE.md`에 **작업 산출물 규칙**을 명문화했다 — 이게 재발 방지의 핵심이다.

**정정**: `.agents/`는 `.claude/`의 복제본이 아니라 **Codex용 변형본**이다(전자는 `AGENTS.md`, 후자는 `CLAUDE.md`를 참조). 지우지 말 것.

## 미완인 것 — 정확한 다음 단계

- [ ] **(최우선) 학생 출석부 데모 모드 정리.** 지금 `NEXT_PUBLIC_DEMO_MODE=1`에 계정 정보가 채워진 채 배포돼 있다. **비밀번호가 공개 JS 번들 안에 있어 주소를 아는 누구나 전교생 개인정보에 접근할 수 있다.** 교사 테스트가 끝나면 ① Firebase 콘솔에서 `demo@woorihigh.com` 계정 삭제 + `attendanceAdmins`의 그 uid 삭제 ② `.env.local`에서 `NEXT_PUBLIC_DEMO_MODE=0` ③ `firebase deploy --only hosting`. 구조는 `고등부 학생 출석부/CLAUDE.md`의 "데모 모드" 참고.
- [ ] **lint 에러 10건** — 전부 `react-hooks/set-state-in-effect`. `ExecutionViews`(3), `LodgingMapView`(2), `RetreatsHome`, `ConnectivityBanner`, `RoomsTab`, `ScheduleSheetEditor`. **이 저장소가 실제로 사고를 낸 패턴**이다(실수 13 — 30초마다 선택이 리셋됐다). 렌더 중 파생으로 하나씩 바꿀 것.
- [ ] **화면 차단 ≠ 실제 차단 5건** — Rules는 여전히 세 버킷(`admins`/`retreatAdmins`/`iguardMembers`)만 구분한다. 화면에서만 막히는 것: 스탭팀장의 행정 조회 전용, 스탭팀장·바나바팀의 민감정보 제외, 사역팀의 "내 팀만 편집", 이가드팀의 학기 차단, **스탭 32명의 `classes` 전체 읽기**. 마지막 항목이 위험도가 가장 높다(전교생 주소·연락처).
- [ ] **(대기) 조장 큐싯 붙여넣기 경로**를 만들지 여부 — 사용자 답변 대기.
- [ ] **(대기) 훈련 반 `goal` 필드** 추가 여부 — 사용자 답변 대기.
- [ ] **(대기) `sheetClient.ts`(14줄)** 참조 0이지만 "되살릴 때만 참고"로 남겨 둠 — 삭제 여부 답변 대기.
- [ ] **(선택) 옵시디언 vault 설정** — 옵시디언이 이 폴더를 통째로 인덱싱해 렉이 걸린다. `.md` 4,261개 중 **4,198개가 `node_modules`**이고 실제 노트는 63개뿐이다(그중 2,864개는 npm이 앱마다 설치한 같은 README 복사본). **설정 → 파일 및 링크 → 제외할 파일**에 `node_modules`·`.git`·`.next`·`out`을 넣으면 노드가 63개로 줄어든다. `rayquaza-v2-upgrade`는 2026-08-13에 폴더 밖으로 옮겨 이미 빠졌다.
- [ ] **(참고) 출석부 사용 가이드는 이미 만들어져 있다** — `outputs/attendance-guide/고등부_출석부_데모_사용가이드_간결버전.pdf`(16MB, 2026-08-13). 재생성 스크립트는 같은 폴더의 `build-scripts/`. 다시 만들기 전에 이것부터 확인할 것.

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
14. **작업이 끝나면 `tmp/`를 지울 것.** 안 지우면 개인정보가 평문으로 쌓인다 — 2026-08-13에 전화번호 2,401건이 발견됐다. 규칙은 루트 `CLAUDE.md`의 "작업 산출물 규칙".
15. **파일을 지우기 전에 열어볼 것.** `.agents/`를 `.claude/`의 복제본으로 오판했다가 실제로는 Codex용 변형본임을 열어보고 알았다. 크기·이름이 비슷하다고 중복이 아니다.

## 참고 문서

- 진입점: 루트 `CLAUDE.md`(운영 매뉴얼·안전 4문답) → 대상 앱 `CLAUDE.md` → `DB_OWNERSHIP.md` → `OPERATIONS.md` → `LEARNINGS.md`
- 권한 계약: `highschool-app/CLAUDE.md`의 "권한 — 두 축 역할"
- Rules 계약 테스트: `고등부 학생 출석부/__tests__/rulesContract.test.ts`
- Rules 배포 전 스냅샷: `고등부 학생 출석부/tmp/rules-backup/` (미추적)
- 복구 태그: `pre-legacy-app-removal-2026-08-05`, `pre-unified-apps-2026-08-05`, `pre-staff-app-removal-2026-08-12`, `pre-semester-app-removal-2026-08-12`
- 완성 산출물: `outputs/` (출석부 사용 가이드 PDF, 수련회 발송용 명단 + 각 `build-scripts/`)
- 마이그레이션 감사 기록: `tmp/db-backups/person-id-20260811-2139/` (개인정보 없음, README 포함)
