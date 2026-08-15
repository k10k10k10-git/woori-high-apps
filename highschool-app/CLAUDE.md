# 고등부 통합 웹페이지 운영 지침

루트 `../CLAUDE.md`가 최우선 규칙입니다. 이 문서는 통합 앱에만 해당하는 보충 지침입니다.

## 목적

학기 사역, 수련회 행정, 이가드 현장 기능을 `highschool-app` 한 코드베이스와 배포 단위로 운영합니다. 독립 `retreat-app`·`iguard-app`은 2026-08-05 제거했지만 운영 DB 경로와 데이터 형태는 그대로 유지합니다.

## 라우트

- `/`: 통합 홈
- `/ministry-guide`: 위키에서 추린 월별 사역 흐름·부서 운영 가이드 라인(권한 있는 담당자 편집 가능)
- `/semesters`, `/semester/[id]`: 학기 중 사역
- `/sunday-ministry`, `/sunday-ministry/[team]`: 학기 구분 없는 주일 사역. 팀은 `행정팀`(`admin`)·`바나바팀`(`barnabas`)·`예배팀`(`worship`)·`찬양팀`(`praise`)·`미디어팀`(`media`)·`기획디자인팀`(`design`) 여섯이고, 팀 없는 `/sunday-ministry`는 **바나바팀으로 유지**합니다(홈 카드·통합검색·북마크가 이 주소를 가리키고, 개편 전 첫 화면도 새친구였습니다).
- `/retreats`, `/retreat/[id]`: 수련회 행정
- `/retreat/[id]/field`: 이가드 현장 운영

서비스 이름은 **분당우리교회 서현고등부**이고, 운영 주소는 `https://woorihigh-app.vercel.app` 입니다(구 `highschool-app-flame.vercel.app`도 같은 배포를 가리킵니다).

## 화면 셸 규칙

