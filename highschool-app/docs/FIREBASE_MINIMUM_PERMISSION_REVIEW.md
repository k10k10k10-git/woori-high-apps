# Firebase 최소 권한 검토 기록

최종 갱신: 2026-09-15

## 결론

`retreatsPrivate/{id}`의 읽기·쓰기는 Realtime Database Rules에서도 민감정보 권한이 있는 통합관리자, 교역자, 행정팀으로 제한했습니다. 스탭팀장과 이가드 계정은 UI와 서버에서 모두 거부됩니다. 실제 Firebase Emulator로 허용·거부 역할을 검증합니다.

Rules 원본과 배포 위치는 계속 `attendance-app/database.rules.json` 하나입니다.

## 서버에서 더 좁혀야 할 경로

| 경로 | 현재 서버 판정 | 목표 판정 |
|---|---|---|
| `retreats/{id}` 일반 쓰기 | 모든 `retreatAdmins` | `retreatRole`이 `superAdmin`, `pastor`, `adminTeam`인 계정만 허용하고 `leader`는 읽기 전용 |
| `retreats/{id}/iguard` 일반 쓰기 | `retreatAdmins` 전체 또는 팀 스탭이 아닌 `iguardMembers` | 기획 영역과 실행 영역을 나누고 `fieldStaff`는 실행 데이터만 허용 |
| `prepMilestones` 쓰기 | 역할 버킷과 `sundayWrite` 혼합 | 학기 역할·주일 팀 권한을 명시적으로 검사 |

## 적용한 검증 절차

1. 학생 출석부 저장소의 Rules 계약 테스트에 역할별 허용·거부 행렬을 추가합니다.
2. Firebase Emulator에서 통합관리자, 교역자, 행정팀, 팀장, 이가드팀, 미승인 사용자의 읽기·쓰기를 각각 검증합니다.
3. 통합사이트의 `accessPolicy.test.ts` 결과와 Rules 테스트 행렬을 비교합니다.
4. 전체 검증이 통과한 병합본만 학생 출석부 저장소에서 Rules로 배포합니다.

## 적용된 방어선

- 화면 접근과 편집 판정은 계속 `accessPolicy.ts` 단일 원천을 사용합니다.
- 수련회 행정 읽기 전용 역할은 `RetreatEditProvider`를 통해 입력·저장 UI가 잠깁니다.
- 민감 탭은 `canSeeSensitiveRetreat` 판정이 없으면 렌더링하지 않습니다.
- `retreatsPrivate/*`는 Rules가 `retreatRole`과 하위호환 `role`을 검사하며, `leader`와 이가드 계정의 직접 요청도 거부합니다.
- 로그인 E2E smoke가 주요 진입 경로, 가로 넘침, 마이페이지 오버레이의 스크롤 복구를 확인할 수 있게 구성되었습니다.
