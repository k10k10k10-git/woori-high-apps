# 찬양팀 순수 로직 이식 출처

- 원본 저장소: https://github.com/andew423-source/high-school-worship-team
- 기준 커밋: `982dc53ab3ee6d1261736167e5a000deec07974b`
- 원본 경로: `worship-admin-v2/src/domain/`, `worship-admin-v2/src/lib/stage-history.ts`, `worship-admin-v2/src/lib/stage-schema.ts` 및 대응 `tests/*.test.ts`
- 사용자가 지정한 저장소의 기능을 통합하는 요청에 따라 이식했다. 이 고지는 원본 코드의 저작권·이용허락을 새로 부여하지 않는다. 원본 커밋에서 별도 LICENSE 파일은 확인되지 않았다.

## 보존한 업무 동작

`grouping.ts`의 조건 검사·최대 5,000회 탐색, `stage.ts`의 학생 우선 배정·등단 이력·목표 인원·스탭 지원·역할/좌우 배치·명시 제외·스탭 전용 모드, `stage-records.ts`의 최신 확정본 및 기록 표시를 보존했다. 원본 회귀 테스트를 Vitest로 연결했고 합성 인물로 치환했다. `generateStageService`의 `usedStaffIds` 집합은 원본처럼 이번 호출에서 배정한 스탭 ID를 추가하므로 1·2부 순차 계산에 공유한다.

## 통합하면서 바꾼 부분

- `attendance.ts`: 새 입력은 `PRESENT`·`ABSENT`. 원본 `LATE`는 이관 타입과 명시 지각 인정 정책에서만 처리한다. 미입력을 출석·결석으로 추정하지 않는다.
- `terms.ts`: 날짜를 UTC 달력 값으로 계산해 서버의 시스템 시간대에 따라 토요일이 하루 밀리는 원본 문제를 보강했다. 실제 존재하지 않는 날짜는 거부한다.
- `imports.ts`: Zod 없이 `safeParse`·`parse` 형식의 순수 검증기로 옮겼다. 특정 실명에 따른 스탭 예외는 제거하고 외부 ID에 연결된 `staffDefaultsForRow` 또는 명시 기본 설정을 사용한다. 역할 문자열의 싱어·세션 판정과 파일 열 매핑은 유지한다. 잘못된 학년 부분 일치를 거부한다.
- `stage-schema.ts`: UUID 전용 학생 ID 검사를 Firebase의 안전한 레코드 키 검사로 바꿨다. 강제 등단/이동/제외와 포지션 검증은 유지한다.
- `stage-history.ts`: Supabase 조회를 제거하고 전달받은 스냅샷으로 집계하는 `buildStageHistory`를 제공한다. 명시적인 초안은 최신 확정 이력에 포함하지 않는다.

Supabase 인증·SQL·네트워크·Storage 코드는 이 폴더에 옮기지 않았다. `stage-export.ts`는 DOM 의존 화면 기능이므로 이 순수 도메인 이식 범위에서 제외했다. 데이터 저장·권한·확정 트랜잭션·이관·내보내기 연결은 별도 통합 계층의 책임이다.
