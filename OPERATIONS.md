# 운영 절차서

> 운영 DB: **Supabase `iqfgekpubbgjcsvsyyno`(2026-11-12부터)** · 스테이징 `mpddehdatmnhomsxugcl` · 학생 앱 호스팅은 그대로 Firebase `woori-high`
> 작성일: 2026-06-23 · 현재 구조 대조: 2026-09-05 · Supabase 이관 반영: 2026-11-12

---

## 0. Supabase 플랫폼 이관 뒤 운영 (2026-11-12)

다음 수련회에 바로 쓰기 위해 "Firebase 처럼, 플랫폼만 Supabase로" 옮겼다(사용자 지시 2026-11-12). 화면·업무 코드와 자료 경로·모양·권한 규칙은 그대로다.

| 무엇 | 지금 | 비고 |
|---|---|---|
| 자료 | Supabase 운영 `rtdb.nodes`(잎 하나가 한 줄, 경로는 Firebase 키 그대로) | 전환 때 잎 204,837개를 옮기고 최상위 27개 노드의 잎 개수·해시가 Firebase와 같음을 확인 |
| 읽기·쓰기 | `api.rtdb_get`·`rtdb_update`·`rtdb_cas` 등(로그인한 사람, 규칙 검사) / `api.rtdb_admin_*`(service role 전용, 규칙 없음) | 계약: `docs/SUPABASE_PLATFORM_CONTRACT.md` |
| 실시간 | 쓰기마다 `rtdb.changes`에 바뀐 경로 한 줄 → Supabase Realtime → 겹치는 구독만 다시 읽음 | 고등부 역할이 있는 계정만 알림을 읽는다(`rtdb.is_member()`) |
| 로그인 | Supabase Auth(이메일+비밀번호, 이메일 6자리 코드) | `rtdb.uid_map`이 옛 Firebase UID를 이어 줘 `admins/{uid}` 등 기존 권한 그대로 |
| 파일 | 새 파일은 Supabase Storage 버킷 `highschool`(경로 그대로) | 정책: `docs/SUPABASE_STORAGE_POLICY.sql`. 이관 전 첨부·숙소 지도·학기 자료는 Firebase Storage에 그대로 있고, 자료에 저장된 옛 다운로드 주소로 계속 보인다(`storageUrl.ts`가 허용). 그 파일을 지우면 자료 줄만 지워지고 Firebase 파일은 남는다. Firebase 프로젝트를 닫으려면 그 전에 파일을 `storageObjectKey()` 키로 옮겨야 한다 |
| 권한 규칙 | 원천 `attendance-app/database.rules.json` → wooriteens-web `scripts/rtdb/compile-rules.cjs` → SQL(마이그레이션 0070) | 규칙을 바꾸면 **새 마이그레이션**으로 스테이징→운영 적용. `firebase deploy --only database`는 운영 앱에 아무 영향이 없다(Firebase 사본만 바뀜) |
| Firebase `woori-high` DB | 전환 시점 사본 | 앱이 쓰지 않는다. 지우지 말 것(되돌림 대비) |

