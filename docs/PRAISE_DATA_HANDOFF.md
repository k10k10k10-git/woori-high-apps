# 찬양팀 원본 데이터 전달·검증·이관 절차

2026-09-06 작성. 대상은 `high-school-worship-team`의 `worship-admin-v2` Supabase 스키마(소스 `982dc53`, 202609050007까지)다. 같은 날 사용자가 실제 운영 백업 CSV를 제공하고 현재 사이트 적용을 요청했다. 원본 Supabase·Vercel 관리 접근은 없으며 제공 파일의 조회용 이관과 원본 입력 중단을 수반하는 서비스 전환을 구분한다. 이번 파일 대조·적용 상태는 [CSV 이관 기록](PRAISE_DB_IMPORT_2026-09-06.md)을 따른다.

## 담당자와 승인 범위

| 작업 | 담당·필요 조건 | 실제 영향 |
|---|---|---|
| 원본 내보내기 | 원본 운영자가 Supabase 서비스 역할 자격을 보유 | public 업무 테이블과 imports Storage 조회만 수행 |
| 원본 입력 동결 | 원본 운영자가 UI·직접 테이블 API·RPC·동기화 작업을 모두 통제 | 원본 쓰기 경로의 운영 변경이므로 운영자 승인·복구 계획 필요 |
| 로컬 dry-run | 전달받은 보관본과 Node 22.18 이상 | DB·인증·네트워크 접근 없음 |
| 신규 shadow 원장 적용 | 사용자 명시 DB 쓰기 승인, 대조한 원본, 백업 위치, 승인된 Firebase 인증. 최종 동결 export와 아래 CSV 조회용 스냅샷 경로를 구분 | `praiseOps/{신규workspaceId}` 단 한 노드를 원자 생성 |
| 접근 계정 매핑 | Firebase UID와 원본 프로필/스탭 UUID를 직접 대조하고 권한 부여 승인 | 명시된 workspace 접근 권한만 생성, Firebase 계정은 생성하지 않음 |
| 실제 서비스 전환 | 원본 동결·대조·교육·운영 검수 후 별도 결정 | 앱의 shadow→live 전환과 원본 운영 중지 |
| Firebase Rules·IAM·서비스 계정/키 생성 | 각각 별도 명시 승인 및 기존 운영 절차 | 앱 배포 승인으로 대신하지 않음 |

원본 화면을 잠그는 것만으로는 동결이 아니다. 원본 attendance 테이블에는 직접 DML 경로도 있으므로 RPC만 막으면 기록이 계속 바뀔 수 있다. 이 도구는 원본 동결·권한 수정·계정 변경을 수행하지 않는다.

## 전달할 원본과 민감정보

내보내기는 다음 **24개 테이블**의 모든 행·모든 필드를 보존한다. 연락처·개인 메모·감사 before/after·원본 첨부명 등이 포함될 수 있으므로 `tables.json`과 Storage 파일은 개인정보 원본이다.

- 계정·감사: `staff`, `admin_allowlist`, `profiles`, `access_requests`, `audit_events`
- 학기·명단·모임: `terms`, `students`, `term_students`, `meetings`, `import_batches`
- 조편성: `grouping_rules`, `grouping_rule_members`, `grouping_versions`, `groups`, `group_student_members`, `group_staff_members`
- 출석·등단: `attendance`, `stage_plans`, `stage_staff_availability`, `stage_versions`, `stage_services`, `stage_candidates`, `stage_overrides`, `stage_assignments`

이는 위 소스에서 사용하는 public 스키마의 계약이다. 다른 저장소의 legacy D1/R2 데이터, Supabase Auth 내부 테이블/비밀번호, 추가된 다른 업무 테이블은 포함하지 않는다. 실제 운영 스키마가 소스와 다르면 원본 운영자가 먼저 스키마 차이를 확인해야 한다. 삭제된 기록은 현재 테이블 내보내기로 복원되지 않는다.

