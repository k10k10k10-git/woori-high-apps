# 고등부 통합 웹페이지 운영 지침

루트 `../CLAUDE.md`가 최우선 규칙입니다. 이 문서는 통합 앱에만 해당하는 보충 지침입니다.

## 목적

학기 사역, 수련회 행정, 이가드 현장 기능을 `highschool-app` 한 코드베이스와 배포 단위로 운영합니다. 독립 `retreat-app`·`iguard-app`은 2026-08-05 제거했지만 운영 DB 경로와 데이터 형태는 그대로 유지합니다.

## 라우트

- `/`: 통합 홈
- `/ministry-guide`: 위키에서 추린 월별 사역 흐름·부서 운영 가이드 라인(권한 있는 담당자 편집 가능)
- `/semesters`, `/semester/[id]`: 학기 중 사역
- `/sunday-ministry`, `/sunday-ministry/[team]`: 학기 구분 없는 주일 사역. 팀은 `행정팀`(`admin`)·`바나바팀`(`barnabas`)·`예배팀`(`worship`)·`찬양팀`(`praise`)·`미디어팀`(`media`)·`기획디자인팀`(`design`) 여섯입니다. 팀 없는 `/sunday-ministry`는 **PC에서 기존 기본 팀 화면을 유지하고 모바일에서는 접근 가능한 팀 선택 화면**을 보여 줍니다.
- `/retreats`, `/retreat/[id]`: 수련회 행정
- `/programs`, `/retreat/[id]/programs`: 수련회 프로그램 준비. 수련회당 기본 2개 초안을 선택 생성하고 필요하면 3개 이상으로 늘립니다.
- `/retreat/[id]/field`: 이가드 현장 운영

서비스 이름은 **분당우리교회 서현고등부**이고, 운영 주소는 `https://woorihigh-app.vercel.app` 입니다(구 `highschool-app-flame.vercel.app`도 같은 배포를 가리킵니다).

**배포는 2026-08-29부터 자동입니다.** Vercel 프로젝트가 `k10k10k10-git/woori-high-apps`에 연결돼 있고 Root Directory는 `highschool-app`입니다 — `main`에 푸시하면 배포가 시작됩니다. 수동 배포가 필요하면 **저장소 루트에서** `npx vercel --prod`를 실행하세요(`.vercel/` 링크가 루트에 있고 Root Directory가 앱 폴더라, 앱 폴더 안에서 실행하면 경로가 어긋나 깨집니다). Ignored Build Step `git diff --quiet HEAD^ HEAD -- .`가 걸려 있어 이 폴더 밖만 바뀐 푸시는 빌드를 건너뜁니다 — 그때 새 배포가 안 잡히는 건 정상입니다.

## 화면 셸 규칙

