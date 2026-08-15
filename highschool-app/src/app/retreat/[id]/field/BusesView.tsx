"use client";
import { useMemo, useState } from "react";
import OverlayShell from "@/components/OverlayShell";
import { BusStudentGender, Group, IguardBus, IguardBusSegment, IguardScheduleBlock, Participant, PartialAttendanceMap, Student, TeacherAttendance } from "@/features/iguard/lib/types";
import { saveIguardBus, updateIguardBus, deleteIguardBus } from "@/features/iguard/lib/db";
import { useUI } from "@/context/UIContext";
import { groupDisplayName } from "@/features/iguard/lib/groupNumber";
import { isCancelledStudent, isStudentBusPassengerOnDay, isTeacherBusPassenger } from "@/features/iguard/lib/busParticipation";
import { mergeBusStaffNames, parseBusStaff, parseBusStaffNames } from "@/features/iguard/lib/busStaff";
import { busCapacityOf, isValidBusCapacity, DEFAULT_BUS_CAPACITY, MIN_BUS_CAPACITY, MAX_BUS_CAPACITY } from "@/features/iguard/lib/busCapacity";
import { assignBusUnits, BusAssignmentUnit } from "@/features/iguard/lib/busAutoAssign";
import { activeStudentIdsForGender, buildGenderCohorts, groupBusTeachersByGender, teacherNamesForBusSegment } from "@/features/iguard/lib/busGender";

const RESERVED_STAFF_SEATS = 3;

const groupSort = (a: Group, b: Group) => a.bu.localeCompare(b.bu, "ko") || a.name.localeCompare(b.name, "ko", { numeric: true });
const busDayOf = (b: IguardBus): 1 | 3 => b.day === 3 ? 3 : 1;
type AutoMode = "mixed" | "gender";

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

