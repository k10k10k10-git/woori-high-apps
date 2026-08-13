"use client";
import { useMemo, useState } from "react";
import { Group, IguardStaff, Student, TeacherAttendance, PartialAttendanceMap } from "@/features/iguard/lib/types";
import { setIguardGroupStaff, updateIguardGroupStaffEntries } from "@/features/iguard/lib/db";
import { groupDisplayName, sortGroupsByNumber } from "@/features/iguard/lib/groupNumber";
import { useUI } from "@/context/UIContext";
import { isCancelledStudent } from "@/features/iguard/lib/busParticipation";

interface Props {
  retreatId: string;
  groups: Group[];
  staff: IguardStaff[];
  students: Record<string, Student>; // uniqueKey → 학생
  adminTeachers: TeacherAttendance[]; // 행정 교사 참석(부분참 색칠용)
  partial: PartialAttendanceMap; // 학생 부분참(선복귀/후발대) 색칠용
  cellColors: Record<string, string>; // 참가자 명단 셀 색상(red=취소/불참) — 행정 소유, 읽기 전용
  groupStaff: Record<string, string[]>; // groupId → staffId[]
}

// 학생 참석 상태 — 행정 부분참탭 기준으로 교사와 동일 표기(전참/부분참/불참)로 환산.
//   cellColors red = 불참(취소),  partial 선복귀/후발대 = 부분참,  그 외(본대) = 전참.
function studentStatus(
  s: Student,
  partial: PartialAttendanceMap,
  cellColors: Record<string, string>,
): { status: "전참" | "부분참" | "불참"; detail?: string } {
  // cellColors 키는 uniqueKey("${buNum}_${id}") 또는 raw studentId 둘 다 존재할 수 있어 양쪽 확인(행정과 동일).
  if (isCancelledStudent(s.id, cellColors)) return { status: "불참" };
  const pc = partial[s.id];
  if (pc) return { status: "부분참", detail: pc.type === "당일참석" && pc.day ? `당일참석(${pc.day}일차)` : pc.type };
  return { status: "전참" };
}

// 조스탭 예외 인력: role이 명시돼 있고 "조스탭"이 아닌 인력(행정/이가드/삼별초 등) — 조 배정 풀에서 제외.
function isGroupStaffException(s: IguardStaff): boolean {
  const r = s.role?.trim();
  return !!r && r !== "조스탭";
}

// 나이(연도) 정렬값 — 큐시트 스탭 명단과 동일 규칙. 예: "98"→1998, "04"→2004, "미입력"은 맨 뒤.
function ageSortValue(value: string): number {
  const trimmed = value.trim();
  if (trimmed === "미입력") return 9999;
  if (!/^\d{1,2}$/.test(trimmed)) return 9000;
  const n = Number(trimmed);
  return n >= 30 ? 1900 + n : 2000 + n;
}

