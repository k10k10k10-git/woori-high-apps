"use client";
import { useMemo } from "react";
import { Group, Room, IguardBus, IguardGbsPlace, IguardMeal, IguardStaff, PartialAttendanceMap, Student } from "@/features/iguard/lib/types";
import { printAsPDF, escapeHtml } from "@/features/iguard/lib/exportUtils";
import { useUI } from "@/context/UIContext";
import { groupDisplayName } from "@/features/iguard/lib/groupNumber";
import { resolveGroupStaffNames } from "@/features/iguard/lib/groupStaffNames";
import { buildMealOrderSummaries } from "@/features/iguard/lib/mealOrder";
import { isCancelledStudent } from "@/features/iguard/lib/busParticipation";
import { effectiveGbsPlace } from "@/features/iguard/lib/gbsPlaces";

const parseNames = (csv: string) => (csv || "").split(",").map(s => s.trim()).filter(Boolean);
const groupSort = (a: Group, b: Group) => a.bu.localeCompare(b.bu, "ko") || a.name.localeCompare(b.name, "ko", { numeric: true });
// 동(건물)이 있으면 "동 호수", 없으면 호수만 — 행정 앱 roomLabel과 동일 규칙
const roomLabel = (r: Room) => { const d = (r.dong ?? "").trim(); return d ? `${d} ${r.roomNumber}` : r.roomNumber; };
// 동별 → 호수 숫자순 (행정 앱 sortRooms와 동일 규칙)
const roomSort = (a: Room, b: Room) => {
  const ad = (a.dong ?? "").trim(), bd = (b.dong ?? "").trim();
  if (ad !== bd) return ad.localeCompare(bd, "ko", { numeric: true });
  return a.roomNumber.localeCompare(b.roomNumber, "ko", { numeric: true });
};

interface RoomChip { roomNumber: string; count: number; studentNames: string[]; }
interface BusInfo { day: 1 | 3; busNo: number; staff?: string; gender?: "남" | "여"; }
interface DayVisitor { name: string; day?: number; }
interface GroupRooms { group: Group; nam: RoomChip[]; yeo: RoomChip[]; etc: RoomChip[]; gbs?: string; unassigned: number; teachers: string[]; leader: string[]; staff: string[]; buses: BusInfo[]; dayVisitors: DayVisitor[]; }

