"use client";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { IguardScheduleBlock, IguardStaff, IguardPost, IguardBus, IguardMovement, IguardSegment } from "@/features/iguard/lib/types";
import {
  saveIguardScheduleBlock,
  updateIguardScheduleBlock,
  deleteIguardScheduleBlock,
  saveIguardPost,
  saveIguardSegment,
  ensureIguardDefaultSegment,
  updateIguardSegment,
  deleteIguardSegment,
  setIguardSegmentMovement,
  deleteIguardMovementById,
  saveIguardBus,
  updateIguardBus,
  subscribeToIguardCueSheet,
  saveIguardCueSheet,
  markCueSheetImported,
  IguardCueSheet,
} from "@/features/iguard/lib/db";
import { fetchSheetCsv } from "@/features/iguard/lib/sheetClient";
import { reconcileScheduleImport, hashCsv, blockKey } from "@/features/iguard/lib/scheduleReconcile";
import { useUI } from "@/context/UIContext";
import {
  parseSheetUrl,
  parseCueSheetText,
  type ImportedBlock,
  staffWithAutoDrafts,
  postsWithAutoDrafts,
  collectAutoPostDrafts,
  cueBlockKey,
  venueForBlock,
  timeRangeLabel,
} from "@/features/iguard/lib/cueSheet";
import { looksLikeLegacySheetMovement, reconcileSegmentSheetMovements, type SegmentSheetMovement } from "@/features/iguard/lib/movementReconcile";
import { DEFAULT_SEGMENT_LABEL, isDefaultSegment } from "@/features/iguard/lib/defaultSegment";

/** 시트가 소유하는 블록 필드만 추림 — 갱신 시 이 필드만 덮고, 앱 소유 필드(noMovement)와 동선(별도 노드)은 건드리지 않는다.
 *  빈 값은 null로 지정해 시트에서 지워진 내용이 앱에도 반영되게 한다(update가 null 키를 삭제).
 *  day·start도 덮는다 — reconcile은 "실제 시각"으로 매칭하므로(blockKey), 같은 시각의 표기가 바뀌면
 *  (새벽의 논리 일차·24시+ 표기 정규화) 기존 블록의 표기를 갱신해 옮긴다. 동선은 blockId 기준이라 보존된다. */
function sheetOwnedFields(b: ImportedBlock, leaderNote?: string): Record<string, unknown> {
  return {
    day: b.day,
    start: b.start,
    label: b.label,
    end: b.end ?? null,
    meal: b.meal ?? null,
    detail: b.detail ?? null,
    owner: b.owner ?? null,
    notice: b.notice ?? null,
    ...(leaderNote !== undefined ? { leaderNote } : {}),
  };
}

