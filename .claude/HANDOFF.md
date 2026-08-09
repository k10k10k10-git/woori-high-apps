# 인수인계 — 2026-08-07

## 0. 에이전트별 시작 지점

- **Codex(또는 CLAUDE.md를 안 읽는 에이전트)**: 루트 `AGENTS.md` → 이 문서 → 대상 앱 `AGENTS.md`.
- **Claude Code**: 루트 `CLAUDE.md`(안전 4문답·스킬 지도) → 이 문서 → 대상 앱 `CLAUDE.md`.
- 문서와 코드가 다르면 **코드가 진실**. 안전 규칙은 루트 `CLAUDE.md`가 우선.

## 지금 하던 일 (한 문장)

고등부 사역 플랫폼(`highschool-app`)의 학기·수련회 화면을 사용자 피드백대로 다듬는 연속 작업 — 마지막 요청분(큐싯 시트 연동 제거·공유 일정 편집·훈련 배치/커리큘럼 축·수료 문구)까지 배포 완료했고, 다음 지시를 기다리는 상태다.

## 현재 운영 구조

- 서비스명 **분당우리교회 서현고등부**, 운영 URL `https://woorihigh-app.vercel.app` (구 `highschool-app-flame.vercel.app`도 같은 배포)
- 라우트: `/` 홈 · `/semesters` `/semester/[id]` 학기 · `/retreats` `/retreat/[id]` 행정 · `/field` `/retreat/[id]/field` 현장
- 학생 출석부: Firebase Hosting `https://woori-high.web.app` (별도 앱, 같은 RTDB)
- 배포: highschool-app은 `npx vercel --prod --yes` 후 **별칭 2개를 수동으로 옮겨야** 한다
  ```bash
  npx vercel alias set <새 배포 URL> woorihigh-app.vercel.app
  npx vercel alias set <새 배포 URL> highschool-app-flame.vercel.app
  curl -s https://woorihigh-app.vercel.app/api/version   # buildId == git rev-parse HEAD 확인
  ```

## 완료된 것 (2026-08-06~07, 전부 푸시·배포됨)

| 커밋 | 내용 |
|---|---|
| `730f081` | **6단계 역할 모델**(통합관리자·교역자·팀장·행정팀·이가드팀·스탭) + 전역 셸 개편 |
| `2f52672` | 학기 접수에 연락처·스탭 추가, 학기 UI 초록 통일 |
| `8b6683d` | 운영 주소 `woorihigh-app.vercel.app` 전환 |
| `f8b7a4e` `9edd3f6` | 학습 메모 2건, Codex용 AGENTS 문서 갱신 |
| `ae99b10` | (다른 세션) 학기 운영 UX·공유 캘린더 |
| `59684bd` `0479477` | **훈련 반** 도입 + 접수 원칙(훈련 필수, 고3 2학기·스탭 예외) |
| `c9fa802` | **출석부 권한 분리** — Rules에 `attendanceAdmins` 신설·배포 |
| `112dc50` `f6b9dcb` | 학생앱 훅 롤백 → 안전 버전 재적용(실패하는 `admins` 쓰기 제거) |
| `168b608` | 팀원 관리 잘림 수정, 학기 삭제, 수련회 생성 공용화, 접수→신청, 출석 표 보기 |
| `0ef574b` | 교사·스탭 접수 분리(팀 직접 배정), 훈련 반 필터, 서비스명 변경 |
| `8654d18` | **방학 중 사역 홈을 화면 하나로 통합**(`VacationHome`), 드롭다운 유지 |
| `e272f71` | 큐싯 시트 연동 제거, 홈 공유 일정 편집, 훈련 배치/커리큘럼 축, 수료 문구 |

## 미완인 것 — 정확한 다음 단계

