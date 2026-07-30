# iguard-app — 수련회 이동가이드(이가드) 사이트

교회 고등부 수련회의 **현장 이동 동선, 인원체크, 식사 순서, 버스 배정, 자리배치, 스탭 동선 매트릭스** 등을 실시간으로 관리하는 모바일 우선 웹앱.
행정 사이트(retreat-app)가 관리하는 참가자/조편성/방배정 데이터를 읽기 전용으로 소비하고, 이가드 고유 데이터(`iguard/*` 네임스페이스)만 쓴다.

---

## Firebase DB 구조 — 이 앱이 사용하는 경로

### 읽기 전용 (행정 앱 소유 — 절대 쓰기 금지)

```
retreats/{retreatId}/
  name, year, startDate, endDate, createdAt  # 수련회 메타 (createdAt은 정렬용, 행정에서 기록)
  groups/                           # 조편성 (Group[])
  rooms/                            # 방배정 (Room[])
  participants/                     # 참가자 (Record<string, Participant>)
  teachers/                         # 교사/스탭 참석 현황 (TeacherAttendance[])
  partialAttendances/               # 부분참 분류 (선복귀/후발대/당일참석(day:1~3) + note; 정식 당일참석은 지정한 1·3일차 버스 포함, 구버전 note만 안전 제외)
  cellColors/                       # 참가자 셀 색상 (취소/불참 표시)
  periods/                          # 수련회 기간 (RetreatPeriod[]) — DB는 수련회별 소유지만
                                     #   홈 화면은 모든 수련회의 기간을 항상 합쳐서 표시(아래 패턴 8 참조)

classes/{year}/                     # 학급 명단 (classKey = "{부}-{학년}-{반}"), students에 jang?(장결자) 필드 포함 가능
admins/{uid}                        # 마스터 관리자 (true)
retreatAdmins/{uid}                 # 행정 사이트 멤버
```

### 읽기+쓰기 (이가드 소유)

```
retreats/{retreatId}/iguard/
  meals/                            # 식사 세션 (IguardMeal — 조별 배식 순서)
  schedule/                         # 타임테이블 시간 블록 (IguardScheduleBlock)
  posts/                            # 포스트(통제 지점) 정의 (IguardPost)
  movements/                        # 동선 매트릭스 (IguardMovement — 키: staffId__blockId)
  buses/                            # 버스 배정 (IguardBus — capacity?: 인승, 없으면 45. busCapacityOf로 읽을 것)
  seating/                          # 집회 자리배치 (IguardSeating)
  attendance/                       # 인원체크 상태 ({ checked, updatedAt?, by? } — 키는 encodeURIComponent(원본키))
                                     #   checked:false = 해제 톰스톤(삭제 대신 기록 — 오프라인 낡은 체크 부활 방지)
                                     #   by = 체크/해제한 스탭 이름. 하위호환: 구버전 true/{checked:true}도 구독에서 지원
                                     #   동시 사용 안전화(패턴 15) 적용 노드
  groupStaff/                       # 조스탭 배정 (groupId → staffId[])
  guide/                            # 조스탭 가이드 (string[])
  cueSheet/                         # 큐싯 시트 연동 설정 (url, sheetId, gid 등)
  accessLock/                       # 수련회별 추가 PIN 잠금 (salt+PBKDF2 hash, admin UI 관리)

iguardMembers/{uid}                 # 이가드 팀원 허용목록 ({ email, name? })
iguardRoles/{uid}                   # 역할 ("team" | "staff")
iguardPending/{uid}                 # 승인 대기 ({ email, name, requestedAt })

prepMilestones/                     # 🌐 전역 공유 — 준비 일정 (행정·이가드 양방향 읽기/쓰기)
```

### 데이터 소유권 요약

| 노드 | 소유자 | 이가드 권한 |
|---|---|---|
| `retreats/{id}/groups`, `rooms`, `participants`, `teachers` 등 | 행정 앱 | **읽기 전용** |
| `retreats/{id}/iguard/*` | 이가드 앱 | 읽기+쓰기 |
| `prepMilestones/` | 공유 | 읽기+쓰기 |
| `iguardMembers/`, `iguardRoles/`, `iguardPending/` | 이가드 앱 | 읽기+쓰기 |
| `admins/`, `retreatAdmins/` | 행정 앱 | 읽기 전용 |

---

## 핵심 코드 패턴

### 1. useRetreatData — 17개 구독 중앙 관리 (`src/hooks/useRetreatData.ts`)

모든 Firebase 실시간 구독을 하나의 커스텀 훅에서 관리. `IguardClient`에서 호출하고, 개별 뷰에 필요한 데이터를 props로 내린다.

- 수련회 메타 구독(`subscribeToRetreat`)이 먼저 완료되어야 `retreatYear`를 알 수 있고, 이후 17개 데이터 구독이 시작됨
- `pending` Set으로 모든 구독의 첫 콜백을 추적 → 전부 도착하면 `dataLoading = false`
- cleanup에서 모든 unsubscribe 호출
- **모든 데이터 구독은 `onError` 콜백을 받는다** — `fail(key)` 핸들러가 `loadError`를 설정하고 해당 키를 `ready` 처리한다. 이게 없으면 구독 실패 시 `pending`이 안 비워져 무한 스피너가 된다(패턴 16). `db.ts`에 새 구독을 추가할 땐 시그니처에 `onError?: (error: Error) => void`를 포함하고 여기서 `fail(...)`을 넘길 것.

### 2. Auth + 접근 레벨 (`src/context/AuthContext.tsx`)

```
AccessLevel = "none" | "staff" | "team" | "admin"
```

| 레벨 | 조건 | 권한 |
|---|---|---|
| `admin` | `admins/{uid} = true` | 전체 + 팀원 관리(승인/거절) |
| `team` | `retreatAdmins/{uid}` 또는 `iguardMembers + role=team` | 실행·기획·정보 전체 편집 |
| `staff` | `iguardMembers + role=staff` | 실행 탭만 (기획·정보 숨김) |
| `none` | 미승인 | 접근 불가 (요청 화면) |

### 3. InAppBrowserGuard (`src/components/InAppBrowserGuard.tsx`)

카카오톡, 네이버, 인스타 등 인앱 브라우저에서 Google OAuth가 차단되므로:
- 인앱 브라우저 감지 시 외부 브라우저(Chrome/Safari) 열기 시도
- Android: `intent://` URL로 Chrome 실행
- iOS: `window.location.href` 방식
- 안 열리면 안내 UI 표시 + 링크 복사 버튼

