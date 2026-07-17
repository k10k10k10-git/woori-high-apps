"use client";
import { useEffect, useMemo, useRef, useState } from "react";

/** 이름 자동완성 후보의 최소 형태 — 하단에 "부 학년 반"으로 표시된다 */
export interface NameSuggestionBase {
  name: string;
  bu: string;
  grade: number;
  classNum: number;
}

/**
 * 이름 검색 자동완성 — 입력하면 하단에 후보(이름 + 부/학년/반)가 떠서 클릭으로 선택.
 * 의료일지에서 추출한 공용 컴포넌트 (의료일지·카풀 공용). onSelect에는 선택한 후보
 * 객체가 그대로 넘어가므로, 호출부가 후보에 실은 추가 필드(연락처 등)를 활용할 수 있다.
 */
export default function NameAutocomplete<T extends NameSuggestionBase>({
  value, onChange, onSelect, suggestions, placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  onSelect: (s: T) => void;
  suggestions: T[];
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    const q = value.trim();
    if (!q) return suggestions.slice(0, 8); // 부서+학년+반 선택된 경우 전체 표시
    return suggestions.filter(s => s.name.includes(q)).slice(0, 8);
  }, [value, suggestions]);

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  return (
    <div ref={wrapRef} className="relative">
      <input
        className="input text-sm w-full"
        placeholder={placeholder ?? "이름 *"}
        value={value}
        onChange={e => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => { if (filtered.length > 0) setOpen(true); }}
      />
      {open && filtered.length > 0 && (
        <ul className="absolute z-20 top-full left-0 right-0 mt-0.5 bg-white border border-slate-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
          {filtered.map((s, i) => (
            <li key={i}>
              <button type="button"
                className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50 flex items-center gap-2"
                onMouseDown={e => { e.preventDefault(); onSelect(s); setOpen(false); }}>
                <span className="font-medium">{s.name}</span>
                <span className="text-xs text-slate-400">{s.bu} {s.grade}학년 {s.classNum}반</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
