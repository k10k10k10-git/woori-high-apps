# 찬양팀 통합 구현·검증·운영 전환 기록

2026-09-06. 기준 기획은 [통합 기획안](PRAISE_INTEGRATION_PLAN_2026-09-06.md), 실제 원본 전달은 [이관 절차](PRAISE_DATA_HANDOFF.md)를 따른다.

## 구현 범위

- 주일 사역의 찬양팀을 이번 주·출결·등단·팀원/조·운영 설정으로 구성했다. 기존 예배팀 화면은 별도로 유지한다. 마이페이지 내 사역에 찬양팀·등단표 바로가기를 추가했다.
- 회차와 예배 날짜를 각각 관리하며 토요일 회차 생성, 휴강, 임시 모임, 학기 보관·다시 열기, 준비·대조·운영 상태를 지원한다.
- 담당 조 출결과 본인 스탭 참석을 출석·결석·미입력으로 기록한다. 로그인이나 등단 편성으로 출석을 채우지 않는다. 검색·조 선택·미입력 필터와 저장 계정·시각을 표시한다. 학기 전체 표에서 해당 회차 입력으로 이동하고 최근 출결 변경을 검색할 수 있다. 조회 제한 기록은 미입력으로 추측하지 않는다.
- CSV/XLSX 미리보기·열 매핑·검증, 명단 검색·부서/파트 필터·담당 계정 연결 상태·활동 상태·찬양 속성 수정, 정식 학기 배치 명단의 명시적인 인물 연결, 조 자동 편성·수동 편집·조건 경고·확정을 구현했다.
- 출결 후보·제외 조건, 과거 등단 빈도, 공통 인도자, 1/2부 등단, 스탭 전용 편성, 수동 편집·경고 확인, 확정 버전 보존과 PNG/PDF 출력을 연결했다. 과거 등단은 저장된 예배일 기준 최신 확정본 한 개씩 집계한다. 학생별 과거 등단을 검색·기간 선택·8주 페이지로 확인하고, 모바일에서는 1·2부를 전환한다.
- 담당 계정·업무 권한, 편성 정책, 첫 모임 가이드 편집·게시, 나눔마블 자료 다운로드를 제공한다. 연락처·민감 사유·원본 파일은 공개 다운로드에 포함하지 않는다.
- Firebase 토큰의 폐기 확인·현재 역할 확인을 거치는 서버 API에서 원본을 필요한 범위만 반환한다. 업무·감사·작업 ID는 같은 transaction에 저장하며 글로벌 활동 로그는 일치 검증과 실패 재시도를 갖춘 별도 투영이다.
- 24개 원본 테이블·Storage 내보내기, 원본 UUID 기반 변환, 참조·상태·체크섬 대조, 기본 dry-run, 명시 승인/백업/동결 조건에서만 신규 shadow 원장을 생성하는 이관 도구를 작성했다.

## 검증 기록

최종 통합 앱 lint·typecheck·165파일/1,513개 테스트·production build 통과(별도 에뮬레이터 계약 3개는 일반 실행에서 의도적으로 skip). 학생 앱 lint·typecheck·23파일/277개 테스트와 정적 build, Agent OS 35개 테스트도 통과했다. 루트 verify는 학생 앱 외부 node_modules 링크 때문에 빌드에서 멈췄으며, 별도 npm ci 후 해당 build와 남은 Agent OS 검사를 이어 통과했다. 이후 UI 추가 변경에 대해 통합 앱 전체 검사를 다시 수행했다.

합성 브라우저로 PC1440/모바일390 화면, 이름 검색·출결 저장, 팀원 수정, 역할별 버튼, 403 화면 제거·복구, 서버 미설정 준비 안내·요청 중지, 학기 표 가로 스크롤·회차 이동을 확인했다. PNG는 Blob/저장 호출, PDF는 팝업/print 호출까지이며 실제 파일·프린터 출력은 확인하지 않았다. 운영 인증·DB 저장을 수행한 E2E가 아니다.

최종 추가 UI는 실제 DOM에서 PC 목록 664.6px/상세 631.4px의 같은 높이 정렬, 모바일 문서 폭 390px/상세 324px, 열기 포커스·ESC 원행 복귀, 모바일 1·2부 전환, 12주 이력의 8주/4주 페이지, 과거 조 필터에서 입력 화면 이동을 확인했다. 최종 캡처는 브라우저 도구 시간초과로 만들지 못했다. 앞서 저장한 두 이미지는 마지막 이력/상세 개편 전 화면이며 최신 캡처로 보고하지 않는다.