`providers.tsx`에서 최외곽 래핑: `InAppBrowserGuard → AuthProvider → UIProvider`

### 4. UIContext — toast + confirm (`src/context/UIContext.tsx`)

- `toast(message, type)`: 자동 사라짐(3.5s), `aria-live="polite"` 적용
- `uiConfirm(message)`: Promise 기반 확인 모달, 포커스 트랩 + ESC 닫기

### 5. 스탭 단일 원천 — 행정 teachers

이가드는 스탭 데이터를 **직접 생성/수정하지 않는다.** 행정의 `retreats/{id}/teachers`(bu="스탭")가 단일 원천이며, `IguardClient.teachersToStaff()`가 행정 TeacherAttendance → IguardStaff로 변환한다.

### 6. 공정 배분 알고리즘 (`src/lib/fairAssign.ts`)

식사 순서 + 집회 자리배치를 **통합 누적 점수**로 계산:
- 앞순서/앞자리를 받으면 점수가 오르고 → 다음 세션에서는 뒤로 밀림
- 시간순 전 세션을 처리하여 전체를 균등화
- seed 매개변수로 첫 세션 회전값 조절 (재실행 시 다른 공정한 배치)
- **⚖ 식사 평균순위 균등화(2026-07 하이브리드 A)**: 식사 점수는 끼니 가중치(meal.weight)를 **곱하지 않는다.** 가중치를 곱하면 "저녁(1.5) 앞자리 1회 = 가벼운 끼니 여러 번 뒤"로 교환돼 평균순위가 조마다 크게 벌어졌다(실측 5.4→4.6). 집회 점수는 그대로 더해져 **집회↔식사 연계는 유지**. 남은 4.6은 구조적 하한(홀수 끼니: `(조수−1)/끼니수`)이라 알고리즘으로 더 못 줄인다. `meal.weight` 필드·MealsView의 가중치 UI는 제거·미사용(하위호환으로 타입만 잔존). 되돌리려면 fairAssign 점수식에 `* mealWeight`를 복원.
- **식사 순서 표시(2026-07-18)**: `MealsView`는 알파벳 보조표나 세로 행 목록을 쓰지 않고, `mealOrder.ts`가 저장된 `entries[].seq`를 전역 조 번호로 연결해 `17조 → 11조 → 2조`처럼 한 줄 가로 흐름으로 표시한다. 모바일은 줄바꿈으로 순서를 끊지 않고 가로 스크롤하며, 좌우 이동 버튼은 기존과 동일하게 `seq`를 다시 저장한다. 아직 순번이 없는 조는 자연순으로 맨 뒤에 붙인다.
- **조별정보의 식사 순서 요약(2026-07-18)**: `RoomsView`는 각 조 카드에 끼니별 순번 배지를 반복하지 않고, 화면 상단에 식사별 `1조 → 12조 → 11조` 조회 전용 요약을 한 줄로 보여준다. 이 요약도 `mealOrder.ts`를 공유해 기획 탭과 조 번호·순서가 달라지지 않게 하고, 모바일에서는 각 끼니 행만 가로 스크롤한다.

### 7. 행정 데이터 형태 계약 점검 (`src/lib/compat.ts`)

행정이 classKey 형식이나 조 bu 규칙을 바꾸면 이가드가 조용히 깨지는 것을 방지. 로드 시 데이터를 검사하고 의심 신호를 경고로 표면화.

### 8. 수련회 기간(periods) — DB는 수련회별 소유, 화면은 전체 합산 표시

행정 사이트와 동일한 패턴(읽기 전용). `db.ts`의 `subscribeToAllRetreatPeriods(retreatIds, cb)`가 전체 수련회의 `periods`를 각각 구독해 merge하고, 각 기간에 소유 수련회 ID를 붙인 `RetreatPeriodWithOwner` 타입으로 반환한다. 홈 화면은 어느 수련회를 선택했든 모든 수련회의 기간을 같이 보여준다(마일스톤과 동일 패턴). `getEarliestPeriodDateByRetreat(retreatIds)`(일회성 `get()`)로 각 수련회의 가장 이른 기간 시작일을 구해, 수련회 목록을 **행사 날짜 최신순**으로 정렬한다(생성일 아님 — 수련회를 미리 등록해도 실제 행사 날짜 기준으로 정렬).

### 9. UpdateBanner — 새 배포 감지 (서비스워커 없이)

행정 사이트와 동일한 빌드 ID 폴링 방식. `next.config.ts`가 `NEXT_PUBLIC_BUILD_ID`(Vercel 커밋 SHA, 로컬은 타임스탬프)를 빌드 시점에 클라이언트 번들에 박아넣고, `/api/version`(`force-dynamic`)이 현재 배포의 빌드 ID를 반환한다. `UpdateBanner`가 5분마다 + 탭 visibility 변경 시 폴링해 불일치하면 새로고침 배너를 띄운다.

### 10. 큐싯 시트 임포트 — 날짜 구분행 오인식 주의 (`src/lib/cueSheet.ts`)

`parseCueSheetText`가 각 행이 "날짜 구분행"인지 "시간 블록 행"인지 판정할 때, **시간이 있는 행을 먼저 걸러낸 뒤에만** 날짜 마커(`parseDayCell`)를 검사해야 한다. "첫째날/둘째날" 같은 날짜 단어가 시간이 있는 행의 제목·내용에 섞여 있으면(예: "둘째날 오전 프로그램" 09:00~) 과거엔 날짜 구분행으로 오인해 그 블록 자체가 통째로 사라졌다(2026-07-06 수정). 큐싯 파싱 로직을 고칠 땐 반드시 이 순서(시간 유무 → 날짜 판정)를 유지할 것.

**10b. 자정 넘김·새벽 일정 정규화 (`resolveOvernight`, 2026-07-11)**: 시트는 사람이 읽는 대로 "2일차 섹션에 00:30~03:00", "23:30~02:00"처럼 적지만, 앱 시간 체계(패턴 11)는 자정 넘김을 **전날 24시+ 표기**로 다뤄야 "지금" 판정이 새벽에 맞다. `parseCueSheetText`는 각 블록에 `resolveOvernight(day, start, end)`를 적용한다: ①종료<시작인 닫힌 블록은 종료를 +24h(23:30~02:00→23:30~26:00), ②N일차(N≥2)의 **05:00 이전 시작** 블록은 전날(N-1)의 24시+ 표기로 이동(2일차 00:30~03:00→1일차 24:30~27:00). 05:00 경계는 기상(06~07시) 이전만 "전날 새벽"으로 보고, 05:00+ 새벽기도는 당일 유지한다. 36:00 초과가 되는 비정상 입력은 변환을 취소하고 원본을 임포트한다. 변환 내역은 미리보기 경고로 표시. 이 로직 없이 시트값을 곧이곧대로 넣으면 새벽 일정이 "2일차 첫 일정"으로 잘못 뜬다(2026-07-11 수정, `resolveOvernight` 테스트).