- [ ] **(사용자 몫) 학생 출석부 세션 문제 확인**: `admin@woorihigh.com`으로 로그인한 크롬에서 `https://woori-high.web.app`가 스피너에서 멈춘다. **롤백한 코드에서도 재현**됐으므로 코드 원인이 아니고, 로그인 안 된 깨끗한 브라우저에서는 정상 동작한다. 사용자가 **로그아웃 → 재로그인**(또는 시크릿 창)으로 확인해야 한다. 그래도 같으면: 로그인 직후 `read_console_messages`로 RTDB 경고를 잡고, `loadUserRole`의 `get(userRoles/…)` 응답이 오는지부터 확인할 것.
- [x] **스탭의 학기 조회 Rules 보강 — 2026-08-08 완료.** `semesters` `.read`에 `iguardMembers`를 추가하고 학생 앱에서 배포했다(`firebase deploy --only database`). 라이브 Rules 재조회로 반영 확인, 배포 전후 달라진 최상위 노드는 `semesters` 하나뿐. `.write`와 `semestersPrivate`는 무변경. 배포 전 스냅샷: `tmp/rules-backup/live-rules-20260808-120543.json`(미추적).
  - 관리자 계정(`smilegate1108@gmail.com`) 기준으로는 **로그인된 실제 브라우저에서 검증 완료** — 홈·`/semester/2026-2` 모두 배너 없이 `sessions`까지 로드(회차 1회).
  - 남은 확인: **스탭 계정으로 실제 로그인**해 학기 화면이 보이는지 육안 확인(에이전트는 스탭 비밀번호가 없어 미실행).
- [x] **전반 점검 후속 4건 — 2026-08-09 완료 (`cb5f6c5`…`4928418`, 배포됨).** ①교사 개인정보 노드 Rules 축소(콘솔 플레이그라운드 4케이스 검증) ②사고 이력 모듈 3종 회귀 가드 신설 + CLAUDE.md 거짓 보증 정정 ③모달 ESC 3건·aria-label 2건 ④set-state-in-effect 20→18.
  - **후속(2026-08-09 완료)**: Rules 2차 축소 + set-state-in-effect 20→11. 아래 참조.
  - **남은 것(갱신)**: `set-state-in-effect` 9건. 성격이 다르다 — 편집 draft를 props에서 동기화(7), 자동 선택(2), 레이아웃 측정·fetch·팝오버 닫기(나머지). 권장 수정은 `key` 기반 리마운트이고, 실수 13(자동 선택이 사용자 선택을 덮음) 영역이라 수련회 직전 일괄 수정을 피했다.
  - ~~남은 것: 역할 멤버십 노드 `.read` 축소~~ → **완료(`c58dab8`)**. `retreatAdmins`·`iguardMembers`·`iguardRoles`는 역할 보유자만 목록 조회 + `$uid` 자기조회 유지(자기조회를 막으면 AuthContext의 catch가 role="none"으로 떨어져 비관리자 전원이 잠긴다). `staff_*`는 admins·staff_admins만(0건·미배포). `events`는 개인정보가 없어 그대로 둔다.
  - **죽은 코드 정리(2026-08-09, `5a99e56`·`c79dfa3`)**: `ScheduleBlockAssignment.tsx`(323줄, 4개 export 전부 참조 0 — 통합 커밋 이후 한 번도 import된 적 없음), `useMyRetreatMinistry.ts`(122줄), `scheduleProgress.ts`(50줄) 삭제. `inAppBrowser.ts`는 지우는 대신 **공용 모듈로 되돌렸다** — `FieldHomeClient`가 복제해 쓰던 로직을 공용 모듈로 흡수(LINE 전략·기타 웹뷰 감지 추가)하고 테스트 18개 신설. `sheetClient.ts`는 CLAUDE.md가 "되살릴 때만 참고한다"고 명시해 **남겨 뒀다**.
  - 남은 `set-state-in-effect` 9건의 성격: ①ExecutionViews 3건 — `staffPicked`/`userPicked` ref 가드를 쓰는 자동 선택으로 **실수 13이 처방한 패턴 그 자체**라 건드리지 않았다 ②LodgingMapView 2건 — 팝오버 닫기·레이아웃 측정(정당) ③useRetreatData 1건·RetreatsHome 1건 — 로딩 플래그·데이터 fetch(정당) ⑤ScheduleSheetEditor 1건·SettingsTab 1건 — draft 동기화, key 부여 여부 확인 필요.
