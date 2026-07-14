# retreat-app — 수련회 관리 웹앱

교회 수련회 운영에 필요한 전체 데이터(신청자, 조편성, 방배정, 카풀, 취소, 물품 등)를 관리하는 내부 웹 도구.

---

## 기술 스택

| 항목 | 내용 |
|---|---|
| 프레임워크 | Next.js 16.1.7 (App Router) |
| UI | React 19, Tailwind CSS 4 |
| 언어 | TypeScript 5 (strict mode) |
| 데이터베이스 | Firebase Realtime Database |
| 인증 | Firebase Auth (Google OAuth) |
| 시트 연동 | Google Sheets CSV (공개 게시) |
| 엑셀 내보내기 | xlsx 라이브러리 |
| 테스트 | Vitest 4 (`npm test` = `vitest run`) |
| 배포 | Vercel (`npx vercel --prod --yes`) |
| 의존성 | firebase, next, react, react-dom, xlsx, vitest(dev) — 최소화 유지 |

---

## 디렉터리 구조

```
src/
├── app/
│   ├── page.tsx                    # 홈 (수련회 목록 + 준비 일정 캘린더 패널, md 기준 모바일/데스크탑 분기)
│   ├── RetreatCalendarPanel.tsx    # 메인 준비 일정 패널 (수련회 기간 + 마일스톤 달력) — 기간은 전체 수련회 합쳐서 표시
│   ├── FormGuideModal.tsx          # 구글폼 작성 가이드 모달
│   ├── UpdateBanner.tsx            # 새 배포 감지 배너 (NEXT_PUBLIC_BUILD_ID 폴링)
│   ├── api/version/route.ts        # 현재 배포 빌드 ID 반환 (UpdateBanner가 폴링)
│   ├── layout.tsx / providers.tsx
│   └── retreat/[id]/
│       ├── page.tsx                # 서버 컴포넌트 entry
│       ├── RetreatPageClient.tsx   # 탭 라우터 (TAB_IDX 상수 + 15개 탭 관리, keep-alive 패턴)
│       ├── GroupComponents.tsx     # 조편성 UI 컴포넌트 (GroupCard, UnassignedBySection, StudentChip, TeacherChip)
│       ├── ParticipantsTab.tsx     # 신청자 취합 (시트 연동)
│       ├── GroupsTab.tsx           # 조편성 (GroupComponents 사용)
│       ├── RoomsTab.tsx            # 방배정 (실시간 구독)
│       ├── ClassRosterTab.tsx      # 반 명단(신청자 취합) — 장결자(jang)는 메인 그리드/집계에서 빼고 하단 별도 구역에 표시
│       ├── TeachersTab.tsx         # 교사 참석
│       ├── NotesTab.tsx            # 특이사항
│       ├── CarpoolTab.tsx          # 카풀
│       ├── PartialAttendanceTab.tsx # 부분참
│       ├── InsuranceTab.tsx        # 여행자 보험
│       ├── CancellationTab.tsx     # 취소명단
│       ├── SuppliesTab.tsx         # 물품/간식
│       ├── OnSiteRegistrationTab.tsx # 현장 등록
│       ├── UnmatchedPaymentsTab.tsx  # 입금 미매칭
│       ├── TshirtTab.tsx           # 단체티 신청
│       ├── MedicalLogTab.tsx       # 의료 일지 (약 처방 기록, 프리셋 편집, 부서→학년→반 + 참가자 이름 자동완성)
│       ├── AutoAssignPanel.tsx     # 자동 조편성 패널
│       └── BackupRestoreButton.tsx # 조편성/방배정 롤링 백업 복구 버튼 (공용 — GroupsTab·RoomsTab 툴바에서 사용)
├── context/
│   ├── AuthContext.tsx             # Google OAuth, accessLevel 관리
│   └── UIContext.tsx               # toast(), uiConfirm() 전역 UI 유틸
└── lib/
    ├── types.ts                    # 전체 타입 정의 (RetreatPeriod, RetreatAdminMember 포함)
    ├── db.ts                       # Firebase 접근 배럴 — 본문은 db/ 도메인 모듈 10개 (2026-07 R5 분할, import 경로는 @/lib/db 유지)
    ├── db/                         # core(공용 헬퍼)·retreats·participants·groupsRooms·students·teachers·access·retreatOps·private·shared
    ├── classKey.ts                 # parseClassKey — "{부}-{학년}-{반}" 파싱 단일 원천 (+테스트)
    ├── syncParticipants.ts         # 시트 동기화 보존·중복제거 순수 로직 (충돌 가드 포함, +특성화 테스트)
    ├── dateFormat.ts               # toYMD — YYYY-MM-DD 포맷 단일 원천
    ├── firebase.ts                 # Firebase 초기화 (db, auth, googleProvider)
    ├── sheetsParser.ts             # Google Sheets CSV 파싱 (parseCSV: 따옴표 내 줄바꿈 처리)
    ├── sheetsParser.test.ts        # sheetsParser 단위 테스트
    ├── studentMatcher.ts           # 신청자↔출석부 학생 9단계 매칭 (findStudent, normalizeName, stripSuffix)
    ├── studentMatcher.test.ts      # studentMatcher 단위 테스트
    ├── groupNumber.ts              # 조 전역 번호 표시 (groupDisplayName: 2부는 1부 조 개수만큼 이어서)
    ├── groupNumber.test.ts         # groupNumber 단위 테스트
    ├── exportUtils.ts              # xlsx 내보내기, printAsPDF, escapeHtml(인쇄 XSS 방지)
    ├── exportUtils.test.ts         # exportUtils 단위 테스트
    ├── constants.ts                # 공통 상수 (TEACHER_STATUS_CLS, LATE_REGISTRANT_COLORS)
    └── constants.test.ts           # constants 단위 테스트

루트 파일:
- DO_NOT_DEPLOY.database.rules.json # 보관용 규칙 사본 (배포 금지 — 배포용 원천은 학생 앱)
- vitest.config.ts                  # Vitest 설정 (globals: true, @ alias → src/)
```

