"use client";

import { useMemo, useState } from "react";
import { badgeCardsHtml, buildBadgeCard, type BadgeCardInput } from "@/features/iguard/lib/badgeCard";
import { printAsPDF } from "@/features/iguard/lib/exportUtils";
import { useUI } from "@/context/UIContext";

interface Props extends BadgeCardInput {
  retreatId: string;
  retreatName: string;
  year: number;
}

export default function BadgeCardsView(props: Props) {
  const { toast } = useUI();
  // 저장된 선택은 최초 1회 lazy 초기화로 읽는다. 유효성(명단에 아직 있는가) 판정은
  // 렌더 중 파생 — effect에서 setState하면 cascading render가 되고 실수 13의 씨앗이 된다.
  const [staffId, setStaffId] = useState<string>(() => {
    try { return window.localStorage.getItem(`iguard:${props.retreatId}:badge-card-staff`) ?? ""; }
    catch { return ""; }
  });
  const sortedStaff = useMemo(
    () => [...props.staff].sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.name.localeCompare(b.name, "ko")),
    [props.staff],
  );
  const selectionKey = `iguard:${props.retreatId}:badge-card-staff`;
  const activeStaffId = sortedStaff.some(member => member.id === staffId)
    ? staffId
    : (sortedStaff[0]?.id ?? "");
  const card = useMemo(() => buildBadgeCard(activeStaffId, props), [activeStaffId, props]);


  function printCards(ids: string[]) {
    const cards = ids.map(id => buildBadgeCard(id, props)).filter((item): item is NonNullable<typeof item> => !!item);
    if (cards.length === 0) {
      toast("인쇄할 스탭 카드가 없습니다.", "warning");
      return;
    }
    printAsPDF(badgeCardsHtml(cards, props.retreatName, props.year), "이가드-명찰카드", false);
  }

  if (sortedStaff.length === 0) {
    return <div className="card p-8 text-center text-sm text-slate-400">행정 스탭 명단을 먼저 등록해 주세요.</div>;
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-fuchsia-100 bg-fuchsia-50 p-3 text-xs leading-relaxed text-fuchsia-700">
        버스·식사·GBS·집회 자리·담당 구역을 한 장에 모아 명찰용 카드를 만듭니다. 담당 구역은 큐싯의 괄호 상세와 방배정을 연결합니다.
      </div>
      <div className="card flex flex-col gap-3 p-4 sm:flex-row sm:items-end">
        <label className="min-w-0 flex-1">
          <span className="mb-1 block text-xs font-semibold text-slate-500">스탭 선택</span>
          <select
            className="input h-11 w-full"
            value={activeStaffId}
            onChange={event => {
              setStaffId(event.target.value);
              window.localStorage.setItem(selectionKey, event.target.value);
            }}
          >
            {sortedStaff.map(member => <option key={member.id} value={member.id}>{member.name}</option>)}
          </select>
        </label>
        <button type="button" className="btn-secondary min-h-11 justify-center" onClick={() => printCards([activeStaffId])}>선택 카드 인쇄</button>
        <button type="button" className="btn-primary min-h-11 justify-center" onClick={() => printCards(sortedStaff.map(member => member.id))}>전체 카드 인쇄</button>
      </div>

      {card && (
        <section className="card p-4" aria-labelledby="badge-preview-title">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 id="badge-preview-title" className="font-semibold text-slate-800">{card.staffName} 카드 미리보기</h2>
            <span className="text-xs text-slate-400">스탭 1명당 A4 1장</span>
          </div>
          <div className="grid gap-3 text-sm sm:grid-cols-2">
            <Preview label="호차·동승" values={card.buses.map(bus => `${bus.day}일차 ${bus.busNo}호차 · ${bus.groups.join(", ") || "조 미지정"}${bus.companions.length ? ` · ${bus.companions.join(", ")}` : ""}`)} />
            <Preview label="식사 이동" values={card.meals.map(meal => `${meal.label}: ${meal.groups.join(" → ")}`)} />
            <Preview label="GBS 장소" values={card.gbs.map(item => `${item.groups.join(", ")}: ${item.place}`)} />
            <SeatingMapPreview sessions={card.seating} />
            <TimelinePreview entries={card.timeline} />
          </div>
        </section>
      )}
    </div>
  );
}

function Preview({ label, values }: { label: string; values: string[] }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
      <h3 className="mb-1.5 text-xs font-semibold text-slate-500">{label}</h3>
      {values.length > 0
        ? <div className="space-y-1 whitespace-pre-line text-xs leading-relaxed text-slate-700">{values.map((value, index) => <div key={`${value}-${index}`}>{value}</div>)}</div>
        : <div className="text-xs text-slate-300">배정 없음</div>}
    </div>
  );
}

function SeatingMapPreview({ sessions }: { sessions: NonNullable<ReturnType<typeof buildBadgeCard>>["seating"] }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
      <h3 className="mb-2 text-xs font-semibold text-slate-500">집회 이동</h3>
      {sessions.length === 0 ? (
        <div className="text-xs text-slate-300">배정 없음</div>
      ) : (
        <div className="space-y-3">
          {sessions.map(session => (
            <div key={session.label}>
              <div className="mb-1.5 text-xs font-semibold text-slate-700">{session.label}</div>
              <div className="rounded-t-md bg-slate-800 py-1 text-center text-[10px] font-semibold tracking-[0.25em] text-white">무대</div>
              <div className="space-y-1 rounded-b-md border border-t-0 border-slate-200 bg-white p-2">
                {session.zoneGroups.map((groups, index) => (
                  <div key={`${session.label}-${index}`} className="flex min-h-8 items-center justify-center gap-1 rounded-md bg-indigo-50 px-2 py-1">
                    {groups.length
                      ? groups.map(group => <span key={group} className="rounded bg-white px-2 py-1 text-xs font-semibold text-indigo-700 shadow-sm">{group}</span>)
                      : <span className="text-xs text-slate-300">미배정</span>}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function TimelinePreview({ entries }: { entries: NonNullable<ReturnType<typeof buildBadgeCard>>["timeline"] }) {
  const days = [...new Set(entries.map(entry => entry.day))];
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 sm:col-span-2">
      <h3 className="mb-2 text-xs font-semibold text-slate-500">전체 일정</h3>
      {entries.length === 0 ? (
        <div className="text-xs text-slate-300">등록된 일정 없음</div>
      ) : (
        <div className="grid gap-3 lg:grid-cols-3">
          {days.map(day => (
            <div key={day} className="overflow-hidden rounded-lg border border-slate-200 bg-white">
              <div className="bg-slate-800 px-3 py-2 text-xs font-bold text-white">{day}일차</div>
              <div className="divide-y divide-slate-100">
                {entries.filter(entry => entry.day === day).map((entry, index) => (
                  <div key={`${entry.time}-${entry.label}-${index}`} className="grid grid-cols-[88px_minmax(0,1fr)] gap-2 px-3 py-2 text-xs">
                    <span className="font-mono text-slate-400">{entry.time}</span>
                    <span className="min-w-0">
                      <strong className="block text-slate-700">{entry.label}</strong>
                      <span className={entry.assignments.length ? "text-fuchsia-700" : "text-slate-300"}>
                        {entry.assignments.length ? `📍 ${entry.assignments.join(" / ")}` : "조와 함께"}
                      </span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
