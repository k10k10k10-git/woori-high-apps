"use client";
import { useMemo, useState } from "react";
import { Group, IguardBus, IguardScheduleBlock } from "@/lib/types";
import { saveIguardBus, updateIguardBus, deleteIguardBus } from "@/lib/db";
import { useUI } from "@/context/UIContext";
import { groupDisplayName } from "@/lib/groupNumber";
import { isPresentOnDay } from "@/lib/partialAttendance";

const BUS_CAPACITY = 45;
const RESERVED_STAFF_SEATS = 3;
const ASSIGN_TARGET = BUS_CAPACITY - RESERVED_STAFF_SEATS;
const BALANCE_ATTEMPTS = 400;

const groupSort = (a: Group, b: Group) => a.bu.localeCompare(b.bu, "ko") || a.name.localeCompare(b.name, "ko", { numeric: true });
const parseNames = (csv?: string) => (csv || "").split(",").map(s => s.trim()).filter(Boolean);
const busDayOf = (b: IguardBus): 1 | 3 => b.day === 3 ? 3 : 1;
const shuffle = <T,>(arr: T[]) => {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
};

function parseBusStaffNames(value?: string): string[] {
  const raw = (value || "")
    .replace(/^선탑\/동승\s*[:：]?\s*/g, "")
    .replace(/선탑\s*[:：]/g, "")
    .replace(/동승\s*[:：]/g, "");
  return raw.split(/[,\n/]+/).map(s => s.trim()).filter(Boolean);
}

function parseBusStaffFromSchedule(schedule: IguardScheduleBlock[], busDay: 1 | 3): Map<number, string[]> {
  const day = busDay === 3 ? 3 : 1;
  const map = new Map<number, string[]>();
  schedule
    .filter(b => b.day === day && b.notice)
    .forEach(b => {
      (b.notice || "").split("\n").forEach(line => {
        const m = line.match(/^(\d+)\s*호차\s*[:：]\s*(.+)/);
        if (!m) return;
        const busNo = parseInt(m[1]);
        const names = parseBusStaffNames(m[2]);
        if (names.length) map.set(busNo, [...(map.get(busNo) || []), ...names]);
      });
    });
  return map;
}

