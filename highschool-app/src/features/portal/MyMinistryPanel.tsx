"use client";

import Link from "next/link";
import { ArrowRight, CalendarBlank, CheckCircle, MapPin, UsersThree } from "@phosphor-icons/react";
import { canAccessArea, canAccessSundayTeam, describeRoles, iguardScopeOf, ownSundayTeam } from "./accessPolicy";
import { ministryModulesFor } from "./myPageDashboard";
import { MINISTRY_AREA_LABELS, SUNDAY_MINISTRY_TEAMS, sundayTeamHref } from "./featureCatalog";
import { useMyPageData } from "./useMyPageData";

export default function MyMinistryPanel() {
  const data = useMyPageData();
  const modules = ministryModulesFor(data.roles);
  const sundayTeam = ownSundayTeam(data.roles);
  const sundayTeams = SUNDAY_MINISTRY_TEAMS.filter((team) => canAccessSundayTeam(team.key, data.roles) && (!sundayTeam || team.key === sundayTeam));
  const ready = data.loaded && !data.loadError;
  const pendingDetail = data.loadError ? "배정 정보를 불러오지 못했습니다. 잠시 후 다시 확인해 주세요." : "내 사역 배정을 확인하고 있습니다.";

  return (
    <div className="space-y-5">
      <div>
        <p className="text-xs font-bold text-emerald-700">{describeRoles(data.roles)}</p>
        <h3 className="mt-1 text-lg font-bold text-slate-950">내 사역</h3>
        <p className="mt-1 text-xs leading-5 text-slate-500">담당 사역과 배정, 출석 기록을 확인하세요.</p>
      </div>

      {data.loadError && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">일부 정보를 불러오지 못했습니다: {data.loadError}</div>}

      <div className="grid gap-5 lg:grid-cols-2">
        {canAccessArea("semester", data.roles) && (
          <section className="mypage-section" aria-labelledby="my-semester-title">
            <div className="mypage-section-header">
              <div>
                <h4 id="my-semester-title">학기 배정</h4>
                <p>{ready ? data.currentSemester?.meta.title ?? "현재 학기가 없습니다" : "학기 정보 확인"}</p>
              </div>
              <Link href={data.currentSemester ? `/semester/${encodeURIComponent(data.currentSemester.id)}` : "/semesters"}>학기 열기 <ArrowRight weight="bold" /></Link>
            </div>
            {!ready ? <p className="mypage-unmatched" role={data.loadError ? undefined : "status"}>{pendingDetail}</p> : data.personalApplication ? (
              <div className="mypage-assignment">
                <div className="mypage-assignment-title">
                  <span><UsersThree weight="duotone" /></span>
                  <div><strong>{data.personalApplication.application.name}</strong><small>{data.personalApplication.application.status}</small></div>
                </div>
                <dl>
                  <div><dt>사역팀</dt><dd>{data.personalApplication.team?.name ?? "미배정"}</dd></div>
                  <div><dt>훈련 반</dt><dd>{data.personalApplication.trainingClass?.name ?? "미배정"}</dd></div>
                  <div><dt>사역팀 출석</dt><dd>{data.personalAttendance ? `${data.personalAttendance.actualAttended}/${data.personalAttendance.total}회` : "기록 없음"}</dd></div>
                  <div><dt>사역팀 입력 현황</dt><dd>{data.personalAttendance ? `${data.personalAttendance.recorded}/${data.personalAttendance.total}회 · 미입력 ${data.personalAttendance.unrecorded}회` : "기록 없음"}</dd></div>
                  <div><dt>사역팀 출석률</dt><dd>{data.personalAttendance ? `${data.personalAttendance.rate}%` : "0%"}</dd></div>
                </dl>
                <p className="mypage-assignment-note">휴강을 제외한 정규·행사 회차 기준입니다. 수료 판정은 학기 출석부에서 정규 회차만 계산합니다.</p>
              </div>
            ) : <UnmatchedState text="내 학기 배정을 찾지 못했습니다. 신청 기록과 등록된 이름을 확인해 주세요." />}
          </section>
        )}

        {sundayTeams.length > 0 && (
          <section className="mypage-section" aria-labelledby="my-sunday-title">
            <div className="mypage-section-header"><div><h4 id="my-sunday-title">{MINISTRY_AREA_LABELS.sunday}</h4><p>담당 팀의 운영과 이번 주 준비를 확인하세요.</p></div></div>
            <div className="mypage-module-grid is-compact">
              {sundayTeams.map((team) => <div key={team.key}>
                {team.status === "planned" && sundayTeam !== team.key ? <div className="mypage-feature-link" aria-disabled="true"><span className="min-w-0 flex-1"><strong>{team.label}</strong><small>기능 기획 중</small></span></div> : <Link href={sundayTeamHref(team.key)} className="mypage-feature-link">
                  <span className="mypage-feature-icon"><CalendarBlank weight="duotone" /></span>
                  <span className="min-w-0 flex-1"><strong>{team.label}</strong><small>{team.hint}</small></span><ArrowRight weight="bold" />
                </Link>}
                {team.key === "praise" && <div className="flex flex-wrap gap-3 px-4 pb-3 text-xs font-semibold text-emerald-700" aria-label="찬양팀 바로가기">
                  <Link href="/sunday-ministry/praise?tab=week">이번 주 준비</Link>
                  <Link href="/sunday-ministry/praise?tab=stage">주일 등단표</Link>
                </div>}
              </div>)}
            </div>
          </section>
        )}
      </div>

      {iguardScopeOf(data.roles) !== "none" && (
        <section className="mypage-section" aria-labelledby="my-retreat-title">
          <div className="mypage-section-header">
            <div>
              <h4 id="my-retreat-title">수련회 현장 배정</h4>
              <p>{ready ? data.currentRetreat ? `${data.currentRetreat.year}년 ${data.currentRetreat.name}` : "현재 기준 수련회가 없습니다" : "수련회 정보 확인"}</p>
            </div>
            <Link href={data.currentRetreat ? `/retreat/${encodeURIComponent(data.currentRetreat.id)}/field` : "/field"}>현장 열기 <ArrowRight weight="bold" /></Link>
          </div>
          {!ready ? <p className="mypage-unmatched" role={data.loadError ? undefined : "status"}>{pendingDetail}</p> : data.personalRetreat.matchedStaffId ? (
            <div className="grid gap-4 lg:grid-cols-[minmax(220px,.65fr)_minmax(0,1.35fr)]">
              <div className="mypage-assignment">
                <div className="mypage-assignment-title">
                  <span><MapPin weight="duotone" /></span>
                  <div><strong>{data.personalRetreat.matchedName}</strong><small>현장 담당 스탭</small></div>
                </div>
                <dl>
                  <div><dt>담당 조</dt><dd>{data.personalRetreat.groups.length}개</dd></div>
                  <div><dt>큐·포스트</dt><dd>{data.personalRetreat.duties.length}건</dd></div>
                </dl>
                {data.personalRetreat.groups.length > 0 && <p className="mypage-assignment-note">{data.personalRetreat.groups.map((group) => `${group.bu} ${group.name}`).join(", ")}</p>}
              </div>
              <div className="mypage-duty-list">
                {data.personalRetreat.duties.length > 0 ? data.personalRetreat.duties.slice(0, 6).map((duty) => (
                  <div key={duty.blockId}>
                    <time>{duty.day}일차 {duty.start}</time>
                    <span><strong>{duty.scheduleLabel}</strong><small>{[...duty.roles, ...duty.posts].join(" · ")}</small></span>
                  </div>
                )) : <UnmatchedState text="현재 수련회에 배정된 개인 큐와 포스트가 없습니다." />}
              </div>
            </div>
          ) : <UnmatchedState text="내 현장 배정을 확인할 수 없습니다. 현장 명단의 이름을 확인하거나 담당자에게 문의해 주세요." />}
        </section>
      )}

      <section className="mypage-section" aria-labelledby="my-access-title">
        <div className="mypage-section-header"><div><h4 id="my-access-title">내 사역 바로가기</h4><p>이용할 수 있는 사역 화면으로 바로 이동하세요.</p></div></div>
        <div className="mypage-module-grid">
          {modules.filter((module) => module.tone !== "sunday").map((module) => (
            <Link key={module.id} href={module.href} className={`mypage-module mypage-module--${module.tone}`}>
              <span className="min-w-0"><strong>{module.title}</strong><small>{module.description}</small></span>
              <span className="mypage-module-access">{module.accessLabel}</span><ArrowRight weight="bold" />
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}

function UnmatchedState({ text }: { text: string }) {
  return <div className="mypage-unmatched"><CheckCircle weight="duotone" /><p>{text}</p></div>;
}
