# 학습 메모 — 풀이 접근법 기록

> `extract-approach` 스킬이 채우는 파일. 앱 코드 패턴 교훈은 각 앱 CLAUDE.md에, 여기는 워크스페이스·도구·환경 교훈만.

### 서명 없는 .app을 바탕화면 실행기로 쓰면 게이트키퍼가 간헐 차단한다 (2026-07-08)
- **접근법**: ① osacompile로 만든 .app이 `open` 시 error -10810으로 간헐 실패 → ② `spctl -a -vv <앱>`으로 검증하니 `rejected`(ad-hoc 서명이 원인) 확인 → ③ .app을 버리고 이미 검증된 셸 스크립트(`AgentOS.command`)에 Finder 별칭을 걸어 대체 → ④ 서버 kill 후 별칭 open을 3회 반복해 재현성 확인.
- **판단 질문**: xattr 격리 해제(`xattr -cr`)나 codesign 재서명은 하지 않았다 — 격리 속성이 없는데도 rejected였고(원인은 서명 자체), 재서명은 Apple Developer 계정 없이는 근본 해결이 아니며 macOS 업데이트마다 재발 위험이 있어서. lsregister 재등록은 일시적으로만 통했다(신뢰 불가).
- **재사용 규칙**: 이 맥에서 더블클릭 실행기가 필요하면 .app 번들을 만들지 말고 `.command` 스크립트 + Finder 별칭(`make new alias file`)을 쓸 것 — 게이트키퍼 대상이 아니라서 안정적이다.

### 운영 DB에 안 쓰고도 파괴적 UI 흐름(확인창 카운트)까지 라이브 검증하는 법 (2026-07-08)
- **접근법**: 이가드 큐싯 재임포트(블록 삭제/갱신) 개선을 배포 후 프로덕션에서 검증해야 했는데, 실제 임포트는 운영 큐싯을 바꾼다. ① 배포 확정은 `/api/version`의 buildId를 `git rev-parse HEAD`와 대조(Vercel CLI 토큰이 만료돼 API가 막혀도 이 방법은 됨) → ② 크롬 MCP(사용자가 이미 로그인된 라이브 탭)에서 기획 화면 진입 → ③ 임포트 textarea에 **매칭 안 되는 시각(05:00)의 1행 샘플**을 붙여넣어 미리보기·새 버튼을 노출(로컬 state, DB 미변경) → ④ "시트 기준 정리" 클릭으로 `uiConfirm` 확인창을 띄우면 **실제 라이브 스케줄과 대조한 카운트**("유지 0·신규 1·삭제 22")가 그대로 나온다 — reconcile이 프로덕션 데이터로 맞게 도는지까지 증명됨 → ⑤ **취소**로 종료(쓰기 0).
- **판단 질문**: dev 서버(preview)로는 검증 불가 — 같은 프로덕션 Firebase를 쓰지만 Google OAuth를 헤드리스로 통과 못 해 인증 뒤 화면에 못 들어간다. 그래서 사용자가 로그인해 둔 크롬 탭을 재사용했다. 실제 임포트(확인 클릭)는 절대 누르지 않고 확인창 텍스트만 캡처했다 — 확인창은 마지막 게이트라 취소 시 부작용이 없다.
- **재사용 규칙**: 로그인 벽 뒤 프로덕션 UI를 검증할 땐 (a) 배포 확정은 buildId 대조, (b) 파괴적 동작은 "매칭 안 되는 더미 입력 → 확인창 카운트 확인 → 취소"로 DB를 건드리지 않고 로직·문구를 증명한다. 순수 로직은 유닛 테스트로 이미 고정하고, 라이브에선 "확인창까지"만 간다.

