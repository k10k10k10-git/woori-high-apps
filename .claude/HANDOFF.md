# 인수인계 — 2026-08-11 (Codex → Claude Code)

## 2026-08-11 최신 상태 — 여기부터 읽을 것

- 현재 사용자 요청은 **완료·검증·운영 배포** 상태다. 구현 커밋은 `20faf54` (`주일: 등반 및 배정 취소 구현`)이며, 최종 `main`의 `/api/version`과 Vercel Production `Ready`까지 확인했다.
- `highschool-app` 주일 사역 → 새친구 상세의 기존 `등반 취소`를 **`등반 및 배정 취소`**로 바꿨다. 단순 문구 변경이 아니라 업무 의미도 맞췄다.
  - 새친구 공개/비공개 기록, 접수·1/2주차·등록 결정·목양 메모는 보존한다.
  - `assignedClassKey`, `giftDate`, `rosterSync`를 원자적으로 해제해 `반배정` 단계로 돌린다.
  - 출석부에 반영된 학생이면 통합관리자만 실행할 수 있다. 결정적 `nf_` 학생과 이름을 재검증하고 `classes/{year}/*/students`, 해당 `attendance/{year}`를 제거한다.
  - 삭제 전 전체 근거는 `semestersPrivate/{sid}/newFriendRosterBackups/{friendId}/placementCancellations/{timestamp}`, 학생 복구본은 `trash/{year}/students/{studentId}`에 남긴다.
  - 실행 뒤 새친구 보존, 연결 필드 해제, 학생·출석 제거, 백업·휴지통 존재를 재조회한다.
  - 기존 **`명단·출석부 삭제`**는 새친구 기록까지 지우는 별도 명령으로 그대로 유지한다.
- 검증 실측: `highschool-app` **63파일 494개 테스트 통과**, `npx tsc --noEmit` 통과, `npm run build` 성공. 로그인된 로컬 화면에서 버튼명과 경고문을 확인하고 확인창의 **취소**만 눌렀으므로 운영 DB 쓰기는 없었다. Rules 배포도 없었다.
- 바로 직전 기능 커밋 `e295abe`는 인물 통합검색 상세를 학적/수련회 종류가 아닌 **연도 탭**으로 재구성하고 현장등록 중복 카드를 제외한 변경이다. 그보다 앞선 `a08aedb` 계열은 학생·교사·스탭 연도별 ID를 영구 `personId`에 연결한 작업이다.
- Claude Code 다음 시작 순서: 루트 `CLAUDE.md` → 이 문서 → `highschool-app/CLAUDE.md` → `git log -3 --oneline` → `git status --short`. 새 작업 전 DB 안전 4문답을 먼저 답한다.
- 미추적 사용자 파일은 계속 건드리지 않는다: `.agents/`, `.claude/LATEST_HANDOFF.md`, `outputs/`, `rayquaza-v2-upgrade/`, `tmp/`. 특히 `git add .` 금지.

---

## 2026-08-09 이전 인수인계 기록

## 0. 에이전트별 시작 지점

- **Codex(또는 CLAUDE.md를 안 읽는 에이전트)**: 루트 `AGENTS.md` → 이 문서 → 대상 앱 `AGENTS.md`.
- **Claude Code**: 루트 `CLAUDE.md`(안전 4문답·스킬 지도) → 이 문서 → 대상 앱 `CLAUDE.md`.
- 문서와 코드가 다르면 **코드가 진실**. 안전 규칙은 루트 `CLAUDE.md`/`AGENTS.md`가 우선.
- ⚠ **모든 작업 시작 전 DB 안전 4문답을 먼저 답한다** (루트 `AGENTS.md` 상단). 운영 DB 쓰기·Rules 배포는 사용자 승인 없이는 금지.

## 지금 하던 일 (한 문장)

전반 점검에서 나온 보안·품질 항목을 순차 처리하고 사용자 피드백(UI 잘림·스탭 분리·PIN 잠금)을 반영해 **전부 배포 완료**했으며, 다음 지시를 기다리는 상태다.

## 현재 운영 구조

- 서비스명 **분당우리교회 서현고등부**, 운영 URL `https://woorihigh-app.vercel.app` (구 `highschool-app-flame.vercel.app`도 같은 배포)
- 라우트: `/` 홈 · `/semesters` `/semester/[id]` 학기 · `/retreats` `/retreat/[id]` 행정 · `/field` `/retreat/[id]/field` 현장
- 학생 출석부: Firebase Hosting `https://woori-high.web.app` (별도 앱, 같은 RTDB)
- **배포는 자동이 아니다.** `npx vercel --prod --yes` 후 **별칭 2개를 수동으로 옮겨야** 운영에 반영된다:
  ```bash
  cd highschool-app && npx vercel --prod --yes        # 출력된 배포 URL 복사
  npx vercel ls highschool-app                        # Ready 확인
  npx vercel alias set <새 배포 URL> woorihigh-app.vercel.app
  npx vercel alias set <새 배포 URL> highschool-app-flame.vercel.app
  curl -s https://woorihigh-app.vercel.app/api/version # buildId == git rev-parse HEAD 확인
  ```

