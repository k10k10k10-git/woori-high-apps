# 운영 절차서

> Firebase 프로젝트: `woori-high`
> 작성일: 2026-06-23

---

## 1. 배포 방법

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
- predeploy 훅이 자동으로 SW 캐시 이름을 갱신함
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
- ⚠ Firebase의 `staff_*` 노드와 Rules는 **그대로 남아 있다** — 앱 제거로 자동 정리되지 않는다.

### Firebase Rules 배포
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
Firebase 콘솔 또는 CLI로 전체 데이터를 내보낼 수 있습니다.

**방법 1: Firebase 콘솔**
1. https://console.firebase.google.com/project/woori-high/database 접속
2. 우측 상단 ⋮ 메뉴 → "JSON 내보내기"
3. 다운로드된 파일을 날짜별로 보관

**방법 2: CLI (REST API)**
```bash
# Firebase CLI 토큰 사용
TOKEN=$(cat ~/.config/configstore/firebase-tools.json | python3 -c "import sys,json; print(json.load(sys.stdin)['tokens']['refresh_token'])" 2>/dev/null)

# 주요 노드별 백업
curl -s "https://woori-high-default-rtdb.firebaseio.com/classes.json?auth=$TOKEN" > backup_classes_$(date +%Y%m%d).json
curl -s "https://woori-high-default-rtdb.firebaseio.com/retreats.json?auth=$TOKEN" > backup_retreats_$(date +%Y%m%d).json
curl -s "https://woori-high-default-rtdb.firebaseio.com/retreatsPrivate.json?auth=$TOKEN" > backup_retreatsPrivate_$(date +%Y%m%d).json
```

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
3. Rules가 풀렸을 수 있으므로 학생 앱에서 `firebase deploy --only database` 실행

### "권한이 안 돼요" (Rules 문제)
1. Firebase 콘솔 → Realtime Database → 규칙 탭에서 현재 배포된 규칙 확인
2. 학생 앱의 `database.rules.json`과 비교
3. 차이가 있으면 학생 앱에서 재배포: `firebase deploy --only database`

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
- 통합 홈 → 팀원 관리에서 승인
- 또는 Firebase 콘솔에서 `retreatAdmins/{uid}` 추가

### 이가드 멤버 (iguardMembers)
- 통합 플랫폼에서 접근 요청 → 통합 홈의 팀원 관리에서 admin이 승인
- 역할: `team` (전체 편집) 또는 `staff` (실행 탭만)

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