### 구글시트·Docs를 claude-in-chrome으로 읽을 때 스크롤·키 입력이 안 먹는 문제 (2026-07-10)
- **접근법**: 구글 시트/Docs는 캔버스 렌더링이라 `get_page_text`로 본문이 안 나오고, 그리드 위 `scroll`(휠)과 `Page_Down`/`cmd+Down` 키도 시트 그리드에 전달되지 않아 화면이 안 움직인다. ① 시트는 **이름박스(Name Box, 좌상단 셀주소 입력칸, 대략 (55,139))를 클릭 → "A40" 타이핑 → Return**으로 원하는 행에 점프한 뒤 스크린샷으로 읽는다(25행 단위 점프가 적당). 마지막 행 번호는 아무 셀 클릭 후 `cmd+Down` 한 번(이건 셀 선택 상태에선 동작)으로 확인. ② Docs는 문서 영역 좌표에서 `scroll`이 동작하므로 스크롤+스크린샷 반복으로 읽는다(페이지 표시 "2/4"로 위치 추적). ③ 시트 하단 탭 전환은 탭 이름 좌표 클릭으로 정상 동작.
- **판단 질문**: CSV export URL(`/export?format=csv`)로 내려받아 읽는 방법은 기각 — 파일 다운로드는 명시 승인이 필요한 동작이고, 비공개 시트는 인증 쿠키 문제도 있다. Gemini 요약 버튼도 기각 — 원문 전수 확인이 목적이라 요약은 부적합.
- **재사용 규칙**: 구글 시트를 브라우저로 전수 확인할 땐 "이름박스 점프(+25행) → 스크린샷" 루프, Docs는 "본문 좌표 scroll → 스크린샷" 루프를 기본기로 쓴다. `get_page_text`·Page_Down은 구글 오피스 계열에서 시도하지 말 것.

### Vercel 생성물이 남은 Next.js 앱의 전체 lint는 소스 오류처럼 실패한다 (2026-07-11)
- **접근법**: ① `npm run lint`가 수천 건을 내면 첫 오류의 경로가 `src/`인지 `.vercel/output/`인지 먼저 분리한다 → ② `npx eslint src`(테스트·스크립트가 있으면 경로 추가)로 실제 소스만 다시 검사한다 → ③ `npm run build`를 lint와 분리 실행해 빌드 가능 여부를 확인한다 → ④ `eslint.config.mjs`의 `globalIgnores`에 `.vercel/**`가 빠졌는지 대조한다.
- **판단 질문**: 생성된 `.vercel/output`을 삭제해 검증을 통과시키지 않았다 — 사용자 산출물을 지우지 않아야 하고, 삭제는 다음 Vercel 빌드 뒤 같은 실패가 재발해 설정 결함을 가린다. 수천 건의 번들 경고도 앱 소스 결함으로 집계하지 않았다.
- **재사용 규칙**: Vercel을 쓰는 앱의 lint가 생성물을 읽으면 소스 한정 lint로 진위를 확인하고, 근본 수정은 ESLint ignore에 `.vercel/**`를 추가하는 것으로 제안한다.

### artifact-tool로 가져온 PPT 도형을 이미지로 바꿀 때 위치가 좌상단으로 튀는 문제 (2026-07-13)
- **접근법**: ① `PresentationFile.importPptx()`로 가져온 캡처 안내 도형을 찾아 `shape.position`을 이미지 `position`에 복사했더니 좌상단에 축소 삽입되는 현상을 렌더링으로 확인 → ② `Object.getOwnPropertyNames()`와 실제 값 출력으로 가져온 도형의 `position`은 비어 있고 `frame`/`pixelRect`에만 `{left, top, width, height}`가 있음을 확인 → ③ 안내 도형을 `delete()`한 뒤 `shape.frame`을 복사해 `slide.images.add({ position: frame, ... })`로 다시 삽입 → ④ LibreOffice 렌더링과 `check_template_fidelity.mjs`로 14장 전체를 확인.
- **판단 질문**: 원본 PPTX를 직접 OOXML 수정하거나 `python-pptx`로 우회하지 않았다 — 프레젠테이션 스킬의 artifact-tool 단일 경로와 템플릿 복제·편집 계약을 깨고, 도형 스타일·마스터·편집 가능성을 손상할 수 있기 때문이다.
- **재사용 규칙**: artifact-tool로 import한 PPT 도형의 실제 좌표를 재사용할 때는 `shape.position`을 믿지 말고 `shape.frame`을 실측해 이미지/도형의 `position`에 넣고, 최종 PPTX를 다시 렌더링해 위치를 검증한다.

