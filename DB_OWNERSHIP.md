# Firebase Realtime Database 소유권 지도

> **원칙:** 각 DB 경로는 소유 사이트 하나만 쓰기 가능. 다른 사이트는 읽기만.
> **이 문서를 기능 추가 전에 확인하세요.**

---

## 통합 사이트 활동 로그 (2026-09-06)

| 경로 | 소유 사이트 | 읽는 사이트 | 쓰는 사이트 | 삭제/변경 시 영향 |
|------|-----------|-----------|-----------|----------------|
| `activityLogs/events/{eventId}` | 통합 앱 | 통합관리자 마이페이지 | 최신 통합 앱의 업무 저장 도우미가 새 기록만 추가 | 기존 원장 구조를 바꾸지 않는 별도 이력. 원천 Rules는 인증 UID·토큰 이름·서버 시각·추가 전용을 검증하고 통합관리자만 읽도록 제한한다. 2026-09-06 사용자 승인 후 Rules·통합 앱 운영 반영 완료 |

일반 set/update/remove는 원장 변경과 로그 한 건을 같은 루트 update로 저장한다. 기존 트랜잭션 두 곳은 원장 확정 후 로그를 별도로 추가하며, 그 사이 종료·통신 실패에는 이력이 빠질 수 있다. 구버전 앱·콘솔·직접 DB 수정은 추적하지 않는다. 작성 계정과 저장 요청을 확인하는 앱 로그이며 모든 DB 변경을 독립적으로 증명하는 감사 원장은 아니다. [활성화·검증 계획](docs/ACTIVITY_LOG_2026-09-06.md)을 따른다.

## 학생/반/출석 도메인 (소유: 학생 앱)