---

## Firebase DB 구조

```
retreats/
  {retreatId}/
    participants/         # Record<string, Participant> — 시트에서 가져온 신청자
    participantsBackups/  # participants 전체덮어쓰기 직전 롤링 백업 (최근 5개)
    groups/               # 조편성
    groupsBackups/        # groups 전체덮어쓰기 직전 롤링 백업 (최근 5개, 10분 스로틀) — saveGroups가 자동 기록
    autoAssignConfig/     # 자동 조편성 입력 설정 (조 수·규칙·조장·고려 관계, groups 결과와 분리)
    rooms/                # 방배정 (Room: dong?·roomNumber·capacity·type·studentIds·teachers) — dong은 숙소 건물 여러 개일 때만, 없으면 단일 건물. 표시는 lib/roomLabel.ts로 "동 호수" 합성(이가드도 동일 규칙)
    roomsBackups/         # rooms 전체덮어쓰기 직전 롤링 백업 (최근 5개, 10분 스로틀) — saveRooms가 자동 기록
    teachers/             # 교사 참석 현황
    carpools/             # 카풀 요청
    partialAttendances/   # 부분참 목록
    supplies/             # 물품 목록
    snacks/               # 간식 목록
    onSiteReg/            # 현장 등록 (체크인 + 워크인)
    tshirtOrders/         # 단체티 신청
                          # ⚠ 민감 노드(cancellations/unmatchedPayments/medicalLogs)는 retreatsPrivate/{id}/ 로 이동됨
    cellColors/           # 참가자 명단 셀 색상
    milestones/           # 준비 일정 마일스톤 (공유 To-do) — { title, targetDate, done, note?, createdAt?, updatedAt?, sourceSite? }
                          #   sourceSite: "retreat-admin"(행정) | "move-guide"(이가드). 이가드 사이트와 실시간 공유
    iguard/               # 이가드 사이트 전용 데이터 (meals 등) — 행정 앱은 안 씀
    periods/              # 수련회 기간 목록 (RetreatPeriod, 다부제 지원) — DB는 수련회별 소유지만
                          #   화면(준비 일정 패널)은 모든 수련회의 기간을 항상 합쳐서 표시(아래 패턴 9 참조)

classes/
  {year}/
    {classKey}/           # classKey 형식: "{부}-{학년}-{반}" (예: "1-2-3" = 1부 2학년 3반)
      teacher: string
      students: Record<studentId, { name, num?, phone?, jang? }>
                          # jang: true = 장결자(장기결석) — 출석부 앱 시트동기화가 채움. ClassRosterTab이 분리 표시
                          # ⚠ classes/attendance는 "출석부 앱"과 공유 노드 (보안규칙 admins/teacherClasses 기반)

retreatsPrivate/          # 🔒 민감 데이터 — 이가드 멤버는 접근 불가 (admins/retreatAdmins만)
  {retreatId}/            #    이가드가 retreats/{id} 전체를 읽으므로, 민감 노드는 이 형제 트리에 둔다.
    cancellations/        #      취소명단(환불계좌)
    unmatchedPayments/    #      입금 미매칭
    medicalLogs/          #      의료 일지(증상·처방약)
    teacherIdNumbers/     #      교사 주민번호(paths.teacherIdNumbers) — teachers 노드에서 분리 완료

brainstorm/               # 💡 브레인스토밍 보드 (전역 공유, 수련회 무관 — 홈 화면 하단 캔버스)
                          #   { title?, text, color, author, createdAt, updatedAt?, x?, y?, comments? }
                          #   admins/retreatAdmins만 읽기/쓰기. 실시간 onValue 구독, 드래그 좌표는 가상 캔버스(1400x760) 기준
admins/                   # uid → true (마스터 관리자, 멤버 승인/관리 권한)
retreatAdmins/            # uid → { email, name?, approvedAt? } (행정 사이트 멤버) — 구버전 문자열도 normalize 처리
retreatPending/           # uid → { email, name, requestedAt } (행정 승인 대기)
iguardMembers/            # uid → true (이가드 사이트 멤버)
iguardRoles/              # uid → "team" | "staff" (이가드 역할: staff=실행 탭만, 기획·정보 숨김)
iguardPending/            # uid → { ... } (이가드 승인 대기)
attendance/{year}/        # 출석 기록 (출석부 앱 소유)
```

### classKey / studentId 중요 규칙
- classKey 파싱: `parseClassKey(classKey)` (`src/lib/classKey.ts`) 사용 — `split("-")` 직접 파싱 금지 (2026-07 R2 공통화)
- 1부/2부에 동일한 studentId가 존재할 수 있으므로, 컴포넌트에서 쓰는 uniqueKey = `"{buNum}_{studentId}"`
- `getClassesByYear(year)` 를 통해 classes 노드 접근 (직접 Firebase 쿼리 금지)

### 다중 사이트 연동 (행정 ↔ 이가드)
- 행정 사이트(이 레포)와 **이가드 사이트(별도 레포)가 같은 Firebase 프로젝트를 공유**.
- 공유 지점: `retreats/{id}/milestones`(준비일정 To-do, 양방향), `groups`/`rooms`(이가드는 읽기 전용 소비).
- 이가드 고유 데이터는 `retreats/{id}/iguard/*` 네임스페이스에만 기록 — 행정 노드에 쓰지 말 것.
- 멤버: 같은 `admins`/`retreatAdmins` 허용목록 재사용. 이가드는 `iguardMembers` + `iguardRoles`(team/staff).
- ⚠ **Rules 배포는 학생 앱(`고등부 학생 출석부/database.rules.json`)에서만 실행한다.**
  이 앱의 `firebase.json`은 학생 앱 rules 파일을 참조하도록 설정되어 있다.
  `DO_NOT_DEPLOY.database.rules.json`은 보관용 사본이며 배포에 사용하지 않는다.
- `classes`/`attendance`의 read 규칙은 admin·retreatAdmins·iguardMembers(전체) + 출석부 앱 교사는 본인 반만 — 이 앱은 `retreatAdmins`로 분류되므로 영향 없지만, 규칙 변경 시 이 분류가 깨지면 `getClassesByYear` 등 이 앱의 모든 학생 데이터 조회가 막힌다.