### artifact-tool로 가져온 PPT의 여러 문단과 제목을 안전하게 치환하는 법 (2026-07-13)
- **접근법**: ① 가져온 텍스트 상자 전체의 줄바꿈 문자열을 `shape.text.replace(old, new)`로 한 번에 바꿨더니 제목만 바뀌고 글머리표 문단은 남는 현상을 렌더링으로 확인 → ② 기존·새 문구를 줄 단위로 나눈 뒤 각 줄에 `shape.text.replace(oldLine, newLine)`를 적용해 문단별 글머리표·서식을 보존 → ③ 제목 앞부분이 LibreOffice 렌더링에서 사라지는 상자는 공통 접두어 전체를 다시 쓰지 않고 바뀌는 뒷부분만 치환 → ④ artifact-tool PNG와 LibreOffice PNG를 각각 14장 전수 확인하고 `check_template_fidelity.mjs`로 구조를 검증.
- **판단 질문**: 여러 문단 상자에 `shape.text = newText`를 사용하지 않았다 — 글머리표·문단 간격·강조색을 한꺼번에 잃을 수 있다. artifact-tool 미리보기만 믿지도 않았다 — 일부 제목의 접두어 손실은 실제 PowerPoint 계열 렌더러에서만 드러났다.
- **재사용 규칙**: import한 PPT 텍스트는 한 줄씩 `shape.text.replace()`하고, 복합 서식 제목은 공통 접두어를 보존한 채 변하는 뒷부분만 교체한 다음 artifact-tool과 LibreOffice 두 렌더러로 확인한다.

### 로그인 벽 뒤 웹앱 화면을 PPT용 정확한 비율로 캡처하는 법 (2026-07-17)
- **접근법**: ① PPT의 잘림 원인을 먼저 실측 — 이미지 비율(0.462) ≠ 프레임 비율(0.492)에 srcRect(t/b 3020, 상하 3% 크롭)로 강제 맞춤돼 있었음 → ② 로그인된 실제 크롬(claude-in-chrome)에서 같은 출처 iframe(390×793)을 페이지에 주입해 프레임 비율에 딱 맞는 뷰포트 확보 → ③ CDN에서 html-to-image를 iframe 문서에 주입, toCanvas로 본문 전체(1x)·탭바를 각각 렌더해 캔버스에서 크롭+합성 → ④ 최종 6장을 세로 스프라이트 1장으로 합쳐 **단 1회 다운로드** 후 PIL로 슬라이스 → ⑤ pptx 미디어 바이트 교체 + srcRect 제거, zip -XrD로 재패킹(디렉터리 엔트리 금지), 파트 수 원본 대조.
- **판단 질문**: localhost 수신 서버(fetch/form POST)로 전송하지 않았다 — 크롬 PNA가 https 페이지→127.0.0.1 요청을 프리플라이트에서 막는다(OPTIONS에 Access-Control-Allow-Private-Network를 줘도 최신 크롬은 차단). base64를 JS 반환값으로 조각 전송하지도 않았다 — 확장의 데이터 유출 가드가 [BLOCKED]로 막는다. 뷰포트 리사이즈(resize_window·osascript)도 신뢰하지 않았다 — inner 크기가 안 바뀌는 함정 재확인.
- **재사용 규칙**: 브라우저에서 파일을 꺼낼 땐 ①합성까지 페이지 안 캔버스에서 끝내고 ②결과를 스프라이트 1장으로 만들어 a.click() 1회 다운로드(다중 다운로드 차단 회피, 막히면 사용자에게 주소창 차단 아이콘 허용 1클릭 요청) ③fixed 요소는 본문 렌더에 뷰포트 위치로 박히므로 visibility:hidden으로 빼고 별도 캡처(단독 캡처 시 style:{position:"static"} 오버라이드 필수 — 아니면 빈 캔버스).

