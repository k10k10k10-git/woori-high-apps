# Claude Code 인수인계 — 통합 플랫폼 전환 및 레거시 종료

최종 갱신: 2026-08-06 (Asia/Seoul)

## 0. 에이전트별 시작 지점

- **Codex(또는 CLAUDE.md를 안 읽는 에이전트)**: 루트 `AGENTS.md` → 이 문서 → 대상 앱 `AGENTS.md` 순서로 읽는다. 세 문서 모두 6단계 역할 표·운영 주소·검증 명령을 담고 있어 이것만으로 착수할 수 있다.
- **Claude Code**: 루트 `CLAUDE.md`가 최우선(안전 4문답·스킬 지도 포함) → 이 문서 → 대상 앱 `CLAUDE.md`.
- 두 계열 문서가 어긋나면 **코드가 진실**이고, 안전 규칙은 루트 `CLAUDE.md`가 우선이다. 발견 즉시 같은 커밋에서 문서를 맞춘다.

## 1. 먼저 읽을 문서

1. 루트 `CLAUDE.md` (Codex는 루트 `AGENTS.md`)
2. 이 문서
3. `DB_OWNERSHIP.md`
4. `OPERATIONS.md`
5. 대상 앱의 `CLAUDE.md`, `AGENTS.md`

모든 작업 첫 응답에서 루트 문서의 **DB 안전 4문답**을 답한다. Firebase Rules는 항상 학생 앱 `고등부 학생 출석부/database.rules.json`만 원천이며, 통합 플랫폼에서는 배포하지 않는다.

## 2. 현재 운영 구조

- 통합 고등부 플랫폼: `highschool-app/`
- 운영 URL: `https://woorihigh-app.vercel.app`
- 주요 라우트
  - 통합 홈: `/`
  - 학기 사역: `/semesters`, `/semester/{id}`
  - 수련회 행정: `/retreats`, `/retreat/{id}`
  - 수련회 현장: `/field`, `/retreat/{id}/field`
- 호환용 독립 학기 앱: `semester-app/` / `https://semester-app.vercel.app`
- 학생 출석부와 교사·스탭 출석부는 기존 Firebase Hosting을 유지한다.

## 2-1. 2026-08-06 완료 — 6단계 역할 모델 · 주소 변경 · 화면 개편

배포 커밋 `8b6683d` (Ready, buildId 확인). 새 주소 `https://woorihigh-app.vercel.app`,
구 주소 `highschool-app-flame.vercel.app`도 같은 배포를 가리켜 기존 링크가 살아 있다.
`semester-app`도 재배포해 `/` 리다이렉트 목적지를 새 주소로 바꿨다.

역할(단일 원천 `highschool-app/src/features/portal/accessPolicy.ts`):

| 역할 | 학기 | 행정 | 이가드 | 역할배정 | 저장 |
|---|---|---|---|---|---|
| 통합관리자 | 수정 | 수정 | 전체 | ✅ | `admins/{uid}=true` |
| 교역자 | 수정 | 수정 | 전체 | — | `retreatAdmins/{uid}.role="pastor"` |
| 팀장 | 수정 | 수정 | 전체 | — | `.role="leader"` |
| 행정팀 | 수정 | 수정 | 실행탭 | — | `.role="adminTeam"` (레거시 무필드 동일) |
| 이가드팀 | ✕ | ✕ | 전체 | — | `iguardMembers` + `iguardRoles="team"` |
| 스탭 | 조회만 | ✕ | 실행탭 | — | `iguardMembers` + `iguardRoles="staff"` |

화면: 상단 메뉴 = 학기 중 사역 / 방학 중 사역(hover → 수련회 행정팀·이가드팀).
팀원 관리 진입점은 전역 헤더 하나. `/retreats`·`/field`의 중복 제목 줄 제거.
홈 = 사역 바로가기 + 전체 일정(정규 회차는 "한 학기 사역팀 모임 전체 기간" 한 줄).
학기 화면은 행정·이가드와 같은 셸에 초록 토큰(`.semester-scope`), 접수에 스탭·연락처 추가.

### ⚠ 남은 블로커 — 스탭의 학기 조회는 Rules 보강이 필요하다

`semesters` 읽기가 `admins`/`retreatAdmins`로 제한돼 스탭 계정은 학기 화면에서 데이터가 비고
에러 배너가 뜬다. 아래를 **학생 앱에서** 배포해야 완성된다(이 저장소에서 배포 금지).