### database.rules.json 주요 패턴
- `teacherExtra` 규칙: classKey의 하이픈(`-`)을 언더스코어로 치환하기 위해 `.replace('-','_')` 3회 체인 사용 (Firebase RTDB는 정규식 replace 미지원)
- `iguardRoles/$uid`: `.validate` 규칙으로 값을 `'staff'` 또는 `'team'`으로 제한
- `partialAttendances/$studentKey`: `.validate`로 `type` 필수 + `'선복귀'`/`'후발대'` 값 제한, 알 수 없는 자식 키 차단(`$other: .validate: false`)
- `milestones/$milestoneId`: 각 필드별 타입·길이·형식 validate 규칙 적용

---

## 핵심 코드 패턴

### 1. snapToList — Firebase 역직렬화 헬퍼 (db.ts 내부 사용)
```typescript
function snapToList<T extends { id: string }>(snap: DataSnapshot): T[] {
  if (!snap.exists()) return [];
  return Object.entries(snap.val()).map(([id, data]) => ({ id, ...(data as object) } as T));
}
```
`Object.entries(snap.val()).map(...)` 패턴을 직접 쓰지 않고 이 헬퍼 사용.

### 2. 에러 처리 패턴 (모든 탭 공통)
```typescript
const [loadError, setLoadError] = useState<string | null>(null);

async function load() {
  setLoading(true);
  setLoadError(null);
  try {
    // 데이터 로드
  } catch (e) {
    setLoadError(e instanceof Error ? e.message : String(e));
  } finally {
    setLoading(false);
  }
}

// JSX 상단에 에러 배너
{loadError && (
  <div className="mb-4 bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
    ⚠ 로드 오류: {loadError}
  </div>
)}
```

### 3. 특이사항 저장 — race condition 방지
```typescript
// ✅ 올바른 방법: 경로 지정 업데이트
await updateParticipantExtra(retreat.id, key, extraValue);

// ❌ 잘못된 방법: 전체 덮어쓰기 → 동시 접근 시 race condition
await saveParticipants(retreatId, updatedParticipants);
```

⚠ **시트 동기화도 이 원칙을 우회할 수 있다** — 시트 자체에 특이사항 열이 있어서, `syncFromSheet()`가 participants를 전체 재생성하면 관리자가 특이사항 탭에서 저장한 `[분류]` 태그·수정 문구가 시트 원문으로 되돌아가는 버그가 있었다(2026-07-06 수정). `ParticipantsTab.tsx`의 `syncFromSheet`/`chooseDuplicateEntry`는 재생성 전 기존 participants를 읽어 `studentId`(폴백: 이름+부+학년+반) 기준으로 extra를 찾아 **우선 보존**하고, 기존 값이 없을 때만 시트 값을 채운다. 시트 연동 관련 코드를 고칠 땐 이 보존 로직이 깨지지 않는지 확인할 것. 단, 특이사항 탭에서 메모를 **삭제**했는데 시트 원문이 남아있으면 다음 동기화 때 되살아난다(기존값 없음 취급) — 완전 삭제하려면 시트 응답도 지워야 함.

⚠ **보존 맵에는 studentId 충돌 가드가 필수** (2026-07-08 수정) — 과거 학생 매칭이 애매해 두 사람이 잠깐 같은 studentId(또는 같은 이름+부+학년+반)로 매핑되면, 한 사람의 extra가 그 키에 저장된 뒤 "기존값 우선 보존" 로직이 그 잘못된 값을 재동기화마다 영구 반복 보존해 **엉뚱한 사람에게 특이사항이 복사**된다(실제 6쌍/12명 오염 발생). `syncFromSheet`는 `extraByStudentId`/`extraByIdentity` 맵을 만들 때 **같은 키가 2명 이상에게 나타나면 그 키를 보존 후보에서 제외**한다(`ambiguousStudentIds`/`ambiguousIdentities`). 이 가드를 제거하면 오염이 조용히 영구화되니 유지할 것.

**특이사항 오염 진단·복구 방법** (재발 시 재사용) — extra는 `[분류]` 태그가 붙으므로 단순 문자열 비교로는 태그 유무 차이 때문에 오염을 놓친다(2026-07-08 실측). 반드시 **DB의 모든 extra에서 `^\[.+?\]\s*` 태그를 떼고 → 시트 원문(기타사항 열, 이름 접두숫자 제거 후)과 전수 대조**해, 시트에 그 사람 본인 값이 없는 항목을 오염으로 판정한다. 복구는 `participants/{key}/extra`만 경로 지정으로 수정(시트에 원문 있으면 복원, 없으면 삭제) — 전체 덮어쓰기 금지, 진행 전 스냅샷 확보.

### 3b. 전체 덮어쓰기 노드의 자동 백업 — groups/rooms
`saveGroups`/`saveRooms`는 구조상 전체 `set()` 덮어쓰기가 불가피한데(배열 순서·삭제 반영), participants와 달리 백업이 없어 저장 버그·실수 시 복구 수단이 없었다(2026-07-06 수정). `db.ts`의 `backupNodeBeforeOverwrite()`가 저장 직전 현재 상태를 롤링 백업(최근 5개)한다. 편집 중 저장이 잦으므로 **마지막 백업 후 10분 이내면 스킵**해 쓰기 폭주를 막는다(복구 시엔 `minIntervalMs=0`으로 강제 백업). 각 탭 툴바의 `BackupRestoreButton`이 시점 선택 복구 UI를 제공한다. 새로 전체 덮어쓰기 노드를 추가할 땐 이 패턴(백업 헬퍼 + 복구 버튼)을 재사용할 것.