### 11. 시간 블록의 "지금" 판정 — 24시+ 표기(새벽) 처리 (`ExecutionViews.tsx`)

큐싯은 자정 넘는 일정을 `24:30~25:30` 같은 24시+ 표기로 쓰는 관행이 있다. `isNowOn`/`currentBlockFor`는 이런 블록을 **전날(day-1) 블록**으로 취급하고, 실제 시각 + 24시간을 더한 값으로 비교한다(예: 2일차 24:30~25:30 블록은 3일차 00:30 실제 시각에 "지금"으로 판정됨). 이 로직 없이 단순 시:분 비교만 하면 새벽 시간대 큐카드·포스트 보드가 전부 "일정 없음"으로 잘못 뜬다(2026-07-06 수정). 새 시간 관련 뷰를 추가할 때 이 헬퍼를 재사용할 것 — 직접 시:분 비교를 새로 짜지 말 것.

### 12. 오프라인 연결 배너 (`useRetreatData.ts` / `IguardClient.tsx`)

`.info/connected`를 구독해(`subscribeToConnection`) `IguardClient` 전역에 배너를 띄운다. 현장 와이파이가 끊긴 상태에서도 RTDB는 로컬 큐에 쓰기를 쌓고 성공한 것처럼 보이므로, 배너 없이는 인원체크·동선 변경이 조용히 유실될 수 있다(2026-07-06 추가). 새 현장용 뷰를 만들 때 이 배너가 감싸는 레이아웃 밖에 두지 말 것.

### 13. 인쇄 출력 — escapeHtml 필수 (`exportUtils.ts`)

`printAsPDF`는 조립된 HTML 문자열을 그대로 `document.write`한다. 학생 이름·특이사항 등 사용자 입력을 이스케이프 없이 삽입하면 관리자 인쇄 시 저장형 XSS가 될 수 있다(2026-07-06 수정, ChecklistView·RoomsView 적용 완료). 인쇄 HTML을 새로 조립할 때 사용자 데이터가 들어가는 자리는 반드시 `escapeHtml()`로 감쌀 것.

### 14. 버스 선탑/동승 이름 매칭 — "sf" 꼬리표 정규화 (`ChecklistView.tsx` / `BusesView.tsx`)

선탑/동승 명단은 두 소스를 합친다 — 버스배정(`iguard/buses`)의 `staff` 필드와 큐싯 notice의 "N호차: 이름, …" 줄. 큐싯 쪽엔 "박혜원sf"처럼 스탭 표시 꼬리표가 붙는 관행이 있어, `parseBusStaffNames`가 꼬리표를 떼지 않으면 두 소스의 같은 사람이 다른 사람으로 인식돼 명단에 중복 표시된다(2026-07-06 수정 — `.replace(/sf$/i, "")` 추가). 이름 비교/중복 판정 로직을 건드릴 땐 이 정규화가 유지되는지 확인할 것.

2026-07-08 보강: 파싱 기준은 `src/lib/busStaff.ts`로 공통화했다. 큐싯 선탑/동승 칸에 "부터, 이동, 카톡방에, 인원보고" 같은 안내 문장 조각이 섞여도 실제 이름만 `names`로 통과시키고, 제외된 조각은 `rejected` 경고로 표시한다. `BusesView`와 `ChecklistView`는 유효 이름만 버스 스탭 수와 호차별 체크 대상에 포함하며, `src/lib/cueSheet.ts`의 큐싯 임포트도 같은 기준으로 새 오염 데이터 저장을 막는다. 이 경로를 수정할 때는 `parseBusStaff()`/`mergeBusStaffNames()`를 재사용하고 화면별 임시 파서를 다시 만들지 말 것.

2026-07-08 추가 보강: 큐싯에서 넘어오는 "스탭 0명", "스탭 4명" 같은 요약 라벨은 이름이 아니므로 `parseBusStaff()`에서 제외해야 한다. 이 값이 명단에 섞이면 화면에는 `선탑/동승: 스탭 0명, 최현우...`처럼 보이고, 호차별 체크 대상/스탭 카운트도 오염된다. 또한 큐싯 임포트가 선탑/동승만 있는 1호차를 먼저 만든 상태에서 버스 자동배정을 눌러도, 전체 학생+교사 수에 필요한 최소 버스 수보다 기존 호차가 적으면 부족한 호차를 새로 생성해야 한다. 기존 호차의 `staff` 필드는 `busNo` 기준으로 보존하고 `groupIds`만 자동배정 결과로 갱신한다.

### 15. 인원체크 동시 사용 안전화 (`ChecklistView.tsx` / `db.ts`)

현장에서 여러 스탭이 동시에 인원체크할 때의 사고를 막는 3중 설계(2026-07-06 적용):
- **멱등 체크(A)**: 이름 탭 = "출석 확인"(항상 `checked=true`). 여러 명이 같은 학생을 동시에/중복으로 눌러도 결과가 "출석"으로 수렴한다. **해제는 별도** — 체크된 이름을 다시 누르면 `uiConfirm`을 거친다. (기존 토글 방식은 "확인하려다 오히려 해제"돼 출석 학생이 결석 처리되던 사고가 있었음.)
- **트랜잭션 + 톰스톤(B)**: `updateIguardAttendance`는 `runTransaction`으로 `updatedAt`을 비교해, 오프라인에서 늦게 도착한 낡은 쓰기가 최신 기록을 덮지 못하게 한다(재연결 시 서버값 기준 재실행). 해제는 삭제가 아니라 `checked:false` 톰스톤을 남긴다 — 삭제하면 큐에 남은 낡은 체크가 부활할 수 있음. `clearIguardAttendance`(재점호 초기화)도 같은 이유로 톰스톤을 쓴다.
- **체크자 기록(C)**: `by` 필드에 체크/해제한 스탭 이름(`user.displayName` 폴백 `email` 앞부분)을 저장하고, 체크된 이름 옆에 표시해 숫자 대조를 가능하게 한다.

