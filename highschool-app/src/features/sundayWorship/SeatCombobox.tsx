"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";

/**
 * 자리 배치 표에서 반을 고르는 입력.
 *
 * 원래는 `<select>` 하나였는데 한 부의 반이 수십 개라 목록을 끝까지 끌어내려야 했다.
 * 타이핑으로 좁히고 Enter로 넣을 수 있게 콤보박스로 바꾼다.
 *
 * 목록은 `position: fixed`로 띄운다. 표가 `overflow-x-auto` 안에 있어 그냥 절대 배치하면
 * 목록이 칸 밖에서 잘린다. fixed는 overflow 클리핑을 벗어난다(조상에 transform이 없을 때).
 */

/** "15"로도 "1-5"를 찾게 한다 — 반 이름의 하이픈을 매번 치게 하면 타이핑의 이점이 없다. */
function normalize(value: string): string {
  return value.toLowerCase().replace(/[\s-]/g, "");
}

type Props = {
  /** 고를 수 있는 키 목록. 이미 배치된 반은 호출부에서 빼고 넘긴다. */
  options: string[];
  labelOf: (key: string) => string;
  onPick: (key: string) => void;
  disabled?: boolean;
  ariaLabel: string;
};

const LIST_MAX_HEIGHT = 224;

export default function SeatCombobox({ options, labelOf, onPick, disabled, ariaLabel }: Props) {
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [rect, setRect] = useState<{ left: number; top: number; width: number; drop: "down" | "up" } | null>(null);

  const matches = query.trim()
    ? options.filter((key) => normalize(labelOf(key)).includes(normalize(query)))
    : options;

  // 목록을 입력칸에 붙여 띄운다. 아래 공간이 모자라면 위로 펼친다 — 표 아래쪽 분단에서
  // 아래로만 열면 목록이 화면 밖으로 나간다.
  const place = useCallback(() => {
    const box = inputRef.current?.getBoundingClientRect();
    if (!box) return;
    const below = window.innerHeight - box.bottom;
    const drop: "down" | "up" = below < LIST_MAX_HEIGHT && box.top > below ? "up" : "down";
    setRect({
      left: box.left,
      top: drop === "down" ? box.bottom + 4 : box.top - 4,
      width: box.width,
      drop,
    });
  }, []);

  // 표를 가로로 밀거나 페이지를 스크롤하면 목록만 제자리에 남는다 — 따라다니게 한다.
  // 여는 순간의 위치는 effect가 아니라 여는 핸들러에서 잡는다(렌더 연쇄를 만들지 않는다).
  useEffect(() => {
    if (!open) return;
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [open, place]);

  // 글자를 지우면 목록이 다시 길어진다. 활성 위치를 state로 붙들면 범위를 벗어나므로
  // 저장은 그대로 두고 쓸 때만 현재 목록 길이로 잘라 쓴다.
  const active = matches.length === 0 ? 0 : Math.min(activeIndex, matches.length - 1);

  // 키보드로 내려간 항목이 스크롤 밖이면 따라 내려간다.
  useEffect(() => {
    if (!open) return;
    listRef.current?.children[active]?.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  const openList = () => {
    place();
    setOpen(true);
  };

  const close = () => {
    setOpen(false);
    setQuery("");
    setActiveIndex(0);
  };

  const pick = (key: string) => {
    onPick(key);
    close();
    // 한 분단에 여러 반을 연달아 넣는 일이 잦다 — 포커스를 남겨 바로 다음을 치게 한다.
    inputRef.current?.focus();
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!open) {
        openList();
        return;
      }
      if (matches.length === 0) return;
      const step = event.key === "ArrowDown" ? 1 : -1;
      setActiveIndex((active + step + matches.length) % matches.length);
      return;
    }
    if (event.key === "Enter") {
      if (!open || matches.length === 0) return;
      event.preventDefault();
      pick(matches[active]);
      return;
    }
    if (event.key === "Escape") {
      if (!open) return;
      // 표 전체가 모달 안일 수 있다 — 목록만 닫고 바깥 ESC 처리로 넘기지 않는다.
      event.preventDefault();
      event.stopPropagation();
      close();
    }
  };

  return (
    <div className="relative w-full">
      <input
        ref={inputRef}
        type="text"
        role="combobox"
        aria-label={ariaLabel}
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open && matches.length > 0 ? `${listId}-${active}` : undefined}
        autoComplete="off"
        placeholder="반 추가…"
        disabled={disabled}
        value={query}
        /* `.input`은 @layer 밖이라 Tailwind 글꼴·여백 유틸리티를 이긴다. 인라인으로 준다. */
        className="input"
        style={{ fontSize: 12, paddingLeft: 8, paddingRight: 8 }}
        onChange={(event) => {
          setQuery(event.target.value);
          setActiveIndex(0);
          openList();
        }}
        onFocus={openList}
        onClick={openList}
        /* 목록 항목을 누르는 중에는 닫지 않는다 — mousedown에서 이미 선택이 끝난다. */
        onBlur={(event) => {
          if (listRef.current?.contains(event.relatedTarget as Node)) return;
          close();
        }}
        onKeyDown={onKeyDown}
      />
      {open && rect && (
        <ul
          ref={listRef}
          id={listId}
          role="listbox"
          aria-label={ariaLabel}
          className="fixed z-50 overflow-y-auto rounded-xl border border-slate-200 bg-white py-1 shadow-lg"
          style={{
            left: rect.left,
            width: Math.max(rect.width, 128),
            maxHeight: LIST_MAX_HEIGHT,
            ...(rect.drop === "down"
              ? { top: rect.top }
              : { top: "auto", bottom: window.innerHeight - rect.top }),
          }}
        >
          {matches.length === 0 && (
            <li className="px-3 py-2 text-xs text-slate-400">{options.length === 0 ? "남은 반이 없습니다" : "일치하는 반이 없습니다"}</li>
          )}
          {matches.map((key, index) => (
            <li
              key={key}
              id={`${listId}-${index}`}
              role="option"
              aria-selected={index === active}
              /* py-1.5면 항목이 31px라 손가락으로 고르기 빡빡하다. 표는 모바일에서도 쓴다. */
              className={`cursor-pointer px-3 py-2 text-sm ${index === active ? "bg-emerald-50 font-semibold text-emerald-800" : "text-slate-700"}`}
              onMouseEnter={() => setActiveIndex(index)}
              /* click이 아니라 mousedown이다 — click은 blur 뒤에 와서 목록이 이미 닫혀 있다. */
              onMouseDown={(event) => {
                event.preventDefault();
                pick(key);
              }}
            >
              {labelOf(key)}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
