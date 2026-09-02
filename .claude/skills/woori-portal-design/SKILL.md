---
name: woori-portal-design
description: 고등부 통합 사역 플랫폼(highschool-app)의 디자인 시스템. 이 저장소에서 화면·컴포넌트·CSS를 만들거나 고칠 때 사용한다. 토큰 값, 타입 스케일, 컴포넌트 클래스, 그리고 이 코드베이스에서 반복해서 사람을 넘어뜨린 함정을 담는다.
---

# 고등부 통합 플랫폼 디자인 시스템

**원천은 `highschool-app/src/app/globals.css`다.** 이 문서와 코드가 다르면 코드가 진실이다.
값을 옮겨 적을 때는 하드코딩하지 말고 **토큰 변수를 쓴다**.

## 먼저 읽을 것 — 이 코드베이스의 함정 5가지

실제로 사고가 났거나 이번 개발에서 시간을 잡아먹은 것들이다.

### 1. `.input`은 `@layer` 밖이라 Tailwind를 이긴다

`.input`은 `@layer` 없이 선언돼 있어 `w-*`, `text-*`, `min-h-*`, 패딩 유틸리티를 **전부 이긴다**.
좁은 칸에 `.input`을 쓰고 Tailwind로 크기를 줄이려 하면 조용히 무시된다.

- 폭을 줄이려면 → **감싼 div에 폭을 준다**
- 글꼴·패딩·높이를 바꾸려면 → **인라인 `style`로만** 가능
- 기본 좌우 패딩이 12px씩이라, 폭을 줄이면 콘텐츠 영역이 먼저 사라진다

같은 함정이 `.card`(패딩)에도 있다. globals.css 197행·557행 주석 참조.

### 2. 타입 스케일이 일반 웹보다 좁다

`text-base`가 15px다(일반 웹 16px). **`text-sm`(14px)과 `text-base`(15px)는 1px 차이**라,
"글자를 키운다"고 한 단계 올리면 거의 체감되지 않는다. 확실히 키우려면 `text-lg`(18px)로 간다.

실사용자에 50~60대 부장·교역자가 포함된다. 표 안이라고 `text-xs`(12px)로 낮추기 전에
그 화면을 누가 보는지 확인한다.

### 3. 다크 모드는 토큰 재정의 + 유틸리티 리매핑 — **임의값만 금지**

`[data-theme="dark"]`에서 토큰을 다시 정의하고, **추가로** Tailwind 유틸리티를 강제 치환한다.
리매핑은 `globals.css`가 아니라 **`theme-compat.css`** 에 있다:

```css
[data-theme="dark"] :where(.bg-white, .bg-slate-50, …) { background-color: … !important; }
[data-theme="dark"] :where(.bg-amber-50, .bg-yellow-100, .bg-orange-200, …) { background-color: #3a2d16 !important; }
```

> ⚠ 이 문서는 한때 "`bg-emerald-50`·`bg-amber-50`을 쓰면 다크에서 튄다"고 적고 있었다.
> **틀렸다** — `theme-compat.css`는 red·amber/yellow/orange·emerald/green/teal·blue/sky/indigo·
> violet/purple/pink 계열을 모두 리매핑한다(2026-09-02 실측). 팔레트 유틸리티는 안전하다.

**진짜 금지 대상은 임의값이다.** `bg-[#edf4ff]`처럼 hex를 화면에 직접 박으면
리매핑 대상이 아니라서 다크가 따라오지 못하고, `theme-compat.css`가 그 유틸리티를
이기려고 `!important`를 써야 한다(2026-09-02에 그렇게 쌓인 5개를 걷어냈다).

- 색은 **CSS에서 토큰으로** 정한다 → `globals.css`의 `--domain-*`류
- 화면은 **의미 클래스만** 붙인다 → `.home-domain-chip--semester`, `.ministry-area--retreat`
- 컴포넌트 규칙은 `globals.css`가 아니라 **`portal-surfaces.css`** 같은 표면 파일에
- `cssArchitecture.test.ts`의 **색 계약** 테스트가 TSX의 임의값 hex를 0건으로 강제한다

### 4. 모달은 세 가지가 한 세트다

`role="dialog"` + `aria-modal="true"` + ESC 닫기. 스크롤 잠금은 `[aria-modal="true"]`를 키로 잡으므로
`aria-modal`이 빠지면 **배경이 계속 스크롤된다**. 아이콘 버튼에는 `aria-label`, 토스트에는 `aria-live`.

### 5. 구독에는 반드시 에러 콜백

`onValue` 구독에 에러 콜백이 없으면 권한 오류 때 **무한 스피너**가 된다.
`useLoadErrors(scope)`로 받아 에러 배너에 배선한다. 로드 실패 경로가 없는 화면은 미완성이다.

---

## 색 토큰

**하드코딩 금지.** 아래는 값 확인용이며, 코드에서는 `var(--color-…)`를 쓴다.

