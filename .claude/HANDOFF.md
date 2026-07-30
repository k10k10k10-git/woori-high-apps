# 인수인계 — 2026-07-30 17:10 (에이전트 중립 — GPT/Codex/Claude 공용)

> **다음 실행자가 Codex/GPT일 수 있다.** Claude 전용 스킬(`/ship`·`/bugfix`·`/handoff` 등)은 Codex에 없으므로, 필요한 절차는 아래 "표준 검증 절차"에 명령어로 풀어 적었다.

## 지금 하던 일 (한 문장)

2026 여름수련회 피드백(설문 7건 + 행정팀 논의 + 실물 명찰카드 PDF)을 근거로 **이가드 사이트를 "스프레드시트 없이 큐싯 제작"까지 끌고 갈 리모델링 설계서를 완성**했고, 첫 실행 단계(PA)의 착수 승인을 기다리는 중이다.

## 완료된 것 (커밋 해시와 함께)

전부 `origin/main` 푸시·배포 확인 완료. **미푸시 커밋 없음.**

| 해시 | 내용 |
|---|---|
| `f743d05` | **이가드: 카톡 인앱 브라우저 무한 로딩 수정** — iOS 카톡에서 `location.href`에 **현재 주소를 재대입**해 리로드 루프가 나던 버그. `iguard-app/src/lib/inAppBrowser.ts` 신설(순수 로직), 회귀 테스트 10개 |
| `a76d7cf` | **이가드: 이름·초성·번호 전역 검색** — `src/lib/personIndex.ts`(순수) + `SearchOverlay.tsx`, 헤더 🔍 버튼. 테스트 23개 |
| `d8e94d6` | 학습 메모 → `LEARNINGS.md` "인앱 브라우저 무한 로딩의 정체" |
| `a5bee43` | 두 앱 CLAUDE.md 중복 서술 정리(기술스택표·디렉터리트리 제거) |
| `a05c15a` | iguard CLAUDE.md **패턴 26·27** 추가(인앱 탈출 불변식 · 전역 검색 규칙) |
| `c719274`→`a051d5a`→`4793a3a` | **`iguard-app/REMODEL_PLAN.md` 설계서** 작성 및 2회 개정 |

### 저장소·운영 배포 상태 (실측 2026-07-30 17:0x)

- `HEAD == origin/main == 4793a3af138d9c3190a615758455b32062206f14`
- iguard-app `/api/version` buildId = `4793a3a…` **대조 일치**
- retreat-app `/api/version` buildId = `4793a3a…` **대조 일치** (모노레포 push로 함께 재배포)
- **DB 직접 쓰기 0건 / Firebase Rules 변경·배포 0건**
- 미추적 항목 `.agents/`, `outputs/`, `rayquaza-v2-upgrade/`, `tmp/`는 과거 운영 산출물·도구 아티팩트다. **임의 커밋·삭제하지 않는다.**

## 미완인 것 — 정확한 다음 단계

전체 로드맵의 원천은 **`iguard-app/REMODEL_PLAN.md`** 다(495행). 아래는 그 중 바로 실행 가능한 것만 뽑은 것.

- [ ] **PA-1. 조별 정보에 학생 이름 표시 ← 여기부터 시작 (권장)**
  - 파일: `iguard-app/src/app/retreat/[id]/RoomsView.tsx`
  - 현재 결손: 방을 `const chip = { roomNumber: roomLabel(r), count: mine.length }`(56행 부근)로만 만들어 **학생 이름이 화면에 없다.** 이름이 나오는 건 `dayVisitors`(당일참석자)뿐.
  - 할 일: 방 칩에 해당 방 학생 이름을 펼친다. 이미 계산된 `mine`(그 방의 활성 학생 id 배열)과 `students[id]?.name`을 쓴다.
  - ⚠ 취소·당일참석 제외 판정을 **새로 만들지 말 것**. `isCancelledStudent`(`src/lib/busParticipation.ts`)와 이 파일의 `memberSet` 규칙 그대로.
  - 근거: 행정팀 논의 *"조별 정보에 애들 이름이 없다는 피드백이 있었던"*, 설문 ⑦ *"학생이 물어봐서 숙소를 찾아야 했는데 쉽게 찾기 힘들었음"*
  - 검증: 아래 표준 절차 전부 + **375px 뷰포트** 확인

- [ ] **PA-2. 개인 큐카드 "한눈에 보기"**
  - 파일: `iguard-app/src/app/retreat/[id]/ExecutionViews.tsx`, 참고 `src/lib/cueCardTimeline.ts`
  - 근거: 설문 ⑦ *"정리는 너무 잘 되어있지만 **급할 때는 결국 구글시트** 들어가서 보는 경우가 더 많았음"* / 설문 ④ *"전·후 일정을 보려 스크롤했으나 메인이 현재 일정으로 고정되어 어려웠다"*
  - **원인 가설(중요)**: 딜레이가 아니라 **전체가 한 화면에 스캔되지 않는 것**이 원인이다. 시트는 펼쳐져 있고 앱은 2단 sticky + 스크롤이다.
  - ⚠ 패턴 24(현재·다음 2단 sticky)와 패턴 17(시계 tick이 사용자 선택을 덮지 않음)을 깨지 말 것. `stickyLayout.test.ts`·`cueCardTimeline.test.ts`가 경계를 고정한다.

