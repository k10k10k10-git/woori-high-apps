# 인수인계 — 2026-07-31 (Claude/Codex 공용)

## 현재 상태

`main`은 `origin/main`보다 **2커밋 앞서며 아직 push·배포하지 않았다.**

```text
52e011f 이가드: 큐싯 본문을 잘림 없이 전체 표시
00682d7 행정: 탭을 5그룹으로 재분류하고 이름 정합
2ee761a origin/main
```

사용자는 현재 작업을 Claude에서 이어서 진행한다고 말했다. 다음 실행자는
아래 두 로컬 커밋을 보존하고, 추가 수정 요청이 없다면 배포 승인 여부부터
확인한다.

DB 직접 쓰기 0건, DB 경로·형태 변경 없음, Firebase Rules 변경·배포 없음.

## 반드시 먼저 읽을 것

1. 루트 `AGENTS.md`
2. 루트 `CLAUDE.md`
3. 이 파일
4. `retreat-app/CLAUDE.md`, `retreat-app/AGENTS.md`
5. `iguard-app/CLAUDE.md`, `iguard-app/AGENTS.md`
6. 배포할 때 `OPERATIONS.md`

모든 새 작업의 첫 응답에서 DB 안전 4문답을 먼저 답한다.

## 로컬 커밋 1 — 행정 탭 재분류

커밋: `00682d7 행정: 탭을 5그룹으로 재분류하고 이름 정합`

`retreat-app`의 숫자 `TAB_IDX`와 기존 탭 상태 로직은 그대로 두고, 17개 탭을
다음 5그룹으로 재분류했다.

- 명단: 신청 접수, 반별 명단, 입금 대조, 취소·환불
- 편성: 조편성, 방배정, 교사 참석
- 이동·참석: 부분 참석, 카풀·자차
- 물품·비용: 여행자 보험, 단체티, 구매 물품, 물품 재고, 식사 인원
- 현장: 현장 등록, 건강 특이사항, 의료 일지

화면 안의 이전 탭 명칭도 새 이름과 맞췄다. DB 값인
`AdminSupplyKind = "행정물품"`과 `ADMIN_SUPPLY_KINDS`는 건드리지 않았다.

변경 파일:

- `retreat-app/src/app/retreat/[id]/RetreatPageClient.tsx`
- `retreat-app/src/app/retreat/[id]/UnmatchedPaymentsTab.tsx`
- `retreat-app/src/app/retreat/[id]/MealCountTab.tsx`
- `retreat-app/src/app/retreat/[id]/ClassRosterTab.tsx`
- `retreat-app/src/app/retreat/[id]/PartialAttendanceTab.tsx`
- `retreat-app/src/app/retreat/[id]/ParticipantsTab.tsx`
- `retreat-app/src/app/FormGuideModal.tsx`
- `retreat-app/src/lib/retreatTabs.test.ts`
- `retreat-app/AGENTS.md`

검증 완료:

- `cd retreat-app && npx tsc --noEmit`: 오류 0
- `cd retreat-app && npm test`: 전체 통과
- `cd retreat-app && npm run build`: 성공
- 로그인된 연습 화면에서 5개 그룹과 17개 탭 전환 확인
- 물품 재고 탭의 기존 `행정물품` 데이터가 유지되는 것을 확인

## 로컬 커밋 2 — 큐싯 본문 전체 노출

커밋: `52e011f 이가드: 큐싯 본문을 잘림 없이 전체 표시`

사용자 요구는 `스탭 전체 큐싯`에서 페이지가 길어져도 좋으니 내용·담당·
특이사항 텍스트가 셀 내부 스크롤이나 말줄임 없이 한눈에 전부 보이게 하는
것이었다.

구현:

- `ScheduleSheetEditor.tsx`에 공통 `AutoGrowTextarea` 추가
- 값이나 브라우저 너비가 바뀔 때 `scrollHeight`만큼 자동 높이 확장
- `box-sizing: border-box`의 테두리 2px 부족 문제를
  `offsetHeight - clientHeight` 보정으로 해결
- 실제 본문 글꼴을 공통 `.input`보다 우선하는 11px로 축소
- 기본 입력 높이를 모바일 240px, PC 300px로 확대
- 입력칸 내부 스크롤과 수동 리사이즈 제거
- 담당·동선 요약의 `slice(0, 3)`, `truncate`, `외 N개 장소`를 제거하고
  모든 줄을 줄바꿈으로 표시

변경 파일:

- `iguard-app/src/app/retreat/[id]/ScheduleSheetEditor.tsx`
- `iguard-app/__tests__/planningUi.test.ts`
- `iguard-app/AGENTS.md`

검증 완료:

- `cd iguard-app && npx tsc --noEmit`: 오류 0
- `cd iguard-app && npm test`: 42개 파일, 291개 테스트 통과
- `cd iguard-app && npm run build`: 성공
- 로그인된 연습용 수련회
  `http://localhost:3000/retreat/-Ov_SQVKmfIcnPSlPGDC`에서 확인
- 내용·담당·특이사항 textarea 66개 전수 측정:
  - `scrollHeight > clientHeight`인 항목 0개
  - 실제 `font-size: 11px`
  - `overflow-y: hidden`
- 긴 항목은 행 자체가 700px 이상 늘어나고 페이지 스크롤로 전체 표시됨

## 배포 전 반드시 확인할 질문

두 로컬 커밋을 push하면 모노레포의 `retreat-app`과 `iguard-app` 배포가
같이 시작된다. 사용자는 직전 질문에 아직 배포 승인으로 답하지 않고
Claude로 이어서 작업한다고만 했다.

따라서 push 전 다음을 확인한다.

> 행정 탭 재분류(`00682d7`)와 이가드 큐싯 전체 노출(`52e011f`)을 함께
> push해 두 앱을 배포할까요?

승인 없이 push하지 않는다. 행정 변경만 따로 내야 한다면 현재 `main`에서
무작정 push하지 말고 커밋 분리 방식을 먼저 사용자와 합의한다.

## 승인 후 배포·확인

루트에서 명시 경로만 다루고 `git add .`는 사용하지 않는다.

```bash
cd /Users/sunghoon/Desktop/ai개발
git status --short
git push origin main
git rev-parse HEAD

curl -s https://retreat-app-theta.vercel.app/api/version
curl -s https://iguard-app.vercel.app/api/version

cd retreat-app && npx vercel ls
cd ../iguard-app && npx vercel ls
```

두 `/api/version`의 buildId가 `git rev-parse HEAD`와 같고, 양쪽 Vercel
배포가 `Ready`인지 확인한 뒤에만 배포 완료라고 보고한다.

## 작업 트리 주의

아래 미추적 디렉터리는 이전부터 존재하며 이번 작업 대상이 아니다.

- `.agents/`
- `outputs/`
- `rayquaza-v2-upgrade/`
- `tmp/`

임의 커밋·삭제하지 않는다. `git add .` 금지.
