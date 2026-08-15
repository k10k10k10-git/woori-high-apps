"use client";
import { useMemo } from "react";
import { IguardStaff, IguardScheduleBlock, IguardPost, AssignedIguardMovement } from "@/features/iguard/lib/types";
import { buildStaffAssignmentStats } from "@/features/iguard/lib/staffAssignmentStats";
import { isTeleport } from "@/features/iguard/lib/validationRules";

interface Props {
  staff: IguardStaff[];
  schedule: IguardScheduleBlock[];
  posts: IguardPost[];
  movements: AssignedIguardMovement[];
}

type Issue = { text: string };

export default function ValidationView({ staff, schedule, posts, movements }: Props) {
  const issues = useMemo<Issue[]>(() => {
    const out: Issue[] = [];
    const staffName = new Map(staff.map(s => [s.id, s.name]));
    const postName = new Map(posts.map(p => [p.id, p.name]));
    const blockById = new Map(schedule.map(b => [b.id, b]));
    const byStaff = new Map<string, AssignedIguardMovement[]>();
    movements.forEach(mv => {
      (byStaff.get(mv.staffId) ?? byStaff.set(mv.staffId, []).get(mv.staffId)!).push(mv);
    });

    const unknownStaffIds = [...new Set(movements.map(mv => mv.staffId).filter(id => !staffName.has(id)))];
    if (unknownStaffIds.length > 0) {
      out.push({
        text: `동선 스탭 ID 불일치: 현재 명단에서 찾을 수 없는 배정이 ${unknownStaffIds.length}건 있습니다. 해당 스탭이 행정 명단에서 빠졌는지 확인하거나, 스탭 전체 큐싯을 다시 가져와 주세요.`,
      });
    }

    // 1) 순간이동: 한 스탭이 시간 겹치는 두 블록에 "서로 다른 포스트"로 배치 (같은 포스트면 이동 없음 → 정상)
    staff.forEach(s => {
      const mvs = (byStaff.get(s.id) || []).map(mv => ({ mv, b: blockById.get(mv.blockId) })).filter(x => x.b) as { mv: AssignedIguardMovement; b: IguardScheduleBlock }[];
      for (let i = 0; i < mvs.length; i++) for (let j = i + 1; j < mvs.length; j++) {
        if (isTeleport({ postId: mvs[i].mv.postId, block: mvs[i].b }, { postId: mvs[j].mv.postId, block: mvs[j].b })) {
          out.push({ text: `순간이동: ${s.name} 이(가) 겹치는 시간 「${mvs[i].b.label}」(${postName.get(mvs[i].mv.postId)})와 「${mvs[j].b.label}」(${postName.get(mvs[j].mv.postId)})에 동시에 배치됨` });
        }
      }
    });

    return out;
  }, [staff, schedule, posts, movements]);

  const assignmentStats = useMemo(
    () => buildStaffAssignmentStats(staff, movements),
    [staff, movements],
  );
  const unassigned = assignmentStats.filter(stat => stat.movementCount === 0);
  const assigned = assignmentStats.filter(stat => stat.movementCount > 0);

  return (
    <div className="space-y-5">
      <div className="rounded-lg border border-emerald-100 bg-emerald-50 p-3 text-xs leading-relaxed text-emerald-700">
        ℹ️ 겹치는 시간에 서로 다른 장소로 배정된 경우와 명단 불일치를 점검합니다.
        스탭별 배정 횟수는 상대적인 과부하 판정 없이 실제 동선 수 그대로 표시합니다.
      </div>

      <section aria-labelledby="validation-errors-title">
        <div className="mb-2 flex items-center justify-between gap-3">
          <h2 id="validation-errors-title" className="text-sm font-semibold text-slate-700">🔴 실제 오류 · {issues.length}건</h2>
          <span className="text-xs text-slate-400">순간이동·명단 불일치</span>
        </div>
        {issues.length === 0 ? (
          <div className="card border-emerald-200 bg-emerald-50 p-5 text-sm text-emerald-700">
            ✅ 겹치는 동선과 명단 불일치가 없습니다.
          </div>
        ) : (
          <div className="space-y-2">
            {issues.map((issue, index) => (
              <div key={index} className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{issue.text}</div>
            ))}
          </div>
        )}
      </section>

      <section aria-labelledby="unassigned-staff-title">
        <div className="mb-2 flex items-center justify-between gap-3">
          <h2 id="unassigned-staff-title" className="text-sm font-semibold text-slate-700">🟠 미배치 스탭 · {unassigned.length}명</h2>
          <span className="text-xs text-slate-400">동선 배정 0회</span>
        </div>
        {unassigned.length === 0 ? (
          <div className="card p-4 text-sm text-emerald-700">모든 스탭에게 한 번 이상 동선이 배정되어 있습니다.</div>
        ) : (
          <div className="card flex flex-wrap gap-2 p-4">
            {unassigned.map(stat => (
              <span key={stat.staffId} className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-sm text-amber-800">
                {stat.name}
              </span>
            ))}
          </div>
        )}
      </section>

      <section aria-labelledby="assignment-count-title">
        <div className="mb-2 flex items-center justify-between gap-3">
          <h2 id="assignment-count-title" className="text-sm font-semibold text-slate-700">🔵 스탭별 동선 배정 횟수</h2>
          <span className="text-xs text-slate-400">많은 순서 · 총 {movements.length}건</span>
        </div>
        {assigned.length === 0 ? (
          <div className="card p-4 text-sm text-slate-500">아직 등록된 동선 배정이 없습니다.</div>
        ) : (
          <div className="card grid gap-px overflow-hidden bg-slate-200 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {assigned.map(stat => (
              <div key={stat.staffId} className="flex items-center justify-between gap-3 bg-white px-3 py-3">
                <span className="min-w-0 truncate text-sm font-medium text-slate-700">{stat.name}</span>
                <span className="shrink-0 rounded-full bg-sky-50 px-2.5 py-1 text-xs font-semibold text-sky-700">
                  동선 {stat.movementCount}회 · 일정 {stat.blockCount}개
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
