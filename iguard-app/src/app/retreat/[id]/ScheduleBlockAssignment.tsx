"use client";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { IguardScheduleBlock, IguardStaff, IguardPost, IguardMovement } from "@/lib/types";
import { setIguardMovement, updateIguardScheduleBlock } from "@/lib/db";
import { useUI } from "@/context/UIContext";
import { postLabel, isValidTime, normalizeTime } from "@/lib/cueSheet";

export function CollapsiblePanel({ title, count, defaultOpen = false, children }: {
  title: string;
  count?: number | string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-lg border border-slate-200 bg-white">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="flex w-full items-center justify-between gap-2 px-2.5 py-1.5 text-left"
      >
        <span className="text-[11px] font-semibold text-slate-500">
          {title}{count !== undefined ? <span className="ml-1 text-slate-300">&middot; {count}</span> : null}
        </span>
        <span className="text-[11px] text-slate-400">{open ? "접기" : "펼치기"}</span>
      </button>
      {open && <div className="border-t border-slate-100 p-2.5">{children}</div>}
    </div>
  );
}

export function BlockAssignmentSection({ retreatId, block, staff, posts, movements }: {
  retreatId: string;
  block: IguardScheduleBlock;
  staff: IguardStaff[];
  posts: IguardPost[];
  movements: IguardMovement[];
}) {
  const { toast } = useUI();
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({
    postId: "",
    staffIds: [] as string[],
    round: "" as "" | "선밥" | "후밥",
    notes: {} as Record<string, string>,
  });

  const blockMvs = useMemo(() => movements.filter(mv => mv.blockId === block.id), [movements, block.id]);
  const staffMap = useMemo(() => new Map(staff.map(s => [s.id, s.name])), [staff]);
  const postMap = useMemo(() => new Map(posts.map(p => [p.id, p])), [posts]);
  const assignedIds = useMemo(() => new Set(blockMvs.map(mv => mv.staffId)), [blockMvs]);
  const movementsByPost = useMemo(() => {
    const map = new Map<string, IguardMovement[]>();
    blockMvs.forEach(mv => {
      const list = map.get(mv.postId) || [];
      list.push(mv);
      map.set(mv.postId, list);
    });
    return [...map.entries()].sort((a, b) => postLabel(postMap.get(a[0])).localeCompare(postLabel(postMap.get(b[0])), "ko"));
  }, [blockMvs, postMap]);

  function toggleStaff(staffId: string) {
    if (assignedIds.has(staffId)) return;
    setForm(prev => {
      const exists = prev.staffIds.includes(staffId);
      return {
        ...prev,
        staffIds: exists ? prev.staffIds.filter(id => id !== staffId) : [...prev.staffIds, staffId],
      };
    });
  }

  async function add() {
    if (!form.postId || form.staffIds.length === 0) return toast("포스트와 스탭을 선택해주세요.", "warning");
    try {
      for (const staffId of form.staffIds) {
        await setIguardMovement(retreatId, staffId, block.id, {
          postId: form.postId,
          round: form.round || undefined,
          note: form.notes[staffId]?.trim() || undefined,
        });
      }
      setForm({ postId: "", staffIds: [], round: "", notes: {} });
      setAdding(false);
    } catch (e) { toast(`저장 오류: ${e instanceof Error ? e.message : String(e)}`, "error"); }
  }

  async function del(mv: IguardMovement) {
    try { await setIguardMovement(retreatId, mv.staffId, block.id, null); }
    catch (e) { toast(`삭제 오류: ${e instanceof Error ? e.message : String(e)}`, "error"); }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide">장소 기준 배정 &middot; {movementsByPost.length}곳</span>
        {!adding && staff.length > 0 && posts.length > 0 && (
          <button onClick={() => setAdding(true)} className="text-xs text-fuchsia-600 hover:text-fuchsia-800 font-medium">+ 추가</button>
        )}
        {!adding && (staff.length === 0 || posts.length === 0) && (
          <span className="text-[11px] text-slate-300">{staff.length === 0 ? "스탭 탭에서 스탭을 먼저 등록해주세요" : "포스트 탭에서 포스트를 먼저 등록해주세요"}</span>
        )}
      </div>

      {blockMvs.length > 0 && (
        <div className="space-y-2 mb-2">
          {movementsByPost.map(([postId, list]) => (
            <div key={postId} className="rounded-lg bg-white px-3 py-2 border border-slate-100">
              <div className="mb-1.5 text-sm font-semibold text-slate-700">{postLabel(postMap.get(postId))}</div>
              <div className="flex flex-wrap gap-1.5">
                {list.map(mv => (
                  <span key={mv.staffId} className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                    {staffMap.get(mv.staffId) ?? "?"}{mv.round ? ` (${mv.round})` : ""}
                    <button onClick={() => del(mv)} className="ml-0.5 text-slate-300 hover:text-red-400">&times;</button>
                  </span>
                ))}
              </div>
              <div className="mt-1.5 text-[11px] text-fuchsia-700">
                {postLabel(postMap.get(postId))} : {list.map(mv => staffMap.get(mv.staffId) ?? "?").join(" ")}
              </div>
            </div>
          ))}
        </div>
      )}

      {blockMvs.length === 0 && !adding && (
        <p className="text-xs text-slate-300 text-center py-1">배정된 스탭이 없습니다</p>
      )}

      {adding && (
        <div className="bg-white rounded-xl border border-fuchsia-100 p-3 space-y-2">
          <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_170px]">
            <div>
              <label className="text-[11px] text-slate-400 block mb-1">포스트 (장소)</label>
              <select className="input w-full text-sm" value={form.postId} onChange={e => setForm(p => ({ ...p, postId: e.target.value }))}>
                <option value="">— 선택 —</option>
                {posts.map(p => <option key={p.id} value={p.id}>{p.area ? `[${p.area}] ` : ""}{p.name}</option>)}
              </select>
            </div>
            <div>
              {block.meal && (
                <>
                  <label className="text-[11px] text-slate-400 block mb-1">선/후밥</label>
                  <div className="flex gap-1">
                    {(["", "선밥", "후밥"] as const).map(r => (
                      <button key={r} type="button" onClick={() => setForm(p => ({ ...p, round: r }))}
                        className={`px-2.5 py-1 rounded text-xs border ${form.round === r
                          ? r === "선밥" ? "bg-emerald-100 text-emerald-700 border-emerald-300" : r === "후밥" ? "bg-amber-100 text-amber-700 border-amber-300" : "bg-slate-100 text-slate-600 border-slate-300"
                          : "bg-white text-slate-400 border-slate-200"}`}>{r || "미지정"}</button>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
          <div>
            <label className="text-[11px] text-slate-400 block mb-1">스탭 복수 선택</label>
            <div className="max-h-44 overflow-y-auto rounded-xl border border-slate-100 bg-slate-50 p-2">
              <div className="flex flex-wrap gap-1.5">
                {staff.map(s => {
                  const selected = form.staffIds.includes(s.id);
                  const assigned = assignedIds.has(s.id);
                  return (
                    <button
                      key={s.id}
                      type="button"
                      disabled={assigned}
                      onClick={() => toggleStaff(s.id)}
                      className={`rounded-full border px-2.5 py-1 text-xs font-medium disabled:cursor-not-allowed ${
                        selected
                          ? "border-fuchsia-500 bg-fuchsia-600 text-white"
                          : assigned
                            ? "border-slate-100 bg-white text-slate-300"
                            : "border-slate-200 bg-white text-slate-600 hover:border-fuchsia-300"
                      }`}
                    >
                      {s.name}{assigned ? " ✓" : ""}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
          {form.staffIds.length > 0 && (
            <div>
              <label className="text-[11px] text-slate-400 block mb-1">스탭별 메모 (선택)</label>
              <div className="grid gap-1.5 md:grid-cols-2">
                {form.staffIds.map(staffId => (
                  <input
                    key={staffId}
                    className="input w-full text-sm"
                    placeholder={`${staffMap.get(staffId) ?? "스탭"} 메모`}
                    value={form.notes[staffId] || ""}
                    onChange={e => setForm(p => ({ ...p, notes: { ...p.notes, [staffId]: e.target.value } }))}
                    onKeyDown={e => e.key === "Enter" && add()}
                  />
                ))}
              </div>
            </div>
          )}
          <div className="flex gap-2 justify-end pt-1">
            <button type="button" onClick={() => { setAdding(false); setForm({ postId: "", staffIds: [], round: "", notes: {} }); }} className="btn-secondary text-sm">취소</button>
            <button type="button" onClick={add} className="btn-primary text-sm">선택 스탭 배정</button>
          </div>
        </div>
      )}
    </div>
  );
}

export function DetailEditor({ retreatId, block }: { retreatId: string; block: IguardScheduleBlock }) {
  const { toast } = useUI();
  const [detail, setDetail] = useState(block.detail || "");
  const [detailTime, setDetailTime] = useState("");
  const [detailText, setDetailText] = useState("");

  useEffect(() => {
    setDetail(block.detail || "");
    setDetailTime("");
    setDetailText("");
  }, [block.id, block.detail]);

  async function saveDetail(nextDetail = detail) {
    const trimmed = nextDetail.trim();
    if (trimmed === (block.detail || "")) return;
    try {
      await updateIguardScheduleBlock(retreatId, block.id, { detail: trimmed || null });
    } catch (e) {
      toast(`저장 오류: ${e instanceof Error ? e.message : String(e)}`, "error");
    }
  }

  async function addDetailLine() {
    const time = normalizeTime(detailTime);
    const text = detailText.trim();
    if (!time || !text) return toast("세부 시간과 내용을 입력해주세요.", "warning");
    if (!isValidTime(time)) return toast("세부 시간은 HH:MM 형식으로 입력해주세요. 예: 08:50 또는 24:30", "warning");
    const nextDetail = [detail.trim(), `${time} ${text}`].filter(Boolean).join("\n");
    setDetail(nextDetail);
    setDetailTime("");
    setDetailText("");
    await saveDetail(nextDetail);
  }

  return (
    <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50/70 p-3">
      <div className="grid gap-2 md:grid-cols-[110px_1fr_auto]">
        <div>
          <label className="text-[11px] text-slate-500 block mb-1">세부 시간</label>
          <input
            className="input bg-white"
            placeholder="08:50"
            value={detailTime}
            onChange={e => setDetailTime(e.target.value)}
            onKeyDown={e => e.key === "Enter" && addDetailLine()}
          />
        </div>
        <div>
          <label className="text-[11px] text-slate-500 block mb-1">세부 내용</label>
          <textarea
            className="input min-h-[78px] bg-white resize-y leading-relaxed"
            placeholder="등록부스 설치, 1차 인원보고 등"
            value={detailText}
            onChange={e => setDetailText(e.target.value)}
            onKeyDown={e => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) addDetailLine();
            }}
          />
        </div>
        <button onClick={addDetailLine} className="btn-secondary self-end h-[44px] whitespace-nowrap">+ 줄 추가</button>
      </div>
      <textarea
        value={detail}
        placeholder="세부 동선이 여기에 누적됩니다. 직접 길게 수정해도 저장됩니다."
        rows={Math.max(6, Math.min(16, detail.split("\n").length + 2))}
        onChange={e => setDetail(e.target.value)}
        onBlur={() => saveDetail()}
        className="mt-3 w-full min-h-[160px] text-sm leading-relaxed text-slate-700 bg-white border border-slate-200 rounded-xl px-4 py-3 outline-none focus:border-fuchsia-400 resize-y"
      />
    </div>
  );
}

export function FreeTextEditor({ retreatId, block, field, title, placeholder }: {
  retreatId: string;
  block: IguardScheduleBlock;
  field: "owner" | "notice" | "leaderNote";
  title: string;
  placeholder: string;
}) {
  const { toast } = useUI();
  const value = (block[field] || "") as string;
  const [text, setText] = useState(value);

  useEffect(() => {
    setText(value);
  }, [block.id, value]);

  async function save() {
    const trimmed = text.trim();
    if (trimmed === value) return;
    try {
      await updateIguardScheduleBlock(retreatId, block.id, { [field]: trimmed || null });
    } catch (e) {
      toast(`저장 오류: ${e instanceof Error ? e.message : String(e)}`, "error");
    }
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <label className="text-[11px] font-semibold text-slate-500 block mb-1">{title}</label>
      <textarea
        value={text}
        placeholder={placeholder}
        rows={Math.max(3, Math.min(10, text.split("\n").length + 1))}
        onChange={e => setText(e.target.value)}
        onBlur={save}
        className="w-full min-h-[96px] text-sm leading-relaxed text-slate-700 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 outline-none focus:border-fuchsia-400 resize-y"
      />
    </div>
  );
}
