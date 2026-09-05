<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# 학생 출석부 에이전트 가이드

이 문서는 `attendance-app/`에 적용된다. 작업 전 `../CLAUDE.md`의 안전 규칙과 `../.claude/HANDOFF.md`, 앱 `CLAUDE.md`를 읽는다. 공유 데이터 변경은 `../DB_OWNERSHIP.md`, 배포·복구는 `../OPERATIONS.md`도 확인한다. 안전 규칙은 루트 매뉴얼이 우선하며, 구조·동작 설명이 오래됐으면 실제 코드·설정과 대조해 보고한다.

## 현재 구조와 시작점

- **Next.js App Router + React + TypeScript PWA**다. `next.config.ts`의 `output: 'export'`로 `out/`를 만들고 Firebase Hosting에 배포한다. 운영 주소는 `https://woori-high.web.app`이다.
- `src/app/layout.tsx` → `AppProvider` → `AppShell`이 공통 레이아웃이다. `/`는 `/attendance`로 이동하고, `/attendance`·`/manage`·`/stats`·`/overall`·`/admin`은 탭 컴포넌트의 래퍼다. 서버 API 라우트는 현재 없다.
- 인증은 **Firebase 이메일·비밀번호 로그인**이다. 통합 앱의 Google OAuth 설명을 이 앱에 적용하지 않는다. `AppShell`이 인증 게이트를 운영하고 `useAuth.ts`는 로그인·로그아웃 함수를 제공한다.
- 활성 서비스는 이 앱과 `../highschool-app/`이다. 수련회·이가드·학기 기능은 통합 앱의 모듈이며, 제거된 독립 앱을 새 의존 대상으로 만들지 않는다.

| 영역 | 먼저 볼 파일 | 유지할 계약 |
|---|---|---|
| 공유 상태·반 선택 | `src/store/AppContext.tsx`, `src/components/ClassTabBar.tsx` | reducer action과 기존 selector 사용 |
| 인증·데이터 구독 | `src/components/AppShell.tsx`, `src/hooks/useFirebaseData.ts` | 인증 후 구독, 교사 본인 반 범위, 에러 콜백·구독 해제 |
| 출석·통계 | `src/components/tabs/AttendanceTab.tsx`, `src/utils/attendanceWorkflow.ts`, `src/utils/dates.ts` | KST 주일·행사 제외·최근 4회·장결 분리 |
| 학생 명단 | `src/components/modals/`, `src/components/tabs/ManageTab.tsx` | 학생 단일 경로 쓰기·personId·행정 이력 |
| 시트 동기화 | `src/lib/sheetSync.ts`, `src/components/tabs/SheetSyncSection.tsx` | 미리보기와 payload 분리, 출석·SID 보존 |
| 계정·교사·전체 현황 | `src/components/tabs/AdminTab.tsx`, `src/components/tabs/overall/` | 출석부 권한과 플랫폼 권한 구분 |
| 공용 처리 | `src/utils/personId.ts`, `adminChange.ts`, `export.ts`, `image.ts`, `chartSetup.ts`, `dbError.ts` | 기존 순수 함수 재사용·민감값 최소화 |
| 스타일·PWA | `src/app/globals.css`, `public/sw.js`, `public/manifest.json` | CSS 변수·모바일 화면·캐시 제외 목록 |

`src/lib/db.ts`가 DB SDK와 초기화 객체를 노출하는 진입점이다. 컴포넌트·훅은 `@/lib/db`를 사용하고 `firebase/database`를 직접 import하지 않는다. 인증용 `auth`는 `src/lib/firebase/client.ts`에서 가져온다. 현재 경로는 대부분 기존 호출부에 있으며, 이 앱에 존재하지 않는 `paths.ts`나 통합 앱의 `snapToList`를 이미 사용하는 것으로 가정하지 않는다.

## DB 소유권과 권한

