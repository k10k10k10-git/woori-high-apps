# 인수인계 — 2026-08-02 (에이전트 중립 · Codex 이어받기용)

> 다음 실행자는 **Codex**다. Claude 전용 스킬(`/ship`·`/bugfix`·`/handoff`)은 없으므로
> 필요한 절차는 이 문서의 "표준 절차"에 명령어로 풀어 적었다.

## 0. 읽는 순서

1. 루트 `AGENTS.md` → 2. 루트 `CLAUDE.md` → 3. **이 파일** → 4. 대상 앱의 `CLAUDE.md`·`AGENTS.md`
5. DB 경로를 만지면 `DB_OWNERSHIP.md` → 6. 배포는 `OPERATIONS.md` → 7. 도구 함정은 `LEARNINGS.md`

**모든 작업 첫 응답에 DB 안전 4문답을 먼저 쓴다.**
Firebase Rules는 `고등부 학생 출석부/database.rules.json` 외에서 배포하지 않는다.

⚠ **이 문서의 상태 기술을 그대로 믿지 말 것.** 시작할 때 `git status`, `git log -5`,
양 앱 `npx tsc --noEmit`을 **재실측**한다. 문서와 코드가 다르면 코드가 진실이다.

---

## 1. 현재 상태 (2026-08-02 실측)

```
HEAD = 0875996  ·  origin/main과 동일  ·  미푸시 0  ·  미커밋 0
iguard-app  /api/version = 0875996  ✅ 일치
retreat-app /api/version = 0875996  ✅ 일치
```

| | retreat-app | iguard-app |
|---|---|---|
| tsc | 0 errors | 0 errors |
| 테스트 | **32파일 272개** | **42파일 308개** |
| build | 성공 | 성공 |
| lint | 0 errors / 경고 1 | 0 errors / 경고 7 |

미추적 디렉터리 `.agents/` `outputs/` `rayquaza-v2-upgrade/` `tmp/`는 과거 산출물이다.
**임의 커밋·삭제 금지. `git add .` 금지 — 반드시 경로를 명시한다.**

---

## 2. 이번 세션에 한 일 (전부 배포 완료)

| 커밋 | 내용 |
|---|---|
| `f18fc70`~`80bc1c0` | **행정 리팩터링 A~F** (7커밋) |
| `9d56307` | 디자인 토큰 — 카드 링·표 밀도·고정폭 숫자 |
| `a4a3f33` | **QA 수정** — 에러 바운더리·404·저장 이중 제출 |
| `61acf64` | QA 인수인계 문서 |
| `f011ede` | 큐싯 특이사항 열 잘림 수정 |
| `0875996` | 이름 검색이 초성만 같은 사람까지 잡던 문제 수정 |

### A~F 리팩터링 (retreat-app만, iguard 무영향)

`assignmentBoard.ts`(조편성·방배정 공통 배정 계산), `rosterStats.ts`(반별 명단 집계) 신설.
미배정 산출식 12벌 중복 → 1벌. 테스트 28파일 237개 → 32파일 272개.

⚠ `roomsBoard.ts`가 없는 건 정상이다. B단계에서 만들고 D단계에서 `assignmentBoard.ts`로
**rename+통합**했다(`git show --stat 324311e`로 확인 가능).

### QA 수정 — 되돌리면 안 되는 의도적 결정 2개

⚠ **`error.tsx`의 "홈으로"는 일부러 `<a>` 하드 내비게이션이다.** `next/link`는 클라이언트
라우팅이라 깨진 React 트리·구독 상태를 그대로 들고 갈 수 있다. "다시 시도"(reset)가 소프트
복구를 담당하므로 "홈으로"는 새 문서를 받는 최후 수단이다.
`eslint-disable-next-line @next/next/no-html-link-for-pages`가 붙어 있으니 **lint 오류로 보고 고치지 말 것.**

⚠ **`useSubmitLock`은 ref 잠금을 state보다 먼저 검사한다.** `disabled` state만으로는 리렌더
전에 들어온 두 번째 클릭을 막지 못한다. 취소명단·카풀·교사 저장에 배선돼 있다.
회귀 테스트: `retreat-app/src/lib/useSubmitLock.test.ts`.

### 디자인 토큰 — Tailwind v4 함정

⚠ **레이어 밖 규칙이 `@layer utilities`를 이긴다.** 이 때문에 두 번 밟았다:
- `.card { border: none }`을 쓰면 `card border-l-4 border-yellow-400`(경고 콜아웃) 같은
  **의미 있는 강조 보더 9곳이 조용히 사라진다** → `border` 속성을 **아예 선언하지 않는다**.