- 사이트 제목·계정·로그아웃·상단 메뉴는 `GlobalPortalHeader` 하나만 담당합니다. 하위 화면에 "수련회 행정시스템" 같은 제목 줄을 다시 만들지 않습니다(제목 2줄 중복 금지).
- PC 헤더의 계정 제어 순서는 **`PC버전/모바일버전` → `라이트/다크 모드` → `마이페이지`**입니다. 저장된 선택이 없는 첫 접속만 실제 900px 이하 뷰포트를 모바일 기본값으로 사용하며, 사용자가 고른 화면 모드는 이후 창 너비보다 우선합니다. `PC버전`은 처음부터 같은 출처의 최소 1280px iframe 하나에서 실행해 창을 줄이거나 늘려도 React 트리와 문서를 교체하지 않으며, 좁은 창은 가로 스크롤로 PC 화면을 유지합니다. `모바일버전`은 PC용 미리보기 제어 막대 아래 같은 출처의 430px iframe으로 실행합니다. 내부 프레임 표식 `__portalFrame=desktop`은 바깥 주소에 노출하지 않고, iframe의 경로만 바깥 URL과 동기화합니다. 데스크톱 DOM을 CSS로 억지 축소하거나 반응형 분기를 수동 덮어쓰지 않습니다.
- 모바일 학기 화면은 `출석 / 신청·배치 / 커리큘럼 / 운영`, 주일 화면은 팀 선택 후 해당 팀 탭, 방학 현장은 `큐카드 / 포스트 / 인원체크 / 정보`를 1차 업무축으로 씁니다. PC의 기존 상세 탭과 URL은 제거하거나 이름을 바꾸지 않습니다.
- 상단 메뉴는 **학기 중 사역 / 주일 사역 / 방학 중 사역 / 사역 가이드 / 사이트 건의사항** 순서입니다. 주일 사역과 방학 중 사역은 **둘 다 hover 드롭다운**이며 공용 `NavDropdown`(`GlobalPortalHeader.tsx` 내부) 하나를 씁니다 — 마크업·키보드·바깥클릭 동작이 갈라지지 않게 여기에만 두고, 열림 상태는 부모의 `openMenu`가 들어 한쪽을 열면 다른 쪽이 닫힙니다. 주일 사역은 `행정팀`·`바나바팀`·`예배팀`·`찬양팀`·`미디어팀`·`기획디자인팀`, 방학 중 사역은 `수련회 행정팀`(`/retreats`)·`수련회 프로그램팀`(`/programs`)·`수련회 이가드팀`(`/field`)으로 갈라집니다.
- **주일 사역의 팀·탭 배치는 `featureCatalog.ts`의 `SUNDAY_MINISTRY_TEAMS`가 단일 원천**입니다. 화면이나 헤더에서 팀 목록을 다시 적지 않습니다. 팀별 `tabs`의 합집합은 반드시 `SUNDAY_MINISTRY_TABS`와 같아야 하며(중복 배치도 금지) `featureCatalog.test.ts`가 이 계약을 지킵니다 — 팀을 늘리거나 탭을 옮길 때 탭이 조용히 사라지는 것을 막습니다. 찬양·미디어·기획디자인팀은 기능 확정 전까지 `tabs`가 비어 있고, 탭 바 없이 준비 중 화면만 렌더합니다.
- **예배팀 자리 배치**(`features/sundayWorship`)는 Rules를 바꾸지 않으려고 **사역 가이드와 같은 공유 노드**(`prepMilestones`)에 `sourceSite=sunday-worship-seating` 조각으로 저장합니다. `note`가 500자 제한이라 **분단 하나 = 레코드 하나**로 쪼개고, id는 `ws_{YYYYMMDD}_{부}_{분단}`으로 결정적입니다. 분단을 줄이면 남은 레코드를 같은 update에서 `null`로 지워 화면에 없는 분단이 DB에만 남지 않게 합니다. **일정 구독 두 곳**(`lib/db/shared.ts`·`features/iguard/lib/db.ts`)이 `isWorshipMilestone`으로 이 조각을 걸러냅니다 — 새 조각을 추가하면 두 곳 모두 갱신하세요.
- 화면은 **줄 × 분단 표**입니다. 왼쪽에 줄 번호를 세우고 분단을 열로 놓아 실제 좌석표와 같은 모양으로 읽습니다. **줄 높이는 `gridTemplateRows`로 고정값(`3.75rem`)을 줍니다** — `auto`로 두면 내용이 있는 줄만 커져 분단끼리 줄이 어긋나고, 좌석표에서 줄 정렬은 장식이 아니라 기능입니다. 칸 안 숫자는 `.input`을 쓰지 않고 직접 그려(`CELL_NUMBER`) 글자처럼 납작하게 둡니다.
- 칸 안 숫자는 **`2줄`처럼 단위를 붙여** 보여줍니다. `type="number"`는 웹킷 스피너가 좁은 폭을 다 먹어 숫자가 사라지므로 **`type="text" + inputMode="numeric"`**을 쓰고 입력값에서 숫자만 걸러 받습니다. 입력칸 폭을 글자 수에 맞춰야 단위와 붙어 보이는데, 그러면 클릭 영역이 좁아지므로 `label`로 감싸 "줄" 글자를 눌러도 포커스가 잡히게 합니다.
- 칸 색은 **고정석(에메랄드) / 자동 계산값과 다른 칸(앰버) / 그대로(기본)** 세 가지이고, "고친 칸"은 저장하지 않고 `block.rows !== rowsForAverage(...)`로 파생합니다. 하단 범례가 이 세 가지를 설명합니다.
- 격자는 **분단 × 분단별 줄**이고 **한 반이 여러 줄을 차지**합니다. 배치도의 `1-5(2)`는 인원이 아니라 그 반이 쓰는 **줄 수**입니다. 인접은 같은 분단의 위아래(앞뒤)와 인접 분단의 같은 줄(좌우)이며, 블록이 **위에서 두 줄과 겹치면 앞자리**입니다(`isFrontBlock`).
- **줄 수 = 올림((지난 3주 출석 평균 + 담임 1명) / 한 줄 의자 6개)** 입니다(`rowsForAverage`). 전체 명단으로 계산하면 허수가 많아 출석 평균을 씁니다. 출석은 `O`(출석)와 `T`(지각)만 세고, 셀 키는 학생 출석부의 `evKey`와 같은 `{월 인덱스}-{그 달 몇 번째 주일}` 규칙입니다(`sundayCellKey`) — 이 규칙이 어긋나면 출석을 못 읽습니다. 해가 바뀌는 주는 다른 연도 노드라 계산에서 뺍니다.
- 화면의 반 라벨은 `학년-반`이고 **예배 부는 classKey(`part-grade-class`)의 앞자리**로 매칭합니다(`classKeysForService`).
- ⚠ **이 앱의 타입 스케일은 좁습니다** — `text-xs`=12px, `text-sm`=13px, `text-base`=14px, `text-lg`=17px. Tailwind 기본값(12/14/16/18)과 달라서 한 단계 올려도 1px밖에 안 커지는 구간이 있습니다. 글씨를 실제로 키우려면 두 단계를 올리거나 실측으로 확인하세요.
- ⚠ 이 화면의 숫자 입력칸은 **폭을 감싼 div로, 글꼴·좌우 여백을 인라인 style로** 줍니다(`NUMBER_INPUT`). `.input`이 `@layer` 밖이라 `w-*`·`text-xs`를 모두 이기고, 기본 좌우 패딩 14px씩이면 콘텐츠 폭이 14px만 남아 숫자가 잘립니다(실제로 반 이름 폭이 0이 된 적 있음). **`min-h-*`도 마찬가지로 먹히지 않습니다** — 예배 자료의 본문 textarea는 `BODY_TEXTAREA` 인라인 style로 높이를 줍니다(유틸리티만 쓰면 320px가 65px로 찌그러집니다).
- **예배 담당표**(`sourceSite=sunday-worship-duty`)는 역할 한 줄 = 레코드 하나이고, **학생 명단을 구독하지 않습니다** — 이름은 직접 입력합니다. 명단을 끌어오면 이 화면 하나 때문에 개인정보 공개 범위를 새로 정해야 하므로, 편의를 위해 명단 연동을 추가하지 마세요.
- **예배 자료**(`sourceSite=sunday-worship-doc`)는 본문이 500자를 넘으므로 320자 조각으로 나눠 저장하고 읽을 때 합칩니다. **조각이 하나라도 비면 그 문서는 기본값을 씁니다** — 반쪽 문서를 만들지 않기 위한 계약이고 `worshipContent.test.ts`가 지킵니다. 기본 문서는 `DEFAULT_WORSHIP_DOCS`이고 저장된 수정본이 그 위를 덮습니다.
- 팀 라우트를 오갈 때 클라이언트가 재사용될 수 있으므로 **선택 탭은 렌더 중 파생으로 보정**합니다(`tabs.find(...) ?? tabs[0]`). effect에서 setState로 맞추면 실수 13(시계·자동 선택이 사용자 선택을 덮음)과 같은 부류의 회귀가 납니다.
- 우측 계정 메뉴의 **마이페이지**는 모든 로그인 사용자에게 열고 `대시보드`·`내 사역`·`내 요청`을 공통 제공한다. 통합관리자에게만 `팀원 관리`·전체 `요청사항` 탭을 추가한다. 역할별 대시보드는 `accessPolicy.ts`의 capability로 일정과 바로가기를 필터링하며 역할 문자열을 컴포넌트에서 직접 비교하지 않는다. 학기 신청과 현장 스탭 연결은 현재 계정 이름 후보가 유일할 때만 표시하고 동명이면 미연결 상태를 유지한다. 별도 집계 노드를 만들지 않고 기존 `semesters`·`retreats`·`prepMilestones`·`iguard`·본인 `siteRequests`를 활성 탭에서 실시간 구독한다. 사이트 건의사항은 공유가 아니라 `iguardPending/{uid}/siteRequests/{requestId}`로 전송한다. 이 경로는 기존 Rules의 사용자 자기 읽기·쓰기와 통합관리자 전체 읽기·쓰기를 재사용하며, 접근 승인 필드(`email`·`name`·`requestedAt`)와 반드시 분리해 정규화한다. 승인·거절 시 사용자 노드 전체를 지우지 말고 접근 필드만 지워 요청을 보존한다. 첨부는 JPEG로 재인코딩·축소한 뒤 Firebase Storage의 `site-requests/{uid}/{requestId}/attachment.jpg`에 두고, RTDB 요청에는 이름·크기·Storage 경로·다운로드 주소만 저장한다. 분리 전 `dataUrl` 첨부는 읽기 호환만 유지한다. 요청 삭제 시 Storage 파일을 먼저 지우고 요청 레코드를 지운다. 해결 시 `resolvedAt`을 기록하고 작성자는 다음 로그인 때 한 번 알림을 받은 뒤 `notifiedAt`을 남긴다.
- **방학 중 사역 홈은 화면 하나**입니다. 세 경로 모두 `features/portal/VacationHome.tsx`를 렌더하고, `mode`("admin"/"program"/"field")로 **수련회에 들어갔을 때의 목적지만** 달라집니다(행정 화면 / 프로그램 준비 / 현장 화면). 목록·수련회 기간·준비 일정 캘린더는 완전히 같은 컴포넌트를 씁니다. 각 라우트는 로그인·권한 게이트와 도메인 전용 요소(행정: 폼 가이드·삭제·브레인스토밍 / 프로그램: 프로그램별 편집 / 현장: PIN 배지·현장 관리자)만 슬롯으로 넘깁니다.
- **프로그램 준비의 공개 원본은 `retreats/{id}/programs/{programId}`**입니다. 행정 권한자가 초안·검토·확정·현장 공유 상태와 기획·진행안·규칙·브리핑·대본·물품·할 일을 관리합니다. `tasks`는 `todo / doing / blocked / done` 실행 상태를 쓰되 구버전 `done` boolean도 계속 읽습니다. 준비회의 원문과 결정은 현장 역할에 노출하지 않고 **`retreatsPrivate/{id}/programMeetings/{programId}/{meetingId}/decisions/{decisionId}`**에 둡니다. private 구독은 편집 권한자에게만 열고 공개 프로그램 캐시에 넣지 않으며, 결정→할 일 전환은 결정적 작업 ID와 최신값 사전 확인 후 public 작업·private 링크를 root multi-location update 한 번으로 반영해 재시도에도 기존 작업을 덮지 않습니다. `posts`는 구버전의 게임 카드를 그대로 보존하면서 `operationMode`(전체 진행·코스 순환·조별 협력·연합팀 경쟁·전환)와 `participationMode`, 선택적 `testStatus`·`blocker`를 가진 순서형 진행 블록으로 확장합니다. `competitionTeams`는 프로그램 안에서만 여러 기본 조를 묶는 연합팀이며, **행정 `groups`를 절대 수정하지 않고 groupIds로 참조만** 합니다. 화면 방문만으로 초안·회의·팀을 만들지 않고 사용자가 만들기·추가·적용을 눌렀을 때만 씁니다. 이가드는 공개 노드를 읽되 `status=published`인 프로그램만 정보 화면에 읽기 전용으로 노출합니다. 별도 복사 노드나 현장용 파생 저장을 만들지 마세요. **현장의 구독은 `features/iguard/lib/db.ts`의 읽기 전용 영역을 거칩니다** — 훅이 `@/lib/db` 배럴을 직접 쓰면 삭제·수정 함수까지 사정권에 들어와 소유권 경계가 무의미해집니다(실수 1). 필터는 화면 단이므로 상태 설명 문구도 "현장에 공유하지 않습니다"가 아니라 "현장 정보 화면 목록에 표시되지 않습니다"로 정확히 씁니다. 편집기는 **작성 중(dirty)에 들어온 원격 갱신으로 초안을 덮지 않습니다** — `shouldSyncEditorDraft`가 판단하고 배너로 알리며, 판단 함수는 `programPreparation.test.ts`가 지킵니다. 상태·종류 라벨은 `programStatusMeta`/`programKindMeta`로 읽어 모르는 값에도 화면이 죽지 않게 합니다.
- **프로그램 편집기는 상단 내비게이션 4개 섹션**입니다 — `전체 준비 / 프로그램 작업실 / 물품·역할 / 현장 공유`. 단일 원천은 `programPreparation.ts`의 `PROGRAM_SECTIONS`이고, 현재 섹션은 **URL 쿼리 `?section=`**에 둡니다. 탭은 방향키·Home·End 이동과 `tabpanel` 연결을 제공해야 합니다. 목록 첫 화면은 프로그램 수보다 기한 지남·막힘·담당 없음·현장 점검 남음을 우선 보여 주며, 프로그램 카드는 **작업 완료와 현장 점검을 별도 지표**로 표시합니다. 본문 fieldset은 **초안 저장**이고 게임·포스트·역할·물품·할 일·회의는 각각 하위 경로에 **입력 즉시 경로 단위 update로 저장**합니다. 수동 저장 버튼은 변경이 있을 때 상단 sticky 도크로만 노출하고, 준비 보드의 다음 행동은 탭만 여는 것이 아니라 `targetId`로 정확한 미완료 입력을 펼치고 포커스합니다. 진행 블록 순서 변경은 `posts/{postId}/order`만 root multi-path update하며 전체 프로그램을 덮어쓰지 않습니다. 점검 화면의 이가드 미리보기와 실제 이가드 현장은 공용 `PublishedProgramCard`를 사용해 표시 차이를 만들지 않습니다. ⚠ **본문 저장 payload에서 `tasks`·`meetings`·`posts`·`items`·`roles`·`competitionTeams`를 반드시 제거**하세요(`withoutTasks`) — 하나라도 남으면 `update()`가 그 맵을 통째로 덮어 다른 사람이 추가한 항목이 사라집니다(실수 2). 물품 금액은 `programItemTotal`(수량×단가), 합계는 `programBudget`이 계산하며 `교회에 있음`·`제작 예정`은 지출에서 뺍니다. 이 계산은 `programPreparation.test.ts`가 지킵니다.
- **현장 공유는 일반 기획 상태가 아닙니다.** 기본 정보의 상태 셀렉트에서는 `published`를 새로 선택할 수 없고, `점검·현장 공유`에서 10개 현장 준비 기준이 100%이고 모든 실행 할 일이 완료됐을 때 명시적 확인을 거쳐서만 `status=published`를 저장합니다. 공유 해제도 같은 화면의 별도 확인 동작으로 `confirmed`에 되돌립니다. 준비 보드는 미완료 전체를 한꺼번에 펼치지 않고 다음 3개 행동을 먼저 보여 주며, 역할·물품 누락은 집계 탭이 아니라 실제 입력 원본인 프로그램 구성으로 연결합니다. 프로그램 구성의 `ProgramRunOfShow`는 순서·시간·장소·담당을 요약할 뿐 새 데이터를 저장하지 않고 같은 진행 블록 카드를 펼칩니다.
- **준비 작업의 단위는 프로그램이 아니라 게임입니다.** 준비 시트가 게임 탭 하나에 규칙·준비물·스탭을 함께 두던 구조를 따릅니다 — 물품·역할은 `postId`로 게임에 묶이고 **입력은 게임·포스트 탭의 카드 안에서** 합니다. `물품·예산`·`역할·배치` 탭은 입력창이 아니라 **게임별로 묶어 보는 집계·구매 체크 화면**이고, 프로그램 공통 항목만 여기서 더합니다. 이 연결을 끊고 물품을 프로그램 단위 자유 텍스트로 되돌리면 같은 게임 이름을 세 번 타이핑하고 탭을 세 번 오가게 됩니다(2026-08-29 되돌린 설계). `postId`가 없거나 삭제된 게임을 가리키는 항목은 `commonItems`/`commonRoles`가 공통 묶음으로 거둬 데이터가 사라지지 않게 합니다. 준비율(`CHECKS`)은 본문 5개에 더해 게임·역할·물품·사전 테스트·막힘까지 10개를 보며, **존재 여부가 아니라 내용**을 봅니다 — 이름만 있는 게임·담당 없는 역할·수량 없는 물품으로는 100%가 되지 않습니다(지표가 거짓말하지 않게).
- **같은 사실을 두 번 받지 않습니다.** 준비물·스탭 역할의 단일 원천은 게임 카드의 `items`·`roles` 표이고, 게임 카드에 자유 입력 textarea를 되살리지 마세요(`POST_FIELDS`에서 `materials`·`staffRoles` 제거). 이미 적혀 있던 값은 `PostLegacyText`가 표 위에 읽기 전용으로 띄워, 옮긴 뒤 직접 지우게 합니다 — 감추면 사라진 것처럼 보입니다.
- **행 단위 입력은 `ProgramAutosaveField`만 씁니다.** uncontrolled `defaultValue`로 되돌리면 구독으로 바뀐 값이 화면에 반영되지 않고, 그 상태로 저장할 때 다른 사람이 방금 넣은 값을 과거 값으로 덮어씁니다. 편집 중 원격 변경이 오면 저장을 막고 최신 값을 알립니다. 행 삭제는 확인창 대신 되돌리기(`useProgramUndo` + `restoreRetreatProgram*`)로 같은 id 경로에 복구합니다. 이 세 계약은 `programInteractionContract.test.ts`가 지킵니다.
- 방학 중 사역 홈의 `새 수련회`는 항상 **수련회 목록 제목 옆**에 두고, 폼 가이드·PIN 잠금·현장 관리자처럼 목록 전체에 작용하는 도구는 `VacationHome.headerActions`를 통해 **화면 우측 상단**에 둡니다. 행정·현장 라우트가 이 위치를 따로 렌더링하지 않습니다.
- 준비 일정 캘린더는 `RetreatCalendarPanel` 하나로 통일했습니다(구 `PrepCalendar` 삭제). 수련회 기간 편집은 Rules상 행정 권한이 필요하므로 `canEditPeriods`로 잠급니다 — `prepMilestones`는 이가드팀도 공유 편집합니다.
- **새 색상 계열이나 강도(`*-200` 등)를 쓰기 전에 `globals.css`의 다크 재매핑 목록에 있는지 확인하세요.** 다크모드는 토큰이 아니라 `[data-theme="dark"] :where(.bg-*-50, …)` 규칙으로 Tailwind 팔레트를 눌러 바꿉니다. 목록에 없는 계열·투명도·강도를 쓰면 **그 자리만 밝게 남습니다**. 2026-08-16에 `fuchsia`·`rose`·`cyan`, 2026-08-21에 휴강용 `amber-50/60`과 반별 명단용 `blue/orange/red-200`이 실제로 이 문제를 일으켰습니다. 새 상태색은 배경과 글자를 한 쌍으로 추가하고 양 테마에서 대비를 실측하세요. 어두운 헤더의 작은 배지는 배경색 토큰 `--color-primary-light`가 아니라 `--color-badge-text`를 씁니다.
- 통합 브랜드 색: 학기·수련회 행정·이가드 모두 `globals.css`의 미드나이트 인디고·코발트·틸 토큰을 공유합니다. `.semester-scope`와 `.iguard-scope`는 배경·최소 높이만 제공하며 도메인별 원색으로 토큰을 재정의하지 않습니다. 상태 의미(정상·검토·위험)에만 에메랄드·앰버·로즈를 사용합니다.
- **수련회 PIN 잠금은 `useRetreatPinGate` 하나로만 판정합니다**(`src/features/portal/useRetreatPinGate.ts`). 잠금은 `retreats/{id}/iguard/accessLock` 한 노드에만 있으므로 **행정·이가드 어느 쪽에서 잠가도 양쪽이 잠깁니다**. 화면마다 구독을 새로 짜면 한쪽만 잠기는 사고가 납니다. 설정 UI는 공용 `AdminModal`(현장·행정 홈이 함께 씀), PIN 우회는 통합관리자만.
- **모달은 `aria-modal="true"`가 있어야 배경 스크롤이 잠깁니다.** `ModalScrollManager`(`providers.tsx`)가 OverlayShell이 아니라 **`[aria-modal="true"]` 존재 여부**를 MutationObserver로 보고 `body`를 고정합니다. 새 모달을 만들 때는 공용 `OverlayShell`을 쓰고(ESC·포커스 트랩·백드롭까지 함께 옵니다), 기존 모달을 손댈 수 없으면 최소한 `role="dialog" aria-modal="true" aria-label`을 붙이세요. 2026-08-16에 수련회 행정·이가드 모달 14곳에 이 속성이 없어 모바일에서 배경이 밀리던 것을 일괄 보강했습니다.
- **로드 실패 배너는 `useLoadErrors(scope)` 하나만 씁니다**(`src/lib/useLoadErrors.ts`). 실패를 경로별로 모아 **전부** 나열하고, `scope`(학기 id·계정 uid)가 바뀌면 렌더 중 파생으로 초기화합니다. 단일 `loadError` 문자열로 되돌리지 마세요 — 5개 구독이 동시에 거부돼도 마지막 하나만 보여 2026-08-08에 권한 공백의 원인을 두 번 잘못 짚었습니다. 저장·삭제 실패는 `actionError`로 분리합니다. ⚠ Firebase RTDB는 **한 번 거부된 리스너를 규칙이 바뀌어도 재시도하지 않습니다** — 권한을 열어도 그 탭은 새로고침(재구독) 전까지 실패 상태로 남습니다.