- 사이트 제목·계정·로그아웃·상단 메뉴는 `GlobalPortalHeader` 하나만 담당합니다. 하위 화면에 "수련회 행정시스템" 같은 제목 줄을 다시 만들지 않습니다(제목 2줄 중복 금지).
- 상단 메뉴는 **학기 중 사역 / 주일 사역 / 방학 중 사역 / 사역 가이드 / 사이트 건의사항** 순서입니다. 주일 사역과 방학 중 사역은 **둘 다 hover 드롭다운**이며 공용 `NavDropdown`(`GlobalPortalHeader.tsx` 내부) 하나를 씁니다 — 마크업·키보드·바깥클릭 동작이 갈라지지 않게 여기에만 두고, 열림 상태는 부모의 `openMenu`가 들어 한쪽을 열면 다른 쪽이 닫힙니다. 주일 사역은 `행정팀`·`바나바팀`·`예배팀`·`찬양팀`·`미디어팀`·`기획디자인팀`, 방학 중 사역은 `수련회 행정팀`(`/retreats`)·`수련회 이가드팀`(`/field`)으로 갈라집니다.
- **주일 사역의 팀·탭 배치는 `featureCatalog.ts`의 `SUNDAY_MINISTRY_TEAMS`가 단일 원천**입니다. 화면이나 헤더에서 팀 목록을 다시 적지 않습니다. 팀별 `tabs`의 합집합은 반드시 `SUNDAY_MINISTRY_TABS`와 같아야 하며(중복 배치도 금지) `featureCatalog.test.ts`가 이 계약을 지킵니다 — 팀을 늘리거나 탭을 옮길 때 탭이 조용히 사라지는 것을 막습니다. 찬양·미디어·기획디자인팀은 기능 확정 전까지 `tabs`가 비어 있고, 탭 바 없이 준비 중 화면만 렌더합니다.
- **예배팀 자리 배치**(`features/sundayWorship`)는 Rules를 바꾸지 않으려고 **사역 가이드와 같은 공유 노드**(`prepMilestones`)에 `sourceSite=sunday-worship-seating` 조각으로 저장합니다. `note`가 500자 제한이라 **분단 하나 = 레코드 하나**로 쪼개고, id는 `ws_{YYYYMMDD}_{부}_{분단}`으로 결정적입니다. 분단을 줄이면 남은 레코드를 같은 update에서 `null`로 지워 화면에 없는 분단이 DB에만 남지 않게 합니다. **일정 구독 두 곳**(`lib/db/shared.ts`·`features/iguard/lib/db.ts`)이 `isWorshipMilestone`으로 이 조각을 걸러냅니다 — 새 조각을 추가하면 두 곳 모두 갱신하세요.
- 격자는 **분단 × 분단별 줄**이고 **한 반이 여러 줄을 차지**합니다. 배치도의 `1-5(2)`는 인원이 아니라 그 반이 쓰는 **줄 수**입니다. 인접은 같은 분단의 위아래(앞뒤)와 인접 분단의 같은 줄(좌우)이며, 블록이 **위에서 두 줄과 겹치면 앞자리**입니다(`isFrontBlock`).
- **줄 수 = 올림((지난 3주 출석 평균 + 담임 1명) / 한 줄 의자 6개)** 입니다(`rowsForAverage`). 전체 명단으로 계산하면 허수가 많아 출석 평균을 씁니다. 출석은 `O`(출석)와 `T`(지각)만 세고, 셀 키는 학생 출석부의 `evKey`와 같은 `{월 인덱스}-{그 달 몇 번째 주일}` 규칙입니다(`sundayCellKey`) — 이 규칙이 어긋나면 출석을 못 읽습니다. 해가 바뀌는 주는 다른 연도 노드라 계산에서 뺍니다.
- 화면의 반 라벨은 `학년-반`이고 **예배 부는 classKey(`part-grade-class`)의 앞자리**로 매칭합니다(`classKeysForService`).
- ⚠ 이 화면의 숫자 입력칸은 **폭을 감싼 div로, 글꼴·좌우 여백을 인라인 style로** 줍니다(`NUMBER_INPUT`). `.input`이 `@layer` 밖이라 `w-*`·`text-xs`를 모두 이기고, 기본 좌우 패딩 14px씩이면 콘텐츠 폭이 14px만 남아 숫자가 잘립니다(실제로 반 이름 폭이 0이 된 적 있음).
- 팀 라우트를 오갈 때 클라이언트가 재사용될 수 있으므로 **선택 탭은 렌더 중 파생으로 보정**합니다(`tabs.find(...) ?? tabs[0]`). effect에서 setState로 맞추면 실수 13(시계·자동 선택이 사용자 선택을 덮음)과 같은 부류의 회귀가 납니다.
- 통합관리자 우측 계정 메뉴는 **마이페이지**이며 `팀원 관리`·`요청사항` 두 탭을 제공합니다. 교역자는 기존 권한대로 팀원 관리만 엽니다. 사이트 건의사항은 공유가 아니라 `iguardPending/{uid}/siteRequests/{requestId}`로 전송합니다. 이 경로는 기존 Rules의 사용자 자기 읽기·쓰기와 통합관리자 전체 읽기·쓰기를 재사용하며, 접근 승인 필드(`email`·`name`·`requestedAt`)와 반드시 분리해 정규화합니다. 승인·거절 시 사용자 노드 전체를 지우지 말고 접근 필드만 지워 요청을 보존합니다. 첨부는 JPEG로 재인코딩·축소해 요청 안에 보관하며, 해결 시 `resolvedAt`을 기록하고 작성자는 다음 로그인 때 한 번 알림을 받은 뒤 `notifiedAt`을 남깁니다.
- **방학 중 사역 홈은 화면 하나**입니다. 두 경로 모두 `features/portal/VacationHome.tsx`를 렌더하고, `mode`("admin"/"field")로 **수련회에 들어갔을 때의 목적지만** 달라집니다(행정 화면 / 현장 화면). 목록·수련회 기간·준비 일정 캘린더는 완전히 같은 컴포넌트를 씁니다. 각 라우트는 로그인·권한 게이트와 도메인 전용 요소(행정: 폼 가이드·삭제·브레인스토밍 / 현장: PIN 배지·현장 관리자)만 슬롯으로 넘깁니다.
- 방학 중 사역 홈의 `새 수련회`는 항상 **수련회 목록 제목 옆**에 두고, 폼 가이드·PIN 잠금·현장 관리자처럼 목록 전체에 작용하는 도구는 `VacationHome.headerActions`를 통해 **화면 우측 상단**에 둡니다. 행정·현장 라우트가 이 위치를 따로 렌더링하지 않습니다.
- 준비 일정 캘린더는 `RetreatCalendarPanel` 하나로 통일했습니다(구 `PrepCalendar` 삭제). 수련회 기간 편집은 Rules상 행정 권한이 필요하므로 `canEditPeriods`로 잠급니다 — `prepMilestones`는 이가드팀도 공유 편집합니다.
- 통합 브랜드 색: 학기·수련회 행정·이가드 모두 `globals.css`의 미드나이트 인디고·코발트·틸 토큰을 공유합니다. `.semester-scope`와 `.iguard-scope`는 배경·최소 높이만 제공하며 도메인별 원색으로 토큰을 재정의하지 않습니다. 상태 의미(정상·검토·위험)에만 에메랄드·앰버·로즈를 사용합니다.
- **수련회 PIN 잠금은 `useRetreatPinGate` 하나로만 판정합니다**(`src/features/portal/useRetreatPinGate.ts`). 잠금은 `retreats/{id}/iguard/accessLock` 한 노드에만 있으므로 **행정·이가드 어느 쪽에서 잠가도 양쪽이 잠깁니다**. 화면마다 구독을 새로 짜면 한쪽만 잠기는 사고가 납니다. 설정 UI는 공용 `AdminModal`(현장·행정 홈이 함께 씀), PIN 우회는 통합관리자만.
- **로드 실패 배너는 `useLoadErrors(scope)` 하나만 씁니다**(`src/lib/useLoadErrors.ts`). 실패를 경로별로 모아 **전부** 나열하고, `scope`(학기 id·계정 uid)가 바뀌면 렌더 중 파생으로 초기화합니다. 단일 `loadError` 문자열로 되돌리지 마세요 — 5개 구독이 동시에 거부돼도 마지막 하나만 보여 2026-08-08에 권한 공백의 원인을 두 번 잘못 짚었습니다. 저장·삭제 실패는 `actionError`로 분리합니다. ⚠ Firebase RTDB는 **한 번 거부된 리스너를 규칙이 바뀌어도 재시도하지 않습니다** — 권한을 열어도 그 탭은 새로고침(재구독) 전까지 실패 상태로 남습니다.

