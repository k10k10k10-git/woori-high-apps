"use client";

import { useEffect, useMemo, useState } from "react";
import CenterSpinner from "@/components/CenterSpinner";
import { useAuth } from "@/context/AuthContext";
import { canAccessArea } from "@/features/portal/accessPolicy";
import VacationHome from "@/features/portal/VacationHome";
import { subscribeToAllRetreatPeriods, subscribeToRetreats } from "@/lib/db";
import type { Retreat } from "@/lib/types";
import { selectRetreatForWork } from "@/lib/retreatSelection";

export default function ProgramsHome() {
  const { user, loading, roles } = useAuth();
  const allowed = canAccessArea("retreat-admin", roles);
  const [records, setRecords] = useState<Retreat[]>([]);
  const [periods, setPeriods] = useState<Array<{ retreatId: string; startDate: string; endDate?: string }>>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState("");
  const [generation, setGeneration] = useState(0);

  useEffect(() => {
    if (loading || !user || !allowed) return;
    return subscribeToRetreats((next) => {
      setRecords(next);
      setSelectedId((previous) => previous && next.some((retreat) => retreat.id === previous) ? previous : null);
    }, (error) => setLoadError(error.message));
  }, [allowed, generation, loading, user]);

  const idsKey = records.map((retreat) => retreat.id).join(",");
  useEffect(() => {
    if (!user || !allowed) return;
    const ids = idsKey ? idsKey.split(",") : [];
    return subscribeToAllRetreatPeriods(ids, setPeriods, (error) => setLoadError((previous) => previous || error.message));
  }, [allowed, idsKey, user, generation]);

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

  if (loading) return <CenterSpinner />;
  if (!user || !allowed) return (
    <div className="program-access-state"><h1>프로그램 준비 접근 권한이 없습니다</h1><p>수련회 행정 조회 권한이 있는 계정만 사용할 수 있습니다.</p></div>
  );

  return (
    <div className="min-h-screen bg-slate-50">
      <VacationHome mode="program" roles={roles} retreats={retreats} selectedId={selectedId ?? selectRetreatForWork(retreats, periods, new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" }))?.id ?? null} onSelect={setSelectedId} loadError={loadError || null} onRetry={() => { setLoadError(""); setGeneration((value) => value + 1); }} />
    </div>
  );
}
