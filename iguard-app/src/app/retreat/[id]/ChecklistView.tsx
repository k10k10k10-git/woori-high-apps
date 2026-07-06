"use client";
import { useCallback, useMemo, useState } from "react";
import { Group, Student, IguardBus, IguardScheduleBlock, IguardAttendanceInfo } from "@/lib/types";
import { clearIguardAttendance, updateIguardAttendance } from "@/lib/db";
import { printAsPDF, escapeHtml } from "@/lib/exportUtils";
import { useUI } from "@/context/UIContext";
import { useAuth } from "@/context/AuthContext";
import { groupDisplayName } from "@/lib/groupNumber";
import { isPresentOnDay } from "@/lib/partialAttendance";

const parseNames = (csv: string) => (csv || "").split(",").map(s => s.trim()).filter(Boolean);
const groupSort = (a: Group, b: Group) => a.bu.localeCompare(b.bu, "ko") || a.name.localeCompare(b.name, "ko", { numeric: true });
const busDayOf = (b: IguardBus): 1 | 3 => b.day === 3 ? 3 : 1;

function parseBusStaffNames(value?: string): string[] {
  const raw = (value || "")
    .replace(/^선탑\/동승\s*[:：]?\s*/g, "")
    .replace(/선탑\s*[:：]/g, "")
    .replace(/동승\s*[:：]/g, "");
  // 큐싯에는 "박혜원sf"처럼 스탭 표시 꼬리표가 붙는 관행이 있어, 버스배정 필드의
  // "박혜원"과 다른 사람으로 인식돼 명단에 두 번 나오던 문제 — 꼬리표를 떼고 통일한다.
  return raw.split(/[,\n/]+/)
    .map(s => s.trim().replace(/sf$/i, "").trim())
    .filter(Boolean);
}

interface CheckMember { id: string; name: string; meta?: string; sortRank?: number; }
interface Unit { key: string; title: string; sub?: string; summary?: string; members: CheckMember[]; }

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