조편성의 `clearGroups()`와 방배정의 `clearRooms()`는 전면 삭제 전용 예외다(2026-07-13 추가). 최근 자동 백업이 있어도 `minIntervalMs=0`으로 현재 상태를 다시 강제 백업하며, 백업 결과가 `false`면 삭제 자체를 중단한다. UI는 미저장 편집을 먼저 `saveGroups()`/`saveRooms()`로 반영한 다음 전용 삭제 함수를 호출해야 복구 시점에 사용자가 보고 있던 상태가 담긴다. 조 삭제 시 방배정과 이가드 소유 `iguard/groupStaff`는 소유권 경계상 함께 삭제하지 않으며, 방 삭제 시에도 `rooms` 외 다른 노드는 건드리지 않는다.

### 3c. 인쇄/JPG 출력 — escapeHtml 필수
`printAsPDF`/`exportAsJPG`/`rowsToHtmlTable`은 조립된 HTML 문자열을 그대로 `document.write`한다. 학생이 신청폼에 입력한 이름·특이사항 등이 이스케이프 없이 삽입되면, `<img src=x onerror=...>` 같은 값이 관리자가 인쇄하는 순간 관리자 컨텍스트에서 실행되는 저장형 XSS가 된다(2026-07-06 수정). **HTML 문자열에 사용자 입력을 삽입하는 모든 지점은 `exportUtils.ts`의 `escapeHtml()`로 감쌀 것.** 새 인쇄/내보내기 기능을 추가할 때 반드시 적용.

조편성 공유물은 한 부서의 모든 조를 한눈에 비교하는 용도를 기준으로 한다(2026-07-13 수정). `GroupsTab.tsx`의 PDF는 각 조를 교사→조장→학생 순서의 좁은 세로 열로 만들고, 한 부서의 조 전체를 **`420mm × 115mm` 가로 스튽e 1페이지**에 좌우로 나열한다. 학년·반은 `3-6`처럼 축약하고 번호·성별 열은 제거하며, 출석 체크 칸과 역할/셀색상은 유지한다. JPG는 부서별 1600px 가로 이미지 `...조편성_1부.jpg`, `...조편성_2부.jpg`를 각각 생성한다. 표 행 수를 바꾸거나 출력 CSS를 수정할 때는 11조·조당 최대 행 목업을 PDF로 렌더해 격자 겹침·잘림·하단 여백을 시각 검증할 것.

조편성 인쇄 행 색상(2026-07-14)은 역할·운영상태·성별 우선순위를 지킨다. 조장은 `r-leader` 노랑, 취소 학생은 `r-red`, 나머지 학생은 `groupPrint.ts`의 성별 판정으로 남 `r-male` 파랑·여 `r-female` 분홍을 사용한다. 부분참은 성별 배경을 덮지 않고 `부분참` 배지로 남긴다. 교사는 같은 부서의 `TeacherAttendance.status`를 우선 찾아 `부분참/불참`만 이름 아래 고정 배지로 표시하며 전참은 생략한다. 교사 이름과 상태를 한 줄에 넣으면 좁은 조 열에서 둘 중 하나가 잘리므로, 기존 20px 행 안에서 `.teacher-name`과 `.teacher-status`를 세로 배치한다. 참가자 성별이 없으면 기존 홀수반=남·짝수반=여 규칙으로 보강한다.

### 3d. 선택 필드 삭제 — Firebase update에는 null 전달
Firebase `update()`에서 `undefined`는 `stripUndefined()`가 제거하므로 기존 DB 필드 삭제가 아니다. 교사 참석 수정처럼 상태 전환으로 `note`·`arrivalInfo`·`transport` 등을 비울 때는 `teacherWrite.ts`의 `prepareTeacherUpdate()`로 **폼에 포함됐지만 빈 선택 필드만 `null`로 변환**한 뒤 `updateTeacher()`에 전달한다. 키 자체가 없는 부분 업데이트(출석부 원본 이름/반 갱신 등)는 보존해야 하므로, 모든 누락 키를 일괄 `null`로 만들지 말 것.

### 4. Auth 접근 레벨
```typescript
type AccessLevel = "none" | "member" | "admin";
// "none"  → 접근 불가 (승인 요청 화면)
// "member" → 수련회 데이터 읽기/쓰기 가능
// "admin"  → 멤버 관리 (승인/거절) 추가 가능
```

### 5. Keep-alive 탭 패턴 (RetreatPageClient.tsx)
자주 사용하는 탭(PARTICIPANTS, GROUPS, ROOMS, ROSTER)은 한 번 마운트되면 언마운트하지 않고 CSS `display` 토글로 보여주기/숨기기:
```typescript
const KEEP_ALIVE_TABS = new Set([0, 1, 2, 7]); // PARTICIPANTS, GROUPS, ROOMS, ROSTER
const [mountedTabs, setMountedTabs] = useState<Set<number>>(new Set());

// 탭 전환 시 mountedTabs에 추가 (한 번 추가되면 제거 안 함)
// JSX: mountedTabs.has(idx) && <div style={{ display: tab === idx ? "block" : "none" }}>

// 기타 탭: 기존 conditional render (tab === idx && <Component />)
```
이를 통해 Firebase 실시간 구독 재설정과 상태 초기화를 방지합니다.

### 6. GroupComponents.tsx — 조편성 컴포넌트 분리
GroupsTab에서 추출한 순수 UI 컴포넌트:
- **GroupCard**: 조 카드 (교사/조장/스탭/GBS 편집, 학생 드래그앤드롭, 반별 그룹화 표시)
- **UnassignedBySection**: 미배정 학생/교사를 부-학년-반별로 그룹화하여 표시
- **StudentChip**: 드래그 가능한 학생 칩 (셀 색상 반영)
- **TeacherChip**: 드래그 가능한 교사 칩 (참석 상태 색상 반영)
- **StudentInfo**: Student 확장 인터페이스 (bu, participantKey 추가)
- **조장/스탭 학생 조회**: `groups`에는 역할이 이름 문자열로 저장되므로 전역 `name → student` 맵을 만들면 부서 간 동명이인이 충돌한다. `groupRoleStudent.ts`가 현재 `group.studentIds` → 현재 `group.bu` → 전역 유일 이름 순으로만 학생을 확정하며, 화면·XLSX·PDF/JPG가 이 단일 함수를 사용한다.