## 권한 — 두 축 역할 (단일 원천: `src/features/portal/accessPolicy.ts`)

역할은 **두 축**입니다. 한 사람이 학기 역할과 방학 역할을 동시에 갖고, **화면이 자기 영역에 맞는 축을 골라 씁니다** — "지금이 학기인가"를 따지지 않습니다(수련회 준비는 학기 중에 시작하고, 개학 후에도 정산이 남습니다).

| 화면 | 적용 축 |
|---|---|
| 학기 사역(`/semesters`, `/semester/[id]`) · 주일 사역(`/sunday-ministry`) | **학기 역할** |
| 수련회 행정(`/retreats`, `/retreat/[id]`) · 현장(`/field`, `/retreat/[id]/field`) | **방학 역할** |
| 홈 · 공유 일정 · 통합검색 · 사역 가이드 · 건의사항 | 두 축 중 열려 있는 쪽 |

**학기 역할 (10종)** — 학기 화면 / 주일 화면

| 역할 | 학기 | 주일 | 학기 설정 | 학기 삭제 | 출석부 반영 |
|---|---|---|---|---|---|
| 통합관리자 | 수정 | 수정 | ✅ | ✅ | ✅ |
| 교역자 | 수정 | 수정 | ✅ | ✅ | ✕ |
| 스탭팀장 | 수정 | 수정 | ✅ | ✕ | ✕ |
| 행정팀 | 수정 | 수정 | ✅ | ✕ | ✅ |
| 바나바팀 | 조회 | **수정** | ✕ | ✕ | ✕ |
| 예배·찬양·미디어·기획디자인팀 | 조회 | 조회 | ✕ | ✕ | ✕ |
| 사역팀(미지정) | 조회 | 조회 | ✕ | ✕ | ✕ |

