# Firebase Realtime Database 소유권 지도

> **원칙:** 각 DB 경로는 소유 사이트 하나만 쓰기 가능. 다른 사이트는 읽기만.
> **이 문서를 기능 추가 전에 확인하세요.**

---

## 학생/반/출석 도메인 (소유: 학생 앱)

| 경로 | 소유 사이트 | 읽는 사이트 | 쓰는 사이트 | 삭제/변경 시 영향 |
|------|-----------|-----------|-----------|----------------|
| `classes/{year}` | 학생 앱 | 교사·스탭, 행정, 이가드 | 학생 앱만 | **전체 영향** — 교사명단, 참가자 동기화, 이가드 반별 뷰 |
| `attendance/{year}` | 학생 앱 | 행정 | 학생 앱만 | 행정 출석 통계 |
| `events/{year}` | 학생 앱 | - | 학생 앱만 | 없음 |
| `userRoles` | 학생 앱 | - | 학생 앱만 | 학생 앱 로그인/권한 |
| `teacherClasses` | 학생 앱 | - | 학생 앱만 | 교사별 반 매핑 |
| `admins` | 학생 앱 | 행정, 이가드 | 학생 앱만 | **플랫폼 통합관리자** 플래그. 출석부 전권까지 포함 |
| `attendanceAdmins` | 학생 앱 | - | 학생 앱만 | **출석부 전용 관리자**(2026-08-06 신설). 플랫폼 노드에는 효력 없음 — 출석부만 맡는 계정은 여기에 넣는다 |
| `teacherStaff/{year}` | 학생 앱 | 행정, 학기 모듈 | 학생 앱만 | 행정 교사 목록 동기화 + 학기 접수의 스탭 명단 |
| `teacherSpecial/{year}` | 학생 앱 | 행정 | 학생 앱만 | 행정 교사 목록 동기화 |
| `teacherExtra/{year}` | 학생 앱 | 행정 | 학생 앱만 | 행정 교사 목록 동기화 |
| `teacherAdditional/{year}` | 학생 앱 | - | 학생 앱만 | 없음 |
| `teacherPhones/{year}` | 학생 앱 | - | 학생 앱(읽기) | 없음 |
| `suggestions/{year}` | 학생 앱 | - | 학생 앱만 | 없음 |
| `trash/{year}` | 학생 앱 | - | 학생 앱만 | 없음 |

## 교사·스탭 도메인 (소유: 교사·스탭 앱)

| 경로 | 소유 사이트 | 읽는 사이트 | 쓰는 사이트 | 삭제/변경 시 영향 |
|------|-----------|-----------|-----------|----------------|
| `staff_members/{year}` | 교사·스탭 | - | 교사·스탭만 | 없음 (독립) |
| `staff_attendance/{year}` | 교사·스탭 | - | 교사·스탭만 | 없음 (독립) |
| `staff_events/{year}` | 교사·스탭 | - | 교사·스탭만 | 없음 (독립) |
| `staff_roles` | 교사·스탭 | - | 교사·스탭만 | 없음 (독립) |
| `staff_admins` | 교사·스탭 | - | 교사·스탭만 | 없음 (독립) |

> 교사·스탭 앱은 `classes/{year}`를 **읽기만** 해서 교사 명단을 구성합니다.

## 수련회 행정 도메인 (소유: highschool-app 행정 모듈)

