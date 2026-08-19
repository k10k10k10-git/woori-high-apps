# 토큰 전량 (globals.css 발췌)

**이 파일은 `highschool-app/src/app/globals.css`에서 뽑은 것이다. 코드가 바뀌면 여기도 갱신한다.**

## 라이트 (`:root`)

```css
--color-primary:         #087a57;
--color-primary-hover:   #066c4d;
--color-primary-active:  #055c42;
--color-primary-light:   #9ce8cc;
--color-primary-disabled:#9fc8ba;
--color-primary-glow:    rgba(8, 122, 87, 0.15);
--color-primary-ring:    rgba(8, 122, 87, 0.22);
--color-badge-bg:        rgba(8, 122, 87, 0.09);
--color-badge-border:    rgba(8, 122, 87, 0.20);
--color-accent:          #2563eb;
--color-accent-soft:     #edf4ff;
--color-header-bg:       #17191c;
--color-screen-bg:       #101214;
--color-bg:              #f5f7f6;
--color-surface:         #ffffff;
--color-surface-hover:   #f8faf9;
--color-border:          #e3e9e6;
--color-border-hover:    #c8d2cd;
--color-text-primary:    #18201d;
--color-text-secondary:  #3f4c47;
--color-text-muted:      #57665f;
--color-text-faint:      #697770;
--color-on-dark-primary:   #f8fafc;
--color-on-dark-secondary: #cbd5d0;
--color-on-dark-muted:     #a9b7b0;
--color-on-dark-accent:    #7de2bc;
--color-danger:          #c84655;
--color-danger-bg:       #fff0f2;
--color-danger-border:   #f4b9c0;
--color-success:         #087a57;
--color-success-bg:      #e8f8f2;
--color-warning:         #b97912;
--color-warning-bg:      #fff6df;
--text-xs:   12px;
--text-sm:   14px;
--text-base: 15px;
--text-md:   16px;
--text-lg:   18px;
--text-xl:   21px;
--text-2xl:  26px;   /* 지표 숫자 전용 — 본문과 확실히 다른 층 */
--weight-normal:  400;
--weight-medium:  500;
--weight-semi:    600;
--space-1: 4px;
--space-2: 8px;
--space-3: 12px;
--space-4: 16px;
--space-5: 20px;
--space-6: 24px;
--space-8: 32px;
--card-pad:     var(--space-4);
--card-gap:     var(--space-3);
--table-cell-y: 10px;
--shadow-xs:  0 1px 2px rgba(18,28,24,0.035);
--shadow-sm:  0 1px 3px rgba(18,28,24,0.055), 0 1px 2px rgba(18,28,24,0.025);
--shadow-md:  0 10px 26px rgba(18,28,24,0.075), 0 2px 6px rgba(18,28,24,0.035);
--shadow-lg:  0 22px 54px rgba(18,28,24,0.12), 0 5px 14px rgba(18,28,24,0.045);
--shadow-primary: 0 4px 14px var(--color-primary-glow);
--radius-sm:  7px;
--radius-md:  10px;
--radius-lg:  16px;
--radius-xl:  24px;
--ease-out:   cubic-bezier(0.16, 1, 0.3, 1);
--ease-in:    cubic-bezier(0.4, 0, 1, 1);
--duration-fast:   120ms;
--duration-normal: 200ms;
```

## 다크 (`[data-theme="dark"]`) — 재정의되는 것만

```css
--color-primary:          #44c99a;
--color-primary-hover:    #58d5aa;
--color-primary-active:   #32b889;
--color-primary-light:    #1b4a3a;
--color-primary-disabled: #315f50;
--color-primary-glow:     rgba(68, 201, 154, 0.17);
--color-primary-ring:     rgba(68, 201, 154, 0.30);
--color-badge-bg:         rgba(68, 201, 154, 0.12);
--color-badge-border:     rgba(68, 201, 154, 0.25);
--color-accent:           #78a7ff;
--color-accent-soft:      #172845;
--color-header-bg:        #090c0b;
--color-screen-bg:        #080a09;
--color-bg:               #0d1210;
--color-surface:          #171d1a;
--color-surface-hover:    #1d2621;
--color-border:           #2b3731;
--color-border-hover:     #46574e;
--color-text-primary:     #eef5f1;
--color-text-secondary:   #c4d1ca;
--color-text-muted:       #9dadA5;
--color-text-faint:       #82938a;
--color-danger:           #ff8d9a;
--color-danger-bg:        #3b1c22;
--color-danger-border:    #77313d;
--color-success:          #55d9a7;
--color-success-bg:       #12382c;
--color-warning:          #f1bd65;
--color-warning-bg:       #3b2c13;
--shadow-xs: 0 1px 2px rgba(0,0,0,.22);
--shadow-sm: 0 1px 3px rgba(0,0,0,.30), 0 1px 2px rgba(0,0,0,.18);
--shadow-md: 0 12px 30px rgba(0,0,0,.34), 0 2px 7px rgba(0,0,0,.2);
--shadow-lg: 0 24px 58px rgba(0,0,0,.48), 0 6px 16px rgba(0,0,0,.26);
```

