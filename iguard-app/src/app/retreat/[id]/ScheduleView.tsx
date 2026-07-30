"use client";
import { useState } from "react";
import { Group, IguardScheduleBlock, IguardStaff, IguardPost, AssignedIguardMovement, IguardBus, IguardMovement, IguardSegment } from "@/lib/types";
import { saveIguardScheduleBlock, deleteIguardScheduleBlock } from "@/lib/db";
import { useUI } from "@/context/UIContext";
import {
  EMPTY,
  normalizeTime,
  normalizeEnd,
  resolveOvernight,
  scheduleTimeError,
  timeRangeLabel,
  looksLikeMeal,
  type ScheduleDraft,
} from "@/lib/cueSheet";
import StaffRosterBar from "./ScheduleStaffRoster";
import CueSheetImportPanel from "./ScheduleCueSheetImport";
import StructureClonePanel from "./StructureClonePanel";
import ScheduleSheetEditor from "./ScheduleSheetEditor";

export default function ScheduleView({ retreatId, retreatName, schedule, staff, posts, segments, movements, movementRecords, buses, groups, absentStaffNames = [], sheetSettingsOpen = false, onSheetSettingsClose }: {
  retreatId: string;
  retreatName: string;
  schedule: IguardScheduleBlock[];
  staff: IguardStaff[];
  posts: IguardPost[];
  segments: IguardSegment[];
  movements: AssignedIguardMovement[];
  movementRecords: IguardMovement[];
  buses: IguardBus[];
  groups: Group[];
  absentStaffNames?: string[];
  sheetSettingsOpen?: boolean;
  onSheetSettingsClose?: () => void;
}) {
  const { toast, uiConfirm } = useUI();
  const [form, setForm] = useState<ScheduleDraft>(EMPTY);
  const [addingBlock, setAddingBlock] = useState(false);
  const [addingDetails, setAddingDetails] = useState(false);

  async function add() {
    const start = normalizeTime(form.start);
    const end = normalizeEnd(form.end);
    if (!start || !form.label.trim()) return toast("시작 시간과 내용을 입력해주세요.", "warning");
    // 자정 넘김 정규화 — 시트 임포트와 동일 규칙(24시+ 표기, 패턴 10b).
    // 현장에서 "23:30~02:00"처럼 사람이 읽는 대로 입력해도 막히지 않게 폼에서도 적용한다(2026-07-12).
    const resolved = resolveOvernight(form.day, start, end || undefined);
    const timeError = scheduleTimeError(resolved.start, resolved.end || undefined);
    if (timeError) return toast(timeError, "warning");
    if (resolved.converted) {
      toast(`자정 넘김 일정으로 정리했습니다: ${form.day}일차 ${timeRangeLabel(start, end || undefined)} → ${resolved.day}일차 ${timeRangeLabel(resolved.start, resolved.end || undefined)}`, "info");
    }
    try {
      await saveIguardScheduleBlock(retreatId, {
        day: resolved.day, start: resolved.start, end: resolved.end || undefined,
        label: form.label.trim(),
        meal: form.meal || looksLikeMeal(form.label, form.detail) || undefined,
        detail: form.detail.trim() || undefined,
        owner: form.owner.trim() || undefined,
        notice: form.notice.trim() || undefined,
        source: "manual",
      });
      setForm({ ...EMPTY, day: form.day });
      toast("일정을 추가했습니다.", "success");
    } catch (e) { toast(`저장 오류: ${e instanceof Error ? e.message : String(e)}`, "error"); }
  }
  async function del(b: IguardScheduleBlock) {
    if (!await uiConfirm(`"${b.label}" 블록을 삭제할까요?`)) return;
    try { await deleteIguardScheduleBlock(retreatId, b.id); } catch (e) { toast(`삭제 오류: ${e}`, "error"); }
  }
  return (
    <div>
      <div className="mb-3 bg-fuchsia-50 border border-fuchsia-100 rounded-lg p-2.5 text-xs text-fuchsia-700">
        ℹ️ 시간·구분·내용·담당·특이사항을 한 행에서 바로 수정합니다. 구간·포스트·담당자 구조는 각 행의 상세 설정에서 관리하며, 구글 시트 가져오기는 새 수련회 초기 설정용 보조 도구입니다.
      </div>
      <StaffRosterBar staff={staff} groups={groups} schedule={schedule} posts={posts} movements={movements} absentStaffNames={absentStaffNames} />
      <CueSheetImportPanel retreatId={retreatId} retreatName={retreatName} schedule={schedule} staff={staff} posts={posts} segments={segments} movementRecords={movementRecords} buses={buses} open={sheetSettingsOpen} onClose={onSheetSettingsClose || (() => undefined)} />
      <StructureClonePanel retreatId={retreatId} />

      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-bold text-slate-900">스탭 전체 큐싯</h2>
          <p className="mt-0.5 text-xs text-slate-400">시트처럼 한 행에서 시간·내용·담당을 이어서 작성합니다.</p>
        </div>
        <button
          type="button"
          onClick={() => setAddingBlock(value => !value)}
          aria-expanded={addingBlock}
          className="btn-primary min-h-11 whitespace-nowrap"
        >
          {addingBlock ? "추가 닫기" : "＋ 일정 추가"}
        </button>
      </div>

      {addingBlock && (
        <div className="card mb-4 border-fuchsia-100 p-3">
          <div className="grid gap-2.5 md:grid-cols-[100px_115px_115px_minmax(220px,1fr)_auto]">
            <div><label className="mb-1 block text-xs text-slate-500">일자</label>
              <select className="input w-full" value={form.day} onChange={e => setForm(p => ({ ...p, day: parseInt(e.target.value) }))}>
                {[1, 2, 3].map(d => <option key={d} value={d}>{d}일차</option>)}
              </select></div>
            <div><label className="mb-1 block text-xs text-slate-500">시작</label>
              <input className="input w-full" placeholder="08:30" value={form.start} onChange={e => setForm(p => ({ ...p, start: e.target.value }))} /></div>
            <div><label className="mb-1 block text-xs text-slate-500">종료</label>
              <input className="input w-full" placeholder="09:00 또는 ~" value={form.end} onChange={e => setForm(p => ({ ...p, end: e.target.value }))} /></div>
            <div><label className="mb-1 block text-xs text-slate-500">구분</label>
              <input className="input w-full" placeholder="등록 / 기도회 및 등록 준비" value={form.label} onChange={e => setForm(p => ({ ...p, label: e.target.value }))} onKeyDown={e => e.key === "Enter" && add()} /></div>
            <div className="flex items-end gap-2">
              <label className="flex h-[44px] items-center gap-1 text-sm text-slate-600">
                <input type="checkbox" checked={form.meal} onChange={e => setForm(p => ({ ...p, meal: e.target.checked }))} /> 식사
              </label>
              <button onClick={add} className="btn-primary h-[44px] whitespace-nowrap">추가</button>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setAddingDetails(value => !value)}
            aria-expanded={addingDetails}
            className="mt-2 min-h-9 text-xs font-semibold text-fuchsia-600"
          >
            {addingDetails ? "내용·담당·특이사항 접기 ▲" : "내용·담당·특이사항 함께 입력 ▼"}
          </button>
          {addingDetails && (
            <div className="mt-2 grid gap-2.5 lg:grid-cols-3">
              <div>
                <label className="mb-1 block text-xs text-slate-500">내용</label>
                <textarea className="input min-h-[88px] resize-y leading-relaxed" placeholder="* 08:50 등록부스 설치&#10;* 09:15 1차 인원보고" value={form.detail} onChange={e => setForm(p => ({ ...p, detail: e.target.value }))} />
              </div>
              <div>
                <label className="mb-1 block text-xs text-slate-500">담당</label>
                <textarea className="input min-h-[88px] resize-y leading-relaxed" placeholder="진행 및 총괄: 박세원&#10;미디어: 김우진" value={form.owner} onChange={e => setForm(p => ({ ...p, owner: e.target.value }))} />
              </div>
              <div>
                <label className="mb-1 block text-xs text-slate-500">특이사항</label>
                <textarea className="input min-h-[88px] resize-y leading-relaxed" placeholder="주의사항, 준비물, 예외 상황" value={form.notice} onChange={e => setForm(p => ({ ...p, notice: e.target.value }))} />
              </div>
            </div>
          )}
        </div>
      )}

      {schedule.length === 0 ? (
        <div className="card p-8 text-center text-slate-400"><div className="text-3xl mb-2">🗓️</div><p>스탭 전체 큐싯이 비어있습니다.</p></div>
      ) : (
        <ScheduleSheetEditor
          retreatId={retreatId}
          schedule={schedule}
          segments={segments}
          movements={movementRecords}
          staff={staff}
          posts={posts}
          onDelete={del}
        />
      )}
    </div>
  );
}