- [ ] **PA-3. 글자·버튼 크기 점검(375px)** — 설문 ⑦이 이 항목에 **최저점 2**를 줬다.

- [ ] **P0b. 명찰카드 인쇄 (부분)** — `REMODEL_PLAN.md` 3.5절. 실물은 `~/Downloads/26 여름 이가드 동선 최종.pdf`(10면).
  - 오늘 데이터로 가능: 본인 호차+동승(`buses`) / 식사 이동 순서(`meals`+`mealOrder.ts`) / 집회 이동 순서(`seating`)
  - 아직 불가: 담당 구역별 호실 명단(P1 필요) · GBS 장소(P4 필요) · 수찬·선교 학생(행정 협의 필요)
  - ⚠ `printAsPDF` HTML의 사용자 데이터는 **전부 `escapeHtml()`** (패턴 13)

- [ ] **P1 이후** — 동선 모델 확장 → 마이그레이션 → 파서 확장 → GBS → 큐싯 에디터 → 딜레이 대응. `REMODEL_PLAN.md` 6장.
  - ⚠ **P2(마이그레이션)는 운영 DB에 처음 쓰는 단계다.** 드라이런 건수 보고 → 사용자 승인 → 스냅샷 백업 → 수련회 1개씩 → 건수 대조 → 불일치 1건이라도 나오면 롤백.

- [ ] **행정 모달 a11y 보강 10개 파일** (직전 인수인계에서 이월, 미착수) — `GroupsTab`·`RoomsTab`·`TeachersTab`·`CarpoolTab`·`MedicalLogTab`·`NotesTab`·`SuppliesTab`·`CancellationTab`·`OnSiteRegistrationTab`(현장추가 모달)·`AutoAssignPreviewModal`. 기준 구현 `retreat-app/src/context/UIContext.tsx`. 현황 확인:
  ```bash
  cd retreat-app && for f in $(grep -rl 'fixed inset-0' src/); do grep -q 'role="dialog"' "$f" || echo "$f"; done
  ```

### 사용자가 직접 해야 하는 것 (코드 아님)

- [ ] **관찰 테스트** — 다음 큐싯 제작자가 정해지면 **설명 없이 30분** 현재 앱으로 큐싯 초안을 만들게 하고, 막힌 지점·질문 횟수·**"시트 열고 싶다"고 한 순간**을 기록. `REMODEL_PLAN.md` 9장. **P5를 기다리지 말고 최대한 빨리 하는 것이 이득.**
- [ ] **행정팀 협의 3건** — ①현장 정보 변동 반영(후발·선복귀·자차) ②학생 속성(수찬·선교팀 태그) ③"조스탭 불가" 필드. `REMODEL_PLAN.md` 8장. **합의 전 코드 작성 금지.**
- [ ] **아이폰 카톡 실기기 확인** — `f743d05`가 실제 카톡에서 외부 브라우저를 여는지. 무한 로딩 자체는 스킴 성공 여부와 무관하게 해소됐다.

## 미커밋 변경 (있다면 파일별 요약)

**없음.** 작업 트리는 `origin/main`과 동일하다(미추적 4개 디렉터리 제외).

## 막힌 것 / 사용자 답변 대기 중인 질문

1. **PA 착수 승인** — PA-1/2/3을 한 번에 낼지, 하나씩 낼지. 직전 제안은 **하나씩**(스탭이 개선을 자주 체감하는 것이 지금 중요).
2. **다음 큐싯 제작자가 정해졌는지** — 정해졌으면 관찰 테스트가 최우선.

## 이 작업의 함정 (이번 세션에서 배운 것)

### 도구·환경

- **이 맥에는 PDF CLI 도구가 없다** (`pdftotext`·`pdftoppm`·`mutool`·`qpdf` 미설치, PyObjC `Quartz`도 없음). PDF를 읽으려면: ①scratchpad에 venv 만들어 `pypdf`+`pillow` 설치 ②`PdfWriter`로 **낱장 PDF 분할** ③낱장마다 `sips -s format png -Z 1400 --out out.png split_NN.pdf`.
  - `sips`를 원본 PDF에 바로 쓰면 **1페이지만** 나온다.
  - `page.images` 추출은 이 파일에선 무의미(글리프 조각 수천 개로 쪼개져 있음).
- **구글시트는 gviz CSV로 읽는다**: `https://docs.google.com/spreadsheets/d/<ID>/gviz/tq?tqx=out:csv&gid=<GID>` 를 `curl -sL`. 탭 목록은 `/htmlview`를 받아 `grep -oE 'gid=[0-9]+' | sort -u`.
- **`WebFetch`에 "전문을 verbatim으로" 요청하면 인용 제한으로 거부된다.** 원문이 필요하면 `curl`로 파일에 받아 직접 읽을 것.
- **브라우저 자동화로 한글이 입력되지 않는다**(합성 키입력이 IME를 안 거침). React 입력을 채우려면:
  ```js
  const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;
  set.call(input, '값'); input.dispatchEvent(new Event('input',{bubbles:true}));
  ```
