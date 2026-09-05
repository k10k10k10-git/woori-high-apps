"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  ArrowClockwise,
  ArrowRight,
  CheckCircle,
  ClockCountdown,
  EnvelopeSimple,
  ShieldCheck,
  UsersThree,
  WarningCircle,
  WifiHigh,
  WifiSlash,
} from "@phosphor-icons/react";
import { subscribeToAdminSiteRequests } from "@/features/suggestions/db";
import type { SiteRequest } from "@/features/suggestions/siteRequest";
import {
  subscribeToIguardMembers,
  subscribeToIguardPending,
  type IguardMemberInfo,
  type IguardPendingReq,
} from "@/features/iguard/lib/db";
import {
  subscribeToConnection,
  subscribeToMainAdmins,
  subscribeToPendingRequests,
  subscribeToRetreatAdmins,
  type RetreatAdminMember,
} from "@/lib/db";
import { useLoadErrors } from "@/lib/useLoadErrors";
import {
  buildAdminDashboardSummary,
  buildAdminWorkQueue,
  countUniqueTeamMembers,
  mergeAccessQueue,
  recentResolvedRequests,
  type AdminPendingRequests,
  type AdminWorkItem,
} from "./adminDashboard";

type DashboardDestination = "team" | "requests";
type LoadStatus = "loading" | "ready" | "error";
type LoadedState = Record<"requests" | "mainAdmins" | "retreatAdmins" | "adminPending" | "iguardMembers" | "iguardPending", LoadStatus>;

const INITIAL_LOADED: LoadedState = {
  requests: "loading", mainAdmins: "loading", retreatAdmins: "loading",
  adminPending: "loading", iguardMembers: "loading", iguardPending: "loading",
};
const SOURCE_LABELS: Record<keyof LoadedState, string> = {
  requests: "사이트 요청", mainAdmins: "통합관리자", retreatAdmins: "행정 팀원",
  adminPending: "사역 접근 신청", iguardMembers: "현장 팀원", iguardPending: "현장 접근 신청",
};

function combinedStatus(statuses: LoadStatus[]): LoadStatus {
  if (statuses.includes("error")) return "error";
  return statuses.includes("loading") ? "loading" : "ready";
}

