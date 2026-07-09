# 운영 절차서

> Firebase 프로젝트: `woori-high`
> 작성일: 2026-06-23

---

## 1. 배포 방법

### 학생 앱 (Firebase Hosting)
```bash
cd "고등부 학생 출석부"
npm run build
firebase deploy --only hosting
```
- predeploy 훅이 자동으로 SW 캐시 이름을 갱신함
- 배포 URL: https://woori-high.web.app

### 행정 앱 (Vercel)
```bash
cd "retreat-app"
npx vercel --prod
```
- 또는 로컬 빌드 후 배포: `npx vercel build --yes --prod && npx vercel deploy --prebuilt --prod --yes`
- 배포 URL: https://retreat-app-theta.vercel.app
- GitHub 연동: main 브랜치 머지 시 자동 배포 설정 (Root Directory: `retreat-app`)
  ✅ **자동배포 정상 (2026-07-08 확인)** — 07-06의 "push해도 배포가 안 잡힌다" 이슈는 07-06 `git connect`+Root Directory 세팅 전 증상이었고, 세팅 이후 모든 push가 정상 자동 배포됨(Vercel API 배포 이력으로 검증).
  push 후 `npx vercel ls`로 Ready 확인은 계속 할 것. 만약 다시 트리거가 안 되면 비상 폴백:
  레포 루트에 `retreat-app/.vercel/project.json`을 임시 복사해 `npx vercel --prod`로 수동 배포 →
  작업 후 임시 `.vercel/` 삭제. (상세: retreat-app/CLAUDE.md 배포 섹션)
  ⚠ 폴더명에 공백이 있으면 Git 배포 시 서버리스 함수 이름 검증에 걸려 실패한다(로컬 CLI 배포는 영향 없음) —
  그래서 폴더명을 영문/공백없음으로 유지해야 한다.

### 이가드 앱 (Vercel)
```bash
cd "iguard-app"
npx vercel --prod
```
- 배포 URL: https://iguard-app.vercel.app
- GitHub 연동: main 브랜치 머지 시 자동 배포 (Root Directory: `iguard-app`)

### 교사·스탭 앱
- 아직 배포 설정 없음 (로컬 개발만)

### Firebase Rules 배포
```bash
cd "고등부 학생 출석부"
firebase deploy --only database
```
- **반드시 학생 앱 폴더에서만 실행** (단일 원천)
- 다른 앱 폴더의 rules 파일은 `DO_NOT_DEPLOY` 접두사로 보관용

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
- **참가자 백업**: 행정 앱에서 구글시트 동기화/재매칭 시 자동 실행
  - 경로: `retreats/{id}/participantsBackups/{timestamp}`
  - 최근 5개만 유지, 오래된 것은 자동 삭제
  - 복구: 행정 앱 `restoreParticipantsBackup()` 함수 사용

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
cd "고등부 학생 출석부"
cp database.rules.json "database.rules.backup.$(date +%Y%m%d).json"
```

---

## 4. 복구 절차

### 참가자 데이터 복구 (행정 앱 내장)
1. 행정 앱 → 참가자 명단 탭
2. 백업 목록에서 복구할 시점 선택
3. 복구 실행 → 현재 참가자 데이터가 해당 시점으로 되돌아감

### 전체 DB 복구 (Firebase 콘솔)
1. https://console.firebase.google.com/project/woori-high/database 접속
2. 우측 상단 ⋮ 메뉴 → "JSON 가져오기"
3. 백업 파일 선택 → **주의: 기존 데이터를 덮어씁니다**

### Rules 복구
```bash
cd "고등부 학생 출석부"
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

**주의:** 이 데이터가 포함된 백업 파일은 git에 커밋하지 마세요.

---

## 7. 관리자 권한 부여

### 최상위 관리자 (admins)
- Firebase 콘솔에서 직접 추가: `admins/{uid}` = `true`
- 모든 앱의 모든 기능에 접근 가능

### 행정 관리자 (retreatAdmins)
- 행정 앱 → 사이트 셋팅 → 권한 관리에서 승인
- 또는 Firebase 콘솔에서 `retreatAdmins/{uid}` 추가

### 이가드 멤버 (iguardMembers)
- 이가드 앱에서 접근 요청 → admin이 승인
- 역할: `team` (전체 편집) 또는 `staff` (실행 탭만)

---

## 8. 새 수련회 생성 흐름

```
1. 행정 앱 → 홈 → "새 수련회 추가"
2. 수련회 이름, 연도 입력
3. 구글 시트 URL 연결 (신청 응답 시트)
4. 참가자 명단 탭 → 구글시트 동기화
5. 조편성/방배정/교사 참석 입력
6. 이가드 앱에서 해당 수련회 선택 → 스탭 큐싯/동선 기획
7. 현장에서 이가드 앱으로 인원체크/식사순서/버스배정 실행
```
