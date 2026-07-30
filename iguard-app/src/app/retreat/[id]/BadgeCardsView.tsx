"use client";

import { useMemo, useState } from "react";
import { badgeCardsHtml, buildBadgeCard, type BadgeCardInput } from "@/lib/badgeCard";
import { printAsPDF } from "@/lib/exportUtils";
import { useUI } from "@/context/UIContext";

interface Props extends BadgeCardInput {
  retreatName: string;
  year: number;
}

export default function BadgeCardsView(props: Props) {
  const { toast } = useUI();
  const [staffId, setStaffId] = useState(props.staff[0]?.id || "");
  const sortedStaff = useMemo(
    () => [...props.staff].sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.name.localeCompare(b.name, "ko")),
    [props.staff],
  );
  const card = useMemo(() => buildBadgeCard(staffId, props), [staffId, props]);

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
          <select className="input h-11 w-full" value={staffId} onChange={event => setStaffId(event.target.value)}>
            {sortedStaff.map(member => <option key={member.id} value={member.id}>{member.name}</option>)}
          </select>
        </label>
        <button type="button" className="btn-secondary min-h-11 justify-center" onClick={() => printCards([staffId])}>선택 카드 인쇄</button>
        <button type="button" className="btn-primary min-h-11 justify-center" onClick={() => printCards(sortedStaff.map(member => member.id))}>전체 카드 인쇄</button>
      </div>

      {card && (
        <section className="card p-4" aria-labelledby="badge-preview-title">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 id="badge-preview-title" className="font-semibold text-slate-800">{card.staffName} 카드 미리보기</h2>
            <span className="text-xs text-slate-400">인쇄본은 A4 2열 배치</span>
          </div>
          <div className="grid gap-3 text-sm sm:grid-cols-2">
            <Preview label="호차·동승" values={card.buses.map(bus => `${bus.day}일차 ${bus.busNo}호차 · ${bus.groups.join(", ") || "조 미지정"}${bus.companions.length ? ` · ${bus.companions.join(", ")}` : ""}`)} />
            <Preview label="식사 이동" values={card.meals.map(meal => `${meal.label}: ${meal.groups.join(" → ")}`)} />
            <Preview label="GBS 장소" values={card.gbs.map(item => `${item.place}: ${item.groups.join(", ")}`)} />
            <Preview label="집회 이동" values={card.seating.flatMap(session => session.zones.map(zone => `${session.label} · ${zone}`))} />
            <Preview
              label="담당 구역 호실별 학생"
              values={[
                ...card.assignedRooms.map(room => `${room.label}: ${room.studentNames.join(", ")}`),
                ...card.unmatchedAreaDetails.map(detail => `구역 확인 필요: ${detail}`),
              ]}
            />
            <Preview label="특정 조건 학생" values={["학생 속성 미연동 — 행정 데이터 계약 후 제공"]} muted />
          </div>
        </section>
      )}
    </div>
  );
}

function Preview({ label, values, muted = false }: { label: string; values: string[]; muted?: boolean }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
      <h3 className="mb-1.5 text-xs font-semibold text-slate-500">{label}</h3>
      {values.length > 0
        ? <div className={`space-y-1 whitespace-pre-line text-xs leading-relaxed ${muted ? "text-slate-400" : "text-slate-700"}`}>{values.map((value, index) => <div key={`${value}-${index}`}>{value}</div>)}</div>
        : <div className="text-xs text-slate-300">배정 없음</div>}
    </div>
  );
}
