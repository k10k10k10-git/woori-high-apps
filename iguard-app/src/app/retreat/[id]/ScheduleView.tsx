"use client";
import { useState } from "react";
import { Group, IguardScheduleBlock, IguardStaff, IguardPost, IguardMovement, IguardBus } from "@/lib/types";
import { saveIguardScheduleBlock, deleteIguardScheduleBlock } from "@/lib/db";
import { ref, update } from "firebase/database";
import { db } from "@/lib/firebase";
import { paths } from "@/lib/paths";
import { useUI } from "@/context/UIContext";
import {
  EMPTY,
  normalizeTime,
  normalizeEnd,
  scheduleTimeError,
  timeRangeLabel,
  looksLikeMeal,
  type ScheduleDraft,
} from "@/lib/cueSheet";
import { CollapsiblePanel, BlockAssignmentSection, DetailEditor, FreeTextEditor } from "./ScheduleBlockAssignment";
import StaffRosterBar from "./ScheduleStaffRoster";
import CueSheetImportPanel from "./ScheduleCueSheetImport";

export default function ScheduleView({ retreatId, retreatName, schedule, staff, posts, movements, buses, groups, absentStaffNames = [], sheetSettingsOpen = false, onSheetSettingsClose }: {
  retreatId: string;
  retreatName: string;
  schedule: IguardScheduleBlock[];
  staff: IguardStaff[];
  posts: IguardPost[];
  movements: IguardMovement[];
  buses: IguardBus[];
  groups: Group[];
  absentStaffNames?: string[];
  sheetSettingsOpen?: boolean;
  onSheetSettingsClose?: () => void;
}) {
  const { toast, uiConfirm } = useUI();
  const [form, setForm] = useState<ScheduleDraft>(EMPTY);

  async function add() {
    const start = normalizeTime(form.start);
    const end = normalizeEnd(form.end);
    if (!start || !form.label.trim()) return toast("시작 시간과 내용을 입력해주세요.", "warning");
    const timeError = scheduleTimeError(start, end || undefined);
    if (timeError) return toast(timeError, "warning");
    try {
      await saveIguardScheduleBlock(retreatId, {
        day: form.day, start, end: end || undefined,
        label: form.label.trim(),
        meal: form.meal || looksLikeMeal(form.label, form.detail) || undefined,
        detail: form.detail.trim() || undefined,
        owner: form.owner.trim() || undefined,
        notice: form.notice.trim() || undefined,
      });
      setForm({ ...EMPTY, day: form.day });
    } catch (e) { toast(`저장 오류: ${e instanceof Error ? e.message : String(e)}`, "error"); }
  }
  async function del(b: IguardScheduleBlock) {
    if (!await uiConfirm(`"${b.label}" 블록을 삭제할까요?`)) return;
    try { await deleteIguardScheduleBlock(retreatId, b.id); } catch (e) { toast(`삭제 오류: ${e}`, "error"); }
  }
  async function setNoMovement(b: IguardScheduleBlock, checked: boolean) {
    try {
      await update(ref(db, paths.iguardScheduleBlock(retreatId, b.id)), { noMovement: checked ? true : null });
    } catch (e) {
      toast(`저장 오류: ${e instanceof Error ? e.message : String(e)}`, "error");
    }
  }
  const days = [...new Set(schedule.map(b => b.day))].sort((a, b) => a - b);

  return (
    <div>
      <div className="mb-3 bg-fuchsia-50 border border-fuchsia-100 rounded-lg p-2.5 text-xs text-fuchsia-700">
        ℹ️ 일자별 시간 블록(전환 시점)입니다. 이 블록들이 <strong>동선 매트릭스의 열</strong>이자 <strong>개인 큐카드의 타임라인</strong>이 됩니다.
      </div>
      <StaffRosterBar staff={staff} groups={groups} schedule={schedule} posts={posts} movements={movements} absentStaffNames={absentStaffNames} />
      <CueSheetImportPanel retreatId={retreatId} retreatName={retreatName} schedule={schedule} staff={staff} posts={posts} buses={buses} open={sheetSettingsOpen} onClose={onSheetSettingsClose || (() => undefined)} />

      <div className="card p-3 mb-4">
        <div className="grid gap-2.5 md:grid-cols-[110px_130px_130px_1fr_auto]">
          <div><label className="text-xs text-slate-500 block mb-1">일자</label>
            <select className="input w-full" value={form.day} onChange={e => setForm(p => ({ ...p, day: parseInt(e.target.value) }))}>
              {[1, 2, 3].map(d => <option key={d} value={d}>{d}일차</option>)}
            </select></div>
          <div><label className="text-xs text-slate-500 block mb-1">시작</label>
            <input className="input w-full" placeholder="08:30" value={form.start} onChange={e => setForm(p => ({ ...p, start: e.target.value }))} /></div>
          <div><label className="text-xs text-slate-500 block mb-1">종료</label>
            <input className="input w-full" placeholder="09:00 또는 ~" value={form.end} onChange={e => setForm(p => ({ ...p, end: e.target.value }))} /></div>
          <div><label className="text-xs text-slate-500 block mb-1">구분</label>
            <input className="input w-full" placeholder="등록 / 기도회 및 등록 준비" value={form.label} onChange={e => setForm(p => ({ ...p, label: e.target.value }))} onKeyDown={e => e.key === "Enter" && add()} /></div>
          <div className="flex items-end gap-3">
            <label className="flex items-center gap-1 text-sm text-slate-600 h-[44px]">
              <input type="checkbox" checked={form.meal} onChange={e => setForm(p => ({ ...p, meal: e.target.checked }))} /> 식사
            </label>
            <button onClick={add} className="btn-primary h-[44px] whitespace-nowrap">＋ 추가</button>
          </div>
        </div>
        <div className="grid gap-2.5 mt-2.5 lg:grid-cols-3">
          <div>
            <label className="text-xs text-slate-500 block mb-1">내용</label>
            <textarea
              className="input min-h-[96px] resize-y leading-relaxed"
              placeholder="* 08:50 등록부스 설치&#10;* 09:15 1차 인원보고"
              value={form.detail}
              onChange={e => setForm(p => ({ ...p, detail: e.target.value }))}
            />
          </div>
          <div>
            <label className="text-xs text-slate-500 block mb-1">담당</label>
            <textarea
              className="input min-h-[96px] resize-y leading-relaxed"
              placeholder="진행 및 총괄: 박세원&#10;미디어: 김우진"
              value={form.owner}
              onChange={e => setForm(p => ({ ...p, owner: e.target.value }))}
            />
          </div>
          <div>
            <label className="text-xs text-slate-500 block mb-1">특이사항</label>
            <textarea
              className="input min-h-[96px] resize-y leading-relaxed"
              placeholder="주의사항, 준비물, 예외 상황 등을 적어주세요."
              value={form.notice}
              onChange={e => setForm(p => ({ ...p, notice: e.target.value }))}
            />
          </div>
        </div>
      </div>

      {schedule.length === 0 ? (
        <div className="card p-8 text-center text-slate-400"><div className="text-3xl mb-2">🗓️</div><p>스탭 전체 큐싯이 비어있습니다.</p></div>
      ) : days.map(day => (
        <div key={day} className="card overflow-hidden mb-3">
          <div className="px-3 py-1.5 bg-slate-50 border-b border-slate-100 text-sm font-semibold text-slate-700">{day}일차</div>
          <div className="divide-y divide-slate-100">
            {schedule.filter(b => b.day === day).map(b => {
              const timeError = scheduleTimeError(b.start, b.end);
              const blockMovements = movements.filter(mv => mv.blockId === b.id);
              return (
                <div key={b.id} className="px-3 py-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`font-mono text-[11px] whitespace-nowrap w-24 ${timeError ? "text-red-500" : "text-slate-500"}`}>{timeRangeLabel(b.start, b.end)}</span>
                    <span className="text-sm font-medium text-slate-800">{b.label}{b.meal && !looksLikeMeal(b.label, "") && <span className="ml-1.5 px-1.5 py-0.5 rounded text-[11px] bg-orange-100 text-orange-600">식사</span>}</span>
                    {timeError && <span className="text-[11px] text-red-500">{timeError}</span>}
                    <label className="ml-auto flex items-center gap-1 text-xs text-slate-400">
                      <input
                        type="checkbox"
                        checked={!!b.noMovement}
                        onChange={e => setNoMovement(b, e.target.checked)}
                      />
                      동선 없음
                    </label>
                    <button onClick={() => del(b)} className="text-xs text-slate-300 hover:text-red-400">삭제</button>
                  </div>
                  <div className="mt-2 grid gap-1.5">
                    <CollapsiblePanel title="스탭 배정" count={b.noMovement ? "동선 없음" : `${blockMovements.length}명`} defaultOpen={!b.noMovement && blockMovements.length === 0}>
                      <BlockAssignmentSection retreatId={retreatId} block={b} staff={staff} posts={posts} movements={movements} />
                    </CollapsiblePanel>
                    <CollapsiblePanel title="세부 시간/내용" count={b.detail ? "입력됨" : "비어있음"}>
                      <DetailEditor retreatId={retreatId} block={b} />
                    </CollapsiblePanel>
                    {blockMovements.length === 0 && (
                      <CollapsiblePanel title="담당" count={b.owner ? "입력됨" : "비어있음"}>
                        <FreeTextEditor
                          retreatId={retreatId}
                          block={b}
                          field="owner"
                          title="담당"
                          placeholder="진행 및 총괄: 박세원&#10;미디어: 김우진"
                        />
                      </CollapsiblePanel>
                    )}
                    <CollapsiblePanel title="특이사항" count={b.notice ? "입력됨" : "비어있음"}>
                      <FreeTextEditor
                        retreatId={retreatId}
                        block={b}
                        field="notice"
                        title="특이사항"
                        placeholder="주의사항, 준비물, 예외 상황 등을 적어주세요."
                      />
                    </CollapsiblePanel>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