출력 디렉터리는 새로 생성하며 `0700`, 파일은 `0600`으로 만든다. 기존 경로를 덮어쓰지 않는다. 원본·변환 결과·계정 매핑·백업은 저장소 밖의 보호된 위치에 보관하고 Git, 일반 채팅, 공개 링크, 배포 아티팩트에 넣지 않는다. 전달은 조직에서 승인한 암호화 경로로 한다. 보관 기간·삭제 담당자는 인수 시 합의한다.

## 1. 원본 운영자의 읽기 전용 내보내기

Node 22.18 이상과 이 저장소의 `highschool-app/scripts/praise-export-supabase.mjs` 및 `src/features/praise/migration/` 파일이 필요하다. 내보내기와 dry-run은 추가 패키지 설치가 필요 없다. 셸의 현재 위치는 `highschool-app/`이다.

보안 자격정보 관리 도구를 통해 `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`를 실행 프로세스 환경으로 주입한다. 서비스 역할 키 또는 Supabase 비밀키가 필요하다. 익명 공개 키는 거절한다. 키를 명령 인자·셸 기록·`.env` 파일·로그에 넣지 않는다. 이 도구는 `.env`를 읽거나 생성하지 않는다.

첫 검토용 복사본:

```bash
node scripts/praise-export-supabase.mjs --out /보호된/새-검토용-디렉터리 --download-imports
```

원본 운영자가 모든 쓰기 경로를 동결한 뒤 만드는 최종 보관본:

```bash
node scripts/praise-export-supabase.mjs --out /보호된/새-최종-디렉터리 --source-frozen --download-imports
```

`--source-frozen`은 **실행자의 동결 선언**이다. 플래그 자체가 외부 앱을 정지하거나 DB 트랜잭션 스냅샷을 생성하지 않는다. 테이블은 PK 순서, 정확한 건수, 실제 페이지 길이로 읽고, 전체 테이블을 다시 읽어 체크섬을 대조한다. 행 수 변화·중복 페이지·반복 조회 차이는 실패로 처리한다. 두 번 같아도 그 사이 변경이 없었다는 수학적 증명은 아니므로 동결 운영 절차를 대체하지 않는다.

`--download-imports`는 imports 버킷의 폴더를 재귀 조회하고 참조되지 않은 잔존 파일도 다운로드한다. `POST /storage/v1/object/list/imports`는 조회용 API다. 업로드·삭제·수정 API는 호출하지 않는다. 경로 대신 SHA-256 기반 로컬 파일명으로 저장하고 원래 경로는 비공개 manifest에 남긴다. 파일 목록·내용을 다시 읽어 대조하며, import_batches가 가리키는 파일이 없으면 Storage 보존을 완료로 표시하지 않는다.

산출물:

| 파일 | 용도 |
|---|---|
| `tables.json` | 수정하지 않은 전체 테이블 보관본 |
| `manifest.json` | 소스 식별 해시, 수집 시각, 파일·테이블별 SHA-256, 건수, Storage 목록 |
| `verification-receipt.json` | 반복 조회 일치 여부와 동결 선언. DB 트랜잭션 스냅샷 보장은 항상 false |
| `storage/*.bin` | 선택 다운로드한 imports 원본 파일. 실제 파일명은 manifest의 objectPath와 연결 |

콘솔에는 테이블·행·파일 수와 검증 상태만 나온다. 이름·전화번호·파일명·키·SDK 내부 오류는 출력하지 않는다. 실패한 출력 폴더는 검증 완료본으로 전달하지 말고 원인을 해결한 뒤 새 디렉터리로 다시 내보낸다.

## 2. 자격정보 없는 변환·대조

```bash
node scripts/praise-import.mjs --input /보호된/최종-보관본 --term 원본-학기-UUID --workspace 새-workspace-ID --out /보호된/새-변환결과 --late-as-present
```

`--apply`가 없으면 네트워크·Firebase SDK 연결·DB 쓰기가 전혀 없다. 파일 SHA, 테이블 건수·SHA, PK 중복, FK 존재, 학기/조 버전/등단 참조 일치 여부를 검사한다. 누락된 테이블을 빈 목록으로 간주하지 않는다. 이름으로 학생·스탭·계정을 합치지 않는다.