| 역할 | 토큰 | 라이트 | 다크 |
|---|---|---|---|
| 주색(브랜드) | `--color-primary` | `#087a57` | `#44c99a` |
| 주색 hover | `--color-primary-hover` | `#066c4d` | `#58d5aa` |
| 보조 강조 | `--color-accent` | `#2563eb` | `#78a7ff` |
| 페이지 배경 | `--color-bg` | `#f5f7f6` | `#0d1210` |
| 표면(카드) | `--color-surface` | `#ffffff` | `#171d1a` |
| 표면 hover | `--color-surface-hover` | `#f8faf9` | `#1d2621` |
| 테두리 | `--color-border` | `#e3e9e6` | `#2b3731` |
| 본문 | `--color-text-primary` | `#18201d` | `#eef5f1` |
| 보조 텍스트 | `--color-text-secondary` | `#3f4c47` | `#c4d1ca` |
| 흐린 텍스트 | `--color-text-muted` | `#57665f` | `#9dada5` |
| 위험 | `--color-danger` | `#c84655` | `#ff8d9a` |
| 성공 | `--color-success` | `#087a57` | `#55d9a7` |
| 경고 | `--color-warning` | `#b97912` | `#f1bd65` |

**어두운 배경 위 전용**(헤더·랜딩): `--color-on-dark-primary` `#f8fafc`,
`--color-on-dark-accent` `#7de2bc`. **라이트 화면에 쓰면 안 된다** — 밝은 배경에서 대비가 무너진다.

베이스 뉴트럴은 순회색이 아니라 **초록 쪽으로 살짝 치우친 회색**이다(`#e3e9e6`, `#f5f7f6`).
주색이 딥그린이라 중립도 같은 방향으로 맞춰져 있다. 순수 `slate`를 섞으면 이 조율이 깨진다.

## 타입 스케일

| 토큰 | 값 | 쓰임 |
|---|---|---|
| `--text-xs` | 12px | 배지·메타. 표 안에서도 이 아래로 내리지 않는다 |
| `--text-sm` | 14px | 표 셀, 보조 설명 |
| `--text-base` | 15px | 본문 기본 |
| `--text-md` | 16px | 강조 본문 |
| `--text-lg` | 18px | 소제목, 표에서 가장 먼저 읽는 값 |
| `--text-xl` | 21px | 섹션 제목 |
| `--text-2xl` | 26px | **지표 숫자 전용** — 본문에 쓰지 않는다 |

굵기는 `--weight-normal` 400 / `--weight-medium` 500 / `--weight-semi` 600.
버튼만 650을 쓴다. **크기만으로 위계를 만들지 말고 굵기와 색을 함께 쓴다.**

## 간격·모양

4px 배수: `--space-1`~`--space-8` (4·8·12·16·20·24·32).
반경은 **네 단계만**: `--radius-sm` 7px, `--radius-md` 10px, `--radius-lg` 16px, `--radius-xl` 24px.
그림자도 `--shadow-xs/sm/md/lg` 네 단계이며 **다크에서 따로 재정의**된다(검정 불투명도를 올림).

## 컴포넌트 클래스

새로 만들기 전에 이 목록을 먼저 본다.

| 클래스 | 용도 |
|---|---|
| `.card` / `.card-body` | 카드. body는 `flex column` + `gap: 12px` |
| `.btn-primary` / `.btn-secondary` / `.btn-danger` / `.btn-sm` | 버튼. 최소 높이 40px |
| `.input` / `.form-control` | 입력. 최소 높이 **44px**(터치 타겟) |
| `.tag` + `.tag-green/blue/red/yellow/orange/purple/gray` | 상태 태그 |
| `.modal-backdrop` / `.modal-card` / `.overlay-shell` | 모달·오버레이 |
| `.page-container` / `.page-hero` / `.page-title` / `.section-heading` | 페이지 뼈대 |
| `.stat-value` / `.stat-label` / `.num` | 지표. `.num`은 `tabular-nums` |
| `.table-header` / `.retreat-roster-table` | 표 |
| `.workspace-tabs` / `.workspace-tab` | 탭 바 |

## 이 프로젝트의 취향

- **파스텔 계열 선호.** 상태 표시는 Tailwind `*-50`/`*-100` 배경 + `*-700` 텍스트.
  같은 의미의 자동/수동 표시는 같은 색을 쓴다.
- **모바일 375px에서 확인한다.** 현장(수련회·주일)에서 실제로 폰으로 쓴다.
  표는 `overflow-x-auto`로 감싸고 **페이지 본문은 절대 가로 스크롤되지 않게** 한다.
- **빈 상태·에러 상태를 함께 만든다.** 성공 화면만 있는 것은 미완성이다.
- 값이 잘릴 수 있는 좁은 칸은 **가장 긴 실제 값**(세 자리 숫자, 긴 반 이름)으로 확인한다.

## 확인 절차

화면을 만들었으면 `npx tsc --noEmit` → `npm test` → dev 서버에서 실제 구동까지 한다.
좁은 칸·표를 건드렸으면 잘림 여부를 **측정**한다(눈으로 보고 넘기지 않는다).

자세한 토큰 전량은 `references/DESIGN.md`.
