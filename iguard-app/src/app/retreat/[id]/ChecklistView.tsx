"use client";
import { useCallback, useMemo, useState } from "react";
import { Group, Student, IguardBus, IguardScheduleBlock, IguardAttendanceInfo, Participant, PartialAttendanceMap, TeacherAttendance } from "@/lib/types";
import { clearIguardAttendance, updateIguardAttendance } from "@/lib/db";
import { printAsPDF, escapeHtml } from "@/lib/exportUtils";
import { useUI } from "@/context/UIContext";
import { useAuth } from "@/context/AuthContext";
import { groupDisplayName } from "@/lib/groupNumber";
import { isCancelledStudent, isStudentBusPassengerOnDay } from "@/lib/busParticipation";
import { mergeBusStaffNames, parseBusStaff, parseBusStaffNames } from "@/lib/busStaff";
import { roleNamesForChecklist, studentPartialLabel, teacherChecklistMeta } from "@/lib/checklistMembers";
import { activeStudentIdsForGender, buildStudentGenderMap, teacherNamesForBusSegment } from "@/lib/busGender";
import { isPresentOnDay } from "@/lib/partialAttendance";
import type { RetreatDay } from "@/lib/partialAttendance";

const groupSort = (a: Group, b: Group) => a.bu.localeCompare(b.bu, "ko") || a.name.localeCompare(b.name, "ko", { numeric: true });
const busDayOf = (b: IguardBus): 1 | 3 => b.day === 3 ? 3 : 1;

interface CheckMember { id: string; name: string; meta?: string; sortRank?: number; }
interface Unit { key: string; title: string; sub?: string; summary?: string; warning?: string; members: CheckMember[]; }

function memberSortRank(meta?: string): number {
  if (!meta) return 90;
  if (meta.includes("목사님")) return 0;
  if (meta.includes("전도사님")) return 1;
  if (meta.includes("스탭")) return 2;
  if (meta.includes("교사")) return 3;
  return 90; // 학생
}

function staffMetaLabel(name: string): string {
  if (/목사님/.test(name)) return "목사님";
  if (/전도사님/.test(name)) return "전도사님";
  return "스탭";
}

/** 큐싯 notice에서 "N호차: 이름, 이름, ..." 패턴을 파싱 → busNo → 이름[] */
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

