# 마이페이지 합성 브라우저 QA

이 fixture는 `highschool-app/src/features/portal/MyPageModal.tsx`와 실제 하위 패널, 권한 정책, 파생 훅을 import한다. 운영 Next.js 라우트나 인증 가드에는 우회를 추가하지 않는다. 합성 이름과 `.invalid` 이메일만 사용한다.

## 실행

저장소 루트에서 앱의 기존 `node_modules`를 준비한 뒤 실행한다. 추가 설치와 환경변수 파일은 필요하지 않다.

```bash
node outputs/linear-mypage-2026-09-05/start-fixture.mjs
```

주소: `http://127.0.0.1:4178/?role=admin&state=populated`

| 매개변수 | 값 | 용도 |
|---|---|---|
| `role` | `admin`, `staff`, `barnabas`, `none` | 관리자, 현장 스탭, 바나바팀, 권한 없음 |
| `state` | `populated`, `empty`, `loading`, `error`, `offline` | 정상 합성 데이터, 빈 결과, 첫 응답 대기, 구독 오류, 연결 끊김 |
| `theme` | `light`, `dark` | 앱의 실제 `data-theme` 토큰 적용 |
| `tab` | `dashboard`, `ministry`, `myRequests`, `team`, `requests` | 모달 최초 메뉴; 권한 가드 검증 가능 |
| `longName` | `1` | 긴 표시 이름의 작은 화면 줄바꿈 검증 |

앱 소스·CSS 변경은 Vite에서 다시 로드된다. 위 재생성 파일 자체를 수정하면 서버를 다시 시작한다. 런타임과 빌드 중간물은 `tmp/mypage-qa-20260905/`에만 만들어진다.

## 실제 서비스 차단

- Vite가 `AuthContext`, `UIContext` 및 행정·현장·학기·주일·건의사항 DB 모듈을 `mocks.tsx`로 교체한다. 인증 API를 호출하지 않는다.
- `firebase/*`, `@firebase/*`, 앱 Firebase 초기화 모듈을 추가로 import하면 빌드/서버가 실패한다. 새 서비스 의존성을 모르게 운영에 연결하는 fallback은 없다.
- 모든 노출 쓰기 함수는 `QA 쓰기 차단` 오류를 던지고 `blockedWrites`에 함수 이름만 기록한다. 가상 확인창은 항상 취소한다.
- HTML CSP가 외부 연결과 외부 이미지/스크립트를 차단한다. localhost Vite 및 HMR만 허용한다.
- `GET /__qa__/proof.json`에서 실제 Vite 모듈 그래프의 Firebase 런타임 모듈 목록과 적용된 경계를 확인한다. `window.__MY_PAGE_QA__`에는 합성 구독/해제와 차단된 쓰기 기록이 남는다. 이 기록은 실제 사용자 인증 성공이나 운영 DB 검증을 뜻하지 않는다.

## 브라우저 확인 항목

- 1440px 데스크톱, 375px 모바일, 다크 테마에서 가로 넘침·텍스트 겹침·닫기 버튼 접근성을 확인한다.
- 관리자는 5개 메뉴, 일반 역할은 3개 메뉴를 사용한다. 일반 역할에 `tab=team`·`tab=requests`를 주어도 관리 화면이 열리지 않아야 한다.
- 최초 로딩·오류·빈 목록이 서로 구분되고 오류를 성공 통계로 오인하지 않아야 한다.
- 탭 전환과 실제 데이터 파생, 팀원 검색, 내 요청/운영 요청 목록을 확인한다. 관리 버튼은 합성 서비스에서도 쓰기가 차단된다.
- ESC로 닫기, 열기 버튼으로 다시 진입, 키보드 탭 순환과 메뉴 선택을 확인한다.
- 위 항목의 실제 브라우저 실행 결과는 별도 QA 기록에 남긴다. 이 문서의 목록 자체는 통과 증거가 아니다.

## 번들 검증

```bash
node outputs/linear-mypage-2026-09-05/start-fixture.mjs --build
```

초기 fixture 번들 검증에서 4,592개 모듈이 변환됐고 7개 경계(Auth/UI+DB 5개)가 적용됐다. SDK import 차단에 걸린 모듈은 없었다. 실제 패널의 `React.lazy`와 `Suspense`는 별도로 대체하지 않으며 Vite의 실제 동적 청크로 로드한다. 앱 전용 `my-page-workspace.css`도 가져온다. 이후 앱 변경을 반영한 최종 검증 결과를 배포 기록과 구분해 기록한다.
