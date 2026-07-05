"use client";
import { useMemo, useState } from "react";
import { Group, IguardSeating, IguardSeatingZone, IguardMeal } from "@/lib/types";
import { saveIguardSeating, updateIguardSeating, deleteIguardSeating } from "@/lib/db";
import { useUI } from "@/context/UIContext";
import { groupDisplayName } from "@/lib/groupNumber";
import FairAssignButton from "./FairAssignButton";

const groupSort = (a: Group, b: Group) => a.bu.localeCompare(b.bu, "ko") || a.name.localeCompare(b.name, "ko", { numeric: true });

function parseLayoutPattern(value: string): number[] {
  const normalized = value.replace(/[×xX]/g, "*").replace(/[，,/\s]+/g, " ").trim();
  if (!normalized) return [];
  const star = normalized.match(/^(\d+)\s*\*\s*(\d+)$/);
  if (star) {
    const count = Number(star[1]);
    const repeat = Number(star[2]);
    return count > 0 && repeat > 0 ? Array.from({ length: repeat }, () => count) : [];
  }
  if (/^\d+$/.test(normalized) && normalized.length > 1) return normalized.split("").map(Number).filter(n => n > 0);
  return normalized.split(" ").map(v => Number(v)).filter(n => Number.isFinite(n) && n > 0);
}

