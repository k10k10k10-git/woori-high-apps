"use client";

import { useEffect, useState } from "react";
import { IguardScheduleBlock } from "@/lib/types";
import { updateIguardScheduleBlock } from "@/lib/db";
import { normalizeEnd, normalizeTime, scheduleTimeError } from "@/lib/cueSheet";
import { useUI } from "@/context/UIContext";

export default function ScheduleBlockEditor({ retreatId, block }: { retreatId: string; block: IguardScheduleBlock }) {
  const { toast } = useUI();
  const [draft, setDraft] = useState({
    day: block.day,
    start: block.start,
    end: block.end || "",
    label: block.label,
    meal: !!block.meal,
    noMovement: !!block.noMovement,
    note: block.note || "",
  });
  useEffect(() => setDraft({
    day: block.day, start: block.start, end: block.end || "", label: block.label,
    meal: !!block.meal, noMovement: !!block.noMovement, note: block.note || "",
  }), [block]);

  async function save() {
    const start = normalizeTime(draft.start);
    const end = normalizeEnd(draft.end);
    const error = scheduleTimeError(start, end || undefined);
    if (error) return toast(error, "warning");
    if (!draft.label.trim()) return toast("블록 이름을 입력해주세요.", "warning");
    try {
      await updateIguardScheduleBlock(retreatId, block.id, {
        day: draft.day,
        start,
        end: end || null,
        label: draft.label.trim(),
        meal: draft.meal || null,
        noMovement: draft.noMovement || null,
        note: draft.note.trim() || null,
      });
      toast("시간 블록을 저장했습니다.", "success");
    } catch (e) { toast(`저장 오류: ${e instanceof Error ? e.message : String(e)}`, "error"); }
  }
  return (
    <div className="grid gap-2 md:grid-cols-[80px_105px_105px_minmax(160px,1fr)_minmax(140px,1fr)_auto]">
      <select className="input text-sm" value={draft.day} onChange={e => setDraft(p => ({ ...p, day: Number(e.target.value) }))}>
        {[1, 2, 3].map(day => <option key={day} value={day}>{day}일차</option>)}
      </select>
      <input className="input text-sm" value={draft.start} onChange={e => setDraft(p => ({ ...p, start: e.target.value }))} placeholder="시작" />
      <input className="input text-sm" value={draft.end} onChange={e => setDraft(p => ({ ...p, end: e.target.value }))} placeholder="종료" />
      <input className="input text-sm" value={draft.label} onChange={e => setDraft(p => ({ ...p, label: e.target.value }))} placeholder="블록 이름" />
      <input className="input text-sm" value={draft.note} onChange={e => setDraft(p => ({ ...p, note: e.target.value }))} placeholder="제작 메모" />
      <div className="flex items-center gap-2">
        <label className="text-xs whitespace-nowrap"><input type="checkbox" checked={draft.meal} onChange={e => setDraft(p => ({ ...p, meal: e.target.checked }))} /> 식사</label>
        <label className="text-xs whitespace-nowrap"><input type="checkbox" checked={draft.noMovement} onChange={e => setDraft(p => ({ ...p, noMovement: e.target.checked }))} /> 동선 없음</label>
        <button type="button" onClick={save} className="btn-secondary text-xs whitespace-nowrap">저장</button>
      </div>
    </div>
  );
}