- [x] **학기 화면 UI 5건 + PIN 잠금 공유 — 2026-08-09 완료 (`4c6adf6`, `a4ff0a0`, 배포됨).** ①출석 표 상태 메뉴 포털(잘림 해결)·카드 폭 축소·학생/스탭 구분 ②설정 장소·담당 입력칸 폭 통일 ③수료 대상에서 스탭 제외(`completionRoster`) ④접수 명단에서 스탭의 훈련·보호자 숨김 ⑤팀 상세 학생/스탭 분리. 스탭 판정은 `roster.ts`의 `isStaffApplication`/`splitStudentsAndStaff` 한 곳.
  - PIN 잠금: `useRetreatPinGate` 공용 훅 신설, 행정 상세에도 게이트 적용, 행정 홈에 🔐 관리자 버튼·자물쇠 배지. **운영 DB에 PIN을 쓰지 않고** 로컬에서 잠금 상태를 흉내 내 양쪽 화면 검증 후 원복.
- [x] **코드 리뷰 지적 8건 전부 수정 — 2026-08-09 완료 (`1b78adc`…`b382fa4`, 배포됨).** 1건=1커밋. ①수련회 삭제 시 `retreatsPrivate` 함께 제거(조사 결과 기존 고아 0건) ②복구 전 백업 실패 시 중단 ③인원체크 키에서 배열 인덱스 제거(구형 키 하위호환) ④연락처 전체 삭제 저장 ⑤훈련 반 삭제 시 커리큘럼 정리 ⑥이가드 허브 `useLoadErrors` 이관 ⑦자물쇠 구독 부분 실패 허용 ⑧홈 기간 구독 `user` 가드.
  - ③은 운영 DB에 구형 키가 실재해 **로그인 화면에서 실측 검증**: 교사·버스스탭 8명의 화면 표시가 DB의 `checked` 값과 전부 일치(톰스톤 포함).
  - 발견 메모(미수정): `RetreatCalendarPanel`의 기간 구독에도 `user` 가드가 없다. 부모가 인증 화면 안에서만 마운트해 현재는 무해하다.
- [x] **로드 오류 배너 결함 수정 — 2026-08-08 완료 (`01a67b9`, 배포됨).** 단일 `loadError` 문자열 때문에 ①동시 실패 중 마지막 하나만 표시 ②원인이 해소돼도 배너가 영구히 남음. `lib/useLoadErrors.ts`로 경로별 수집+재구독 시 초기화. `PortalHome`의 회차 구독에 `user` 가드 추가. dev 서버에서 두 경로를 일부러 막아 함께 표시되는 것과 복구 시 사라지는 것을 실구동 확인.
  - ⚠ 미해결(무해): `highschool-app/.claude/launch.json`이 **제거된 `retreat-app`**을 가리킨다(git 미추적 로컬 파일). 루트 `.claude/launch.json`이 올바른 3개 설정을 갖고 있으므로 운영에 영향 없음 — 정리하려면 그 파일을 지우면 된다.
- [ ] **(사용자 몫) Storage 업로드 운영 확인**: 학기 아카이브 파일 업로드는 자동 점검에서 실행하지 않았다. 작은 파일 1개로 업로드→열기→삭제 확인 권장.
- [ ] **(대기) 조장 큐싯 붙여넣기 경로**: 시트 연동 제거로 조장 큐싯 자동 가져오기가 사라졌다. 붙여넣기로도 받게 할지 사용자 답변 대기.
- [ ] **(대기) 훈련 반 목표 필드**: 커리큘럼의 "이번 학기 목표"는 `teams.goal`만 있어 사역팀에서만 보인다. 훈련 반에도 필요하면 `TrainingClass.goal` 추가.

## 미커밋 변경

