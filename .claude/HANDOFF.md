# Claude Code 인수인계 — 통합 플랫폼 전환 및 레거시 종료

최종 갱신: 2026-08-05 (Asia/Seoul)

## 1. 먼저 읽을 문서

1. 루트 `CLAUDE.md`
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

1. `highschool-app`에서 새 기능을 계속 개발한다.
2. 통합 홈·행정·현장 권한 조합 회귀 테스트를 유지한다.
3. 학기 기능이 통합 앱에서 완전히 안정화되면 `semester-app` 종료 여부를 별도 승인받는다.
4. 운영 DB 쓰기가 필요한 변경은 대상 경로·건수·스냅샷 계획을 제시하고 명시 승인을 받은 뒤 진행한다.

현재 레거시 행정·이가드 정리는 완료 상태다. 다시 독립 앱을 만들지 말고 통합 플랫폼의 도메인 모듈에서 이어서 작업한다.