실제 RTDB 에뮬레이터 계약 3개 통과: 현행 Rules의 익명/관리자 클라이언트 직접 접근 거절, cold-cache 및 null/빈 배열 왕복, 서로 다른 셀 동시 저장과 같은 셀의 구버전 거절·중복 재시도 보존. `node scripts/run-praise-contracts.mjs`가 합성 demo-praise 프로젝트를 생성·정리한다. 운영 DB 자격정보는 사용하지 않았다.

독립 리뷰에서 수정한 문제: 과거 감사·버전 ID 덮어쓰기, 글로벌 로그 ID 선점 후 잘못된 완료 표시, 미상 과거 조 출석 공개, 동일 주일 등단 중복 집계, 새 날짜 초안이 과거 확정 이력을 숨김, 실패 후 새 작업 번호 재시도로 중복 생성, 저장 중 추가 입력 유실, PDF 준비 실패 복구 안내.

운영 Rules도 읽기 전용으로 대조했다. `firebase database:get /.settings/rules`로 확보한 운영본과 학생 앱 원천은 JSON 구조가 일치하며, root/praiseOps 직접 허용은 없다. 정규화 SHA-256은 `77bf06601668a911958fc8009d9f4ddbe19dbb9f237a220cd1e177a93194af64`다. Rules 변경·배포를 실행하지 않았다.

## 조회 규모의 현재 제한

목록은 작은 workspace metadata만 읽으며, 등단 자동 편성은 서버에서 실행하고 PNG/PDF 도구는 사용하는 시점에 로드한다. 숨긴 브라우저에서는 조회를 멈춘다. 다만 선택한 workspace 내부는 현재 학기 원장 전체를 서버에서 읽은 뒤 권한에 맞게 응답하며, 15초 새로고침도 같은 범위다. 학생별 이력의 8주 페이지는 클라이언트 표시 분할이며 서버의 과거 노드 페이지 조회를 구현한 것은 아니다. 최근 감사는 권한별 최근 100건이다. 실제 원본 규모를 확보한 뒤 선택 회차 조회·과거 페이지 API와 보관 단위를 조정하고 지원 기기에서 측정해야 한다. 이관 검증 없이 대규모 운영 성능 목표를 충족했다고 보고하지 않는다.

## 현재 운영 전환에 필요한 사항

1. **통합 사이트 서버 연결**: 사용자가 2026-09-06 “서버 계정·권한·키 설정 승인”으로 전용 서비스 계정 `woori-praise-server` 1개·서버 키 1개·Firebase Auth 조회 및 RTDB 읽기/쓰기 권한과 Vercel Production 등록을 명시 승인했다. 기존 Firebase 프로젝트/DB `woori-high`에 연결하며 새 DB를 만들지 않는다. 실제 운영 데이터 변경·이관은 이 승인에 포함되지 않는다. 서버 설정과 배포의 실제 완료 여부는 후속 영수증으로 확인한다.
2. **원본 기록 확보**: 사용자 답변에 따라 외부 Supabase와 Vercel은 다른 개발자·담당자가 운영 중이다. 실제 원본 건수·기록·파일과 쓰기 동결 권한을 확보하지 못했다. 원본 담당자가 전달 절차에 따라 검토용 보관본을 내보내야 실제 대조를 진행할 수 있다.
3. **공통 행사 출석 전환**: 같은 회차 여부를 날짜·이름으로 추정하지 않는다. 공통 회차로 연결된 이관본은 `shared_attendance_cutover_pending`으로 live 전환을 차단한다. 최종 원장 선택, 학기/찬양 출석 조회·저장·집계 어댑터, 이전 쓰기 경로의 권한/Rules 검증은 실제 대조 후 남아 있다. 이 기능까지 구현·전환 완료했다고 보고하지 않는다.
4. **실제 이관 승인**: 과거 LATE 변환 건수와 정책, Firebase UID 연결, 대상 경로·건수·사전 백업을 대조 보고서로 준비한 뒤 운영 DB 적용 승인을 받는다. 합성 검증 통과는 실제 기록 대조나 사용자 승인이 아니다.