| 경로 | 소유 사이트 | 읽는 사이트 | 쓰는 사이트 | 삭제/변경 시 영향 |
|------|-----------|-----------|-----------|----------------|
| `classes/{year}` | 학생 앱 | 학생 앱, 통합 앱의 학기·주일·수련회·현장 모듈 | 학생 앱 + 통합 앱에서 `canWriteStudentRoster`가 허용한 새친구 단건 등록·검증된 되돌리기만 | **전체 영향** — 교사명단, 참가자 동기화, 이가드 반별 뷰. 학생 객체의 `personId?`는 연도별 ID를 잇는 영구 식별자. 반별 선택 하위 `adminChanges/{changeId}`는 학생 앱 관리자 명단 변경 감사기록 |
| `attendance/{year}` | 학생 앱 | 학생 앱, 통합 앱의 학기·주일·수련회 모듈 | 학생 앱 + 위 새친구 되돌리기의 해당 `nf_` 학생 출석 삭제만 | 값은 `O`(출석)·`X`(결석). 이전 `T`는 두 앱에서 `O`로 호환 처리. 행정 출석 통계 |
| `events/{year}` | 학생 앱 | 통합 앱 주일 출석 화면 | 학생 앱만 | 주일 출석 날짜·라벨 |
| `userRoles` | 학생 앱 | 학생 앱 자기조회 | 학생 앱 관리자만 | 학생 앱 로그인과 교사 본인 반 권한의 원천. 이메일 키·저장 이메일·Auth 토큰 이메일 일치를 유지 |
| `teacherClasses` | 학생 앱 | 학생 앱 관리자만 | 학생 앱 관리자만 | 레거시 교사별 반 매핑. 2026-09-05부터 로그인·Rules 권한 판정에 사용하지 않으며 자기 쓰기 금지 |
| `admins` | 학생 앱 | 통합 앱 인증·역할 판정 | 학생 앱만 | **플랫폼 통합관리자** 플래그. 출석부 전권까지 포함 |
| `attendanceAdmins` | 학생 앱 | - | 학생 앱만 | **출석부 전용 관리자**(2026-08-06 신설). 플랫폼 노드에는 효력 없음 — 출석부만 맡는 계정은 여기에 넣는다 |
| `teacherStaff/{year}` | 학생 앱 | 통합 앱 수련회·학기·통합검색 | 학생 앱만 | 수련회 교사 목록 동기화 + 학기 접수의 스탭 명단. 레코드의 `personId?`는 연도별 스탭 ID 연결용 |
| `teacherSpecial/{year}` | 학생 앱 | 통합 앱 수련회·통합검색 | 학생 앱만 | 수련회 교사 목록 동기화. 레코드의 `personId?`는 연도별 교사 ID 연결용 |
| `teacherExtra/{year}` | 학생 앱 | 통합 앱 수련회·통합검색 | 학생 앱만 | 수련회 교사 목록 동기화. 레코드의 `personId?`는 연도별 교사 ID 연결용 |
| `teacherAdditional/{year}` | 학생 앱 | 통합 앱 통합검색(허용 권한만) | 학생 앱만 | 추가 교사 검색 |
| `teacherPhones/{year}` | 학생 앱 | - | 학생 앱(읽기) | 없음 |
| `suggestions/{year}` | 학생 앱 | - | 학생 앱만 | 없음 |
| `trash/{year}` | 학생 앱 | 학생 앱 + 통합 앱의 위 새친구 되돌리기 검증만 | 학생 앱 + 위 새친구 되돌리기의 해당 `nf_` 학생 복구 사본만 | 학생·반 복원과 새친구 되돌리기 검증 |
| `config/sheetSync` | 학생 앱 | 학생 앱 관리자만 | 학생 앱 관리자만 | 구글 시트 주소 설정 |
| `config/pastoralReport/blockedDemoUid` | 운영 권한 설정 | 공유 Rules | 통합 전권 관리자 또는 승인된 운영 절차만 | 공용 데모 UID 제외. 값이 없으면 출석부 관리자의 새친구 추가 읽기도 닫힘. 데모 계정 교체 시 배포 전에 갱신 |
| `config/studentMoveLocks/{year}` | 학생 앱 | 학생 앱 관리자만 | 학생 앱 관리자만 | 수동 반 이동 중 원본·목적지 반 명단·출석 쓰기 차단. 작업별 양쪽 leaf를 함께 관리 |
| `config/studentMoveCommits/{year}` | 학생 앱 | 학생 앱 관리자만 | 학생 앱 관리자 이동 PATCH만 | 지연된 이전 PATCH 재실행을 거부하는 불변 표식. 자동 삭제하지 않음 |