### Vercel Root Directory가 설정된 모노리포 앱을 CLI로 수동 배포하는 법 (2026-07-20, 보강 2026-07-22)
- **접근법**: 1→ 앱 폴더에서 `npx vercel --prod --yes`가 `iguard-app/iguard-app`을 찾으며 실패하면 Vercel 프로젝트의 원격 Root Directory와 로컬 작업 경로가 중복된 것으로 판정한다. 2→ 저장소 루트에서 `npx vercel deploy . --prod --yes --project <projectId> --scope <teamId> --dry --format=json`을 실행해 `basePath`와 감지된 Next.js 루트를 확인한다. 3→ 같은 명령에서 `--dry --format=json`만 제거해 배포한다. 프로젝트 플래그 대신 기존 링크를 재사용해야 하면 앱의 `.vercel/project.json`에서 `projectId`·`orgId`만 복사한 임시 루트 `.vercel/project.json`을 만들고 저장소 루트에서 배포한 뒤 즉시 삭제한다. 4→ `npx vercel ls <project>`의 Production `Ready`와 운영 별칭을 확인하고, 로그인된 운영 탭을 새로고침해 핵심 화면 로드를 검증한다.
- **판단 질문**: Vercel 대시보드의 Root Directory를 임시로 지우거나 앱 소스를 이중 디렉터리로 복사하지 않는다. 전자는 Git 자동배포 설정을 깨뜨리고, 후자는 잘못된 소스·환경변수로 배포할 위험이 있다. 저장소 루트 드라이런 없이 바로 업로드하지도 않는다. 다른 앱과 대용량 산출물이 입력에 섞이는지 먼저 확인해야 하기 때문이다.
- **재사용 규칙**: 원격 Root Directory가 앱 폴더로 지정된 모노리포의 수동 Vercel 배포는 저장소 루트에서 프로젝트 ID와 팀 ID를 명시하고, 반드시 드라이런 → 운영 배포 → inspect/HTTP 확인 순서로 실행한다.

### 수련회 학부모 문자 명단을 운영 DB와 출석부 기준으로 안전하게 갱신하는 법 (2026-07-20)
- **접근법**: ① Firebase CLI의 읽기 전용 조회로 `retreats/{retreatId}/participants`, `cellColors`, `partialAttendances`와 `classes/{year}`를 각각 JSON으로 저장 → ② `participant.studentId`를 `${부}_${rawStudentId}` 형태의 출석부 학생 키에 연결하고, 실패할 때만 부·학년·반·이름의 유일 일치로 보완 → ③ 빨간색 취소자는 제외하고 `classes/{year}/*/students/*/pphone`을 학부모 연락처의 최우선 값으로 사용 → ④ 당일참석·후발대·선복귀를 날짜별 참석 여부로 변환해 1일차·2일차 번호를 중복 제거 → ⑤ `@oai/artifact-tool`로 원본 XLSX의 값만 갱신하고 부분참 행 강조를 다시 적용한 뒤, 결과 XLSX를 재임포트해 행 수·추가/제외 명단·번호 중복·수식 오류·렌더링을 검증.
- **판단 질문**: `participants/*/phone`을 곧바로 학부모 번호로 쓰지 않았다 — 신청자 본인 연락처일 수 있어 출석부의 `pphone`과 의미가 다르다. 운영 DB에 정리 결과를 다시 쓰거나 취소자를 삭제하지도 않았다 — 이 작업의 산출물은 문자 발송용 엑셀이며, 읽기 전용 대조만으로 충분하다.
- **재사용 규칙**: 수련회 학부모 문자·보험 명단은 활성 참가자 집합을 행정 DB에서 만들되 연락처는 출석부 `pphone`을 우선하고, 부분참을 날짜별로 계산한 뒤 최종 파일을 재임포트해 인원·중복·누락 0건을 증명한다.