작업 시작 시 루트 매뉴얼의 DB 안전 4문답에 답한다. 운영 DB 직접 쓰기는 명시 승인과 사전 스냅샷이 필요하다. 문서 점검이나 코드 검증을 운영 쓰기·배포 승인으로 간주하지 않는다.

| 이 앱이 관리하는 경로 | 용도·교차 앱 영향 |
|---|---|
| `classes/{year}`, `attendance/{year}`, `events/{year}` | 학생·반·출석·행사 원장. 통합 앱의 주일 사역·학기 접수·수련회/현장 조회가 소비하므로 키와 형태 변경은 교차 앱 검토 대상 |
| `admins`, `attendanceAdmins`, `userRoles`, `teacherClasses` | `admins`는 플랫폼 전권, `attendanceAdmins`는 출석부 전용. 로그인과 교사 반 권한은 이메일이 일치하는 `userRoles/{emailKey}`가 원천이며 `teacherClasses/{uid}`는 관리자만 쓰는 레거시 매핑 |
| `teacherStaff/{year}`, `teacherSpecial/{year}`, `teacherExtra/{year}` | 통합 앱도 읽는 스탭·교사 명단. 제거된 `staff_*` 노드와 다름 |
| `teacherAdditional/{year}`, `teacherPhones/{year}` | 출석부 관리자용 교사 정보. `teacherPhones`는 현재 앱에서 읽기만 함 |
| `suggestions/{year}`, `trash/{year}`, `config/sheetSync`, `config/studentMoveLocks/{year}/{classKey}/{ownerUid}/{operationId}`, `config/studentMoveCommits/{year}/{fromCk}/{toCk}/{sid}/{ownerUid}/{operationId}` | 반별 건의사항, 삭제 복구본, 시트 주소 설정, 학생 이동 중 양쪽 반 쓰기를 막는 작업별 잠금과 지연 요청 재실행을 막는 불변 commit marker. 통합 앱 사이트 요청함과 별개 |

- 교사는 `classes/{year}/{ck}`·`attendance/{year}/{ck}` 자기 반만, 관리자는 해당 연도 전체를 구독한다. `loadUserRole()`은 이메일 키의 `userRoles`를 읽고 화면 선택만 맞추며 로그인 중 DB를 쓰지 않는다. Rules도 같은 레코드의 이메일·`role=teacher`·부·학년·반을 직접 검사한다.
- `teacherClasses/{uid}` 자기 쓰기와 권한 판정은 2026-09-05 제거했다. 이 레거시 노드는 관리자만 읽고 쓸 수 있으며 교사 권한을 다시 연결하지 않는다. 교사의 명단 변경 UI는 열려 있지 않고, 출석 쓰기는 본인 반의 실제 명단에 존재하는 학생 한 명과 잠금이 없는 반에만 허용한다.
- `database.rules.json`과 `firebase.json`은 공유 RTDB 규칙의 유일한 배포 원천이다. 일반 작업에서는 변경 필요성을 보고하고 루트 안전 규칙의 명시 예외 확인 없이 수정·배포하지 않는다. 2026-09-05 감사 후속 작업은 사용자가 그 예외를 확인했다.
- `userRoles/{emailKey}`의 이메일 기반 자기조회, `retreatAdmins`·`iguardMembers`·`iguardRoles`의 `$uid` 자기조회를 제거하지 않는다. 제거하면 로그인·역할 판정이 막힌다.
- 교사 개인정보 노드를 `auth != null` 전체 읽기로 넓히지 않는다. `events`의 인증 사용자 읽기는 개인정보가 없는 행사 용도로 유지한다. `iguardRoles` 저장값은 `staff`/`team`뿐이다.
- 통합 앱의 새친구 단건 등록 및 검증된 되돌리기는 공유 쓰기 예외다. `nf_` ID·동일 학생 확인·비공개 사전 백업·원자 update를 유지한다. 되돌리기는 해당 학생의 `classes`·`attendance`와 `trash` 복구본까지 한정한다. 허용 역할은 통합 앱 `accessPolicy.ts`와 실제 Rules를 함께 확인하고, 이 예외를 범용 명단 쓰기로 확대하지 않는다.

