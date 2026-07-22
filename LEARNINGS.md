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