**방학 역할 (6종)** — 수련회 행정 / 현장

| 역할 | 행정 | 민감정보 🔒 | 현장 | 생성·PIN | 삭제·복구 |
|---|---|---|---|---|---|
| 통합관리자 | 수정 | ✅ | 전체 | ✅ | ✅ |
| 교역자 | 수정 | ✅ | 전체 | ✅ | ✅ |
| 스탭팀장 | **조회** | ✕ | 전체 | ✕ | ✕ |
| 행정팀 | 수정 | ✅ | 실행탭만 | ✅ | ✕ |
| 이가드팀 | **조회** | ✕ | 전체 | PIN만 | ✕ |
| 현장 스탭 | ✕ | ✕ | 실행탭만 | ✕ | ✕ |

🔒 민감정보 = 취소·환불 계좌, 의료 일지, 교사 주민번호, 입금 미대조(`retreatsPrivate` 계열). 해당 탭은 `canSeeSensitiveRetreat`가 거짓이면 **탭 목록에서 빠지고, 주소를 직접 입력해도 첫 탭으로 되돌립니다**.

**DB 저장** (Rules 변경 없음 — 버킷은 두 축의 **합집합**으로 결정)

| 버킷 | 들어가는 역할 | 저장 |
|---|---|---|
| `admins/{uid} = true` | 어느 축이든 통합관리자 | — |
| `retreatAdmins/{uid}` | 교역자·스탭팀장·행정팀·바나바팀(학기 쓰기 필요) | `{ role, semesterRole, retreatRole }` |
| `iguardMembers/{uid}` + `iguardRoles/{uid}` | 이가드팀(`team`)·현장 스탭·사역팀(`staff`) | `{ semesterRole, retreatRole }` |

**행정팀의 출석부 반영은 2026-08-12 Rules 보강으로 열렸습니다.** `retreatAdmins/{uid}.semesterRole === "adminTeam"`인 계정만 `classes/{year}/{ck}/students/{sid}`·`attendance/{year}/{ck}/{sid}`·`trash/{year}/students/{sid}` **학생 1명 경로**를 씁니다. 반 노드 전체(`students` 통째·`teacher`)와 `trash` 노드 전체는 통합관리자·담임 그대로입니다. `semesterRole`은 `retreatAdmins` 쓰기가 통합관리자 전용이라 자가 승급이 불가능합니다. 계약은 `고등부 학생 출석부/__tests__/rulesContract.test.ts`가 지킵니다.