서버 계정의 `roles/firebaseauth.viewer`는 사용자 정보 조회에, `roles/firebasedatabase.admin`은 RTDB 읽기/쓰기에 해당한다. RTDB IAM 권한은 프로젝트 범위이며 업무 경로 제한은 이 서버 코드가 담당한다. Owner/Editor, Firebase Auth 관리자 또는 Firestore 관리자 권한은 요구하지 않는다. [Firebase 공식 IAM 역할 문서](https://firebase.google.com/docs/projects/iam/roles-predefined-product)

## 배포 상태

2026-09-06 15:33 KST 서버 연결 확인: 기존 Firebase `woori-high`에 전용 서비스 계정 `woori-praise-server`와 사용자 관리 키 1개를 생성했다. IAM 정책의 etag·기존 바인딩을 백업/보존하고 승인된 `roles/firebaseauth.viewer`, `roles/firebasedatabase.admin`만 추가했으며 라이브 대조도 일치했다. 키는 stdin을 통해 Vercel `highschool-app`의 **Production Secret** `FIREBASE_ADMIN_SERVICE_ACCOUNT_JSON`에 등록했다. Preview에는 등록하지 않았다. 새 계정으로 기존 관리자 레코드 SDK 조회·Auth getUser·찬양팀 경로 REST 조회가 성공했고 찬양 workspace는 0개다. 생성 직후 RTDB 인증 오류는 약 2분 뒤 권한·키 변경 없이 해소됐다. DB/Auth 데이터 쓰기와 Rules 배포는 모두 0건이다.

승인 문서 HEAD `179b08d`의 일반 품질 CI와 찬양팀 저장 계약도 성공했다. 인증 E2E는 동일한 기존 storage-state 가드에서 중단됐으며 전체 CI 성공으로 보고하지 않는다. 후속 문서 정리는 앱 코드·의존성·워크플로를 바꾸지 않는다.

[PR #20](https://github.com/k10k10k10-git/woori-high-apps/pull/20)을 Draft로 만들었다. 첫 코드 `61c27e4`의 일반 CI(lint/typecheck/coverage/build/Lighthouse)와 실제 RTDB 계약 CI는 통과했다. 인증 E2E는 기존 비어 있는 Playwright storage-state를 검사하는 가드에서 중단되어 미실행이며 가드를 바꾸지 않았다. 최초 Preview는 Ready와 buildId 일치를 확인했지만 실제 API에서 아래 런타임 호환 문제를 발견해 SDK 보완 미리보기를 다시 확인한다.

SDK 보완 코드 `35fe9892c9499c4287cd5b2d6ac9c9956902bbe2`의 일반 CI와 실제 RTDB 계약 CI가 통과했다. Vercel Preview `dpl_GtD8FteqxEXANNX7vfuGBtS6j3gU`는 Ready와 buildId가 일치하고, 실제 비로그인 API도 JSON 401로 복구됐다. 서버 비밀 설정 전의 합성 Bearer 요청은 `server_not_configured` 503을 반환했으며 운영 인증 검증으로 간주하지 않는다.

사용자가 서버 설정을 승인했으므로 기존 DB에 서버 계정 연결 → PR 병합 → 통합 앱 운영 배포·버전 확인을 진행한다. 운영 DB 직접 쓰기, Rules 배포, 원본 입력 중지, 실제 기록 이관은 실행하지 않는다. 서버 설정 전 확인한 운영 `/api/version`은 `68f7bef3c2b2c8adb16ca5455cbf57f1d1442426`이었다. 후속 미리보기·CI·서버 설정·운영 배포 영수증은 로컬 `outputs/praise-integration-2026-09-06/`에 보존한다.


## Vercel 런타임 호환성 보완

첫 미리보기 `61c27e4`는 build/Ready와 버전 조회는 성공했지만, `/api/praise`의 실제 비로그인 GET이 500으로 실패했다. Vercel 런타임 로그는 `jwks-rsa`가 ESM 전용 `jose`를 CommonJS require로 로드하다 `ERR_REQUIRE_ESM`으로 중단됐음을 보여줬다. 로컬 Node24는 require(ESM)을 지원해 기존 유닛 테스트와 로컬 서버에서는 드러나지 않았다.

현재 의존성은 Firebase Admin **13.10.0**으로 정확히 고정했다. 공식 npm의 최신 13계열이며 실제 `jwks-rsa 3.2.2 / jose 4.15.9`로 CommonJS 로딩을 지원한다. 인증/역할 검사를 우회하거나 서버 키를 넣어 가리지 않았다. `node --no-experimental-require-module` 조건에서 실제 Admin/Auth/Database 로딩·초기화와 합성 RSA JWKS 공개키 변환을 확인했다. production 빌드를 시작해 비로그인 `/api/praise`가 JSON 401을 반환하는 `scripts/check-praise-runtime.mjs`를 CI에 추가했다. 이 검사는 인증정보를 보내거나 운영 DB에 쓰지 않는다.

13계열의 선택 Firestore 의존성에서 추가된 `google-gax@4 → uuid 11.1.1` 범위 한정 override도 적용했다. 실제 makeUUID 호출 확인, 인증/저장소 회귀 54개 통과, 운영 의존성 audit 0건이다. 개발 의존성 포함 15건은 그대로 남아 있다. 아래 UUID 최초 검토는 14.3.0을 평가했던 과정의 기록이며 현재 사용하는 SDK 버전이 아니다.

## 부록: 최초 Firebase Admin 14.3.0 선택 의존성 UUID 검토 (2026-09-06)

다음 내용은 SDK 호환성 보완 이전의 조사 기록이다.

찬양팀 서버는 firebase-admin 14.3.0의 app/auth/database 진입점만 사용한다. 이 세 진입점을 실제 Node 프로세스에서 로드한 모듈 그래프에 선택 의존성인 @google-cloud/storage·@google-cloud/firestore·uuid는 없었고, 인증 경로는 gaxios 7.3.1을 로드했다. 이는 현재 코드의 도달 경로 확인이며, 선택 패키지가 배포 산출물에 전혀 포함되지 않는다는 보장은 아니다.

설치되는 선택 Storage 7.22.0 트리에는 gaxios 6.7.1 및 teeny-request 9.0.0을 통해 uuid 9.0.1이 들어 있었다. 관련 production audit의 moderate 6건은 같은 UUID advisory와 그 상위 의존성 전파다. [공식 GHSA-w5hq-g745-h8pq](https://github.com/uuidjs/uuid/security/advisories/GHSA-w5hq-g745-h8pq)는 외부 출력 버퍼를 받는 v3/v5/v6의 경계 검사 누락을 설명한다. 이 트리의 실제 호출은 gaxios/build/src/gaxios.js:417과 teeny-request/build/src/index.js:135의 무인자 v4()뿐이므로 현재 찬양팀 기능에서 해당 취약 조건에 도달하는 경로는 확인되지 않았다.

경고를 남기지 않도록 highschool-app/package.json에 gaxios@6 → uuid 11.1.1, teeny-request@9 → uuid 11.1.1의 두 범위 한정 override를 적용했다. 11.1.1은 advisory의 수정 버전이며 npm 배포 메타데이터에 CommonJS require 진입점이 있다. Firebase Admin과 두 HTTP 라이브러리의 버전·호출 계약은 유지했다. Storage 최신 8.0.1도 gaxios 6 의존성을 유지하므로 무관한 major 업그레이드를 대신 적용하지 않았다. 전체 optional 생략은 Next SWC·sharp의 플랫폼 패키지까지 빠질 수 있어 사용하지 않았다.

검증 결과:

- npm install --ignore-scripts --no-fund: UUID 두 패키지 변경.
- npm audit --omit=dev: 정보·낮음·보통·높음·치명 모두 0건.
- gaxios와 teeny-request 각각의 실제 하위 UUID 해석이 11.1.1임을 확인.
- 두 라이브러리의 CommonJS v4 호출과 multipart 요청·boundary·본문을 127.0.0.1 합성 HTTP 서버에서 확인. 외부 서비스·운영 데이터 접근 없음.
- Firebase Admin 설정·폐기 토큰/역할 조회·workspace 저장소의 좁은 회귀 테스트 54개 통과.

설치 과정의 전체 audit에는 개발 의존성을 포함한 15건(낮음 2·보통 5·높음 8)이 남았다. 따라서 전체 의존성 취약점 0건으로 보고하지 않는다. 개발 도구 전체에 대한 일괄 자동 수정이나 Firebase Admin 10.3.0으로의 major downgrade는 수행하지 않았다. 향후 상위 라이브러리가 수정 UUID를 공식 의존하거나 UUID 호출을 제거하면 이 override를 제거하고 동일 호환성 검사를 반복한다.