환경 변수:
- `highschool-app`(Vercel): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`(공개 키). 찬양팀·관리자 비밀번호 재설정 같은 서버 기능은 `SUPABASE_SERVICE_ROLE_KEY`가 필요하다 — **사용자가 직접 넣는다**(에이전트가 비밀 키를 입력하지 않는다).
- 학생 앱: `attendance-app/.env.production.local`의 같은 두 공개 값(정적 빌드에 들어감).

백업·복구(이관 뒤):
- 전체 백업: Supabase 대시보드 SQL에서 `select path, value from rtdb.nodes order by path`를 내려받거나, service role로 `api.rtdb_admin_get('')`. 개인정보가 평문으로 남으므로 작업 직후 지운다.
- 노드 복구: `api.rtdb_admin_update('{"경로": 값}'::jsonb)`(값 `null`은 지우기). 운영 DB 쓰기이므로 사용자 승인 + 사전 백업 규칙 그대로.
- 아래 1~4장의 Firebase 콘솔·`firebase deploy --only database` 절차는 **이관 전 기록**이다. 학생 앱 Hosting 배포(`firebase deploy --only hosting`)만 그대로 쓴다.

---

## 1. 배포 방법

### 승인과 병합 흐름 — 2026-09-05 사용자 결정

운영 앱의 구현·수정 요청은 검증 → 커밋·작업 브랜치 푸시 → PR 생성·검토 → 에이전트 병합 → 대상 앱 운영 배포·버전 확인까지 포함한다. 사용자가 PR을 직접 병합해야 한다는 과거 결정은 대체됐으며 같은 범위의 병합·배포 승인을 다시 묻지 않는다. 사용자가 배포를 보류하거나 PR까지만 요청하면 그 제한을 따른다. 조사·리뷰·문서 점검·로컬 실험만 요청받은 경우는 운영 배포 대상이 아니다.

운영 DB 직접 쓰기·Rules·계정/권한 변경 승인은 별도다. 기존 인증 정보 미등록으로 E2E가 실행되지 못한 것과 코드 검증·배포 성공을 구분해 보고하고 인증 가드를 우회하지 않는다. `AGENTS.md`는 에이전트 작업 절차이며 호스팅 서버의 자동 배포 설정 자체가 아니다. 통합 앱은 main 자동 배포, 학생 앱은 에이전트가 Hosting CLI 배포를 실행하고 확인한다.

### 학생 앱 (Firebase Hosting)

> ⚠ **학생 앱은 Vercel로 배포하지 않는다.** `output: 'export'` 정적 빌드 + Firebase
> Hosting 전용이다. 그런데 Vercel 프로젝트(`attendance-app`)가 이 저장소에 연결돼 있어
> PR·푸시마다 빌드를 시도하고 매번 실패했다(2026-09-03 확인 — 이 실패는 어떤 변경과도
> 무관하다). `attendance-app/vercel.json`의 `"ignoreCommand": "exit 0"`이 그 빌드를
> 건너뛰게 한다(Vercel 규약: exit 0 = 건너뜀, exit 1 = 빌드).
>
> **더 깨끗한 영구 조치는 Vercel 대시보드에서 `attendance-app` 프로젝트의 Git 연결을
> 끊는 것이다.** 그렇게 하면 이 파일은 지워도 된다. 반대로 학생 앱을 정말 Vercel로
> 배포하게 되는 날에도 이 파일을 먼저 지워야 한다.

```bash
cd attendance-app
npm run build
firebase deploy --only hosting
```
- `firebase.json`의 predeploy가 정적 build 뒤 `out/sw.js`에 밀리초 단위 고유 캐시 이름을 기록함
- 배포 URL: https://woori-high.web.app

### 통합 고등부 플랫폼 (Vercel)

**2026-08-29부터 `main` 푸시가 자동 배포한다.** Vercel 프로젝트를 `k10k10k10-git/woori-high-apps`에 연결하고 Root Directory를 `highschool-app`으로 지정했다. 평상시 배포는 푸시 하나로 끝난다.

```bash
git push origin main            # 자동 배포 트리거
npx vercel ls                   # 새 배포가 Ready 되는지 확인 (저장소 루트에서)
```

수동 배포가 필요하면 **저장소 루트에서** 실행한다. `.vercel/` 링크는 루트에 있고 Root Directory가 `highschool-app`이므로, 앱 폴더 안에서 실행하면 경로가 어긋나 빌드가 깨진다.

```bash
cd /Users/sunghoon/Desktop/ai개발
npx vercel --prod
```

- 배포 URL: https://woorihigh-app.vercel.app (구 주소 `highschool-app-flame.vercel.app`도 같은 배포를 가리키게 남겨 둠 — 기존 링크·북마크 보호)
- 주소 변경/이관: `npx vercel alias set <배포 URL> woorihigh-app.vercel.app`
- **Ignored Build Step**: `git diff --quiet HEAD^ HEAD -- .` — `highschool-app/` 밖만 바뀐 푸시(예: `attendance-app` 수정, 문서만 수정)는 빌드를 건너뛴다. 이때 `vercel ls`에 새 배포가 안 잡히는 것은 정상이며 실패가 아니다.
- CLI가 `Not authorized`이면 `npx vercel login`의 device URL을 **이미 로그인된 Vercel 브라우저**에서 승인한 뒤 같은 배포 명령을 다시 실행한다. 새 토큰 생성이나 프로젝트 재연결은 필요 없다.
- 배포 후 `curl -s https://woorihigh-app.vercel.app/api/version`의 `buildId`와 `git rev-parse HEAD`를 대조하고 `npx vercel ls`에서 Ready를 확인한다.
- 독립 `retreat-app`·`iguard-app` Vercel 프로젝트와 Firebase Hosting 사이트는 2026-08-05 제거했다.

