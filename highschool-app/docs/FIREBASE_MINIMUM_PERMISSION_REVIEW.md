# Firebase 최소 권한 검토 기록

검토일: 2026-08-22

## 결론

클라이언트의 `accessPolicy.ts`는 역할을 세밀하게 구분하지만, 현재 Realtime Database Rules는 일부 경로에서 `retreatAdmins` 또는 `iguardMembers` 소속 여부만 확인합니다. 따라서 화면에서 버튼을 숨기는 것과 서버가 쓰기를 거부하는 것이 완전히 같은 수준은 아닙니다.

이 저장소의 운영 계약에 따라 Rules 원본과 배포 권한은 `고등부 학생 출석부/database.rules.json`에만 있습니다. 이번 고등부 통합사이트 배포에서는 Rules를 수정하거나 배포하지 않습니다.

## 서버에서 더 좁혀야 할 경로

| 경로 | 현재 서버 판정 | 목표 판정 |
|---|---|---|
| `retreats/{id}` 일반 쓰기 | 모든 `retreatAdmins` | `retreatRole`이 `superAdmin`, `pastor`, `adminTeam`인 계정만 허용하고 `leader`는 읽기 전용 |
| `retreatsPrivate/{id}` 읽기·쓰기 | 모든 `retreatAdmins` | 민감정보 권한이 있는 `superAdmin`, `pastor`, `adminTeam`만 허용 |
| `retreats/{id}/iguard` 일반 쓰기 | `retreatAdmins` 전체 또는 팀 스탭이 아닌 `iguardMembers` | 기획 영역과 실행 영역을 나누고 `fieldStaff`는 실행 데이터만 허용 |
| `prepMilestones` 쓰기 | 역할 버킷과 `sundayWrite` 혼합 | 학기 역할·주일 팀 권한을 명시적으로 검사 |

## 다음 Rules 작업의 필수 절차

1. 운영 DB 스냅샷을 만든다.
2. 학생 출석부 저장소의 Rules 계약 테스트에 역할별 허용·거부 행렬을 먼저 추가한다.
3. Firebase Emulator에서 통합관리자, 교역자, 팀장, 행정팀, 이가드팀, 현장 스탭의 읽기·쓰기를 각각 검증한다.
4. 통합사이트의 `accessPolicy.test.ts` 결과와 Rules 테스트 행렬을 비교한다.
5. 사용자 승인 후 학생 출석부 저장소에서만 Rules를 배포한다.

## 이번 배포에서 적용한 방어선

- 화면 접근과 편집 판정은 계속 `accessPolicy.ts` 단일 원천을 사용합니다.
- 수련회 행정 읽기 전용 역할은 `RetreatEditProvider`를 통해 입력·저장 UI가 잠깁니다.
- 민감 탭은 `canSeeSensitiveRetreat` 판정이 없으면 렌더링하지 않습니다.
- 로그인 E2E smoke가 주요 진입 경로, 가로 넘침, 마이페이지 오버레이의 스크롤 복구를 확인할 수 있게 구성되었습니다.