⚠ 인원체크 저장 로직을 건드릴 때: ①토글로 되돌리지 말 것(멱등 유지), ②`set`/`remove` 직접 쓰지 말고 트랜잭션·톰스톤 경로를 유지할 것, ③`by` 필드는 배포된 보안규칙이 허용함(attendance 노드에 `$other` 거부 없음)을 확인함 — 규칙 변경 시 재확인.

### 16. 구독 에러 전파 — 무한 스피너 방지 (`db.ts` / `useRetreatData.ts`)

권한 거부·규칙 변경 등으로 구독이 실패하면, `onError`가 없을 때 `pending`이 안 비워져 `dataLoading`이 영원히 `true`(에러 안내 없는 무한 스피너)로 남는다. 이를 막기 위해(2026-07-06 수정):
- `db.ts`의 데이터 구독은 세 번째 인자로 `onError?: (error: Error) => void`를 받아 `onValue`의 에러 콜백으로 넘긴다.
- `useRetreatData`의 `fail(key)` 핸들러가 `loadError`를 설정하고 `ready(key)`를 호출 → `IguardClient`의 기존 에러 배너가 즉시 뜬다.
- 새 구독을 추가할 땐 반드시 이 `onError` 파라미터를 포함하고 훅에서 `fail(...)`을 넘길 것. (참고: `loadError` state·배너 UI는 오래전부터 있었으나 정작 설정하는 코드가 없어 죽은 상태였음 — "선언만 있고 연결 안 됨"의 전형.)

### 17. 현장용 뷰의 시계 tick vs 사용자 선택 (`ExecutionViews.tsx`)

`useClock()`은 30초마다 `clock.time`을 갱신한다. 이 값을 의존성으로 갖는 `useEffect`가 사용자 선택 상태를 `setState`하면, **30초마다 사용자의 선택이 자동값으로 리셋된다.** 포스트 현황(PostBoardView)에서 사용자가 고른 시간 블록이 30초 뒤 첫 블록(1일차 기도회)으로 되돌아가던 버그가 이것이었다(2026-07-06 수정). 
- 자동 선택 effect에는 **"사용자가 직접 골랐으면 유지"** 가드(`blockPicked` ref)를 두고, 일자(`day`)가 바뀔 때만 플래그를 리셋해 당일 자동 스냅을 살린다(일자 탭의 `userPicked` 패턴과 동일).
- 시계에 의존하는 계산·표시(`isNowOn`, `currentBlockFor`, 시각 표시)는 문제없다 — `setState`로 사용자 선택을 덮어쓰는 effect만 주의. 새 현장용 뷰에 "선택 상태 + 자동 추종"을 넣을 땐 이 패턴을 따를 것.
- 개인 큐카드는 `iguardMembers/{uid}.name`(관리자 지정 이름) → Google `displayName` 순으로 `findPreferredStaffId`가 행정 스탭 명단과 유일 매칭해 본인을 최초 선택한다. 동명이인·불일치는 가나다순 첫 스탭으로 폴백하고, `staffPicked` ref가 사용자의 이후 수동 선택을 보존한다. 계정-스탭 이름 비교를 화면에서 재구현하지 말고 `src/lib/staffIdentity.ts`를 사용할 것(2026-07-13 추가).

### 18. 큐싯 재임포트는 블록 ID를 보존해야 한다 — 동선 유실 방지 (`scheduleReconcile.ts` / `ScheduleCueSheetImport.tsx`)

시트 재가져오기가 과거엔 "기존 블록 전체 삭제 → 새 push ID로 재생성"이었다. 동선(`movements`)은 `staffId__blockId` 복합키라, 블록 ID가 바뀌면 **손으로 짠 동선 배정이 통째로 유실**된다(자동배정분은 임포트가 재생성해 살아남지만 수기 배정은 못 살아남음). 2026-07-08 수정:
- `reconcileScheduleImport(existing, imported)`가 **day__start 키로 대조**해 `updates`(ID 유지·내용만 갱신) / `creates`(신규) / `deletes`(시트에서 사라짐)로 분류한다. 살아남는 블록은 ID를 유지하므로 동선이 보존된다.
- `updateIguardScheduleBlock`으로 갱신할 땐 **시트 소유 필드만**(`label/end/meal/detail/owner/notice/leaderNote`) 덮고, 앱 소유 필드(`noMovement`)와 동선(별도 노드)은 건드리지 않는다. 빈 값은 `null`로 지정해 시트에서 지운 내용을 반영한다.
- **자동배정은 출처 기반 동기화** (2026-07-18 변경): `IguardMovement.source`에 `sheet`/`manual`을 기록한다. 재임포트는 수동배정을 보존하면서 시트 자동배정을 추가·변경하고, 시트에서 사라진 자동배정만 제거한다. `source`가 없던 레거시는 이전 자동배정과 정확히 일치하거나 `포스트명: 스탭명sf` 자동배정 메모가 확인될 때만 시트 소유로 간주한다. 이 구분 없이 기존 칸을 전부 보존하면 시트에서 삭제한 점심 동선이 개인 큐카드에 계속 남고, 반대로 전부 지우면 현장 수동배정이 유실된다. `movementReconcile.ts`와 테스트가 경계를 고정한다.
- **blockKey는 "실제 시각" 정규 키** (2026-07-11 변경): reconcile 매칭 키를 `day__start` 문자열에서 **1일차 00:00 기준 절대 분**(`t{(day-1)*1440+분}`)으로 바꿨다. 새벽 표기가 바뀌어도(2일차 00:30 ≡ 1일차 24:30) 같은 블록으로 매칭돼 동선이 보존된다. 이에 맞춰 `sheetOwnedFields`가 **day·start도 갱신**하므로, 기존 DB의 옛 표기(2일차 00:30) 블록이 재임포트 시 정규 표기(1일차 24:30)로 **ID를 유지한 채** 옮겨진다(동선 보존). `ScheduleCueSheetImport`의 leaderMap 키도 `blockKey`로 통일했다.
- **자동배정을 완전히 새로 하려면** 그 블록을 삭제 후 가져와야 한다(빈칸 채움이 아니라 전면 재배정이 필요할 때).
- 두 버튼: "시트 반영(삭제 없음)"=merge(updates+creates), "시트 기준 정리"=replace(+deletes). 확인창에 유지/신규/삭제 건수를 정직하게 표시한다. `scheduleReconcile.test.ts`가 분류 로직을 고정한다.