export default function RoomsView({ groups, rooms, buses, meals, staff, groupStaff, gbs, students, partial, cellColors, retreatName, year }: {
  groups: Group[];
  rooms: Room[];
  buses: IguardBus[];
  meals: IguardMeal[];
  staff: IguardStaff[];
  groupStaff: Record<string, string[]>;
  gbs: Record<string, IguardGbsPlace>;
  students: Record<string, Student>;
  partial: PartialAttendanceMap;
  cellColors: Record<string, string>;
  retreatName: string;
  year: number;
}) {
  const { toast } = useUI();

  const data = useMemo<GroupRooms[]>(() => {
    return [...groups].sort(groupSort).map(g => {
      const activeStudentIds = (g.studentIds || []).filter(id => !isCancelledStudent(id, cellColors));
      const dayVisitors = activeStudentIds
        .filter(id => partial[id]?.type === "당일참석")
        .map(id => ({ name: students[id]?.name ?? "(명단 미상)", day: partial[id]?.day }))
        .sort((a, b) => (a.day ?? 99) - (b.day ?? 99) || a.name.localeCompare(b.name, "ko"));
      // 당일참석자는 숙박 대상이 아니므로 방 배정 인원·미배정 경고에서 제외한다.
      const memberSet = new Set(activeStudentIds.filter(id => partial[id]?.type !== "당일참석"));
      const assigned = new Set<string>();
      const nam: RoomChip[] = [], yeo: RoomChip[] = [], etc: RoomChip[] = [];
      [...rooms].sort(roomSort).forEach(r => {
        const mine = (r.studentIds || []).filter(id => memberSet.has(id));
        if (mine.length === 0) return;
        mine.forEach(id => assigned.add(id));
        const chip = {
          roomNumber: roomLabel(r),
          count: mine.length,
          studentNames: mine.map(id => students[id]?.name ?? "(명단 미상)"),
        };
        if ((r.type || "").includes("남")) nam.push(chip);
        else if ((r.type || "").includes("여")) yeo.push(chip);
        else etc.push(chip);
      });
      const groupBuses: BusInfo[] = buses
        .filter(b => (b.groupIds || []).includes(g.id))
        .map(b => ({
          day: (b.day === 3 ? 3 : 1) as 1 | 3,
          busNo: b.busNo,
          staff: b.staff,
          gender: b.assignmentMode === "gender" ? b.segments?.find(segment => segment.groupId === g.id)?.gender : undefined,
        }))
        .sort((a, b) => a.day - b.day);
      return {
        group: g, nam, yeo, etc, gbs: effectiveGbsPlace(g, gbs),
        unassigned: memberSet.size - assigned.size,
        teachers: g.teachers || [],
        leader: parseNames(g.leader || ""),
        staff: resolveGroupStaffNames(g.staff, groupStaff[g.id], staff),
        buses: groupBuses,
        dayVisitors,
      };
    });
  }, [groups, rooms, buses, staff, groupStaff, gbs, students, partial, cellColors]);

  const mealSummaries = useMemo(() => buildMealOrderSummaries(meals, groups), [meals, groups]);

  const hasRooms = rooms.length > 0;

  function print() {
    if (data.length === 0) return toast("조편성 데이터가 없습니다.", "warning");
    const chips = (arr: RoomChip[]) => arr.length
      ? escapeHtml(arr.map(c => `${c.roomNumber}(${c.count}) · ${c.studentNames.join(", ")}`).join(" / "))
      : "-";
    let html = `<h1>조장용 방배정표</h1><div class="subtitle">${escapeHtml(retreatName)} · ${year}년 · 출력 ${new Date().toLocaleString("ko-KR")}</div>
      <table><thead><tr><th>조</th><th>교사</th><th>조장</th><th>스탭</th><th>당일참석</th><th>GBS 장소</th><th>남자 숙소</th><th>여자 숙소</th></tr></thead><tbody>`;
    data.forEach(d => {
      const dayVisitors = d.dayVisitors.map(visitor => `${visitor.name}(${visitor.day ?? "?"}일차)`).join(", ") || "-";
      html += `<tr><td>${escapeHtml(d.group.bu)} ${escapeHtml(groupDisplayName(d.group, groups))}</td><td>${escapeHtml(d.teachers.join(", ") || "-")}</td><td>${escapeHtml(d.leader.join(", ") || "-")}</td><td>${escapeHtml(d.staff.join(", ") || "-")}</td><td>${escapeHtml(dayVisitors)}</td><td>${escapeHtml(d.gbs || "-")}</td><td>${chips(d.nam)}${d.etc.length ? " / " + chips(d.etc) : ""}</td><td>${chips(d.yeo)}</td></tr>`;
    });
    html += `</tbody></table>`;
    printAsPDF(html, "조장용-방배정표", true);
  }

  if (groups.length === 0) return (
    <div className="card p-8 text-center text-slate-400"><div className="text-3xl mb-2">🛏️</div><p>조편성 데이터가 없습니다.</p><p className="text-xs mt-1.5 text-slate-300">행정 사이트에서 조편성·방배정이 완료되면 자동으로 나타납니다.</p></div>
  );

  return (
    <div>
      <div className="mb-4 bg-fuchsia-50 border border-fuchsia-100 rounded-lg p-3 text-xs text-fuchsia-700">
        ℹ️ 조별 교사·스탭·GBS·숙소입니다. 방·조 정보는 <strong>행정 사이트</strong>, GBS 장소는 <strong>이가드 기획 탭</strong> 값을 우선해 실시간 반영합니다.
      </div>

      {mealSummaries.length > 0 && (
        <section className="mb-4 overflow-hidden rounded-lg border border-slate-200 bg-white" aria-labelledby="meal-order-summary-title">
          <h2 id="meal-order-summary-title" className="sr-only">식사 순서</h2>
          {mealSummaries.map((meal, mealIndex) => (
            <div
              key={meal.id}
              className={`px-3 py-2.5 sm:flex sm:items-center sm:gap-4 sm:py-2 ${mealIndex > 0 ? "border-t border-slate-100" : ""}`}
            >
              <span className="block shrink-0 text-sm font-medium text-amber-600 sm:w-24 sm:text-xs">{meal.label}</span>
              {/* PC와 같은 한 줄 흐름. 모바일에서만 글자·간격·행 높이를 소폭 키우고 가로로 스와이프한다. */}
              <div className="mt-1.5 min-w-0 overflow-x-auto overscroll-x-contain pb-1 [-webkit-overflow-scrolling:touch] sm:mt-0 sm:pb-0">
                <ol className="flex min-w-max items-center whitespace-nowrap text-sm text-slate-600 sm:text-xs" aria-label={`${meal.label} 조별 식사 순서`}>
                  {meal.groups.map((groupLabel, groupIndex) => (
                    <li key={`${meal.id}-${groupLabel}`} className="flex min-h-8 items-center sm:min-h-0">
                      <span className="font-semibold text-slate-700 sm:font-medium">{groupLabel}</span>
                      {groupIndex < meal.groups.length - 1 && <span className="mx-2 text-slate-300 sm:mx-1.5" aria-hidden="true">→</span>}
                    </li>
                  ))}
                </ol>
              </div>
            </div>
          ))}
        </section>
      )}

      <div className="flex items-center justify-between mb-4">
        <span className="text-sm text-slate-500">조 <strong className="text-slate-800">{data.length}</strong></span>
        <button onClick={print} className="btn-secondary btn-sm">🖨 인쇄</button>
      </div>

      {!hasRooms && (
        <div className="mb-4 bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-700">
          ⚠ 행정 사이트에 <strong>방배정(rooms)</strong> 데이터가 아직 없습니다. 행정에서 방배정을 입력하면 여기에 자동으로 채워집니다. (GBS 장소는 조편성에서 표시)
        </div>
      )}
      {hasRooms && data.some(d => d.unassigned > 0) && (
        <div className="mb-4 bg-amber-50 border border-amber-100 rounded-lg p-3 text-xs text-amber-700">
          ℹ️ 일부 조는 방 정보가 아직 연결되지 않았습니다. 방이 하나도 잡히지 않은 조는 <strong>방 정보 없음</strong>, 일부만 잡힌 조는 <strong>방 미배정</strong>으로 표시합니다.
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        {data.map(d => (
          <div key={d.group.id} className="card p-4">
            <h3 className="font-semibold text-slate-800 mb-2">
              <span className="px-2 py-0.5 mr-2 rounded text-xs bg-slate-200 text-slate-600">{d.group.bu}</span>{groupDisplayName(d.group, groups)}
            </h3>
            <div className="space-y-1.5 text-sm">
              <InfoRow label="교사" cls="text-slate-600">{d.teachers.length ? d.teachers.join(", ") : <span className="text-slate-300">-</span>}</InfoRow>
              <InfoRow label="조장" cls="text-emerald-600">{d.leader.length ? d.leader.join(", ") : <span className="text-slate-300">-</span>}</InfoRow>
              <InfoRow label="스탭" cls="text-slate-600">{d.staff.length ? d.staff.join(", ") : <span className="text-slate-300">-</span>}</InfoRow>
              {d.dayVisitors.length > 0 && (
                <InfoRow label="당일참석" cls="text-violet-600">
                  <span className="flex flex-wrap gap-1">
                    {d.dayVisitors.map((visitor, index) => (
                      <span key={`${visitor.name}-${index}`} className="rounded border border-violet-200 bg-violet-50 px-1.5 py-0.5 text-xs text-violet-700">
                        {visitor.name} · {visitor.day ?? "?"}일차
                      </span>
                    ))}
                  </span>
                </InfoRow>
              )}
              <InfoRow label="GBS 장소" cls="text-indigo-600">{d.gbs ? d.gbs : <span className="text-slate-300">-</span>}</InfoRow>
              <RoomRow label="남자 숙소" cls="text-fuchsia-700" chips={[...d.nam, ...d.etc]} />
              <RoomRow label="여자 숙소" cls="text-rose-500" chips={d.yeo} />
              <InfoRow label="버스" cls="text-sky-600">
                {d.buses.length ? (
                  <span className="flex flex-wrap gap-1.5">
                    {d.buses.map((b, i) => (
                      <span key={i} className="px-1.5 py-0.5 rounded text-xs bg-sky-50 text-sky-700 border border-sky-200">
                        {b.day}일차 {b.busNo}호차{b.gender ? `(${b.gender})` : ""}
                      </span>
                    ))}
                  </span>
                ) : <span className="text-slate-300">-</span>}
              </InfoRow>
            </div>
            {d.unassigned > 0 && (
              [...d.nam, ...d.yeo, ...d.etc].length > 0
                ? <div className="mt-2 text-xs text-amber-600">⚠ 방 미배정 {d.unassigned}명</div>
                : <div className="mt-2 text-xs text-slate-400">방 정보 없음 · {d.unassigned}명</div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function InfoRow({ label, cls, children }: { label: string; cls: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2">
      <span className={`text-xs font-medium w-[4.5rem] shrink-0 ${cls}`}>{label}</span>
      <span className="text-sm text-slate-700 min-w-0">{children}</span>
    </div>
  );
}

function RoomRow({ label, cls, chips }: { label: string; cls: string; chips: RoomChip[] }) {
  return (
    <div className="flex items-start gap-2">
      <span className={`text-xs font-medium w-[4.5rem] shrink-0 ${cls}`}>{label}</span>
      <div className="flex flex-wrap gap-1">
        {chips.length === 0 ? <span className="text-slate-300 text-xs">-</span> :
          chips.map((c, i) => (
            <span key={i} className="max-w-full rounded border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs text-slate-700">
              <span className="flex items-center gap-1 font-medium">
                {c.roomNumber}
                <span className="text-slate-400">{c.count}명</span>
              </span>
              <span className="mt-0.5 block break-keep leading-relaxed text-slate-600">
                {c.studentNames.join(", ")}
              </span>
            </span>
          ))}
      </div>
    </div>
  );
}
