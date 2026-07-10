# semester-app — 학기 사역 허브

학기 훈련·사역팀 사이클(현장 접수 → 팀 배치 → 출석 체크 → 수료 판정 → 아카이브)을 관리하는 내부 웹 도구.
구글폼·시트 없이 **오프라인(종이) 신청을 학생 원장(`classes/{year}`) 기반으로 디지털 접수**하는 것이 핵심 설계.

## 기술 스택

retreat-app과 동일 (Next.js 16 App Router, React 19, Tailwind 4, TS strict, Firebase RTDB, Vitest). xlsx 없음 — 시트 연동 자체가 없다. dev 포트 **3002**.

## 디렉터리

```
src/
├── app/
│   ├── page.tsx                 # 홈 — 학기 목록/생성
│   └── semester/[id]/
│       ├── SemesterClient.tsx   # 탭 라우터 + 공용 구독 단일 지점 (하위 탭은 직접 구독 금지)
│       ├── IntakeTab.tsx        # 현장 접수 — classes 반 명단에서 학생 탭 → 신청 (핵심 화면)
│       ├── AssignTab.tsx        # 팀 배치 — 지망 칩 + 1지망 일괄 배치
│       ├── AttendanceTab.tsx    # 출석 체크 (모바일 우선) — [출석/지각/결석] 3버튼, 멱등·비토글
│       ├── CompletionTab.tsx    # 수료 현황 — calcCompletion 자동 판정 + 수료증 체크리스트
│       ├── CurriculumTab.tsx    # 팀별 회차 계획 (00팀 Docs 템플릿의 웹 버전)
│       ├── ArchiveTab.tsx       # 자료 링크 보존 (유실 방지)
│       └── SettingsTab.tsx      # 학기 메타·팀·회차 CRUD
├── context/                     # AuthContext(retreatAdmins 재사용), UIContext(toast/uiConfirm)
└── lib/                         # firebase, paths(경로 단일 원천), types, db(접근 단일 지점),
                                 # classKey(parseClassKey), completion(+test)
```

## DB 구조 (소유: `semesters/*`, `semestersPrivate/*` — DB_OWNERSHIP.md 참조)

```
semesters/{sid}/                 # sid = "2026-1"
  meta { title, completionRule.minRate, ... }
  teams/{teamId} { name, color(파스텔), room?, order }
  sessions/{sessId} { date, type: 정규|휴강|행사, label? }
  applications/{appKey} { studentId, bu, grade, class, name, choice1/2, trainingOnly?, status, teamId }
                                 # appKey = "{buNum}_{studentId}" (retreat-app 컨벤션)
  attendance/team/{sessId}/{appKey} { s: 출석|지각|결석, by, at }   # 노드 없음 = 미기록
  completion/{appKey} { certPrinted?, photoChecked? }              # 체크리스트만 — 수료 여부는 저장 안 함
  curriculum/{teamId}/{sessId} { plan }
  archiveLinks/{linkId} { title, url, kind }
semestersPrivate/{sid}/applicationsPrivate/{appKey} { motive, wish, phone?, parentPhone? }  # 🔒 민감
```

읽기 전용: `classes/{year}`(접수 반 명단), `admins`/`retreatAdmins`(인증). **여기에 쓰기 함수를 만들지 말 것.**

## 핵심 패턴 (retreat-app 컨벤션 계승 + 이 앱 고유)

1. **수료 판정은 계산值** — `lib/completion.ts`의 `calcCompletion`만 사용 (출석2/지각1/결석·미기록0, 휴강 회차는 만점 제외). DB에 수료 여부를 저장하지 않는다(이중 원장 방지). 규칙 변경 시 테스트(`completion.test.ts`) 갱신 필수.
2. **출석은 멱등 명시 상태** — 토글 금지(모노레포 실수 규칙 11). 같은 상태 재탭 = 동일 결과. 취소는 별도 지우기 버튼.
3. **전체 덮어쓰기 노드 없음** — 모든 쓰기는 단일 문서 경로 `update()`/`remove()`. 순서는 `order` 필드. 새 기능도 이 원칙 유지(백업 패턴 불필요 상태를 지킬 것).
4. **구독은 SemesterClient에만** — 탭 컴포넌트는 props로 받는다. 예외: 회차별 출석(AttendanceTab)·완료 체크(CompletionTab)·커리큘럼(CurriculumTab)·아카이브(ArchiveTab)처럼 탭 로컬 데이터는 해당 탭에서 구독하되 반드시 `onError`→loadError 배선.
5. **민감정보 분리** — 지원 동기·연락처는 `semestersPrivate` 아래만. 신규 민감 필드도 동일.
6. 접수 화면의 학기↔연도 규칙: `sid.split("-")[0]` → `classes/{year}`.

## ⚠ Rules 배포 필요 (미완 — 사용자 승인 대기)

`semesters`/`semestersPrivate` 노드가 학생 앱 `database.rules.json`에 없으면 **모든 화면이 permission denied**가 된다.
변경안(승인 후 학생 앱에서만 배포 — 이 앱에서 firebase deploy 금지):

```json
"semesters": {
  ".read":  "auth != null && (root.child('admins').child(auth.uid).val() === true || root.child('retreatAdmins').child(auth.uid).exists())",
  ".write": "auth != null && (root.child('admins').child(auth.uid).val() === true || root.child('retreatAdmins').child(auth.uid).exists())"
},
"semestersPrivate": { /* 동일 규칙 */ }
```

## 개발·배포

```bash
npm run dev        # localhost:3002
npx tsc --noEmit   # 배포 전 0 errors 필수
npm test           # completion 테스트
npm run build
```

Vercel 프로젝트 미생성 상태 — 생성 시 Root Directory를 `semester-app`으로, 환경변수는 retreat-app과 동일한 `NEXT_PUBLIC_FIREBASE_*` 세트.
