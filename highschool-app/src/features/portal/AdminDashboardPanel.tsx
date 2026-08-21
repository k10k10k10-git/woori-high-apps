"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  ArrowRight,
  CheckCircle,
  ClockCountdown,
  EnvelopeSimple,
  ShieldCheck,
  UsersThree,
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
type LoadedState = Record<"requests" | "mainAdmins" | "retreatAdmins" | "adminPending" | "iguardMembers" | "iguardPending", boolean>;

const INITIAL_LOADED: LoadedState = {
  requests: false,
  mainAdmins: false,
  retreatAdmins: false,
  adminPending: false,
  iguardMembers: false,
  iguardPending: false,
};

function formatTimestamp(value: number) {
  return new Date(value).toLocaleString("ko-KR", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function AdminDashboard({ onNavigate }: { onNavigate: (destination: DashboardDestination) => void }) {
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
    const receive = <T,>(key: keyof LoadedState, setter: (value: T) => void) => (value: T) => {
      setter(value);
      ok(key);
      setLoaded((current) => current[key] ? current : { ...current, [key]: true });
    };
    const unsubs = [
      subscribeToConnection(setConnected),
      subscribeToAdminSiteRequests(receive("requests", setRequests), fail("requests")),
      subscribeToMainAdmins(receive("mainAdmins", setMainAdmins), fail("mainAdmins")),
      subscribeToRetreatAdmins(receive("retreatAdmins", setRetreatAdmins), fail("retreatAdmins")),
      subscribeToPendingRequests(receive("adminPending", setAdminPending), fail("adminPending")),
      subscribeToIguardMembers(receive("iguardMembers", setIguardMembers), fail("iguardMembers")),
      subscribeToIguardPending(receive("iguardPending", setIguardPending), fail("iguardPending")),
    ];
    return () => unsubs.forEach((unsubscribe) => unsubscribe());
  }, [fail, ok]);

  const accessQueue = useMemo(
    () => mergeAccessQueue(adminPending, iguardPending),
    [adminPending, iguardPending],
  );
  const teamMembers = useMemo(
    () => countUniqueTeamMembers(mainAdmins, retreatAdmins, iguardMembers),
    [iguardMembers, mainAdmins, retreatAdmins],
  );
  const summary = useMemo(
    () => buildAdminDashboardSummary({ requests, accessQueue, teamMembers }),
    [accessQueue, requests, teamMembers],
  );
  const workQueue = useMemo(
    () => buildAdminWorkQueue(requests, accessQueue),
    [accessQueue, requests],
  );
  const recentResolved = useMemo(() => recentResolvedRequests(requests), [requests]);
  const isLoading = !Object.values(loaded).every(Boolean);

  return (
    <div className="admin-dashboard space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-bold text-slate-950">운영 대시보드</h3>
          <p className="mt-1 text-xs leading-5 text-slate-500">권한 승인과 사이트 요청을 한 화면에서 먼저 확인합니다.</p>
        </div>
        <ConnectionBadge connected={connected} />
      </div>

      {loadError && (
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          일부 운영 정보를 불러오지 못했습니다: {loadError}
        </div>
      )}

      <section aria-label="핵심 운영 현황" className="grid grid-cols-2 overflow-hidden rounded-2xl border border-slate-200 bg-white xl:grid-cols-4">
        <Metric
          label="전체 처리 대기"
          value={summary.totalPending}
          detail="요청사항과 권한 승인"
          icon={<ClockCountdown weight="duotone" />}
          loading={isLoading}
          featured
        />
        <Metric
          label="받은 요청"
          value={summary.openRequests}
          detail={`오늘 해결 ${summary.resolvedToday}건`}
          icon={<EnvelopeSimple weight="duotone" />}
          loading={isLoading}
          onClick={() => onNavigate("requests")}
        />
        <Metric
          label="권한 승인 대기"
          value={summary.accessPending}
          detail="중복 계정은 한 명으로 집계"
          icon={<ShieldCheck weight="duotone" />}
          loading={isLoading}
          onClick={() => onNavigate("team")}
        />
        <Metric
          label="승인된 팀원"
          value={summary.teamMembers}
          unit="명"
          detail="모든 운영 역할의 고유 인원"
          icon={<UsersThree weight="duotone" />}
          loading={isLoading}
          onClick={() => onNavigate("team")}
        />
      </section>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(280px,.75fr)]">
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white" aria-labelledby="admin-work-queue-title">
          <div className="flex items-center justify-between gap-4 border-b border-slate-200 px-4 py-4 sm:px-5">
            <div>
              <h4 id="admin-work-queue-title" className="text-sm font-bold text-slate-900">통합 처리함</h4>
              <p className="mt-1 text-xs text-slate-500">긴급 요청을 우선하고, 이후 오래 기다린 순서로 정렬합니다.</p>
            </div>
            <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600">{workQueue.length}건</span>
          </div>
          <div className="min-h-64">
            {isLoading ? (
              <QueueSkeleton />
            ) : workQueue.length === 0 ? (
              <div className="grid min-h-64 place-items-center px-6 text-center">
                <div>
                  <CheckCircle className="mx-auto h-7 w-7 text-emerald-600" weight="duotone" />
                  <p className="mt-3 text-sm font-bold text-slate-800">지금 처리할 항목이 없습니다.</p>
                  <p className="mt-1 text-xs text-slate-500">새 요청은 실시간으로 이 목록에 들어옵니다.</p>
                </div>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {workQueue.slice(0, 7).map((item) => (
                  <WorkQueueRow key={item.id} item={item} onNavigate={onNavigate} />
                ))}
              </div>
            )}
          </div>
        </section>

        <div className="space-y-5">
          <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5" aria-labelledby="admin-system-title">
            <h4 id="admin-system-title" className="text-sm font-bold text-slate-900">운영 상태</h4>
            <div className="mt-4 space-y-3">
              <StatusRow
                label="Firebase 실시간 연결"
                value={connected == null ? "확인 중" : connected ? "정상" : "연결 끊김"}
                tone={connected == null ? "neutral" : connected ? "success" : "danger"}
              />
              <StatusRow label="데이터 구독" value={loadError ? "일부 오류" : isLoading ? "불러오는 중" : "6개 경로 정상"} tone={loadError ? "danger" : isLoading ? "neutral" : "success"} />
              <StatusRow label="대기 업무" value={`${summary.totalPending}건`} tone={summary.totalPending > 0 ? "attention" : "success"} />
            </div>
            <p className="mt-4 border-t border-slate-100 pt-3 text-[11px] leading-5 text-slate-400">이 화면은 읽기 전용입니다. 실제 승인과 해결 처리는 해당 탭에서 진행합니다.</p>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5" aria-labelledby="admin-recent-title">
            <div className="flex items-center justify-between gap-3">
              <h4 id="admin-recent-title" className="text-sm font-bold text-slate-900">최근 해결</h4>
              <button type="button" onClick={() => onNavigate("requests")} className="text-xs font-bold text-emerald-700 hover:text-emerald-800">전체 보기</button>
            </div>
            {recentResolved.length === 0 ? (
              <p className="mt-4 text-xs leading-5 text-slate-400">아직 해결 완료된 요청이 없습니다.</p>
            ) : (
              <ol className="mt-3 divide-y divide-slate-100">
                {recentResolved.map((request) => (
                  <li key={`${request.ownerUid}:${request.id}`} className="py-3 first:pt-1 last:pb-0">
                    <p className="truncate text-xs font-bold text-slate-800">{request.title}</p>
                    <p className="mt-1 text-[11px] text-slate-400">{formatTimestamp(request.resolvedAt ?? request.createdAt)} · {request.resolvedBy || "통합관리자"}</p>
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
    <div
      aria-live="polite"
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-bold ${
        connected === false
          ? "border-red-200 bg-red-50 text-red-700"
          : connected === true
            ? "border-emerald-200 bg-emerald-50 text-emerald-700"
            : "border-slate-200 bg-white text-slate-500"
      }`}
    >
      <Icon className="h-4 w-4" weight="bold" />
      {connected == null ? "연결 확인 중" : connected ? "실시간 연결" : "오프라인"}
    </div>
  );
}

function Metric({
  label,
  value,
  detail,
  icon,
  loading,
  unit = "건",
  featured = false,
  onClick,
}: {
  label: string;
  value: number;
  detail: string;
  icon: ReactNode;
  loading: boolean;
  unit?: "건" | "명";
  featured?: boolean;
  onClick?: () => void;
}) {
  const content = (
    <>
      <div className={`grid h-9 w-9 place-items-center rounded-xl text-xl ${featured ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-600"}`}>{icon}</div>
      <div className="min-w-0">
        <p className="text-xs font-semibold text-slate-500">{label}</p>
        {loading ? <div className="mt-2 h-7 w-12 animate-pulse rounded bg-slate-200" /> : <p className="mt-1 text-2xl font-bold tabular-nums text-slate-950">{value}<span className="ml-0.5 text-sm font-semibold text-slate-400">{unit}</span></p>}
        <p className="mt-1 truncate text-[11px] text-slate-400">{detail}</p>
      </div>
      {onClick && <ArrowRight className="ml-auto hidden h-4 w-4 self-center text-slate-300 sm:block" weight="bold" />}
    </>
  );
  const className = `flex min-h-28 min-w-0 items-start gap-3 border-b border-slate-200 p-3 text-left [&:nth-child(odd)]:border-r [&:nth-last-child(-n+2)]:border-b-0 sm:p-4 xl:border-b-0 xl:border-r xl:last:border-r-0 ${onClick ? "transition-colors hover:bg-slate-50" : ""}`;
  return onClick ? <button type="button" onClick={onClick} className={className}>{content}</button> : <div className={className}>{content}</div>;
}

function WorkQueueRow({ item, onNavigate }: { item: AdminWorkItem; onNavigate: (destination: DashboardDestination) => void }) {
  return (
    <button type="button" onClick={() => onNavigate(item.destination)} className="group flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-slate-50 sm:px-5">
      <span className={`h-2 w-2 shrink-0 rounded-full ${item.priority === "urgent" ? "bg-red-500" : item.kind === "request" ? "bg-amber-400" : "bg-sky-500"}`} />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="truncate text-sm font-bold text-slate-900">{item.title}</span>
          {item.priority === "urgent" && <span className="shrink-0 rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-bold text-red-700">우선</span>}
        </span>
        <span className="mt-1 block truncate text-xs text-slate-500">{item.description}</span>
      </span>
      <span className="hidden shrink-0 text-[11px] text-slate-400 sm:block">{formatTimestamp(item.timestamp)}</span>
      <ArrowRight className="h-4 w-4 shrink-0 text-slate-300 transition-transform group-hover:translate-x-0.5 group-hover:text-emerald-600" weight="bold" />
    </button>
  );
}

function StatusRow({ label, value, tone }: { label: string; value: string; tone: "success" | "attention" | "danger" | "neutral" }) {
  const dot = {
    success: "bg-emerald-500",
    attention: "bg-amber-400",
    danger: "bg-red-500",
    neutral: "bg-slate-300",
  }[tone];
  return (
    <div className="flex items-center justify-between gap-4 text-xs">
      <span className="flex items-center gap-2 text-slate-500"><span className={`h-2 w-2 rounded-full ${dot}`} />{label}</span>
      <span className="font-bold text-slate-800">{value}</span>
    </div>
  );
}

function QueueSkeleton() {
  return (
    <div className="divide-y divide-slate-100" aria-label="처리함 불러오는 중">
      {[0, 1, 2].map((value) => (
        <div key={value} className="flex items-center gap-3 px-5 py-4">
          <div className="h-2 w-2 rounded-full bg-slate-200" />
          <div className="flex-1 animate-pulse space-y-2">
            <div className="h-3 w-1/3 rounded bg-slate-200" />
            <div className="h-2.5 w-1/2 rounded bg-slate-100" />
          </div>
        </div>
      ))}
    </div>
  );
}