- **dev 서버 설정은 리포 루트 `.claude/launch.json`에 이미 있다**(`retreat-admin`·`iguard-app`·`semester-app`·`agent-os`). `iguard-app/.claude/launch.json`을 새로 만들지 말 것 — 이름을 못 찾는다.
- **로그인 벽 뒤 UI 검증**: `src/app/tmp-<이름>/page.tsx`에 목 데이터로 컴포넌트만 마운트하는 임시 라우트를 만들어 dev 서버에서 확인하고 **끝나면 삭제**한다(확인은 `npm run build` 라우트 목록 + `git status`). ⚠ 폴더명이 `_`로 시작하면 Next.js가 private folder로 보고 404를 낸다.

### 리포 관행

- **CLAUDE.md 파일에 내가 만들지 않은 미커밋 변경이 섞여 있을 수 있다.** 이번 세션 시작 시 두 앱 CLAUDE.md에 -253줄 삭제가 있었는데 직전 인수인계에는 "작업 트리 깨끗"으로 적혀 있었다. **커밋 시 `git add`에 경로를 명시**해 남의 변경을 쓸어담지 말 것.
- 코드 변경이 앱 CLAUDE.md "핵심 코드 패턴"과 관련되면 **같은 커밋에** 문서도 갱신한다(이번엔 위 사정으로 `a05c15a`로 분리됐다).

### 설계상 배운 것 (다시 발견하지 않도록)

- **앱의 경쟁자는 스프레드시트가 아니라 종이 명찰카드였다.** 스탭은 카드를 명찰에 달고 다녔고 앱은 2차 도구였다. "식사순서·자리배치를 현장에서 안 썼다"는 응답은 *필요 없어서*가 아니라 *이미 종이로 뽑아왔기 때문*이다.
- **`IguardMovement`의 괄호 상세(`박혜원sf(C동 3,4층)`)가 명찰카드 자동 생성의 핵심 키다.** 부수 필드처럼 보이지만 이것이 "담당 구역"이고, 방배정과 결합하면 카드의 개인 섹션이 자동 생성된다.
- **현재 `IguardMovement` 키는 `staffId__blockId`라 "한 스탭 한 블록 한 포스트"인데, 실측 22블록 중 7개(32%)에서 같은 스탭이 2개 이상 포스트를 맡는다.** 피드백의 "층장 교대가 안 보인다"가 이 모델 한계였다.
- **시트가 쉬운 이유는 자유 입력이 아니라 "0에서 시작하지 않는 것"이다.** 새 제작자는 지난 시트를 복사해 고친다. 앱에는 복제 기능이 **전혀 없어**(코드 확인) 매번 백지에서 시작한다. 복제 없이 개념만 늘리면 앱은 더 어려워진다.
- **행정 앱이 성공한 원인은 UI가 아니라 퇴로를 없앤 것이다** — "시트도 안 만들고 아예 사이트로만" 했다. 이행 시점을 미리 정하지 않으면 같은 실패가 반복된다.

## 표준 검증 절차 (Codex용 — 스킬 없이 그대로 실행)

```bash
cd /Users/sunghoon/Desktop/ai개발/iguard-app
npx tsc --noEmit          # 0 errors 필수
npm test                  # 전체 통과 필수 (현재 27파일 226개)
npm run lint              # 0 errors, 신규 경고 0 (기존 경고 10개가 baseline)
npm run build             # 필요 시
```

커밋·푸시 (커밋 메시지는 한국어 `영역: 요약` 형식, 기능 단위 1커밋):

```bash
cd /Users/sunghoon/Desktop/ai개발
git add <바꾼 파일 경로를 명시>   # 전체 add 금지 — 남의 미커밋 변경이 섞일 수 있음
git commit -F - <<'EOF'
이가드: <요약>

<본문>
EOF
git push origin main
```

배포 확인 (모노레포 push는 두 앱을 동시에 재배포한다):

```bash
git rev-parse HEAD
curl -s https://iguard-app.vercel.app/api/version
curl -s https://retreat-app-theta.vercel.app/api/version
# 두 buildId가 HEAD와 일치해야 배포 완료. 안 맞으면 아직 빌드 중.
cd iguard-app && npx vercel ls    # ● Ready 확인
```

## 검증 상태 (2026-07-30 17:10 실측)

- **tsc**: iguard-app 0 errors / retreat-app 0 errors
- **테스트**: iguard-app **27파일 226개 통과** (세션 시작 25파일 193개 → +33)
- **lint**: iguard-app 0 errors, 경고 10개(baseline 동일 — 신규 경고 없음)
- **배포**: 두 앱 모두 buildId `4793a3a…` = HEAD **일치**
- **DB**: 직접 쓰기 0건 / Rules 배포 0건