### 교사·스탭 앱 (제거됨 — 2026-08-12)
- 사용 중단으로 코드를 제거했다. 배포된 적이 없어 끊을 주소도 없다.
- 복구가 필요하면 태그 `pre-staff-app-removal-2026-08-12`를 사용한다.
- `staff_members`·`staff_attendance`·`staff_events`·`staff_roles`·`staff_admins`는 당시 운영 데이터가 모두 `null`임을 확인했고 Rules에서도 제거했다. 현재 학생 앱의 `teacherStaff`는 별도 운영 노드이므로 삭제하지 않는다.

### Firebase Rules 배포

Rules 변경·배포는 일반 앱 배포에 포함하지 않는다. 필요성을 먼저 보고하고 사용자가 명시적으로 승인한 작업에서만, 현재 배포 Rules를 `tmp/rules-backup/`에 백업하고 계약 테스트를 통과한 뒤 아래 명령을 실행한다.

```bash
cd attendance-app
firebase deploy --only database
```
- **반드시 학생 앱 폴더에서만 실행** (단일 원천)
- `highschool-app`에서는 Rules를 배포하지 않는다.

---

## 2. 배포 전 체크리스트

```
□ 1. 타입 체크 통과: npx tsc --noEmit
□ 2. 테스트 통과: npm test (또는 npx vitest run)
□ 3. 빌드 성공: npm run build
□ 4. 변경한 DB 경로가 있으면 DB_OWNERSHIP.md 확인
□ 5. Rules를 수정했으면 Firebase 콘솔 현재 규칙과 비교
□ 6. 배포 후 핵심 화면 로그인 확인
```

---

## 3. 백업 절차

### 자동 백업 (이미 구현됨)
- **참가자 백업**: 통합 플랫폼의 수련회 행정에서 구글시트 동기화/재매칭 시 자동 실행
  - 경로: `retreats/{id}/participantsBackups/{timestamp}`
  - 최근 5개만 유지, 오래된 것은 자동 삭제
  - 복구: `highschool-app`의 `restoreParticipantsBackup()` 함수 사용

### 수동 DB 백업
Firebase 콘솔에서 전체 데이터를 내보내거나 CLI로 주요 노드를 백업할 수 있습니다.

**방법 1: Firebase 콘솔**
1. https://console.firebase.google.com/project/woori-high/database 접속
2. 우측 상단 ⋮ 메뉴 → "JSON 내보내기"
3. 다운로드된 파일을 날짜별로 보관

**방법 2: Firebase CLI**

`firebase login`으로 승인된 관리자 계정에 로그인한 뒤 실행합니다. CLI가 인증과 HTTP 실패 판정을 처리하므로, 설정 파일의 refresh token을 REST `auth=`에 넣지 않습니다. 백업 파일에는 개인정보가 들어 있으므로 저장 위치의 권한을 제한하고 사용 후 삭제합니다.

