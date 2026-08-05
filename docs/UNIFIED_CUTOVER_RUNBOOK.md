# 통합 고등부 플랫폼 전환 실행서

기준일: 2026-08-05

## 운영 주소

- 통합 플랫폼: `https://woorihigh-app.vercel.app`
- 학기 중 사역: `/semesters`, `/semester/{id}`
- 방학 중 행정: `/retreats`, `/retreat/{id}`
- 방학 중 이가드: `/field`, `/retreat/{id}/field`

## 단계별 상태

1. 기존 세 앱의 전체 기능과 테스트 목록: `UNIFIED_FEATURE_PARITY.md`에 기록 완료
2. 통합 앱 기본 구조·로그인·권한: 완료
3. semester-app 기능 이전: 완료
4. retreat-app 행정 기능 이전: 완료
5. iguard-app 현장 기능 이전: 완료
6. 홈·전체 일정·내 담당 사역 연결: 완료
7. 기존 사이트와 기능·데이터 결과 대조: 정적 계약 테스트와 전체 회귀 테스트 완료
8. 운영 리허설: 읽기 전용 경로·빌드·배포 점검 완료. 운영 DB 쓰기 리허설은 별도 승인과 스냅샷 후 실시
9. 새 통합 주소 전환: 완료
10. 기존 주소 리다이렉트: 통합 전환 기간 동안 완료
11. 기존 Vercel 프로젝트 종료: **완료 (2026-08-05)** — `retreat-app`, `iguard-app` 삭제
12. 기존 코드 정리: **완료 (2026-08-05)** — `pre-unified-apps-2026-08-05`, `pre-legacy-app-removal-2026-08-05` 태그 보존

## 2026-08-05 종료 결과

- Vercel 프로젝트 `retreat-app`, `iguard-app` 삭제
- Firebase Hosting 사이트 `woori-high-retreat`, `woori-high-iguard` 삭제
- Firebase 웹 앱 등록은 통합 앱이 같은 App ID를 사용하므로 삭제하지 않고 `고등부 사역 플랫폼`으로 이름 변경
- Firebase Realtime Database 데이터와 Rules는 변경·삭제·배포하지 않음
- 레거시 소스 디렉터리 `retreat-app/`, `iguard-app/` 제거
- 운영 단일 주소: `https://woorihigh-app.vercel.app`

## 안정화 조건

종료 승인 전 아래 항목을 확인했다. 향후 통합 플랫폼 변경에서도 동일 기준을 유지한다.

- 로그인·승인·관리자 우회 관련 P0/P1 장애 0건
- 학기, 행정, 이가드 주요 화면의 데이터 불일치 0건
- 기존 주소 리다이렉트 실패 0건
- 운영 담당자의 학기 생성, 수련회 생성, 현장 조회 리허설 완료
- 운영 DB 쓰기 리허설 직전 대상 노드 스냅샷 확보

## 완료된 종료 절차

1. 통합 앱의 `/api/version`과 배포 커밋을 대조한다.
2. 기존 세 주소의 리다이렉트와 `/api/version`을 확인한다.
3. Firebase Authentication 허용 도메인에 통합 운영 주소가 있는지 확인한다.
4. 기존 Vercel 프로젝트와 Firebase Hosting 사이트를 한 번에 하나씩 종료했다.
5. Firebase RTDB와 Rules는 건드리지 않았다.
6. 기존 앱 디렉터리를 제거하고 삭제 직전 태그를 남겼다.

## 복구

- 통합 전 코드: `git checkout pre-unified-apps-2026-08-05`
- 삭제 직전 독립 앱 코드: `git checkout pre-legacy-app-removal-2026-08-05 -- retreat-app iguard-app`
- 독립 앱 복구가 꼭 필요하면 태그에서 코드를 복원하고 새 Vercel/Firebase Hosting 프로젝트를 별도로 다시 만든다.
- DB 스키마와 경로는 통합 과정에서 변경하지 않는다.
