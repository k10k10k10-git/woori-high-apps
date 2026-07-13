# 인수인계 — 2026-07-12 (세션 종료, Codex 이관용)

> 에이전트 중립(Codex/Claude 공용). 새 에이전트는 **읽는 순서**를 지키세요:
> ① 루트 `AGENTS.md`(요약·안전규칙) → ② 루트 `CLAUDE.md`(운영 매뉴얼 전체) →
> ③ 경로 만지면 `DB_OWNERSHIP.md` → ④ 배포·복구는 `OPERATIONS.md` → ⑤ 도구 함정은 `LEARNINGS.md`.
> **모든 작업 시작 전 DB 안전 4문답에 먼저 답하세요.** 수련회 D-12 (여름수련회 7/24~26).

## 지금 하던 일 (한 문장)
여름수련회 직전 QA·버그수정 라운드를 마치고, 남은 작업은 대부분 "사용자가 시트/설정에서 해야 할 운영 작업"과 "미실시 검증(행정 QA·권한별 화면)"이다.

## 저장소 상태 (실측 2026-07-12)
- `origin/main` = 로컬 HEAD (미푸시 0). 작업트리 클린 (`.agents/`만 untracked — 도구 아티팩트, 커밋 대상 아님).
- 최신 커밋: `51ce838`.
- tsc: retreat-app 0 · iguard-app 0 · semester-app 0 errors.
- 배포: 3개 앱 모두 최신 커밋으로 Vercel Ready (buildId=HEAD 대조 확인).
  - retreat: https://retreat-app-theta.vercel.app · iguard: https://iguard-app.vercel.app · **semester: https://semester-app.vercel.app**

## 완료된 것 (전부 커밋·푸시·배포·라이브 검증됨)
1. **semester-app 신규(5번째 앱)** 생성·배포 — 학기 훈련·사역팀 관리(접수·배치·출석·수료·커리큘럼·아카이브). Rules(`semesters`/`semestersPrivate`) 학생 앱에서 배포 완료. 커밋 `71a7286`→`0f3feed`. DB_OWNERSHIP.md·루트 CLAUDE.md 소유권 표 갱신됨.
2. **행정 조편성 반 붙임(결합) 관계** (`aff94ec`) — `buildAffinityBundles`(union-find)로 두 반을 반드시 같은 조. 분리와 반대. `validateClassRelations`가 모순 입력 실행 차단. retreat CLAUDE.md 패턴 12 갱신.
3. **이가드 큐싯 새벽 일정 정리** (`17abe82`) — `resolveOvernight`: 2일차 00:30→1일차 24:30, 23:30~02:00→23:30~26:00. reconcile `blockKey`를 절대분 정규키로(동선 보존). 재임포트 시 기존 블록 빈칸에 additive 자동배정. iguard CLAUDE.md 패턴 10b·18 갱신.
4. **행정 부분참석 탭 개편** (`2681f1b`→`f634fa9`) — 이제 "신청자취합에서 주황(부분참)으로 칠한 학생 ∪ 지정된 학생"만 표시(양방향 연동). 전체 명단 로드 방식 폐기.
5. **이가드 QA 후속** (`07d6bc6`+`51ce838`) — 순간이동 오탐(같은 포스트 제외), 홈 달력 초기 월(오늘 이후), 빈 상태 안내, 수동 폼 자정넘김 정규화, 하단 탭바 실행뷰 한정+아이콘, 연식 라벨(95→95년생).
6. **행정 장결자 색칠 버그** (`aa4632b`) — 신청한 장결자(유하은D)가 신청자취합에서 미매칭 취급되던 것 → 매칭 풀에 장결자 포함.

## 미완인 것 — 정확한 다음 단계
### A. 사용자(사람)만 할 수 있는 운영 작업 — **수련회 전 필수**
- [ ] **시트 데이터 정리 후 재임포트**: ①3일차 귀가 버스 선탑/동승 칸을 이름 목록으로(현재 문장 조각이라 파서 제외) ②순간이동 13건 — 밤 시간대(취침·간식) 같은 사람 다른 포스트 담당 의도 확인 ③조장 큐싯 시트 탭 존재/이름 확인. → 이가드 기획>스탭 전체 큐싯 "시트에서 불러오기 → 시트 반영".
- [ ] **버스 자동배정 실행**(조편성 완료됨) + **행정에서 방배정 입력** → 호차별 인원체크·조별 정보 채워짐.
- [ ] **semester-app Firebase 승인 도메인 추가**: Console→Authentication→Settings→Authorized domains에 `semester-app.vercel.app`. **안 하면 로그인 자체가 안 됨**(auth/unauthorized-domain).

### B. 다음 에이전트가 할 수 있는 것 (사용자 승인 후)
- [ ] **행정 사이트 리허설 QA** — 이가드는 심층 완료, 행정 15개 탭은 미실시. `/retreat-qa retreat`. 현장등록·의료일지·부분참석·인쇄/엑셀(XSS) 중심.
- [ ] **권한별 화면 검증** — 지금까지 admin 계정으로만 봄. staff role 계정으로 실행 탭만 보이는지 확인 필요(스탭 테스트 계정 필요).
- [ ] **semester-app code-review 높음 2건 수정** — ①팀 삭제 시 배치된 학생이 유령화(AssignTab 미배정/칼럼 어디에도 안 뜸) ②설정 탭이 마운트 시점 meta만 캡처해 저장 시 completionRule 덮어쓸 수 있음. 수련회 뒤에 해도 됨.
- [ ] **Codex 전환 문서 A~D** (사용자 제안 대기): 루트 AGENTS.md 4→5개 앱 갱신, `semester-app/AGENTS.md` 신규, 스킬 절차 산문화(Codex엔 /ship 등 스킬 없음), 이 HANDOFF 활용.

## 미커밋 변경
없음.

## 막힌 것 / 사용자 답변 대기 중
- 위 B 항목들 중 무엇을 먼저 할지 사용자 선택 대기. 직전 질문 "또 해볼 만한 것?"에 목록(행정 QA·권한 검증·백업 리허설·Codex 문서)을 제시함.

## 이 작업의 함정 (이번 세션에서 배운 것)
- **claude-in-chrome 새 탭은 로그인 세션이 없을 수 있다** — 라이브 검증 중 새 탭 컨텍스트가 로그아웃 상태로 열려 로그인 벽에 막힘. 자격증명 입력 금지라 대신 로그인 불가 → 그럴 땐 배포는 buildId 대조로 확정하고 화면 확인만 사용자에게 넘긴다.
- **모바일 뷰 검증**: `resize_window`가 outer 크기만 바꾸고 실제 뷰포트(innerWidth)는 안 바뀔 때가 있다. 우회: 페이지에 `<iframe src=현재URL width=375>`를 JS로 삽입해 모바일 레이아웃을 실측(이번에 하단 탭바·1열 재배치 확인). 검증 후 iframe 제거.
- **구글시트/Docs 읽기**: 이름박스 셀 점프(`A40`+Enter)로, 스크롤·PageDown은 안 먹음(LEARNINGS.md 기록됨).
- 파괴적 라이브 검증은 "저장 안 되는 입력(비정상 시간 등) → 경고 토스트 확인"으로만. DB 무쓰기.

## 검증 상태
- tsc: 3개 앱 0 errors (실측). 테스트: retreat 119 / iguard 110 / semester 5 통과.
- 배포: 3개 앱 Ready, buildId=HEAD 대조 완료.