```json
"semesters": {
  ".read": "auth != null && (root.child('admins').child(auth.uid).val() === true || root.child('retreatAdmins').child(auth.uid).val() != null || root.child('iguardMembers').child(auth.uid).val() != null)",
  ".write": "auth != null && (root.child('admins').child(auth.uid).val() === true || root.child('retreatAdmins').child(auth.uid).val() != null)"
}
```

`semestersPrivate`(연락처)는 그대로 행정 계열 전용으로 둔다 — 스탭에게 연락처를 노출하지 않는다.

### 로그인 뒤 화면 육안 확인은 미완

Google OAuth 때문에 헤드리스로 로그인할 수 없어(LEARNINGS.md) 배포 확인은
`/api/version` buildId 대조 + 라우트 200으로만 했다. 역할별 화면(특히 스탭·이가드팀 계정),
방학 중 사역 드롭다운, 375px 모바일은 사용자 로그인 상태에서 한 번 훑어야 한다.

## 3. 2026-08-05 완료한 레거시 정리

사용자 명시 승인 후 다음을 제거했다.

- Vercel 프로젝트 `retreat-app`
- Vercel 프로젝트 `iguard-app`
- Firebase Hosting 사이트 `woori-high-retreat`
- Firebase Hosting 사이트 `woori-high-iguard`
- 로컬 소스 디렉터리 `retreat-app/`
- 로컬 소스 디렉터리 `iguard-app/`

삭제하지 않은 것:

- Firebase Realtime Database의 모든 운영 데이터
- Firebase Rules와 Authentication 데이터
- 통합 플랫폼이 쓰는 Firebase Web App ID `1:964793733884:web:a937dadf77e302dfa7bd79`

해당 Web App의 표시명만 `분당우리고등부 수련회`에서 `고등부 사역 플랫폼`으로 변경했다.

## 4. 복구 지점

- 독립 앱 삭제 직전: `pre-legacy-app-removal-2026-08-05`
- 통합 앱 이관 전: `pre-unified-apps-2026-08-05`

독립 앱 소스만 복원할 때:

```bash
git checkout pre-legacy-app-removal-2026-08-05 -- retreat-app iguard-app
```

Vercel/Firebase Hosting 프로젝트는 삭제되었으므로 소스 복원만으로 기존 주소가 살아나지는 않는다. 꼭 필요할 때 새 프로젝트를 별도로 생성해야 한다.

## 5. 외부 리소스 확인 결과

Firebase Web Apps:

- `분당우리고등부 출석부`
- `분당우리고등부 교사/스탭 출석부`
- `고등부 사역 플랫폼`

Firebase Hosting:

- `woori-high`
- `woori-high-teach`

Vercel:

- `highschool-app`
- `semester-app`
- `lol-jungle-analyzer` (이 작업과 무관)

종료된 네 주소(`retreat-app-theta.vercel.app`, `iguard-app.vercel.app`, `woori-high-retreat.web.app`, `woori-high-iguard.web.app`)는 모두 HTTP 404, 통합 운영 주소는 HTTP 200으로 확인했다.

## 6. 데이터 계약

통합은 코드와 배포 단위를 합친 것이며 DB 이관이 아니다.

- 학기: `semesters/*`, `semestersPrivate/*`
- 수련회 행정: `retreats/{id}/*`, `retreatsPrivate/{id}/*`
- 현장 운영: `retreats/{id}/iguard/*`
- 공통 명단: `classes/{year}` 읽기 전용
- 승인: `admins`, `retreatAdmins`, `iguardMembers`, `iguardRoles`, `iguardPending`

행정과 현장 권한은 화면에서 통합해 보여도 저장 경로와 쓰기 함수는 계속 분리한다. 민감정보는 반드시 `retreatsPrivate/*`, `semestersPrivate/*` 아래에 둔다.

## 7. 검증과 배포

통합 앱 기준 명령:

```bash
cd /Users/sunghoon/Desktop/ai개발/highschool-app
npx tsc --noEmit
npm test
npm run build
npx vercel ls
curl -s https://woorihigh-app.vercel.app/api/version
```

2026-08-05 레거시 삭제 전 기준선은 타입 오류 0개, 테스트 38파일/295개 통과, 프로덕션 빌드 성공이었다. 삭제 정리 커밋 후에도 같은 세 검증을 다시 통과시켜야 한다.

## 8. 작업 트리 주의

루트에 다음 미추적 디렉터리가 있으며 이번 정리와 무관하므로 건드리지 않았다.

