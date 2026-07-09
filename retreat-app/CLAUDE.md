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
    rooms/                # 방배정
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

### 3c. 인쇄/JPG 출력 — escapeHtml 필수
`printAsPDF`/`exportAsJPG`/`rowsToHtmlTable`은 조립된 HTML 문자열을 그대로 `document.write`한다. 학생이 신청폼에 입력한 이름·특이사항 등이 이스케이프 없이 삽입되면, `<img src=x onerror=...>` 같은 값이 관리자가 인쇄하는 순간 관리자 컨텍스트에서 실행되는 저장형 XSS가 된다(2026-07-06 수정). **HTML 문자열에 사용자 입력을 삽입하는 모든 지점은 `exportUtils.ts`의 `escapeHtml()`로 감쌀 것.** 새 인쇄/내보내기 기능을 추가할 때 반드시 적용.

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
- **고려 관계 저장 형태**: 학생·교사는 이름 문자열 쌍, 반은 `unitKey`(`${bu}_${grade}_${classNum}`) 쌍. 이름 기반이라 동명이인은 구분 못 한다(입력 UI는 이름 타이핑→후보(부·학년·반) 선택으로 확인만 돕고, 저장은 이름). 고려 관계는 DB에 저장되지 않고 패널 state로만 존재(실행 시점 1회성).

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