※ **화면 차단 ≠ 실제 차단.** Rules는 그 외에는 세 버킷만 구분합니다. 아래는 화면에서만 막히며, 실제 차단은 Rules 변경이 필요합니다.
- 행정 화면의 **조회 전용 모드**는 `RetreatEditProvider`(`features/portal/RetreatEditContext.tsx`) + `RetreatPageClient`의 `<fieldset disabled className="contents">` 두 겹입니다. fieldset이 내부 `button`·`input`·`select`·`textarea`를 브라우저 수준에서 잠그고(클릭 이벤트도 발생하지 않음), `display:contents`라 레이아웃에는 영향이 없습니다. 드래그처럼 폼 요소가 아닌 조작은 각 컴포넌트가 `useRetreatCanEdit()`으로 따로 잠급니다(`GroupComponents`·`RoomsTab`의 `draggable`). 새 행정 탭을 만들 때 드래그·div 클릭 편집이 있으면 이 훅을 반드시 쓰세요.
- 이가드팀·스탭팀장의 행정 **조회**는 민감 탭을 감춰야 성립합니다. `ParticipantsTab`의 `getSyncDuplicates`는 `retreatsPrivate`라 실패해도 명단이 보이도록 `.catch(() => [])`로 삼킵니다 — 이 방어를 지우면 조회 전용 역할에게 첫 탭이 통째로 에러가 됩니다.
- 사역팀의 "내 팀만 편집", 민감정보 실차단, 스탭의 `classes` 전체 읽기 차단도 Rules 작업입니다.

**원칙: 화면에서 막는 것은 언제나 안전하지만, 화면에서 여는 것은 Rules가 허용할 때만 합니다.** (Rules가 막는 걸 화면에서 열면 "눌렀는데 실패"가 됩니다.)

- 화면 게이트는 `canAccessArea` / `canEditArea` / `iguardScopeOf` / `canManageRolesOf`와 목적별 함수(`canDestroySemester`·`canCreateRetreat`·`canSeeSensitiveRetreat` 등)만 사용합니다. 컴포넌트에서 역할 문자열을 직접 비교하지 않습니다.
- 역할 판정은 `resolveMinistryRoles`(순수) 하나로, 통합 `AuthContext`와 이가드 `AuthContext`가 같은 결론을 냅니다.
- 역할 배정 쓰기는 `roleAssign.planRoleAssignment`(순수·테스트) → `applyRole.applyRoleSteps`(실행) 경로만 사용합니다. 부여를 먼저, 해제를 나중에 실행합니다.
- 학기 화면의 편집 잠금은 `features/semester/EditContext`의 `useSemesterCanEdit()`으로만 판단합니다.
- 스탭의 학기 **조회**는 2026-08-08 Rules 보강으로 열렸습니다 — `semesters` `.read`에 `iguardMembers`가 추가됐습니다. `.write`는 계속 `admins`/`retreatAdmins`만이고, 연락처가 있는 `semestersPrivate`는 **행정 전용 그대로**입니다. 즉 스탭은 `semesters/*`(명단·팀·훈련 반·회차·출석·커리큘럼)를 읽지만 저장은 못 합니다. Rules는 학생 앱에서만 배포합니다.
- 행정 권한과 이가드 권한의 **쓰기 경계**는 계속 분리합니다. 이가드팀 계정은 통합 홈과 현장 화면만 사용합니다.

## 인물 통합검색 계약

- 이름만으로는 동일인을 결합하지 않습니다. 학생은 정규화 이름·생년월일·부서·정상 진급선을 함께 사용합니다.
- 학생·교사·스탭 유형과 `person_student_*`·`person_teacher_*`·`person_staff_*` namespace를 보존합니다. 유형이 다르면 같은 실명·생년·연락처여도 별도 인물입니다.
- 학생은 같은 연도에 원본 ID가 다르면 항상 분리합니다. 다른 연도에서는 이름·생년월일·같은 부서가 일치하고 `학년 차이 === 연도 차이`인 진급 후보가 각 연도에 한 명뿐일 때 연결합니다. 본인 연락처의 변경·누락은 허용하고 보호자 연락처 하나만으로는 연결하지 않습니다.
- 영구 `personId`를 우선하되, 위 진급선이 유일하게 확인된 학생의 과거 분리 ID는 하나로 재연결합니다. 기존 연도별 학생·교사·스탭 ID와 출석·수련회·학기 참조키는 교체하지 않습니다.
- 학기 신청의 `personId`는 같은 연도 `studentId`가 가리키는 공식 학생·스탭 원장의 값을 복사합니다. 이름만 같은 신청에는 부여하지 않습니다.
- 수련회 단체티처럼 식별자가 없는 보조 기록만 같은 행사·같은 유형의 유일한 기준 레코드에 제한적으로 연결합니다.
- 대표 이름은 최신 연도 출석부 학생 이름을 우선합니다. 수련회 명단에서 유입된 `134 이예원` 같은 앞자리 순번은 검색 별칭에서 제거해 표시하고, 수련회 원본·백업 데이터는 수정하지 않습니다.
- 인물 상세는 카테고리 탭 대신 최신 연도부터 연도 탭으로 묶습니다. 학적·출석, 학기 사역, 새친구, 수련회 정보는 해당 연도 안에서 함께 보이되 `현장 등록` 보조 기록은 통합검색에 표시하지 않습니다.