### 19. 시트↔앱 스냅샷 어긋남은 해시로 감지한다 (`markCueSheetImported` / `CueSheetFreshnessBanner`)

시트 연동은 "마지막으로 불러오기 누른 순간"의 스냅샷이라, 시트를 고치고 재임포트를 잊으면 시트와 앱이 다른 큐싯을 말한다(겨울↔여름 큐싯 혼동 실사례). 2026-07-08 추가:
- 임포트 성공 직후 `markCueSheetImported`가 CSV 텍스트 해시(`hashCsv`)를 `iguard/cueSheet`에 **경로 지정 update**로 기록한다(설정 `set()`을 안 지우도록). `saveIguardCueSheet`(설정 저장)는 `set()`이라 URL을 바꾸면 마커가 초기화되는데, 원본이 바뀌었으니 재임포트가 안전한 기본값이라 의도된 동작이다.
- `CueSheetFreshnessBanner`(기획>스탭 전체 큐싯 상단, team/admin만)가 원본 시트를 배경 재조회해 해시를 비교 → ✓동기화됨 / ⚠변경됨 / 아직 안 가져옴을 상시 표시. 조회 실패 시 조용히 숨긴다(오탐 방지).
- 해시는 CRLF/CR/LF·앞뒤 공백을 정규화해 사소한 차이로 오탐하지 않는다.

### 20. 수련회별 PIN 잠금은 내부 구독보다 먼저 판정한다 (`accessLock.ts` / `IguardClient.tsx`)

- 기존 Google 로그인과 `iguardMembers` 팀원 승인은 1차 접근 제어다. `iguard/accessLock`은 승인 사용자에게 적용하는 추가 진입 장벽이다.
- 관리자는 홈의 `🔐 관리자`에서 수련회별 PIN을 설정·변경·해제하며 PIN 없이 우회한다. PIN 평문은 저장하지 않고 개별 salt와 PBKDF2-SHA256(120,000회) 해시만 저장한다.
- 일반 사용자에게는 잠금 상태를 목록에 표시하고, 직접 URL로 들어와도 `IguardClient`의 바깥 경계에서 PIN을 확인한다. 잠금 해제 전에는 `IguardWorkspace`가 마운트되지 않으므로 `useRetreatData`의 내부 데이터 구독도 시작되지 않는다.
- 성공한 잠금 해제는 현재 탭의 `sessionStorage`에 PIN 해시 버전별로만 기억한다. 관리자가 PIN을 바꾸면 저장 키가 달라져 기존 해제 기록은 자동 무효화된다.
- `accessLock` 구독은 **내부 데이터 구독 전 접근 경계**이므로 `useRetreatData` 중앙화 규칙의 명시적 예외다. 홈 목록의 잠금 배지도 같은 메타 구독을 사용한다. 두 구독 모두 `onError`에서 실패를 표시하고, 내부 진입 경계는 실패 시 닫힌 상태(fail closed)를 유지한다.
- 현재 Firebase Rules는 승인된 팀원에게 `retreats` 읽기를 허용한다. 따라서 이 PIN은 승인 팀원의 실수·공유 링크 진입을 막는 앱 수준 잠금이며, 계정별 Firebase 데이터 권한을 대체하지 않는다. Rules 변경·배포 없이 이 한계를 보안 경계로 과장하지 말 것.

### 21. 버스 인원은 행정 참석 원본과 함께 판정한다 (`busParticipation.ts` / `BusesView.tsx` / `ChecklistView.tsx`)

버스 자동배정과 **호차별** 인원체크는 조의 이름 목록만 세지 않는다. 학생은 `cellColors=red`인 취소자를 먼저 제외하고, `partialAttendances`의 `type`과 `note`를 함께 읽어 기존 선복귀·후발대 일차 규칙을 적용한다. `note`에 `당일참여/당일참석`이 있으면 1·3일차 단체 버스에서 모두 제외한다. 취소 학생은 조별 인원체크와 조스탭 배정 화면의 조원 명단에서도 제외한다. `cellColors=red`는 행정 `CancellationTab`이 민감 취소 원본과 원자 동기화하는 공개 학생키 마커이며, IGuard는 환불정보가 든 `retreatsPrivate`를 직접 읽지 않는다. 교사는 조의 `bu`와 이름으로 행정 `teachers` 레코드를 안전하게 찾아 `status=불참` 또는 `transport=자차/자가용/개인차량`이면 단체 버스에서 제외한다. 이름 매칭이 모호하거나 행정 레코드가 없으면 임의로 제외하지 않고 기존 조 명단을 보존한다. 단, **조별 인원체크는 이동수단과 무관한 현장 조 점호**이므로 자차 교사를 포함한다. 조장은 `group.studentIds`에 포함된 학생 역할이므로 교사 명단에 다시 추가하거나 교사 이동수단 필터를 적용하지 않는다. 학생 취소 및 버스 탑승 판정은 `src/lib/busParticipation.ts`, 조별/호차별 교사 명단 분기는 `src/lib/checklistMembers.ts`만 사용한다.

큐싯 자동 선탑 명단은 `N호차: 이름` 또는 `N호차 선탑/동승: 이름` 형식만 인식한다. `N호차 짐 하차 보조 스탭: 이름`처럼 호차를 언급한 별도 업무는 선탑/동승으로 합치지 않는다. 파싱은 `src/lib/cueSheet.ts`의 `extractBusStaffDraftsFromRows`만 사용한다.

### 22. 버스 남녀 분리는 개인이 아니라 조+성별 묶음이다 (`busGender.ts` / `busAutoAssign.ts`)

버스 자동배정의 `혼합`은 기존처럼 조 전체를 최소 단위로 사용한다. `남녀 분리`는 학생 개인을 흩뜨리지 않고 `${groupId}::남`, `${groupId}::여` 묶음을 최소 단위로 사용하며, 한 버스에는 한 성별 묶음만 들어간다. 학생 성별은 행정 소유 `participants.gender`를 읽기 전용으로 연결하고, 시트에 없는 수동 학생은 행정 자동 조편성과 동일한 `홀수반=남·짝수반=여` 기준으로 보강한다. 교사 성별은 담당 학생 반과 무관하므로 절대 반 홀짝이나 조 다수 성별로 추론하지 않고, 행정 `teachers.gender`의 명시값만 사용한다. 실제 탑승 학생 또는 조 교사의 성별을 찾지 못하면 이름/건수를 알리고 자동배정을 중단한다. 저장은 IGuard 소유 `iguard/buses`의 `assignmentMode="gender"`와 `segments[{groupId,gender,teacherNames}]`에만 하며, 구버전 `includeTeachers=true` 세그먼트도 계속 읽는다. 호차별 인원체크는 같은 `teacherNames`를 사용하고, 현재 불참·자차 상태로 다시 필터링한다. 수동으로 조 목록을 수정하면 해당 호차의 성별 묶음을 지우고 혼합 방식으로 전환한다.