## 권한 — 두 축 역할 (단일 원천: `src/features/portal/accessPolicy.ts`)

역할은 **두 축**입니다. 한 사람이 학기 역할과 방학 역할을 동시에 갖고, **화면이 자기 영역에 맞는 축을 골라 씁니다** — "지금이 학기인가"를 따지지 않습니다(수련회 준비는 학기 중에 시작하고, 개학 후에도 정산이 남습니다).

| 화면 | 적용 축 |
|---|---|
| 학기 사역(`/semesters`, `/semester/[id]`) · 주일 사역(`/sunday-ministry`) | **학기 역할** |
| 수련회 행정(`/retreats`, `/retreat/[id]`) · 프로그램(`/programs`, `/retreat/[id]/programs`) · 현장(`/field`, `/retreat/[id]/field`) | **방학 역할** |
| 홈 · 공유 일정 · 통합검색 · 사역 가이드 · 건의사항 | 두 축 중 열려 있는 쪽 |

**학기 역할 (10종)** — 학기 화면 / 주일 화면

| 역할 | 학기 | 주일 | 학기 설정 | 학기 삭제 | 출석부 반영 |
|---|---|---|---|---|---|
| 통합관리자 | 수정 | 수정 | ✅ | ✅ | ✅ |
| 교역자 | 수정 | 수정 | ✅ | ✅ | ✕ |
| 스탭팀장 | 수정 | 수정 | ✅ | ✕ | ✕ |
| 행정팀 | 수정 | 행정팀 수정·다른 팀 조회 | ✅ | ✕ | ✅ |
| 바나바팀 | 조회 | **바나바팀만 수정** | ✕ | ✕ | ✕ |
| 예배·찬양·미디어·기획디자인팀 | 조회 | **자기 팀만 수정** | ✕ | ✕ | ✕ |
| 사역팀(미지정) | 조회 | 접근 없음 | ✕ | ✕ | ✕ |

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