## 실시간 읽기 계약 (2026-08-13)

- 화면에 계속 표시되는 Firebase 목록·상세 데이터는 `onValue` 또는 `onChild*` 구독을 사용하고, 컴포넌트가 닫히거나 대상 ID가 바뀔 때 반드시 unsubscribe합니다. 출석부 원장 `classes/{year}`·`attendance/{year}`, 학기 `semesters/*`, 수련회 `retreats/*`와 관련 명단·배정·운영 탭이 이 계약에 포함됩니다.
- 인물 통합검색은 검색창이 열린 동안에만 권한이 허용한 루트를 구독합니다. 각 루트는 최상위 child 추가·변경·삭제분을 병합해 한 경로 변경 때문에 전체 루트를 다시 받지 않도록 하고, 검색창을 닫으면 전부 해제합니다.
- 인증·권한 판정, 저장/삭제 직전 최신값 확인, 백업·복구, 멱등성 검증, 버튼으로 실행하는 외부 시트 가져오기는 일회성 `get`을 유지합니다. 이 조회는 화면 캐시가 아니라 거래 안전과 명시적 명령의 일부입니다.
- 구독 화면에서 저장 성공 뒤 배열에 같은 항목을 수동 append하지 않습니다. Firebase echo가 같은 항목을 다시 전달해 중복 표시될 수 있으므로 표시 상태는 구독 콜백을 단일 원천으로 둡니다. 입력 중 초안·드래그 배정처럼 로컬 편집 보호가 필요한 화면은 기존 dirty/ref 충돌 방지를 유지합니다.
- 이 전환은 읽기 방식만 바꾸며 DB 경로·데이터 구조·Rules를 바꾸지 않습니다. 출석부 앱이 `classes`를 저장하면 RTDB 값이 먼저 바뀌고, 열린 통합사이트 구독 콜백이 그 변경값으로 화면 파생 결과를 다시 계산합니다.

## 학기 사역 계약 (2026-08-06)