- `.card`에 `padding`을 주면 패딩 0인 테이블 감싸개가 깨진다 → `--card-pad` 토큰과
  옵트인 `.card-body`로만 넓힌다.

⚠ **밀도 증가는 `@media (min-width: 641px)`에만 적용한다.** iguard 현장 화면은 375px에서
이미 튜닝돼 있어(AGENTS.md "375px 현장 화면") 일괄 확대하면 스크롤이 늘어 사용성이 떨어진다.

### 검색 — 완성형 vs 초성 (`personIndex.ts`)

| 입력 | 동작 |
|---|---|
| `김성훈` 완성형 | **그 이름만** (초성 폴백 미적용) |
| `김성ㅎ` 조합 중 | `koreanPatternIndexOf` — 완성형 자리는 글자 그대로, 자음 자리만 초성 |
| `ㄱㅅㅎ` 순수 초성 | `chosungKeys` 경로로 폭넓게 |

⚠ **`normalizeStaffIdentityName`의 NFKC가 호환 자모 `ㅁ`(U+3141)을 조합용 자모(U+1106)로
바꾼다.** 호환 자모 범위만 검사하면 정규화 후 자음을 놓쳐 `김현ㅁ`이 아무것도 못 찾는다.
`toCompatJamo()`가 두 범위를 통일한다. 회귀 테스트가 이 케이스를 잡아냈다.

### 큐싯 편집 화면 폭 (`IguardClient.tsx`)

⚠ **컨테이너 폭이 그룹별로 다르다** — `shellWidth` 변수. 기획은 `max-w-[1760px]`(PC 전용
5열 편집), 실행은 `max-w-6xl`(현장·모바일 밀도 튜닝 기준). **실행 폭을 넓히지 말 것** —
`mobileReadability.test.ts`가 지키는 375px 규칙이 깨진다.

---

## 3. 다음 실행자가 할 일 (우선순위)

### 🔴 사용자만 할 수 있는 것 — 에이전트는 OAuth를 통과 못 함

1. **로그인/로그아웃 실동작 확인** — 이번 QA에서 유일하게 검증 못 한 핵심 플로우
2. **A~F로 바뀐 3개 탭 확인** — 조편성(미배정 수·드래그·자동배정·취소자 제거),
   방배정(+자동 방배정 미리보기), 반별 명단(요약 카드 총원·남녀)
3. **취소명단 저장 시** 버튼이 "저장 중…"으로 바뀌고 비활성화되는지

### 🟠 이가드 리모델링 게이트 2개 — **통과 전 스프레드시트 폐기 금지**

1. **초보 큐싯 제작자 30분 무설명 관찰 테스트** (설계서 S5, 진짜 관문)
   - 설명 없이 30분, 블록 3개 이상을 구간·포스트까지 채우면 통과
   - 기록: 막힌 지점 / 질문 횟수 / **"시트를 열고 싶다"고 한 순간**
   - ⚠ 현재 기획 탭이 **17개**다. "탭이 너무 많아 어디부터 손대야 할지 모르겠다"가
     나오는지 특히 볼 것 — 나오면 축소가 답이다
2. **로그인 후 리허설** — 저장·동시편집·현장진행·인쇄·오프라인
   (`iguard-app/REMODEL_RELEASE_CHECKLIST.md` 4장)

### 🟡 결정 대기 1건

**`NEXT_PUBLIC_MAIN_ADMIN_EMAIL`이 클라이언트 번들에 평문 포함**(빌드 산출물 1개 파일에서
확인). 로그인 없이 JS에서 추출 가능하다. 실제 사용처는 인증 뒤 멤버 패널뿐이라
`NEXT_PUBLIC_`일 필요가 없지만, 서버 전용 env + API 경유로 바꾸는 구조 변경이라
**사용자 판단 대기 중**. 고치거나, 수용하고 백로그에 기록하거나.

### ⚪ 미검증으로 남은 QA 항목

- 나머지 13개 저장 화면의 이중 제출 (이번엔 레코드를 새로 만드는 3개만 고침)
- 느린 네트워크(3G) 실측
- 인증 뒤 화면의 긴 이름·데이터 없음·이미지 없음

### 행정↔이가드 협의 3건 (합의 전 코드 금지)

① 현장 정보 변동 반영(후발·선복귀·자차) — **이가드 사이트의 원래 존재 이유**
② 학생 속성(수찬·선교팀 태그) ③ "조스탭 불가" 필드