function CueSheetLinkModal({ retreatId, retreatName, current, onClose, onSaved, children }: {
  retreatId: string;
  retreatName: string;
  current: IguardCueSheet | null;
  onClose: () => void;
  onSaved: (sheet: IguardCueSheet) => void;
  children?: ReactNode;
}) {
  const { toast } = useUI();
  const [name, setName] = useState(current?.name || retreatName);
  const [url, setUrl] = useState(current?.url || "");
  const [leaderTabName, setLeaderTabName] = useState(current?.leaderTabName ?? "조장 큐싯");
  const [saving, setSaving] = useState(false);
  const parsed = useMemo(() => parseSheetUrl(url.trim()), [url]);

  async function save() {
    if (!parsed) return toast("올바른 구글 시트 URL을 붙여넣어주세요.", "warning");
    setSaving(true);
    try {
      const sheet: IguardCueSheet = {
        url: url.trim(), sheetId: parsed.sheetId, gid: parsed.gid, name: name.trim() || undefined,
        leaderTabName: leaderTabName.trim() || undefined,
      };
      await saveIguardCueSheet(retreatId, sheet);
      onSaved(sheet);
      toast("시트 연동 설정을 저장했습니다.", "success");
    } catch (e) {
      toast(`저장 오류: ${e instanceof Error ? e.message : String(e)}`, "error");
    } finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4 modal-backdrop" onClick={onClose}>
      <div className="card max-h-[90vh] w-full max-w-3xl overflow-y-auto p-6 modal-card" onClick={e => e.stopPropagation()}>
        <h3 className="font-bold text-lg mb-2">큐싯 시트 연동 설정</h3>
        <p className="text-xs text-slate-500 leading-relaxed mb-4">
          Google 시트를 <strong>웹에 게시</strong>해야 데이터를 불러올 수 있습니다.<br />
          (파일 → 공유 → 웹에 게시 → CSV)
        </p>
        <label className="text-sm font-medium text-slate-600 block mb-1">수련회 이름</label>
        <input className="input w-full mb-4" value={name} onChange={e => setName(e.target.value)} placeholder="겨울수련회 사랑하셔서 오시었네" />
        <label className="text-sm font-medium text-slate-600 block mb-1">큐싯 시트 URL</label>
        <input className="input w-full" value={url} onChange={e => setUrl(e.target.value)} placeholder="https://docs.google.com/spreadsheets/d/..." />
        {url.trim() && (
          parsed ? (
            <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-700 leading-relaxed">
              <div className="font-semibold mb-1">✅ 파싱 성공</div>
              <div className="break-all">Sheet ID: {parsed.sheetId}</div>
              <div>GID: {parsed.gid}</div>
            </div>
          ) : (
            <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-700">
              ⚠️ URL에서 시트 ID를 찾지 못했습니다. 시트 주소창의 전체 URL을 붙여넣어주세요.
            </div>
          )
        )}

        <label className="text-sm font-medium text-slate-600 block mb-1 mt-4">조장 큐싯 탭 이름 <span className="text-slate-400 font-normal">(선택)</span></label>
        <input className="input w-full" value={leaderTabName} onChange={e => setLeaderTabName(e.target.value)} placeholder="조장 큐싯" />
        <p className="mt-1 text-[11px] text-slate-400">같은 시트 안 조장 큐싯 탭의 이름이에요. 비워두면 조장 큐싯은 가져오지 않습니다. (링크는 하나면 됩니다)</p>

        {children}

        <div className="flex gap-2 mt-5">
          <button onClick={save} disabled={saving || !parsed} className="btn-primary flex-1 justify-center disabled:opacity-50">{saving ? "저장 중…" : "저장"}</button>
          <button onClick={onClose} className="btn-secondary flex-1 justify-center">닫기</button>
        </div>
      </div>
    </div>
  );
}