function formatTimestamp(value: number) {
  return new Date(value).toLocaleString("ko-KR", {
    month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

export default function AdminDashboard({ onNavigate }: { onNavigate: (destination: DashboardDestination) => void }) {
  const [revision, setRevision] = useState(0);
  return <AdminDashboardContent key={revision} onNavigate={onNavigate} onRetry={() => setRevision((value) => value + 1)} />;
}

function AdminDashboardContent({ onNavigate, onRetry }: {
  onNavigate: (destination: DashboardDestination) => void;
  onRetry: () => void;
}) {
  const [requests, setRequests] = useState<SiteRequest[]>([]);
  const [mainAdmins, setMainAdmins] = useState<Record<string, boolean>>({});
  const [retreatAdmins, setRetreatAdmins] = useState<Record<string, RetreatAdminMember>>({});
  const [adminPending, setAdminPending] = useState<AdminPendingRequests>({});
  const [iguardMembers, setIguardMembers] = useState<Record<string, IguardMemberInfo>>({});
  const [iguardPending, setIguardPending] = useState<IguardPendingReq[]>([]);
  const [connected, setConnected] = useState<boolean | null>(null);
  const [loaded, setLoaded] = useState<LoadedState>(INITIAL_LOADED);
  const { fail, ok, message: loadError } = useLoadErrors("admin-dashboard");

  useEffect(() => {
    let active = true;
    const receive = <T,>(key: keyof LoadedState, setter: (value: T) => void) => (value: T) => {
      if (!active) return;
      setter(value);
      ok(SOURCE_LABELS[key]);
      setLoaded((current) => current[key] === "ready" ? current : { ...current, [key]: "ready" });
    };
    const reject = <T,>(key: keyof LoadedState, setter: (value: T) => void, empty: T) => (error: Error) => {
      if (!active) return;
      setter(empty);
      fail(SOURCE_LABELS[key])(error);
      setLoaded((current) => ({ ...current, [key]: "error" }));
    };
    const unsubs = [
      subscribeToConnection((value) => {
        if (!active) return;
        setConnected(value);
        ok("실시간 연결");
      }, (error) => {
        if (!active) return;
        setConnected(false);
        fail("실시간 연결")(error);
      }),
      subscribeToAdminSiteRequests(receive("requests", setRequests), reject("requests", setRequests, [])),
      subscribeToMainAdmins(receive("mainAdmins", setMainAdmins), reject("mainAdmins", setMainAdmins, {})),
      subscribeToRetreatAdmins(receive("retreatAdmins", setRetreatAdmins), reject("retreatAdmins", setRetreatAdmins, {})),
      subscribeToPendingRequests(receive("adminPending", setAdminPending), reject("adminPending", setAdminPending, {})),
      subscribeToIguardMembers(receive("iguardMembers", setIguardMembers), reject("iguardMembers", setIguardMembers, {})),
      subscribeToIguardPending(receive("iguardPending", setIguardPending), reject("iguardPending", setIguardPending, [])),
    ];
    return () => {
      active = false;
      unsubs.forEach((unsubscribe) => unsubscribe());
    };
  }, [fail, ok]);

  const accessQueue = useMemo(() => mergeAccessQueue(adminPending, iguardPending), [adminPending, iguardPending]);
  const teamMembers = useMemo(() => countUniqueTeamMembers(mainAdmins, retreatAdmins, iguardMembers), [iguardMembers, mainAdmins, retreatAdmins]);
  const summary = useMemo(() => buildAdminDashboardSummary({ requests, accessQueue, teamMembers }), [accessQueue, requests, teamMembers]);
  const workQueue = useMemo(() => buildAdminWorkQueue(requests, accessQueue), [accessQueue, requests]);
  const recentResolved = useMemo(() => recentResolvedRequests(requests), [requests]);
  const accessStatus = combinedStatus([loaded.adminPending, loaded.iguardPending]);
  const queueStatus = combinedStatus([loaded.requests, accessStatus]);
  const teamStatus = combinedStatus([loaded.mainAdmins, loaded.retreatAdmins, loaded.iguardMembers]);
  const allStatus = combinedStatus(Object.values(loaded));
  const pendingLabel = queueStatus === "error" ? "집계 미완료" : queueStatus === "loading" ? "불러오는 중" : `${summary.totalPending}건`;

  return (
    <div className="admin-dashboard">
      <header className="admin-overview-header">
        <div>
          <h3>운영 대시보드</h3>
          <p>승인을 기다리는 계정과 해결할 요청을 확인하세요.</p>
        </div>
        <ConnectionBadge connected={connected} />
      </header>

      {loadError && (
        <div role="alert" className="admin-overview-notice is-error">
          <WarningCircle aria-hidden="true" weight="regular" />
          <div><strong>일부 업무 정보를 확인하지 못했습니다.</strong><p>{loadError}</p></div>
          <button type="button" onClick={onRetry}><ArrowClockwise aria-hidden="true" />다시 불러오기</button>
        </div>
      )}

      <section aria-label="핵심 운영 현황" className="admin-overview-metrics">
        <Metric label="전체 처리 대기" value={summary.totalPending} detail="요청사항과 권한 승인" icon={<ClockCountdown />} status={queueStatus} featured />
        <Metric label="받은 요청" value={summary.openRequests} detail={loaded.requests === "ready" ? `오늘 해결 ${summary.resolvedToday}건` : "사이트 요청 현황"} icon={<EnvelopeSimple />} status={loaded.requests} onClick={() => onNavigate("requests")} />
        <Metric label="권한 승인 대기" value={summary.accessPending} detail="중복 계정은 한 명으로 집계" icon={<ShieldCheck />} status={accessStatus} onClick={() => onNavigate("team")} />
        <Metric label="승인된 팀원" value={summary.teamMembers} unit="명" detail="모든 운영 역할의 고유 인원" icon={<UsersThree />} status={teamStatus} onClick={() => onNavigate("team")} />
      </section>

      <div className="admin-overview-columns">
        <section className="admin-overview-section admin-overview-queue" aria-labelledby="admin-work-queue-title">
          <div className="admin-overview-section-header">
            <div><h4 id="admin-work-queue-title">통합 처리함</h4><p>긴급 요청부터, 같은 우선순위에서는 오래 기다린 순서로 표시합니다.</p></div>
            <span className="admin-overview-count">{pendingLabel}</span>
          </div>
          {queueStatus === "error" && workQueue.length > 0 && <p className="admin-overview-partial">일부 업무는 불러오지 못했습니다. 조회된 항목만 표시합니다.</p>}
          {queueStatus === "loading" ? <QueueSkeleton /> : workQueue.length === 0 ? (
            <div className={`admin-overview-empty ${queueStatus === "error" ? "is-unavailable" : ""}`}>
              {queueStatus === "error" ? <WarningCircle aria-hidden="true" /> : <CheckCircle aria-hidden="true" />}
              <strong>{queueStatus === "error" ? "처리 현황을 확인할 수 없습니다" : "지금 처리할 항목이 없습니다"}</strong>
              <p>{queueStatus === "error" ? "업무 정보를 다시 불러오거나 해당 관리 메뉴에서 확인해 주세요." : "새 요청이 도착하면 이곳에 표시됩니다."}</p>
            </div>
          ) : (
            <div className="admin-overview-work-list">
              {workQueue.slice(0, 7).map((item) => <WorkQueueRow key={item.id} item={item} onNavigate={onNavigate} />)}
            </div>
          )}
        </section>

        <div className="admin-overview-sidebar">
          <section className="admin-overview-section admin-overview-status" aria-labelledby="admin-system-title">
            <div className="admin-overview-section-header"><h4 id="admin-system-title">운영 상태</h4></div>
            <div className="admin-overview-status-list">
              <StatusRow label="실시간 연결" value={connected == null ? "확인 중" : connected ? "연결됨" : "오프라인"} tone={connected == null ? "neutral" : connected ? "success" : "danger"} />
              <StatusRow label="업무 정보" value={loadError ? "일부 확인 필요" : allStatus === "loading" ? "불러오는 중" : "최신 정보 반영"} tone={loadError ? "danger" : allStatus === "loading" ? "neutral" : "success"} />
              <StatusRow label="대기 업무" value={pendingLabel} tone={queueStatus === "error" ? "danger" : queueStatus === "loading" ? "neutral" : summary.totalPending > 0 ? "attention" : "success"} />
            </div>
            <p className="admin-overview-section-note">권한 승인은 팀원 관리에서, 요청 해결은 요청사항에서 진행하세요.</p>
          </section>

          <section className="admin-overview-section admin-overview-recent" aria-labelledby="admin-recent-title">
            <div className="admin-overview-section-header">
              <h4 id="admin-recent-title">최근 해결</h4>
              <button type="button" onClick={() => onNavigate("requests")} className="admin-overview-text-action">전체 보기 <ArrowRight aria-hidden="true" /></button>
            </div>
            {loaded.requests !== "ready" ? (
              <p className="admin-overview-section-message">{loaded.requests === "error" ? "최근 해결 내역을 확인할 수 없습니다." : "최근 해결 내역을 불러오는 중입니다."}</p>
            ) : recentResolved.length === 0 ? <p className="admin-overview-section-message">아직 해결 완료된 요청이 없습니다.</p> : (
              <ol className="admin-overview-recent-list">
                {recentResolved.map((request) => (
                  <li key={`${request.ownerUid}:${request.id}`}>
                    <strong title={request.title}>{request.title}</strong>
                    <span>{formatTimestamp(request.resolvedAt ?? request.createdAt)} · {request.resolvedBy || "통합관리자"}</span>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

function ConnectionBadge({ connected }: { connected: boolean | null }) {
  const Icon = connected === false ? WifiSlash : WifiHigh;
  return (
    <div aria-live="polite" className={`admin-overview-connection ${connected === false ? "is-offline" : connected === true ? "is-online" : ""}`}>
      <Icon aria-hidden="true" />{connected == null ? "연결 확인 중" : connected ? "실시간 연결" : "오프라인"}
    </div>
  );
}

function Metric({ label, value, detail, icon, status, unit = "건", featured = false, onClick }: {
  label: string; value: number; detail: string; icon: ReactNode; status: LoadStatus;
  unit?: "건" | "명"; featured?: boolean; onClick?: () => void;
}) {
  const content = (
    <>
      <span className="admin-overview-metric-label"><span aria-hidden="true">{icon}</span>{label}{onClick && <ArrowRight aria-hidden="true" />}</span>
      {status === "loading" ? <><span className="admin-overview-skeleton" aria-hidden="true" /><span className="sr-only">불러오는 중</span></>
        : status === "error" ? <strong className="admin-overview-metric-unavailable">확인 필요</strong>
          : <strong className="admin-overview-metric-value">{value.toLocaleString("ko-KR")}<small>{unit}</small></strong>}
      <span className="admin-overview-metric-detail">{status === "error" ? "정보를 다시 불러와 주세요" : detail}</span>
    </>
  );
  const className = `admin-overview-metric ${featured ? "is-featured" : ""}`;
  return onClick ? <button type="button" onClick={onClick} className={className} data-state={status} aria-label={label}>{content}</button> : <div role="group" className={className} data-state={status} aria-label={label}>{content}</div>;
}

function WorkQueueRow({ item, onNavigate }: { item: AdminWorkItem; onNavigate: (destination: DashboardDestination) => void }) {
  return (
    <button type="button" onClick={() => onNavigate(item.destination)} className="admin-overview-work-row">
      <span className={`admin-overview-work-dot is-${item.priority === "urgent" ? "urgent" : item.kind}`} aria-hidden="true" />
      <span className="admin-overview-work-content">
        <span className="admin-overview-work-title"><strong title={item.title}>{item.title}</strong>{item.priority === "urgent" && <span className="admin-overview-priority">우선</span>}</span>
        <span className="admin-overview-work-description" title={item.description}>{item.description}</span>
      </span>
      <time>{formatTimestamp(item.timestamp)}</time>
      <ArrowRight aria-hidden="true" />
    </button>
  );
}

function StatusRow({ label, value, tone }: { label: string; value: string; tone: "success" | "attention" | "danger" | "neutral" }) {
  return <div className={`admin-overview-status-row is-${tone}`}><span><i aria-hidden="true" />{label}</span><strong>{value}</strong></div>;
}

function QueueSkeleton() {
  return (
    <div className="admin-overview-queue-skeleton" role="status" aria-label="처리함 불러오는 중">
      <span className="sr-only">처리함을 불러오고 있습니다.</span>
      {[0, 1, 2].map((value) => <div key={value} aria-hidden="true"><span /><span /></div>)}
    </div>
  );
}