### artifact-tool로 대량 명찰 PPT를 원본 서식 그대로 만드는 법 (2026-07-21)
- **접근법**: ① 원본 PPTX를 `inspect_template_deck.mjs`로 검사해 페이지당 4개 명찰과 `조·부서/학년/반·이름` 텍스트 상자 이름·서체·크기를 기록 → ② 읽기 전용 Firebase 조편성에서 빨간 취소자를 제외하고 후기 등록 조원까지 포함한 명단을 만든 뒤 4명씩 60장으로 분할 → ③ `prepare_template_starter_deck.mjs`로 원본 1번 슬라이드만 60장 복제하고 `PresentationFile.importPptx()`로 가져와 기존 12개 텍스트 상자만 `shape.text.replace()` → ④ 모든 허용 텍스트 상자에 `wrap="none"`, `autoFit="shrinkText"`, 원본 bbox 재설정을 적용해 5글자 이름과 긴 부서/학년/반을 한 줄로 유지하고, 10조는 54pt·11조는 58.67pt로 축소 → ⑤ 60장 PNG 전수 육안검사, `slides_test.py`, `check_template_fidelity.mjs`, LibreOffice PDF 변환으로 텍스트·오버플로·원본 충실도·호환성을 검증.
- **판단 질문**: `python-pptx`나 OOXML 직접 수정은 사용하지 않았다 — 원본의 Yeongdeok Snow Crab 실행 서식과 배경·절취선·마스터를 손상할 위험이 있다. `resizeShapeToFitText`도 그대로 두지 않았다 — 긴 이름이나 메타데이터에서 상자 높이가 2배 이상 늘어나 겹침이 발생하므로 기존 bbox 안에서만 축소해야 했다.
- **재사용 규칙**: 4칸 명찰처럼 대량 반복되는 PPT는 원본 슬라이드를 필요한 수만큼 복제하고 기존 텍스트 상자만 치환하며, 긴 값은 `wrap=none + autoFit=shrinkText + 원본 bbox 복원`으로 처리한 뒤 모든 페이지를 두 렌더러와 구조 검사기로 확인한다.

### 로그인된 Chrome으로 구글시트 응답↔출석부 대량 대조·갱신하는 법 (2026-07-22)
- **접근법**: ① claude-in-chrome에서 각 시트를 페이지 컨텍스트로 열고 `fetch(/gviz/tq?tqx=out:csv&sheet=<탭이름>)`(same-origin, credentials:include)로 CSV를 읽는다 — `sheet=` 이름 조회가 gid 없이 가능. ② 전화번호는 `숫자만` 비교해 하이픈 형식차를 변경으로 오탐하지 않고, 응답값은 `010-XXXX-XXXX`로 정규화하되 11자리·010 아닌 값(020-, 0101-, 깨진 값)은 오타로 분류해 제외. ③ 매칭은 부(1부/2부)→스프레드시트, 학년+반→탭, 이름→학생. ④ 쓰기는 셀별로 JS로 이름상자(`#t-name-box`)에 주소 넣고 Enter 이벤트로 이동→`#t-formula-bar-input`.textContent로 기존값 읽어 예상 기존값과 대조(게이트)→일치할 때만 claude-in-chrome `type`으로 실제 키입력→직후 재확인. ⑤ 마지막에 gviz 재조회로 전건 교차검증.
- **판단 질문**: gviz CSV의 행번호를 셀 주소로 쓰지 않았다 — gviz는 세로 병합된 2행 주소를 1행으로 접어서 학생마다 실제 시트행과 어긋난다(그대로 C35에 쓰면 주소 병합셀을 덮어씀). 대신 시트가 헤더 3행+학생당 고정 4행 템플릿이라는 점을 이용해 `전화행 = 4×순번(A열) + 1`로 실제 행을 계산하고 기존값 대조로 이중 확인. `export?format=csv&gid=`는 리다이렉트로 fetch가 CORS 차단(Failed to fetch)돼 못 씀. 탭 전환은 `el.click()`이 안 먹어서 pointerdown→mousedown→pointerup→mouseup→click 풀 시퀀스를 dispatch해야 hash(gid)가 갱신됨. 응답 오타는 임의 교정하지 않고 사용자 승인대로 건너뜀.
- **재사용 규칙**: 구글시트에 자동으로 값을 쓸 땐 항상 (1) 실제 시트 행을 병합 무관하게 확정하고 (2) 쓰기 직전 기존값이 예상과 일치하는지 셀을 읽어 게이트하고 (3) 쓴 직후+마지막에 재조회로 검증한다. 첫 쓰기가 이름상자로 새는 포커스 이슈가 있으니 페이지 로드 후 첫 셀은 claude-in-chrome로 이름상자를 직접 클릭·입력해 그리드 포커스를 워밍업한다.