## 학생·출석·동기화 계약

- 반 키는 `{part}-{grade}-{class}`, 출석 셀 키는 `evKey(mi, di)`의 `{월 인덱스}-{주일 인덱스}`다. 출석 값은 `O`/`X`/`T`이며 미입력 쓰기는 해당 셀을 `null`로 지운다. 한 번의 출석 입력은 `attendance/{year}/{ck}/{sid}/{weekKey}` 한 칸만 갱신한다.
- 교사는 행사·휴일을 제외한 최근 정상 주일 4회만 수정한다. 저장 중·성공·실패·재시도 안내를 보존한다. 관리자의 전체 기간 편집 범위와 구분한다.
- `jang === true` 학생은 원본을 유지하고 일반 출석·통계·내보내기에서 분리한다. SID의 `J`만 보고 장결자로 판단하지 않는다. 화면 정렬·번호는 `sortAndRenumber()`로 처리한다.
- 학생 수정·이동·삭제는 해당 학생 경로와 관련 경로를 루트 `update()`로 묶는다. `RosterModal`의 확인 후 명단 교체, 시트 동기화, 진급에는 현재 전체 `students` 교체 경로가 있으므로 일반 수정의 본보기로 복사하지 않는다. 전체 덮어쓰기를 추가·수정할 때는 백업·복구 범위를 먼저 검토한다.
- `personId`는 영구 연결용 선택 필드다. 기존 sid·pid·출석 참조키를 대체하지 않는다. 생성 시 `person_student_*`·`person_teacher_*`·`person_staff_*`를 구분하고, 편집·이동·진급·동기화에서는 보존한다. 학생 과거 ID 재사용은 이름·생년월일·부서·정상 진급선·연도별 유일 후보 조건을 `personId.ts`에 위임한다. 같은 연도 다른 ID와 보호자 연락처만으로 합치지 않는다.
- 관리자 학생 변경은 원본과 `classes/{year}/{ck}/adminChanges/{changeId}`를 같은 update에 기록한다. `adminChange.ts`의 `VALUE_FIELDS`에 있는 **이름·학교만** 실제 값을 남긴다. 연락처·주소·생년월일·사진은 값 없이 필드 이름과 입력/변경/삭제만 기록한다. 일반 교사 출석 입력은 이 행정 이력 대상이 아니다.
- 시트 동기화는 1부·2부를 함께 미리보기하고 `buildSyncPlan` → `buildSyncPayload`로 적용한다. 같은 반 기존 SID·사진·personId를 유지하고, 평시 명단으로 복귀한 학생은 새 payload에서 `jang`을 생략해 해제한다.
- 주일 당일 동기화는 오늘 열을 건드리지 않는다. `lastElapsedSundayUTC`와 토·일·월 회귀 테스트를 유지한다. 시트 반 이동은 기존 출석 스냅샷에서 **시트 값이 없는 칸만** 이관한 후 옛 출석 경로를 삭제한다. 스냅샷이 없으면 이관·삭제하지 않는다.
- 시트 행정 이력은 `describeSheetSyncForClass()`가 변동 없는 반에 `null`을 반환하면 남기지 않는다. `removeMissing`으로 제외되는 학생의 출석은 이관 목적지가 없어 의도적으로 보존한다. 자동 정리되지 않는 `trash/{year}/attendance`를 새로 만들지 않는다.
- 사진은 `compressImage()`로 압축하고, 인쇄 HTML에 사용자 값을 넣을 때는 `escapeHTML()`을 거친다. 내보내기·차트는 기존 `export.ts`·`chartSetup.ts`의 동적 로딩을 재사용한다.

## 데모·운영 화면 점검 주의