2026-09-08 학생 앱의 학생·반 삭제는 기존 `trash` 사본 형태를 유지하고 명단만 조건부 제거한다. `attendance`는 보관해 같은 ID 복원 시 다시 연결하며, 사본 영구 삭제로 출석을 자동 삭제하지 않는다. 이미 지워진 과거 출석과 통합 앱 새친구 되돌리기의 기존 삭제 의미는 이번 변경으로 바뀌지 않는다. 공유 경로·필드 형태 변경 없음.

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
> 계약은 `attendance-app/__tests__/rulesContract.test.ts`가 지킵니다(제거 상태 유지 + `teacherStaff` 보존).

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
| `retreats/{id}/programs/{programId}` | 행정 | 이가드 | 행정만 | 프로그램별 기획·진행 블록(`posts`)·규칙·브리핑·대본·물품·실행 할 일(`tasks`)·프로그램 전용 연합팀(`competitionTeams`). 연합팀은 기본 `groups` ID만 참조하고 원본 조를 수정하지 않음. 이가드는 `status=published`만 화면에 노출하며 별도 복제하지 않음 |
| `retreatsPrivate/{id}/programMeetings/{programId}` | 행정 | - | 행정만 | 준비회의 원문과 결정(`{meetingId}/decisions/{decisionId}`). 공개 프로그램 구독·캐시에 섞지 않으며, 결정→공개 실행 할 일 전환은 결정적 ID·최신값 사전 확인·root multi-location update로 한 작업에 수렴 |
| `retreatsPrivate/{id}/cancellations` | 행정 | - | 행정만 | 민감 취소정보; 학생키만 `cellColors/{studentKey}=red`로 원자 동기화 |
| `retreatsPrivate/{id}/unmatchedPayments` | 행정 | - | 행정만 | 없음 (민감정보) |
| `retreatsPrivate/{id}/medicalLogs` | 행정 | - | 행정만 | 없음 (민감정보) |
| `retreatsPrivate/{id}/teacherIdNumbers` | 행정 | - | 행정만 | 없음 (민감정보 — 주민번호) |
| `retreatsPrivate/{id}/participantContacts` | 행정 | - | 행정만 | 참가자 키별 본인·보호자 연락처. 공개 명단과 키를 같게 유지 |
| `retreatsPrivate/{id}/participantContactsBackups` | 행정 | - | 행정만 | 연락처 전체 덮어쓰기 전 롤링 백업. 기존 공개 participants 백업은 이관하지 않음 |
| `retreatAdmins` | 행정 | 통합 앱 인증·역할 판정 | 행정만 | 통합 역할 판정 원천. `{email, name, approvedAt, role, semesterRole?, retreatRole?}` — 두 선택 필드가 없으면 `role`에서 하위호환 파생 |
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
| `iguardMembers` | 이가드 | 통합 앱 인증·역할 판정 | 이가드만 | 이가드 멤버 인증과 선택 필드 `semesterRole?`·`retreatRole?`. 필드가 없으면 기존 멤버 정보와 `iguardRoles`에서 하위호환 파생 |
| `iguardRoles` | 이가드 | 통합 앱 역할 판정 | 이가드만 | `staff` / `team`만 저장 — Rules validate가 이 두 값만 허용하며 세부 화면 역할 문자열을 새로 넣지 않음 |
| `iguardPending` | highschool-app 접근 관리 | - | highschool-app | 사용자별 접근 요청 필드 + `siteRequests/{requestId}`. 요청 첨부 본문은 Firebase Storage `site-requests/{uid}/{requestId}/attachment.jpg`에 분리하고 RTDB에는 메타데이터만 둔다. 팀원 승인·거절은 접근 필드만 지우고 사이트 요청을 보존해야 함 |

## 학기 사역 도메인 (소유: highschool-app 학기 모듈)

> 이 도메인을 함께 쓰던 `semester-app`은 2026-08-12 제거했습니다(복구 태그 `pre-semester-app-removal-2026-08-12`).
> 기능은 `highschool-app` 학기 모듈로 통합돼 있었고, **데이터는 그대로 그 모듈이 계속 사용합니다.**