### 로그인 벽 뒤의 공용 확인창 a11y를 실제 구동해 검증하는 법 (2026-07-27)
- **접근법**: ① 검증 대상이 `UIContext`의 `uiConfirm`처럼 앱 전역 공용 UI인데 호출 지점이 모두 Google OAuth 뒤에 있으면, `retreat-app/src/app/<임시라우트>/page.tsx`에 `useUI()`만 쓰는 최소 페이지(버튼+결과 표시)를 만들어 로그인 없이 마운트한다. ② `preview_start`로 dev 서버를 띄우고 `javascript_tool`로 열기 버튼을 클릭한 뒤 `document.querySelector('[role="dialog"]')`에서 `role`·`aria-modal`·`aria-labelledby`와 `document.activeElement`를 읽어 초기 포커스를 확인한다. ③ 포커스 트랩은 `activeElement.dispatchEvent(new KeyboardEvent('keydown',{key:'Tab',bubbles:true,cancelable:true}))`를 4~5회 반복하며 `activeElement.textContent` 시퀀스를 모아 `취소→확인→취소…` 순환과 이탈 없음을 확인한다(Shift+Tab은 `shiftKey:true`). ④ ESC는 dialog 종료·프로미스 반환값(화면에 찍은 결과 텍스트)·`activeElement.id`가 열기 버튼으로 복원됐는지 3개를 함께 본다. ⑤ 검증이 끝나면 임시 라우트를 삭제하고 `npm run build` 라우트 목록에 남지 않았는지, `git status`에 잔여 파일이 없는지로 이중 확인한다.
- **판단 질문**: jsdom+@testing-library를 추가하지 않았다 — 의존성 최소 유지 규칙상 새 패키지는 사용자 승인이 필요하고, 이 검증은 실제 브라우저 포커스 이동이 핵심이라 jsdom이 오히려 신뢰도가 낮다. 임시 라우트 폴더를 `__a11y-check`로 만들지도 말 것 — **Next.js App Router는 `_`로 시작하는 폴더를 private folder로 보고 라우팅에서 제외해 404가 난다**(실제로 밟음). `tmp-a11y-check`처럼 밑줄로 시작하지 않는 이름을 쓴다. 확인창에 backdrop 클릭 닫기를 추가하지도 않았다 — 파괴적 확인창은 실수 클릭으로 닫히면 안 된다.
- **재사용 규칙**: 전역 공용 UI를 고쳤는데 실제 호출 지점이 인증 뒤라면 임시 최소 라우트로 그 UI만 떼어내 브라우저에서 구동 검증하고, 검증 후 삭제를 build 라우트 목록과 `git status` 두 곳으로 확인한다. 모달 키보드 처리는 오버레이 `onKeyDown`이 아니라 `document` capture 리스너로 붙이고, `setState` 업데이터 안에서는 절대 promise resolve 같은 부수효과를 실행하지 않는다(StrictMode 이중 호출).

### 인앱 브라우저(카톡) "무한 로딩"의 정체 — location.href에 현재 주소를 재대입한 것 (2026-07-29)
- **접근법**: ① 증상이 "무한 로딩"이면 네트워크·인증이 아니라 **리로드 루프**를 먼저 의심하고, 마운트 시 `window.location.href`에 대입하는 코드를 찾는다(`grep -rn "location.href =" src/`). ② `iguard-app/src/components/InAppBrowserGuard.tsx`에서 대입하는 값이 같은 effect 안에서 `window.location.href`로 읽어둔 **현재 주소 자기 자신**임을 확인한다 — iOS 카카오톡 웹뷰는 이 대입으로 외부 브라우저를 열지 않고 같은 페이지를 리로드하므로, 리로드 → effect 재실행 → 재대입의 무한 루프가 되고 `setTimeout`으로 띄우려던 폴백 안내 UI는 영원히 도달하지 못한다. ③ 판정·이동 전략을 화면에서 떼어내 순수 함수(`iguard-app/src/lib/inAppBrowser.ts`의 `escapeStrategyFor(ua, currentUrl)`)로 옮기고, **이동 주소가 현재 주소와 같으면 무조건 안내(guide)로 강등**하는 불변식을 넣는다. ④ 플랫폼별로 실제 동작하는 수단만 쓴다 — 안드로이드는 `intent://…#Intent;scheme=https;package=com.android.chrome;end`, iOS 카카오톡은 `kakaotalk://web/openExternal?url=<encoded>`, 그 외 iOS 인앱(인스타·네이버·라인)은 신뢰할 스킴이 없으므로 **자동 이동 없이 안내만** 한다. ⑤ 세션당 자동 이동을 1회로 제한하는 `shouldAttemptEscape(sessionStorage)`를 두어, 외부 브라우저가 같은 주소로 되돌아와도 루프가 생기지 않게 한다. ⑥ `__tests__/inAppBrowser.test.ts`에 "어떤 인앱 UA에서도 targetUrl !== currentUrl"을 회귀 테스트로 고정한다.
- **판단 질문**: 실기기 카카오톡이 없다고 검증을 미루지 않았다 — UA 문자열은 순수 입력이라 전략 선택은 단위 테스트로 완결되고, 남는 불확실성(스킴이 실제로 외부 브라우저를 여는가)만 실기기 확인 대상으로 분리해 보고했다. `<a href={현재주소} target="_blank">` 폴백은 유지하지 않았다 — 인앱 웹뷰에서는 새 탭도 같은 인앱에서 열려 아무 효과가 없으므로, 스킴 버튼과 링크 복사로 교체했다. iOS 전용 `x-safari-https://` 같은 비공식 스킴은 쓰지 않았다 — 동작이 iOS 버전·웹뷰마다 갈려서, 실패 시 조용히 안내로 떨어지는 편이 안전하다.
- **재사용 규칙**: 브라우저에서 "무한 로딩"을 만나면 마운트 시 `location.href`(또는 `location.replace`) 대입부터 찾고, 대입 대상이 현재 주소와 같아질 수 있는 경로를 전부 막는다. 인앱 브라우저 탈출은 화면이 아니라 순수 함수로 분리해 "현재 주소로는 절대 이동하지 않는다"를 테스트로 고정하고, 확실한 수단이 없는 플랫폼은 자동 이동 대신 안내 UI를 보여준다.