export default function SeatingView({ retreatId, seating, groups, meals }: { retreatId: string; seating: IguardSeating[]; groups: Group[]; meals: IguardMeal[] }) {
  const { toast, uiConfirm } = useUI();
  const sortedGroups = useMemo(() => [...groups].sort(groupSort), [groups]);
  const [label, setLabel] = useState("");
  const [day, setDay] = useState(1);
  const [zoneInputs, setZoneInputs] = useState<Record<string, string>>({});
  const [patternInputs, setPatternInputs] = useState<Record<string, string>>({});
  const [avoidInputs, setAvoidInputs] = useState<Record<string, string>>({});
  const [pinnedInputs, setPinnedInputs] = useState<Record<string, string>>({});

  async function addSession() {
    if (!label.trim()) return toast("집회/세션 이름을 입력해주세요.", "warning");
    try { await saveIguardSeating(retreatId, { label: label.trim(), day, order: seating.length, zones: [] }); setLabel(""); }
    catch (e) { toast(`저장 오류: ${e instanceof Error ? e.message : String(e)}`, "error"); }
  }
  async function delSession(s: IguardSeating) {
    if (!await uiConfirm(`"${s.label}" 자리배치를 삭제할까요?`)) return;
    try { await deleteIguardSeating(retreatId, s.id); } catch (e) { toast(`삭제 오류: ${e}`, "error"); }
  }
  async function setZones(s: IguardSeating, zones: IguardSeatingZone[]) {
    try { await updateIguardSeating(retreatId, s.id, { zones }); } catch (e) { toast(`저장 오류: ${e instanceof Error ? e.message : String(e)}`, "error"); }
  }
  async function saveLayoutPattern(s: IguardSeating, value: string) {
    try { await updateIguardSeating(retreatId, s.id, { layoutPattern: value.trim() || null }); } catch (e) { toast(`저장 오류: ${e instanceof Error ? e.message : String(e)}`, "error"); }
  }
  async function saveZoneWeight(s: IguardSeating, zi: number, value: string) {
    const parsed = Number(value);
    const next = [...(s.zoneWeights || [])];
    if (Number.isFinite(parsed) && parsed >= 0) next[zi] = parsed;
    else delete next[zi];
    try { await updateIguardSeating(retreatId, s.id, { zoneWeights: next.length ? next : null }); } catch (e) { toast(`저장 오류: ${e instanceof Error ? e.message : String(e)}`, "error"); }
  }
  async function saveAvoidPairs(s: IguardSeating) {
    const value = (avoidInputs[s.id] ?? s.avoidPairs ?? "").trim();
    try { await updateIguardSeating(retreatId, s.id, { avoidPairs: value || null }); } catch (e) { toast(`저장 오류: ${e instanceof Error ? e.message : String(e)}`, "error"); }
  }
  async function savePinnedFront(s: IguardSeating, value: string) {
    try { await updateIguardSeating(retreatId, s.id, { pinnedFront: value.trim() || null }); } catch (e) { toast(`저장 오류: ${e instanceof Error ? e.message : String(e)}`, "error"); }
  }
  function addZone(s: IguardSeating) {
    const name = (zoneInputs[s.id] || "").trim();
    if (!name) return;
    setZones(s, [...(s.zones || []), { name, groupIds: [] }]);
    setZoneInputs(p => ({ ...p, [s.id]: "" }));
  }
  function toggleGroup(s: IguardSeating, zi: number, gid: string) {
    const zones = (s.zones || []).map((z, i) => {
      if (i !== zi) return z;
      const gids = z.groupIds || [];
      return { ...z, groupIds: gids.includes(gid) ? gids.filter(x => x !== gid) : [...gids, gid] };
    });
    setZones(s, zones);
  }
  function delZone(s: IguardSeating, zi: number) { setZones(s, (s.zones || []).filter((_, i) => i !== zi)); }
  function applyRowPattern(s: IguardSeating) {
    const pattern = (patternInputs[s.id] ?? s.layoutPattern ?? "").trim();
    const counts = parseLayoutPattern(pattern);
    if (!counts.length) return toast("열별 조 개수를 입력해주세요. 예: 3 3 4 4", "warning");
    const zones: IguardSeatingZone[] = [];
    let cursor = 0;
    counts.forEach((count, index) => {
      zones.push({
        name: `${index + 1}열`,
        groupIds: sortedGroups.slice(cursor, cursor + count).map(g => g.id),
      });
      cursor += count;
    });
    if (cursor < sortedGroups.length) {
      zones.push({
        name: `${zones.length + 1}열`,
        groupIds: sortedGroups.slice(cursor).map(g => g.id),
      });
    }
    const defaultWeights = zones.map((_, i) => zones.length > 1 ? Math.round(((zones.length - 1 - i) / (zones.length - 1)) * 100) / 100 : 1);
    updateIguardSeating(retreatId, s.id, { layoutPattern: pattern, zones, zoneWeights: s.zoneWeights?.length ? s.zoneWeights : defaultWeights })
      .catch(e => toast(`저장 오류: ${e instanceof Error ? e.message : String(e)}`, "error"));
  }

  return (
    <div>
      <div className="mb-4 bg-violet-50 border border-violet-100 rounded-lg p-3 text-xs text-violet-700">
        ℹ️ 집회/예배별 자리 배치(구역 → 조). 구역(예: 5층, 앞열)을 <strong>앞→뒤 순서</strong>로 만드세요(첫 구역=앞자리). 조 명단은 행정 데이터에서 옵니다.
      </div>
      <div className="flex justify-end mb-3">
        <FairAssignButton retreatId={retreatId} groups={groups} meals={meals} seatings={seating} />
      </div>
      <div className="flex flex-wrap items-end gap-2 mb-5">
        <div><label className="text-xs text-slate-500 block mb-1">일자</label>
          <select className="input w-24" value={day} onChange={e => setDay(parseInt(e.target.value))}>{[1, 2, 3].map(d => <option key={d} value={d}>{d}일차</option>)}</select></div>
        <div className="flex-1 min-w-[160px]"><label className="text-xs text-slate-500 block mb-1">집회/세션 이름</label>
          <input className="input" placeholder="예: 저녁 집회 1" value={label} onChange={e => setLabel(e.target.value)} onKeyDown={e => e.key === "Enter" && addSession()} /></div>
        <button onClick={addSession} className="btn-primary">＋ 추가</button>
      </div>

      {seating.length === 0 ? (
        <div className="card p-8 text-center text-slate-400"><div className="text-3xl mb-2">🪑</div><p>등록된 자리배치가 없습니다.</p></div>
      ) : (
        <div className="space-y-4">
          {seating.map(s => (
            <div key={s.id} className="card p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-slate-700 flex items-center gap-2 flex-wrap">
                  <span className="px-2 py-0.5 rounded text-xs bg-indigo-100 text-indigo-600">{s.day}일차</span>
                  <span>{s.label}</span>
                </h3>
                <button onClick={() => delSession(s)} className="text-xs text-slate-300 hover:text-red-400">삭제</button>
              </div>
              <div className="space-y-3">
                <div className="rounded-lg border border-slate-100 bg-slate-50 p-3">
                  <label className="text-xs font-semibold text-slate-500 block mb-1">열별 조 수</label>
                  <div className="flex flex-wrap gap-2">
                    <input
                      className="input flex-1 min-w-[180px] bg-white"
                      placeholder="예: 4*4 / 333322 / 3 3 4 4"
                      value={patternInputs[s.id] ?? s.layoutPattern ?? ""}
                      onChange={e => setPatternInputs(p => ({ ...p, [s.id]: e.target.value }))}
                      onBlur={e => saveLayoutPattern(s, e.target.value)}
                      onKeyDown={e => e.key === "Enter" && applyRowPattern(s)}
                    />
                    <button onClick={() => applyRowPattern(s)} className="btn-secondary btn-sm">열 패턴 적용</button>
                  </div>
                  <p className="mt-1 text-[11px] text-slate-400">입력한 숫자대로 앞열부터 조를 나눕니다. 예: 4*4는 4개 조씩 4열, 333322는 3·3·3·3·2·2열입니다.</p>
                </div>
                <div className="rounded-lg border border-slate-100 bg-white p-3">
                  <label className="text-xs font-semibold text-slate-500 block mb-1">붙이면 안 되는 조</label>
                  <textarea
                    className="input min-h-[74px] resize-y leading-relaxed"
                    placeholder={"예: 1조-2조\n1부 3조, 2부 4조"}
                    value={avoidInputs[s.id] ?? s.avoidPairs ?? ""}
                    onChange={e => setAvoidInputs(p => ({ ...p, [s.id]: e.target.value }))}
                    onBlur={() => saveAvoidPairs(s)}
                  />
                  <p className="mt-1 text-[11px] text-slate-400">공정배정 시 같은 열에 들어가지 않도록 최대한 분리합니다.</p>
                </div>
                <div className="rounded-lg border border-slate-100 bg-white p-3">
                  <label className="text-xs font-semibold text-slate-500 block mb-1">맨앞 고정 조</label>
                  <input
                    className="input"
                    placeholder="예: 1조 또는 1조, 3조 (이 집회만 자동배정 시 맨 앞자리로)"
                    value={pinnedInputs[s.id] ?? s.pinnedFront ?? ""}
                    onChange={e => setPinnedInputs(p => ({ ...p, [s.id]: e.target.value }))}
                    onBlur={e => savePinnedFront(s, e.target.value)}
                  />
                  <p className="mt-1 text-[11px] text-slate-400">쉼표로 여러 조 입력 시 적힌 순서대로 앞자리부터 배정됩니다. &ldquo;붙이면 안 되는 조&rdquo; 조건이 우선될 수 있어 드물게 밀릴 수 있습니다.</p>
                </div>
                {(s.zones || []).map((z, zi) => (
                  <div key={zi} className="border border-slate-100 rounded-lg p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                      <span className="text-sm font-medium text-slate-600">{z.name} <span className="text-xs text-slate-400">· {(z.groupIds || []).length}개 조</span></span>
                      <div className="flex items-center gap-2">
                        <label className="flex items-center gap-1 text-[11px] text-slate-400">
                          자리 점수
                          <input
                            className="h-7 w-16 rounded-md border border-slate-200 bg-white px-2 text-xs text-slate-600 outline-none focus:border-violet-300"
                            type="number"
                            min={0}
                            step={0.1}
                            defaultValue={s.zoneWeights?.[zi] ?? (s.zones.length > 1 ? Math.round(((s.zones.length - 1 - zi) / (s.zones.length - 1)) * 100) / 100 : 1)}
                            onBlur={e => saveZoneWeight(s, zi, e.target.value)}
                          />
                        </label>
                        <button onClick={() => delZone(s, zi)} className="text-xs text-slate-300 hover:text-red-400">구역 삭제</button>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {sortedGroups.map(g => (
                        <button key={g.id} onClick={() => toggleGroup(s, zi, g.id)}
                          className={`px-2 py-1 rounded text-xs border ${(z.groupIds || []).includes(g.id) ? "bg-violet-100 text-violet-700 border-violet-300" : "bg-white text-slate-400 border-slate-200"}`}>{groupDisplayName(g, groups)}</button>
                      ))}
                    </div>
                  </div>
                ))}
                <div className="flex gap-2">
                  <input className="input max-w-[180px]" placeholder="구역 추가 (예: 5층)" value={zoneInputs[s.id] || ""}
                    onChange={e => setZoneInputs(p => ({ ...p, [s.id]: e.target.value }))} onKeyDown={e => e.key === "Enter" && addZone(s)} />
                  <button onClick={() => addZone(s)} className="btn-secondary btn-sm">＋ 구역</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
