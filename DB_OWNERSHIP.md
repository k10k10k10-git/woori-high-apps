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
| `admins` | 학생 앱 | 행정, 이가드 | 학생 앱만 | 전체 관리자 인증에 영향 |
| `teacherStaff/{year}` | 학생 앱 | 행정 | 학생 앱만 | 행정 교사 목록 동기화 |
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

## 수련회 행정 도메인 (소유: 행정 앱)

| 경로 | 소유 사이트 | 읽는 사이트 | 쓰는 사이트 | 삭제/변경 시 영향 |
|------|-----------|-----------|-----------|----------------|
| `retreats` (목록) | 행정 | 이가드 | 행정만 | 이가드 수련회 선택 화면 |
| `retreats/{id}/participants` | 행정 | 이가드 | 행정만 | **이가드 조편성, 방배정, 부분참 전부 영향** |
| `retreats/{id}/teachers` | 행정 | 이가드 | 행정만 | **이가드 스탭 명단, 조스탭, 동선 매트릭스 영향** |
| `retreats/{id}/groups` | 행정 | 이가드 | 행정만 | 이가드 조별 뷰 |
| `retreats/{id}/rooms` | 행정 | 이가드 | 행정만 | 이가드 숙소 뷰 |
| `retreats/{id}/carpools` | 행정 | - | 행정만 | 없음 |
| `retreats/{id}/supplies` | 행정 | - | 행정만 | 없음 |
| `retreats/{id}/snacks` | 행정 | - | 행정만 | 없음 |
| `retreats/{id}/cellColors` | 행정 | 이가드 | 행정만 | 이가드 셀 색상 표시 |
| `retreats/{id}/partialAttendances` | 행정 | 이가드 | 행정만 | 이가드 부분참 표시 |
| `retreats/{id}/onSiteReg` | 행정 | - | 행정만 | 없음 |
| `retreats/{id}/participantsBackups` | 행정 | - | 행정만 | 없음 |
| `retreats/{id}/syncMeta` | 행정 | - | 행정만 | 없음 |
| `retreats/{id}/periods` | 행정 | 이가드 | 행정만 | 이가드 홈 기간 표시·수련회 정렬 |
| `retreats/{id}/mealCount` | 행정 | - | 행정만 | 없음 (식수 계산) |
| `retreats/{id}/tshirtOrders` | 행정 | - | 행정만 | 없음 (단체티 신청) |
| `retreats/{id}/groupsBackups` | 행정 | - | 행정만 | 없음 (groups 전체 덮어쓰기 직전 롤링 백업) |
| `retreats/{id}/roomsBackups` | 행정 | - | 행정만 | 없음 (rooms 전체 덮어쓰기 직전 롤링 백업) |
| `retreatsPrivate/{id}/cancellations` | 행정 | - | 행정만 | 없음 (민감정보) |
| `retreatsPrivate/{id}/unmatchedPayments` | 행정 | - | 행정만 | 없음 (민감정보) |
| `retreatsPrivate/{id}/medicalLogs` | 행정 | - | 행정만 | 없음 (민감정보) |
| `retreatsPrivate/{id}/teacherIdNumbers` | 행정 | - | 행정만 | 없음 (민감정보 — 주민번호) |
| `retreatAdmins` | 행정 | 이가드 | 행정만 | 이가드 관리자 인증 |
| `retreatPending` | 행정 | - | 행정만 | 없음 |

## 이가드 도메인 (소유: 이가드 앱)

| 경로 | 소유 사이트 | 읽는 사이트 | 쓰는 사이트 | 삭제/변경 시 영향 |
|------|-----------|-----------|-----------|----------------|
| `retreats/{id}/iguard/schedule` | 이가드 | - | 이가드만 | 없음 |
| `retreats/{id}/iguard/posts` | 이가드 | - | 이가드만 | 없음 |
| `retreats/{id}/iguard/movements` | 이가드 | - | 이가드만 | 없음 |
| `retreats/{id}/iguard/buses` | 이가드 | - | 이가드만 | 없음 |
| `retreats/{id}/iguard/attendance` | 이가드 | - | 이가드만 | 없음 |
| `retreats/{id}/iguard/seating` | 이가드 | - | 이가드만 | 없음 |
| `retreats/{id}/iguard/meals` | 이가드 | - | 이가드만 | 없음 |
| `retreats/{id}/iguard/groupStaff` | 이가드 | **행정** | 이가드만 | **행정 GroupsTab 조스탭 표시** |
| `retreats/{id}/iguard/cueSheet` | 이가드 | - | 이가드만 | 없음 |
| `retreats/{id}/iguard/guide` | 이가드 | - | 이가드만 | 없음 |
| `retreats/{id}/milestones` | (레거시) | - | 없음 | **미사용** — 전역 `prepMilestones`로 이관됨(코드에 쓰기 함수 없음) |
| `prepMilestones` | **공유** | - | 행정+이가드 | 준비 마일스톤 (유일한 공유 쓰기 노드) |
| `brainstorm` | 행정 | - | 행정만(admins·retreatAdmins) | 홈 화면 브레인스토밍 보드 (전역, 수련회 무관) |
| `iguardMembers` | 이가드 | - | 이가드만 | 이가드 멤버 인증 |
| `iguardRoles` | 이가드 | - | 이가드만 | 이가드 권한 분류 |
| `iguardPending` | 이가드 | - | 이가드만 | 없음 |

## 학기 사역 도메인 (소유: semester-app)

| 경로 | 소유 사이트 | 읽는 사이트 | 쓰는 사이트 | 삭제/변경 시 영향 |
|------|-----------|-----------|-----------|----------------|
| `semesters/{sid}` (meta·teams·sessions·applications·attendance·completion·curriculum·archiveLinks) | semester-app | - | semester-app만 | 없음 (독립) |
| `semestersPrivate/{sid}/applicationsPrivate` | semester-app | - | semester-app만 | 없음 (민감정보 — 지원 동기·연락처) |

> semester-app은 `classes/{year}`(현장 접수 반 명단)·`admins`·`retreatAdmins`(멤버 인증)를 **읽기만** 한다.
> Rules는 2026-07-10 학생 앱에서 추가·배포 완료 (admins·retreatAdmins만 접근).

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
| 학생 앱/database.rules.json | **완전한 규칙** | 모든 경로 포함, 역할 기반 제한 |
| 행정 앱/database.rules.json | **학생 앱과 동일** | 같은 내용 |
| 교사·스탭 앱 | **없음** | firebase.json 자체가 없음 |
| 이가드 앱/database.rules.json | **느슨한 규칙** | `retreats` 전체 `auth != null` 읽기, `staff_*` 규칙 없음 |

> **경고:** 이가드 rules가 배포되면 `retreats` 읽기 보호와 `staff_*` 쓰기 보호가 사라집니다.
> 배포용 rules는 학생 앱(또는 행정 앱) 파일을 단일 원천으로 사용해야 합니다.

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