| 경로 | 소유 사이트 | 읽는 사이트 | 쓰는 사이트 | 삭제/변경 시 영향 |
|------|-----------|-----------|-----------|----------------|
| `semesters/{sid}` (meta·teams·trainingClasses·sessions·applications·attendance·praiseOperationReceipts·completion·curriculum·archiveLinks) | highschool-app 학기 모듈 | - | highschool-app | - |
| `semesters/{sid}/sessions/{sessionId}/endDate` | highschool-app 학기 모듈 | - | highschool-app | 선택 종료일. 없으면 기존 단일 날짜 회차, 있으면 `date`~`endDate` 다일 회차이며 출석은 sessionId 하나로 집계 |
| `semesters/{sid}/trainingClasses/{id}` | highschool-app 학기 모듈 | - | highschool-app | 훈련 반. 삭제 시 `applications/*/trainingClassId`를 같은 루트 update로 함께 비운다(`trainingClass.ts`) |
| `semesters/{sid}/teams/{id}/goal` | highschool-app 학기 모듈 | - | highschool-app | 팀별 이번 학기 목표 (커리큘럼 탭 상단) |
| `semesters/{sid}/applications/{key}/trainingClassId` | highschool-app 학기 모듈 | - | highschool-app | 훈련 반 배정. 값이 없으면 훈련 미신청 — 사역팀 지원은 고3 2학기·스탭만 가능(`intakeRule.ts`). `trainingOnly`는 파생 유지 |
| `semesters/{sid}/attendance/team/{sessionId}` | highschool-app 학기 모듈 + 찬양팀 서버 | - | highschool-app | 사역팀 공통 출석 원장. 명시 연결된 찬양 회차·신청자는 같은 셀을 조회·수정하고 등단 계산도 이 값을 사용한다. 훈련 출석의 대체값으로 읽지 않는다. |
| `semesters/{sid}/praiseOperationReceipts/{receiptHash}` | highschool-app 찬양팀 서버 | - | highschool-app | 공통 출석 요청의 적용 또는 안전 종료를 증명하는 영구 비식별 표식. 값은 `phase`·요청 지문·서버 처리 시각만 두며 UID·이름·회차/신청키·경로를 넣지 않는다. 출석 셀과 같은 학기 transaction으로 `applied`를 쓰고 기존 표식을 덮어쓰거나 자동 삭제하지 않는다. |
| `semesters/{sid}/attendance/training/{sessionId}` | highschool-app 학기 모듈 | - | highschool-app | 훈련 출석 원장. 사역팀 출석과 같은 신청자 키를 써도 독립적으로 기록·판정한다. |
| `semestersPrivate/{sid}/applicationsPrivate` | highschool-app 학기 모듈 | - | highschool-app | 민감정보 — 지원 동기·본인 연락처(`phone`)·보호자 연락처(`parentPhone`) |
| `semesters/{sid}/newFriends` | highschool-app 학기 모듈 | 학생 앱 목양 리포트(기존 읽기 권한 보유자) | highschool-app | 새친구 진행 단계·반배정·출석부 반영 ID. 연락처·심방 메모 저장 금지 |
| `semestersPrivate/{sid}/newFriendsPrivate` | highschool-app 학기 모듈 | - | highschool-app | 새친구 연락처·주소·가족·심방 메모 |
| `semestersPrivate/{sid}/newFriendRosterBackups` | highschool-app 학기 모듈 | - | highschool-app | 출석부 신규 학생 단건 추가 직전 스냅샷과 삭제·등반/배정 취소 직전 학생·출석·새친구 비공개 복구 근거 |
| `semesters/{year}-sunday/newFriends` | highschool-app 주일 사역 | 학생 앱 목양 리포트(기존 읽기 권한 보유자) | highschool-app | 신규 새친구의 학기 비종속 연도별 내부 작업공간. `meta`를 두지 않아 학기 목록에서 제외 |
| `semestersPrivate/{year}-sunday/newFriendsPrivate` | highschool-app 주일 사역 | - | highschool-app | 주일 사역 신규 새친구의 연락처·주소·가족·심방 메모 |

> `highschool-app` 학기 모듈은 `classes/{year}`(현장 접수 반 명단)·`teacherStaff/{year}`(접수 대상 스탭 명단)·`admins`·`retreatAdmins`(멤버 인증)를 원칙적으로 **읽기만** 한다. 예외는 `canWriteStudentRoster(roles)`가 허용하는 학기 역할 `superAdmin`·`adminTeam`의 새친구 흐름이다. 신규 학생 1명을 결정적 `nf_` ID로 추가하거나, 그 흐름으로 연결된 동일 ID·동일 이름 학생만 사전 백업 후 `classes`·해당 `attendance`에서 제거하고 `trash`에 복구 사본을 남길 수 있다. 되돌리기는 새친구 기록까지 삭제하는 `명단·출석부 삭제`와 새친구 기록은 보존하고 배정 연결만 해제하는 `등반 및 배정 취소`로 제한한다. 범용 기존 학생 수정·이동·삭제와 그 밖의 출석 변경은 계속 학생 앱만 담당한다.
> **2026-08-09 권한 축소**: `teacherStaff`·`teacherSpecial`·`teacherExtra`·`teacherAdditional`·`teacherPhones`·`userRoles`의 `.read`가 `auth != null`이라 역할 없는 구글 계정도 교사 40명의 전화·생년월일과 계정 51건을 읽을 수 있었다. 읽는 주체를 grep으로 증명해 좁혔다 — 교사 명단 계열은 `admins`·`attendanceAdmins`·`retreatAdmins`·`iguardMembers`, 나머지는 관리자만, `userRoles`는 본인 레코드만 자기조회(`auth.token.email` 일치). 새 노드를 만들 때 `.read: "auth != null"`을 기본값처럼 쓰지 말 것.
>
> Rules는 2026-07-10 학생 앱에서 추가했다. 2026-09-05 감사 후속으로 교사 권한 원천과 학생 이동 잠금 계약을 보강했으며 실제 배포 상태는 `.claude/HANDOFF.md` 최신 항목을 확인한다.
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
- 학생 앱이 소유하지만 **운영 앱 2개의 여러 모듈이 읽음**
- 구조(필드명, 학생 key 형식) 변경 시 학생 출석 화면과 통합 앱의 학기·주일·수련회 행정·현장 화면에 모두 영향
- 통합 앱의 `getClassesByYear()`·`subscribeToClassesByYear()`와 학기 모듈 `getClassesByYear()`·`subscribeClassesByYear()`가 이 구조에 의존

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