- 데모는 `src/lib/demo.ts`와 빌드 시 `NEXT_PUBLIC_DEMO_*` 값으로 켜진다. 공용 Firebase 계정으로 실제 로그인하며 **운영 DB와 분리된 샘플 모드가 아니다**. `attendanceAdmins` 권한을 가진 계정의 화면만 교사처럼 제한한다.
- 반 선택은 보안 경계가 아니다. `AppShell`의 데모 `/admin`·`/overall` 차단, `demoSelection`/`demoLastSelection` 구분, 관리자 로그인 의도 플래그를 유지한다. 데모 값을 보고서·로그에 출력하거나 자격정보를 커밋하지 않는다.
- 2026-09-05 사용자가 데모 모드 유지를 요청해 `NEXT_PUBLIC_DEMO_MODE=1`과 기존 데모 자격정보를 복구하고 Hosting을 다시 배포했다. 운영 브라우저에서 공용 계정 자동 로그인 뒤 부서·학년·반 선택 화면이 나타나는 것을 확인했다. Firebase Auth 데모 계정과 `attendanceAdmins/{demoUid}` 레코드도 의도적으로 유지한다. 이후 종료 요청 시 플래그·공개 자격정보·Auth 계정·권한 레코드를 함께 회수하되, 운영 DB 레코드 삭제는 명시 승인과 사전 스냅샷 뒤에만 수행한다.
- `src/lib/releaseFlags.ts`의 `SHOW_ATTENDANCE_RISK_SECTIONS=false`는 임시 노출 정책이다. 문서 정리 중 임의로 켜지 않는다.
- 관리자 로그인·연도 변경만으로 오래된 `classes`·`attendance`·`events`를 정리하지 않는다. `TrashModal`도 모든 복구본을 조회만 하며, 영구 삭제는 사용자가 항목별 `삭제` → `확인`을 누른 경우에만 실행한다. 이 계약을 화면 진입 effect의 자동 쓰기로 되돌리지 않는다.

## 핵심 코드 패턴

