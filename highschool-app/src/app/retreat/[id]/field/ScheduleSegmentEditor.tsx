"use client";

import { useEffect, useMemo, useState } from "react";
import { IguardMovement, IguardPost, IguardScheduleBlock, IguardSegment, IguardStaff } from "@/features/iguard/lib/types";
import {
  deleteIguardMovementById,
  deleteIguardSegment,
  replaceIguardSegmentMovement,
  saveIguardSegment,
  setIguardSegmentMovement,
  updateIguardMovementById,
  updateIguardSegment,
} from "@/features/iguard/lib/db";
import { useUI } from "@/context/UIContext";

type Assignee = `staff:${string}` | "tbd" | "actor";

function assigneeOf(movement: IguardMovement): Assignee {
  if (movement.staffId) return `staff:${movement.staffId}`;
  if (movement.actor) return "actor";
  return "tbd";
}

function nextSlot(movements: IguardMovement[], segmentId: string, postId: string): number {
  return movements
    .filter(m => m.segmentId === segmentId && m.postId === postId)
    .reduce((max, m) => Math.max(max, m.slot || 0), 0) + 1;
}

function MovementRow({ retreatId, movement, allMovements, staff, posts }: {
  retreatId: string;
  movement: IguardMovement;
  allMovements: IguardMovement[];
  staff: IguardStaff[];
  posts: IguardPost[];
}) {
  const { toast, uiConfirm } = useUI();
  const [draft, setDraft] = useState({
    postId: movement.postId,
    assignee: assigneeOf(movement) as Assignee,
    actor: movement.actor || "",
    round: movement.round || "",
    detail: movement.detail || "",
    note: movement.note || "",
  });

  useEffect(() => {
    setDraft({
      postId: movement.postId,
      assignee: assigneeOf(movement),
      actor: movement.actor || "",
      round: movement.round || "",
      detail: movement.detail || "",
      note: movement.note || "",
    });
  }, [movement]);

  async function save() {
    if (!movement.segmentId || !draft.postId) return;
    if (draft.assignee === "actor" && !draft.actor.trim()) return toast("비스탭 담당 이름을 입력해주세요.", "warning");
    const staffId = draft.assignee.startsWith("staff:") ? draft.assignee.slice(6) : null;
    const actor = draft.assignee === "actor" ? draft.actor.trim() : null;
    const naturalKeyChanged = draft.postId !== movement.postId
      || staffId !== (movement.staffId || null)
      || actor !== (movement.actor || null)
      || (draft.assignee === "tbd" && !!movement.actor);
    const slot = staffId ? undefined : (naturalKeyChanged
      ? nextSlot(allMovements, movement.segmentId, draft.postId)
      : movement.slot || 1);
    const data: Omit<IguardMovement, "id"> = {
      blockId: movement.blockId,
      segmentId: movement.segmentId,
      postId: draft.postId,
      staffId,
      slot,
      actor,
      round: draft.round as IguardMovement["round"] || undefined,
      detail: draft.detail.trim() || null,
      note: draft.note.trim() || undefined,
      source: "manual",
    };
    try {
      if (naturalKeyChanged) await replaceIguardSegmentMovement(retreatId, movement.id, data);
      else await updateIguardMovementById(retreatId, movement.id, data);
      toast("동선 배정을 저장했습니다.", "success");
    } catch (error) {
      toast(`저장 오류: ${error instanceof Error ? error.message : String(error)}`, "error");
    }
  }

  async function removeRow() {
    if (!await uiConfirm("이 동선 배정을 삭제할까요?")) return;
    try { await deleteIguardMovementById(retreatId, movement.id); }
    catch (error) { toast(`삭제 오류: ${error instanceof Error ? error.message : String(error)}`, "error"); }
  }

  return (
    <div className="grid gap-2 rounded-lg border border-slate-200 bg-white p-2 md:grid-cols-[minmax(130px,1fr)_minmax(150px,1fr)_100px_minmax(130px,1fr)_auto]">
      <select className="input text-sm" value={draft.postId} onChange={e => setDraft(p => ({ ...p, postId: e.target.value }))}>
        {posts.map(post => <option key={post.id} value={post.id}>{post.area ? `[${post.area}] ` : ""}{post.name}</option>)}
      </select>
      <div className="flex gap-1">
        <select className="input min-w-0 flex-1 text-sm" value={draft.assignee} onChange={e => setDraft(p => ({ ...p, assignee: e.target.value as Assignee }))}>
          <option value="tbd">담당 미정</option>
          <option value="actor">비스탭 담당</option>
          {staff.map(person => <option key={person.id} value={`staff:${person.id}`}>{person.name}</option>)}
        </select>
        {draft.assignee === "actor" && (
          <input className="input min-w-0 flex-1 text-sm" value={draft.actor} onChange={e => setDraft(p => ({ ...p, actor: e.target.value }))} placeholder="행정팀" />
        )}
      </div>
      <select className="input text-sm" value={draft.round} onChange={e => setDraft(p => ({ ...p, round: e.target.value }))}>
        <option value="">식사 구분 없음</option><option value="선밥">선밥</option><option value="후밥">후밥</option>
      </select>
      <div className="grid gap-1 sm:grid-cols-2 md:grid-cols-1">
        <input className="input text-sm" value={draft.detail} onChange={e => setDraft(p => ({ ...p, detail: e.target.value }))} placeholder="상세 위치" />
        <input className="input text-sm" value={draft.note} onChange={e => setDraft(p => ({ ...p, note: e.target.value }))} placeholder="메모" />
      </div>
      <div className="flex items-center justify-end gap-1">
        <button type="button" onClick={save} className="btn-secondary text-xs">저장</button>
        <button type="button" onClick={removeRow} className="text-xs text-red-400">삭제</button>
      </div>
    </div>
  );
}

