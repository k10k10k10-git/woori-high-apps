"use client";
import { useMemo, useState } from "react";
import { IguardScheduleBlock } from "@/features/iguard/lib/types";
import { updateIguardScheduleBlock } from "@/features/iguard/lib/db";
import { useUI } from "@/context/UIContext";

function timeRangeLabel(block: IguardScheduleBlock): string {
  if (!block.end) return block.start;
  return block.end === "~" ? `${block.start}~` : `${block.start}~${block.end}`;
}

function LeaderNoteEditor({ retreatId, block }: { retreatId: string; block: IguardScheduleBlock }) {
  const { toast } = useUI();
  // 부모가 key={block.id}로 렌더하므로 블록이 바뀌면 이 컴포넌트가 리마운트되고
  // 초기값이 다시 잡힌다. 서버 값으로 되돌리는 effect를 두면 오히려 입력 중인
  // 내용을 실시간 갱신이 덮어쓴다.
  const [text, setText] = useState(block.leaderNote || "");

  async function save() {
    const trimmed = text.trim();
    if (trimmed === (block.leaderNote || "")) return;
    try {
      await updateIguardScheduleBlock(retreatId, block.id, { leaderNote: trimmed || null });
    } catch (e) {
      toast(`저장 오류: ${e instanceof Error ? e.message : String(e)}`, "error");
    }
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="font-mono text-xs text-slate-500">{timeRangeLabel(block)}</span>
        <span className="text-sm font-semibold text-slate-800">{block.label}</span>
      </div>
      <textarea
        value={text}
        placeholder="조장이 이 시간대에 해야 할 안내·행동"
        rows={Math.max(3, Math.min(10, text.split("\n").length + 1))}
        onChange={e => setText(e.target.value)}
        onBlur={save}
        className="w-full min-h-[96px] resize-y rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-relaxed text-slate-700 outline-none focus:border-fuchsia-400"
      />
    </div>
  );
}

export default function LeaderCueManageView({ retreatId, schedule }: {
  retreatId: string;
  schedule: IguardScheduleBlock[];
}) {
  const sorted = useMemo(() => [...schedule].sort((a, b) => a.day - b.day || a.start.localeCompare(b.start)), [schedule]);
  const days = useMemo(() => [...new Set(sorted.map(b => b.day))], [sorted]);

  if (schedule.length === 0) {
    return (
      <div className="card p-8 text-center text-slate-400">
        <div className="text-3xl mb-2">🧑‍🏫</div>
        <p>스탭 전체 큐싯을 먼저 입력하면<br />조장 큐싯을 관리할 수 있습니다.</p>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-4 rounded-lg border border-emerald-100 bg-emerald-50 p-3 text-xs text-emerald-700">
        조장에게 보여줄 시간대별 안내만 따로 관리합니다.
      </div>
      {days.map(day => (
        <div key={day} className="mb-4">
          <div className="mb-2 text-sm font-semibold text-slate-700">{day}일차</div>
          <div className="grid gap-2">
            {sorted.filter(block => block.day === day).map(block => (
              <LeaderNoteEditor key={block.id} retreatId={retreatId} block={block} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