**출석부 반영은 `canWriteStudentRoster(roles)`가 허용하는 학기 역할 `superAdmin`·`adminTeam`만 실행합니다.** 행정팀은 2026-08-12 Rules 보강으로 열렸고, `classes/{year}/{ck}/students/{sid}`·`attendance/{year}/{ck}/{sid}`·`trash/{year}/students/{sid}` **학생 1명 경로**만 씁니다. 반 노드 전체(`students` 통째·`teacher`)와 `trash` 노드 전체는 통합관리자·담임 그대로입니다. `semesterRole`은 `retreatAdmins` 쓰기가 통합관리자 전용이라 자가 승급이 불가능합니다. 계약은 `accessPolicy.test.ts`와 `attendance-app/__tests__/rulesContract.test.ts`가 지킵니다.

※ **화면 차단 ≠ 실제 차단.** Rules는 그 외에는 세 버킷만 구분합니다. 아래는 화면에서만 막히며, 실제 차단은 Rules 변경이 필요합니다.
- 행정 화면의 **조회 전용 모드**는 `RetreatEditProvider`(`features/portal/RetreatEditContext.tsx`) + `RetreatPageClient`의 `<fieldset disabled className="contents">` 두 겹입니다. fieldset이 내부 `button`·`input`·`select`·`textarea`를 브라우저 수준에서 잠그고(클릭 이벤트도 발생하지 않음), `display:contents`라 레이아웃에는 영향이 없습니다. 드래그처럼 폼 요소가 아닌 조작은 각 컴포넌트가 `useRetreatCanEdit()`으로 따로 잠급니다(`GroupComponents`·`RoomsTab`의 `draggable`). 새 행정 탭을 만들 때 드래그·div 클릭 편집이 있으면 이 훅을 반드시 쓰세요.
- 이가드팀·스탭팀장의 행정 **조회**는 민감 탭을 감춰야 성립합니다. `ParticipantsTab`의 `getSyncDuplicates`는 `retreatsPrivate`라 실패해도 명단이 보이도록 `.catch(() => [])`로 삼킵니다 — 이 방어를 지우면 조회 전용 역할에게 첫 탭이 통째로 에러가 됩니다.
- 사역팀의 "내 팀만 편집", 민감정보 실차단, 스탭의 `classes` 전체 읽기 차단도 Rules 작업입니다.

