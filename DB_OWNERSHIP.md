# Firebase Realtime Database 소유권 지도

> **원칙:** 각 DB 경로는 소유 사이트 하나만 쓰기 가능. 다른 사이트는 읽기만.
> **이 문서를 기능 추가 전에 확인하세요.**

---

## 학생/반/출석 도메인 (소유: 학생 앱)

| 경로 | 소유 사이트 | 읽는 사이트 | 쓰는 사이트 | 삭제/변경 시 영향 |
|------|-----------|-----------|-----------|----------------|
| `classes/{year}` | 학생 앱 | 교사·스탭, 행정, 이가드 | 학생 앱 + 통합 앱의 통합관리자 새친구 단건 등록·검증된 되돌리기만 | **전체 영향** — 교사명단, 참가자 동기화, 이가드 반별 뷰. 학생 객체의 `personId?`는 연도별 ID를 잇는 영구 식별자. 반별 선택 하위 `adminChanges/{changeId}`는 학생 앱 관리자 명단 변경 감사기록 |
| `attendance/{year}` | 학생 앱 | 행정 | 학생 앱 + 위 새친구 되돌리기의 해당 `nf_` 학생 출석 삭제만 | 행정 출석 통계 |
| `events/{year}` | 학생 앱 | - | 학생 앱만 | 없음 |
| `userRoles` | 학생 앱 | - | 학생 앱만 | 학생 앱 로그인/권한 |
| `teacherClasses` | 학생 앱 | - | 학생 앱만 | 교사별 반 매핑 |
| `admins` | 학생 앱 | 행정, 이가드 | 학생 앱만 | **플랫폼 통합관리자** 플래그. 출석부 전권까지 포함 |
| `attendanceAdmins` | 학생 앱 | - | 학생 앱만 | **출석부 전용 관리자**(2026-08-06 신설). 플랫폼 노드에는 효력 없음 — 출석부만 맡는 계정은 여기에 넣는다 |
| `teacherStaff/{year}` | 학생 앱 | 행정, 학기 모듈 | 학생 앱만 | 행정 교사 목록 동기화 + 학기 접수의 스탭 명단. 레코드의 `personId?`는 연도별 스탭 ID 연결용 |
| `teacherSpecial/{year}` | 학생 앱 | 행정 | 학생 앱만 | 행정 교사 목록 동기화. 레코드의 `personId?`는 연도별 교사 ID 연결용 |
| `teacherExtra/{year}` | 학생 앱 | 행정 | 학생 앱만 | 행정 교사 목록 동기화. 레코드의 `personId?`는 연도별 교사 ID 연결용 |
| `teacherAdditional/{year}` | 학생 앱 | - | 학생 앱만 | 없음 |
| `teacherPhones/{year}` | 학생 앱 | - | 학생 앱(읽기) | 없음 |
| `suggestions/{year}` | 학생 앱 | - | 학생 앱만 | 없음 |
| `trash/{year}` | 학생 앱 | - | 학생 앱 + 위 새친구 되돌리기의 해당 `nf_` 학생 복구 사본만 | 없음 |

## 교사·스탭 도메인 (2026-08-12 전면 정리 — 남은 것 없음)

> `교사·스탭 출석부` 앱은 사용 중단으로 제거했습니다(복구 태그 `pre-staff-app-removal-2026-08-12`).
>
> **DB 데이터는 원래부터 비어 있었습니다.** 그 앱은 배포된 적이 없어(로컬 개발만) 실제로 저장된 값이
> 한 건도 없었습니다 — `staff_members`·`staff_attendance`·`staff_events`·`staff_roles`·`staff_admins`
> 모두 조회 결과가 `null`이었습니다(2026-08-12 실측, 같은 방법으로 조회한 `classes`·`teacherStaff`는
> 정상적으로 값이 나와 조회 방법 자체는 검증됨).
>
> **Rules에서도 제거했습니다.** 루트에 기본 규칙이 없으므로 이 경로들은 이제 "규칙 없음 = 전면 거부"입니다.
> 되살리려면 앱을 먼저 복원하고 Rules를 다시 추가해야 합니다.
> 계약은 `고등부 학생 출석부/__tests__/rulesContract.test.ts`가 지킵니다(제거 상태 유지 + `teacherStaff` 보존).

⚠ **`teacherStaff/{year}`는 이름이 비슷하지만 전혀 다른 노드입니다** — 학생 앱이 소유하고 통합 앱의
스탭 접수(`IntakeTab`)가 읽습니다. 지우면 안 됩니다.

`classes/{year}/{classKey}/adminChanges/{changeId}`는 새 최상위 노드나 Rules 변경을 피하기 위한 반 내부 선택 하위 노드다. 학생 앱 관리자 화면의 학생 등록·수정·삭제·이동·복원·명단/시트 동기화와 동일한 루트 `update`에 함께 기록하며, 실제 연락처·주소의 이전/이후 값 대신 변경 필드 이름만 저장한다. 기존 소비 앱은 `teacher`와 `students`만 읽어 이 선택 하위 노드를 무시하고, `highschool-app` 주일 사역의 `행정 변동 사항` 탭만 읽기 전용으로 집계한다.

