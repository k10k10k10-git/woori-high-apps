"use client";

import { useEffect, useState } from "react";
import { Retreat } from "@/features/iguard/lib/types";
import { cloneIguardStructure, getRetreats } from "@/features/iguard/lib/db";
import { useUI } from "@/context/UIContext";

export default function StructureClonePanel({ retreatId }: { retreatId: string }) {
  const { toast, uiConfirm } = useUI();
  const [retreats, setRetreats] = useState<Retreat[]>([]);
  const [sourceId, setSourceId] = useState("");
  const [working, setWorking] = useState(false);

  useEffect(() => {
    getRetreats()
      .then(list => setRetreats(list.filter(item => item.id !== retreatId).sort((a, b) => b.year - a.year)))
      .catch(error => toast(`수련회 목록 조회 오류: ${error instanceof Error ? error.message : String(error)}`, "error"));
  }, [retreatId, toast]);

  async function clone() {
    const source = retreats.find(item => item.id === sourceId);
    if (!source) return toast("원본 수련회를 선택해주세요.", "warning");
    if (!await uiConfirm(
      `"${source.name}"의 구조만 복제할까요?\n\n포함: 시간 블록·구간·포스트·자리/식사 틀·가이드\n제외: 사람·담당자·메모·버스·GBS·인원체크·PIN\n\n대상 관련 데이터가 하나라도 있으면 자동 중단됩니다.`,
    )) return;
    setWorking(true);
    try {
      const count = await cloneIguardStructure(sourceId, retreatId);
      toast(`구조 ${count}건을 복제했습니다. 담당자와 조 배정을 확인해주세요.`, "success");
    } catch (error) {
      toast(error instanceof Error ? error.message : String(error), "error");
    } finally { setWorking(false); }
  }

  return (
    <div className="card mb-4 border border-indigo-100 bg-indigo-50/40 p-3">
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-[240px] flex-1">
          <label className="mb-1 block text-xs font-semibold text-indigo-700">이전 수련회 구조로 시작</label>
          <select className="input w-full bg-white" value={sourceId} onChange={event => setSourceId(event.target.value)}>
            <option value="">원본 수련회 선택</option>
            {retreats.map(item => <option key={item.id} value={item.id}>{item.year}년 · {item.name}</option>)}
          </select>
        </div>
        <button type="button" onClick={clone} disabled={!sourceId || working} className="btn-secondary disabled:opacity-50">
          {working ? "복제 중…" : "구조만 복제"}
        </button>
      </div>
      <p className="mt-2 text-[11px] leading-relaxed text-indigo-600">
        새 수련회의 관련 항목이 모두 비어 있을 때만 실행됩니다. 사람·담당자·자유 메모는 복제하지 않고 담당 슬롯을 미정으로 만듭니다.
      </p>
    </div>
  );
}