**원칙: 화면에서 막는 것은 언제나 안전하지만, 화면에서 여는 것은 Rules가 허용할 때만 합니다.** (Rules가 막는 걸 화면에서 열면 "눌렀는데 실패"가 됩니다.)

- 화면 게이트는 `canAccessArea` / `canEditArea` / `iguardScopeOf` / `canManageRolesOf`와 목적별 함수(`canDestroySemester`·`canCreateRetreat`·`canSeeSensitiveRetreat` 등)만 사용합니다. 컴포넌트에서 역할 문자열을 직접 비교하지 않습니다.
- 인증과 역할 조회는 루트 `src/context/AuthContext.tsx`에서 한 번만 수행하고 역할 판정은 `resolveMinistryRoles`(순수) 하나로 처리합니다. 삭제된 `src/features/iguard/context/AuthContext.tsx` 어댑터를 다시 만들거나 별도 인증·역할 구독을 추가하지 않습니다.
- 역할 배정 쓰기는 `roleAssign.planRoleAssignment`(순수·테스트) → `applyRole.applyRoleSteps`(실행) 경로만 사용합니다. 부여를 먼저, 해제를 나중에 실행합니다.
- 학기 화면의 편집 잠금은 `features/semester/EditContext`의 `useSemesterCanEdit()`으로만 판단합니다.
- 스탭의 학기 **조회**는 2026-08-08 Rules 보강으로 열렸습니다 — `semesters` `.read`에 `iguardMembers`가 추가됐습니다. `.write`는 계속 `admins`/`retreatAdmins`만이고, 연락처가 있는 `semestersPrivate`는 **행정 전용 그대로**입니다. 즉 스탭은 `semesters/*`(명단·팀·훈련 반·회차·출석·커리큘럼)를 읽지만 저장은 못 합니다. Rules는 학생 앱에서만 배포합니다.
- 행정 권한과 이가드 권한의 **쓰기 경계**는 계속 분리합니다. 이가드팀은 수련회 행정 명단을 조회할 수 있지만 저장은 현장 모듈의 허용 범위에서만 합니다.

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
- 이가드 `IguardClient`의 workspace는 `key={id}`로 수련회 ID가 바뀔 때 상태를 새로 시작합니다. `useRetreatData`는 metadata의 `id`가 현재 ID와 일치할 때만 해당 `year`로 데이터 구독을 시작하고, 해제된 metadata·연결·데이터 구독의 성공·오류 콜백이 상태나 workspace 캐시를 갱신하지 못하게 합니다. 같은 수련회의 이름·날짜나 현장 뷰 변경을 workspace key에 넣어 구독을 다시 열지 않습니다. metadata 조회 실패는 실제 수련회 없음과 구분해 화면에 오류로 표시합니다.
- `PortalHome`과 `useMyPageData`의 전체 기간 구독은 수련회 객체 배열 대신 **순서를 보존한 ID 목록**에 의존합니다. 이름만 갱신되어도 제목은 새로 표시하되 기간 구독은 유지하고, ID 추가·삭제·순서 변경에는 다시 구독합니다. 같은 날짜의 기간 선택은 기존 목록 순서를 사용하므로 ID를 정렬해서는 안 됩니다. 마이페이지의 현장 데이터 구독도 수련회 객체 대신 현재 `id`에 의존합니다.
- 인물 통합검색은 검색창이 열린 동안에만 권한이 허용한 루트를 구독합니다. 각 루트는 최상위 child 추가·변경·삭제분을 병합해 한 경로 변경 때문에 전체 루트를 다시 받지 않도록 하고, 검색창을 닫으면 전부 해제합니다.
- 인증·권한 판정, 저장/삭제 직전 최신값 확인, 백업·복구, 멱등성 검증, 버튼으로 실행하는 외부 시트 가져오기는 일회성 `get`을 유지합니다. 이 조회는 화면 캐시가 아니라 거래 안전과 명시적 명령의 일부입니다.
- 구독 화면에서 저장 성공 뒤 배열에 같은 항목을 수동 append하지 않습니다. Firebase echo가 같은 항목을 다시 전달해 중복 표시될 수 있으므로 표시 상태는 구독 콜백을 단일 원천으로 둡니다. 입력 중 초안·드래그 배정처럼 로컬 편집 보호가 필요한 화면은 기존 dirty/ref 충돌 방지를 유지합니다.
- 이 전환은 읽기 방식만 바꾸며 DB 경로·데이터 구조·Rules를 바꾸지 않습니다. 출석부 앱이 `classes`를 저장하면 RTDB 값이 먼저 바뀌고, 열린 통합사이트 구독 콜백이 그 변경값으로 화면 파생 결과를 다시 계산합니다.

