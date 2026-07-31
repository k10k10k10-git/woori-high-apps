# 인수인계 — 2026-07-31 (다른 Codex 계정용)

## 현재 상태

이 문서와 함께 커밋되는 `이가드: 스탭 담당 카드 중복 표시 제거`는
로컬에서만 검증한 미배포 커밋이다. 따라서 커밋 후 `main`은
`origin/main`보다 1커밋 앞선다. 사용자가 배포를 따로 요청하기 전에는
push하지 않는다.

```text
로컬 최신: 이가드: 스탭 담당 카드 중복 표시 제거
1274616 이가드: 스탭 명단과 개인 담당 표시를 일치
7579c56 이가드: 큐싯 담당 변경과 구조화 동선을 동기화
72916d3 문서: 행정·이가드 미배포 작업 인수인계
52e011f 이가드: 큐싯 본문을 잘림 없이 전체 표시
00682d7 행정: 탭을 5그룹으로 재분류하고 이름 정합
```

현재 운영 SHA:

```text
1274616705687815d62043c03937d373da0a99da
```

운영 배포도 이 SHA와 일치한다.

- `https://iguard-app.vercel.app/api/version`
- `https://retreat-app-theta.vercel.app/api/version`
- 두 앱 buildId 모두 `1274616705687815d62043c03937d373da0a99da`
- Vercel 배포 두 앱 모두 `Ready` 확인 완료

DB 직접 쓰기 0건, DB 경로·형태 변경 없음, Firebase Rules 변경·배포 없음.

## 로컬 미배포 수정 — 회색·보라색 담당 카드 중복 제거

### 증상

`스탭 전체 큐싯` 상단 명단에서 스탭 상세를 열면 같은 시간대의 같은 역할이
구조화 동선의 회색 카드와 큐싯 자유문구 담당의 보라색 카드로 두 번 보였다.

### 수정

- `iguard-app/src/lib/personalDuty.ts`
  - `withoutStructuredDutyLabels()` 추가
  - `[수련회장]` 같은 구역 접두어와 공백·구분 기호를 정규화한 뒤 역할 비교
- `iguard-app/src/app/retreat/[id]/ScheduleStaffRoster.tsx`
  - 같은 블록의 구조화 포스트명과 자유문구 역할명이 같으면 보라색 카드만 제외
  - 같은 블록이어도 서로 다른 역할은 계속 표시
- `iguard-app/__tests__/personalDuty.test.ts`
  - 중복 역할만 제거하고 별도 역할은 보존하는 회귀 테스트 추가
- `iguard-app/AGENTS.md`
  - 두 출처를 합칠 때 블록 전체가 아니라 역할 단위로 중복 제거하는 규칙 기록

### 검증

- `cd iguard-app && npx tsc --noEmit`: 오류 0
- `cd iguard-app && npm test`: 42개 파일, 297개 테스트 통과
- `cd iguard-app && npm run build`: 성공
- 로그인된 로컬 연습용 수련회에서 이채희 상세 확인:
  - 구조화 동선과 같은 `위 숙소`, `밥절`, `숙소 층장` 보라색 중복 없음
  - 구조화 동선에 없는 `보조`, `5호차` 등 별도 담당은 보라색으로 유지

배포 요청을 받으면 이 로컬 커밋을 push한 뒤 retreat-app과 iguard-app
양쪽 Vercel `Ready` 및 `/api/version` buildId를 확인한다.

## 다음 계정이 반드시 먼저 읽을 것

1. 루트 `AGENTS.md`
2. 루트 `CLAUDE.md`
3. 이 파일
4. 대상 앱의 `CLAUDE.md`, `AGENTS.md`
5. DB 경로를 만지면 `DB_OWNERSHIP.md`
6. 배포할 때 `OPERATIONS.md`

모든 새 작업 첫 응답에서 DB 안전 4문답을 먼저 답한다.

## 방금 해결한 버그 — 김현민 동선이 없다고 표시됨

### 증상

- `스탭 전체 큐싯` 상단 스탭 명단에서 김현민을 열면
  `배정된 동선 없음`으로 표시됐다.
- 같은 김현민의 개인 큐카드에는 다음 담당이 정상적으로 보였다.
  - 1일차 14:00 등록: `담당 역할 · 1층`
  - 1일차 15:00 출발 및 도착: `담당 역할 · 4호차`

### 원인

개인 큐카드와 스탭 명단이 같은 큐싯을 서로 다른 방식으로 해석했다.

- 개인 큐카드는 큐싯 `담당`/`특이사항` 자유문구까지 파싱했다.
- 스탭 명단은 구조화된 `AssignedIguardMovement[]`만 확인했다.
- `ScheduleView.tsx`도 명단에 원본 `movementRecords`가 아니라
  기본 구간으로 좁힌 `movements`만 전달했다.

따라서 자유문구 담당만 있고 구조화된 기본 동선이 없는 사람은 개인 카드에는
나오지만 스탭 명단에는 `없음`으로 표시됐다.

### 수정

커밋: `1274616 이가드: 스탭 명단과 개인 담당 표시를 일치`

