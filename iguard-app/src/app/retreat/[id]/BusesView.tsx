"use client";
import { useMemo, useState } from "react";
import { Group, IguardBus, IguardScheduleBlock, PartialAttendanceMap, TeacherAttendance } from "@/lib/types";
import { saveIguardBus, updateIguardBus, deleteIguardBus } from "@/lib/db";
import { useUI } from "@/context/UIContext";
import { groupDisplayName } from "@/lib/groupNumber";
import { isStudentBusPassengerOnDay, isTeacherBusPassenger } from "@/lib/busParticipation";
import { mergeBusStaffNames, parseBusStaff, parseBusStaffNames } from "@/lib/busStaff";
import { busCapacityOf, isValidBusCapacity, DEFAULT_BUS_CAPACITY, MIN_BUS_CAPACITY, MAX_BUS_CAPACITY } from "@/lib/busCapacity";

const RESERVED_STAFF_SEATS = 3;
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

export default function BusesView({ retreatId, buses, groups, teachers, partial, schedule }: { retreatId: string; buses: IguardBus[]; groups: Group[]; teachers: TeacherAttendance[]; partial: PartialAttendanceMap; schedule: IguardScheduleBlock[] }) {
  const { toast, uiConfirm } = useUI();
  const sortedGroups = useMemo(() => [...groups].sort(groupSort), [groups]);
  const [day, setDay] = useState<1 | 3>(1);
  const [editing, setEditing] = useState<IguardBus | null>(null);
  const [show, setShow] = useState(false);
  const [busNo, setBusNo] = useState("");
  const [capTxt, setCapTxt] = useState(String(DEFAULT_BUS_CAPACITY));
  const [groupIds, setGroupIds] = useState<string[]>([]);
  const [staffTxt, setStaffTxt] = useState("");

  const dayBuses = useMemo(() => buses.filter(b => busDayOf(b) === day).sort((a, b) => a.busNo - b.busNo), [buses, day]);
  const cueStaffByBus = useMemo(() => parseBusStaffFromSchedule(schedule, day), [schedule, day]);

  function groupPassengerCount(g: Group): number {
    const teacherNames = new Set([
      ...(g.teachers || []).filter(name => isTeacherBusPassenger(teachers, name, g.bu)),
      ...parseNames(g.leader), // 조장은 학생 역할 — 행정 교사의 자차 필터를 적용하지 않는다.
    ].map(s => s.trim()).filter(Boolean));
    // 부분참: 선택한 일자에 실제 탑승하는 학생만 카운트 (1일차=본대+선복귀, 3일차=본대+후발대)
    const studentCount = (g.studentIds || []).filter(sid => isStudentBusPassengerOnDay(partial[sid], day)).length;
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
    setCapTxt(String(DEFAULT_BUS_CAPACITY));
    setGroupIds([]);
    setStaffTxt("");
    setShow(true);
  }
  function openEdit(b: IguardBus) {
    setEditing(b);
    setBusNo(String(b.busNo));
    setCapTxt(String(busCapacityOf(b)));
    setGroupIds(b.groupIds || []);
    setStaffTxt(b.staff || "");
    setShow(true);
  }

  async function save() {
    const n = parseInt(busNo);
    if (!n) return toast("호차 번호를 입력해주세요.", "warning");
    const cap = parseInt(capTxt);
    if (!isValidBusCapacity(cap)) return toast(`인승은 ${MIN_BUS_CAPACITY}~${MAX_BUS_CAPACITY} 사이 숫자로 입력해주세요.`, "warning");
    const count = headcount(groupIds);
    if (count > cap) return toast(`${cap}인승 정원을 초과했습니다. 현재 ${count}명입니다.`, "warning");
    if (count > cap - RESERVED_STAFF_SEATS) toast(`스탭 좌석 여유가 ${cap - count}석뿐입니다.`, "warning");
    const staffValue = staffTxt.trim();
    try {
      if (editing) await updateIguardBus(retreatId, editing.id, { day, busNo: n, capacity: cap, groupIds, staff: staffValue || null });
      else await saveIguardBus(retreatId, { day, busNo: n, capacity: cap, groupIds, staff: staffValue || undefined });
      setShow(false);
    } catch (e) { toast(`저장 오류: ${e instanceof Error ? e.message : String(e)}`, "error"); }
  }
  async function del(b: IguardBus) {
    if (!await uiConfirm(`${busDayOf(b)}일차 ${b.busNo}호차를 삭제할까요?`)) return;
    try { await deleteIguardBus(retreatId, b.id); } catch (e) { toast(`삭제 오류: ${e}`, "error"); }
  }
  const toggle = (id: string) => setGroupIds(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id]);

  /** 호차별 인승(capacities) 기반 자동배정 — 결과 배열의 i번째가 capacities[i] 버스에 대응한다(순서 보존).
   *  혼합 인승 지원: 각 버스 목표 인원을 정원 비례로 잡고, 정원·조 단위 불변식을 지킨다. */
  function makeAutoAssignment(capacities: number[]) {
    interface Bin { groupIds: string[]; count: number; capacity: number; target: number }
    const baseUnits = sortedGroups.map(g => ({ group: g, size: groupPassengerCount(g) }));
    const totalPassengers = baseUnits.reduce((sum, unit) => sum + unit.size, 0);
    const maxCapacity = Math.max(...capacities);
    baseUnits.forEach(unit => {
      if (unit.size > maxCapacity) throw new Error(`${groupDisplayName(unit.group, groups)} 인원이 ${unit.size}명이라 최대 ${maxCapacity}인승 버스에 배정할 수 없습니다.`);
    });
    const sumCapacity = capacities.reduce((a, b) => a + b, 0);
    if (totalPassengers > sumCapacity) {
      throw new Error(`전체 ${totalPassengers}명이 총 좌석 ${sumCapacity}석을 초과합니다. 호차를 추가하거나 인승을 조정한 뒤 다시 자동배정해주세요.`);
    }
    // 혼합 인승 대응: 버스별 목표 인원 = 전체 인원의 정원 비례 배분 (동일 인승이면 기존 균등 목표와 동일)
    const targets = capacities.map(cap => totalPassengers * (cap / sumCapacity));

    const makeOrder = () => {
      const units = shuffle(baseUnits).map(unit => ({ ...unit, jitter: Math.random() }));
      const strategy = Math.random();
      if (strategy < 0.4) return units;
      if (strategy < 0.75) return units.sort((a, b) => (b.size + b.jitter * 10) - (a.size + a.jitter * 10));
      return units.sort((a, b) => (a.size + a.jitter * 8) - (b.size + b.jitter * 8));
    };

    const score = (bins: Bin[]) => {
      // 목표 대비 편차 기준 — 동일 인승이면 절대 인원 기준(기존 점수식)과 동등
      const devs = bins.map(bin => bin.count - bin.target);
      const range = Math.max(...devs) - Math.min(...devs);
      const variance = devs.reduce((sum, d) => sum + d * d, 0);
      const overReserve = bins.reduce((sum, bin) => sum + Math.max(0, bin.count - (bin.capacity - RESERVED_STAFF_SEATS)), 0);
      const emptyCount = bins.filter(bin => bin.count === 0).length;
      return range * 10000 + variance * 100 + overReserve * 80 + emptyCount * 1000 + Math.random();
    };
    const sizeOf = new Map(baseUnits.map(unit => [unit.group.id, unit.size]));
    const newBins = (): Bin[] => capacities.map((cap, i) => ({ groupIds: [], count: 0, capacity: cap, target: targets[i] }));
    const cloneBins = (bins: Bin[]): Bin[] => bins.map(bin => ({ ...bin, groupIds: [...bin.groupIds] }));

    const improve = (bins: Bin[]) => {
      let current = cloneBins(bins);
      let currentScore = score(current);

      for (let pass = 0; pass < 80; pass++) {
        let best: { bins: Bin[]; score: number } | null = null;

        for (let from = 0; from < current.length; from++) {
          for (let to = 0; to < current.length; to++) {
            if (from === to) continue;
            for (const gid of current[from].groupIds) {
              const size = sizeOf.get(gid) ?? 0;
              if (current[to].count + size <= current[to].capacity) {
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
                if (nextFrom > current[from].capacity || nextTo > current[to].capacity) continue;
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
      const bins = newBins();
      let failed = false;
      makeOrder().forEach(unit => {
        if (failed) return;
        const feasible = bins
          .map((bin, idx) => {
            const nextCount = bin.count + unit.size;
            return {
              idx,
              nextCount,
              remaining: bin.capacity - nextCount,
              balanceGap: Math.abs(nextCount - bin.target),
            };
          })
          .filter(x => x.remaining >= 0)
          .sort((a, b) => a.balanceGap - b.balanceGap || a.nextCount - b.nextCount);

        if (feasible.length === 0) { failed = true; return; }

        const candidates = feasible.slice(0, Math.min(feasible.length, 4));
        const chosen = candidates[Math.floor(Math.random() * candidates.length)];
        bins[chosen.idx].groupIds.push(unit.group.id);
        bins[chosen.idx].count += unit.size;
      });
      return failed ? null : improve(bins);
    };

    const attempts = Array.from({ length: BALANCE_ATTEMPTS }, pack).filter((bins): bins is Bin[] => !!bins);
    if (attempts.length === 0) throw new Error(`${capacities.length}대 안에 배정할 수 있는 조합을 찾지 못했습니다. 호차를 추가하거나 수동으로 조정해주세요.`);
    const rankedAttempts = attempts
      .map(bins => ({ bins, score: score(bins) }))
      .sort((a, b) => a.score - b.score);
    const bestScore = rankedAttempts[0].score;
    const bestAttempts = rankedAttempts.filter(item => item.score <= bestScore + 1000).slice(0, 6);
    const selectedBins = shuffle(bestAttempts)[0].bins;

    // ⚠ bins 순서 = capacities 순서 = 호차 대응 — 인승이 제각각일 수 있으므로 순서를 섞지 않는다
    return selectedBins.map(bin => ({ groupIds: shuffle(bin.groupIds) }));
  }

  async function autoAssign() {
    if (sortedGroups.length === 0) return toast("조 데이터가 없습니다.", "warning");
    const totalPassengerCount = sortedGroups.reduce((sum, group) => sum + groupPassengerCount(group), 0);
    // 좌석 합계 기준으로 부족분 판정 — 호차별 인승이 제각각이어도 정확하다
    const existingCapacities = dayBuses.map(busCapacityOf);
    const capacities = [...existingCapacities];
    while (capacities.reduce((a, b) => a + b, 0) < totalPassengerCount || capacities.length === 0) {
      capacities.push(DEFAULT_BUS_CAPACITY);
    }
    const willCreateMoreBuses = capacities.length > dayBuses.length;
    if (dayBuses.length > 0) {
      const message = willCreateMoreBuses
        ? `${day}일차 기존 ${dayBuses.length}대(총 ${existingCapacities.reduce((a, b) => a + b, 0)}석)로는 전체 ${totalPassengerCount}명을 태울 수 없어 ${DEFAULT_BUS_CAPACITY}인승 ${capacities.length - dayBuses.length}대를 추가하고 자동배정할까요?`
        : `${day}일차 기존 버스 배정을 자동배정 결과로 바꿀까요?`;
      if (!await uiConfirm(message)) return;
    }

    try {
      // 좌석 합계는 충분해도 조 단위(안 쪼개짐) 때문에 배정 조합이 없을 수 있다 — 기본 인승 1대씩, 최대 2대까지 늘려 재시도
      let assignedBins: { groupIds: string[] }[] | null = null;
      let lastError: unknown = null;
      for (let extra = 0; extra <= 2 && !assignedBins; extra++) {
        try {
          assignedBins = makeAutoAssignment([...capacities, ...Array(extra).fill(DEFAULT_BUS_CAPACITY)]);
          if (extra > 0) toast(`좌석 조합상 ${DEFAULT_BUS_CAPACITY}인승 ${extra}대를 추가로 만들어 배정했습니다.`, "warning");
        } catch (e) { lastError = e; }
      }
      if (!assignedBins) throw lastError;

      // i번째 결과 = i번째 버스: 기존 호차(busNo 순) 먼저, 그 뒤는 새 호차(번호 이어서, 기본 인승)
      const maxBusNo = dayBuses.reduce((m, b) => Math.max(m, b.busNo), 0);
      await Promise.all(assignedBins.map((bin, idx) => {
        const existing = dayBuses[idx];
        return existing
          ? updateIguardBus(retreatId, existing.id, { groupIds: bin.groupIds })
          : saveIguardBus(retreatId, { day, busNo: maxBusNo + (idx - dayBuses.length + 1), capacity: DEFAULT_BUS_CAPACITY, groupIds: bin.groupIds });
      }));
      toast(`${day}일차 버스 자동배정을 적용했습니다.`, "success");
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), "error");
    }
  }

  const totalPassengers = headcount(dayBuses.flatMap(b => b.groupIds || []));
  const totalStaffCount = dayBuses.reduce((sum, b) => {
    const busFieldStaff = parseBusStaffNames(b.staff);
    const cueStaff = cueStaffByBus.get(b.busNo) || [];
    return sum + mergeBusStaffNames(busFieldStaff, cueStaff).length;
  }, 0);
  const totalHeadcount = totalPassengers + totalStaffCount;

  return (
    <div>
      <div className="mb-4 bg-fuchsia-50 border border-fuchsia-100 rounded-lg p-3 text-xs text-fuchsia-700">
        ℹ️ 인승은 호차별로 설정할 수 있고(기본 {DEFAULT_BUS_CAPACITY}인승), 자동배정은 각 호차의 인승에 맞춰 <strong>인원 균등(정원 비례)</strong>을 우선으로 잡고, 가능하면 스탭 좌석 {RESERVED_STAFF_SEATS}석을 남깁니다. 조는 절대 쪼개지지 않고, 인원은 학생+교사 기준입니다.
        <span className="mt-1 block text-fuchsia-600">행정의 교사 불참·자차와 학생 부분참 당일참여는 단체 버스 인원에서 제외됩니다.</span>
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
                  <input className="input w-20" type="number" value={busNo} onChange={e => setBusNo(e.target.value)} /></div>
                <div><label className="text-xs text-slate-500 block mb-1">인승</label>
                  <input className="input w-20" type="number" min={MIN_BUS_CAPACITY} max={MAX_BUS_CAPACITY} value={capTxt} onChange={e => setCapTxt(e.target.value)} /></div>
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
            const busFieldParse = parseBusStaff(b.staff);
            const busFieldStaff = busFieldParse.names;
            const cueStaff = cueStaffByBus.get(b.busNo) || [];
            const mergedStaff = mergeBusStaffNames(busFieldStaff, cueStaff);
            const totalStaff = mergedStaff.length;
            const cap = busCapacityOf(b);
            const remain = cap - count - totalStaff;
            const rejectedTokens = busFieldParse.rejected;
            return (
              <div key={b.id} className={`card p-4 ${remain < 0 ? "border-red-300" : count > cap - RESERVED_STAFF_SEATS ? "border-amber-300" : ""}`}>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-bold text-slate-800">{b.busNo}호차 <span className="text-xs font-normal text-slate-400">{cap}인승</span> <span className="text-sm font-normal text-fuchsia-700">· {count + totalStaff}명</span></h3>
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
                {(busFieldParse.suspicious || mergedStaff.length > 8) && (
                  <div className="mt-1.5 rounded border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] leading-relaxed text-amber-700">
                    ⚠ 선탑/동승에 이름이 아닌 문장 조각이 섞인 것 같아요.
                    {rejectedTokens.length > 0 && <> 제외됨: {rejectedTokens.slice(0, 8).join(", ")}{rejectedTokens.length > 8 ? "…" : ""}</>}
                    {" "}큐싯 시트의 이 호차 <strong>선탑/동승 칸</strong>에 안내 문장이 들어갔는지 확인하고, 이름만 남긴 뒤 다시 가져오기 하세요.
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