## 찬양팀 전용 원장 (2026-09-06 구현)

- `praiseOps/{workspaceId}`는 통합 앱 찬양팀 서버 모듈만 쓴다. 앱 브라우저의 RTDB 직접 읽기·쓰기는 현행 default-deny Rules가 차단하며, Firebase Admin 서버 자격정보 설정 후 ID 토큰/현재 플랫폼 역할/찬양팀 담당 권한을 검증하는 API로만 이용한다.
- 업무 원장·버전·작업 영수증·업무 감사는 같은 workspace transaction으로 저장한다. `activityLogs/events`는 고정 ID의 별도 투영이며 실패하면 원본 감사와 미반영 표시를 유지한다. GET·페이지 방문에서 재시도 쓰기를 하지 않는다.
- `semesters/{id}/meta`, `teams`, `sessions`, `applications`는 연결 후보와 연결 유효성 확인에 사용한다. 사용자가 찬양 모임과 학기 사역팀 모임이 같은 행사라고 확인했으며, 회차의 `linkedSessionId`와 사람의 `rosterLink.applicationKey`가 모두 검증된 경우에만 `semesters/{id}/attendance/team/{sessionId}/{applicationKey}`를 공통 원장으로 읽고 쓴다. 새 공간은 정확히 같은 날짜의 유일한 회차만 자동 연결하고, 기존 기록은 이름·날짜로 추정하지 않는다.
- 찬양 인물은 기존 `PraisePerson.id`·`sourceId`·`kind`를 유지하고 `rosterLink`로 현재 학기 신청과 공식 인물 원장을 참조한다. 학생 연결은 `rosterLink.applicationKey`가 가리키는 배치 신청과 `classes/{year}/{classKey}/students/{studentId}`의 `personId`가 일치해야 하며, 스탭 연결은 신청과 `teacherStaff/{year}/{staffId}`의 `personId`가 일치해야 한다. 기존 연결과 원본 ID는 해제하거나 다른 인물로 바꾸지 않고, 누락된 검증 필드만 같은 동일인 근거로 보완한다.
- 명단 대조 작업은 `semesters/{sid}/applications`, `classes/{year}`, `teacherStaff/{year}`를 읽기만 하고 이 세 원장에는 역방향 쓰기를 하지 않는다. 확정된 여러 연결은 최신 workspace와 기존 연결 불변성을 다시 검사한 뒤 `praiseOps/{workspaceId}`의 한 transaction에서 인물 연결·revision·작업 영수증·한국어 감사를 함께 저장한다.
- 차단 항목이 남은 `shadow`에서도 관리자는 **기존 찬양 인물의 공식 명단 연결과 찬양팀 세부정보 대조만** 할 수 있다. 과거 출결·등단·조편성, 새 인물 등록, 가져오기, 차단 항목과 모드 전환은 계속 잠근다. 현재 활성 찬양 인물 43명과 학기 찬양팀 배치 41명의 차이 중 강한 동일인 근거가 없는 활성 인물 2명은 사용자 확인 전까지 연결하지 않는다.
- 공통 출석은 찬양 workspace 작업 예약 → `semesters/{sid}` transaction 안의 최신 학기·팀·회차·신청 배치 검증과 출석 셀+`applied` 표식 동시 저장 → 찬양 감사 완료의 세 단계다. 응답이 끊긴 요청은 운영자가 영구 표식을 확인해 감사를 완료하거나, 출석 현재값을 확인한 뒤 원장 변경 없이 `closed` 표식으로 종료한다. 늦게 도착한 요청은 기존 `applied/closed` 표식에서 중단한다. 찬양 workspace와 학기 원장은 하나의 분산 transaction이 아니며, 영구 표식은 자동 삭제하지 않는다. 학생 `classes`·학생 주일 `attendance`·공식 스탭 원장은 수정하지 않는다.
- `semesters/{sid}` 전체 transaction은 다른 학기 쓰기와 충돌하면 재시도되고 영구 표식 수만큼 학기 노드가 커진다. 현재 규모에서는 정확성을 우선하되 지연·재시도율과 학기별 표식 증가량을 관찰한다. 학기 보관 정책을 정하기 전에는 표식을 정리하지 않는다.
- 원본 Supabase 보관본·민감 메모·파일·계정 대응표는 공개 API와 Git에 포함하지 않는다. 실제 운영 이관과 shadow→live 전환은 [데이터 전달 절차](docs/PRAISE_DATA_HANDOFF.md)의 백업·대조·승인 조건을 따른다.


