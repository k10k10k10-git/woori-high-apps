"use client";
import { useEffect, useState } from "react";
import { subscribeToIguardCueSheet, IguardCueSheet } from "@/lib/db";
import { fetchSheetCsv } from "@/lib/sheetClient";
import { hashCsv } from "@/lib/scheduleReconcile";

/** 원본 시트가 마지막 임포트 이후 바뀌었는지 알려주는 배너 (기획>스탭 전체 큐싯 상단, team/admin만 보는 화면).
 *  배경에서 현재 시트 CSV를 다시 받아 해시를 lastImportHash와 비교한다 — 스냅샷 어긋남/진실 원천 이원화의 가시화. */
type State =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "never" }          // 시트는 연동됐지만 아직 앱으로 가져온 적 없음
  | { kind: "fresh"; at?: number }
  | { kind: "stale"; at?: number }
  | { kind: "unknown" };       // 확인 실패(네트워크 등) — 조용히 넘어감

function fmtWhen(ts?: number): string {
  if (!ts) return "";
  const d = new Date(ts);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export default function CueSheetFreshnessBanner({ retreatId }: { retreatId: string }) {
  const [sheet, setSheet] = useState<IguardCueSheet | null>(null);
  const [state, setState] = useState<State>({ kind: "idle" });
  const [nonce, setNonce] = useState(0); // "다시 확인" 트리거

  // 구독 실패(권한 등) 시 sheet를 비워 배너를 숨긴다 — 이 배너의 실패 모드는 "조용히 숨김"(오탐 방지 설계)
  useEffect(() => subscribeToIguardCueSheet(retreatId, setSheet, () => setSheet(null)), [retreatId]);

  useEffect(() => {
    if (!sheet) { setState({ kind: "idle" }); return; }
    if (!sheet.lastImportHash) { setState({ kind: "never" }); return; }
    let alive = true;
    setState({ kind: "checking" });
    fetchSheetCsv(`id=${encodeURIComponent(sheet.sheetId)}&gid=${encodeURIComponent(sheet.gid)}`)
      .then(csv => {
        if (!alive) return;
        const same = hashCsv(csv) === sheet.lastImportHash;
        setState(same ? { kind: "fresh", at: sheet.lastImportedAt } : { kind: "stale", at: sheet.lastImportedAt });
      })
      .catch(() => { if (alive) setState({ kind: "unknown" }); });
    return () => { alive = false; };
  }, [sheet, nonce]);

  if (state.kind === "idle" || state.kind === "unknown") return null;

  if (state.kind === "stale") {
    return (
      <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-800 flex flex-wrap items-center gap-2">
        <span>⚠️ 원본 시트가 마지막 반영({fmtWhen(state.at)}) 이후 <strong>변경됐습니다</strong>. 아래 <strong>시트에서 불러오기</strong> 후 반영해주세요.</span>
        <button onClick={() => setNonce(n => n + 1)} className="ml-auto underline text-amber-700">다시 확인</button>
      </div>
    );
  }
  if (state.kind === "fresh") {
    return (
      <div className="mb-3 rounded-lg border border-emerald-100 bg-emerald-50 p-2 text-[11px] text-emerald-700 flex items-center gap-2">
        <span>✓ 시트와 동기화됨 (마지막 반영 {fmtWhen(state.at)})</span>
        <button onClick={() => setNonce(n => n + 1)} className="ml-auto underline text-emerald-600">다시 확인</button>
      </div>
    );
  }
  if (state.kind === "never") {
    return (
      <div className="mb-3 rounded-lg border border-slate-200 bg-slate-50 p-2 text-[11px] text-slate-500">
        시트가 연동됐지만 아직 앱으로 가져온 적이 없습니다. 시트 설정에서 <strong>시트에서 불러오기 → 반영</strong>을 해주세요.
      </div>
    );
  }
  // checking
  return <div className="mb-3 text-[11px] text-slate-400">시트 최신 여부 확인 중…</div>;
}