function SegmentSection({ retreatId, block, segment, segments, movements, staff, posts }: {
  retreatId: string;
  block: IguardScheduleBlock;
  segment: IguardSegment;
  segments: IguardSegment[];
  movements: IguardMovement[];
  staff: IguardStaff[];
  posts: IguardPost[];
}) {
  const { toast, uiConfirm } = useUI();
  const [label, setLabel] = useState(segment.label);
  const [zone, setZone] = useState(segment.zone || "");
  const [note, setNote] = useState(segment.note || "");
  const [newPostId, setNewPostId] = useState(posts[0]?.id || "");
  const [newAssignee, setNewAssignee] = useState<Assignee>("tbd");
  const [newActor, setNewActor] = useState("");
  const rows = movements.filter(movement => movement.segmentId === segment.id);

  useEffect(() => {
    setLabel(segment.label); setZone(segment.zone || ""); setNote(segment.note || "");
  }, [segment]);
  useEffect(() => {
    if (!posts.some(post => post.id === newPostId)) setNewPostId(posts[0]?.id || "");
  }, [newPostId, posts]);

  async function saveSegment() {
    if (!label.trim()) return toast("구간 이름을 입력해주세요.", "warning");
    try {
      await updateIguardSegment(retreatId, segment.id, {
        label: label.trim(),
        zone: (zone || null) as IguardSegment["zone"],
        note: note.trim() || null,
      });
      toast("구간을 저장했습니다.", "success");
    } catch (error) { toast(`저장 오류: ${error instanceof Error ? error.message : String(error)}`, "error"); }
  }

  async function addMovement() {
    if (!newPostId) return toast("포스트를 먼저 등록하거나 선택해주세요.", "warning");
    if (newAssignee === "actor" && !newActor.trim()) return toast("비스탭 담당 이름을 입력해주세요.", "warning");
    const staffId = newAssignee.startsWith("staff:") ? newAssignee.slice(6) : null;
    try {
      await setIguardSegmentMovement(retreatId, {
        blockId: block.id,
        segmentId: segment.id,
        postId: newPostId,
        staffId,
        actor: newAssignee === "actor" ? newActor.trim() : null,
        slot: staffId ? undefined : nextSlot(movements, segment.id, newPostId),
        source: "manual",
      });
      setNewAssignee("tbd"); setNewActor("");
    } catch (error) { toast(`저장 오류: ${error instanceof Error ? error.message : String(error)}`, "error"); }
  }

  async function removeSegment() {
    if (segments.length <= 1) return toast("시간 블록에는 구간이 하나 이상 있어야 합니다.", "warning");
    if (!await uiConfirm(`"${segment.label}" 구간과 그 동선을 모두 삭제할까요?`)) return;
    try { await deleteIguardSegment(retreatId, segment.id); }
    catch (error) { toast(`삭제 오류: ${error instanceof Error ? error.message : String(error)}`, "error"); }
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-slate-50/70 p-2.5">
      <div className="grid gap-2 md:grid-cols-[80px_minmax(150px,1fr)_100px_minmax(140px,1fr)_auto]">
        <input className="input text-sm" type="number" min={0} value={segment.order} onChange={e => updateIguardSegment(retreatId, segment.id, { order: Number(e.target.value) })} aria-label="구간 순서" />
        <input className="input text-sm" value={label} onChange={e => setLabel(e.target.value)} placeholder="구간 이름" />
        <select className="input text-sm" value={zone} onChange={e => setZone(e.target.value)}>
          <option value="">구역 없음</option><option value="위">위</option><option value="아래">아래</option>
        </select>
        <input className="input text-sm" value={note} onChange={e => setNote(e.target.value)} placeholder="구간 메모" />
        <div className="flex items-center justify-end gap-1">
          <button type="button" onClick={saveSegment} className="btn-secondary text-xs">구간 저장</button>
          <button type="button" onClick={removeSegment} className="text-xs text-red-400">삭제</button>
        </div>
      </div>
      <div className="mt-2 space-y-2">
        {rows.map(row => <MovementRow key={row.id} retreatId={retreatId} movement={row} allMovements={movements} staff={staff} posts={posts} />)}
      </div>
      {posts.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2 rounded-lg border border-dashed border-slate-200 bg-white p-2">
          <select className="input min-w-[180px] flex-1 text-sm" value={newPostId} onChange={e => setNewPostId(e.target.value)}>
            {posts.map(post => <option key={post.id} value={post.id}>{post.area ? `[${post.area}] ` : ""}{post.name}</option>)}
          </select>
          <select className="input min-w-[160px] text-sm" value={newAssignee} onChange={e => setNewAssignee(e.target.value as Assignee)}>
            <option value="tbd">담당 미정</option><option value="actor">비스탭 담당</option>
            {staff.map(person => <option key={person.id} value={`staff:${person.id}`}>{person.name}</option>)}
          </select>
          {newAssignee === "actor" && <input className="input min-w-[140px] text-sm" value={newActor} onChange={e => setNewActor(e.target.value)} placeholder="담당 이름" />}
          <button type="button" onClick={addMovement} className="btn-secondary text-xs">+ 동선</button>
        </div>
      )}
    </section>
  );
}