// 조에 조스탭을 배정한다(행정 조편성 개념 기반). 한 스탭은 한 조에만 속한다.
// 저장 위치는 이가드 소유 노드 iguard/groupStaff, 행정이 읽어 공유.
export default function GroupStaffView({ retreatId, groups, staff, students, adminTeachers, partial, cellColors, groupStaff }: Props) {
  const { toast } = useUI();
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [showAdvance, setShowAdvance] = useState(true); // 선발대 = 볼드 표시
  const [showLate, setShowLate] = useState(true);        // 후발대 = 빨간색 표시

  // 교사 이름 → 참석 상태(부분참 색칠용). 동명 교사가 여럿이면 마지막 값.
  const teacherStatusByName = useMemo(() => {
    const m = new Map<string, string>();
    adminTeachers.forEach(t => { if (t.name?.trim()) m.set(t.name.trim(), t.status); });
    return m;
  }, [adminTeachers]);

  const sortedGroups = useMemo(() => {
    const bu1 = sortGroupsByNumber(groups.filter(g => g.bu === "1부"));
    const bu2 = sortGroupsByNumber(groups.filter(g => g.bu === "2부"));
    const others = sortGroupsByNumber(groups.filter(g => g.bu !== "1부" && g.bu !== "2부"));
    return [...bu1, ...bu2, ...others];
  }, [groups]);
  const staffById = useMemo(() => new Map(staff.map(s => [s.id, s])), [staff]);
  // 스탭 풀: 조스탭 예외 인력(행정/이가드/삼별초 등) 제외
  const assignableStaff = useMemo(() => staff.filter(s => !isGroupStaffException(s)), [staff]);
  // 큐시트 스탭 명단과 동일하게 나이(연도)별로 묶어 표시
  const staffByAge = useMemo(() => {
    const sorted = [...assignableStaff].sort(
      (a, b) => (a.order ?? 0) - (b.order ?? 0) || a.name.localeCompare(b.name, "ko")
    );
    const map = new Map<string, IguardStaff[]>();
    sorted.forEach(s => {
      const key = s.age?.trim() || "미입력";
      const list = map.get(key) || [];
      list.push(s);
      map.set(key, list);
    });
    return [...map.entries()].sort(([a], [b]) => {
      if (a === "미입력") return 1;
      if (b === "미입력") return -1;
      return ageSortValue(a) - ageSortValue(b) || a.localeCompare(b, "ko", { numeric: true });
    });
  }, [assignableStaff]);
  // 이름 색상 — 큐시트와 동일: 후발대=빨강, 선발대=볼드
  function nameClasses(s: IguardStaff): string {
    return [
      showLate && s.corps === "후발대" ? "text-red-600" : "",
      showAdvance && s.corps === "선발대" ? "font-black" : "",
    ].filter(Boolean).join(" ");
  }
  // 현재 존재하는 조 id — 행정이 조를 삭제/재편성(자동 조편성)하면 옛 조 id의 배정은 고아가 됨
  const validGroupIds = useMemo(() => new Set(groups.map(g => g.id)), [groups]);

  // staffId → groupId (배정된 조) — 고아 배정(삭제된 조)은 제외해 스탭이 "미배정"으로 정확히 표시되게 함
  const assignedGroupOf = useMemo(() => {
    const m = new Map<string, string>();
    Object.entries(groupStaff).forEach(([gid, ids]) => {
      if (!validGroupIds.has(gid)) return;
      (ids || []).forEach(sid => m.set(sid, gid));
    });
    return m;
  }, [groupStaff, validGroupIds]);

  // 고아 배정 목록 (조가 사라졌는데 배정이 남은 키)
  const orphanEntries = useMemo(
    () => Object.entries(groupStaff).filter(([gid, ids]) => !validGroupIds.has(gid) && (ids || []).length > 0),
    [groupStaff, validGroupIds]
  );

  const activeGroup = sortedGroups.find(g => g.id === activeGroupId) ?? null;
  const totalAssigned = assignedGroupOf.size;

  async function writeGroup(groupId: string, ids: string[]) {
    setSaving(true);
    try {
      await setIguardGroupStaff(retreatId, groupId, ids);
    } catch (e) {
      toast(`저장 오류: ${e instanceof Error ? e.message : String(e)}`, "error");
    } finally {
      setSaving(false);
    }
  }

  // 스탭을 활성 조에 토글(이미 활성 조면 해제, 아니면 다른 조에서 빼고 활성 조에 추가)
  // 이전 조 제거 + 새 조 추가를 멀티패스 update 한 번으로 처리 — 중간 실패로 스탭이 사라지는 상태 방지
  async function toggleStaffOnActive(staffId: string) {
    if (!activeGroup) { toast("먼저 위에서 조를 선택하세요.", "warning"); return; }
    const cur = groupStaff[activeGroup.id] || [];
    if (cur.includes(staffId)) {
      await writeGroup(activeGroup.id, cur.filter(id => id !== staffId));
      return;
    }
    const entries: Record<string, string[] | null> = {
      [activeGroup.id]: [...cur, staffId],
    };
    const prevGid = assignedGroupOf.get(staffId);
    if (prevGid && prevGid !== activeGroup.id) {
      entries[prevGid] = (groupStaff[prevGid] || []).filter(id => id !== staffId);
    }
    setSaving(true);
    try {
      await updateIguardGroupStaffEntries(retreatId, entries);
    } catch (e) {
      toast(`저장 오류: ${e instanceof Error ? e.message : String(e)}`, "error");
    } finally {
      setSaving(false);
    }
  }

  // 고아 배정 일괄 정리 (삭제된 조 키 제거 — 이가드 소유 노드 정리라 소유권 규칙 위반 아님)
  async function cleanupOrphans() {
    if (orphanEntries.length === 0) return;
    setSaving(true);
    try {
      const entries: Record<string, string[] | null> = {};
      orphanEntries.forEach(([gid]) => { entries[gid] = null; });
      await updateIguardGroupStaffEntries(retreatId, entries);
      toast(`고아 배정 ${orphanEntries.length}건을 정리했습니다.`, "success");
    } catch (e) {
      toast(`정리 오류: ${e instanceof Error ? e.message : String(e)}`, "error");
    } finally {
      setSaving(false);
    }
  }

  async function removeFromGroup(groupId: string, staffId: string) {
    await writeGroup(groupId, (groupStaff[groupId] || []).filter(id => id !== staffId));
  }

  if (groups.length === 0) {
    return (
      <div className="card p-8 text-center text-slate-400">
        <div className="text-3xl mb-2">🧩</div>
        <p>행정 사이트에 <strong>조편성</strong>이 아직 없습니다. 조가 만들어지면 여기서 조스탭을 배정할 수 있습니다.</p>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-4 rounded-lg border border-sky-100 bg-sky-50 p-3 text-xs text-sky-700">
        ℹ️ 조에 <strong>조스탭</strong>을 배정합니다. <strong>조 카드를 먼저 누르고</strong> 아래 스탭을 누르면 그 조에 추가/해제됩니다(한 스탭은 한 조).
        <div className="mt-1 text-sky-600">여기서 배정한 조스탭은 <strong>행정 사이트 조편성</strong>에도 공유 표시됩니다. {saving && "· 저장 중…"}</div>
      </div>

      {/* 고아 배정 경고 — 행정이 조를 삭제/재편성(자동 조편성)하면 옛 조에 걸린 배정이 남는다 */}
      {orphanEntries.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-700">
          <span>
            ⚠️ <strong>사라진 조에 걸린 조스탭 배정 {orphanEntries.reduce((acc, [, ids]) => acc + (ids || []).length, 0)}건</strong>이 남아 있습니다
            (행정에서 조편성이 새로 만들어졌거나 조가 삭제됨). 해당 스탭들은 미배정으로 표시되며, 아래 버튼으로 남은 기록을 정리할 수 있습니다.
          </span>
          <button type="button" onClick={cleanupOrphans} disabled={saving}
            className="rounded-lg border border-amber-300 bg-white px-3 py-1.5 font-semibold text-amber-700 transition-colors hover:bg-amber-100">
            남은 배정 기록 정리
          </button>
        </div>
      )}

      {/* 고아 배정 경고 — 행정에서 조를 삭제하거나 자동 조편성으로 조가 새로 만들어지면 옛 조에 걸린 배정이 남는다 */}
      {orphanEntries.length > 0 && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              ⚠️ <strong>사라진 조에 걸려 있는 조스탭 배정 {orphanEntries.length}건</strong>이 있습니다 -
              행정에서 조편성이 새로 만들어졌거나 조가 삭제된 경우입니다. 해당 스탭은 미배정으로 표시되며, 아래 조 카드에서 다시 배정해 주세요.
              <div className="mt-1 text-amber-700">
                대상: {[...new Set(orphanEntries.flatMap(([, ids]) => ids))].map(sid => staffById.get(sid)?.name ?? "(미상)").join(", ")}
              </div>
            </div>
            <button type="button" onClick={cleanupOrphans} disabled={saving}
              className="shrink-0 rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-700 hover:bg-amber-100">
              옛 배정 기록 정리
            </button>
          </div>
        </div>
      )}

      {/* 스탭 풀 — 상단 sticky (조 카드 스크롤 중에도 계속 보임) */}
      <div
        className="sticky z-10 -mx-3 mb-4 border-b border-slate-200 bg-slate-50/95 px-3 pb-3 pt-2 backdrop-blur sm:-mx-4 sm:px-4"
        style={{ top: "var(--ig-header-h, 0px)" }}
      >
        <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
          <span className="text-sm font-semibold text-slate-700">
            스탭 명단 {activeGroup ? <span className="text-fuchsia-600">→ {groupDisplayName(activeGroup, groups)}에 배정</span> : <span className="text-slate-400">(조를 먼저 선택)</span>}
          </span>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <label className="flex items-center gap-1 text-[11px] text-slate-500">
              <input type="checkbox" checked={showAdvance} onChange={e => setShowAdvance(e.target.checked)} />
              선발대
            </label>
            <label className="flex items-center gap-1 text-[11px] text-slate-500">
              <input type="checkbox" checked={showLate} onChange={e => setShowLate(e.target.checked)} />
              후발대
            </label>
            <span className="text-xs text-slate-400">배정 {totalAssigned} / 배정 대상 {assignableStaff.length}</span>
          </div>
        </div>
        <div className="mb-2 flex flex-wrap gap-x-3 gap-y-0 text-[10px] text-slate-400">
          <span>🟣 분홍 = 현재 조</span>
          <span>🔵 파란 점 = 배정됨</span>
          <span>⚪ 회색 점 = 미배정</span>
          <span><strong className="text-slate-500">볼드</strong> = 선발대</span>
          <span className="text-red-400">빨간색 = 후발대</span>
        </div>
        {assignableStaff.length === 0 ? (
          <p className="text-xs text-slate-400">배정 가능한 스탭이 없습니다. (조스탭 예외 인력은 제외됩니다)</p>
        ) : (
          <div className="space-y-1 max-h-[34vh] overflow-y-auto pr-1">
            {staffByAge.map(([ageLabel, ageStaff]) => (
              <div key={ageLabel} className="grid grid-cols-[34px_1fr] items-start gap-1">
                <div className="pt-0.5 text-xs font-semibold text-slate-700">{ageLabel}:</div>
                <div className="flex flex-wrap content-start gap-1">
                  {ageStaff.map(s => {
                    const gid = assignedGroupOf.get(s.id);
                    const assigned = !!gid;
                    const inActive = activeGroup && gid === activeGroup.id;
                    const assignedElsewhere = gid && (!activeGroup || gid !== activeGroup.id);
                    return (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => toggleStaffOnActive(s.id)}
                        className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium transition-colors ${
                          inActive ? "border-fuchsia-400 bg-fuchsia-100 ring-1 ring-fuchsia-300"
                          : assigned ? "border-sky-300 bg-sky-50 hover:bg-sky-100"
                          : "border-slate-200 bg-white hover:border-fuchsia-300 hover:bg-fuchsia-50"
                        }`}
                        title={assignedElsewhere ? `이미 배정됨 - 누르면 ${activeGroup ? groupDisplayName(activeGroup, groups) : ""}로 이동` : assigned ? "배정됨" : "미배정"}
                      >
                        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${inActive ? "bg-fuchsia-500" : assigned ? "bg-sky-500" : "bg-slate-200"}`} aria-hidden />
                        <span className={nameClasses(s)}>{s.name}</span>
                        {assignedElsewhere && (
                          <span className="text-[10px] text-slate-400">
                            {(() => { const g = groups.find(x => x.id === gid); return g ? groupDisplayName(g, groups) : ""; })()}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 조 카드 — 누르면 활성화 (items-start: 모든 카드 상단 정렬로 텍스트 위치 통일) */}
      <div className="grid grid-cols-2 items-start gap-2 sm:grid-cols-3 lg:grid-cols-4">
        {sortedGroups.map(g => {
          const ids = groupStaff[g.id] || [];
          const active = g.id === activeGroupId;
          const leaderNames = (g.leader || "").split(",").map(s => s.trim()).filter(Boolean);
          const roster = (g.studentIds || [])
            .map(sid => students[sid])
            .filter((s): s is Student => !!s)
            .filter(s => studentStatus(s, partial, cellColors).status !== "불참")
            .sort((a, b) => (a.grade - b.grade) || (a.class - b.class) || ((a.num ?? 0) - (b.num ?? 0)));
          return (
            <button
              key={g.id}
              type="button"
              onClick={() => setActiveGroupId(active ? null : g.id)}
              className={`flex flex-col rounded-xl border p-2.5 text-left transition-colors ${
                active ? "border-fuchsia-400 bg-fuchsia-50 ring-1 ring-fuchsia-300" : "border-slate-200 bg-white hover:border-slate-300"
              }`}
            >
              <div className="flex items-center justify-between gap-1">
                <span className="text-sm font-bold text-slate-800">{groupDisplayName(g, groups)}</span>
                <span className="text-[10px] text-slate-400">조스탭 {ids.length}</span>
              </div>
              <div className="mt-1 flex flex-wrap gap-1">
                {ids.length === 0 ? (
                  <span className="text-[11px] text-slate-300">조스탭 없음</span>
                ) : ids.map(sid => (
                  <span
                    key={sid}
                    className="inline-flex items-center gap-0.5 rounded-full bg-fuchsia-100 px-1.5 py-0.5 text-[11px] font-medium text-fuchsia-700"
                    onClick={e => { e.stopPropagation(); removeFromGroup(g.id, sid); }}
                  >
                    {staffById.get(sid)?.name ?? "(미상)"}
                    <span className="text-fuchsia-400">✕</span>
                  </span>
                ))}
              </div>
              {/* 조장 */}
              <div className="mt-2 border-t border-slate-100 pt-1.5">
                <div className="mb-0.5 text-[10px] font-semibold text-slate-400">조장 {leaderNames.length}명</div>
                {leaderNames.length === 0 ? (
                  <span className="text-[11px] text-slate-300">조장 없음</span>
                ) : (
                  <div className="space-y-0.5">
                    {leaderNames.map(n => <div key={n} className="text-[11px] font-medium text-emerald-700">👑 {n}</div>)}
                  </div>
                )}
              </div>
              {/* 교사 (부분참 = 주황색) */}
              <div className="mt-2 border-t border-slate-100 pt-1.5">
                <div className="mb-0.5 text-[10px] font-semibold text-slate-400">교사 {(g.teachers || []).length}명</div>
                {(g.teachers || []).length === 0 ? (
                  <span className="text-[11px] text-slate-300">교사 없음</span>
                ) : (
                  <div className="space-y-0.5">
                    {(g.teachers || []).map(name => {
                      const st = teacherStatusByName.get(name);
                      const cls = st === "부분참" ? "text-orange-600 font-semibold"
                        : st === "불참" ? "text-slate-300 line-through"
                        : "text-slate-700";
                      return (
                        <div key={name} className={`text-[11px] ${cls}`}>
                          👨‍🏫 {name}{st === "부분참" ? " (부분참)" : st === "불참" ? " (불참)" : ""}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
              {/* 학생 — 세로 일렬 */}
              <div className="mt-2 border-t border-slate-100 pt-1.5">
                <div className="mb-0.5 text-[10px] font-semibold text-slate-400">학생 {roster.length}명</div>
                {roster.length === 0 ? (
                  <span className="text-[11px] text-slate-300">학생 없음</span>
                ) : (
                  <div className="space-y-0.5">
                    {roster.map(s => {
                      const { status, detail } = studentStatus(s, partial, cellColors);
                      // 교사 표기/색상과 동일: 부분참=주황, 불참=취소선, 전참=기본
                      const cls = status === "부분참" ? "text-orange-600 font-semibold"
                        : status === "불참" ? "text-slate-300 line-through"
                        : "text-slate-600";
                      const prefixCls = status === "부분참" ? "text-orange-400"
                        : status === "불참" ? "text-slate-300"
                        : "text-slate-400";
                      const suffix = status === "부분참" ? ` (부분참)/${detail}`
                        : status === "불참" ? " (불참)"
                        : "";
                      return (
                        <div key={s.id} className={`text-[11px] ${cls}`}>
                          <span className={prefixCls}>{s.buNum === 2 ? "2부" : "1부"} {s.grade}-{s.class}</span> {s.name}{suffix}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