## 검증 상태 (2026-08-09 실측)

| 대상 | tsc | 테스트 | 빌드 |
|---|---|---|---|
| `highschool-app` | 0 errors | **55파일 448개 통과** | 성공 |
| `고등부 학생 출석부` | 0 errors | **5파일 77개 통과** | — |

- lint: `highschool-app` **9 errors + 5 warnings** (전부 기존 부채, 성격은 앱 `AGENTS.md` 참조). 이번 세션에서 20 → 9로 줄였고 **신규 위반 0**.
- 배포: `/api/version` buildId `e62d12e…` == `git rev-parse HEAD` ✓, `/` `/semesters` `/semester/2026-2` `/retreats` `/field` 모두 200
- 미커밋 변경 없음, 미푸시 커밋 0.

## 이번 세션에 한 일 (전부 푸시·배포됨)

**보안 — Rules 2회 배포 (학생 앱에서만)**
- `cb5f6c5` 교사 개인정보 노드가 "로그인만 하면" 읽히던 것 차단 (`teacherStaff` 40건에 전화·생년월일, `userRoles` 51건)
- `c58dab8` 역할 멤버십(`retreatAdmins`·`iguardMembers`·`iguardRoles`)·`staff_*`도 축소. **자기조회(`$uid`·이메일 일치)는 반드시 유지** — 없으면 전원 로그인 불가
- `c7b5918` 스탭의 학기 조회 허용(`semesters` `.read`에 `iguardMembers`)
- 검증: Firebase 콘솔 규칙 플레이그라운드로 허용/거부 4케이스씩 실증. 회귀 가드는 `고등부 학생 출석부/__tests__/rulesContract.test.ts`

**코드 리뷰 지적 8건 (`1b78adc`…`b382fa4`)** — 수련회 삭제 시 `retreatsPrivate` 누락, 복구 전 백업 실패 무시, 인원체크 키의 배열 인덱스, 연락처 전체 삭제 미저장, 훈련 반 커리큘럼 고아, 이가드 허브 오류 수집, 자물쇠 구독 부분 실패, 홈 기간 구독 `user` 가드

**품질**
- `0f46300` 사고 이력 모듈 3종(`scheduleTime`·`cueSheet`·`busStaff`) 회귀 가드 신설 — 문서가 존재한다고 주장하던 `scheduleUtils.test.ts`는 **실재하지 않았다**(CLAUDE.md 정정 완료)
- `c49dca8` 모달 ESC 3건·아이콘 버튼 `aria-label` 2건
- `79c09a6` `4928418` 편집 draft를 서버 값으로 되돌리던 effect 제거 (실시간 갱신이 입력을 덮던 버그)
- `5a99e56` `c79dfa3` 죽은 코드 제거(495줄) + `inAppBrowser` 공용화 + 테스트 18개

**UI/기능**
- `4c6adf6` 출석 표 메뉴 잘림(포털)·여백·스탭 분리, 설정 입력칸 폭 통일, 수료에서 스탭 제외, 접수 명단 스탭 항목 숨김, 팀 상세 분리
- `a4ff0a0` PIN 잠금을 행정에도 추가 — 어느 쪽에서 잠가도 양쪽 잠김
- `2614fbe` `e62d12e` 배치 선택 상자 글자 잘림 → 글꼴 13px·폭 128px

## 미완인 것 — 정확한 다음 단계