원본에 LATE가 있으면 `--late-as-present`를 명시해야 진행한다. 대상은 `PRESENT`로 저장하고 `originalStatus: LATE`, 원본 수정자 식별자와 시각을 별도 보존한다. 미입력 셀은 만들지 않는다. 원본 스탭 참석 `false`는 그대로 `false`다.

출력은 `converted-state.json`, `comparison-report.json`, `source-tables.json`, `source-manifest.json`, 선택 `source-verification-receipt.json`이다. 원본 보관본의 Storage 디렉터리도 계속 보관해야 한다. 변환 산출물에도 이름·출석 등 개인정보가 들어 있으므로 공개하면 안 된다.

모든 대상은 `mode: shadow`다. 학기·학생 출석부·기존 사역팀 출석에는 쓰지 않는다. 원본 UUID에 종류별 접두사를 붙인 안정 ID를 사용하므로 동명이인과 student/staff 식별자 충돌을 합치지 않는다. 재실행에서도 같은 원본·옵션은 같은 원장이 된다.

## 3. 선택 ID 매핑

### 제공된 단일 CSV 백업

`woori-operational-backup-v1`은 `backup` 열의 단일 JSON 행에 24개 테이블과 스키마·계정 연결 메타데이터를 담는다. 다음 명시 옵션으로 읽는다.

```bash
node scripts/praise-import.mjs --snapshot-csv --input /보호된/백업.csv --term 원본-학기-UUID --workspace 새-workspace-ID --out /보호된/새-변환결과 --map /보호된/매핑.json
```

엄격한 CSV 인용·UTF-8·크기·스키마 검사 뒤 기존 변환과 관계 검사를 사용한다. SQL 함수·정책은 데이터로 보관하며 실행하지 않는다. `account_links`, `admin_allowlist`로 계정을 자동 생성하거나 권한을 부여하지 않는다.

CSV의 내보내기 시각은 수집 기준일일 뿐 원본 동결 증거가 아니다. 이 경로는 `source_snapshot_unverified`와 `source_storage_incomplete`를 유지하며 `--source-frozen`을 추가해도 검증 완료로 바꾸지 않는다. 과거 조 매핑이 없으면 `historical_group_unresolved`도 남는다. 원본 CSV·테이블·메타데이터를 보호된 결과 디렉터리에 함께 보존한다.

사용자가 제공 파일 적용을 승인한 경우 `--apply --backup-dir /보호된/새-백업`과 승인된 인증으로 **새 shadow 스냅샷만** 추가할 수 있다. 원본 동결 확인은 조회용 복사의 선행 조건이 아니며, live 전환에는 여전히 필요하다. 일반 export 디렉터리의 적용 경로는 기존 동결 선언·검증 영수증 조건을 유지한다. 차단 항목이 남은 shadow는 서버에서도 setup·live 변경을 거부하여 설정 화면을 통한 업무 편집 우회를 막는다.

### 명시 매핑 파일

`--map /보호된/매핑.json`은 소유자만 읽을 수 있는 `0600` JSON 파일이다. 원본 UUID와 확인한 현행 ID만 넣는다. 개인정보 검색이나 이름 기반 자동 후보 선택은 제공하지 않는다.

```json
{
  "semesterId": "2026-2",
  "teamId": "확인한-기존-팀-ID",
  "people": {
    "원본-term_students-또는-staff-UUID": { "studentId": "확인한-학생-ID", "classKey": "2-2-1" }
  },
  "profiles": {
    "원본-profile-UUID": { "uid": "확인한-Firebase-UID", "staffId": "원본-staff-UUID", "role": "groupStaff" }
  },
  "meetingSessionIds": { "원본-meeting-UUID": "확인한-현행-회차-ID" },
  "meetingGroupVersions": { "원본-meeting-UUID": "검증한-원본-grouping-version-UUID" },
  "worshipDates": { "원본-meeting-UUID": "2026-09-13" }
}
```