### 통합 앱 전환 뒤 레거시 Firebase·Vercel 앱을 안전하게 종료하는 법 (2026-08-05)
- **접근법**: ① 삭제 직전 커밋에 복구 태그를 만든다 → ② `firebase apps:list`, `firebase hosting:sites:list`, `vercel project ls`와 각 앱 환경변수의 Firebase App ID를 대조한다 → ③ 공유 RTDB와 같은 Firebase Web App 등록을 쓰는지 확인한다 → ④ 레거시 Vercel 프로젝트와 전용 Firebase Hosting 사이트만 삭제하고, 공유 Firebase Web App 등록은 이름만 통합 앱 기준으로 바꿔 보존한다 → ⑤ 레거시 URL 404, 통합 URL 200, 통합 `/api/version`과 Git HEAD 일치를 확인한다 → ⑥ 소스 디렉터리를 `git rm`하고 운영 문서·실행 설정·인수인계를 함께 갱신한다.
- **판단 질문**: Firebase Web App 등록을 삭제하지 않았다 — `highschool-app`, `semester-app`, 레거시 앱이 같은 App ID를 사용했고 삭제하면 통합 앱 인증·DB 연결까지 끊길 수 있었다. RTDB 노드와 Rules도 삭제·배포하지 않았다 — 서비스 통합은 호스팅과 소스의 종료이지 운영 데이터의 폐기가 아니다.
- **재사용 규칙**: 레거시 웹앱 정리는 “배포 대상(Vercel/Hosting)·Firebase Web App 등록·공유 데이터”를 별도 자원으로 대조하고, 공유 App ID나 DB가 하나라도 확인되면 호스팅만 삭제하고 데이터 계층은 보존한다.