## 다크에서 강제 치환되는 Tailwind 유틸리티

이 목록에 없는 색 유틸리티는 다크에서 그대로 남는다.

```css
[data-theme="dark"] :where(.bg-white, .bg-white\/95, .bg-white\/90, .bg-white\/80, .bg-white\/70) {
[data-theme="dark"] :where(.bg-slate-50, .bg-slate-50\/95, .bg-slate-50\/80, .bg-slate-50\/70, .bg-slate-50\/60, .bg-slate-50\/50, .bg-slate-50\/40) {
[data-theme="dark"] :where(.bg-slate-100, .bg-slate-100\/80) { background-color: #202923 !important; }
[data-theme="dark"] :where(.bg-slate-200, .bg-slate-200\/60) { background-color: #303c35 !important; }
[data-theme="dark"] :where(.text-slate-950, .text-slate-900, .text-slate-800) { color: var(--color-text-primary) !important; }
[data-theme="dark"] :where(.text-slate-700, .text-slate-600) { color: var(--color-text-secondary) !important; }
[data-theme="dark"] :where(.text-slate-500) { color: var(--color-text-muted) !important; }
[data-theme="dark"] :where(.text-slate-400, .text-slate-300) { color: var(--color-text-faint) !important; }
[data-theme="dark"] :where(.border-slate-50, .border-slate-100, .border-slate-200, .border-slate-300, .border-slate-400) { border-color: var(--color-border) !important; }
[data-theme="dark"] :where(.divide-slate-100) > :not(:last-child) { border-color: var(--color-border) !important; }
[data-theme="dark"] :where(.placeholder\:text-slate-300, .placeholder\:text-slate-400, .placeholder\:text-slate-500)::placeholder { color: var(--color-text-faint) !important; }
[data-theme="dark"] :where(.bg-red-50, .bg-red-50\/30, .bg-red-100) { background-color: #3a1c22 !important; }
[data-theme="dark"] :where(.bg-amber-50, .bg-amber-50\/40, .bg-amber-100, .bg-yellow-50, .bg-yellow-50\/40, .bg-yellow-100, .bg-yellow-100\/60, .bg-orange-50, .bg-orange-50\/40, .bg-orange-50\/60, .bg-orange-100, .bg-orange-100\/60) { background-color: #3a2d16 !important; }
[data-theme="dark"] :where(.bg-emerald-50, .bg-emerald-50\/70, .bg-emerald-50\/60, .bg-emerald-50\/50, .bg-emerald-50\/40, .bg-emerald-100, .bg-green-50, .bg-green-50\/60, .bg-green-50\/40, .bg-green-100, .bg-teal-50, .bg-teal-50\/40, .bg-teal-100) { background-color: #14372c !important; }
[data-theme="dark"] :where(.bg-blue-50, .bg-blue-50\/40, .bg-blue-50\/20, .bg-blue-100, .bg-sky-50, .bg-sky-50\/95, .bg-sky-100, .bg-indigo-50, .bg-indigo-50\/40, .bg-indigo-100) { background-color: #172b43 !important; }
[data-theme="dark"] :where(.bg-violet-50, .bg-violet-50\/90, .bg-violet-50\/40, .bg-violet-100, .bg-purple-50, .bg-purple-50\/50, .bg-purple-50\/30, .bg-purple-100, .bg-pink-50, .bg-pink-100) { background-color: #2b2240 !important; }
[data-theme="dark"] :where(.text-red-900, .text-red-800, .text-red-700, .text-red-600, .text-red-500) { color: #ff9aa6 !important; }
```