예시의 설명 문자열은 실제 UUID가 아니므로 그대로 실행하면 거절된다. `profiles`가 없으면 `access`는 비어 있고, 원본 Supabase UUID를 Firebase UID로 자동 부여하지 않는다. 매핑된 프로필은 원본 ACTIVE 계정이어야 하고 staff_id 일치도 검사한다. 원본 ADMIN이라는 이유만으로 통합관리자가 되지 않는다. `role`도 사람이 명시한 workspace 역할만 사용한다. 적용 시에는 별도로 `--apply-access-map`이 필요하다.

원본 attendance에는 당시 조 버전이 없다. 확인 가능한 근거 없이 최신 조를 과거 기록에 연결하지 않는다. `meetingGroupVersions`가 없으면 `groupVersionId: import-unresolved`와 `historical_group_unresolved` 차단 표식을 남긴다. 원본에 stage_plan이 없는 회차는 예배일을 +1로 추정하지 않고 `worshipDates` 명시 매핑을 요구한다. stage_plan이 있으면 원래 sunday_date를 보존한다.

**공통 출석 어댑터는 구현됐지만 현재 이관본의 데이터 전환은 미완료다.** 사용자가 학기 사역팀의 찬양 모임과 찬양팀 전용 모임이 같은 행사라고 확인해 `semesters/{sid}/attendance/team`을 최종 공통 원장으로 정했다. `meetingSessionIds`로 검증한 회차와 각 사람의 `rosterLink.applicationKey`가 모두 있을 때 찬양 출결 화면은 학기 최신값을 읽고 같은 셀을 수정하며, 등단 계산도 해당 스냅샷을 사용한다. 미입력은 셀 삭제, PRESENT는 `출석`, ABSENT는 `결석`이며 레거시 `지각`은 PRESENT로 읽는다. 기존 찬양 스냅샷은 연결되지 않은 회차의 조회 fallback으로 보존한다.

공통 출석 쓰기는 workspace 예약 뒤 `semesters/{sid}` transaction에서 학기·팀·회차·신청 배치를 다시 확인하고, 출석 셀과 비식별 `praiseOperationReceipts/{receiptHash}` 적용 표식을 한 번에 저장한다. 응답이 끊겨도 표식은 남으며 일반 재시도는 출석을 다시 적용하지 않는다. 관리자 검토도 외부 표식 전에 private workspace에 최신 권한·원본 요청·작업 번호를 예약한다. 이후 원장 현재값과 영구 표식을 확인해 감사를 완료하거나 원장 변경 없이 요청을 종료하며, 표식 뒤 장애는 같은 예약 또는 다른 관리자 인계로 감사에 수렴한다. 등단 쓰기도 workspace ETag 조건부 저장 직전에 같은 회차의 공통 출석을 재검증한다. 다만 찬양 workspace와 학기 원장 전체를 묶는 분산 transaction은 아니며, 마지막 재검증 직후의 외부 변경은 다음 조회에서 반영된다.

현재 `p_import_dc53ee7b2786adbc8675` shadow 이관본에는 이름·날짜로 자동 생성하지 않은 인물·공통 회차·과거 조 연결이 남아 있다. 따라서 `shared_attendance_cutover_pending`과 다른 검증 차단은 실제 키 대조가 끝날 때까지 유지한다. 코드 어댑터가 있다는 이유로 shadow→live를 열거나 차단 필드를 삭제하지 않는다. 기존 운영자의 최종 동결 export, 회차/신청키 대응, 당시 조와 상충 출석을 대조한 뒤 별도 승인된 데이터 작업으로 명시 매핑을 적용한다.

## 4. 보존·표시의 차이