export default function CueSheetImportPanel({ retreatId, retreatName, schedule, staff, posts, segments, movementRecords, buses, open, onClose }: {
  retreatId: string;
  retreatName: string;
  schedule: IguardScheduleBlock[];
  staff: IguardStaff[];
  posts: IguardPost[];
  segments: IguardSegment[];
  movementRecords: IguardMovement[];
  buses: IguardBus[];
  open: boolean;
  onClose: () => void;
}) {
  const { toast, uiConfirm } = useUI();
  const [text, setText] = useState("");
  const [autoCreatePosts, setAutoCreatePosts] = useState(true);
  const [autoAssign, setAutoAssign] = useState(true);
  const [autoApplyBusStaff, setAutoApplyBusStaff] = useState(true);
  const [sheet, setSheet] = useState<IguardCueSheet | null>(null);
  const [loadingSheet, setLoadingSheet] = useState(false);
  // 조장 큐싯: day__start → 내용 (가져오기 시 블록에 leaderNote로 기록)
  const [leaderMap, setLeaderMap] = useState<Map<string, string>>(new Map());

  useEffect(() => subscribeToIguardCueSheet(retreatId, setSheet,
    e => toast(`시트 설정 구독 실패 — ${e.message}`, "error")), [retreatId, toast]);

  async function loadFromSheet() {
    if (!sheet) return;
    setLoadingSheet(true);
    try {
      const csv = await fetchSheetCsv(`id=${encodeURIComponent(sheet.sheetId)}&gid=${encodeURIComponent(sheet.gid)}`);
      setText(csv);
      // 조장 큐싯: 같은 시트(시트ID) 안에서 탭 이름으로 함께 가져오기 — 링크 하나로 충분.
      // 탭 이름이 저장돼 있지 않아도 관례적 기본값("조장 큐싯")으로 시도한다.
      let leaderCount = 0;
      let leaderApplied = 0;
      let leaderError = false;
      const leaderTab = (sheet.leaderTabName?.trim()) || "조장 큐싯";
      try {
        const leaderCsv = await fetchSheetCsv(`id=${encodeURIComponent(sheet.sheetId)}&sheet=${encodeURIComponent(leaderTab)}`);
        const map = new Map<string, string>();
        parseCueSheetText(leaderCsv).blocks.forEach(b => {
          const note = (b.detail || "").trim();
          if (note) map.set(blockKey(b.day, b.start), note); // 실제 시각 정규 키 — 새벽 표기 차이 흡수
        });
        setLeaderMap(map);
        leaderCount = map.size;
        // 이미 있는 블록에도 즉시 반영 — 재가져오기 없이 조장 큐싯이 채워지도록
        for (const b of schedule) {
          const note = map.get(blockKey(b.day, b.start));
          if (note && note !== (b.leaderNote || "")) {
            await updateIguardScheduleBlock(retreatId, b.id, { leaderNote: note });
            leaderApplied++;
          }
        }
      } catch {
        setLeaderMap(new Map());
        leaderError = true;
      }
      if (leaderError) {
        toast(`본문은 불러왔지만 조장 큐싯 탭("${leaderTab}")을 찾지 못했습니다. 연동 설정에서 탭 이름을 확인해주세요.`, "warning");
      } else if (leaderApplied > 0) {
        toast(`시트에서 불러왔습니다. 기존 블록 ${leaderApplied}개에 조장 큐싯을 바로 채웠습니다${leaderCount ? ` (조장 큐싯 ${leaderCount}개 인식)` : ""}.`, "success");
      } else {
        toast(`시트에서 큐싯을 불러왔습니다${leaderCount ? ` (조장 큐싯 ${leaderCount}개 포함)` : ""}. 미리보기 확인 후 가져오기를 눌러주세요.`, "success");
      }
    } catch (e) {
      toast(`${e instanceof Error ? e.message : String(e)}`, "error");
    } finally { setLoadingSheet(false); }
  }

  const parsed = useMemo(() => parseCueSheetText(text, staff), [text, staff]);
  const preview = parsed.blocks.slice(0, 8);
  const autoStaffPreview = useMemo(
    () => staffWithAutoDrafts(staff, parsed.staffDrafts),
    [parsed.staffDrafts, staff]
  );
  // 자동 배정/포스트 미리보기는 행정 명단의 실제 스탭만 사용 (이가드는 스탭을 만들지 않음).
  const autoPostPreview = useMemo(
    () => postsWithAutoDrafts(parsed.blocks, staff, posts),
    [parsed.blocks, staff, posts]
  );
  const previewAutoAssignmentCount = useMemo(
    () => parsed.movementDrafts.length,
    [parsed.movementDrafts.length]
  );

  const compactIdentity = (value?: string | null) => (value || "")
    .trim()
    .toLocaleLowerCase("ko-KR")
    .replace(/sf$/i, "")
    .replace(/[\s\[\](){}._-]/g, "");

  function resolveStaffId(name?: string | null): string | null {
    if (!name) return null;
    const key = compactIdentity(name);
    return staff.find(member => compactIdentity(member.name) === key)?.id ?? null;
  }

  function postKey(area: string | undefined, name: string): string {
    return `${compactIdentity(area)}__${compactIdentity(name)}`;
  }

  // mode "merge": 시트 내용 반영(삭제 없음) / "replace": 시트에 없는 블록까지 삭제.
  // 두 모드 모두 day__start가 같은 기존 블록은 ID를 유지한 채 내용만 갱신 → 스탭 배정(동선)이 보존된다.
  async function importBlocks(mode: "merge" | "replace") {
    if (!parsed.blocks.length) return toast("가져올 시간 블록이 없습니다.", "warning");
    const { updates, creates, deletes } = reconcileScheduleImport(schedule, parsed.blocks);
    const additiveLine = autoAssign ? "\n· 시트 자동배정 동기화 (수동 배정은 유지, 시트에서 삭제된 자동배정은 제거)" : "";
    const confirmMsg = mode === "replace"
      ? `시트 기준으로 맞춥니다:\n· 유지·갱신 ${updates.length}개 (스탭 배정·동선 보존)\n· 신규 ${creates.length}개 추가${additiveLine}\n· 시트에 없는 ${deletes.length}개 삭제 (그 동선 배정도 함께 삭제)\n진행할까요?`
      : `시트 내용을 반영합니다 (삭제 없음):\n· 유지·갱신 ${updates.length}개 (스탭 배정·동선 보존)\n· 신규 ${creates.length}개 추가${additiveLine}\n진행할까요?`;
    if (!await uiConfirm(confirmMsg)) return;
    try {
      // 1) 시트에서 사라진 블록 삭제 (replace만). deleteIguardScheduleBlock가 그 블록의 동선도 함께 정리.
      let deletedCount = 0;
      if (mode === "replace") {
        for (const b of deletes) { await deleteIguardScheduleBlock(retreatId, b.id); deletedCount++; }
      }

      // 스탭은 행정 teachers가 단일 원천 — 이가드는 스탭을 생성하지 않는다(권한도 없음).
      // 시트에 있으나 행정 명단에 없는 이름은 생성 대신 경고로만 안내.
      const workingStaff = [...staff];
      const unmatchedStaffNames = [...new Set(autoStaffPreview.drafts.map(d => d.name))];
      const workingPosts = [...posts];
      let createdPostCount = 0;
      if (autoCreatePosts) {
        for (const draft of collectAutoPostDrafts(parsed.blocks, workingStaff, workingPosts)) {
          const postId = await saveIguardPost(retreatId, draft);
          workingPosts.push({ id: postId, ...draft });
          createdPostCount++;
        }
      }

      let leaderNoteCount = 0;
      const leaderNoteFor = (b: ImportedBlock) => {
        const note = leaderMap.get(blockKey(b.day, b.start));
        if (note) leaderNoteCount++;
        return note;
      };

      // 2) 기존 블록 내용 갱신 — ID 유지 → 수동 동선·noMovement 보존.
      const blockIdByCueKey = new Map<string, string>();
      for (const u of updates) {
        await updateIguardScheduleBlock(retreatId, u.id, sheetOwnedFields(u.imported, leaderNoteFor(u.imported)));
        blockIdByCueKey.set(cueBlockKey(u.imported.day, u.imported.start), u.id);
      }

      // 3) 신규 블록 생성. saveIguardScheduleBlock가 기본 구간도 같은 update에 함께 만든다.
      for (const block of creates) {
        const leaderNote = leaderNoteFor(block);
        const blockId = await saveIguardScheduleBlock(retreatId, leaderNote ? { ...block, leaderNote } : block);
        blockIdByCueKey.set(cueBlockKey(block.day, block.start), blockId);
      }

      // 4) 구간·동선 동기화. source=manual 및 출처 미상의 수동 데이터는 보존한다.
      let segmentCreateCount = 0;
      let segmentUpdateCount = 0;
      let segmentRemoveCount = 0;
      let assignmentCount = 0;
      let removedAssignmentCount = 0;
      let preservedManualSegmentCount = 0;
      const unmatchedMovementStaff = new Set<string>();
      if (autoAssign) {
        for (const block of parsed.blocks) {
          const cueKey = cueBlockKey(block.day, block.start);
          const blockId = blockIdByCueKey.get(cueKey);
          if (!blockId) continue;

          let existingBlockSegments = segments.filter(segment => segment.blockId === blockId);
          let defaultSegment = existingBlockSegments.find(isDefaultSegment);
          if (!defaultSegment) {
            const id = await ensureIguardDefaultSegment(retreatId, blockId);
            defaultSegment = { id, blockId, order: 0, label: DEFAULT_SEGMENT_LABEL, source: "manual" };
            existingBlockSegments = [...existingBlockSegments, defaultSegment];
          }

          const nextSegments = parsed.segments.filter(segment => segment.blockKey === cueKey);
          const segmentIdByOrder = new Map<number, string>([[0, defaultSegment.id]]);
          for (const draft of nextSegments) {
            const sameSheetOrder = existingBlockSegments.find(segment =>
              segment.order === draft.order && segment.source === "sheet");
            const sameManualShape = existingBlockSegments.find(segment =>
              segment.order === draft.order
              && segment.label === draft.label
              && (segment.zone || undefined) === draft.zone);
            const existingSegment = sameSheetOrder || sameManualShape;
            if (existingSegment) {
              segmentIdByOrder.set(draft.order, existingSegment.id);
              if (existingSegment.source === "sheet"
                && (existingSegment.label !== draft.label || (existingSegment.zone || undefined) !== draft.zone)) {
                await updateIguardSegment(retreatId, existingSegment.id, {
                  label: draft.label,
                  zone: draft.zone ?? null,
                });
                segmentUpdateCount++;
              }
            } else {
              const id = await saveIguardSegment(retreatId, {
                blockId,
                order: draft.order,
                label: draft.label,
                zone: draft.zone,
                source: "sheet",
              });
              segmentIdByOrder.set(draft.order, id);
              segmentCreateCount++;
            }
          }

          const nextOrders = new Set(nextSegments.map(segment => segment.order));
          for (const oldSegment of existingBlockSegments.filter(segment =>
            segment.order > 0 && segment.source === "sheet" && !nextOrders.has(segment.order))) {
            const attached = movementRecords.filter(movement => movement.segmentId === oldSegment.id);
            if (attached.some(movement => movement.source !== "sheet")) {
              preservedManualSegmentCount++;
              continue;
            }
            await deleteIguardSegment(retreatId, oldSegment.id);
            segmentRemoveCount++;
          }

          const postByKey = new Map(workingPosts.map(post => [postKey(post.area, post.name), post]));
          const area = venueForBlock(block, parsed.blocks);
          const actorSlots = new Map<string, number>();
          const nextMovements: SegmentSheetMovement[] = [];
          parsed.movementDrafts.filter(draft => draft.blockKey === cueKey).forEach(draft => {
            const segmentId = segmentIdByOrder.get(draft.segmentOrder);
            const post = postByKey.get(postKey(area, draft.postName));
            if (!segmentId || !post) return;
            const staffId = resolveStaffId(draft.staffName);
            if (draft.staffName && !staffId) {
              unmatchedMovementStaff.add(draft.staffName);
              return;
            }
            let slot = draft.slot;
            if (draft.actor) {
              const actorKey = `${segmentId}__${post.id}__${compactIdentity(draft.actor)}`;
              slot = (actorSlots.get(actorKey) || 0) + 1;
              actorSlots.set(actorKey, slot);
            }
            nextMovements.push({
              segmentId,
              blockId,
              postId: post.id,
              staffId,
              actor: draft.actor,
              slot,
              round: draft.round,
              detail: draft.detail,
              note: draft.note,
            });
          });

          const segmentIds = new Set(segmentIdByOrder.values());
          const existingBlockMovements = movementRecords
            .filter(movement => movement.blockId === blockId && (!movement.segmentId || segmentIds.has(movement.segmentId)))
            .map(movement => {
              if (movement.source != null) return movement;
              const assigneeName = movement.staffId
                ? workingStaff.find(member => member.id === movement.staffId)?.name
                : movement.actor || undefined;
              const legacySheetOwned = looksLikeLegacySheetMovement(
                movement,
                assigneeName,
                workingPosts.find(post => post.id === movement.postId)?.name,
              );
              return legacySheetOwned ? { ...movement, source: "sheet" as const } : movement;
            });
          const movementPlan = reconcileSegmentSheetMovements(existingBlockMovements, nextMovements);
          for (const movement of movementPlan.removes) {
            await deleteIguardMovementById(retreatId, movement.id);
            removedAssignmentCount++;
          }
          for (const movement of movementPlan.upserts) {
            await setIguardSegmentMovement(retreatId, movement);
            assignmentCount++;
          }
        }
      }

      // 5) 버스 선탑/동승 반영 (busNo 기준 보존/갱신)
      let busStaffCount = 0;
      if (autoApplyBusStaff) {
        for (const draft of parsed.busDrafts) {
          const existing = buses.find(bus => (bus.day === 3 ? 3 : 1) === draft.day && bus.busNo === draft.busNo);
          if (existing) {
            await updateIguardBus(retreatId, existing.id, { staff: draft.staff || undefined });
          } else {
            await saveIguardBus(retreatId, { day: draft.day, busNo: draft.busNo, groupIds: [], staff: draft.staff || undefined });
          }
          busStaffCount++;
        }
      }

      // 6) 스냅샷 마커 기록 — 이후 원본 시트가 바뀌면 신선도 배너가 뜨도록.
      await markCueSheetImported(retreatId, { hash: hashCsv(text), blockCount: parsed.blocks.length });

      toast(`갱신 ${updates.length}개, 신규 ${creates.length}개${mode === "replace" && deletedCount ? `, 삭제 ${deletedCount}개` : ""}${autoCreatePosts && createdPostCount ? `, 신규 포스트 ${createdPostCount}개` : ""}${autoAssign ? `, 구간 +${segmentCreateCount}/수정 ${segmentUpdateCount}/삭제 ${segmentRemoveCount}, 동선 반영 ${assignmentCount}건/정리 ${removedAssignmentCount}건` : ""}${autoApplyBusStaff && busStaffCount ? `, 버스 ${busStaffCount}건` : ""}${leaderNoteCount ? `, 조장 큐싯 ${leaderNoteCount}개` : ""} 반영했습니다.`, "success");
      const allUnmatched = [...new Set([...unmatchedStaffNames, ...unmatchedMovementStaff])];
      if (allUnmatched.length > 0) {
        toast(`행정 명단에 없는 스탭 ${allUnmatched.length}명은 배정에서 제외됐습니다: ${allUnmatched.join(", ")} — 행정 사이트에 먼저 추가해주세요.`, "warning");
      }
      if (preservedManualSegmentCount > 0) {
        toast(`시트에서 사라진 구간 ${preservedManualSegmentCount}개에는 사이트 수동 배정이 있어 보존했습니다.`, "warning");
      }
      setText("");
    } catch (e) {
      toast(`가져오기 오류: ${e instanceof Error ? e.message : String(e)}`, "error");
    }
  }

  if (!open) return null;

  return (
    <CueSheetLinkModal
      retreatId={retreatId}
      retreatName={retreatName}
      current={sheet}
      onClose={onClose}
      onSaved={setSheet}
    >
      <div className="mt-5 border-t border-slate-100 pt-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-sm font-semibold text-slate-800">초기 큐싯 가져오기</div>
          <div className="text-xs text-slate-500">새 수련회 시작 시 구글 시트나 표를 한 번 가져온 뒤, 이후 변경은 이 화면에서 직접 편집합니다.</div>
        </div>
      </div>

      {/* 시트 링크 연동 */}
      <div className="mb-3 rounded-xl border border-sky-100 bg-sky-50/60 p-3">
        <div className="flex flex-wrap items-center gap-2">
          {sheet ? (
            <>
              <span className="text-xs text-sky-800 font-medium">🔗 연동됨</span>
              <a href={sheet.url} target="_blank" rel="noopener noreferrer" className="text-xs text-sky-600 underline truncate max-w-[220px]">{sheet.name || sheet.sheetId}</a>
              <button onClick={loadFromSheet} disabled={loadingSheet} className="btn-primary btn-sm disabled:opacity-50">
                {loadingSheet ? "불러오는 중…" : "⬇️ 시트에서 불러오기"}
              </button>
            </>
          ) : (
            <>
              <span className="text-xs text-slate-500">위에 큐싯 시트 URL을 붙여넣고 저장하면 시트에서 바로 불러올 수 있습니다.</span>
            </>
          )}
        </div>
      </div>
      <div className="mb-3 flex flex-wrap gap-3">
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input
            type="checkbox"
            checked={autoCreatePosts}
            onChange={e => setAutoCreatePosts(e.target.checked)}
          />
          담당 칸의 역할명을 포스트로 자동 생성
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input
            type="checkbox"
            checked={autoAssign}
            onChange={e => setAutoAssign(e.target.checked)}
          />
          스탭 이름과 포스트를 찾아 스탭 배정도 함께 생성
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input
            type="checkbox"
            checked={autoApplyBusStaff}
            onChange={e => setAutoApplyBusStaff(e.target.checked)}
          />
          n호차 선탑/동승 스탭을 버스 탭에 반영
        </label>
      </div>
      <textarea
        value={text}
        onChange={e => setText(e.target.value)}
        placeholder={"구분\t시간\t내용\t담당\t기타\n등록\t09:00~10:00\t08:50 등록부스 설치...\t진행 및 총괄: 박세원\t특이사항..."}
        className="w-full min-h-[150px] text-sm leading-relaxed text-slate-700 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 outline-none focus:border-fuchsia-400 resize-y"
      />
      {text.trim() && (
        <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <span className="text-sm font-semibold text-slate-700">미리보기 &middot; {parsed.blocks.length}개</span>
            {Object.entries(parsed.dayCounts).map(([day, count]) => (
              <span key={day} className="text-[11px] text-fuchsia-700 bg-fuchsia-50 border border-fuchsia-100 rounded-full px-2 py-0.5">{day}일차 {count}개</span>
            ))}
            {parsed.importStats.detailCount > 0 && (
              <span className="text-[11px] text-slate-600 bg-white border border-slate-200 rounded-full px-2 py-0.5">세부내용 {parsed.importStats.detailCount}개</span>
            )}
            {parsed.importStats.ownerCount > 0 && (
              <span className="text-[11px] text-slate-600 bg-white border border-slate-200 rounded-full px-2 py-0.5">담당 {parsed.importStats.ownerCount}개</span>
            )}
            {parsed.importStats.noticeCount > 0 && (
              <span className="text-[11px] text-slate-600 bg-white border border-slate-200 rounded-full px-2 py-0.5">특이사항 {parsed.importStats.noticeCount}개</span>
            )}
            {autoAssign && (
              <>
                <span className="text-[11px] text-sky-700 bg-sky-50 border border-sky-100 rounded-full px-2 py-0.5">구간 {parsed.importStats.segmentCount}개</span>
                <span className="text-[11px] text-sky-700 bg-sky-50 border border-sky-100 rounded-full px-2 py-0.5">예상 동선 {previewAutoAssignmentCount}건</span>
                {parsed.importStats.tbdCount > 0 && (
                  <span className="text-[11px] text-amber-700 bg-amber-50 border border-amber-100 rounded-full px-2 py-0.5">담당 미정 {parsed.importStats.tbdCount}건</span>
                )}
              </>
            )}
            {leaderMap.size > 0 && (
              <span className="text-[11px] text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-full px-2 py-0.5">조장 큐싯 {leaderMap.size}개</span>
            )}
            {autoStaffPreview.drafts.length > 0 && (
              <span className="text-[11px] text-amber-700 bg-amber-50 border border-amber-100 rounded-full px-2 py-0.5">행정 명단에 없는 스탭 {autoStaffPreview.drafts.length}명(배정 제외)</span>
            )}
            {autoCreatePosts && autoPostPreview.drafts.length > 0 && (
              <span className="text-[11px] text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-full px-2 py-0.5">예상 신규 포스트 {autoPostPreview.drafts.length}개</span>
            )}
            {autoApplyBusStaff && parsed.busDrafts.length > 0 && (
              <span className="text-[11px] text-orange-700 bg-orange-50 border border-orange-100 rounded-full px-2 py-0.5">버스 선탑/동승 {parsed.busDrafts.length}건</span>
            )}
            {parsed.warnings.slice(0, 3).map((w, i) => <span key={i} className="text-[11px] text-amber-700 bg-amber-50 border border-amber-100 rounded-full px-2 py-0.5">{w}</span>)}
          </div>
          {preview.length > 0 && (
            <div className="space-y-1">
              {preview.map((b, i) => (
                <div key={i} className="grid gap-2 rounded-lg bg-white border border-slate-100 px-3 py-2 text-xs text-slate-600 md:grid-cols-[70px_110px_1fr_1fr]">
                  <span className="font-semibold text-fuchsia-700">{b.day}일차</span>
                  <span className="font-mono">{timeRangeLabel(b.start, b.end)}</span>
                  <span className="font-semibold text-slate-800 truncate">{b.label}</span>
                  <span className="truncate">{b.owner || b.notice || b.detail || "내용 없음"}</span>
                </div>
              ))}
            </div>
          )}
          <p className="mt-3 text-[11px] text-slate-400 leading-relaxed">
            초기 자료를 옮길 때만 사용하세요. 두 방식 모두 같은 시각의 블록 내용은 갱신하며, <strong>사이트에서 직접 만든 수동 배정은 유지합니다.</strong> 가져온 뒤에는 시간 블록·구간·담당자를 사이트에서 관리합니다. 새벽 일정(예: 2일차 00:30)은 전날 24시+ 표기(1일차 24:30)로 자동 정리됩니다.
          </p>
          <div className="flex justify-end gap-2 mt-2">
            <button type="button" onClick={() => importBlocks("merge")} className="btn-secondary">시트 반영 (삭제 없음)</button>
            <button type="button" onClick={() => importBlocks("replace")} className="btn-primary">시트 기준 정리 (없는 블록 삭제)</button>
          </div>
        </div>
      )}
      </div>
    </CueSheetLinkModal>
  );
}