## 수련회 행정 도메인 (소유: highschool-app 행정 모듈)

| 경로 | 소유 사이트 | 읽는 사이트 | 쓰는 사이트 | 삭제/변경 시 영향 |
|------|-----------|-----------|-----------|----------------|
| `retreats` (목록) | 행정 | 이가드 | 행정만 | 이가드 수련회 선택 화면 |
| `retreats/{id}/participants` | 행정 | 이가드 | 행정만 | **이가드 조편성, 방배정, 부분참 전부 영향**. 본인·보호자 연락처 저장 금지 |
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
| `retreatsPrivate/{id}/participantContacts` | 행정 | - | 행정만 | 참가자 키별 본인·보호자 연락처. 공개 명단과 키를 같게 유지 |
| `retreatsPrivate/{id}/participantContactsBackups` | 행정 | - | 행정만 | 연락처 전체 덮어쓰기 전 롤링 백업. 기존 공개 participants 백업은 이관하지 않음 |
| `retreatAdmins` | 행정 | 이가드 | 행정만 | 통합 역할 판정 원천. `{email, name, approvedAt, role}` — `role`은 `pastor`/`leader`/`adminTeam`(없으면 행정팀). 다른 앱은 존재 여부(`!= null`)만 보므로 필드 추가는 호환 |
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
| `prepMilestones` | **공유** | - | 행정+이가드 | 준비 마일스톤 + `sourceSite=ministry-guide*` 사역 가이드 편집 조각. 일반 일정 구독은 가이드 조각을 필터링 (유일한 공유 쓰기 노드) |
| `brainstorm` | 행정 | - | 행정만(admins·retreatAdmins) | 홈 화면 브레인스토밍 보드 (전역, 수련회 무관) |
| `iguardMembers` | 이가드 | - | 이가드만 | 이가드 멤버 인증 |
| `iguardRoles` | 이가드 | 행정(역할 판정) | 이가드만 | `staff`(스탭) / `team`(이가드팀) — Rules validate가 이 두 값만 허용 |
| `iguardPending` | highschool-app 접근 관리 | - | highschool-app | 사용자별 접근 요청 필드 + `siteRequests/{requestId}`. 팀원 승인·거절은 접근 필드만 지우고 사이트 요청을 보존해야 함 |

## 학기 사역 도메인 (소유: highschool-app 학기 모듈)

> 이 도메인을 함께 쓰던 `semester-app`은 2026-08-12 제거했습니다(복구 태그 `pre-semester-app-removal-2026-08-12`).
> 기능은 `highschool-app` 학기 모듈로 통합돼 있었고, **데이터는 그대로 그 모듈이 계속 사용합니다.**

| 경로 | 소유 사이트 | 읽는 사이트 | 쓰는 사이트 | 삭제/변경 시 영향 |
|------|-----------|-----------|-----------|----------------|
| `semesters/{sid}` (meta·teams·trainingClasses·sessions·applications·attendance·completion·curriculum·archiveLinks) | highschool-app 학기 모듈 | - | highschool-app | - |
| `semesters/{sid}/sessions/{sessionId}/endDate` | highschool-app 학기 모듈 | - | highschool-app | 선택 종료일. 없으면 기존 단일 날짜 회차, 있으면 `date`~`endDate` 다일 회차이며 출석은 sessionId 하나로 집계 |
| `semesters/{sid}/trainingClasses/{id}` | highschool-app 학기 모듈 | - | highschool-app | 훈련 반. 삭제 시 `applications/*/trainingClassId`를 같은 루트 update로 함께 비운다(`trainingClass.ts`) |
| `semesters/{sid}/teams/{id}/goal` | highschool-app 학기 모듈 | - | highschool-app | 팀별 이번 학기 목표 (커리큘럼 탭 상단) |
| `semesters/{sid}/applications/{key}/trainingClassId` | highschool-app 학기 모듈 | - | highschool-app | 훈련 반 배정. 값이 없으면 훈련 미신청 — 사역팀 지원은 고3 2학기·스탭만 가능(`intakeRule.ts`). `trainingOnly`는 파생 유지 |
| `semestersPrivate/{sid}/applicationsPrivate` | highschool-app 학기 모듈 | - | highschool-app | 민감정보 — 지원 동기·본인 연락처(`phone`)·보호자 연락처(`parentPhone`) |
| `semesters/{sid}/newFriends` | highschool-app 학기 모듈 | - | highschool-app | 새친구 진행 단계·반배정·출석부 반영 ID. 연락처·심방 메모 저장 금지 |
| `semestersPrivate/{sid}/newFriendsPrivate` | highschool-app 학기 모듈 | - | highschool-app | 새친구 연락처·주소·가족·심방 메모 |
| `semestersPrivate/{sid}/newFriendRosterBackups` | highschool-app 학기 모듈 | - | highschool-app | 출석부 신규 학생 단건 추가 직전 스냅샷과 삭제·등반/배정 취소 직전 학생·출석·새친구 비공개 복구 근거 |
| `semesters/{year}-sunday/newFriends` | highschool-app 주일 사역 | - | highschool-app | 신규 새친구의 학기 비종속 연도별 내부 작업공간. `meta`를 두지 않아 학기 목록에서 제외 |
| `semestersPrivate/{year}-sunday/newFriendsPrivate` | highschool-app 주일 사역 | - | highschool-app | 주일 사역 신규 새친구의 연락처·주소·가족·심방 메모 |