- `iguard-app/src/lib/personalDuty.ts`
  - 개인 큐카드와 스탭 명단이 함께 쓰는 `dutyLinesForStaff`,
    `visibleNoticeLines` 제공
  - 이름 공백과 `sf` 접미사를 동일하게 정규화
- `iguard-app/src/app/retreat/[id]/ExecutionViews.tsx`
  - 중복된 로컬 파서를 제거하고 공용 파서 사용
- `iguard-app/src/app/retreat/[id]/ScheduleStaffRoster.tsx`
  - 구조화 동선과 자유문구 담당을 모두 합쳐 `동선·담당`으로 표시
  - 빈 상태 문구를 `배정된 동선·담당 없음`으로 변경
- `iguard-app/src/app/retreat/[id]/ScheduleView.tsx`
  - 명단에 원본 `movementRecords` 전달
- 회귀 테스트
  - `iguard-app/__tests__/personalDuty.test.ts`
  - `iguard-app/__tests__/scheduleEditorInfrastructure.test.ts`
- 학습 메모
  - `iguard-app/AGENTS.md`
  - `개인 큐카드의 역할과 공동 담당자 명단을 분리하기` 항목 보강

### 검증

- `cd iguard-app && npx tsc --noEmit`: 오류 0
- `cd iguard-app && npm test`: 42개 파일, 296개 테스트 통과
- `cd iguard-app && npm run build`: 성공
- 운영 로그인 화면에서 김현민 상세를 직접 열어 확인:
  - `1일차 14:00~15:00 / 등록 / 담당 · 1층`
  - `1일차 15:00~16:00 / 출발 및 도착 / 담당 · 4호차`
  - 식사·숙소·선교팀 담당도 함께 표시됨

## 직전 관련 수정 — 큐싯 담당 변경 동기화

커밋: `7579c56 이가드: 큐싯 담당 변경과 구조화 동선을 동기화`

큐싯 담당 textarea를 수정했는데 아래 구조화 동선 요약에는 예전
`행정팀`이 남던 문제를 수정했다. 사이트 내 수동 배정은 유지하고, 큐싯
자유문구에서 자동 생성된 구조화 동선은 최신 담당 문구 기준으로 동기화한다.

새로 이 영역을 수정할 때는 다음 두 데이터가 같은 의미인지 먼저 확인한다.

1. 큐싯 블록의 자유문구 `owner`/`notice`
2. `retreats/{id}/iguard/movements`의 구조화 동선

운영 DB 직접 수정 없이 앱 저장 흐름에서만 처리해야 한다.

## 이미 배포된 주요 작업

### 행정 탭 5그룹 재분류

커밋: `00682d7 행정: 탭을 5그룹으로 재분류하고 이름 정합`

- 명단: 신청 접수, 반별 명단, 입금 대조, 취소·환불
- 편성: 조편성, 방배정, 교사 참석
- 이동·참석: 부분 참석, 카풀·자차
- 물품·비용: 여행자 보험, 단체티, 구매 물품, 물품 재고, 식사 인원
- 현장: 현장 등록, 건강 특이사항, 의료 일지

`TAB_IDX`와 DB 값 `AdminSupplyKind = "행정물품"`은 변경하지 않았다.

### 큐싯 본문 전체 노출

커밋: `52e011f 이가드: 큐싯 본문을 잘림 없이 전체 표시`

`ScheduleSheetEditor.tsx`의 내용·담당·특이사항 textarea가 내부 스크롤이나
말줄임 없이 내용만큼 자동으로 높아진다. 긴 큐싯은 셀 내부가 아니라 페이지를
스크롤해 전체 내용을 본다.

## 다음 작업 시 주의

- 이가드는 행정 노드를 읽기만 한다. 쓰기는
  `retreats/{id}/iguard/*` 소유 경로만 허용한다.
- 자유문구 담당과 구조화 동선을 화면별로 따로 파싱하지 않는다.
  `src/lib/personalDuty.ts`와 기존 큐싯/동선 유틸을 재사용한다.
- 이름 매칭은 공백, `sf`, 학번 접두어 때문에 화면마다 재구현하면 안 된다.
- `ScheduleStaffRoster`에는 필터된 기본 구간이 아니라 원본
  `movementRecords`를 전달한다.
- 순수 로직 버그는 반드시 같은 커밋에 회귀 테스트를 추가한다.
- 배포 시 모노레포 push가 retreat-app과 iguard-app을 함께 재배포한다.
- Rules는 절대 retreat/iguard에서 배포하지 않는다.

## 작업 트리

커밋 후 추적 파일의 미커밋 변경은 없어야 한다. 아래 미추적 디렉터리는
이전부터 존재하며 이번 작업 대상이 아니다.

- `.agents/`
- `outputs/`
- `rayquaza-v2-upgrade/`
- `tmp/`

임의 커밋·삭제하지 않는다. `git add .` 금지.

이 인수인계 문서 자체는 다른 Codex 계정이 같은 로컬 워크스페이스에서 바로
읽을 수 있도록 갱신한 것이다. 배포를 유발하는 push는 하지 않았다.