### 학생 반 이동과 화면 진입 정리를 데이터 유실 없이 다루기 (2026-09-05)
- **접근법**: `sheetSync.ts`의 출석 이관 계약을 먼저 확인한다 → 부·학년 선택 변경 때 반 선택을 초기화한다 → 원본·목적지 반의 `config/studentMoveLocks/{year}/{classKey}/{ownerUid}/{operationId}` leaf 두 개를 연도 트랜잭션으로 함께 선점한다. 두 leaf 제거는 한 `onDisconnect(yearRef).update()`로 선점 전 등록하고 선점 직후 다시 등록한다 → 서버 시간 오프셋을 확인한 뒤 원본 학생·목적지 반·양쪽 출석을 다시 읽는다 → 목적지 출석 셀을 우선해 병합하고 목적지 반이 없거나 같은 SID 학생이 있으면 중단한다 → 잠금 두 개를 `pending`으로 정확히 전환하면서 `startedAt`을 서버 보정 시각으로 갱신한다 → 종료 예약 취소 완료와 pending 소유권 재확인 뒤, 학생·출석·감사기록·두 잠금 해제·불변 `studentMoveCommits` marker를 단발 루트 REST PATCH에 묶는다 → 성공 후 부·학년·반 선택을 모두 목적지에 맞춘다 → 로그인·연도 변경 및 `TrashModal` 로드 effect에서 삭제 쓰기를 제거한다.
- **단절·복구 계약**: PATCH는 30초 뒤 중단하며 자동 재시도하지 않는다. 2xx만 즉시 성공, 4xx만 명시적 거절로 보고 exact lock을 정리한다. 예외·중단·5xx는 결과 불명확 상태이므로 pending 두 잠금을 유지한다. 다음 이동에서 서버 보정 시각 기준 10분 이상 지난 pending만 살핀다. commit marker 없음·원본 있음·목적지 SID 없음이 모두 맞으면 exact lock을 조건부 정리하고 한 번만 재선점한다. marker 있음·원본 없음·목적지 있음이면 완료로 판정해 잠금만 정리하고 화면을 목적지로 바꾼다. 나머지 혼합 상태와 `preparing`은 자동 정리하지 않는다. Firebase 연결 또는 서버 시간 오프셋을 확인할 수 없을 때도 자동 복구와 pending 전환을 하지 않는다.
- **지연 요청 차단**: commit marker는 `config/studentMoveCommits/{year}/{fromCk}/{toCk}/{sid}/{ownerUid}/{operationId}: true`에 한 번만 생성하고 자동 삭제하지 않는다. Rules가 marker 생성 시 기존 양쪽 pending lock의 owner·operation·metadata 일치를 요구해야, 오래된 잠금을 복구한 뒤 늦게 도착한 이전 PATCH 전체가 거절된다.
- **판단 질문**: 목적지 SID를 새로 만들면 기존 출석·새친구 연결이 끊길 수 있어 사용하지 않았다. 출석 충돌을 원본 값으로 덮으면 목적지 기록이 사라지므로 목적지 값을 우선했고, 휴지통 일괄 자동 정리는 기존 항목별 삭제 확인 UI가 있어 유지할 이유가 없었다.
- **재사용 규칙**: 참조 키를 유지하는 반 이동은 양쪽 최신 스냅샷과 목적지 충돌을 확인한 뒤 한 원자 payload로 처리하고, 화면 진입 effect에서는 운영 데이터 삭제를 실행하지 않는다.
- **검증 한계**: 잠금 선점·phase 전환·exact 복구·commit marker·단발 PATCH·응답 분류는 순수 회귀 테스트로 검증한다. 실제 브라우저와 RTDB 연결을 강제로 끊는 통합 시험은 운영 DB 무쓰기 범위에서 실행하지 않았다. 잠긴 동안에는 원본·목적지 반의 전체 명단·출석 쓰기가 잠시 차단된다. 같은 UID의 다른 탭은 Rules에서 이동 owner로 보이므로, 그 탭의 일반 명단·출석 쓰기까지 막지는 못한다. 잠금 전에 이미 SDK 오프라인 큐에 들어간 관리자 쓰기는 잠금 해제 후 재생될 수 있다. 교사의 늦은 출석 쓰기는 Rules에서 원본 학생 존재를 함께 요구해 거절하되 관리자 큐까지 완전히 fencing하려면 모든 관리자 쓰기에 별도 버전 계약이 필요하다. 연결 종료 예약이 한 번 실행된 직후 SDK 트랜잭션이 재연결에서 선점되고 코드가 예약을 다시 등록하기 전 다시 끊기는 매우 짧은 구간에는 `preparing` 잠금이 남을 수 있으며, 이를 시각만으로 자동 제거하지 않는다. 연도 잠금 트랜잭션 권한을 가진 신뢰 관리자의 직접 잠금 변조도 클라이언트 프로토콜만으로 차단할 수 없다.