- **접수 원칙**: 훈련(`trainingClassId`)을 신청해야 사역팀(`choice1`)에 지원할 수 있다. 예외는 **고3 2학기와 스탭**. 판정은 `features/semester/intakeRule.ts`(순수)만 사용하고 화면에서 조건을 재구현하지 않는다.
- `trainingOnly`는 계속 저장하되 `deriveTrainingOnly`로 파생한다 — 출석·수료 명단(`roster.ts`)이 쓰는 기존 계약이라 직접 세팅하지 않는다.
- **훈련 명단**은 훈련 반 배정자 전원이다(사역팀을 겸하는 사람 포함). 레거시 `trainingOnly=true`도 훈련 신청으로 흡수한다.
- **회차 유형**은 `sessionKind.ts`로만 변환한다. 저장 스키마(`type`/`label`)는 그대로이고, **출석 집계(만점)에서 빠지는 것은 `휴강`뿐**이다(`completion.regularSessions`).
- 훈련 반 삭제는 `trainingClass.ts`의 루트 다중 경로 update로 신청자 참조까지 함께 정리한다(팀 삭제와 같은 패턴).
- **학기 삭제**(`removeSemester`)는 `semesters/{sid}`와 `semestersPrivate/{sid}`를 한 번의 루트 update로 지운다. 되돌릴 수 없으므로 화면에서 **학기 ID를 직접 입력받아** 확인한 뒤에만 호출한다.
- **수련회 생성**은 행정·이가드 공용 컴포넌트 `features/portal/NewRetreatButton.tsx` 하나만 쓴다. `retreats/{id}`가 공유 노드라 어느 화면에서 만들어도 양쪽 목록에 나타난다. 쓰기는 행정 db(`@/lib/db`)가 담당하고 버튼은 `canEditPortalArea("retreat-admin")`로 게이트한다.
- **교사·스탭 접수**는 학생과 다른 경로다: 훈련·지망 없이 사역팀에 바로 배정한다(`intakeRule.isStaffApplicant`). 저장 시 `teamId`를 직접 채우고 `choice1/2`·`trainingClassId`는 비운다.
- **배치·커리큘럼은 두 축**이다: 사역팀(`teams`)과 훈련 반(`trainingClasses`). 커리큘럼은 `curriculum/{id}` 한 맵을 공유한다(두 축의 id가 겹치지 않는다). 훈련 반에는 `goal`이 없으므로 학기 목표 박스는 사역팀에서만 보인다.
- **홈 공유 캘린더**의 "공유 일정"은 `prepMilestones`다. 추가·수정·삭제는 Rules와 같게 스탭을 제외하고 열어 둔다(`canEditPortalArea("retreat-admin") || iguardScope === "all"`).
- **사역 가이드**의 기본값은 `features/ministryGuide/ministryGuideContent.ts`의 정적 운영 원칙이다. 권한 있는 담당자의 월별 흐름·부서 운영 가이드 수정본은 기존 공유 경로 `prepMilestones/*`에 `sourceSite=ministry-guide*`인 결정적 레코드로 나눠 저장하고, 일반 일정 구독은 이를 반드시 필터링한다. 연간 계획은 `가안`으로 표시하며 학생 실명·연락처·주소·가정·건강 특이사항과 미결 아이디어는 넣지 않는다.
- **주일 사역의 새친구 탭**은 학기 선택 없이 모든 `semesters/*/newFriends`를 통합 조회한다. 기존 학기별 기록은 이동하지 않고, 신규 기록만 학기가 아닌 연도별 내부 작업공간 `semesters/{year}-sunday/newFriends`와 `semestersPrivate/{year}-sunday/newFriendsPrivate`에 저장한다. 이 작업공간은 `meta`를 두지 않아 학기 목록에 나타나지 않는다. 행정팀은 접수·2주 과정·등록 결정·반배정을 관리하고, `classes/{year}` 반영은 현재 Rules와 일치하게 통합관리자만 `registerNewFriendInRoster`를 호출한다. 이 함수는 새친구 ID 기반 결정적 학생 ID, 중복 차단, 대상 반 확인, 비공개 사전 스냅샷, 단일 학생 경로+반영 이력의 원자 update와 재조회 검증을 유지한다. 반영된 새친구 삭제도 통합관리자만 가능하며, `removeNewFriendFromRoster`가 결정적 `nf_` ID·현재 이름·연결 반을 재검증하고 학생·해당 출석·새친구 공개/비공개 기록을 원자 삭제한다. 삭제 직전 전체 사본은 `newFriendRosterBackups/{friendId}/removals/{timestamp}`에, 학생 복구 사본은 `trash/{year}/students/{studentId}`에 남기고 결과를 재조회한다. 일반적인 `classes`·`attendance` 쓰기 함수로 넓히지 않는다.
- **행정 변동 사항 탭**은 학생 앱 소유 `classes/{year}/{classKey}/adminChanges`를 읽기만 한다. 학생 앱이 학생 명단 수정과 같은 원자 update로 만든 감사기록이며, 통합 앱에서는 생성·수정·삭제하지 않는다. 기존 `변경 이력`은 제거하고 `학생 변동`은 `등록 현황`으로 표시한다.
- **등반 및 배정 취소**는 새친구 공개·비공개 기록과 등록 결정·2주차 기록을 보존하고 `assignedClassKey`·`giftDate`·`rosterSync`를 해제해 `반배정` 단계로 되돌린다. 출석부 반영 후에는 통합관리자만 실행하며, 결정적 `nf_` 학생·해당 출석을 사전 백업과 `trash`를 남긴 뒤 원자적으로 제거한다. 새친구 기록까지 지우는 `명단·출석부 삭제`와 구분한다.
- 큐싯 **구글 시트 연동은 2026-08-07 제거**했다(표 붙여넣기만 사용). `iguard/cueSheet` 노드와 db 함수는 남아 있지만 화면에서 쓰지 않는다 — 되살릴 때만 참고한다.
- **인원체크 키에 배열 인덱스를 넣지 않는다** — `checklistKeys.ts`의 `stableMemberId`(`{kind}:{ownerId}:{name}`)만 쓴다. 인덱스를 넣으면 행사 중 한 명이 불참 처리될 때 뒤 사람들의 체크가 통째로 어긋난다. 운영 DB에는 구형 인덱스 키가 남아 있으므로 판정·해제는 반드시 `memberCheckKeys`/`isMemberChecked`를 거친다(신형·구형 동시 인식, 쓰기는 신형만).
- **삭제는 짝이 되는 노드를 반드시 함께 지운다** — 수련회는 `buildRetreatRemovalUpdates`(`retreats` + `retreatsPrivate`), 팀·훈련 반은 `curriculum`까지. 한쪽만 지우면 화면에서 접근 불가능한 고아가 남는다(민감정보면 더 심각).
- **전체 덮어쓰기 복구는 사전 백업 성공을 확인한 뒤에만** — `backupNodeBeforeOverwrite`의 반환값을 반드시 검사한다(`if (!backedUp) throw`). 스로틀된 상시 저장 백업만 예외다.
- **출석 표**(`AttendanceGrid`)의 셀은 토글이 아니다. 셀을 누르면 출석·지각·결석·지우기를 명시적으로 고른다(멱등 기록 — 실수 규칙 11). 상태 메뉴 좌표는 클릭한 셀에서 즉시 계산하고 닫을 때 좌표도 비워 이전 셀의 흰 메뉴가 한 프레임 튀지 않게 한다.
- `.input`은 `@layer` 밖 규칙이라 `width:100%`가 유틸리티 `w-*`를 이긴다. 폭은 감싼 div로 주고, 높이는 `h-*`로 고정하지 않는다(모바일 16px 글꼴에서 글자가 잘린다).

## Firebase 안전

- 기존 앱의 경로·스키마·민감정보 분리를 그대로 유지합니다. `classes`·`attendance`·`trash` 쓰기는 위 새친구 신규 학생 단건과 그 결정적 `nf_` 학생의 검증된 되돌리기 외에는 추가하지 않습니다.
- 새 경로는 반드시 해당 도메인의 `paths.ts`에 먼저 추가합니다.
- `retreatsPrivate/*`, `semestersPrivate/*` 데이터가 현장 화면이나 일반 사용자에게 노출되지 않게 합니다.
- Firebase Rules는 이 앱에서 배포하지 않습니다.

## 운영 원칙

1. 기존 기능 동등성과 DB 호환 계약을 회귀 테스트로 유지합니다.
2. PC·375px과 권한별 계정으로 저장·인쇄·실시간 갱신을 검증합니다.
3. 수련회 행정·현장 모듈의 쓰기 경계와 권한 판정을 계속 분리합니다.
4. 레거시 코드 복구가 필요하면 `pre-legacy-app-removal-2026-08-05` 태그를 사용합니다.

상세 계획은 `../docs/UNIFIED_HIGHSCHOOL_MIGRATION.md`를 참고합니다.