### 7. 접근성(A11y) 패턴
- **탭 네비게이션**: `role="tablist"` + `role="tab"` + `aria-selected` (대그룹·소그룹 탭 모두 적용)
- **탭 패널**: `role="tabpanel"` + `id="tab-content-panel"` (탭 `aria-controls`와 연결)
- **모달**: `role="dialog"` + `aria-modal="true"` + `aria-label` + ESC 키 닫기 (`onKeyDown`)
- **아이콘 버튼**: `aria-label` 필수 (예: `aria-label="조 편집"`, `aria-label="조 삭제"`, `aria-label="교사명 제거"`)

### 8. MAIN_ADMIN 환경변수 (page.tsx)
```typescript
const MAIN_ADMIN = {
  name: process.env.NEXT_PUBLIC_MAIN_ADMIN_NAME ?? "관리자",
  email: process.env.NEXT_PUBLIC_MAIN_ADMIN_EMAIL ?? "",
};
```
하드코딩 대신 환경변수에서 읽음. Vercel 및 `.env.local`에 설정 필요.

### 9. 수련회 기간(periods) — DB는 수련회별 소유, 화면은 전체 합산 표시

`retreats/{retreatId}/periods`는 DB 구조상 수련회별로 분리(다부제 지원)돼 있지만, "준비 일정" 패널은 **어느 수련회를 선택했든 모든 수련회의 기간을 항상 같이** 보여준다(마일스톤과 동일 패턴). `db.ts`의 `subscribeToAllRetreatPeriods(retreatIds, cb)`가 전체 수련회 ID에 대해 각각 구독 후 merge하고, 각 기간에 `retreatId`(소유 수련회) 태그를 붙인 `RetreatPeriodWithOwner` 타입으로 반환한다.

```typescript
// "+ 기간 추가"는 사이드바에서 선택된 수련회 쪽에 씀(retreat.id)
// 수정/삭제는 그 기간이 원래 속한 period.retreatId를 써야 함
// 선택된 수련회 ID로 잘못 쓰면 다른 수련회에 기간이 복제되는 버그가 됨
await updateRetreatPeriod(period.retreatId, period.id, data);  // ✅
await updateRetreatPeriod(selectedRetreat.id, period.id, data); // ❌ — period가 다른 수련회 소유일 수 있음
```

`getEarliestPeriodDateByRetreat(retreatIds)`(일회성 `get()`)는 각 수련회의 가장 이른 기간 시작일을 구해, 홈 화면의 수련회 목록을 **행사 날짜 최신순**(생성일이 아니라 실제 열리는 날짜 기준)으로 정렬하는 데 쓴다. 기간이 아직 없는 수련회는 `createdAt`으로 폴백.

### 10. UpdateBanner — 새 배포 감지 (서비스워커 없이)

학생 출석부 앱과 달리 이 앱은 PWA가 아니라 서비스워커를 새로 도입하는 리스크를 피하고, **빌드 ID 폴링** 방식을 쓴다:
- `next.config.ts`가 `process.env.VERCEL_GIT_COMMIT_SHA`(로컬은 `Date.now()` 폴백)를 `NEXT_PUBLIC_BUILD_ID`로 빌드 시점에 클라이언트 번들에 박아넣음
- `/api/version`(`force-dynamic`)이 **현재 배포 중인** 빌드의 ID를 매 요청마다 반환
- `UpdateBanner`가 5분마다 + 탭 visibility 변경 시 `/api/version`을 폴링해, 페이지 로드 시점 ID와 다르면 "새 버전이 있습니다" 배너 표시

### 11. 식수 계산 역할(MealRole) — 스키마 확장 시 하위호환 (`MealCountTab.tsx`)

식수 인원 역할은 `types.ts`의 `MEAL_ROLES = ["staff","teacher","minister","student","extra"]`(스탭/교사/교역자/학생/기타)이고, 이 카운트가 `retreats/{id}/mealCount`의 `base`와 각 후발/선복귀 `adjustments[].counts`에 저장된다. `교역자(minister)`는 2026-07-08에 `교사·교역자` 한 칸을 분리하며 추가됨.
- **역할 추가는 DB 저장 형태 변경**이지만, 로드 시 `{ ...EMPTY_COUNTS, ...(data.base||{}) }` + 계산부의 `|| 0` 덕분에 **기존 데이터에 새 키가 없어도 0으로 안전하게 읽힌다** — 마이그레이션 불필요, 총원·기존 값 유지.
- 새 역할을 추가할 땐 반드시 6곳을 함께 갱신: `MEAL_ROLES`, `EMPTY_COUNTS`, `ROLE_LABELS`, `sumCounts`, adjustments 차감 루프, 끼니별 표(헤더/셀/hasNegative). 하드코딩된 `counts.staff/teacher/...` 나열을 빠뜨리면 그 역할이 계산에서 누락된다.
- **자동 제안 한계**: 교사 참석 데이터(`teachers`)의 `bu`는 `1부/2부/스탭`뿐이라 교역자(목사·전도사) 구분이 없다. "DB에서 자동 제안"은 교사/스탭/학생만 채우고 **교역자는 수동 입력**으로 남긴다.

### 12. 자동 조편성 알고리즘 — 반 단위 배정 + 하드/소프트 2계층 페널티 (`autoAssignUtils.ts`)