### 데모 모드를 자격정보 없이 종료하고 정적 배포를 검증하는 법 (2026-09-05)
- **접근법**: 1→ `.env.local`에서 `NEXT_PUBLIC_DEMO_MODE`뿐 아니라 공개 빌드용 데모 이메일·비밀번호도 비운다. 2→ 배포용 Git worktree에는 git에서 제외된 `.env.local`이 없으므로 원본 파일을 복제하거나 출력하지 말고 존재와 대상 소스 일치부터 확인한 뒤 소유자 전용 파일 또는 심볼릭 링크로 빌드에만 연결한다. 3→ `NEXT_PUBLIC_*` 값을 바꾼 뒤에는 생성물 `.next/`와 `out/`을 제거하고 완전 재빌드해 이전 상수가 캐시에 남지 않게 한다. 4→ 알려진 데모 이메일이 새 `out/`에 없는지 확인하고 Hosting을 배포한다. 5→ 라이브 `sw.js`의 캐시 이름·SHA를 로컬 산출물과 대조하고, 캐시를 우회한 운영 첫 화면이 반 선택 데모가 아니라 일반 로그인인지 실제 브라우저로 확인한다.
- **판단 질문**: 플래그만 0으로 두고 데모 자격정보를 남기지 않았다. `NEXT_PUBLIC_*`는 클라이언트 번들 상수이므로 비활성 분기라도 값이 산출물에 포함될 수 있고, 기존 빌드 캐시가 공개 환경 변경을 재사용하면 소스 설정과 배포 번들이 다를 수 있다. 프런트 비활성화를 Auth 계정·`attendanceAdmins` 권한 회수로 간주하지도 않았다. 후자는 운영 데이터 변경이므로 별도 승인과 스냅샷이 필요하다.
- **재사용 규칙**: 공개 빌드 환경으로 임시 계정을 종료할 때는 `플래그 해제 + 공개 자격정보 제거 + 생성물 완전 재빌드 + 번들 문자열 검사 + 라이브 SW 대조 + 실제 첫 화면 확인`을 한 세트로 수행하고, 계정·권한 회수는 별도 운영 변경으로 끝까지 추적한다.

## 검증과 배포

명령은 `attendance-app/`에서 실행한다. 현재 설치 버전과 지원 범위는 `package.json`·lockfile·로컬 Next 문서로 확인한다.

```bash
npm test
npx tsc --noEmit
npm run lint
npm run build
```

- 테스트는 `__tests__/`의 Vitest 순수 로직·파일 계약 테스트다. `rulesContract.test.ts`는 규칙 문자열 계약 검사이며 Firebase Emulator의 실제 허용/거부 테스트가 아니다. 테스트 통과를 로그인 화면·운영 권한 검증으로 보고하지 않는다.
- 관련 변경은 `sheetSync`·`personId`·`adminChange`·`attendanceWorkflow`·`cacheVersion` 회귀 테스트로 확인한다. UI 변경은 모바일과 PC 화면도 확인하되 위 운영 자동 쓰기 함정을 먼저 검토한다.
- 2026-09-05 점검: **10파일 130개 테스트 통과**, 타입 검사·정적 빌드 성공, lint **0 errors / 30 warnings**. 이 숫자는 당시 측정값이며 후속 작업은 새 실행 결과를 보고한다.
- 배포 요청이 있을 때만 `firebase deploy --only hosting`을 사용한다. predeploy는 **빌드 → `out/sw.js` 캐시명에 밀리초 버전 반영** 순서다. 추적 파일 `public/sw.js`를 배포마다 수정하지 않는다.
- `firebase.json`의 `cleanUrls`, HTML·라우트 `.txt`·`sw.js` no-cache 헤더, `AppShell`의 `updateViaCache: 'none'`·`registration.update()`를 유지한다. 서비스워커의 Firebase·Google API·`/_next/`·`/__nextjs`·RSC 제외 목록도 보존한다.
- Vercel은 배포 대상이 아니다. `vercel.json`의 `ignoreCommand: "exit 0"`는 연결된 Vercel 프로젝트의 불필요한 빌드를 건너뛰는 보호다. `npm start`의 `next start`도 정적 export 운영 서버로 사용하지 않는다.
- 앱 `CLAUDE.md`·기본 `README.md`에 남은 독립 앱 수, `api/ai/route.ts`, 날짜 단위 `public/sw.js` 갱신, Vercel 배포 설명은 현재 파일과 다르다. 해당 설명을 근거로 제거된 구조를 복원하지 않는다.
- `.env*`·`node_modules/`·`.next/`·`out/`·`*.tsbuildinfo`는 소스 변경에 포함하지 않는다. `tmp/rules-backup/`의 기존 규칙 백업은 보존한다. 비직관적 문제 해결 후에는 루트 `extract-approach` 학습 규칙을 따른다.