### 23. 담당반 성별과 교사 성별을 혼동해 교사를 잘못 배정한 문제 (2026-07-17)

- **접근법**: 1→ `BusesView.makeAssignmentUnits()`가 조 교사 전원을 학생이 많은 성별에 붙이는 흐름을 찾는다. 2→ 행정 `TeacherAttendance`에 명시 `gender` 입력을 추가한다. 3→ `busGender.ts`가 실제 탑승 교사를 성별별 이름 배열로 나누고 `segments[].teacherNames`에 저장한다. 4→ `ChecklistView`가 저장된 이름만 호차별 교사로 표시하는지 회귀 테스트와 전체 빌드로 확인한다.
- **판단 질문**: 담당반 홀짝, 교사 이름, 조 학생의 다수 성별로 교사 성별을 추론하지 않는다. 여자 교사가 남학생 반을 담당할 수 있어 같은 오배정이 재발하며, 미확인 교사를 임의 호차에 넣는 것보다 이름을 보여주고 자동배정을 중단하는 편이 안전하다.
- **재사용 규칙**: 사람 본인의 속성과 그 사람이 담당하는 집단의 속성은 분리해 모델링하고, 버스 성별 배정에서는 행정 `teachers.gender` 명시값만 사용한다.

### 24. 개인 큐카드의 현재·다음 일정 고정과 지난 일정 정리 (2026-07-18)

- **접근법**: 1→ `currentBlockFor`로 현재 블록을 찾는다. 2→ `cueTimelineWindow`가 `day×1440+start` 절대 분과 현재 블록 ID를 사용해 다음 블록 하나와 그 이후 목록을 분리한다. 3→ `ExecutionViews.tsx`는 현재·다음 카드를 `top: var(--ig-header-h)`에 2단 sticky로 놓는다. 4→ 수련회 진행 중에는 전체 일정 DOM을 유지하고 최초 진입 한 번만 `remainingBlocks[0]`으로 이동해 과거를 고정 카드 위에 숨긴다. 5→ 진행 중·일정 사이·시작 전·종료 후·24시+·스크롤 위치 계산을 `cueCardTimeline.test.ts`로 고정한다. 6→ 급할 때 전체 흐름을 훑는 `timelineCompact` 모드는 현재·다음 카드를 함께 접고 각 블록을 시간·일정명·내 위치·내 담당 중심 한 줄로 압축하되, 버튼으로 기존 상세 카드에 즉시 복귀시킨다.
- **판단 질문**: 지난 일정을 배열에서 삭제하거나 `HH:mm`만 비교하지 않는다. 삭제하면 사용자가 위로 스크롤해 과거를 다시 볼 수 없고, 단순 시각 비교는 `24:30` 같은 새벽 일정과 다음 날 경계를 잘못 판단한다. 30초 시계 갱신마다 자동 스크롤하지 않고 `initialTimelinePositioned` ref로 최초 한 번만 이동해 사용자의 탐색 위치를 보존한다. 기간 설정이 없을 때는 임의로 현재를 추론하지 않고 기존 전체 목록을 보존한다. 한눈에 보인다는 이유로 상세 정보를 영구 제거하거나 고정 카드 기본 상태를 바꾸지 않는다. 사용자가 명시적으로 밀도를 전환할 때만 고정 카드를 접어 기존 현장 흐름과 신규 탐색 흐름을 함께 보존한다.
- **재사용 규칙**: 현장 타임라인 화면은 `현재 1개 / 다음 1개 / 전체 목록의 최초 표시 지점`을 순수 헬퍼에서 계산하고, 자동 위치 이동은 화면 최초 진입 한 번으로 제한한다. 정보가 많아 스캔이 느린 현장 화면은 상세 구조를 대체하지 말고 동일 데이터의 명시적 밀도 전환을 제공한다.

### 25. sticky가 동작하지 않으면 모든 조상 overflow를 먼저 확인한다 (2026-07-18)

- **접근법**: 1→ `ExecutionViews.tsx`의 sticky 카드에 `top`과 `z-index`가 있는지 확인한다. 2→ `IguardClient.tsx`에서 카드와 헤더의 공통 조상을 위로 추적한다. 3→ 최상위 `overflow-x-hidden`이 세로축까지 스크롤 컨테이너로 계산되는 원인을 찾는다. 4→ 가로 넘침은 자르되 스크롤 컨테이너를 만들지 않는 `overflow-x-clip`으로 교체하고 `stickyLayout.test.ts`·전체 빌드로 고정한다.
- **판단 질문**: sticky 카드에 `fixed`를 덧씌우거나 임의 픽셀 `top`을 추가하지 않는다. 원인인 조상 overflow를 남겨두면 헤더 높이·모바일 뷰포트가 바뀔 때 다시 어긋나고, `fixed`는 문서 흐름에서 빠져 일정 카드를 가린다.
- **재사용 규칙**: `position: sticky`가 안 붙으면 대상 요소보다 먼저 조상의 `overflow: hidden/auto/scroll`을 검사하고, 단순 클리핑 목적이면 `overflow: clip`을 사용한다.

### 26. 인앱 브라우저 탈출은 절대 현재 주소로 이동하지 않는다 (`inAppBrowser.ts` / `InAppBrowserGuard.tsx`, 2026-07-29)

예전 `InAppBrowserGuard`는 iOS 분기에서 `window.location.href = url`을 실행했는데, 이 `url`이 같은 effect에서 읽은 **현재 주소 자기 자신**이었다. iOS 카카오톡 웹뷰는 이 대입으로 사파리를 열지 않고 **같은 페이지를 리로드**하므로 리로드 → effect 재실행 → 재대입의 무한 루프가 됐고, 폴백 안내 UI를 띄우려던 `setTimeout(1500)`은 한 번도 도달하지 못했다. 실사용 피드백의 "카톡에서 열면 무한 로딩"이 이것이다.