없음. `git status` 깨끗(무관한 미추적 디렉터리 `.agents/` `outputs/` `rayquaza-v2-upgrade/` `tmp/` 제외 — 커밋 시 `git add .` 금지).

## 막힌 것 / 사용자 답변 대기 중인 질문

- 위 "미완인 것"의 마지막 두 항목(조장 큐싯 붙여넣기, 훈련 반 목표)이 사용자 답변 대기.
- 학생 출석부 스피너는 **사용자 재로그인 확인 후에야** 다음 진단이 가능하다(비밀번호 필요 — 에이전트가 로그인하지 않는다).

## 이 작업의 함정 (다시 밟지 말 것)

1. **`.input`은 `@layer` 밖 CSS라 `width:100%`가 유틸리티 `w-*`를 이긴다.** 폭은 감싼 div로 주고 높이는 `h-*`로 고정하지 말 것(모바일 16px 글꼴에서 글자가 잘린다).
2. **인증 게이트에서 권한 없는 경로를 읽지 말 것.** `loadUserRole`에서 `get(admins/{uid})`를 await했다가 프로덕션 로그인이 스피너로 멈췄다. 권한 안내는 데이터 구독 오류(`dbError.dataLoadMessage`)가 담당한다.
3. **원인 확정 전에 재배포를 반복하지 말 것.** 위 사고에서 "내 변경이 범인"이라 단정해 두 번 재배포했지만, 롤백해도 증상이 남아 원인이 아니었다. 배포 전 깨끗한 브라우저 기준선을 먼저 잡고, 증상이 나오면 롤백 → 원인 규명 순서로.
4. **새 vercel.app 별칭은 302 `sso-api`로 막힌다.** `vercel domains add <sub>.vercel.app <projectId>`로 프로젝트 도메인 등록해야 열린다(자세한 건 `LEARNINGS.md`).
5. **Rules에 새 노드를 만들지 말 것.** 규칙이 없는 노드는 즉시 권한 거부다. 권한 확장은 기존 노드 + 옵션 필드 조합으로(6단계 역할이 그 예).
6. **출석·인원체크는 토글 금지** — 명시 선택(멱등). 출석 표 셀도 클릭 시 메뉴에서 고른다.
7. **effect 안에서 setState 금지**(eslint `react-hooks/set-state-in-effect`). 파생 가능한 값은 렌더 중 계산(`SemesterClient`의 `activeTab`).
8. 학생 출석부 HTML은 `cache-control: max-age=3600`이라 배포 직후 브라우저가 옛 화면을 보여준다. 검증할 때 캐시·SW를 반드시 비울 것.

## 검증 상태 (2026-08-07 실측)

- `highschool-app`: `npx tsc --noEmit` 통과 / `npm test` **47파일 359개 통과** / 프로덕션 빌드 성공
- `고등부 학생 출석부`: `npx tsc --noEmit` 통과 / `npm test` **4파일 52개 통과**
- 배포: `/api/version` buildId `e272f71…` == `git rev-parse HEAD` ✓, `/` `/semesters` `/retreats` `/field` 모두 200
- lint: 두 앱 모두 **신규 오류 0**. `highschool-app`에 기존 오류 24건이 남아 있다(대부분 이가드 현장 모듈의 `react-hooks/set-state-in-effect`) — 이번 작업과 무관한 부채.
- ⚠ 로그인 뒤 화면은 **로컬 로그인 브라우저로 육안 확인**했다(신청·배치·출석 표·커리큘럼·설정·팀원 관리·수련회 홈). 운영 DB 쓰기는 하지 않았다(모달은 저장 없이 닫음).

## 참고 문서

- 역할·권한 계약: `highschool-app/CLAUDE.md`(6단계 역할 표), `highschool-app/AGENTS.md`
- DB 소유권: `DB_OWNERSHIP.md` (`attendanceAdmins`·`trainingClasses`·`applications.trainingClassId` 포함)
- 함정 모음: `LEARNINGS.md`
- 복구 태그: `pre-legacy-app-removal-2026-08-05`, `pre-unified-apps-2026-08-05`