| 원본 | 대상 표현 |
|---|---|
| 학기·학생·스탭·회차·조편성·출석·등단 버전/배정 | 대상 업무 구조로 변환. 모든 원문 필드도 로컬 tables.json에 보존 |
| 공통 staff | 원본에 학기별 소속 테이블이 없어 활성·비활성을 포함한 공통 스탭 보존 |
| 과거 배정·인도자 이름 | 원본에 당시 이름 스냅샷이 없어 내보내기 시점 이름 사용, `nameSnapshotAsOf` 표시 |
| 개인 메모·이메일·의료 등 자유문·감사 before/after | 보호된 원본 보관본에만 저장, 앱 원장/API에 복사하지 않음 |
| 자유문 배정 사유·후보 사유·경고 | 민감 원문 누출 방지를 위해 앱에는 사유/경고 존재의 정제 요약, 원문은 보관본 |
| 과거 감사 | 선택 학기의 엔터티와 확정 연결 가능한 것만 historical 요약. 나머지는 전체 원본 보관본에 보존 |
| 원본 감사 actor | `supabase:<원본UUID>`와 sourceActorId. 현재 Firebase 사용자 행위로 설명하거나 글로벌 활동로그로 투영하지 않음 |
| 버전 revision·원본 승인자·후보 부서·첨부 경로 등 대상에 직접 대응하지 않는 상세 필드 | 원본 JSON에서 완전 보존. 대조보고서에 보관본 전용 범위 표시 |

원본 grouping/stage 결과를 다시 자동 편성하지 않는다. 당시 결과·버전 순서·출석·가용성·설정·예외를 변환한다. shadow 비교 이후 새 자동 편성을 실행하면 새 알고리즘·현행 정책을 적용한 별도 버전이 된다.

## 5. 승인 후 신규 shadow 원장 적용

일반 최종 export 적용 전에는 원본 책임자의 동결 확인, `comparison-report.json` 검토, 운영 DB 쓰기 승인, 대상 신규 ID 확인이 먼저다. 계정 매핑이 있는 경우 권한 부여 승인도 필요하다. 위 CSV 조회용 스냅샷은 명시된 별도 조건을 따른다. Firebase Admin SDK 의존성은 해당 앱 lockfile로 설치한다. `FIREBASE_ADMIN_SERVICE_ACCOUNT_JSON`, `NEXT_PUBLIC_FIREBASE_PROJECT_ID`, `NEXT_PUBLIC_FIREBASE_DATABASE_URL`을 승인된 자격정보 관리 도구로 프로세스 환경에 주입한다.

```bash
node scripts/praise-import.mjs --input /보호된/최종-보관본 --term 원본-학기-UUID --workspace 새-workspace-ID --out /보호된/새-적용결과 --map /보호된/매핑.json --late-as-present --apply --source-frozen --backup-dir /보호된/새-백업디렉터리
```

profiles 매핑을 적용할 때만 승인 후 `--apply-access-map`을 추가한다. 자격정보·동결 영수증·명시 플래그가 없으면 변환 결과를 남긴 뒤 적용을 중단한다. 설정한 projectId와 일치하지 않는 인증서·URL 및 에뮬레이터 설정은 거절한다. 적용 전에는 설정된 projectId가 운영 대상 `woori-high`인지 운영자가 확인한다.

대상 노드의 현재 값을 `target-before.json`으로 먼저 저장한다. 기존 노드가 있으면 덮어쓰지 않는다. 없을 때만 transaction으로 전체 workspace를 생성하며, 동시 생성이 있으면 중단한다. 완전히 같은 결과의 재실행은 쓰기 없는 alreadyApplied 영수증으로 끝난다. 저장 후 실제 값을 대조하고 `target-after.json`, `apply-receipt.json`을 남긴다. 저장 후 검증 실패는 저장 실패와 다르므로 무작정 재실행하거나 원본 입력을 열지 말고 백업·영수증으로 확인한다.

Storage 원본 보존이 빠졌거나 역사적 조 매핑이 미해결이거나 공통 회차 원장 전환이 미완료이면 shadow 적용 후에도 `importBlockers`가 남아 live 전환을 막는다. 차단 사유를 삭제해 우회하지 말고 원본/매핑을 보완하고 필요한 공통 원장 어댑터를 구현한 뒤 새 workspace로 재검증한다. 별도 해제 기능은 이 도구에 없다.

