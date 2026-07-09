# 인수인계 — 2026-07-09 (세션 종료, Codex 이관용)

> 이 문서는 에이전트 중립(Codex/Claude 공용)입니다. 새 에이전트는 **먼저 읽는 순서**를 지키세요:
> ① 루트 `AGENTS.md`(요약·안전규칙) → ② 루트 `CLAUDE.md`(운영 매뉴얼 전체·최상위 규칙) →
> ③ 경로 만지면 `DB_OWNERSHIP.md` → ④ 배포·복구는 `OPERATIONS.md` → ⑤ 도구·환경 함정은 `LEARNINGS.md`.
> **모든 작업 시작 전 DB 안전 4문답(AGENTS.md/CLAUDE.md)에 먼저 답하세요.**

## 저장소 상태
- `origin/main` = 로컬 HEAD (미푸시 0). 작업트리 클린.
- 최신 커밋: `a904b80` (이가드 식사 공정배정 가중치 제거).
- 배포: retreat-app·iguard-app 모두 Vercel 자동배포(main push 시). **push 후 `npx vercel ls`로 Ready 확인 + `/api/version` buildId를 `git rev-parse HEAD`와 대조**하는 절차 유지.
  - retreat-app: https://retreat-app-theta.vercel.app  · iguard-app: https://iguard-app.vercel.app
  - 두 앱 모두 최신 커밋으로 배포·검증 완료됨.

## 이번 세션에 완료한 것 (전부 커밋·푸시·배포·검증됨)
1. **지침 감사·재작성**: 루트 `CLAUDE.md`(4문답 고정형식·HANDOFF 자동읽기·LEARNINGS 편입 등), `OPERATIONS.md`(자동배포 경고 최신화), `DB_OWNERSHIP.md`(milestones 레거시·periods 확정·누락행 추가), `AGENTS.md`(4문답·학습법칙 편입).
2. **이가드** `subscribeToMilestones`에 `onError` 배선(패턴16 준수).
3. **행정 미납자 현황** 색상 버그: 부분참 우선순위가 뒤바뀌어 입금 연결됐는데 미납으로 남던 문제 → `lib/paymentColorKey.ts`로 분리(p.studentId 1순위)+테스트.
4. **행정 자동 조편성** 기능 4종: `minTwoClasses`(한 조 2개+ 반, 조수 상한 반÷2)·`classConflicts`(반 고려관계)·고려관계 **이름 우선 입력** UX·이분법 규칙 **HARD_PENALTY 통일**. + UI 다듬기(반 고려 3단 셀렉트, 조장 이름picker, 셀렉트 폭 균일, 수정/삭제 창컨트롤 아이콘, 학생 반=분단 세로배치, 교사 칩 아래로). 로직은 `autoAssignUtils.ts`, 테스트 `autoAssign.test.ts`.
5. **행정 신청자 취합**에 부분참(선복귀/후발대) 색 반영: `partialAttendances` 미구독 문제 → `subscribeToPartialAttendances` 추가 + `lib/rosterColor.ts`(취소>부분참>수동색). 이가드/행정 키 동일 `${buNum}_${studentId}`.
6. **조 목록 1,2,3…순 정렬**(양쪽 앱): `groupNumber.ts`의 `sortGroupsByNumber`. 행정 GroupsTab·이가드 GroupStaffView 적용(다른 이가드 뷰는 이미 `{numeric:true}`라 정상).
7. **방배정 동(건물) 기능**: `Room.dong?`(하위호환) 추가 → 방추가 모달 '동' 입력, 카드·인쇄·XLSX에 "동 호수" 표시(`lib/roomLabel.ts`). 이가드 RoomsView도 반영. `rooms` 노드는 Rules에 필드검증 없어 안전(확인함).
8. **방 목록 정렬**: 동별→호수 숫자순 `sortRooms`(행정·이가드). `numeric:true`로 110<99 방지.
9. **이가드 식사 공정배정 평균순위 균등화(하이브리드 A)**: 식사 점수에서 끼니 가중치 곱셈 제거(편차 실측 5.4→4.6). 집회↔식사 연계 유지. MealsView 가중치 UI 제거, `meal.weight`는 타입만 하위호환. 남은 4.6은 홀수 끼니 구조적 하한. 상세: `iguard-app/CLAUDE.md` 패턴6 ⚖.

## 미완/후속 대기 (사용자 결정 또는 다음 작업)
- **기존 방에 '동' 추가 편집 없음**: 이번엔 신규 방 추가 시에만 동 입력. 이미 만든 방에 동을 채우려면 삭제 후 재생성해야 함. 기존 방 편집 기능은 미구현(요청 시 추가).
- **식사 편차 4.6 미만**은 알고리즘으로 불가(끼니 짝수화/조 분할 필요). 사용자가 원하면 B안(완화 가중치 부활)도 가능.
- 이전 세션 백로그(컨설팅 로드맵 Move 1~5, 구역 스코핑 D 등)는 별개 — 이번 세션에서 다루지 않음.

## 함정 (다시 밟지 않도록)
- **로그인 벽**: dev preview는 Google OAuth 헤드리스 통과 불가 → UI 인터랙티브 검증 불가. 이번 세션은 tsc+테스트+빌드로 검증하고 배포는 buildId 대조로 확정함. 사용자 크롬 탭은 데이터 없는 다른 계정이라 라이브 검증도 제한적이었음.
- **Codex엔 Claude 슬래시 스킬(/ship·/bugfix·/handoff) 없음**: 이 스킬들은 `~/.claude/commands/`에 있어 Codex에서 안 보임. 절차는 문서(OPERATIONS.md·각 CLAUDE.md 체크리스트)를 프로즈로 따를 것.
- **폴더명 한글**(고등부 학생 출석부 등): 읽기/로컬 작업엔 무방. 배포 대상은 영문 폴더(retreat-app·iguard-app)뿐.
- **Rules 배포는 학생 앱에서만**. 다른 앱의 `DO_NOT_DEPLOY.*`는 보관용.

## 검증 상태 (세션 종료 시점)
- retreat-app: `npx tsc --noEmit` 0 · 테스트 100 통과 · build OK.
- iguard-app: `npx tsc --noEmit` 0 · 테스트 95 통과 · build OK.