| 경로 | 소유 사이트 | 읽는 사이트 | 쓰는 사이트 | 삭제/변경 시 영향 |
|------|-----------|-----------|-----------|----------------|
| `retreats` (목록) | 행정 | 이가드 | 행정만 | 이가드 수련회 선택 화면 |
| `retreats/{id}/participants` | 행정 | 이가드 | 행정만 | **이가드 조편성, 방배정, 부분참 전부 영향** |
| `retreats/{id}/teachers` | 행정 | 이가드 | 행정만 | **이가드 스탭 명단, 조스탭, 동선·버스 성별 배정 영향** (`gender?: 남\|여`는 행정이 관리) |
| `retreats/{id}/groups` | 행정 | 이가드 | 행정만 | 이가드 조별 뷰 |
| `retreats/{id}/autoAssignConfig` | 행정 | - | 행정만 | 없음 (자동 조편성 입력 설정, groups 결과와 분리) |
| `retreats/{id}/rooms` | 행정 | 이가드 | 행정만 | 이가드 숙소 뷰 |
| `retreats/{id}/roomAutoAssignConfig` | 행정 | - | 행정만 | 없음 (자동 방배정 입력 설정, rooms 결과와 분리) |
| `retreats/{id}/carpools` | 행정 | - | 행정만 | 없음 |
| `retreats/{id}/supplies` | 행정 | - | 행정만 | 없음 |
| `retreats/{id}/snacks` | 행정 | - | 행정만 | 없음 |
| `retreats/{id}/cellColors` | 행정 | 이가드 | 행정만 | 이가드 셀 색상·취소 제외 (`red`는 private 취소명단의 공개 학생키 마커) |
| `retreats/{id}/partialAttendances` | 행정 | 이가드 | 행정만 | 이가드 부분참 표시. type ∈ 선복귀/후발대/**당일참석**(+day 1~3, 2026-07-18 Rules 확장) |
| `retreats/{id}/onSiteReg` | 행정 | - | 행정만 | 없음 |
| `retreats/{id}/participantsBackups` | 행정 | - | 행정만 | 없음 |
| `retreats/{id}/syncMeta` | 행정 | - | 행정만 | 없음 |
| `retreats/{id}/periods` | 행정 | 이가드 | 행정만 | 이가드 홈 기간 표시·수련회 정렬 |
| `retreats/{id}/mealCount` | 행정 | - | 행정만 | 없음 (식수 계산) |
| `retreats/{id}/tshirtOrders` | 행정 | - | 행정만 | 없음 (단체티 신청) |
| `retreats/{id}/groupsBackups` | 행정 | - | 행정만 | 없음 (groups 전체 덮어쓰기 직전 롤링 백업) |
| `retreats/{id}/roomsBackups` | 행정 | - | 행정만 | 없음 (rooms 전체 덮어쓰기 직전 롤링 백업) |
| `retreatsPrivate/{id}/cancellations` | 행정 | - | 행정만 | 민감 취소정보; 학생키만 `cellColors/{studentKey}=red`로 원자 동기화 |
| `retreatsPrivate/{id}/unmatchedPayments` | 행정 | - | 행정만 | 없음 (민감정보) |
| `retreatsPrivate/{id}/medicalLogs` | 행정 | - | 행정만 | 없음 (민감정보) |
| `retreatsPrivate/{id}/teacherIdNumbers` | 행정 | - | 행정만 | 없음 (민감정보 — 주민번호) |
| `retreatAdmins` | 행정 | 이가드, semester-app | 행정만 | 통합 역할 판정 원천. `{email, name, approvedAt, role}` — `role`은 `pastor`/`leader`/`adminTeam`(없으면 행정팀). 다른 앱은 존재 여부(`!= null`)만 보므로 필드 추가는 호환 |
| `retreatPending` | 행정 | - | 행정만 | 없음 |

## 이가드 도메인 (소유: highschool-app 현장 모듈)

| 경로 | 소유 사이트 | 읽는 사이트 | 쓰는 사이트 | 삭제/변경 시 영향 |
|------|-----------|-----------|-----------|----------------|
| `retreats/{id}/iguard/schedule` | 이가드 | - | 이가드만 | 없음 |
| `retreats/{id}/iguard/segments` | 이가드 | - | 이가드만 | 시간 블록 안의 동선 구간 — `movements.segmentId`가 참조 |
| `retreats/{id}/iguard/posts` | 이가드 | - | 이가드만 | 없음 |
| `retreats/{id}/iguard/movements` | 이가드 | - | 이가드만 | 구간·포스트·스탭(또는 미정 슬롯) 배정. 구버전 `staffId__blockId` 키는 2027 겨울까지 읽기 호환 |
| `retreats/{id}/iguard/buses` | 이가드 | - | 이가드만 | 버스 배정 — 기존 혼합은 `groupIds`, 남녀 분리는 `assignmentMode=gender`+`segments[{groupId,gender,teacherNames}]`; `includeTeachers`는 구버전 읽기 전용 |
| `retreats/{id}/iguard/attendance` | 이가드 | - | 이가드만 | 없음 |
| `retreats/{id}/iguard/seating` | 이가드 | - | 이가드만 | 없음 |
| `retreats/{id}/iguard/meals` | 이가드 | - | 이가드만 | 없음 |
| `retreats/{id}/iguard/gbs` | 이가드 | - | 이가드만 | 조별 GBS 장소의 단일 쓰기 원천. 장소→조 목록은 화면에서 파생하고 행정 `groups.gbs`는 읽기 폴백만 사용 |
| `retreats/{id}/iguard/groupStaff` | 이가드 | **행정** | 이가드만 | **행정 GroupsTab 조스탭 표시** |
| `retreats/{id}/iguard/cueSheet` | 이가드 | - | 이가드만 | 없음 |
| `retreats/{id}/iguard/guide` | 이가드 | - | 이가드만 | 없음 |
| `retreats/{id}/iguard/accessLock` | 이가드 | - | 이가드만(admin UI) | 수련회별 PIN 진입 장벽 — 삭제 시 승인 팀원 모두 즉시 입장 |
| `retreats/{id}/milestones` | (레거시) | - | 없음 | **미사용** — 전역 `prepMilestones`로 이관됨(코드에 쓰기 함수 없음) |
| `prepMilestones` | **공유** | - | 행정+이가드 | 준비 마일스톤 (유일한 공유 쓰기 노드) |
| `brainstorm` | 행정 | - | 행정만(admins·retreatAdmins) | 홈 화면 브레인스토밍 보드 (전역, 수련회 무관) |
| `iguardMembers` | 이가드 | - | 이가드만 | 이가드 멤버 인증 |
| `iguardRoles` | 이가드 | 행정(역할 판정) | 이가드만 | `staff`(스탭) / `team`(이가드팀) — Rules validate가 이 두 값만 허용 |
| `iguardPending` | 이가드 | - | 이가드만 | 없음 |

## 학기 사역 도메인 (소유: highschool-app 학기 모듈, semester-app 호환 유지)

| 경로 | 소유 사이트 | 읽는 사이트 | 쓰는 사이트 | 삭제/변경 시 영향 |
|------|-----------|-----------|-----------|----------------|
| `semesters/{sid}` (meta·teams·trainingClasses·sessions·applications·attendance·completion·curriculum·archiveLinks) | highschool-app 학기 모듈 | semester-app | highschool-app·semester-app | 두 화면의 호환 계약 |
| `semesters/{sid}/trainingClasses/{id}` | highschool-app 학기 모듈 | - | highschool-app | 훈련 반. 삭제 시 `applications/*/trainingClassId`를 같은 루트 update로 함께 비운다(`trainingClass.ts`) |
| `semesters/{sid}/teams/{id}/goal` | highschool-app 학기 모듈 | - | highschool-app | 팀별 이번 학기 목표 (커리큘럼 탭 상단) |
| `semesters/{sid}/applications/{key}/trainingClassId` | highschool-app 학기 모듈 | - | highschool-app | 훈련 반 배정. 값이 없으면 훈련 미신청 — 사역팀 지원은 고3 2학기·스탭만 가능(`intakeRule.ts`). `trainingOnly`는 파생 유지 |
| `semestersPrivate/{sid}/applicationsPrivate` | highschool-app 학기 모듈 | semester-app | highschool-app·semester-app | 민감정보 — 지원 동기·본인 연락처(`phone`)·보호자 연락처(`parentPhone`) |

> `highschool-app` 학기 모듈과 호환용 `semester-app`은 `classes/{year}`(현장 접수 반 명단)·`teacherStaff/{year}`(접수 대상 스탭 명단, highschool-app만)·`admins`·`retreatAdmins`(멤버 인증)를 **읽기만** 한다.
> Rules는 2026-07-10 학생 앱에서 추가·배포 완료.
> **2026-08-08 보강**: `semesters` `.read`에 `iguardMembers`를 추가해 스탭의 학기 조회를 열었다(6단계 역할표의 "스탭=조회만"). `.write`는 `admins`·`retreatAdmins`만 그대로이고, `semestersPrivate`(연락처·지원 동기)는 **읽기까지 행정 전용**이다 — 새 민감 필드는 계속 `semestersPrivate` 아래에만 둘 것.

---

## 꼬임 위험이 높은 경로 (기능 추가 시 반드시 확인)

### 1순위: `classes/{year}`
- 학생 앱이 소유하지만 **3개 앱이 읽음**
- 구조(필드명, 학생 key 형식) 변경 시 교사·스탭, 행정, 이가드 전부 영향
- 행정 앱의 `fetchClassesForYear()`와 이가드의 `fetchClasses()` 가 이 구조에 의존

### 2순위: `retreats/{id}/participants`
- 행정이 소유, 이가드가 읽음
- 조편성(`groups`), 방배정(`rooms`), 부분참(`partialAttendances`) 참조가 participant key에 의존
- participant key 형식이 바뀌면 이가드 전체 뷰가 깨질 수 있음

### 3순위: `retreats/{id}/teachers`
- 행정이 소유, 이가드가 읽어서 스탭 명단/동선 매트릭스 구성
- teacher 데이터 shape 변경 시 이가드 `staffForViews` 변환 로직 확인 필요

### 역방향 의존: `retreats/{id}/iguard/groupStaff`
- 이가드가 소유하지만 행정이 읽음 (GroupsTab에서 조스탭 표시)
- 이가드에서 이 구조를 바꾸면 행정 화면이 깨질 수 있음

---

## Firebase Rules 현황

| 파일 위치 | 상태 | 비고 |
|----------|------|------|
| 학생 앱/database.rules.json | **유일한 배포 원천** | 모든 경로 포함, 역할 기반 제한 |
| 교사·스탭 앱 | **없음** | firebase.json 자체가 없음 |
| highschool-app | **배포 금지** | 학생 앱 규칙을 소비하며 자체 Rules 원천이 없음 |

> 배포용 Rules의 단일 원천은 학생 앱 `database.rules.json`입니다. 통합 플랫폼에서는 Rules를 배포하지 않습니다.

---

## 기능 추가 전 체크리스트

1. 이 기능의 데이터 소유 사이트는 어디인가?
2. 저장 경로는 어디인가? (위 표에서 확인)
3. 읽는 사이트는 어디인가?
4. 쓰는 사이트는 어디인가?
5. 기존 데이터와 연결되는 key/ID는 무엇인가?
6. 삭제 시 같이 정리해야 할 데이터는 무엇인가?
7. 민감정보인가? (`retreatsPrivate` 하위여야 하는가?)
8. 이가드/행정/학생 앱 중 깨질 수 있는 화면은 어디인가?
