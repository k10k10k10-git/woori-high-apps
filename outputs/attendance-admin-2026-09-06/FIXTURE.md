# 출석부 관리자 합성 화면 QA

이 fixture는 실제 `AdminWorkspace`, `/dashboard` 페이지, `/admin` 페이지, `AppProvider`, `FirebaseDataLoader`, `DataLoadGate`를 실행한다. 컴포넌트 원본은 수정하지 않는다. 실제 인증·Rules·운영 데이터 검증을 대체하지 않는다.

```bash
node outputs/attendance-admin-2026-09-06/start-fixture.mjs
```

저장소 루트에서 실행하며 `http://127.0.0.1:4178/dashboard?role=admin&state=populated`로 접속한다. 새 패키지 설치·Next 빌드·배포 없이 설치된 Vite를 사용한다. `tmp/attendance-admin-qa-20260906`에 실행용 복사본을 만들므로 fixture 원본 수정 후 서버를 다시 시작한다. 앱 원본의 변경은 Vite에서 반영한다.

| 주소 매개변수 | 동작 |
|---|---|
| `role=admin` | 합성 일반 관리자, 실제 관리자 권한 함수 허용 |
| `role=teacher` | 합성 교사, 실제 관리자 권한 함수 차단 |
| `role=demo` | admin 역할에 데모 표식을 추가한 보수적 접근 차단 확인 |
| `role=guest` | 운영 인증을 호출하지 않는 로그인 안내 |
| `state=populated` | 완료·부분 입력·미입력·전원 장결·빈 반, 교사·계정·이벤트·건의·시트 설정 |
| `state=empty` | 모든 읽기가 존재하지 않는 노드로 완료 |
| `state=loading` | 모든 읽기 응답 보류, 실제 지연 안내 확인 |
| `state=error&fault=attendance` | 선택 경로에서 합성 PERMISSION_DENIED |
| `fault=classes/events/userRoles/suggestions/teacherSpecial/teacherStaff/config/sheetSync/all` | 해당 실제 읽기 경로의 오류 확인. `/`는 URL에 그대로 사용 가능 |
| `delay=1500` | 읽기 지연 밀리초, 기본 180, 최대 10000 |
| `online=0` | 작업 공간의 오프라인 배너 |
| `chrome=0` | 화면 캡처용 QA 도구 숨김 |

계정·설정은 `/admin`, 전체 현황은 `/dashboard`로 접근한다. 옛 `/overall` 주소도 같은 전체 현황을 표시한다. URL·왼쪽 메뉴·실제 반별 링크는 mock Next 탐색을 통해 목적지와 반 선택을 보존한다. 출석 입력·학생 관리·반별 통계는 목적지 안내만 표시하므로 이 세 화면 자체의 QA 성공으로 보고하지 않는다.

오류 UI에서 QA 도구의 **오류 복구 준비**를 누른 뒤 실제 화면의 재시도 버튼을 누른다. 이 버튼은 DB를 변경하지 않고 이후 합성 읽기만 정상 응답으로 바꾼다. API로는 `window.__ATTENDANCE_ADMIN_QA__.recover()`이며 상태·계수는 `window.__ATTENDANCE_ADMIN_QA__.inspect()`로 확인한다. 데이터·역할 제어는 합성 페이지를 새로 열며 카운터를 초기화한다.

## 운영 서비스 차단

- `.env`를 읽지 않고 Firebase 프로젝트·자격정보를 설정하지 않는다. Vite 파일 공개에서도 `.env*`, `.auth`, `.vercel`, `.git`을 차단한다.
- 앱 `lib/db`, `lib/firebase/client`는 완전한 합성 모듈로 교체한다. Firebase SDK·Google 로그인·AppShell import는 모듈 해석 단계에서 거절한다. 실제 AppProvider는 인증 의존성이 없는 순수 상태 관리다.
- `get`/`onValue`는 메모리의 가상 데이터만 반환한다. 모든 `set`, `update`, `push`, `remove`, `runTransaction`, `onDisconnect` 쓰기는 호출 계수를 남기고 예외를 발생시킨다. 페이로드를 기록하거나 원장을 변경하지 않는다. 쓰기 버튼의 성공 흐름은 검증 범위가 아니다.
- 브라우저 fetch/XHR는 같은 출처의 GET/HEAD만 허용한다. WebSocket은 로컬 Vite 4178만 허용한다. beacon과 외부 탐색은 차단하며 CSP도 외부 연결·스크립트·폼 제출을 차단한다. 기존 confirm 대화상자는 취소한다. 실제 시트 읽기·다운로드 외부 요청은 허용되지 않는다.
- `http://127.0.0.1:4178/__qa__/proof.json`은 가로챈 경계와 거절한 모듈을 표시한다. 화면과 지연 패널을 연 뒤 `firebaseRuntimeModules: []`와 브라우저 계수의 `writes: []`, `blockedNetwork: []`를 확인한다. 차단 계수는 시도 흔적이며 운영 쓰기 성공 건수가 아니다.

이 산출물의 부팅·HTTP 확인과 브라우저에서 실제 렌더/키보드/반응형 검증은 별도로 기록한다. 서버가 켜졌다는 이유로 화면 검증 성공으로 기록하지 않는다.

2026-09-06 구현 확인: 포트 4178에서 서버를 시작하고 페이지 HTML과 실제 앱·fixture의 47개 재귀 모듈 요청을 확인했다. HTTP 실패 0건, Firebase SDK 모듈 0개, `lib/db`·Next 탐색·지연 로딩 경계 교체를 확인했다. 앱 테스트·빌드·배포와 브라우저 동작 검증은 이 fixture 제작 단계에서 실행하지 않았다.