export default function BusesView({ retreatId, buses, groups, partial, schedule }: { retreatId: string; buses: IguardBus[]; groups: Group[]; partial: Record<string, "선복귀" | "후발대">; schedule: IguardScheduleBlock[] }) {
  const { toast, uiConfirm } = useUI();
  const sortedGroups = useMemo(() => [...groups].sort(groupSort), [groups]);
  const [day, setDay] = useState<1 | 3>(1);
  const [editing, setEditing] = useState<IguardBus | null>(null);
  const [show, setShow] = useState(false);
  const [busNo, setBusNo] = useState("");
  const [groupIds, setGroupIds] = useState<string[]>([]);
  const [staffTxt, setStaffTxt] = useState("");

  const dayBuses = useMemo(() => buses.filter(b => busDayOf(b) === day).sort((a, b) => a.busNo - b.busNo), [buses, day]);
  const cueStaffByBus = useMemo(() => parseBusStaffFromSchedule(schedule, day), [schedule, day]);

  function groupPassengerCount(g: Group): number {
    const teacherNames = new Set([...(g.teachers || []), ...parseNames(g.leader)].map(s => s.trim()).filter(Boolean));
    // 부분참: 선택한 일자에 실제 탑승하는 학생만 카운트 (1일차=본대+선복귀, 3일차=본대+후발대)
    const studentCount = (g.studentIds || []).filter(sid => isPresentOnDay(partial[sid], day)).length;
    return studentCount + teacherNames.size;
  }
  const groupById = (id: string) => sortedGroups.find(g => g.id === id);
  const headcount = (ids: string[]) => ids.reduce((sum, id) => {
    const g = groupById(id);
    return sum + (g ? groupPassengerCount(g) : 0);
  }, 0);


  function openNew() {
    setEditing(null);
    setBusNo(String(dayBuses.length + 1));
    setGroupIds([]);
    setStaffTxt("");
    setShow(true);
  }
  function openEdit(b: IguardBus) {
    setEditing(b);
    setBusNo(String(b.busNo));
    setGroupIds(b.groupIds || []);
    setStaffTxt(b.staff || "");
    setShow(true);
  }

  async function save() {
    const n = parseInt(busNo);
    if (!n) return toast("호차 번호를 입력해주세요.", "warning");
    const count = headcount(groupIds);
    if (count > BUS_CAPACITY) return toast(`45인승 정원을 초과했습니다. 현재 ${count}명입니다.`, "warning");
    if (count > ASSIGN_TARGET) toast(`스탭 좌석 여유가 ${BUS_CAPACITY - count}석뿐입니다.`, "warning");
    const staffValue = staffTxt.trim();
    try {
      if (editing) await updateIguardBus(retreatId, editing.id, { day, busNo: n, groupIds, staff: staffValue || null });
      else await saveIguardBus(retreatId, { day, busNo: n, groupIds, staff: staffValue || undefined });
      setShow(false);
    } catch (e) { toast(`저장 오류: ${e instanceof Error ? e.message : String(e)}`, "error"); }
  }
  async function del(b: IguardBus) {
    if (!await uiConfirm(`${busDayOf(b)}일차 ${b.busNo}호차를 삭제할까요?`)) return;
    try { await deleteIguardBus(retreatId, b.id); } catch (e) { toast(`삭제 오류: ${e}`, "error"); }
  }
  const toggle = (id: string) => setGroupIds(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id]);

  function makeAutoAssignment(fixedBusCount?: number) {
    const baseUnits = sortedGroups.map(g => ({ group: g, size: groupPassengerCount(g) }));
    const totalPassengers = baseUnits.reduce((sum, unit) => sum + unit.size, 0);
    baseUnits.forEach(unit => {
      if (unit.size > BUS_CAPACITY) throw new Error(`${groupDisplayName(unit.group, groups)} 인원이 ${unit.size}명이라 45인승 버스에 배정할 수 없습니다.`);
    });
    if (fixedBusCount && totalPassengers > fixedBusCount * BUS_CAPACITY) {
      throw new Error(`${fixedBusCount}대 안에는 전체 인원을 태울 수 없습니다. 호차를 추가한 뒤 다시 자동배정해주세요.`);
    }
    const averageTarget = fixedBusCount ? totalPassengers / fixedBusCount : ASSIGN_TARGET;

    const makeOrder = () => {
      const units = shuffle(baseUnits).map(unit => ({ ...unit, jitter: Math.random() }));
      const strategy = Math.random();
      if (strategy < 0.4) return units;
      if (strategy < 0.75) return units.sort((a, b) => (b.size + b.jitter * 10) - (a.size + a.jitter * 10));
      return units.sort((a, b) => (a.size + a.jitter * 8) - (b.size + b.jitter * 8));
    };

    const score = (bins: { groupIds: string[]; count: number }[]) => {
      const counts = bins.map(bin => bin.count);
      const range = Math.max(...counts) - Math.min(...counts);
      const variance = counts.reduce((sum, count) => sum + Math.pow(count - averageTarget, 2), 0);
      const overReserve = bins.reduce((sum, bin) => sum + Math.max(0, bin.count - ASSIGN_TARGET), 0);
      const emptyCount = bins.filter(bin => bin.count === 0).length;
      return range * 10000 + variance * 100 + overReserve * 80 + emptyCount * 1000 + Math.random();
    };
    const sizeOf = new Map(baseUnits.map(unit => [unit.group.id, unit.size]));
    const cloneBins = (bins: { groupIds: string[]; count: number }[]) => bins.map(bin => ({ groupIds: [...bin.groupIds], count: bin.count }));

    const improve = (bins: { groupIds: string[]; count: number }[]) => {
      let current = cloneBins(bins);
      let currentScore = score(current);

      for (let pass = 0; pass < 80; pass++) {
        let best: { bins: { groupIds: string[]; count: number }[]; score: number } | null = null;

        for (let from = 0; from < current.length; from++) {
          for (let to = 0; to < current.length; to++) {
            if (from === to) continue;
            for (const gid of current[from].groupIds) {
              const size = sizeOf.get(gid) ?? 0;
              if (current[to].count + size <= BUS_CAPACITY) {
                const next = cloneBins(current);
                next[from].groupIds = next[from].groupIds.filter(id => id !== gid);
                next[from].count -= size;
                next[to].groupIds.push(gid);
                next[to].count += size;
                const nextScore = score(next);
                if (nextScore < currentScore && (!best || nextScore < best.score)) best = { bins: next, score: nextScore };
              }

              for (const otherGid of current[to].groupIds) {
                const otherSize = sizeOf.get(otherGid) ?? 0;
                const nextFrom = current[from].count - size + otherSize;
                const nextTo = current[to].count - otherSize + size;
                if (nextFrom > BUS_CAPACITY || nextTo > BUS_CAPACITY) continue;
                const next = cloneBins(current);
                next[from].groupIds = next[from].groupIds.map(id => id === gid ? otherGid : id);
                next[to].groupIds = next[to].groupIds.map(id => id === otherGid ? gid : id);
                next[from].count = nextFrom;
                next[to].count = nextTo;
                const nextScore = score(next);
                if (nextScore < currentScore && (!best || nextScore < best.score)) best = { bins: next, score: nextScore };
              }
            }
          }
        }

        if (!best) break;
        current = best.bins;
        currentScore = best.score;
      }
      return current;
    };

    const pack = () => {
      const bins: { groupIds: string[]; count: number }[] = Array.from({ length: fixedBusCount ?? 0 }, () => ({ groupIds: [], count: 0 }));
      let failed = false;
      makeOrder().forEach(unit => {
        if (failed) return;
        const feasible = bins
          .map((bin, idx) => {
            const nextCount = bin.count + unit.size;
            return {
              bin,
              idx,
              nextCount,
              remaining: BUS_CAPACITY - nextCount,
              balanceGap: Math.abs(nextCount - averageTarget),
            };
          })
          .filter(x => x.remaining >= 0)
          .sort((a, b) => a.balanceGap - b.balanceGap || a.nextCount - b.nextCount);

        if (feasible.length === 0) {
          if (fixedBusCount) { failed = true; return; }
          bins.push({ groupIds: [unit.group.id], count: unit.size });
          return;
        }

        const candidates = feasible.slice(0, Math.min(feasible.length, fixedBusCount ? 4 : 3));
        const chosen = candidates[Math.floor(Math.random() * candidates.length)];
        bins[chosen.idx].groupIds.push(unit.group.id);
        bins[chosen.idx].count += unit.size;
      });
      return failed ? null : improve(bins);
    };

    const attempts = Array.from({ length: fixedBusCount ? BALANCE_ATTEMPTS : 64 }, pack).filter((bins): bins is { groupIds: string[]; count: number }[] => !!bins);
    if (attempts.length === 0) throw new Error(`${fixedBusCount}대 안에 배정할 수 있는 조합을 찾지 못했습니다. 호차를 추가하거나 수동으로 조정해주세요.`);
    const minBusCount = Math.min(...attempts.map(bins => bins.length));
    const rankedAttempts = attempts
      .filter(bins => bins.length === minBusCount)
      .map(bins => ({ bins, score: score(bins) }))
      .sort((a, b) => a.score - b.score);
    const bestScore = rankedAttempts[0].score;
    const bestAttempts = rankedAttempts.filter(item => item.score <= bestScore + 1000).slice(0, 6);
    const selectedBins = shuffle(bestAttempts)[0].bins;

    return shuffle(selectedBins).map((bin, idx) => ({ day, busNo: idx + 1, groupIds: shuffle(bin.groupIds) }));
  }

  async function autoAssign() {
    if (sortedGroups.length === 0) return toast("조 데이터가 없습니다.", "warning");
    if (dayBuses.length > 0 && !await uiConfirm(`${day}일차 기존 버스 배정을 자동배정 결과로 바꿀까요?`)) return;

    try {
      const assigned = makeAutoAssignment(dayBuses.length || undefined);
      if (dayBuses.length > 0) {
        const slots = shuffle(dayBuses);
        await Promise.all(slots.map((bus, idx) => updateIguardBus(retreatId, bus.id, { groupIds: assigned[idx]?.groupIds || [] })));
      } else {
        await Promise.all(assigned.map(b => saveIguardBus(retreatId, b)));
      }
      toast(`${day}일차 버스 자동배정을 적용했습니다.`, "success");
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), "error");
    }
  }

  const totalPassengers = headcount(dayBuses.flatMap(b => b.groupIds || []));
  const totalStaffCount = dayBuses.reduce((sum, b) => {
    const busFieldStaff = parseBusStaffNames(b.staff);
    const cueStaff = cueStaffByBus.get(b.busNo) || [];
    const busFieldSet = new Set(busFieldStaff.map(n => n.toLowerCase()));
    return sum + busFieldStaff.length + cueStaff.filter(n => !busFieldSet.has(n.toLowerCase())).length;
  }, 0);
  const totalHeadcount = totalPassengers + totalStaffCount;

  return (
    <div>
      <div className="mb-4 bg-fuchsia-50 border border-fuchsia-100 rounded-lg p-3 text-xs text-fuchsia-700">
        ℹ️ 버스는 45인승이며 자동배정은 기존 호차 수 안에서 <strong>인원 균등</strong>을 우선으로 잡고, 가능하면 스탭 좌석 {RESERVED_STAFF_SEATS}석을 남깁니다. 조는 절대 쪼개지지 않고, 인원은 학생+교사 기준입니다.
      </div>

      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <div className="flex gap-1 bg-slate-100 p-1 rounded-lg">
          {([1, 3] as const).map(d => (
            <button key={d} onClick={() => setDay(d)}
              className={`px-4 py-1.5 rounded-md text-sm font-medium ${day === d ? "bg-white shadow text-fuchsia-700" : "text-slate-500"}`}>{d}일차</button>
          ))}
        </div>
        <span className="text-sm text-slate-500">버스 <strong className="text-slate-800">{dayBuses.length}</strong>대 · 총 탑승 <strong className="text-fuchsia-700">{totalHeadcount}</strong>명</span>
        <div className="flex gap-2">
          <button onClick={autoAssign} className="btn-secondary">✨ 자동배정</button>
          <button onClick={openNew} className="btn-primary">＋ 호차 추가</button>
        </div>
      </div>

      {show && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4 modal-backdrop">
          <div className="card p-6 w-full max-w-lg modal-card max-h-[85vh] overflow-y-auto">
            <h3 className="font-bold text-lg mb-4">{editing ? "호차 수정" : "호차 추가"}</h3>
            <div className="space-y-3">
              <div className="flex gap-3">
                <div><label className="text-xs text-slate-500 block mb-1">일차</label>
                  <select className="input w-24" value={day} onChange={e => setDay(Number(e.target.value) as 1 | 3)}>
                    <option value={1}>1일차</option>
                    <option value={3}>3일차</option>
                  </select></div>
                <div><label className="text-xs text-slate-500 block mb-1">호차</label>
                  <input className="input w-24" type="number" value={busNo} onChange={e => setBusNo(e.target.value)} /></div>
                <div className="flex-1"><label className="text-xs text-slate-500 block mb-1">선탑/동승 스탭 (자유 입력)</label>
                  <input className="input" placeholder="박혜원sf, 온유한sf…" value={staffTxt} onChange={e => setStaffTxt(e.target.value)} /></div>
              </div>
              <div>
                <label className="text-xs text-slate-500 block mb-1">탑승 조 선택 (학생+교사 {headcount(groupIds)}명)</label>
                <div className="flex flex-wrap gap-1.5 max-h-48 overflow-y-auto p-1">
                  {sortedGroups.map(g => (
                    <button key={g.id} onClick={() => toggle(g.id)}
                      className={`px-2 py-1 rounded text-xs border ${groupIds.includes(g.id) ? "bg-fuchsia-100 text-fuchsia-700 border-fuchsia-300" : "bg-white text-slate-500 border-slate-200"}`}>
                      {g.bu.replace("부", "")} {groupDisplayName(g, groups)} ({groupPassengerCount(g)})
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="flex gap-2 mt-5">
              <button onClick={save} className="btn-primary flex-1 justify-center">저장</button>
              <button onClick={() => setShow(false)} className="btn-secondary flex-1 justify-center">취소</button>
            </div>
          </div>
        </div>
      )}

      {dayBuses.length === 0 ? (
        <div className="card p-8 text-center text-slate-400"><div className="text-3xl mb-2">🚌</div><p>{day}일차 등록된 호차가 없습니다.</p></div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {dayBuses.map(b => {
            const count = headcount(b.groupIds || []);
            const busFieldStaff = parseBusStaffNames(b.staff);
            const cueStaff = cueStaffByBus.get(b.busNo) || [];
            const busFieldSet = new Set(busFieldStaff.map(n => n.toLowerCase()));
            const mergedStaff = [...busFieldStaff, ...cueStaff.filter(n => !busFieldSet.has(n.toLowerCase()))];
            const totalStaff = mergedStaff.length;
            const remain = BUS_CAPACITY - count - totalStaff;
            return (
              <div key={b.id} className={`card p-4 ${remain < 0 ? "border-red-300" : count > ASSIGN_TARGET ? "border-amber-300" : ""}`}>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-bold text-slate-800">{b.busNo}호차 <span className="text-sm font-normal text-fuchsia-700">· {count + totalStaff}명</span></h3>
                  <div className="flex gap-2"><button onClick={() => openEdit(b)} className="text-xs text-slate-400 hover:text-fuchsia-600">수정</button>
                    <button onClick={() => del(b)} className="text-xs text-slate-300 hover:text-red-400">삭제</button></div>
                </div>
                <div className="mb-2 text-xs text-slate-400">학생+교사 {count} · 스탭 {totalStaff} · 잔여 {remain}석</div>
                <div className="flex flex-wrap gap-1 mb-2">
                  {(b.groupIds || []).map(id => {
                    const g = sortedGroups.find(x => x.id === id);
                    return g ? <span key={id} className="px-1.5 py-0.5 rounded text-xs bg-slate-100 text-slate-600">{groupDisplayName(g, groups)}({groupPassengerCount(g)})</span> : null;
                  })}
                </div>
                {mergedStaff.length > 0 && (
                  <div className="text-xs text-slate-500">
                    선탑/동승: {mergedStaff.join(", ")}
                    {cueStaff.length > 0 && !b.staff && <span className="text-sky-500 ml-1">(큐싯)</span>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
