"use client";
import { useMemo } from "react";
import { IguardStaff, IguardScheduleBlock, IguardPost, IguardMovement } from "@/lib/types";
import { updateIguardScheduleBlock } from "@/lib/db";
import { useUI } from "@/context/UIContext";

interface Props {
  retreatId: string;
  staff: IguardStaff[];
  schedule: IguardScheduleBlock[];
  posts: IguardPost[];
  movements: IguardMovement[];
}

const toMin = (t?: string) => { if (!t) return null; const [h, m] = t.split(":").map(Number); return h * 60 + m; };
function overlaps(a: IguardScheduleBlock, b: IguardScheduleBlock): boolean {
  if (a.day !== b.day) return false;
  const s1 = toMin(a.start), e1 = toMin(a.end), s2 = toMin(b.start), e2 = toMin(b.end);
  if (s1 == null || e1 == null || s2 == null || e2 == null) return false;
  return s1 < e2 && s2 < e1;
}

type Issue = { level: "error" | "warn" | "info"; text: string };

export default function ValidationView({ retreatId, staff, schedule, posts, movements }: Props) {
  const { toast } = useUI();
  const issues = useMemo<Issue[]>(() => {
    const out: Issue[] = [];
    const staffName = new Map(staff.map(s => [s.id, s.name]));
    const postName = new Map(posts.map(p => [p.id, p.name]));
    const blockById = new Map(schedule.map(b => [b.id, b]));
    const byStaff = new Map<string, IguardMovement[]>();
    const byBlock = new Map<string, IguardMovement[]>();
    movements.forEach(mv => {
      (byStaff.get(mv.staffId) ?? byStaff.set(mv.staffId, []).get(mv.staffId)!).push(mv);
      (byBlock.get(mv.blockId) ?? byBlock.set(mv.blockId, []).get(mv.blockId)!).push(mv);
    });

    const unknownStaffIds = [...new Set(movements.map(mv => mv.staffId).filter(id => !staffName.has(id)))];
    if (unknownStaffIds.length > 0) {
      out.push({
        level: "error",
        text: `동선 스탭 ID 불일치: 현재 명단에서 찾을 수 없는 배정이 ${unknownStaffIds.length}건 있습니다. 해당 스탭이 행정 명단에서 빠졌는지 확인하거나, 스탭 전체 큐싯을 다시 가져와 주세요.`,
      });
    }

    // 1) 순간이동: 한 스탭이 시간 겹치는 두 블록에 서로 다른 포스트로 배치
    staff.forEach(s => {
      const mvs = (byStaff.get(s.id) || []).map(mv => ({ mv, b: blockById.get(mv.blockId) })).filter(x => x.b) as { mv: IguardMovement; b: IguardScheduleBlock }[];
      for (let i = 0; i < mvs.length; i++) for (let j = i + 1; j < mvs.length; j++) {
        if (overlaps(mvs[i].b, mvs[j].b)) {
          out.push({ level: "error", text: `순간이동: ${s.name} 이(가) 겹치는 시간 「${mvs[i].b.label}」(${postName.get(mvs[i].mv.postId)})와 「${mvs[j].b.label}」(${postName.get(mvs[j].mv.postId)})에 동시에 배치됨` });
        }
      }
    });

    // 2) 공백 시간블록: 아무 스탭도 배치되지 않은 블록. 단, 동선 없음 표시 블록은 제외.
    schedule.forEach(b => {
      if (!b.noMovement && !(byBlock.get(b.id)?.length)) out.push({ level: "warn", text: `공백 블록: 「${b.day}일차 ${b.start} ${b.label}」 에 배치된 스탭이 없습니다.` });
    });

    // 3) 미배치 스탭
    staff.forEach(s => { if (!(byStaff.get(s.id)?.length)) out.push({ level: "info", text: `미배치 스탭: ${s.name} 은(는) 한 번도 포스트에 배치되지 않았습니다.` }); });

    // 4) 과부하: 전체 블록의 80% 이상 배치된 스탭
    const total = schedule.length;
    if (total > 0) staff.forEach(s => {
      if (s.role === "이가드") return;
      const c = byStaff.get(s.id)?.length || 0;
      if (c >= Math.ceil(total * 0.8)) out.push({ level: "info", text: `과부하 주의: ${s.name} 은(는) ${total}개 블록 중 ${c}개에 배치됨 (휴식 확인)` });
    });

    return out;
  }, [staff, schedule, posts, movements]);

  const groups = {
    error: issues.filter(i => i.level === "error"),
    warn: issues.filter(i => i.level === "warn"),
    info: issues.filter(i => i.level === "info"),
  };
  const meta = {
    error: { cls: "bg-red-50 border-red-200 text-red-700", icon: "🔴", label: "오류 (순간이동)" },
    warn: { cls: "bg-amber-50 border-amber-200 text-amber-700", icon: "🟠", label: "경고 (공백)" },
    info: { cls: "bg-slate-50 border-slate-200 text-slate-600", icon: "🟡", label: "참고 (미배치·과부하)" },
  } as const;
  async function setNoMovement(block: IguardScheduleBlock, checked: boolean) {
    try {
      await updateIguardScheduleBlock(retreatId, block.id, { noMovement: checked || null });
      toast(checked ? "동선 없는 블록으로 표시했습니다." : "동선 검증 대상에 다시 포함했습니다.", "success");
    } catch (e) {
      toast(`저장 오류: ${e instanceof Error ? e.message : String(e)}`, "error");
    }
  }
  const sortedSchedule = [...schedule].sort((a, b) => a.day - b.day || a.start.localeCompare(b.start) || a.label.localeCompare(b.label, "ko"));

  return (
    <div>
      <div className="mb-4 bg-fuchsia-50 border border-fuchsia-100 rounded-lg p-3 text-xs text-fuchsia-700">
        ℹ️ 동선 매트릭스를 자동 점검합니다. <strong>그 시간에 누가 어디 있는지</strong>의 모순·공백을 사전에 잡습니다.
        <div className="mt-1 text-fuchsia-600">이가드 역할 스탭은 과부하 경고에서 제외하고, 동선 없는 블록은 공백 경고에서 제외합니다.</div>
      </div>
      {sortedSchedule.length > 0 && (
        <div className="card p-3 mb-4">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="text-sm font-semibold text-slate-700">검증 예외 관리</div>
              <div className="text-[11px] text-slate-400">실제로 동선 배정이 필요 없는 일정은 체크하면 공백 블록 피드백에서 제외됩니다.</div>
            </div>
            <span className="text-xs text-slate-400">동선 없음 {sortedSchedule.filter(b => b.noMovement).length}개</span>
          </div>
          <div className="grid gap-1.5 md:grid-cols-2 xl:grid-cols-3">
            {sortedSchedule.map(b => (
              <label key={b.id} className="flex min-w-0 items-center gap-2 rounded-lg border border-slate-100 bg-slate-50 px-2.5 py-2 text-xs text-slate-600">
                <input type="checkbox" checked={!!b.noMovement} onChange={e => setNoMovement(b, e.target.checked)} />
                <span className="min-w-0 truncate">
                  <span className="font-semibold text-slate-700">{b.day}일차 {b.start}</span> {b.label}
                </span>
              </label>
            ))}
          </div>
        </div>
      )}
      {issues.length === 0 ? (
        <div className="card p-8 text-center text-emerald-600"><div className="text-3xl mb-2">✅</div><p>발견된 문제가 없습니다.</p></div>
      ) : (
        (["error", "warn", "info"] as const).map(lv => groups[lv].length > 0 && (
          <div key={lv} className="mb-4">
            <div className="text-sm font-semibold text-slate-600 mb-2">{meta[lv].icon} {meta[lv].label} · {groups[lv].length}건</div>
            <div className="space-y-2">
              {groups[lv].map((i, idx) => (
                <div key={idx} className={`border rounded-lg p-3 text-sm ${meta[lv].cls}`}>{i.text}</div>
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