export default function ScheduleSegmentEditor({ retreatId, block, allSegments, movements, staff, posts }: {
  retreatId: string;
  block: IguardScheduleBlock;
  allSegments: IguardSegment[];
  movements: IguardMovement[];
  staff: IguardStaff[];
  posts: IguardPost[];
}) {
  const { toast } = useUI();
  const blockSegments = useMemo(() => allSegments
    .filter(segment => segment.blockId === block.id)
    .sort((a, b) => a.order - b.order || a.label.localeCompare(b.label, "ko")), [allSegments, block.id]);

  async function addSegment() {
    try {
      await saveIguardSegment(retreatId, {
        blockId: block.id,
        order: blockSegments.reduce((max, segment) => Math.max(max, segment.order), -1) + 1,
        label: `구간 ${blockSegments.length + 1}`,
        source: "manual",
      });
    } catch (error) { toast(`저장 오류: ${error instanceof Error ? error.message : String(error)}`, "error"); }
  }

  return (
    <div className="space-y-2">
      {blockSegments.map(segment => (
        <SegmentSection key={segment.id} retreatId={retreatId} block={block} segment={segment}
          segments={blockSegments} movements={movements} staff={staff} posts={posts} />
      ))}
      <button type="button" onClick={addSegment} className="btn-secondary text-xs">+ 구간 추가</button>
      {posts.length === 0 && <p className="text-xs text-amber-600">포스트 탭에서 장소를 등록하면 구간별 담당자를 지정할 수 있습니다.</p>}
    </div>
  );
}