- 감지·이동 전략은 `src/lib/inAppBrowser.ts`의 순수 함수 `escapeStrategyFor(ua, currentUrl)`에만 둔다. 화면에서 UA를 직접 분기하지 말 것.
- **불변식: 이동 주소가 현재 주소와 같으면 무조건 `guide`(안내 UI)로 강등한다.** `inAppBrowser.test.ts`가 모든 인앱 UA에 대해 이를 고정한다.
- 플랫폼별로 실제 동작하는 수단만 쓴다 — 안드로이드 `intent://…package=com.android.chrome`, iOS 카카오톡 `kakaotalk://web/openExternal?url=`, 그 외 iOS 인앱(인스타·네이버·라인)은 **자동 이동 없이 안내만**.
- `shouldAttemptEscape(sessionStorage)`로 세션당 자동 이동 1회 제한 — 외부 브라우저가 같은 주소로 되돌아와도 루프가 생기지 않는다.
- 인앱 웹뷰에서 `<a target="_blank">`는 같은 인앱에서 열려 효과가 없다. 폴백은 스킴 버튼 + 링크 복사로 한다.

### 27. 전역 검색은 판정 로직을 재구현하지 않고 민감정보를 담지 않는다 (`personIndex.ts` / `SearchOverlay.tsx`, 2026-07-29)

수련회 피드백에서 3명이 "이름으로 학생 찾기", "이름만 아는 학생의 숙소", "조가 너무 많아 스크롤"을 각각 보고했다. 공통 원인은 이름 검색 부재가 아니라 **모든 탐색이 긴 목록 훑기**라, 사람(학생·교사·스탭)과 조·방·호차를 한 인덱스에 넣었다.

- `buildSearchIndex(input)`는 **새 구독을 만들지 않는다** — `useRetreatData`가 이미 구독 중인 데이터의 파생이다(새 DB 경로·쓰기 0). 검색 때문에 훅에 구독을 추가하지 말 것.
- **취소·부분참·자차·조 번호·부-학년-반 판정을 새로 쓰지 않는다.** `busParticipation`·`checklistMembers`·`groupNumber`·`lodgingMap.studentClass`·`staffIdentity`를 그대로 쓴다. 검색 결과의 값이 각 화면과 달라지면 검색을 신뢰할 수 없게 된다.
- ⚠ **취소 학생과 불참·자차 교사에게 호차를 표시하지 않는다.** 다른 화면은 이미 제외하는데 검색만 표시하면 실제 사고("2호차 명단에 있는데 실제로는 자차 이동")를 그대로 재생산한다. `isTeacherBusPassenger`가 단일 원천이며 `personIndex.test.ts`가 고정한다.
- 🔒 **`Student.phone`·`Student.pPhone`·`TeacherAttendance.idNumber`를 인덱스에 담지 않는다.** 검색은 `staff` 접근 레벨도 쓰는 화면이다. 테스트가 직렬화 결과에 이 값들이 없음을 확인한다.
- 초성 검색은 `toChosung`(완성형 → 초성)만 사용한다. 시간 판정이 필요하면 `scheduleTime`의 헬퍼 결과(`currentBlockId`)를 인자로 받고, 인덱스 안에서 시:분을 비교하지 않는다(패턴 11).

---

## API 라우트

### `GET /api/sheet-import` (`src/app/api/sheet-import/route.ts`)

구글 시트 CSV를 서버에서 프록시로 가져옴 (브라우저 직접 fetch는 CORS/307 리다이렉트 문제).

**인증**: Firebase ID 토큰 검증 (Google OAuth2 tokeninfo 엔드포인트 사용, Admin SDK 없음)
- `Authorization: Bearer <idToken>` 헤더 필수
- `aud`가 Firebase 프로젝트 ID와 일치해야 함

**SSRF 방어**:
- 시트 ID: `/^[a-zA-Z0-9_-]+$/` 검증
- GID: `/^\d+$/` 검증
- 고정 도메인(`docs.google.com`)만 접근

**응답**:
- 성공: `{ csv: string }`
- 비공개 시트: HTML 응답 감지 → 403 + 공개 설정 안내

---

## 개발 & 배포

프로덕션 배포는 `npx vercel --prod --yes`. 표준 명령(`npm run dev` · `npx tsc --noEmit` · `npm run lint` · `npm test`)은 `package.json`에서 확인할 것.

GitHub main 브랜치 push 시 Vercel 자동배포가 정상 트리거된다(2026-07-06 확인). 같은 모노레포의 `retreat-app`도 **2026-07-08 자동배포 정상이 확인됐다** — 과거 "retreat-app은 자동배포가 안 된다"는 서술은 07-06 세팅 전 증상이니 따르지 말 것. 다만 모노레포 push는 두 앱을 동시에 재배포하므로, push 후 각각 `npx vercel ls`로 Ready를 따로 확인한다.

### 환경변수 (`.env.local`)

```
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_DATABASE_URL=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=
NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID=
```

---

## 테스트 (`__tests__/`)

Vitest 기반, `@` 경로 별칭 설정 완료 (`vitest.config.ts`).

| 파일 | 대상 | 내용 |
|---|---|---|
| `snapToList.test.ts` | `snapToList` | null/배열/원시값/빈 객체/정상 맵 변환 |
| `compat.test.ts` | `checkAdminCompat` | 파싱 이상, 학생ID 불일치 비율, bu 값 검증 |
| `groupNumber.test.ts` | `groupDisplayName` | 1부/2부 전역 번호, 커스텀 이름 |
| `partialAttendance.test.ts` | `isPresentOnDay` | 본대/선복귀/후발대 일자별 참석 |
| `busParticipation.test.ts` | 버스 탑승 판정 | 당일참여 학생, 자차·불참 교사, 부서 동명이인 매칭 |
| `busGender.test.ts` | 버스 성별 배정 | raw/unique 학생키, 조+성별 묶음, 교사 명시 성별·미확인 차단, 구버전 세그먼트, 단일 성별 호차·정원 불변식 |
| `checklistMembers.test.ts` | 인원체크 교사 명단 | 조별은 자차 포함, 호차별은 자차 제외 |
| `checklistLayout.test.ts` | 인원체크 레이아웃 | 호차별 모바일 2열·조별 인쇄 페이지당 4개 조 및 체크 저장 회귀 방지 |
| `lodgingMap.test.ts` | 숙소 배정도 | 건물·호실 매칭, 별관 4구역 간이 배치도, HRD 정원 보조 매칭, 취소·당일참석 제외, 미매칭 안전 처리 |
| `accessLock.test.ts` | 수련회 PIN 잠금 | 형식, PBKDF2 검증, salt, 세션 무효화 |
| `inAppBrowser.test.ts` | 인앱 브라우저 탈출 | 인앱 판정, 플랫폼별 전략, **현재 주소 재이동 금지 불변식**, 세션 1회 제한 |
| `personIndex.test.ts` | 전역 검색 | 초성 변환·검색, 취소/부분참 배지, **취소자·자차 교사 호차 미표시**, 민감정보 미포함, 정렬·limit |

