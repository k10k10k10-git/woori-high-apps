"use client";

import { useState } from "react";

export interface StudentPicker {
  bu: string;
  grade: string;
  cls: string;
  name: string;
  studentId: string;
}

export interface TeacherPicker { bu: string; name: string; }
export interface ClassPicker { bu: string; grade: string; cls: string; }
export interface StudentCandidate { name: string; bu: string; grade: number; cls: number; studentId: string; }
export interface TeacherCandidate { name: string; bu: string; }

export function StudentNamePicker({ value, candidates, placeholder, onPick }: {
  value: StudentPicker;
  candidates: StudentCandidate[];
  placeholder: string;
  onPick: (picker: StudentPicker) => void;
}) {
  const [query, setQuery] = useState("");
  if (value.name) {
    return (
      <div className="flex items-center gap-1.5 flex-1 min-w-0 bg-white border border-green-300 rounded-lg px-2 py-1 text-xs">
        <span className="font-semibold text-slate-700 truncate">{value.name}</span>
        <span className="text-slate-400 shrink-0">{value.bu} {value.grade}학년 {value.cls}반</span>
        <button type="button" aria-label="선택 취소" onClick={() => { onPick({ bu: "", grade: "", cls: "", name: "", studentId: "" }); setQuery(""); }}
          className="ml-auto text-slate-300 hover:text-red-400 text-base leading-none shrink-0">×</button>
      </div>
    );
  }
  const matches = query.trim() ? candidates.filter(candidate => candidate.name.includes(query.trim())).slice(0, 8) : [];
  return (
    <div className="relative flex-1 min-w-0">
      <input className="input w-full text-xs py-0.5" placeholder={placeholder}
        value={query} onChange={event => setQuery(event.target.value)} />
      {matches.length > 0 && (
        <div className="absolute z-10 left-0 right-0 mt-0.5 rounded-lg border border-slate-200 bg-white shadow-lg max-h-40 overflow-y-auto">
          {matches.map((candidate, index) => (
            <button type="button" key={candidate.studentId || `${candidate.bu}_${candidate.grade}_${candidate.cls}_${candidate.name}_${index}`}
              onClick={() => { onPick({ bu: candidate.bu, grade: String(candidate.grade), cls: String(candidate.cls), name: candidate.name, studentId: candidate.studentId }); setQuery(""); }}
              className="w-full flex items-center gap-2 px-2 py-1.5 text-left hover:bg-slate-50 border-b border-slate-100 last:border-0 text-xs">
              <span className="font-semibold text-slate-700">{candidate.name}</span>
              <span className="text-slate-400 ml-auto">{candidate.bu} {candidate.grade}학년 {candidate.cls}반</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function TeacherNamePicker({ value, candidates, placeholder, onPick }: {
  value: TeacherPicker;
  candidates: TeacherCandidate[];
  placeholder: string;
  onPick: (picker: TeacherPicker) => void;
}) {
  const [query, setQuery] = useState("");
  if (value.name) {
    return (
      <div className="flex items-center gap-1.5 flex-1 min-w-0 bg-white border border-green-300 rounded-lg px-2 py-1 text-xs">
        <span className="font-semibold text-slate-700 truncate">{value.name}</span>
        <span className="text-slate-400 shrink-0">{value.bu}</span>
        <button type="button" aria-label="선택 취소" onClick={() => { onPick({ bu: "", name: "" }); setQuery(""); }}
          className="ml-auto text-slate-300 hover:text-red-400 text-base leading-none shrink-0">×</button>
      </div>
    );
  }
  const matches = query.trim() ? candidates.filter(candidate => candidate.name.includes(query.trim())).slice(0, 8) : [];
  return (
    <div className="relative flex-1 min-w-0">
      <input className="input w-full text-xs py-0.5" placeholder={placeholder}
        value={query} onChange={event => setQuery(event.target.value)} />
      {matches.length > 0 && (
        <div className="absolute z-10 left-0 right-0 mt-0.5 rounded-lg border border-slate-200 bg-white shadow-lg max-h-40 overflow-y-auto">
          {matches.map((candidate, index) => (
            <button type="button" key={`${candidate.bu}_${candidate.name}_${index}`}
              onClick={() => { onPick({ bu: candidate.bu, name: candidate.name }); setQuery(""); }}
              className="w-full flex items-center gap-2 px-2 py-1.5 text-left hover:bg-slate-50 border-b border-slate-100 last:border-0 text-xs">
              <span className="font-semibold text-slate-700">{candidate.name}</span>
              <span className="text-slate-400 ml-auto">{candidate.bu}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