---

## 4. 설문 분석 결론 (n=7, 근거는 `iguard-app/REMODEL_PLAN.md`)

만족도 평균 **8.7**, **재사용 의사 4.9**(반대 0명) — **없애면 안 되고 고쳐서 계속**이 결론.

세부 점수는 4.0~4.3으로 낮다. 지지는 만장일치인데 실행이 못 따라간다는 뜻.

| 이탈 원인 축 | 지적 | 대응 | 검증 |
|---|---|---|---|
| A 탐색 실패 | 4/7명 | 전역 검색·조별정보 이름 | ⚠ **실사용 미검증** |
| B 변경 미반영 | 3/7명 | 큐싯 인앱 저작 | ⚠ 게이트 미통과 |
| C 급할 때 시트 | 1명(결정적) | 한눈에 보기 | ⚠ 미검증 |

**이 설문의 지적 대부분은 이미 코드로 대응됐지만, 대응이 통했는지는 아무도 확인 안 했다.**
다음 설문에 "지난번 대비 나아졌는지" 문항을 넣으면 개선 효과를 처음으로 측정할 수 있다.

---

## 5. 표준 절차 (Codex용 — 스킬 없이 그대로 실행)

```bash
# 검증 (앱별로)
cd /Users/sunghoon/Desktop/ai개발/iguard-app   # 또는 retreat-app
npx tsc --noEmit        # 0 errors 필수
npm test                # 전체 통과 필수
npm run lint            # 0 errors (경고는 기존 baseline)
npm run build
```

```bash
# 커밋 — 한국어 `영역: 요약` 형식, 기능 단위 1커밋
cd /Users/sunghoon/Desktop/ai개발
git add <바꾼 파일 경로 명시>     # git add . 금지
git commit -F - <<'EOF'
이가드: <요약>

<본문>
EOF
git push origin main              # ⚠ push = 두 앱 동시 운영 배포. 사용자 승인 후에만
```

```bash
# 배포 확인
git rev-parse HEAD
curl -s https://iguard-app.vercel.app/api/version
curl -s https://retreat-app-theta.vercel.app/api/version
cd iguard-app && npx vercel ls     # ● Ready
```

---

## 6. 도구·환경 함정 (다시 밟지 말 것)

- **로그인 벽 뒤 UI 검증**: `src/app/tmp-<이름>/page.tsx`에 목 데이터로 컴포넌트만 마운트하는
  임시 라우트를 만들어 dev 서버에서 확인하고 **끝나면 삭제**(확인은 `npm run build` 라우트
  목록 + `git status`). ⚠ 폴더명이 `_`로 시작하면 Next.js가 private folder로 보고 404.
- **CSS 변경은 눈으로 봐야 한다**: 문자열 치환으로 iguard에 블록을 복사했는데 앵커 섹션이
  없어 **치환이 조용히 무시**됐다. 빌드·테스트는 통과했고 화면을 보고서야 발견했다.
- **브라우저 자동화로 한글이 입력되지 않는다**(합성 키입력이 IME를 안 거침):
  ```js
  const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;
  set.call(input, '값'); input.dispatchEvent(new Event('input',{bubbles:true}));
  ```
- **dev 서버 설정은 리포 루트 `.claude/launch.json`에 있다**(`retreat-admin`·`iguard-app`·
  `semester-app`·`agent-os`). 앱 폴더에 새로 만들지 말 것.
- **PDF 도구 없음**(`pdftotext`·`pdftoppm` 미설치): venv에 `pypdf`+`pillow` → 낱장 분할 →
  `sips -s format png`. 원본에 `sips`를 바로 쓰면 1페이지만 나온다.
- **구글시트는 gviz CSV로 읽는다**: `/gviz/tq?tqx=out:csv&gid=<GID>`를 `curl -sL`.
  `WebFetch`에 전문을 요청하면 인용 제한으로 거부되니 파일로 받아 직접 읽을 것.
- **다른 세션이 만든 미커밋 변경이 섞여 있을 수 있다.** 커밋 시 경로를 명시해 남의 변경을
  쓸어담지 말 것(이번 세션에 실제로 두 CLAUDE.md에 -253줄 외부 변경이 있었다).

---

## 7. 막힌 것 / 사용자 답변 대기

1. `NEXT_PUBLIC_MAIN_ADMIN_EMAIL` 노출 — 고칠지 수용할지 (3장 참조)
2. 다음 큐싯 제작자가 정해졌는지 — 정해지면 관찰 테스트가 최우선