export default function ChecklistView({ retreatId, groups, students, buses, retreatName, year, checkedKeys, attendanceInfo, partial, schedule }: {
  retreatId: string; groups: Group[]; students: Record<string, Student>; buses: IguardBus[]; retreatName: string; year: number; checkedKeys: Set<string>; attendanceInfo: Record<string, IguardAttendanceInfo>; partial: Record<string, "선복귀" | "후발대">; schedule: IguardScheduleBlock[];
}) {
  const { toast, uiConfirm } = useUI();
  const { user } = useAuth();
  // 체크자 기록용 — 동시 사용 시 "누가 체크했는지" 대조 가능하게
  const byName = user?.displayName?.trim() || user?.email?.split("@")[0] || undefined;
  const [mode, setMode] = useState<"조별" | "호차별">("조별");
  const [day, setDay] = useState<"1일차" | "3일차">("1일차"); // 1일차/3일차 인원이 달라 독립 체크
  const keyOf = (sid: string) => `${selectedBusDay}:${sid}`;
  const sortedGroups = useMemo(() => [...groups].sort(groupSort), [groups]);
  const selectedBusDay = day === "3일차" ? 3 : 1;

  const membersForGroup = useCallback((g: Group): CheckMember[] => {
    const studentMembers = (g.studentIds || [])
      .filter(sid => isPresentOnDay(partial[sid], selectedBusDay))
      .map(sid => {
        const s = students[sid];
        return {
          id: `student:${sid}`,
          name: s ? s.name : "(명단 미상)",
          meta: s ? `${s.grade}-${s.class}` : "",
        };
      });
    const teacherNames = Array.from(new Set([...(g.teachers || []), ...parseNames(g.leader)].map(s => s.trim()).filter(Boolean)));
    return [
      ...teacherNames.map((name, idx) => ({
        id: `teacher:${g.id}:${idx}:${name}`,
        name,
        meta: "교사",
      })),
      ...studentMembers,
    ].sort((a, b) => memberSortRank(a.meta) - memberSortRank(b.meta));
  }, [students, partial, selectedBusDay]);

  const cueStaffByBus = useMemo(() => parseBusStaffFromSchedule(schedule, selectedBusDay), [schedule, selectedBusDay]);

  const units = useMemo<Unit[]>(() => {
    if (mode === "조별") {
      return sortedGroups.map(g => ({
        key: g.id, title: `${g.bu} ${groupDisplayName(g, groups)}`,
        sub: [...(g.teachers || []), ...parseNames(g.leader)].join(", ") || undefined,
        members: membersForGroup(g),
      }));
    }
    return buses.filter(b => busDayOf(b) === selectedBusDay).sort((a, b) => a.busNo - b.busNo).map(b => {
      const busGroups = (b.groupIds || []).map(gid => sortedGroups.find(g => g.id === gid)).filter((g): g is Group => !!g);
      const studentCount = busGroups.reduce((sum, group) => sum + (group.studentIds || []).filter(sid => isPresentOnDay(partial[sid], selectedBusDay)).length, 0);
      const teacherCount = busGroups.reduce((sum, group) => {
        const teacherNames = new Set([...(group.teachers || []), ...parseNames(group.leader)].map(name => name.trim()).filter(Boolean));
        return sum + teacherNames.size;
      }, 0);
      // 스탭: 버스 자체 staff 필드 + 큐싯 notice에서 파싱한 호차별 스탭 (중복 제거)
      const busFieldStaff = parseBusStaffNames(b.staff);
      const cueStaff = cueStaffByBus.get(b.busNo) || [];
      const busFieldSet = new Set(busFieldStaff.map(n => n.toLowerCase()));
      const mergedStaff = [...busFieldStaff, ...cueStaff.filter(n => !busFieldSet.has(n.toLowerCase()))];

      const summary = `학생 ${studentCount} · 교사 ${teacherCount} · 스탭 ${mergedStaff.length} · 총 ${studentCount + teacherCount + mergedStaff.length}`;
      const staffMembers: CheckMember[] = mergedStaff.map((name, idx) => ({
        id: `bus-staff:${b.id}:${idx}:${name}`,
        name,
        meta: staffMetaLabel(name),
      }));
      const allMembers = [
        ...busGroups.flatMap(group => {
          const groupName = `${group.bu} ${groupDisplayName(group, groups)}`;
          return membersForGroup(group).map(member => ({
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
        members: allMembers,
      };
    });
  }, [mode, sortedGroups, buses, selectedBusDay, groups, membersForGroup, partial, cueStaffByBus]);

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
    const ok = await uiConfirm(`${day} 체크 ${keys.length}개를 모두 해제할까요? 도착 후 재점호 등 새로 체크할 때 사용하세요.`);
    if (!ok) return;
    try {
      await clearIguardAttendance(retreatId, keys, byName);
      toast(`${day} 체크 ${keys.length}개를 모두 해제했습니다.`, "success");
    } catch (e) {
      toast(`초기화 오류: ${e instanceof Error ? e.message : String(e)}`, "error");
    }
  }

  function print() {
    if (units.length === 0) return toast("데이터가 없습니다.", "warning");
    let html = `<h1>${mode === "조별" ? "조장/선탑용" : "선탑(호차)용"} 인원 체크리스트 — ${day}</h1>
      <div class="subtitle">${escapeHtml(retreatName)} · ${year}년 · ${mode} · ${day} · 출력 ${new Date().toLocaleString("ko-KR")}</div>`;
    units.forEach(u => {
      const rows = u.members.map((m, i) => {
        return `<tr><td style="text-align:center">${i + 1}</td><td>${escapeHtml(m.name)}</td><td>${escapeHtml(m.meta || "")}</td><td style="text-align:center;font-size:14px">☐</td></tr>`;
      }).join("");
      html += `<div class="section"><h2>${escapeHtml(u.title)} <span style="font-weight:400;color:#888">· ${u.members.length}명${u.sub ? ` · ${escapeHtml(u.sub)}` : ""}</span></h2>
        <table><thead><tr><th style="width:36px">#</th><th>이름</th><th style="width:90px">구분/반</th><th style="width:50px">체크</th></tr></thead>
        <tbody>${rows || `<tr><td colspan="4" style="text-align:center;color:#aaa">없음</td></tr>`}</tbody></table></div>`;
    });
    printAsPDF(html, `체크리스트-${mode}`);
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4 gap-2 flex-wrap">
        <div className="flex gap-2 flex-wrap">
          <div className="flex gap-1 bg-slate-100 p-1 rounded-lg" role="tablist" aria-label="일차 선택">
            {(["1일차", "3일차"] as const).map(d => (
              <button key={d} onClick={() => setDay(d)} role="tab" aria-selected={day === d}
                className={`px-4 py-1.5 rounded-md text-sm font-medium ${day === d ? "bg-white shadow text-fuchsia-700" : "text-slate-500"}`}>{d}</button>
            ))}
          </div>
          <div className="flex gap-1 bg-slate-100 p-1 rounded-lg" role="tablist" aria-label="보기 모드">
            {(["조별", "호차별"] as const).map(m => (
              <button key={m} onClick={() => setMode(m)} role="tab" aria-selected={mode === m}
                className={`px-4 py-1.5 rounded-md text-sm font-medium ${mode === m ? "bg-white shadow text-slate-800" : "text-slate-500"}`}>{m}</button>
            ))}
          </div>
        </div>
        <div className="text-sm"><span className="text-slate-500">체크 </span><strong className="text-fuchsia-700">{checkedCount}</strong><span className="text-slate-400"> / {total}명</span></div>
        <div className="flex gap-2">
          <button onClick={resetDay} className="btn-secondary btn-sm" aria-label={`${day} 체크 전체 초기화`}>↺ 초기화</button>
          <button onClick={print} className="btn-secondary btn-sm" aria-label="체크리스트 인쇄">🖨 인쇄</button>
        </div>
      </div>
      <p className="text-xs text-slate-400 mb-3">이름을 누르면 출석 체크됩니다. 체크된 이름을 다시 누르면 <strong>해제 확인</strong>을 거칩니다 — 여러 명이 동시에 체크해도 실수로 풀리지 않아요.</p>

      {mode === "호차별" && units.length === 0 ? (
        <div className="card p-8 text-center text-slate-400"><div className="text-3xl mb-2">🚌</div><p>{day} 버스 배정이 없습니다. <strong>기획 → 버스배정</strong>에서 먼저 등록하세요.</p></div>
      ) : units.length === 0 ? (
        <div className="card p-8 text-center text-slate-400"><div className="text-3xl mb-2">✅</div><p>조편성 데이터가 없습니다.</p></div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {units.map(u => {
            const c = u.members.filter(m => checkedKeys.has(keyOf(m.id))).length;
            return (
              <div key={u.key} className="card overflow-hidden">
                <div className="px-4 py-3 bg-slate-50 border-b border-slate-100 flex items-center justify-between gap-2">
                  <h3 className="font-semibold text-slate-700">{u.title}</h3>
                  <div className="flex items-center gap-2">
                    {c > 0 && (
                      <button onClick={() => resetUnit(u)} className="text-xs text-slate-400 hover:text-slate-600 underline" aria-label={`${u.title} 체크 초기화`}>초기화</button>
                    )}
                    <span className={`text-sm font-medium ${c === u.members.length && u.members.length > 0 ? "text-green-600" : "text-fuchsia-700"}`}>{c}/{u.members.length}</span>
                  </div>
                </div>
                {(u.summary || u.sub) && (
                  <div className="space-y-1 border-b border-slate-50 px-4 py-2">
                    {u.summary && <div className="text-xs font-semibold text-slate-600">{u.summary}</div>}
                    {u.sub && <div className="text-xs text-slate-500">{u.sub}</div>}
                  </div>
                )}
                <ul className="divide-y divide-slate-100">
                  {u.members.length === 0 ? <li className="px-4 py-3 text-center text-slate-300 text-xs">없음</li> :
                    u.members.map((m, i) => {
                      const on = checkedKeys.has(keyOf(m.id));
                      const by = on ? attendanceInfo[keyOf(m.id)]?.by : undefined;
                      return (
                        <li key={m.id}>
                          <button onClick={() => on ? uncheck(m) : check(m.id)} className={`w-full flex items-center gap-3 px-4 py-3 text-left ${on ? "bg-fuchsia-50" : "hover:bg-slate-50"}`}>
                            <span className={`w-6 h-6 rounded-md border-2 flex items-center justify-center text-sm shrink-0 ${on ? "bg-green-500 border-green-500 text-white" : "border-slate-300 text-transparent"}`}>✓</span>
                            <span className="text-slate-400 text-xs w-5">{i + 1}</span>
                            <span className={`font-medium ${on ? "text-slate-400 line-through" : "text-slate-800"}`}>{m.name === "(명단 미상)" ? <span className="text-amber-500">{m.name}</span> : m.name}</span>
                            {by && <span className="text-[10px] text-fuchsia-400 shrink-0" title={`${by} 체크`}>✓{by}</span>}
                            <span className="ml-auto text-xs text-slate-400">{m.meta}</span>
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