---

## 접근성 패턴

- **모달 포커스 트랩**: `TeamModal`, `UIContext.ConfirmDialog`에서 Tab 키 순환 + ESC 닫기 + 이전 포커스 복원
- **`role="dialog"` + `aria-modal="true"` + `aria-label`**: 모든 모달에 적용
- **Toast `aria-live="polite"`**: 토스트 컨테이너에 `role="status"` + `aria-live` 적용
- **아이콘 `aria-hidden="true"`**: 장식 아이콘에 적용, 텍스트로 의미 전달
- **뷰포트 고정**: 모바일 현장 사용 기준, `maximumScale: 1`
- **호차별 인원체크**: 모바일에서도 호차 카드는 2열로 배치하고 이름·소속은 카드 폭 안에서 줄바꿈한다. 조별 인원체크는 기존 모바일 1열을 유지한다.
- **조별 인원체크 인쇄**: A4 세로 인쇄 가능 높이(276mm)를 2열×2행으로 꽉 채워 4개 조씩 출력한다. 각 조 표는 셀 높이를 가용 영역에 맞춰 늘리며, 호차별 인쇄는 기존 단일 열 형식을 유지한다.
- **숙소 배정도**: 첨부 PDF를 최적화한 정적 WebP 도면 위에 행정 소유 `rooms`와 `groups`를 읽기 전용으로 연결한다. 호실 배지는 최종 WebP의 실제 방 중앙을 퍼센트 좌표로 측정해 `부-학년-반`과 전역 조 번호를 함께 표시하고, 선택 상세는 가로 스크롤에 잘리지 않도록 `document.body` 포털 말풍선으로 표시한다. `dong + roomNumber`를 우선하고, 포괄적인 HRD 건물명일 때만 2·3인실 정원을 보조키로 사용한다. 도면이 없는 별관은 사용자가 명시적으로 허용한 4구역 간이 배치도에 실제 DB의 101~103·201~203호를 모두 연결한다. 그 외 도면에 없는 호실은 추정 배치하지 않고 미매칭 경고로 표시한다.

---

## 탭 구조 (IguardClient.tsx)

| 그룹 | 뷰 키 | 탭 이름 | 접근 |
|---|---|---|---|
| **실행** (현장·모바일) | `cue` | 개인 큐카드 | 전체 |
| | `board` | 포스트 현황 | 전체 |
| | `rooms` | 조별 정보 | 전체 |
| | `lodgingmap` | 숙소 배정도 | 전체 |
| | `check` | 인원체크 | 전체 |
| **기획** (PC) | `schedule` | 스탭 전체 큐싯 | team/admin |
| | `leadercue` | 조장 큐싯 | team/admin |
| | `posts` | 포스트 편집 | team/admin |
| | `staff` | 스탭 | team/admin |
| | `movements` | 동선 매트릭스 | team/admin |
| | `validate` | 데이터 검증 | team/admin |
| | `groupstaff` | 조스탭 배정 | team/admin |
| | `meals` | 식사순서 | team/admin |
| | `buses` | 버스배정 | team/admin |
| | `seating` | 집회자리 | team/admin |
| **정보** | `guide` | 조스탭 가이드 | team/admin |
| | `todos` | 준비 할일 | team/admin |

`staff` 역할은 **실행 그룹만** 볼 수 있음 (기획·정보 숨김).

탭과 별개로 헤더에 **🔍 전역 검색**(`SearchOverlay`)이 상시 있다. 접근 레벨과 무관하게 모두 사용하며, 결과 카드에서 해당 탭으로 이동한다(패턴 27).

---

## 절대 하지 말 것

1. **행정 소유 노드에 쓰기 금지**
   - `groups`, `rooms`, `participants`, `teachers`, `partialAttendances`, `cellColors`, `periods` 등은 행정 앱이 소유
   - 이가드는 `retreats/{id}/iguard/*`, `iguardMembers`, `iguardRoles`, `iguardPending`, `prepMilestones`에만 쓴다
   - `db.ts` 파일 상단의 "읽기 전용 영역" / "쓰기 가능 영역" 구분을 반드시 지킬 것

2. **컴포넌트에서 Firebase 직접 import 금지**
   ```typescript
   // 금지
   import { db } from "@/lib/firebase";
   import { get, ref } from "firebase/database";

   // 반드시 db.ts 함수만 사용
   import { subscribeToGroups } from "@/lib/db";
   ```

3. **Object.entries(snap.val()).map(...) 직접 사용 금지** → `snapToList<T>(snap)` 사용

4. **불필요한 패키지 추가 금지**
   - 현재 의존성 4개(firebase, next, react, react-dom) 최소화 유지
   - 새 패키지 추가 전 기존 라이브러리로 해결 가능한지 먼저 검토

5. **TypeScript 에러 있는 상태로 배포 금지**
   - 배포 전 `npx tsc --noEmit` 으로 0 errors 확인 필수

6. **useRetreatData 훅 밖에서 새 구독 추가 금지**
   - 모든 Firebase 구독은 `useRetreatData`에서 중앙 관리
   - 새 구독이 필요하면 반드시 이 훅에 추가
   - 예외: 내부 데이터 구독보다 먼저 판정해야 하는 `iguard/accessLock` 접근 경계와 홈 잠금 배지(패턴 20)

---

## WARNING: 공유 Firebase 프로젝트

이 앱은 **`woori-high` Firebase 프로젝트를 4개 앱이 공유**한다.

- **Rules 배포는 학생 앱(`고등부 학생 출석부/database.rules.json`)에서만 실행한다.**
- 이 앱의 `DO_NOT_DEPLOY.database.rules.json`은 보관용 사본이며 배포에 사용하지 않는다.
- 규칙 변경이 필요하면 학생 앱의 `database.rules.json`을 수정하고 학생 앱에서 배포한다.
- `retreatsPrivate/` 노드에는 민감 데이터(환불계좌, 의료일지 등)가 있으며 이가드 멤버는 접근 불가