- `.agents/`
- `outputs/`
- `rayquaza-v2-upgrade/`
- `tmp/`

커밋 시 `git add .`를 쓰지 말고 경로를 명시한다.

## 9. 다음 작업 권장 순서

0. **(우선)** 위 2-1의 Rules 스니펫을 학생 앱에서 배포해 스탭의 학기 조회를 열고, 역할별 계정으로 화면을 한 번 훑는다.
1. `highschool-app`에서 새 기능을 계속 개발한다.
2. 통합 홈·행정·현장 권한 조합 회귀 테스트를 유지한다.
3. 학기 기능이 통합 앱에서 완전히 안정화되면 `semester-app` 종료 여부를 별도 승인받는다.
4. 운영 DB 쓰기가 필요한 변경은 대상 경로·건수·스냅샷 계획을 제시하고 명시 승인을 받은 뒤 진행한다.

현재 레거시 행정·이가드 정리는 완료 상태다. 다시 독립 앱을 만들지 말고 통합 플랫폼의 도메인 모듈에서 이어서 작업한다.

## 10. 2026-08-06 완료 — 학기 중 사역 UX·훈련 전용 명단·공유 캘린더

통합 홈과 `highschool-app/src/app/semester/[id]`의 7개 탭을 로그인된 로컬 화면에서 직접 확인하고 다음을 반영했다.

- 접수: 이름 검색 + 한 개 반/스탭 선택 방식으로 정리해 50여 개 반 카드가 화면을 밀어내지 않게 했다.
- 배치: 팀 이름 오른쪽 `명단 상세` 버튼을 추가했다. 학생을 펼치면 본인 연락처, 보호자 연락처, 지원 동기, 하고 싶은 활동을 확인한다. 민감정보는 편집 권한에서만 `semestersPrivate/{sid}/applications`를 구독한다.
- 출석·수료: 기존에 빠지던 `trainingOnly` 신청자를 `훈련만 신청` 명단으로 분리했다. 새 DB 경로 없이 기존 출석·수료 경로와 신청자 키를 그대로 사용한다.
- 커리큘럼: PC에서 2열 카드로 배치하고 입력 영역을 넓혔다.
- 아카이브: 외부 링크뿐 아니라 Firebase Storage에 파일을 직접 업로드할 수 있다. 파일 메타데이터는 기존 `archiveLinks` 레코드의 선택 필드(`filePath`, `fileName`, `fileSize`)로 저장하며 파일 크기는 30MB로 제한한다.
- 학기 화면: 모든 탭에 현재 기능 설명과 신청·팀·훈련 수 요약을 표시한다.
- 홈: 메뉴 이름을 `훈련·사역팀`, `수련회 이가드`로 정리했다. `내 담당 사역`은 수련회 동선 대신 계정이 접근 가능한 운영 영역을 보여준다. 학기 회차와 수련회 기간을 합친 `공유 사역 캘린더`는 날짜 클릭 시 오른쪽 상세 패널에 전체 일정을 보여준다.

검증 결과:

- `npx tsc --noEmit`: 통과
- `npm test`: 44파일, 331개 통과
- 이번 변경 파일 대상 ESLint: 통과
- 전체 `npm run lint`: 이번 작업과 무관한 수련회 현장 모듈의 기존 `react-hooks/set-state-in-effect` 오류 때문에 실패한다. 새 학기/홈 파일에는 오류가 없다.
- `npm run build`: 최종 수정 후 통과
- 로그인된 로컬 Chrome: 7개 탭 모두 열림, 출석·수료의 훈련 전용 전환, 아카이브 파일 업로드 UI, 팀 명단 상세의 4개 비공개 필드 노출 확인. 운영 DB 쓰기는 하지 않았다.

주의:

- Firebase Rules 배포는 하지 않았다. 현재 Rules에서 `semesters/*` 읽기는 `admins`/`retreatAdmins`만 허용하므로 이가드 전용 스탭에게 학기 일정까지 포함한 공유 캘린더를 완전히 열려면 이 문서 2-1의 학생 앱 Rules 변경이 여전히 필요하다. `semestersPrivate`는 계속 행정 계열 전용이어야 한다.
- 실제 파일 업로드는 운영 Storage 쓰기이므로 자동 점검 중 실행하지 않았다. 권한 있는 사용자로 작은 테스트 파일 1개를 업로드·열기·삭제하는 운영 확인을 권장한다.
