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
| `admins`, `attendanceAdmins`, `userRoles`, `teacherClasses` | `admins`는 플랫폼 전권, `attendanceAdmins`는 출석부 전용. 로그인 역할은 `userRoles/{emailKey}`, 교사 반 매핑은 `teacherClasses/{uid}` |
| `teacherStaff/{year}`, `teacherSpecial/{year}`, `teacherExtra/{year}` | 통합 앱도 읽는 스탭·교사 명단. 제거된 `staff_*` 노드와 다름 |
| `teacherAdditional/{year}`, `teacherPhones/{year}` | 출석부 관리자용 교사 정보. `teacherPhones`는 현재 앱에서 읽기만 함 |
| `suggestions/{year}`, `trash/{year}`, `config/sheetSync` | 반별 건의사항, 삭제 복구본, 시트 주소 설정. 통합 앱 사이트 요청함과 별개 |

- 교사는 `classes/{year}/{ck}`·`attendance/{year}/{ck}` 자기 반만, 관리자는 해당 연도 전체를 구독한다. `loadUserRole()`의 `teacherClasses/{uid}` 기록 완료를 기다린 뒤 인증 게이트를 열어야 한다. 로그인 과정에서 관리자 권한을 자동 부여하지 않는다.
- 위 구독 범위는 현재 앱 동작이다. Rules의 `teacherClasses/{uid}` 자기 쓰기는 값 검증이 없고 이 값이 반 접근 판정에도 쓰인다. 따라서 서버에서 본인 반만 강제한다고 설명하지 않는다. [2026-09-05 점검 보고](../docs/PROJECT_AUDIT_2026-09-05.md)의 권한 문제를 참고하고 Rules는 별도 절차 없이 수정하지 않는다.
- `database.rules.json`과 `firebase.json`은 공유 RTDB 규칙의 유일한 배포 원천이다. **이 작업의 Rules 배포 답은 항상 아니오다.** 권한 변경 필요성은 보고하고, 루트 안전 규칙과 별도 요청 없이 수정·배포하지 않는다.
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
- 2026-09-05 로컬 점검에서는 데모 모드와 계정 설정이 남아 있었다. 운영 종료 여부는 별도 확인 대상이다. `.claude/HANDOFF.md`의 과거 종료 예정일이 지났다는 이유만으로 계정·권한·환경을 자동 변경하지 않는다. 종료 요청 시 계정·권한 회수와 플래그 해제·Hosting 배포를 함께 검토한다.
- `src/lib/releaseFlags.ts`의 `SHOW_ATTENDANCE_RISK_SECTIONS=false`는 임시 노출 정책이다. 문서 정리 중 임의로 켜지 않는다.
- **관리자 로그인·연도 변경은 읽기 전용 검증이 아니다.** `AppShell`이 `cleanupOldYears()`를 호출해 선택 연도 ±5년 밖의 `classes`·`attendance`·`events` 삭제를 시도한다. `TrashModal`은 열 때 7일 지난 휴지통 항목을 삭제한다. 운영 DB 무쓰기 점검은 이 자동 쓰기 경로까지 제외한 로컬 fixture·정적 검증으로 한다.

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