조편성 자동배정은 **학생 1명이 아니라 반(`ClassUnit`) 전체를 한 조에 통째로** 배정한다(같은 반은 절대 안 쪼개짐). UI는 `AutoAssignPanel.tsx`(state)→`AutoAssignConfigPanel.tsx`(입력)이고 순수 로직은 `autoAssignUtils.ts`에 격리(테스트: `autoAssign.test.ts`). 흐름: Phase0 조장 반 고정 → Phase1 반을 인원 많은 순으로 점수 기반 그리디 배정(최고점 ±`SCORE_TOLERANCE=50` 후보 중 무작위) → Phase2 교사 배정. 이걸 **16회 반복해 `scoreGroups` 최고점 채택**.
- **페널티 2계층**: 이분법(위반/준수) 규칙 — 최대인원·고려관계(학생·교사·교사학생·**반**)·혼성·동성·**최소2반** — 은 전부 동일한 `HARD_PENALTY(1_000_000)`. 동일 크기라 best-of-16이 하드 위반 '건수'를 최소화한다(동시 충족 불가 시 덜 어기는 쪽). 인원 균등·학년 분산은 '정도(gradient)' 목표라 수천 규모로 유지 → 하드를 절대 못 이긴다. **새 이분법 규칙을 추가하면 `HARD_PENALTY`를 쓰고, tryAssign(중간 유도)·scoreGroups(최종 판정) 두 곳에 모두 반영**할 것(한 곳만 넣으면 그리디는 피하는데 최종 평가엔 안 잡히거나 그 반대가 된다).
- **하드는 보장이 아니라 최우선순위**다 — 그리디+제한 반복이라 입력이 실현 불가(예: 조 수 > 전참 교사 수, 최소2반인데 조 수 > 반÷2)면 위반이 남을 수 있다. 그래서 `minTwoClasses`는 조 수 상한을 `floor(반÷2)`로 클램프하고(`AutoAssignPanel`), UI가 전참 부족을 경고한다.
- **1·2부 합산 조 수는 짝수** (`ensureEvenCombinedGroupCounts`, 2026-07-13): 입력·조당 최대 인원 자동 계산 결과의 합이 홀수면 총합을 정확히 1만 조정한다. 상한 여유가 있으면 현재 `학생 수÷조 수`가 더 큰(더 붐비는) 부서의 조를 하나 늘리고, 양쪽 모두 상한이면 평균 인원이 더 적은 부서의 조를 하나 줄인다. 학생이 없는 부서는 합계와 보정 대상에서 제외한다. 조당 최대 인원 입력은 `calculateEvenGroupCountsForMaxSize()`가 원 계산과 보정을 함께 수행해 **화면 숫자부터 즉시 짝수 합계로 표시**하며, UI 실행부와 `runAutoAssign` 핵심 함수에도 같은 방어선을 둔다. 실행할 때만 보정하면 화면에 `11+10=21조`가 남아 사용자 기준으로는 실패다.
- **부서별 부분 재편성** (`AutoAssignScope`, 2026-07-14): `전체/1부만/2부만` 중 한 부서만 실행하면 `runAutoAssign()`은 선택 부서 결과만 생성하고, `mergeAutoAssignedGroups()`가 반대 부서의 현재 조 객체(교사·조장·GBS·학생 수동 수정 포함)를 그대로 합친 뒤 기존 `groups` 저장 흐름에 넘긴다. 부분 실행의 합산 짝수 조건은 설정에 적힌 반대 부서 조 수가 아니라 **현재 화면에서 보존할 실제 조 수**를 `ensureEvenScopedGroupCount()`에 넣어 맞춘다. 실행 범위는 일회성 동작이므로 `autoAssignConfig`에는 저장하지 않으며, 부분 결과만 그대로 `setGroups()`해서 반대 부서를 미배정으로 만들지 말 것.
- **빈 조 판정은 학생 수가 아니라 실제 반 수** (2026-07-13): 파송 조장은 목표 조의 `studentIds`·`gData.total`에는 들어가지만 `unitKeys`에는 들어가지 않는다. 따라서 혼성 규칙의 “첫 반 여부”, 빈 조 우선 배정, 최종 빈 조 하드 판정은 모두 `unitKeys.length` 기준이어야 한다. `total > 0`을 쓰면 파송 조장만 있는 조가 첫 단일 성별 반을 받을 때 혼성 하드 위반으로 오인되어 `조장 1명 + 배정 없음`이 생긴다. 또한 반 붙임은 여러 반을 한 번들로 줄이므로 조 수 상한은 원 반 수뿐 아니라 `buildAffinityBundles(...).length`도 넘지 않게 한다.
- **파송 조장의 성별과 그리디 후처리** (2026-07-13): 파송 조장은 반 구조에서는 빠지지만 실제 조원이므로 혼성/동성 판정에는 성별을 포함한다. 단, 혼성 규칙에서 조장 한 명만 해당 성별이고 나머지가 전부 반대 성별인 구성은 금지하며, 파송 조장 본인 외 같은 성별 반이 최소 하나 있어야 한다. 인원에는 넣고 성별에서는 빼거나 조장 혼자만으로 혼성을 충족시키면 `남자 파송 조장 + 여자 11명`처럼 운영상 가혹한 결과가 생긴다. `tryAssign`은 반 단위 큰순 그리디라 최종 점수가 더 좋은 단일 반 이동을 스스로 만들지 못하므로, 상위 그리디 후보 4개에 `improveGroupsByWholeUnitMoves()`를 적용한다. 조장 고정/붙임 번들은 이동하지 않고, 파송 본인 반 금지·최소 한 반·파송 조장 동성 동료 유지·`maxGroupSize`는 이동 전 방어하며, 나머지는 `scoreGroups()`가 하드 위반과 인원 분산을 함께 비교한다. 운영 2부 설정(11조·최대12명)은 최종 규칙으로 10회 모두 최소8명·최대12명이며, 남자 파송 조장 조에 여자 3학년 6반과 남자 2학년 7반이 함께 배정됐다.
- **설정 저장** (`retreats/{id}/autoAssignConfig`, 2026-07-13): 사용자가 `설정 저장`을 눌렀을 때 부별 조 수·전체 규칙·조장 위치/파송 여부·학생/교사/교사학생/반 분리·반 붙임을 버전 1 문서로 원자 저장하고, 패널 진입 시 한 번 불러온다. 관계 추가 전의 미완성 입력 선택기는 저장하지 않는다. 저장값은 `normalizeAutoAssignConfig()`로 누락 필드·구버전 조장 모드를 기본값으로 보정하며, 수련회 ID가 바뀌면 먼저 모든 설정을 초기화해 직전 수련회 상태가 섞이지 않게 한다. 이 노드는 입력 설정 전용이라 `groups` 결과와 이가드 소유 경로를 건드리지 않는다.
- **고려 관계 저장 형태**: 학생·교사는 이름 문자열 쌍, 반은 `unitKey`(`${bu}_${grade}_${classNum}`) 쌍. 이름 기반이라 동명이인은 구분 못 한다(입력 UI는 이름 타이핑→후보(부·학년·반) 선택으로 확인만 돕고, 저장은 이름).
- **반 붙임(결합) 관계** (`classAffinities`, 2026-07-11): 분리와 반대로 두 반을 **반드시 같은 조**로. 페널티가 아니라 **구조 보장** — `buildAffinityBundles`(union-find)가 붙임으로 연결된 반들을 번들로 묶고 Phase 0.5(조장 고정 추종)·Phase 1이 **번들 단위로 배정**한다("같은 반은 안 쪼개짐" 불변식의 일반화, 연쇄 A+B·B+C → 한 묶음). 따라서 위반은 배정 결과가 아니라 **입력 모순**으로만 생기고, `validateClassRelations`(직접/연쇄 모순·혼성 번들+동성 규칙·최대 인원 초과·부 교차)가 실행 전에 UI에서 차단한다(에러 시 실행 버튼 비활성). scoreGroups에도 붙임 하드 판정이 있다(조장 고정이 번들을 쪼개는 경우의 방어망). `applyConflicts`가 꺼지면 붙임도 무시된다. 번들 수정 시 mixGender/sameGender가 "배정 후 조 구성" 기준으로 평가되는 점 유지할 것(혼성 번들이 자연 통과해야 함).