## 6. 서버 자격정보와 운영 활성화

현재 서버는 명시된 `FIREBASE_ADMIN_SERVICE_ACCOUNT_JSON`만 사용하며 검증하지 않은 ADC를 자동 탐색하지 않는다. 키가 없거나 잘못되면 503으로 실패한다. 공개 Firebase 설정만으로 서버 업무 저장이 가능하다고 설명하면 안 된다.

서버는 Firebase ID 토큰의 폐기 여부를 검사하고 현재 admins/retreatAdmins/iguardMembers/iguardRoles를 조회한다. 이 흐름에는 Firebase Authentication 계정 상태 조회와 Realtime Database 읽기·transaction이 필요하다. Cloud Firestore의 datastore 역할은 Realtime Database 권한을 대신하지 않는다. 후보 서비스 계정의 현재 IAM 권한과 대상 프로젝트를 먼저 읽기 검증하고, 필요한 권한 변경·키 발급은 별도 승인 후 진행한다. 광범위한 Owner/Editor 역할을 자동 부여하지 않는다. [Firebase 세션 폐기 검사](https://firebase.google.com/docs/auth/admin/manage-sessions), [Realtime Database IAM 역할](https://docs.cloud.google.com/iam/docs/roles-permissions/firebasedatabase).

Admin SDK의 완전한 관리자 연결은 Rules를 우회한다. 따라서 `praiseOps`의 클라이언트 직접 read/write 차단은 서버 자격 자체를 그 노드로 제한하는 장치가 아니다. 서버 API의 권한 필터·단일 경로 저장 계약과 키 보관이 함께 필요하다. 더 작은 DB 권한으로 제한하려면 `databaseAuthVariableOverride` 또는 별도 원천 등 별도 설계를 검토해야 하며, 현재 직접 차단 Rules에 임의 override를 더하면 서버 저장도 거절될 수 있다. [Admin Database SDK 접근 방식](https://firebase.google.com/docs/database/admin/start).

Vercel 서버 비밀 환경설정에만 키를 등록하고 `NEXT_PUBLIC_` 변수·클라이언트 번들·소스·CLI 인자에 넣지 않는다. IAM 키 생성, Secrets 등록, Rules 배포, 앱 배포, 데이터 이관은 각각 실제 완료 여부를 따로 확인한다. 이 도구는 공급자의 키를 새로 만들거나 권한을 수정하지 않는다.

## 7. 검수와 되돌리기

원본 책임자가 총 행 수, 선택 학기 학생·공통 스탭 수, 회차별 PRESENT/LATE/ABSENT 및 미입력 수, 조 버전별 인원, 등단 버전·서비스·배정 수, 원본 파일 수/해시를 대조한다. 스탭 가용성 false와 미입력, 휴강 회차의 원본 기록, 수동 override, 비활성 구성원도 따로 확인한다. 운영 UI 역할별 조회·쓰기 거절, 토큰 폐기, 글로벌 로그의 역사적 이벤트 제외도 검증한다.

shadow 단계에서 원본은 그대로 두고, 실패한 신규 workspace는 사용하지 않는다. 삭제가 필요하면 해당 노드를 다시 스냅샷하고 **명시 삭제 승인**을 받아 별도 처리한다. 이 CLI는 삭제·덮어쓰기·자동 롤백을 제공하지 않는다.

live 전환 후 새 기록이 생겼다면 예전 원본으로 곧바로 복귀하면 안 된다. 신규 입력을 먼저 동결하고 현재 workspace를 보관한 뒤 전환 이후 차이를 대조·이관해야 한다. 앱 배포를 되돌리는 것만으로 데이터 원장이 되돌아가지 않는다. 동시 입력 기간을 만들지 않으며 최종 기록 원천과 담당자를 한 곳으로 정한 뒤 재개한다.
