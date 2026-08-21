"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowRight, CheckCircle, ClockCountdown, EnvelopeSimple } from "@phosphor-icons/react";
import { useAuth } from "@/context/AuthContext";
import { subscribeToMySiteRequests } from "@/features/suggestions/db";
import type { SiteRequest } from "@/features/suggestions/siteRequest";
import { requestSummary } from "./myPageDashboard";

function formatTimestamp(value: number) {
  return new Date(value).toLocaleString("ko-KR", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function MyRequestsPanel() {
  const { user } = useAuth();
  const [requests, setRequests] = useState<SiteRequest[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const summary = useMemo(() => requestSummary(requests), [requests]);

  useEffect(() => {
    if (!user) return;
    return subscribeToMySiteRequests(user.uid, (values) => {
      setRequests(values);
      setLoaded(true);
      setError(null);
    }, (reason) => {
      setLoaded(true);
      setError(reason.message);
    });
  }, [user]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-bold text-slate-950">내 요청</h3>
          <p className="mt-1 text-xs leading-5 text-slate-500">내가 전송한 사이트 건의사항의 처리 상태와 해결 메모를 확인합니다.</p>
        </div>
        <Link href="/suggestions" className="btn-primary btn-sm">새 요청 작성 <ArrowRight weight="bold" /></Link>
      </div>

      {error && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">요청을 불러오지 못했습니다: {error}</div>}

      <section className="mypage-request-summary" aria-label="내 요청 요약">
        <div><EnvelopeSimple weight="duotone" /><span><small>전체 요청</small><strong>{loaded ? summary.total : "-"}<b>건</b></strong></span></div>
        <div><ClockCountdown weight="duotone" /><span><small>처리 중</small><strong>{loaded ? summary.received : "-"}<b>건</b></strong></span></div>
        <div><CheckCircle weight="duotone" /><span><small>해결 완료</small><strong>{loaded ? summary.resolved : "-"}<b>건</b></strong></span></div>
      </section>

      <section className="mypage-section" aria-labelledby="my-request-list-title">
        <div className="mypage-section-header"><div><h4 id="my-request-list-title">요청 내역</h4><p>최근 전송 순서로 표시합니다.</p></div></div>
        {!loaded ? (
          <div className="space-y-2 p-4" aria-label="요청 내역 불러오는 중">
            {[0, 1, 2].map((item) => <div key={item} className="h-16 animate-pulse rounded-xl bg-slate-100" />)}
          </div>
        ) : requests.length === 0 ? (
          <div className="mypage-empty"><EnvelopeSimple weight="duotone" /><strong>전송한 요청이 없습니다</strong><p>사이트 이용 중 불편한 점이 생기면 건의사항으로 알려 주세요.</p></div>
        ) : (
          <div className="mypage-request-list">
            {requests.map((request) => (
              <article key={request.id}>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`mypage-request-status is-${request.status}`}>{request.status === "resolved" ? "해결 완료" : "접수 완료"}</span>
                    <small>{request.category}</small>
                  </div>
                  <h4>{request.title}</h4>
                  <p>{request.description}</p>
                  {request.status === "resolved" && request.resolutionNote && <blockquote>해결 메모: {request.resolutionNote}</blockquote>}
                </div>
                <time>{formatTimestamp(request.resolvedAt ?? request.createdAt)}</time>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