```bash
set -euo pipefail
umask 077
BACKUP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/woori-high-db.XXXXXX")"
trap 'rm -f "$BACKUP_DIR"/*.tmp' EXIT

for NODE in classes retreats retreatsPrivate; do
  TEMP_FILE="$BACKUP_DIR/$NODE.json.tmp"
  firebase --project woori-high database:get "/$NODE" --instance woori-high-default-rtdb > "$TEMP_FILE"
  python3 - "$TEMP_FILE" <<'PY'
import json, sys
with open(sys.argv[1], encoding="utf-8") as source:
    data = json.load(source)
if not isinstance(data, dict) or not data or set(data) == {"error"}:
    raise SystemExit("백업 검증 실패: 데이터가 없거나 정상 JSON 객체가 아닙니다.")
PY
  mv "$TEMP_FILE" "$BACKUP_DIR/$NODE.json"
done
printf '검증된 백업 위치: %s\n' "$BACKUP_DIR"
```

명령이 실패하면 중단되며, `*.json.tmp`는 삭제됩니다. 성공한 파일만 안전한 보관 위치로 옮기고, 복구 확인 후 임시 사본은 삭제합니다.

### 수동 Rules 백업
```bash
cd attendance-app
cp database.rules.json "database.rules.backup.$(date +%Y%m%d).json"
```

---

## 4. 복구 절차

### 참가자 데이터 복구 (통합 플랫폼 내장)
1. 통합 플랫폼 → 수련회 행정 → 참가자 명단 탭
2. 백업 목록에서 복구할 시점 선택
3. 복구 실행 → 현재 참가자 데이터가 해당 시점으로 되돌아감

### 전체 DB 복구 (Firebase 콘솔)
1. https://console.firebase.google.com/project/woori-high/database 접속
2. 우측 상단 ⋮ 메뉴 → "JSON 가져오기"
3. 백업 파일 선택 → **주의: 기존 데이터를 덮어씁니다**

### Rules 복구
운영 Rules 복구도 Rules 배포와 같으므로 대상 백업과 diff를 확인해 보고한 뒤 명시적으로 승인된 경우에만 실행한다.

```bash
cd attendance-app
# 백업 파일로 복원
cp database.rules.backup.YYYYMMDD.json database.rules.json
firebase deploy --only database
```

---

## 5. 장애 대응

### "화면이 안 나와요" (데이터 로드 실패)
1. Firebase 콘솔에서 DB 상태 확인 (읽기/쓰기 제한 초과 여부)
2. 사용자에게 새로고침 요청
3. 에러 배너 메시지 확인 (이번에 추가된 에러 표시 기능)

### "데이터가 사라졌어요" (잘못된 덮어쓰기)
1. 참가자 데이터 → 행정 앱 백업 복구 기능 사용
2. 다른 데이터 → Firebase 콘솔에서 수동 백업 파일로 복구
3. 데이터 손실과 Rules 차이를 분리해 조사한다. Rules가 의심되면 현재 배포본과 학생 앱 원천을 비교해 결과를 보고하고, 자동 재배포하지 않는다.

### "권한이 안 돼요" (Rules 문제)
1. Firebase 콘솔 → Realtime Database → 규칙 탭에서 현재 배포된 규칙 확인
2. 학생 앱의 `database.rules.json`과 비교
3. 차이와 로그인 자기조회 영향을 보고한다. 승인 후 백업·계약 테스트를 거쳐 학생 앱에서만 재배포한다.

---

## 6. 민감정보 위치

| 경로 | 내용 | 접근 권한 |
|------|------|----------|
| `retreatsPrivate/{id}/cancellations` | 환불 계좌, 취소 사유 | admins + retreatAdmins만 |
| `retreatsPrivate/{id}/teacherIdNumbers` | 교사 주민등록번호 | admins + retreatAdmins만 |
| `retreatsPrivate/{id}/medicalLogs` | 의료 일지 | admins + retreatAdmins만 |
| `retreatsPrivate/{id}/unmatchedPayments` | 미매칭 입금 정보 | admins + retreatAdmins만 |
| `retreatsPrivate/{id}/participantContacts` | 수련회 참가자 본인·보호자 연락처 | admins + retreatAdmins만 |
| `retreatsPrivate/{id}/participantContactsBackups` | 공개 명단과 같은 시점의 연락처 롤링 백업 | admins + retreatAdmins만 |