### 13. 학생 식별 키는 반드시 `resolveStudentKey`로 — 화면마다 다른 기준 금지 (`studentMatcher.ts`)

> ⚠ `getStudentsByYear`는 반환 `Record`의 키와 각 `Student.id` 둘 다 이미 `"${buNum}_${rawId}"` 형태로 만든다. `cellColors`의 `studentKey`로 학생을 찾을 때는 `students[studentKey]`로 직접 조회하고, 접두를 떼서 `students[rawId]`로 찾지 말 것. `findStudent`가 반환한 `s.id`에도 접두를 다시 붙이면 이중접두가 된다. 테스트 fixture도 `{ "2_rid9": { id: "2_rid9", ... } }` 형태로 실제 반환값을 재현한다.

셀 색상(`cellColors`)과 부분참(`partialAttendances`)은 학생을 **`${buNum}_${반명단(classes/)의 studentId}`** 키로 식별한다. 신청자 취합(`ClassRosterTab`)은 반 명단을 순회하며 이 키로 색을 저장하므로, **참가자(participants)의 `studentId` 영속 여부와 무관하게** 아무나 색칠할 수 있다.

⚠ **버그(2026-07-13)**: 부분참석 탭이 목록을 `participants`에서 만들며 참가자에 **저장된 `p.studentId`가 있어야만** 행을 만들었다(`if (!p.studentId) return []`). 자동 매칭이 반 명단에서 못 찾은 신청자는 `studentId=null`로 저장되는데(`ParticipantsTab`의 `studentId: ms?.id ?? null`), 그런 학생은 신청자 취합에서 주황(부분참)으로 칠해도 부분참석 탭에 **영영 안 떴다**. 두 화면이 학생을 다른 기준(로스터 id vs 참가자 저장 studentId)으로 식별한 게 원인.

