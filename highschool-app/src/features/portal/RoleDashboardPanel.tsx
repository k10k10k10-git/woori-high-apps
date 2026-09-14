"use client";

import Link from "next/link";
import {
  ArrowRight,
  CheckCircle,
  ClockCountdown,
  Compass,
  EnvelopeSimple,
  UserFocus,
  WifiHigh,
  WifiSlash,
} from "@phosphor-icons/react";
import { canAccessArea, canAccessSundayTeam, describeRoles } from "./accessPolicy";
import { ministryModulesFor, roleDashboardTitle } from "./myPageDashboard";
import { useMyPageData } from "./useMyPageData";
import { activeTeamKeys } from "@/features/teams/teamModel";

export default function RoleDashboardPanel() {
  const data = useMyPageData();
  const modules = ministryModulesFor(data.roles, data.teamMemberships);
  const assignedTeamKeys = activeTeamKeys(data.teamMemberships);
  const showNewFriends = canAccessArea("sunday", data.roles) && canAccessSundayTeam("barnabas", data.roles, assignedTeamKeys);
  const assignmentCount = (data.personalApplication ? 1 : 0)
    + data.personalRetreat.groups.length
    + data.personalRetreat.duties.length;
  const ready = data.loaded && !data.loadError;
  const pendingDetail = data.loadError ? "정보를 불러오지 못했습니다" : "정보를 확인하고 있습니다";

  return (
    <div className="mypage-dashboard space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold text-emerald-700">{describeRoles(data.roles)}</p>
          <h3 className="mt-1 text-lg font-bold text-slate-950">{roleDashboardTitle(data.roles)}</h3>
          <p className="mt-1 text-xs leading-5 text-slate-500">내 사역의 일정과 배정, 요청 상태를 한곳에서 확인하세요.</p>
        </div>
        <ConnectionBadge connected={data.connected} />
      </div>

      {data.loadError && (
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          일부 정보를 불러오지 못했습니다: {data.loadError}
        </div>
      )}

      <section className="mypage-metric-grid" aria-label="내 운영 현황">
        <Metric
          icon={<ClockCountdown weight="duotone" />}
          label="다가오는 일정"
          value={data.homeActions.length}
          detail={ready ? data.homeActions[0] ? `${data.homeActions[0].dayLabel} ${data.homeActions[0].title}` : "예정된 일정 없음" : pendingDetail}
          loading={!data.loaded}
          unavailable={!!data.loadError}
        />
        <Metric
          icon={<EnvelopeSimple weight="duotone" />}
          label="처리 중인 내 요청"
          value={data.requestSummary.received}
          detail={ready ? `해결 ${data.requestSummary.resolved}건` : pendingDetail}
          loading={!data.loaded}
          unavailable={!!data.loadError}
        />
        <Metric
          icon={<UserFocus weight="duotone" />}
          label="확인된 내 배정"
          value={assignmentCount}
          detail={ready ? "학기·조·현장 역할 합계" : pendingDetail}
          loading={!data.loaded}
          unavailable={!!data.loadError}
        />
        <Metric
          icon={<Compass weight="duotone" />}
          label="사용 가능 영역"
          value={modules.length}
          detail="현재 역할 기준"
          loading={false}
        />
      </section>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.25fr)_minmax(280px,.8fr)]">
        <section className="mypage-section" aria-labelledby="mypage-actions-title">
          <div className="mypage-section-header">
            <div>
              <h4 id="mypage-actions-title">지금 확인할 일</h4>
              <p>공유 캘린더에서 가까운 일정과 미완료 준비를 날짜순으로 보여 줍니다.</p>
            </div>
            <span>{ready ? `${data.homeActions.length}건` : "—"}</span>
          </div>
          <div className="mypage-row-list">
            {!ready ? <div className="mypage-empty" role={data.loadError ? undefined : "status"}><p>{pendingDetail}</p></div> : data.homeActions.length > 0 ? data.homeActions.slice(0, 5).map((item) => {
              const content = (
                <>
                  <span className={`mypage-day mypage-day--${item.urgency}`}>{item.dayLabel}</span>
                  <span className="min-w-0 flex-1">
                    <strong className="block truncate text-sm text-slate-900">{item.title}</strong>
                    <small className="mt-1 block text-xs text-slate-500">{item.meta}</small>
                  </span>
                  {item.href && <ArrowRight className="h-4 w-4 shrink-0 text-slate-300" weight="bold" />}
                </>
              );
              return item.href
                ? <Link key={item.id} href={item.href} className="mypage-row">{content}</Link>
                : <div key={item.id} className="mypage-row">{content}</div>;
            }) : (
              <EmptyState icon={<CheckCircle weight="duotone" />} title="급히 확인할 일정이 없습니다" description="공유 캘린더에 일정이 추가되면 여기에 나타납니다." />
            )}
          </div>
        </section>

        <section className="mypage-section" aria-labelledby="mypage-context-title">
          <div className="mypage-section-header">
            <div>
              <h4 id="mypage-context-title">현재 사역 기준</h4>
              <p>오늘 날짜에 가장 가까운 학기와 수련회입니다.</p>
            </div>
          </div>
          <dl className="mypage-context-list">
            <div>
              <dt>학기</dt>
              <dd>{ready ? data.currentSemester?.meta.title ?? "현재 학기 없음" : "—"}</dd>
              <small>{ready ? data.currentSemester?.id ?? "등록된 학기를 확인해 주세요" : pendingDetail}</small>
            </div>
            <div>
              <dt>수련회</dt>
              <dd>{ready ? data.currentRetreat ? `${data.currentRetreat.year}년 ${data.currentRetreat.name}` : "현재 수련회 없음" : "—"}</dd>
              <small>{ready ? data.currentRetreat ? "현장 배정은 이 수련회를 기준으로 표시" : "등록된 수련회를 확인해 주세요" : pendingDetail}</small>
            </div>
          </dl>
        </section>
      </div>

      {showNewFriends && (
        <section className="mypage-section" aria-labelledby="mypage-new-friends-title">
          <div className="mypage-section-header">
            <div>
              <h4 id="mypage-new-friends-title">새친구 정착 현황</h4>
              <p>{data.today.slice(0, 4)}년 접수 중 완료되지 않은 흐름을 먼저 집계합니다.</p>
            </div>
            <Link href="/teams/barnabas">바나바팀 열기 <ArrowRight weight="bold" /></Link>
          </div>
          {ready ? <div className="mypage-inline-stats">
            <InlineStat label="전체" value={data.newFriendSummary.total} />
            <InlineStat label="진행 중" value={data.newFriendSummary.active} tone="attention" />
            <InlineStat label="반배정 대기" value={data.newFriendSummary.classPending} tone="attention" />
            <InlineStat label="출석부 반영 대기" value={data.newFriendSummary.rosterPending} tone="attention" />
            <InlineStat label="완료" value={data.newFriendSummary.completed} tone="success" />
          </div> : <div className="mypage-empty"><p>{pendingDetail}</p></div>}
        </section>
      )}

      <section className="mypage-section" aria-labelledby="mypage-areas-title">
        <div className="mypage-section-header">
          <div>
            <h4 id="mypage-areas-title">내 사역 바로가기</h4>
            <p>현재 역할로 열 수 있는 영역만 표시합니다.</p>
          </div>
        </div>
        <div className="mypage-module-grid">
          {modules.map((module) => (
            <Link key={module.id} href={module.href} className={`mypage-module mypage-module--${module.tone}`}>
              <span className="min-w-0">
                <strong>{module.title}</strong>
                <small>{module.description}</small>
              </span>
              <span className="mypage-module-access">{module.accessLabel}</span>
              <ArrowRight weight="bold" />
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}

function ConnectionBadge({ connected }: { connected: boolean | null }) {
  const Icon = connected === false ? WifiSlash : WifiHigh;
  return (
    <div aria-live="polite" className={`mypage-connection ${connected === false ? "is-offline" : connected === true ? "is-online" : ""}`}>
      <Icon weight="bold" />
      {connected == null ? "연결 확인 중" : connected ? "실시간 연결" : "오프라인"}
    </div>
  );
}

function Metric({ icon, label, value, detail, loading, unavailable = false }: {
  icon: React.ReactNode;
  label: string;
  value: number;
  detail: string;
  loading: boolean;
  unavailable?: boolean;
}) {
  return (
    <div className="mypage-metric">
      <span className="mypage-metric-icon">{icon}</span>
      <span className="min-w-0">
        <small>{label}</small>
        {unavailable ? <strong aria-label="확인할 수 없음">—</strong> : loading ? <span className="mypage-skeleton" aria-label="불러오는 중" /> : <strong>{value}<b>건</b></strong>}
        <em>{detail}</em>
      </span>
    </div>
  );
}

function InlineStat({ label, value, tone = "neutral" }: { label: string; value: number; tone?: "neutral" | "attention" | "success" }) {
  return <div className={`mypage-inline-stat is-${tone}`}><span>{label}</span><strong>{value}<small>명</small></strong></div>;
}

function EmptyState({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) {
  return (
    <div className="mypage-empty">
      <span>{icon}</span>
      <strong>{title}</strong>
      <p>{description}</p>
    </div>
  );
}