사이트 요청의 첨부 이미지 본문은 RTDB가 아니라 Firebase Storage의
`site-requests/{uid}/{requestId}/attachment.jpg`에 저장한다. RTDB
`iguardPending/{uid}/siteRequests/{requestId}/attachment`에는 파일 이름·크기·Storage 경로·다운로드 주소만 남긴다.

**주의:** 이 데이터가 포함된 백업 파일은 git에 커밋하지 마세요.

### ⚠ 이 표의 "admins + retreatAdmins만"은 **역할이 아니라 버킷**이다

화면은 역할 15종(`accessPolicy.ts`, 학기·방학 2축)으로 나뉘지만 **Rules는 세 버킷만**
구분한다(`admins` / `retreatAdmins` / `iguardMembers`). 즉 `retreatsPrivate`는
`canSeeSensitiveRetreat()`로 **화면에서만** 걸러지고, DB 수준에서는
**`retreatAdmins`에 등록된 사람 전원**이 위 표의 모든 항목을 읽고 쓸 수 있다.

Rules를 역할별로 쪼개지 않는 것은 의도적이다 — `accessPolicy.ts`의 원칙
("화면에서 막는 것은 언제나 안전하지만, 화면에서 여는 것은 Rules가 허용할 때만 한다")
때문에 Rules를 좁히면 "눌렀는데 저장 실패"가 생기고, Rules 변경은 이 저장소에서
가장 위험한 작업이다. 대신 **명단 관리로 대체한다.**

### 정기 점검 — `retreatAdmins` 명단 (연 2회, 수련회 전후)

1. 통합 홈 → **팀원 관리**에서 현재 `retreatAdmins` 전원을 확인한다.
   (또는 Firebase 콘솔에서 `retreatAdmins` 노드를 읽는다 — 읽기 전용)
2. 각 사람에게 **지금도** 위 민감정보 접근이 필요한지 확인한다.
   사역이 끝난 사람, 부서를 옮긴 사람이 남아 있는지가 핵심이다.
3. 불필요한 사람은 팀원 관리에서 제거한다. 역할만 낮추는 것으로는 부족하다 —
   버킷에서 빠져야 DB 접근이 닫힌다.
4. 점검 날짜와 인원수를 이 문서 아래 이력에 한 줄로 남긴다(이름은 남기지 않는다).

| 점검일 | retreatAdmins 인원 | 제거 | 비고 |
|---|---|---|---|
| _(첫 점검 시 여기에 추가)_ | | | |

---

## 7. 관리자 권한 부여

### 최상위 관리자 (admins)
- Firebase 콘솔에서 직접 추가: `admins/{uid}` = `true`
- 모든 앱의 모든 기능에 접근 가능

### 행정 관리자 (retreatAdmins)
- 통합 홈 → 팀원 관리에서 학기 역할과 방학 역할을 각각 배정한다.
- 저장은 `planRoleAssignment()` → `applyRoleSteps()` 경로를 사용하며 `retreatAdmins/{uid}`의 선택 필드 `semesterRole`·`retreatRole`과 기존 `role` 호환값을 함께 관리한다.

### 이가드 멤버 (iguardMembers)
- 통합 플랫폼에서 접근 요청 → 통합 홈의 팀원 관리에서 통합관리자가 승인한다.
- `iguardRoles/{uid}`에는 Rules validate가 허용하는 `team` 또는 `staff`만 저장한다. 실제 화면 권한은 선택 필드와 `accessPolicy.ts`의 방학 역할·capability로 판정한다.

---

## 8. 새 수련회 생성 흐름

```
1. 통합 플랫폼 → 방학 중 사역 → "새 수련회 추가"
2. 수련회 이름, 연도 입력
3. 구글 시트 URL 연결 (신청 응답 시트)
4. 참가자 명단 탭 → 구글시트 동기화
5. 조편성/방배정/교사 참석 입력
6. 통합 플랫폼 기획 화면에서 해당 수련회의 스탭 큐싯/동선을 작성
7. 통합 플랫폼 현장 화면에서 인원체크/식사순서/버스배정 실행
```