- [ ] **(사용자 몫) 스탭 계정으로 로그인해 학기 화면 확인.** Rules는 열렸고 조건이 스탭 33명 전원에게 참인 것은 CLI로 확인했지만, 실제 로그인 육안 확인은 못 했다(에이전트에 스탭 비밀번호 없음).
- [ ] **(사용자 몫) 학생 출석부 세션 문제**: `admin@woorihigh.com`으로 로그인한 크롬에서 `https://woori-high.web.app`가 스피너에서 멈춘다. 롤백한 코드에서도 재현돼 코드 원인이 아니다. 로그아웃 → 재로그인(또는 시크릿 창)으로 먼저 확인할 것.
- [ ] **(사용자 몫) Storage 업로드 운영 확인**: 학기 아카이브 업로드는 한 번도 실행하지 않았다. 작은 파일 1개로 업로드→열기→삭제 권장.
- [ ] **(사용자 몫) 375px 실기기 확인**: 브라우저 도구의 `resize_window`가 이 창에 적용되지 않아 근사 측정만 했다. 출석 표·배치 화면을 휴대폰에서 한 번 볼 것.
- [ ] **(선택) 남은 lint 9건**: 실질적으로 정리 가능한 건 `ScheduleSheetEditor`·`SettingsTab` 2건뿐(draft 동기화 → `key` 부여). 나머지는 의도적 패턴이라 **건드리지 말 것**.
- [ ] **(대기) 조장 큐싯 붙여넣기 경로**: 시트 연동 제거로 자동 가져오기가 사라졌다. 붙여넣기로도 받게 할지 사용자 답변 대기.
- [ ] **(대기) 훈련 반 목표 필드**: "이번 학기 목표"가 `teams.goal`만 있어 사역팀에서만 보인다. 필요하면 `TrainingClass.goal` 추가.
- [ ] **(대기) `sheetClient.ts`(14줄) 처리**: 참조 0이지만 `highschool-app/CLAUDE.md`가 "되살릴 때만 참고한다"고 명시해 남겨 뒀다. 되살릴 계획이 없으면 삭제 가능.

## 미커밋 변경

없음. `git status` 깨끗(무관한 미추적 디렉터리 `.agents/` `outputs/` `rayquaza-v2-upgrade/` `tmp/` 제외 — 커밋 시 `git add .` 금지).

## 막힌 것 / 사용자 답변 대기 중인 질문

- 위 "미완인 것"의 마지막 세 항목(조장 큐싯, 훈련 반 목표, `sheetClient`)이 사용자 답변 대기.
- 로그인 벽 뒤 검증은 사용자 계정이 필요하다 — 에이전트는 로그인하지 않는다.

## 이 작업의 함정 (다시 밟지 말 것)

1. **`.input`은 `@layer` 밖 CSS라 Tailwind 유틸리티를 이긴다.** `h-*`로 높이 고정 → 글자 잘림. `w-*`·`text-*`·`px-*`도 무시된다. 폭은 감싼 div, 글꼴은 인라인 style.
2. **Rules를 좁힐 때 자기조회를 지우지 말 것.** `userRoles`·`retreatAdmins`·`iguardMembers`·`iguardRoles`는 로그인 판정이 자기 레코드를 읽는다. 막으면 전원 잠긴다. 좁히기 전 **읽는 코드를 grep으로 증명**하고, 배포 후 **콘솔 플레이그라운드로 허용/거부 양쪽**을 확인할 것.
3. **인증 게이트에서 권한 없는 경로를 읽지 말 것.** `loadUserRole`에서 `get(admins/{uid})`를 await했다가 프로덕션 로그인이 스피너로 멈췄다.
4. **Firebase RTDB는 거부된 리스너를 규칙이 바뀌어도 재시도하지 않는다.** 권한을 열어도 그 탭은 새로고침 전까지 실패 상태 — "고쳤는데 그대로"라는 보고를 받으면 새 탭부터 확인할 것.
5. **원인 확정 전에 재배포를 반복하지 말 것.** 롤백해도 증상이 남으면 내 변경이 원인이 아니다.
6. **새 vercel.app 별칭은 302 `sso-api`로 막힌다.** `vercel domains add <sub>.vercel.app <projectId>` 필요(`LEARNINGS.md`).
7. **Rules에 새 노드를 만들지 말 것.** 규칙 없는 노드는 즉시 권한 거부. 권한 확장은 기존 노드 + 옵션 필드 조합으로.
8. **출석·인원체크는 토글 금지** — 명시 선택(멱등). 해제는 확인창 경유.
9. **effect 안에서 setState 금지.** 파생 가능한 값은 렌더 중 계산하고, 재구독 시 초기화가 필요하면 `scope` 파생으로(`useLoadErrors`·`useRetreatPinGate`가 예시).
10. 학생 출석부 HTML은 `cache-control: max-age=3600`이라 배포 직후 옛 화면이 보인다. 검증 시 캐시·SW를 비울 것.
11. **`git add .` 금지** — 미추적 디렉터리 4개가 딸려 들어간다. 파일을 명시해 add할 것.

## 참고 문서

- 코덱스 진입점: 루트 `AGENTS.md`, `highschool-app/AGENTS.md`(2026-08-09 갱신 — 이번 세션 계약 포함)
- 역할·권한 계약: `highschool-app/CLAUDE.md`(6단계 역할 표)
- DB 소유권: `DB_OWNERSHIP.md`
- 함정·풀이 접근법 모음: `LEARNINGS.md`
- 복구 태그: `pre-legacy-app-removal-2026-08-05`, `pre-unified-apps-2026-08-05`
- Rules 배포 전 스냅샷: `tmp/rules-backup/` (미추적)