> 2026-09-08 휴지통 호환 계약: 새 삭제본의 키는 `encodeURIComponent(반키)__encodeURIComponent(학생ID 또는 class/roster)__encodeURIComponent(작업ID)`다. 복구 본문의 `id`·`ck`는 원래 학생·반 식별자를 유지한다. 학생 앱은 기존 `sid`·`ck_` 키도 실제 저장 키로 읽고, 복원 뒤 정리·영구 삭제는 그 키와 사본 전체를 대조한다. 통합 앱은 새친구 단건 되돌리기의 쓰기와 재조회 검증에 같은 작업 ID를 사용한다. 기존 사본 이관·운영 DB 직접 쓰기·Rules 변경은 하지 않는다.
### 찬양팀 운영 전환 경계 (2026-09-08)

- 2026-09-08 사용자가 누락된 학기 배치 2명, 동일 회차 날짜, 출석 충돌 1건의 처리와 통합 사이트 입력 전환을 확인했다. 과거 문서의 2명 보류 상태는 이 결정으로 대체한다.
- 승인된 신청 추가·출석 정정은 `highschool-app/scripts/praise-cutover.mjs`의 별도 이관 계획으로 수행한다. 일반 명단 대조 API는 `classes`·`teacherStaff`·`applications`에 쓰지 않는다. 이관은 원본 대조·사전 스냅샷·조건부 저장을 요구하며 학기 변경과 workspace 변경을 서로 다른 단계로 검증한다.
- `praiseOps/{id}/meta/readOnlyBefore` 이전의 출결·스탭 참석·등단·회차 변경은 서버에서 거절한다. `historyReview`는 미확인 과거 조·첨부 자료의 검토 항목이며 이를 전체 자료 이관 완료로 설명하지 않는다. 미래 회차에는 과거 조를 미리 고정하지 않고 첫 출결 저장 시 확정 조를 보존한다.
- `semesters/{sid}/praiseCutovers/{id}`는 일회성 이관 영수증(시각·작업자·workspace ID·건수)이다. 통합 앱이 소유하며 학생 출석 앱은 읽거나 쓰지 않는다. 개인별 변경 근거는 비공개 사전 스냅샷과 `praiseOps/{id}/audit`에 보존한다.