> `highschool-app` 학기 모듈은 `classes/{year}`(현장 접수 반 명단)·`teacherStaff/{year}`(접수 대상 스탭 명단, highschool-app만)·`admins`·`retreatAdmins`(멤버 인증)를 원칙적으로 **읽기만** 한다. 예외는 `highschool-app` 새친구 탭에서 통합관리자가 확인한 신규 학생 1명을 결정적 `nf_` ID로 추가하는 흐름과, 그 흐름으로 연결된 동일 ID·동일 이름 학생만 사전 백업 후 `classes`·해당 `attendance`에서 제거하고 `trash`에 복구 사본을 남기는 되돌리기뿐이다. 되돌리기는 새친구 기록까지 삭제하는 `명단·출석부 삭제`와 새친구 기록은 보존하고 배정 연결만 해제하는 `등반 및 배정 취소`로 제한한다. 범용 기존 학생 수정·이동·삭제와 그 밖의 출석 변경은 계속 학생 앱만 담당한다.
> **2026-08-09 권한 축소**: `teacherStaff`·`teacherSpecial`·`teacherExtra`·`teacherAdditional`·`teacherPhones`·`userRoles`의 `.read`가 `auth != null`이라 역할 없는 구글 계정도 교사 40명의 전화·생년월일과 계정 51건을 읽을 수 있었다. 읽는 주체를 grep으로 증명해 좁혔다 — 교사 명단 계열은 `admins`·`attendanceAdmins`·`retreatAdmins`·`iguardMembers`, 나머지는 관리자만, `userRoles`는 본인 레코드만 자기조회(`auth.token.email` 일치). 새 노드를 만들 때 `.read: "auth != null"`을 기본값처럼 쓰지 말 것.
>
> Rules는 2026-07-10 학생 앱에서 추가·배포 완료.
> **2026-08-08 보강**: `semesters` `.read`에 `iguardMembers`를 추가해 스탭의 학기 조회를 열었다(6단계 역할표의 "스탭=조회만"). `.write`는 `admins`·`retreatAdmins`만 그대로이고, `semestersPrivate`(연락처·지원 동기)는 **읽기까지 행정 전용**이다 — 새 민감 필드는 계속 `semestersPrivate` 아래에만 둘 것.

---

## 꼬임 위험이 높은 경로 (기능 추가 시 반드시 확인)

### 영구 인물 식별자 `personId` (2026-08-11)

- 새 최상위 인물 노드를 만들지 않고 `classes/*/students/*`, `teacherStaff/*`, `teacherSpecial/*`, `teacherExtra/*`, `teacherAdditional/*`와 이 원장을 참조하는 `semesters/*/applications/*`의 기존 레코드에 선택 필드로 둔다.
- 기존 학생·교사·스탭 키와 `pid`, 출석·수련회·학기 참조키는 교체하지 않는다. 기존 앱은 모르는 추가 필드를 무시하므로 하위 호환된다.
- namespace는 `person_student_*`, `person_teacher_*`, `person_staff_*`로 분리한다. 유형이 다르면 같은 실명·연락처라도 같은 ID를 사용하지 않는다.
- 학생은 같은 연도 다른 ID를 항상 분리한다. 다른 연도에서는 정규화 이름·생년월일·같은 부서가 일치하고 `학년 차이 === 연도 차이`인 후보가 각 연도에 한 명뿐일 때만 자동 연결한다. 본인 연락처 변경·누락은 허용하되 보호자 연락처 단독 일치는 사용하지 않는다.
- 교사·스탭은 같은 유형 안에서 이름과 생년 또는 본인 연락처가 일치하는 유일 후보만 과거 `personId`를 재사용한다. 진급·이동·편집·시트 동기화는 기존 값을 보존한다.
- 학기 신청은 신청 이름만으로 연결하지 않고 같은 연도 공식 원장의 `studentId`가 유일하게 일치할 때 해당 학생·스탭 `personId`를 복사한다.

### 1순위: `classes/{year}`
- 학생 앱이 소유하지만 **3개 앱이 읽음**
- 구조(필드명, 학생 key 형식) 변경 시 교사·스탭, 행정, 이가드 전부 영향
- 행정 앱의 `fetchClassesForYear()`와 이가드의 `fetchClasses()` 가 이 구조에 의존

### 2순위: `retreats/{id}/participants`
- 행정이 소유, 이가드가 읽음
- 조편성(`groups`), 방배정(`rooms`), 부분참(`partialAttendances`) 참조가 participant key에 의존
- 연락처는 같은 키의 `retreatsPrivate/{id}/participantContacts/{participantKey}`에 두고, 공개 참가자에는 저장하지 않는다. 관리자 화면은 과도기 동안 공개 레거시 값을 읽되 비공개 값을 우선한다.
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
