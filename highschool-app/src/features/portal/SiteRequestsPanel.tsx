"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { useUI } from "@/context/UIContext";
import { deleteSiteRequest, resolveSiteRequest, subscribeToAdminSiteRequests } from "@/features/suggestions/db";
import { siteRequestAttachmentUrl, type SiteRequest } from "@/features/suggestions/siteRequest";

type Filter = "received" | "resolved" | "all";
type BusyAction = { key: string; type: "resolve" | "delete" };

function keyOf(request: SiteRequest) {
  return `${request.ownerUid}:${request.id}`;
}

function formatDate(value: number) {
  return new Date(value).toLocaleString("ko-KR", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function SiteRequestsPanel() {
  const { user, memberName } = useAuth();
  const { toast, uiConfirm } = useUI();
  const [requests, setRequests] = useState<SiteRequest[]>([]);
  const [filter, setFilter] = useState<Filter>("received");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busyAction, setBusyAction] = useState<BusyAction | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => subscribeToAdminSiteRequests(
    (next) => { setRequests(next); setLoadError(null); },
    (error) => setLoadError(error.message),
  ), []);

  const counts = useMemo(() => ({
    received: requests.filter((request) => request.status === "received").length,
    resolved: requests.filter((request) => request.status === "resolved").length,
  }), [requests]);
  const filtered = useMemo(
    () => filter === "all" ? requests : requests.filter((request) => request.status === filter),
    [filter, requests],
  );
  const selected = filtered.find((request) => keyOf(request) === selectedKey) ?? filtered[0] ?? null;

  async function resolveRequest(request: SiteRequest) {
    const requestKey = keyOf(request);
    setBusyAction({ key: requestKey, type: "resolve" });
    try {
      await resolveSiteRequest(
        request.ownerUid,
        request.id,
        memberName || user?.displayName || user?.email || "통합관리자",
        notes[requestKey] ?? "",
      );
      toast("요청을 해결 완료로 표시했습니다. 작성자에게 다음 로그인 시 알림이 전달됩니다.", "success");
    } catch (error) {
      toast(error instanceof Error ? error.message : "요청 상태를 저장하지 못했습니다.", "error");
    } finally {
      setBusyAction(null);
    }
  }

  async function deleteRequest(request: SiteRequest) {
    const confirmed = await uiConfirm(
      `“${request.title}” 요청을 삭제할까요? 첨부 파일과 해결 기록, 작성자에게 전달될 해결 알림도 함께 영구 삭제됩니다.`,
    );
    if (!confirmed) return;

    const requestKey = keyOf(request);
    setBusyAction({ key: requestKey, type: "delete" });
    try {
      await deleteSiteRequest(request.ownerUid, request.id);
      setSelectedKey(null);
      setNotes((current) => {
        const next = { ...current };
        delete next[requestKey];
        return next;
      });
      toast("요청을 삭제했습니다.", "success");
    } catch (error) {
      toast(error instanceof Error ? error.message : "요청을 삭제하지 못했습니다.", "error");
    } finally {
      setBusyAction(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-bold text-slate-900">요청사항</h3>
          <p className="mt-1 text-xs text-slate-500">사이트 건의사항이 최신순으로 쌓입니다. 해결 완료 시 작성자에게 다음 로그인 알림을 보냅니다.</p>
        </div>
        <div className="flex rounded-xl bg-slate-100 p-1" role="tablist" aria-label="요청 상태 필터">
          {([
            ["received", `받은 요청 ${counts.received}`],
            ["resolved", `해결 ${counts.resolved}`],
            ["all", `전체 ${requests.length}`],
          ] as const).map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={filter === value}
              onClick={() => { setFilter(value); setSelectedKey(null); }}
              className={`rounded-lg px-3 py-2 text-xs font-semibold ${filter === value ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {loadError && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">⚠ 요청함을 불러오지 못했습니다: {loadError}</div>}

      <div className="grid min-h-[520px] overflow-hidden rounded-2xl border border-slate-200 bg-white lg:grid-cols-[300px_minmax(0,1fr)]">
        <div className="border-b border-slate-200 bg-slate-50/60 lg:border-b-0 lg:border-r">
          {filtered.length === 0 ? (
            <div className="grid min-h-44 place-items-center px-6 text-center text-sm text-slate-400">해당 상태의 요청이 없습니다.</div>
          ) : (
            <div className="max-h-[520px] overflow-y-auto p-2">
              {filtered.map((request) => {
                const requestKey = keyOf(request);
                const active = selected && keyOf(selected) === requestKey;
                return (
                  <button
                    key={requestKey}
                    type="button"
                    onClick={() => setSelectedKey(requestKey)}
                    className={`mb-1 w-full rounded-xl border px-3 py-3 text-left transition ${active ? "border-emerald-200 bg-emerald-50" : "border-transparent hover:bg-white"}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className={`rounded-full px-2 py-1 text-[10px] font-bold ${request.status === "resolved" ? "bg-slate-200 text-slate-600" : "bg-amber-100 text-amber-800"}`}>{request.status === "resolved" ? "해결" : "받은 요청"}</span>
                      <span className="text-[10px] text-slate-400">{new Date(request.createdAt).toLocaleDateString("ko-KR")}</span>
                    </div>
                    <p className="mt-2 truncate text-sm font-bold text-slate-900">{request.title}</p>
                    <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">{request.description}</p>
                    <p className="mt-2 truncate text-[10px] text-slate-400">{request.anonymous ? "익명" : request.reporterName || "이름 미확인"} · {request.category}</p>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="min-w-0 p-4 sm:p-6">
          {!selected ? (
            <div className="grid min-h-72 place-items-center text-sm text-slate-400">왼쪽에서 요청을 선택해 주세요.</div>
          ) : (
            <article>
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-4">
                <div className="min-w-0">
                  <div className="flex flex-wrap gap-2 text-[11px]">
                    <span className="rounded-full bg-sky-100 px-2.5 py-1 font-bold text-sky-800">{selected.kind}</span>
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-600">{selected.category}</span>
                    <span className="rounded-full bg-rose-50 px-2.5 py-1 text-rose-700">{selected.urgency}</span>
                  </div>
                  <h4 className="mt-3 break-words text-xl font-bold text-slate-950">{selected.title}</h4>
                  <p className="mt-2 text-xs text-slate-500">{selected.anonymous ? "익명 요청" : `${selected.reporterName || "이름 미확인"} · ${selected.roleLabel || "권한 미확인"}`} · {formatDate(selected.createdAt)}</p>
                </div>
                <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                  <span className={`rounded-full px-3 py-1.5 text-xs font-bold ${selected.status === "resolved" ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>{selected.status === "resolved" ? "해결 완료" : "처리 대기"}</span>
                  <button
                    type="button"
                    onClick={() => void deleteRequest(selected)}
                    disabled={busyAction?.key === keyOf(selected)}
                    className="rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-bold text-red-600 transition hover:bg-red-50 disabled:opacity-50"
                  >
                    {busyAction?.key === keyOf(selected) && busyAction.type === "delete" ? "삭제 중…" : "요청 삭제"}
                  </button>
                </div>
              </div>

              <div className="mt-5 space-y-5 text-sm leading-6 text-slate-700">
                <RequestBlock label="현상·제안 내용" value={selected.description} />
                <RequestBlock label="화면/주소" value={selected.page || "미입력"} />
                <RequestBlock label="재현 방법" value={selected.reproduction || "해당 없음"} />
                <RequestBlock label="원하는 결과" value={selected.expected || "미입력"} />
                {selected.attachment && siteRequestAttachmentUrl(selected.attachment) && (
                  <section>
                    <p className="mb-2 text-xs font-bold text-slate-500">첨부 이미지</p>
                    <a href={siteRequestAttachmentUrl(selected.attachment)} download={selected.attachment.name} className="media-outline block overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
                      {/* Storage URL과 레거시 data URL 모두 전송 전에 JPEG로 재인코딩된 결과만 허용한다. */}
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={siteRequestAttachmentUrl(selected.attachment)} alt={`${selected.title} 첨부`} className="max-h-80 w-full object-contain" />
                      <span className="block border-t border-slate-200 px-3 py-2 text-xs text-slate-500">{selected.attachment.name} · {(selected.attachment.size / 1024).toFixed(0)}KB · 눌러서 저장</span>
                    </a>
                  </section>
                )}
              </div>

              {selected.status === "received" ? (
                <div className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                  <label className="block text-xs font-bold text-emerald-900">
                    해결 메모 <span className="font-normal text-emerald-700">(선택)</span>
                    <textarea
                      className="form-control mt-2 min-h-20 bg-white"
                      value={notes[keyOf(selected)] ?? ""}
                      maxLength={1000}
                      onChange={(event) => setNotes((current) => ({ ...current, [keyOf(selected)]: event.target.value }))}
                      placeholder="무엇을 반영했는지 간단히 남길 수 있습니다."
                    />
                  </label>
                  <div className="mt-3 grid grid-cols-2 gap-2 sm:flex">
                    <button
                      type="button"
                      onClick={() => void resolveRequest(selected)}
                      disabled={busyAction?.key === keyOf(selected)}
                      className="btn-primary justify-center disabled:opacity-50"
                    >
                      {busyAction?.key === keyOf(selected) && busyAction.type === "resolve" ? "처리 중…" : "해결 완료"}
                    </button>
                    <button
                      type="button"
                      onClick={() => void deleteRequest(selected)}
                      disabled={busyAction?.key === keyOf(selected)}
                      className="btn-secondary justify-center border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-50"
                    >
                      {busyAction?.key === keyOf(selected) && busyAction.type === "delete" ? "삭제 중…" : "요청 삭제"}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
                  <p className="font-bold">{formatDate(selected.resolvedAt ?? selected.createdAt)} 해결 완료</p>
                  <p className="mt-1 text-xs text-emerald-700">처리: {selected.resolvedBy || "통합관리자"}{selected.notifiedAt ? ` · 사용자 알림 확인 ${formatDate(selected.notifiedAt)}` : " · 사용자 다음 로그인 알림 대기"}</p>
                  {selected.resolutionNote && <p className="mt-3 whitespace-pre-wrap rounded-lg bg-white/70 p-3">{selected.resolutionNote}</p>}
                  <button
                    type="button"
                    onClick={() => void deleteRequest(selected)}
                    disabled={busyAction?.key === keyOf(selected)}
                    className="btn-secondary mt-3 justify-center border-red-200 bg-white text-red-600 hover:bg-red-50 disabled:opacity-50"
                  >
                    {busyAction?.key === keyOf(selected) && busyAction.type === "delete" ? "삭제 중…" : "요청 삭제"}
                  </button>
                </div>
              )}
            </article>
          )}
        </div>
      </div>
    </div>
  );
}

function RequestBlock({ label, value }: { label: string; value: string }) {
  return <section><p className="mb-1 text-xs font-bold text-slate-500">{label}</p><p className="whitespace-pre-wrap break-words">{value}</p></section>;
}
