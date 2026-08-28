"use client";

import { ArrowClockwise, CheckCircle, Database, ShieldCheck, WarningCircle, X } from "@phosphor-icons/react";
import OverlayShell from "@/components/OverlayShell";
import type { ParticipantBulkPlan } from "@/lib/participantSyncPreview";

type Props = {
  plan: ParticipantBulkPlan;
  applying: boolean;
  onCancel: () => void;
  onApply: () => void;
};

export default function ParticipantSyncDialog({ plan, applying, onCancel, onApply }: Props) {
  const { summary } = plan;
  const isSheet = plan.kind === "sheet";
  const title = isSheet ? "구글시트 동기화 검토" : "출석부 DB 재매칭 검토";
  const hasRemoval = summary.removedCount > 0;
  const noChanges = summary.changedCount === 0 && summary.addedCount === 0 && summary.removedCount === 0;

  return (
    <OverlayShell label={title} onClose={onCancel} closeOnBackdrop={!applying} panelClassName="w-full max-w-xl">
      <div className="modal-card max-h-[min(760px,calc(100dvh-32px))] overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900">{title}</h2>
            <p className="mt-1 text-sm leading-6 text-slate-500">아직 데이터는 바뀌지 않았습니다. 아래 예상 결과를 확인한 뒤 적용해 주세요.</p>
          </div>
          <button type="button" onClick={onCancel} disabled={applying} className="compact-icon-control shrink-0 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="검토 창 닫기">
            <X aria-hidden="true" size={18} weight="bold" />
          </button>
        </div>

        <div className="mt-5 grid grid-cols-2 overflow-hidden rounded-xl border border-slate-200 sm:grid-cols-4">
          <Metric label="현재 명단" value={summary.currentCount} />
          <Metric label={isSheet ? "시트 원본" : "출석부 학생"} value={summary.sourceCount} />
          <Metric label="반영 후" value={summary.nextCount} />
          <Metric label="자동 매칭" value={summary.matchedCount} />
        </div>

        <div className="mt-4 grid gap-2 sm:grid-cols-3">
          <Change label="추가" value={summary.addedCount} tone="positive" />
          <Change label="수정" value={summary.changedCount} tone="neutral" />
          <Change label="명단 제외" value={summary.removedCount} tone={hasRemoval ? "danger" : "neutral"} />
        </div>

        <div className={`mt-4 rounded-xl border p-4 ${hasRemoval ? "border-red-200 bg-red-50 text-red-800" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`}>
          <div className="flex items-start gap-2">
            {hasRemoval ? <WarningCircle className="mt-0.5 shrink-0" aria-hidden="true" size={19} weight="fill" /> : <CheckCircle className="mt-0.5 shrink-0" aria-hidden="true" size={19} weight="fill" />}
            <div className="text-sm leading-6">
              <strong className="block">{hasRemoval ? `${summary.removedCount}명이 현재 명단에서 제외됩니다.` : "명단 제외 예정이 없습니다."}</strong>
              <span>{isSheet ? `중복 신청 ${summary.duplicateGroupCount}그룹, 자동 매칭 불가 ${summary.unmatchedCount}명을 적용 후 검토할 수 있습니다.` : `자동 매칭 불가 ${summary.unmatchedCount}명은 기존 신청 정보를 유지합니다.`}</span>
            </div>
          </div>
        </div>

        <div className="mt-3 flex items-start gap-2 rounded-xl bg-slate-50 p-4 text-sm leading-6 text-slate-600">
          <ShieldCheck className="mt-0.5 shrink-0 text-emerald-700" aria-hidden="true" size={19} weight="duotone" />
          <p>적용 직전에 현재 명단과 비공개 연락처를 같은 시점으로 백업합니다. 특이사항은 {summary.preservedExtraCount}명분을 보존하며, 최근 백업에서 복구할 수 있습니다.</p>
        </div>

        {plan.kind === "rematch" && plan.missedNames.length > 0 && (
          <details className="mt-3 rounded-xl border border-slate-200 px-4 py-3 text-sm text-slate-600">
            <summary className="cursor-pointer font-semibold text-slate-700">미매칭 예시 {Math.min(plan.missedNames.length, 8)}명 보기</summary>
            <p className="mt-2 leading-6">{plan.missedNames.slice(0, 8).join(", ")}</p>
          </details>
        )}

        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" data-autofocus onClick={onCancel} disabled={applying} className="btn-secondary justify-center">취소</button>
          <button type="button" onClick={onApply} disabled={applying || noChanges} className="btn-primary justify-center">
            {applying ? <ArrowClockwise className="animate-spin" aria-hidden="true" size={17} /> : <Database aria-hidden="true" size={17} weight="duotone" />}
            {applying ? "백업 후 반영 중…" : noChanges ? "변경 사항 없음" : `백업 후 ${summary.nextCount}명 반영`}
          </button>
        </div>
      </div>
    </OverlayShell>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return <div className="border-b border-r border-slate-200 p-3 last:border-r-0 sm:border-b-0"><span className="block text-[11px] text-slate-500">{label}</span><strong className="mt-1 block text-xl tabular-nums text-slate-900">{value}명</strong></div>;
}

function Change({ label, value, tone }: { label: string; value: number; tone: "positive" | "neutral" | "danger" }) {
  const toneClass = tone === "danger" ? "bg-red-50 text-red-700" : tone === "positive" ? "bg-emerald-50 text-emerald-700" : "bg-slate-50 text-slate-700";
  return <div className={`flex items-center justify-between rounded-xl px-4 py-3 text-sm ${toneClass}`}><span>{label}</span><strong className="tabular-nums">{value}명</strong></div>;
}
