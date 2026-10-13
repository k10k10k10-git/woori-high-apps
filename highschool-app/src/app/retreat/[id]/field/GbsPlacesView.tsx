"use client";

import { FormEvent, useMemo, useState } from "react";
import { Group, IguardGbsPlace } from "@/features/iguard/lib/types";
import { saveIguardGbsPlace } from "@/features/iguard/lib/db";
import { buildGbsPlaceSummaries, effectiveGbsPlace } from "@/features/iguard/lib/gbsPlaces";
import { groupDisplayName, sortGroupsByDisplayNumber } from "@/lib/groupNumber";
import { useUI } from "@/context/UIContext";

interface Props {
  retreatId: string;
  groups: Group[];
  gbs: Record<string, IguardGbsPlace>;
}

export default function GbsPlacesView({ retreatId, groups, gbs }: Props) {
  const { toast } = useUI();
  const sortedGroups = useMemo(() => sortGroupsByDisplayNumber(groups), [groups]);
  const [groupId, setGroupId] = useState("");
  const [place, setPlace] = useState("");
  const [saving, setSaving] = useState(false);
  const summaries = useMemo(() => buildGbsPlaceSummaries(groups, gbs), [groups, gbs]);
  const selectedGroup = groups.find(group => group.id === groupId);

  function selectGroup(nextId: string) {
    setGroupId(nextId);
    const group = groups.find(candidate => candidate.id === nextId);
    setPlace(group ? effectiveGbsPlace(group, gbs) : "");
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!groupId) {
      toast("먼저 조를 선택하세요.", "warning");
      return;
    }
    setSaving(true);
    try {
      await saveIguardGbsPlace(retreatId, groupId, place);
      toast(place.trim() ? "GBS 장소를 저장했습니다." : "이가드 GBS 장소를 지웠습니다.", "success");
    } catch (error) {
      toast(`저장 오류: ${error instanceof Error ? error.message : String(error)}`, "error");
    } finally {
      setSaving(false);
    }
  }

  if (groups.length === 0) {
    return <div className="card p-8 text-center text-sm text-slate-400">행정 사이트에서 조편성을 먼저 완료해 주세요.</div>;
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-emerald-100 bg-emerald-50 p-3 text-xs leading-relaxed text-emerald-700">
        조별 GBS 장소는 이가드에 저장됩니다. 기존 행정 조편성의 GBS 값은 새 값을 저장하기 전까지만 폴백으로 표시합니다.
      </div>

      <form onSubmit={save} className="card grid gap-3 p-4 sm:grid-cols-[minmax(12rem,0.8fr)_minmax(16rem,1.2fr)_auto] sm:items-end">
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-slate-500">조 선택</span>
          <select className="input h-11 w-full" value={groupId} onChange={event => selectGroup(event.target.value)}>
            <option value="">조를 선택하세요</option>
            {sortedGroups.map(group => (
              <option key={group.id} value={group.id}>
                {groupDisplayName(group, groups)}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-slate-500">GBS 장소</span>
          <input
            className="input h-11 w-full"
            value={place}
            onChange={event => setPlace(event.target.value)}
            placeholder="예: 숙소동 분임실 131호"
            disabled={!selectedGroup}
          />
        </label>
        <button type="submit" className="btn-primary min-h-11 justify-center px-5" disabled={!selectedGroup || saving}>
          {saving ? "저장 중…" : "저장"}
        </button>
        {selectedGroup && selectedGroup.gbs && !gbs[selectedGroup.id]?.place && (
          <p className="text-xs text-slate-400 sm:col-span-3">
            현재 보이는 값은 행정 조편성의 기존 값입니다. 빈 값으로 저장하면 폴백 값은 계속 보이며, 새 장소를 입력하면 이가드 값이 우선합니다.
          </p>
        )}
      </form>

      <section className="card overflow-hidden" aria-labelledby="gbs-group-list-title">
        <div className="border-b border-slate-100 px-4 py-3">
          <h2 id="gbs-group-list-title" className="font-semibold text-slate-800">조별 장소</h2>
        </div>
        <div className="grid gap-2 p-3 sm:grid-cols-2 lg:grid-cols-3">
          {sortedGroups.map(group => {
            const value = effectiveGbsPlace(group, gbs);
            return (
              <button
                key={group.id}
                type="button"
                onClick={() => selectGroup(group.id)}
                className="min-h-16 rounded-lg border border-slate-200 bg-white p-3 text-left transition hover:border-emerald-300 hover:bg-emerald-50"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-slate-800">{groupDisplayName(group, groups)}</span>
                  <span className={`text-[11px] ${gbs[group.id]?.place ? "text-emerald-600" : "text-slate-400"}`}>
                    {gbs[group.id]?.place ? "이가드" : group.gbs ? "행정 폴백" : "미지정"}
                  </span>
                </div>
                <div className={`mt-1 text-sm ${value ? "text-slate-600" : "text-slate-300"}`}>{value || "장소 없음"}</div>
              </button>
            );
          })}
        </div>
      </section>

      <section className="card p-4" aria-labelledby="gbs-place-list-title">
        <h2 id="gbs-place-list-title" className="font-semibold text-slate-800">장소별 조 목록</h2>
        <p className="mt-0.5 text-xs text-slate-400">별도 저장하지 않고 위 조별 장소에서 자동 계산합니다.</p>
        {summaries.length === 0 ? (
          <p className="mt-4 text-sm text-slate-400">지정된 GBS 장소가 없습니다.</p>
        ) : (
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {summaries.map(summary => (
              <div key={summary.place} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <div className="text-sm font-semibold text-slate-800">{summary.place}</div>
                <div className="mt-2 flex flex-wrap gap-1">
                  {summary.groups.map(group => (
                    <span key={group.id} className="rounded-full border border-emerald-200 bg-white px-2 py-1 text-xs text-emerald-700">
                      {group.label}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