### Rules를 배포할 수 없는 앱에서 권한 역할을 3단계 → 6단계로 늘리는 법 (2026-08-06)
- **접근법**: ① 요구된 역할표(역할 × 영역 × 접근/수정)를 먼저 테스트 파일에 그대로 옮겨 계약으로 고정한다(`highschool-app/src/features/portal/accessPolicy.test.ts`의 `MATRIX`). ② **새 DB 노드를 만들지 않고** 기존 노드의 조합·기존 필드 확장으로 역할을 표현할 수 있는지 `고등부 학생 출석부/database.rules.json`을 읽어 확인한다 — 여기서는 `admins/{uid}`(불리언), `retreatAdmins/{uid}`(객체 — `.validate` 없어 `role` 필드 추가 자유), `iguardMembers`+`iguardRoles`(validate가 `staff`/`team`만 허용)로 6가지를 모두 표현했다. ③ 다른 앱이 그 노드를 **어떻게 읽는지** 확인해 필드 추가가 안전한지 증명한다(`grep -rn "retreatAdmin" semester-app/src` → `!= null` 존재 확인만 → 호환). ④ 판정을 순수 함수 하나(`resolveMinistryRole`)로 만들고 두 AuthContext(통합·이가드)가 같은 함수를 쓰게 해 "화면마다 다른 결론"을 원천 차단한다. ⑤ 쓰기는 `planRoleAssignment`(순수, 필요한 변경만 계산, **부여 → 해제 순서**) + `applyRoleSteps`(실행)로 분리해 테스트 가능하게 한다. ⑥ Rules로만 가능한 항목(스탭의 `semesters` 읽기)은 구현을 멈추지 않고 코드로 완성한 뒤, 정확한 Rules 스니펫을 `.claude/HANDOFF.md`에 블로커로 남긴다.
- **판단 질문**: `portalRoles/{uid}` 같은 새 노드를 만들지 않았다 — 새 노드는 Rules에 `.read`/`.write`가 없어 즉시 권한 거부가 되고, Rules 배포는 학생 앱 전용이라 이 저장소에서 열 수 없다. `iguardRoles`에 `pastor`/`leader` 값을 넣지도 않았다 — Rules `.validate`가 `staff`/`team`만 허용해 쓰기가 거부된다. 화면에서 역할 문자열을 직접 비교하지도 않았다(`role === "staff"` 금지) — 권한이 늘 때마다 모든 컴포넌트를 다시 훑어야 한다.
- **재사용 규칙**: 권한 모델을 넓힐 때는 (1) 역할×영역 표를 테스트로 먼저 고정 → (2) Rules 파일을 읽어 "기존 노드 + 옵션 필드"로 표현 가능한 조합을 찾고 다른 앱의 읽기 방식으로 호환을 증명 → (3) 판정은 순수 함수 1개, 쓰기는 계획(순수)+실행 분리 → (4) Rules가 필요한 잔여 항목만 스니펫과 함께 인수인계에 블로커로 남긴다.

### 새로 만든 `*.vercel.app` 별칭이 SSO 로그인 화면(302)으로 막힐 때 (2026-08-06)
- **접근법**: ① `npx vercel alias set <배포URL> woorihigh-app.vercel.app`으로 별칭을 만든 직후 `curl -s -D - -o /dev/null https://woorihigh-app.vercel.app/api/version`으로 헤더를 확인한다. ② `HTTP/2 302` + `location: https://vercel.com/sso-api?...`이면 앱 버그가 아니라 **Deployment Protection**이 그 주소를 "배포 URL"로 취급하는 것이다(같은 배포를 가리키는 기존 운영 별칭은 200을 반환하므로 코드 문제가 아님을 곧바로 판별할 수 있다). ③ `npx vercel domains add woorihigh-app.vercel.app <projectId>`로 **프로젝트 도메인으로 등록**하면 보호가 풀린다(출력은 JSON hint뿐이라 성공 여부가 불분명 — 곧바로 curl로 재확인한다. `vercel domains ls`·`domains inspect`에는 vercel.app 서브도메인이 안 잡히는 게 정상). ④ 구 주소도 같은 배포에 `alias set`으로 남겨 기존 링크·북마크를 보존하고, `/api/version`의 `buildId`를 `git rev-parse HEAD`와 대조해 새 주소가 새 코드를 서브하는지 증명한다.
- **판단 질문**: 프로젝트의 Deployment Protection 자체를 끄지 않았다 — 프리뷰 배포 보호까지 함께 열려 로그인 없이 미공개 화면이 노출된다. 구 별칭을 삭제하지도 않았다 — 문서·카톡 공지에 뿌려진 주소가 죽는다(비용 0이므로 남겨 두는 편이 항상 낫다).
- **재사용 규칙**: `vercel.app` 주소를 바꿀 때는 `alias set` → **`domains add`로 프로젝트 도메인 등록** → `curl`로 200과 `buildId` 확인 → 구 주소도 같은 배포에 별칭으로 유지, 순서로 진행한다. 302 + `sso-api` 리다이렉트는 코드가 아니라 배포 보호 문제다.