export default function ChecklistView({ retreatId, groups, students, participants, teachers, buses, retreatName, year, checkedKeys, attendanceInfo, partial, cellColors, schedule }: {
  retreatId: string; groups: Group[]; students: Record<string, Student>; participants: Record<string, Participant>; teachers: TeacherAttendance[]; buses: IguardBus[]; retreatName: string; year: number; checkedKeys: Set<string>; attendanceInfo: Record<string, IguardAttendanceInfo>; partial: PartialAttendanceMap; cellColors: Record<string, string>; schedule: IguardScheduleBlock[];
}) {
  const { toast, uiConfirm } = useUI();
  const { user } = useAuth();
  // 체크자 기록용 — 동시 사용 시 "누가 체크했는지" 대조 가능하게
  const byName = user?.displayName?.trim() || user?.email?.split("@")[0] || undefined;
  const [mode, setMode] = useState<"조별" | "호차별">("조별");
  const [day, setDay] = useState<RetreatDay>(1);
  const keyOf = (sid: string) => `${day}:${sid}`;
  const sortedGroups = useMemo(() => [...groups].sort(groupSort), [groups]);
  const selectedBusDay: 1 | 3 = day === 3 ? 3 : 1;
  const dayLabel = `${day}일차`;
  const genderMap = useMemo(() => buildStudentGenderMap(participants, students), [participants, students]);

  const roleNamesForGroup = useCallback(
    (g: Group, checklistMode: "group" | "bus"): string[] => roleNamesForChecklist(g, teachers, checklistMode),
    [teachers],
  );

  const membersForGroup = useCallback((g: Group, checklistMode: "group" | "bus", selectedStudentIds?: string[], selectedTeacherNames?: string[]): CheckMember[] => {
    const studentMembers = (selectedStudentIds ?? g.studentIds ?? [])
      .filter(sid => !isCancelledStudent(sid, cellColors))
      .filter(sid => checklistMode === "bus"
        ? isStudentBusPassengerOnDay(partial[sid], selectedBusDay)
        : isPresentOnDay(partial[sid], day))
      .map(sid => {
        const s = students[sid];
        const partialInfo = partial[sid];
        return {
          id: `student:${sid}`,
          name: s ? s.name : "(명단 미상)",
          meta: [s ? `${s.grade}-${s.class}` : "", studentPartialLabel(partialInfo)].filter(Boolean).join(" · "),
        };
      });
    const availableTeacherNames = roleNamesForGroup(g, checklistMode);
    const teacherNames = selectedTeacherNames === undefined
      ? availableTeacherNames
      : selectedTeacherNames.filter(name => availableTeacherNames.includes(name));
    return [
      ...teacherNames.map((name, idx) => ({
        id: `teacher:${g.id}:${idx}:${name}`,
        name,
        meta: teacherChecklistMeta(teachers, name, g.bu),
      })),
      ...studentMembers,
    ].sort((a, b) => memberSortRank(a.meta) - memberSortRank(b.meta));
  }, [students, partial, cellColors, selectedBusDay, day, roleNamesForGroup, teachers]);

  const cueStaffByBus = useMemo(() => parseBusStaffFromSchedule(schedule, selectedBusDay), [schedule, selectedBusDay]);

  const units = useMemo<Unit[]>(() => {
    if (mode === "조별") {
      return sortedGroups.map(g => ({
        key: g.id, title: `${g.bu} ${groupDisplayName(g, groups)}`,
        sub: roleNamesForGroup(g, "group").join(", ") || undefined,
        members: membersForGroup(g, "group"),
      }));
    }
    return buses.filter(b => busDayOf(b) === selectedBusDay).sort((a, b) => a.busNo - b.busNo).map(b => {
      const genderSegments = b.assignmentMode === "gender" && b.segments?.length ? b.segments : null;
      const busEntries = genderSegments
        ? genderSegments.map(segment => {
            const group = sortedGroups.find(candidate => candidate.id === segment.groupId);
            return group ? {
              group,
              gender: segment.gender,
              teacherNames: teacherNamesForBusSegment(segment, roleNamesForGroup(group, "bus")),
              studentIds: activeStudentIdsForGender(group, segment.gender, genderMap, partial, cellColors, selectedBusDay),
            } : null;
          }).filter((entry): entry is NonNullable<typeof entry> => !!entry)
        : (b.groupIds || []).map(groupId => {
            const group = sortedGroups.find(candidate => candidate.id === groupId);
            return group ? { group, gender: undefined, teacherNames: roleNamesForGroup(group, "bus"), studentIds: group.studentIds || [] } : null;
          }).filter((entry): entry is NonNullable<typeof entry> => !!entry);
      const studentCount = busEntries.reduce((sum, entry) => sum + entry.studentIds
        .filter(sid => !isCancelledStudent(sid, cellColors))
        .filter(sid => isStudentBusPassengerOnDay(partial[sid], selectedBusDay)).length, 0);
      const teacherCount = busEntries.reduce((sum, entry) => sum + entry.teacherNames.length, 0);
      // 스탭: 버스 자체 staff 필드 + 큐싯 notice에서 파싱한 호차별 스탭 (중복 제거)
      const busFieldParse = parseBusStaff(b.staff);
      const busFieldStaff = busFieldParse.names;
      const cueStaff = cueStaffByBus.get(b.busNo) || [];
      const mergedStaff = mergeBusStaffNames(busFieldStaff, cueStaff);

      const summary = `학생 ${studentCount} · 교사 ${teacherCount} · 스탭 ${mergedStaff.length} · 총 ${studentCount + teacherCount + mergedStaff.length}`;
      const staffMembers: CheckMember[] = mergedStaff.map((name, idx) => ({
        id: `bus-staff:${b.id}:${idx}:${name}`,
        name,
        meta: staffMetaLabel(name),
      }));
      const allMembers = [
        ...busEntries.flatMap(entry => {
          const groupName = `${entry.group.bu} ${groupDisplayName(entry.group, groups)}${entry.gender ? ` ${entry.gender}` : ""}`;
          return membersForGroup(entry.group, "bus", entry.studentIds, entry.teacherNames).map(member => ({
            ...member,
            meta: member.meta === "교사" ? `${groupName} · 교사` : [groupName, member.meta].filter(Boolean).join(" · "),
          }));
        }),
        ...staffMembers,
      ].sort((a, b) => memberSortRank(a.meta) - memberSortRank(b.meta));
      return {
        key: b.id, title: `${b.busNo}호차`,
        sub: mergedStaff.length > 0 ? `선탑/동승: ${mergedStaff.join(", ")}` : undefined,
        summary,
        warning: busFieldParse.suspicious || mergedStaff.length > 8
          ? `선탑/동승에 이름 아닌 문장 조각이 섞인 것 같아요${busFieldParse.rejected.length ? ` — 제외됨: ${busFieldParse.rejected.slice(0, 8).join(", ")}${busFieldParse.rejected.length > 8 ? "…" : ""}` : ""}. 큐싯 시트의 이 호차 칸을 확인하세요.`
          : undefined,
        members: allMembers,
      };
    });
  }, [mode, sortedGroups, buses, selectedBusDay, groups, membersForGroup, partial, cellColors, cueStaffByBus, roleNamesForGroup, genderMap]);

  const total = units.reduce((a, u) => a + u.members.length, 0);
  const checkedCount = units.reduce((a, u) => a + u.members.filter(m => checkedKeys.has(keyOf(m.id))).length, 0);

  // 멱등 체크: 탭 = "출석 확인"(항상 present=true). 여러 스탭이 같은 학생을 동시에/중복
  // 눌러도 결과가 "출석"으로 수렴한다. 해제는 아래 uncheck로만 — 실수로 present를 푸는 사고 방지.
  async function check(sid: string) {
    const k = keyOf(sid);
    if (checkedKeys.has(k)) return; // 이미 체크됨 — 멱등, 아무 것도 안 함
    try {
      await updateIguardAttendance(retreatId, k, true, byName);
    } catch (e) {
      toast(`체크 저장 오류: ${e instanceof Error ? e.message : String(e)}`, "error");
    }
  }

  // 해제는 확인을 거친다 — "확인하려다 오히려 해제"되는 동시 사용 사고를 막는 핵심.
  async function uncheck(m: CheckMember) {
    const k = keyOf(m.id);
    if (!checkedKeys.has(k)) return;
    const ok = await uiConfirm(`${m.name} 체크를 해제할까요?`);
    if (!ok) return;
    try {
      await updateIguardAttendance(retreatId, k, false, byName);
    } catch (e) {
      toast(`해제 오류: ${e instanceof Error ? e.message : String(e)}`, "error");
    }
  }

  async function resetUnit(u: Unit) {
    const keys = u.members.map(m => keyOf(m.id)).filter(k => checkedKeys.has(k));
    if (keys.length === 0) return toast("해제할 체크가 없습니다.", "warning");
    const ok = await uiConfirm(`${u.title} 체크 ${keys.length}개를 해제할까요? (재점호용)`);
    if (!ok) return;
    try {
      await clearIguardAttendance(retreatId, keys, byName);
      toast(`${u.title} 체크 ${keys.length}개를 해제했습니다.`, "success");
    } catch (e) {
      toast(`초기화 오류: ${e instanceof Error ? e.message : String(e)}`, "error");
    }
  }

  async function resetDay() {
    const keys = units.flatMap(u => u.members.map(m => keyOf(m.id))).filter(k => checkedKeys.has(k));
    if (keys.length === 0) return toast("해제할 체크가 없습니다.", "warning");
    const ok = await uiConfirm(`${dayLabel} 체크 ${keys.length}개를 모두 해제할까요? 도착 후 재점호 등 새로 체크할 때 사용하세요.`);
    if (!ok) return;
    try {
      await clearIguardAttendance(retreatId, keys, byName);
      toast(`${dayLabel} 체크 ${keys.length}개를 모두 해제했습니다.`, "success");
    } catch (e) {
      toast(`초기화 오류: ${e instanceof Error ? e.message : String(e)}`, "error");
    }
  }

  function print() {
    if (units.length === 0) return toast("데이터가 없습니다.", "warning");
    const printedAt = new Date().toLocaleString("ko-KR");
    const printHeader = `<h1>${mode === "조별" ? "조장/선탑용" : "선탑(호차)용"} 인원 체크리스트 — ${dayLabel}</h1>
      <div class="subtitle">${escapeHtml(retreatName)} · ${year}년 · ${mode} · ${dayLabel} · 출력 ${printedAt}</div>`;
    const renderUnit = (u: Unit, compact: boolean) => {
      const rows = u.members.map((m, i) => {
        return `<tr><td style="text-align:center">${i + 1}</td><td>${escapeHtml(m.name)}</td><td>${escapeHtml(m.meta || "")}</td><td style="text-align:center;font-size:14px">☐</td></tr>`;
      }).join("");
      return `<div class="${compact ? "group-print-card" : "section"}"><h2>${escapeHtml(u.title)} <span style="font-weight:400;color:#888">· ${u.members.length}명${u.sub ? ` · ${escapeHtml(u.sub)}` : ""}</span></h2>
        <table><thead><tr><th style="width:36px">#</th><th>이름</th><th style="width:90px">구분/반</th><th style="width:50px">체크</th></tr></thead>
        <tbody>${rows || `<tr><td colspan="4" style="text-align:center;color:#aaa">없음</td></tr>`}</tbody></table></div>`;
    };
    let html = "";
    if (mode === "조별") {
      html += `<style>
        @media print { body { padding: 0; } }
        .group-print-page { break-after: page; page-break-after: always; }
        .group-print-page:last-child { break-after: auto; page-break-after: auto; }
        .group-print-page .subtitle { margin-bottom: 8px; }
        .group-print-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px 12px; align-items: start; }
        .group-print-card { min-width: 0; break-inside: avoid; page-break-inside: avoid; }
        .group-print-card h2 { margin: 0 0 3px; padding-bottom: 2px; font-size: 11px; line-height: 1.25; }
        .group-print-card table { width: 100%; margin: 0; table-layout: fixed; font-size: 9px; line-height: 1.2; }
        .group-print-card th { padding: 2px 4px; }
        .group-print-card td { overflow-wrap: anywhere; padding: 2px 4px; }
        .group-print-card th:first-child { width: 24px !important; }
        .group-print-card th:nth-child(3) { width: 74px !important; }
        .group-print-card th:last-child { width: 34px !important; }
      </style>`;
      for (let pageStart = 0; pageStart < units.length; pageStart += 4) {
        html += `<section class="group-print-page">${printHeader}<div class="group-print-grid">${units.slice(pageStart, pageStart + 4).map(u => renderUnit(u, true)).join("")}</div></section>`;
      }
    } else {
      html = `${printHeader}${units.map(u => renderUnit(u, false)).join("")}`;
    }
    printAsPDF(html, `체크리스트-${mode}`);
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4 gap-2 flex-wrap">
        <div className="flex gap-2 flex-wrap">
          <div className="flex gap-1 bg-slate-100 p-1 rounded-lg" role="tablist" aria-label="일차 선택">
            {(mode === "조별" ? [1, 2, 3] as const : [1, 3] as const).map(d => (
              <button key={d} onClick={() => setDay(d)} role="tab" aria-selected={day === d}
                className={`px-4 py-1.5 rounded-md text-sm font-medium ${day === d ? "bg-white shadow text-fuchsia-700" : "text-slate-500"}`}>{d}일차</button>
            ))}
          </div>
          <div className="flex gap-1 bg-slate-100 p-1 rounded-lg" role="tablist" aria-label="보기 모드">
            {(["조별", "호차별"] as const).map(m => (
              <button key={m} onClick={() => { setMode(m); if (m === "호차별" && day === 2) setDay(1); }} role="tab" aria-selected={mode === m}
                className={`px-4 py-1.5 rounded-md text-sm font-medium ${mode === m ? "bg-white shadow text-slate-800" : "text-slate-500"}`}>{m}</button>
            ))}
          </div>
        </div>
        <div className="text-sm"><span className="text-slate-500">체크 </span><strong className="text-fuchsia-700">{checkedCount}</strong><span className="text-slate-400"> / {total}명</span></div>
        <div className="flex gap-2">
          <button onClick={resetDay} className="btn-secondary btn-sm" aria-label={`${dayLabel} 체크 전체 초기화`}>↺ 초기화</button>
          <button onClick={print} className="btn-secondary btn-sm" aria-label="체크리스트 인쇄">🖨 인쇄</button>
        </div>
      </div>
      <p className="text-xs text-slate-400 mb-1">이름을 누르면 출석 체크됩니다. 체크된 이름을 다시 누르면 <strong>해제 확인</strong>을 거칩니다 — 여러 명이 동시에 체크해도 실수로 풀리지 않아요.</p>
      <p className="text-xs text-fuchsia-600 mb-3">
        {mode === "호차별"
          ? "교사 불참·자차는 제외하고, 당일참석자는 지정한 1·3일차 호차별 인원체크에 포함됩니다."
          : "조별 인원체크는 선택한 일차의 실제 현장 참석자를 표시합니다. 당일참석자는 지정 일차에만 포함됩니다."}
      </p>

      {mode === "호차별" && units.length === 0 ? (
        <div className="card p-8 text-center text-slate-400"><div className="text-3xl mb-2">🚌</div><p>{dayLabel} 버스 배정이 없습니다. <strong>기획 → 버스배정</strong>에서 먼저 등록하세요.</p></div>
      ) : units.length === 0 ? (
        <div className="card p-8 text-center text-slate-400"><div className="text-3xl mb-2">✅</div><p>조편성 데이터가 없습니다.</p><p className="text-xs mt-1.5 text-slate-300">행정 사이트에서 조편성이 완료되면 자동으로 나타납니다.</p></div>
      ) : (
        <div className={mode === "호차별" ? "grid grid-cols-2 gap-2 sm:gap-4" : "grid gap-4 sm:grid-cols-2"}>
          {units.map(u => {
            const c = u.members.filter(m => checkedKeys.has(keyOf(m.id))).length;
            return (
              <div key={u.key} className="card min-w-0 overflow-hidden">
                <div className={`flex items-center justify-between border-b border-slate-100 bg-slate-50 ${mode === "호차별" ? "gap-1.5 px-2.5 py-2.5 sm:gap-2 sm:px-4 sm:py-3" : "gap-2 px-4 py-3"}`}>
                  <h3 className={`min-w-0 font-semibold text-slate-700 ${mode === "호차별" ? "text-sm sm:text-base" : ""}`}>{u.title}</h3>
                  <div className={`flex shrink-0 items-center ${mode === "호차별" ? "gap-1 sm:gap-2" : "gap-2"}`}>
                    {c > 0 && (
                      <button onClick={() => resetUnit(u)} className={`${mode === "호차별" ? "text-[10px] sm:text-xs" : "text-xs"} text-slate-400 underline hover:text-slate-600`} aria-label={`${u.title} 체크 초기화`}>
                        {mode === "호차별" ? <><span aria-hidden="true">↺</span><span className="hidden sm:inline">초기화</span></> : "초기화"}
                      </button>
                    )}
                    <span className={`font-medium ${mode === "호차별" ? "text-xs sm:text-sm" : "text-sm"} ${c === u.members.length && u.members.length > 0 ? "text-green-600" : "text-fuchsia-700"}`}>{c}/{u.members.length}</span>
                  </div>
                </div>
                {(u.summary || u.sub) && (
                  <div className={`space-y-1 border-b border-slate-50 py-2 ${mode === "호차별" ? "px-2.5 sm:px-4" : "px-4"}`}>
                    {u.summary && <div className={`${mode === "호차별" ? "text-[10px] leading-tight sm:text-xs" : "text-xs"} font-semibold text-slate-600`}>{u.summary}</div>}
                    {u.sub && <div className={`${mode === "호차별" ? "break-words text-[10px] leading-tight sm:text-xs" : "text-xs"} text-slate-500`}>{u.sub}</div>}
                  </div>
                )}
                {u.warning && (
                  <div className={`border-b border-amber-100 bg-amber-50 py-2 text-[11px] leading-relaxed text-amber-700 ${mode === "호차별" ? "break-words px-2.5 sm:px-4" : "px-4"}`}>⚠ {u.warning}</div>
                )}
                <ul className="divide-y divide-slate-100">
                  {u.members.length === 0 ? <li className="px-4 py-3 text-center text-slate-300 text-xs">없음</li> :
                    u.members.map((m, i) => {
                      const on = checkedKeys.has(keyOf(m.id));
                      const by = on ? attendanceInfo[keyOf(m.id)]?.by : undefined;
                      const nameNode = m.name === "(명단 미상)" ? <span className="text-amber-500">{m.name}</span> : m.name;
                      return (
                        <li key={m.id}>
                          <button onClick={() => on ? uncheck(m) : check(m.id)} className={`w-full text-left ${mode === "호차별" ? "grid grid-cols-[1.5rem_minmax(0,1fr)] items-center gap-x-2 px-2 py-2.5 sm:flex sm:gap-3 sm:px-4 sm:py-3" : "flex items-center gap-3 px-4 py-3"} ${on ? "bg-fuchsia-50" : "hover:bg-slate-50"}`}>
                            <span className={`w-6 h-6 rounded-md border-2 flex items-center justify-center text-sm shrink-0 ${on ? "bg-green-500 border-green-500 text-white" : "border-slate-300 text-transparent"}`}>✓</span>
                            {mode === "호차별" ? (
                              <>
                                <span className="min-w-0 sm:hidden">
                                  <span className={`block break-words text-sm font-medium leading-tight ${on ? "text-slate-400 line-through" : "text-slate-800"}`}>{nameNode}</span>
                                  <span className="mt-1 block break-words text-[10px] leading-tight text-slate-400">{i + 1}. {m.meta}</span>
                                  {by && <span className="mt-1 block break-words text-[9px] leading-tight text-fuchsia-400" title={`${by} 체크`}>✓{by}</span>}
                                </span>
                                <span className="hidden w-5 text-xs text-slate-400 sm:inline-block">{i + 1}</span>
                                <span className={`hidden font-medium sm:inline ${on ? "text-slate-400 line-through" : "text-slate-800"}`}>{nameNode}</span>
                                {by && <span className="hidden shrink-0 text-[10px] text-fuchsia-400 sm:inline" title={`${by} 체크`}>✓{by}</span>}
                                <span className="ml-auto hidden text-xs text-slate-400 sm:inline">{m.meta}</span>
                              </>
                            ) : (
                              <>
                                <span className="w-5 text-xs text-slate-400">{i + 1}</span>
                                <span className={`font-medium ${on ? "text-slate-400 line-through" : "text-slate-800"}`}>{nameNode}</span>
                                {by && <span className="shrink-0 text-[10px] text-fuchsia-400" title={`${by} 체크`}>✓{by}</span>}
                                <span className="ml-auto text-xs text-slate-400">{m.meta}</span>
                              </>
                            )}
                          </button>
                        </li>
                      );
                    })}
                </ul>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