## 학기 사역 계약 (2026-08-06)

- **접수 원칙**: 훈련(`trainingClassId`)을 신청해야 사역팀(`choice1`)에 지원할 수 있다. 예외는 **고3 2학기와 스탭**. 판정은 `features/semester/intakeRule.ts`(순수)만 사용하고 화면에서 조건을 재구현하지 않는다.
- `trainingOnly`는 계속 저장하되 `deriveTrainingOnly`로 파생한다 — 출석·수료 명단(`roster.ts`)이 쓰는 기존 계약이라 직접 세팅하지 않는다.
- **훈련 명단**은 훈련 반 배정자 전원이다(사역팀을 겸하는 사람 포함). 레거시 `trainingOnly=true`도 훈련 신청으로 흡수한다.
- **회차 유형**은 `sessionKind.ts`로만 변환한다. 선택지는 `개강`·`종강`·`휴강`·`직접 입력`이고 신규 기본값은 `직접 입력`이다. 개강·종강·휴강은 `훈련&사역팀 …` 표준 문구로 표시하며 레거시 짧은 라벨도 화면에서 정규화한다. 저장 스키마(`type`/`label`)는 그대로이고, **출석 집계(만점)에서 빠지는 것은 `휴강`뿐**이다(`completion.regularSessions`).
- **1박 2일 이상의 회차**는 기존 `date`를 시작일로 유지하고 같은 회차에 선택 필드 `endDate`를 붙인다. 출석·커리큘럼 키는 계속 회차 `id` 하나를 사용해 날짜 수만큼 중복 집계하지 않는다. 날짜 검증·표시는 `sessionDate.ts`, 저장 시 종료일 삭제는 `updateSessionDates`가 담당한다.
- 훈련 반 삭제는 `trainingClass.ts`의 루트 다중 경로 update로 신청자 참조까지 함께 정리한다(팀 삭제와 같은 패턴).
- **학기 삭제**(`removeSemester`)는 `semesters/{sid}`와 `semestersPrivate/{sid}`를 한 번의 루트 update로 지운다. 되돌릴 수 없으므로 화면에서 **학기 ID를 직접 입력받아** 확인한 뒤에만 호출한다.
- **수련회 생성**은 행정·이가드 공용 컴포넌트 `features/portal/NewRetreatButton.tsx` 하나만 쓴다. `retreats/{id}`가 공유 노드라 어느 화면에서 만들어도 양쪽 목록에 나타난다. 쓰기는 행정 db(`@/lib/db`)가 담당하고 버튼은 `canEditPortalArea("retreat-admin")`로 게이트한다.
- **화면에서 교사·스탭은 학생과 섞지 않는다.** 스탭은 훈련·지망·보호자 연락처가 모두 없어 읽는 항목 자체가 다르고, 팀마다 고정으로 붙어 있어 같이 나열하면 학생 현황이 묻힌다. 신청 탭 접수 명단은 스탭을 **접힌 그룹**으로 따로 두고(기본 접힘), 배치 탭 팀 카드는 명단에 학생만 두고 스탭은 **카드 헤더 우측 토글**로 펼친다(한 번에 하나만). 구분은 `splitStudentsAndStaff`/`isStaffApplication` 하나만 쓴다. 명단 상세 모달도 스탭 칸을 접어서 연다(학생 칸은 항상 펼침). 단 **학생이 없는 팀은 스탭을 펼친 채로 연다** — 접어 두면 모달이 빈 채로 열려 고장으로 보인다. 같은 이유로 "학생 이름을 누르면…" 안내는 학생이 있을 때만 띄운다.
- **교사·스탭 접수**는 학생과 다른 경로다: 훈련·지망 없이 사역팀에 바로 배정한다(`intakeRule.isStaffApplicant`). 저장 시 `teamId`를 직접 채우고 `choice1/2`·`trainingClassId`는 비운다.
- **배치·커리큘럼은 두 축**이다: 사역팀(`teams`)과 훈련 반(`trainingClasses`). 커리큘럼은 `curriculum/{id}` 한 맵을 공유한다(두 축의 id가 겹치지 않는다). 훈련 반에는 `goal`이 없으므로 학기 목표 박스는 사역팀에서만 보인다.
- **홈 공유 캘린더**의 "공유 일정"은 `prepMilestones`다. 추가·수정·삭제는 Rules와 같게 스탭을 제외하고 열어 둔다(`canEditPortalArea("retreat-admin") || iguardScope === "all"`).
- **사역 가이드**의 기본값은 `features/ministryGuide/ministryGuideContent.ts`의 정적 운영 원칙이다. 권한 있는 담당자의 월별 흐름·부서 운영 가이드 수정본은 기존 공유 경로 `prepMilestones/*`에 `sourceSite=ministry-guide*`인 결정적 레코드로 나눠 저장하고, 일반 일정 구독은 이를 반드시 필터링한다. 연간 계획은 `가안`으로 표시하며 학생 실명·연락처·주소·가정·건강 특이사항과 미결 아이디어는 넣지 않는다.
- **주일 사역의 새친구 탭**은 학기 선택 없이 모든 `semesters/*/newFriends`를 통합 조회한다. 기존 학기별 기록은 이동하지 않고, 신규 기록만 학기가 아닌 연도별 내부 작업공간 `semesters/{year}-sunday/newFriends`와 `semestersPrivate/{year}-sunday/newFriendsPrivate`에 저장한다. 이 작업공간은 `meta`를 두지 않아 학기 목록에 나타나지 않는다. 행정팀은 접수·2주 과정·등록 결정·반배정을 관리하고, `classes/{year}` 반영·삭제·등반 취소는 `canWriteStudentRoster(roles)`가 참인 통합관리자·행정팀만 실행한다. 수정 가능한 접수일은 `registeredDate`(한국 기준 `YYYY-MM-DD`)로 저장하며, 감사 시각 `createdAt`은 변경하지 않는다. 기존 레코드에 접수일이 없으면 화면에서 `createdAt`의 한국 날짜를 사용한다. 이 함수는 새친구 ID 기반 결정적 학생 ID, 중복 차단, 대상 반 확인, 비공개 사전 스냅샷, 단일 학생 경로+반영 이력의 원자 update와 재조회 검증을 유지한다. `removeNewFriendFromRoster`는 결정적 `nf_` ID·현재 이름·연결 반을 재검증하고 학생·해당 출석·새친구 공개/비공개 기록을 원자 삭제한다. 삭제 직전 전체 사본은 `newFriendRosterBackups/{friendId}/removals/{timestamp}`에, 학생 복구 사본은 `trash/{year}/students/{studentId}`에 남기고 결과를 재조회한다. 일반적인 `classes`·`attendance` 쓰기 함수로 넓히지 않는다.
- **행정 변동 사항 탭**은 학생 앱 소유 `classes/{year}/{classKey}/adminChanges`를 읽기만 한다. 학생 앱이 학생 명단 수정과 같은 원자 update로 만든 감사기록이며, 통합 앱에서는 생성·수정·삭제하지 않는다. 기존 `변경 이력`은 제거하고 `학생 변동`은 `등록 현황`으로 표시한다.
- **새친구 완료 기준은 출석부 반영(`rosterSync`)**이다. `giftDate` 입력은 운영 화면에서 제거했으며 신규 저장에 사용하지 않는다. 다만 과거 `giftDate`가 있는 레코드는 완료로 계속 읽고 일반 수정으로 값을 지우지 않아 별도 DB 마이그레이션 없이 보존한다. **등반 및 배정 취소**는 새친구 공개·비공개 기록과 등록 결정·2주차 기록을 보존하고 `assignedClassKey`·레거시 `giftDate`·`rosterSync`를 해제해 `반배정` 단계로 되돌린다. 출석부 반영 후에는 `canWriteStudentRoster(roles)` 허용 역할만 실행하며, 결정적 `nf_` 학생·해당 출석을 사전 백업과 `trash`를 남긴 뒤 원자적으로 제거한다. 새친구 기록까지 지우는 `명단·출석부 삭제`와 구분한다.
- 큐싯 **구글 시트 연동은 2026-08-07 제거**했다(표 붙여넣기만 사용). `iguard/cueSheet` 노드와 db 함수는 남아 있지만 화면에서 쓰지 않는다 — 되살릴 때만 참고한다.
- **인원체크 키에 배열 인덱스를 넣지 않는다** — `checklistKeys.ts`의 `stableMemberId`(`{kind}:{ownerId}:{name}`)만 쓴다. 인덱스를 넣으면 행사 중 한 명이 불참 처리될 때 뒤 사람들의 체크가 통째로 어긋난다. 운영 DB에는 구형 인덱스 키가 남아 있으므로 판정·해제는 반드시 `memberCheckKeys`/`isMemberChecked`를 거친다(신형·구형 동시 인식, 쓰기는 신형만).
- **삭제는 짝이 되는 노드를 반드시 함께 지운다** — 수련회는 `buildRetreatRemovalUpdates`(`retreats` + `retreatsPrivate`), 팀·훈련 반은 `curriculum`까지. 한쪽만 지우면 화면에서 접근 불가능한 고아가 남는다(민감정보면 더 심각).
- **전체 덮어쓰기 복구는 사전 백업 성공을 확인한 뒤에만** — `backupNodeBeforeOverwrite`의 반환값을 반드시 검사한다(`if (!backedUp) throw`). 스로틀된 상시 저장 백업만 예외다.
- **출석 표**(`AttendanceGrid`)의 셀은 토글이 아니다. 셀을 누르면 출석·지각·결석·지우기를 명시적으로 고른다(멱등 기록 — 실수 규칙 11). 상태 메뉴 좌표는 클릭한 셀에서 즉시 계산하고 닫을 때 좌표도 비워 이전 셀의 흰 메뉴가 한 프레임 튀지 않게 한다.
- `.input`은 `@layer` 밖 규칙이라 `width:100%`가 유틸리티 `w-*`를 이긴다. 폭은 감싼 div로 주고, 높이는 `h-*`로 고정하지 않는다(모바일 16px 글꼴에서 글자가 잘린다).

