"use client";

import { useEffect, useMemo, useState } from "react";
import LoadFailureNotice from "@/components/LoadFailureNotice";
import WorkspaceAccessGate from "@/components/WorkspaceAccessGate";
import { useAuth } from "@/context/AuthContext";
import { canAccessArea } from "@/features/portal/accessPolicy";
import VacationHome from "@/features/portal/VacationHome";
import { subscribeToAllRetreatPeriods, subscribeToRetreats } from "@/lib/db";
import type { Retreat } from "@/lib/types";
import { selectRetreatForWork } from "@/lib/retreatSelection";

export default function ProgramsHome() {
  const { user, roles } = useAuth();
  const allowed = canAccessArea("retreat-admin", roles);
  return <WorkspaceAccessGate allowed={allowed} area="프로그램 준비">
    <ProgramsWorkspace key={user?.uid ?? "guest"} />
  </WorkspaceAccessGate>;
}

function ProgramsWorkspace() {
  const { user, roles } = useAuth();
  const [records, setRecords] = useState<Retreat[]>([]);
  const [periods, setPeriods] = useState<Array<{ retreatId: string; startDate: string; endDate?: string }>>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [periodError, setPeriodError] = useState("");
  const [generation, setGeneration] = useState(0);
  const scope = `${user?.uid ?? "guest"}:${generation}`;
  const [listResult, setListResult] = useState<{ scope: string; error: string | null } | null>(null);

  useEffect(() => {
    let active = true;
    const stop = subscribeToRetreats((next) => {
      if (!active) return;
      setRecords(next);
      setSelectedId((previous) => previous && next.some((retreat) => retreat.id === previous) ? previous : null);
      setListResult({ scope, error: null });
    }, (error) => { if (active) setListResult({ scope, error: error.message }); });
    return () => { active = false; stop(); };
  }, [scope]);

  const idsKey = records.map((retreat) => retreat.id).join(",");
  useEffect(() => {
    let active = true;
    const ids = idsKey ? idsKey.split(",") : [];
    const stop = subscribeToAllRetreatPeriods(ids, (next) => {
      if (!active) return;
      setPeriods(next);
      setPeriodError("");
    }, (error) => { if (active) setPeriodError(error.message); });
    return () => { active = false; stop(); };
  }, [idsKey, generation]);

  const retreats = useMemo(() => {
    const earliest: Record<string, string> = {};
    periods.forEach((period) => {
      if (!earliest[period.retreatId] || period.startDate < earliest[period.retreatId]) earliest[period.retreatId] = period.startDate;
    });
    return [...records].sort((a, b) => {
      const aDate = earliest[a.id];
      const bDate = earliest[b.id];
      if (aDate && bDate) return bDate.localeCompare(aDate);
      if (aDate) return -1;
      if (bDate) return 1;
      return b.createdAt - a.createdAt;
    });
  }, [periods, records]);

  function retryPrograms() {
    setPeriodError("");
    setGeneration((value) => value + 1);
  }

  if (listResult?.scope !== scope) return <main className="team-first-state" role="status">
    <h1 className="page-title">프로그램 준비 목록을 불러오고 있습니다…</h1>
    <p>등록된 수련회를 확인한 뒤 준비 화면을 열어 드립니다.</p>
  </main>;
  if (listResult.error !== null) return <main className="team-first-state">
    <LoadFailureNotice title="프로그램 준비 목록을 불러오지 못했습니다." sources={["수련회 목록"]} onRetry={retryPrograms} description="등록된 수련회가 없는 상태와는 다릅니다. 다시 불러오기를 눌러 주세요." />
  </main>;

  return (
    <div className="min-h-screen bg-slate-50">
      <VacationHome mode="program" roles={roles} retreats={retreats} selectedId={selectedId ?? selectRetreatForWork(retreats, periods, new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" }))?.id ?? null} onSelect={setSelectedId} loadError={periodError ? "수련회 일정을 확인하지 못했습니다. 다시 불러오기를 눌러 주세요." : null} onRetry={retryPrograms} />
    </div>
  );
}