- **재사용 규칙**: 참가자를 셀색상/부분참 키로 바꿀 땐 `resolveStudentKey(p, students)`(`studentMatcher.ts`)만 쓴다 — `p.studentId`가 있으면 그대로 접두, 없으면 `findStudent`로 반 명단에서 찾아 보강해 **신청자 취합과 항상 같은 키**를 낸다. `students`는 `getStudentsByYear(retreat.year)`로 로드. 이름 매칭을 새로 짜지 말 것(canonical은 `findStudent`, 규칙 #9). 회귀 테스트: `studentMatcher.test.ts`의 `describe("resolveStudentKey")`.
- ⚠ **이중접두 함정**: 일부 데이터는 `p.studentId`가 이미 `"2_abc"`처럼 부 접두가 붙어 저장돼 있다. 무조건 `${buNum}_${studentId}`로 만들면 `"2_2_abc"`가 되어 셀색상 키와 어긋나 **주황 학생이 통째로 사라진다**(2026-07-13 재발, 배포 후 발견). `resolveStudentKey`는 `/^[12]_/` 검사로 이미 접두된 값은 그대로 쓴다 — 이 가드를 제거하지 말 것.
- ⚠ **pool은 참가자가 아니라 "주황 셀 키"에서 만든다** (`buildPartialPool`, `lib/partialPool.ts`): 주황(부분참) 표시는 반 명단(classes/) 셀에 칠해지므로, **시트에 없는 구두 신청자**를 수동으로 주황 칠하면 `participants`에 아예 없다. 부분참석 탭 목록을 participants 순회로 만들면 이런 학생은 영영 안 뜬다(2026-07-13, 3회 재발 끝에 원인 확정 — 김민하 사례). 그래서 pool은 `cellColors`의 주황 키 ∪ `partialAttendances` 기록 id에서 만들고, 표시 정보는 `students`(반 명단)에서 가져오며 참가자가 있으면 연락처만 보강한다. 식수 계산처럼 부분참 기록을 다시 소비하는 화면도 participants만 별도 순회하지 말고 `buildPartialPool()`을 재사용해야 수동 학생 이름이 유지된다(2026-07-14 식수 계산 미매칭 재발). 회귀 테스트: `partialPool.test.ts`, `mealCountPeople.test.ts`. 요약 카드의 본대·참가확정은 시트(participants) 기준, 선복귀/후발대 수·명단은 pool 기준이라 수동 추가자도 명단에 잡히되 시트 헤드카운트(참가확정)에는 안 들어간다.

---

## 테스트

```bash
# 전체 테스트 실행
npm test          # = vitest run

# watch 모드
npx vitest
```

테스트 파일 위치: `src/lib/*.test.ts` (순수 로직 유닛 테스트)
- `studentMatcher.test.ts` — 이름 정규화, 9단계 매칭 로직
- `sheetsParser.test.ts` — CSV 파싱 (따옴표 내 줄바꿈 등)
- `exportUtils.test.ts` — xlsx 내보내기 유틸
- `groupNumber.test.ts` — 조 번호 연속 표시 로직

설정: `vitest.config.ts` — `globals: true`, `@` alias → `src/`

---

> RetreatDataContext는 미사용으로 2026-07 삭제됨(git 히스토리에 있음). 탭 간 구독 공유가 필요해지면 새로 설계할 것.

---

## 절대 하지 말 것

1. **컴포넌트에서 Firebase 직접 import 금지**
   ```typescript
   // ❌ 금지
   import { db } from "@/lib/firebase";
   import { get, ref } from "firebase/database";
   
   // ✅ 반드시 db.ts 함수만 사용
   import { getClassesByYear } from "@/lib/db";
   ```

2. **saveParticipants()로 전체 participants 덮어쓰기 금지**
   → 단일 필드 수정은 항상 `updateParticipantExtra()` 또는 경로 지정 업데이트 사용

3. **TypeScript 에러 있는 상태로 배포 금지**
   → 배포 전 `npx tsc --noEmit` 으로 0 errors 확인 필수

4. **불필요한 패키지 추가 금지**
   → 현재 의존성 최소화 유지
   → 새 패키지 추가 전 기존 라이브러리로 해결 가능한지 먼저 검토

5. **Object.entries(snap.val()).map(...)** 직접 사용 금지 → `snapToList<T>(snap)` 사용

---

## 구글 시트 연동 규칙

시트 열 순서 (A~D는 고정, 변경 불가):
| 열 | 내용 |
|---|---|
| A | 타임스탬프 (자동 생성) |
| B | 이름 |
| C | 성별 (`남` / `여` 정확히 두 글자) |
| D | 부서 (`1부` / `2부`) |
| E+ | 학년, 반, 연락처 등 (키워드로 자동 인식) |

- 시트는 "웹에 게시" (File → Share → Publish to web → CSV) 필요
- `fetchSheetCSV(sheetId, gid)` → raw rows 반환
- `fetchSheetParticipants(sheetId, gid)` → `Participant[]` 반환

---

## 개발 & 배포

```bash
# 개발 서버
npm run dev

# TypeScript 타입 체크 (배포 전 필수)
npx tsc --noEmit

# 테스트
npm test

# 프로덕션 배포
npx vercel --prod --yes
```

배포 URL: **https://retreat-app-theta.vercel.app**

✅ **Git 자동배포 정상(2026-07-08 확인)**: 07-06에 "push해도 배포가 안 잡힌다"는 이슈가 있었으나, Vercel API 배포 이력 검증 결과 07-06 `git connect`+Root Directory 세팅 완료 이후의 모든 push가 정상적으로 자동 배포됨(git 소스, READY). push 후 `npx vercel ls`로 Ready 확인은 계속 할 것(/ship 스킬 절차). 만약 다시 트리거가 안 되면 비상 폴백: 레포 루트에 `retreat-app/.vercel/project.json`을 임시 복사한 뒤(Root Directory가 retreat-app이라 레포 루트에서 실행) `npx vercel --prod --yes`로 수동 배포, 작업 후 임시 `.vercel/` 삭제.

---

## 탭 구조 (RetreatPageClient.tsx)

탭 인덱스는 `TAB_IDX` 상수로 관리 (`RetreatPageClient.tsx` 상단):

```typescript
const TAB_IDX = {
  PARTICIPANTS: 0, GROUPS: 1, ROOMS: 2, NOTES: 3, TEACHERS: 4,
  CARPOOL: 5, PARTIAL: 6, ROSTER: 7, INSURANCE: 8, CANCELLATION: 9,
  SUPPLIES: 10, ONSITE: 11, PAYMENTS: 12, TSHIRT: 13, MEDICAL: 14,
} as const;
```

탭 그룹 구조 (`TAB_GROUPS`): 대그룹 → 소그룹 2계층. 대그룹 탭은 `role="tablist" aria-label="탭 그룹"`, 소그룹 탭은 `role="tablist" aria-label="세부 탭"`.

| 그룹 | 탭 | TAB_IDX 키 | keep-alive |
|---|---|---|---|
| 사전 준비 | 시트 연동 | PARTICIPANTS (0) | ✅ |
| | 신청자 취합 | ROSTER (7) | ✅ |
| | 미납자 현황 | PAYMENTS (12) | |
| | 단체티 신청 | TSHIRT (13) | |
| | 취소명단 | CANCELLATION (9) | |
| | 여행자 보험 | INSURANCE (8) | |
| | 조편성 | GROUPS (1) | ✅ |
| | 방배정 | ROOMS (2) | ✅ |
| | 교사 참석 | TEACHERS (4) | |
| | 물품/간식 | SUPPLIES (10) | |
| 현장 준비 | 카풀 | CARPOOL (5) | |
| | 부분 참석 | PARTIAL (6) | |
| | 현장 등록 | ONSITE (11) | |
| | 의료 일지 | MEDICAL (14) | |
| | 특이사항 | NOTES (3) | |

(이전엔 "참가자 명단"이 별도 "사이트 셋팅" 그룹이었으나, 실제 사전 준비의 첫 단계(시트 연동·DB 매칭)라 "신청자 취합"과 헷갈리지 않도록 이름을 "시트 연동"으로 바꾸고 "사전 준비" 그룹 맨 앞으로 옮김.)

### layout.tsx — dangerouslySetInnerHTML
`<head>`에 인라인 스크립트(`dangerouslySetInnerHTML`)가 있음. 카카오톡/네이버 등 인앱 브라우저에서 Firebase Auth가 작동하지 않으므로, 페이지 로드 즉시 외부 브라우저로 리다이렉트합니다. 정적 문자열이며 사용자 입력을 포함하지 않습니다.