## Firebase 안전

- 기존 앱의 경로·스키마·민감정보 분리를 그대로 유지합니다. `classes`·`attendance`·`trash` 쓰기는 위 새친구 신규 학생 단건과 그 결정적 `nf_` 학생의 검증된 되돌리기 외에는 추가하지 않습니다.
- 수련회 참가자의 본인·보호자 연락처는 `retreatsPrivate/{id}/participantContacts/{participantKey}`가 쓰기 원천입니다. `retreats/{id}/participants`에는 명단·배정용 공개 필드만 두고, 행정 화면만 필요할 때 비공개 연락처를 구독합니다. 이가드 구독에는 합치지 않습니다. 기존 공개 연락처는 마이그레이션 완료 전 읽기 하위호환만 허용합니다.
- 새 경로는 반드시 해당 도메인의 `paths.ts`에 먼저 추가합니다.
- `retreatsPrivate/*`, `semestersPrivate/*` 데이터가 현장 화면이나 일반 사용자에게 노출되지 않게 합니다.
- Firebase Rules는 이 앱에서 배포하지 않습니다.

## 운영 원칙

### 품질 관문과 대형 화면 경계 (2026-08-27)

- Firebase 실시간 화면의 첫 응답 준비 상태는 `src/lib/subscriptionReadiness.ts`로 합칩니다. 성공과 오류 모두 해당 구독을 ready 처리해 스켈레톤이 무한히 남지 않게 하고, 구독 해제 계약은 그대로 유지합니다.
- 수련회 모바일 참가자 명단은 한 페이지 40명만 DOM에 만들고 `content-visibility:auto`를 함께 사용합니다. 검색·필터·정렬이 바뀌면 `ParticipantsTab`의 key로 1페이지로 돌아갑니다.
- XLSX 런타임은 `loadXlsx()` 동적 import만 사용합니다. 화면 컴포넌트에 정적 XLSX import를 다시 추가하지 않습니다.
- 대형 화면의 현재 분리 경계는 `AutoAssignNamePickers`, `classRosterModel`, `RoomComponents`, `GroupComponents`입니다. `componentBoundaries.test.ts`가 오케스트레이터 1,000줄 미만과 경계 import를 고정합니다.
- CSS는 `globals.css`(토큰·기반), `operations-tables.css`(운영 표), `portal-surfaces.css`(화면별 표면 — 포털 셸·홈·워크스페이스 내비), `theme-compat.css`(Tailwind 다크 호환), `interaction-controls.css`(터치·키보드·가상화)로 나눕니다. `!important`는 호환 경계에만 둡니다. `globals.css`는 2,350줄 미만을 유지하며(`cssArchitecture.test.ts`가 지킵니다), 특정 화면에서만 쓰는 표면 규칙은 `portal-surfaces.css`에 둡니다. **이 가드가 깨지면 한계값을 올리지 말고 분리하세요** — 한계값을 올리면 globals가 다시 화면별 규칙의 쓰레기통이 됩니다(2026-08-29: polish가 추가한 표면 CSS 58줄을 `portal-surfaces.css`로 옮겨 2,394→2,328줄로 되돌렸습니다).
- CI는 `.github/workflows/highschool-quality.yml`에서 lint → typecheck → coverage → build → Lighthouse → 로그인 smoke/axe 순서로 실행합니다. 인증 E2E는 GitHub Secret `E2E_STORAGE_STATE_B64`를 `.auth/user.json`으로 복원하며, 비밀값이 없으면 건너뛰지 않고 실패합니다.
- 커버리지 하한은 줄·함수·구문 55%, 분기 45%입니다. Lighthouse 관문은 FCP 1.8초, Speed Index 3초, 접근성 0.90, Best Practices 0.85입니다.
- 운영 의존성은 패치 범위만 우선 갱신합니다. 2026-08-27 기준 React/React DOM은 19.2.8이고, Firebase 12.15.0과 Tailwind 4.2.1은 다음 패치가 없어 minor 업데이트를 보류했습니다.

1. 기존 기능 동등성과 DB 호환 계약을 회귀 테스트로 유지합니다.
2. PC·375px과 권한별 계정으로 저장·인쇄·실시간 갱신을 검증합니다.
3. 수련회 행정·현장 모듈의 쓰기 경계와 권한 판정을 계속 분리합니다.
4. 레거시 코드 복구가 필요하면 `pre-legacy-app-removal-2026-08-05` 태그를 사용합니다.

상세 계획은 `../docs/UNIFIED_HIGHSCHOOL_MIGRATION.md`를 참고합니다.