export default function BusesView({ retreatId, buses, groups, students, participants, teachers, partial, cellColors, schedule }: { retreatId: string; buses: IguardBus[]; groups: Group[]; students: Record<string, Student>; participants: Record<string, Participant>; teachers: TeacherAttendance[]; partial: PartialAttendanceMap; cellColors: Record<string, string>; schedule: IguardScheduleBlock[] }) {
  const { toast, uiConfirm } = useUI();
  const sortedGroups = useMemo(() => [...groups].sort(groupSort), [groups]);
  const [day, setDay] = useState<1 | 3>(1);
  const [autoModeByDay, setAutoModeByDay] = useState<Partial<Record<1 | 3, AutoMode>>>({});
  const [editing, setEditing] = useState<IguardBus | null>(null);
  const [show, setShow] = useState(false);
  const [busNo, setBusNo] = useState("");
  const [capTxt, setCapTxt] = useState(String(DEFAULT_BUS_CAPACITY));
  const [groupIds, setGroupIds] = useState<string[]>([]);
  const [staffTxt, setStaffTxt] = useState("");

  const dayBuses = useMemo(() => buses.filter(b => busDayOf(b) === day).sort((a, b) => a.busNo - b.busNo), [buses, day]);
  const selectedAutoMode = autoModeByDay[day] ?? (dayBuses.some(bus => bus.assignmentMode === "gender") ? "gender" : "mixed");
  const cueStaffByBus = useMemo(() => parseBusStaffFromSchedule(schedule, day), [schedule, day]);
  const genderData = useMemo(
    () => buildGenderCohorts(sortedGroups, participants, students, partial, cellColors, day),
    [sortedGroups, participants, students, partial, cellColors, day],
  );

  function busTeacherNames(g: Group): string[] {
    return [...new Set((g.teachers || [])
      .filter(name => isTeacherBusPassenger(teachers, name, g.bu))
      .map(name => name.trim())
      .filter(Boolean))];
  }

  function groupPassengerCount(g: Group): number {
    // 부분참: 선택한 일자에 실제 탑승하는 학생만 카운트. 당일참석은 지정한 1·3일차에 포함한다.
    const studentCount = (g.studentIds || [])
      .filter(sid => !isCancelledStudent(sid, cellColors))
      .filter(sid => isStudentBusPassengerOnDay(partial[sid], day)).length;
    return studentCount + busTeacherNames(g).length;
  }
  const groupById = (id: string) => sortedGroups.find(g => g.id === id);
  const headcount = (ids: string[]) => ids.reduce((sum, id) => {
    const g = groupById(id);
    return sum + (g ? groupPassengerCount(g) : 0);
  }, 0);

  function segmentPassengerCount(segment: IguardBusSegment): number {
    const group = groupById(segment.groupId);
    if (!group) return 0;
    const students = activeStudentIdsForGender(group, segment.gender, genderData.genderMap, partial, cellColors, day).length;
    return students + teacherNamesForBusSegment(segment, busTeacherNames(group)).length;
  }

  function busPassengerCount(bus: IguardBus): number {
    if (bus.assignmentMode === "gender" && bus.segments?.length) {
      return bus.segments.reduce((sum, segment) => sum + segmentPassengerCount(segment), 0);
    }
    return headcount(bus.groupIds || []);
  }


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
      if (editing) await updateIguardBus(retreatId, editing.id, {
        day, busNo: n, capacity: cap, groupIds, staff: staffValue || null,
        assignmentMode: null, segments: null,
      });
      else await saveIguardBus(retreatId, { day, busNo: n, capacity: cap, groupIds, staff: staffValue || undefined });
      setShow(false);
    } catch (e) { toast(`저장 오류: ${e instanceof Error ? e.message : String(e)}`, "error"); }
  }
  async function del(b: IguardBus) {
    if (!await uiConfirm(`${busDayOf(b)}일차 ${b.busNo}호차를 삭제할까요?`)) return;
    try { await deleteIguardBus(retreatId, b.id); } catch (e) { toast(`삭제 오류: ${e}`, "error"); }
  }
  const toggle = (id: string) => setGroupIds(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id]);

  function makeAssignmentUnits(mode: AutoMode): {
    units: BusAssignmentUnit[];
    segmentByUnitId: Map<string, IguardBusSegment>;
    labelByUnitId: Map<string, string>;
  } {
    if (mode === "mixed") {
      return {
        units: sortedGroups.map(group => ({ id: group.id, size: groupPassengerCount(group) })),
        segmentByUnitId: new Map(),
        labelByUnitId: new Map(sortedGroups.map(group => [group.id, groupDisplayName(group, groups)])),
      };
    }
    if (genderData.missingStudentIds.length > 0) {
      throw new Error(`성별을 확인할 수 없는 탑승 학생이 ${genderData.missingStudentIds.length}명 있습니다. 행정 참가자 매칭·성별을 확인한 뒤 다시 시도해주세요.`);
    }

    const segmentByUnitId = new Map<string, IguardBusSegment>();
    const labelByUnitId = new Map<string, string>();
    const units: BusAssignmentUnit[] = [];
    sortedGroups.forEach(group => {
      const cohorts = genderData.cohorts.filter(cohort => cohort.groupId === group.id);
      const teachersByGender = groupBusTeachersByGender(group, teachers);
      const teachersForGroup = teachersByGender.남.length + teachersByGender.여.length;
      if (teachersByGender.unresolved.length > 0) {
        throw new Error(`${groupDisplayName(group, groups)} 교사 ${teachersByGender.unresolved.join(", ")}의 성별을 확인할 수 없습니다. 행정 교사 참석에서 성별을 지정해주세요.`);
      }
      if (cohorts.length === 0) {
        if (teachersForGroup === 0) return;
      }
      cohorts.forEach(cohort => {
        const unitId = `${cohort.groupId}::${cohort.gender}`;
        const teacherNames = teachersByGender[cohort.gender];
        const segment: IguardBusSegment = {
          groupId: cohort.groupId,
          gender: cohort.gender,
          ...(teacherNames.length > 0 ? { teacherNames } : {}),
        };
        segmentByUnitId.set(unitId, segment);
        labelByUnitId.set(unitId, `${groupDisplayName(group, groups)} ${cohort.gender}`);
        units.push({ id: unitId, size: cohort.studentIds.length + teacherNames.length, gender: cohort.gender });
      });

      // 해당 성별 학생은 없지만 교사는 있는 조도 교사만의 성별 묶음으로 안전하게 배정한다.
      (["남", "여"] as const).forEach(gender => {
        if (cohorts.some(cohort => cohort.gender === gender) || teachersByGender[gender].length === 0) return;
        const unitId = `${group.id}::${gender}`;
        const segment: IguardBusSegment = { groupId: group.id, gender, teacherNames: teachersByGender[gender] };
        segmentByUnitId.set(unitId, segment);
        labelByUnitId.set(unitId, `${groupDisplayName(group, groups)} ${gender} 교사`);
        units.push({ id: unitId, size: teachersByGender[gender].length, gender });
      });
    });
    return { units, segmentByUnitId, labelByUnitId };
  }

  /** 결과 배열의 i번째는 capacities[i] 호차에 대응한다. 혼합은 조, 분리는 조+성별 묶음이 최소 단위다. */
  function makeAutoAssignment(capacities: number[], mode: AutoMode) {
    const { units, segmentByUnitId, labelByUnitId } = makeAssignmentUnits(mode);
    const totalPassengers = units.reduce((sum, unit) => sum + unit.size, 0);
    const maxCapacity = Math.max(...capacities);
    units.forEach(unit => {
      if (unit.size > maxCapacity) throw new Error(`${labelByUnitId.get(unit.id) ?? unit.id} 인원이 ${unit.size}명이라 최대 ${maxCapacity}인승 버스에 배정할 수 없습니다.`);
    });
    const sumCapacity = capacities.reduce((sum, capacity) => sum + capacity, 0);
    if (totalPassengers > sumCapacity) {
      throw new Error(`전체 ${totalPassengers}명이 총 좌석 ${sumCapacity}석을 초과합니다. 호차를 추가하거나 인승을 조정한 뒤 다시 자동배정해주세요.`);
    }
    const bins = assignBusUnits(capacities, units, {
      separateGenders: mode === "gender",
      reservedSeats: RESERVED_STAFF_SEATS,
    });
    if (!bins) throw new Error(`${capacities.length}대 안에 배정할 수 있는 조합을 찾지 못했습니다. 호차를 추가하거나 수동으로 조정해주세요.`);
    return bins.map(bin => {
      if (mode === "mixed") return { groupIds: bin.unitIds, segments: undefined, gender: undefined as BusStudentGender | undefined };
      const segments = bin.unitIds.map(unitId => segmentByUnitId.get(unitId)).filter((segment): segment is IguardBusSegment => !!segment);
      return { groupIds: [...new Set(segments.map(segment => segment.groupId))], segments, gender: bin.gender };
    });
  }

  async function autoAssign() {
    if (sortedGroups.length === 0) return toast("조 데이터가 없습니다.", "warning");
    const mode = selectedAutoMode;
    try {
      const assignmentUnits = makeAssignmentUnits(mode).units;
      const totalPassengerCount = assignmentUnits.reduce((sum, unit) => sum + unit.size, 0);
      const existingCapacities = dayBuses.map(busCapacityOf);
      const capacities = [...existingCapacities];
      while (capacities.reduce((sum, capacity) => sum + capacity, 0) < totalPassengerCount || capacities.length === 0) {
        capacities.push(DEFAULT_BUS_CAPACITY);
      }
      const willCreateMoreBuses = capacities.length > dayBuses.length;
      if (dayBuses.length > 0) {
        const modeLabel = mode === "gender" ? "남녀 분리" : "혼합";
        const message = willCreateMoreBuses
          ? `${day}일차 기존 ${dayBuses.length}대(총 ${existingCapacities.reduce((a, b) => a + b, 0)}석)로는 전체 ${totalPassengerCount}명을 태울 수 없어 ${DEFAULT_BUS_CAPACITY}인승 ${capacities.length - dayBuses.length}대를 추가하고 ${modeLabel} 자동배정할까요?`
          : `${day}일차 기존 버스 배정을 ${modeLabel} 자동배정 결과로 바꿀까요?`;
        if (!await uiConfirm(message)) return;
      }

      // 좌석 합계는 충분해도 조 단위(안 쪼개짐) 때문에 배정 조합이 없을 수 있다 — 기본 인승 1대씩, 최대 2대까지 늘려 재시도
      let assignedBins: ReturnType<typeof makeAutoAssignment> | null = null;
      let lastError: unknown = null;
      for (let extra = 0; extra <= 2 && !assignedBins; extra++) {
        try {
          assignedBins = makeAutoAssignment([...capacities, ...Array(extra).fill(DEFAULT_BUS_CAPACITY)], mode);
          if (extra > 0) toast(`좌석 조합상 ${DEFAULT_BUS_CAPACITY}인승 ${extra}대를 추가로 만들어 배정했습니다.`, "warning");
        } catch (e) { lastError = e; }
      }
      if (!assignedBins) throw lastError;

      // i번째 결과 = i번째 버스: 기존 호차(busNo 순) 먼저, 그 뒤는 새 호차(번호 이어서, 기본 인승)
      const maxBusNo = dayBuses.reduce((m, b) => Math.max(m, b.busNo), 0);
      await Promise.all(assignedBins.map((bin, idx) => {
        const existing = dayBuses[idx];
        if (existing) {
          return mode === "gender"
            ? updateIguardBus(retreatId, existing.id, { groupIds: bin.groupIds, assignmentMode: "gender", segments: bin.segments })
            : updateIguardBus(retreatId, existing.id, { groupIds: bin.groupIds, assignmentMode: null, segments: null });
        }
        return mode === "gender"
          ? saveIguardBus(retreatId, { day, busNo: maxBusNo + (idx - dayBuses.length + 1), capacity: DEFAULT_BUS_CAPACITY, groupIds: bin.groupIds, assignmentMode: "gender", segments: bin.segments })
          : saveIguardBus(retreatId, { day, busNo: maxBusNo + (idx - dayBuses.length + 1), capacity: DEFAULT_BUS_CAPACITY, groupIds: bin.groupIds });
      }));
      toast(`${day}일차 ${mode === "gender" ? "남녀 분리" : "혼합"} 자동배정을 적용했습니다.`, "success");
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), "error");
    }
  }

  const totalPassengers = dayBuses.reduce((sum, bus) => sum + busPassengerCount(bus), 0);
  const totalStaffCount = dayBuses.reduce((sum, b) => {
    const busFieldStaff = parseBusStaffNames(b.staff);
    const cueStaff = cueStaffByBus.get(b.busNo) || [];
    return sum + mergeBusStaffNames(busFieldStaff, cueStaff).length;
  }, 0);
  const totalHeadcount = totalPassengers + totalStaffCount;

  return (
    <div>
      <div className="mb-4 bg-emerald-50 border border-emerald-100 rounded-lg p-3 text-xs text-emerald-700">
        ℹ️ 인승은 호차별로 설정할 수 있고(기본 {DEFAULT_BUS_CAPACITY}인승), 자동배정은 각 호차의 인승에 맞춰 <strong>인원 균등(정원 비례)</strong>을 우선으로 잡고, 가능하면 스탭 좌석 {RESERVED_STAFF_SEATS}석을 남깁니다.
        <span className="mt-1 block text-emerald-600"><strong>혼합</strong>은 기존처럼 조 전체를 유지하고, <strong>남녀 분리</strong>는 한 조의 같은 성별 학생을 한 묶음으로 유지해 성별 호차에 배정합니다.</span>
        <span className="mt-1 block text-emerald-600">행정의 교사 불참·자차와 학생 부분참 당일참여는 단체 버스 인원에서 제외됩니다.</span>
      </div>

      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <div className="flex gap-1 bg-slate-100 p-1 rounded-lg">
          {([1, 3] as const).map(d => (
            <button key={d} onClick={() => setDay(d)}
              className={`px-4 py-1.5 rounded-md text-sm font-medium ${day === d ? "bg-white shadow text-emerald-700" : "text-slate-500"}`}>{d}일차</button>
          ))}
        </div>
        <span className="text-sm text-slate-500">버스 <strong className="text-slate-800">{dayBuses.length}</strong>대 · 총 탑승 <strong className="text-emerald-700">{totalHeadcount}</strong>명</span>
        <div className="flex gap-2 flex-wrap">
          <label className="sr-only" htmlFor={`bus-auto-mode-${day}`}>자동배정 방식</label>
          <select
            id={`bus-auto-mode-${day}`}
            className="input min-w-40"
            value={selectedAutoMode}
            onChange={event => setAutoModeByDay(previous => ({ ...previous, [day]: event.target.value as AutoMode }))}
          >
            <option value="mixed">혼합 · 기존 조 유지</option>
            <option value="gender">남녀 분리 · 조별 성별 묶음</option>
          </select>
          <button onClick={autoAssign} className="btn-secondary">✨ 자동배정</button>
          <button onClick={openNew} className="btn-primary">＋ 호차 추가</button>
        </div>
      </div>

      {show && (
        <OverlayShell
          label={editing ? "호차 수정" : "호차 추가"}
          onClose={() => setShow(false)}
          panelClassName="w-full max-w-lg"
        >
          <div className="max-h-[85dvh] overflow-y-auto p-6">
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
                {editing?.assignmentMode === "gender" && (
                  <p className="mb-2 rounded bg-amber-50 px-2 py-1 text-[11px] text-amber-700">이 화면에서 조를 수동 수정해 저장하면 해당 호차는 혼합 방식으로 전환됩니다.</p>
                )}
                <div className="flex flex-wrap gap-1.5 max-h-48 overflow-y-auto p-1">
                  {sortedGroups.map(g => (
                    <button key={g.id} onClick={() => toggle(g.id)}
                      className={`px-2 py-1 rounded text-xs border ${groupIds.includes(g.id) ? "bg-emerald-100 text-emerald-700 border-emerald-300" : "bg-white text-slate-500 border-slate-200"}`}>
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
        </OverlayShell>
      )}

      {dayBuses.length === 0 ? (
        <div className="card p-8 text-center text-slate-400"><div className="text-3xl mb-2">🚌</div><p>{day}일차 등록된 호차가 없습니다.</p></div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {dayBuses.map(b => {
            const count = busPassengerCount(b);
            const busFieldParse = parseBusStaff(b.staff);
            const busFieldStaff = busFieldParse.names;
            const cueStaff = cueStaffByBus.get(b.busNo) || [];
            const mergedStaff = mergeBusStaffNames(busFieldStaff, cueStaff);
            const totalStaff = mergedStaff.length;
            const cap = busCapacityOf(b);
            const remain = cap - count - totalStaff;
            const rejectedTokens = busFieldParse.rejected;
            const genderSegments = b.assignmentMode === "gender" ? (b.segments || []) : [];
            const busGender = genderSegments[0]?.gender;
            return (
              <div key={b.id} className={`card p-4 ${remain < 0 ? "border-red-300" : count > cap - RESERVED_STAFF_SEATS ? "border-amber-300" : ""}`}>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-bold text-slate-800">{b.busNo}호차 <span className="text-xs font-normal text-slate-400">{cap}인승</span> {busGender && <span className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${busGender === "남" ? "bg-blue-100 text-blue-700" : "bg-pink-100 text-pink-700"}`}>{busGender}</span>} <span className="text-sm font-normal text-emerald-700">· {count + totalStaff}명</span></h3>
                  <div className="flex gap-2"><button onClick={() => openEdit(b)} className="text-xs text-slate-400 hover:text-emerald-600">수정</button>
                    <button onClick={() => del(b)} className="text-xs text-slate-300 hover:text-red-400">삭제</button></div>
                </div>
                <div className="mb-2 text-xs text-slate-400">학생+교사 {count} · 스탭 {totalStaff} · 잔여 {remain}석</div>
                <div className="flex flex-wrap gap-1 mb-2">
                  {genderSegments.length > 0
                    ? genderSegments.map(segment => {
                        const group = groupById(segment.groupId);
                        if (!group) return null;
                        return <span key={`${segment.groupId}:${segment.gender}`} className={`px-1.5 py-0.5 rounded text-xs ${segment.gender === "남" ? "bg-blue-50 text-blue-700" : "bg-pink-50 text-pink-700"}`}>{groupDisplayName(group, groups)} {segment.gender}({segmentPassengerCount(segment)})</span>;
                      })
                    : (b.groupIds || []).map(id => {
                        const group = groupById(id);
                        return group ? <span key={id} className="px-1.5 py-0.5 rounded text-xs bg-slate-100 text-slate-600">{groupDisplayName(group, groups)}({groupPassengerCount(group)})</span> : null;
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
